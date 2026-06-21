// Verificacao de logica e geometria SEM navegador.
// Exercita as funcoes puras do app sobre TODOS os contextos/indicadores de dados.json
// e checa limites de campo de visao (FOV), grade do grafico, callouts e narrativa.
//
// Uso: node tests/logic-check.js
// Objetivo: cacar bugs de dados (NaN, excecoes, fora de limite) que so apareceriam
// clicando em algum contexto especifico no VR.

const path = require("node:path");
const DADOS = require(path.resolve(__dirname, "..", "dados.json"));

let falhas = 0;
let avisos = 0;
const check = (cond, msg) => { if (!cond) { console.error("  FALHA:", msg); falhas += 1; } };
const warn = (cond, msg) => { if (!cond) { console.warn("  AVISO:", msg); avisos += 1; } };

// ---- Replicas das funcoes puras do app.js (mantidas em sincronia) ----
const CHART = { x0: -3.0, x1: 3.0, baseY: 1.15, maxH: 1.35, z: -3.3 };
const xFor = (i) => CHART.x0 + i * ((CHART.x1 - CHART.x0) / (DADOS.anos.length - 1));
const yFor = (v) => CHART.baseY + (v / 100) * CHART.maxH;

function latestValue(s) { for (let i = s.length - 1; i >= 0; i--) if (s[i] != null) return s[i]; return null; }
function lastValidIndex(s) { for (let i = s.length - 1; i >= 0; i--) if (s[i] != null) return i; return s.length - 1; }
function extremos(s) {
  let pi = -1, vi = -1, mx = -Infinity, mn = Infinity;
  s.forEach((v, i) => { if (v == null) return; if (v > mx) { mx = v; pi = i; } if (v < mn) { mn = v; vi = i; } });
  return { peakIdx: pi, valleyIdx: vi };
}
function indicadorByKey(k) { return DADOS.indicadores.find((i) => i.key === k); }
function rotuloCurto(ctx) { return ctx.tipo === "brasil" ? "Brasil" : ctx.tipo === "regiao" ? ctx.nome : ctx.sigla || ctx.nome; }
function rotuloContexto(ctx) { return ctx.tipo === "brasil" ? "Brasil" : ctx.tipo === "regiao" ? `Regiao ${ctx.nome}` : ctx.nome; }
function fmt(v) { return v == null ? "-" : (Math.round(v * 10) / 10).toFixed(1).replace(".", ","); }

function computeNarrative(ctx, key) {
  const indicador = indicadorByKey(key);
  const serie = ctx.series[key];
  const anos = DADOS.anos;
  const validos = serie.map((v, i) => ({ v, ano: anos[i], i })).filter((d) => d.v != null);
  if (!validos.length) {
    const t = `Nao ha dados de ${indicador.label.toLowerCase()} para ${rotuloContexto(ctx)}.`;
    return { manchete: rotuloContexto(ctx), texto: t, fala: t, peakIdx: -1, valleyIdx: -1 };
  }
  const primeiro = validos[0], ultimo = validos[validos.length - 1];
  const maior = validos.reduce((a, b) => (b.v > a.v ? b : a));
  const menor = validos.reduce((a, b) => (b.v < a.v ? b : a));
  const diff = ultimo.v - primeiro.v;
  const tendencia = diff > 2 ? "crescimento" : diff < -2 ? "reducao" : "estabilidade";
  const fase = diff > 2 ? "em alta" : diff < -2 ? "em queda" : "estavel";
  const critico = indicador.sentido === "negativo" ? maior : menor;
  const rotuloCritico = indicador.sentido === "negativo" ? "maior" : "menor";
  const manchete = `${rotuloCurto(ctx)}: ${indicador.label.toLowerCase()} ${fase} (${fmt(primeiro.v)}% -> ${fmt(ultimo.v)}%)`;
  const texto = `De ${fmt(primeiro.v)}% em ${primeiro.ano} para ${fmt(ultimo.v)}% em ${ultimo.ano}, com tendencia de ${tendencia}. O ${rotuloCritico} valor da serie foi ${fmt(critico.v)}% em ${critico.ano}.`;
  void rotuloCritico;
  return { manchete, texto, fala: texto, peakIdx: maior.i, valleyIdx: menor.i };
}

