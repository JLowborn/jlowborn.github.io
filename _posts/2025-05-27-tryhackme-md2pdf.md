---
layout: post
title: TryHackMe - MD2PDF Write-Up
date: 2025-05-27
classes: wide
description: Abusing lack of sanitization to retrieve files from the remote server through markdown HTML rendering capabilities.
---

# MD2PDF

![1](/assets/img/post/thm_md2pdf/1.png)

## Reconnaissance

![2](/assets/img/post/thm_md2pdf/2.png)

Upon scanning the target machine using Nmap, apart from default SSH, we also have port **80** and 5000, which looks pretty much the same.

## Understanding the Application

As we load the page, a simple text box is presented, allowing the user to write and render Markdown code into PDF files.

![3](/assets/img/post/thm_md2pdf/3.png)

 If you didn't heard of Markdown before, it's a language meant to be easy to learn and to use to be rendered in various types of documents.

> *The Markdown Guide* is a free and open-source reference guide that explains how to use Markdown, the simple and easy-to-use markup language you can use to format virtually any document.

Among it's capabilities it can load images from both internal and external sources, so I've decided to test this with a simple code:

```markdown
![](https://127.1/)
```

![4](/assets/img/post/thm_md2pdf/4.png)

Note that `127.1` is shorthand for `127.0.0.1` or `localhost`.  It failed to render a PDF document, but this gave me the ideia of trying external requests. After starting a simple Python HTTP server, I've changed the code to try and reach my server:

```markdown
![](http://IP/)
```

![5](/assets/img/post/thm_md2pdf/5.png)

Although it rendered an empty file it has also performed a request, which is great news, as it creates the possibility of an SSRF.

![6](/assets/img/post/thm_md2pdf/6.png)



## Reading Internal Files

Another capability of Markdown is rendering HTML code as well. So I've decided to use the `iframe` tag to render an internal page. Since we can't load internal pages if we don't have any, fuzzing the application is a must.

![7](/assets/img/post/thm_md2pdf/7.png)

Two pages can be found: **admin** and **convert**. From reading the request history, the latter is the one responsible for converting user's code to a PDF file, so let's render admin page.

```html
<iframe src="http://127.1/admin"></iframe>
```

Both **http** and **https** results in failure, and by checking with Curl, we can find the reason:

![8](/assets/img/post/thm_md2pdf/8.png)

So all we have to do is add the port inside the URL and profit:

```html
<iframe src="http://127.1:5000/admin"></iframe>
```

![9](/assets/img/post/thm_md2pdf/9.png)