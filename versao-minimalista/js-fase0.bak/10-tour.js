function resolveTourContext(id) {
  if (id === "brasil") return DADOS.brasil;
  return DADOS.regioes.find((r) => r.id === id) || null;
}

async function startTour(tourId) {
  if (state.transitioning) return;
  const tour = TOURS[tourId];
  if (!tour) return;
  state.transitioning = true;
  cancelGuided();
  stopNarration();
  await fadeToBlack();

  state.tourActive = true;
  state.tourId = tourId;
  state.tourScenes = tour.cenas;
  state.tourStep = 0;
  state.compareOn = false;

  setVectorAttribute(dom.cameraRig, "position", "0 1.6 0");
  setEntityVisible(dom.selectionWorld, false);
  setEntityVisible(dom.explorationWorld, true);
  dom.hudLegend.hidden = true;
  dom.compLegend.hidden = true;

  // Atualizar a cor da barra HUD com a cor da historia.
  if (dom.tourBarLabel) dom.tourBarLabel.textContent = tour.titulo;
  const barEl = document.getElementById("tourBar");
  if (barEl) barEl.style.borderLeftColor = tour.cor;
  const fillEl = document.getElementById("tourBarFill");
  if (fillEl) fillEl.style.background = `linear-gradient(90deg, ${tour.cor}, ${shadeColor(tour.cor, 30)})`;

  await tourGoTo(0, /* skipFade */ true);
  await fadeFromBlack();
  state.transitioning = false;
}

async function tourGoTo(n, skipFade) {
  const scenes = state.tourScenes;
  if (!scenes || n < 0 || n >= scenes.length) return;
  const cena = scenes[n];
  state.tourStep = n;
  tlog("tour", { id: state.tourId, cena: n + 1, de: scenes.length });

  // Fade entre cenas (exceto a primeira que ja vem do fade do startTour).
  if (!skipFade && !state.transitioning) {
    state.transitioning = true;
    await fadeToBlack();
  }

  cancelGuided();
  stopNarration();

  const ehPainel = cena.tipo === "abertura" || cena.tipo === "fechamento";

  // Esconder tudo antes de montar a cena.
  setEntityVisible(dom.indicatorView, false);
  setEntityVisible(dom.timelineView, false);
  setEntityVisible(dom.composicaoView, false);
  setEntityVisible(dom.multiplosView, false);
  setEntityVisible(dom.tourPanel, false);
  hideInfoPanelNow();

  if (ehPainel) {
    // Cena de texto (abertura/fechamento).
    state.stage = "painel";
    let corpoFinal = cena.corpo || "";
    if (cena.tipo === "fechamento" && (cena.contextoId || state.context)) {
      const ctx = cena.contextoId ? resolveTourContext(cena.contextoId) : state.context;
      if (corpoFinal.includes("{sintese}")) corpoFinal = corpoFinal.replace("{sintese}", buildSintese(ctx));
      buildVisceralParticles(ctx);
    } else {
      stopVisceral();
    }
    showTourPanel({ ...cena, corpo: corpoFinal });
  } else {
    stopVisceral();
    const ctx = resolveTourContext(cena.contextoId);
    if (!ctx) { state.transitioning = false; return; }
    state.context = ctx;
    state.compareOn = false;
    state.compareContext = resolveCompareContext(ctx);

    if (cena.modo === "timeline" && cena.indicador) {
      enterTimeline(cena.indicador, /* skipGuided */ true);
      dom.narrativeTitle.setAttribute("value", cena.manchete);
      const narr = computeNarrative(ctx, cena.indicador);
      dom.narrativeText.setAttribute("value", narr.texto);
    } else if (cena.modo === "composicao") {
      enterComposicao();
      dom.compTitle.setAttribute("value", cena.manchete);
    } else if (cena.modo === "multiplos") {
      enterMultiplos(cena.indicador, /* skipFade */ true);
      dom.multiplosTitle.setAttribute("value", cena.manchete);
    } else if (cena.modo === "indicadores") {
      // A4: cena de indicadores no tour (relacao causal).
      state.stage = "indicators";
      setEntityVisible(dom.indicatorView, true);
      setEntityVisible(dom.contextKicker, true);
      setEntityVisible(dom.contextTitle, true);
      setEntityVisible(dom.contextLead, true);
      populateIndicators(ctx);
      dom.contextKicker.setAttribute("value", "RELACAO ENTRE INDICADORES");
      dom.contextTitle.setAttribute("value", cena.manchete);
      dom.contextLead.setAttribute("value", "Evasao, conclusao e retencao determinam a eficiencia academica.");
      // Mostrar conectores visuais automaticamente.
      if (cena.showLinks) showIndicatorLinks(true);
    }
  }

  // Texto conectivo no campo de hint.
  dom.guidedHint.setAttribute("value", cena.conectivo || "");

  // Atualizar controles e HUD do tour.
  showTourControls(true);
  updateTourUI();

  // Ajustar interacao para modo tour.
  setInteractionMode("tour");

  const tour = TOURS[state.tourId];
  const tourNome = tour ? tour.titulo : "Tour guiado";
  dom.hudTitle.textContent = cena.manchete;
  dom.hudSubtitle.textContent =
    `${tourNome} — cena ${n + 1} de ${scenes.length}` + (cena.climax ? "  ·  ponto de virada" : "");
  crumb(tourNome, `cena ${n + 1} de ${scenes.length}`);

  if (!skipFade) {
    await fadeFromBlack();
    state.transitioning = false;
  }
}

