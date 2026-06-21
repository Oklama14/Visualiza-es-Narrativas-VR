// Laboratorio VR de Dados - Eficiencia Academica da Rede Federal (Plataforma Nilo Pecanha).
//
// Fluxo hibrido em 3 etapas:
//   1. Selecao de contexto: Brasil + 5 regioes (com drill-down para instituicoes).
//   2. Indicadores: os 4 indicadores do contexto como objetos 3D (valor mais recente).
//   3. Linha do tempo (grafico anotado): serie historica 2017-2024 de um indicador,
//      com eixo de grade, linha de tendencia, marcadores, callouts de pico/vale e
//      uma abertura guiada (martini glass) que apresenta a serie ano a ano antes de
//      liberar a exploracao livre (navegar, comparar, narrar).
//
// Dados vem de dados.json (gerado por build-dados.js). A-Frame e a unica lib externa.
// Narracao usa a Web Speech API nativa do navegador.

let DADOS = null;

// Geometria do grafico (coordenadas no mundo, dentro do ambiente escuro).
const CHART = {
  x0: -3.0,
  x1: 3.0,
  baseY: 1.15, // mais baixo: marcadores ficam proximos da altura dos olhos (1.6)
  maxH: 1.35,
  z: -3.3, // barras/linha/marcadores ficam a frente do painel (-3.4)
};

const MULTIPLOS = {
  cols: 3,
  rows: 2,
  w: 1.8,
  h: 1.1,
  x: [-1.95, 0, 1.95],
  y: [2.55, 1.35],
  z: -3.8
};

const state = {
  stage: "selection", // selection | drill | indicators | timeline | composicao
  context: null,
  parentRegion: null,
  drillRegion: null,
  indicatorKey: null,
  yearIdx: null,
  compareOn: false,
  compareContext: null,
  narrating: false,
  guided: false,
  guidedToken: 0,
  compYearIdx: null,
  miniMapOpen: false,
  transitioning: false,
  tourActive: false,
  tourStep: 0,
  tourId: null,      // A2: id da historia ativa (chave de TOURS)
  tourScenes: null,   // A2: array de cenas da historia ativa
};

// ----------------------------------------------------------------------------
// Motor de Áudio (Web Audio API)
// ----------------------------------------------------------------------------
let audioCtx = null;
let droneOsc1 = null;
let droneOsc2 = null;
let droneGain = null;
let droneFilter = null;
let droneStopTimer = null;

function initAudio() {
  if (audioCtx) {
    if (audioCtx.state === "suspended") audioCtx.resume();
    return;
  }
  const AudioContext = window.AudioContext || window.webkitAudioContext;
  if (!AudioContext) return;
  audioCtx = new AudioContext();
}

function playDataNote(valor, min, max) {
  if (!audioCtx || audioCtx.state !== "running" || valor == null) return;
  
  const pct = max === min ? 0.5 : (valor - min) / (max - min);
  const notes = [146.83, 164.81, 196.00, 220.00, 261.63, 293.66, 329.63, 392.00, 440.00, 523.25];
  const idx = Math.max(0, Math.min(notes.length - 1, Math.floor(pct * notes.length)));
  const freq = notes[idx];
  
  const osc = audioCtx.createOscillator();
  const gain = audioCtx.createGain();
  osc.type = "triangle";
  osc.frequency.value = freq;
  
  osc.connect(gain);
  gain.connect(audioCtx.destination);
  
  const now = audioCtx.currentTime;
  gain.gain.setValueAtTime(0, now);
  gain.gain.linearRampToValueAtTime(0.12, now + 0.02);
  gain.gain.exponentialRampToValueAtTime(0.001, now + 0.3);
  
  osc.onended = () => {
    osc.disconnect();
    gain.disconnect();
  };
  
  osc.start(now);
  osc.stop(now + 0.32);
}

function setAmbientDrone(trend, sentido) {
  if (!audioCtx || audioCtx.state !== "running") return;
  stopAmbientDrone();
  
  const isPositive = (trend === "crescimento" && sentido === "positivo") || (trend === "reducao" && sentido === "negativo") || trend === "estabilidade";
  
  droneOsc1 = audioCtx.createOscillator();
  droneOsc2 = audioCtx.createOscillator();
  droneGain = audioCtx.createGain();
  droneFilter = audioCtx.createBiquadFilter();
  
  droneOsc1.type = "sine";
  droneOsc2.type = "triangle";
  droneFilter.type = "lowpass";
  droneFilter.frequency.value = 400;
  
  droneOsc1.frequency.value = 73.42; // D2
  droneOsc2.frequency.value = isPositive ? 110.00 : 87.31; // A2 ou F2
  
  droneOsc1.connect(droneGain);
  droneOsc2.connect(droneGain);
  droneGain.connect(droneFilter);
  droneFilter.connect(audioCtx.destination);
  
  const now = audioCtx.currentTime;
  droneGain.gain.setValueAtTime(0, now);
  droneGain.gain.linearRampToValueAtTime(0.08, now + 1.5);
  
  droneOsc1.start(now);
  droneOsc2.start(now);
}

function stopAmbientDrone() {
  if (!audioCtx || !droneGain) return;
  
  clearTimeout(droneStopTimer);
  
  const now = audioCtx.currentTime;
  const o1 = droneOsc1;
  const o2 = droneOsc2;
  const g = droneGain;
  const f = droneFilter;
  
  droneOsc1 = null;
  droneOsc2 = null;
  droneGain = null;
  droneFilter = null;
  
  g.gain.cancelScheduledValues(now);
  g.gain.setValueAtTime(g.gain.value, now);
  g.gain.linearRampToValueAtTime(0.001, now + 1.0);
  
  droneStopTimer = setTimeout(() => {
    [o1, o2].forEach((osc) => {
      if (!osc) return;
      try { osc.stop(); } catch (_) {}
      osc.disconnect();
    });
    g.disconnect();
    if (f) f.disconnect();
  }, 1050);
}

function updateAmbientDrone() {
  const serie = state.context.series[state.indicatorKey];
  const indDef = indicadorByKey(state.indicatorKey);
  const validos = serie.filter(v => v != null);
  if (validos.length < 2) return;
  const diff = validos[validos.length - 1] - validos[0];
  let trend = "estabilidade";
  if (diff > 2) trend = "crescimento";
  else if (diff < -2) trend = "reducao";
  setAmbientDrone(trend, indDef.sentido);
}

// ----------------------------------------------------------------------------
// A2: Galeria de historias curadas — 3 percursos tematicos.
// Cada historia segue o arco do A1 (abertura/climax/fechamento).
// O motor (tourGoTo, tourNext/Prev, barra de progresso) e identico.
// ----------------------------------------------------------------------------

