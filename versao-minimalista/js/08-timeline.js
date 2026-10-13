// ----------------------------------------------------------------------------
// Etapa 3 - Linha do tempo (grafico anotado + abertura guiada).
// ----------------------------------------------------------------------------

const xFor = (i) => CHART.x0 + i * ((CHART.x1 - CHART.x0) / (DADOS.anos.length - 1));
const yFor = (v) => CHART.baseY + (v / 100) * CHART.maxH;

// ----------------------------------------------------------------------------
// Strollytelling: a posicao X do corpo percorre os anos (Jain et al. 2025).
// A faixa no piso vai de -WALK.half a +WALK.half; cada ano ocupa um trecho.
// Botoes < > continuam como fallback (VR sem espaco, acessibilidade).
// ----------------------------------------------------------------------------

const WALK = { half: 3.0, z: -0.9 }; // 6 m de corredor (~0,86 m/ano), alinhado 1:1 ao grafico
let walkTicks = [];
let walkVec = null;

const walkXFor = (i) => -WALK.half + (i / (DADOS.anos.length - 1)) * WALK.half * 2;

function buildWalkStrip() {
  if (!dom.walkStrip) return;
  dom.walkStrip.innerHTML = "";
  walkTicks = [];
  const base = el("a-plane", {
    width: WALK.half * 2 + 0.5, height: 0.05, rotation: "-90 0 0",
    position: `0 0.02 ${WALK.z}`,
    material: "color: #2f5d8a; opacity: 0.35; transparent: true; shader: flat",
  });
  dom.walkStrip.appendChild(base);
  applyPendingTransforms(base);

  DADOS.anos.forEach((ano, i) => {
    const x = round2(walkXFor(i));
    const tick = el("a-plane", {
      width: 0.03, height: 0.16, rotation: "-90 0 0",
      position: `${x} 0.025 ${WALK.z}`,
      material: "color: #9fc4ea; opacity: 0.8; transparent: true; shader: flat",
    });
    const lbl = el("a-text", {
      value: String(ano), rotation: "-90 0 0",
      position: `${x} 0.03 ${WALK.z + 0.24}`,
      width: 1.5, align: "center", color: "#7d93b4", font: "kelsonsans",
    });
    lbl.dataset.idx = String(i);
    dom.walkStrip.append(tick, lbl);
    applyPendingTransforms(tick);
    applyPendingTransforms(lbl);
    walkTicks.push(lbl);
  });

  const hint = el("a-text", {
    value: "caminhe para percorrer os anos", rotation: "-90 0 0",
    position: `0 0.03 ${WALK.z + 0.5}`, width: 2.6, align: "center",
    color: "#5f7896", font: "kelsonsans",
  });
  dom.walkStrip.appendChild(hint);
  applyPendingTransforms(hint);
  updateWalkHighlight();
}

function updateWalkHighlight() {
  walkTicks.forEach((t) => {
    const on = Number(t.dataset.idx) === state.yearIdx;
    t.setAttribute("color", on ? "#ffffff" : "#7d93b4");
  });
}

// Loop unico (rAF), auto-gateado: so age na timeline em exploracao livre.
function startWalkLoop() {
  if (!window.AFRAME || !AFRAME.THREE || !dom.camera) return;
  walkVec = new AFRAME.THREE.Vector3();
  const step = () => {
    requestAnimationFrame(step);
    if (state.stage !== "timeline" || state.guided || state.tourActive || state.transitioning) return;
    if (state.yearIdx == null || !dom.camera.object3D) return;
    dom.camera.object3D.getWorldPosition(walkVec);
    const n = DADOS.anos.length;
    const rel = (walkVec.x + WALK.half) / (WALK.half * 2);
    const raw = clampIdx(Math.round(rel * (n - 1)), n);
    if (raw === state.yearIdx) return;
    // Histerese: so troca quando o corpo esta claramente no trecho do novo ano,
    // evitando alternancia nervosa na fronteira entre dois anos.
    const trecho = (WALK.half * 2) / (n - 1);
    if (Math.abs(walkVec.x - walkXFor(raw)) > trecho / 2 - 0.05) return;
    selectYear(raw);
    updateWalkHighlight();
  };
  requestAnimationFrame(step);
}

