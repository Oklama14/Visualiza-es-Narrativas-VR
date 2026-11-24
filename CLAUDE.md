# Contexto do Projeto

## Nome

Laboratorio VR de Dados - Eficiencia Academica da Rede Federal

## Objetivo

Experiencia educacional em realidade virtual (A-Frame + WebXR) que transforma os
indicadores de eficiencia academica da Rede Federal (Plataforma Nilo Pecanha) em uma
narrativa imersiva. O foco e mostrar como interacao em ambientes 3D melhora a
compreensao de evasao, conclusao, eficiencia e retencao ao longo do tempo.

## Stack e restricoes

- HTML, CSS e JavaScript puro.
- A-Frame 1.5.0 via CDN e a unica biblioteca externa da aplicacao.
- Web Speech API (nativa do navegador) e usada para narracao em audio - nao e biblioteca externa.
- Nao usar frameworks de frontend.
- Deve funcionar em desktop com mouse.
- Deve ser compativel com VR via WebXR e cursor gaze.
- Interacoes precisam usar raycaster com a classe `.clickable`.

## Fonte de dados

- Base oficial: `Dados/EficienciaAcademica.csv` (Plataforma Nilo Pecanha / SETEC-MEC),
  nivel campus, 2017-2024, 5 regioes, 64 instituicoes.
- O dicionario de dados esta em `Dados/EficienciaAcademica.md`.
- O projeto web original do colega (PHP/MySQL) esta em `Dados/ProjetoNarrativasVisuais-main`
  e inspira a narrativa (genero Poster, Magazine e Grafico Anotado).
- Aviso da base: dados do IFRS podem ter inconsistencias - sinalizados no app.

## Arquivos principais

- `build-dados.js`: script Node que le o CSV, agrega para Brasil/regiao/instituicao e
  gera `dados.json`. Os indicadores sao percentuais e NAO podem ser somados/mediados:
  agregamos as contagens brutas (concluidos, evadidos, retidos) e recalculamos os
  percentuais e o Indice de Eficiencia pela formula oficial.
- `dados.json`: base estatica consumida pelo app (carregada via `fetch`).
- `index.html`: cena A-Frame, camera, dois ambientes (selecao clara e exploracao escura),
  sub-modos de indicadores e linha do tempo, paineis, controles 3D e botao Voltar.
- `styles.css`: HUD 2D, legenda de comparacao e overlay de transicao.
- `app.js`: carregamento de dados, construcao dinamica de cards/objetos, grafico
  anotado (eixo de grade, linha de tendencia, marcadores, callouts), abertura guiada
  (martini glass), navegacao por ano, comparacao, narracao e controle de clickables.
- `styles.css`: HUD 2D, legenda de comparacao, vinheta cinematografica e overlay de transicao.
- `tests/smoke-test.js`: teste automatizado (Chrome/Edge headless + Chrome DevTools Protocol).
- `headset.js`: so do Quest 2, carregado ANTES do `app.js` - perfil do renderer pela URL
  (`?hz=90 ?aa=0 ?fov=0..1 ?fps=1`), componentes `sobrepor` (reticulo/legenda/HUD de VR por
  cima do mundo), `reticulo-olhar` (anel na profundidade do alvo + enchimento do fuse),
  `maos-locais` (modelo das maos em `assets/maos/`, offline) e `medidor-fps`; aviso de HTTPS.
- `server.js`: servidor estatico sem dependencias. `node server.js --quest` serve HTTPS na
  rede (certificado autoassinado gerado em `.certs/`, nunca servido) para o navegador do Quest.
- `assets/poppins-msdf.json` + `assets/poppins.png`: fonte 3D LOCAL (Poppins MSDF, a mesma da
  versao minimalista), com Latin-1 completo. Todo `a-text` usa `FONTE_3D` (app.js) ou
  `font="assets/poppins-msdf.json" shader="msdf" negate="false" line-height="60"` (index.html).
- `tests/quest-sim.js`: Quest 2 emulado (IWER + Playwright), ver "Como testar".
- `tests/sobreposicao.js`: "nada em cima de nada" - varre todas as etapas e acusa texto/
  elemento em cima de outro (ver "Como testar" e `ANALISE-SOBREPOSICAO-V1.md`).

