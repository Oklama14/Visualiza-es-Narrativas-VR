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

// Elementos do grafico por ano, para a REVELACAO PROGRESSIVA: a linha se
// desenha so ate o ano em que a pessoa esta na linha do tempo; os cartoes de
// pior/melhor ano so aparecem no ultimo ano (o desfecho).
let serieEls = { segs: [], ref: [], cards: [], eventos: [] };

function renderPainel() {
  // Sem regiao aberta, o painel mostra o BRASIL (a T1 pergunta pelo Brasil, e
  // ele precisa ser percorrido no tempo como as regioes).
  const ctx = contextoById(state.regiaoId);
  if (!ctx) return;

  const ind = indicadorByKey(state.indicadorKey);
  const serie = ctx.series[state.indicadorKey];

  setText(dom.painelKicker, kickerPainel(ctx));
  setText(dom.painelTitulo, rotuloContexto(ctx));
  dom.painelAcento.setAttribute("material", "color", ind.cor);
  dom.painelTopo.setAttribute("material", "color", ind.cor);

  buildSerie(ctx, serie, ind);
  updateAno();
}

function pontosDe(serie) {
  return serie
    .map((v, i) => (v == null ? null : { x: chartXFor(i), y: chartYFor(v), i, v }))
    .filter(Boolean);
}

function buildSerie(ctx, serie, ind) {
  dom.chartLinha.innerHTML = "";
  dom.chartMarcadores.innerHTML = "";
  dom.chartAnotacoes.innerHTML = "";
  anoEls = [];
  serieEls = { segs: [], ref: [], cards: [], eventos: [] };

  // O eixo do tempo inteiro fica a vista (os 8 anos); o que avanca e a linha.
  DADOS.anos.forEach((ano, i) => {
    dom.chartMarcadores.appendChild(
      el("a-text", Object.assign({
        value: String(ano).slice(2),
        position: `${chartXFor(i)} ${round2(CH.baseY - 0.07)} 0.008`,
        align: "center",
        color: "#7e92b4",
        font: FONTE,
      }, escalaTexto(2, 0.04)))
    );
  });

  const pts = pontosDe(serie);
  if (!pts.length) return;

  serieEls.segs = addLineSegments(dom.chartLinha, pts, ind.cor, 0.008, 0.016, 0.95);

  // Referencia nacional pontilhada (so faz sentido fora do Brasil).
  if (ctx.tipo !== "brasil") {
    const bpts = pontosDe(DADOS.brasil.series[state.indicadorKey]);
    if (bpts.length) serieEls.ref = addDashedSegments(dom.chartLinha, bpts, "#8fa6c8", 0.006, 0.008, 0.5);
  }

  pts.forEach(({ x, y, i }) => {
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
    anoEls.push({ i, ponto, anel, disco, x, y });
  });

  // Callouts do pico e do vale (o desfecho): construidos ja, mostrados so no
  // ultimo ano. Quem e o pior ano depende do SENTIDO do indicador
  // (rotulosCallout, em 04-narrativa.js - a condicao 2D usa os mesmos cartoes).
  const cards = calloutsDaSerie(ctx, state.indicadorKey);
  cards.forEach((c, k) => {
    // Cards de 0,44 m com passo de 0,24 m entre anos: pico e vale proximos se
    // encavalariam, entao o segundo desce para baixo da linha.
    const colide = k > 0 && Math.abs(chartXFor(c.idx) - chartXFor(cards[0].idx)) < CALLOUT.w + 0.08;
    serieEls.cards.push(buildCallout(c, serie, c.tipo === "critico" ? "#ff9f6b" : "#7fd4ff", colide ? "abaixo" : "acima"));
  });

  serieEls.eventos = buildEventos(serie);
  applyPendingTransforms(dom.chartLinha);
  applyPendingTransforms(dom.chartMarcadores);
  applyPendingTransforms(dom.chartAnotacoes);
  refreshRaycasters();
}

// Mostra o grafico ate o ano idx: segmentos e pontos ate ele, a referencia
// nacional ate ele, o evento quando a historia passa por ele e os cartoes so
// no fim da serie.
function revelarAte(idx, ctx) {
  serieEls.segs.forEach((s) => setEntityVisible(s.el, s.i <= idx));
  serieEls.ref.forEach((s) => setEntityVisible(s.el, s.i <= idx));
  anoEls.forEach((a) => setEntityVisible(a.ponto, a.i <= idx));
  serieEls.eventos.forEach((e) => e.els.forEach((x) => setEntityVisible(x, e.i <= idx)));
  const fim = calloutsDaSerie(ctx, state.indicadorKey, idx).length > 0;
  serieEls.cards.forEach((g) => setEntityVisible(g, fim));
}