function enterTimeline(key, skipGuided, fromWalk) {
  state.stage = "timeline";
  state.indicatorKey = key;
  // Fase 1.6: cliques teleportam (fallback); quem chegou ANDANDO fica onde esta.
  if (!state.tourActive && !fromWalk) blinkToStation("timeline");

  const indicador = indicadorByKey(key);
  setEntityVisible(dom.composicaoView, false);
  setEntityVisible(dom.multiplosView, false);
  setEntityVisible(dom.tourPanel, false);
  hideInfoPanelNow();
  setEntityVisible(dom.timelineView, true);
  dom.compLegend.hidden = true;

  // (Fase 1) o cabecalho dos indicadores permanece vivo na estacao dele.
  crumb("Inicio", rotuloContexto(state.context), "Indicadores", indicador.label);
  setNota("timeline");
  setChartColor(indicador.cor);
  animateViewIn(dom.timelineView);
  resetMiniMap();

  buildChartGrid();
  buildTimeline();
  buildWalkStrip();
  // Durante o tour a faixa fica oculta (a navegacao e por cenas, nao por anos).
  setEntityVisible(dom.walkStrip, !state.tourActive);
  applyCompare();
  updateNarrativePanel();
  updateAmbientDrone();
  if (skipGuided) {
    // Tour guiado controla a narrativa; pula a abertura martini-glass.
    finishGuided();
  } else {
    playGuided();
  }
}

function setChartColor(cor) {
  dom.chartGlow.setAttribute("material", `color: ${cor}; opacity: 0.06; transparent: true; shader: flat; side: double`);
  dom.focusBand.setAttribute("material", `color: ${cor}; opacity: 0.14; transparent: true; shader: flat`);
  dom.stageSpot.setAttribute("light", `type: point; color: ${cor}; intensity: 1.2; distance: 12`);
}

function buildChartGrid() {
  dom.chartGrid.innerHTML = "";
  const cx = (CHART.x0 + CHART.x1) / 2;
  const largura = CHART.x1 - CHART.x0 + 0.5;
  [0, 25, 50, 75, 100].forEach((pct) => {
    const y = yFor(pct);
    const linha = el("a-plane", {
      width: largura, height: pct === 0 ? 0.012 : 0.006,
      position: `${cx} ${y} ${CHART.z - 0.04}`,
      material: `color: ${pct === 0 ? "#3f6796" : "#24405f"}; opacity: ${pct === 0 ? 0.8 : 0.5}; transparent: true; shader: flat`,
    });
    const rotulo = el("a-text", {
      value: `${pct}%`, position: `${CHART.x0 - 0.45} ${y} ${CHART.z - 0.03}`,
      width: 1.6, align: "right", color: "#7d93b4", font: "kelsonsans",
    });
    dom.chartGrid.append(linha, rotulo);
    applyPendingTransforms(linha);
    applyPendingTransforms(rotulo);
  });
}

function pontosDe(serie) {
  return serie.map((v, i) => (v == null ? null : { x: xFor(i), y: yFor(v), v, i }));
}

