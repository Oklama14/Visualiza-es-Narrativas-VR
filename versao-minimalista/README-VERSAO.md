# Versao Minimalista (experimento de redesign)

Copia do projeto original com as alteracoes propostas na `../ANALISE-UX-MINIMALISMO.md`.
O projeto original (pasta raiz) esta INTOCADO. Rode esta versao do mesmo jeito:

```powershell
cd versao-minimalista
python -m http.server 4174 --bind 127.0.0.1
# abrir http://127.0.0.1:4174/
```

## O que mudou (e por que)

### Alinhamento com o artigo (WTD IHC 2026)

1. **Strollytelling de verdade.** Na linha do tempo, a posicao X do corpo percorre
   os anos: uma faixa 2017-2024 no piso (WASD no desktop, passos reais em VR) troca
   o ano em foco com histerese anti-flicker. Botoes < > viram fallback.
   Codigo: `WALK`, `buildWalkStrip`, `startWalkLoop` em `app.js`.
2. **Visceralizacao na exploracao livre.** A parede de 100 blocos (1 bloco = 1% dos
   estudantes) e agora a representacao principal do ano em foco na etapa
   "Para onde vao os alunos", substituindo o donut (que duplicava a torre).
   As particulas do fechamento do tour viraram blocos (voxels), nao esferas.
   Codigo: `buildCompWall` + `updateCompYear`.
3. **Martini Glass na experiencia inteira.** A tela inicial tem UMA decisao:
   "Ver a historia" (galeria com os 3 tours) ou "Explorar os dados" (mapa).
   O CTA final dos tours desagua no mapa - da conducao do autor para a agencia
   do leitor.

### Correcoes de UX

4. **Mouse-look consertado.** O original tentava reativar `look-controls` na
   `<a-scene>` (sem efeito); o giro por arrastar agora vem habilitado no `#camera`,
   coerente com a instrucao "arraste para olhar". O drag-guard (anti clique
   acidental) continua ativo.
5. **Gaze fuse vs. painel do indicador.** Em VR, fixar o olhar num medidor fixa o
   painel interpretativo (nao navega mais sozinho); entrar na linha do tempo exige
   mirar o botao "Ver linha do tempo" dentro do painel. No desktop nada muda.
6. **Notas visiveis em VR.** O HUD 2D (DOM) nao existe no headset; a essencia de
   cada nota "como ler" agora ecoa no `captionPanel` acoplado a camera por 6s.
   A legenda da composicao virou legenda 3D junto da parede.

### Minimalismo

7. **Navegacao unificada.** Um unico botao Voltar com rotulo dinamico
   ("< Indicadores", "< Mapa"...) guiado pela pilha `history`. Sairam os botoes
   "Indicadores" (timeline e composicao).
8. **Menos alvos por tela.** Home: 2 decisoes (antes ~12 alvos). Timeline:
   < ano > + Comparar + Narrar + Rever historia.
9. **Menos decoracao.** Sairam: vinheta 2D, aneis girantes dos medidores, anel
   pulsante do palco, segundo anel de piso (2 mundos), painel de luz do teto.
   Ficaram: sala (ancora espacial), spotlight na cor do indicador, fog.
10. **Codigo morto removido.** `buildContextCards`/`createContextCard`/
    `arcPositions`/`#contextCards` (legado), `buildGuidedQuestions`/`#guidedQuestions`
    (nenhum tour define `perguntas`), `#focusRing`.

## Avisos

- `tests/` nao foi copiado: o smoke-test do original verifica elementos que esta
  versao removeu/renomeou de proposito. Se esta versao virar a principal, o teste
  deve ser adaptado (ver secao "Como testar" no CLAUDE.md da raiz).
- `localStorage` do onboarding e compartilhado com o original (mesma origem se
  servidos na mesma porta; use porta diferente para testar o onboarding).

## Revisao visual + som (2a rodada)

### Sobreposicoes corrigidas
- Manchete e corpo narrativo da timeline e da composicao subiram (y 3.62/3.02 ->
  3.88/3.46): nao encavalam mais com a tag "2020 - Pandemia" nem com os callouts.
- Callouts (pico/vale) ganharam teto mais baixo (`yFor(100) - 0.45`), longe da tag
  de evento.
- O readout do ano em foco desvia sozinho: se o ano tem callout ou evento, o texto
  vai para BAIXO do marcador em vez de colidir com o card.
- Readout da composicao agora e ancorado a esquerda (nao invade a legenda 3D da
  parede de blocos) e o conectivo causal ficou 1 linha curta.
- Galeria de historias: o glifo decorativo saiu (sobrepunha titulos longos).
- Placa "Controles" da sala cresceu para caber 3 linhas sem tocar a borda.
- Painel do indicador subiu levemente (oculta menos os medidores do meio).
- Legenda dos small multiples subiu (folga da primeira fileira de paineis).

### Som (narracao por voz REMOVIDA)
- Sem Web Speech: os textos da abertura guiada agora aparecem como legenda
  (captionPanel) com tempo de leitura proporcional; o ritmo Martini Glass se mantem.
