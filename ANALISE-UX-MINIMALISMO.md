# Analise UX e Minimalismo — Laboratorio VR de Dados

Diagnostico do artefato a luz do artigo (WTD IHC 2026): strollytelling, Martini Glass,
visceralizacao por voxels e narrativa de dados imersiva para publico leigo.

---

## 1. O que esta bem feito (manter)

- **Martini Glass real na timeline**: abertura guiada ano a ano com `guidedToken` para
  cancelamento seguro, depois exploracao livre. E a estrutura do Segel & Heer aplicada
  corretamente.
- **Integridade estatistica**: reagregar contagens brutas em vez de mediar percentuais
  (`build-dados.js`) e a regra "nenhuma afirmacao fixa, tudo vem dos dados" sao pontos
  fortes metodologicos raros em prototipos.
- **Disciplina de interacao**: `setInteractionMode` + classes por modo evita cliques
  fantasmas; `bindDragGuard` evita cliques acidentais; sala como ancora espacial
  (Liu et al. 2024) esta bem justificada.
- **Testes**: smoke-test com CDP + logic-check de 70 contextos e algo que quase nenhum
  artefato academico tem. Preserve.

---

## 2. Desalinhamentos entre artigo e artefato (prioridade maxima)

Estes importam mais que qualquer polimento visual, porque o artefato e o instrumento
da pesquisa. Hoje o app e, na pratica, um "slideshow 3D": o usuario fica parado em
`0 1.6 0` e o mundo troca na frente dele com fade.

### 2.1 Strollytelling nao existe no artefato
O artigo apresenta o strollytelling (avanco da historia pelo deslocamento fisico) como
fundamento central. Mas toda transicao teleporta a camera de volta para `0 1.6 0`
(5 pontos no codigo) e nenhuma etapa usa a posicao do corpo como input. `wasd-controls`
esta ativo e nao serve para nada narrativo.

**Recomendacao barata e de alto impacto**: na linha do tempo, mapear a posicao X da
camera para o ano em foco (o helper `xFor(i)` ja existe — basta o inverso). Andar ao
longo do eixo = percorrer 2017-2024. No desktop, WASD; em VR, passos reais. Os botoes
`<` `>` viram fallback e a tese ganha sua demonstracao literal.

**Versao ambiciosa**: transformar as etapas em estacoes espaciais (mapa -> indicadores
-> timeline -> composicao dispostos na sala) e o deslocamento entre elas substitui o
fade-to-black. Menos transicao artificial, mais memoria espacial.

### 2.2 A visceralizacao (voxels) esta escondida no lugar errado
O artigo afirma como "inovacao estrutural" a representacao por voxels (1 bloco = 1% do
contingente). No codigo, o mais proximo disso e `buildVisceralParticles` (100 esferas)
— que so aparece **dentro do tour guiado**. O leitor em exploracao livre nunca ve a
inovacao central da pesquisa; a composicao usa barras empilhadas, que sao um grafico 2D
flutuando em 3D.

**Recomendacao**: promover a visualizacao por unidades (100 blocos = 100 estudantes) a
representacao principal da etapa "Para onde vao os alunos", substituindo o donut (que
hoje duplica a informacao da barra do ano em foco — codificacao redundante). Isso
alinha artefato e artigo *e* remove um elemento de tela. Esferas -> blocos empilhados
fortalece a metafora "materia virtual tatil" do texto.

### 2.3 O HUD 2D nao existe em VR (confundidor do estudo)
`brand-panel`, `nota-panel` ("Como ler esta visualizacao"), breadcrumb, legendas e
tour-bar sao overlays DOM — invisiveis no headset. O participante VR do estudo perde
exatamente o scaffolding interpretativo que o participante desktop recebe. Para uma
pesquisa que compara compreensao entre condicoes, isso e um vies.
**Recomendacao**: o essencial das notas vira ou (a) painel curto no mundo 3D, ou
(b) narracao (ja existe `captionPanel` acoplado a camera — e o unico HUD que funciona
em VR; use-o como padrao).

---

## 3. Bugs e incoerencias de UX

1. **Mouse-look quebrado + instrucoes contraditorias.** `dismissOnboarding` tenta
   reativar o giro do mouse com `dom.scene.setAttribute("look-controls", ...)` — mas
   `look-controls` esta na **camera** (`#camera`), nao na cena. O atributo na cena nao
   faz nada; o mouse-look permanece desativado. Enquanto isso, o onboarding e a placa
   da sala dizem "arraste com o mouse para olhar ao redor". O usuario desktop recebe
   uma instrucao que nao funciona. Decida um dos dois caminhos e alinhe codigo + textos:
   habilitar drag-look no `#camera` (mantendo o dragGuard) ou assumir a visao fixa e
   corrigir os 3 textos (onboarding, roomSign, comentario na linha 2909).

