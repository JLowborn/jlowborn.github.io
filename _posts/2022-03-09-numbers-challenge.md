---
layout: single
title: Numb3rs Challenge
date: 2022-03-09
classes: wide
---

Esse foi um desafio passado como uma atividade durante as aulas que tive durante a graduação, resolvi fazer um write-up como forma de *freezar* o que eu aprendi, e claro, mostrar como Python é extremamente divertido de se usar.



## O Desafio

O desafio aparenta ser relativamente simples, ao fazer a conexão em
`numb3rs.hopto.org:8012` somos recebidos com a seguinte mensagem::

![](/assets/images/posts/numbers_challenge/1.jpg)

Espera-se que seja enviado como resposta o número que é mostrado na tela, e essa é mensagem recebida caso a resposta esteja correta:

![](/assets/images/posts/numbers_challenge/2.jpg)

Também podemos notar que caso a reposta demore para ser enviada, estando correta ou não, o servidor deixa de responder a conexão, nos deixando como única opção encerrar a conexão:

![](/assets/images/posts/numbers_challenge/3.jpg)

É fácil perceber que (a menos que você tenha a paciência e os dedos de um mestre pianista) não podemos simplesmente fazer isso puramente digitando, então vamos fazer um programa que consiga resolver esse problema para nós.



## O Problema

Para resolver isso, vamos precisar analisar o que está sendo enviado pela conexão quando abrimos ela, e apesar de poder ser feito através de diversos métodos, vamos usar Python pra isso.

```python
import socket # Gerencia a conexão

host = "numb3rs.hopto.org"
port = 8012

# Pro tip: Você sabia que pode usar socket com "with" ao invés do método tradicional com variáveis?
with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
    s.connect((host, port)) # Realiza a conexão
    data1 = s.recv(1024) # Recebe os dados
    data2 = s.recv(1024)
    
print(data1)
print(data2)
```

Perceba que usamos `s.recv(1024)` duas vezes para o recebimento de dados, isso acontece porquê o servidor nos envia duas mensagens ao invés de apenas uma, e os números são mostrados sempre na segunda. Devo adiantar que quando acertamos a resposta, recebemos novamente duas respostas, sendo que uma é uma confirmação de que acertamos e a outra contém o número.

![](/assets/images/posts/numbers_challenge/4.jpg)

O problema é que em momento algum o servidor nos envia os números de forma legível e, ao invés disso, o que temos são strings representandos os números, então precisamos pensar em como ler os valores recebidos e interpretá-los.



## A Solução

A melhor maneira de lidar com esse desafio é entender que cada número é representado por uma string, e isso significa que devemos criar um dicionário para ler cada string e interpretá-las. Antes de criar o dicionário é necessário separar as respostas da melhor forma possível para que possamos criá-lo.

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

A função `pprint` vem de Pretty Print, e é útil quando se precisa printar mensagens de forma legível. Usamos `strip` Também substituímos a variável data1 por `_` uma vez que não vamos precisar dessa informação no código. E temos a seguinte resposta:

![](/assets/images/posts/numbers_challenge/5.jpg)

As duas primeiras linhas a última linha não são de fato relevantes, mas isso não é um problema, ainda sim, temos que lidar com os \n contidos no código, e podemos fazer isso com `replace` .

```python
pp([string.replace("\n", "").strip() for string in data.split("\n\n")])
```

![](/assets/images/posts/numbers_challenge/6.jpg)

Agora temos as strings númeridas da forma mais limpa possível, e isso é bom, podemos finalmente criar o dicionário. Para pegar a string, apenas precisamos rodar o código algumas vezes para termos todas os 10 dígitos possíveis, e com isso temos nosso dicionário. Por conta de alguns imprevistos aleatórios, infelizmente eu não posso colocar o código diretamente aqui, mas o dicionário deve se parecer com esse:

![](/assets/images/posts/numbers_challenge/bonus.png)

Com esse dicionário, podemos fazer a conversão das strings para seus respectivos números, e teremos a resposta.

```python
answer = [
    numbers.get(string.replace("\n", "").strip(), None) for string in
    data.split("\n\n")
]
print("".join(answer))
```

Ao executar o código temos o seguinte resultado:

![](/assets/images/posts/numbers_challenge/7.jpg)

Esse erro acontece pelo seguinte motivo, caso não fosse utilizada a função `get` no dicionário, as strings que não existem nesse dicionário causariam um erro, por isso usamos `get` , assim podemos definir um valor padrão caso a string não seja encontrada. Ainda sim, quando tentamos usar `join` na lista de números, o valor None causou esse erro, e para isso devemos remover esse valor. A função `filter` é ideal para esse situação uma vez que ela pode remover todos os valores que não queremos da lista e deixar apenas os que importam, então, como mencionado antes, as strings não relevantes não são um problema.

```python
print("".join(list(filter(None, answer))))
```

E com esse pequeno erro corrigido, podemos novamente executar o código e ter a resposta que esperamos.

![](/assets/images/posts/numbers_challenge/8.jpg)



## O Resultado

Agora o que nos resta fazer é criar um loop que repita essa mesma ação 1337 vezes e que também envie as informações para o servidor. Essa é a parte mais simples.

```python
import socket

host = "numb3rs.hopto.org"
port = 8012

numbers = {
	# Em teoria aqui ficaria seu dicionário
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

Removemos a função `pprint` do código uma vez que já não precisamos mais dela, criamos um laço de `for` para repetir as ações de receber traduzir e enviar as informações 1337 vezes, e usamos `s.send(bytes(answer, 'utf-8"))` para enviar a resposta no formato de bytes para que o servidor possa entender, com isso apenas precisamos executar o código uma última vez e voilà, temos a nossa flag.

![](/assets/images/posts/numbers_challenge/9.jpg)

A flag final é `FIAP{th353_nuMb3r5_4r3_s0_b0r1n6!}` . Foi super divertido pensar em como resolver esse desafio, também nos ajuda à entender como separar strings, trabalhar com sockets e dicionários. Então é isso, espero poder ter ensinado algo novo à você e *Hack On!*
