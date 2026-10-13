// ----------------------------------------------------------------------------
// Etapa 2 - Indicadores do contexto.
// ----------------------------------------------------------------------------

async function enterIndicators(ctx) {
  if (state.transitioning) return;
  state.transitioning = true;
  cancelGuided();
  await fadeToBlack();

  state.context = ctx;
  state.stage = "indicators";
  state.indicatorKey = null;
  state.compareOn = false;
  state.compareContext = resolveCompareContext(ctx);

  placeAtStation("indicadores"); // Fase 1: cada etapa e um LUGAR na sala
  setEntityVisible(dom.timelineView, false);
  setEntityVisible(dom.composicaoView, false);
  setEntityVisible(dom.multiplosView, false);
  setEntityVisible(dom.tourPanel, false);
  setEntityVisible(dom.indicatorView, true);
  hideInfoPanelNow();
  dom.hudLegend.hidden = true;
  dom.compLegend.hidden = true;

  populateIndicators(ctx);
  setInteractionMode("indicators");
  await fadeFromBlack();
  state.transitioning = false;
}

function populateIndicators(ctx) {
  dom.indicatorObjects.innerHTML = "";
  // O cabecalho generico volta a aparecer no modo indicadores.
  setEntityVisible(dom.contextKicker, true);
  setEntityVisible(dom.contextTitle, true);
  setEntityVisible(dom.contextLead, true);
  dom.contextKicker.setAttribute("value", "INDICADORES EM 2024");
  dom.contextTitle.setAttribute("value", rotuloContexto(ctx));
  dom.contextLead.setAttribute("value", "Passe o mouse para entender cada indicador. Clique para abrir a linha do tempo.");
  crumb("Inicio", rotuloContexto(ctx), "Indicadores");
  setNota("indicadores");

  DADOS.indicadores.forEach((indicador, index) => {
    const obj = createIndicatorObject(indicador, ctx, index);
    dom.indicatorObjects.appendChild(obj);
    applyPendingTransforms(obj);
  });
  // A4: construir conectores visuais (ocultos ate hover em Eficiencia).
  buildIndicatorLinks();
  animateViewIn(dom.indicatorView);
  resetMiniMap();
}

// Cada indicador e uma COLUNA DE VOXELS 10x10 (Fase 2.1): 1 bloco = 1%, a
// MESMA lingua visual da composicao e do artigo. Blocos acesos = valor de 2024;
// o trilho apagado da a referencia de 100%. Comparavel entre os 4 e visceral.
const GAUGE = { y: 1.05, rOut: 0.58 }; // y: altura media da coluna (conectores A4)
const VOXCOL = { y0: 0.62, cols: 10, gap: 0.1, size: 0.085 };
// Painel "Como se calcula a eficiencia" (hover em Eficiencia): fica na faixa
// livre entre o numero dos medidores (y 1,88) e o titulo do contexto.
const EFICACIA_PAINEL = { baseY: 1.94, h: 1.1, w: 3.2 };