Estetica: ambiente escuro cinematografico (sky escuro, fog para profundidade, aneis no
piso, brilho-spotlight com a cor do indicador e vinheta 2D). A geometria do grafico fica
em `CHART` no `app.js` (`x0/x1/baseY/maxH/z`).

## Como gerar os dados

```powershell
node .\build-dados.js
```

Gera/atualiza `dados.json` a partir de `Dados\EficienciaAcademica.csv`.

## Como executar

```powershell
python -m http.server 4173 --bind 127.0.0.1
```

Depois abrir `http://127.0.0.1:4173/`. Rodar por `localhost`/`127.0.0.1` e melhor que abrir
o HTML direto (necessario para `fetch` do `dados.json` e para WebXR).

No Meta Quest 2 (navegador do headset, pela rede Wi-Fi): `node server.js --quest` e abrir o
`https://<ip-do-pc>:4443/` que ele imprime (1a vez: "Avancado" -> "Continuar"). WebXR so existe
em contexto seguro: por `http://192.168...` o botao VR vira tela cheia 2D sem erro (a pagina
mostra um aviso). O A-Frame (`assets/aframe-1.5.0.min.js`), a fonte 3D (`assets/poppins-msdf.json`)
e o modelo das maos (`assets/maos/`) sao locais: a experiencia roda sem internet.

## Como testar

Validar sintaxe:

```powershell
node --check .\app.js
node --check .\build-dados.js
node --check .\tests\smoke-test.js
```

Rodar smoke test completo (precisa de Chrome ou Edge instalado):

```powershell
node .\tests\smoke-test.js
```

Depurar coordenadas e fluxo:

```powershell
$env:DEBUG_SMOKE='1'; node .\tests\smoke-test.js
```

O smoke test cobre:

- carregamento da cena A-Frame e do `dados.json`;
- cards de contexto (Brasil + 5 regioes);
- drill-down de uma regiao em instituicoes e o botao de voltar do drill;
- entrada nos 4 indicadores do contexto;
- painel interpretativo do indicador no hover;
- abertura guiada (martini glass) iniciando e botao "Pular introducao";
- grafico anotado: grade de % (5 linhas), 1 marcador por ano, linha de tendencia, callouts;
- manchete + narrativa automatica;
- numeros absolutos na linha do ano (ex.: "1.386 evadidos de 5.430 matriculas");
- anotacao do evento de 2020 (pandemia) na linha do tempo;
- nota explicativa (HUD) preenchida e atualizada por etapa;
- navegacao por ano (botoes < e >);
- modo comparacao (regiao vs Brasil) com legenda;
- "Reproduzir" reinicia a abertura guiada;
- "Voltar" retorna a tela anterior (indicadores -> drill de onde vieram -> mapa) e fluxo
  direto do Brasil;
- clickables ativos apenas no modo visivel;
- cursor gaze ativando fuse ao entrar em VR e desligando ao sair.

Ha tambem `tests/logic-check.js` (sem navegador): exercita os 70 contextos x 4 indicadores
verificando integridade das series, narrativa, geometria do grafico, FOV, contagens
absolutas e eventos. O bloco 11 cobre o small multiples: ordenacao por `sentido`, manchete
sem `NaN/undefined` e coerencia rotulo-x-dado (a "ponta" tem o valor extremo correto).
Rode com `node .\tests\logic-check.js`.

Ha `tests/flow-check.js` (sem navegador, precisa do jsdom): carrega `index.html` + `app.js`
com o A-Frame stubado e percorre selecao -> indicadores -> timeline -> composicao ->
comparar regioes -> 3 tours -> drill, conferindo estado, textos gerados e clickables
fantasmas (elemento invisivel com `.clickable`) em cada transicao. Instale so para testar:
`npm install --no-save jsdom` e rode `node .\tests\flow-check.js` (sem o jsdom ele se
auto-pula). E o teste mais proximo do smoke-test que roda sem Chrome.

