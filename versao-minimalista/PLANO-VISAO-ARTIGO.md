# Plano: da versao minimalista a visao completa do artigo

Escopo: SOMENTE `versao-minimalista/`. Objetivo: fazer o artefato demonstrar, por
construcao, as quatro teses do artigo (WTD IHC 2026) - strollytelling, visceralizacao
por voxels, Martini Glass e ancoras espaciais - a tempo da pesquisa com usuarios
(set-out/2026). Prazo util: ~8 semanas a partir de jul/2026.

---

## 1. Onde estamos vs. onde o artigo quer chegar

| Tese do artigo | Hoje (versao minimalista) | Visao completa |
|---|---|---|
| Strollytelling (Jain 2025): o deslocamento fisico FAZ a historia progredir | Andar percorre os anos, mas so dentro da timeline; etapas ainda trocam por clique + fade no mesmo palco | O percurso inteiro e espacial: estacoes na sala, chegar a uma estacao ativa a cena |
| Visceralizacao por voxels (Lee 2021): 1 bloco = 1% em materia tatil | Parede de 100 blocos na composicao; torres por ano | Voxel como lingua unica de TODAS as etapas + um momento de escala absoluta |
| Martini Glass (Segel & Heer) | Abertura guiada na timeline; home com 2 decisoes; tours com arco | O funil vira arquitetura: atrio guiado -> corredor da historia -> salao aberto de exploracao |
| Ancoras espaciais (Liu 2024) | Sala unica generica; tudo acontece no mesmo lugar | Cada etapa tem UM lugar proprio e memoravel: lembrar do dado = lembrar do lugar |
| Instrumento de pesquisa | Sem telemetria | Log de trajetoria/eventos exportavel para a analise qualitativa |

## 2. Principios de traducao 2D->3D (OE3) que o artefato deve encarnar

Cada item abaixo vira uma decisao de design verificavel - e a materia-prima da
abordagem generica da dissertacao:

1. scroll -> stroll: posicao do corpo substitui a rolagem como driver narrativo.
2. secao da pagina -> estacao no espaco: cada "capitulo" e um lugar.
3. tooltip -> painel de proximidade/gaze: revelacao progressiva espacial.
4. anotacao do grafico -> callout ancorado no dado em 3D (ja feito).
5. eixo do tempo -> corredor fisico (ja iniciado; vira estacao propria).
6. martini glass -> funil arquitetonico (atrio estreito guiado, salao amplo livre).
7. porcentagem -> materia contavel (voxel; ja iniciado na composicao).

## 3. Fases

### Fase 0 - Fundacoes tecnicas (semana 1-2) [PRE-REQUISITO] — CONCLUIDA

> Status: 0.1 feita como scripts ordenados em `js/` (semantica identica ao
> monolito, verificada byte a byte; conversao a import/export fica opcional).
> 0.2-0.5 entregues; teleporte por gaze usa `teleportToStation` na Fase 1.

- **0.1 Modularizar `app.js`** (3,7k linhas) em modulos ES nativos, sem lib nova:
  `data.js`, `audio.js`, `stations/*.js` (uma por etapa), `interaction.js`,
  `narrative.js`. `<script type="module">`; A-Frame continua a unica dependencia.
- **0.2 Componente `station`** (A-Frame component): raio de ativacao + histerese;
  emite `station-enter`/`station-leave` pela distancia da camera. E o motor do
  strollytelling estrutural.
- **0.3 Voxels performantes**: `buildVoxelColumn()` unica, usando
  `THREE.InstancedMesh` (via `AFRAME.THREE`, ja embutido) - centenas de blocos com
  1 draw call. Alvo: 72 fps em Quest 2.
- **0.4 Telemetria**: modulo `telemetry.js` - amostra posicao da camera (2 Hz),
  registra eventos (estacao, ano, cliques, tempo por etapa), exporta JSON
  (download/localStorage). LGPD: dados anonimos, so em sessao de estudo.
- **0.5 Locomocao e conforto**: desktop WASD (ja ok); em VR, passos reais +
  teleporte por gaze para os marcos das estacoes (sem controllers); desativar WASD
  dentro do headset (cybersickness); vinheta de conforto SO durante teleporte.

### Fase 1 - O corredor narrativo (semana 2-4) [CORACAO DO PLANO] — CONCLUIDA

