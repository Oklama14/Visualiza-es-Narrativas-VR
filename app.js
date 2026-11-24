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

// Fonte 3D LOCAL: Poppins MSDF, a mesma da versao minimalista (assets/). As
// fontes de estoque do A-Frame (kelsonsans) vinham de cdn.aframe.io: sem
// internet - no Quest, numa rede sem saida - todo o texto 3D sumia. E a
// kelsonsans so tem ASCII: "·", "—", "IF SERTÃO-PE", "UFRN - MÚSICA" perdiam
// letras sem aviso. A Poppins tem o Latin-1 completo. `line-height: 60`
// mantem a altura de linha da kelsonsans (2,1 x a largura de um digito), para
// os blocos de texto continuarem do mesmo tamanho. `shader: msdf` e
// `negate: false` sao obrigatorios para este atlas (ver versao-minimalista).
const FONTE = "assets/poppins-msdf.json";
const FONTE_3D = { font: FONTE, shader: "msdf", negate: false, "line-height": 60 };

// Geometria do grafico (coordenadas no mundo, dentro do ambiente escuro).
const CHART = {
  x0: -3.0,
  x1: 3.0,
  baseY: 1.15, // mais baixo: marcadores ficam proximos da altura dos olhos (1.6)
  maxH: 1.3, // topo em 2,45: sobra faixa para a etiqueta 2020 abaixo do topo do painel (2,74)
  z: -3.3, // barras/linha/marcadores ficam a frente do painel (-3.4)
  topoPainel: 2.74, // topo do #chartPanel (index.html): teto dos cartoes e da etiqueta
};

// Grade do small multiples. As faixas verticais foram calculadas para caber na
// "banda segura" da tela (entre o painel HUD do topo e a nota do rodape), com
// folga entre cabecalho -> seletores -> grade -> legenda (sem texto encavalado).
const MULTIPLOS = {
  cols: 3,
  rows: 2,
  w: 1.8,
  h: 0.96,
  x: [-1.95, 0, 1.95],
  y: [1.88, 0.8],
  z: -3.9,
  // Layout interno de cada painel (coordenadas locais).
  headerY: 0.33, // linha do nome + valor
  chartTop: 0.16, // 100%
  chartBottom: -0.36, // 0%
  chartPadX: 0.2,
};

// Frase completa do "abismo" regional: fica no HUD 2D (subtitulo) e e restaurada
// depois do hover em um painel. No 3D exibimos apenas a versao curta (1 linha).
let multiplosSubtitle = "Comparacao em mesma escala";

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
  history: [],        // pilha de navegacao: cada avanco empilha a tela atual; "Voltar" desempilha
  usingControllers: false, // VR: ha um controle Touch conectado (laser assume a mira)
  vrInput: null, // VR: "controle" | "mao" | "olhar" (ver atualizarModoEntrada)
  activeHand: "right", // VR: mao do controle Touch com o laser ativo (laser unico)
  vrNotaOpen: false, // VR: painel "Como ler" aberto/recolhido no mundo
  seatedMode: false, // VR: compensacao de altura ativa para uso sentado
  vrHeightOffset: 0, // VR: deslocamento vertical (m) aplicado ao #cameraRig
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
    "scene", "camera", "selectionWorld", "explorationWorld", "drillCards",
    "drillBack", "indicatorView", "indicatorObjects", "infoPanel", "infoTitle",
    "infoValue", "infoDescription", "infoAccent", "infoHint", "contextKicker",
    "contextTitle", "contextLead", "timelineView",
    "chartGlow", "chartGrid", "focusBand", "timelineBars",
    "compareBars", "trendLine", "markers", "yearTicks", "annotations",
    "valueReadout", "narrativeTitle", "narrativeText", "narrativeYear",
    "guidedHint", "scrubberRow", "actionRow", "ctrlPrevYear", "ctrlNextYear",
    "ctrlYearLabel", "ctrlCompare", "ctrlCompareLabel", "ctrlNarrate",
    "ctrlNarrateLabel", "ctrlReplay", "ctrlBackIndicators", "ctrlSkip",
    "backButton", "selectionTitle", "selectionLead", "selectionKicker",
    "transitionOverlay", "vrFade", "gazeCursor", "cameraRig", "hudTitle",
    "hudSubtitle", "hudLegend", "legendPrimary", "legendCompare", "stageSpot",
    "notaTitle", "notaBody", "notaPanel",
    "compEnter", "composicaoView", "compScene",
    "compTitle", "compText", "compReadout", "compYearLabel",
    "compPrev", "compNext", "compBack", "compLegend", "compScrubber",
    "onboardOverlay", "onboardStart", "helpBtn",
    "mapKicker", "mapTitle", "mapView", "mapHotspots", "brasilBtn",
    "brasilEfic", "mapPreview", "mapPrevTitle", "mapPrevVals", "mapPrevComment",
    "tourGallery", "tourControls", "tourPrevBtn", "tourNextBtn", "tourNextLabel",
    "tourProgress", "tourBar", "tourBarFill", "tourBarStep", "tourBarLabel",
    "tourPanel", "tourPanelKicker", "tourPanelTitle", "tourPanelBody", "tourCta",
    "roomSign", "roomSignBody", "breadcrumb",
    "miniMapBase", "miniMapTab", "miniMapContent", "miniMapHotspots", "miniBrasilBtn",
    "indicatorLinks", "efficacyPanel",
    "multiplosBtn", "multiplosView", "multiplosTitle", "multiplosNote", "multiplosLegend", "multiplosSelectors", "multiplosGrid",
    "guidedQuestions", "captionPanel", "captionText", "visceralParticles",
    "vrHud", "vrCrumb", "vrNotaTab", "vrNotaTabLabel", "vrNotaCard", "vrNotaTitle", "vrNotaBody",
    "vrAlturaBtn", "vrAlturaLabel", "legenda2d",
    "compareLegend3d", "compareLegendDotPrimary", "compareLegendPrimary3d", "compareLegendCompare3d", "compLegend3d",
  ];
  ids.forEach((id) => (dom[id] = document.getElementById(id)));

  initOnboarding();
  bindNota();

  loadData()
    .then(() => {
      if (dom.scene.hasLoaded) initExperience();
      else dom.scene.addEventListener("loaded", initExperience);
    })
    .catch((error) => {
      console.error("Falha ao carregar dados.json:", error);
      dom.hudTitle.textContent = "Erro ao carregar os dados";
      dom.hudSubtitle.textContent = "Verifique se dados.json esta no servidor.";
      const o = document.getElementById("loadingOverlay");
      if (o) {
        o.classList.add("is-error");
        const t = document.getElementById("loadingText");
        if (t) t.textContent = "Erro ao carregar os dados. Rode via servidor local (node server.js) e recarregue.";
      }
    });

  // Se ainda estiver carregando apos 15s, provavelmente o A-Frame nao carregou
  // (offline sem a copia local) — aponta o ajuste exato.
  window.setTimeout(() => {
    const o = document.getElementById("loadingOverlay");
    if (o && !o.hidden && !o.classList.contains("is-error")) {
      const t = document.getElementById("loadingText");
      if (t) t.textContent = "Ainda carregando… se estiver offline, salve assets/aframe-1.5.0.min.js no projeto.";
    }
  }, 15000);
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
  bindVrHudControls();
  bindVrCursorMode();
  atualizarInstrucoesEntrada();
  setNota("selecao");
  setInteractionMode("selection");
  hideLoading(); // cena + dados prontos: remove o indicador de carregamento.
}

function hideLoading() {
  const o = document.getElementById("loadingOverlay");
  if (o) o.hidden = true;
}

// A nota "Como ler" abre ao entrar em cada etapa e se recolhe sozinha (so o
// titulo, como um chip no rodape) depois de NOTA_ABERTA_MS - a ideia do
// "is-dimmed" da versao minimalista. Aberta o tempo todo, ela cobria os
// controles do canto inferior esquerdo (ano <, medidor da esquerda, "<
// Anterior" do tour). O mouse por cima (ou o foco do teclado) abre de novo.
const NOTA_ABERTA_MS = 10000;
let notaTimer = null;

function abrirNota(fecharEmMs) {
  if (!dom.notaPanel) return;
  dom.notaPanel.classList.remove("is-recolhida");
  clearTimeout(notaTimer);
  if (fecharEmMs) notaTimer = setTimeout(() => dom.notaPanel.classList.add("is-recolhida"), fecharEmMs);
}

function bindNota() {
  if (!dom.notaPanel) return;
  dom.notaPanel.addEventListener("mouseenter", () => {
    dom.notaPanel.classList.add("por-mouse");
    abrirNota(0);
  });
  dom.notaPanel.addEventListener("mouseleave", () => {
    dom.notaPanel.classList.remove("por-mouse");
    abrirNota(1200);
  });
  dom.notaPanel.addEventListener("focus", () => abrirNota(0));
  dom.notaPanel.addEventListener("blur", () => abrirNota(1200));
}

function setNota(chave) {
  const nota = NOTAS[chave];
  if (!nota) return;
  const mudou = dom.notaTitle.textContent !== nota.titulo;
  dom.notaTitle.textContent = nota.titulo;
  dom.notaBody.textContent = nota.corpo;
  if (mudou) abrirNota(NOTA_ABERTA_MS);
  if (dom.vrNotaTitle) dom.vrNotaTitle.setAttribute("value", nota.titulo); // espelho 3D p/ VR
  if (dom.vrNotaBody) dom.vrNotaBody.setAttribute("value", nota.corpo);
}

// Trilha de navegacao (wayfinding) no HUD.
function crumb(...parts) {
  const trilha = parts.filter(Boolean).join("  ›  ");
  if (dom.breadcrumb) dom.breadcrumb.textContent = trilha;
  // espelho 3D p/ VR: a fonte 3D nao tem o "›" (a letra sumia); a seta tem.
  if (dom.vrCrumb) textoUmaLinha(dom.vrCrumb, parts.filter(Boolean).join("  →  "), 44);
}

// Entrada animada de uma etapa: sobe e assenta (easeOut), dando continuidade
// (object constancy) em vez de um corte seco ao trocar de sub-modo.
function animateViewIn(viewEl) {
  if (!viewEl) return;
  viewEl.removeAttribute("animation__in");
  setVectorAttribute(viewEl, "position", "0 -0.12 0");
  proximoQuadro(() => {
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
}

// ----------------------------------------------------------------------------
// Etapa 1 - Selecao de contexto (mapa do Brasil) e drill-down por instituicao.
// ----------------------------------------------------------------------------

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
      pushHistory(); // vindo do drill -> guarda a tela de drill para o "Voltar".
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
  state.history = []; // voltou ao mapa: zera a pilha de navegacao.
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
  { id: "norte", x: -0.331, y: 0.649, w: 1.15, h: 0.7 },
  { id: "nordeste", x: 0.819, y: 0.374, w: 0.52, h: 0.62 },
  { id: "centro-oeste", x: -0.003, y: -0.072, w: 0.6, h: 0.64 },
  { id: "sudeste", x: 0.584, y: -0.346, w: 0.52, h: 0.45 },
  { id: "sul", x: 0.14, y: -0.886, w: 0.34, h: 0.45 },
];
let regionRanks = null;

function buildMapa() {
  dom.mapHotspots.innerHTML = "";
  computeRegionRanks();

  const efB = latestValue(DADOS.brasil.series.eficiencia);
  dom.brasilEfic.setAttribute("value", efB == null ? "" : `Eficiencia ${fmt(efB)}%`);
  const bHit = dom.brasilBtn.querySelector(".selection-clickable");
  bHit.addEventListener("click", () => { if (!state.transitioning) { pushHistory(); state.parentRegion = null; enterIndicators(DADOS.brasil); } });
  bHit.addEventListener("mouseenter", () => dom.brasilBtn.setAttribute("animation__h", "property: scale; to: 1.06 1.06 1.06; dur: 150"));
  bHit.addEventListener("mouseleave", () => dom.brasilBtn.setAttribute("animation__h", "property: scale; to: 1 1 1; dur: 150"));

  if (dom.multiplosBtn) {
    const mHit = dom.multiplosBtn.querySelector(".selection-clickable");
    if (mHit) {
      mHit.addEventListener("click", () => { if (!state.transitioning) { pushHistory(); enterMultiplos("eficiencia"); } });
      mHit.addEventListener("mouseenter", () => dom.multiplosBtn.setAttribute("animation__h", "property: scale; to: 1.06 1.06 1.06; dur: 150"));
      mHit.addEventListener("mouseleave", () => dom.multiplosBtn.setAttribute("animation__h", "property: scale; to: 1 1 1; dur: 150"));
    }
  }

  MAP_HOTSPOTS.forEach((h) => {
    const reg = DADOS.regioes.find((r) => r.id === h.id);
    if (!reg) return;
    const hs = el("a-plane", {
      class: "hit clickable selection-clickable", width: h.w, height: h.h,
      position: `${h.x} ${h.y} 0.02`, material: "color: #ffffff; opacity: 0.001; transparent: true; depthWrite: false",
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
      position: `${h.x} ${h.y} 0.02`, material: "color: #ffffff; opacity: 0.001; transparent: true; depthWrite: false",
    });
    hs.dataset.region = h.id;
    hs.addEventListener("click", () => onMiniMapClick(reg));
    dom.miniMapHotspots.appendChild(hs);
    applyPendingTransforms(hs);
  });
}

// Mini-mapa sob demanda: aba recolhida por padrao; abre num tamanho usavel.
// Aberto, vem para a frente (z -2,3): em -3,0 o medidor da direita (z -2,7)
// ficava na frente dele e tapava o botao "Visao Nacional".
const MINI_MAPA = {
  aberto: { pos: "2.25 1.6 -2.3", esc: "0.55 0.55 0.55" },
  fechado: { pos: "3.9 2.7 -3.1", esc: "0.42 0.42 0.42" },
};

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
  dom.miniMapBase.setAttribute("animation__pos", `property: position; to: ${MINI_MAPA.aberto.pos}; dur: 240; easing: easeOutQuad`);
  dom.miniMapBase.setAttribute("animation__scale", `property: scale; to: ${MINI_MAPA.aberto.esc}; dur: 240; easing: easeOutQuad`);
  refreshRaycasters();
}

