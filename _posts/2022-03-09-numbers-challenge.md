---
layout: post
title: Numb3rs Challenge
date: 2022-03-09
classes: wide
description: Reading ASCII numbers and automating responses with Python.
---

## The Challenge

The challenge appears to be relatively simple. Upon connecting to `numb3rs.hopto.org:8012`, we are greeted with the following message:

![](/assets/img/post/numbers_challenge/1.jpg)

It is expected that you send back the number displayed on the screen, and this is the message received if the response is correct:

![](/assets/img/post/numbers_challenge/2.jpg)

We can also note that if the response takes too long to be sent, whether it is correct or not, the server stops responding to the connection, leaving us with no other option but to terminate the connection:

![](/assets/img/post/numbers_challenge/3.jpg)

It's easy to see that (unless you have the patience and fingers of a master pianist) we can't simply do this by typing manually. So, let's write a program that can solve this problem for us.



## The Problem

To solve this, we need to analyze what is being sent over the connection when we open it. While this can be done using various methods, we will use Python for this task.

```python
import socket

host = "numb3rs.hopto.org"
port = 8012

# Pro tip: Did you know that you can use sockets with the "with" statement instead of the traditional method with variables?
with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
    s.connect((host, port))
    data1 = s.recv(1024)
    data2 = s.recv(1024)
    
print(data1)
print(data2)
```

Notice that we use `s.recv(1024)` twice to receive data. This is because the server sends us two messages instead of just one, and the numbers are always shown in the second message. I should mention that when we get the answer right, we receive two responses again: one is a confirmation that we were correct, and the other contains the next number.

![](/assets/img/post/numbers_challenge/4.jpg)

The problem is that the server never sends us the numbers in a readable form; instead, it sends strings representing the numbers. So, we need to think about how to read the received values and interpret them accordingly.



## An Elegant Solution

To handle this challenge, the best approach is to understand that each number is represented by a string. This means we can create a dictionary to map each string to its corresponding number. Before creating the dictionary, we need to separate the responses appropriately so that we can build it.

```python
import socket
from pprint import pprint as pp

host = "numb3rs.hopto.org"
port = 8012

with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
    s.connect((host, port))
    _ = s.recv(1024)
    data = s.recv(1024).decode()
    
print(data)
pp([string.strip() for string in data.split("\n\n")])
```

The function `pprint` comes from Pretty Print and is useful when you need to print messages in a readable format. We use `strip`. We also replaced the variable `data1` with `_` since we won't need that information in the code. And we have the following response:

![](/assets/img/post/numbers_challenge/5.jpg)

The first two lines and the last line are not actually relevant, but that's not a problem. Nevertheless, we still need to handle the `\n` characters in the code, and we can do that using `replace`.

```python
pp([string.replace("\n", "").strip() for string in data.split("\n\n")])
```

![](/assets/img/post/numbers_challenge/6.jpg)

Now we have the numeric strings in the cleanest form possible, which is good. We can finally create the dictionary. To get each string, we just need to run the code a few times to capture all 10 possible digits, and then we have our dictionary. Due to some random unforeseen issues, unfortunately, I can't directly provide the code here, but the dictionary should look like this:

![](/assets/img/post/numbers_challenge/bonus.png)

With this dictionary, we can convert the strings into their respective numbers, and then we will have the answer.

```python
answer = [
    numbers.get(string.replace("\n", "").strip(), None) for string in
    data.split("\n\n")
]
print("".join(answer))
```

When running the code, we get the following result:

![](/assets/img/post/numbers_challenge/7.jpg)

This error occurs for the following reason: if the `get` function isn't used in the dictionary, strings that don't exist in the dictionary would cause an error. That's why we use `get`, so we can define a default value if the string isn't found. However, when trying to use `join` on the list of numbers, the `None` value caused this error, and to fix this, we need to remove that value. The `filter` function is ideal for this situation because it can remove all unwanted values from the list and leave only those that matter. As mentioned before, the irrelevant strings are not a problem.

```python
print("".join(list(filter(None, answer))))
```

With this small error corrected, we can run the code again and get the expected answer.

![](/assets/img/post/numbers_challenge/8.jpg)



## The Outcome

Now, all that remains is to create a loop that repeats this action 1337 times and also sends the information back to the server. This is the simplest part.

```python
import socket

host = "numb3rs.hopto.org"
port = 8012

numbers = {
	# Previously obtained dictionary
}

with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
    s.connect((host, port))
    for _ in range(1337):
        _ = s.recv(1024)
        data = s.recv(1024).decode()
        
        print(data, end="")
        answer = [
        	numbers.get(string.replace("\n", "").strip(), None)
        	for string in data.split("\n\n")
        ]
        answer = "".join(list(filter(None, answer)))
        s.send(bytes(answer, "utf-8"))
        print(answer)
```

We removed the `pprint` function from the code since we no longer need it. We created a `for` loop to repeat the actions of receiving, translating, and sending information 1337 times. We used `s.send(bytes(answer, 'utf-8'))` to send the response in byte format so the server can understand it. Now, all we need to do is execute the code one last time, and voilà, we have our flag.

![](/assets/img/post/numbers_challenge/9.jpg)

The final flag is `FIAP{th353_nuMb3r5_4r3_s0_b0r1n6!}`. It was a lot of fun figuring out how to solve this challenge. It also helps us understand how to manipulate strings, work with sockets, and use dictionaries effectively. So that's it, I hope I've taught you something new, and *Hack On!*
