# Histórico do artefato

A versão vai gravada em cada sessão do estudo (`VERSAO_ARTEFATO`, em
`js-ambiente/01-telemetria.js`; evento `versao` e coluna `versao_artefato` da
análise). Cada versão usada com participantes tem uma tag no repositório.

## piloto-v1.1 — nada em cima de nada (2026-10-14)

Revisão de sobreposições. Um teste novo (`tests/sobreposicao.js`) varre as 192
combinações da imersiva (contexto × indicador × ano) na mesma superfície e do
ponto de vista de cada um dos 8 anos da faixa (texto tapado por um objeto à
frente e texto desenhado em cima de um objeto logo atrás), o treino e a 2D em
7 tamanhos de janela. O que ele achou na piloto-v1 e foi corrigido:

**Imersiva**

- **Nome e valor das regiões ficavam em cima dos blocos** (e o valor, atrás da
  placa, era tapado por ela, visto da faixa). Agora os dois ficam numa faixa
  própria de 13,5 cm entre a placa e a borda de quem olha, o nome a 4,5 cm da
  fileira da frente (mais perto, vista da faixa, a fileira encostava nas
  letras); nas regiões rasas (Sul, Sudeste) a placa recua 5,5 cm para caber.
- **Rótulos das colunas de indicador caíam em cima das regiões de trás.** Eles
  ficavam de pé no alto das colunas (até 1,2 m); agora ficam deitados na frente
  da base, dentro da face do tampo. As colunas ficaram mais baixas (22 cm, eram
  28), paralelas à faixa e com a base fina e rasa (8 mm × 5 cm: mais alta, a
  quina dela ficava por baixo do nome deitado, verde sobre verde); o halo do
  indicador ativo cobre a coluna e os rótulos.
- **De 2022 a 2024, a coluna de Eficiência tapava o nome e o valor do Sul** —
  justamente a resposta da T2. As colunas agora deixam uma janela na frente do
  Sul (`COLUNAS.xs`), e o logic-check confere de cada ano da faixa que nenhuma
  coluna fica entre o olho e o rótulo de uma região (`G10`).
- **Cartões de pior/melhor ano** saíam do gráfico (sobre os números do eixo e
  até para fora do painel) e cobriam a linha e os pontos. Agora um único
  posicionador, compartilhado com a 2D (`posicionarCartoes`, em
  `04-narrativa.js`), escolhe o lugar livre mais perto do ponto, dentro do
  gráfico, com folga para a espessura das linhas; qualquer pedaço de linha sob
  o cartão custa mais que pôr o cartão do outro lado. O cartão ficou 1 cm mais
  alto (o valor encostava na borda).
- **"2020 · Pandemia"** ficava em cima da linha nos indicadores de valor baixo
  (retenção). Agora fica acima do gráfico, como na 2D.
- **O "50" do eixo** encostava no anel do ano atual em 2017; os números do eixo
  se afastaram 2 cm.
- **Título da mesa** cortado pela borda de baixo do painel: o título desceu
  4 cm e o painel subiu 6 cm (elevação ainda entre −11° e +29°).
- **Placa da sala** ficava atrás do painel (que agora está sempre à vista):
  foi para a parede da esquerda, ao lado de 2017.
- **"< PASSADO" e "FUTURO >"** formavam uma linha só com o rótulo "CAMADA DE
  DADOS BRUTOS" do piso; agora ficam nas pontas da faixa, na linha dela. O
  disco de volta foi 20 cm para a direita.
- **Botão de som** 6 cm para fora da beira da mesa: o halo da coluna de
  Retenção encostava nele.

**2D**

- **A pergunta da tarefa ficava por cima do painel** (fixa no topo da janela).
  Agora ela entra no cabeçalho do painel, entre o título e o ano.
- **Conteúdo cortado em telas de notebook** (o texto do contexto precisava de
  rolagem interna em 1366 × 768). O palco agora repete a sala: painel em cima
  da mesa e a zona de contexto à direita, na altura toda. Cabe sem nada
  escondido de 1920 × 1080 até 1280 × 650.
- **Cartões do gráfico** pelo mesmo posicionador da imersiva e um pouco menores
  (124 × 34 px, letra de 12 px): nos gráficos baixos de notebook não havia
  lugar livre e o cartão cobria a referência nacional. Margens do gráfico
  maiores (o anel do ano atual encostava no "50", no "0" e nos anos).
- O ano grande e o evento do painel não se tocam mais.

**O que fica, de propósito** (visto de algum ponto da faixa, não é defeito de
layout): o rótulo de piso "CAMADA TEXTUAL · ANOTAÇÕES NARRATIVAS" some atrás
da mesa para quem está do lado de 2017 (a mesa é sólida; ele aparece a partir
de 2021), e o fio que liga a região aberta ao painel cruza, de alguns pontos,
o nome ou o valor de uma região de trás — ele ficou mais fino (7 mm) e mais
translúcido, para o texto continuar legível através dele.