function closeMiniMap() {
  state.miniMapOpen = false;
  setEntityVisible(dom.miniMapContent, false);
  setEntityVisible(dom.miniMapTab, true);
  dom.miniMapContent.querySelectorAll(".minimap-region").forEach((e) => e.classList.remove("clickable"));
  dom.miniMapBase.setAttribute("animation__pos", `property: position; to: ${MINI_MAPA.fechado.pos}; dur: 200; easing: easeOutQuad`);
  dom.miniMapBase.setAttribute("animation__scale", `property: scale; to: ${MINI_MAPA.fechado.esc}; dur: 200; easing: easeOutQuad`);
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
  atualizarLegendaComparacao();

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
  // Largura do bloco = largura util do card (1,08 - margem). Com width 1,6 o
  // bloco era mais largo que o card: siglas longas ("UFTM - CEFORES") passavam
  // da borda e encostavam no nome do card vizinho.
  const titulo = el("a-text", {
    value: nome, position: "0 0.05 0.05", width: 0.98, align: "center",
    color: "#ffffff", ...FONTE_3D, "wrap-count": 15,
  });
  const valor = el("a-text", {
    value: eficiencia == null ? "s/ dados" : `${fmt(eficiencia)}%`,
    position: item.inconsistente ? "0 -0.16 0.05" : "0 -0.19 0.05", width: 1.15, align: "center",
    color: "#9be7ff", ...FONTE_3D,
  });
  const aviso = item.inconsistente
    ? el("a-text", {
        value: "* sob revisao", position: "0 -0.26 0.05", width: 0.95,
        align: "center", color: "#ffb454", ...FONTE_3D,
      })
    : null;
  const hit = el("a-box", {
    class: "hit clickable drill-clickable", width: 1.12, height: 0.64, depth: 0.16,
    material: "color: #ffffff; opacity: 0.001; transparent: true; depthWrite: false",
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
  // try/finally: se qualquer passo lancar, a flag precisa voltar a false, senao
  // TODA a interacao fica bloqueada (os handlers checam state.transitioning) e a
  // cena parece "morta" sem nenhum erro visivel na tela.
  try {
    cancelGuided();
    await fadeToBlack();

    state.context = ctx;
    state.stage = "indicators";
    state.indicatorKey = null;
    state.compareOn = false;
    state.compareContext = resolveCompareContext(ctx);

    resetCameraRig();
    setEntityVisible(dom.selectionWorld, false);
    setEntityVisible(dom.explorationWorld, true);
    setEntityVisible(dom.timelineView, false);
    setEntityVisible(dom.composicaoView, false);
    setEntityVisible(dom.multiplosView, false);
    setEntityVisible(dom.tourPanel, false);
    setEntityVisible(dom.indicatorView, true);
    hideInfoPanelNow();
    atualizarLegendaComparacao();
    dom.compLegend.hidden = true;

    populateIndicators(ctx);
    setInteractionMode("indicators");
    await fadeFromBlack();
  } finally {
    state.transitioning = false;
  }
}

function populateIndicators(ctx) {
  dom.indicatorObjects.innerHTML = "";
  // O cabecalho generico volta a aparecer no modo indicadores.
  setEntityVisible(dom.contextKicker, true);
  setEntityVisible(dom.contextTitle, true);
  setEntityVisible(dom.contextLead, true);
  dom.contextKicker.setAttribute("value", "INDICADORES EM 2024");
  // Nomes longos ("Centro Federal de Educacao Tecnologica Celso Suckow da
  // Fonseca") quebravam em 2 linhas e a de baixo caia em cima do texto-guia.
  textoUmaLinha(dom.contextTitle, rotuloContexto(ctx), 40);
  dom.contextLead.setAttribute("value", instrucoesDoModo().contextLead);
  crumb("Mapa", rotuloTrilha(ctx), "Indicadores");
  // O titulo do HUD acompanha o contexto (antes ficava o da tela anterior:
  // "Escolha uma regiao", ou a regiao do drill quando se escolhia uma instituicao).
  dom.hudTitle.textContent = rotuloTrilha(ctx);
  dom.hudSubtitle.textContent = "Escolha um indicador para ver a linha do tempo";
  setNota("indicadores");

  DADOS.indicadores.forEach((indicador, index) => {
    const obj = createIndicatorObject(indicador, ctx, index);
    dom.indicatorObjects.appendChild(obj);
    applyPendingTransforms(obj);
  });
  // No tour a faixa de baixo e dos controles do tour (Anterior/Proximo): o
  // botao "Para onde vao os alunos" ficava em cima do contador "5 / 6".
  setEntityVisible(dom.compEnter, !state.tourActive);
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
    // Gira em torno da propria normal (Z local), deitado no piso. Com "to: -90 360 0"
    // o giro era em Y ANTES do -90 em X (ordem XYZ do Euler): o anel se levantava e
    // varria, em pe, ate ~0,5 m de altura - passando por tras dos rotulos dos
    // medidores e na frente do mini-mapa aberto.
    animation__spin: `property: rotation; from: -90 0 0; to: -90 0 360; dur: ${18000 + index * 1500}; loop: true; easing: linear`,
  });
  // Haste do pedestal ate logo abaixo do rotulo. Antes ela subia ate o medidor
  // e atravessava o meio do rotulo ("Taxa de Evasao" cortado por uma barra).
  const labelY = GAUGE.y - GAUGE.rOut - 0.14;
  const standH = labelY - 0.1 - 0.08;
  const stand = el("a-cylinder", {
    radius: 0.028, height: round2(standH), position: `0 ${round2(0.08 + standH / 2)} 0`,
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
    width: 2.5, align: "center", color: "#ffffff", ...FONTE_3D,
  });
  const unidade = el("a-text", {
    value: latest == null ? "sem dados" : "em 2024", position: `0 ${GAUGE.y - 0.16} 0.02`,
    width: 1.4, align: "center", color: "#9fb2cc", ...FONTE_3D,
  });
  // Uma linha so (wrap 24): com wrap 18, "Eficiencia Academica" quebrava em 2
  // linhas e a de cima encostava no arco do medidor.
  const label = el("a-text", {
    class: "point-label", value: indicador.label, position: `0 ${round2(labelY)} 0.03`,
    width: 1.5, align: "center", color: "#cdd9ec", ...FONTE_3D, "wrap-count": 24,
  });

  // Hitbox cobrindo o medidor (do pedestal ao topo). Todo hitbox invisivel
  // (opacidade 0,001) leva depthWrite: false: ele e transparente e, desenhado
  // antes do numero e do arco, gravava profundidade na face da frente e os
  // apagava (com a ordenacao dos transparentes por distancia, sortTransparentObjects).
  const topo = GAUGE.y + GAUGE.rOut + 0.2;
  const hit = el("a-box", {
    class: "clickable indicator-clickable", width: 1.35, height: topo, depth: 0.5,
    position: `0 ${topo / 2} 0`, material: "color: #ffffff; opacity: 0.001; transparent: true; depthWrite: false",
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

  // A4: o painel-equacao (relacao causal) NAO abre no hover — ele so aparece nas
  // cenas de tour com `showLinks`. No hover fica apenas o painel interpretativo,
  // igual aos outros medidores (comportamento consistente e sem poluicao visual).
}

// A linha de instrucao (contextLead) fica na mesma faixa de tela do painel
// interpretativo: escondemos uma enquanto a outra aparece.
function setLeadVisible(visivel) {
  if (!dom.contextLead) return;
  if (visivel && (state.stage !== "indicators" || state.tourActive)) return;
  setEntityVisible(dom.contextLead, visivel);
}

function showInfoPanel(indicador) {
  const latest = latestValue(state.context.series[indicador.key]);
  setLeadVisible(false);
  setEntityVisible(dom.infoPanel, true);
  setVectorAttribute(dom.infoPanel, "scale", "0.78 0.78 0.78");
  dom.infoPanel.setAttribute("animation__open", "property: scale; to: 0.85 0.85 0.85; dur: 260; easing: easeOutBack");
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
  function step() {
    if (String(token) !== entity.dataset.fadeToken) return; // cancelado
    const t = Math.min(1, (performance.now() - start) / dur);
    const k = show ? t : 1 - t;
    planes.forEach((p) => p.setAttribute("material", "opacity", (Number(p.dataset.baseOp) || 1) * k));
    texts.forEach((tx) => tx.setAttribute("text", "opacity", k));
    if (t < 1) proximoQuadro(step);
    else if (!show) setEntityVisible(entity, false);
  }
  proximoQuadro(step);
}

function fadeInfoPanel(show) {
  fadeEntity(dom.infoPanel, show);
}

function hideInfoPanel() {
  if (dom.infoPanel.object3D && dom.infoPanel.object3D.visible) fadeEntity(dom.infoPanel, false);
  setLeadVisible(true);
}

// Esconde na hora (mudanca de etapa), cancelando qualquer fade em andamento.
function hideInfoPanelNow() {
  if (dom.infoPanel) dom.infoPanel.dataset.fadeToken = String((Number(dom.infoPanel.dataset.fadeToken) || 0) + 1);
  setEntityVisible(dom.infoPanel, false);
}

function onIndicatorClick(indicador) {
  if (state.transitioning) return;
  pushHistory(); // vindo dos indicadores -> "Voltar" retorna aos gauges.
  enterTimeline(indicador.key);
}

// ----------------------------------------------------------------------------
// A4: Relacao causal Conclusao/Evasao/Retencao -> Eficiencia.
//
// Antes eram linhas 3D ligando os medidores; o traçado Evasao -> Eficiencia
// passava exatamente por cima do medidor de Conclusao (o ponto medio coincide
// com a posicao dele) e o painel "como se calcula" cobria o cabecalho da cena.
// Agora a relacao vira um PAINEL-EQUACAO compacto acima dos medidores:
// tres chips de fator (com o efeito: eleva / reduz / deprime) + resultado.
// Usado apenas nas cenas de tour com `showLinks` (nao aparece no hover).
// ----------------------------------------------------------------------------

// Geometria do painel-equacao (mundo). Fica entre o topo dos medidores (~2,23)
// e o topo do campo de visao, sem competir com o cabecalho de contexto (que e
// ocultado nessas cenas).
// Mais estreito (5,5) e um pouco mais baixo (2,86): com 6,2 de largura o chip
// da esquerda ficava por baixo do painel do HUD 2D (canto superior esquerdo).
const CAUSAL = {
  y: 2.86, z: -3.5, w: 5.5, h: 1.04,
  chipW: 1.08, chipH: 0.52, chipGap: 0.06,
  resW: 1.4, margem: 0.12,
};

// Efeito de cada fator sobre a eficiencia (texto + cor do rotulo).
const CAUSAL_EFEITO = {
  conclusao: { verbo: "ELEVA", cor: "#65e4b8" },
  evasao: { verbo: "REDUZ", cor: "#ff8e8e" },
  retencao: { verbo: "DEPRIME", cor: "#ffe088" },
};

// Constroi o painel dentro de #indicatorLinks (mantido oculto ate o tour pedir).
// Chamado em populateIndicators, depois de criar os medidores.
function buildIndicatorLinks() {
  if (!dom.indicatorLinks) return;
  dom.indicatorLinks.innerHTML = "";
  dom.efficacyPanel = null;

  const ctx = state.context;
  if (!ctx) return;

  const panel = el("a-entity", {
    id: "efficacyPanel",
    position: `0 ${CAUSAL.y} ${CAUSAL.z}`,
  });

  const bg = el("a-plane", {
    width: CAUSAL.w, height: CAUSAL.h,
    material: "color: #0b1322; opacity: 0.94; transparent: true; shader: flat",
  });
  const accent = el("a-plane", {
    width: CAUSAL.w, height: 0.045, position: `0 ${round2(CAUSAL.h / 2 - 0.022)} 0.01`,
    material: "color: #4cc9f0; shader: flat",
  });
  const kicker = el("a-text", {
    value: "COMO A EFICIENCIA SE FORMA", position: `0 ${round2(CAUSAL.h / 2 - 0.15)} 0.02`,
    width: 3.4, align: "center", color: "#9be7ff", ...FONTE_3D,
  });
  panel.append(bg, accent, kicker);

  // Chips dos tres fatores + chip do resultado, numa unica linha.
  const fatores = ["conclusao", "evasao", "retencao"];
  const passo = CAUSAL.chipW + CAUSAL.chipGap;
  const x0 = -CAUSAL.w / 2 + CAUSAL.margem + CAUSAL.chipW / 2; // primeiro chip
  const chipY = -0.02;

  fatores.forEach((key, i) => {
    const ind = indicadorByKey(key);
    if (!ind) return;
    const efeito = CAUSAL_EFEITO[key];
    const valor = latestValue(ctx.series[key]);
    const cx = x0 + i * passo;

    const chipBg = el("a-plane", {
      width: CAUSAL.chipW, height: CAUSAL.chipH, position: `${round2(cx)} ${chipY} 0.02`,
      material: "color: #101c30; opacity: 0.95; transparent: true; shader: flat",
    });
    const chipTop = el("a-plane", {
      width: CAUSAL.chipW, height: 0.03,
      position: `${round2(cx)} ${round2(chipY + CAUSAL.chipH / 2 - 0.015)} 0.03`,
      material: `color: ${ind.cor}; shader: flat`,
    });
    const chipNome = el("a-text", {
      value: ind.label.replace(/^Taxa de\s+/i, ""),
      position: `${round2(cx)} ${round2(chipY + 0.16)} 0.03`,
      width: 1.9, align: "center", color: "#dfe9ff", ...FONTE_3D,
    });
    const chipValor = el("a-text", {
      value: valor == null ? "s/d" : `${fmt(valor)}%`,
      position: `${round2(cx)} ${round2(chipY - 0.01)} 0.03`,
      width: 2.4, align: "center", color: ind.cor, ...FONTE_3D,
    });
    const chipEfeito = el("a-text", {
      value: efeito.verbo, position: `${round2(cx)} ${round2(chipY - 0.19)} 0.03`,
      width: 1.7, align: "center", color: efeito.cor, ...FONTE_3D,
    });
    panel.append(chipBg, chipTop, chipNome, chipValor, chipEfeito);
  });

  // Seta e chip de resultado (Eficiencia), encaixados na folga entre o ultimo
  // chip de fator e a margem direita do painel.
  const efInd = indicadorByKey("eficiencia");
  const efValor = latestValue(ctx.series.eficiencia);
  const fimFatores = x0 + 2 * passo + CAUSAL.chipW / 2;
  const resX = CAUSAL.w / 2 - CAUSAL.margem - CAUSAL.resW / 2;
  const setaX = (fimFatores + (resX - CAUSAL.resW / 2)) / 2;
  const seta = el("a-text", {
    value: ">", position: `${round2(setaX)} ${chipY} 0.03`,
    width: 2.6, align: "center", color: "#7d93b4", ...FONTE_3D,
  });
  const resBg = el("a-plane", {
    width: CAUSAL.resW, height: CAUSAL.chipH, position: `${round2(resX)} ${chipY} 0.02`,
    material: `color: ${efInd.cor}; opacity: 0.16; transparent: true; shader: flat`,
  });
  const resTop = el("a-plane", {
    width: CAUSAL.resW, height: 0.03,
    position: `${round2(resX)} ${round2(chipY + CAUSAL.chipH / 2 - 0.015)} 0.03`,
    material: `color: ${efInd.cor}; shader: flat`,
  });
  const resNome = el("a-text", {
    value: "Eficiencia", position: `${round2(resX)} ${round2(chipY + 0.16)} 0.03`,
    width: 1.9, align: "center", color: "#dfe9ff", ...FONTE_3D,
  });
  const resValor = el("a-text", {
    value: efValor == null ? "s/d" : `${fmt(efValor)}%`,
    position: `${round2(resX)} ${round2(chipY - 0.06)} 0.03`,
    width: 3.0, align: "center", color: efInd.cor, ...FONTE_3D,
  });
  panel.append(seta, resBg, resTop, resNome, resValor);

  const nota = el("a-text", {
    value: "A eficiencia pondera os retidos - nao e a soma simples dos tres.",
    position: `0 ${round2(-CAUSAL.h / 2 + 0.1)} 0.02`,
    width: 5.2, align: "center", color: "#8da0bb", ...FONTE_3D, "wrap-count": 66,
  });
  panel.append(nota);

  dom.indicatorLinks.appendChild(panel);
  applyPendingTransforms(panel); // ja percorre os filhos (data-vr-*)
  dom.efficacyPanel = panel;

  setEntityVisible(dom.indicatorLinks, false);
}

// Mostrar/esconder o painel-equacao da relacao causal (so cenas de tour).
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

// Geometria da composicao. As barras sao 100% empilhadas (sempre cheias), entao a
// altura maxima define o topo real da cena: mantida abaixo do bloco de narrativa
// para o texto nao encostar nas torres. O anel do ano fica a direita das barras.
const COMP = { x0: -3.1, x1: 1.2, baseY: 1.05, maxH: 1.32, z: -3.3, donutX: 2.6, donutY: 1.71, rIn: 0.34, rOut: 0.55 };
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
  setEntityVisible(dom.multiplosView, false);
  setEntityVisible(dom.tourPanel, false);
  setEntityVisible(dom.composicaoView, true);
  // No tour quem ocupa a faixa de baixo sao os controles do tour: o seletor de
  // ano e o "Indicadores" da composicao ficavam por baixo de "Proximo >".
  setEntityVisible(dom.compScrubber, !state.tourActive);
  setEntityVisible(dom.contextKicker, false);
  setEntityVisible(dom.contextTitle, false);
  setEntityVisible(dom.contextLead, false);

  // rotuloCurto (sigla nas instituicoes) mantem o titulo em 1 linha: nomes
  // completos de institutos passam de 60 caracteres e quebravam em 3 linhas.
  dom.compTitle.setAttribute("value", `Para onde vao os alunos - ${rotuloCurto(state.context)}`);
  dom.compText.setAttribute("value", compNarrative(state.context));
  dom.compLegend.hidden = false;
  crumb("Mapa", rotuloTrilha(state.context), "Indicadores", "Para onde vao os alunos");
  dom.hudTitle.textContent = rotuloTrilha(state.context);
  setNota("composicao");
  animateViewIn(dom.composicaoView);
  resetMiniMap();

  buildComposicao();
  updateCompYear(); // ja escreve a linha do ano + o conectivo causal (compReadoutText)
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

let compTowersRecursos = null;

function disposeCompTowers() {
  if (!compTowersRecursos) return;
  try {
    if (compTowersRecursos.geo) compTowersRecursos.geo.dispose();
    (compTowersRecursos.mats || []).forEach((m) => m.dispose());
  } catch (_) {}
  compTowersRecursos = null;
}

function buildComposicao() {
  disposeCompTowers();
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
    // anchor:right ancora o fim do texto no x informado; sem isso o rotulo
    // (bloco centrado) avanca para dentro da area das barras.
    // A frente das torres (z) e mais a esquerda: atras delas (z - 0,03), a
    // primeira torre tapava os rotulos do eixo para quem olha do centro.
    const rotulo = el("a-text", {
      value: `${pct}%`, position: `${round2(COMP.x0 - 0.45)} ${round2(y)} ${round2(COMP.z + 0.2)}`,
      width: 1.5, align: "right", anchor: "right", color: "#7d93b4", ...FONTE_3D,
    });
    dom.compScene.append(linha, rotulo);
    applyPendingTransforms(linha);
    applyPendingTransforms(rotulo);
  });

  // Barras empilhadas (100%) por ano: concluidos (base) -> retidos -> evadidos (topo).
  // Em vez de 800 entidades <a-box> PBR (1.600 draw calls em VR estereo), agrupamos
  // todos os blocos em 3 THREE.InstancedMesh (1 por categoria = 3 draw calls no total),
  // mantendo a malha 2x2 x 25 camadas (cada bloco = 1% dos estudantes do ano).
  const layerH = COMP.maxH / 25;
  const blocosPorCategoria = { concluidos: [], retidos: [], evadidos: [] };

  anos.forEach((ano, i) => {
    const m = matr[i];
    const x = compXFor(i);
    if (m > 0) {
      const fr = { concluidos: c.concluidos[i] / m, retidos: c.retidos[i] / m, evadidos: c.evadidos[i] / m };
      const nConc = Math.round(fr.concluidos * 100);
      const nRet = Math.round(fr.retidos * 100);
      // evadidos = resto (j >= nConc + nRet), garantindo sempre 100 blocos.

      for (let j = 0; j < 100; j += 1) {
        const key = j < nConc ? "concluidos" : j < nConc + nRet ? "retidos" : "evadidos";
        const layer = Math.floor(j / 4);
        const pInLayer = j % 4;
        const dx = pInLayer % 2 === 0 ? -0.125 : 0.125;
        const dz = Math.floor(pInLayer / 2) === 0 ? -0.1 : 0.1;
        const dy = layer * layerH + layerH / 2;
        blocosPorCategoria[key].push([x + dx, COMP.baseY + dy, COMP.z + dz]);
      }

      // Hitbox unico do ano (o unico .clickable da torre) que captura o raycaster.
      const hit = el("a-box", {
        class: "comp-seg clickable composicao-clickable",
        width: 0.5, depth: 0.4, height: COMP.maxH,
        position: `${x} ${COMP.baseY + COMP.maxH / 2} ${COMP.z}`,
        material: "opacity: 0; transparent: true; depthWrite: false",
      });
      hit.dataset.idx = String(i);
      hit.addEventListener("click", () => selectCompYear(i));
      dom.compScene.appendChild(hit);
      applyPendingTransforms(hit);
    } else {
      const hit = el("a-box", {
        class: "clickable composicao-clickable", width: 0.5, depth: 0.4, height: 0.4,
        position: `${x} ${COMP.baseY + 0.2} ${COMP.z}`,
        material: "color: #ffffff; opacity: 0.001; transparent: true; depthWrite: false",
      });
      hit.dataset.idx = String(i);
      hit.addEventListener("click", () => selectCompYear(i));
      dom.compScene.appendChild(hit);
      applyPendingTransforms(hit);
    }
    const tick = el("a-text", {
      value: String(ano), position: `${x} ${round2(COMP.baseY - 0.26)} ${COMP.z}`,
      width: 1.5, align: "center", color: "#90a6c6", ...FONTE_3D,
    });
    dom.compScene.appendChild(tick);
    applyPendingTransforms(tick);
  });

  if (typeof AFRAME !== "undefined" && AFRAME.THREE && AFRAME.THREE.InstancedMesh) {
    const THREE = AFRAME.THREE;
    const geo = new THREE.BoxGeometry(0.23, layerH - 0.01, 0.18);
    const mats = [];
    const grupo = new THREE.Group();
    const dummy = new THREE.Object3D();

    ["concluidos", "retidos", "evadidos"].forEach((key) => {
      const lista = blocosPorCategoria[key];
      if (!lista.length) return;
      const mat = new THREE.MeshLambertMaterial({
        color: COMP_COLORS[key],
        emissive: COMP_COLORS[key],
        emissiveIntensity: 0.15,
      });
      mats.push(mat);
      const inst = new THREE.InstancedMesh(geo, mat, lista.length);
      for (let k = 0; k < lista.length; k += 1) {
        const [bx, by, bz] = lista[k];
        dummy.position.set(bx, by, bz);
        dummy.updateMatrix();
        inst.setMatrixAt(k, dummy.matrix);
      }
      inst.instanceMatrix.needsUpdate = true;
      inst.frustumCulled = false;
      grupo.add(inst);
    });

    compTowersRecursos = { geo, mats };
    const holder = el("a-entity", { id: "compTowersMesh" });
    dom.compScene.appendChild(holder);
    const anexar = () => {
      if (holder.parentNode && typeof holder.setObject3D === "function") holder.setObject3D("mesh", grupo);
    };
    if (holder.hasLoaded) anexar();
    else {
      anexar();
      holder.addEventListener("loaded", anexar, { once: true });
    }
  }

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
    // Textos do miolo do anel: largura limitada ao diametro interno (2 x rIn)
    // para nao invadirem o arco colorido.
    const centerYear = el("a-text", {
      value: String(ano), position: `${COMP.donutX} ${round2(COMP.donutY + 0.06)} ${COMP.z + 0.01}`,
      width: 1.7, align: "center", color: "#ffffff", ...FONTE_3D,
    });
    // Numero e "matriculas" em duas linhas: numa so, "1.234.567 matriculas"
    // passava do furo do anel e as pontas ficavam em cima do arco colorido.
    const centerM = el("a-text", {
      value: fmtInt(m), position: `${COMP.donutX} ${round2(COMP.donutY - 0.07)} ${COMP.z + 0.01}`,
      width: 1.1, align: "center", color: "#cfe0f4", ...FONTE_3D,
    });
    const centerMRotulo = el("a-text", {
      value: "matriculas", position: `${COMP.donutX} ${round2(COMP.donutY - 0.16)} ${COMP.z + 0.01}`,
      width: 0.9, align: "center", color: "#9fb2cc", ...FONTE_3D,
    });
    const donutCaption = el("a-text", {
      value: "ano em foco", position: `${COMP.donutX} ${round2(COMP.donutY - COMP.rOut - 0.18)} ${COMP.z + 0.01}`,
      width: 1.5, align: "center", color: "#7d93b4", ...FONTE_3D,
    });
    compFocusEl.append(centerYear, centerM, centerMRotulo, donutCaption);
    applyPendingTransforms(centerYear);
    applyPendingTransforms(centerM);
    applyPendingTransforms(centerMRotulo);
    applyPendingTransforms(donutCaption);
  }
  dom.compReadout.setAttribute("value", compReadoutText(state.context, idx));
  dom.hudSubtitle.textContent = `Composicao ${ano}`;
}

