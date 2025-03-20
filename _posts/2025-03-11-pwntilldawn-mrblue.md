---
layout: post
title: PwnTillDawn - Mr Blue Write-Up
date: 2025-03-11
classes: wide
description: Abusing outdated SMB verions to exploit MS17-010.
---

## Mr Blue (10.150.150.242)

![](/assets/img/post/pwntilldawn_mrblue/1.png)

## Initial Scanning

Whenever scanning Windows machines, I feel like Nmap takes too long, so I've decided to go for [Rustscan](https://github.com/bee-san/RustScan) for faster results before using Nmap to get detailed information:

```
rustscan -a 10.150.150.242 --ulimit 10000
sudo nmap -sV -sC -p53,80,135,139,445,1433,3389,8089 -oN scans/nmap.txt -Pn 10.150.150.242
```

![](/assets/img/post/pwntilldawn_mrblue/2.png)

First, a quick disclaimer: Normally I would go through each service checking for potential vulnerabilities, but the challenge hints the whole machine just by the name, so it literally took me 2 minutes to finish it.



## Mr Blue, dah?

Along with the results from Nmap, we have additional information on the SMB port (445) that hints the name of the challenge:

![](/assets/img/post/pwntilldawn_mrblue/3.png)

The fact this is a Windows machine and it has *Mr Blue* as a name tips the player about an extremely popular CVE. For those who don't know MS17-010, commonly known as *Eternal**Blue*** is a vulnerability that affects multiple versions of Windows, instantly granting access to any vulnerable machine, so I've decided to test it out using Metasploit:

```
msfconsole
msf6 > use auxiliary/scanner/smb/smb_ms17_010
```

![](/assets/img/post/pwntilldawn_mrblue/4.png)

The scanning module tells us the machine is vulnerable, so let's run the actual exploit:

```
msf6 > use exploit/windows/smb/ms17_010_eternalblue
```

![](/assets/img/post/pwntilldawn_mrblue/5.png)

The exploit is a success! After setting the required value and running the exploit, we got a shell immediately, and access to the flag:

![](/assets/img/post/pwntilldawn_mrblue/6.png)

Once more, normally I would spend more time analyzing each service, but that was obvious, at least for me, so it was a quick win.