function tourNext() {
  if (state.transitioning) return;
  const next = state.tourStep + 1;
  if (!state.tourScenes || next >= state.tourScenes.length) {
    endTour();
  } else {
    tourGoTo(next);
  }
}

function tourPrev() {
  if (state.transitioning) return;
  if (state.tourStep > 0) tourGoTo(state.tourStep - 1);
}

async function endTour() {
  if (state.transitioning) return;
  state.tourActive = false;
  showTourControls(false);
  setEntityVisible(dom.tourPanel, false);
  dom.tourBar.hidden = true;

  // Cena de painel (fechamento) ou sem contexto: encerra voltando ao mapa.
  if (state.stage === "painel" || !state.context) {
    returnToSelection(true);
    return;
  }
  // Caso contrario (saida via Esc numa cena de dados), libera a exploracao livre.
  if (state.stage === "composicao") {
    backToIndicators();
  } else if (state.stage === "timeline") {
    // Liberar controles da timeline para exploracao livre.
    setEntityVisible(dom.scrubberRow, true);
    setEntityVisible(dom.actionRow, true);
    setSubtreeClickable(dom.scrubberRow, true);
    setSubtreeClickable(dom.actionRow, true);
    dom.guidedHint.setAttribute("value", "Explore: caminhe pelos anos (WASD ou passos) e compare com o Brasil.");
    setInteractionMode("timeline");
    // #ctrlSkip fica oculto, mas o raycaster mira pela classe: tira a clicabilidade
    // para evitar clique-fantasma no botao invisivel "Pular introducao".
    setSubtreeClickable(dom.ctrlSkip, false);
    refreshRaycasters();
    crumb("Inicio", rotuloContexto(state.context), "Indicadores", indicadorByKey(state.indicatorKey).label);
  } else {
    backToIndicators();
  }

  dom.hudTitle.textContent = rotuloContexto(state.context);
  dom.hudSubtitle.textContent = "Tour concluido — explore livremente.";
}

function showTourPanel(cena) {
  setEntityVisible(dom.tourPanel, true);
  dom.tourPanelKicker.setAttribute("value", cena.kicker || "");
  dom.tourPanelTitle.setAttribute("value", cena.manchete || "");
  dom.tourPanelBody.setAttribute("value", cena.corpo || "");
  setEntityVisible(dom.tourCta, !!cena.cta);
  animateViewIn(dom.tourPanel);
}