Ha `tests/quest-sim.js` (Playwright + IWER, a emulacao de WebXR da Meta, como Meta Quest 2 e
com a internet bloqueada): entra numa sessao imersiva de verdade e confere cabeca a 1,6 m,
perfil do renderer, maos (modelo local; 1 pinca = 1 clique; olhar parado com as maos a vista
NAO seleciona), controles (1 gatilho = 1 clique no alvo do laser), mao que some ao pegar o
controle, alcance do olhar e conforto (angulos de cada alvo clicavel por etapa; `--angulos`
imprime a tabela), reticulo/legenda/HUD por cima do mundo, abertura guiada com voz muda,
"Voltar" apos "Indicadores", draw calls e console. `npm i -D playwright iwer` e
`node .\tests\quest-sim.js` (precisa de `assets/aframe-1.5.0.min.js`).

Ha `tests/sobreposicao.js` (Playwright): leva o app, sem fades, a TODOS os estados - mapa
(+ cartao de cada regiao), drill das 5 regioes, indicadores dos 70 contextos (com o painel
de cada medidor e com o mini-mapa aberto), linha do tempo de 70 contextos x 4 indicadores x
8 anos (comparando), a abertura guiada momento a momento, composicao x 8 anos, small
multiples x 4 e as cenas dos 3 tours - e acusa: texto sobre texto (mesma superficie e na
tela), texto saindo do fundo, cartao cobrindo linha/ponto, texto tapado ou desenhado em cima
de um objeto (raios do olho ate as letras), texto ou marca de dado APAGADO pela ordem de
desenho (translucido/hitbox que grava profundidade, desenhado antes), letra que a fonte nao
tem, rotulo de uma linha (`data-linha-unica`) que quebrou, posicao NaN; o HUD 2D medido de
verdade em 3 janelas (1920x1080, 1366x768, 1280x650) contra a cena projetada; e o HUD de VR
contra a legenda. `npm i -D playwright` e `node .\tests\sobreposicao.js` (~25 min;
`--rapido` usa so Brasil, regioes e as 6 instituicoes de nome mais longo, ~5 min; `--json
saida.json` grava tudo). Rode depois de mexer em qualquer texto, painel ou posicao.

Ha ainda `tests/layout-check.js` (sem navegador): projeta os blocos de texto/painel de
cada etapa no espaco de tela (camera 0 1.6 0, FOV vertical 80) e acusa sobreposicao
vertical, folga curta (< 1% da altura da tela), texto que estoura a caixa e blocos que
caem atras dos paineis 2D do HUD (canto superior esquerdo e nota do rodape). A altura de
linha do `a-text` e estimada por `2,3 x width / (wrapCount + 0,5)`. Rode sempre que mexer
em posicao/tamanho de texto: `node .\tests\layout-check.js`.

## Modelo de dados (dados.json)

```
{
  meta: { fonte, indicador, gerado, observacao },
  anos: [2017..2024],
  eventos: [ { ano, titulo, texto } ],   // anotacoes de contexto (ex.: 2020 pandemia)
  indicadores: [ { key, label, unidade, cor, sentido, descricao } ],   // evasao, conclusao, eficiencia, retencao
  brasil:   { id, nome, tipo:"brasil", series },
  regioes:  [ { id, nome, tipo:"regiao", series, instituicoes:[ { id, sigla, nome, tipo:"instituicao", inconsistente, series } ] } ]
}
```

`series` = `{ evasao:[8], conclusao:[8], eficiencia:[8], retencao:[8], matriculas:[8],
contagens:{ concluidos:[8], evadidos:[8], retidos:[8] } }`, alinhado a `anos`. As
`contagens` sao os numeros absolutos (estudantes) usados para exibir "X de Y matriculas"
junto do percentual. Valores % podem ser `null` quando nao ha matriculas (renderizado como "s/ dados").

`sentido` define o ponto critico: `negativo` (evasao) -> pico e o critico;
`positivo` (conclusao/eficiencia) -> vale e o critico; `neutro` (retencao) -> destaca o pico.

## Fluxo de experiencia (hibrido, 3 etapas)

0. A selecao antiga em cards de arco (`buildContextCards`/`createContextCard`/`arcPositions`
   e a entidade `#contextCards`) foi REMOVIDA - a tela inicial e o mapa. Nao reintroduza.