const CALLOUT = { w: 0.44, h: 0.1, folga: 0.13 };

// rotulosCallout(sentido) mora em 04-narrativa.js: a condicao 2D usa os
// mesmos nomes (PIOR ANO / MELHOR ANO / MAIOR / MENOR).

function buildCallout(card, serie, cor, lado) {
  const idx = card.idx;
  const x = chartXFor(idx);
  const y = chartYFor(serie[idx]);
  // Teto e piso: o card nunca sobe ate o filete do cabecalho nem desce sobre
  // os rotulos de ano.
  const yCard =
    lado === "abaixo"
      ? Math.max(y - CALLOUT.folga, CH.baseY + CALLOUT.h / 2 + 0.02)
      : Math.min(y + CALLOUT.folga, chartYFor(100) - 0.02);
  const g = el("a-entity", { class: "callout", position: `${x} ${round2(yCard)} 0.024` });
  g.appendChild(
    el("a-plane", {
      width: CALLOUT.w,
      height: CALLOUT.h,
      material: `color: #081022; shader: flat`,
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
      value: card.rotulo,
      position: "0 0.014 0.004",
      align: "center",
      color: cor,
      font: FONTE,
    }, escalaPara(card.rotulo, 0.026, CALLOUT.w - 0.04)))
  );
  g.appendChild(
    el("a-text", Object.assign({
      value: card.valor,
      position: "0 -0.024 0.004",
      align: "center",
      color: CORES.texto,
      font: FONTE,
    }, escalaPara(card.valor, 0.03, CALLOUT.w - 0.06)))
  );
  dom.chartAnotacoes.appendChild(g);
  return g;
}

function buildEventos(serie) {
  const lista = [];
  (DADOS.eventos || []).forEach((ev) => {
    const idx = DADOS.anos.indexOf(ev.ano);
    if (idx < 0 || serie[idx] == null) return;
    const x = chartXFor(idx);
    // Faixa vertical discreta + etiqueta rente ao eixo: o evento marca o ano
    // sem disputar espaco com o callout, que fica em cima da linha.
    const faixa = el("a-plane", {
      width: 0.016,
      height: CH.maxH,
      position: `${x} ${round2(CH.baseY + CH.maxH / 2)} 0.006`,
      material: "color: #ffd166; shader: flat; opacity: 0.18; transparent: true",
    });
    const etiqueta = el("a-text", Object.assign({
      class: "evento",
      value: rotuloEvento(ev),
      position: `${x} ${round2(CH.baseY + 0.05)} 0.01`,
      align: "center",
      color: "#ffd166",
      font: FONTE,
    }, escalaPara(rotuloEvento(ev), 0.024, 0.42)));
    dom.chartAnotacoes.appendChild(faixa);
    dom.chartAnotacoes.appendChild(etiqueta);
    lista.push({ i: idx, els: [faixa, etiqueta] });
  });
  return lista;
}

// ---------------------------------------------------------------------------
// Ano da historia
//
// Quem muda o ano e o CORPO (a linha do tempo no piso, 70-faixa.js) - ou, na
// condicao 2D, a rolagem. O olhar + pinca no grafico nao muda mais o ano:
// com dois caminhos, nao se saberia o que o estudo mediu.
// ---------------------------------------------------------------------------

function definirAno(idx, origem, extra) {
  const novo = clampIdx(idx, DADOS.anos.length);
  if (novo === state.anoIdx) return false;
  const de = state.anoIdx;
  state.anoIdx = novo;
  tlog("ano", Object.assign({
    ano: DADOS.anos[novo],
    de: de == null ? null : DADOS.anos[de],
    via: origem || null,
    regiao: state.regiaoId,
    indicador: state.indicadorKey,
  }, extra || {}));
  updateAno(true);
  updateMapa();
  updateContexto();
  if (typeof pintarFaixa === "function") pintarFaixa();
  return true;
}

// Compatibilidade (testes e console): o mesmo que definirAno.
function selecionarAno(idx) {
  return definirAno(idx, "api");
}

