// ---- Abertura guiada (martini glass) ----

async function playGuided() {
  const token = ++state.guidedToken;
  state.guided = true;

  setEntityVisible(dom.scrubberRow, false);
  setEntityVisible(dom.actionRow, false);
  setEntityVisible(dom.ctrlSkip, true);
  dom.guidedHint.setAttribute("value", "Apresentando a serie...   (Pular introducao)");

  // Esconde marcadores e callouts para revelar progressivamente.
  setMarkersHidden(true);
  dom.annotations.querySelectorAll("[data-callout]").forEach((c) => setEntityVisible(c, false));
  setInteractionMode("timeline");
  setSubtreeClickable(dom.scrubberRow, false);
  setSubtreeClickable(dom.actionRow, false);
  refreshRaycasters();

  const momentos = computeMomentos(state.context, state.indicatorKey);

  await wait(450);
  for (let i = 0; i < momentos.length; i++) {
    if (token !== state.guidedToken) return; // cancelado (saida ou pular)
    const m = momentos[i];
    state.yearIdx = m.idx;
    revealMarker(m.idx);
    updateYear();
    if (m.tipo === "pico" || m.tipo === "vale") revealCallout(m.idx);
    
    // Mostra o momento como legenda temporaria no HUD
    dom.guidedHint.setAttribute("value", m.titulo);
    
    // Narra a frase do momento
    await narrateText(m.fala, token);
    
    if (token !== state.guidedToken) return;
    await wait(300);
  }
  if (token !== state.guidedToken) return;
  finishGuided();
}

function finishGuided() {
  state.guided = false;
  setMarkersHidden(false);
  dom.annotations.querySelectorAll("[data-callout]").forEach((c) => setEntityVisible(c, true));
  setEntityVisible(dom.ctrlSkip, false);
  setEntityVisible(dom.scrubberRow, true);
  setEntityVisible(dom.actionRow, true);
  state.yearIdx = lastValidIndex(state.context.series[state.indicatorKey]);
  updateYear();
  dom.guidedHint.setAttribute("value", "Explore: caminhe pelos anos (WASD ou passos) e compare com o Brasil.");
  setInteractionMode("timeline");
  // Botao "Pular" some; controles de exploracao voltam a ser clicaveis.
  setSubtreeClickable(dom.ctrlSkip, false);
  setSubtreeClickable(dom.scrubberRow, true);
  setSubtreeClickable(dom.actionRow, true);
  refreshRaycasters();
}

let speechRunId = 0;

function skipGuided() {
  if (!state.guided) return;
  state.guidedToken += 1; // interrompe o loop
  stopNarration();
  finishGuided();
}

function cancelGuided() {
  state.guidedToken += 1;
  state.guided = false;
  stopNarration();
}

function setMarkersHidden(hidden) {
  dom.markers.querySelectorAll("[data-idx]").forEach((m) => {
    setVectorAttribute(m, "scale", hidden ? "0.001 0.001 0.001" : "1 1 1");
  });
}

function revealMarker(i) {
  const m = dom.markers.querySelector(`[data-idx="${i}"]`);
  if (!m) return;
  setVectorAttribute(m, "scale", "0.001 0.001 0.001");
  m.setAttribute("animation__pop", "property: scale; to: 1 1 1; dur: 240; easing: easeOutBack");
}

function revealCallout(i) {
  const c = dom.annotations.querySelector(`[data-callout="${i}"]`);
  if (!c) return;
  setEntityVisible(c, true);
  setVectorAttribute(c, "scale", "0.6 0.6 0.6");
  c.setAttribute("animation__pop", "property: scale; to: 1 1 1; dur: 260; easing: easeOutBack");
  playSparkle();
}

// ---- Acoes (exploracao livre) ----

function toggleCompare() {
  if (state.guided) return;
  if (!state.compareContext) {
    dom.hudSubtitle.textContent = "Brasil nao tem contexto de comparacao padrao.";
    return;
  }
  state.compareOn = !state.compareOn;
  dom.ctrlCompareLabel.setAttribute("value", state.compareOn ? "Ocultar" : "Comparar");
  applyCompare();
  updateYear();
  dom.hudLegend.hidden = !state.compareOn;
  if (state.compareOn) {
    dom.legendPrimary.textContent = rotuloCurto(state.context);
    dom.legendCompare.textContent = rotuloCurto(state.compareContext);
  }
}

function stopNarration() {
  speechRunId += 1;
  state.narrating = false;
  setCaption("");
}

function setCaption(text) {
  if (dom.captionText) dom.captionText.setAttribute("value", text);
  if (dom.captionPanel) setEntityVisible(dom.captionPanel, text.length > 0);
}

// Sem voz sintetica: o texto vira legenda (captionPanel) por um tempo
// proporcional ao tamanho, mantendo o ritmo da abertura guiada.
function narrateText(text, token) {
  return new Promise((resolve) => {
    if (token && token !== state.guidedToken) { resolve(); return; }

    const currentRunId = ++speechRunId;
    setCaption(text);

    const ms = Math.max(1600, Math.min(4800, (text || "").length * 55));
    setTimeout(() => {
      if (currentRunId === speechRunId) setCaption("");
      resolve();
    }, ms);
  });
}

function replayGuided() {
  if (state.guided) return;
  playGuided();
}