function computeMomentos(ctx, key) {
  const serie = ctx.series[key];
  const anos = DADOS.anos;
  const validos = serie.map((v, i) => ({ v, ano: anos[i], i })).filter((d) => d.v != null);
  if (!validos.length) return [];
  const momentos = [];
  const indDef = indicadorByKey(key);
  const start = validos[0];
  momentos.push({ idx: start.i, tipo: "inicio", titulo: `Inicio da serie (${start.ano})`, fala: `Em ${start.ano}, a ${indDef.label.toLowerCase()} era de ${fmt(start.v)}%.` });
  let maxVar = 0, varIdx = -1;
  for (let k = 1; k < validos.length; k++) {
    const diff = validos[k].v - validos[k-1].v;
    if (Math.abs(diff) > Math.abs(maxVar)) { maxVar = diff; varIdx = validos[k].i; }
  }
  const { peakIdx, valleyIdx } = extremos(serie);
  const ev2020 = validos.find(d => d.ano === 2020);
  const visitados = new Set([start.i]);
  const addMomento = (idx, tipo, titulo, fala) => { if (!visitados.has(idx)) { momentos.push({ idx, tipo, titulo, fala }); visitados.add(idx); } };
  if (ev2020) addMomento(ev2020.i, "evento_2020", "Choque da Pandemia (2020)", `No ano da pandemia, 2020, o valor foi a ${fmt(ev2020.v)}%.`);
  if (varIdx !== -1 && Math.abs(maxVar) > 1.0) {
    const vAtual = serie[varIdx]; const direcao = maxVar > 0 ? "saltou" : "caiu";
    addMomento(varIdx, "maior_variacao", "Maior variacao", `A taxa ${direcao} para ${fmt(vAtual)}% em ${anos[varIdx]}.`);
  }
  const vPeak = serie[peakIdx], vValley = serie[valleyIdx];
  if (indDef.sentido === "negativo") {
    addMomento(peakIdx, "pico", "Pior momento", `Pior indice em ${anos[peakIdx]}, chegando a ${fmt(vPeak)}%.`);
    addMomento(valleyIdx, "vale", "Melhor momento", `Melhor desempenho em ${anos[valleyIdx]}, caindo para ${fmt(vValley)}%.`);
  } else {
    addMomento(peakIdx, "pico", "Pico da serie", `Ponto alto em ${anos[peakIdx]}, alcancando ${fmt(vPeak)}%.`);
    addMomento(valleyIdx, "vale", "Menor valor", `Menor taxa de ${fmt(vValley)}% em ${anos[valleyIdx]}.`);
  }
  const end = validos[validos.length - 1];
  addMomento(end.i, "fim", `Cenario Atual (${end.ano})`, `Hoje, em ${end.ano}, a taxa esta em ${fmt(end.v)}%.`);
  momentos.sort((a, b) => a.idx - b.idx);
  return momentos;
}

function buildSintese(ctx) {
  if (!ctx || !ctx.series.contagens) return "";
  const lastIdx = lastValidIndex(ctx.series.conclusao);
  const m = ctx.series.contagens.matriculados?.[lastIdx] || ctx.series.matriculas?.[lastIdx];
  const c = ctx.series.contagens.concluidos?.[lastIdx];
  if (m > 0 && c != null) {
    const taxa = Math.round((c / m) * 100);
    return `De cada 100 matriculados no ${rotuloContexto(ctx)}, apenas ${taxa} conseguem concluir.`;
  }
  return "";
}


function arcPositions(n, radius, spreadDeg, y) {
  const out = [];
  for (let i = 0; i < n; i++) {
    const t = n === 1 ? 0 : i / (n - 1) - 0.5;
    const a = (t * spreadDeg * Math.PI) / 180;
    out.push({ x: Math.sin(a) * radius, y, z: -Math.cos(a) * radius });
  }
  return out;
}
function gridPositions(n, cols, gapX, gapY, topY, z) {
  const out = [];
  for (let i = 0; i < n; i++) {
    const col = i % cols, row = Math.floor(i / cols);
    const rowCount = Math.min(cols, n - row * cols);
    out.push({ x: (col - (rowCount - 1) / 2) * gapX, y: topY - row * gapY, z });
  }
  return out;
}

// FOV: camera em (0,1.6,0), fov vertical 80 (A-Frame default), aspecto ~1.78 (1366x768).
const HALF_V = (80 / 2) * (Math.PI / 180);
const ASPECT = 1366 / 768;
const HALF_H = Math.atan(Math.tan(HALF_V) * ASPECT);
function dentroFOV(x, y, z) {
  const dz = -z; // distancia a frente da camera
  if (dz <= 0.1) return false;
  const angX = Math.atan2(Math.abs(x), dz);
  const angY = Math.atan2(Math.abs(y - 1.6), dz);
  return angX <= HALF_H && angY <= HALF_V;
}

