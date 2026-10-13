# Proposta de reestruturacao dos totens (medidores de indicador)

> Documento de estudo. **Nada aqui foi aplicado ao codigo** - serve para escolhermos
> um caminho antes de mexer em `createIndicatorObject`, `GAUGE` e `dataPositions`.

## 1. Como esta hoje

Quatro totens iguais em arco (`dataPositions`: x -2,7 / -0,9 / 0,9 / 2,7):
pedestal + anel girando + haste + **medidor radial** (`GAUGE`: rIn 0,42, rOut 0,58,
y 1,45) com o valor de 2024 no centro e o rotulo embaixo.

### O que funciona

- Linguagem unica para os 4 indicadores (mesma escala 0-100%), entao sao comparaveis.
- Hitbox generoso (1,35 x 2,23) - bom para gaze em VR.
- O anel girando e o brilho dao vida ao palco sem custo de performance.

### Onde trava

| Problema | Efeito na leitura |
| --- | --- |
| Angulo e um canal visual impreciso | Diferenca entre 69,9% e 73,3% quase nao aparece |
| Retencao fica em ~4,5% | O arco vira um risco fino, parece "sem dado" |
| Os 4 totens tem o mesmo peso visual | A Eficiencia (a protagonista, resultado dos outros 3) nao se destaca |
| A relacao causal nao esta na forma | Foi preciso pendurar linhas 3D - que cruzavam o medidor de Conclusao |
| Rotulo "Taxa de ..." repetido 3x | Ruido; o que diferencia vem depois da palavra repetida |

## 2. Opcoes

### Opcao A - Hierarquia espacial (palco em "T")

Eficiencia sozinha ao centro, maior e mais a frente; os tres fatores numa fileira
atras, menores e agrupados.

- **Ganho:** a equacao "3 fatores -> 1 resultado" fica legivel pela posicao, sem
  precisar de linha nenhuma. O painel-equacao do tour vira reforco, nao muleta.
- **Mexe em:** `dataPositions` (posicoes + escala por papel), `GAUGE` (raio por papel),
  hitboxes e FOV; `buildIndicatorLinks` pode virar 3 setas curtas apontando ao centro.
- **Custo:** medio. **Risco:** recalcular folgas de clique e campo de visao.

### Opcao B - Trocar o medidor radial por barra vertical (recomendada junto com A)

Cada totem passa a ser uma coluna 0-100% com trilho de referencia, marca da media
nacional e o valor no topo.

- **Ganho:** altura e o canal visual mais preciso que existe para comparar valores;
  4,5% de retencao vira uma barra baixa (legivel) em vez de um fio no anel; a marca da
  media nacional adiciona contexto sem texto novo.
- **Mexe em:** `createIndicatorObject` (geometria), rotulos e o texto do valor.
- **Custo:** medio-baixo (a-box + trilho + marca). **Risco:** baixo.

### Opcao C - Totem com micro-serie (sparkline) na face

O totem mostra o valor de 2024 **e** a mini-serie 2017-2024.

- **Ganho:** antecipa a linha do tempo; a escolha do indicador ja vira leitura.
- **Mexe em:** reaproveita `buildMiniChart` (o mesmo do small multiples).
- **Custo:** medio. **Risco:** poluicao visual - exige cortar texto do totem.

### Opcao D - Totem "vivo" (100 voxels)

Coluna de 100 blocos preenchida proporcionalmente, na mesma linguagem da etapa
"Para onde vao os alunos" (1 bloco = 1% dos estudantes).

- **Ganho:** coerencia narrativa forte entre etapas e humanizacao do numero.
- **Custo:** 4 x 100 blocos no palco (a composicao ja faz 8 x 100, entao e viavel),
  mas exige manter os voxels fora do subtree clicavel, como ja e feito la.
- **Risco:** medio em performance no headset.

### Opcao E - Ajustes minimos (se preferir baixo risco agora)

1. Rotulo curto: "Evasao / Conclusao / Eficiencia / Retencao" (ja existe
   `rotuloIndicadorCurto`) com uma linha de apoio "de 100 alunos, 25 evadem".
2. Marca da media nacional no trilho do medidor (uma risquinha) - contexto de graca.
3. Eficiencia com pedestal mais alto e arco mais grosso: hierarquia sem mudar layout.
4. Reordenar para Conclusao - Retencao - Evasao (fatores) com Eficiencia destacada.

## 3. Recomendacao

**A + B** (hierarquia espacial com barras verticais), com os itens 1 e 2 da opcao E
embutidos. E o melhor retorno por esforco: resolve precisao de leitura, resolve o
"sumico" da retencao e faz a relacao causal existir na propria cena.

## 4. Se formos em frente - roteiro sugerido

1. Definir `TOTEM` no `app.js` (altura, largura, trilho, escala por papel) do mesmo
   jeito que `CHART`, `COMP` e `MULTIPLOS` - nada de numero solto no meio da funcao.
2. Reescrever `createIndicatorObject` mantendo classe `.indicator-clickable` e o
   hitbox unico (raycaster e gaze dependem disso).
3. Recalcular `dataPositions` e conferir folga de clique entre vizinhos.
4. Rodar `node .\tests\layout-check.js` (bloco 3 e 4 cobrem essa tela) e
   `node .\tests\logic-check.js`.
5. Rodar `node .\tests\smoke-test.js` - ele entra nos 4 indicadores e testa o painel
   de hover; e o teste que pega quebra de interacao.
6. Conferir em VR: rotulo legivel a 3 m e fuse do gaze acertando o alvo certo.