function createIndicatorObject(indicador, ctx, index) {
  const pos = dataPositions[index];
  const latest = latestValue(ctx.series[indicador.key]);
  const value = latest == null ? 0 : Math.max(0, Math.min(100, latest));
  const cor = indicador.cor;
  // Gira o medidor para encarar a camera (no centro da sala).
  const yaw = (Math.atan2(-pos.x, -pos.z) * 180) / Math.PI;

  const point = el("a-entity", {
    position: `${pos.x} 0 ${pos.z}`, rotation: `0 ${round2(yaw)} 0`, scale: "1 1 1",
  });

  // Pedestal no piso + anel girando (mantem o "tapete" de palco).
  const pedestal = el("a-cylinder", {
    radius: 0.5, height: 0.06, position: "0 0.03 0",
    material: `color: ${cor}; opacity: 0.22; transparent: true; shader: flat`,
  });
  const ring = el("a-ring", {
    class: "point-ring", radiusInner: 0.5, radiusOuter: 0.54, position: "0 0.07 0", rotation: "-90 0 0",
    material: `color: ${cor}; opacity: 0.5; transparent: true; shader: flat`,
  });
  // Haste que liga o pedestal a coluna.
  const standH = VOXCOL.y0 - 0.1;
  const stand = el("a-cylinder", {
    radius: 0.028, height: standH, position: `0 ${0.08 + standH / 2} 0`,
    material: `color: ${cor}; opacity: 0.5; transparent: true; shader: flat`,
  });
  point.append(pedestal, ring, stand);

  // Coluna instanciada (1 draw call): preenchida de baixo para cima ate o
  // valor; o restante fica na cor base como trilho de 100%.
  const colEnt = el("a-entity", { position: `0 ${VOXCOL.y0} 0` });
  point.appendChild(colEnt);
  const grade = createVoxelGrid({
    count: 100, layout: "wall", cols: VOXCOL.cols, gap: VOXCOL.gap,
    sizeX: VOXCOL.size, sizeY: VOXCOL.size, sizeZ: VOXCOL.size,
  });
  grade.setSegments(latest == null ? [] : [{ cor, n: Math.round(value) }]);
  attachVoxelMesh(colEnt, grade.mesh);

  const topoCol = VOXCOL.y0 + VOXCOL.cols * VOXCOL.gap;
  const valueText = el("a-text", {
    value: latest == null ? "s/d" : `${fmt(value)}%`, position: `0 ${round2(topoCol + 0.26)} 0.02`,
    width: 2.5, align: "center", color: "#ffffff", font: "kelsonsans",
  });
  const unidade = el("a-text", {
    value: latest == null ? "sem dados" : "em 2024 · 1 bloco = 1%", position: `0 ${round2(topoCol + 0.08)} 0.02`,
    width: 1.5, align: "center", color: "#9fb2cc", font: "kelsonsans",
  });
  const label = el("a-text", {
    class: "point-label", value: indicador.label, position: `0 ${round2(VOXCOL.y0 - 0.24)} 0.02`,
    width: 2.0, align: "center", color: "#cdd9ec", font: "kelsonsans", "wrap-count": 18,
  });

  // Hitbox cobrindo a coluna inteira (do pedestal ao numero).
  const topo = topoCol + 0.44;
  const hit = el("a-box", {
    class: "clickable indicator-clickable", width: 1.35, height: topo, depth: 0.5,
    position: `0 ${topo / 2} 0`, material: "color: #ffffff; opacity: 0.001; transparent: true",
  });
  point.append(valueText, unidade, label, hit);

  hit.addEventListener("mouseenter", () => setPointHover(point, indicador, true));
  hit.addEventListener("mouseleave", () => setPointHover(point, indicador, false));
  hit.addEventListener("click", () => onIndicatorClick(indicador));
  return point;
}

function setPointHover(point, indicador, isHovering) {
  if (state.transitioning) return;
  point.setAttribute(
    "animation__hover",
    `property: scale; to: ${isHovering ? "1.12 1.12 1.12" : "1 1 1"}; dur: 200; easing: easeOutQuad`
  );
  point.querySelectorAll(".data-visual, .data-glow").forEach((visual) => {
    setObjectGlow(visual, indicador.cor, isHovering ? 0.5 : 0.18);
  });
  const ring = point.querySelector(".point-ring");
  if (ring) {
    ring.setAttribute(
      "animation__hover",
      `property: scale; to: ${isHovering ? "1.18 1.18 1.18" : "1 1 1"}; dur: 200; easing: easeOutQuad`
    );
  }
  if (isHovering) showInfoPanel(indicador);
  // Em VR (gaze) o painel fica "fixado" ao sair do medidor: esconder no mouseleave
  // impediria o usuario de olhar para o painel/botao sem perde-lo.
  else if (!state.vrMode) hideInfoPanel();

  // A4: mostrar/esconder conectores visuais ao focar Eficiencia.
  // Durante o tour (cena com showLinks) nao escondemos ao passar por outros medidores.
  if (indicador.key === "eficiencia") {
    showIndicatorLinks(isHovering);
  } else if (!state.tourActive) {
    showIndicatorLinks(false);
  }
}

function infoOpenHit() {
  return dom.infoOpenBtn ? dom.infoOpenBtn.querySelector(".info-open-hit") : null;
}

