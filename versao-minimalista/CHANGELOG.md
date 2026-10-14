# Histórico do artefato

A versão vai gravada em cada sessão do estudo (`VERSAO_ARTEFATO`, em
`js-ambiente/01-telemetria.js`; evento `versao` e coluna `versao_artefato` da
análise). Cada versão usada com participantes tem uma tag no repositório.

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