1. Selecao de contexto: MAPA do Brasil (`assets/mapa-brasil.png`) com 5 hotspots de regiao -
   olhar/hover mostra um cartao com Eficiencia/Evasao 2024 + comentario automatico; clicar
   abre o drill-down. Botao "Brasil" (visao nacional) e botao "Tour guiado" ao lado.
2. Escolher Brasil vai direto aos indicadores; escolher uma regiao abre o drill-down
   com suas instituicoes + opcao "Regiao inteira".
3. Indicadores (ambiente escuro): os 4 indicadores do contexto como MEDIDORES RADIAIS
   (gauge) sobre pedestais - um arco preenche de 0 a 100% conforme o valor de 2024, com o
   numero no centro (linguagem unica para os 4, comparavel). Geometria em `GAUGE` no `app.js`.
   Hover abre painel interpretativo (e esconde o `contextLead`, que ocupa a mesma faixa
   de tela); clique abre a linha do tempo. O hover NAO abre mais os conectores causais.
4. Linha do tempo (grafico anotado): eixo com grade de % (0-100), linha de tendencia com
   marcadores por ano, callouts de pico/vale com linha-guia e manchete narrativa.
   Nesta etapa o cabecalho generico (kicker/titulo/lead) e ocultado e a manchete narrativa
   assume o topo, evitando texto sobreposto ao grafico. O grafico fica baixo (marcadores
   ~altura dos olhos) e os controles ficam numa faixa unica para facilitar a interacao.
   Ao abrir, roda a "abertura guiada" (martini glass): apresenta a serie ano a ano
   (autor) e depois libera a exploracao livre (leitor) - navegar por ano, comparar
   (regiao vs Brasil), reproduzir a abertura e narracao em audio. Botao "Pular introducao"
   encerra a abertura na hora.
5. Composicao "Para onde vao os alunos" (etapa C, a partir dos indicadores): barras
   empilhadas a 100% por ano (concluidos/retidos/evadidos) + anel do ano em foco e numeros
   absolutos. Usa `series.contagens`. Botao "Indicadores" volta ao passo 3.
   Como as barras sao 100% empilhadas, elas SEMPRE chegam ao topo: `COMP.baseY + COMP.maxH`
   define o teto real da cena e precisa ficar abaixo do bloco de narrativa (`compText`).
   O titulo usa `rotuloCurto` (sigla nas instituicoes) para caber em 1 linha e o "fio
   causal" do `compReadout` e uma frase curta, de 1 linha.
6. Comparacao regional (small multiples): ponto de entrada proprio no MAPA (botao
   "Comparar regioes", ao lado de "Brasil" e "Tour guiado"). Grade 3x2 de mini-graficos
   (Brasil + 5 regioes) do mesmo indicador, na MESMA escala 0-100% - a desigualdade vira
   percepcao imediata. Cada painel: linha de tendencia (cor do indicador) + linha
   tracejada de referencia da media nacional + nome e valor de 2024. Seletor de 4
   indicadores no topo reconstroi e reordena os paineis. Ordenacao por valor (nao
   geografica): para `positivo` e `negativo`, descendente (maior valor primeiro) -> a
   "ponta" e a pior na evasao / a lider em conclusao-eficiencia. Manchete automatica com o
   abismo (X pp de diferenca). Hover realca; clicar num painel entra direto na linha do
   tempo daquele contexto (transicao in-place, sem passar pela etapa de indicadores).
   Geometria em `MULTIPLOS` no `app.js`. O mini-mapa fica oculto nesta etapa (a navegacao
   hot-swap de um unico contexto nao se aplica a visao "todas as regioes").
7. "Indicadores" volta ao passo 3; "Voltar" retorna a selecao.

## Interacao e raycaster

Classes de clickable por modo (controladas por `setInteractionMode(mode)`):

- `.selection-clickable`: hotspots de regiao do mapa + botao Brasil + botao Tour guiado.
- `.tour-clickable`: controles do tour (Anterior/Proximo) e o CTA do fechamento; so no modo "tour".
  O tour tem arco: cena de `abertura` (tese) e `fechamento` (sintese + CTA -> mapa) sao
  paineis de texto (`#tourPanel`, sem grafico); a cena com `climax: true` ganha o rotulo
  "ponto de virada". `tourGoTo` trata `tipo` abertura/fechamento; `endTour` numa cena de
  painel volta ao mapa (`returnToSelection`).
