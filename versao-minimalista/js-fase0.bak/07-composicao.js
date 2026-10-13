// ----------------------------------------------------------------------------
// Etapa C - Composicao "Para onde vao os alunos" (barras empilhadas + anel).
// ----------------------------------------------------------------------------

const COMP = { x0: -3.0, x1: 1.6, baseY: 1.2, maxH: 1.5, z: -3.3 };
const COMP_COLORS = { concluidos: "#3ad29f", retidos: "#ffd166", evadidos: "#ff6b6b" };
const COMP_NOUN = { concluidos: "concluintes", retidos: "retidos", evadidos: "evadidos" };
const compXFor = (i) => COMP.x0 + i * ((COMP.x1 - COMP.x0) / (DADOS.anos.length - 1));
let compFocusEl = null;

function bindCompControls() {
  // Botao de entrada (na tela de indicadores).
  const enterHit = dom.compEnter.querySelector(".indicator-clickable");
  enterHit.addEventListener("click", () => { if (!state.transitioning) { pushHistory(); enterComposicao(); } });
  enterHit.addEventListener("mouseenter", () => dom.compEnter.setAttribute("animation__h", "property: scale; to: 1.05 1.05 1.05; dur: 150"));
  enterHit.addEventListener("mouseleave", () => dom.compEnter.setAttribute("animation__h", "property: scale; to: 1 1 1; dur: 150"));

  clickable2(dom.compPrev).addEventListener("click", () => stepCompYear(-1));
  clickable2(dom.compNext).addEventListener("click", () => stepCompYear(1));
  [dom.compPrev, dom.compNext].forEach((ctrl) => {
    const hit = clickable2(ctrl);
    hit.addEventListener("mouseenter", () => ctrl.setAttribute("animation__h", "property: scale; to: 1.08 1.08 1.08; dur: 150"));
    hit.addEventListener("mouseleave", () => ctrl.setAttribute("animation__h", "property: scale; to: 1 1 1; dur: 150"));
  });
}

function clickable2(controlEntity) {
  return controlEntity.querySelector(".composicao-clickable");
}

function lastYearWithMatriculas(ctx) {
  const m = ctx.series.matriculas;
  for (let i = m.length - 1; i >= 0; i -= 1) if (m[i] > 0) return i;
  return m.length - 1;
}

function enterComposicao() {
  cancelGuided();
  stopNarration();
  stopAmbientDrone();
  state.stage = "composicao";
  state.compYearIdx = lastYearWithMatriculas(state.context);

  setEntityVisible(dom.indicatorView, false);
  hideInfoPanelNow();
  setEntityVisible(dom.timelineView, false);
  setEntityVisible(dom.multiplosView, false);
  setEntityVisible(dom.tourPanel, false);
  setEntityVisible(dom.composicaoView, true);
  setEntityVisible(dom.contextKicker, false);
  setEntityVisible(dom.contextTitle, false);
  setEntityVisible(dom.contextLead, false);

  dom.compTitle.setAttribute("value", `Para onde vao os alunos - ${rotuloContexto(state.context)}`);
  dom.compText.setAttribute("value", compNarrative(state.context));
  // Legenda agora e 3D (junto da parede de blocos): visivel tambem em VR.
  crumb("Inicio", rotuloContexto(state.context), "Indicadores", "Para onde vao os alunos");
  setNota("composicao");
  animateViewIn(dom.composicaoView);
  resetMiniMap();

  buildComposicao();
  updateCompYear(); // ja chama updateCompEfficacyConnective() no fim (evita conectivo duplicado)
  setInteractionMode("composicao");
}

function compNarrative(ctx) {
  const i = lastYearWithMatriculas(ctx);
  const m = ctx.series.matriculas[i];
  const c = ctx.series.contagens;
  if (!m) return "Sem dados de composicao para este contexto.";
  const pc = (c.concluidos[i] / m) * 100;
  const pr = (c.retidos[i] / m) * 100;
  const pe = (c.evadidos[i] / m) * 100;
  return `Em ${DADOS.anos[i]}, de ${fmtInt(m)} matriculas: ${fmt(pc)}% concluiram, ${fmt(pe)}% evadiram e ${fmt(pr)}% seguem retidos.`;
}

