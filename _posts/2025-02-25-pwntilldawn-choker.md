---
layout: post
title: PwnTillDawn - Choker Write-Up
date: 2025-02-24
classes: wide
description: Enumerating users through SMTP service, bruteforcing accounts and escalating privileges by hijacking Python 2.7 modules.
---

# Choker (10.150.150.56)

![](/assets/img/post/pwntilldawn_choker/1.png)



## Scanning Phase

I'm using Nmap to scan the machine and find potential entry points and interesting services.

```shell
sudo nmap -sV -sC -p- 10.150.150.56 -oN scans/nmap.txt
```

![](/assets/img/post/pwntilldawn_choker/2.png)

There are some interesting findings in the results:

- **SSH** service is available as usual.
- A simple **HTTP** Apache web server is also available with a default page.
- Multiple mail service are available, including **SMTP**, **POP3** and **IMAP**.

I'll be skipping SSH for now, since Nmap already grabbed the banner.



## RCPT TO: Enumeration

I've spent some time enumerating the web server just to find it's a lure. There are no virtual hosts, and no directories whatsoever. The mail services can be used to enumerate usernames, so I've decided to do so.

> :bulb: **Quick Tip:** After testing multiple tools to enumerate SMTP, I've found most of them extremely slow and time-consuming, until I've discovered Hydra has an enumeration functionality which apparently *nobody* talks about, and it's quite fast.

```sh
hydra -L /opt/metasploit/data/wordlists/unix_users.txt smtp-enum://10.150.150.56/vrfy
```

![](/assets/img/post/pwntilldawn_choker/3.png)

With lots of valid usernames and no other ideias left, I've used hydra once more to try bruteforcing the users, in all mail services using the usernames as their own passwords.

```shell
hydra -L users.txt -e nsr pop3://10.150.150.56
```

Notice the `-e nsr` option being passed to use null passwords, usernames and reverse usernames as passwords. SMTP wasn't working out, but IMAP/POP3 returned a match.

![](/assets/img/post/pwntilldawn_choker/4.png)



## Initial Access

With the previously found credentials, I was able to access the POP3 service and read an internal email.

![](/assets/img/post/pwntilldawn_choker/5.png)

Our dear operator has lost his password, so the sysadmin had to reset the password and sent him through an email. Let's use this password to access SSH using `operator` as username.

![](/assets/img/post/pwntilldawn_choker/6.png)

Once we log in the first flag (`FLAG77`) can be found in operator's home directory.



## Importing Privileges

Now for the root access. With little to no effort, I've identified an interesting binary named `time_teller` thanks to the `.bash_history`. While trying to execute the binary, I've also came across `time_teller_executer`, another important binary. 

![](/assets/img/post/pwntilldawn_choker/7.png)

Reading the binary strings reveals this binary is actually calling `time_teller`, which is a simple Python script that relies on OS module.

![](/assets/img/post/pwntilldawn_choker/8.png)

I'm thinking about a potential module hijacking, so checking the permissions of the module is the next step.

![](/assets/img/post/pwntilldawn_choker/9.png)

Since the global Python version is 2.7, and we can edit the `os.py` file, I can now add code that'll help me escalate the privileges inside the machine. It's a quite simple and funny method to use.

```shell
nano /usr/lib/python2.7/os.py
```

![](/assets/img/post/pwntilldawn_choker/10.png)

By adding two lines at the end of the module file, I can now add a SUID permission to `/bin/bash`, allowing me to escalate privileges. Now this code should be executed when I run `time_teller_executer`.

![](/assets/img/post/pwntilldawn_choker/11.png)

Finally, if you didn't knew, once the SUID is set, you can run `/bin/bash -p` to elevate privileges immediately.

```shell
/bin/bash -p
```

![](/assets/img/post/pwntilldawn_choker/12.png)

Although I'm still using the `operator`, I have now root permissions, allowing me to read the second and last flag from this challenge: `FLAG78`.
