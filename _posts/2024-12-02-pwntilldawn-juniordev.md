---
layout: post
title: PwnTillDawn - JuniorDev Write-Up
date: 2024-12-02
classes: wide
description: Jenkins exploration and Command Injection throught Python.
---

# JuniorDev (10.150.150.38)

![1](/assets/img/post/pwntilldawn_juniordev/1.png)



## Scanning Phase

Firing up nmap reveals a limited number of ports, including 22 and 30609.

![2](/assets/img/post/pwntilldawn_juniordev/2.png)

We can also see Nmap identified a Jetty server and brought us the version, together with a `robots.txt`.



## Jenkins Server

Opening the server inside the browser show us a Jenkins login page.

![3](/assets/img/post/pwntilldawn_juniordev/3.png)

The `robots.txt` page have a curious information, thought I'm not sure if this is a default message generated by Jenkins.

![4](/assets/img/post/pwntilldawn_juniordev/4.png)

After trying generic passwords for the admin user, I've discovered Jenkins actually doesn't have a default password, different from other services it uses a file to generate a unique password to the administrator. Also, accessing `/oops` let us identify the Jenkins version as `2.222.1` and further attemps to exploit this version have failed.

Our last option is to bruteforce for the password and hope for the best. This process can be made by either using Metasploit `jenkins_login` module or Hydra.

![5](/assets/img/post/pwntilldawn_juniordev/5.png)

The password found for the admin user is `matrix`. Now we can access the dashboard.

![6](/assets/img/post/pwntilldawn_juniordev/6.png)

Soon after accessing the administrator account, our first flag, **FLAG69**, can be found inside the users page (`/asynchPeople`). 



## Initial Shell

From previous experiences with Jenkins, I know we can easily get a shell using Jenkins features, this can be achieved with different methods. This time I'll be [creating a new job](https://cloud.hacktricks.xyz/pentesting-ci-cd/jenkins-security/jenkins-rce-creating-modifying-project), although this is the most *noisy* option due to how easily detectable it is.

![7](/assets/img/post/pwntilldawn_juniordev/7.png)

I'll be creating a free-style project with a random name, the next page allows the user to execute commands on the server in behalf of the project.

![8](/assets/img/post/pwntilldawn_juniordev/8.png)

By using the configuration page, we can add a reverse shell command to be executed during the build and use the **build now** option. Remember to start your listener with your favorite tool.

![9](/assets/img/post/pwntilldawn_juniordev/9.png)

The next flag, **FLAG70**, is located inside the home directory of the Jenkins user together with various configuration and files with sensitive information.

Apart from the Jenkins user, we also have two other users with a shell, being `juniordev` and `root`.



## Compromising JuniorDev

Our current user, `jenkins`,  have a few commands available to see by using `history`.

![10](/assets/img/post/pwntilldawn_juniordev/10.png)

What draws my attention is the `id_rsa` file, which we can use to access the server through SSH and the `ps aux`, showing us that the previous user was looking for the port 8080 among the root processes. Let's see if we have read permissions on the RSA key.

![11](/assets/img/post/pwntilldawn_juniordev/11.png)

This key will be downloaded and used to access the server through SSH using `juniordev` as mentioned, but before using it, we must set the correct permissions.

```
$ chmod 600 id_rsa
$ ssh juniordev@10.150.150.38 -i id_rsa
```

![12](/assets/img/post/pwntilldawn_juniordev/12.png)

Since there's no flags inside the home directory, let's review the processes and see what's running on port 8080.

![13](/assets/img/post/pwntilldawn_juniordev/13.png)

Notice there's a Python process being executed with root privileges, it seems to be a calculator by the name, and accessible locally through port 8080. This machine doesn't have the `curl` privileges.



## Abusing Python Privileges

To access this application externally and use our tools as required, we can use SSH and create a tunnel to grant us access using the browser. Let's get back to the attacker's machine.

```
$ sudo ssh -fL 80:127.0.0.1:8080 -i id_rsa juniordev@10.150.150.38
```

After using this commands, we have the freedom to use our tools as needed, so now I'll be using `curl` to verify it works.

```
$ curl http://127.0.0.1/
```

![14](/assets/img/post/pwntilldawn_juniordev/14.png)

Looks like it's a simple form, and we also have a commented line with a FLAG on it. Accessing `http://127.0.0.1/static/FLAG.png` reveals the flag.

![15](/assets/img/post/pwntilldawn_juniordev/15.png)



> :bulb: **Quick Tip:** Copying each individual character by hand is annoying and extremely slow, to avoid this time consuming task and potential typhos you can use [Yandex OCR](https://yandex.com/images/) to paste the image and read it contents to copy the text instead.



The page itself doesn't show anything but a form with two boxes. It's a calculator and it expects numbers to be used. Of course, we'll be performing injections inside the inputs.

Through guessing how the application works, I've used the following payload to read the application itself and see what's behind the scenes.

```python
str(1) + __import__('os').system('open("/root/mycalc/untitled.py").read()')
```

![17](/assets/img/post/pwntilldawn_juniordev/17.png)

Knowing how the application works is generally my main objective when performing injections. It becomes easier if you understand the inner workings of the application.

Instead of crafting complex payloads to use, I've decided to upload a malicious file created with `msfvenom` and use this same payload to execute the binary file instead.

```python
str(1) + __import__('os').system('/tmp/reverse')
```

Using this payload allowed me to get remote access directly to the root user using Metasploit. Now, after starting the listener, we can finally read the **FLAG72** file. Alternatively, the same payload could be used to read `/root/FLAG72.txt` by literally guessing the file name and location.

![18](/assets/img/post/pwntilldawn_juniordev/18.png)

Congratulations on completing the CTF! Hack On!
