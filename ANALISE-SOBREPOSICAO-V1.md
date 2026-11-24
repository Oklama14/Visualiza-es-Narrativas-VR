# Nada em cima de nada - versao 1 (a do mapa do Brasil)

Data: 2026-10-16 · Escopo: raiz do projeto (`index.html`, `app.js`, `styles.css`,
`tests/`). A mesma revisao feita na versao minimalista (`piloto-v1.1`), agora na versao 1.

## 1. Como foi medido

Novo teste `tests/sobreposicao.js` (Playwright), adaptado do `tests/sobreposicao.js` da
minimalista para as etapas desta versao. Ele leva o app, sem fades nem animacoes, a
3.300 estados:

| Etapa | Estados |
| --- | --- |
| Mapa | parado + cartao de cada uma das 5 regioes |
| Drill | as 5 regioes |
| Indicadores | 70 contextos (Brasil, 5 regioes, 64 instituicoes), sem e com o painel de cada medidor, e com o mini-mapa aberto |
| Linha do tempo | 70 contextos x 4 indicadores x 8 anos, com a comparacao ligada |
| Abertura guiada | momento a momento (Brasil e 5 regioes x 4 indicadores) |
| Composicao | 70 contextos x 8 anos |
| Comparar regioes | 4 indicadores |
| Tours | as 18 cenas dos 3 tours |

Em cada estado, do ponto de vista da camera (0 1,6 0):

1. **mesma superficie** - texto sobre texto, texto sobre blocos, texto que sai do proprio
   fundo, texto coberto por um plano a frente, cartao do grafico cobrindo a linha/um ponto;
2. **na tela** - letras de um texto no mesmo lugar da imagem que as letras de outro;
3. **olhar** - raios do olho ate as letras de cada texto: o que fica na frente (texto
   tapado) e o que fica logo atras (texto desenhado em cima de uma linha, anel, ponto);
4. **ordem de desenho** - texto ou marca de dado APAGADO por um plano translucido (ou um
   hitbox invisivel) que fica na frente, e desenhado antes e grava profundidade;
5. **HUD 2D** - o DOM medido de verdade em 1920x1080, 1366x768 e 1280x650 contra a cena
   projetada: texto ou alvo clicavel atras do painel/nota/legenda, paineis um sobre o outro,
   texto cortado pela borda da janela;
6. **VR** - HUD de VR e legenda (presos a cabeca, por cima de tudo) um sobre o outro;
7. letra que a fonte nao tem (some sem aviso), rotulo de uma linha que quebrou, posicao NaN.

Resultado: **antes 127 problemas distintos (mais 14 avisos), depois 0**. Os demais testes:
`logic-check` 0 falhas; `layout-check` 0 falhas (atualizado para a nova geometria);
`flow-check` 0 falhas (92 passos); `smoke-test` concluido com sucesso; `quest-sim` (Quest 2
emulado, internet bloqueada) tudo verde, console limpo.

## 2. O que estava em cima do que (e foi corrigido)

### Alto - conteudo que nao aparecia

**S1. A manchete e o texto da linha do tempo nunca apareciam.** O brilho atras do grafico
(`#chartGlow`, circulo translucido de raio 4 m) era desenhado ANTES deles e gravava
profundidade: a manchete, 0,2 m atras dele, falhava no teste de profundidade. O A-Frame 1.5
desenha os transparentes na ordem da cena (`sortTransparentObjects: false`). O mesmo apagava o
titulo e o texto da composicao (`#compGlow`). Correcao: `sortTransparentObjects: true` no
renderer e `depthWrite: false` em todo plano translucido decorativo (brilhos, aneis do piso,
faixa de foco, barras de 0,18).

**S2. Comparar regioes: as linhas dos mini-graficos nunca apareciam (so os pontos).** O
hitbox invisivel de cada painel (opacidade 0,001, na frente) era criado antes das linhas e
gravava profundidade. Correcao: `depthWrite: false` em todos os hitboxes invisiveis. (Com a
ordenacao por distancia, os hitboxes dos medidores passavam a apagar o numero e o arco - o
mesmo `depthWrite: false` resolve os dois.)

**S3. A linha de tendencia, os aneis dos marcadores e a linha de comparacao sumiam dentro
das barras** (barras translucidas de 0,18 desenhadas antes, gravando profundidade). Mesma
correcao.

**S4. Os controles de ano (`<  2024  >`) ficavam atras da nota "Como ler"** em todas as
janelas, e o comeco da fileira de acoes tambem. A nota agora abre ao entrar em cada etapa e
se recolhe sozinha num chip ("Como ler esta visualizacao +") depois de 10 s - a ideia do
`is-dimmed` da minimalista; o mouse por cima abre de novo; aberta sozinha ela deixa o clique
passar.

