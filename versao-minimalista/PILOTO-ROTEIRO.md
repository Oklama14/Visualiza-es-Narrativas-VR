# Roteiro do piloto (e da sessão de estudo)

Versão do artefato: **piloto-v1** (sala única "Camadas Retóricas Visíveis", com
a **linha do tempo no piso**: andar de lado muda o ano). O que mudou desde a
piloto-v0 está em `CHANGELOG.md`; a v0 continua na tag `piloto-v0`.

**Objetivo do piloto:** 2 ou 3 pessoas de fora do projeto, pelo menos uma que
**nunca usou VR**, ~30 min cada, antes da coleta. Não é coleta de dados para a
dissertação: é para achar atrito de uso, enjoo, texto ilegível e falhas no
protocolo. Depois do piloto: corrigir o que apareceu, subir a versão para
`estudo-v1` (em `js-ambiente/01-telemetria.js`, `VERSAO_ARTEFATO`) e congelar
com a tag `estudo-v1`, incluindo `controle-2d.html` e `dados.json`.

A sessão de estudo segue o mesmo roteiro; muda só o passo 8 (entrevista do
piloto).

---

## Antes do dia de coleta

- [ ] Testes verdes na pasta `versao-minimalista/`:
  ```
  node tests/logic-check-ambiente.js
  node tests/smoke-ambiente.js
  node tests/paridade-2d.js
  node tests/quest-sim.js
  node tests/estudo-sim.js
  ```
  (os quatro últimos precisam de `npm i -D playwright iwer`, uma vez)
- [ ] **Ensaio sozinho:** faça você mesmo uma sessão completa nas duas
  condições, pela estação, e rode `node estudo/analisar.js` sobre o seu próprio
  arquivo. Confira se cada variável dependente que o desenho do estudo prevê sai
  dele. Depois apague `dados-estudo/` (ou mova para fora da pasta) antes do
  primeiro participante.
- [ ] **Espaço físico medido.** A sala virtual tem 6,5 × 4,2 m, mais do que
  cabe numa sala comum: a pessoa anda de verdade sobre a linha do tempo e usa
  os discos do piso para ir mais longe. Reserve **pelo menos 2 × 2 m livres**,
  configure o limite do Quest (guardian) nessa área e deixe uma cadeira **ao
  lado**, fora dela.
- [ ] **Fita da linha do tempo no chão.** Uma linha reta de **1,6 m** de fita
  crepe, atravessando a área livre da esquerda para a direita (com pelo menos
  20 cm livres além de cada ponta), com uma marca a cada **20 cm** e os anos
  escritos: **2017** no primeiro trecho (à esquerda de quem olha para a
  frente) até **2024** no último. "Frente" é a direção para onde a pessoa vai
  olhar: escolha uma parede de referência e use sempre a mesma. A fita não
  aparece no headset; ela serve para você posicionar a pessoa e ver, de fora,
  em que ano ela está. O treino pede um passo de 30 cm para a direita a partir
  de 2017.
- [ ] **Versões congeladas.** Anote a versão do sistema do Quest e do navegador
  no primeiro dia e evite atualizar o headset até o fim da coleta. A telemetria
  grava o navegador de cada sessão (evento `versao`); a análise mostra a coluna
  `navegador`, para você conferir se mudou no meio.
- [ ] Rastreamento de mãos ligado no Quest; bateria cheia; lentes limpas;
  máscara/higienização conforme o protocolo.

## Preparo de cada sessão (5 min)

1. No notebook, na pasta `versao-minimalista/`:
   ```
   node server.js --quest
   ```
   Notebook e Quest no **mesmo Wi-Fi**.
2. No notebook, abra a **estação do pesquisador**:
   `http://127.0.0.1:4173/pesquisador.html` (tem que ser por `127.0.0.1`: a
   estação só funciona no próprio notebook).
3. Digite o código do participante (`P01`, `P02`...) e escolha a condição.
4. Abra a página do participante no endereço que a estação mostra:
   - **imersiva:** no navegador do Quest, `https://<ip>:4443/?estudo=1&p=P01`
     (na primeira vez: "Avançado" → "Continuar"); toque em **Entrar** e no botão
     **VR**;
   - **2D:** no computador do participante, `.../controle-2d.html?estudo=1&p=P01`.
