# Laboratório VR de Dados — Guia de Apresentação

**Eficiência Acadêmica da Rede Federal · Plataforma Nilo Peçanha (SETEC/MEC)**

Documento de apoio para apresentação da ferramenta. Explica os principais pontos da
plataforma, como chegar a cada um, qual **técnica de visualização narrativa** ele emprega e
**por que isso ajuda quem está visualizando**.

---

## 1. O que é a plataforma

Uma experiência educacional em **realidade virtual / WebXR** (A-Frame puro, sem frameworks)
que transforma os indicadores de eficiência acadêmica da Rede Federal — evasão, conclusão,
eficiência e retenção, por campus, 2017–2024 — em uma **narrativa imersiva e explorável**.

A premissa de pesquisa é a de **visualização narrativa** (*narrative visualization*, Segel &
Heer, 2010) aplicada a um ambiente 3D: em vez de só exibir gráficos, a ferramenta conduz o
usuário por uma história ancorada nos dados, alternando momentos guiados pelo autor e momentos
de livre exploração pelo leitor (o padrão **martini-glass**). O ambiente imersivo agrega o que
a literatura chama de *immersive analytics* e *data visceralization*: dar **escala corporal e
presença espacial** aos números, para que a desigualdade e a perda de estudantes sejam
**sentidas**, não apenas lidas.

Todos os textos, manchetes e anotações são **calculados a partir dos dados** — não há
afirmação fixa escrita à mão. A única fonte é a base oficial da PNP; o único evento de
contexto anotado (2020/pandemia) tem fonte verificável.

## 2. Como acessar

No diretório do projeto:

```
python -m http.server 4173 --bind 127.0.0.1
```

