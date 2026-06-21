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
- retorno indicadores -> selecao e fluxo direto do Brasil;
- clickables ativos apenas no modo visivel;
- cursor gaze ativando fuse ao entrar em VR e desligando ao sair.

Ha tambem `tests/logic-check.js` (sem navegador): exercita os 70 contextos x 4 indicadores
verificando integridade das series, narrativa, geometria do grafico, FOV, contagens
absolutas e eventos. O bloco 11 cobre o small multiples: ordenacao por `sentido`, manchete
sem `NaN/undefined` e coerencia rotulo-x-dado (a "ponta" tem o valor extremo correto).
Rode com `node .\tests\logic-check.js`.

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

1. Selecao de contexto: MAPA do Brasil (`assets/mapa-brasil.png`) com 5 hotspots de regiao -
   olhar/hover mostra um cartao com Eficiencia/Evasao 2024 + comentario automatico; clicar
   abre o drill-down. Botao "Brasil" (visao nacional) e botao "Tour guiado" ao lado.
2. Escolher Brasil vai direto aos indicadores; escolher uma regiao abre o drill-down
   com suas instituicoes + opcao "Regiao inteira".
3. Indicadores (ambiente escuro): os 4 indicadores do contexto como MEDIDORES RADIAIS
   (gauge) sobre pedestais - um arco preenche de 0 a 100% conforme o valor de 2024, com o
   numero no centro (linguagem unica para os 4, comparavel). Geometria em `GAUGE` no `app.js`.
   Hover abre painel interpretativo; clique abre a linha do tempo.
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
cliques fantasmas. Importante: nao deixe elementos ocultos com `.clickable` ativo.

## Desktop vs VR

No desktop: `a-scene` usa `cursor="rayOrigin: mouse; fuse: false"` e o gaze fica com raycaster desativado.
O reticulo central (`#gazeCursor`) fica oculto no desktop (so aparece em VR via `setGazeFuse`).
Em VR: `enter-vr`/`exit-vr` chamam `setGazeFuse`, ligando fuse, raycaster e visibilidade do gaze.
Importante: nao deixar mouse e gaze ativos simultaneamente no desktop.

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
- Durante transicoes, `state.transitioning` bloqueia novas acoes.
- A narrativa automatica (`computeNarrative`) espelha a logica do projeto do colega:
  primeiro/ultimo ano, tendencia (crescimento/reducao/estabilidade) e ponto critico.
  Tambem produz a `manchete` (headline) e uma clausula comparativa vs. media nacional.
- Anotacoes interpretativas: `buildCallout` adiciona uma linha calculada dos dados
  (vs. media nacional para regiao/instituicao, ou "+/- pp desde <ano>" para o Brasil).
  Regra de integridade: nenhuma afirmacao e fixa; tudo vem dos dados. Eventos de contexto
  (`DADOS.eventos`) so com fonte verificavel (hoje, apenas 2020/pandemia).
- Small multiples: geometria da grade em `MULTIPLOS`; `enterMultiplos`/`buildMultiplos`/
  `buildMultiplosSelectors`/`buildMiniChart` montam a etapa. IMPORTANTE: as linhas dos
  mini-graficos usam `addLineSegments` (linha da regiao) e `addDashedSegments` (referencia
  tracejada do Brasil) - nunca `meshline` ou outra lib externa (so A-Frame). Rotulos e
  manchete leem `indicador.label` (NAO `.titulo`, que nao existe no `dados.json`).
- A abertura guiada usa `state.guidedToken`: ao sair da timeline ou pular, o token e
  incrementado e o loop assincrono para. Sempre incremente o token antes de trocar de etapa.
- Geometria do grafico centralizada em `CHART`; helpers `xFor(i)`/`yFor(v)` convertem
  indice de ano e valor (%) em coordenadas. Ajuste `baseY`/`maxH` para mudar a altura util.
- Painel do indicador faz fade-in no hover e fade-out ao sair (mouseleave/gaze):
  `fadeInfoPanel(show)` anima a opacidade de planos e textos via rAF, com `panelFadeToken`
  cancelando fades anteriores; `hideInfoPanelNow()` esconde na hora nas trocas de etapa.
- Notas explicativas: objeto `NOTAS` (uma por etapa) + `setNota(chave)` atualizam o painel
  HUD `#notaPanel`. Os numeros absolutos vem de `absoluteText`/`countFor`/`fmtInt` (usam
  `series.contagens`). Os eventos de contexto sao desenhados por `buildEventos` a partir de
  `DADOS.eventos` (linha vertical + etiqueta no topo do grafico).

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
- Se alterar posicoes/tamanhos/hitboxes, verifique se os cliques nao acertam objetos vizinhos
  e se os controles continuam dentro do campo de visao.
- Evite remover `setInteractionMode`, pois ele protege contra raycaster em objetos ocultos.
```