// Narrativa automatica (espelha a logica do projeto do colega).
function computeNarrative(ctx, key) {
  const indicador = indicadorByKey(key);
  const serie = ctx.series[key];
  const anos = DADOS.anos;
  const validos = serie.map((v, i) => ({ v, ano: anos[i], i })).filter((d) => d.v != null);

  if (!validos.length) {
    const t = `Nao ha dados de ${indicador.label.toLowerCase()} para ${rotuloContexto(ctx)}.`;
    return { manchete: rotuloContexto(ctx), texto: t, fala: t };
  }

  const primeiro = validos[0];
  const ultimo = validos[validos.length - 1];
  const maior = validos.reduce((a, b) => (b.v > a.v ? b : a));
  const menor = validos.reduce((a, b) => (b.v < a.v ? b : a));
  const diff = ultimo.v - primeiro.v;
  const tendencia = diff > 2 ? "crescimento" : diff < -2 ? "reducao" : "estabilidade";
  const fase = diff > 2 ? "em alta" : diff < -2 ? "em queda" : "estavel";
  const critico = indicador.sentido === "negativo" ? maior : menor;
  const rotuloCritico = indicador.sentido === "negativo" ? "maior" : "menor";

  // Clausula comparativa interpretativa (vs. media nacional), calculada dos dados.
  let comparativo = "";
  if (ctx.tipo !== "brasil") {
    const bserie = DADOS.brasil.series[key];
    const bv = bserie ? bserie[ultimo.i] : null;
    if (bv != null) {
      const d = ultimo.v - bv;
      comparativo = ` Em ${ultimo.ano}, ficou ${fmt(Math.abs(d))} pp ${d >= 0 ? "acima" : "abaixo"} da media nacional (${fmt(bv)}%).`;
    }
  }

  const manchete = `${rotuloCurto(ctx)}: ${indicador.label.toLowerCase()} ${fase} (${fmt(primeiro.v)}% -> ${fmt(ultimo.v)}%)`;
  const texto =
    `De ${fmt(primeiro.v)}% em ${primeiro.ano} para ${fmt(ultimo.v)}% em ${ultimo.ano}, com tendencia de ${tendencia}. ` +
    `O ${rotuloCritico} valor da serie foi ${fmt(critico.v)}% em ${critico.ano}.` + comparativo;
  const fala =
    `${indicador.label} em ${rotuloContexto(ctx)}. ` +
    `De ${fmt(primeiro.v)} por cento em ${primeiro.ano} para ${fmt(ultimo.v)} por cento em ${ultimo.ano}. ` +
    `Tendencia de ${tendencia}. ${rotuloCritico === "maior" ? "Pico" : "Menor valor"} de ${fmt(critico.v)} por cento em ${critico.ano}.`;

  return { manchete, texto, fala, peakIdx: maior.i, valleyIdx: menor.i };
}

// Extrai instantes criticos (momentos) de uma serie para compor a abertura (C1)
function computeMomentos(ctx, key) {
  const serie = ctx.series[key];
  const anos = DADOS.anos;
  const validos = serie.map((v, i) => ({ v, ano: anos[i], i })).filter((d) => d.v != null);
  if (!validos.length) return [];
  
  const momentos = [];
  const indDef = indicadorByKey(key);
  
  const start = validos[0];
  momentos.push({
    idx: start.i,
    tipo: "inicio",
    titulo: `Inicio da serie (${start.ano})`,
    fala: `Em ${start.ano}, a ${indDef.label.toLowerCase()} era de ${fmt(start.v)}%.`
  });
  
  let maxVar = 0;
  let varIdx = -1;
  for (let k = 1; k < validos.length; k++) {
    const diff = validos[k].v - validos[k-1].v;
    if (Math.abs(diff) > Math.abs(maxVar)) {
      maxVar = diff;
      varIdx = validos[k].i;
    }
  }
  
  const { peakIdx, valleyIdx } = extremos(serie);
  const ev2020 = validos.find(d => d.ano === 2020);
  const visitados = new Set([start.i]);
  
  const addMomento = (idx, tipo, titulo, fala) => {
    if (!visitados.has(idx)) {
      momentos.push({ idx, tipo, titulo, fala });
      visitados.add(idx);
    }
  };
  
  if (ev2020) {
    addMomento(ev2020.i, "evento_2020", "Choque da Pandemia (2020)", `No ano da pandemia, 2020, o valor foi a ${fmt(ev2020.v)}%.`);
  }
  
  if (varIdx !== -1 && Math.abs(maxVar) > 1.0) {
    const vAtual = serie[varIdx];
    const direcao = maxVar > 0 ? "saltou" : "caiu";
    addMomento(varIdx, "maior_variacao", "Maior variacao ano-a-ano", `A taxa ${direcao} bruscamente para ${fmt(vAtual)}% em ${anos[varIdx]}.`);
  }
  
  const vPeak = serie[peakIdx];
  const vValley = serie[valleyIdx];
  if (indDef.sentido === "negativo") {
    addMomento(peakIdx, "pico", "Pior momento", `O pior indice da serie foi registrado em ${anos[peakIdx]}, chegando a ${fmt(vPeak)}%.`);
    addMomento(valleyIdx, "vale", "Melhor momento", `O melhor desempenho ocorreu em ${anos[valleyIdx]}, caindo para ${fmt(vValley)}%.`);
  } else {
    addMomento(peakIdx, "pico", "Pico da serie", `O ponto alto ocorreu em ${anos[peakIdx]}, alcancando ${fmt(vPeak)}%.`);
    addMomento(valleyIdx, "vale", "Menor valor", `A menor taxa foi de ${fmt(vValley)}% em ${anos[valleyIdx]}.`);
  }
  
  const end = validos[validos.length - 1];
  addMomento(end.i, "fim", `Cenario Atual (${end.ano})`, `Hoje, em ${end.ano}, a taxa esta em ${fmt(end.v)}%.`);
  
  momentos.sort((a, b) => a.idx - b.idx);
  return momentos;
}

// ----------------------------------------------------------------------------
// Tour guiado (scrollytelling) — motor de navegacao.
// ----------------------------------------------------------------------------

