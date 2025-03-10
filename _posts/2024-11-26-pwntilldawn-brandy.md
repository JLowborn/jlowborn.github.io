---

layout: post
title: PwnTillDawn - Brandy Write-Up
date: 2024-11-18
classes: wide
description: Enumeration, CRM compromise and SMTP privilege escalation.
---

# Brandy (10.150.150.27)

![1](/assets/img/post/pwntilldawn_brandy/1.png)

## Initial Scanning

Booting up nmap as usual to check for open ports and identify service versions:

```
$ sudo nmap -sV -sC -p- -oN scans/nmap.txt 10.150.150.27
```

![2](/assets/img/post/pwntilldawn_brandy/2.png)

We have only ports **80** and **22** open, as usual, I don't often go for SSH in CTFs as most of the time the service is intended to setup the machine rather than be used by players.

## Web Server

The server can be accessed normally, but all we can see is a default Apache2 server web page. 

![3](/assets/img/post/pwntilldawn_brandy/3.png)

With no relevant information on the source-code or `robots.txt`, I've decided to use fuzzing tools to identify relevant files on the server.

```
$ ffuf -u http://10.150.150.27/FUZZ -w /usr/share/seclists/Discovery/Web-Content/directory-list-2.3-medium.txt -fc 403
```

![4](/assets/img/post/pwntilldawn_brandy/4.png)

We've found interesting directories, but using different tools during enumeration will ensure you get better results.

```
$ dirsearch -u http://10.150.150.27/ -e html,php,bkp -x 403
```

![5](/assets/img/post/pwntilldawn_brandy/5.png)

After confirming our findings and accessing `/cart` the first flag appeared, we now have **FLAG61**.

![6](/assets/img/post/pwntilldawn_brandy/6.png)

Take note of the `vhost` written, we'll be using it soon enough. Let's check what's inside `/master`.

![7](/assets/img/post/pwntilldawn_brandy/7.png)

The directory only has an image, tipping us about a potential username/password we'll be using.

## Dolibarr

The last directory `/dolibarr` leads us to a login page, but acessing the vhost directly show us the same page.

![8](/assets/img/post/pwntilldawn_brandy/8.png)

As expected, it requires credentials, which we'll be using rick everywhere as the image told us to. This will lead us to the CRM dashboard, and unfortunately we don't have privileges other than accessing some Commercial Proposals.

![9](/assets/img/post/pwntilldawn_brandy/9.png)

Speaking of which, grants us **FLAG62** as we verify the only proposal available, 4 more to go.

![10](/assets/img/post/pwntilldawn_brandy/10.png)

There's no other information available for us other than that. So it's time to research for potential vulnerabilities. Lucky for us, the dashboard also provided us with a string version `5.0.3`.



## Webshell Upload

Identifying vulnerabilities was quite easy thanks to the version string. Wizlynx, which owns PwnTillDawn, has also discovered a [vulnerability](https://www.wizlynxgroup.com/security-research-advisories/vuln/WLX-2017-009) within Dolibarr allowing the attacker to upload arbitrary files and get a RCE.

![11](/assets/img/post/pwntilldawn_brandy/11.png)

There are also exploits available to help with this upload but I had only found those later on so I've applied a different method.

![12](/assets/img/post/pwntilldawn_brandy/12.png)

Once we access **Linked Files** seciton inside user's profile page we can see some disabled buttons. If we enable the buttons, we can upload a webshell.

> :bulb: **Did You Know?** BurpSuite has a feature that enables disabled buttons of a page? 
>
> ![13](/assets/img/post/pwntilldawn_brandy/13.png)
>
> Alternatively, one can manually enable them by removing the disabled options in HTML, or setup a *Match & Replace* rule inside BurpSuite.

By enabling the buttons, we can upload a file, intercept and modify the request as we will.

![14](/assets/img/post/pwntilldawn_brandy/14.png)

It looks like uploading a PHP file directly also works, problem is the CRM adds a `noexe` extension preventing the file from being executed. Applications often used blacklists to list dangerous extensions, and if that's the case, I'm sure they forgot at least one.

![15](/assets/img/post/pwntilldawn_brandy/15.png)

The `phtml` extension is an alternative to PHP extension which can be executed normally, and this extension doesn't get the `noexe` when uploaded.  Now all we gotta do is access the file.

In order to access the file, I've used one of Seclists's wordlist to identify the upload location through Fuzzing inside `/documents/users/2/shell.phtml`.

![16](/assets/img/post/pwntilldawn_brandy/16.png)



## Initial Foothold

To establish our connection I've decided to use [Penelope Shell Handler](https://github.com/brightio/penelope). This tool is intended to replace netcat when exploiting RCE. I find it easier to use since it can handle multiple listeneres at the same time, automatically upgrading shells and logging sessions. Finally, it can also work together with Metasploit and upgrade shells to meterpreter if needed.

![17](/assets/img/post/pwntilldawn_brandy/17.png)

After getting access to our shell, we can find **FLAG65** inside Dolibarr's directory in `/var/www/html/dolibarr`. 

![18](/assets/img/post/pwntilldawn_brandy/18.png)

I've decided to use Linpeas as it is a quick way to identify relevant information and potential PrivEsc methods, and found an interesting file in `/var/www/html/dolibarr/conf/conf.php_OLD` which has stored passwords on it that can be used to access MySQL, we'll be using those later on.

![19](/assets/img/post/pwntilldawn_brandy/19.png)



### SMTP Privilege Escalation

Reading the Linpeas report we can also see that there's another service running locally, in this case, SMTP and DNS.

![20](/assets/img/post/pwntilldawn_brandy/20.png)

DNS is being used to provide the vhost we used earlier. We can try identifying the version by SMTP used and find potential vulnerabilities.

```
$ nc localhost 25
```

![21](/assets/img/post/pwntilldawn_brandy/21.png)

Using netcat to connect to the service will provide us with the name `OpenSMTPD`, but not the version. We can identify the version using `apt` since we don't required sudo permissions to do so.

```
$ apt list --installed | grep smtp
```

![22](/assets/img/post/pwntilldawn_brandy/22.png)

With the version string in hands and a quick search, I've managed to find a known [vulnerability](https://www.exploit-db.com/exploits/48051) that allows both Local Privilege Escalation and RCE through SMTP.

![23](/assets/img/post/pwntilldawn_brandy/23.png)

Although we could use the exploit, I felt like doing it by hands and it was very simple to do. All we gotta do is connect to the server and type some commands.

```
$ nc localhost 25
```

![24](/assets/img/post/pwntilldawn_brandy/24.png)

Note that the listener must be ready to receive the connection before you finish sending the commands to the server. Once done, we'll receive our shell and **FLAG66** can be found inside root's home directory.

![25](/assets/img/post/pwntilldawn_brandy/25.png)



## Remaining Flags

Finally, we've got almost all the flags, but some of them are hidden inside MySQL, which is not relevant for our privilege escalation process, but still has 3 flags.

To get the final flags, we must use the MySQL credentials we found earlier and explore the database **OR** use `mysqldump` and identify the strings.

```
mysqldump -u dolibarr -p --no-create-info --extended-insert=FALSE dolibarrdb | grep -i "FLAG6"
```

![26](/assets/img/post/pwntilldawn_brandy/26.png)

The final flags appear in different tables inside the database. GGs!