**S5. "Voltar" metade fora da tela** (a esquerda, em 16:9) e o resto atras do painel do HUD;
o mesmo com "< Regioes" do drill. Os dois foram para o canto superior DIREITO.

**S6. Letras que sumiam.** A fonte kelsonsans so tem ASCII: "IF SERT O-PE", "UFRN - M SICA",
"Educa  o Tecnol gica", "2020  Pandemia", "A Rede Federal forma  e tambem perde ", "›" na
trilha de VR, e os icones ◉ ▲ ⇄ dos cards do tour nunca apareceram. A versao 1 agora usa a
**fonte local da minimalista** (Poppins MSDF, Latin-1 completo) com `line-height: 60`, que
mantem a altura de linha da kelsonsans. De quebra, o texto 3D deixa de depender de internet
(antes, sem cdn.aframe.io, todo texto 3D sumia - inclusive no Quest).

**S7. As 100 esferas do fechamento do tour nunca apareciam** (posicao NaN): o utilitario de
posicao escrevia `"x: 1; y: 2; z: 3"`, que o A-Frame le como `{NaN, 1, NaN}`. Mesma
correcao da minimalista: `"x y z"`.

### Medio - texto em cima de texto ou de dado

**S8. Rotulo do ano em foco (`valueReadout`)** caia em cima do cartao "Melhor ano", do
"75%" do eixo (em 2017) e dos pontos da comparacao. **Cartoes de pico/vale** cobriam a linha
e os pontos, e os dois se encavalavam quando pico e vale caiam em anos vizinhos. Agora os
dois usam `posicionarNoGrafico`, porte do `posicionarCartoes` da minimalista: lugar livre
mais perto do ponto, sem cobrir linha, pontos, comparacao (mesmo desligada), a etiqueta 2020
nem o outro cartao. Cartoes um pouco menores e a frente das esferas.

**S9. A dica da abertura guiada** ("Explore: navegue pelos anos...") tinha 2 linhas de letra
grande e descia em cima de Comparar/Narrar/Reproduzir e do "Pular introducao". Agora 1 linha.

**S10. A legenda da narracao** (3D, presa a camera) ficava no meio da tela, em cima da
linha do ano e da dica. No desktop ela virou uma barra 2D no rodape (`#legenda2d`); em VR
continua 3D, com as medidas da minimalista (0,92 m, 46 colunas, -0,36: as pontas nao vao
para a borda borrada da lente), e o HUD de VR se esconde enquanto ela aparece - antes a
legenda cobria a trilha do HUD de VR.

**S11. HUD de VR:** o corpo da nota (5-6 linhas, centrado) subia em cima do titulo e saia
do fundo; a trilha (1,7 m) era mais larga que o fundo (1,46 m). Fundo mais alto, corpo preso
pelo topo, trilha da largura do fundo.

**S12. Etiqueta "2020 · Pandemia"** acima do grafico, na tela, encostava na 2a linha do
texto da narrativa (e na 3a linha ficava por tras do topo do painel). Cabecalho preso pelo
topo, mais estreito, e etiqueta entre o 100% e o topo do painel.

**S13. Painel do HUD (420 px) cobria a ponta esquerda dos titulos 3D** em 1366 px
("Olhe para uma regiao", a manchete, o titulo da composicao, o chip "Conclusao" do
painel-equacao) e a **legenda da comparacao ficava em cima do painel** quando o subtitulo
tinha 2 linhas. Painel com no maximo 24vw/330 px, painel + legendas empilhados (`.hud-left`,
como na minimalista), versao compacta em janelas baixas, sigla da instituicao no titulo e na
trilha do HUD; titulos 3D com largura <= 4,8 a ~3,9 m.

**S14. Medidores:** a haste atravessava o meio do rotulo ("Taxa de Evasao" cortado por
uma barra) e "Eficiencia Academica" quebrava em 2 linhas encostando no arco. Haste ate logo
abaixo do rotulo; rotulo em 1 linha.

**S15. Composicao:** a primeira torre tapava os rotulos 0-100% do eixo; "1.234.567
matriculas" passava do furo do anel. Rotulos a frente e mais a esquerda; numero e
"matriculas" em 2 linhas.

**S16. Tour:** na cena de composicao o seletor de ano e "Indicadores" ficavam por baixo de
"Proximo >"; na cena de indicadores, "Para onde vao os alunos" ficava em cima do "5 / 6".
No tour a faixa de baixo e so dos controles do tour. No painel de abertura, o titulo de 3
linhas subia em cima do kicker (agora 2 linhas, preso pelo topo).

**S17. Cards do drill:** o bloco de texto (1,6 m) era mais largo que o card (1,08 m):
siglas longas passavam da borda e encostavam no nome do card vizinho.

**S18. Mini-mapa aberto** ficava ATRAS do medidor da direita (o botao "Visao Nacional"
tapado). Ao abrir, ele vem para a frente (z -2,3) - posicoes em `MINI_MAPA` (app.js).

