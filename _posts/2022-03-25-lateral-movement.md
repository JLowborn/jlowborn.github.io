---
layout: post
title: Lateral movement, Password spraying, Pivoting & PassTheHash
date: 2022-03-26
classes: wide
description: Pivoting, password spraying and exploiting RDP via `PassTheHash`.
---

It's been a while since someone told me to start writing a blog about what I'm learning, and finally after all there years I've decided it might be a good idea to do so. So since I've decided I have a **lot** to learn about Windows OS, so in the meantime I'll be posting a lot about my studies on Windows machines. Also, I'll be focusing on [HackTheBox](https://hackthebox.eu/) machines, but not only those, I'll be writing write-ups on my college challenges too. But without futher ado, let's hack on.



## Understanding the network

So before we start hacking, we must understand what are we dealing with. So here's the network diagram.

![](/assets/img/post/lateral_movement/1.jpg)

As you can see, we have 3 servers, the first one being a Linux Box, which we'll be using to access an AD (Active Directory) server, as well as a confidential repository. Now, for the spoiler: Our objective here is to gain access to the confidential repository by pivoting our connection through the Linux server, and for this we'll be using [sshuttle](https://github.com/sshuttle/sshuttle), as well as some enumeration and post-exploitation tools for Windows. OBS: We'll be starting from the point we've already compromised the Linux server.   



## Pivoting with sshuttle

So first things first, we need to reach the subnet, don't we? We could be using `ssh -D` to set a dynamic port, but as far as I learned, it's not a go-to  option since it messes with nmap scans as well as exploit delivering, so instead of using Dynamic SSH tunnels, we'll be using sshuttle, which is a great tool for pivoting and don't require you to root the pivoting machine, only on the attacker's local machine, and it's pretty easy to install, so just go to your Kali Linux, Parrot or whatever it is your distro, and type `sudo apt install -y sshuttle` inside your terminal, by the way I'm almost 100% sure it's included by default in Kali Linux distros.

<script id="asciicast-EV3dETAYOKaYRgweDm0V7JOod" src="https://asciinema.org/a/EV3dETAYOKaYRgweDm0V7JOod.js" async></script>



## Dump & Spray

Know that now we're inside the target's subnet, and this means we can continue the hack with further exploration. We'll not try connecting directly to Confidential Repository since I already know this isn't going to work. One of the most useful techniques I've learned recently is *Password Spraying* which basically represent using a password you've found and try using it to login in every single account you can. We have a password, but no accounts, so our next step is to list accounts available on the server, and for this we'll be using [ldapdomaindump](https://github.com/dirkjanm/ldapdomaindump).

<script id="asciicast-SGvfpuei4zVUdsdXBTs8WBDaZ" src="https://asciinema.org/a/SGvfpuei4zVUdsdXBTs8WBDaZ.js" async></script>

Now we've managed to find a user list, we're going to use `awk` to parse the information we need in order to start a password spraying attack. Note that using this attack will surely trigger the SOC team, so be careful when doing so, but here I'm using a custom lab, so we're good. Now we parse the users to a list for further usage.

```bash
$ awk '{if (NR!=1) {print $1}}' domain_users.grep > user.lst
```

This command will remove the first line of the `domain_users.grep`, get all usernames in the first column and put inside the `user.lst` file. The output should come like so:

```bash
$ head -n10 user.lst 
ITAdmin
val.johnson
troy.underbridge
tony.gardner
tom.peets
todd.packer
toby.flenderson
the.snakes
stephanie.jorge
stanley.hudson
```

Now that we have plenty of users, let's use the for the password spraying by using [crackmapexec](https://github.com/byt3bl33d3r/CrackMapExec):

<script id="asciicast-PEHQaDdzwqNDeqxZSIDnmd3k4" src="https://asciinema.org/a/PEHQaDdzwqNDeqxZSIDnmd3k4.js" async></script>

We found out that user `Goro.Takemura` uses the same password as the user we've already compromised, and by looking inside the groups files we can see that this user is also an Administrator so now we can use this user to get NTLM hashes from the other accounts with `secretsdump.py` comes inside [Impacket](https://github.com/SecureAuthCorp/impacket) program suite.

<script id="asciicast-SBFO9jvs6ZSrwnHahZnXDkqj3" src="https://asciinema.org/a/SBFO9jvs6ZSrwnHahZnXDkqj3.js" async></script>



## Pass2Win

With all these hashes we've just obtained, we can try a new technique I've just learned about, it's called *PassTheHash*, which basically allows us to impersonate another user without need of the plaintext password to login. For this we'll now use `xfreerdp` which is mainly used for RDP connections. The only problem left to solve is which one of the users is allowed to RDP, and spoiler: It's not the `ITAdmin`, but if you've played *Cyberpunk 2077*, you can tell it could be the protagonist of the game, V, and if you said so, congratulations, you're right. In the process of solving this challenge I've made bash script to automate the process of trying each user and hash until some user login, but we're not doing this here, so let's just connect to the Confidential Repository:

<script id="asciicast-0BqlfzxnsC3YNNTCfHoE1sRkW" src="https://asciinema.org/a/0BqlfzxnsC3YNNTCfHoE1sRkW.js" async></script>

After this command, another windows pops up, with a RDP session opened on it, we're now able to access machine's information, and check which user are we currently logged on.

![](/assets/img/post/lateral_movement/2.png)

Also, the flag is inside the `database.txt` file, which has the following message: 

![](/assets/img/post/lateral_movement/3.png)

This challenge showed me that I have a **LOT** to learn about Windows machines as said early, but also showed me how fun it is to bypass Windows protections and how some techniques could be applied in real life scenaries, hope you've learned something new too. *Hack on!*
