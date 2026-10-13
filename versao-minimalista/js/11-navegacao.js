function backToIndicators() {
  if (state.transitioning) return;
  cancelGuided();
  stopNarration();
  state.stage = "indicators";
  blinkToStation("indicadores");
  state.compareOn = false;
  dom.ctrlCompareLabel.setAttribute("value", "Comparar");
  dom.hudLegend.hidden = true;
  dom.compLegend.hidden = true;
  setEntityVisible(dom.timelineView, false);
  setEntityVisible(dom.composicaoView, false);
  setEntityVisible(dom.indicatorView, true);
  populateIndicators(state.context);
  dom.hudTitle.textContent = rotuloContexto(state.context);
  dom.hudSubtitle.textContent = "Escolha um indicador para ver a linha do tempo";
  setInteractionMode("indicators");
}

function bindBackButton() {
  const hit = dom.backButton.querySelector(".clickable");
  hit.addEventListener("mouseenter", () => dom.backButton.setAttribute("animation__hover", "property: scale; to: 1.08 1.08 1.08; dur: 180"));
  hit.addEventListener("mouseleave", () => dom.backButton.setAttribute("animation__hover", "property: scale; to: 1 1 1; dur: 180"));
  hit.addEventListener("click", navigateBack);
}

// Volta ao mundo de selecao. toExplore=true abre direto o mapa (ex.: CTA do tour
// "Explore a sua regiao"); caso contrario volta a tela inicial de 1 decisao.
async function returnToSelection(toExplore) {
  if (state.transitioning) return;
  cancelGuided();
  stopNarration();
  stopAmbientDrone();
  stopVisceral();
  state.transitioning = true;
  await fadeToBlack();

  // Limpar tour se estava ativo.
  state.tourActive = false;
  setEntityVisible(dom.tourControls, false);
  setEntityVisible(dom.tourPanel, false);
  dom.tourBar.hidden = true;

  placeAtStation(toExplore ? "mapa" : "home");
  hideInfoPanelNow();
  setEntityVisible(dom.timelineView, false);
  setEntityVisible(dom.composicaoView, false);
  dom.hudLegend.hidden = true;
  dom.compLegend.hidden = true;

  state.stage = "selection";
  state.context = null;
  state.indicatorKey = null;
  state.compareOn = false;

  setEntityVisible(dom.drillCards, false);
  setEntityVisible(dom.drillBack, false);
  if (toExplore) showMapSelection();
  else showHome();

  state.history = []; // chegou na tela inicial: zera a pilha de navegacao.
  updateBackLabel();
  await fadeFromBlack();
  state.transitioning = false;
}

// ----------------------------------------------------------------------------
// Historico de navegacao: "Voltar" retorna a tela anterior (nao a inicial).
// ----------------------------------------------------------------------------

// Empilha um retrato da tela ATUAL antes de avancar para a proxima.
function pushHistory() {
  state.history.push({
    stage: state.stage,
    selectionView: state.selectionView,
    context: state.context,
    indicatorKey: state.indicatorKey,
    parentRegion: state.parentRegion,
    drillRegion: state.drillRegion,
  });
  updateBackLabel();
}

// Rotulo dinamico do botao Voltar: diz PARA ONDE ele leva (um unico padrao de
// navegacao no lugar dos 4 botoes de voltar da versao original).
const BACK_LABELS = {
  drill: "Instituicoes",
  indicators: "Indicadores",
  multiplos: "Regioes",
  timeline: "Linha do tempo",
  composicao: "Composicao",
};

function updateBackLabel() {
  if (!dom.backLabel) return;
  const top = state.history[state.history.length - 1];
  let nome = "Inicio";
  if (top) {
    if (top.stage === "selection") nome = top.selectionView === "map" ? "Mapa" : "Inicio";
    else nome = BACK_LABELS[top.stage] || "Voltar";
  }
  dom.backLabel.setAttribute("value", `< ${nome}`);
}

// Desempilha e retorna a tela anterior; se a pilha estiver vazia, vai ao inicio.
function navigateBack() {
  if (state.transitioning) return;
  const prev = state.history.pop();
  updateBackLabel();
  if (!prev) { returnToSelection(false); return; }
  state.parentRegion = prev.parentRegion || null;
  state.drillRegion = prev.drillRegion || null;
  switch (prev.stage) {
    case "drill":
      if (prev.drillRegion) { enterDrill(prev.drillRegion); return; }
      returnToSelection(true); return;
    case "indicators":
      if (prev.context) { enterIndicators(prev.context); return; }
      returnToSelection(false); return;
    case "multiplos":
      enterMultiplos(prev.indicatorKey || "eficiencia"); return;
    case "timeline":
      if (prev.context) { state.context = prev.context; enterTimeline(prev.indicatorKey); return; }
      returnToSelection(false); return;
    case "composicao":
      enterComposicao(); return;
    case "selection":
      returnToSelection(prev.selectionView === "map"); return;
    default:
      returnToSelection(false); return;
  }
}

// Restaura a tela de drill (lista de instituicoes) vindo do mundo de exploracao:
// troca de mundo e reabre o drill da regiao. openDrill sozinho nao troca de mundo.
async function enterDrill(region) {
  if (state.transitioning || !region) return;
  cancelGuided();
  stopNarration();
  stopAmbientDrone();
  stopVisceral();
  state.transitioning = true;
  await fadeToBlack();

  state.tourActive = false;
  setEntityVisible(dom.tourControls, false);
  setEntityVisible(dom.tourPanel, false);
  dom.tourBar.hidden = true;

  placeAtStation("mapa");
  hideInfoPanelNow();
  setEntityVisible(dom.indicatorView, false);
  setEntityVisible(dom.timelineView, false);
  setEntityVisible(dom.composicaoView, false);
  setEntityVisible(dom.multiplosView, false);
  dom.hudLegend.hidden = true;
  dom.compLegend.hidden = true;

  state.parentRegion = null;
  openDrill(region); // define stage="drill", monta cards, mostra drillBack e ajusta interacao.

  await fadeFromBlack();
  state.transitioning = false;
}

