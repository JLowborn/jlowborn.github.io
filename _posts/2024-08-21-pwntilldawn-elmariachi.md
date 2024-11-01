---
layout: post
title: PwnTillDawn - ElMariachi Write-Up
date: 2024-08-21
classes: wide
description: Exploiting a Windows machine thorugh ThinVNC server.
---

# ElMariachi (10.150.150.69)

![](/assets/img/post/pwntilldawn_elmariachi/1.png)

## Scanning Target

Scanning Windows machines is often a slow process depending on the target network and flags applied. So instead of using the usual flags, we'll be first checking the open ports and scanning those specific ports after.

```
sudo nmap -p- --open 10.150.150.69
```

Once we find out a list of open ports, we'll be using Nmap to scan those ports.

```
sudo nmap -sV -sC -p-p135,139,445,3389,5040,44664-49670,50417,60000 -oN nmap.txt 10.150.150.69
```

![](/assets/img/post/pwntilldawn_elmariachi/2.png)

We can see some interesting information about the machine and it's internal services. This is a Windows machine with the name of `ELMARIACHI-PC`, and we can see several ports including port `60000` which looks like a web server. Although we don't know which service it is running, if we take a closer look on the fingerprint collected by Nmap we can find some tips.

![](/assets/img/post/pwntilldawn_elmariachi/3.png)

This is a ThinVNC server, and it has a web authentication method.

## ThinVNC Exploration

Once connecting to the port, we are welcomed with a login prompt.

![](/assets/img/post/pwntilldawn_elmariachi/4.png)

After trying some common usernames and passwords, without success, we need to find another way in. With some research, we can see that the latest verion is `1.01b` and funny enough, this version has several known CVEs, including a Rapid7 page telling about a Directory Traversal module on Metasploit.

![](/assets/img/post/pwntilldawn_elmariachi/5.png)

Since ThinVNC latest version is 1.01b, it's worth a try, so let's fire up Metasploit and give it a try!

## Directory Traversal Exploit

This module is quite simple to use as it only requires the remote host IP and port.

![](/assets/img/post/pwntilldawn_elmariachi/6.png)

The output show us that the exploit worked successfully and we now got access to the username `desperado` with the password `TooComplicatedToGuessMeAhahahahahahahh`. Let's try logging in once more.

![](/assets/img/post/pwntilldawn_elmariachi/7.png)

As expected we've managed to login and now we just need a machine's name, which we gathered earlier: `ELMARIACHI-PC`.

![](/assets/img/post/pwntilldawn_elmariachi/8.png)

We're presented with a remote desktop access, now it's time to search for the flag. Let's start by opening the Explorer.

![](/assets/img/post/pwntilldawn_elmariachi/9.png)

As if wasn't easy enough to access the machine, the flag is shown in the recent file section of the explorer as `FLAG67`, now we just have to copy the flag. Fortunately for us, ThinVNC has a clipboard feature available, so once we copy the contents of the file, we can just access this clipboard to paste it outside the machine.

![](/assets/img/post/pwntilldawn_elmariachi/10.png)