function showInfoPanel(indicador) {
  const latest = latestValue(state.context.series[indicador.key]);
  state.infoIndicator = indicador;
  const openHit = infoOpenHit();
  if (openHit) { openHit.classList.add("clickable"); refreshRaycasters(); }
  setEntityVisible(dom.infoPanel, true);
  setVectorAttribute(dom.infoPanel, "scale", "0.82 0.82 0.82");
  dom.infoPanel.setAttribute("animation__open", "property: scale; to: 0.9 0.9 0.9; dur: 260; easing: easeOutBack");
  dom.infoAccent.setAttribute("material", `color: ${indicador.cor}; shader: flat`);
  dom.infoTitle.setAttribute("value", indicador.label);
  dom.infoValue.setAttribute("value", latest == null ? "Sem dados em 2024" : `${fmt(latest)}% em 2024`);
  dom.infoDescription.setAttribute("value", indicador.descricao);
  dom.hudSubtitle.textContent = `${indicador.label}: ${latest == null ? "s/ dados" : fmt(latest) + "%"}`;
  fadeInfoPanel(true);
}

// Fade do painel do indicador: aparece ao passar o mouse/olhar e some ao sair.
// Como o painel tem varios elementos (planos + textos), animamos a opacidade de
// cada um por requestAnimationFrame; um token cancela fades anteriores (ex.: ao
// passar direto de um gauge para outro).
// Fade generico de um painel (planos + textos), com token por entidade para
// cancelar fades anteriores. Usado pelo painel do indicador e pelo preview do mapa.
function fadeEntity(entity, show, dur = 220) {
  if (!entity) return;
  const token = (Number(entity.dataset.fadeToken) || 0) + 1;
  entity.dataset.fadeToken = String(token);
  if (show) setEntityVisible(entity, true);

  const planes = [...entity.querySelectorAll("a-plane")];
  const texts = [...entity.querySelectorAll("a-text")];
  planes.forEach((p) => {
    if (p.dataset.baseOp == null) {
      const m = p.getAttribute("material");
      p.dataset.baseOp = m && typeof m.opacity === "number" ? String(m.opacity) : "1";
    }
    p.setAttribute("material", "transparent", true);
  });

  const start = performance.now();
  function step(now) {
    if (String(token) !== entity.dataset.fadeToken) return; // cancelado
    const t = Math.min(1, (now - start) / dur);
    const k = show ? t : 1 - t;
    planes.forEach((p) => p.setAttribute("material", "opacity", (Number(p.dataset.baseOp) || 1) * k));
    texts.forEach((tx) => tx.setAttribute("text", "opacity", k));
    if (t < 1) requestAnimationFrame(step);
    else if (!show) setEntityVisible(entity, false);
  }
  requestAnimationFrame(step);
}

function fadeInfoPanel(show) {
  fadeEntity(dom.infoPanel, show);
}

function hideInfoPanel() {
  const openHit = infoOpenHit();
  if (openHit) openHit.classList.remove("clickable");
  state.infoIndicator = null;
  if (dom.infoPanel.object3D && dom.infoPanel.object3D.visible) fadeEntity(dom.infoPanel, false);
}

// Esconde na hora (mudanca de etapa), cancelando qualquer fade em andamento.
function hideInfoPanelNow() {
  const openHit = infoOpenHit();
  if (openHit) openHit.classList.remove("clickable");
  state.infoIndicator = null;
  if (dom.infoPanel) dom.infoPanel.dataset.fadeToken = String((Number(dom.infoPanel.dataset.fadeToken) || 0) + 1);
  setEntityVisible(dom.infoPanel, false);
}

function onIndicatorClick(indicador) {
  if (state.transitioning) return;
  // Em VR o "clique" vem do fuse de 850ms: fixar o olhar para LER o painel nao pode
  // navegar. O 1o dwell fixa o painel; navegar exige mirar "Ver linha do tempo".
  if (state.vrMode) { showInfoPanel(indicador); return; }
  pushHistory(); // vindo dos indicadores -> "Voltar" retorna aos gauges.
  enterTimeline(indicador.key);
}