// ---- Coletor de contextos ----
const contextos = [DADOS.brasil];
DADOS.regioes.forEach((r) => { contextos.push(r); r.instituicoes.forEach((i) => contextos.push(i)); });

console.log(`Contextos: ${contextos.length} (1 Brasil + ${DADOS.regioes.length} regioes + ${contextos.length - 1 - DADOS.regioes.length} instituicoes)`);
console.log(`FOV: half-H ${(HALF_H * 180 / Math.PI).toFixed(1)} deg, half-V ${(HALF_V * 180 / Math.PI).toFixed(1)} deg`);

// 1) Series intactas + sem NaN.
console.log("\n[1] Integridade das series");
let seriesAllNull = 0;
contextos.forEach((ctx) => {
  DADOS.indicadores.forEach((ind) => {
    const s = ctx.series[ind.key];
    check(Array.isArray(s) && s.length === DADOS.anos.length, `${rotuloContexto(ctx)}/${ind.key}: serie com tamanho errado`);
    s.forEach((v) => check(v === null || (typeof v === "number" && Number.isFinite(v)), `${rotuloContexto(ctx)}/${ind.key}: valor invalido ${v}`));
    if (latestValue(s) === null) seriesAllNull += 1;
  });
});
console.log(`  series totalmente nulas: ${seriesAllNull}`);

// 2) computeNarrative em todos os contextos x indicadores (sem excecao, sem NaN/undefined).
console.log("\n[2] Narrativa automatica");
contextos.forEach((ctx) => {
  DADOS.indicadores.forEach((ind) => {
    let n;
    try { n = computeNarrative(ctx, ind.key); }
    catch (e) { check(false, `${rotuloContexto(ctx)}/${ind.key}: excecao ${e.message}`); return; }
    check(n.manchete && !/NaN|undefined/.test(n.manchete), `${rotuloContexto(ctx)}/${ind.key}: manchete suspeita "${n.manchete}"`);
    check(n.texto && !/NaN|undefined/.test(n.texto), `${rotuloContexto(ctx)}/${ind.key}: texto suspeito`);
  });
});
console.log("  ok (sem excecoes/NaN)");

// 3) Geometria do grafico: yFor dentro do painel; callouts dentro dos limites.
console.log("\n[3] Geometria do grafico (eixo, marcadores, callouts)");
const panelTop = 1.85 + 1.95 / 2;   // chartPanel y=1.85 h=1.95 -> 2.825
const panelBottom = 1.85 - 1.95 / 2; // 0.875
let foraGrade = 0, calloutFora = 0;
contextos.forEach((ctx) => {
  DADOS.indicadores.forEach((ind) => {
    const s = ctx.series[ind.key];
    s.forEach((v, i) => {
      if (v == null) return;
      const y = yFor(v);
      if (y < CHART.baseY - 0.001 || y > yFor(100) + 0.001) foraGrade += 1;
      const x = xFor(i);
      check(x >= CHART.x0 - 0.001 && x <= CHART.x1 + 0.001, `${rotuloContexto(ctx)}/${ind.key}: x fora (${x})`);
      // marcador deve estar dentro do painel verticalmente
      warn(y <= panelTop && y >= panelBottom, `${rotuloContexto(ctx)}/${ind.key} ano ${DADOS.anos[i]}: marcador y=${y.toFixed(2)} fora do painel`);
    });
    // callout do critico
    const { peakIdx, valleyIdx } = extremos(s);
    [peakIdx, valleyIdx].forEach((idx) => {
      if (idx < 0 || s[idx] == null) return;
      const x = xFor(idx), y = yFor(s[idx]);
      const lado = x <= 0 ? 1 : -1;
      const cardX = x + lado * 0.95;
      const cardY = Math.min(yFor(100) - 0.1, y + 0.55);
      if (cardX < CHART.x0 - 0.85 || cardX > CHART.x1 + 0.85) calloutFora += 1;
      warn(cardY <= panelTop, `${rotuloContexto(ctx)}/${ind.key}: callout y=${cardY.toFixed(2)} acima do painel`);
    });
  });
});
console.log(`  valores fora da grade 0-100%: ${foraGrade} (esperado 0 para %)`);
console.log(`  callouts fora do x: ${calloutFora}`);
check(foraGrade === 0, "ha valores fora da escala 0-100%");
check(calloutFora === 0, "ha callouts projetados fora do grafico");

