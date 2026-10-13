# Revisão da versão minimalista — julho/2026

Auditoria dos 20 módulos `js/`, do `index.html` e do `styles.css`. O
`logic-check` passava, mas não cobria nenhum dos problemas abaixo — três deles
inclusive quebrariam o `smoke-estacoes.js` na sua máquina.

Todas as correções foram aplicadas. `node tests/logic-check.js` continua verde,
agora com 4 verificações novas (S6b, S11, S12 e a regra da zona retangular).

---

## P0 — bugs funcionais

### 1. Todas as legendas 3D estavam mudas

`setCaption()` escreve em `dom.captionText`, mas `captionText` nunca entrou no
array `ids` de `04-boot.js` — ou seja, `dom.captionText` era `undefined` e a
função inteira era um no-op.

O que estava invisível: os textos da abertura guiada (o Martini Glass ficava
sem narração desde que a voz sintética foi removida), as dicas de pré-requisito
das estações, o eco das notas "como ler" em VR e as perguntas das tarefas do
modo estudo.

**Correção:** `captionText` registrado. De quebra, a placa da legenda subiu de
0,16 para 0,36 de altura — com o texto voltando, 2-3 linhas vazavam do fundo.
**Guarda:** novo check S11 compara o array `ids[]` com os `id=` do HTML e com
todos os `dom.X` usados nos módulos.

### 2. Corredor do Tempo travava e deixava a sala vazia

`stTimeline` tinha `radius: 2.2; hysteresis: 2.2` — ou seja, só emitia
`station-leave` a 4,4 m do centro. As estações Composição e Comparação estão a
4,24 m. Resultado: ao ir do corredor para uma delas, o corredor nunca "saía", e
voltar caminhando não disparava `station-enter` — a cena não reativava e o
visitante ficava numa sala vazia.

**Correção:** o componente `station` ganhou zona **retangular** opcional
(`halfX`/`halfZ`), usada só pelo corredor (`halfX: 3.4; halfZ: 1.4`): cobre os
6 m de caminhada sem invadir as vizinhas. Some-se a isso:

- `resyncStations()` reavalia todas as zonas depois de um teleporte;
- arbitragem **"a mais próxima entre as zonas em que o visitante está"**
  (`nearestStationId`), então sobreposição de zonas deixou de ser um problema;
- Composição/Comparação passaram de raio 1,8 para 1,3, para não capturarem quem
  está na ponta da faixa de anos.

Verificado por simulação: nos 8 pontos da faixa (2017→2024) e nos 6 pontos de
observação, sempre vence a estação certa.

### 3. "Comparar regiões" apagava o contexto escolhido

`enterMultiplos()` fazia `state.context = null`. Depois disso, caminhar de volta
para Indicadores / Corredor / Composição só mostrava *"Escolha um contexto no
Mapa do Brasil"*, e o `navigateBack()` de volta para a composição estourava em
`lastYearWithMatriculas(null)`.

**Correção:** o contexto é ignorado nessa etapa, não apagado. `onStationEnter`
também restaura o mini-mapa e esconde a vista de comparação ao sair.

### 4. Galeria de histórias sobreposta aos cards da home

A galeria e a home dividem a estação Início. `showHome()` chamava
`hideHomeSubviews()`, mas `showMapSelection()` e `openDrill()` não — então ir da
galeria para o mapa deixava os 3 cards de história por cima dos 2 cards da home.

**Correção:** `hideHomeSubviews()` nas três saídas.

### 5. Cards do drill-down atravessando a parede

A grade plana (6 colunas × 1,25 m = 7,5 m de largura, a 4,2 m) somada à rotação
de 40° da estação Mapa jogava as pontas em **x = −8,99** — a parede esquerda
está em −8,5. Os cards das instituições das pontas ficavam atrás da parede, e o
outro extremo caía em cima da estação Composição.

**Correção:** nova `arcPositions()` — arco de raio 3,4 m, ±48°, cards virados
para quem olha. Nordeste (a maior região, 24 cards) agora ocupa
**x −7,30 a −3,43 / z −2,47 a 0,78**, tudo dentro da sala e dentro do campo de
visão. Os botões `exploreBack` e `drillBack` também estavam fora (−8,90 e −8,84)
e foram trazidos para dentro.
**Guarda:** novo check S6b projeta os 24 cards no mundo e falha se algum sair da
sala ou ficar abaixo do piso.

---

## P1 — sobreposições de texto e layout

### 6. Small multiples: o "%" de um painel em cima do nome do vizinho

