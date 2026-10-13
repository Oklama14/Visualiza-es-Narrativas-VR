# Ambiente VR narrativo — Camadas Retóricas Visíveis

Reconstrução da versão minimalista conforme a planta baixa
`planta_ambiente_vr_narrativo.svg`. O percurso de 6 estações saiu; no lugar
entrou **um ambiente único**, com as três camadas do desenho ocupando lugares
distintos da sala, e o alvo de execução é o **Meta Quest 2 com hand tracking**.

```
                   [ PAINEL EMERGENTE ]        ← "a visualização surge acima"
                            ↑
  ┌──────────────────────────────────────────────────┐
  │        planta baixa — o mapa interativo           │
  │   ┌──────────────────┐        ┌───────────────┐   │
  │   │  MESA DO MAPA    │        │   CONTEXTO    │   │
  │   │ camada de dados  │        │ camada        │   │
  │   │ brutos (5 regiões│        │ textual       │   │
  │   │ + 4 indicadores) │        │ (3 anotações) │   │
  │   └──────────────────┘   ◉    └───────────────┘   │
  │                       posição do usuário          │
  └───────────────────────┐  ┌───────────────────────┘
                          │↑ │  entrada
```

## As três ações do leitor

| # | ação | o que acontece |
|---|------|----------------|
| 1 | **entrar no ambiente** | a câmera nasce na porta, virada para o mapa; caminhe ou mire o disco no piso e confirme |
| 2 | **olhar para uma região** | o **olhar** (e só ele) põe a região em foco: ela sobe um pouco, acende em âmbar, toca seu leitmotiv e a camada textual se reescreve |
| 3 | **confirmar** | a visualização da região **sobe** de cima dela até a altura dos olhos, ligada por um fio, e vira de frente para quem a chamou |

Confirmar = **pinça** (polegar + indicador) no Quest 2 com hand tracking,
**gatilho** com os controles Touch, **clique** no desktop. O gaze nunca
seleciona sozinho: sem *fuse*, não há seleção acidental nem fadiga de olhar
parado.

## As três camadas

**Camada de dados brutos — a mesa (tampo a 0,80 m).** As 5 regiões deitadas no
lugar geográfico, cada uma com uma placa de 100 blocos (1 bloco = 1%) do
indicador ativo em 2024. Na borda próxima, os 4 indicadores como colunas
10×10 — é ali que o leitor escolhe, com o olhar, *qual pergunta* está fazendo
ao mapa. Nada aqui interpreta.

**Camada interpretativa — o painel emergente.** Gráfico anotado 2017–2024 do
indicador ativo (linha de tendência, marcadores por ano, callouts de melhor e
pior ano, marca da pandemia, referência nacional pontilhada) + a parede de 100
blocos do ano em foco: para onde foram os estudantes daquele ano. Olhar um ano
no gráfico e confirmar troca o ano — a parede e o texto seguem junto.

**Camada textual — a zona de contexto.** Três anotações em pé
(MANCHETE / LEITURA / CONTEXTO), todas calculadas dos dados, com pegada própria
no piso. O texto nunca fica por cima do dado — é a tese do desenho.

## Como rodar

```powershell
cd versao-minimalista
node server.js            # ou: python -m http.server 4174 --bind 127.0.0.1
```

No Quest 2, sirva pela rede e abra o IP da máquina no navegador do headset
(`http://192.168.x.x:4173/`), toque em **Enter VR** e ative *Hand tracking* nas
configurações do headset. Os controles Touch continuam funcionando: os dois
estão declarados, e o A-Frame liga o que estiver em uso — dá para largar os
controles no meio da sessão.

Modo estudo (telemetria + onboarding sempre visível + 3 tarefas de compreensão
no painel do pesquisador):

```
http://127.0.0.1:4173/?estudo=1&p=P01
```

## Testes

```
node tests/logic-check-ambiente.js   # sem navegador
node tests/smoke-ambiente.js         # Chromium headless (precisa de playwright)
node tests/smoke-ambiente.js --shot cena.png
```

O `logic-check` confere a geometria derivada da planta (proporção da sala,
camadas sem sobreposição, placas cabendo nas regiões, colunas sem tapar o mapa),
o **conforto no Quest 2** (elevação e largura angular do painel a partir do
ponto de observação), o layout interno do painel, 24 narrativas e 576 anotações
sem `NaN`, as 48 composições anuais somando exatamente 100 blocos, e o contrato
entre o HTML e o cache `dom`.

O `smoke` sobe a cena de verdade e varre **160 combinações** (5 regiões × 4
indicadores × 8 anos) exigindo console limpo.

## Arquivos