function buildComposicao() {
  dom.compScene.innerHTML = "";
  const anos = DADOS.anos;
  const c = state.context.series.contagens;
  const matr = state.context.series.matriculas;
  const cx = (COMP.x0 + COMP.x1) / 2;
  const larguraGrade = COMP.x1 - COMP.x0 + 0.5;

  // Grade de % (0-100).
  [0, 25, 50, 75, 100].forEach((pct) => {
    const y = COMP.baseY + (pct / 100) * COMP.maxH;
    const linha = el("a-plane", {
      width: larguraGrade, height: pct === 0 ? 0.012 : 0.006,
      position: `${cx} ${y} ${COMP.z - 0.04}`,
      material: `color: ${pct === 0 ? "#3f6796" : "#24405f"}; opacity: ${pct === 0 ? 0.8 : 0.45}; transparent: true; shader: flat`,
    });
    const rotulo = el("a-text", {
      value: `${pct}%`, position: `${COMP.x0 - 0.45} ${y} ${COMP.z - 0.03}`,
      width: 1.5, align: "right", color: "#7d93b4", font: "kelsonsans",
    });
    dom.compScene.append(linha, rotulo);
    applyPendingTransforms(linha);
    applyPendingTransforms(rotulo);
  });

  // Barras empilhadas (100%) por ano: concluidos (base) -> retidos -> evadidos (topo).
  anos.forEach((ano, i) => {
    const m = matr[i];
    const x = compXFor(i);
    if (m > 0) {
      const fr = { concluidos: c.concluidos[i] / m, retidos: c.retidos[i] / m, evadidos: c.evadidos[i] / m };
      const nConc = Math.round(fr.concluidos * 100);
      const nRet = Math.round(fr.retidos * 100);
      // evadidos = resto (j >= nConc + nRet), garantindo sempre 100 blocos.

      // Torre de voxels instanciada (Fase 0.3): 100 blocos = 1 draw call
      // (antes: 100 a-box por ano = ~800 meshes na cena). O clique continua
      // no hitbox unico; a torre e so materia visual.
      const layerH = COMP.maxH / 25; // 25 camadas de 2x2; cada bloco = 1% do ano
      const tower = el("a-entity", { position: `${x} ${COMP.baseY} ${COMP.z}` });
      dom.compScene.appendChild(tower);
      applyPendingTransforms(tower);
      const torreGrid = createVoxelGrid({
        count: 100, layout: "tower", layerH,
        sizeX: 0.23, sizeY: layerH - 0.01, sizeZ: 0.18,
      });
      torreGrid.setSegments([
        { cor: COMP_COLORS.concluidos, n: nConc },
        { cor: COMP_COLORS.retidos, n: nRet },
        { cor: COMP_COLORS.evadidos, n: 100 - nConc - nRet },
      ]);
      attachVoxelMesh(tower, torreGrid.mesh);

      // Hitbox unico do ano (o unico .clickable da torre) que captura o raycaster.
      const hit = el("a-box", {
        class: "comp-seg clickable composicao-clickable",
        width: 0.5, depth: 0.4, height: COMP.maxH,
        position: `${x} ${COMP.baseY + COMP.maxH / 2} ${COMP.z}`,
        material: "opacity: 0; transparent: true",
      });
      hit.dataset.idx = String(i);
      hit.addEventListener("click", () => selectCompYear(i));
      dom.compScene.appendChild(hit);
      applyPendingTransforms(hit);
    } else {
      const hit = el("a-box", {
        class: "clickable composicao-clickable", width: 0.5, depth: 0.4, height: 0.4,
        position: `${x} ${COMP.baseY + 0.2} ${COMP.z}`,
        material: "color: #ffffff; opacity: 0.001; transparent: true",
      });
      hit.dataset.idx = String(i);
      hit.addEventListener("click", () => selectCompYear(i));
      dom.compScene.appendChild(hit);
      applyPendingTransforms(hit);
    }
    const tick = el("a-text", {
      value: String(ano), position: `${x} ${COMP.baseY - 0.22} ${COMP.z}`,
      width: 1.6, align: "center", color: "#90a6c6", font: "kelsonsans",
    });
    dom.compScene.appendChild(tick);
    applyPendingTransforms(tick);
  });

  // Container do foco (banda) reconstruido a cada ano.
  compFocusEl = el("a-entity", {});
  dom.compScene.appendChild(compFocusEl);

  buildCompWall();
}

// ----------------------------------------------------------------------------
// Parede de 100 blocos (visceralizacao): 1 bloco = 1% dos estudantes do ano em
// foco. E a representacao por unidades do artigo aplicada a exploracao livre
// (antes existia so no tour). Substitui o donut, que duplicava a torre do ano.
// ----------------------------------------------------------------------------

const WALL = { x: 2.55, y0: 1.05, gap: 0.13, size: 0.115, cols: 10 };
let compWallHandle = null;

