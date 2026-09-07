# Guia de preenchimento — Estágio 1 (AI-GENIE)

Como escrever cada campo do formulário, e por quê. Escrito para quem entende de
psicometria e quer saber o que o método faz com cada informação.

Referências: Russell-Lasalandra, Christensen & Golino (2026), *Behavior Research
Methods* 58:217; e o código do pacote `AIGENIE` 2.1.x
(`create_system.role()`, `create_main.prompts()`).

---

## O campo que decide tudo: os atributos

Antes de qualquer coisa, é preciso entender uma decisão de desenho do método,
porque ela muda como se preenche o formulário inteiro.

**Os atributos não são só uma instrução de geração. Eles são o gabarito contra
o qual o método se mede.**

O NMI do AI-GENIE não compara as comunidades detectadas com as *dimensões* —
compara com os **atributos**. Cada item nasce marcado com o atributo que o
gerou; ao final, o EGA agrupa os itens pelos embeddings e o NMI pergunta:
"os itens que nasceram do mesmo atributo caíram na mesma comunidade?"

Duas consequências práticas:

1. **É um teste mais exigente** do que recuperar as dimensões amplas. O artigo
   diz isso explicitamente. Não estranhe NMIs abaixo de 100.

2. **Atributos semanticamente sobrepostos derrubam o NMI mesmo com itens
   ótimos.** Se você listar "ansioso" e "nervoso" como atributos distintos, o
   modelo vai gerar itens legítimos para os dois, os embeddings vão colocá-los
   no mesmo aglomerado — corretamente, porque são a mesma coisa — e o NMI vai
   registrar isso como erro. O problema não estava nos itens; estava no
   gabarito.

**Portanto:** escreva atributos que sejam *facetas conceitualmente distintas
dentro da mesma dimensão*. O teste que você deve aplicar antes de rodar é este:
*um juiz treinado, lendo um item isolado, conseguiria dizer de qual atributo
ele veio?* Se a resposta for não, funda os dois atributos em um só.

---

## Campo a campo

### Título da escala

Entra na construção do papel de sistema do LLM — é o contexto de "o que estamos
construindo".

Escreva o nome real que o instrumento teria, não um rótulo genérico. "Escala de
Ansiedade Acadêmica para Universitários" orienta melhor que "Teste 1".

### Domínio

Entra no papel de sistema e nos prompts. A documentação do pacote é explícita:
**específico funciona melhor que genérico.**

- Fraco: `psicologia`
- Bom: `psicologia educacional`
- Melhor: `avaliação psicoeducacional no ensino superior brasileiro`

O domínio é o que faz o modelo escolher entre o vocabulário clínico, o
organizacional e o educacional quando eles divergem.

### População-alvo

Também entra no papel de sistema. É o campo que mais afeta **registro
linguístico, vocabulário e pressupostos de experiência** dos itens.

Seja específico ao ponto de parecer excessivo:

- Fraco: `adultos`
- Bom: `estudantes universitários`
- Melhor: `estudantes de graduação de universidades públicas brasileiras, 18 a
  25 anos, primeira geração no ensino superior`

Cada qualificador aqui elimina uma classe de item inadequado. "Primeira geração"
faz o modelo evitar pressupor repertório acadêmico familiar; "brasileiras"
evita calcar em sistema de avaliação estrangeiro.

### Opções de resposta

Entram no papel de sistema, mas **não aparecem no texto dos itens**. Servem para
o modelo calibrar a forma da sentença.

Isso importa mais do que parece. Um item escrito para escala de concordância
("Eu me preocupo com as provas") tem forma diferente de um escrito para escala
de frequência ("Com que frequência você se preocupa com as provas"). Declarar as
opções evita gerar um pool que não encaixa no formato de resposta pretendido.

Escreva os rótulos reais que você usará, separados por vírgula:

```
discordo totalmente, discordo, nem concordo nem discordo, concordo, concordo totalmente
```

### Dimensão (tipo de item)

O nome da dimensão. Cada dimensão passa pelo pipeline **separadamente** por
padrão — geração, UVA, bootEGA e NMI são calculados por dimensão.

Use o nome teórico, não uma abreviação: `apreensão avaliativa`, não `AA`.

### Atributos

Ver a seção acima — é o campo mais consequente do formulário.

**Quantos:** o mínimo do pacote é 2. O artigo usou **4 por dimensão**, com 60 a
64 itens gerados por dimensão, ou seja, cerca de 15 itens por atributo antes da
redução. Essa proporção é uma boa referência.

**Como escrever:** adjetivos ou expressões curtas que nomeiam a faceta, não
frases. O prompt pede ao modelo dois itens por atributo a cada iteração, então o
atributo precisa ser algo que se possa "encarnar" num item.

- Bom: `antes da prova`, `durante a prova`, `ao receber a nota`
- Bom: `ansioso`, `inseguro`, `irritável`, `abatido`
- Ruim: `sentimentos negativos relacionados a situações de avaliação` (é uma
  definição, não uma faceta)

**Estratégias que costumam gerar atributos bem separados:**

- **Por momento/contexto** — antes, durante, depois; em casa, no trabalho
- **Por manifestação** — cognitiva, somática, comportamental
- **Por objeto** — medo de reprovar, medo de julgamento dos pares, medo de
  decepcionar a família
- **Por adjetivos de faceta** — o padrão do Big Five no artigo

Evite misturar duas estratégias na mesma dimensão: se um atributo é "somático"
e outro é "antes da prova", eles se cruzam em vez de se separar, e itens
legítimos vão pertencer aos dois.