## piloto-v1 — strollytelling (2026-10-14)

A escolha do conselho: **uma linha do tempo enxuta no piso**. O corpo faz a
história andar; o olhar e a pinça continuam escolhendo a região e o indicador.

**Imersiva**

- **Linha do tempo no piso** (`70-faixa.js`; geometria e regra em
  `00-planta.js`): 8 trechos de 20 cm, de 2017 a 2024, paralela à mesa. Andar
  de lado muda o ano, com 5 cm de folga nas fronteiras (sem pisca-pisca); fora
  do corredor o ano fica como está.
- **Revelação progressiva:** o gráfico se desenha até o ano em que a pessoa
  está; a mesa, a parede de 100 blocos, a manchete e as anotações acompanham o
  ano; os cartões de pior/melhor ano (o desfecho) só aparecem em 2024. Nenhum
  texto cita um ano que a pessoa ainda não percorreu.
- **O painel fica sempre à vista** e mostra o **Brasil** por padrão (a T1
  pergunta pelo Brasil). Abrir uma região faz o painel renascer sobre ela; o
  "x" volta ao Brasil (e só aparece com uma região aberta). O painel fica fixo,
  voltado para o centro da faixa, e mostra o ano em letra grande e o evento do
  ano.
- **O ano não se escolhe mais pelo olhar no gráfico** (os alvos de ano saíram):
  um caminho só para mudar o ano.
- **Âncora:** 2017 sob a cabeça, na 1ª entrada em VR e pelo botão da estação.
  O disco de volta (agora além de 2024, perto da zona de contexto) e o fim do
  treino **restauram** a âncora: a faixa fica no mesmo lugar da sala real.
- **Treino:** o 3º gesto virou um passo de lado sobre uma mini linha do tempo
  (2017 | 2018), vendo o ano mudar. No fim, a legenda pede para voltar ao 2017.
- A pessoa nasce sobre 2017 (não mais na porta); o disco da porta saiu.
- O botão de som foi para a borda da mesa, inclinado para a faixa (da faixa, a
  coluna de Retenção o tapava do olhar).

**Condição 2D (`controle-2d.html`)**

- **Scrollytelling:** palco fixo (painel, mesa, anotações e uma régua de anos)
  e uma trilha de 8 passos que rola; a posição da rolagem passa pela **mesma
  regra** da faixa (`anoNaFaixa`). Mesma revelação, mesmo Brasil por padrão,
  mesmo "x". Os botões de ano saíram.

**Estudo**

- Estação: botão **Ancorar 2017 aqui** (no lugar de "Levar à porta"), estado da
  âncora, **ano atual** e **anos visitados** ao vivo.
- Telemetria: `ano` nas amostras de 2 Hz (`pos`, `rolagem`); evento `ano` com
  o ano de onde veio, `via` (`posicao`, `rolagem`, `ancora`) e o x/z da cabeça;
  evento `faixa` (ancorada); o ano nas tarefas exibidas/encerradas; a seção sob
  o mouse na 2D. O "de onde veio" de cada evento passou do campo `origem`
  (que o servidor sobrescreve com participante/pesquisador) para `via`.
- Análise: zona `faixa`; anos visitados, se percorreu os 8, trocas de ano (e
  para trás), tempo em cada ano, se chegou a 2024 antes da T1, o ano de cada
  resposta; na 2D, tempo do mouse em cada camada.
- Roteiro: fita de 1,6 m no chão com as marcas dos anos, ancoragem, regra de
  prosseguir ou não e critérios de sucesso do piloto.

**Correções**

- Posições NaN: o utilitário de posição escrevia `"x: 1; y: 2; z: 3"`, que o
  A-Frame lê como `{NaN, 1, NaN}`. Uma entidade que inicializava tarde ficava
  em NaN, e o som posicional preso a ela lançava erro dentro do render — o laço
  de quadros parava (no headset, imagem congelada). Agora `"x y z"`, o som
  recusa fonte com matriz inválida, e o smoke confere que o render segue vivo.
- O acorde da parede não toca com uma fatia NaN.

**Testes:** logic-check (faixa `F1`–`F6`, revelação sem adiantar o futuro `D7`,
treino lateral), smoke (andar, histerese, desfecho em 2024, âncora), quest-sim
(`XR16`–`XR21`: âncora na entrada em VR, 2017→2024 em ordem, sem pisca-pisca,
10 s parado, fora do corredor, volta pelo disco), paridade 2D (72 estados com o
ano pelo corpo e pela rolagem), estudo-sim (`E12`–`E16`).

## piloto-v0 (2026-10-13)

Primeira versão para o piloto: sala única com as três camadas (mesa do mapa,
painel emergente, zona de contexto), olhar + pinça no Quest 2, treino de 3
gestos, estação do pesquisador, telemetria por participante, SSQ, tarefas com a
tolerância de 1 bloco, condição 2D com os mesmos textos e a análise
`estudo/analisar.js`. O ano era escolhido pelo olhar nos pontos do gráfico.