function buildCompWall() {
  dom.compWall.innerHTML = "";
  // Parede instanciada (Fase 0.3): 100 blocos em 1 draw call; recoloracao por
  // faixas via setSegments, sem reconstruir geometria a cada troca de ano.
  const wallEnt = el("a-entity", { position: `${WALL.x} ${WALL.y0} ${COMP.z}` });
  dom.compWall.appendChild(wallEnt);
  applyPendingTransforms(wallEnt);
  compWallHandle = createVoxelGrid({
    count: 100, layout: "wall", cols: WALL.cols, gap: WALL.gap,
    sizeX: WALL.size, sizeY: WALL.size, sizeZ: WALL.size,
  });
  attachVoxelMesh(wallEnt, compWallHandle.mesh);

  const topY = WALL.y0 + WALL.cols * WALL.gap + 0.12;
  const tYear = el("a-text", {
    id: "compWallYear", value: "", position: `${WALL.x} ${topY + 0.2} ${COMP.z}`,
    width: 2.4, align: "center", color: "#ffffff", font: "kelsonsans",
  });
  const tSub = el("a-text", {
    value: "cada bloco = 1% dos estudantes", position: `${WALL.x} ${topY} ${COMP.z}`,
    width: 1.9, align: "center", color: "#8da0bb", font: "kelsonsans",
  });
  dom.compWall.append(tYear, tSub);
  applyPendingTransforms(tYear);
  applyPendingTransforms(tSub);

  // Legenda 3D (funciona tambem em VR, onde o HUD 2D nao existe).
  const legendDefs = [["concluidos", "Concluiram"], ["retidos", "Retidos"], ["evadidos", "Evadiram"]];
  legendDefs.forEach(([key, label], i) => {
    const y = WALL.y0 - 0.28 - i * 0.17;
    const sw = el("a-plane", {
      width: 0.11, height: 0.11, position: `${WALL.x - 0.45} ${y} ${COMP.z}`,
      material: `color: ${COMP_COLORS[key]}; shader: flat`,
    });
    const tx = el("a-text", {
      value: label, position: `${WALL.x - 0.32} ${y} ${COMP.z}`,
      width: 1.7, align: "left", anchor: "left", color: "#cfe0f4", font: "kelsonsans",
    });
    dom.compWall.append(sw, tx);
    applyPendingTransforms(sw);
    applyPendingTransforms(tx);
  });
}

function selectCompYear(idx) {
  state.compYearIdx = idx;
  updateCompYear();
}

function stepCompYear(delta) {
  if (state.compYearIdx == null) return;
  state.compYearIdx = clampIdx(state.compYearIdx + delta, DADOS.anos.length);
  updateCompYear();
}

function updateCompYear() {
  const idx = state.compYearIdx;
  const ano = DADOS.anos[idx];
  const c = state.context.series.contagens;
  const m = state.context.series.matriculas[idx];
  dom.compYearLabel.setAttribute("value", String(ano));
  if (!compFocusEl) return;
  compFocusEl.innerHTML = "";

  const x = compXFor(idx);
  const band = el("a-plane", {
    width: 0.56, height: COMP.maxH, position: `${x} ${COMP.baseY + COMP.maxH / 2} ${COMP.z - 0.02}`,
    material: "color: #ffffff; opacity: 0.1; transparent: true; shader: flat",
  });
  compFocusEl.append(band);
  applyPendingTransforms(band);

  const wallYearEl = dom.compWall ? dom.compWall.querySelector("#compWallYear") : null;
  if (m > 0) {
    const fr = { concluidos: c.concluidos[idx] / m, retidos: c.retidos[idx] / m, evadidos: c.evadidos[idx] / m };
    // Parede de 100 blocos: recolore por proporcao (base = concluintes; topo = evadidos).
    const nConc = Math.round(fr.concluidos * 100);
    const nRet = Math.round(fr.retidos * 100);
    if (compWallHandle) {
      compWallHandle.setSegments([
        { cor: COMP_COLORS.concluidos, n: nConc },
        { cor: COMP_COLORS.retidos, n: nRet },
        { cor: COMP_COLORS.evadidos, n: 100 - nConc - nRet },
      ]);
    }
    if (wallYearEl) wallYearEl.setAttribute("value", `${ano} · ${fmtInt(m)} matriculas`);
    playCompositionChord(fr.concluidos, fr.retidos, fr.evadidos);
    dom.compReadout.setAttribute(
      "value",
      `${ano}: ${fmtInt(c.concluidos[idx])} ${COMP_NOUN.concluidos} · ${fmtInt(c.retidos[idx])} ${COMP_NOUN.retidos} · ${fmtInt(c.evadidos[idx])} ${COMP_NOUN.evadidos}`
    );
  } else {
    if (compWallHandle) compWallHandle.setSegments([]); // volta a cor base ("sem dados")
    if (wallYearEl) wallYearEl.setAttribute("value", `${ano} · sem dados`);
    dom.compReadout.setAttribute("value", `${ano}: sem dados`);
  }
  dom.hudSubtitle.textContent = `Composicao ${ano}`;
  // A4: atualizar conectivo causal ao trocar o ano.
  updateCompEfficacyConnective();
}

// A4: conectivo que liga a composicao (voxels de evasao) ao indicador de Eficiencia.
function updateCompEfficacyConnective() {
  if (!dom.compReadout || state.stage !== "composicao") return;
  const idx = state.compYearIdx;
  const ctx = state.context;
  const ef = ctx.series.eficiencia[idx];
  const m = ctx.series.matriculas[idx];
  const c = ctx.series.contagens;
  if (m > 0 && ef != null && c) {
    const pc = (c.concluidos[idx] / m) * 100;
    const pr = (c.retidos[idx] / m) * 100;
    const pe = (c.evadidos[idx] / m) * 100;
    const current = dom.compReadout.getAttribute("text")?.value || dom.compReadout.getAttribute("value") || "";
    const base = current.split("\n")[0];
    const connective = `\nConclusao ${fmt(pc)}% e evasao ${fmt(pe)}% resultam em eficiencia ${fmt(ef)}%.`;
    dom.compReadout.setAttribute("value", base + connective);
  }
}