const TOURS = {
  panorama: {
    titulo: "Panorama Nacional",
    descricao: "A evasao, a conclusao e a eficiencia de 2017 a 2024 no retrato do Brasil.",
    cor: "#7b61ff",
    icone: "\u25C9", // ◉
    cenas: [
      {
        tipo: "abertura",
        kicker: "PANORAMA NACIONAL",
        manchete: "A Rede Federal forma — e tambem perde — milhares de estudantes por ano",
        corpo: "Vamos percorrer a evasao, a conclusao e a eficiencia academica de 2017 a 2024 e entender para onde vao os alunos.",
        conectivo: "Comecamos pelo retrato nacional.",
      },
      {
        contextoId: "brasil", indicador: "evasao", modo: "timeline",
        manchete: "Quase metade dos estudantes evadia em 2017",
        conectivo: "A evasao caiu ao longo dos anos, mas para onde foram esses estudantes?",
      },
      {
        contextoId: "brasil", indicador: "conclusao", modo: "timeline",
        manchete: "A conclusao acompanhou a queda da evasao",
        conectivo: "Juntando evasao, conclusao e retencao, vemos o retrato completo...",
      },
      {
        contextoId: "brasil", indicador: null, modo: "composicao", climax: true,
        manchete: "Para onde vao os alunos: o retrato completo",
        conectivo: "Esse e o cenario nacional. Mas como esses tres indicadores se combinam?",
      },
      {
        contextoId: "brasil", indicador: null, modo: "indicadores", showLinks: true,
        manchete: "Eficiencia = f(Conclusao, Evasao, Retencao)",
        conectivo: "Mais conclusao e menos evasao elevam a eficiencia. Mais retencao a deprime.",
      },
      {
        tipo: "fechamento",
        kicker: "CONCLUSAO",
        manchete: "A eficiencia melhora — mas as desigualdades persistem",
        corpo: "Reduzir a evasao e elevar a conclusao sao os proximos desafios. Explore os dados da sua regiao.",
        cta: true, conectivo: "",
      },
    ],
  },

  abismo: {
    titulo: "O Abismo Regional",
    descricao: "Cinco regioes, cinco realidades: o contraste entre Norte e Sul/Sudeste.",
    cor: "#ff6b6b",
    icone: "\u25B2", // ▲
    cenas: [
      {
        tipo: "abertura",
        kicker: "ABISMO REGIONAL",
        manchete: "Cinco regioes, cinco realidades",
        corpo: "As medias nacionais escondem diferencas profundas. Vamos comparar Norte, Sudeste e Sul para revelar o abismo da eficiencia academica.",
        conectivo: "Comecamos pelo Norte, onde a evasao e mais alta.",
      },
      {
        contextoId: "norte", indicador: "evasao", modo: "timeline",
        manchete: "O Norte ainda enfrenta evasao acima da media",
        conectivo: "Se a evasao e alta no Norte, como esta a eficiencia?",
      },
      {
        contextoId: "norte", indicador: "eficiencia", modo: "timeline",
        manchete: "A eficiencia academica no Norte cresce devagar",
        conectivo: "Comparando com o Sudeste, a diferenca regional aparece...",
      },
      {
        contextoId: "sudeste", indicador: "eficiencia", modo: "timeline", climax: true,
        manchete: "O Sudeste lidera em eficiencia academica",
        conectivo: "O abismo entre as regioes fica evidente.",
      },
      {
        contextoId: "sul", indicador: "eficiencia", modo: "timeline",
        manchete: "O Sul consolida a maior eficiencia do pais",
        conectivo: "O contraste com o Norte e irrefutavel.",
      },
      {
        tipo: "fechamento",
        kicker: "CONCLUSAO",
        manchete: "O abismo regional persiste",
        corpo: "Enquanto Sul e Sudeste superam 80% de eficiencia, o Norte ainda luta para alcanca-los. Politicas precisam ser regionalizadas.",
        cta: true, conectivo: "",
      },
    ],
  },

  jornada: {
    titulo: "A Jornada do Aluno",
    descricao: "Para onde vao os estudantes? O fluxo entre conclusao, retencao e evasao.",
    cor: "#3ad29f",
    icone: "\u21C4", // ⇄
    cenas: [
      {
        tipo: "abertura",
        kicker: "A JORNADA DO ALUNO",
        manchete: "Para onde vao os estudantes da Rede Federal?",
        corpo: "Cada estudante matriculado segue um de tres caminhos: conclui, e retido ou evade. Vamos visualizar esse fluxo.",
        conectivo: "Comecamos pelo retrato nacional.",
      },
      {
        contextoId: "brasil", indicador: null, modo: "composicao",
        manchete: "O retrato nacional: conclusao, retencao e evasao",
        conectivo: "Esse e o cenario medio. Como esses tres fluxos afetam a eficiencia?",
      },
      {
        contextoId: "brasil", indicador: null, modo: "indicadores", showLinks: true, climax: true,
        manchete: "Eficiencia = f(Conclusao, Evasao, Retencao)",
        conectivo: "A relacao e direta: mais evasao, menos eficiencia.",
      },
      {
        contextoId: "sul", indicador: null, modo: "composicao",
        manchete: "O Sul: o melhor cenario do pais",
        conectivo: "Agora compare com o Norte, onde a evasao e dominante.",
      },
      {
        contextoId: "norte", indicador: null, modo: "composicao",
        manchete: "O Norte: evasao domina a composicao",
        conectivo: "A diferenca na composicao explica o abismo na eficiencia.",
      },
      {
        tipo: "fechamento",
        kicker: "CONCLUSAO",
        manchete: "Cada aluno evadido e uma historia interrompida",
        corpo: "Reduzir a evasao e o caminho mais direto para elevar a eficiencia. Explore os dados da sua regiao e descubra o cenario local.",
        cta: true, conectivo: "",
      },
    ],
  },
};

const dom = {};

// Indicadores espacados com folga no palco.
const dataPositions = [
  { x: -2.7, z: -2.7, rot: 18 },
  { x: -0.9, z: -3.25, rot: 6 },
  { x: 0.9, z: -3.25, rot: -6 },
  { x: 2.7, z: -2.7, rot: -18 },
];

// Notas explicativas (HUD) por etapa: explicam o conceito da visualizacao
// narrativa em foco e o que os numeros significam. Atualizadas a cada transicao.
const NOTAS = {
  selecao: {
    titulo: "Escolha de contexto",
    corpo:
      "Cada card e um contexto (Brasil ou regiao). O % de Eficiencia Academica resume a jornada dos estudantes ate a conclusao. Na visualizacao narrativa, voce escolhe o recorte e a historia se monta a partir dele.",
  },
  drill: {
    titulo: "Drill-down por instituicao",
    corpo:
      "Voce desceu um nivel: agora compara instituicoes dentro da regiao. 'Regiao inteira' usa o agregado de todas elas. Os % vem de contagens brutas reagregadas (nao sao medias simples).",
  },
  indicadores: {
    titulo: "Indicadores em 2024",
    corpo:
      "Cada objeto e um dos 4 indicadores no ano mais recente; a altura acompanha o valor. Percentuais nao se somam. Passe o mouse para a definicao e clique para abrir a serie historica.",
  },
  timeline: {
    titulo: "Genero: grafico anotado",
    corpo:
      "A linha mostra a tendencia de 2017 a 2024; os callouts marcam o pico e o melhor ano e a faixa de 2020 lembra a pandemia. Alem do %, exibimos os numeros absolutos (quantos estudantes) para revelar a escala por tras da taxa.",
  },
  composicao: {
    titulo: "Para onde vao os alunos",
    corpo:
      "Cada barra e um ano normalizado a 100%: a divisao mostra a proporcao de concluintes, retidos e evadidos. O anel resume o ano em foco. Concluidos + retidos + evadidos = total de matriculas.",
  },
  multiplos: {
    titulo: "Comparacao regional",
    corpo:
      "Brasil e as 5 regioes lado a lado. Todos usam a mesma escala de 0 a 100% para revelar a desigualdade. A linha pontilhada mostra a media nacional para referencia rapida.",
  },
};

document.addEventListener("DOMContentLoaded", () => {
  const ids = [
    "scene", "selectionWorld", "explorationWorld", "contextCards", "drillCards",
    "drillBack", "indicatorView", "indicatorObjects", "infoPanel", "infoTitle",
    "infoValue", "infoDescription", "infoAccent", "infoHint", "contextKicker",
    "contextTitle", "contextLead", "focusRing", "indicatorGlow", "timelineView",
    "chartGlow", "chartPanel", "chartGrid", "focusBand", "timelineBars",
    "compareBars", "trendLine", "markers", "yearTicks", "annotations",
    "valueReadout", "narrativeTitle", "narrativeText", "narrativeYear",
    "guidedHint", "scrubberRow", "actionRow", "ctrlPrevYear", "ctrlNextYear",
    "ctrlYearLabel", "ctrlCompare", "ctrlCompareLabel", "ctrlNarrate",
    "ctrlNarrateLabel", "ctrlReplay", "ctrlBackIndicators", "ctrlSkip",
    "backButton", "selectionTitle", "selectionLead", "selectionKicker",
    "transitionOverlay", "vrFade", "gazeCursor", "cameraRig", "hudTitle",
    "hudSubtitle", "hudLegend", "legendPrimary", "legendCompare", "stageSpot",
    "notaTitle", "notaBody",
    "compEnter", "composicaoView", "compGlow", "compPanel", "compScene",
    "compTitle", "compText", "compReadout", "compScrubber", "compYearLabel",
    "compPrev", "compNext", "compBack", "compLegend",
    "onboardOverlay", "onboardStart", "helpBtn",
    "mapKicker", "mapTitle", "mapView", "mapPanel", "mapHotspots", "brasilBtn",
    "brasilEfic", "mapPreview", "mapPrevAccent", "mapPrevTitle", "mapPrevVals", "mapPrevComment",
    "tourGallery", "tourControls", "tourPrevBtn", "tourNextBtn", "tourNextLabel",
    "tourProgress", "tourBar", "tourBarFill", "tourBarStep", "tourBarLabel",
    "tourPanel", "tourPanelKicker", "tourPanelTitle", "tourPanelBody", "tourCta",
    "roomSign", "breadcrumb",
    "miniMapBase", "miniMapTab", "miniMapContent", "miniMapPanel", "miniMapHotspots", "miniBrasilBtn",
    "indicatorLinks", "efficacyPanel",
    "multiplosBtn", "multiplosView", "multiplosTitle", "multiplosNote", "multiplosLegend", "multiplosSelectors", "multiplosGrid",
    "guidedQuestions", "captionPanel", "visceralParticles",
  ];
  ids.forEach((id) => (dom[id] = document.getElementById(id)));

  initOnboarding();

  loadData()
    .then(() => {
      if (dom.scene.hasLoaded) initExperience();
      else dom.scene.addEventListener("loaded", initExperience);
    })
    .catch((error) => {
      console.error("Falha ao carregar dados.json:", error);
      dom.hudTitle.textContent = "Erro ao carregar os dados";
      dom.hudSubtitle.textContent = "Verifique se dados.json esta no servidor.";
    });
});

async function loadData() {
  const response = await fetch("dados.json");
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  DADOS = await response.json();
}

function initExperience() {
  buildMapa();
  buildMiniMapa();
  buildTourGallery();
  showMapSelection();
  bindDrillBack();
  bindBackButton();
  bindTimelineControls();
  bindCompControls();
  bindTourControls();
  bindVrCursorMode();
  setNota("selecao");
  setInteractionMode("selection");
}

function setNota(chave) {
  const nota = NOTAS[chave];
  if (!nota) return;
  dom.notaTitle.textContent = nota.titulo;
  dom.notaBody.textContent = nota.corpo;
}

// Trilha de navegacao (wayfinding) no HUD.
function crumb(...parts) {
  if (dom.breadcrumb) dom.breadcrumb.textContent = parts.filter(Boolean).join("  ›  ");
}

