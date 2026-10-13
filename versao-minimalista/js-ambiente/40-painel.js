// ----------------------------------------------------------------------------
// PAINEL EMERGENTE (3D): a visualizacao da regiao.
//
// No desenho ele "surge acima" e "flutua no eixo Z", ligado por um fio a regiao
// em foco. Aqui ele nasce em cima da regiao olhada, sobe ate a altura dos olhos
// e vira de frente para quem o chamou. Dentro: o grafico anotado 2017-2024 do
// indicador ativo (heroi narrativo) e a parede de 100 blocos do ano em foco
// (para onde foram os estudantes daquele ano). Duas leituras, uma lingua visual.
// ----------------------------------------------------------------------------

const CH = { x0: -1.3, x1: 0.38, baseY: -0.48, maxH: 0.66 };
const PAREDE = { x: 1.0, y0: -0.32, cols: 10, gap: 0.05, size: 0.042 };
const COMP_CORES = { concluidos: "#3ad29f", retidos: "#ffd166", evadidos: "#ff6b6b" };

const chartXFor = (i) => round2(CH.x0 + i * ((CH.x1 - CH.x0) / (DADOS.anos.length - 1)));
const chartYFor = (v) => round2(CH.baseY + (v / 100) * CH.maxH);

let paredeHandle = null;
let anoEls = [];

function buildPainel() {
  buildChartGrade();
  buildParede();
}

// ---------------------------------------------------------------------------
// Grade fixa do grafico (nao depende dos dados)
// ---------------------------------------------------------------------------

function buildChartGrade() {
  dom.chartGrid.innerHTML = "";
  [0, 25, 50, 75, 100].forEach((v) => {
    const y = chartYFor(v);
    dom.chartGrid.appendChild(
      el("a-plane", {
        width: CH.x1 - CH.x0 + 0.06,
        height: 0.004,
        position: `${round2((CH.x0 + CH.x1) / 2)} ${y} 0.004`,
        material: `color: #8fa6c8; shader: flat; opacity: ${v === 0 ? 0.4 : 0.14}; transparent: true`,
      })
    );
    dom.chartGrid.appendChild(
      el("a-text", Object.assign({
        value: `${v}`,
        position: `${round2(CH.x0 - 0.05)} ${y} 0.006`,
        align: "right",
        anchor: "right",
        color: "#7e92b4",
        font: FONTE,
      }, escalaTexto(3, 0.026)))
    );
  });
  applyPendingTransforms(dom.chartGrid);
}

// ---------------------------------------------------------------------------
// Parede de composicao (100 blocos do ano em foco)
// ---------------------------------------------------------------------------

function buildParede() {
  paredeHandle = createVoxelGrid({
    count: PAREDE.cols * PAREDE.cols,
    cols: PAREDE.cols,
    gap: PAREDE.gap,
    sizeX: PAREDE.size,
    sizeY: PAREDE.size,
    sizeZ: PAREDE.size,
    baseColor: "#1c3346",
  });
  attachVoxelMesh(dom.paredeHost, paredeHandle.mesh);
}

// ---------------------------------------------------------------------------
// Conteudo (recalculado a cada troca de regiao / indicador / ano)
// ---------------------------------------------------------------------------

function renderPainel() {
  const ctx = contextoById(state.regiaoId);
  if (!ctx) return;

  const ind = indicadorByKey(state.indicadorKey);
  const serie = ctx.series[state.indicadorKey];
  const narr = computeNarrative(ctx, state.indicadorKey);

  setText(dom.painelKicker, "VISUALIZAÇÃO DA REGIÃO");
  setText(dom.painelTitulo, rotuloContexto(ctx));
  setText(dom.painelManchete, narr.manchete);
  dom.painelAcento.setAttribute("material", "color", ind.cor);
  dom.painelTopo.setAttribute("material", "color", ind.cor);

  buildSerie(ctx, serie, ind, narr);
  updateAno();
}

function pontosDe(serie) {
  return serie
    .map((v, i) => (v == null ? null : { x: chartXFor(i), y: chartYFor(v), i, v }))
    .filter(Boolean);
}

