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

Desktop (este PC):

```powershell
cd versao-minimalista
node server.js            # http://127.0.0.1:4173/
```

### No Meta Quest 2

O WebXR só existe em **contexto seguro** (HTTPS ou localhost). Aberto como
`http://192.168.x.x:4173` no navegador do Quest, o `navigator.xr` nem aparece e
o botão VR vira uma tela cheia 2D, sem erro nenhum (a página agora mostra um
aviso laranja quando isso acontece). Por isso há um modo próprio:

```powershell
node server.js --quest
```

Ele escuta na rede, gera um certificado autoassinado em `.certs/` (Node puro,
sem openssl; a pasta nunca é servida) e imprime o endereço para o headset:

```
  No Quest 2 abra:    https://192.168.0.12:4443/
```

1. PC e Quest na **mesma rede Wi-Fi**. Na primeira vez o Windows pergunta se
   libera o Node no firewall: libere para **redes privadas**.
2. No navegador do Quest, abra o endereço `https://…:4443/`. Na primeira visita
   aparece "Sua conexão não é particular" → **Avançado** → **Continuar**.
3. Toque em **Entrar** no cartão de ajuda e depois no botão **VR** (canto
   inferior direito).
4. Mãos: ligue o *rastreamento de mãos* nas configurações do Quest (fica em
   Movimento ou em Dispositivo, conforme a versão do sistema). Belisque com
   a **palma virada para fora** — com a palma para você, a mesma pinça abre o
   menu do sistema. Os controles Touch continuam funcionando (gatilho), e dá para
   largar os controles no meio da sessão.

Alternativa sem aviso de certificado: cabo USB + modo desenvolvedor,
`adb reverse tcp:4173 tcp:4173` e abrir `http://localhost:4173/` no Quest.

O servidor manda `Cache-Control: no-store`: o navegador do Quest não reaproveita
o JS da rodada anterior, então não é preciso subir o `?v=` a cada teste.

#### Perfil de renderização pela URL

Para comparar no headset sem editar código (vale junto com `?estudo=1` etc.):

| parâmetro | efeito | padrão |
|---|---|---|
| `?fps=1` | medidor dentro do VR: fps real do headset e draw calls | desligado |
| `?hz=90` | pede 90 Hz ao Quest (`?hz=72` volta) | 72 Hz |
| `?aa=0` | desliga o antialias (MSAA 4x) | ligado |
| `?fov=0` … `?fov=1` | foveação fixa (0 = nenhuma, 1 = máxima) | 0,5 |

Ex.: `https://192.168.0.12:4443/?fps=1&hz=90`. Se o medidor ficar âmbar (abaixo
do alvo) com 90 Hz, fique nos 72 Hz: quadro perdido no headset é pior que taxa
menor.

## Estudo com usuários

O roteiro passo a passo está em **`PILOTO-ROTEIRO.md`**. Em resumo:

```powershell
node server.js --quest
```

e, **no próprio notebook**, abra a estação do pesquisador:
`http://127.0.0.1:4173/pesquisador.html`. Ela conduz a sessão inteira sem tocar
no headset: triagem, SSQ antes e depois, treino, exploração livre (início e
fim), as 3 tarefas (a pergunta aparece para o participante; você registra a
resposta falada e o tempo é medido na estação) e o download dos dados. A
página do participante é `https://<ip>:4443/?estudo=1&p=P01` no Quest, ou
`controle-2d.html?estudo=1&p=P01` na condição 2D.

```
 notebook (node server.js --quest)                  participante
 ┌───────────────────────────────┐  telemetria (POST) ┌────────────────────┐
 │ estação do pesquisador        │ ◄──────────────────│ Quest: index.html   │
 │ 127.0.0.1:4173/pesquisador    │ ──────────────────►│ ou controle-2d.html │
 │ dados-estudo/P01.jsonl        │  comandos (SSE)    └────────────────────┘
 └───────────────────────────────┘
```

- **Para onde vão os dados:** `dados-estudo/<participante>.jsonl`, uma linha
  por evento, no notebook. A pasta está no `.gitignore` e o servidor nunca a
  serve. Registros da estação, comandos, estado ao vivo e download só respondem
  a pedidos do próprio notebook (`127.0.0.1`). Para gravar noutro lugar
  (PowerShell): `$env:VRLAB_DADOS_DIR='D:\estudo'; node server.js --quest`.
- **Queda de rede:** o headset guarda no próprio aparelho o que ainda não foi
  confirmado e reenvia quando a conexão volta (ou no próximo carregamento). O
  botão "Exportar sessão" (download do JSON completo) continua como terceira via.