// Entrada animada de uma etapa: sobe e assenta (easeOut), dando continuidade
// (object constancy) em vez de um corte seco ao trocar de sub-modo.
function animateViewIn(viewEl) {
  if (!viewEl) return;
  viewEl.removeAttribute("animation__in");
  setVectorAttribute(viewEl, "position", "0 -0.12 0");
  requestAnimationFrame(() => {
    viewEl.setAttribute(
      "animation__in",
      "property: position; from: 0 -0.12 0; to: 0 0 0; dur: 430; easing: easeOutCubic"
    );
  });
}

// Onboarding de 1a visita: overlay 2D (desktop) + placa in-world (#roomSign, p/ VR).
const ONBOARD_KEY = "vrlab.onboarded.v1";

function initOnboarding() {
  if (!dom.onboardOverlay) return;
  let visto = null;
  try { visto = localStorage.getItem(ONBOARD_KEY); } catch (e) { visto = null; }
  if (!visto) dom.onboardOverlay.removeAttribute("hidden");
  if (dom.onboardStart) dom.onboardStart.addEventListener("click", dismissOnboarding);
  if (dom.helpBtn) dom.helpBtn.addEventListener("click", () => dom.onboardOverlay.removeAttribute("hidden"));
}

function dismissOnboarding() {
  initAudio();
  if (!dom.onboardOverlay) return;
  dom.onboardOverlay.setAttribute("hidden", "");
  try { localStorage.setItem(ONBOARD_KEY, "1"); } catch (e) { /* ignore */ }
  const isVr = dom.scene.is("vr-mode");
  if (!isVr) dom.scene.setAttribute("look-controls", "pointerLockEnabled: false; mouseEnabled: true");
}

// ----------------------------------------------------------------------------
// Etapa 1 - Selecao de contexto e drill-down.
// ----------------------------------------------------------------------------

function contextosTopo() {
  return [DADOS.brasil, ...DADOS.regioes];
}

function buildContextCards() {
  dom.contextCards.innerHTML = "";
  const contextos = contextosTopo();
  // Arco mais largo e com mais raio: espacamento > largura do card (sem sobreposicao).
  const positions = arcPositions(contextos.length, 4.6, 100, 1.6);

  contextos.forEach((ctx, index) => {
    const card = createContextCard(ctx, positions[index], "selection-clickable");
    card.querySelector(".hit").addEventListener("click", () => onContextCardClick(ctx));
    dom.contextCards.appendChild(card);
    applyPendingTransforms(card);
  });
}

function onContextCardClick(ctx) {
  if (state.transitioning) return;
  if (ctx.tipo === "regiao" && ctx.instituicoes && ctx.instituicoes.length) {
    openDrill(ctx);
  } else {
    state.parentRegion = null;
    enterIndicators(ctx);
  }
}

function openDrill(region) {
  state.stage = "drill";
  state.drillRegion = region;
  dom.drillCards.innerHTML = "";

  // 6 colunas mantem ate 24 cards (maior regiao) em 4 linhas acima do piso (y=0).
  const entradas = [{ ...region, _rotulo: "Regiao inteira" }, ...region.instituicoes];
  const positions = gridPositions(entradas.length, 6, 1.25, 0.7, 2.55, -4.2);

  entradas.forEach((item, index) => {
    const isRegion = index === 0;
    const card = createDrillCard(item, positions[index], isRegion);
    card.querySelector(".hit").addEventListener("click", () => {
      if (isRegion) {
        state.parentRegion = null;
        enterIndicators(region);
      } else {
        state.parentRegion = region;
        enterIndicators(item);
      }
    });
    dom.drillCards.appendChild(card);
    applyPendingTransforms(card);
  });

  setEntityVisible(dom.mapView, false);
  setEntityVisible(dom.mapKicker, false);
  setEntityVisible(dom.mapTitle, false);
  setEntityVisible(dom.tourGallery, false);
  setEntityVisible(dom.roomSign, false);
  setEntityVisible(dom.selectionKicker, true);
  setEntityVisible(dom.selectionTitle, true);
  setEntityVisible(dom.selectionLead, true);
  setEntityVisible(dom.drillCards, true);
  setEntityVisible(dom.drillBack, true);
  dom.selectionKicker.setAttribute("value", "DRILL-DOWN POR INSTITUICAO");
  dom.selectionTitle.setAttribute("value", `Regiao ${region.nome}`);
  dom.selectionLead.setAttribute("value", "Escolha uma instituicao ou use a regiao inteira.");
  dom.hudTitle.textContent = `Regiao ${region.nome}`;
  dom.hudSubtitle.textContent = `${region.instituicoes.length} instituicoes - escolha para explorar`;
  crumb("Mapa", `Regiao ${region.nome}`);
  setNota("drill");
  setInteractionMode("drill");
}

function closeDrill() {
  state.stage = "selection";
  state.drillRegion = null;
  setEntityVisible(dom.drillCards, false);
  setEntityVisible(dom.drillBack, false);
  showMapSelection();
  setInteractionMode("selection");
}

// Mostra a visao principal de mapa (esconde o cabecalho/grid do drill).
function showMapSelection() {
  setEntityVisible(dom.mapView, true);
  setEntityVisible(dom.mapKicker, true);
  setEntityVisible(dom.mapTitle, true);
  setEntityVisible(dom.tourGallery, true);
  setEntityVisible(dom.roomSign, true);
  setEntityVisible(dom.mapPreview, false);
  setEntityVisible(dom.selectionKicker, false);
  setEntityVisible(dom.selectionTitle, false);
  setEntityVisible(dom.selectionLead, false);
  dom.hudTitle.textContent = "Escolha uma regiao";
  dom.hudSubtitle.textContent = "Olhe para uma regiao no mapa; clique para explorar";
  crumb("Mapa do Brasil");
  setNota("selecao");
}

// ---- Mapa do Brasil: hotspots por regiao (olhar/hover revela; clique faz drill). ----
const MAP_HOTSPOTS = [
  { id: "norte", x: -0.395, y: 0.506, w: 1.6, h: 0.9 },
  { id: "nordeste", x: 0.56, y: 0.367, w: 0.95, h: 0.95 },
  { id: "centro-oeste", x: -0.084, y: -0.12, w: 1.1, h: 0.65 },
  { id: "sudeste", x: 0.539, y: -0.345, w: 0.7, h: 0.6 },
  { id: "sul", x: 0.02, y: -0.694, w: 1.0, h: 0.7 },
];
let regionRanks = null;

function buildMapa() {
  dom.mapHotspots.innerHTML = "";
  computeRegionRanks();

  const efB = latestValue(DADOS.brasil.series.eficiencia);
  dom.brasilEfic.setAttribute("value", efB == null ? "" : `Eficiencia ${fmt(efB)}%`);
  const bHit = dom.brasilBtn.querySelector(".selection-clickable");
  bHit.addEventListener("click", () => { if (!state.transitioning) { state.parentRegion = null; enterIndicators(DADOS.brasil); } });
  bHit.addEventListener("mouseenter", () => dom.brasilBtn.setAttribute("animation__h", "property: scale; to: 1.06 1.06 1.06; dur: 150"));
  bHit.addEventListener("mouseleave", () => dom.brasilBtn.setAttribute("animation__h", "property: scale; to: 1 1 1; dur: 150"));

  if (dom.multiplosBtn) {
    const mHit = dom.multiplosBtn.querySelector(".selection-clickable");
    if (mHit) {
      mHit.addEventListener("click", () => { if (!state.transitioning) enterMultiplos("eficiencia"); });
      mHit.addEventListener("mouseenter", () => dom.multiplosBtn.setAttribute("animation__h", "property: scale; to: 1.06 1.06 1.06; dur: 150"));
      mHit.addEventListener("mouseleave", () => dom.multiplosBtn.setAttribute("animation__h", "property: scale; to: 1 1 1; dur: 150"));
    }
  }

  MAP_HOTSPOTS.forEach((h) => {
    const reg = DADOS.regioes.find((r) => r.id === h.id);
    if (!reg) return;
    const hs = el("a-plane", {
      class: "hit clickable selection-clickable", width: h.w, height: h.h,
      position: `${h.x} ${h.y} 0.02`, material: "color: #ffffff; opacity: 0.001; transparent: true",
    });
    hs.dataset.region = h.id;
    hs.addEventListener("mouseenter", () => showRegionPreview(reg));
    hs.addEventListener("mouseleave", () => hideRegionPreview());
    hs.addEventListener("click", () => { if (!state.transitioning) openDrill(reg); });
    dom.mapHotspots.appendChild(hs);
    applyPendingTransforms(hs);
  });
}

function buildMiniMapa() {
  dom.miniMapHotspots.innerHTML = "";

  // Aba: abre/fecha o mini-mapa sob demanda (evita oclusao por padrao).
  const tabHit = dom.miniMapTab.querySelector(".minimap-clickable");
  if (tabHit) tabHit.addEventListener("click", () => toggleMiniMap());

  // Regiao/Brasil: classe "minimap-region" - so ficam clicaveis quando o mapa esta aberto.
  const bHit = dom.miniBrasilBtn.querySelector(".minimap-region");
  bHit.addEventListener("click", () => onMiniMapClick(DADOS.brasil));
  bHit.addEventListener("mouseenter", () => dom.miniBrasilBtn.setAttribute("animation__h", "property: scale; to: 1.06 1.06 1.06; dur: 150"));
  bHit.addEventListener("mouseleave", () => dom.miniBrasilBtn.setAttribute("animation__h", "property: scale; to: 1 1 1; dur: 150"));

  MAP_HOTSPOTS.forEach((h) => {
    const reg = DADOS.regioes.find((r) => r.id === h.id);
    if (!reg) return;
    const hs = el("a-plane", {
      class: "hit minimap-region", width: h.w, height: h.h,
      position: `${h.x} ${h.y} 0.02`, material: "color: #ffffff; opacity: 0.001; transparent: true",
    });
    hs.dataset.region = h.id;
    hs.addEventListener("click", () => onMiniMapClick(reg));
    dom.miniMapHotspots.appendChild(hs);
    applyPendingTransforms(hs);
  });
}

