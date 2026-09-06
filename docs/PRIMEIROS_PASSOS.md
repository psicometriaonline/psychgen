# Primeiros passos — Windows

Guia para colocar o PsychGen BR rodando no seu computador, do zero.
Não é preciso saber programar. Você vai copiar e colar comandos.

**Tempo total:** 1h a 2h, sendo que a maior parte é espera.
**Você vai precisar:** Windows 10 ou 11, 20 GB livres de disco, e sua chave da OpenAI.

---

## Antes de começar: três palavras que vão aparecer

Só para você não se sentir perdido:

- **Terminal (PowerShell)** — a janela preta onde se digitam comandos. É o "menu"
  do computador sem os botões. Você abre pelo menu Iniciar.
- **Docker** — um programa que roda outros programas dentro de "caixas" isoladas.
  Nosso sistema tem 4 partes (banco de dados, R, servidor, site) e o Docker sobe
  as quatro juntas, já configuradas. Sem ele, você teria que instalar R,
  PostgreSQL e Node à mão e fazer os três conversarem.
- **Repositório** — a pasta do projeto, versionada no GitHub.

---

## Passo 1 — Instalar o WSL2

O Docker no Windows precisa de um "Linux por dentro" chamado WSL2. Um comando
resolve.

1. Clique no menu **Iniciar**, digite `powershell`.
2. Clique com o **botão direito** em "Windows PowerShell" → **Executar como
   administrador**. Aceite o aviso do Windows.
3. Cole isto e aperte Enter:

   ```powershell
   wsl --install
   ```

4. Espere terminar e **reinicie o computador**.

> Se aparecer "WSL já está instalado" ou algo parecido, ótimo — pule para o
> passo 2.

Depois de reiniciar, o Windows pode abrir uma janela pedindo para criar um
usuário e senha do Ubuntu. Crie (anote a senha) ou feche a janela — não vamos
usar.

---

## Passo 2 — Instalar o Docker Desktop

> **Já tem o Docker Desktop instalado?** Pule para "Dar mais memória ao
> Docker", logo abaixo, e depois leia "Se você já usa o Docker para outro
> projeto".

1. Baixe em <https://www.docker.com/products/docker-desktop/> (botão
   "Download for Windows").
2. Execute o instalador. Deixe marcada a opção **"Use WSL 2 instead of
   Hyper-V"**.
3. Reinicie se ele pedir.
4. Abra o **Docker Desktop** pelo menu Iniciar e **deixe aberto**. Espere até o
   ícone da baleia, no canto inferior esquerdo, ficar verde com a palavra
   "Engine running".

> **Importante:** o Docker Desktop precisa estar aberto sempre que você for usar
> o sistema. Se fechar, o sistema para.

### Dar mais memória ao Docker

O R usa bastante memória para compilar os pacotes.

1. No Docker Desktop, clique na **engrenagem** (Settings) no topo.
2. Vá em **Resources**.
3. Em **Memory**, arraste para pelo menos **8 GB**.
4. Clique em **Apply & restart**.

### Se você já usa o Docker para outro projeto

O Docker **não fica "ligado" a um repositório do GitHub**. Ele não sabe o que é
Git. O que ele faz é ler o arquivo `docker-compose.yml` da **pasta em que você
está no momento** e subir o que estiver descrito ali.

Ou seja: não existe nada para "trocar". Basta entrar na pasta do `psychgen`
(passo 4) e rodar os comandos lá. O outro projeto continua existindo, intacto,
na pasta dele.

O que o Docker Desktop mostra na lista são os **containers** de todos os
projetos juntos, agrupados pelo nome da pasta de cada um. Ver o outro projeto
ali é normal.

**O único conflito real é de porta.** Duas coisas não podem usar a mesma porta
do computador ao mesmo tempo. O PsychGen usa três:

| Porta | Para quê |
|---|---|
| 5432 | Banco de dados PostgreSQL |
| 8080 | Servidor da API |
| 5173 | O site |

A 5432 é a mais provável de estar ocupada, porque quase todo projeto com banco
de dados usa essa. Para verificar, com o outro projeto ligado, rode:

```powershell
docker ps --format "table {{.Names}}\t{{.Ports}}"
```

Se aparecer `5432`, `8080` ou `5173` na coluna da direita, há conflito. Duas
saídas:

- **Mais simples:** desligue o outro projeto enquanto usar o PsychGen. Entre na
  pasta dele e rode `docker compose down`.
- **Se precisar dos dois ao mesmo tempo:** mude as portas do PsychGen. Abra o
  arquivo `.env` (passo 5) e troque os números:

  ```
  POSTGRES_PORT=5433
  API_PORT=8081
  WEB_PORT=5174
  ```

  Nesse caso o endereço do site passa a ser <http://localhost:5174>.

---

## Passo 3 — Instalar o Git

