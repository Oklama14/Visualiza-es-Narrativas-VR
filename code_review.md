# Code Review: Laboratório VR de Dados

Realizei uma análise profunda da base de código (`app.js`, `build-dados.js`, testes e HTML), executei os testes de lógica e smoke, além de gerar os dados novamente. O sistema se mostrou extremamente sólido, compatível com as restrições (A-Frame puro sem dependências extras, híbrido Desktop/VR), mas possui pontos de atenção que afetam a performance e a robustez em fluxos de exceção.

Abaixo estão os achados, priorizados do mais crítico ao menor, com as devidas sugestões de *patch*.

---

### 1. Vazamento de memória (GPU/Three.js) com `.innerHTML = ""` (Alta Prioridade)
**Arquivo:** `app.js` (linhas 234, 260, 337, 557, 813, 991, 1016, 1205, etc.)
**Problema:** A aplicação destrói e recria frequentemente os nós de gráficos, marcadores e cards de contexto manipulando a propriedade `innerHTML = ""`. No A-Frame (e no Three.js por baixo), remover elementos dessa forma pode impedir que o navegador dispare corretamente as rotinas de limpeza (`disconnectedCallback`) de geometria e materiais na memória de vídeo, causando vazamentos em sessões prolongadas de exploração.
**Correção Sugerida:**
Criar uma função utilitária global para remover filhos de forma que o ciclo de vida do A-Frame seja respeitado, e substituir os `innerHTML = ""` por ela.
```javascript
function clearAFrameChildren(parent) {
  while (parent.firstChild) {
    parent.removeChild(parent.firstChild);
  }
}
// Aplicar em todo lugar que zera entidades visuais:
// clearAFrameChildren(dom.indicatorObjects);
// clearAFrameChildren(dom.chartGrid);
```

### 2. Condição de corrida / *Visual Pop-in* durante o Tour Guiado (Média-Alta)
**Arquivo:** `app.js` (linhas 1365 e 1607)
**Problema:** Quando a navegação avança no Tour Guiado (`tourGoTo(n)` chama `await enterTimeline(..., true)`), o parâmetro `skipGuided` ativa os controles clássicos da linha do tempo (`dom.scrubberRow` e `dom.actionRow`). Durante a execução do `fadeFromBlack()`, o usuário enxerga rapidamente esses controles. Apenas quando o *fade* acaba o motor do tour oculta esses controles forçadamente. Isso gera uma interface "piscando" com controles indevidos durante as transições de cena.
**Correção Sugerida:**
Em `enterTimeline`, a visibilidade dos controles normais deve respeitar a flag `state.tourActive`.
```javascript
// Onde está:
setEntityVisible(dom.scrubberRow, true);
setEntityVisible(dom.actionRow, true);

// Alterar para:
setEntityVisible(dom.scrubberRow, !state.tourActive);
setEntityVisible(dom.actionRow, !state.tourActive);
```
*(Fazer o mesmo para `dom.compActionRow` dentro de `enterComposicao`)*.

### 3. Higiene de Interação: Risco de Clique-Fantasma em `endTour` (Média)
**Arquivo:** `app.js` (linha 1610)
**Problema:** Ao encerrar o tour e devolver o usuário à linha do tempo via `endTour()`, o código invoca `setInteractionMode("timeline")`. Essa função reativa a classe `.clickable` em *todos* os elementos marcados como `.timeline-clickable`. Isso inclui o botão invisível de "#ctrlSkip" (Pular introdução). Como o raycaster mira unicamente na classe, o botão invisível fica sujeito a capturar cliques acidentais.
**Correção Sugerida:**
Reforçar a exclusão do controle após a invocação do modo de interação.
```javascript
if (state.stage === "timeline") {
  setEntityVisible(dom.scrubberRow, true);
  setEntityVisible(dom.actionRow, true);
  dom.guidedHint.setAttribute("value", "Explore: navegue pelos anos, compare contextos e ouca a narrativa.");
  setInteractionMode("timeline");
  setSubtreeClickable(dom.ctrlSkip, false); // <-- Adicionar esta linha
}
```

### 4. Acessibilidade Visual: Paleta de Daltonismo (Média-Baixa)
**Arquivo:** `build-dados.js` (linha 209 e ss.)
**Problema:** As cores base escolhidas para Evasão (`#ff6b6b`, Vermelho) e Conclusão (`#3ad29f`, Verde Claro) são a combinação mais difícil para portadores de Deuteranopia (o tipo mais comum de daltonismo). Num app em VR altamente dependente do brilho da cor para identificar os pedais radiais (Gauges), isso afeta criticamente a UX.
**Correção Sugerida:**
Migrar para tons da paleta _Okabe-Ito_ (segura para daltônicos):
- Evasão: `#D55E00` (Vermillion) ou `#E69F00` (Orange)
- Conclusão: `#009E73` (Bluish Green)
*(Após alterar, é necessário rodar `node build-dados.js` novamente)*.

---

### Resumo dos Pontos Avaliados e Validados (Sem Erros)

- **Correção da Agregação Matemática (`build-dados.js`)**: **Aprovada.** Embora você some percentuais para a fórmula, foi verificado que `efic = denom === 0 ? conc : conc + (ret * conc) / denom` trabalha corretamente nas casas decimais da escala 0-100. Comparando o resultado do JSON regerado com os índices na base CSV original, foram encontrados **zero (0) erros de divergência**. A lógica de tratar dados "vazios" como contagem 0 também é o comportamento canônico esperado por essa base.
- **Robustez Assíncrona e `state.guidedToken`**: **Aprovada.** O modelo de tokens está bloqueando com segurança animações que tentam seguir quando o usuário clica em "Pular introdução" de forma adiantada. Não há *drifts* no áudio.
- **Tratamento de Nulls**: **Aprovado.** Testes não acusam *NaN* ou quebras gráficas quando o `total === 0` injeta nulos. O filtro `validos` em `computeNarrative` neutraliza divisões por zero, retornando mensagem textual coerente.
- **Bugs/Código Morto**: A estrutura está concisa. Não foram encontradas lógicas fantasmas atreladas à base antiga. A transição VR/Desktop está encapsulada apropriadamente em `setGazeFuse`.