// Mini-mapa sob demanda: aba recolhida por padrao; abre num tamanho usavel.
function toggleMiniMap() {
  if (state.transitioning || state.tourActive) return;
  if (state.miniMapOpen) closeMiniMap();
  else openMiniMap();
}

function openMiniMap() {
  state.miniMapOpen = true;
  setEntityVisible(dom.miniMapTab, false);
  setEntityVisible(dom.miniMapContent, true);
  dom.miniMapContent.querySelectorAll(".minimap-region").forEach((e) => e.classList.add("clickable"));
  dom.miniMapBase.setAttribute("animation__pos", "property: position; to: 2.8 1.6 -3.0; dur: 240; easing: easeOutQuad");
  dom.miniMapBase.setAttribute("animation__scale", "property: scale; to: 0.55 0.55 0.55; dur: 240; easing: easeOutQuad");
  refreshRaycasters();
}

function closeMiniMap() {
  state.miniMapOpen = false;
  setEntityVisible(dom.miniMapContent, false);
  setEntityVisible(dom.miniMapTab, true);
  dom.miniMapContent.querySelectorAll(".minimap-region").forEach((e) => e.classList.remove("clickable"));
  dom.miniMapBase.setAttribute("animation__pos", "property: position; to: 3.9 1.5 -3.1; dur: 200; easing: easeOutQuad");
  dom.miniMapBase.setAttribute("animation__scale", "property: scale; to: 0.42 0.42 0.42; dur: 200; easing: easeOutQuad");
  refreshRaycasters();
}

// Reposiciona/recolhe o mini-mapa ao (re)entrar numa etapa; oculto durante o tour.
function resetMiniMap() {
  setEntityVisible(dom.miniMapBase, !state.tourActive);
  closeMiniMap();
}

async function onMiniMapClick(ctx) {
  if (state.transitioning || state.tourActive || state.context === ctx) return;

  // Atualiza o contexto (para que as funcoes enter* o leiam corretamente)
  state.context = ctx;
  state.parentRegion = null;
  state.drillRegion = null;
  // Recalcula o contexto de comparacao e zera a comparacao ativa, evitando que um
  // compareContext antigo (ex.: ao trocar para Brasil) desenhe uma linha errada.
  state.compareContext = resolveCompareContext(ctx);
  state.compareOn = false;
  if (dom.ctrlCompareLabel) dom.ctrlCompareLabel.setAttribute("value", "Comparar");
  dom.hudLegend.hidden = true;

  if (state.stage === "indicators") {
    await enterIndicators(ctx);
  } else if (state.stage === "timeline") {
    state.guidedToken += 1; // Cancela narrativa antiga
    await enterTimeline(state.indicatorKey, true); // Reconstrói timeline, skipGuided = true
  } else if (state.stage === "composicao") {
    await enterComposicao();
  }
}

function computeRegionRanks() {
  const regs = DADOS.regioes.map((r) => ({
    id: r.id,
    ef: latestValue(r.series.eficiencia) ?? -1,
    ev: latestValue(r.series.evasao) ?? -1,
  }));
  const byEf = [...regs].sort((a, b) => b.ef - a.ef);
  const byEv = [...regs].sort((a, b) => b.ev - a.ev);
  regionRanks = {};
  regs.forEach((r) => {
    regionRanks[r.id] = { efRank: byEf.findIndex((x) => x.id === r.id), evRank: byEv.findIndex((x) => x.id === r.id), ef: r.ef };
  });
}

function regionComment(reg) {
  if (!regionRanks) computeRegionRanks();
  const r = regionRanks[reg.id];
  const n = DADOS.regioes.length;
  const efB = latestValue(DADOS.brasil.series.eficiencia) ?? 0;
  if (r.efRank === 0) return "Lidera a eficiencia academica entre as regioes.";
  if (r.efRank === n - 1) return "Menor eficiencia academica entre as regioes.";
  if (r.evRank === 0) return "Maior taxa de evasao do pais.";
  const dif = r.ef - efB;
  if (dif >= 2) return "Eficiencia acima da media nacional.";
  if (dif <= -2) return "Eficiencia abaixo da media nacional.";
  return "Eficiencia proxima da media nacional.";
}

function showRegionPreview(reg) {
  const ef = latestValue(reg.series.eficiencia);
  const ev = latestValue(reg.series.evasao);
  dom.mapPrevTitle.setAttribute("value", reg.nome);
  dom.mapPrevVals.setAttribute("value", `Eficiencia ${fmt(ef)}%   ·   Evasao ${fmt(ev)}%`);
  dom.mapPrevComment.setAttribute("value", regionComment(reg));
  fadeEntity(dom.mapPreview, true);
  dom.hudSubtitle.textContent = `${reg.nome}: eficiencia ${fmt(ef)}% (2024)`;
}

function hideRegionPreview() {
  if (dom.mapPreview.object3D && dom.mapPreview.object3D.visible) fadeEntity(dom.mapPreview, false);
}

function resetSelectionHeader() {
  dom.selectionKicker.setAttribute("value", "EXPERIENCIA DE DADOS EM REALIDADE VIRTUAL");
  dom.selectionTitle.setAttribute("value", "Eficiencia Academica da Rede Federal");
  dom.selectionLead.setAttribute(
    "value",
    "Escolha um contexto e percorra a evasao, a conclusao e a eficiencia ao longo de 2017-2024."
  );
  dom.hudTitle.textContent = "Escolha um contexto";
  dom.hudSubtitle.textContent = "Narrativa de eficiencia academica (2017-2024)";
  setNota("selecao");
}

function createContextCard(ctx, pos, hitClass) {
  const eficiencia = latestValue(ctx.series.eficiencia);
  const isBrasil = ctx.tipo === "brasil";
  const cor = isBrasil ? "#1d4ed8" : "#1f5e86";
  const acento = isBrasil ? "#7bdcff" : "#5fe3c0";

  const card = el("a-entity", { position: pos.position, rotation: pos.rotation, scale: "1 1 1" });
  const glassBack = el("a-box", {
    width: 1.42, height: 1.02, depth: 0.05, position: "0 0 -0.03",
    material: `color: #0b1730; opacity: 0.9; transparent: true; roughness: 0.6`,
  });
  const face = el("a-box", {
    class: "card-face", width: 1.36, height: 0.96, depth: 0.06,
    material: `color: ${cor}; roughness: 0.4; metalness: 0.14; emissive: ${acento}; emissiveIntensity: 0.1`,
  });
  const glow = el("a-plane", {
    class: "card-accent", width: 1.18, height: 0.03, position: "0 0.39 0.05",
    material: `color: ${acento}; opacity: 0.9; transparent: true; shader: flat`,
  });
  const titulo = el("a-text", {
    value: ctx.nome, position: "0 0.17 0.07", width: 1.75, align: "center",
    color: "#ffffff", font: "kelsonsans", "wrap-count": 14,
  });
  const tipo = el("a-text", {
    value: isBrasil ? "Visao nacional" : "Regiao", position: "0 -0.05 0.07",
    width: 1.5, align: "center", color: "#cfe0f4", font: "kelsonsans",
  });
  const valor = el("a-text", {
    value: eficiencia == null ? "s/ dados" : `Eficiencia ${fmt(eficiencia)}%`,
    position: "0 -0.31 0.07", width: 1.55, align: "center", color: "#9be7ff", font: "kelsonsans",
  });
  const hit = el("a-box", {
    class: `hit clickable ${hitClass}`, width: 1.44, height: 1.06, depth: 0.18,
    material: "color: #ffffff; opacity: 0.001; transparent: true",
  });
  card.append(glassBack, face, glow, titulo, tipo, valor, hit);

  hit.addEventListener("mouseenter", () => setCardHover(card, cor, acento, true));
  hit.addEventListener("mouseleave", () => setCardHover(card, cor, acento, false));
  return card;
}

