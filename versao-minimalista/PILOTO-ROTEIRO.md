# Roteiro do piloto (e da sessão de estudo)

Versão do artefato: **piloto-v0** (sala única "Camadas Retóricas Visíveis").
O roteiro anterior descrevia a versão de 6 estações e foi substituído por este.

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
  cabe numa sala comum: a pessoa anda de verdade em volta do ponto onde está e
  usa os discos do piso para ir mais longe. Reserve **pelo menos 2 × 2 m livres**
  (o treino pede um passo de 0,6 m à frente), configure o limite do Quest
  (guardian) nessa área e deixe uma cadeira **ao lado**, fora dela.
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
| 3 | Treino (só imersiva): três gestos numa sala vazia | **Iniciar treino** | 2 min |
| 4 | Exploração livre | **Marcar início** / **Marcar fim** | 5 min |
| 5 | Tarefas T1, T2, T3 | **Iniciar Tn** → opção falada | 3 min |
| 6 | Tirar o headset; SSQ depois | **Salvar SSQ depois** | 2 min |
| 7 | Encerrar | (opcional) baixar o `.jsonl` | — |
| 8 | Piloto: conversa curta (abaixo) | — | 5 min |

**Falas padronizadas** (leia igual para todos):

- Treino: *"Antes de começar, vamos treinar três gestos. Siga as instruções
  que aparecem embaixo da sua visão."*
- Exploração: *"Esta sala mostra a eficiência acadêmica da Rede Federal. Explore
  como quiser por cinco minutos. Eu não vou ajudar durante esse tempo."*
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
  `treino_pinca_s`, `treino_teleporte_s`, `treino_passo_s`)
- **Exploração:** andou ou só teleportou? Foi até a zona de contexto (o texto à
  direita) ou ficou só na mesa? Abriu o painel de alguma região?
- **Leitura:** conseguiu ler a legenda e o painel sem se inclinar? Algum texto
  borrado na borda da lente?
- **Tarefas:** onde procurou a resposta de cada uma? (T1 está escrita na zona
  de contexto quando nenhuma região está em foco e o indicador é Evasão)
- **Conforto:** SSQ antes x depois; queixas espontâneas.

Perguntas da conversa final:

1. O que você entendeu que a sala mostrava?
2. O que foi mais difícil de fazer?
3. Teve algum momento em que você não sabia o que fazer?
4. Algum desconforto?

## Depois da sessão

```
node estudo/analisar.js                      # resumo no terminal
node estudo/analisar.js --csv resumo.csv     # uma linha por participante x condição
```

Saem do arquivo: SSQ (N, O, D, total e variação), treino, duração da
exploração, acerto e tempo de cada tarefa (com e sem a tolerância de 1 bloco),
metros a pé x teleportados, tempo perto da mesa e da zona de contexto, tempo
olhando para cada tipo de alvo, quadros por segundo, perdas de rastreio e
pinças sem alvo; na 2D, tempo em cada seção da página.

**Tolerância de 1 bloco (T1):** a evasão do Brasil foi 49,49% em 2017 e
49,09% em 2018 (diferença de 0,4 pp, menos de 1 bloco). A tarefa aceita os dois
anos e grava também o acerto estrito (`T1_estrita`), para você escolher o
critério na análise.

Guarde `dados-estudo/` fora do repositório (ele é público) conforme o plano de
armazenamento aprovado no CEP.
