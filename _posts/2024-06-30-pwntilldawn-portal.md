---
layout: post
title: PwnTillDawn - Portal Write-Up
date: 2024-06-30
classes: wide
description: Exploiting a backdoor in vsFTPd 2.3.4.
---

# Portal (10.150.150.12)

![](/assets/img/post/pwntilldawn_portal/1.png)



## Network Scanning

This is a fairly simple and straight forward challenge, so let's start up by scanning the target machine.

```
sudo nmap -sV -sC 10.150.150.12 -oN nmap.txt
```

![](/assets/img/post/pwntilldawn_portal/2.png)

If you like many others have tried Metasploitable2 to study, you've probably recognized the `vsFTPd 2.3.4` version. If that's not the case, just know that this version has a built-in backdoor that can be easily exploited.



## Exploiting FTP

This FTP version is easy to exploit, whenever a username containing `:)` at the end is supplied, a bind shell is triggered on port 6200. You can either use Metasploit, download any exploit online or do it by hand. I'll stick with the last option.

```
ftp 10.150.150.12
```

![](/assets/img/post/pwntilldawn_portal/3.png)

It really doesn't matter which username is supplied, as long as there's a smiley at the end. Once done, you can simply connect to the target machine using `netcat` on port 6200.

```
nc 10.150.150.12 6200
```

![](/assets/img/post/pwntilldawn_portal/4.png)

And just like that you can print out the flag!