function buildSerie(ctx, serie, ind, narr) {
  dom.chartLinha.innerHTML = "";
  dom.chartMarcadores.innerHTML = "";
  dom.chartAnotacoes.innerHTML = "";
  anoEls = [];

  const pts = pontosDe(serie);
  if (!pts.length) return;

  addLineSegments(dom.chartLinha, pts, ind.cor, 0.008, 0.016, 0.95);

  // Referencia nacional pontilhada (so faz sentido fora do Brasil).
  if (ctx.tipo !== "brasil") {
    const bpts = pontosDe(DADOS.brasil.series[state.indicadorKey]);
    if (bpts.length) addDashedSegments(dom.chartLinha, bpts, "#8fa6c8", 0.006, 0.008, 0.5);
  }

  DADOS.anos.forEach((ano, i) => {
    const v = serie[i];
    const x = chartXFor(i);

    const rot = el("a-text", Object.assign({
      value: String(ano).slice(2),
      position: `${x} ${round2(CH.baseY - 0.07)} 0.008`,
      align: "center",
      color: "#7e92b4",
      font: FONTE,
    }, escalaTexto(2, 0.04)));
    dom.chartMarcadores.appendChild(rot);

    if (v == null) return;

    const y = chartYFor(v);
    const ponto = el("a-entity", { position: `${x} ${y} 0.014` });
    const disco = el("a-circle", {
      radius: 0.019,
      material: `color: ${ind.cor}; shader: flat`,
    });
    ponto.appendChild(disco);
    const anel = el("a-ring", {
      "radius-inner": 0.026,
      "radius-outer": 0.036,
      visible: false,
      material: "color: #ffffff; shader: flat; opacity: 0.9; transparent: true",
    });
    ponto.appendChild(anel);
    dom.chartMarcadores.appendChild(ponto);

    // Alvo do olhar do ano: barra vertical fina e generosa em altura, para nao
    // exigir mira precisa com o gaze (Fitts vale tambem para o olhar).
    const hit = el("a-plane", {
      class: "hit clickable alvo-ano",
      width: 0.2,
      height: CH.maxH + 0.16,
      position: `${x} ${round2(CH.baseY + CH.maxH / 2)} 0.02`,
      // depthWrite: false - o alvo e quase transparente, mas sem isto ele
      // ESCREVE no buffer de profundidade e recorta o texto que passa atras
      // (a etiqueta do evento saia picotada).
      material: "color: #ffffff; opacity: 0.001; transparent: true; depthWrite: false",
    });
    hit.dataset.ano = String(i);
    dom.chartMarcadores.appendChild(hit);

    anoEls.push({ i, ponto, anel, disco, x, y });
  });

  // Callouts do pico e do vale: os dois momentos que a serie realmente conta.
  // Quem e o pior ano depende do SENTIDO do indicador: numa taxa de evasao o
  // pior e o PICO; numa taxa de conclusao o pior e o VALE. Numa taxa neutra
  // (retencao) nao existe melhor nem pior - so maior e menor.
  const r = rotulosCallout(ind.sentido);
  const primeiro = { idx: narr[r.criticoEm], rotulo: r.critico, cor: "#ff9f6b" };
  const segundo = { idx: narr[r.outroEm], rotulo: r.outro, cor: "#7fd4ff" };
  buildCallout(primeiro.idx, serie, primeiro.rotulo, primeiro.cor, "acima");
  if (segundo.idx !== primeiro.idx) {
    // Cards de 0,44 m com passo de 0,24 m entre anos: pico e vale proximos se
    // encavalariam, entao o segundo desce para baixo da linha.
    const colide = Math.abs(chartXFor(segundo.idx) - chartXFor(primeiro.idx)) < CALLOUT.w + 0.08;
    buildCallout(segundo.idx, serie, segundo.rotulo, segundo.cor, colide ? "abaixo" : "acima");
  }

  buildEventos(serie);
  applyPendingTransforms(dom.chartLinha);
  applyPendingTransforms(dom.chartMarcadores);
  applyPendingTransforms(dom.chartAnotacoes);
  refreshRaycasters();
}

const CALLOUT = { w: 0.44, h: 0.1, folga: 0.13 };

// Nomes dos dois extremos da serie, por sentido do indicador.
// `criticoEm`/`outroEm` dizem qual campo da narrativa (peakIdx/valleyIdx) usar.
function rotulosCallout(sentido) {
  if (sentido === "negativo") {
    return { criticoEm: "peakIdx", critico: "PIOR ANO", outroEm: "valleyIdx", outro: "MELHOR ANO" };
  }
  if (sentido === "positivo") {
    return { criticoEm: "valleyIdx", critico: "PIOR ANO", outroEm: "peakIdx", outro: "MELHOR ANO" };
  }
  // neutro: a taxa de retencao nao e boa nem ruim por si - so alta ou baixa.
  return { criticoEm: "peakIdx", critico: "MAIOR", outroEm: "valleyIdx", outro: "MENOR" };
}

