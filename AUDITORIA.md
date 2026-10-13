# Auditoria do sistema - Laboratorio VR de Dados

Data: 2026-08-05 · Escopo: `index.html`, `app.js`, `styles.css`, `build-dados.js`,
`server.js`, `tests/`, pipeline de dados (CSV -> `dados.json`).

## 1. O que foi executado

| Verificacao | Resultado |
| --- | --- |
| `node --check` em todos os JS | 6/6 ok |
| `tests/logic-check.js` (70 contextos x 4 indicadores) | 0 falhas, 0 avisos |
| `tests/layout-check.js` (projecao de tela das 4 telas) | 0 falhas, 0 avisos |
| `tests/flow-check.js` (NOVO - jsdom, 92 checagens de fluxo) | 0 falhas, 0 erros de runtime |
| Regeracao de `dados.json` a partir do CSV | identico ao arquivo em disco |
| Recalculo dos 4 indicadores linha a linha vs. colunas oficiais do CSV (5.120 linhas) | diferenca maxima 0,005 pp (arredondamento) |
| Cruzamento de IDs HTML x `dom.*` x seletores | 138 IDs, 0 duplicados |
| Classes de clickable x `setInteractionMode` | 9 classes, 0 orfas |
| Classes/IDs do CSS sem uso | 0 |

`tests/smoke-test.js` (Chrome/Edge headless) **nao pode ser executado aqui** - precisa de
navegador instalado. Rode na sua maquina: `node .\tests\smoke-test.js`.

## 2. Achados corrigidos

### Alto

**A1. Botoes do tour invisiveis em metade das cenas.**
`#tourControls` (Anterior / progresso / Proximo) estava dentro de `#timelineView`. Como
`tourGoTo` esconde a timeline em toda cena que nao e grafico, os botoes sumiam nas cenas
de composicao, de indicadores e nos paineis de abertura/fechamento - continuavam
clicaveis (o raycaster mira pela classe, nao pela visibilidade), so nao dava para ve-los.
Na pratica, quem seguia o tour tinha de clicar no vazio ou usar as setas do teclado.
*Correcao:* os controles passaram para `#explorationWorld` (mesma posicao no mundo, agora
visiveis em todas as cenas). Detectado pelo `flow-check` em 11 cenas dos 3 tours.

**A2. Alvos invisiveis roubando clique/gaze.**
Alem dos controles, ficavam clicaveis enquanto ocultos: o CTA "Explore a sua regiao"
(`#tourCta`) nas cenas 2..5 de cada tour e a aba do mini-mapa durante os tours (a base e
escondida de proposito, mas a classe continuava ligada). Um clique perdido no CTA joga o
usuario de volta ao mapa no meio da narrativa.
*Correcao:* `toggleClickable` agora so liga `.clickable` se o elemento e todos os
ancestrais estiverem visiveis (`isEntityVisible`). E a regra que o `CLAUDE.md` ja pedia,
agora garantida pelo codigo.

### Medio

**M1. Legenda de narracao sempre vazia.**
`setCaption` escrevia em `dom.captionText`, mas `captionText` nao estava na lista de IDs
registrados - a variavel era `undefined`. Como havia um `if` protegendo, nao quebrava:
apenas mostrava a caixa preta **sem texto** durante a narracao (pior que nao mostrar).
*Correcao:* ID registrado.

**M2. Botao "Comparar" que nao compara.**
No contexto Brasil, `resolveCompareContext` devolve `null` (o Brasil e a propria
referencia), entao o botao existia, aceitava clique e so escrevia uma mensagem no HUD.
*Correcao:* `updateCompareButton` apaga o botao e escreve "Comparar (n/d)" quando nao ha
contexto de comparacao; a mensagem ficou explicativa ("escolha uma regiao para comparar").

**M3. Sair do tour pelo "Voltar" deixava o tour "meio ligado".**
`navigateBack` nao limpava `state.tourActive`, a barra de progresso 2D nem o painel de
texto. Dependendo da pilha de historico dava para cair numa tela de exploracao livre com
a barra do tour ainda na tela.
*Correcao:* `navigateBack` encerra o tour antes de desempilhar.

### Baixo

**B1. `bindBackButton` dependia de uma classe volatil.** Buscava `.clickable` (que
`setInteractionMode` liga/desliga) em vez de `.exploration-clickable`. Funcionava por
sorte da ordem de inicializacao; qualquer re-init quebrava com `TypeError`.
*Correcao:* passou a usar a classe de modo.

**B2. Cache do navegador.** `index.html` referenciava `app.js?v=10` e `styles.css?v=10`
desde antes das mudancas de layout. *Correcao:* subiu para `?v=12`.

**B3. Rotulos de % desenhados por cima do grafico.** `a-text` com `align: right` sem
`anchor: right` fica centrado na posicao, entao o rotulo "100%" avancava para dentro da
area das barras (timeline e composicao). *Correcao:* `anchor` explicito (mesma causa do
encavalamento no small multiples).