- Sonificacao redesenhada para ser agradavel E informativa:
  - Nota por ano (pentatonica): altura = valor do indicador; pan estereo = posicao
    do ano (2017 a esquerda -> 2024 a direita), espelhando o strollytelling.
  - Acorde da composicao: 3 notas (conclusao=aguda, retencao=media, evasao=grave)
    com volume proporcional a cada fatia - um ano bom soa brilhante, um ano de
    evasao alta soa grave.
  - Sparkle curto quando um callout e revelado; chime de 2 notas nas transicoes.
  - Drone ambiente mais suave (gain 0.045) e consoante/dissonante conforme a
    tendencia (mantido do original, refinado).
- Botao "Som ligado/Som mudo" no lugar do "Narrar" (masterGain com fade).
- Audio desbloqueia no 1o clique (politica de autoplay dos navegadores).

## Fase 0 (fundacoes) — concluida

- **0.1 Modularizacao**: `app.js` (3.698 linhas) virou 14 modulos em `js/01..14`,
  cortados em fronteiras de secao e verificados byte a byte (concatenacao ==
  monolito original; `app.js.bak` guarda o monolito). Carga ordenada no
  `index.html`; mesma semantica de escopo global, zero mudanca de comportamento.
- **0.2 `js/station.js`**: componente A-Frame `station` (raio + histerese, 6 Hz,
  distancia XZ) emitindo `station-enter`/`station-leave` + registro `STATIONS`.
  Motor do strollytelling estrutural da Fase 1.
- **0.3 `js/voxel.js`**: `createVoxelGrid` com `THREE.InstancedMesh` (layouts
  wall/tower, `setSegments` recolore sem reconstruir). JA INTEGRADO: as 8 torres
  da composicao (antes ~800 a-box) e a parede de 100 blocos agora sao 9 draw
  calls no total.
- **0.4 `js/telemetry.js`**: com `?estudo=1` grava trajetoria da camera (2 Hz) e
  eventos (modo/etapa, ano focado, cena de tour, som, estacoes, teleportes) e
  exporta JSON por botao. Sem o parametro, `tlog()` e no-op e nada e coletado.
- **0.5 `js/locomotion.js`**: em VR o WASD desliga (cinetose); `teleportTo`/
  `teleportToStation` com blink de conforto prontos para o fallback da Fase 1.

Proximo passo: Fase 1 (corredor narrativo com estacoes fisicas).

## Fase 1 (corredor narrativo) — concluida

A sala deixou de ser um palco com cenas trocadas e virou um PERCURSO:

```
                [Corredor do Tempo]  (parede do fundo, 6 m, ~0,86 m/ano)
   [Composicao]                        [Comparacao]
   (parede esq.)                       (parede dir.)
        [Mapa]                    [Indicadores]
                     [Inicio]
```

- **Estacoes fisicas (1.1-1.2)**: cada vista mora num container `stX` com
  posicao/rotacao proprias; `station-enter` (raio + histerese) reativa a cena ao
  chegar a pe - sem fade entre estacoes vizinhas. Conteudo persiste no lugar
  (ancora de memoria espacial). Camera nasce na estacao Inicio.
- **Corredor do Tempo (1.3)**: grafico na parede do fundo; `WALK.half = 3.0`
  alinha a faixa do piso 1:1 com o grafico. Callouts de pico/vale NAO aparecem
  todos de uma vez: sao revelados quando o visitante chega ao ano.
- **Wayfinding (1.4)**: trilha luminosa no piso ligando as 6 estacoes na ordem
  narrativa + disco e nome de cada uma (`buildWayfinding`).
- **Tours espaciais (1.5)**: cada cena do tour LEVA o usuario a estacao certa
  (placeAtStation dentro do fade); abertura/fechamento usam a estacao Inicio.
- **Fallback total (1.6)**: todo clique de navegacao teleporta com blink de
  conforto (`blinkToStation`); quem chega andando nao e teleportado. A
  experiencia inteira e completavel sem dar um passo - e tambem SO caminhando.
- **Integridade narrativa**: chegar a uma estacao sem prerequisito (ex.:
  Corredor sem indicador escolhido) mostra dica na legenda em vez de cena vazia;
  composicao e comparacao se constroem sozinhas na chegada quando possivel.
- Voltar/mini-mapa/controles do tour agora seguem a camera (visiveis em
  qualquer estacao); backup pre-fase-1 em `js-fase0.bak/` e `index.fase0.bak.html`.

## Fase 2 (voxel como lingua universal) — concluida

Uma UNICA lingua visual em toda a experiencia: o bloco. 1 bloco = 1% (ou, em
escala real, 1.000 estudantes). Tudo com InstancedMesh (`js/voxel.js`).

- **2.1 Indicadores**: os 4 gauges radiais viraram colunas de voxel 10x10 com
  trilho de 100 blocos; blocos acesos = valor de 2024. Painel interpretativo,
  botao "Ver linha do tempo" e hitbox preservados (mesma interacao).
- **2.2 Corredor do Tempo**: as barras translucidas viraram torres de voxel por
  ano (trilho de 100, acesos ate o valor). A linha de tendencia anotada segue
  sendo o heroi narrativo; a torre da materia e escala. Clique por hitbox unico.
