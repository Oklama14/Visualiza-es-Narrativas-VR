# Roteiro do piloto informal (Fase 5.3)

2-3 pessoas fora do projeto, ~25 min cada, ANTES do estudo real (set/2026).
O objetivo NAO e coletar dados: e achar atrito de UX, cinetose e ilegibilidade.

## Preparo (5 min, antes de cada sessao)

- [ ] `node tests/logic-check.js` passou
- [ ] `node tests/smoke-estacoes.js` passou (desktop)
- [ ] Servidor: `python -m http.server 4174` na pasta `versao-minimalista/`
- [ ] Desktop: abrir SEM `?estudo=1` (piloto nao coleta telemetria)
- [ ] VR: headset conectado, espaco livre de ~3x3 m, guardian configurado
- [ ] Cronometro + este roteiro impresso/aberto

## Sessao (roteiro)

1. **Onboarding (2 min)** - deixe a pessoa ler sozinha. Observe: ela entendeu
   que as etapas sao lugares? Que da para caminhar?
2. **Livre (5 min)** - "Explore como quiser." NAO ajude. Anote: primeiro
   caminho escolhido (historia ou mapa?), se caminhou ou so clicou, onde travou.
3. **Tarefa dirigida (5 min)** - "Descubra em que ano a evasao do Brasil foi
   mais alta." Anote o caminho percorrido e o tempo.
4. **Corredor do Tempo (3 min)** - "Percorra os anos andando." Observe: a
   pessoa associa a posicao do corpo ao ano? O callout aparecer ao chegar fez
   sentido ou passou despercebido?
5. **Escala real (2 min)** - na composicao, peca para achar o botao "Ver em
   escala real". Reacao a muralha de blocos? (e o momento-tese do artigo)
6. **Tour guiado (5 min)** - "Panorama Nacional" do inicio ao CTA.
7. **Conversa (3 min)** - perguntas abaixo.

## O que observar por estacao

| Estacao | Atencao para |
|---|---|
| Inicio | entende as 2 opcoes? ve a trilha no piso? |
| Mapa | hotspots faceis de acertar? preview legivel? |
| Indicadores | leu as colunas como %? painel de hover atrapalha? |
| Corredor | caminhar = tempo ficou claro? texto legivel da faixa? |
| Composicao | entendeu 1 bloco = 1%? e a escala real? queda da evasao percebida? |
| Comparacao | leu a ordenacao (lider -> lanterna)? micro-colunas ajudam? |

## Sinais de alerta (interromper se necessario)

- Cinetose: palidez, suor, "posso tirar?" -> pausa imediata, anotar quando.
- Texto: inclinar o corpo para frente para ler = fonte pequena demais.
- Audio: pergunta "que barulho e esse?" = sonificacao confusa, nao informativa.

## Perguntas pos-sessao

1. "O que voce descobriu sobre os dados?" (compreensao espontanea)
2. "Onde ficava a evasao mais alta? Aponte na sala." (memoria espacial!)
3. "O que os blocos significavam?" (visceralizacao)
4. "Os sons ajudaram, atrapalharam ou passaram despercebidos?"
5. "O que voce tiraria?" (minimalismo pela voz do usuario)

## Sintoma -> ajuste rapido

| Sintoma | Onde mexer |
|---|---|
| nao percebe que pode andar | onboarding/roomSign; trilha mais brilhante (`buildWayfinding`) |
| estacao ativa cedo/tarde demais | `radius`/`hysteresis` nos containers `stX` (index.html) |
| anos trocam nervosos no corredor | folga da histerese em `startWalkLoop` (0.05) |
| texto ilegivel | `width` dos `a-text` da estacao citada |
| som cansa | ganhos em `js/02-audio.js` (drone 0.035, notas 0.07) |
| cinetose no desktop->VR | conferir WASD desligado em VR (`setWasdEnabled`) |
| muralha da escala real estoura o teto | `ESCALA.cols`/`gap` em `js/07-composicao.js` |