function buildTimeline() {
  dom.timelineBars.innerHTML = "";
  dom.trendLine.innerHTML = "";
  dom.markers.innerHTML = "";
  dom.yearTicks.innerHTML = "";
  dom.annotations.innerHTML = "";

  const indicador = indicadorByKey(state.indicatorKey);
  const serie = state.context.series[state.indicatorKey];
  const anos = DADOS.anos;
  const pts = pontosDe(serie);
  const { peakIdx, valleyIdx } = extremos(serie);
  state.calloutIdxs = new Set([peakIdx, valleyIdx]);

  // Banda de foco (posicionada em updateYear). Escondida ate o primeiro foco.
  dom.focusBand.setAttribute("width", 0.52);
  dom.focusBand.setAttribute("height", CHART.maxH);
  setEntityVisible(dom.focusBand, false);
  setEntityVisible(dom.valueReadout, false);

  // Torres de voxel por ano (Fase 2.2): trilho de 100 blocos, acesos ate o
  // valor (1 bloco = 1%). A linha anotada segue sendo o heroi narrativo; a
  // torre da materia e escala. Clique fica num hitbox unico por ano.
  anos.forEach((ano, i) => {
    const v = serie[i];
    if (v != null) {
      const tower = el("a-entity", { position: `${xFor(i)} ${CHART.baseY} ${CHART.z - 0.06}` });
      dom.timelineBars.appendChild(tower);
      applyPendingTransforms(tower);
      const grade = createVoxelGrid({
        count: 100, layout: "tower", layerH: CHART.maxH / 25,
        sizeX: 0.2, sizeY: CHART.maxH / 25 - 0.008, sizeZ: 0.14,
      });
      grade.setSegments([{ cor: indicador.cor, n: Math.round(v) }]);
      attachVoxelMesh(tower, grade.mesh);
    }
    {
      const hit = el("a-box", {
        class: "clickable timeline-clickable", width: 0.36, depth: 0.3, height: CHART.maxH,
        position: `${xFor(i)} ${CHART.baseY + CHART.maxH / 2} ${CHART.z - 0.02}`,
        material: "color: #ffffff; opacity: 0.001; transparent: true",
      });
      hit.dataset.idx = String(i);
      hit.addEventListener("click", () => selectYear(i));
      dom.timelineBars.appendChild(hit);
      applyPendingTransforms(hit);
    }

    const tick = el("a-text", {
      value: String(ano), position: `${xFor(i)} ${CHART.baseY - 0.22} ${CHART.z}`,
      width: 1.7, align: "center", color: "#90a6c6", font: "kelsonsans",
    });
    dom.yearTicks.appendChild(tick);
    applyPendingTransforms(tick);
  });

  // Linha de tendencia (heroi narrativo).
  addLineSegments(dom.trendLine, pts, indicador.cor, CHART.z + 0.02, 0.05, 0.95);

  // Marcadores por ano.
  pts.forEach((p, i) => {
    if (!p) return;
    const marker = el("a-entity", { position: `${p.x} ${p.y} ${CHART.z + 0.04}` });
    marker.dataset.idx = String(i);
    const dot = el("a-sphere", {
      class: "marker-dot", radius: 0.075,
      material: `color: ${indicador.cor}; emissive: ${indicador.cor}; emissiveIntensity: 0.5; roughness: 0.3`,
    });
    const halo = el("a-ring", {
      radiusInner: 0.1, radiusOuter: 0.13,
      material: `color: ${indicador.cor}; opacity: 0.5; transparent: true; shader: flat`,
    });
    marker.append(halo, dot);
    dom.markers.appendChild(marker);
    applyPendingTransforms(marker);
  });

  // Callouts de pico/vale (com linha-guia).
  buildCallout(peakIdx, serie, indicador, indicador.sentido === "negativo");
  buildCallout(valleyIdx, serie, indicador, indicador.sentido !== "negativo");

  // Anotacoes de eventos de contexto (ex.: pandemia de 2020).
  buildEventos();
}

function buildEventos() {
  (DADOS.eventos || []).forEach((ev) => {
    const i = DADOS.anos.indexOf(ev.ano);
    if (i < 0) return;
    const x = xFor(i);
    const cor = "#aab4d4"; // tom neutro: e contexto, nao um indicador

    // Linha vertical marcando o ano do evento.
    const guia = el("a-box", {
      class: "evento-linha", width: 0.02, height: CHART.maxH, depth: 0.01,
      position: `${x} ${CHART.baseY + CHART.maxH / 2} ${CHART.z - 0.01}`,
      material: `color: ${cor}; opacity: 0.3; transparent: true; shader: flat`,
    });
    // Etiqueta no topo do grafico.
    const tagY = yFor(100) + 0.18;
    const tag = el("a-entity", { position: `${x} ${tagY} ${CHART.z + 0.04}` });
    const plate = el("a-plane", {
      width: 1.45, height: 0.28,
      material: `color: #1a2336; opacity: 0.95; transparent: true; shader: flat`,
    });
    const barra = el("a-plane", {
      width: 1.45, height: 0.04, position: "0 0.16 0.005",
      material: `color: ${cor}; shader: flat`,
    });
    const txt = el("a-text", {
      value: `${ev.ano} · Pandemia`, position: "0 0 0.01", width: 2.3,
      align: "center", color: "#dde6f7", font: "kelsonsans",
    });
    tag.append(plate, barra, txt);
    dom.annotations.append(guia, tag);
    applyPendingTransforms(guia);
    applyPendingTransforms(tag);
  });
}