- **2.3 Escala real**: botao na composicao alterna a parede percentual para o
  CONTINGENTE absoluto do ano - ex.: cada bloco = 1.000 estudantes, com o total
  de matriculas no titulo. A magnitude vira materia (Lee et al. 2021).
- **2.4 Queda da evasao**: ao trocar o ano, 1-6 blocos vermelhos se desprendem
  da parede e caem ao piso (uma vez por troca, sem loop).
- **2.5 Small multiples**: micro-coluna de 100 blocos (valor de 2024) ao lado de
  cada mini-painel - a lingua de blocos tambem na comparacao regional.

## Fase 3 (narrativa e audio espacializados) — concluida

- **3.1 Revelacao por proximidade**: a nota "como ler" (HUD 2D) aparece a cada
  etapa e se recolhe sozinha em 12 s (mouse sobre ela segura) - o HUD fica so
  com marca + breadcrumb. Ao chegar a pe numa estacao, a cena "recebe" o
  visitante com animacao de entrada e o disco do piso acende ("voce esta aqui").
- **3.2 Audio posicional**: o AudioContext agora e o MESMO do THREE, entao os
  sons sintetizados viram fontes posicionais (atenuacao por distancia + pan
  binaural real): a nota do ano emana do marcador no grafico, o acorde da
  composicao emana da parede de blocos, o sparkle emana do proprio callout.
  Fallback estereo quando nao ha listener. Mute cobre tambem o canal posicional.
- **3.3 Leitmotiv por estacao**: 2-3 notas pentatonicas caracteristicas soam DO
  LUGAR da estacao ao chegar - ancora sonora somada a ancora espacial, tambem
  nas chegadas por teleporte (o station-enter dispara apos o blink).

Pendentes do plano: Fase 4 (modo estudo com tarefas) e Fase 5 (testes + QA).

## Fase 4 (instrumentacao do estudo) — concluida

Uso na sessao de pesquisa (set-out/2026):

```
Condicao imersiva:  http://127.0.0.1:4174/?estudo=1&p=P01
Condicao 2D:        http://127.0.0.1:4174/controle-2d.html?estudo=1&p=P01
```

- **4.1 Modo estudo**: com `?estudo=1`, o onboarding SEMPRE aparece (sessao
  padronizada), a telemetria grava trajetoria + eventos, e o id do participante
  (`&p=`) entra no export. Sem o parametro, nada e coletado.
- **4.2 Tarefas de compreensao**: painel 2D do pesquisador (aparece no monitor
  espelhado, nunca no headset) com 3 tarefas CALCULADAS de dados.json - ano de
  pico da evasao, regiao lider em eficiencia, faixa de concluintes por 100. A
  pergunta vira legenda no mundo para o participante; o pesquisador registra a
  resposta falada; tempo e acerto vao para o log (`tarefa`/`resposta`).
- **4.3 Par 2D de controle**: `controle-2d.html` - pagina plana standalone com
  OS MESMOS dados (fetch de dados.json), narrativa calculada com as mesmas
  regras, grafico anotado (canvas), composicao por ano, tabela regional,
  drill ate instituicoes no seletor, e as MESMAS 3 tarefas + telemetria propria
  (exporta `condicao: "2d"`).
- **4.4 Conforto**: tempo continuo em headset cronometrado (`vr enter/exit` no
  log) + lembrete de pausa como legenda a cada 20 min.

## Fase 5 (validacao) — concluida (parte automatizavel)

```
node tests/logic-check.js      # sem navegador - RODADO AQUI, verde
node tests/smoke-estacoes.js   # Chrome/Edge headless - rodar na sua maquina
```

- **logic-check**: avalia os 20 modulos num sandbox Node e verifica: 70
  contextos x 4 indicadores (series, contagens ~= matriculas), 280 narrativas
  sem NaN/undefined, momentos da abertura guiada, arredondamento dos voxels,
  geometria das estacoes (HTML == STATION_SPOTS, zonas sem sobreposicao, tudo
  dentro da sala), corredor alinhado 1:1 ao grafico, tarefas do estudo
  deriva- veis, leitmotivs/notas completos e historias curadas validas.
- **smoke-estacoes**: harness CDP do smoke original + cenarios novos dirigidos
  por Runtime.evaluate: boot com 6 estacoes e wayfinding, dica de prerequisito
  no Corredor, explorar/drill, colunas e torres de voxel, caminhar ate 2017,
  callout por chegada, comparar, parede + escala real (draw calls < 500),
  6 paineis + micro-colunas, voltar por historico, tour completo ate o CTA,
  som on/off e zero erros de console.
- **Piloto**: roteiro de sessao de 25 min em `PILOTO-ROTEIRO.md` (observacao
  por estacao, sinais de cinetose, perguntas de memoria espacial e a matriz
  sintoma -> ajuste rapido).

TODAS AS 6 FASES DO PLANO ESTAO ENTREGUES. O que resta e humano: rodar o
smoke na sua maquina, passear no navegador/headset e fazer o piloto.