> Status: 6 estacoes fisicas com ativacao por proximidade; corredor de 6 m com
> callouts revelados por chegada; wayfinding (trilha + discos + nomes no piso);
> tours teleportam entre estacoes; tudo completavel sem andar (cliques
> teleportam com blink). Pendencias menores: mini-mapa como mapa do percurso
> (hoje segue como hot-swap de regiao) e piloto com usuarios reais.

Reorganizar a sala (17x16 ja comporta) em um percurso em "L" ou arco:

```
[Atrio/Home] -> [Mapa] -> [Indicadores] -> [Corredor do Tempo (8 m, 1 m/ano)]
                                              -> [Composicao] -> [Comparacao] -> [Sintese/CTA]
```

- **1.1 Estacoes fisicas**: cada vista atual vira uma estacao com posicao fixa no
  mundo (nada de esconder/mostrar no mesmo palco). `station-enter` monta/anima a
  cena (build-in); `station-leave` desativa interacao (mantem `setInteractionMode`).
- **1.2 Sem fade-to-black entre estacoes contiguas**: a continuidade espacial E o
  argumento (memoria espacial). Fade so no teleporte-fallback.
- **1.3 Corredor do Tempo**: a timeline atual vira um corredor de verdade - grafico
  na parede lateral, faixa de anos no chao (ja existe), 1 m por ano; callouts
  aparecem quando o usuario chega ao ano correspondente (hoje aparecem todos).
- **1.4 Wayfinding**: trilha luminosa no piso ligando estacoes (substitui o anel
  decorativo); placa-nome em cada estacao (ancora verbal + espacial); o mini-mapa
  vira mapa do PERCURSO (voce esta aqui) em vez de hot-swap de regiao.
- **1.5 Tours sobre o espaco**: os 3 tours deixam de trocar cenas in-place e passam
  a guiar o percurso ("va ate a proxima estacao" + teleporte automatico opcional).
  O arco autor->leitor vira literalmente: o tour termina no salao de exploracao.
- **1.6 Fallback de espaco pequeno**: botoes "Proxima/Anterior" teleportam entre
  estacoes; toda a experiencia continua completavel sem andar (acessibilidade e
  desktop sem WASD).

Criterio de aceite: um usuario completa a historia inteira APENAS caminhando
(desktop WASD ou passos em VR), sem nenhum clique de navegacao.

### Fase 2 - Voxel como lingua universal (semana 4-5) — CONCLUIDA

> Status: 2.1-2.5 entregues. Gauges radiais viraram colunas 10x10; torres de
> voxel no Corredor; "Ver em escala real" (1 bloco = 1.000 estudantes) na
> composicao; queda animada da evasao a cada troca de ano; micro-colunas nos
> small multiples. Tudo via InstancedMesh (js/voxel.js).

- **2.1 Indicadores**: substituir os 4 gauges radiais por colunas de voxel 10x10
  (1 bloco = 1%), mesma cor/material da composicao. Hover/gaze mantem o painel
  interpretativo e o botao "Ver linha do tempo". O numero grande continua no topo.
- **2.2 Timeline**: torres de voxel por ano ao longo do corredor (a linha de
  tendencia anotada permanece - o genero "grafico anotado" nao muda, muda a materia).
- **2.3 Momento de escala absoluta**: na Composicao, gatilho "ver em escala real":
  a parede re-renderiza com 1 bloco = 1.000 estudantes -> o contingente do ano
  (ex.: 460 mil matriculas = 460 blocos grandes) toma a parede do fundo, com o
  numero absoluto. E a promessa "aproximar o observador da escala real dos dados".
- **2.4 Fluxo animado**: ao trocar de ano na composicao, blocos que "viram evasao"
  se desprendem e caem (reaproveita a animacao do fechamento do tour, com
  moderacao: 1 vez por troca, sem loop).
- **2.5 Small multiples**: manter mini-linhas (leitura comparativa rapida e melhor
  com linhas), mas adicionar micro-colunas de voxel de 2024 ao lado de cada painel
  - a lingua aparece tambem na comparacao.

### Fase 3 - Narrativa e audio espacializados (semana 5-6) — CONCLUIDA

> Status: 3.1-3.3 entregues. Nota "como ler" auto-recolhe (HUD = marca +
> breadcrumb); manchetes animam ao chegar; disco "voce esta aqui"; audio
> posicional via THREE.PositionalAudio (nota emana do marcador do ano, acorde
> da parede de voxels, sparkle do callout); leitmotiv por estacao.

- **3.1 Callouts por proximidade**: manchete/callout de cada estacao aparece ao
  chegar (progressive disclosure espacial); o HUD 2D fica so com marca + breadcrumb.