O Git é o que baixa o projeto do GitHub e, depois, traz as atualizações que eu
fizer.

1. Baixe em <https://git-scm.com/download/win>.
2. Execute o instalador e clique **Next** em todas as telas. Os padrões estão
   bons.

---

## Passo 4 — Baixar o projeto

1. Abra o PowerShell **normal** (sem ser administrador): Iniciar → digite
   `powershell` → Enter.
2. Cole os comandos abaixo, **um de cada vez**, apertando Enter após cada um:

   ```powershell
   cd $HOME\Documents
   ```

   ```powershell
   git clone https://github.com/psicometriaonline/psychgen.git
   ```

   > **O repositório é privado**, então na primeira vez vai abrir uma janela do
   > navegador pedindo para você entrar no GitHub. Entre com a sua conta e
   > autorize. O Windows guarda essa autorização — não vai perguntar de novo.
   >
   > Se em vez da janela aparecer um pedido de usuário e senha no terminal,
   > feche o PowerShell, abra de novo e repita. A senha da conta do GitHub
   > **não** funciona ali; tem que ser pela janela do navegador.

   ```powershell
   cd psychgen
   ```

Pronto: o projeto está em `Documentos\psychgen`.

> Da próxima vez que abrir o PowerShell, para voltar a essa pasta:
> `cd $HOME\Documents\psychgen`

---

## Passo 5 — Colocar sua chave da OpenAI

1. Ainda no PowerShell, dentro da pasta `psychgen`, cole:

   ```powershell
   Copy-Item .env.example .env
   ```

   Isso cria o arquivo de configuração a partir do modelo.

2. Abra esse arquivo no Bloco de Notas:

   ```powershell
   notepad .env
   ```

3. Procure a linha:

   ```
   OPENAI_API_KEY=
   ```

4. Cole sua chave logo depois do `=`, **sem espaços e sem aspas**. Deve ficar
   assim:

   ```
   OPENAI_API_KEY=sk-proj-AbCdEf123...
   ```

5. Salve (**Ctrl+S**) e feche o Bloco de Notas.

> **Segurança:** o arquivo `.env` nunca vai para o GitHub — o `.gitignore` o
> bloqueia. Sua chave fica só no seu computador. Nunca cole essa chave num
> chat, nem comigo: se precisar, me diga apenas "a chave está configurada".

---

## Passo 6 — Construir o sistema

Este é o passo demorado. O computador vai baixar e compilar os pacotes de R
(EGAnet, mirt, AIGENIE e outros).

**Vai levar de 30 a 60 minutos na primeira vez.** Nas próximas, segundos.

Cole este comando — ele constrói tudo e ao mesmo tempo salva um registro
completo no arquivo `build.log`, que é o que você vai me mandar se der errado:

```powershell
docker compose build r-engine 2>&1 | Tee-Object -FilePath build.log
```

Vão passar centenas de linhas de texto na tela. Isso é normal — é o R
instalando pacote por pacote. Deixe rodando e vá fazer outra coisa.

### Um bloco vermelho no início: pode ignorar

Logo nas primeiras linhas vai aparecer algo assim, em vermelho:

```
docker :  Image psychgen-r-engine Building
No linha:1 caractere:1
    + CategoryInfo          : NotSpecified: ( Image psychgen-r-engine Building :String)
    + FullyQualifiedErrorId : NativeCommandError
```

**Não é erro.** É uma implicância do PowerShell.

O Docker escreve as mensagens de progresso no canal de erros do sistema
(*stderr*) mesmo quando não são erros — é só onde ele decidiu escrever. O
trecho `2>&1` do comando junta esse canal com o normal para que tudo caia no
`build.log`. Ao ver algo chegando por ali, o PowerShell pinta de vermelho e
monta esse bloco de "NativeCommandError", mesmo o conteúdo sendo inofensivo.

Repare no que está escrito dentro dele: *"Image psychgen-r-engine Building"* —
o Docker avisando que começou a construir.

Só aparece uma vez. Se logo abaixo você vir `#1`, `#2`, `#3` avançando, está
tudo certo. O erro de verdade, se vier, aparece **no fim** e para o comando.

### Como saber se deu certo

No fim, você deve ver algo como:

```
>>> Instalação completa e verificada.
```

seguido de `naming to docker.io/library/psychgen-r-engine` ou `FINISHED`.

### Se der errado

Você vai ver a palavra **ERROR** e o comando vai parar. Não tem problema —
era esperado que pudesse acontecer, esta parte ainda não foi testada.

Faça o seguinte e me mande:

```powershell
Get-Content build.log -Tail 80
```

Copie tudo que aparecer e cole aqui no chat — ou, melhor ainda, **anexe o
arquivo `build.log`**, que está na pasta do projeto. Com isso eu corrijo e você
repete o passo 6. A segunda tentativa é bem mais rápida: reaproveita tudo que
já foi baixado.