// C5: Sintese memoravel de fechamento
function buildSintese(ctx) {
  if (!ctx || !ctx.series.contagens || !ctx.series.matriculas) return "";
  
  let validIdx = -1;
  for (let i = ctx.series.matriculas.length - 1; i >= 0; i--) {
    const m = ctx.series.contagens.matriculados?.[i] || ctx.series.matriculas[i];
    const c = ctx.series.contagens.concluidos?.[i];
    if (m > 0 && c != null) {
      validIdx = i;
      break;
    }
  }
  
  if (validIdx === -1) return "";
  
  const m = ctx.series.contagens.matriculados?.[validIdx] || ctx.series.matriculas[validIdx];
  const c = ctx.series.contagens.concluidos[validIdx];
  const taxa = Math.round((c / m) * 100);
  return `De cada 100 matriculados no ${rotuloContexto(ctx)}, apenas ${taxa} conseguem concluir.`;
}

// C1: Imersão Visceral (Antropomorfização)
let visceralRunId = 0;
let visceralTimers = [];

function clearVisceralTimers() {
  visceralTimers.forEach(clearTimeout);
  visceralTimers = [];
}

function buildVisceralParticles(ctx) {
  if (!dom.visceralParticles || !ctx || !ctx.series.contagens) return;
  const runId = ++visceralRunId;
  stopVisceral();
  
  const lastIdx = lastValidIndex(ctx.series.conclusao);
  const m = ctx.series.contagens.matriculados?.[lastIdx] || ctx.series.matriculas?.[lastIdx];
  const c = ctx.series.contagens.concluidos?.[lastIdx];
  const e = ctx.series.contagens.evadidos?.[lastIdx];
  
  if (m <= 0 || c == null || e == null) return;
  
  const pctC = Math.round((c / m) * 100);
  const pctE = Math.round((e / m) * 100);
  // O restante é retido (pctR)
  
  setEntityVisible(dom.visceralParticles, true);
  dom.visceralParticles.replaceChildren(); // Object pooling / replaceChildren
  
  const cols = 20;
  const gap = 0.15;
  for (let i = 0; i < 100; i++) {
    const col = i % cols;
    const row = Math.floor(i / cols);
    const x = (col - cols/2) * gap + (gap / 2);
    const z = row * gap;
    
    let type = "retido";
    if (i < pctE) type = "evadido";
    else if (i < pctE + pctC) type = "concluinte";
    
    // Blocos (voxels), nao esferas: coerente com a representacao por unidades
    // do artigo - "cada bloco = 1% do contingente".
    const bloco = el("a-box", {
      width: 0.07, height: 0.07, depth: 0.07,
      position: `${x} 0 ${z}`,
      material: "color: #cdd9ec; roughness: 0.6",
      "data-type": type
    });

    dom.visceralParticles.append(bloco);
  }
  
  visceralTimers.push(setTimeout(() => {
    if (runId !== visceralRunId || !dom.visceralParticles?.getAttribute("visible")) return;
    const evadidos = dom.visceralParticles.querySelectorAll('[data-type="evadido"]');
    evadidos.forEach(el => {
      el.setAttribute("material", "color: #ff4d4d; emissive: #ff4d4d; emissiveIntensity: 0.4");
      el.setAttribute("animation__up", "property: position; by: 0 4 0; dur: 4000; easing: easeOutQuad");
      el.setAttribute("animation__fade", "property: material.opacity; to: 0; transparent: true; dur: 3500; easing: easeInQuad");
    });
  }, 1500));
  
  visceralTimers.push(setTimeout(() => {
    if (runId !== visceralRunId || !dom.visceralParticles?.getAttribute("visible")) return;
    const concluintes = dom.visceralParticles.querySelectorAll('[data-type="concluinte"]');
    concluintes.forEach(el => {
      el.setAttribute("material", "color: #2fdb6f; emissive: #2fdb6f; emissiveIntensity: 0.4");
      el.setAttribute("animation__pulse", "property: scale; to: 1.3 1.3 1.3; dur: 1000; dir: alternate; loop: true");
    });
    const retidos = dom.visceralParticles.querySelectorAll('[data-type="retido"]');
    retidos.forEach(el => {
      el.setAttribute("material", "color: #ffd60a; emissive: #ffd60a; emissiveIntensity: 0.2");
    });
  }, 3500));
}

