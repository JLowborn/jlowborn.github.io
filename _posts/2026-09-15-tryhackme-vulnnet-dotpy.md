---
layout: post
title: TryHackMe - VulnNet dotpy Write-Up
date: 2026-09-15
classes: wide
description: Working around a character blacklist to turn a reflected path into code execution, and a reminder that the browser is not a payload delivery tool.
---

# TryHackMe - VulnNet dotpy Write-Up

VulnNet Entertainment is back, and this time the whole machine is **Python**. It's a **medium** room, and the fun part isn't finding the vulnerability — it's getting a payload past the protection somebody put in front of it.

As usual, the first step is to add the host to `/etc/hosts` with the name the room provides and work with the hostname instead of the IP.

![The VulnNet dotpy login page](/assets/img/post/thm_vulnnetdotpy/1.png)

## Initial Scanning

As usual, I start by scanning the target. One port, one service, and a header that already tells you what you're dealing with:

```sh
nmap -sV -sC -p8080 vulnnet.thm -oN scans/nmap.txt
```

```
PORT     STATE SERVICE VERSION
8080/tcp open  http    Werkzeug httpd 1.0.1 (Python 3.6.9)
| http-title: VulnNet Entertainment -  Login  | Discover
|_Requested resource was http://vulnnet.thm:8080/login
```

**Werkzeug** is the development server that ships with **Flask**, so this is a Python application — and that header alone settles several questions later on. The room description wasn't joking about being Python focused.

## The Page That Told Me Too Much

The site is a login page and a bit of static content. Nothing worth attacking yet, but any page that doesn't exist returns a custom 404 which **prints the part of the URL that didn't match**:

```
No results for whatever-i-typed
```

So the app is reflecting my input back inside a template, which is either a nice feature or a terrible idea — and you can probably guess which one it turned out to be. The obvious question: does it just print it, or does it *evaluate* it?

```
http://vulnnet.thm:8080/%7B%7B7*7%7D%7D
```

![The 404 page showing No results for 49](/assets/img/post/thm_vulnnetdotpy/2.png)

`No results for 49`. The path isn't being printed, it's being compiled as a **Jinja2** template. That's **server-side template injection** — and it's the only real "vulnerability" of the room. Everything else is getting past the guard rails around it.

## The Blacklist

Trying anything useful ran straight into a **blacklist**: the app inspects the text you send and rejects it if it contains certain characters. Mapping it one character at a time — which is the only honest way to do it:

```
{{ config }}          -> renders the whole Flask config object   (allowed)
{{ 'A_B' }}           -> blocked
{{ 'x.y' }}           -> blocked
```

Underscores and dots are rejected outright — and notice how thorough that is: it blocks the character *inside a string literal* too. No `__class__`, no `config.SECRET_KEY`, no `config['SECRET_KEY']`. Three common ways of writing attribute access, all dead.

## Dodging the Blacklist

In Jinja, the dot is just sugar: `a.b` is `getattr(a, 'b')`, and the filter `attr` does exactly that with the name passed as a string:

```jinja
{{ a|attr('b') }}
```

So the dot is replaceable. Item access is the same idea — `d['k']` is `d.__getitem__('k')` — which means brackets aren't needed either.

The underscore was the hard one, and the answer is that **the filter reads the text you send, but the template engine reads the meaning**. `\x5f` is an escape: the filter sees four harmless characters, and Jinja turns them into `_` when it compiles the string. Two different stages reading two different things, and the gap between them is the bypass.

Two traps cost me real time here, and they're worth writing down because they look like the filter working when they're not:

- `{{ config|attr('ENV') }}` renders **empty** instead of the value. That's not a block: the dot operator falls back to item access when `getattr` fails, but the `attr` filter does a plain `getattr` — and `config` is a dict, so attribute access finds nothing. The fix is access by item.
- An empty result has three possible causes, and they need different responses: the filter blocked the request, the expression evaluated to nothing, or the value is genuinely empty. `|default('empty')` and `is undefined` tell them apart.

## Config, Straight Off the Template

With `config` reachable, the app hands over its own configuration — no exploit needed, it's in the context of every rendered template:

```
SECRET_KEY                : S3cr3t_K#Key
SQLALCHEMY_DATABASE_URI   : sqlite:////home/web/shuriken-dotpy/db.sqlite3
DEBUG                     : True      (with ENV: production)
```

That's three things worth keeping: the SECRET_KEY signs the Flask session cookie (and a cookie that's signed but not encrypted can be **forged** by anyone holding the key), the SQLite path names the app's data, and DEBUG means errors come back with full tracebacks — which is a channel of its own.

## Code Execution

The shortest path from an object in the template context to running a command doesn't go through the subclass walk. Every function carries the namespace of the module where it was **defined**, in `__globals__` — and `Config.__init__` was defined in `flask/config.py`, a module that imports `os`:

```
config  ->  __class__  ->  __init__  ->  __globals__  ->  ['os']  ->  popen()  ->  read()
```

Written with the pieces above (dots as `|attr`, underscores as `\x5f`), and sent with `curl`:

```sh
COOKIE='session=...'
curl -g -b "$COOKIE" 'http://vulnnet.thm:8080/%7B%7B%20config%7Cattr%28%27%5Cx5f%5Cx5fclass%5Cx5f%5Cx5f%27%29%7Cattr%28%27%5Cx5f%5Cx5finit%5Cx5f%5Cx5f%27%29%7Cattr%28%27%5Cx5f%5Cx5fglobals%5Cx5f%5Cx5f%27%29%7Cattr%28%27%5Cx5f%5Cx5fgetitem%5Cx5f%5Cx5f%27%29%28%27os%27%29%7Cattr%28%27popen%27%29%28%27id%27%29%7Cattr%28%27read%27%29%28%29%20%7D%7D'
```