// Botao "Ver linha do tempo" dentro do painel interpretativo (alvo de navegacao
// separado do medidor - essencial para gaze fuse; no desktop e um atalho extra).
function bindInfoOpen() {
  const hit = infoOpenHit();
  if (!hit) return;
  hit.addEventListener("click", () => {
    if (state.transitioning || !state.infoIndicator) return;
    pushHistory();
    enterTimeline(state.infoIndicator.key);
  });
  hit.addEventListener("mouseenter", () => dom.infoOpenBtn.setAttribute("animation__h", "property: scale; to: 1.08 1.08 1.08; dur: 150"));
  hit.addEventListener("mouseleave", () => dom.infoOpenBtn.setAttribute("animation__h", "property: scale; to: 1 1 1; dur: 150"));
}

// ----------------------------------------------------------------------------
// A4: Conectores visuais Conclusao/Retencao/Evasao -> Eficiencia.
// ----------------------------------------------------------------------------

// Constroi as linhas e o painel "como se calcula" dentro de #indicatorLinks.
// Chamado em populateIndicators, depois de criar os medidores.
function buildIndicatorLinks() {
  if (!dom.indicatorLinks) return;
  dom.indicatorLinks.innerHTML = "";

  // Indices dos indicadores (ordem do dados.json):
  // 0: evasao, 1: conclusao, 2: eficiencia, 3: retencao.
  const efIdx = DADOS.indicadores.findIndex((i) => i.key === "eficiencia");
  if (efIdx < 0) return;
  const efPos = dataPositions[efIdx];
  const efWorld = { x: efPos.x, y: GAUGE.y, z: efPos.z };

  const sources = DADOS.indicadores
    .map((ind, i) => ({ ind, pos: dataPositions[i], i }))
    .filter((d) => d.ind.key !== "eficiencia");

  sources.forEach(({ ind, pos }) => {
    const from = { x: pos.x, y: GAUGE.y, z: pos.z };
    const to = efWorld;
    const dx = to.x - from.x;
    const dy = to.y - from.y;
    const dz = to.z - from.z;
    const len = Math.hypot(dx, dz); // comprimento horizontal (plano XZ)
    const ang = (Math.atan2(dx, -dz) * 180) / Math.PI; // rotacao em Y
    const midX = (from.x + to.x) / 2;
    const midZ = (from.z + to.z) / 2;

    // Linha horizontal (flat) no chao do palco ligando os medidores.
    const line = el("a-box", {
      width: len * 0.85, height: 0.028, depth: 0.028,
      position: `${round2(midX)} ${round2(GAUGE.y)} ${round2(midZ)}`,
      rotation: `0 ${round2(ang)} 0`,
      material: `color: ${ind.cor}; emissive: ${ind.cor}; emissiveIntensity: 0.5; shader: flat; opacity: 0.7; transparent: true`,
    });
    dom.indicatorLinks.appendChild(line);
    applyPendingTransforms(line);

    // Seta (triangulo) na ponta proxima a Eficiencia.
    const arrowDist = 0.45; // distancia do centro do gauge de Eficiencia
    const arrowX = to.x - (dx / len) * arrowDist;
    const arrowZ = to.z - (dz / len) * arrowDist;
    // Cone aponta em +Y por padrao; deitamos com -90 em Z e direcionamos com `ang` em Y.
    const arrow = el("a-cone", {
      height: 0.14, radiusBottom: 0.06, radiusTop: 0,
      position: `${round2(arrowX)} ${round2(GAUGE.y)} ${round2(arrowZ)}`,
      rotation: `0 ${round2(ang)} -90`,
      material: `color: ${ind.cor}; emissive: ${ind.cor}; emissiveIntensity: 0.4; shader: flat`,
    });
    dom.indicatorLinks.appendChild(arrow);
    applyPendingTransforms(arrow);

    // Rotulo na linha.
    const labelText = ind.key === "evasao" ? "reduz" : ind.key === "conclusao" ? "eleva" : "deprime";
    const labelColor = ind.key === "conclusao" ? "#65e4b8" : ind.key === "evasao" ? "#ff8e8e" : "#ffe088";
    const lbl = el("a-text", {
      value: labelText.toUpperCase(),
      position: `${round2(midX)} ${round2(GAUGE.y + 0.12)} ${round2(midZ + 0.05)}`,
      width: 1.6, align: "center", color: labelColor, font: "kelsonsans",
    });
    dom.indicatorLinks.appendChild(lbl);
    applyPendingTransforms(lbl);
  });

  // Painel "Como se calcula" ACIMA do numero dos medidores. O valor antigo
  // (GAUGE.y + rOut + 0,6 = 2,23) punha o painel bem em cima do "%" e do rotulo
  // "em 2024"; a faixa util vai da base 1,94 (logo acima do numero, que fica em
  // 1,88) ate ~3,05, onde comeca a projecao do titulo do contexto.
  const panelY = EFICACIA_PAINEL.baseY + EFICACIA_PAINEL.h / 2;
  buildEfficacyPanel(efWorld.x, panelY, efWorld.z);

  setEntityVisible(dom.indicatorLinks, false);
}