e abrir `http://127.0.0.1:4173/`. Funciona em **desktop** (mouse: passar o cursor aponta,
clique entra) e em **VR/WebXR** (cursor de mira/*gaze* com *fuse*). Na primeira visita aparece
um onboarding 2D; o botão **"?"** reabre as instruções a qualquer momento.

---

## 3. Os pontos principais — onde ficam, o que são e por que ajudam

### A. Entrada: o Mapa do Brasil (seleção de contexto)

**Como chegar:** é a primeira tela após o onboarding.
**O que é:** um mapa do país com cinco regiões; **olhar/passar o mouse** sobre uma região
revela um cartão com Eficiência e Evasão de 2024 e um comentário automático ("acima/abaixo da
média nacional"). Ao lado, botões **Brasil**, **Tour guiado** e **Comparar regiões**.
**Técnica narrativa:** *olhar-revelar* (detalhe sob demanda) sobre uma base geográfica — um
ponto de partida que já comunica o "abismo regional" antes de qualquer clique.
**Benefício:** orienta o usuário (dá um mapa mental do todo), reduz carga cognitiva e deixa a
pessoa escolher o próprio caminho — recorte nacional, regional ou comparativo.

### B. Tour guiado (as histórias curadas)

**Como chegar:** botão **"Tour guiado"** no mapa. Três histórias: *Panorama Nacional*, *O
Abismo Regional* e *A Jornada do Aluno*.
**O que é:** uma sequência de cenas com **arco narrativo** — abertura (tese) → desenvolvimento
→ **clímax** (marcado como "ponto de virada") → fechamento (síntese + chamada para ação que
devolve ao mapa). As cenas podem ser painéis de texto, a linha do tempo, os indicadores ou a
comparação regional. Ao fim de algumas cenas surgem **perguntas-guia** ("Por que 2020?",
"Quem mais sofreu?") que levam o usuário ao próximo beat.
**Técnica narrativa:** *slideshow* com estrutura dramática + *drill-down story* (o leitor
escolhe para onde aprofundar). É a forma mais "autoral" da visualização narrativa.
**Benefício:** garante que mesmo quem nunca viu os dados saia com uma **mensagem clara e
memorável**; o arco (tensão → resolução) e as perguntas dão engajamento e sensação de agência.

### C. Indicadores (medidores radiais / *gauges*)

**Como chegar:** escolher **Brasil** ou uma região no mapa → os 4 indicadores aparecem como
**medidores radiais** sobre pedestais, na sala escura.
**O que é:** cada indicador (evasão, conclusão, eficiência, retenção) é um arco que preenche de
0 a 100% com o valor de 2024 e o número no centro — **mesma linguagem visual para os quatro**,
o que os torna diretamente comparáveis. Passar o mouse abre um painel interpretativo; clicar
abre a linha do tempo. Existe ainda um **fio causal** que conecta evasão, conclusão e retenção
à eficiência (a fórmula oficial), explicando *por que* os números se movem juntos.
**Técnica narrativa:** *painel/pôster particionado* com codificação unificada + anotação
causal.
**Benefício:** comparar grandezas distintas vira percepção imediata (todos na mesma escala);
o fio causal combate a leitura ingênua de "indicadores soltos" e mostra a relação entre eles.

### D. Linha do tempo (gráfico anotado + abertura guiada)

**Como chegar:** clicar em qualquer medidor de indicador.
**O que é:** um gráfico de tendência 2017–2024 com grade de %, marcadores por ano, linha de
tendência e **callouts** de pico/vale com manchete narrativa automática. Ao abrir, roda a
**abertura guiada (martini-glass)**: a série é apresentada em **"momentos"** (início, maior
variação ano-a-ano, choque de 2020, melhor/pior momento, cenário atual), cada um com uma frase
derivada do dado. Depois a exploração fica livre: navegar por ano, **comparar com a média do
Brasil**, ouvir a **narração em áudio** (com **legendas** sincronizadas) e reproduzir a
abertura. Cada ano também mostra **números absolutos** (ex.: "67.876 evadidos de 530.650
matrículas") e a anotação do evento de 2020.
**Técnica narrativa:** *gráfico anotado* + **martini-glass** (autor conduz, depois libera o
leitor) + anotações interpretativas calculadas.
**Benefício:** une o melhor dos dois mundos — uma leitura guiada que não deixa ninguém perdido,
seguida de exploração livre para quem quer investigar; os números absolutos e o evento de 2020
dão **contexto humano e histórico** ao percentual.

### E. Composição "Para onde vão os alunos"

**Como chegar:** a partir dos indicadores, a etapa de composição (situação dos estudantes).
**O que é:** barras empilhadas a 100% por ano (concluídos / retidos / evadidos) + anel do ano
em foco e números absolutos, usando as contagens brutas. Há ainda uma camada **visceral**:
partículas que representam estudantes, dando volume físico à proporção que conclui x evade.
**Técnica narrativa:** *part-to-whole* (parte-todo) + *data visceralization* (escala corporal
do dado).
**Benefício:** responde de forma concreta "para onde vão os estudantes"; ver a fatia que evade
como **massa de partículas** torna a perda tangível — mais marcante que uma porcentagem.

### F. Comparação regional (*small multiples*)

**Como chegar:** botão **"Comparar regiões"** no mapa.
**O que é:** uma grade 3×2 de mini-gráficos (Brasil + 5 regiões) do **mesmo indicador na mesma
escala 0–100%**. Cada painel traz a linha da região (cor do indicador) e a **linha tracejada
de referência da média nacional**, além do nome e valor de 2024. Um seletor troca o indicador
e **reordena** os painéis por desempenho; uma manchete automática anuncia o abismo ("X pp de
diferença"). Clicar num painel entra direto na linha do tempo daquela região.
**Técnica narrativa:** *small multiples* (Tufte) — muitos gráficos pequenos, idênticos em forma
e escala, variando só os dados.
**Benefício:** a desigualdade entre regiões vira **percepção imediata** (a mesma escala não
deixa enganar); a ordenação por valor escancara o ranking, e o clique liga a visão macro ao
detalhe sem perder o contexto.

### G. Recursos transversais (apoio à navegação e à leitura)

A qualquer momento o usuário conta com: **breadcrumb** no topo (sempre mostra onde está — ex.:
"Mapa › Comparar regiões › Eficiência"); **mini-mapa** sob demanda para trocar de
região/contexto sem voltar ao início (*hot-swap*); **notas explicativas** (HUD) que explicam,
por etapa, o conceito da visualização e o que os números significam; **transições animadas** e
uma **sala** de referência (piso, paredes, luz) que evita a sensação de flutuar — importante
para conforto em VR.
**Benefício:** reduzem desorientação (*wayfinding*), tornam o conceito acessível a quem não é
da área de dados e mantêm a experiência confortável e contínua.

---

## 4. Mapa rápido: ponto → gênero narrativo → benefício

| Ponto da plataforma | Como chegar | Técnica de visualização narrativa | Benefício principal |
|---|---|---|---|
| Mapa do Brasil | Tela inicial | Olhar-revelar sobre base geográfica | Visão do todo + escolha de caminho |
| Tour guiado | Botão "Tour guiado" | Slideshow com arco + drill-down story | Mensagem clara e memorável; agência |
| Indicadores (gauges) | Brasil/região no mapa | Pôster particionado + anotação causal | Comparação imediata + relação entre indicadores |
| Linha do tempo | Clicar num gauge | Gráfico anotado + martini-glass | Leitura guiada e depois exploração livre |
| Composição | A partir dos indicadores | Parte-todo + data visceralization | Torna a evasão tangível |
| Small multiples | Botão "Comparar regiões" | Small multiples (Tufte) | Desigualdade regional como percepção |
| Breadcrumb/mini-mapa/notas | Sempre disponíveis | Wayfinding + andaime explicativo | Orientação e acessibilidade |

---

## 5. Integridade e fonte dos dados

A base é a **Plataforma Nilo Peçanha** (SETEC/MEC), nível campus, 2017–2024 — 5 regiões e 64
instituições. Como os indicadores são percentuais e **não podem ser somados/mediados**, a
plataforma agrega as **contagens brutas** (concluídos, evadidos, retidos) e recalcula os
percentuais e o Índice de Eficiência pela **fórmula oficial**. Toda manchete, callout e síntese
é **derivada desses números** — não há texto fixo "chutado". O app sinaliza possíveis
inconsistências da base (ex.: IFRS) e só anota eventos de contexto com fonte verificável.

## 6. Qualidade e verificação (o que já foi testado)

A plataforma tem **dois níveis de teste automatizado**:

- `tests/logic-check.js` (sem navegador): exercita **70 contextos × 4 indicadores** e valida
  integridade das séries, narrativa automática, geometria do gráfico, campo de visão (FOV),
  contagens absolutas, eventos, mapa, *small multiples* (ordenação e coerência rótulo×dado) e
  os elementos da Narrativa+ (momentos, fio causal, síntese). **Resultado atual: 0 falhas, 0
  avisos.**
- `tests/smoke-test.js` (Chrome/Edge *headless*): valida a cena A-Frame e os fluxos de
  interação ponta a ponta. *Requer um navegador instalado e deve ser executado localmente.*

Nesta rodada também foi feita uma checagem estática que confirmou: sintaxe válida em todos os
arquivos e **todas as 127 referências de elementos da interface existem** (sem referências
quebradas).

---

## 7. Sugestão de roteiro para a apresentação (~5 min)

1. **Abrir no mapa** e explicar a premissa: dados oficiais virando narrativa imersiva (15s).
2. **Tour guiado → "O Abismo Regional"**: deixar o arco contar a história até o clímax (90s).
3. **Comparar regiões (small multiples)**: mostrar a desigualdade na mesma escala e clicar num
   painel para cair na linha do tempo (60s).
4. **Linha do tempo**: rodar a abertura guiada (momentos) e ativar **Comparar com o Brasil** +
   narração/legendas (60s).
5. **Composição "Para onde vão os alunos"**: encerrar com a camada visceral — a evasão como
   massa de estudantes (45s).
6. Fechar com a **mensagem de pesquisa**: a visualização narrativa imersiva melhora a
   compreensão porque combina condução autoral, exploração livre e presença espacial.