- `.drill-clickable`: cards de instituicao e botao de voltar do drill.
- `.indicator-clickable`: os 4 objetos de indicador.
- `.timeline-clickable`: barras/hitboxes da linha do tempo e controles (ano <, ano >,
  comparar, narrar, reproduzir, indicadores, pular introducao). Durante a abertura guiada
  so o "Pular" fica visivel; os demais controles ficam ocultos (e portanto nao clicaveis).
- `.composicao-clickable`: controles da composicao (ano <, ano >, voltar) + barras empilhadas.
- `.multiplos-clickable`: seletores de indicador + hitboxes dos 6 paineis do small multiples; so no modo "multiplos".
- `.exploration-clickable`: botao Voltar global (ativo em indicadores, timeline, composicao, tour e multiplos).
- `.minimap-clickable`: mini-mapa hot-swap (indicadores, timeline, composicao, tour) - NAO no modo "multiplos".

`setInteractionMode` garante que apenas o modo visivel tenha `.clickable`, evitando
cliques fantasmas. `toggleClickable` so liga a classe se `isEntityVisible(entity)` for
verdadeiro (o elemento e todos os ancestrais visiveis), entao um painel oculto nunca
rouba clique/gaze - por isso as views precisam ficar visiveis ANTES de chamar
`setInteractionMode`. Importante: nao deixe elementos ocultos com `.clickable` ativo.

`#tourControls` (Anterior/progresso/Proximo) fica FORA de `#timelineView`, direto em
`#explorationWorld`: o tour tambem passa por cenas de composicao, de indicadores e por
paineis de texto, e dentro da timeline os botoes sumiam justamente nessas cenas.

## Desktop vs VR

No desktop: `a-scene` usa `cursor="rayOrigin: mouse; fuse: false"` e o gaze fica com raycaster desativado.
O reticulo central (`#gazeCursor` + o anel filho `#gazeRing`) fica oculto no desktop.
Importante: nao deixar mouse e gaze ativos simultaneamente no desktop.

Em VR, `atualizarModoEntrada` le `session.inputSources` (no `enter-vr`, no `inputsourceschange`
da sessao e nos `controllerconnected/disconnected`) e escolhe UM modo de selecao:
- `controle` (Touch): laser + gatilho (`#rightHand`/`#leftHand`); o gaze nao mira.
- `mao` (hand tracking): o gaze mira, a PINCA seleciona (o `select` do Quest vira clique no
  cursor de olhar), SEM fuse - olhar parado nao seleciona. Maos visiveis em
  `#handLeftTrack`/`#handRightTrack` (`hand-tracking-controls` + `maos-locais`).
- `olhar` (nada rastreado): gaze + fuse 850 ms (`setGazeFuse(true)`), como antes.
`setGazeMode(mira, fuse)` separa mirar de selecionar; `setGazeFuse(x)` = `setGazeMode(x, x)`.
O raio do gaze sai do olho (`origin: 0 0 1` no raycaster, que desfaz o `-1` da entidade).
Antes, ao largar os controles, as maos apareciam mas nada era selecionavel (o laser ficava
sem controle e o gaze continuava desligado). Nao voltar a decidir o modo so por eventos de
componente: a troca controle <-> mao nem sempre gera `controllerdisconnected` a tempo.

Clique deliberado: no desktop o giro por mouse fica DESATIVADO (`look-controls` com
`mouseEnabled: false`), entao mover o mouse so aponta (hover) e somente um clique entra.
Em VR o giro vem do headset (nao afetado). `bindDragGuard` e uma rede extra: cancela, na
fase de captura, o `click` sintetico se houver arraste (>8px). Assim nao se "entra so de olhar".

Sala: `#room` (piso, teto, 4 paredes, rodapes luminosos e luz de teto) e desenhada fora
dos dois mundos e fica sempre visivel, dando referencia espacial (evita sensacao de flutuar).
Os objetos ficam apoiados no piso (y=0). Nao recolocar os planos gigantes de piso removidos.

## Pontos tecnicos sensiveis

- `setVectorAttribute`, `applyPendingTransforms` e `applyObject3DVector` reaplicam
  `position`/`rotation`/`scale` em entidades criadas dinamicamente.