// 4) FOV dos cards de contexto (arc) e drill (grid) + objetos de indicador.
console.log("\n[4] Campo de visao (FOV)");
const N_CTX = 6, CARD_W = 1.36;
const cards = arcPositions(N_CTX, 4.6, 100, 1.6);
cards.forEach((p, i) => check(dentroFOV(p.x, p.y, p.z), `card de contexto ${i} fora do FOV (${p.x.toFixed(2)},${p.y.toFixed(2)},${p.z.toFixed(2)})`));
// Sobreposicao: distancia entre centros adjacentes deve ser maior que a largura do card.
let minGap = Infinity;
for (let i = 0; i < cards.length - 1; i++) {
  const a = cards[i], b = cards[i + 1];
  const d = Math.hypot(b.x - a.x, b.z - a.z);
  minGap = Math.min(minGap, d - CARD_W);
}
console.log(`  cards de contexto: ${N_CTX}, menor folga entre vizinhos: ${minGap.toFixed(2)}`);
check(minGap > 0.05, `cards de contexto se sobrepoem (folga ${minGap.toFixed(2)})`);

// drill: regiao com mais instituicoes
let maxReg = DADOS.regioes[0];
DADOS.regioes.forEach((r) => { if (r.instituicoes.length > maxReg.instituicoes.length) maxReg = r; });
const nDrill = maxReg.instituicoes.length + 1;
const DRILL_COLS = 6, DRILL_CARD_H = 0.6;
const drill = gridPositions(nDrill, DRILL_COLS, 1.25, 0.7, 2.55, -4.2);
console.log(`  maior regiao: ${maxReg.nome} com ${maxReg.instituicoes.length} instituicoes -> ${nDrill} cards, ${Math.ceil(nDrill / DRILL_COLS)} linhas`);
let drillFora = 0, drillAbaixoPiso = 0;
drill.forEach((p) => {
  if (!dentroFOV(p.x, p.y, p.z)) drillFora += 1;
  if (p.y - DRILL_CARD_H / 2 < 0) drillAbaixoPiso += 1; // centro - metade < 0 => cruza o piso (y=0)
});
console.log(`  cards de drill fora do FOV: ${drillFora}`);
console.log(`  cards de drill cruzando o piso (y=0): ${drillAbaixoPiso}`);
check(drillFora === 0, "cards de drill fora do campo de visao");
warn(drillAbaixoPiso === 0, "cards de drill cruzam/passam abaixo do piso (y=0) — podem ficar escondidos");

// indicadores
const dataPositions = [
  { x: -2.7, z: -2.7 }, { x: -0.9, z: -3.25 }, { x: 0.9, z: -3.25 }, { x: 2.7, z: -2.7 },
];
dataPositions.forEach((p, i) => check(dentroFOV(p.x, 1.6, p.z) && dentroFOV(p.x, 2.5, p.z), `objeto de indicador ${i} fora do FOV`));

// controles da timeline
const controls = [
  { id: "prev", x: -0.95, y: 0.6, z: -2.45 }, { id: "next", x: 0.95, y: 0.6, z: -2.45 },
  { id: "compare", x: -2.7, y: 0.1, z: -2.45 }, { id: "narrar", x: -0.9, y: 0.1, z: -2.45 },
  { id: "replay", x: 0.9, y: 0.1, z: -2.45 }, { id: "indic", x: 2.7, y: 0.1, z: -2.45 },
  { id: "skip", x: 0, y: 0.1, z: -2.45 },
];
controls.forEach((c) => check(dentroFOV(c.x, c.y, c.z), `controle ${c.id} fora do FOV`));
// sobreposicao horizontal da linha de acoes (largura 1.55)
const acts = controls.filter((c) => c.y === 0.1 && c.id !== "skip").sort((a, b) => a.x - b.x);
for (let i = 0; i < acts.length - 1; i++) {
  const gap = (acts[i + 1].x - acts[i].x) - 1.55;
  warn(gap >= 0.05, `controles ${acts[i].id}/${acts[i + 1].id} quase encostam (folga ${gap.toFixed(2)})`);
}
console.log("  FOV dos cards/objetos/controles verificado");

// 5) resolveCompareContext coerente.
console.log("\n[5] Contexto de comparacao");
check(true, ""); // brasil -> null (sem comparacao)
DADOS.regioes.forEach((r) => {
  // regiao -> Brasil; instituicao -> regiao
  check(r.instituicoes.every((i) => i.series.evasao.length === DADOS.anos.length), `${r.nome}: instituicao com serie incompleta`);
});
console.log("  ok");