function buildCallout(idx, serie, rotulo, cor, lado) {
  if (idx == null || idx < 0 || serie[idx] == null) return;
  const x = chartXFor(idx);
  const y = chartYFor(serie[idx]);
  // Teto e piso: o card nunca sobe ate o filete do cabecalho nem desce sobre
  // os rotulos de ano.
  const yCard =
    lado === "abaixo"
      ? Math.max(y - CALLOUT.folga, CH.baseY + CALLOUT.h / 2 + 0.02)
      : Math.min(y + CALLOUT.folga, chartYFor(100) - 0.02);
  const g = el("a-entity", { position: `${x} ${round2(yCard)} 0.024` });
  g.appendChild(
    el("a-plane", {
      width: CALLOUT.w,
      height: CALLOUT.h,
      material: `color: #081022; opacity: 0.9; transparent: true; shader: flat`,
    })
  );
  g.appendChild(
    el("a-plane", {
      width: CALLOUT.w,
      height: 0.006,
      position: "0 0.047 0.002",
      material: `color: ${cor}; shader: flat`,
    })
  );
  g.appendChild(
    el("a-text", Object.assign({
      value: `${rotulo} · ${DADOS.anos[idx]}`,
      position: "0 0.014 0.004",
      align: "center",
      color: cor,
      font: FONTE,
    }, escalaPara(`${rotulo} · ${DADOS.anos[idx]}`, 0.026, CALLOUT.w - 0.04)))
  );
  g.appendChild(
    el("a-text", Object.assign({
      value: `${fmt(serie[idx])}%`,
      position: "0 -0.024 0.004",
      align: "center",
      color: CORES.texto,
      font: FONTE,
    }, escalaPara(`${fmt(serie[idx])}%`, 0.03, CALLOUT.w - 0.06)))
  );
  dom.chartAnotacoes.appendChild(g);
}

function buildEventos(serie) {
  (DADOS.eventos || []).forEach((ev) => {
    const idx = DADOS.anos.indexOf(ev.ano);
    if (idx < 0 || serie[idx] == null) return;
    const x = chartXFor(idx);
    // Faixa vertical discreta + etiqueta rente ao eixo: o evento marca o ano
    // sem disputar espaco com o callout, que fica em cima da linha.
    dom.chartAnotacoes.appendChild(
      el("a-plane", {
        width: 0.016,
        height: CH.maxH,
        position: `${x} ${round2(CH.baseY + CH.maxH / 2)} 0.006`,
        material: "color: #ffd166; shader: flat; opacity: 0.18; transparent: true",
      })
    );
    dom.chartAnotacoes.appendChild(
      el("a-text", Object.assign({
        value: `${ev.ano} · Pandemia`,
        position: `${x} ${round2(CH.baseY + 0.05)} 0.01`,
        align: "center",
        color: "#ffd166",
        font: FONTE,
      }, escalaPara(`${ev.ano} · Pandemia`, 0.024, 0.42)))
    );
  });
}

// ---------------------------------------------------------------------------
// Ano em foco
// ---------------------------------------------------------------------------

function selecionarAno(idx, comSom) {
  const ctx = contextoById(state.regiaoId);
  if (!ctx) return;
  state.anoIdx = clampIdx(idx, DADOS.anos.length);
  tlog("ano", { ano: DADOS.anos[state.anoIdx], regiao: state.regiaoId, indicador: state.indicadorKey });
  updateAno(comSom);
  updateContexto();
}

