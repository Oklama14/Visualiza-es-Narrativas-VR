async function enterMultiplos(indicadorKey = "eficiencia", skipFade = false) {
  if (state.transitioning && !skipFade) return;
  stopAmbientDrone();
  if (!skipFade) {
    state.transitioning = true;
    cancelGuided();
    await fadeToBlack();
  }

  state.stage = "multiplos";
  state.indicatorKey = indicadorKey;
  state.context = null;

  setVectorAttribute(dom.cameraRig, "position", "0 1.6 0");
  setEntityVisible(dom.selectionWorld, false);
  setEntityVisible(dom.explorationWorld, true);
  setEntityVisible(dom.indicatorView, false);
  setEntityVisible(dom.timelineView, false);
  setEntityVisible(dom.composicaoView, false);
  setEntityVisible(dom.multiplosView, true);
  hideInfoPanelNow();
  dom.hudLegend.hidden = true;
  dom.compLegend.hidden = true;
  // O mini-mapa (hot-swap de um contexto) nao se aplica a visao "todas as regioes".
  closeMiniMap();
  setEntityVisible(dom.miniMapBase, false);

  buildMultiplosSelectors();
  buildMultiplos();
  animateViewIn(dom.multiplosView);

  dom.hudTitle.textContent = "Comparar regioes";
  dom.hudSubtitle.textContent = "Comparacao em mesma escala";
  setNota("multiplos");
  setInteractionMode("multiplos");

  if (!skipFade) {
    await fadeFromBlack();
    state.transitioning = false;
  }
}

function buildMultiplosSelectors() {
  dom.multiplosSelectors.innerHTML = "";
  let currentX = -2.7;
  DADOS.indicadores.forEach((ind) => {
    const isAtivo = ind.key === state.indicatorKey;
    const corBase = isAtivo ? ind.cor : "#16263f";
    const emissive = isAtivo ? ind.cor : "#2f5d8a";
    const int = isAtivo ? 0.35 : 0.2;
    
    const w = 1.6;
    const btn = el("a-entity", { position: `${currentX} 0 0` });
    const bg = el("a-box", {
      class: "multiplos-clickable hit",
      width: w, height: 0.44, depth: 0.08,
      material: `color: ${corBase}; roughness: 0.45; emissive: ${emissive}; emissiveIntensity: ${int}`
    });
    const label = el("a-text", {
      value: ind.label, position: "0 0 0.05",
      width: 2.2, align: "center", color: isAtivo ? "#ffffff" : "#cfe9ff", font: "kelsonsans"
    });
    btn.append(bg, label);
    
    bg.addEventListener("click", () => {
      if (!state.transitioning && state.indicatorKey !== ind.key) {
        state.indicatorKey = ind.key;
        buildMultiplosSelectors();
        buildMultiplos();
        // Os botoes/paineis reconstruidos sao novos no DOM: re-aplica .clickable e
        // atualiza o raycaster, senao so o primeiro clique (do enterMultiplos) funciona.
        setInteractionMode("multiplos");
      }
    });
    bg.addEventListener("mouseenter", () => {
      btn.setAttribute("animation__hover", "property: scale; to: 1.05 1.05 1.05; dur: 150");
    });
    bg.addEventListener("mouseleave", () => {
      btn.setAttribute("animation__hover", "property: scale; to: 1 1 1; dur: 150");
    });
    
    dom.multiplosSelectors.appendChild(btn);
    applyPendingTransforms(btn);
    currentX += w + 0.2;
  });
}