// Linha do ano + conectivo causal (A4), montados juntos. Antes o conectivo
// relia o valor do texto para anexar a 2a linha - e o a-text ainda devolvia o
// valor anterior: ao trocar de ano, a 1a linha continuava com os numeros do
// ano de entrada (2024) enquanto o seletor mostrava outro ano.
function compReadoutText(ctx, idx) {
  const ano = DADOS.anos[idx];
  const c = ctx.series.contagens;
  const m = ctx.series.matriculas[idx];
  if (!(m > 0)) return `${ano}: sem dados`;
  const linha1 = `${ano}: ${fmtInt(c.concluidos[idx])} ${COMP_NOUN.concluidos} · ${fmtInt(c.retidos[idx])} ${COMP_NOUN.retidos} · ${fmtInt(c.evadidos[idx])} ${COMP_NOUN.evadidos}`;
  const ef = ctx.series.eficiencia[idx];
  if (ef == null) return linha1;
  // Frase curta (1 linha): o readout fica com 2 linhas no maximo.
  const pe = (c.evadidos[idx] / m) * 100;
  return `${linha1}\nFio causal: ${fmt(pe)}% de evasao puxam a eficiencia para ${fmt(ef)}%.`;
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
  setEntityVisible(dom.multiplosView, false);
  setEntityVisible(dom.tourPanel, false);
  hideInfoPanelNow();
  setEntityVisible(dom.timelineView, true);
  dom.compLegend.hidden = true;

  // O cabecalho generico sai de cena: a manchete narrativa (narrativePanel) assume o topo,
  // evitando texto sobreposto ao grafico.
  setEntityVisible(dom.contextKicker, false);
  setEntityVisible(dom.contextTitle, false);
  setEntityVisible(dom.contextLead, false);
  crumb("Mapa", rotuloTrilha(state.context), "Indicadores", indicador.label);
  dom.hudTitle.textContent = rotuloTrilha(state.context);
  setNota("timeline");
  setChartColor(indicador.cor);
  animateViewIn(dom.timelineView);
  resetMiniMap();

  buildChartGrid();
  buildTimeline();
  applyCompare();
  atualizarLegendaComparacao();
  updateCompareButton();
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
  dom.chartGlow.setAttribute("material", `color: ${cor}; opacity: 0.06; transparent: true; shader: flat; side: double; depthWrite: false`);
  dom.focusBand.setAttribute("material", `color: ${cor}; opacity: 0.14; transparent: true; shader: flat; depthWrite: false`);
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
      value: `${pct}%`, position: `${round2(CHART.x0 - 0.32)} ${round2(y)} ${CHART.z - 0.03}`,
      width: 1.6, align: "right", anchor: "right", color: "#7d93b4", ...FONTE_3D,
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
        material: `color: ${indicador.cor}; opacity: 0.18; transparent: true; shader: flat; depthWrite: false`,
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
        material: "color: #ffffff; opacity: 0.001; transparent: true; depthWrite: false",
      });
      hit.dataset.idx = String(i);
      hit.addEventListener("click", () => selectYear(i));
      dom.timelineBars.appendChild(hit);
      applyPendingTransforms(hit);
    }

    const tick = el("a-text", {
      value: String(ano), position: `${xFor(i)} ${round2(CHART.baseY - 0.23)} ${CHART.z}`,
      width: 1.7, align: "center", color: "#90a6c6", ...FONTE_3D,
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

  // Anotacoes de eventos de contexto (ex.: pandemia de 2020) - antes dos
  // callouts, que precisam desviar da etiqueta.
  // Canto superior esquerdo do painel: no desktop ele fica por baixo da coluna
  // do HUD 2D (painel + legenda da comparacao) em janelas de notebook. Cartoes
  // e o rotulo do ano nao vao para la.
  graficoObst = [[CHART.x0 - 0.3, 2.55, CHART.x0 + 0.65, CHART.topoPainel + 0.2]];
  calloutRects = [];
  buildEventos();

  // Callouts de pico/vale (com linha-guia), posicionados para nao cobrir a
  // linha, os pontos, a comparacao, a etiqueta do evento nem um ao outro.
  const crit = indicador.sentido === "negativo" ? peakIdx : valleyIdx;
  const bom = indicador.sentido === "negativo" ? valleyIdx : peakIdx;
  const cartoes = [{ idx: crit, isCritico: true }];
  if (bom !== crit) cartoes.push({ idx: bom, isCritico: false });
  const lugares = posicionarCallouts(cartoes.filter((c) => c.idx >= 0 && serie[c.idx] != null), serie);
  cartoes.forEach((c) => buildCallout(c.idx, serie, indicador, c.isCritico, lugares[c.idx]));
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
    // Etiqueta entre o topo do grafico (100%) e o topo do painel. Antes ela
    // passava do painel e, na tela, encostava na 2a linha do texto da narrativa.
    const tagW = 1.2, tagH = 0.2;
    const tagY = round2(yFor(100) + 0.04 + tagH / 2);
    const tag = el("a-entity", { position: `${x} ${tagY} ${CHART.z + 0.04}` });
    const plate = el("a-plane", {
      width: tagW, height: tagH,
      material: `color: #1a2336; opacity: 0.95; transparent: true; shader: flat`,
    });
    const barra = el("a-plane", {
      width: tagW, height: 0.03, position: `0 ${round2(tagH / 2 - 0.015)} 0.005`,
      material: `color: ${cor}; shader: flat`,
    });
    const txt = el("a-text", {
      value: `${ev.ano} · Pandemia`, position: "0 -0.01 0.01", width: 1.9,
      align: "center", color: "#dde6f7", ...FONTE_3D, "data-linha-unica": "1",
    });
    graficoObst.push([x - tagW / 2, tagY - tagH / 2, x + tagW / 2, tagY + tagH / 2]);
    tag.append(plate, barra, txt);
    dom.annotations.append(guia, tag);
    applyPendingTransforms(guia);
    applyPendingTransforms(tag);
  });
}