function updateAno(comSom) {
  const ctx = contextoById(state.regiaoId);
  if (!ctx) return;
  const ind = indicadorByKey(state.indicadorKey);
  const serie = ctx.series[state.indicadorKey];

  if (state.anoIdx == null) state.anoIdx = lastValidIndex(serie);
  const idx = state.anoIdx;

  anoEls.forEach((a) => {
    const ativo = a.i === idx;
    setEntityVisible(a.anel, ativo);
    a.ponto.setAttribute("animation__s", `property: scale; to: ${ativo ? "1.5 1.5 1.5" : "1 1 1"}; dur: 150`);
  });

  const v = serie[idx];
  setText(dom.chartReadout, v == null ? `${DADOS.anos[idx]}  ·  sem dados` : `${DADOS.anos[idx]}   ${fmt(v)}%`);
  dom.chartReadout.setAttribute("color", ind.cor);

  const alvo = anoEls.find((a) => a.i === idx);
  if (comSom && v != null && alvo) {
    const validos = serie.filter((s) => s != null);
    playDataNote(v, Math.min(...validos), Math.max(...validos), idx, DADOS.anos.length, alvo.ponto);
  }

  updateParede(ctx, idx, comSom);
}

// Reparticao inteira dos 100 blocos entre concluidos / retidos / evadidos:
// arredonda cada fatia e devolve a sobra ao maior grupo, entao a parede soma
// SEMPRE exatamente 100 - sem isso um ano aparece com 99 ou 101 blocos e a
// promessa "1 bloco = 1%" quebra na cara de quem conta.
function reparte100(comp) {
  const ns = [comp.concluidos, comp.retidos, comp.evadidos].map((v) => Math.round(v * 100));
  const sobra = 100 - ns.reduce((a, b) => a + b, 0);
  ns[ns.indexOf(Math.max.apply(null, ns))] += sobra;
  return ns;
}

function updateParede(ctx, idx, comSom) {
  const comp = composicaoDoAno(ctx, idx);
  setText(dom.paredeAno, `${DADOS.anos[idx]}  ·  1 bloco = 1%`);

  if (!comp) {
    paredeHandle.setSegments([]);
    setText(dom.paredeLegConc, "sem composição para este ano");
    setText(dom.paredeLegRet, "");
    setText(dom.paredeLegEvad, "");
    return;
  }

  const ns = reparte100(comp);
  paredeHandle.setSegments(
    ["concluidos", "retidos", "evadidos"].map((k, i) => ({ cor: COMP_CORES[k], n: ns[i] }))
  );

  setText(dom.paredeLegConc, `${ns[0]} concluíram  (${fmtInt(comp.brutos.concluidos)})`);
  setText(dom.paredeLegRet, `${ns[1]} retidos  (${fmtInt(comp.brutos.retidos)})`);
  setText(dom.paredeLegEvad, `${ns[2]} evadiram  (${fmtInt(comp.brutos.evadidos)})`);

  if (comSom) playCompositionChord(comp.concluidos, comp.retidos, comp.evadidos, dom.paredeHost);
}

// ---------------------------------------------------------------------------
// Linhas (segmentos de plano: sem geometria custom, 2 draw calls por trecho)
// ---------------------------------------------------------------------------

function addLineSegments(container, pts, color, z, thickness, opacity) {
  for (let i = 0; i < pts.length - 1; i += 1) {
    const a = pts[i];
    const b = pts[i + 1];
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const len = Math.sqrt(dx * dx + dy * dy);
    if (!len) continue;
    const ang = (Math.atan2(dy, dx) * 180) / Math.PI;
    container.appendChild(
      el("a-plane", {
        width: round2(len),
        height: thickness,
        position: `${round2((a.x + b.x) / 2)} ${round2((a.y + b.y) / 2)} ${z}`,
        rotation: `0 0 ${round2(ang)}`,
        material: `color: ${color}; shader: flat; opacity: ${opacity}; transparent: true`,
      })
    );
  }
}

function addDashedSegments(container, pts, color, z, thickness, opacity, dash = 0.05, gap = 0.04) {
  for (let i = 0; i < pts.length - 1; i += 1) {
    const a = pts[i];
    const b = pts[i + 1];
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const len = Math.sqrt(dx * dx + dy * dy);
    if (!len) continue;
    const ang = (Math.atan2(dy, dx) * 180) / Math.PI;
    const passo = dash + gap;
    for (let d = 0; d + dash <= len; d += passo) {
      const t = (d + dash / 2) / len;
      container.appendChild(
        el("a-plane", {
          width: dash,
          height: thickness,
          position: `${round2(a.x + dx * t)} ${round2(a.y + dy * t)} ${z}`,
          rotation: `0 0 ${round2(ang)}`,
          material: `color: ${color}; shader: flat; opacity: ${opacity}; transparent: true`,
        })
      );
    }
  }
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = { CH, PAREDE, reparte100 };
}