function stopVisceral() {
  visceralRunId += 1;
  clearVisceralTimers();
  if (dom.visceralParticles) {
    setEntityVisible(dom.visceralParticles, false);
    dom.visceralParticles.replaceChildren();
  }
}

function showTourControls(visible) {
  setEntityVisible(dom.tourControls, visible);
  // Quando o tour esta ativo, esconder os controles normais da timeline.
  setEntityVisible(dom.scrubberRow, false);
  setEntityVisible(dom.actionRow, false);
  setEntityVisible(dom.ctrlSkip, false);
  if (visible) {
    setSubtreeClickable(dom.scrubberRow, false);
    setSubtreeClickable(dom.actionRow, false);
  }
}

function updateTourUI() {
  const n = state.tourStep;
  const total = state.tourScenes ? state.tourScenes.length : 1;
  const isLast = n === total - 1;

  // 3D progress label.
  dom.tourProgress.setAttribute("value", `${n + 1} / ${total}`);
  dom.tourNextLabel.setAttribute("value", isLast ? "Concluir" : "Proximo >");

  // 2D HUD progress bar.
  dom.tourBar.hidden = false;
  dom.tourBarStep.textContent = `${n + 1} / ${total}`;
  dom.tourBarFill.style.width = `${((n + 1) / total) * 100}%`;
}

// ----------------------------------------------------------------------------
// Controles e navegacao.
// ----------------------------------------------------------------------------

function bindTimelineControls() {
  clickable(dom.ctrlPrevYear).addEventListener("click", () => stepYear(-1));
  clickable(dom.ctrlNextYear).addEventListener("click", () => stepYear(1));
  clickable(dom.ctrlCompare).addEventListener("click", () => toggleCompare());
  clickable(dom.ctrlSound).addEventListener("click", () => toggleSound());
  clickable(dom.ctrlReplay).addEventListener("click", () => replayGuided());
  clickable(dom.ctrlSkip).addEventListener("click", () => skipGuided());

  [dom.ctrlPrevYear, dom.ctrlNextYear, dom.ctrlCompare, dom.ctrlSound, dom.ctrlReplay, dom.ctrlSkip].forEach((ctrl) => {
    const hit = clickable(ctrl);
    hit.addEventListener("mouseenter", () => ctrl.setAttribute("animation__h", "property: scale; to: 1.08 1.08 1.08; dur: 150"));
    hit.addEventListener("mouseleave", () => ctrl.setAttribute("animation__h", "property: scale; to: 1 1 1; dur: 150"));
  });
}