> **Se o build falhar compilando um pacote do zero**, uma tentativa que
> costuma resolver antes mesmo de me perguntar: abra o `.env` (`notepad .env`),
> troque `R_VERSION=4.5.3` por `R_VERSION=4.6.1`, salve e rode o passo 6 de
> novo. Quase sempre o problema é uma versão do R velha demais para os pacotes
> daquele momento.

---

## Passo 7 — Ligar o sistema

Com a construção concluída:

```powershell
docker compose up -d
```

> No passo 6 você construiu **apenas a peça do R**, que é a demorada. Agora o
> Docker constrói as outras duas (o servidor e o site) automaticamente — mais
> uns 3 a 5 minutos, só na primeira vez.

Espere cerca de 1 minuto após o fim da construção. Depois confira se as quatro partes estão de pé:

```powershell
docker compose ps
```

Você deve ver quatro linhas — `psychgen_postgres`, `psychgen_r_engine`,
`psychgen_api`, `psychgen_web` — todas com **running** ou **healthy**.

Se alguma aparecer como `starting`, espere um minuto e rode o comando de novo:
o R leva um tempo para responder na primeira vez, e o servidor só sobe depois
que ele responder.

---

## Passo 8 — Abrir no navegador

Abra o navegador em:

**<http://localhost:5173>**

O painel do PsychGen BR deve aparecer, em português.

---

## Passo 9 — O primeiro teste de verdade

Este é o teste que responde a pergunta que ainda está em aberto: **o AI-GENIE
funciona bem em português brasileiro?** Ninguém sabe — o artigo só validou em
inglês, com amostras dos EUA.

1. No painel, crie um projeto novo.
2. Vá em **Executar AI-GENIE**.
3. Preencha, para um construto que você conheça bem (sugestão: algo em que você
   saiba reconhecer um item ruim de olho):
   - **Modo:** Gerar itens novos
   - **Título da escala**, **Domínio** e **População-alvo**
   - **Dimensões:** pelo menos uma, com **no mínimo 2 atributos** (um por linha)
   - **Itens por dimensão:** deixe em **60**
4. Confira o painel **Sintaxe R** à direita: ele mostra exatamente o código que
   vai rodar. Nada é escondido.
5. Clique em **Gerar e validar**.

Você será levado à tela do job, com o log ao vivo. **Vai demorar de 10 a 30
minutos** e vai consumir crédito da OpenAI (estimativa: US$ 1 a 5 por dimensão,
dependendo do modelo).

Ao final, o relatório vai mostrar: quantos itens entraram, quantos sobraram,
quantos a UVA removeu por redundância, quantos o bootEGA removeu por
instabilidade, e o NMI antes e depois.

**Me mande esses números.** São eles que dizem se o método se sustenta em
português — e, se sustentarem, são a primeira evidência que você leva para uma
editora.

---

## Comandos do dia a dia

Sempre a partir de `cd $HOME\Documents\psychgen`:

| O que você quer | Comando |
|---|---|
| Ligar o sistema | `docker compose up -d` |
| Desligar (preserva os dados) | `docker compose down` |
| Ver se está tudo de pé | `docker compose ps` |
| Ver o que o R está fazendo | `docker compose logs -f r-engine` |
| Pegar as atualizações que eu fizer | `git pull` |
| Recuperar espaço em disco (só imagens órfãs) | `docker image prune` |
| Reconstruir após um `git pull` | `docker compose up -d --build` |

Para sair de um log que fica rolando na tela: **Ctrl+C**.

> Sobre `docker image prune`: cada reconstrução deixa para trás a imagem
> anterior, sem nome, ocupando disco. Esse comando remove **apenas** essas
> órfãs — não toca no que está em uso nem em outros projetos. Evite a variante
> `docker image prune -a`, que é bem mais agressiva e apagaria imagens dos
> seus outros projetos também.

---

## Quando algo der errado

Não tente adivinhar. Rode o comando abaixo e me mande o resultado — é sempre a
forma mais rápida de eu descobrir o que houve:

```powershell
docker compose logs --tail 100
```

E me diga: o que você estava fazendo e o que apareceu na tela.

---

## O que este sistema faz — e o que não faz

Vale ter isso claro desde o começo, porque é o que você vai poder afirmar
diante de uma editora e do SATEPSI.

**Faz:** gera o pool de itens e produz **evidência de validade estrutural** —
dimensionalidade, redundância e estabilidade dos itens, tudo antes de coletar
um único dado empírico.

**Não faz:** não substitui a análise IRT de dificuldade e discriminação, nem as
evidências de conteúdo, de processo de resposta ou de relação com outras
variáveis. O próprio artigo do AI-GENIE delimita o escopo à "fase estrutural"
da validação.

Na prática, o valor é este: em vez de levar 300 itens a campo, você leva 80 já
filtrados. A coleta empírica continua necessária — só fica muito menor e mais
barata.