function buildMultiplos() {
  dom.multiplosGrid.innerHTML = "";
  
  const key = state.indicatorKey;
  const indDef = indicadorByKey(key);
  const indCor = indDef.cor;
  
  const contexts = [DADOS.brasil, ...DADOS.regioes];
  const items = contexts.map(ctx => {
    return {
      ctx,
      val: latestValue(ctx.series[key]) ?? -1
    };
  });
  
  if (indDef.sentido === "negativo") {
    items.sort((a, b) => b.val - a.val); // pior pro melhor: maior evasao (pior) primeiro
  } else {
    items.sort((a, b) => b.val - a.val); // melhor pro pior: maior valor (lidera) primeiro
  }
  
  const maxReg = items.find(i => i.ctx.tipo === "regiao");
  const minReg = [...items].reverse().find(i => i.ctx.tipo === "regiao");
  
  if (maxReg && minReg) {
    const diff = Math.abs(maxReg.val - minReg.val).toFixed(1).replace(".", ",");
    const pontaStr = indDef.sentido === "negativo" ? "pior" : "lidera";
    const baseStr = indDef.sentido === "negativo" ? "melhor" : "na lanterna";
    // Titulo curto (1 linha) + detalhe na nota, para nao encavalar o cabecalho.
    dom.multiplosTitle.setAttribute("value", `${indDef.label} por regiao (2024)`);
    dom.multiplosNote.setAttribute("value", `${maxReg.ctx.nome} ${pontaStr} (${fmt(maxReg.val)}%)  ·  ${minReg.ctx.nome} ${baseStr} (${fmt(minReg.val)}%)  —  ${diff} pp de diferenca`);
  } else {
    dom.multiplosTitle.setAttribute("value", `${indDef.label} por regiao (2024)`);
    dom.multiplosNote.setAttribute("value", "");
  }
  
  items.forEach((item, index) => {
    const col = index % MULTIPLOS.cols;
    const row = Math.floor(index / MULTIPLOS.cols);
    const px = MULTIPLOS.x[col];
    const py = MULTIPLOS.y[row];
    
    const panel = el("a-entity", { position: `${px} ${py} ${MULTIPLOS.z}` });
    
    const bg = el("a-plane", {
      width: MULTIPLOS.w, height: MULTIPLOS.h,
      material: "color: #0a1022; opacity: 0.6; transparent: true; shader: flat"
    });
    
    const isBrasil = item.ctx.tipo === "brasil";
    const headerCor = isBrasil ? "#7bdcff" : "#cfe0f4";
    const titleText = isBrasil ? "BRASIL" : item.ctx.nome;
    
    const title = el("a-text", {
      value: titleText, position: `-0.8 0.4 0.02`, width: 2.2,
      align: "left", color: headerCor, font: "kelsonsans"
    });
    const valText = el("a-text", {
      value: `${fmt(item.val)}%`, position: `0.8 0.4 0.02`, width: 2.2,
      align: "right", color: indCor, font: "kelsonsans"
    });
    
    const hit = el("a-plane", {
      class: "multiplos-clickable hit",
      width: MULTIPLOS.w, height: MULTIPLOS.h, position: "0 0 0.05",
      material: "color: #ffffff; opacity: 0.001; transparent: true"
    });
    
    hit.addEventListener("click", () => {
      if (state.transitioning) return;
      pushHistory(); // vindo do small multiples -> "Voltar" retorna a comparacao.
      // Vai direto a linha do tempo do contexto, sem renderizar a etapa de
      // indicadores no meio (evita o flash). Transicao in-place como no gauge -> timeline.
      state.context = item.ctx;
      state.parentRegion = null;
      state.drillRegion = null;
      state.compareOn = false;
      state.compareContext = resolveCompareContext(item.ctx);
      setEntityVisible(dom.multiplosView, false);
      enterTimeline(key);
    });
    hit.addEventListener("mouseenter", () => {
      bg.setAttribute("material", "opacity", 0.9);
      dom.hudSubtitle.textContent = `Clique para ver detalhes de ${titleText}`;
    });
    hit.addEventListener("mouseleave", () => {
      bg.setAttribute("material", "opacity", 0.6);
      dom.hudSubtitle.textContent = "Comparacao em mesma escala";
    });
    
    panel.append(bg, title, valText, hit);
    buildMiniChart(panel, item.ctx, key, DADOS.brasil);
    dom.multiplosGrid.appendChild(panel);
    // Aplica as transformacoes (posicao do painel + filhos) no object3D; sem isto o
    // painel fica na origem do mundo e todo o conteudo some do campo de visao.
    applyPendingTransforms(panel);
  });

  crumb("Inicio", "Comparar regioes", indDef.label);
}

function buildMiniChart(container, ctx, key, brasilCtx) {
  const series = ctx.series[key];
  const brasilSeries = brasilCtx.series[key];
  const indDef = indicadorByKey(key);

  const paddingX = 0.2;
  const bottomY = -0.4;
  const topY = 0.2;
  const width = MULTIPLOS.w - paddingX * 2;
  const height = topY - bottomY;
  const n = series.length;
  const stepX = width / (n - 1);

  const localY = (val) => bottomY + (val / 100) * height;
  const localX = (idx) => -width / 2 + idx * stepX;
  // Mantem o comprimento da serie (null = ano sem matricula) para preservar gaps.
  const ptsFrom = (s) => s.map((v, i) => (v == null ? null : { x: localX(i), y: localY(v) }));

  // Linha de referencia da media nacional (tracejada), so em paineis regionais.
  if (ctx.tipo !== "brasil") {
    addDashedSegments(container, ptsFrom(brasilSeries), "#9fb0d0", 0.01, 0.02, 0.4);
  }

  // Linha da regiao (solida, na cor do indicador).
  addLineSegments(container, ptsFrom(series), indDef.cor, 0.02, 0.03, 1);

  // Marcadores por ano.
  series.forEach((v, i) => {
    if (v == null) return;
    const dot = el("a-circle", {
      radius: 0.025, position: `${localX(i)} ${localY(v)} 0.03`,
      material: `color: ${indDef.cor}; shader: flat`,
    });
    container.appendChild(dot);
    applyPendingTransforms(dot);
  });
}