```
uid=1001(web) gid=1001(web) groups=1001(web)
```

`popen` and not `system`, because the output of a command executed this way comes back inside the HTTP response: the same channel that carries the injection also carries the result.

## A Shell

Command execution through a URL is fine for looking around, but for the Linux side of the room I want a real shell. The command gets base64-encoded so the payload doesn't have to survive quoting, `&`, `>` and pipes inside a URL, and the reverse shell lands in Penelope, which upgrades it to a PTY on its own:

![Penelope catching the reverse shell and upgrading it to a PTY](/assets/img/post/thm_vulnnetdotpy/3.png)

## The Linux Half

With a shell on the box, the Linux side is a normal audit — and the room being "Python focused" stops being a slogan the moment we run `sudo -l`:

### A Package Deal

```
User web may run the following commands on vulnnet-dotpy:
    (system-adm) NOPASSWD: /usr/bin/pip3 install *
```

A wildcard on the *arguments*. That means I get to choose what pip installs — and, funny enough, pip **executes** what it installs: it runs `setup.py egg_info` while reading the package metadata, so code at the top of that file runs with the privileges of the pip process. I pointed it at a directory I controlled and got a shell as `system-adm` (same socket + `dup2` + `pty.spawn` payload as before, just a different vehicle).

![The new shell, now as system-adm](/assets/img/post/thm_vulnnetdotpy/4.png)

The part worth writing down is the packaging detail, because it really took me a long time to figure out:

> **pip does not install a file — it installs a project.**

The argument has to be a **directory** containing `setup.py` (or a real sdist/wheel). I kept pointing it at the file, and pip interpreted the *name* as a package: `Collecting setup.py`, then a retry loop against PyPI — which on a box without egress dies with `Network is unreachable`. Once the payload lived in its own directory it worked first try, with no extra flags:

```sh
mkdir -p /tmp/p && mv ~/setup.py /tmp/p/setup.py
sudo -u system-adm /usr/bin/pip3 install /tmp/p
```

No `setup()` call, no `cmdclass`, no `--no-build-isolation` — that last flag doesn't even exist in the pip 9 that ships with Python 3.6, and it wasn't needed anyway.

### The Import Business

`sudo -l` again, now as `system-adm`:

```
User system-adm may run the following commands on vulnnet-dotpy:
    (ALL) SETENV: NOPASSWD: /usr/bin/python3 /opt/backup.py
```

`SETENV` is the vulnerability. The point of `env_reset` is to keep my environment from reaching a privileged process; `SETENV` exempts this command from that. And for a Python script, the environment decides **where code is loaded from**: `PYTHONPATH` is searched before the standard library, so I get to choose which file answers an `import`.

Reading the script tells you the target. It does a plain `import zipfile` — not `from zipfile import ...` — so a file called `zipfile.py` in a directory I control *becomes* the module for that process, and the code at the top of it runs the moment the script imports it, as root:

```sh
# /tmp/x/zipfile.py — the same socket + dup2 + pty.spawn payload as before
sudo PYTHONPATH=/tmp/x /usr/bin/python3 /opt/backup.py
```

Three things make a module a good pick: the script has to import it, the interpreter must not have already loaded it at startup, and it shouldn't be a C extension. Pure-Python stdlib modules imported only by the target script — `zipfile` here — are exactly that.

Root flag, and clean exit: nothing was exploited, both binaries are legitimate, and the whole escalation happened inside the sudo configuration.

## Lessons Learned

The exploit itself is almost boring once you see it: a template engine, a blacklist that checks text instead of meaning, and an object in the context whose defining module already imported `os`.

What I'll actually remember is a delivery problem. My payload worked from the terminal and did nothing in the browser, and I spent way too long blaming the application. The reason is that a browser **rewrites the URL before sending it** — a backslash typed into the address bar goes out as a forward slash — so half of my payload never left my machine. `curl` sends exactly the bytes you give it, and that's what closed the room.

The other half is encoding. Characters like spaces, backslashes and `&` mean something to *someone* along the way — the shell, the URL itself, the application — and every one of them is a chance for your payload to be quietly reinterpreted. Percent-encoding the whole thing removes the guesswork: the payload arrives exactly as written, no matter who is in the middle. It's the same reason the `\x5f` trick works at all: it only survives because of what each layer does and doesn't touch.

There's a bigger pattern here, and it took me three escalations to see it. Three different "vulnerabilities" in this room are the same bug wearing different clothes:

- the 404 path became a **Jinja template**,
- the `setup.py` I uploaded became **code executed by pip**,
- the module loaded from my `PYTHONPATH` became **root's code**.

None of them was memory corruption. All three were the boundary between data and code drawn in the wrong place — and in all three, a legitimate tool (Flask, pip, python3) was the one doing the executing. The mitigation is never a patch: it's not letting input choose what gets *interpreted* (a template, a project file, an import path), and not handing a sudo rule control over the environment or over an argument by wildcard.

And the operational note that cost me the most time: a payload that can leave a process running as another user (my pip ran as `system-adm`, which my `web` shell had no rights over) needs a **connect timeout** so a missing listener fails in seconds instead of hanging forever. I learned that one the hard way, mid-escalation, and had to redeploy the box.

Hack on!