// Painel flutuante sobre Eficiencia explicando a formula.
function buildEfficacyPanel(cx, cy, cz) {
  // Valores do contexto atual para a micro-explicacao.
  const ctx = state.context;
  if (!ctx) return;
  const ev = latestValue(ctx.series.evasao);
  const co = latestValue(ctx.series.conclusao);
  const re = latestValue(ctx.series.retencao);
  const ef = latestValue(ctx.series.eficiencia);

  const panel = el("a-entity", {
    id: "efficacyPanel", position: `${round2(cx)} ${round2(cy)} ${round2(cz + 0.1)}`,
  });

  const bg = el("a-plane", {
    width: EFICACIA_PAINEL.w, height: EFICACIA_PAINEL.h,
    material: "color: #0b1322; opacity: 0.94; transparent: true; shader: flat",
  });
  const accent = el("a-plane", {
    width: EFICACIA_PAINEL.w, height: 0.05, position: "0 0.525 0.01",
    material: "color: #4cc9f0; shader: flat",
  });
  const titulo = el("a-text", {
    value: "COMO SE CALCULA A EFICIENCIA",
    position: "0 0.36 0.02", width: 3.0, align: "center", color: "#9be7ff", font: "kelsonsans",
  });
  const formula = el("a-text", {
    value: "Eficiencia = Concluintes + (Retidos x prob. de conclusao)",
    position: "0 0.16 0.02", width: 3.0, align: "center", color: "#ffffff", font: "kelsonsans",
  });

  // Sem operadores aritmeticos: a eficiencia NAO e a soma simples dos tres (a formula
  // pondera os retidos). Listamos os valores e mostramos o resultado com "->".
  let resumo = "";
  if (ev != null && co != null && re != null && ef != null) {
    resumo = `Em 2024: conclusao ${fmt(co)}% · evasao ${fmt(ev)}% · retencao ${fmt(re)}%  ->  eficiencia ${fmt(ef)}%`;
  }
  const valores = el("a-text", {
    value: resumo, position: "0 -0.06 0.02", width: 2.8, align: "center",
    color: "#cfe0f4", font: "kelsonsans", "wrap-count": 52,
  });

  const nota = el("a-text", {
    value: "Mais conclusao e menos evasao elevam a eficiencia.\nMais retencao a deprime, pois indica atraso na formacao.",
    position: "0 -0.3 0.02", width: 2.8, align: "center",
    color: "#8da0bb", font: "kelsonsans", "wrap-count": 52,
  });

  panel.append(bg, accent, titulo, formula, valores, nota);
  dom.indicatorLinks.appendChild(panel);
  applyPendingTransforms(panel);
}

// Mostrar/esconder os conectores visuais.
function showIndicatorLinks(show) {
  if (!dom.indicatorLinks) return;
  // O painel ocupa a faixa logo abaixo do titulo do contexto. A linha de apoio
  // (contextLead) e a unica que cai na projecao dele - e e redundante com o
  // proprio painel -, entao sai de cena enquanto ele estiver aberto. Kicker e
  // titulo ficam (no tour, sao a manchete da cena).
  if (dom.contextLead) setEntityVisible(dom.contextLead, !show);
  if (show) {
    setEntityVisible(dom.indicatorLinks, true);
    dom.indicatorLinks.setAttribute("animation__fade", "property: scale; from: 0.85 0.85 0.85; to: 1 1 1; dur: 280; easing: easeOutBack");
  } else {
    setEntityVisible(dom.indicatorLinks, false);
  }
}