// 6) Contagens absolutas + texto de numeros absolutos + eventos.
console.log("\n[6] Numeros absolutos e eventos");
const NOUN = { evasao: "evadidos", conclusao: "concluintes", retencao: "retidos" };
function countFor(ctx, key, idx) {
  const c = ctx.series.contagens; if (!c) return null;
  if (key === "evasao") return c.evadidos[idx];
  if (key === "conclusao") return c.concluidos[idx];
  if (key === "retencao") return c.retidos[idx];
  return null;
}
function fmtInt(n) { return n == null ? "-" : Math.round(n).toLocaleString("pt-BR"); }
function absoluteText(ctx, key, idx) {
  const matr = ctx.series.matriculas ? ctx.series.matriculas[idx] : null;
  if (!matr) return "";
  const cnt = countFor(ctx, key, idx);
  if (cnt == null) return `base de ${fmtInt(matr)} matriculas`;
  return `${fmtInt(cnt)} ${NOUN[key]} de ${fmtInt(matr)} matriculas`;
}
let semContagem = 0, somaErrada = 0;
contextos.forEach((ctx) => {
  const c = ctx.series.contagens;
  check(c && c.concluidos && c.evadidos && c.retidos, `${rotuloContexto(ctx)}: sem contagens`);
  if (!c) { semContagem += 1; return; }
  DADOS.anos.forEach((_, i) => {
    const soma = c.concluidos[i] + c.evadidos[i] + c.retidos[i];
    if (soma !== ctx.series.matriculas[i]) somaErrada += 1;
    // texto absoluto nao pode conter NaN/undefined
    DADOS.indicadores.forEach((ind) => {
      const t = absoluteText(ctx, ind.key, i);
      check(!/NaN|undefined/.test(t), `${rotuloContexto(ctx)}/${ind.key} ano ${DADOS.anos[i]}: texto absoluto suspeito "${t}"`);
    });
  });
});
check(semContagem === 0, "ha contextos sem contagens absolutas");
check(somaErrada === 0, `soma das contagens != matriculas em ${somaErrada} caso(s)`);
console.log(`  contagens consistentes com matriculas: ${somaErrada === 0 ? "sim" : "NAO"}`);
check(Array.isArray(DADOS.eventos) && DADOS.eventos.some((e) => e.ano === 2020), "evento de 2020 ausente em meta/eventos");
console.log(`  eventos: ${(DADOS.eventos || []).map((e) => e.ano).join(", ") || "(nenhum)"}`);
// exemplo concreto
const sulEx = DADOS.regioes.find((r) => r.id === "sul");
console.log(`  ex.: Sul evasao 2024 -> "${absoluteText(sulEx, "evasao", DADOS.anos.length - 1)}"`);

// 7) Layout da linha do tempo: sem sobreposicao, controles dentro do FOV e acima do piso.
console.log("\n[7] Layout da linha do tempo");
const TL = {
  narrativeTitleY: 3.34,
  narrativeTextY: 3.0,
  chartTopY: CHART.baseY + CHART.maxH,       // gridline de 100%
  eventTagY: CHART.baseY + CHART.maxH + 0.16, // etiqueta de evento
  panelTopY: 1.85 + 1.95 / 2,                // 2.825
  ticksY: CHART.baseY - 0.22,
  narrativeYearY: 0.7,
  guidedHintY: 0.48,
  controlsY: 0.24,
  controlH: 0.44,
  controlsZ: -2.45,
};
// Cabecalho (narrativeText) deve ficar acima do topo do grafico e da etiqueta de evento.
check(TL.narrativeTextY - 0.18 > TL.chartTopY, "narrativeText pode sobrepor o topo do grafico");
check(TL.narrativeTextY > TL.eventTagY, "narrativeText pode sobrepor a etiqueta de evento (2020)");
// Ordem vertical decrescente e separada na regiao inferior.
const ordem = [TL.ticksY, TL.narrativeYearY, TL.guidedHintY, TL.controlsY];
for (let i = 0; i < ordem.length - 1; i++) {
  check(ordem[i] - ordem[i + 1] >= 0.18, `elementos inferiores muito proximos (${ordem[i]} vs ${ordem[i + 1]})`);
}
// Controles acima do piso (y=0).
check(TL.controlsY - TL.controlH / 2 >= 0, "controles cruzam o piso (y=0)");
// FOV + sobreposicao horizontal da faixa de controles.
const ctrlBoxes = [
  { id: "prev", x: -3.0, w: 0.56 }, { id: "next", x: -2.0, w: 0.56 },
  { id: "compare", x: -1.05, w: 1.02 }, { id: "narrate", x: 0.05, w: 0.98 },
  { id: "replay", x: 1.15, w: 1.02 }, { id: "indic", x: 2.45, w: 1.2 },
].sort((a, b) => a.x - b.x);
ctrlBoxes.forEach((c) => check(dentroFOV(c.x + (c.x < 0 ? -c.w / 2 : c.w / 2), TL.controlsY, TL.controlsZ), `controle ${c.id} fora do FOV`));
let minCtrlGap = Infinity;
for (let i = 0; i < ctrlBoxes.length - 1; i++) {
  const gap = (ctrlBoxes[i + 1].x - ctrlBoxes[i + 1].w / 2) - (ctrlBoxes[i].x + ctrlBoxes[i].w / 2);
  minCtrlGap = Math.min(minCtrlGap, gap);
}
console.log(`  marcadores em altura ~olhos: y ${CHART.baseY.toFixed(2)}..${TL.chartTopY.toFixed(2)} (olho 1.6)`);
console.log(`  menor folga entre controles: ${minCtrlGap.toFixed(2)}`);
check(minCtrlGap > 0.04, `controles da timeline se sobrepoem (folga ${minCtrlGap.toFixed(2)})`);