- **3.2 Audio posicional**: usar o componente `sound`/THREE.PositionalAudio do
  proprio A-Frame - o acorde da composicao emana da parede de voxels, a nota do ano
  emana do marcador (hoje e so pan estereo). Drone segue o usuario, mais quieto.
- **3.3 Leitmotiv por estacao**: 2-3 notas caracteristicas ao entrar em cada
  estacao (ancora sonora somando-se a ancora espacial).

### Fase 4 - Instrumentacao do estudo (semana 6-7) — CONCLUIDA

> Status: 4.1-4.4 entregues. `?estudo=1&p=P01` liga telemetria + painel do
> pesquisador com 3 tarefas calculadas dos dados (tempo/acerto no log) +
> onboarding padronizado. Par 2D em `controle-2d.html` (mesmos dados, textos,
> tarefas; exporta condicao "2d"). Lembrete de pausa aos 20 min em VR.

- **4.1 Modo estudo** (`?estudo=1`): telemetria ligada, onboarding padronizado,
  ordem de tarefas fixa, botao de exportar log ao final.
- **4.2 Tarefas de compreensao**: 3 perguntas guiadas (ex.: "em que ano a evasao
  do Norte foi maior?") acionaveis pelo pesquisador; o log registra tempo e acerto.
- **4.3 Par 2D de controle**: pagina web plana com OS MESMOS dados e textos
  (fora desta pasta; requisito do desenho experimental do artigo).
- **4.4 Conforto**: registro de tempo continuo em headset + lembrete de pausa.

### Fase 5 - Validacao e polimento (semana 7-8) — CONCLUIDA (parte automatizavel)

> Status: `tests/logic-check.js` (Node puro, RODADO E VERDE: 70 contextos, 280
> narrativas, geometria das estacoes, corredor 1:1, tours, tarefas) e
> `tests/smoke-estacoes.js` (CDP headless: boot->drill->indicadores->corredor->
> composicao/escala->multiplos->voltar->tour->som + draw calls < 500 + zero
> erros de console; rodar na maquina com Chrome/Edge). QA geometrico virou
> teste automatizado (S6/S7). Piloto com usuarios: roteiro pronto em
> `PILOTO-ROTEIRO.md` - execucao e humana.

- **5.1 Testes**: adaptar `tests/logic-check.js` (ja roda sem navegador) e
  reescrever o smoke test para o novo fluxo de estacoes; adicionar teste de
  performance (contagem de draw calls / heap).
- **5.2 QA de geometria**: repetir a auditoria de angulo visual (sobreposicoes) em
  cada estacao; checar hitboxes vs. vizinhos; FOV dos controles.
- **5.3 Piloto**: 2-3 usuarios informais antes do estudo real; ajustar raios de
  ativacao das estacoes e tempos de legenda com base na observacao.

## 4. Riscos e mitigacoes

| Risco | Mitigacao |
|---|---|
| Cybersickness (movimento artificial em VR) | passos reais + teleporte por gaze; WASD so no desktop; vinheta no teleporte |
| Espaco fisico pequeno do usuario | escala compacta (0,5 m/ano opcional) + teleporte-fallback completo |
| Performance com centenas de voxels | InstancedMesh (0.3); animar so a estacao ativa; congelar estacoes distantes |
| Texto ilegivel em VR | minimo ~1,5 grau de angulo visual por linha; menos texto, mais legenda temporizada |
| Regressao funcional na reorganizacao | modularizar ANTES (0.1); logic-check adaptado a cada fase; piloto (5.3) |
| Prazo do estudo (set/2026) | Fases 0-1 sao o nucleo indispensavel; 2.3-2.5 e 3.2-3.3 sao cortaveis sem ferir a tese |

## 5. Ordem de corte (se o tempo apertar)

Indispensavel para o artigo: 0.2, 0.3, 1.1-1.3, 1.6, 2.1, 4.1-4.2.
Desejavel: 1.4, 1.5, 2.2, 3.1, 5.x.
Cortavel sem dano a tese: 2.3 (escala real), 2.4, 2.5, 3.2, 3.3.

## 6. O que NAO mudar

- A-Frame como unica biblioteca externa (InstancedMesh vem do THREE embutido).
- Compatibilidade desktop + VR gaze (sem exigir controllers).
- Genero "grafico anotado" e a narrativa calculada dos dados (nada de texto fixo).
- Agregacao por contagens brutas (`build-dados.js`/`dados.json` intocados).
- As correcoes ja feitas: gaze fuse com alvo separado, voltar unico, som sem voz.