function createDrillCard(item, pos, isRegion) {
  const nome = item._rotulo || item.sigla || item.nome;
  const cor = isRegion ? "#1f7a63" : "#1c3050";
  const acento = isRegion ? "#65e4b8" : "#7bb8ff";
  const eficiencia = latestValue(item.series.eficiencia);

  const card = el("a-entity", { position: pos.position, rotation: pos.rotation, scale: "1 1 1" });
  const face = el("a-box", {
    class: "card-face", width: 1.08, height: 0.6, depth: 0.06,
    material: `color: ${cor}; roughness: 0.45; metalness: 0.08; emissive: ${acento}; emissiveIntensity: 0.12`,
  });
  const glow = el("a-plane", {
    class: "card-accent", width: 0.94, height: 0.022, position: "0 0.25 0.04",
    material: `color: ${acento}; opacity: 0.88; transparent: true; shader: flat`,
  });
  const titulo = el("a-text", {
    value: nome, position: "0 0.05 0.05", width: 1.6, align: "center",
    color: "#ffffff", font: "kelsonsans", "wrap-count": 15,
  });
  const valor = el("a-text", {
    value: eficiencia == null ? "s/ dados" : `${fmt(eficiencia)}%`,
    position: item.inconsistente ? "0 -0.16 0.05" : "0 -0.19 0.05", width: 1.15, align: "center",
    color: "#9be7ff", font: "kelsonsans",
  });
  const aviso = item.inconsistente
    ? el("a-text", {
        value: "* sob revisao", position: "0 -0.26 0.05", width: 0.95,
        align: "center", color: "#ffb454", font: "kelsonsans",
      })
    : null;
  const hit = el("a-box", {
    class: "hit clickable drill-clickable", width: 1.12, height: 0.64, depth: 0.16,
    material: "color: #ffffff; opacity: 0.001; transparent: true",
  });
  card.append(face, glow, titulo, valor, hit);
  if (aviso) card.append(aviso);

  hit.addEventListener("mouseenter", () => setCardHover(card, cor, acento, true));
  hit.addEventListener("mouseleave", () => setCardHover(card, cor, acento, false));
  return card;
}

function setCardHover(card, cor, acento, isHovering) {
  if (state.transitioning) return;
  const face = card.querySelector(".card-face");
  card.setAttribute(
    "animation__hover",
    `property: scale; to: ${isHovering ? "1.09 1.09 1.09" : "1 1 1"}; dur: 200; easing: easeOutQuad`
  );
  if (face) {
    face.setAttribute(
      "material",
      `color: ${cor}; roughness: 0.4; metalness: 0.16; emissive: ${acento}; emissiveIntensity: ${
        isHovering ? 0.4 : 0.11
      }`
    );
  }
}

function bindDrillBack() {
  dom.drillBack.querySelector(".drill-clickable").addEventListener("click", () => {
    if (!state.transitioning) closeDrill();
  });
}

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

  setVectorAttribute(dom.cameraRig, "position", "0 1.6 0");
  setEntityVisible(dom.selectionWorld, false);
  setEntityVisible(dom.explorationWorld, true);
  setEntityVisible(dom.timelineView, false);
  setEntityVisible(dom.composicaoView, false);
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
  crumb("Mapa", rotuloContexto(ctx), "Indicadores");
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

// Cada indicador e um MEDIDOR RADIAL (gauge): um arco preenche de 0 a 100%
// conforme o valor, com o numero no centro. Linguagem unica para os 4 -> comparavel.
const GAUGE = { y: 1.45, rIn: 0.42, rOut: 0.58 };

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
    animation__spin: `property: rotation; to: -90 360 0; dur: ${18000 + index * 1500}; loop: true; easing: linear`,
  });
  // Haste que liga o pedestal ao medidor.
  const standH = GAUGE.y - GAUGE.rOut - 0.08;
  const stand = el("a-cylinder", {
    radius: 0.028, height: standH, position: `0 ${0.08 + standH / 2} 0`,
    material: `color: ${cor}; opacity: 0.5; transparent: true; shader: flat`,
  });
  point.append(pedestal, ring, stand);

  // Trilho (referencia de 100%) + arco preenchido (valor).
  const track = el("a-ring", {
    radiusInner: GAUGE.rIn, radiusOuter: GAUGE.rOut, position: `0 ${GAUGE.y} 0`,
    "theta-start": 0, "theta-length": 360, "segments-theta": 64,
    material: "color: #243250; opacity: 0.6; transparent: true; shader: flat",
  });
  const sweep = value / 100 * 360;
  const arc = el("a-ring", {
    class: "data-visual", radiusInner: GAUGE.rIn, radiusOuter: GAUGE.rOut, position: `0 ${GAUGE.y} 0.002`,
    "theta-start": round2(90 - sweep), "theta-length": round2(sweep), "segments-theta": 64,
    material: `color: ${cor}; emissive: ${cor}; emissiveIntensity: 0.45; shader: flat; opacity: 0.95; transparent: true`,
  });
  // Marca do ponto de partida (topo = 0/100%).
  const tick = el("a-box", {
    width: 0.03, height: 0.12, depth: 0.01, position: `0 ${GAUGE.y + GAUGE.rOut + 0.02} 0.003`,
    material: "color: #dfe9ff; shader: flat",
  });
  // Numero central + rotulo abaixo.
  const valueText = el("a-text", {
    value: latest == null ? "s/d" : `${fmt(value)}%`, position: `0 ${GAUGE.y + 0.03} 0.02`,
    width: 2.5, align: "center", color: "#ffffff", font: "kelsonsans",
  });
  const unidade = el("a-text", {
    value: latest == null ? "sem dados" : "em 2024", position: `0 ${GAUGE.y - 0.16} 0.02`,
    width: 1.4, align: "center", color: "#9fb2cc", font: "kelsonsans",
  });
  const label = el("a-text", {
    class: "point-label", value: indicador.label, position: `0 ${GAUGE.y - GAUGE.rOut - 0.2} 0.02`,
    width: 2.0, align: "center", color: "#cdd9ec", font: "kelsonsans", "wrap-count": 18,
  });

  // Hitbox cobrindo o medidor (do pedestal ao topo).
  const topo = GAUGE.y + GAUGE.rOut + 0.2;
  const hit = el("a-box", {
    class: "clickable indicator-clickable", width: 1.35, height: topo, depth: 0.5,
    position: `0 ${topo / 2} 0`, material: "color: #ffffff; opacity: 0.001; transparent: true",
  });
  point.append(track, arc, tick, valueText, unidade, label, hit);

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
  else hideInfoPanel();

  // A4: mostrar/esconder conectores visuais ao focar Eficiencia.
  // Durante o tour (cena com showLinks) nao escondemos ao passar por outros medidores.
  if (indicador.key === "eficiencia") {
    showIndicatorLinks(isHovering);
  } else if (!state.tourActive) {
    showIndicatorLinks(false);
  }
}

function showInfoPanel(indicador) {
  const latest = latestValue(state.context.series[indicador.key]);
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
  if (dom.infoPanel.object3D && dom.infoPanel.object3D.visible) fadeEntity(dom.infoPanel, false);
}

// Esconde na hora (mudanca de etapa), cancelando qualquer fade em andamento.
function hideInfoPanelNow() {
  if (dom.infoPanel) dom.infoPanel.dataset.fadeToken = String((Number(dom.infoPanel.dataset.fadeToken) || 0) + 1);
  setEntityVisible(dom.infoPanel, false);
}

function onIndicatorClick(indicador) {
  if (state.transitioning) return;
  enterTimeline(indicador.key);
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

  // Painel "Como se calcula" acima da Eficiencia.
  const panelY = GAUGE.y + GAUGE.rOut + 0.6;
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
    width: 3.2, height: 1.35,
    material: "color: #0b1322; opacity: 0.94; transparent: true; shader: flat",
  });
  const accent = el("a-plane", {
    width: 3.2, height: 0.05, position: "0 0.65 0.01",
    material: "color: #4cc9f0; shader: flat",
  });
  const titulo = el("a-text", {
    value: "COMO SE CALCULA A EFICIENCIA",
    position: "0 0.44 0.02", width: 3.0, align: "center", color: "#9be7ff", font: "kelsonsans",
  });
  const formula = el("a-text", {
    value: "Eficiencia = Concluintes + (Retidos x prob. de conclusao)",
    position: "0 0.2 0.02", width: 3.0, align: "center", color: "#ffffff", font: "kelsonsans",
  });

  // Sem operadores aritmeticos: a eficiencia NAO e a soma simples dos tres (a formula
  // pondera os retidos). Listamos os valores e mostramos o resultado com "->".
  let resumo = "";
  if (ev != null && co != null && re != null && ef != null) {
    resumo = `Em 2024: conclusao ${fmt(co)}% · evasao ${fmt(ev)}% · retencao ${fmt(re)}%  ->  eficiencia ${fmt(ef)}%`;
  }
  const valores = el("a-text", {
    value: resumo, position: "0 -0.05 0.02", width: 2.8, align: "center",
    color: "#cfe0f4", font: "kelsonsans", "wrap-count": 52,
  });

  const nota = el("a-text", {
    value: "Mais conclusao e menos evasao elevam a eficiencia.\nMais retencao a deprime, pois indica atraso na formacao.",
    position: "0 -0.35 0.02", width: 2.8, align: "center",
    color: "#8da0bb", font: "kelsonsans", "wrap-count": 52,
  });

  panel.append(bg, accent, titulo, formula, valores, nota);
  dom.indicatorLinks.appendChild(panel);
  applyPendingTransforms(panel);
  dom.efficacyPanel = panel;
}

// Mostrar/esconder os conectores visuais.
function showIndicatorLinks(show) {
  if (!dom.indicatorLinks) return;
  if (show) {
    setEntityVisible(dom.indicatorLinks, true);
    dom.indicatorLinks.setAttribute("animation__fade", "property: scale; from: 0.85 0.85 0.85; to: 1 1 1; dur: 280; easing: easeOutBack");
  } else {
    setEntityVisible(dom.indicatorLinks, false);
  }
}

// ----------------------------------------------------------------------------
// Etapa C - Composicao "Para onde vao os alunos" (barras empilhadas + anel).
// ----------------------------------------------------------------------------