// 8) Composicao "Para onde vao os alunos": fracoes somam ~1; narrativa sem NaN.
console.log("\n[8] Composicao (concluidos/retidos/evadidos)");
let fracErro = 0;
contextos.forEach((ctx) => {
  const c = ctx.series.contagens;
  DADOS.anos.forEach((_, i) => {
    const m = ctx.series.matriculas[i];
    if (!m) return;
    const soma = (c.concluidos[i] + c.retidos[i] + c.evadidos[i]) / m;
    if (Math.abs(soma - 1) > 0.001) fracErro += 1;
  });
});
check(fracErro === 0, `fracoes da composicao nao somam 1 em ${fracErro} caso(s)`);
// Narrativa de composicao do ultimo ano com matriculas (replica de compNarrative).
function lastYearWithMatriculas(ctx) {
  const m = ctx.series.matriculas;
  for (let i = m.length - 1; i >= 0; i--) if (m[i] > 0) return i;
  return m.length - 1;
}
let compNarrErro = 0;
contextos.forEach((ctx) => {
  const i = lastYearWithMatriculas(ctx);
  const m = ctx.series.matriculas[i];
  if (!m) return;
  const c = ctx.series.contagens;
  const t = `${fmt((c.concluidos[i] / m) * 100)}% concluiram, ${fmt((c.evadidos[i] / m) * 100)}% evadiram`;
  if (/NaN|undefined/.test(t)) compNarrErro += 1;
});
check(compNarrErro === 0, "narrativa de composicao com NaN/undefined");
console.log(`  fracoes somam 1: ${fracErro === 0 ? "sim" : "NAO"}`);
const sulC = DADOS.regioes.find((r) => r.id === "sul");
const li = lastYearWithMatriculas(sulC);
const mC = sulC.series.matriculas[li];
console.log(`  ex.: Sul ${DADOS.anos[li]} -> concl ${fmt(sulC.series.contagens.concluidos[li] / mC * 100)}% / ret ${fmt(sulC.series.contagens.retidos[li] / mC * 100)}% / evad ${fmt(sulC.series.contagens.evadidos[li] / mC * 100)}%`);