5. Na estação, "Ao vivo" deve mostrar **Tela do participante: conectada**. Sem
   isso, as perguntas não chegam à tela do participante.
6. **Imersiva — ancorar a linha do tempo.** Com o headset na pessoa, em VR,
   posicione-a de pé sobre o trecho **2017** da fita, olhando para a parede de
   referência, e clique em **Ancorar 2017 aqui** (passo 3 da estação). A
   estação passa a mostrar "ancorada há … s" e **Ano atual: 2017**. Confira:
   peça um passo para a direita e veja o ano atual virar 2018 na estação.
   Ancore de novo sempre que a pessoa estiver sobre a fita de 2017 e a estação
   mostrar outro ano (o Quest pode recentrar sozinho, por exemplo depois de
   tirar o headset).

**Regra de prosseguir ou não (antes de cada sessão imersiva):** só siga para o
treino se (a) a âncora conferiu (2017 na fita = 2017 na estação, 2018 um passo
à direita), (b) o guardian cobre a fita inteira com folga e (c) a estação
mostra mais de 60 quadros por segundo. Se qualquer um falhar duas vezes,
reinicie a página do headset; se continuar, faça a sessão na condição 2D e
registre o motivo na estação.

Os dados vão sozinhos para `dados-estudo/P01.jsonl` no notebook (a pasta está
no `.gitignore` e nunca é servida). Se o Wi-Fi cair, o headset guarda o que
coletou e reenvia quando voltar.

## Sessão

A ordem das condições (quem começa pela 2D e quem pela imersiva) segue o
desenho do estudo. Na ordem cruzada, repita os passos 2 a 7 para a segunda
condição, trocando a condição na estação.

| # | Passo | Na estação | Tempo |
|---|---|---|---|
| 0 | TCLE e triagem do protocolo | marcar e **Registrar** | 3 min |
| 1 | SSQ antes (a pessoa responde, você marca) | **Salvar SSQ antes** | 2 min |
| 2 | Pôr o headset, ajustar a tira e o foco, mostrar o limite da área | — | 2 min |
| 3a | Só imersiva: pessoa sobre a fita de 2017 → ancorar e conferir | **Ancorar 2017 aqui** | 1 min |
| 3b | Treino (só imersiva): três gestos numa sala vazia; o 3º é um passo de lado | **Iniciar treino** | 2 min |
| 4 | Pessoa de volta sobre 2017 (imersiva) / página no topo (2D); exploração livre | **Marcar início** / **Marcar fim** | 5 min |
| 5 | Tarefas T1, T2, T3 | **Iniciar Tn** → opção falada | 3 min |
| 6 | Tirar o headset; SSQ depois | **Salvar SSQ depois** | 2 min |
| 7 | Encerrar | (opcional) baixar o `.jsonl` | — |
| 8 | Piloto: conversa curta (abaixo) | — | 5 min |

**Falas padronizadas** (leia igual para todos):

- Treino: *"Antes de começar, vamos treinar três gestos. Siga as instruções
  que aparecem embaixo da sua visão."*
- Exploração: *"Esta sala mostra a eficiência acadêmica da Rede Federal, de
  2017 a 2024. Explore como quiser por cinco minutos. Eu não vou ajudar durante
  esse tempo."* (igual nas duas condições: a forma de avançar no tempo — o
  passo de lado, a rolagem — a pessoa aprende no treino ou na instrução da
  página, não na fala)
- Tarefas: *"Agora vou fazer três perguntas. Cada uma aparece por escrito;
  responda em voz alta quando souber. Você pode continuar olhando o ambiente."*
  Leia a pergunta em voz alta também (nas duas condições).

### Critério de interrupção

Pare **na hora** se a pessoa relatar enjoo, tontura ou mal-estar, ou pedir
para parar: tire o headset, ofereça a cadeira e água, e na estação use
**Registrar interrupção** com o motivo. Aplique o SSQ depois mesmo assim. Não
retome a condição imersiva no mesmo dia.