**S19. O anel do pedestal se levantava ao girar.** A animacao `to: -90 360 0` girava em Y
antes do -90 em X (ordem XYZ do Euler): o anel ficava em pe e varria, ate ~0,5 m de altura,
por tras dos rotulos dos medidores (os "arcos" em pe nos prints de antes). Agora gira em
torno da propria normal, deitado no piso.

### Baixo

- Barra do tour (2D) por baixo do botao VR do A-Frame - foi para a esquerda dele.
- Titulo do mini-mapa em cima da borda do painel; cartao da regiao no mapa com a ponta
  direita fora da tela em 16:9; painel de luz do teto logo atras dos titulos do topo.
- Titulo do contexto (instituicoes de nome longo) quebrava em 2 linhas sobre o texto-guia:
  `textoUmaLinha` diminui a letra em vez de quebrar.

### Encontrados no caminho (nao eram sobreposicao, mas sao textos errados)

- **Composicao: a 1a linha do readout ficava sempre com os numeros do ano de entrada**
  (2024) - o conectivo relia o texto do a-text, que ainda devolvia o valor anterior. Agora a
  linha e montada de uma vez (`compReadoutText`).
- O titulo do HUD 2D ficava com o da tela anterior ("Escolha uma regiao", ou a regiao do
  drill quando se escolhia uma instituicao). Agora acompanha o contexto.

## 3. O que veio da versao minimalista

| Da minimalista | Na versao 1 |
| --- | --- |
| Fonte local Poppins MSDF (offline, com acento) + `shader: msdf; negate: false` | S6 |
| `setVectorAttribute` com `"x y z"` (correcao do NaN) | S7 |
| `posicionarCartoes` (cartao no lugar livre perto do ponto) | S8 |
| Nota "Como ler" que se recolhe (`is-dimmed`) | S4 |
| Coluna `.hud-left` (painel + legendas empilhados) | S13 |
| Legenda de VR: 0,92 m, 46 colunas, -0,36 | S10 |
| Rotulos `data-linha-unica` conferidos no teste | `textoUmaLinha` + teste |
| `tests/sobreposicao.js` | adaptado as etapas desta versao |
| Piso no `fwidth` do shader msdf (`05-headset.js` da minimalista) | `headset.js` (2026-10-18) |

Acrescentado em 2026-10-18, ao tirar os prints de strollytelling em 1920x1080: as letras
tinham pontinhos e blocos claros em volta (miolo do "O", cantos de cada letra). Era a divisao
por `fwidth = 0` do shader msdf do A-Frame, que a minimalista ja corrigia e tinha ficado de
fora daqui. Com a correcao o texto sai limpo; os prints de comparacao (lado "depois") foram
refeitos com ela.

Fica como sugestao (nao feito aqui): acentuar os textos fixos do app.js - a fonte ja tem os
acentos (a minimalista usa um mapa `ACENTOS` na camada de exibicao para os rotulos do
`dados.json`).

## 4. O que fica, de proposito (avisos do teste, nao falhas)

- **Nota "Como ler" aberta** nos primeiros 10 s de cada etapa cobre o canto inferior
  esquerdo (controles de ano, medidor da esquerda, "< Anterior"); nesse tempo ela deixa o
  clique passar, e na linha do tempo os controles so aparecem depois da abertura guiada.
- **Mini-mapa aberto** cobre a direita do grafico/medidor: e um painel que a pessoa abriu.
- **VR, olhando para a frente:** o HUD de VR e a legenda ficam presos a cabeca na faixa de
  baixo (15-35 graus abaixo do centro) e escondem o que estiver ali naquele instante (a
  pessoa olha para baixo e o que estava atras sobe para o meio da vista).
- A placa de controles da sala (`#roomSign`) fica de lado (para quem esta em VR) e sai pela
  borda da janela no desktop.
- Os botoes da faixa de baixo ficam na frente dos pedestais dos medidores (decorativos).

## 5. Como rodar

```powershell
npm i -D playwright
node .\tests\sobreposicao.js --rapido     # ~5 min: Brasil, regioes e 6 instituicoes de nome longo
node .\tests\sobreposicao.js              # ~25 min: tudo
node .\tests\sobreposicao.js --json r.json
```

Prints do antes/depois (1366x768): `Claude outputs/sobreposicao-v1-2026-10-16/`. No "antes"
o texto 3D aparece com uma fonte aproximada (o print foi feito sem acesso ao cdn.aframe.io),
mas com as metricas exatas da kelsonsans - a posicao e o tamanho de cada texto sao os reais.
O "depois" mostra a nota "Como ler" recolhida (o repouso); `depois-08b` mostra ela aberta,
nos primeiros 10 s da etapa.