function bindTourControls() {
  // A2: os botoes da galeria sao criados dinamicamente em buildTourGallery().
  // Aqui so ligamos os controles Anterior/Proximo/CTA do tour.

  // Botoes Anterior / Proximo no 3D.
  const prevHit = dom.tourPrevBtn.querySelector(".tour-clickable");
  const nextHit = dom.tourNextBtn.querySelector(".tour-clickable");
  prevHit.addEventListener("click", () => tourPrev());
  nextHit.addEventListener("click", () => tourNext());

  // CTA do fechamento: leva ao MAPA (nao a home) para explorar a propria regiao -
  // e o desague do Martini Glass: da historia para a exploracao livre.
  const ctaHit = dom.tourCta.querySelector(".tour-clickable");
  ctaHit.addEventListener("click", () => { if (!state.transitioning) returnToSelection(true); });

  [dom.tourPrevBtn, dom.tourNextBtn, dom.tourCta].forEach((ctrl) => {
    const hit = ctrl.querySelector(".tour-clickable");
    hit.addEventListener("mouseenter", () => ctrl.setAttribute("animation__h", "property: scale; to: 1.08 1.08 1.08; dur: 150"));
    hit.addEventListener("mouseleave", () => ctrl.setAttribute("animation__h", "property: scale; to: 1 1 1; dur: 150"));
  });

  // Navegacao por teclado: setas esquerda/direita durante o tour.
  document.addEventListener("keydown", (e) => {
    if (!state.tourActive) return;
    if (e.key === "ArrowRight" || e.key === "ArrowDown") { e.preventDefault(); tourNext(); }
    if (e.key === "ArrowLeft" || e.key === "ArrowUp") { e.preventDefault(); tourPrev(); }
    if (e.key === "Escape") { e.preventDefault(); endTour(); }
  });
}

// A2: Galeria de historias curadas — cria cards 3D no selectionWorld.
function buildTourGallery() {
  if (!dom.tourGallery) return;
  dom.tourGallery.innerHTML = "";
  const keys = Object.keys(TOURS);
  const spacing = 2.2;  // distancia horizontal entre cards
  const startX = -((keys.length - 1) / 2) * spacing;

  keys.forEach((tourId, i) => {
    const tour = TOURS[tourId];
    const x = startX + i * spacing;
    const card = el("a-entity", { position: `${round2(x)} 0 0` });

    const bg = el("a-box", {
      width: 1.9, height: 0.95, depth: 0.08,
      material: `color: #12183a; roughness: 0.4; metalness: 0.1; emissive: ${tour.cor}; emissiveIntensity: 0.15`,
    });
    const accent = el("a-plane", {
      width: 1.7, height: 0.04, position: "0 0.42 0.05",
      material: `color: ${tour.cor}; opacity: 0.9; transparent: true; shader: flat`,
    });
    const titulo = el("a-text", {
      value: tour.titulo, position: "0 0.22 0.06",
      width: 1.9, align: "center", color: "#ffffff", font: "kelsonsans",
    });
    const desc = el("a-text", {
      value: tour.descricao, position: "0 -0.04 0.06",
      width: 1.8, align: "center", color: "#b0bfd6", font: "kelsonsans", "wrap-count": 28,
    });
    const cenas = el("a-text", {
      value: `${tour.cenas.length} cenas`, position: "0 -0.32 0.06",
      width: 1.5, align: "center", color: tour.cor, font: "kelsonsans",
    });
    const hit = el("a-box", {
      class: "hit gallery-clickable",
      width: 1.95, height: 1.0, depth: 0.18,
      material: "color: #ffffff; opacity: 0.001; transparent: true",
    });
    card.append(bg, accent, titulo, desc, cenas, hit);
    dom.tourGallery.appendChild(card);
    applyPendingTransforms(card);

    hit.addEventListener("click", () => { if (!state.transitioning) { pushHistory(); startTour(tourId); } });
    hit.addEventListener("mouseenter", () => {
      card.setAttribute("animation__h", "property: scale; to: 1.06 1.06 1.06; dur: 150");
      bg.setAttribute("material", `color: #12183a; roughness: 0.4; metalness: 0.1; emissive: ${tour.cor}; emissiveIntensity: 0.35`);
      dom.hudSubtitle.textContent = `${tour.titulo}: ${tour.descricao}`;
    });
    hit.addEventListener("mouseleave", () => {
      card.setAttribute("animation__h", "property: scale; to: 1 1 1; dur: 150");
      bg.setAttribute("material", `color: #12183a; roughness: 0.4; metalness: 0.1; emissive: ${tour.cor}; emissiveIntensity: 0.15`);
    });
  });
}

