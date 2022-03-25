---
layout: single
title: Lateral movement, Password spraying, Pivoting & Pass the hash
date: 2022-03-25
classes: wide
---

It's been a while since someone told me to start writing a blog about what I'm learning, and finally after all there years I've decided it might be a good idea to do so. So since I've decided I have a **lot** to learn about Windows OS, so in the meantime I'll be posting a lot about my studies on Windows machines. Also, I'll be focusing on [HackTheBox](https://hackthebox.eu/) machines, but not only those, I'll be writing write-ups on my college challenges too. But without futher ado, let's hack on.



## Understanding the network

---

So before we start hacking, we must understand what are we dealing with. So here's the network diagram.

![](/home/rebellion/git/JLowborn.github.io/assets/images/posts/network_diagram1.jpg)

As you can see, we have 3 servers, the first one being a Linux Box, which we'll be using to access an AD (Active Directory) server, as well as a confidential repository. Now, for the spoiler: Our objective here is to gain access to the confidential repository by pivoting our connection through the Linux server, and for this we'll be using [sshuttle](https://github.com/sshuttle/sshuttle), as well as some enumeration and post-exploitation tools for Windows. OBS: We'll be starting from the point we've already compromised the Linux server.