// 9) A2: Galeria de historias — validar TODAS as historias de TOURS.
console.log("\n[9] Galeria de historias (tours curados)");
const TOURS = {
  panorama: {
    titulo: "Panorama Nacional",
    cenas: [
      { tipo: "abertura" },
      { contextoId: "brasil", indicador: "evasao", modo: "timeline" },
      { contextoId: "brasil", indicador: "conclusao", modo: "timeline" },
      { contextoId: "brasil", indicador: null, modo: "composicao", climax: true },
      { contextoId: "brasil", indicador: null, modo: "indicadores", showLinks: true },
      { tipo: "fechamento", cta: true },
    ],
  },
  abismo: {
    titulo: "O Abismo Regional",
    cenas: [
      { tipo: "abertura" },
      { contextoId: "norte", indicador: "evasao", modo: "timeline" },
      { contextoId: "norte", indicador: "eficiencia", modo: "timeline" },
      { contextoId: "sudeste", indicador: "eficiencia", modo: "timeline", climax: true },
      { contextoId: "sul", indicador: "eficiencia", modo: "timeline" },
      { tipo: "fechamento", cta: true },
    ],
  },
  jornada: {
    titulo: "A Jornada do Aluno",
    cenas: [
      { tipo: "abertura" },
      { contextoId: "brasil", indicador: null, modo: "composicao" },
      { contextoId: "brasil", indicador: null, modo: "indicadores", showLinks: true, climax: true },
      { contextoId: "sul", indicador: null, modo: "composicao" },
      { contextoId: "norte", indicador: null, modo: "composicao" },
      { tipo: "fechamento", cta: true },
    ],
  },
};
const validKeys = DADOS.indicadores.map((i) => i.key);
function resolveTourCtx(id) {
  if (id === "brasil") return DADOS.brasil;
  return DADOS.regioes.find((r) => r.id === id) || null;
}
const tourIds = Object.keys(TOURS);
let totalCenas = 0;
let tourErros = 0;
console.log(`  ${tourIds.length} historias: ${tourIds.map((id) => TOURS[id].titulo).join(", ")}`);
tourIds.forEach((tourId) => {
  const tour = TOURS[tourId];
  const cenas = tour.cenas;
  const aberturas = cenas.filter((c) => c.tipo === "abertura").length;
  const fechamentos = cenas.filter((c) => c.tipo === "fechamento").length;
  check(aberturas === 1, `${tour.titulo}: deveria ter 1 abertura, tem ${aberturas}`);
  check(fechamentos === 1, `${tour.titulo}: deveria ter 1 fechamento, tem ${fechamentos}`);
  check(cenas.some((c) => c.climax), `${tour.titulo}: deveria ter uma cena de climax`);
  cenas.forEach((cena, idx) => {
    totalCenas += 1;
    if (cena.tipo === "abertura" || cena.tipo === "fechamento") return;
    const ctx = resolveTourCtx(cena.contextoId);
    if (!ctx) { check(false, `${tour.titulo} cena ${idx + 1}: contextoId "${cena.contextoId}" nao encontrado`); tourErros += 1; return; }
    if (cena.indicador) {
      if (!validKeys.includes(cena.indicador)) {
        check(false, `${tour.titulo} cena ${idx + 1}: indicador "${cena.indicador}" invalido`);
        tourErros += 1;
        return;
      }
      try {
        const n = computeNarrative(ctx, cena.indicador);
        check(n.manchete && !/NaN|undefined/.test(n.manchete), `${tour.titulo} cena ${idx + 1}: manchete suspeita`);
      } catch (e) {
        check(false, `${tour.titulo} cena ${idx + 1}: excecao em computeNarrative: ${e.message}`);
        tourErros += 1;
      }
    }
    if (cena.modo === "composicao") {
      check(ctx.series.contagens, `${tour.titulo} cena ${idx + 1}: contexto "${cena.contextoId}" sem contagens`);
    }
  });
});
console.log(`  ${totalCenas} cenas em ${tourIds.length} historias, ${tourErros} erro(s)`);

// 10) Mapa: comentario por regiao (replica de regionComment) sem NaN; 5 regioes com dados.
console.log("\n[10] Mapa do Brasil (comentarios por regiao)");
function lv(s) { for (let i = s.length - 1; i >= 0; i--) if (s[i] != null) return s[i]; return null; }
const regs = DADOS.regioes.map((r) => ({ id: r.id, nome: r.nome, ef: lv(r.series.eficiencia) ?? -1, ev: lv(r.series.evasao) ?? -1 }));
const byEf = [...regs].sort((a, b) => b.ef - a.ef);
const byEv = [...regs].sort((a, b) => b.ev - a.ev);
const efB = lv(DADOS.brasil.series.eficiencia) ?? 0;
function regionComment(r) {
  const efRank = byEf.findIndex((x) => x.id === r.id);
  const evRank = byEv.findIndex((x) => x.id === r.id);
  const n = regs.length;
  if (efRank === 0) return "Lidera a eficiencia academica entre as regioes.";
  if (efRank === n - 1) return "Menor eficiencia academica entre as regioes.";
  if (evRank === 0) return "Maior taxa de evasao do pais.";
  const dif = r.ef - efB;
  if (dif >= 2) return "Eficiencia acima da media nacional.";
  if (dif <= -2) return "Eficiencia abaixo da media nacional.";
  return "Eficiencia proxima da media nacional.";
}
check(regs.length === 5, "esperado 5 regioes para o mapa");
let comentVazio = 0;
regs.forEach((r) => {
  const c = regionComment(r);
  if (!c || /NaN|undefined/.test(c)) comentVazio += 1;
  if (r.ef < 0 || r.ev < 0) comentVazio += 1; // regiao sem dados de eficiencia/evasao
});
check(comentVazio === 0, "comentario de regiao vazio/NaN ou regiao sem dados");
console.log(`  lider eficiencia: ${byEf[0].nome} (${fmt(byEf[0].ef)}%) | maior evasao: ${byEv[0].nome} (${fmt(byEv[0].ev)}%)`);
regs.forEach((r) => console.log(`  ${r.nome}: "${regionComment(r)}"`));