2. **Gaze fuse vs. painel de hover.** Em VR, fixar o olhar num gauge por 850 ms dispara
   o clique (fuse). Mas o painel interpretativo aparece no *hover* — ou seja, e
   impossivel ler o painel sem ser levado a timeline. Padrao recomendado: o primeiro
   dwell abre o painel; a navegacao exige dwell num alvo separado ("Ver linha do
   tempo"), que ja existe como texto (`infoHint`) mas nao como alvo.

3. **Codigo morto**: `buildContextCards`/`createContextCard`/`arcPositions` +
   `#contextCards` (legado, nunca chamados); `buildGuidedQuestions` nunca constroi nada
   porque nenhuma cena de TOURS define `perguntas` (ou remova, ou implemente — as
   perguntas-guia dariam agencia real ao tour); arquivos `dom-dump.html`,
   `chrome-errors.txt`, `preview*.png` no repositorio.

---

## 4. Minimalismo: onde cortar

O principio norteador: **um foco por cena, texto sob demanda, decoracao so quando
codifica dado ou ancora o espaco** (data-ink ratio de Tufte, adaptado a VR).

### 4.1 Tela inicial: de ~12 alvos para 2 decisoes
Hoje o primeiro contato apresenta: mapa + 5 hotspots, botao Brasil, botao Comparar,
3 cards de tour, placa de controles, kicker/titulo 3D, HUD com breadcrumb, nota-panel,
botao "?", vinheta. Para publico leigo, e paralisia de escolha — e contradiz o Martini
Glass, que manda comecar guiado.

Proposta: a experiencia abre com **uma** pergunta — "Ver a historia" (tour Panorama,
caminho autor) ou "Explorar" (mapa, caminho leitor). Os 3 tours viram submenu de
"historias"; "Comparar regioes" e descoberto dentro da exploracao (ou vira cena final
do tour Abismo, onde ja faz sentido narrativo). O funil fica: 1 decisao -> historia ->
CTA "explore sua regiao" (que ja existe no fechamento dos tours).

### 4.2 Uma superficie de texto por vez
Na timeline convivem ate 7 camadas de texto: manchete, corpo narrativo, readout do ano,
guidedHint, nota-panel, HUD title/subtitle, legenda. A manchete narrativa deveria ser a
protagonista unica; readout do ano aparece so durante interacao; a nota vira narracao
ou painel sob demanda ("?" espacial). Regra pratica: se dois blocos de texto competem
a mais de 60 caracteres cada, um deles vira progressive disclosure.

### 4.3 Controles da timeline: de 8 alvos para 4
`< ano >` + Comparar + Narrar + Reproduzir + Indicadores + Pular + Voltar global +
mini-mapa. Com strollytelling (item 2.1), `< >` somem ou viram fallback discreto.
"Reproduzir" pode morar na manchete ("replay" e uma acao sobre a historia, nao um botao
de barra). Sobram: Comparar, Narrar, e uma unica saida de navegacao consistente.

### 4.4 Navegacao: um padrao de "voltar", nao quatro
Hoje: "< Regioes" (drill), "Voltar" (global), "Indicadores" (timeline/composicao),
"Trocar regiao" (mini-mapa), Esc (tour). Ja existe pilha `history`/`navigateBack` —
use-a como unico mecanismo, com um unico botao, sempre no mesmo lugar, com rotulo
dinamico ("< Indicadores", "< Mapa"). O mini-mapa pode absorver o papel de breadcrumb
espacial.

### 4.5 Decoracao que compete com os dados
Cortar sem perda: aneis girantes dos pedestais (animacao de 18s que chama atencao sem
significado), pulso do `focusRing`, segundo anel do piso em cada mundo, painel de luz
do teto. Manter: a sala (ancora espacial justificada), o spotlight na cor do indicador
(reforca codificacao), fog (profundidade). A vinheta 2D e dispensavel — VR ja tem
vinheta natural do headset e no desktop ela so escurece a UI.

### 4.6 Audio: dois canais, nao tres
Drone ambiente + notas de dados + fala sintetica simultaneos e sobrecarga. A
sonificacao por notas (na abertura guiada) e a fala se reforcam; o drone continuo
compete com a fala e cansa em sessoes de estudo. Sugestao: drone so em transicoes ou
remove-lo; e um "mute" visivel (participante de estudo precisa de controle).

---

## 5. Estrutura de codigo (saude a longo prazo)

- `app.js` com 3.430 linhas e ~100 ids no `dom{}` e o maior risco de manutencao.
  Sem quebrar a restricao "sem frameworks": dividir em modulos ES nativos
  (`data.js`, `narrative.js`, `stages/…`, `interaction.js`, `audio.js`) com
  `<script type="module">`. A-Frame continua sendo a unica biblioteca.
- Flags espalhadas (`stage`, `tourActive`, `guided`, `transitioning`, `miniMapOpen`,
  `compareOn`) pedem uma maquina de estados explicita — os guards `if (state.transitioning)`
  repetidos em cada handler sao o sintoma.
- Atualizar o smoke-test junto com qualquer corte (ele hoje verifica varios elementos
  que a simplificacao removeria — o teste deve seguir o design, nao trava-lo).

---

## 6. Ordem sugerida de ataque

| # | Acao | Esforco | Impacto |
|---|------|---------|---------|
| 1 | Corrigir mouse-look (elemento errado) e alinhar textos de instrucao | baixo | alto |
| 2 | Resolver conflito gaze-fuse vs. painel de hover | baixo | alto (VR) |
| 3 | Voxels/unidades como visualizacao principal da composicao (substituir donut) | medio | alto (tese) |
| 4 | Strollytelling na timeline (posicao X -> ano) | medio | alto (tese) |
| 5 | Tela inicial em 2 decisoes (historia vs. explorar) | medio | alto |
| 6 | Notas essenciais visiveis em VR (captionPanel/painel 3D) | baixo | alto (estudo) |
| 7 | Unificar "voltar" via pilha history | baixo | medio |
| 8 | Cortar decoracao e reduzir camadas de texto | baixo | medio |
| 9 | Remover codigo morto e arquivos soltos | baixo | baixo |
| 10 | Modularizar app.js | alto | medio |

Itens 1-2 sao correcoes; 3-6 alinham o artefato ao artigo antes da pesquisa com
usuarios (set/2026) — o que importa, ja que o artefato e o instrumento do estudo.