- `setEntityVisible` atualiza tanto o atributo A-Frame quanto `object3D.visible`.
- Os hitboxes invisiveis devem ser grandes para gaze, mas sem sobrepor vizinhos.
- Os controles da timeline ficam num layout compacto e centrado para projetar dentro do FOV.
- Durante transicoes, `state.transitioning` bloqueia novas acoes. As funcoes async de
  navegacao (`enterIndicators`, `enterDrill`, `enterMultiplos`, `returnToSelection`,
  `startTour`, `tourGoTo`) marcam a flag e SEMPRE a devolvem num `finally` - sem isso,
  uma excecao no meio da transicao trava a experiencia inteira sem erro visivel.
  Em `tourGoTo`/`enterMultiplos` quem libera e quem assumiu (`assumiuTransicao`/`skipFade`),
  porque elas tambem sao chamadas de dentro de outra transicao.
- A narrativa automatica (`computeNarrative`) espelha a logica do projeto do colega:
  primeiro/ultimo ano, tendencia (crescimento/reducao/estabilidade) e ponto critico.
  Tambem produz a `manchete` (headline) e uma clausula comparativa vs. media nacional.
- Anotacoes interpretativas: `buildCallout` adiciona uma linha calculada dos dados
  (vs. media nacional para regiao/instituicao, ou "+/- pp desde <ano>" para o Brasil).
  Regra de integridade: nenhuma afirmacao e fixa; tudo vem dos dados. Eventos de contexto
  (`DADOS.eventos`) so com fonte verificavel (hoje, apenas 2020/pandemia).
- Small multiples: geometria da grade em `MULTIPLOS` (inclui o layout interno do painel:
  `headerY`, `chartTop`, `chartBottom`, `chartPadX`); `enterMultiplos`/`buildMultiplos`/
  `buildMultiplosSelectors`/`buildMiniChart` montam a etapa. IMPORTANTE: as linhas dos
  mini-graficos usam `addLineSegments` (linha da regiao) e `addDashedSegments` (referencia
  tracejada do Brasil) - nunca `meshline` ou outra lib externa (so A-Frame). Rotulos e
  manchete leem `indicador.label` (NAO `.titulo`, que nao existe no `dados.json`).
  A ordem vertical e cabecalho (titulo + nota, 1 linha cada) -> seletores -> grade -> legenda;
  a frase longa do "abismo" vai para o HUD 2D (`multiplosSubtitle`), nao para a cena.
- Texto ancorado: `a-text` com `align: left/right` E `anchor: left/right`. Sem o `anchor`,
  o bloco continua centrado na posicao e o texto invade o vizinho (foi o que fazia o nome
  da regiao e o valor de um painel do small multiples baterem no painel ao lado, e os
  rotulos de % entrarem na area das barras).
- Relacao causal (`buildIndicatorLinks` + `CAUSAL`): NAO existem mais linhas 3D entre os
  medidores (a linha Evasao -> Eficiencia passava exatamente sobre o medidor de Conclusao).
  A relacao virou um painel-equacao com chips (fator + valor + efeito ELEVA/REDUZ/DEPRIME)
  e o chip de resultado. Ele so aparece nas cenas de tour com `showLinks: true`
  (`showIndicatorLinks(true)`), nunca no hover, e nessas cenas o cabecalho de contexto
  (kicker/titulo/lead) fica oculto para nao empilhar dois blocos na mesma altura.
- Comparacao: `resolveCompareContext` devolve `null` para o Brasil (ele e a propria
  referencia). `updateCompareButton` apaga o botao e escreve "Comparar (n/d)" nesse caso,
  em vez de deixar um botao ativo que nao faz nada.
- Legendas de narracao: `setCaption` escreve em `#captionText` (o id precisa estar na
  lista de `dom`, senao o painel aparece vazio).
- Narracao (`narrateText`): a legenda e o canal garantido, a voz e extra. Se a sintese nao
  comecar em 1,5 s ou der erro, a frase segue pelo tempo de leitura da legenda; um vigia encerra
  a frase se `onend` nunca vier. No navegador do Quest a voz pode nao existir - antes, a
  abertura guiada ficava parada no primeiro momento.