function updateAno(comSom) {
  const ctx = contextoById(state.regiaoId);
  if (!ctx) return;
  const ind = indicadorByKey(state.indicadorKey);
  const serie = ctx.series[state.indicadorKey];

  if (state.anoIdx == null) state.anoIdx = 0;
  const idx = state.anoIdx;

  revelarAte(idx, ctx);
  anoEls.forEach((a) => {
    const ativo = a.i === idx;
    setEntityVisible(a.anel, ativo && a.i <= idx);
    a.ponto.setAttribute("animation__s", `property: scale; to: ${ativo ? "1.5 1.5 1.5" : "1 1 1"}; dur: 150`);
  });

  // A manchete do painel tambem so conhece a historia ate aqui.
  setText(dom.painelManchete, computeNarrative(ctx, state.indicadorKey, idx).manchete);
  setText(dom.painelAno, textoAnoPainel(idx));
  setText(dom.painelEvento, textoEventoAno(idx));

  const v = serie[idx];
  setText(dom.chartReadout, textoLeituraAno(ctx, state.indicadorKey, idx));
  dom.chartReadout.setAttribute("color", ind.cor);

  const alvo = anoEls.find((a) => a.i === idx);
  if (comSom && v != null && alvo) {
    const validos = serie.filter((s) => s != null);
    playDataNote(v, Math.min(...validos), Math.max(...validos), idx, DADOS.anos.length, alvo.ponto);
  }

  updateParede(ctx, idx, comSom);
}

// reparte100(comp) mora em 04-narrativa.js (a parede da condicao 2D usa a
// mesma conta, entao os dois mostram exatamente os mesmos blocos).

function updateParede(ctx, idx, comSom) {
  const p = textosParede(ctx, idx);
  setText(dom.paredeAno, p.titulo);

  if (!p.blocos) {
    paredeHandle.setSegments([]);
    setText(dom.paredeLegConc, p.legendas[0]);
    setText(dom.paredeLegRet, p.legendas[1]);
    setText(dom.paredeLegEvad, p.legendas[2]);
    return;
  }

  paredeHandle.setSegments(
    ["concluidos", "retidos", "evadidos"].map((k, i) => ({ cor: COMP_CORES[k], n: p.blocos[i] }))
  );

  setText(dom.paredeLegConc, p.legendas[0]);
  setText(dom.paredeLegRet, p.legendas[1]);
  setText(dom.paredeLegEvad, p.legendas[2]);

  if (comSom) playCompositionChord(p.comp.concluidos, p.comp.retidos, p.comp.evadidos, dom.paredeHost);
}

// ---------------------------------------------------------------------------
// Linhas (segmentos de plano: sem geometria custom, 2 draw calls por trecho)
// ---------------------------------------------------------------------------

// Devolvem [{ i, el }]: i = indice do ano em que o trecho TERMINA (o trecho
// aparece quando a historia chega nele).
function addLineSegments(container, pts, color, z, thickness, opacity) {
  const lista = [];
  for (let i = 0; i < pts.length - 1; i += 1) {
    const a = pts[i];
    const b = pts[i + 1];
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const len = Math.sqrt(dx * dx + dy * dy);
    if (!len) continue;
    const ang = (Math.atan2(dy, dx) * 180) / Math.PI;
    const seg = el("a-plane", {
      width: round2(len),
      height: thickness,
      position: `${round2((a.x + b.x) / 2)} ${round2((a.y + b.y) / 2)} ${z}`,
      rotation: `0 0 ${round2(ang)}`,
      material: `color: ${color}; shader: flat; opacity: ${opacity}; transparent: true`,
    });
    container.appendChild(seg);
    lista.push({ i: b.i, el: seg });
  }
  return lista;
}

function addDashedSegments(container, pts, color, z, thickness, opacity, dash = 0.05, gap = 0.04) {
  const lista = [];
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
      const tr = el("a-plane", {
        width: dash,
        height: thickness,
        position: `${round2(a.x + dx * t)} ${round2(a.y + dy * t)} ${z}`,
        rotation: `0 0 ${round2(ang)}`,
        material: `color: ${color}; shader: flat; opacity: ${opacity}; transparent: true`,
      });
      container.appendChild(tr);
      lista.push({ i: b.i, el: tr });
    }
  }
  return lista;
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = { CH, PAREDE };
}