// ----------------------------------------------------------------------------
// Posicionador de cartoes do grafico - porte do posicionarCartoes da versao
// minimalista. Procura, perto do ponto, um lugar dentro do painel do grafico
// que nao cubra a linha de tendencia, os pontos, a linha de comparacao, a
// etiqueta do evento nem outro cartao. Qualquer pedaco de linha sob o cartao
// custa mais que as preferencias de lado e de distancia: o cartao so cobre a
// linha se nao houver outro lugar. Antes o card ia sempre ~1 m para o lado e
// 0,55 m para cima: cobria a linha e os pontos, e o de pico e o de vale se
// encavalavam quando caiam em anos vizinhos.
// ----------------------------------------------------------------------------
let graficoObst = []; // retangulos ocupados (etiqueta do evento, cartoes): [x0, y0, x1, y1]
let calloutRects = [];

function geometriaDoGrafico() {
  const pts = pontosDe(state.context.series[state.indicatorKey]).filter(Boolean);
  const seg = (lista) => lista.slice(1).map((p, k) => [lista[k], p]);
  const segs = seg(pts).map((s2) => ({ s: s2, peso: 1 }));
  // raio do halo do marcador em foco (0,13 x 1,45) + folga
  const marcas = pts.map((p) => ({ x: p.x, y: p.y, r: 0.21, i: p.i }));
  // A comparacao pode ser ligada depois: os cartoes ja desviam dela.
  const cmp = state.compareContext ? pontosDe(state.compareContext.series[state.indicatorKey]).filter(Boolean) : [];
  seg(cmp).forEach((s2) => segs.push({ s: s2, peso: 0.75 }));
  cmp.forEach((p) => marcas.push({ x: p.x, y: p.y, r: 0.07, i: -1 }));
  return { segs, marcas };
}

function posicionarNoGrafico(alvo, geo, obst) {
  const G = {
    xMin: CHART.x0 - 0.1, // rotulos de % terminam em x0 - 0,32 (o cartao, mais perto do olho, "cresce" na tela)
    xMax: CHART.x1 + 0.6,
    yMin: CHART.baseY + 0.03,
    yMax: CHART.topoPainel - 0.04,
    margem: 0.04, // a linha tem espessura
  };
  const lim = (v, a, b) => Math.max(a, Math.min(b, v));
  // comprimento de um segmento dentro de um retangulo (Liang-Barsky)
  const dentro = (s2, r) => {
    const [a, b] = s2;
    const dx = b.x - a.x, dy = b.y - a.y;
    let t0 = 0, t1 = 1;
    const p = [-dx, dx, -dy, dy];
    const q = [a.x - r[0], r[2] - a.x, a.y - r[1], r[3] - a.y];
    for (let k = 0; k < 4; k += 1) {
      if (p[k] === 0) {
        if (q[k] < 0) return 0;
      } else {
        const t = q[k] / p[k];
        if (p[k] < 0) t0 = Math.max(t0, t);
        else t1 = Math.min(t1, t);
      }
    }
    return t1 > t0 ? (t1 - t0) * Math.hypot(dx, dy) : 0;
  };
  const tocaPonto = (p, r) => {
    const cx = lim(p.x, r[0], r[2]), cy = lim(p.y, r[1], r[3]);
    return Math.hypot(p.x - cx, p.y - cy) < p.r;
  };
  const cruza = (a, b) => a[0] < b[2] && b[0] < a[2] && a[1] < b[3] && b[1] < a[3];
  const { w, h } = alvo;
  let melhor = null;
  [alvo.pref, -alvo.pref].forEach((lado) => [1, 1.6, 2.3, 3.1, 4, 5].forEach((longe) => {
    [0, -0.3, 0.3, -0.6, 0.6, -1, 1, -1.5, 1.5, -2, 2, -3, 3, -4, 4, -5, 5].forEach((f) => {
      const x = lim(alvo.x + f * w, G.xMin + w / 2, G.xMax - w / 2);
      const yIdeal = alvo.y + lado * (h / 2 + 0.16) * longe;
      const y = lim(yIdeal, G.yMin + h / 2, G.yMax - h / 2);
      const r = [x - w / 2, y - h / 2, x + w / 2, y + h / 2];
      const m = G.margem;
      const rm = [r[0] - m, r[1] - m, r[2] + m, r[3] + m];
      let custo = 0;
      geo.segs.forEach((sg) => {
        const d = dentro(sg.s, rm);
        if (d > 0) custo += sg.peso * (2 + (4 * d) / w);
      });
      geo.marcas.forEach((p) => {
        if (tocaPonto(p, rm)) custo += p.i === alvo.proprio ? 10 : 5;
      });
      obst.forEach((o) => {
        if (cruza(o, rm)) custo += 50;
      });
      // Longe do ponto custa: aqui o cartao tem linha-guia, e uma guia comprida
      // atravessando o grafico vira mais um risco por cima de tudo. Cada trecho
      // da serie que a guia cruza tambem custa.
      const gx = lim(alvo.x, r[0], r[2]), gy = lim(alvo.y, r[1], r[3]);
      const guia = [{ x: alvo.x, y: alvo.y }, { x: gx, y: gy }];
      const cruzaGuia = (a, b) => {
        const d = (p, q, t) => (q.x - p.x) * (t.y - p.y) - (q.y - p.y) * (t.x - p.x);
        return d(a[0], a[1], b[0]) * d(a[0], a[1], b[1]) < 0 && d(b[0], b[1], a[0]) * d(b[0], b[1], a[1]) < 0;
      };
      geo.segs.forEach((sg) => {
        if (cruzaGuia(guia, sg.s)) custo += 1.2 * sg.peso;
      });
      custo += (1.2 * Math.abs(x - alvo.x)) / w + (0.3 * Math.abs(y - yIdeal)) / h + (lado !== alvo.pref ? 0.25 : 0) + (longe - 1) * 0.4;
      if (!melhor || custo < melhor.custo - 1e-9) melhor = { x, y, r, custo };
    });
  }));
  return melhor;
}