- Historico: `backToIndicators` (botoes "Indicadores" da linha do tempo e da composicao)
  consome a entrada `indicators` do topo da pilha. Sem isso, o "Voltar" global logo depois
  reabria a mesma tela de indicadores.
- A abertura guiada usa `state.guidedToken`: ao sair da timeline ou pular, o token e
  incrementado e o loop assincrono para. Sempre incremente o token antes de trocar de etapa.
- Geometria do grafico centralizada em `CHART`; helpers `xFor(i)`/`yFor(v)` convertem
  indice de ano e valor (%) em coordenadas. Ajuste `baseY`/`maxH` para mudar a altura util.
- Painel do indicador faz fade-in no hover e fade-out ao sair (mouseleave/gaze):
  `fadeInfoPanel(show)` anima a opacidade de planos e textos via rAF, com `panelFadeToken`
  cancelando fades anteriores; `hideInfoPanelNow()` esconde na hora nas trocas de etapa.
- Notas explicativas: objeto `NOTAS` (uma por etapa) + `setNota(chave)` atualizam o painel
  HUD `#notaPanel`. A nota abre ao entrar numa etapa e se recolhe sozinha num chip
  ("Como ler esta visualizacao +") depois de `NOTA_ABERTA_MS` (10 s); o mouse por cima
  abre de novo. Aberta sozinha ela deixa o clique passar (pointer-events so no chip e na
  nota aberta pelo mouse). Aberta o tempo todo, ela cobria os controles de ano.
  Os numeros absolutos vem de `absoluteText`/`countFor`/`fmtInt` (usam
  `series.contagens`). Os eventos de contexto sao desenhados por `buildEventos` a partir de
  `DADOS.eventos` (linha vertical + etiqueta no topo do grafico).

## Nada em cima de nada (revisao 2026-10-16)

Detalhes e o antes/depois em `ANALISE-SOBREPOSICAO-V1.md`. O que precisa continuar valendo:

- Ordem de desenho: o renderer usa `sortTransparentObjects: true` e todo plano translucido
  decorativo (brilhos `chartGlow`/`compGlow`/`indicatorGlow`, aneis do piso, `focusBand`,
  barras de 0,18) e todo HITBOX invisivel (opacidade 0,001/0) tem `depthWrite: false`.
  Um transparente que grava profundidade, desenhado antes, apaga o que esta atras dele: era
  o que escondia a manchete da linha do tempo e o titulo da composicao (atras do brilho), as
  linhas dos mini-graficos (atras do hitbox do painel) e os numeros dos medidores. Hitbox
  novo SEM `depthWrite: false` volta a apagar coisas.
- Fonte: so `FONTE_3D` / Poppins local. A kelsonsans so tinha ASCII ("·", "—", "SERTÃO"
  perdiam letras) e vinha da internet. A Poppins nao tem "›" (a trilha de VR usa "→") nem
  simbolos como ◉ ▲ ⇄.
- `headset.js` corrige o shader msdf do A-Frame (`sigDist / max(fwidth(sigDist), 0.00001)`,
  igual a minimalista). Sem isso, onde o campo de distancia e plano o `fwidth` da 0 e a
  divisao indefinida vira pontinhos e blocos claros em volta das letras (aparece em tela
  grande/1920x1080). Nao remover; precisa rodar antes de a cena criar os materiais.
- `setVectorAttribute` escreve `"x y z"` (o formato `"x: 1; y: 2; z: 3"` virava NaN no A-Frame;
  as 100 esferas do fechamento do tour nunca apareciam).
- Cabecalhos 3D (manchete da linha do tempo, titulo da composicao, cabecalho dos
  indicadores, titulos do mapa/drill) com largura <= 4,8 a ~3,9 m: ficam entre ~29% e ~71% da
  tela, fora do painel do HUD 2D. Manchete/texto e titulo/texto da composicao sao presos pelo
  topo (`baseline: top`) e reservam 2 + 3 linhas antes do topo do grafico.