- **O que a telemetria grava:** versão do artefato e do navegador; posição da
  cabeça, guinada e inclinação, quadros por segundo e alvo sob o olhar a 2 Hz;
  fontes de entrada (mãos/controles) e perdas de rastreio; foco, painel, ano,
  indicador, pinças (inclusive sem alvo), teleportes; tarefas, treino, comandos.
  Na 2D: rolagem e seção visível a 2 Hz, cliques e os mesmos eventos de foco,
  painel, ano e indicador.
- **Treino (só imersiva):** sala sem dados e três gestos: beliscar um alvo,
  teleportar por um disco, dar um passo real até uma marca. No fim a pessoa
  volta para a porta (`85-treino.js`). Para ver sem a estação: `?treino=1`.
- **Tarefas:** definidas uma vez só em `js-ambiente/07-tarefas.js`, com o
  gabarito calculado dos dados e a **tolerância de 1 bloco** (candidatos a menos
  de 1 pp do máximo também contam; o acerto estrito vai junto).
- **Análise:** `node estudo/analisar.js --csv resumo.csv` gera uma linha por
  participante × condição com as variáveis dependentes (ver o cabeçalho do
  script).
- **Painel local (`?painel=local`):** o painel antigo, em DOM, para quando não
  há estação (ex.: cena rodando no PC por Quest Link). Ele fica na tela do
  participante na 2D, por isso não é o padrão.

**Condição 2D (`controle-2d.html`).** É a mesma sala em página plana: as três
camadas viram três áreas (mapa com os blocos, painel da região, anotações), com
os mesmos textos, valores, cartões do gráfico e parede de 100 blocos - todos
gerados por `04-narrativa.js` e `07-tarefas.js`, os mesmos arquivos da
imersiva. Passar o mouse numa região a põe em foco (como o olhar); clicar abre
o painel (como a pinça). `tests/paridade-2d.js` abre as duas páginas e compara o
texto exibido em 64 estados.

## Testes

```
node tests/logic-check-ambiente.js   # sem navegador
node tests/smoke-ambiente.js         # Chromium headless (precisa de playwright)
node tests/smoke-ambiente.js --shot cena.png
node tests/quest-sim.js              # Quest 2 emulado (precisa de playwright + iwer)
node tests/quest-sim.js --shot visao-quest.png
node tests/paridade-2d.js            # 2D x imersiva: o mesmo texto nos dois (playwright)
node tests/estudo-sim.js             # ensaio do estudo ponta a ponta (playwright + iwer)
```

Para os quatro últimos: `npm i -D playwright iwer` uma vez (o `quest-sim` e o
`estudo-sim` levam uns 2-4 min: o SwiftShader renderiza os dois olhos em
software).

O `estudo-sim` é o ensaio geral sem ninguém no headset: sobe o `server.js`,
abre a estação, um Quest 2 emulado e depois a página 2D, e conduz uma sessão
inteira (triagem, SSQ, treino, exploração andando e teleportando, as 3 tarefas
pela estação, SSQ depois). No meio derruba a rede por 4 s e confere que nada se
perdeu nem duplicou. No fim roda `estudo/analisar.js` sobre o `.jsonl` gravado
e exige que as variáveis dependentes saiam dele. Os dados vão para uma pasta
temporária.

O `logic-check` confere a geometria derivada da planta (proporção da sala,
camadas sem sobreposição, placas cabendo nas regiões, colunas sem tapar o mapa),
o **conforto no Quest 2** (elevação e largura angular do painel a partir do
ponto de observação), o layout interno do painel, 24 narrativas e 576 anotações
sem `NaN`, as 48 composições anuais somando exatamente 100 blocos, e o contrato
entre o HTML e o cache `dom`.

O `smoke` sobe a cena de verdade e varre **160 combinações** (5 regiões × 4
indicadores × 8 anos) exigindo console limpo — e confere no layout real que
nenhum rótulo de linha única quebrou (contar caracteres não basta: letra larga
em caixa alta quebra antes do `wrap-count`).

O `quest-sim` é o teste do headset: com o **IWER** (Immersive Web Emulation
Runtime, da Meta) configurado como Meta Quest 2 e a internet bloqueada, a cena
entra numa sessão imersiva de verdade e ele confere: cabeça a 1,6 m; todo alvo
alcançável pelo olhar a partir da marca de observação (inclusive os que ficam a
menos de 1 m do olho); **uma pinça = uma confirmação** e **um gatilho = uma
confirmação**; pinça numa região abre o painel; painel opaco ao olhar e sem
alvos fantasmas quando fechado; painel virado para o olho; teleporte que leva a
cabeça ao disco mesmo com o corpo fora do centro; legenda e retículo por cima
do mundo; antialias e 72 Hz; orçamento de draw calls; modelo da mão carregado
sem internet e escondido quando a pessoa pega os controles (o A-Frame 1.5 deixava a mão
congelada no ar); console limpo.