const CALLOUT = { w: 1.4, h: 0.46 };

// Os dois cartoes juntos: tenta as duas ordens (pico primeiro, vale primeiro)
// e fica com a de menor custo total. Um cartao so, colocado primeiro no meio
// da altura, podia nao deixar lugar para o outro (IFRR, retencao).
function posicionarCallouts(cartoes, serie) {
  const geo = geometriaDoGrafico();
  const validos = serie.filter((v) => v != null);
  const alvo = (idx) => {
    // o maior valor prefere ficar acima do ponto; o menor, abaixo
    const pref = serie[idx] >= Math.max(...validos) ? 1 : serie[idx] <= Math.min(...validos) ? -1 : 1;
    return { x: xFor(idx), y: yFor(serie[idx]), w: CALLOUT.w, h: CALLOUT.h, pref, proprio: idx };
  };
  const ordens = cartoes.length > 1 ? [cartoes, [...cartoes].reverse()] : [cartoes];
  let melhor = null;
  ordens.forEach((ordem) => {
    const obst = graficoObst.slice();
    const res = {};
    let total = 0;
    ordem.forEach((c) => {
      const l = posicionarNoGrafico(alvo(c.idx), geo, obst);
      obst.push(l.r);
      res[c.idx] = l;
      total += l.custo;
    });
    if (!melhor || total < melhor.total - 1e-9) melhor = { res, total };
  });
  return melhor ? melhor.res : {};
}