- Cartoes de pico/vale e o rotulo do ano em foco (`valueReadout`) sao posicionados por
  `posicionarNoGrafico` (porte do `posicionarCartoes` da minimalista): lugar livre perto do
  ponto, sem cobrir a linha, os pontos, a linha de comparacao (mesmo desligada), a etiqueta
  do evento nem outro cartao (os dois cartoes juntos, `posicionarCallouts`, na ordem de menor
  custo), nem o canto superior esquerdo do painel (fica sob a coluna do HUD 2D em notebook).
  Cartoes em `CHART.z + 0,2` (na frente das esferas).
- Anel do pedestal dos medidores gira em torno da propria normal (`-90 0 0` -> `-90 0 360`);
  com `-90 360 0` ele ficava em pe e varria por tras dos rotulos.
- Etiqueta de evento (2020) entre o 100% e o topo do painel (`CHART.topoPainel`).
- `textoUmaLinha(el, texto, wrapBase)`: titulos que precisam caber em 1 linha (nomes longos
  de instituicao) diminuem a letra em vez de quebrar. Rotulos marcados com
  `data-linha-unica` sao conferidos pelo `tests/sobreposicao.js`.
- HUD 2D: `.hud-left` empilha painel + legendas (nunca uma sobre o outro); painel com
  `width: clamp(250px, 24vw, 330px)`; titulo e trilha do HUD usam a sigla da instituicao
  (`rotuloTrilha`). "Voltar" e "< Regioes" ficam no canto superior DIREITO (3,35 3,95 -3,9):
  na esquerda ficavam metade fora da tela e atras do painel. A barra do tour fica a
  esquerda do botao VR do A-Frame.
- Legenda da narracao: no desktop e a barra 2D `#legenda2d` (rodape); em VR, a 3D
  `#captionPanel` (0,92 x 0,24, 46 colunas, -0,36 - medidas da minimalista), e o `#vrHud`
  se esconde enquanto ela aparece (`setCaption(texto, vrForcado)`).
- No tour, a faixa de baixo e so dos controles do tour: `#compScrubber` e `#compEnter`
  somem nas cenas de composicao/indicadores do tour.

## Onboarding

Na 1a visita, `initOnboarding` mostra o overlay 2D `#onboardOverlay` (instrucoes de
desktop e VR) e grava `localStorage["vrlab.onboarded.v1"]` ao clicar "Comecar". O botao
`#helpBtn` ("?") reabre a qualquer momento; entrar em VR dispensa o overlay (nao aparece no
headset). A placa `#roomSign` na sala resume os controles tambem para VR.

## Cuidados ao alterar

- Mantenha A-Frame como unica biblioteca externa.
- Preserve compatibilidade desktop e VR.
- Se mudar o CSV, rode `node .\build-dados.js` para regenerar `dados.json`.
- Depois de qualquer alteracao visual ou de interacao, rode `node .\tests\smoke-test.js`.
- Depois de mexer em texto/posicao de painel, rode `node .\tests\layout-check.js` (0 falhas
  e, de preferencia, 0 avisos).
- Depois de mexer em fluxo/estado/interacao, rode `node .\tests\flow-check.js`.
- Ao alterar `app.js`, `headset.js` ou `styles.css`, suba o `?v=N` no `index.html` (cache do
  navegador). O `node server.js` ja manda `Cache-Control: no-store`.
- Depois de mexer em VR (cursor, maos, controles, posicao de alvos), rode `node .\tests\quest-sim.js`.
- Se alterar posicoes/tamanhos/hitboxes, verifique se os cliques nao acertam objetos vizinhos
  e se os controles continuam dentro do campo de visao.
- Banda segura da tela: o painel do HUD ocupa o canto superior esquerdo (ate ~27% da
  largura e ~25% da altura) e a nota "Como ler", recolhida, so um chip no canto inferior
  esquerdo (aberta, nos primeiros 10 s de cada etapa, ate ~28% x ~72-95%).
- Depois de mexer em texto, painel, posicao, cor/opacidade de material ou HUD, rode
  `node .\tests\sobreposicao.js --rapido` (e o completo antes de fechar a versao).
- Texto 3D novo: `...FONTE_3D` (app.js) ou os atributos da Poppins (index.html). Hitbox
  invisivel novo: `depthWrite: false` no material.
- Evite remover `setInteractionMode`, pois ele protege contra raycaster em objetos ocultos.
```
