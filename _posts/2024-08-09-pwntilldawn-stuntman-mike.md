---
layout: post
title: PwnTillDawn - Stuntman Mike Write-Up
date: 2024-08-09
classes: wide
description: Gaining access to a server via SSH and exploiting weak passwords.
---

# Stuntman Mike (**10.150.150.166**)

![](/assets/img/post/pwntilldawn_stuntman_mike/1.png)

## Scanning Target

Scanning the target with Nmap as usual:

```
sudo nmap -sV -sC -oN nmap.txt 10.150.150.166
```

![](/assets/img/post/pwntilldawn_stuntman_mike/2.png)

We have only two ports available being 22 (SSH) and 8089 (Splunk). I don't often go for SSH port, but I suspect Splunk – a tool meant for monitoring logs – has been installed only to log player's actions and, since there's no other port, we'll be sticking with SSH first.

## SSH Enumeration

There's isn't much you can do against OpenSSH apart from enumeration and checking for CVE's or bruteforcing top used passwords. We'll run a Nmap script to see if we can find any useful information another user apart from root.

```
sudo nmap -p22 10.150.150.166 --script ssh-auth-methods --script-args="ssh.user=root"
```

![](/assets/img/post/pwntilldawn_stuntman_mike/3.png)

This script returns a list of accepted login methods, which are public key and password, but there's also a banner text with FLAG35 and a potential user: `mike`. We could perform the same check again, but the output wouldn't change.

## Bruteforcing SSH

Now we have a valid user, which we can try to bruteforce using weak passwords. I'll be using `rockyou.txt` and use some of the  passwords to see if there's any match.

```
hydra -l mike -P /usr/share/seclists/Passwords/Leaked-Databases/rockyou-50.txt ssh://10.150.150.166
```

![](/assets/img/post/pwntilldawn_stuntman_mike/4.png)

After a few seconds we got a match, so we now know that the user `mike` is available, and it's password is `babygirl`.

## Server Exploration

With a valid user and password, we can login to the server through SSH. After logging in without any problems, the second flag is available inside mike's home directory.

![](/assets/img/post/pwntilldawn_stuntman_mike/5.png)

Usually we would go for a privilege escalation method, but this is even simpler, as mike has privileges to run any command and we have his password. We can just `sudo su` to the root user.

![](/assets/img/post/pwntilldawn_stuntman_mike/6.png)

The final flag is inside root's home directory, nice security Mike!