## 3. Recomendacoes aplicadas (2a rodada)

**R1. `state.transitioning` agora tem `try/finally`.** As seis funcoes async de navegacao
(`enterIndicators`, `enterDrill`, `enterMultiplos`, `returnToSelection`, `startTour`,
`tourGoTo`) marcavam a flag, davam `await fadeToBlack()` e so limpavam no fim: qualquer
excecao no meio deixava a flag em `true` para sempre e **travava o app sem erro visivel**
(todos os handlers checam `state.transitioning`). Agora a liberacao esta no `finally`.
Em `tourGoTo` e `enterMultiplos` quem libera e quem assumiu a transicao
(`assumiuTransicao` / `skipFade`), porque as duas tambem sao chamadas de dentro de outra.
*Teste de regressao:* o `flow-check` chama `enterIndicators` com um contexto invalido,
confirma que a excecao aconteceu e exige `state.transitioning === false` depois.

**R2. Codigo morto removido.** Sairam `buildContextCards`, `createContextCard`,
`onContextCardClick`, `contextosTopo`, `resetSelectionHeader` e `arcPositions` (a selecao
em cards de arco foi substituida pelo mapa), mais a entidade `#contextCards` do HTML e as
11 entradas de `dom.*` que nunca eram lidas (`contextCards`, `chartPanel`, `compGlow`,
`compPanel`, `compScrubber`, `focusRing`, `indicatorGlow`, `infoHint`, `mapPanel`,
`mapPrevAccent`, `miniMapPanel`). O bloco 4 do `logic-check`, que media a folga entre os
cards em arco, foi ajustado: testava uma tela que nao existe mais. Total: ~95 linhas.

**R3. Ramo `composicao` do `navigateBack` corrigido.** Ele chamava `enterComposicao()` sem
restaurar `state.context`, entao remontaria a tela com os dados do contexto atual.
*Teste de regressao:* o `flow-check` empilha uma entrada `composicao` de outra regiao,
clica em Voltar e exige que a tela abra com o contexto guardado.

Os dois testes novos foram validados ao contrario: revertendo cada correcao, o
`flow-check` acusa a falha correspondente; com a correcao, passa.

## 4. Achados NAO corrigidos (dependem de decisao sua)

**R4. Modo offline nao esta ativo.** `index.html` tenta `assets/aframe-1.5.0.min.js`, que
nao existe na pasta - toda sessao gera um 404 e cai no CDN. Se quiser apresentar sem
internet, baixe o arquivo; se nao, vale remover o `<script>` local para nao poluir o
console.

**R5. Faxina do repositorio.** Arquivos de trabalho versionados junto do app:
`dom-dump.html`, `chrome-errors.txt` (vazio), `preview*.png` (3 imagens de maio),
`assets/MapaBRnovo.png` (nao referenciado) e dois PDFs de outra disciplina em `assets/`.

**R6. `esperar`/timing dos testes.** O `flow-check` usa esperas fixas calibradas pelo
fade (650 ms + 680 ms). Se voce mexer na duracao das transicoes, ajuste as esperas.

**R7. Cache.** `index.html` ja esta em `?v=12` (subiu junto com as correcoes).

## 5. O que foi confirmado como saudavel

- **Dados.** O recalculo dos percentuais e do Indice de Eficiencia bate com as colunas
  oficiais do CSV em todas as 5.120 linhas (erro maximo de 0,005 pp, puro arredondamento).
  Isso valida as duas decisoes do `build-dados.js`: `matriculas = concluidos + evadidos +
  retidos` e a formula `conc% + (ret% x conc%) / (conc% + evas%)`, identica ao dicionario
  da PNP. Sem linhas duplicadas (ano+sigla+campus), 64 instituicoes, nenhuma sigla em duas
  regioes, 8 anos completos. Quatro instituicoes nao tem todos os anos (UFAL-ETA,
  UFMA-COLUN, UFPA-ETD, UFSM-CTISM) e caem corretamente em `null` -> "s/ dados".
- **Acessibilidade e navegacao.** Setas e Esc controlam o tour; `aria-label` nos paineis
  2D; narracao em `pt-BR`; aviso de inconsistencia do IFRS aparece nos cards do drill.
- **Interacao.** As 9 classes de clickable estao todas cobertas por `setInteractionMode`,
  sem classe orfa nem classe sem elemento; o mini-mapa nao troca contexto durante o tour.
- **CSS.** Nenhuma classe ou ID declarado sem uso, e vice-versa.
- **Servidor.** `server.js` ignora query string e bloqueia path traversal.

## 6. Como reproduzir

```powershell
node --check .\app.js
node .\tests\logic-check.js
node .\tests\layout-check.js
npm install --no-save jsdom   # so na primeira vez (dependencia de teste)
node .\tests\flow-check.js
node .\tests\smoke-test.js    # precisa de Chrome ou Edge
```