function buildCallout(idx, serie, indicador, isCritico, lugar) {
  if (idx < 0 || serie[idx] == null || !lugar) return;
  const x = xFor(idx);
  const y = yFor(serie[idx]);
  const cor = isCritico ? "#ffb454" : "#65e4b8";
  const rotulo = isCritico
    ? indicador.sentido === "negativo" ? "Pico critico" : "Ponto critico"
    : "Melhor ano";

  const cardX = round2(lugar.x);
  const cardY = round2(lugar.y);
  graficoObst.push(lugar.r);
  calloutRects.push(lugar.r);

  const grupo = el("a-entity", {});
  grupo.dataset.callout = idx === 0 ? "0" : String(idx);

  // Linha-guia do ponto ate a borda mais proxima do card (so se ele ficou longe).
  const bx = Math.max(lugar.r[0], Math.min(lugar.r[2], x));
  const by = Math.max(lugar.r[1], Math.min(lugar.r[3], y));
  const len = Math.hypot(bx - x, by - y);
  if (len > 0.14) {
    const ang = (Math.atan2(by - y, bx - x) * 180) / Math.PI;
    grupo.appendChild(el("a-box", {
      width: round2(len), height: 0.012, depth: 0.01,
      position: `${round2((x + bx) / 2)} ${round2((y + by) / 2)} ${CHART.z + 0.03}`,
      rotation: `0 0 ${round2(ang)}`,
      material: `color: ${cor}; opacity: 0.7; transparent: true; shader: flat`,
    }));
  }
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

  // Cartao a frente dos marcadores (z + 0,2): nem a esfera do ano em foco
  // (aumentada 1,45x) fura o cartao.
  const zc = CHART.z + 0.2;
  const xt = round2(cardX - CALLOUT.w / 2 + 0.1);
  const card = el("a-plane", {
    width: CALLOUT.w, height: CALLOUT.h, position: `${cardX} ${cardY} ${zc}`,
    material: `color: #0c1426; opacity: 0.95; transparent: true; shader: flat`,
  });
  const barra = el("a-plane", {
    width: 0.05, height: CALLOUT.h, position: `${round2(cardX - CALLOUT.w / 2 + 0.025)} ${cardY} ${zc + 0.005}`,
    material: `color: ${cor}; shader: flat`,
  });
  const titulo = el("a-text", {
    value: rotulo, position: `${xt} ${round2(cardY + 0.14)} ${zc + 0.01}`,
    width: 1.8, align: "left", anchor: "left", color: "#ffffff", ...FONTE_3D, "data-linha-unica": "1",
  });
  const valor = el("a-text", {
    value: `${fmt(serie[idx])}% em ${DADOS.anos[idx]}`,
    position: `${xt} ${round2(cardY - 0.01)} ${zc + 0.01}`,
    width: 1.8, align: "left", anchor: "left", color: "#cfe0f4", ...FONTE_3D, "data-linha-unica": "1",
  });
  grupo.append(card, barra, titulo, valor);
  if (interp) {
    grupo.appendChild(el("a-text", {
      value: interp, position: `${xt} ${round2(cardY - 0.155)} ${zc + 0.01}`,
      width: 1.6, align: "left", anchor: "left", color: cor, ...FONTE_3D, "data-linha-unica": "1",
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

  // Rotulo do ano em foco: no lugar livre mais perto do ponto (mesmo
  // posicionador dos cartoes), sem cobrir linha, pontos, cartoes, a etiqueta
  // do evento nem os rotulos de % do eixo. Antes ficava fixo 0,32 acima do
  // ponto e caia em cima do cartao "Melhor ano", do "75%" do eixo (em 2017)
  // e dos pontos da comparacao.
  setEntityVisible(dom.valueReadout, true);
  const textoLeitura = v == null ? `${ano}: s/ dados` : `${ano}  ${fmt(v)}%`;
  dom.valueReadout.setAttribute("value", textoLeitura);
  const geo = geometriaDoGrafico();
  // a guia vertical do evento tambem e obstaculo (o texto nao tem fundo)
  const guiasEvento = (DADOS.eventos || []).map((ev) => DADOS.anos.indexOf(ev.ano)).filter((i) => i >= 0)
    .map((i) => ({ s: [{ x: xFor(i), y: CHART.baseY }, { x: xFor(i), y: yFor(100) }], peso: 1 }));
  const lugar = posicionarNoGrafico(
    { x, y: v != null ? yFor(v) : CHART.baseY, w: 0.062 * textoLeitura.length + 0.08, h: 0.19, pref: 1, proprio: idx },
    { segs: geo.segs.concat(guiasEvento), marcas: geo.marcas },
    graficoObst
  );
  // z + 0,16: a frente das esferas dos marcadores (so a do ano em foco, que
  // ele evita, chega a + 0,15).
  setVectorAttribute(dom.valueReadout, "position", `${round2(lugar.x)} ${round2(lugar.y)} ${round2(CHART.z + 0.16)}`);

  // Realce do marcador selecionado.
  dom.markers.querySelectorAll("[data-idx]").forEach((m) => {
    const on = Number(m.dataset.idx) === idx;
    m.setAttribute("animation__f", `property: scale; to: ${on ? "1.45 1.45 1.45" : "1 1 1"}; dur: 180; easing: easeOutQuad`);
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

// O Brasil nao tem contexto de comparacao (ele proprio e a referencia): o botao
// fica apagado para nao prometer uma acao que nao acontece.
function updateCompareButton() {
  if (!dom.ctrlCompare) return;
  const disponivel = !!state.compareContext;
  const alvo = dom.ctrlCompare.querySelector("a-box");
  if (alvo) {
    alvo.setAttribute(
      "material",
      disponivel
        ? "color: #16263f; roughness: 0.45; emissive: #2f5d8a; emissiveIntensity: 0.2"
        : "color: #101827; roughness: 0.6; emissive: #1b2a3d; emissiveIntensity: 0.05; opacity: 0.55; transparent: true"
    );
  }
  dom.ctrlCompareLabel.setAttribute("color", disponivel ? "#cfe9ff" : "#5d6f88");
  dom.ctrlCompareLabel.setAttribute(
    "value",
    disponivel ? (state.compareOn ? "Ocultar" : "Comparar") : "Comparar (n/d)"
  );
}

function atualizarLegendaComparacao() {
  const ativa = Boolean(state.compareOn && state.context && state.compareContext);
  if (dom.hudLegend) dom.hudLegend.hidden = !ativa;
  if (dom.compareLegend3d) setEntityVisible(dom.compareLegend3d, ativa);
  if (!ativa) return;

  const nomeA = rotuloCurto(state.context);
  const nomeB = rotuloCurto(state.compareContext);
  const ind = state.indicatorKey ? indicadorByKey(state.indicatorKey) : null;
  const corA = ind ? ind.cor : "#4cc9f0";

  if (dom.legendPrimary) dom.legendPrimary.textContent = nomeA;
  if (dom.legendCompare) dom.legendCompare.textContent = nomeB;
  if (dom.compareLegendDotPrimary) dom.compareLegendDotPrimary.setAttribute("material", `color: ${corA}; shader: flat`);
  if (dom.compareLegendPrimary3d) textoUmaLinha(dom.compareLegendPrimary3d, nomeA, 24);
  if (dom.compareLegendCompare3d) textoUmaLinha(dom.compareLegendCompare3d, nomeB, 24);
}

function toggleCompare() {
  if (state.guided) return;
  if (!state.compareContext) {
    dom.hudSubtitle.textContent = "O Brasil e a propria referencia: escolha uma regiao para comparar.";
    return;
  }
  state.compareOn = !state.compareOn;
  updateCompareButton();
  applyCompare();
  updateYear();
  atualizarLegendaComparacao();
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

// Legenda: em VR, a 3D presa a cabeca (#captionPanel); no desktop, a barra
// 2D do rodape (#legenda2d). Como o #vrHud fica ancorado no mundo (nao mais
// colado na camera abaixo da legenda), ele nao colide com as legendas.
let legendaAtual = "";
function setCaption(text, vrForcado) {
  legendaAtual = text;
  const emVR = vrForcado != null ? vrForcado : !!(dom.scene && dom.scene.is && dom.scene.is("vr-mode"));
  const tem = text.length > 0;
  if (dom.captionText) dom.captionText.setAttribute("value", emVR ? text : "");
  if (dom.captionPanel) setEntityVisible(dom.captionPanel, emVR && tem);
  if (dom.legenda2d) {
    dom.legenda2d.textContent = emVR ? "" : text;
    dom.legenda2d.hidden = emVR || !tem;
  }
}

// A legenda e o canal garantido; a voz e um extra. No navegador do Quest a
// sintese de voz pode nao existir, falhar na hora (sem voz instalada) ou nunca
// avisar que terminou - antes, a abertura guiada ficava parada no primeiro
// momento. Agora: tempo minimo de leitura da legenda sempre respeitado, e um
// vigia que encerra a frase se a voz nao disser nada.
function narrateText(text, token) {
  return new Promise((resolve) => {
    if (token && token !== state.guidedToken) { resolve(); return; }
    
    const currentRunId = ++speechRunId;
    setCaption(text);
    const leitura = Math.max(2500, text.length * 60); // tempo para LER a legenda
    const inicio = Date.now();
    let encerrado = false;
    const encerrar = () => {
      if (encerrado) return;
      encerrado = true;
      clearTimeout(vigia);
      if (currentRunId === speechRunId) { setCaption(""); resolve(); }
    };
    const encerrarAposLeitura = () => setTimeout(encerrar, Math.max(0, leitura - (Date.now() - inicio)));
    const vigia = setTimeout(encerrar, Math.max(8000, text.length * 130));
    
    if (!window.speechSynthesis || typeof SpeechSynthesisUtterance === "undefined") {
      encerrarAposLeitura();
      return;
    }
    
    const synth = window.speechSynthesis;
    const utter = new SpeechSynthesisUtterance(text);
    utter.lang = "pt-BR";
    utter.rate = 1.0;
    
    let comecou = false;
    utter.onstart = () => { comecou = true; };
    utter.onend = encerrar;
    utter.onerror = encerrarAposLeitura; // sem voz: a legenda segue no tempo de leitura
    
    try {
      synth.cancel();
      synth.speak(utter);
      // Voz que nem comeca (motor ausente, sem aviso de erro): segue pela legenda.
      setTimeout(() => { if (!comecou) encerrarAposLeitura(); }, 1500);
    } catch (e) {
      encerrarAposLeitura();
    }
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
  try {
    cancelGuided();
    stopNarration();
    await fadeToBlack();

    state.tourActive = true;
    state.tourId = tourId;
    state.tourScenes = tour.cenas;
    state.tourStep = 0;
    state.compareOn = false;

    resetCameraRig();
    setEntityVisible(dom.selectionWorld, false);
    setEntityVisible(dom.explorationWorld, true);
    atualizarLegendaComparacao();
    dom.compLegend.hidden = true;

    // Atualizar a cor da barra HUD com a cor da historia.
    if (dom.tourBarLabel) dom.tourBarLabel.textContent = tour.titulo;
    const barEl = document.getElementById("tourBar");
    if (barEl) barEl.style.borderLeftColor = tour.cor;
    const fillEl = document.getElementById("tourBarFill");
    if (fillEl) fillEl.style.background = `linear-gradient(90deg, ${tour.cor}, ${shadeColor(tour.cor, 30)})`;

    await tourGoTo(0, /* skipFade */ true);
    await fadeFromBlack();
  } finally {
    state.transitioning = false;
  }
}

async function tourGoTo(n, skipFade) {
  const scenes = state.tourScenes;
  if (!scenes || n < 0 || n >= scenes.length) return;
  const cena = scenes[n];
  state.tourStep = n;

  // Fade entre cenas (exceto a primeira que ja vem do fade do startTour).
  // Quem assume a transicao tambem e quem libera no finally la embaixo.
  let assumiuTransicao = false;
  if (!skipFade && !state.transitioning) {
    state.transitioning = true;
    assumiuTransicao = true;
    await fadeToBlack();
  }

  try {
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
      if (!ctx) return; // o finally devolve state.transitioning
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
        populateIndicators(ctx);
        if (cena.showLinks) {
          // O painel-equacao ocupa a faixa do cabecalho: escondemos kicker/titulo/lead
          // para nao empilhar dois blocos de texto na mesma altura da tela.
          setEntityVisible(dom.contextKicker, false);
          setEntityVisible(dom.contextTitle, false);
          setEntityVisible(dom.contextLead, false);
          showIndicatorLinks(true);
        } else {
          setEntityVisible(dom.contextKicker, true);
          setEntityVisible(dom.contextTitle, true);
          setEntityVisible(dom.contextLead, true);
          dom.contextKicker.setAttribute("value", "RELACAO ENTRE INDICADORES");
          textoUmaLinha(dom.contextTitle, cena.manchete, 40);
          dom.contextLead.setAttribute("value", "Evasao, conclusao e retencao determinam a eficiencia academica.");
          showIndicatorLinks(false);
        }
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

    if (!skipFade) await fadeFromBlack();
  } finally {
    if (assumiuTransicao || !skipFade) state.transitioning = false;
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
    crumb("Mapa", rotuloTrilha(state.context), "Indicadores", indicadorByKey(state.indicatorKey).label);
  } else {
    backToIndicators();
  }

  dom.hudTitle.textContent = rotuloTrilha(state.context);
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
      value: p.texto, position: "0 0 0.05", width: 2.6, align: "center", color: "#cfe9ff", ...FONTE_3D
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
    // (O icone - ◉ ▲ ⇄ - saiu: nenhuma das fontes tem esses glifos, entao ele
    // nunca apareceu; o titulo segue centrado no card.)
    const titulo = el("a-text", {
      value: tour.titulo, position: "0 0.22 0.06",
      width: 1.9, align: "center", color: "#ffffff", ...FONTE_3D,
    });
    const desc = el("a-text", {
      value: tour.descricao, position: "0 -0.04 0.06",
      width: 1.8, align: "center", color: "#b0bfd6", ...FONTE_3D, "wrap-count": 28,
    });
    const cenas = el("a-text", {
      value: `${tour.cenas.length} cenas`, position: "0 -0.32 0.06",
      width: 1.5, align: "center", color: tour.cor, ...FONTE_3D,
    });
    const hit = el("a-box", {
      class: "hit clickable selection-clickable",
      width: 1.95, height: 1.0, depth: 0.18,
      material: "color: #ffffff; opacity: 0.001; transparent: true; depthWrite: false",
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

function backToIndicators() {
  if (state.transitioning) return;
  // O botao "Indicadores" e um voltar dentro da cena: consome a entrada que a
  // ida para a linha do tempo/composicao empilhou. Sem isto, o "Voltar" global
  // logo em seguida reabria a MESMA tela de indicadores (parecia nao funcionar).
  const topo = state.history[state.history.length - 1];
  if (topo && topo.stage === "indicators") state.history.pop();
  cancelGuided();
  stopNarration();
  state.stage = "indicators";
  state.compareOn = false;
  dom.ctrlCompareLabel.setAttribute("value", "Comparar");
  atualizarLegendaComparacao();
  dom.compLegend.hidden = true;
  setEntityVisible(dom.timelineView, false);
  setEntityVisible(dom.composicaoView, false);
  setEntityVisible(dom.indicatorView, true);
  populateIndicators(state.context);
  dom.hudTitle.textContent = rotuloTrilha(state.context);
  dom.hudSubtitle.textContent = "Escolha um indicador para ver a linha do tempo";
  setInteractionMode("indicators");
}

function bindBackButton() {
  // Selecionar pela classe de modo (e nao por ".clickable", que e ligada/desligada
  // por setInteractionMode) mantem o bind valido em qualquer ordem de inicializacao.
  const hit = dom.backButton.querySelector(".exploration-clickable");
  hit.addEventListener("mouseenter", () => dom.backButton.setAttribute("animation__hover", "property: scale; to: 1.08 1.08 1.08; dur: 180"));
  hit.addEventListener("mouseleave", () => dom.backButton.setAttribute("animation__hover", "property: scale; to: 1 1 1; dur: 180"));
  hit.addEventListener("click", navigateBack);
}

async function returnToSelection() {
  if (state.transitioning) return;
  cancelGuided();
  stopNarration();
  stopAmbientDrone();
  stopVisceral();
  state.transitioning = true;
  try {
    await fadeToBlack();

    // Limpar tour se estava ativo.
    state.tourActive = false;
    setEntityVisible(dom.tourControls, false);
    setEntityVisible(dom.tourPanel, false);
    dom.tourBar.hidden = true;

    resetCameraRig();
    setEntityVisible(dom.explorationWorld, false);
    setEntityVisible(dom.selectionWorld, true);
    hideInfoPanelNow();
    setEntityVisible(dom.timelineView, false);
    setEntityVisible(dom.composicaoView, false);
    state.compareOn = false;
    atualizarLegendaComparacao();
    dom.compLegend.hidden = true;

    state.stage = "selection";
    state.context = null;
    state.indicatorKey = null;
    state.compareOn = false;

    setEntityVisible(dom.drillCards, false);
    setEntityVisible(dom.drillBack, false);
    showMapSelection();

    state.history = []; // chegou na tela inicial: zera a pilha de navegacao.
    setInteractionMode("selection");
    await fadeFromBlack();
  } finally {
    state.transitioning = false;
  }
}

// ----------------------------------------------------------------------------
// Historico de navegacao: "Voltar" retorna a tela anterior (nao a inicial).
// ----------------------------------------------------------------------------

// Empilha um retrato da tela ATUAL antes de avancar para a proxima.
function pushHistory() {
  state.history.push({
    stage: state.stage,
    context: state.context,
    indicatorKey: state.indicatorKey,
    parentRegion: state.parentRegion,
    drillRegion: state.drillRegion,
  });
}

// Desempilha e retorna a tela anterior; se a pilha estiver vazia, vai ao mapa.
function navigateBack() {
  if (state.transitioning) return;
  // Sair pelo "Voltar" no meio de um tour encerra o tour (senao a barra de
  // progresso e os controles ficariam ligados numa tela de exploracao livre).
  if (state.tourActive) {
    state.tourActive = false;
    showTourControls(false);
    setEntityVisible(dom.tourPanel, false);
    dom.tourBar.hidden = true;
    stopVisceral();
  }
  const prev = state.history.pop();
  if (!prev) { returnToSelection(); return; }
  state.parentRegion = prev.parentRegion || null;
  state.drillRegion = prev.drillRegion || null;
  switch (prev.stage) {
    case "drill":
      if (prev.drillRegion) { enterDrill(prev.drillRegion); return; }
      returnToSelection(); return;
    case "indicators":
      if (prev.context) { enterIndicators(prev.context); return; }
      returnToSelection(); return;
    case "multiplos":
      enterMultiplos(prev.indicatorKey || "eficiencia"); return;
    case "timeline":
      if (prev.context) { state.context = prev.context; enterTimeline(prev.indicatorKey); return; }
      returnToSelection(); return;
    case "composicao":
      // enterComposicao le state.context: sem restaurar o contexto do historico,
      // a tela seria montada com os dados da tela atual.
      if (prev.context) { state.context = prev.context; enterComposicao(); return; }
      returnToSelection(); return;
    case "selection":
    default:
      returnToSelection(); return;
  }
}

// Restaura a tela de drill (lista de instituicoes) vindo do mundo de exploracao:
// troca de mundo e reabre o drill da regiao. openDrill sozinho nao troca de mundo.
async function enterDrill(region) {
  if (state.transitioning || !region) return;
  cancelGuided();
  stopNarration();
  stopAmbientDrone();
  stopVisceral();
  state.transitioning = true;
  try {
    await fadeToBlack();

    state.tourActive = false;
    setEntityVisible(dom.tourControls, false);
    setEntityVisible(dom.tourPanel, false);
    dom.tourBar.hidden = true;

    resetCameraRig();
    setEntityVisible(dom.explorationWorld, false);
    setEntityVisible(dom.selectionWorld, true);
    hideInfoPanelNow();
    setEntityVisible(dom.indicatorView, false);
    setEntityVisible(dom.timelineView, false);
    setEntityVisible(dom.composicaoView, false);
    setEntityVisible(dom.multiplosView, false);
    state.compareOn = false;
    atualizarLegendaComparacao();
    dom.compLegend.hidden = true;

    state.parentRegion = null;
    openDrill(region); // define stage="drill", monta cards, mostra drillBack e ajusta interacao.

    await fadeFromBlack();
  } finally {
    state.transitioning = false;
  }
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
  toggleClickable(".vr-hud-clickable", Boolean(dom.vrHud && isEntityVisible(dom.vrHud)));
  refreshRaycasters();
}

function toggleClickable(selector, enabled) {
  document.querySelectorAll(selector).forEach((entity) => {
    // Nunca ligar o raycaster em algo que esta escondido: o alvo invisivel rouba
    // o clique/gaze (ex.: CTA do tour, aba do mini-mapa durante o tour).
    entity.classList.toggle("clickable", enabled && isEntityVisible(entity));
  });
}

// Visibilidade efetiva: o elemento e todos os ancestrais precisam estar visiveis.
function isEntityVisible(entity) {
  let atual = entity;
  while (atual && atual.getAttribute) {
    const attr = atual.getAttribute("visible");
    if (attr === false || attr === "false") return false;
    atual = atual.parentElement;
  }
  return true;
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
// VR / Meta Quest 3: HUD no mundo, altura sentado/em pe, atalhos Touch Plus,
// feedback haptico, laser unico e instrucoes adaptativas.
// ----------------------------------------------------------------------------

const ALTURA_OLHO_ALVO = 1.6;
const INSTRUCOES_ENTRADA = {
  desktop: {
    mapTitle: "Aponte para uma regiao; clique para explorar",
    contextLead: "Passe o mouse para entender cada indicador. Clique para abrir a linha do tempo.",
    infoHint: "Clique para ver a linha do tempo",
    roomSign: "Desktop: aponte com o mouse e clique. Em VR: controles Touch, maos ou olhar.",
  },
  controle: {
    mapTitle: "Aponte o laser para uma regiao; aperte o gatilho",
    contextLead: "Aponte para entender cada indicador. Aperte o gatilho para abrir a linha do tempo.",
    infoHint: "Aperte o gatilho para ver a linha do tempo",
    roomSign: "Gatilho: selecionar · B/Y: voltar · Analogico: ano/cena · X: Como ler",
  },
  mao: {
    mapTitle: "Olhe para uma regiao; faca pinca para explorar",
    contextLead: "Olhe para cada indicador e faca pinca (palma para fora) para abrir a linha do tempo.",
    infoHint: "Faca pinca (palma para fora) para ver a linha do tempo",
    roomSign: "Mire com o olhar e faca pinca (palma para fora). Olhar parado nao clica.",
  },
  olhar: {
    mapTitle: "Olhe para uma regiao e segure para explorar",
    contextLead: "Olhe para um indicador para ler a definicao. Segure o olhar para abrir a linha do tempo.",
    infoHint: "Segure o olhar para ver a linha do tempo",
    roomSign: "Mire com o olhar e segure por 0,85 s para selecionar.",
  },
};

function instrucoesDoModo() {
  const emVR = Boolean((dom.scene && dom.scene.is && dom.scene.is("vr-mode")) || state.vrInput);
  const chave = emVR ? (state.vrInput || "olhar") : "desktop";
  return INSTRUCOES_ENTRADA[chave] || INSTRUCOES_ENTRADA.desktop;
}

function atualizarInstrucoesEntrada() {
  const txt = instrucoesDoModo();
  if (dom.mapTitle) dom.mapTitle.setAttribute("value", txt.mapTitle);
  if (dom.infoHint) dom.infoHint.setAttribute("value", txt.infoHint);
  if (dom.roomSignBody) dom.roomSignBody.setAttribute("value", txt.roomSign);
  if (dom.contextLead && state.stage === "indicators" && !state.tourActive) {
    dom.contextLead.setAttribute("value", txt.contextLead);
  }
}

function bindVrHudControls() {
  const notaHit = dom.vrNotaTab && dom.vrNotaTab.querySelector(".vr-hud-clickable");
  if (notaHit) {
    notaHit.addEventListener("click", () => toggleVrNota());
    notaHit.addEventListener("mouseenter", () => dom.vrNotaTab.setAttribute("animation__h", "property: scale; to: 1.06 1.06 1.06; dur: 140"));
    notaHit.addEventListener("mouseleave", () => dom.vrNotaTab.setAttribute("animation__h", "property: scale; to: 1 1 1; dur: 140"));
  }
  const altHit = dom.vrAlturaBtn && dom.vrAlturaBtn.querySelector(".vr-hud-clickable");
  if (altHit) {
    altHit.addEventListener("click", () => alternarAlturaVr());
    altHit.addEventListener("mouseenter", () => dom.vrAlturaBtn.setAttribute("animation__h", "property: scale; to: 1.06 1.06 1.06; dur: 140"));
    altHit.addEventListener("mouseleave", () => dom.vrAlturaBtn.setAttribute("animation__h", "property: scale; to: 1 1 1; dur: 140"));
  }
}

function setVrNotaOpen(aberto) {
  state.vrNotaOpen = Boolean(aberto);
  if (dom.vrNotaCard) setEntityVisible(dom.vrNotaCard, state.vrNotaOpen);
  if (dom.vrNotaTabLabel) dom.vrNotaTabLabel.setAttribute("value", state.vrNotaOpen ? "Como ler -" : "Como ler +");
}

function toggleVrNota() {
  setVrNotaOpen(!state.vrNotaOpen);
}

function atualizarBotaoAlturaVr() {
  if (dom.vrAlturaLabel) {
    dom.vrAlturaLabel.setAttribute("value", state.seatedMode ? "Altura: Sentado" : "Altura: Em pe");
  }
}

// Detecta automaticamente uso sentado ao entrar em VR: se a altura real dos olhos
// (local-floor) estiver abaixo de 1,42 m, compensa o #cameraRig para trazer a
// cena para a linha dos olhos (1,60 m), evitando forcar o pescoco para cima.
function calibrarAlturaVr(tentativas = 6) {
  const sessao = dom.scene && dom.scene.xrSession;
  if (!sessao || !dom.camera || !dom.camera.object3D) return;
  sessao.requestAnimationFrame(() => {
    if (!dom.scene.is("vr-mode")) return;
    const eyeY = dom.camera.object3D.position.y;
    if (eyeY < 0.05 && tentativas > 0) {
      calibrarAlturaVr(tentativas - 1);
      return;
    }
    if (eyeY > 0.45 && eyeY < 1.42) {
      state.vrHeightOffset = Math.max(0, Math.min(0.55, round2(ALTURA_OLHO_ALVO - eyeY)));
      state.seatedMode = true;
    } else {
      state.vrHeightOffset = 0;
      state.seatedMode = false;
    }
    resetCameraRig();
    atualizarBotaoAlturaVr();
  });
}

function alternarAlturaVr() {
  if (state.seatedMode || state.vrHeightOffset > 0.02) {
    state.vrHeightOffset = 0;
    state.seatedMode = false;
  } else {
    const eyeY = dom.camera && dom.camera.object3D ? dom.camera.object3D.position.y : 0;
    state.vrHeightOffset = eyeY > 0.45 && eyeY < 1.55
      ? Math.max(0.1, Math.min(0.55, round2(ALTURA_OLHO_ALVO - eyeY)))
      : 0.38;
    state.seatedMode = true;
  }
  resetCameraRig();
  atualizarBotaoAlturaVr();
}

function pulsarHaptica(lado, intensidade = 0.25, duracaoMs = 20) {
  const sessao = dom.scene && dom.scene.xrSession;
  if (!sessao || !sessao.inputSources) return;
  const alvo = lado || state.activeHand || "right";
  const fonte = Array.from(sessao.inputSources).find((f) => !f.hand && f.gamepad && f.handedness === alvo);
  if (!fonte || !fonte.gamepad) return;
  try {
    const gp = fonte.gamepad;
    if (gp.hapticActuators && gp.hapticActuators[0] && typeof gp.hapticActuators[0].pulse === "function") {
      gp.hapticActuators[0].pulse(intensidade, duracaoMs);
    } else if (gp.vibrationActuator && typeof gp.vibrationActuator.playEffect === "function") {
      gp.vibrationActuator.playEffect("dual-rumble", {
        startDelay: 0,
        duration: duracaoMs,
        weakMagnitude: intensidade * 0.7,
        strongMagnitude: intensidade,
      });
    }
  } catch (_) {
    /* haptica opcional: ignorar em emuladores ou browsers sem suporte */
  }
}

function voltarPorAtalho(lado) {
  if (state.transitioning) return;
  if (state.stage === "drill") {
    pulsarHaptica(lado, 0.3, 24);
    closeDrill();
  } else if (state.stage !== "selection") {
    pulsarHaptica(lado, 0.3, 24);
    navigateBack();
  }
}

function acaoRapidaBotaoA(lado) {
  if (state.transitioning) return;
  pulsarHaptica(lado, 0.26, 20);
  if (state.stage === "timeline" && state.guided) {
    skipGuided();
  } else if (state.stage === "timeline") {
    toggleNarration();
  } else {
    toggleVrNota();
  }
}

function navegarPorAnalogico(dir, lado) {
  if (state.transitioning || !dir) return;
  if (state.tourActive) {
    pulsarHaptica(lado, 0.22, 18);
    if (dir > 0) tourNext();
    else tourPrev();
    return;
  }
  if (state.stage === "timeline" && !state.guided) {
    pulsarHaptica(lado, 0.2, 16);
    stepYear(dir);
    return;
  }
  if (state.stage === "composicao") {
    pulsarHaptica(lado, 0.2, 16);
    stepCompYear(dir);
    return;
  }
  if (state.stage === "multiplos" && DADOS && DADOS.indicadores) {
    const idx = DADOS.indicadores.findIndex((ind) => ind.key === state.indicatorKey);
    const prox = (idx + dir + DADOS.indicadores.length) % DADOS.indicadores.length;
    pulsarHaptica(lado, 0.22, 18);
    enterMultiplos(DADOS.indicadores[prox].key, true);
  }
}

function ativarMaoControle(lado) {
  if (lado !== "right" && lado !== "left") return;
  if (state.activeHand === lado) return;
  state.activeHand = lado;
  atualizarModoEntrada();
  pulsarHaptica(lado, 0.16, 15);
}

// Tres jeitos de selecionar em VR, decididos pelo que o Quest esta rastreando
// AGORA (session.inputSources), e nao por eventos soltos de cada componente:
//   - "controle": controles Touch -> laser unico + gatilho + atalhos + haptica.
//   - "mao":      hand tracking   -> o olhar mira, a PINCA seleciona (o
//                 "select" do Quest vira clique no cursor de olhar); sem fuse,
//                 para olhar parado nao selecionar sozinho.
//   - "olhar":    nada rastreado  -> olhar + fuse (segurar 850 ms), como antes.
function bindVrCursorMode() {
  dom.scene.addEventListener("enter-vr", () => {
    state.vrHeightOffset = 0;
    state.seatedMode = false;
    resetCameraRig();                       // em VR o headset define a altura (rig y=0 + ajuste sentado)
    const sessao = dom.scene.xrSession;
    if (sessao && !sessao.__vrlabEntradas) {
      sessao.__vrlabEntradas = true;
      sessao.addEventListener("inputsourceschange", () => atualizarModoEntrada());
    }
    if (dom.vrHud) setEntityVisible(dom.vrHud, true); // HUD 2D some no headset -> mostra o 3D no mundo
    setVrNotaOpen(false);                             // recolhido por padrao para manter a vista livre
    atualizarBotaoAlturaVr();
    toggleClickable(".vr-hud-clickable", Boolean(dom.vrHud));
    atualizarModoEntrada(true);
    calibrarAlturaVr();
    setCaption(legendaAtual, true); // legenda em andamento passa para a 3D
    dismissOnboarding(); // overlay 2D nao aparece no headset; a placa #roomSign cobre VR
  });
  dom.scene.addEventListener("exit-vr", () => {
    state.vrInput = null;
    state.usingControllers = false;
    state.vrHeightOffset = 0;
    state.seatedMode = false;
    setGazeFuse(false);
    resetCameraRig();                       // desktop: volta a altura fixa (rig y=1.6)
    setVrNotaOpen(false);
    if (dom.vrHud) setEntityVisible(dom.vrHud, false); // desktop usa o HUD 2D
    toggleClickable(".vr-hud-clickable", false);
    setCaption(legendaAtual, false); // legenda em andamento volta para a barra 2D
    ["rightHand", "leftHand"].forEach((id) => {
      const h = document.getElementById(id);
      if (h) { setEntityVisible(h, false); h.setAttribute("raycaster", "enabled", false); h.setAttribute("raycaster", "showLine", false); }
    });
    atualizarInstrucoesEntrada();
  });
  setGazeFuse(false);
  bindControllers();
  bindDragGuard();
}

// Altura do rig: em VR o WebXR ja fornece a altura real do headset (local-floor);
// quando sentado, aplicamos vrHeightOffset para nivelar o olho a 1,6 m. No desktop, 1,6 m fixo.
function resetCameraRig() {
  const emVR = dom.scene && dom.scene.is && dom.scene.is("vr-mode");
  setVectorAttribute(dom.cameraRig, "position", emVR ? `0 ${round2(state.vrHeightOffset || 0)} 0` : "0 1.6 0");
}

// Le o que o Quest esta rastreando e aplica o modo de selecao (ver acima).
// Com dois controles Touch conectados, ambos ficam visiveis, mas apenas a mao
// ativa (`state.activeHand`) emite raio laser e raycaster (evita hovers da mao em repouso).
function atualizarModoEntrada(entrando) {
  if (!entrando && !dom.scene.is("vr-mode")) return;
  const sessao = dom.scene.xrSession;
  const fontes = sessao && sessao.inputSources ? Array.from(sessao.inputSources) : [];
  const controles = fontes.filter((f) => !f.hand && f.gamepad);
  const maos = fontes.filter((f) => !!f.hand);
  const modo = controles.length ? "controle" : maos.length ? "mao" : "olhar";

  state.vrInput = modo;
  state.usingControllers = modo === "controle";

  if (modo === "controle") {
    const temDir = controles.some((f) => f.handedness === "right");
    const temEsq = controles.some((f) => f.handedness === "left");
    if (state.activeHand === "right" && !temDir && temEsq) state.activeHand = "left";
    else if (state.activeHand === "left" && !temEsq && temDir) state.activeHand = "right";
  }

  ["rightHand", "leftHand"].forEach((id) => {
    const h = document.getElementById(id);
    if (!h) return;
    const lado = id === "rightHand" ? "right" : "left";
    const conectado = modo === "controle" && controles.some((f) => f.handedness === lado);
    const laserAtivo = conectado && state.activeHand === lado;
    setEntityVisible(h, conectado);
    h.setAttribute("raycaster", "enabled", laserAtivo);
    h.setAttribute("raycaster", "showLine", laserAtivo);
  });

  if (modo === "controle") setGazeFuse(false);
  else if (modo === "mao") setGazeMode(true, false);
  else setGazeFuse(true);
  atualizarInstrucoesEntrada();
  refreshRaycasters();
}

// Eventos dos controles Touch Plus: conexao, troca de laser unico, atalhos
// fisicos (B/Y voltar, X Como ler, A acao rapida, analogico mudar ano/cena,
// clique do analogico alternar altura) e feedback haptico.
function bindControllers() {
  const stickEstado = { right: { travado: false, ultimoMs: 0 }, left: { travado: false, ultimoMs: 0 } };
  const hoverHapticaMs = { right: 0, left: 0 };

  ["rightHand", "leftHand"].forEach((id) => {
    const hand = document.getElementById(id);
    if (!hand) return;
    const lado = id === "rightHand" ? "right" : "left";

    hand.addEventListener("controllerconnected", () => {
      atualizarModoEntrada();
      // laser-controls reativa showLine ao conectar o modelo; reaplica laser unico logo depois.
      setTimeout(() => atualizarModoEntrada(), 50);
    });
    hand.addEventListener("controllerdisconnected", () => atualizarModoEntrada());

    hand.addEventListener("raycaster-intersection", () => {
      if (!state.usingControllers || state.activeHand !== lado) return;
      const agora = performance.now();
      if (agora - hoverHapticaMs[lado] < 70) return;
      hoverHapticaMs[lado] = agora;
      pulsarHaptica(lado, 0.14, 15);
    });

    hand.addEventListener("triggerdown", () => {
      initAudio();
      if (!state.usingControllers) return;
      if (state.activeHand !== lado) {
        ativarMaoControle(lado);
        return;
      }
      const rc = hand.components && hand.components.raycaster;
      if (rc && rc.intersectedEls && rc.intersectedEls.length > 0) {
        pulsarHaptica(lado, 0.42, 30);
      }
    });

    hand.addEventListener("bbuttondown", () => voltarPorAtalho(lado));
    hand.addEventListener("ybuttondown", () => voltarPorAtalho(lado));
    hand.addEventListener("xbuttondown", () => { pulsarHaptica(lado, 0.24, 18); toggleVrNota(); });
    hand.addEventListener("abuttondown", () => acaoRapidaBotaoA(lado));
    hand.addEventListener("thumbstickdown", () => { pulsarHaptica(lado, 0.28, 22); alternarAlturaVr(); });

    hand.addEventListener("thumbstickmoved", (e) => {
      const x = e && e.detail ? Number(e.detail.x) : 0;
      const st = stickEstado[lado];
      if (Math.abs(x) < 0.25) {
        st.travado = false;
        return;
      }
      const agora = performance.now();
      if (st.travado || Math.abs(x) < 0.68 || agora - st.ultimoMs < 260) return;
      st.travado = true;
      st.ultimoMs = agora;
      navegarPorAnalogico(x > 0 ? 1 : -1, lado);
    });
  });
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
  setGazeMode(isEnabled, isEnabled);
}

// Olhar mirando (raycaster) e, separado, o fuse (selecionar segurando o olhar).
// Com as maos o olhar mira mas NAO seleciona sozinho: quem confirma e a pinca.
function setGazeMode(mira, fuse) {
  dom.gazeCursor.setAttribute("cursor", { fuse: !!fuse, fuseTimeout: 850 });
  dom.gazeCursor.setAttribute("raycaster", { enabled: !!mira, far: 40, interval: 16, objects: ".clickable" });
  // O anel (#gazeRing) so aparece em VR com o olhar mirando: o componente
  // reticulo-olhar (headset.js) cuida da visibilidade, profundidade e escala.
  const anel = document.getElementById("gazeRing");
  if (anel) anel.setAttribute("material", "opacity", mira ? 0.9 : 0.5);
  // O reticulo central so faz sentido em VR (gaze). No desktop o ponteiro e o mouse.
  setEntityVisible(dom.gazeCursor, !!mira);
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

// Nome curto do indicador para botoes/chips: "Taxa de Evasao" -> "Evasao",
// "Eficiencia Academica" -> "Eficiencia".
function rotuloIndicadorCurto(ind) {
  if (!ind) return "";
  return ind.label.replace(/^Taxa de\s+/i, "").replace(/\s+Academica$/i, "");
}

// No painel do HUD (titulo e trilha) a instituicao vai pela sigla: o nome
// completo ("Universidade Federal do Triangulo Mineiro") ocupava 2-3 linhas e
// o painel, com a legenda da comparacao embaixo, descia ate o canto do grafico.
// O nome completo continua no titulo 3D da tela de indicadores.
function rotuloTrilha(ctx) {
  return ctx && ctx.tipo === "instituicao" ? rotuloCurto(ctx) : rotuloContexto(ctx);
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

// Texto que precisa ficar em UMA linha: se for mais longo que o wrap padrao,
// o wrap cresce com ele (a letra diminui) em vez de quebrar e empurrar o
// bloco vizinho. Maiusculas sao ~10% mais largas que a media: dai a folga.
function textoUmaLinha(entity, texto, wrapBase) {
  const n = String(texto || "").length;
  entity.setAttribute("wrap-count", Math.max(wrapBase, Math.ceil(n * 1.12) + 1));
  entity.setAttribute("value", texto);
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
  // "x y z" e o formato que o vec3 do A-Frame entende. O antigo
  // ("x: 1; y: 2; z: 3") virava {x: NaN, y: 1, z: NaN} no componente; o
  // object3D era corrigido logo depois, mas uma entidade que so inicializava
  // depois desse acerto ficava em NaN - as 100 esferas do fechamento do tour
  // (#visceralParticles) nunca apareciam. Mesma correcao da versao minimalista.
  element.setAttribute(name, `${vector.x} ${vector.y} ${vector.z}`);
  applyObject3DVector(element, name, vector);
}

function parseVector(value) {
  if (value && typeof value === "object") return value;
  if (typeof value !== "string") return value;
  const parts = value.trim().split(/\s+/).map((p) => Number(p));
  if (parts.length !== 3 || parts.some((p) => Number.isNaN(p))) return null;
  return { x: parts[0], y: parts[1], z: parts[2] };
}

// Em sessao WebXR imersiva (Meta Quest Browser), window.requestAnimationFrame
// pode ficar pausado enquanto xrSession.requestAnimationFrame conduz o loop.
// Este helper usa automaticamente o loop ativo (XR em VR, window no desktop).
function proximoQuadro(cb) {
  const sessao = dom.scene && dom.scene.xrSession;
  if (sessao && typeof sessao.requestAnimationFrame === "function") {
    return sessao.requestAnimationFrame(cb);
  }
  return window.requestAnimationFrame(cb);
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
  proximoQuadro(applyAll);
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
  proximoQuadro(apply);
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
  const atualizar = () => {
    document.querySelectorAll("[raycaster]").forEach((entity) => {
      const component = entity.components?.raycaster;
      if (component) component.refreshObjects();
    });
  };
  atualizar();
  proximoQuadro(atualizar);
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

  try {
    state.stage = "multiplos";
    state.indicatorKey = indicadorKey;
    state.context = null;
    state.compareOn = false;

    resetCameraRig();
    setEntityVisible(dom.selectionWorld, false);
    setEntityVisible(dom.explorationWorld, true);
    setEntityVisible(dom.indicatorView, false);
    setEntityVisible(dom.timelineView, false);
    setEntityVisible(dom.composicaoView, false);
    setEntityVisible(dom.multiplosView, true);
    hideInfoPanelNow();
    atualizarLegendaComparacao();
    dom.compLegend.hidden = true;
    // O mini-mapa (hot-swap de um contexto) nao se aplica a visao "todas as regioes".
    closeMiniMap();
    setEntityVisible(dom.miniMapBase, false);

    buildMultiplosSelectors();
    buildMultiplos();
    animateViewIn(dom.multiplosView);

    dom.hudTitle.textContent = "Comparar regioes";
    dom.hudSubtitle.textContent = multiplosSubtitle;
    setNota("multiplos");
    setInteractionMode("multiplos");

    if (!skipFade) await fadeFromBlack();
  } finally {
    // So libera quem assumiu a transicao (skipFade = chamada de dentro de outra).
    if (!skipFade) state.transitioning = false;
  }
}

function buildMultiplosSelectors() {
  dom.multiplosSelectors.innerHTML = "";
  // Faixa mais estreita (1,4 de largura, passo 1,55): a linha inteira cabe entre
  // 25% e 75% da tela, longe do painel HUD do canto superior esquerdo.
  const w = 1.4;
  const passo = 1.55;
  let currentX = -((DADOS.indicadores.length - 1) * passo) / 2;
  DADOS.indicadores.forEach((ind) => {
    const isAtivo = ind.key === state.indicatorKey;
    const corBase = isAtivo ? ind.cor : "#16263f";
    const emissive = isAtivo ? ind.cor : "#2f5d8a";
    const int = isAtivo ? 0.35 : 0.2;

    const btn = el("a-entity", { position: `${round2(currentX)} 0 0` });
    const bg = el("a-box", {
      class: "multiplos-clickable hit",
      width: w, height: 0.42, depth: 0.08,
      material: `color: ${corBase}; roughness: 0.45; emissive: ${emissive}; emissiveIntensity: ${int}`
    });
    // Rotulo curto ("Taxa de Evasao" -> "Evasao", "Eficiencia Academica" ->
    // "Eficiencia"): uma palavra por botao, sem estourar a largura de 1,4.
    const label = el("a-text", {
      value: rotuloIndicadorCurto(ind), position: "0 0 0.05",
      width: 1.2, align: "center", color: isAtivo ? "#ffffff" : "#cfe9ff", ...FONTE_3D,
      "wrap-count": 12
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
    currentX += passo;
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
    // Titulo curto (1 linha) + nota curta (1 linha). A frase completa vai para o
    // HUD 2D (subtitulo), evitando um bloco de texto alto no cabecalho 3D.
    dom.multiplosTitle.setAttribute("value", `${indDef.label} por regiao (2024)`);
    dom.multiplosNote.setAttribute(
      "value",
      `${maxReg.ctx.nome} ${fmt(maxReg.val)}%  ·  ${minReg.ctx.nome} ${fmt(minReg.val)}%  ·  abismo de ${diff} pp`
    );
    multiplosSubtitle = `${maxReg.ctx.nome} ${pontaStr} (${fmt(maxReg.val)}%) e ${minReg.ctx.nome} ${baseStr} (${fmt(minReg.val)}%) — ${diff} pp de diferenca`;
  } else {
    dom.multiplosTitle.setAttribute("value", `${indDef.label} por regiao (2024)`);
    dom.multiplosNote.setAttribute("value", "");
    multiplosSubtitle = "Comparacao em mesma escala";
  }
  dom.hudSubtitle.textContent = multiplosSubtitle;

  // A amostra da legenda acompanha a cor do indicador selecionado.
  const legendSwatch = dom.multiplosLegend ? dom.multiplosLegend.querySelector("a-plane") : null;
  if (legendSwatch) legendSwatch.setAttribute("material", `color: ${indCor}; shader: flat; opacity: 0.8`);

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
    const hx = MULTIPLOS.w / 2 - 0.1; // margem interna do cabecalho do painel

    // Regua de separacao entre o cabecalho (nome + valor) e o mini-grafico:
    // deixa claro que o texto nao faz parte da area de plotagem.
    const headerRule = el("a-plane", {
      width: MULTIPLOS.w - 0.2, height: 0.006,
      position: `0 ${round2(MULTIPLOS.headerY - 0.11)} 0.02`,
      material: "color: #2f5d8a; opacity: 0.45; transparent: true; shader: flat",
    });

    const title = el("a-text", {
      value: titleText, position: `${round2(-hx)} ${MULTIPLOS.headerY} 0.02`, width: 2.1,
      align: "left", anchor: "left", color: headerCor, ...FONTE_3D
    });
    const valText = el("a-text", {
      value: `${fmt(item.val)}%`, position: `${round2(hx)} ${MULTIPLOS.headerY} 0.02`, width: 2.1,
      align: "right", anchor: "right", color: indCor, ...FONTE_3D
    });

    const hit = el("a-plane", {
      class: "multiplos-clickable hit",
      width: MULTIPLOS.w, height: MULTIPLOS.h, position: "0 0 0.05",
      material: "color: #ffffff; opacity: 0.001; transparent: true; depthWrite: false"
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
      dom.hudSubtitle.textContent = multiplosSubtitle;
    });
    
    panel.append(bg, headerRule, title, valText, hit);
    buildMiniChart(panel, item.ctx, key, DADOS.brasil);
    dom.multiplosGrid.appendChild(panel);
    // Aplica as transformacoes (posicao do painel + filhos) no object3D; sem isto o
    // painel fica na origem do mundo e todo o conteudo some do campo de visao.
    applyPendingTransforms(panel);
  });

  crumb("Mapa", "Comparar regioes", indDef.label);
}

function buildMiniChart(container, ctx, key, brasilCtx) {
  const series = ctx.series[key];
  const brasilSeries = brasilCtx.series[key];
  const indDef = indicadorByKey(key);

  const paddingX = MULTIPLOS.chartPadX;
  const bottomY = MULTIPLOS.chartBottom;
  const topY = MULTIPLOS.chartTop;
  const width = MULTIPLOS.w - paddingX * 2;
  const height = topY - bottomY;
  const n = series.length;
  const stepX = width / (n - 1);

  const localY = (val) => bottomY + (val / 100) * height;
  const localX = (idx) => -width / 2 + idx * stepX;
  // Mantem o comprimento da serie (null = ano sem matricula) para preservar gaps.
  const ptsFrom = (s) => s.map((v, i) => (v == null ? null : { x: localX(i), y: localY(v) }));

  // Linha de base (0%): ancora visual do mini-grafico.
  const base = el("a-plane", {
    width: width + 0.08, height: 0.006, position: `0 ${round2(bottomY)} 0.01`,
    material: "color: #2f5d8a; opacity: 0.4; transparent: true; shader: flat",
  });
  container.appendChild(base);
  applyPendingTransforms(base);

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