const COMP = { x0: -3.0, x1: 1.6, baseY: 1.2, maxH: 1.5, z: -3.3, donutX: 2.5, donutY: 1.95, rIn: 0.34, rOut: 0.55 };
const COMP_COLORS = { concluidos: "#3ad29f", retidos: "#ffd166", evadidos: "#ff6b6b" };
const COMP_NOUN = { concluidos: "concluintes", retidos: "retidos", evadidos: "evadidos" };
const compXFor = (i) => COMP.x0 + i * ((COMP.x1 - COMP.x0) / (DADOS.anos.length - 1));
let compFocusEl = null;

function bindCompControls() {
  // Botao de entrada (na tela de indicadores).
  const enterHit = dom.compEnter.querySelector(".indicator-clickable");
  enterHit.addEventListener("click", () => { if (!state.transitioning) enterComposicao(); });
  enterHit.addEventListener("mouseenter", () => dom.compEnter.setAttribute("animation__h", "property: scale; to: 1.05 1.05 1.05; dur: 150"));
  enterHit.addEventListener("mouseleave", () => dom.compEnter.setAttribute("animation__h", "property: scale; to: 1 1 1; dur: 150"));

  clickable2(dom.compPrev).addEventListener("click", () => stepCompYear(-1));
  clickable2(dom.compNext).addEventListener("click", () => stepCompYear(1));
  clickable2(dom.compBack).addEventListener("click", () => backToIndicators());
  [dom.compPrev, dom.compNext, dom.compBack].forEach((ctrl) => {
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
  setEntityVisible(dom.composicaoView, true);
  setEntityVisible(dom.contextKicker, false);
  setEntityVisible(dom.contextTitle, false);
  setEntityVisible(dom.contextLead, false);

  dom.compTitle.setAttribute("value", `Para onde vao os alunos - ${rotuloContexto(state.context)}`);
  dom.compText.setAttribute("value", compNarrative(state.context));
  dom.compLegend.hidden = false;
  crumb("Mapa", rotuloContexto(state.context), "Indicadores", "Para onde vao os alunos");
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

      // Torre de voxels: DECORATIVA e FORA do subtree clicavel. Como o raycaster do
      // A-Frame mira recursivamente nos elementos .clickable, deixar os 100 voxels fora
      // dele evita testar ~800 meshes por frame; quem captura o clique e so o hitbox.
      // Malha 2x2 x 25 camadas; cada bloco = 1% dos estudantes do ano.
      const layerH = COMP.maxH / 25; // ex.: 1.5/25 = 0.06; bloco com folga = layerH - 0.01
      const tower = el("a-entity", { position: `${x} ${COMP.baseY} ${COMP.z}` });
      for (let j = 0; j < 100; j += 1) {
        const key = j < nConc ? "concluidos" : j < nConc + nRet ? "retidos" : "evadidos";
        const layer = Math.floor(j / 4);
        const pInLayer = j % 4;
        const dx = pInLayer % 2 === 0 ? -0.125 : 0.125;
        const dz = Math.floor(pInLayer / 2) === 0 ? -0.1 : 0.1;
        const dy = layer * layerH + layerH / 2;
        const voxel = el("a-box", {
          width: 0.23, depth: 0.18, height: layerH - 0.01,
          position: `${dx} ${dy} ${dz}`,
          material: `color: ${COMP_COLORS[key]}; roughness: 0.4; metalness: 0.1; emissive: ${COMP_COLORS[key]}; emissiveIntensity: 0.15`,
        });
        tower.appendChild(voxel);
      }
      dom.compScene.appendChild(tower);
      applyPendingTransforms(tower);

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

  // Container do foco (banda + anel) reconstruido a cada ano.
  compFocusEl = el("a-entity", {});
  dom.compScene.appendChild(compFocusEl);
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

  if (m > 0) {
    const fr = { concluidos: c.concluidos[idx] / m, retidos: c.retidos[idx] / m, evadidos: c.evadidos[idx] / m };
    let acc = 0;
    ["concluidos", "retidos", "evadidos"].forEach((key) => {
      const a = fr[key] * 360;
      if (a <= 0.2) { acc += a; return; }
      const arc = el("a-ring", {
        radiusInner: COMP.rIn, radiusOuter: COMP.rOut, position: `${COMP.donutX} ${COMP.donutY} ${COMP.z}`,
        "theta-start": round2(90 - acc - a), "theta-length": round2(a), "segments-theta": 64,
        material: `color: ${COMP_COLORS[key]}; shader: flat; opacity: 0.95; transparent: true`,
      });
      compFocusEl.append(arc);
      applyPendingTransforms(arc);
      acc += a;
    });
    const centerYear = el("a-text", {
      value: String(ano), position: `${COMP.donutX} ${COMP.donutY + 0.07} ${COMP.z + 0.01}`,
      width: 1.9, align: "center", color: "#ffffff", font: "kelsonsans",
    });
    const centerM = el("a-text", {
      value: `${fmtInt(m)} matriculas`, position: `${COMP.donutX} ${COMP.donutY - 0.13} ${COMP.z + 0.01}`,
      width: 1.7, align: "center", color: "#9fb2cc", font: "kelsonsans",
    });
    compFocusEl.append(centerYear, centerM);
    applyPendingTransforms(centerYear);
    applyPendingTransforms(centerM);
    dom.compReadout.setAttribute(
      "value",
      `${ano}: ${fmtInt(c.concluidos[idx])} ${COMP_NOUN.concluidos} · ${fmtInt(c.retidos[idx])} ${COMP_NOUN.retidos} · ${fmtInt(c.evadidos[idx])} ${COMP_NOUN.evadidos}`
    );
  } else {
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
    const connective = `\nFio Causal: a conclusao (${fmt(pc)}%) sofre o peso da evasao (${fmt(pe)}%), puxando a Eficiencia para ${fmt(ef)}%.`;
    dom.compReadout.setAttribute("value", base + connective);
  }
}

// ----------------------------------------------------------------------------
// Etapa 3 - Linha do tempo (grafico anotado + abertura guiada).
// ----------------------------------------------------------------------------

const xFor = (i) => CHART.x0 + i * ((CHART.x1 - CHART.x0) / (DADOS.anos.length - 1));
const yFor = (v) => CHART.baseY + (v / 100) * CHART.maxH;

function enterTimeline(key, skipGuided) {
  state.stage = "timeline";
  state.indicatorKey = key;

  const indicador = indicadorByKey(key);
  setEntityVisible(dom.indicatorView, false);
  setEntityVisible(dom.composicaoView, false);
  hideInfoPanelNow();
  setEntityVisible(dom.timelineView, true);
  dom.compLegend.hidden = true;

  // O cabecalho generico sai de cena: a manchete narrativa (narrativePanel) assume o topo,
  // evitando texto sobreposto ao grafico.
  setEntityVisible(dom.contextKicker, false);
  setEntityVisible(dom.contextTitle, false);
  setEntityVisible(dom.contextLead, false);
  crumb("Mapa", rotuloContexto(state.context), "Indicadores", indicador.label);
  setNota("timeline");
  setChartColor(indicador.cor);
  animateViewIn(dom.timelineView);
  resetMiniMap();

  buildChartGrid();
  buildTimeline();
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

  // Banda de foco (posicionada em updateYear). Escondida ate o primeiro foco.
  dom.focusBand.setAttribute("width", 0.52);
  dom.focusBand.setAttribute("height", CHART.maxH);
  setEntityVisible(dom.focusBand, false);
  setEntityVisible(dom.valueReadout, false);

  // Barras sutis (contexto) + ticks de ano.
  anos.forEach((ano, i) => {
    const v = serie[i];
    if (v != null) {
      const top = yFor(v);
      const h = Math.max(0.02, top - CHART.baseY);
      const bar = el("a-box", {
        class: "bar-visual clickable timeline-clickable", width: 0.36, depth: 0.18, height: h,
        position: `${xFor(i)} ${CHART.baseY + h / 2} ${CHART.z - 0.02}`,
        material: `color: ${indicador.cor}; opacity: 0.18; transparent: true; shader: flat`,
      });
      bar.dataset.idx = String(i);
      bar.addEventListener("click", () => selectYear(i));
      dom.timelineBars.appendChild(bar);
      applyPendingTransforms(bar);
    } else {
      // Mesmo sem barra, mantemos um hitbox clicavel para o ano.
      const hit = el("a-box", {
        class: "clickable timeline-clickable", width: 0.36, depth: 0.18, height: 0.4,
        position: `${xFor(i)} ${CHART.baseY + 0.2} ${CHART.z - 0.02}`,
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
  const cardY = Math.min(yFor(100) - 0.1, y + 0.55);

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
  const ry = v != null ? yFor(v) + 0.32 : CHART.baseY + 0.4;
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
    playDataNote(v, Math.min(...validos), Math.max(...validos));
  }
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
  dom.guidedHint.setAttribute("value", "Explore: navegue pelos anos, compare contextos e ouca a narrativa.");
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

function toggleNarration() {
  if (state.guided) return;
  
  if (state.narrating) {
    stopNarration();
    return;
  }
  const narr = computeNarrative(state.context, state.indicatorKey);
  state.narrating = true;
  dom.ctrlNarrateLabel.setAttribute("value", "Parar");
  
  narrateText(narr.fala, null).then(() => {
    state.narrating = false;
    dom.ctrlNarrateLabel.setAttribute("value", "Narrar");
  });
}

function stopNarration() {
  speechRunId += 1;
  if (window.speechSynthesis) window.speechSynthesis.cancel();
  state.narrating = false;
  if (dom.ctrlNarrateLabel) dom.ctrlNarrateLabel.setAttribute("value", "Narrar");
  setCaption("");
}

function setCaption(text) {
  if (dom.captionText) dom.captionText.setAttribute("value", text);
  if (dom.captionPanel) setEntityVisible(dom.captionPanel, text.length > 0);
}

function narrateText(text, token) {
  return new Promise((resolve) => {
    if (token && token !== state.guidedToken) { resolve(); return; }
    
    const currentRunId = ++speechRunId;
    setCaption(text);
    
    if (!window.speechSynthesis) {
      const ms = Math.max(2500, text.length * 60);
      setTimeout(() => { 
        if (currentRunId === speechRunId) { setCaption(""); resolve(); }
      }, ms);
      return;
    }
    
    const synth = window.speechSynthesis;
    const utter = new SpeechSynthesisUtterance(text);
    utter.lang = "pt-BR";
    utter.rate = 1.0;
    
    utter.onend = () => { if (currentRunId === speechRunId) { setCaption(""); resolve(); } };
    utter.onerror = () => { if (currentRunId === speechRunId) { setCaption(""); resolve(); } };
    
    synth.cancel();
    synth.speak(utter);
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
  
  // C4: Perguntas-guia
  buildGuidedQuestions(cena);

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
    returnToSelection();
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
    dom.guidedHint.setAttribute("value", "Explore: navegue pelos anos, compare contextos e ouca a narrativa.");
    setInteractionMode("timeline");
    // #ctrlSkip fica oculto, mas o raycaster mira pela classe: tira a clicabilidade
    // para evitar clique-fantasma no botao invisivel "Pular introducao".
    setSubtreeClickable(dom.ctrlSkip, false);
    refreshRaycasters();
    crumb("Mapa", rotuloContexto(state.context), "Indicadores", indicadorByKey(state.indicatorKey).label);
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

// C4: Cria as botoes flutuantes (agencia) no fim de uma cena
function buildGuidedQuestions(cena) {
  if (!dom.guidedQuestions) return;
  dom.guidedQuestions.innerHTML = "";
  if (!cena.perguntas || !cena.perguntas.length) {
    setEntityVisible(dom.guidedQuestions, false);
    return;
  }
  setEntityVisible(dom.guidedQuestions, true);
  
  let currentX = - ((cena.perguntas.length - 1) * 3.0) / 2; // centralizar
  cena.perguntas.forEach((p) => {
    const qEntity = el("a-entity", { position: `${currentX} 0 0` });
    const bg = el("a-box", {
      class: "tour-clickable",
      width: 2.8, height: 0.5, depth: 0.08,
      material: "color: #1a2b4c; roughness: 0.4; emissive: #2f5d8a; emissiveIntensity: 0.2"
    });
    const text = el("a-text", {
      value: p.texto, position: "0 0 0.05", width: 2.6, align: "center", color: "#cfe9ff", font: "kelsonsans"
    });
    
    bg.addEventListener("mouseenter", () => setVectorAttribute(qEntity, "scale", "1.05 1.05 1.05"));
    bg.addEventListener("mouseleave", () => setVectorAttribute(qEntity, "scale", "1 1 1"));
    bg.addEventListener("click", () => {
      if (p.irPara !== undefined) tourGoTo(p.irPara);
    });
    
    qEntity.append(bg, text);
    dom.guidedQuestions.append(qEntity);
    applyPendingTransforms(qEntity);
    currentX += 3.0;
  });
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
    
    const sphere = el("a-sphere", {
      radius: 0.04,
      position: `${x} 0 ${z}`,
      material: "color: #cdd9ec; roughness: 0.6",
      "data-type": type
    });
    
    dom.visceralParticles.append(sphere);
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
  clickable(dom.ctrlNarrate).addEventListener("click", () => toggleNarration());
  clickable(dom.ctrlReplay).addEventListener("click", () => replayGuided());
  clickable(dom.ctrlBackIndicators).addEventListener("click", () => backToIndicators());
  clickable(dom.ctrlSkip).addEventListener("click", () => skipGuided());

  [dom.ctrlPrevYear, dom.ctrlNextYear, dom.ctrlCompare, dom.ctrlNarrate, dom.ctrlReplay, dom.ctrlBackIndicators, dom.ctrlSkip].forEach((ctrl) => {
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

  // CTA do fechamento: leva ao mapa para explorar a propria regiao.
  const ctaHit = dom.tourCta.querySelector(".tour-clickable");
  ctaHit.addEventListener("click", () => { if (!state.transitioning) returnToSelection(); });

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
    const icone = el("a-text", {
      value: tour.icone, position: "-0.7 0.22 0.06",
      width: 2.0, align: "left", anchor: "left", color: tour.cor, font: "kelsonsans",
    });
    const titulo = el("a-text", {
      value: tour.titulo, position: "-0.7 0.22 0.06",
      width: 2.4, align: "center", color: "#ffffff", font: "kelsonsans",
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
      class: "hit clickable selection-clickable",
      width: 1.95, height: 1.0, depth: 0.18,
      material: "color: #ffffff; opacity: 0.001; transparent: true",
    });
    card.append(bg, accent, icone, titulo, desc, cenas, hit);
    dom.tourGallery.appendChild(card);
    applyPendingTransforms(card);

    hit.addEventListener("click", () => { if (!state.transitioning) startTour(tourId); });
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

function backToIndicators() {
  if (state.transitioning) return;
  cancelGuided();
  stopNarration();
  state.stage = "indicators";
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
  hit.addEventListener("click", returnToSelection);
}

async function returnToSelection() {
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

  setVectorAttribute(dom.cameraRig, "position", "0 1.6 0");
  setEntityVisible(dom.explorationWorld, false);
  setEntityVisible(dom.selectionWorld, true);
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
  showMapSelection();

  setInteractionMode("selection");
  await fadeFromBlack();
  state.transitioning = false;
}

// ----------------------------------------------------------------------------
// Modo de interacao (protege contra cliques fantasmas em objetos ocultos).
// ----------------------------------------------------------------------------

function setInteractionMode(mode) {
  toggleClickable(".selection-clickable", mode === "selection");
  toggleClickable(".drill-clickable", mode === "drill");
  toggleClickable(".indicator-clickable", mode === "indicators");
  toggleClickable(".timeline-clickable", mode === "timeline");
  toggleClickable(".composicao-clickable", mode === "composicao");
  toggleClickable(".tour-clickable", mode === "tour");
  toggleClickable(".multiplos-clickable", mode === "multiplos");
  toggleClickable(".exploration-clickable", mode === "indicators" || mode === "timeline" || mode === "composicao" || mode === "tour" || mode === "multiplos");
  toggleClickable(".minimap-clickable", mode === "indicators" || mode === "timeline" || mode === "composicao" || mode === "tour");
  refreshRaycasters();
}

function toggleClickable(selector, enabled) {
  document.querySelectorAll(selector).forEach((entity) => {
    entity.classList.toggle("clickable", enabled);
  });
}

// Liga/desliga a clicabilidade de um sub-conjunto de controles da timeline.
// Necessario porque o raycaster mira pela classe .clickable, e nao pela visibilidade:
// esconder o container nao impede o clique nos filhos.
function setSubtreeClickable(root, enabled) {
  root.querySelectorAll(".timeline-clickable").forEach((entity) => {
    entity.classList.toggle("clickable", enabled);
  });
}

// ----------------------------------------------------------------------------
// VR / gaze.
// ----------------------------------------------------------------------------

function bindVrCursorMode() {
  dom.scene.addEventListener("enter-vr", () => {
    setGazeFuse(true);
    dismissOnboarding(); // overlay 2D nao aparece no headset; a placa #roomSign cobre VR
  });
  dom.scene.addEventListener("exit-vr", () => setGazeFuse(false));
  setGazeFuse(false);
  bindDragGuard();
}

// No desktop o giro por mouse fica desativado (look-controls mouseEnabled:false), entao
// mover o mouse apenas aponta (hover) e so um clique deliberado entra. Este guarda e uma
// rede de seguranca extra: se houver arraste (>8px) entre mousedown e mouseup, cancela o
// "click" sintetico do A-Frame, evitando entradas acidentais.
const dragGuard = { x: 0, y: 0, dragged: false };

function bindDragGuard() {
  window.addEventListener(
    "mousedown",
    (e) => { dragGuard.x = e.clientX; dragGuard.y = e.clientY; dragGuard.dragged = false; },
    true
  );
  window.addEventListener(
    "mousemove",
    (e) => {
      if (e.buttons === 0) return;
      const dx = e.clientX - dragGuard.x;
      const dy = e.clientY - dragGuard.y;
      if (dx * dx + dy * dy > 64) dragGuard.dragged = true; // > 8px = arraste
    },
    true
  );
  // Captura na fase de captura: roda antes dos handlers de clique das entidades.
  document.addEventListener(
    "click",
    (e) => {
      if (dragGuard.dragged) {
        e.stopImmediatePropagation();
        e.preventDefault();
      }
    },
    true
  );
}

function setGazeFuse(isEnabled) {
  dom.gazeCursor.setAttribute("cursor", { fuse: isEnabled, fuseTimeout: 850 });
  dom.gazeCursor.setAttribute("raycaster", { enabled: isEnabled, far: 40, interval: 16, objects: ".clickable" });
  dom.gazeCursor.setAttribute("material", "opacity", isEnabled ? 0.9 : 0.5);
  // O reticulo central so faz sentido em VR (gaze). No desktop o ponteiro e o mouse.
  setEntityVisible(dom.gazeCursor, isEnabled);
  refreshRaycasters();
}

// ----------------------------------------------------------------------------
// Transicoes.
// ----------------------------------------------------------------------------

async function fadeToBlack() {
  dom.transitionOverlay.classList.add("is-active");
  fadeVR(1);
  await wait(650);
}

async function fadeFromBlack() {
  dom.transitionOverlay.classList.remove("is-active");
  fadeVR(0);
  await wait(680);
  setEntityVisible(dom.vrFade, false);
}

function fadeVR(opacity) {
  const from = opacity === 1 ? 0 : 1;
  setEntityVisible(dom.vrFade, true);
  dom.vrFade.setAttribute("material", "opacity", from);
  dom.vrFade.setAttribute("animation__fade", {
    property: "material.opacity", from, to: opacity, dur: 620, easing: "easeInOutQuad",
  });
}

// ----------------------------------------------------------------------------
// Utilidades de dados.
// ----------------------------------------------------------------------------

function indicadorByKey(key) {
  return DADOS.indicadores.find((i) => i.key === key);
}

function latestValue(serie) {
  for (let i = serie.length - 1; i >= 0; i -= 1) {
    if (serie[i] != null) return serie[i];
  }
  return null;
}

function lastValidIndex(serie) {
  for (let i = serie.length - 1; i >= 0; i -= 1) {
    if (serie[i] != null) return i;
  }
  return serie.length - 1;
}

function extremos(serie) {
  let peakIdx = -1;
  let valleyIdx = -1;
  let max = -Infinity;
  let min = Infinity;
  serie.forEach((v, i) => {
    if (v == null) return;
    if (v > max) { max = v; peakIdx = i; }
    if (v < min) { min = v; valleyIdx = i; }
  });
  return { peakIdx, valleyIdx };
}

function resolveCompareContext(ctx) {
  if (ctx.tipo === "instituicao") return state.parentRegion || DADOS.brasil;
  if (ctx.tipo === "regiao") return DADOS.brasil;
  return null;
}

function rotuloContexto(ctx) {
  if (!ctx) return "";
  if (ctx.tipo === "brasil") return "Brasil";
  if (ctx.tipo === "regiao") return `Regiao ${ctx.nome}`;
  return ctx.nome;
}

function rotuloCurto(ctx) {
  if (!ctx) return "";
  if (ctx.tipo === "brasil") return "Brasil";
  if (ctx.tipo === "regiao") return ctx.nome;
  return ctx.sigla || ctx.nome;
}

function clampIdx(value, length) {
  return Math.max(0, Math.min(length - 1, value));
}

function fmt(value) {
  if (value == null) return "-";
  return (Math.round(value * 10) / 10).toFixed(1).replace(".", ",");
}

function clickable(controlEntity) {
  return controlEntity.querySelector(".timeline-clickable");
}

// ----------------------------------------------------------------------------
// Layout de cards.
// ----------------------------------------------------------------------------

function arcPositions(n, radius, spreadDeg, y) {
  const positions = [];
  for (let i = 0; i < n; i += 1) {
    const t = n === 1 ? 0 : i / (n - 1) - 0.5;
    const angle = (t * spreadDeg * Math.PI) / 180;
    const x = Math.sin(angle) * radius;
    const z = -Math.cos(angle) * radius;
    const rotY = (-t * spreadDeg) / 1.4;
    positions.push({ position: `${round2(x)} ${y} ${round2(z)}`, rotation: `0 ${round2(rotY)} 0` });
  }
  return positions;
}

function gridPositions(n, cols, gapX, gapY, topY, z) {
  const positions = [];
  for (let i = 0; i < n; i += 1) {
    const col = i % cols;
    const row = Math.floor(i / cols);
    const rowCount = Math.min(cols, n - row * cols);
    const x = (col - (rowCount - 1) / 2) * gapX;
    const y = topY - row * gapY;
    positions.push({ position: `${round2(x)} ${round2(y)} ${z}`, rotation: "0 0 0" });
  }
  return positions;
}

function round2(value) {
  return Math.round(value * 100) / 100;
}

// ----------------------------------------------------------------------------
// Criacao de elementos A-Frame (com reaplicacao explicita de transform).
// ----------------------------------------------------------------------------

function el(tagName, attributes = {}) {
  const element = document.createElement(tagName);
  Object.entries(attributes).forEach(([name, value]) => {
    if (name === "class") {
      String(value).split(" ").filter(Boolean).forEach((c) => element.classList.add(c));
      return;
    }
    const normalizedName = name.replace(/[A-Z]/g, (m) => `-${m.toLowerCase()}`);
    if (["position", "rotation", "scale"].includes(normalizedName)) {
      const vector = parseVector(value);
      if (vector) {
        element.dataset[`vr${capitalize(normalizedName)}`] = `${vector.x} ${vector.y} ${vector.z}`;
      }
      setVectorAttribute(element, normalizedName, value);
      return;
    }
    element.setAttribute(normalizedName, value);
  });
  return element;
}

function setVectorAttribute(element, name, value) {
  const vector = parseVector(value);
  if (!vector) {
    element.setAttribute(name, value);
    return;
  }
  element.setAttribute(name, `x: ${vector.x}; y: ${vector.y}; z: ${vector.z}`);
  applyObject3DVector(element, name, vector);
}

function parseVector(value) {
  if (value && typeof value === "object") return value;
  if (typeof value !== "string") return value;
  const parts = value.trim().split(/\s+/).map((p) => Number(p));
  if (parts.length !== 3 || parts.some((p) => Number.isNaN(p))) return null;
  return { x: parts[0], y: parts[1], z: parts[2] };
}

function applyPendingTransforms(root) {
  const targets = [
    root,
    ...root.querySelectorAll("[data-vr-position], [data-vr-rotation], [data-vr-scale]"),
  ];
  const applyAll = () => {
    targets.forEach((target) => {
      if (target.dataset.vrPosition) setVectorAttribute(target, "position", target.dataset.vrPosition);
      if (target.dataset.vrRotation) setVectorAttribute(target, "rotation", target.dataset.vrRotation);
      if (target.dataset.vrScale) setVectorAttribute(target, "scale", target.dataset.vrScale);
    });
  };
  applyAll();
  requestAnimationFrame(applyAll);
}

function applyObject3DVector(element, name, vector) {
  if (!element.object3D) return;
  if (name === "position") { element.object3D.position.set(vector.x, vector.y, vector.z); return; }
  if (name === "scale") { element.object3D.scale.set(vector.x, vector.y, vector.z); return; }
  if (name === "rotation") {
    const toRad = Math.PI / 180;
    element.object3D.rotation.set(vector.x * toRad, vector.y * toRad, vector.z * toRad);
  }
}

function setEntityVisible(entity, isVisible) {
  entity.setAttribute("visible", isVisible);
  const apply = () => { if (entity.object3D) entity.object3D.visible = isVisible; };
  apply();
  requestAnimationFrame(apply);
}

function setObjectGlow(entity, color, intensity) {
  if (!entity.object3D) return;
  entity.object3D.traverse((object) => {
    if (!object.material) return;
    if (object.material.emissive) object.material.emissive.set(color);
    if ("emissiveIntensity" in object.material) object.material.emissiveIntensity = intensity;
    object.material.needsUpdate = true;
  });
}

function refreshRaycasters() {
  requestAnimationFrame(() => {
    document.querySelectorAll("[raycaster]").forEach((entity) => {
      const component = entity.components?.raycaster;
      if (component) component.refreshObjects();
    });
  });
}

function wait(ms) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

function capitalize(value) {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function shadeColor(hex, percent) {
  const normalized = hex.replace("#", "");
  const amount = Math.round(2.55 * percent);
  const red = clamp(parseInt(normalized.slice(0, 2), 16) + amount);
  const green = clamp(parseInt(normalized.slice(2, 4), 16) + amount);
  const blue = clamp(parseInt(normalized.slice(4, 6), 16) + amount);
  return `#${toHex(red)}${toHex(green)}${toHex(blue)}`;
}

function clamp(value) {
  return Math.max(0, Math.min(255, value));
}

function toHex(value) {
  return value.toString(16).padStart(2, "0");
}

// ----------------------------------------------------------------------------
// Small Multiples (Comparacao Regional)
// ----------------------------------------------------------------------------

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
      }
    });
    bg.addEventListener("mouseenter", () => {
      btn.setAttribute("animation__hover", "property: scale; to: 1.05 1.05 1.05; dur: 150");
    });
    bg.addEventListener("mouseleave", () => {
      btn.setAttribute("animation__hover", "property: scale; to: 1 1 1; dur: 150");
    });
    
    dom.multiplosSelectors.appendChild(btn);
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
    dom.multiplosTitle.setAttribute("value", `${indDef.label} por regiao (2024): ${maxReg.ctx.nome} ${pontaStr} (${fmt(maxReg.val)}%), ${minReg.ctx.nome} ${baseStr} (${fmt(minReg.val)}%) — ${diff} pp de diferenca.`);
  } else {
    dom.multiplosTitle.setAttribute("value", `${indDef.label} por regiao (2024)`);
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
  });
  
  crumb("Mapa", "Comparar regioes", indDef.label);
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