`title` e `valText` usavam `width: 2.2` com o `anchor` padrão (*center*).
Em A-Frame, `align` só alinha as linhas *dentro* do bloco — quem ancora é o
`anchor`. Um bloco de 2,2 centrado em ±0,8 começava/terminava em ±1,9, enquanto
o painel tem 1,8 de largura e o passo da grade é 1,95: sobreposição de 0,25.

**Correção:** `anchor: left` / `anchor: right` com larguras 1,6 e 1,3.

### 7. Faixa de controles da timeline descentrada

A linha ia de x = −2,0 a +3,55 (centro em +0,78): tudo jogado para a direita do
campo de visão. **Correção:** posições recalculadas para −2,68 a +2,68 (centro
em 0) e escala 0,88 nas três linhas (`scrubberRow`, `actionRow`, `ctrlSkip`),
o que também encolhe a faixa angular.
**Guarda:** novo check S12 falha se o centro sair de ±0,12.

### 8. Painel "Como se calcula a eficiência" sobre os medidores

Em y 2,23 com 1,35 de altura, o painel cobria o número (`1,88`) e o rótulo
"em 2024 · 1 bloco = 1%" das colunas. **Correção:** faixa livre entre o número
e o título do contexto (base 1,94, altura 1,10, geometria em `EFICACIA_PAINEL`),
espaçamento interno comprimido, e o `contextLead` — a única linha que caía na
projeção do painel, e redundante com ele — sai de cena enquanto ele está aberto.

### 9. Escala real com as torres na frente

Ao ligar "Ver em escala real", a parede de contingente (até ~3,4 m de altura)
aparecia atrás das 8 torres por ano e do painel translúcido. **Correção:**
`compScene` e `compPanel` saem de cena no modo escala real — e os hitboxes dos
anos perdem `.clickable` junto (o raycaster mira por classe, não por
visibilidade, então continuariam clicáveis atrás da parede).

### 10. Legendas do HUD encavalando o painel de marca

`.hud-legend` tinha `top` fixo (150 px) enquanto o painel de marca chega a
216 px quando título e breadcrumb quebram em duas linhas — por exemplo em
"Instituto Federal do Rio Grande do Sul". **Correção:** marca e legendas agora
empilham em fluxo dentro de `.hud-left` (grid com `gap`), então não há como
sobrepor.

---

## Limpeza feita de passagem

- `dom.efficacyPanel = panel` era escrita morta (o id estava no `ids[]`, sempre
  nulo, e ninguém lia a variável). Removido.
- `setSubtreeClickable(root, enabled, selector)` agora aceita seletor e chama
  `refreshRaycasters()` sozinho.
- Cache-busting: `styles.css?v=11`, `js/*.js?v=12`.

## O que ficou de fora (não é bug, é decisão sua)

- `app.js.bak` (140 KB), `js-fase0.bak/` e `index.fase0.bak.html`: ~3 MB de
  backup servidos junto com o projeto. Use git em vez de `.bak`.
- `#compLegend` no HTML nunca é exibido (virou legenda 3D na Fase 1) — markup
  morto.
- `gridPositions()` ficou sem uso depois do arco; `resetSelectionHeader()` e
  `#selectionWorld`/`#explorationWorld` também estão praticamente vazios.
- Em `buildMultiplos`, o `if (sentido === "negativo")` tem os dois ramos
  idênticos (`b.val - a.val`) — funciona, mas confunde quem lê.
- `tourGoTo` usa `state.stage = "painel"`, que não existe em `BACK_LABELS`
  (o botão Voltar mostra "< Voltar" genérico nessas cenas).

## Como validar

```powershell
cd versao-minimalista
node tests\logic-check.js       # verde aqui
node tests\smoke-estacoes.js    # precisa de Chrome/Edge — rode na sua máquina
python -m http.server 4174 --bind 127.0.0.1
```

Roteiro manual sugerido, na ordem dos bugs: entrar → "Ver a história" →
"< Início" → "Explorar os dados" (a galeria não deve sobrar na cena) → clicar
no Nordeste (24 cards, nenhum atrás da parede) → um indicador → passar o mouse
em Eficiência (painel não cobre os números) → caminhar até 2017 e voltar até
2024 → andar até "Para onde vão os alunos" → "Ver em escala real" → voltar
andando para o Corredor do Tempo (**tem que reativar**) → "Comparar regiões" →
voltar andando para Indicadores (**contexto tem que continuar lá**).