## Arquivos

```
index.html                    a cena (estrutura e conteúdo; medidas vêm do JS)
controle-2d.html              condição 2D do estudo (mesmos textos e tarefas)
pesquisador.html              estação do pesquisador (abrir em 127.0.0.1)
server.js                     servidor local + HTTPS do Quest + api do estudo
index.estacoes.bak.html       a versão anterior, de 6 estações, intacta
js-ambiente/00-planta.js      O DESENHO EM METROS — fonte única da geometria
js-ambiente/01-telemetria.js  telemetria (notebook + reserva local) e comandos
js-ambiente/02-base.js        estado, utilitários, fonte, escala de texto, legenda
js-ambiente/03-audio.js       som posicional (leitmotiv, nota do ano, acorde)
js-ambiente/04-narrativa.js   TODO texto exibido (narrativa, anotações, painel,
                              mesa) - compartilhado com a condição 2D
js-ambiente/05-headset.js     só do Quest: perfil pela URL, retículo, legenda por
                              cima, mãos locais, medidor de fps, aviso de HTTPS
js-ambiente/07-tarefas.js     as 3 tarefas e o gabarito (tolerância de 1 bloco)
js-ambiente/15-sala.js        sala, zonas do piso, placa e posicionamento
js-ambiente/20-mapa.js        mesa: regiões em voxel + colunas de indicador
js-ambiente/30-contexto.js    camada textual
js-ambiente/40-painel.js      painel emergente (gráfico + parede)
js-ambiente/50-interacao.js   foco por olhar, pinça/gatilho, teleporte
js-ambiente/60-boot.js        boot, HUD, onboarding, handle window.AMB
js-ambiente/85-treino.js      treino de 3 gestos antes das tarefas
js-ambiente/90-estudo.js      lado do participante no modo estudo (comandos)
estudo/ssq.js                 itens e pontuação do SSQ
estudo/analisar.js            dados-estudo/*.jsonl -> variáveis dependentes
assets/aframe-1.5.0.min.js    A-Frame local (offline)
assets/poppins-msdf.json/png  fonte MSDF local
assets/maos/                  modelo das mãos (WebXR Input Profiles, MIT)
tests/quest-sim.js            simulação do Quest 2 (IWER)
tests/paridade-2d.js          2D x imersiva: mesmo texto
tests/estudo-sim.js           ensaio do estudo ponta a ponta
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
teleporte com *blink* pelos discos do piso, que leva a **cabeça** ao disco e o
olhar ao alvo (desfaz o quanto a pessoa já andou e girou no guardian); painel
entre −12° e +26° de elevação e 71° de largura a partir da marca de observação,
inclinado para o olho; legenda presa ao rosto a ~20° abaixo do centro (mais
baixo cai fora da região nítida da lente); lembrete de pausa a cada 20 min no
modo estudo.

**Renderização no Quest 2.** MSAA 4x ligado (sem ele, linha fina e texto
cintilam), 72 Hz estáveis e foveação 0,5. No A-Frame `foveationLevel: 1` é a
foveação **máxima**, que borra justamente o texto da periferia do painel.
Fundos de painel e de anotação são opacos e os alvos de olhar têm material
invisível (o raycaster acerta, nada é desenhado). O shader MSDF do A-Frame 1.5
dividia por zero onde o campo de distância é plano, o que deixava pontos em
volta das letras. Ele ganhou um piso no `fwidth` (`05-headset.js`).

**Olhar e confirmação no headset.** O raio do olhar sai do olho, não de 1 m à
frente. Antes, nada a menos de 1 m respondia: da marca de observação, a coluna
de Retenção e o botão de som. O anel vai até o ponto mirado e fica âmbar sobre o
que a pinça pode confirmar. Em VR, quem confirma é o `selectstart` da sessão
(a pinça do próprio Quest e o gatilho), com uma janela refratária de 380 ms. Antes,
a mesma pinça chegava duas vezes (o `pinchstarted` do A-Frame e o "click" do
cursor), e o botão de som ligava e desligava na mesma pinça. O aperto (grip)
não confirma mais: a mão descansa nele segurando o controle.

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
2. **O `?v=22`** nos `<script>` e no `<link>` é cache-busting. Com o
   `node server.js` atual (que manda `no-store`) não precisa mais subir o número;
   só vale se você servir por outro servidor (ex.: `python -m http.server`).