```
index.html                    a cena (estrutura e conteúdo; medidas vêm do JS)
index.estacoes.bak.html       a versão anterior, de 6 estações, intacta
js-ambiente/00-planta.js      O DESENHO EM METROS — fonte única da geometria
js-ambiente/02-base.js        estado, utilitários, fonte e escala de texto
js-ambiente/03-audio.js       som posicional (leitmotiv, nota do ano, acorde)
js-ambiente/04-narrativa.js   narrativa e anotações calculadas dos dados
js-ambiente/15-sala.js        sala, zonas do piso, placa e posicionamento
js-ambiente/20-mapa.js        mesa: regiões em voxel + colunas de indicador
js-ambiente/30-contexto.js    camada textual
js-ambiente/40-painel.js      painel emergente (gráfico + parede)
js-ambiente/50-interacao.js   foco por olhar, pinça/gatilho, teleporte
js-ambiente/60-boot.js        boot, HUD, onboarding, handle window.AMB
assets/aframe-1.5.0.min.js    A-Frame local (offline)
assets/poppins-msdf.json/png  fonte MSDF local
```

A pasta `js/` antiga e os `.bak` ficaram no lugar mas **não são mais
carregados** — o `index.html` novo só usa `js-ambiente/`. Pode apagar quando
quiser.

### `00-planta.js` é o arquivo que importa

As coordenadas do SVG estão lá dentro, cruas, e viram metros por uma escala
única. Mudar `SALA_LARGURA_M` reescala o ambiente inteiro mantendo as proporções
do desenho; o `logic-check` refaz as contas de conforto em cima do novo valor.
Nenhuma medida de sala aparece escrita no HTML.

## Decisões que valem saber

**Rig no chão (y = 0).** A versão anterior punha o rig a `y = 1.6` com a câmera
em 0. No desktop dá no mesmo, mas no Quest a altura do headset **soma** por cima
do rig: o visitante entraria flutuando a 3,2 m. Agora o rig fica em 0, a câmera
em 1,6 no desktop, e o `enter-vr` zera a câmera (com `local-floor`, quem manda
na altura é o headset).

**Fonte local.** As fontes de estoque do A-Frame são baixadas de
`cdn.aframe.io` em tempo de execução — sem internet, **todo** o texto some,
inclusive dentro do headset, onde o texto 3D é o único canal que existe. Há uma
fonte MSDF gerada do Poppins Medium em `assets/`, com Latin-1 completo (por isso
o ambiente fala português com acento). Ela precisa de `shader: msdf` e
`negate: false`; sem isso cada glifo sai dentro de um retângulo cheio.

**Tamanho de texto.** O A-Frame dimensiona o glifo por `width / wrapCount`:
um rótulo de 2 caracteres com o `wrapCount` padrão (40) sai ilegível no headset.
Todo texto declara os dois juntos (`escalaTexto` / `escalaPara`), e rótulos de
linha única levam `data-linha-unica`, que faz o `setText` gritar no console se o
texto passar do limite — é assim que o smoke pega uma quebra de linha que
escreveria por cima do vizinho.

**Um bug herdado, corrigido.** Os callouts rotulavam pico e vale pela mesma
regra em todos os indicadores: numa taxa **positiva** (conclusão, eficiência) o
menor valor da série aparecia como "melhor ano". Agora o rótulo segue o
`sentido` do indicador — e numa taxa neutra (retenção) não existe melhor nem
pior, só maior e menor. Há um check dedicado (`D4b`) para isso não voltar.

**Conforto.** Sem locomoção contínua em VR (o WASD desliga no `enter-vr`);
teleporte com *blink* pelos discos do piso; painel entre −12° e +26° de elevação
e 71° de largura a partir da marca de observação, dentro do FOV útil do Quest 2;
`foveationLevel: 1` e `highRefreshRate` no renderer; lembrete de pausa a cada
20 min no modo estudo.

## O que ficou de fora, de propósito

- **Tours guiados, galeria de histórias, small multiples e drill-down por
  instituição.** A planta descreve um ambiente de exploração livre com uma
  decisão só. Os dados continuam em `dados.json` (as instituições inclusive), e
  a lógica antiga está em `js/` para consulta.
- **Strollytelling pelo corpo.** No corredor antigo, andar para os lados
  percorria os anos. Aqui o eixo do tempo mora no painel, e quem percorre os
  anos é o olhar. Caminhar continua sendo a forma de circular pela sala e olhar
  o mapa de outros ângulos. Se quiser o corredor de volta como quarta camada, a
  faixa de anos no piso é ~40 linhas em cima de `PLANTA`.

## Dois ajustes que talvez você queira

1. **`dados.json` é ASCII** (`"Taxa de Evasao"`). A camada de exibição corrige
   os 4 rótulos conhecidos (`ACENTOS`, em `02-base.js`). Se o `build-dados.js`
   passar a gerar acentuado, esse mapa vira identidade e pode sair.
2. **O `?v=20`** nos `<script>` e no `<link>` é cache-busting. Suba o número a
   cada rodada de teste no headset — o navegador do Quest é teimoso com cache.
