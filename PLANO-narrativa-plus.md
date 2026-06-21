# Plano de implementação — C. Narrativa+ (aprofundar o storytelling)

**Objetivo:** passar de "mostrar os dados" para "guiar a construção de sentido". As partes
anteriores já dão os gêneros (mapa, gauges, gráfico anotado, composição, small multiples) e o
arco do tour. A etapa C reforça o **tecido narrativo** que liga essas peças: beats ancorados
nos dados, fio causal entre indicadores, agência do leitor (perguntas-guia) e uma síntese
memorável — tudo **derivado dos dados** (nenhuma afirmação fixa) e dentro da restrição de
A-Frame como única lib externa, mantendo desktop + VR.

Referências: martini-glass author→reader e *drill-down stories* (Segel & Heer); retórica de
visualização; *data visceralization* (Lee et al.).

---

## Sub-features (prioridade decrescente)

### C1 — Beats narrativos ancorados nos dados ("momentos")
Estrutura `MOMENTOS` calculada da série de cada contexto/indicador (não escrita à mão):
pico/vale, **maior variação ano-a-ano**, **ano do evento (2020)** e **recuperação pós-evento**.
Durante a abertura guiada (martini glass), cada momento vira um callout sequenciado com uma
**frase de uma linha derivada do dado** (reusa `computeNarrative`/`buildCallout`). Dá ritmo e
"capítulos" à leitura autoral antes de liberar a exploração.

### C2 — Fio causal entre indicadores (expande A4)
No clímax, tornar explícita a relação evasão ↔ conclusão ↔ eficiência usando a fórmula oficial
já implementada: uma frase encadeada calculada ("a evasão de X% puxa a eficiência para Y%") +
destaque visual conectando os três gauges/valores. Reforça *por que* os números se movem juntos.

### C3 — Tour multi-gênero
Hoje as cenas do tour são painel de texto ou gráfico. Permitir cenas do **tipo `multiplos`** e
**tipo `composicao`**, reaproveitando `enterMultiplos`/`enterComposicao` como beats do arco —
variedade de gêneros dentro de um mesmo fio condutor (panorama → abismo regional → para onde
vão os alunos → síntese).

### C4 — Perguntas-guia (agência do leitor)
Ao fim de uma cena, oferecer 1–2 perguntas curtas ("Por que 2020?", "Qual região mais sofreu?")
que levam a um beat específico (drill, small multiples ou um momento). Implementa *drill-down
stories*: o leitor escolhe o próximo passo sem sair do arco.

### C5 — Síntese memorável (takeaway)
Cena de fechamento com uma **frase-dado** calculada do contexto explorado + um número-âncora
visceral (ex.: "de cada 100 ingressantes, ~X concluem"), derivado de `series.contagens`.
Aumenta a retenção da mensagem e fecha o loop com o CTA → mapa.

### C6 — (transversal) Acessibilidade narrativa
Legendas sincronizadas da narração (Web Speech API) num HUD 2D + ritmo da abertura configurável
(pausar/continuar). Ajuda inclusão e leitura em VR sem áudio.

---

## Arquitetura / arquivos (reuso máximo)
- **app.js:**
  - `MOMENTOS`/`computeMomentos(ctx, key)` — deriva os beats da série (C1). Frases via
    helpers existentes (`computeNarrative`, `buildCallout`, `absoluteText`).
  - `playGuided`/`guidedToken` — encadeia os momentos como passos (C1); cuidar do token ao
    trocar de etapa (regra existente).
  - `buildEfficacyPanel`/`updateCompEfficacyConnective` (A4) — base do fio causal (C2).
  - `TOURS` + `tourGoTo`/`showTourPanel` — novo `tipo` de cena `multiplos`/`composicao` (C3);
    `endTour` já trata cenas sem gráfico.
  - `buildGuidedQuestions()` + `.narrative-clickable` (ou reuso de `.tour-clickable`) para as
    perguntas-guia (C4); `setInteractionMode` ganha o modo.
  - `buildSintese(ctx)` — cena de fechamento com frase-dado + número-âncora (C5).
  - Legendas: `setCaption(text)` ligado aos eventos da narração (C6).
- **index.html:** `#guidedQuestions` (botões), `#captionPanel` (HUD 2D), entradas de cena no
  tour. **styles.css:** estilos de legenda/perguntas. **dados.json:** sem mudança de schema
  (tudo derivado das `series`/`contagens`; novos eventos só com fonte verificável).

## Integridade (não negociável)
Toda frase é **computada dos dados** — nenhuma afirmação fixa. Eventos de contexto só com fonte
verificável (hoje, apenas 2020). Sem libs externas além do A-Frame. Manter desktop + VR e o
padrão de `setInteractionMode` (sem clickables fantasmas em objetos ocultos).

## Testes
- **logic-check (novo bloco):** `computeMomentos` determinístico para os 70 contextos × 4
  indicadores; frases sem `NaN/undefined`; números do fio causal coerentes com a fórmula;
  número-âncora da síntese consistente com `contagens`.
- **smoke-test:** cena de tour `multiplos`/`composicao` abre e volta ao arco; pergunta-guia
  navega ao beat certo; legenda aparece/atualiza; abertura guiada percorre os momentos e o
  "Pular" encerra. Higiene de clickables por modo.

## Fases sugeridas
1. **C1** momentos + abertura guiada por capítulos (maior impacto, baixo risco).
2. **C2** fio causal no clímax (reusa A4).
3. **C5** síntese de fechamento + número-âncora.
4. **C3** cenas multi-gênero no tour.
5. **C4** perguntas-guia (agência).
6. **C6** legendas + ritmo (acessibilidade), transversal.
7. **Verificação:** `node --check`, `logic-check`, `smoke-test`, atualizar `CLAUDE.md`.

## Riscos
- **Carga cognitiva / "muita narração":** manter frases curtas, beats poucos e puláveis.
- **Sincronia da narração e legendas** (Web Speech varia por navegador): legenda dirigida por
  eventos `boundary`/`end`, com fallback por tempo.
- **FOV/legibilidade em VR** das novas cenas e perguntas: validar posições no logic-check.
- **Deriva de lógica** entre app e testes (já vista no small multiples): centralizar as funções
  de narrativa e exercitá-las pelo mesmo caminho nos testes.