O lembrete de pausa aparece sozinho no headset a cada 20 min.

## O que observar no piloto

Anote durante a sessão (a estação mostra ao vivo para onde a pessoa está
olhando, os quadros por segundo, as perdas de rastreio e as pinças sem alvo):

- **Treino:** em qual gesto travou? Quanto tempo levou cada um? (a análise traz
  `treino_pinca_s`, `treino_teleporte_s`, `treino_passo_s`) No passo de lado,
  a pessoa percebeu que o ano mudou?
- **Linha do tempo:** andou de lado sem ser lembrada? Chegou a 2024 (o
  desfecho)? Voltou no tempo? Algum ano "piscou" na fronteira? Pisou fora da
  área ou se aproximou do guardian? A estação mostra ao vivo o ano atual e os
  anos visitados.
- **Exploração:** foi até a zona de contexto (o texto à direita) ou ficou na
  faixa? Abriu o painel de alguma região? Voltou à faixa pelo disco verde?
- **Leitura:** conseguiu ler a legenda e o painel sem se inclinar? Algum texto
  borrado na borda da lente?
- **Tarefas:** onde procurou a resposta de cada uma? Em que ano estava ao
  responder? (T1: o pior ano da evasão do Brasil aparece no cartão do gráfico e
  no texto só quando a pessoa chega a 2024; antes disso, a linha mostra o
  caminho "até aqui". T2 e T3 perguntam por 2024.)
- **Conforto:** SSQ antes x depois; queixas espontâneas.

Perguntas da conversa final:

1. O que você entendeu que a sala mostrava?
2. O que foi mais difícil de fazer?
3. Teve algum momento em que você não sabia o que fazer?
4. Algum desconforto?
5. (imersiva) O que acontecia quando você andava para o lado?

### Critérios de sucesso do piloto (para manter a v1 na coleta)

A linha do tempo é a contribuição nova da v1; o piloto decide se ela fica.
Considere a v1 aprovada se, nas 2-3 pessoas do piloto:

- **todas** concluem o treino, e o passo de lado leva menos de 60 s
  (`treino_passo_s`);
- **pelo menos 2** percorrem os 8 anos na exploração sem você lembrar
  (`percorreu_todos`, `anos_visitados`) e chegam a 2024 antes da T1
  (`chegou_ao_fim_antes_T1`);
- **ninguém** relata o ano "piscando" nem se assusta com o limite do guardian;
- **ninguém** interrompe por desconforto, e o SSQ depois não sobe mais do que
  na v0 (se você tiver medido a v0).

Se a linha do tempo falhar (ninguém descobre o passo de lado, ou o andar
incomoda), o caminho de volta é a `piloto-v0` (o ano escolhido pelo olhar no
gráfico), já marcada no repositório. Anote o que falhou antes de decidir.

## Depois da sessão

```
node estudo/analisar.js                      # resumo no terminal
node estudo/analisar.js --csv resumo.csv     # uma linha por participante x condição
```

Saem do arquivo: SSQ (N, O, D, total e variação), treino, duração da
exploração, acerto e tempo de cada tarefa (com e sem a tolerância de 1 bloco)
e **o ano em que a pessoa estava ao responder**, metros a pé x teleportados,
tempo sobre a faixa, perto da mesa e da zona de contexto, tempo olhando para
cada tipo de alvo, quadros por segundo, perdas de rastreio e pinças sem alvo;
da linha do tempo (nas duas condições): anos visitados, se percorreu os 8,
trocas de ano (e quantas para trás), tempo em cada ano e se chegou a 2024
antes da T1; na 2D, tempo com o mouse em cada camada da página.

**Tolerância de 1 bloco (T1):** a evasão do Brasil foi 49,49% em 2017 e
49,09% em 2018 (diferença de 0,4 pp, menos de 1 bloco). A tarefa aceita os dois
anos e grava também o acerto estrito (`T1_estrita`), para você escolher o
critério na análise.

Guarde `dados-estudo/` fora do repositório (ele é público) conforme o plano de
armazenamento aprovado no CEP.