function buildCallout(idx, serie, indicador, isCritico) {
  if (idx < 0 || serie[idx] == null) return;
  const x = xFor(idx);
  const y = yFor(serie[idx]);
  const cor = isCritico ? "#ffb454" : "#65e4b8";
  const rotulo = isCritico
    ? indicador.sentido === "negativo" ? "Pico critico" : "Ponto critico"
    : "Melhor ano";

  // Card deslocado para dentro do grafico, acima do ponto.
  const lado = x <= 0 ? 1 : -1;
  const cardX = x + lado * 0.95;
  const cardY = Math.min(yFor(100) - 0.45, y + 0.55);

  const grupo = el("a-entity", {});
  grupo.dataset.callout = idx === 0 ? "0" : String(idx);

  // Linha-guia do ponto ao card.
  const dx = cardX - x;
  const dy = cardY - y;
  const len = Math.hypot(dx, dy);
  const ang = (Math.atan2(dy, dx) * 180) / Math.PI;
  const guia = el("a-box", {
    width: len, height: 0.012, depth: 0.01,
    position: `${(x + cardX) / 2} ${(y + cardY) / 2} ${CHART.z + 0.03}`,
    rotation: `0 0 ${round2(ang)}`,
    material: `color: ${cor}; opacity: 0.7; transparent: true; shader: flat`,
  });
  // Linha interpretativa, calculada dos dados (nao fixa): vs. media nacional ou vs. inicio da serie.
  const valorAno = serie[idx];
  const bserie = DADOS.brasil.series[indicador.key];
  let interp = "";
  if (state.context && state.context.tipo !== "brasil" && bserie && bserie[idx] != null) {
    const d = valorAno - bserie[idx];
    interp = `${fmt(Math.abs(d))} pp ${d >= 0 ? "acima" : "abaixo"} da media nacional`;
  } else {
    const fi = serie.findIndex((v) => v != null);
    if (fi >= 0 && fi !== idx) {
      const d = valorAno - serie[fi];
      interp = `${d >= 0 ? "+" : "-"}${fmt(Math.abs(d))} pp desde ${DADOS.anos[fi]}`;
    }
  }

  const card = el("a-plane", {
    width: 1.7, height: 0.66, position: `${cardX} ${cardY} ${CHART.z + 0.05}`,
    material: `color: #0c1426; opacity: 0.95; transparent: true; shader: flat`,
  });
  const barra = el("a-plane", {
    width: 0.05, height: 0.66, position: `${cardX - 0.82} ${cardY} ${CHART.z + 0.06}`,
    material: `color: ${cor}; shader: flat`,
  });
  const titulo = el("a-text", {
    value: rotulo, position: `${cardX - 0.73} ${cardY + 0.2} ${CHART.z + 0.06}`,
    width: 2.2, align: "left", anchor: "left", color: "#ffffff", font: "kelsonsans",
  });
  const valor = el("a-text", {
    value: `${fmt(serie[idx])}% em ${DADOS.anos[idx]}`,
    position: `${cardX - 0.73} ${cardY - 0.02} ${CHART.z + 0.06}`,
    width: 2.2, align: "left", anchor: "left", color: "#cfe0f4", font: "kelsonsans",
  });
  grupo.append(guia, card, barra, titulo, valor);
  if (interp) {
    grupo.appendChild(el("a-text", {
      value: interp, position: `${cardX - 0.73} ${cardY - 0.22} ${CHART.z + 0.06}`,
      width: 2.0, align: "left", anchor: "left", color: cor, font: "kelsonsans",
    }));
  }
  dom.annotations.appendChild(grupo);
  applyPendingTransforms(grupo);
}