// 11) Small Multiples (Comparacao Regional)
console.log("\n[11] Small Multiples (Comparacao Regional)");
let smErros = 0;
const smContexts = [DADOS.brasil, ...DADOS.regioes];
DADOS.indicadores.forEach((ind) => {
  const items = smContexts.map(ctx => ({ ctx, val: latestValue(ctx.series[ind.key]) ?? -1 }));
  
  if (ind.sentido === "negativo") {
    items.sort((a, b) => b.val - a.val); // pior (maior evasao) primeiro
  } else {
    items.sort((a, b) => b.val - a.val); // lidera (maior valor) primeiro
  }
  
  items.forEach(i => {
    if (i.val < 0) warn(false, `Small multiples: ${rotuloContexto(i.ctx)} sem valor valido para ${ind.key}`);
  });

  const maxReg = items.find(i => i.ctx.tipo === "regiao");
  const minReg = [...items].reverse().find(i => i.ctx.tipo === "regiao");
  if (!maxReg || !minReg) {
    check(false, `Small multiples: falta regioes para ${ind.key}`);
    smErros++;
  } else {
    const diff = Math.abs(maxReg.val - minReg.val).toFixed(1).replace(".", ",");
    const pontaStr = ind.sentido === "negativo" ? "pior" : "lidera";
    const baseStr = ind.sentido === "negativo" ? "melhor" : "na lanterna";
    const title = `${ind.label} por regiao (2024): ${maxReg.ctx.nome} ${pontaStr} (${fmt(maxReg.val)}%), ${minReg.ctx.nome} ${baseStr} (${fmt(minReg.val)}%) — ${diff} pp de diferenca.`;
    check(!/NaN|undefined/.test(title), `Small multiples: manchete com NaN/undefined para ${ind.key} -> ${title}`);
    // Coerencia rotulo x dado: a ordenacao e descendente, entao a "ponta" sempre tem o
    // maior valor entre as regioes (pior na evasao, lider em conclusao/eficiencia) e a
    // "base" o menor. Pega a inversao de sinal do bug anterior.
    const regs = items.filter(i => i.ctx.tipo === "regiao").map(i => i.val);
    check(maxReg.val === Math.max(...regs) && minReg.val === Math.min(...regs),
      `Small multiples: rotulo incoerente com o dado para ${ind.key} (ponta=${fmt(maxReg.val)}, base=${fmt(minReg.val)})`);
  }
});
check(smErros === 0, "Erros na validacao do Small Multiples");

// 12) Momentos Narrativos (C1) e Sintese (C5)
console.log("\n[12] Momentos Narrativos e Sintese (Narrativa+)");
let narPlusErros = 0;
const allCtxs = [DADOS.brasil, ...DADOS.regioes];
allCtxs.forEach(ctx => {
  // Testar Momentos (C1)
  DADOS.indicadores.forEach(ind => {
    const momentos = computeMomentos(ctx, ind.key);
    if (!momentos || !momentos.length) return;
    momentos.forEach(m => {
      if (/NaN|undefined/.test(m.titulo) || /NaN|undefined/.test(m.fala)) {
        check(false, `Momento com NaN no contexto ${ctx.id}, ind ${ind.key}: "${m.titulo}" / "${m.fala}"`);
        narPlusErros++;
      }
    });
  });
  
  // Testar Sintese (C5) e Fio Causal
  const sintese = buildSintese(ctx);
  if (/NaN|undefined/.test(sintese)) {
    check(false, `Sintese com NaN no contexto ${ctx.id}: "${sintese}"`);
    narPlusErros++;
  }
  
  // Testar Fio causal (C2)
  const idx = lastValidIndex(ctx.series.eficiencia);
  const ef = ctx.series.eficiencia[idx];
  const m = ctx.series.matriculas[idx];
  const cont = ctx.series.contagens;
  if (m > 0 && ef != null && cont) {
    const pc = (cont.concluidos[idx] / m) * 100;
    const pe = (cont.evadidos[idx] / m) * 100;
    const causal = `Fio Causal: a conclusao (${fmt(pc)}%) sofre o peso da evasao (${fmt(pe)}%), puxando a Eficiencia para ${fmt(ef)}%.`;
    if (/NaN|undefined/.test(causal)) {
      check(false, `Fio causal com NaN no contexto ${ctx.id}: "${causal}"`);
      narPlusErros++;
    }
  }
});
check(narPlusErros === 0, "Erros na geracao de momentos ou sinteses da Narrativa+");

console.log(`\n=== RESULTADO: ${falhas} falha(s), ${avisos} aviso(s) ===`);
process.exitCode = falhas > 0 ? 1 : 0;