### Definição conceitual (opcional, mas quase sempre vale)

Entra no prompt para dar clareza conceitual à dimensão. A documentação diz que é
**útil quando o construto é obscuro ou ambíguo** — o que, na prática, inclui
quase todo construto que não seja o Big Five.

É aqui que entra a sua **definição constitutiva**. Escreva-a como escreveria num
artigo: o que o construto é, o que o distingue de construtos vizinhos, e o que
ele explicitamente não inclui.

Exemplo:

> Apreensão avaliativa: reação de apreensão, tensão e preocupação antecipatória
> diante de situações de avaliação formal do desempenho acadêmico. Distingue-se
> da ansiedade-traço por ser situacionalmente circunscrita ao contexto de
> avaliação, e da ansiedade social por ter como objeto o julgamento do
> desempenho, não o julgamento da pessoa. Não inclui a evitação comportamental
> das situações de avaliação, que constitui dimensão à parte.

Essa última frase — o que **não** inclui — é a que mais trabalha, porque é ela
que impede o modelo de invadir a dimensão vizinha e derrubar o NMI de ambas.

### Instruções adicionais

Anexadas ao fim do prompt. A documentação pede que sejam **breves**.

Use para regras de forma que valham para todos os itens:

```
Todos os itens devem ser afirmações em primeira pessoa, no presente, com no
máximo 20 palavras. Não use dupla negação. Não use termos técnicos de
psicologia. Cada item deve conter uma única ideia.
```

Não use este campo para explicar o construto — isso é papel da definição
conceitual.

### Papel de sistema (deixe vazio)

**Atenção:** se preenchido, ele é usado *como está* e **descarta** domínio,
público-alvo e opções de resposta na construção da persona. Você perde tudo que
preencheu acima.

Deixe vazio, salvo se quiser assumir controle total da persona — e, nesse caso,
repita ali dentro o que os outros campos diriam.

### Itens-âncora (opcional)

Servem de molde de estilo e registro. A documentação é enfática: **use itens de
alta qualidade e validados**, porque eles são copiados como padrão de forma.

É por aqui que entram os itens de um instrumento existente quando o objetivo é
gerar uma forma paralela. Para geração do zero, meia dúzia de itens bem escritos
já ancora o estilo.

Cada item-âncora exige o atributo e a dimensão a que pertence — e esses nomes
precisam bater exatamente com os que você declarou acima.

---

## Exemplo completo

Um preenchimento que atende a tudo acima:

| Campo | Conteúdo |
|---|---|
| Título | Escala de Ansiedade Acadêmica para Universitários |
| Domínio | avaliação psicoeducacional no ensino superior brasileiro |
| População-alvo | estudantes de graduação de universidades públicas brasileiras, 18 a 25 anos |
| Opções de resposta | discordo totalmente, discordo, nem concordo nem discordo, concordo, concordo totalmente |

**Dimensão 1 — apreensão avaliativa**

Atributos: `preocupação antecipatória` · `tensão somática` · `pensamentos de fracasso` · `dificuldade de concentração`

Definição: *Reação de apreensão e tensão diante de situações de avaliação formal
do desempenho acadêmico. Distingue-se da ansiedade-traço por ser
situacionalmente circunscrita ao contexto de avaliação, e da ansiedade social
por ter como objeto o julgamento do desempenho, não da pessoa. Não inclui a
evitação comportamental das situações de avaliação.*

**Dimensão 2 — evitação acadêmica**

Atributos: `adiamento de tarefas` · `esquiva de exposição oral` · `abandono de disciplinas` · `busca de justificativas`

Definição: *Padrão comportamental de afastamento de situações acadêmicas
avaliativas ou potencialmente avaliativas. Refere-se à ação observável de
evitar, não ao estado afetivo que a antecede.*

**Instruções adicionais:** *Afirmações em primeira pessoa, presente, máximo 20
palavras, uma única ideia por item, sem dupla negação e sem jargão técnico.*

Note como as duas definições se delimitam mutuamente: a primeira exclui a
evitação, a segunda exclui o afeto. É isso que mantém as dimensões separadas nos
embeddings.

---

## Checklist antes de rodar

- [ ] Cada dimensão tem 3 ou 4 atributos, e nenhum par é quase-sinônimo
- [ ] Um juiz leria um item e saberia de qual atributo veio
- [ ] As definições dizem o que o construto **não** é, e delimitam as dimensões
      vizinhas
- [ ] A população-alvo tem pelo menos três qualificadores
- [ ] As opções de resposta são as reais do instrumento
- [ ] O papel de sistema está **vazio**
- [ ] `targetN` ≥ 60 por dimensão (cerca de 15 por atributo)
- [ ] O painel de sintaxe R à direita mostra tudo o que você escreveu

---

## Como ler o resultado

Ao final, o relatório traz por dimensão:

- **NMI inicial → NMI final.** O final deve empatar ou superar o inicial. Se
  cair, a redução tirou itens que sustentavam a estrutura — geralmente sinal de
  `targetN` baixo demais.
- **Itens removidos pela UVA.** Redundância semântica. Muitos, com `targetN`
  alto, é normal e desejável.
- **Itens removidos pelo bootEGA.** Instabilidade. Muitos aqui sugerem
  atributos mal separados.
- **NMI final baixo (< 80) com poucos itens removidos.** Suspeite do gabarito,
  não dos itens: provavelmente há atributos sobrepostos.

E, acima de qualquer número: **leia os itens**. O NMI mede coerência estrutural,
não qualidade de conteúdo. Um pool pode ter NMI 100 e itens ruins.