function addLineSegments(container, pts, color, z, thickness, opacity) {
  for (let i = 0; i < pts.length - 1; i += 1) {
    const a = pts[i];
    const b = pts[i + 1];
    if (!a || !b) continue;
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const len = Math.hypot(dx, dy);
    const ang = (Math.atan2(dy, dx) * 180) / Math.PI;
    const seg = el("a-box", {
      width: len, height: thickness, depth: 0.02,
      position: `${(a.x + b.x) / 2} ${(a.y + b.y) / 2} ${z}`,
      rotation: `0 0 ${round2(ang)}`,
      material: `color: ${color}; shader: flat; opacity: ${opacity}; transparent: true`,
    });
    container.appendChild(seg);
    applyPendingTransforms(seg);
  }
}

// Variante tracejada (usada na linha de referencia da media nacional nos small
// multiples). Mesma logica de addLineSegments, mas quebra cada segmento em tracos.
function addDashedSegments(container, pts, color, z, thickness, opacity, dash = 0.07, gap = 0.05) {
  for (let i = 0; i < pts.length - 1; i += 1) {
    const a = pts[i];
    const b = pts[i + 1];
    if (!a || !b) continue;
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const len = Math.hypot(dx, dy);
    if (len === 0) continue;
    const ang = (Math.atan2(dy, dx) * 180) / Math.PI;
    const ux = dx / len;
    const uy = dy / len;
    const period = dash + gap;
    for (let d = 0; d < len; d += period) {
      const segLen = Math.min(dash, len - d);
      const cx = a.x + ux * (d + segLen / 2);
      const cy = a.y + uy * (d + segLen / 2);
      const seg = el("a-box", {
        width: segLen, height: thickness, depth: 0.02,
        position: `${round2(cx)} ${round2(cy)} ${z}`,
        rotation: `0 0 ${round2(ang)}`,
        material: `color: ${color}; shader: flat; opacity: ${opacity}; transparent: true`,
      });
      container.appendChild(seg);
      applyPendingTransforms(seg);
    }
  }
}

function applyCompare() {
  dom.compareBars.innerHTML = "";
  if (!state.compareOn || !state.compareContext) {
    setEntityVisible(dom.compareBars, false);
    return;
  }
  setEntityVisible(dom.compareBars, true);
  const pts = pontosDe(state.compareContext.series[state.indicatorKey]);
  addLineSegments(dom.compareBars, pts, "#ffb454", CHART.z + 0.01, 0.035, 0.85);
  pts.forEach((p) => {
    if (!p) return;
    const dot = el("a-sphere", {
      radius: 0.05, position: `${p.x} ${p.y} ${CHART.z + 0.015}`,
      material: "color: #ffb454; emissive: #ffb454; emissiveIntensity: 0.4; opacity: 0.9; transparent: true",
    });
    dom.compareBars.appendChild(dot);
    applyPendingTransforms(dot);
  });
}

// ---- Navegacao por ano ----

function selectYear(idx) {
  if (state.guided) return; // durante a abertura guiada o passo e automatico
  state.yearIdx = idx;
  tlog("ano", { ano: DADOS.anos[idx], indicador: state.indicatorKey });
  updateYear();
}

function stepYear(delta) {
  if (state.guided || state.yearIdx == null) return;
  state.yearIdx = clampIdx(state.yearIdx + delta, DADOS.anos.length);
  updateYear();
}

function updateYear() {
  const idx = state.yearIdx;
  const ano = DADOS.anos[idx];
  const serie = state.context.series[state.indicatorKey];
  const v = serie[idx];
  const x = xFor(idx);

  dom.ctrlYearLabel.setAttribute("value", String(ano));

  setEntityVisible(dom.focusBand, v != null);
  if (v != null) {
    setVectorAttribute(dom.focusBand, "position", `${x} ${CHART.baseY + CHART.maxH / 2} ${CHART.z - 0.015}`);
  }

  setEntityVisible(dom.valueReadout, true);
  let ry = v != null ? yFor(v) + 0.32 : CHART.baseY + 0.4;
  // Nao encavalar: se o ano em foco tem callout (pico/vale) ou tag de evento
  // (ex.: 2020), o readout desce para baixo do marcador.
  const anoTemEvento = (DADOS.eventos || []).some((ev) => ev.ano === DADOS.anos[idx]);
  const anoTemCallout = state.calloutIdxs instanceof Set && state.calloutIdxs.has(idx);
  if (v != null && (anoTemCallout || anoTemEvento || ry > yFor(100) - 0.2)) {
    ry = Math.max(CHART.baseY + 0.18, yFor(v) - 0.34);
  }
  setVectorAttribute(dom.valueReadout, "position", `${x} ${ry} ${CHART.z + 0.07}`);
  dom.valueReadout.setAttribute("value", v == null ? `${ano}: s/ dados` : `${ano}  ${fmt(v)}%`);

  // Realce do marcador selecionado.
  dom.markers.querySelectorAll("[data-idx]").forEach((m) => {
    const on = Number(m.dataset.idx) === idx;
    m.setAttribute("animation__f", `property: scale; to: ${on ? "1.7 1.7 1.7" : "1 1 1"}; dur: 180; easing: easeOutQuad`);
  });

  // Linha do ano: % + numeros absolutos + variacao + comparacao.
  let delta = "";
  const prev = idx > 0 ? serie[idx - 1] : null;
  if (v != null && prev != null) {
    const diff = v - prev;
    delta = ` (${diff > 0 ? "+" : ""}${fmt(diff)} pp vs ${DADOS.anos[idx - 1]})`;
  }
  const linha1 = v == null ? `${ano}: sem dados` : `${ano}: ${fmt(v)}%${delta}${compareLineFor(idx)}`;
  const abs = absoluteText(state.context, state.indicatorKey, idx);
  dom.narrativeYear.setAttribute("value", abs ? `${linha1}\n${abs}` : linha1);

  const absHud = abs ? ` · ${abs}` : "";
  dom.hudSubtitle.textContent = v == null ? `${ano}: sem dados` : `${ano}: ${fmt(v)}%${absHud}`;
  
  // Audio Note
  if (v != null) {
    const validos = serie.filter(val => val != null);
    const marcador = dom.markers.querySelector(`[data-idx="${idx}"]`);
    playDataNote(v, Math.min(...validos), Math.max(...validos), idx, serie.length, marcador);
  }

  // Strollytelling: o callout do pico/vale aparece quando se CHEGA ao ano.
  if (state.calloutIdxs instanceof Set && state.calloutIdxs.has(idx)) revealCallout(idx);

  updateWalkHighlight(); // faixa do piso acompanha tambem a navegacao por botoes
}

// Texto de numeros absolutos (estudantes) por tras do percentual do ano.
const NOUN = { evasao: "evadidos", conclusao: "concluintes", retencao: "retidos" };
function countFor(ctx, key, idx) {
  const c = ctx.series.contagens;
  if (!c) return null;
  if (key === "evasao") return c.evadidos[idx];
  if (key === "conclusao") return c.concluidos[idx];
  if (key === "retencao") return c.retidos[idx];
  return null; // eficiencia: indicador derivado, sem contagem direta
}
function absoluteText(ctx, key, idx) {
  const matr = ctx.series.matriculas ? ctx.series.matriculas[idx] : null;
  if (!matr) return "";
  const cnt = countFor(ctx, key, idx);
  if (cnt == null) return `base de ${fmtInt(matr)} matriculas`;
  return `${fmtInt(cnt)} ${NOUN[key]} de ${fmtInt(matr)} matriculas`;
}
function fmtInt(n) {
  if (n == null) return "-";
  return Math.round(n).toLocaleString("pt-BR");
}

function compareLineFor(idx) {
  if (!state.compareOn || !state.compareContext) return "";
  const v = state.compareContext.series[state.indicatorKey][idx];
  if (v == null) return "";
  return `   |   ${rotuloCurto(state.compareContext)}: ${fmt(v)}%`;
}

function updateNarrativePanel() {
  const indicador = indicadorByKey(state.indicatorKey);
  const narr = computeNarrative(state.context, state.indicatorKey);
  dom.narrativeTitle.setAttribute("value", narr.manchete);
  dom.narrativeText.setAttribute("value", narr.texto);
  void indicador;
}

