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
  home: {
    titulo: "Duas formas de ler",
    corpo:
      "As historias guiadas seguem a estrutura Martini Glass: comecam conduzidas pelo autor e terminam com voce explorando livremente. Se preferir, va direto aos dados pelo mapa.",
  },
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
      "A linha mostra a tendencia de 2017 a 2024; os callouts marcam o pico e o melhor ano. Caminhe para os lados (WASD ou passos em VR) para percorrer os anos com o proprio corpo - strollytelling. Os numeros absolutos revelam a escala por tras da taxa.",
  },
  composicao: {
    titulo: "Para onde vao os alunos",
    corpo:
      "Cada torre e um ano normalizado a 100 blocos. A parede a direita amplia o ano em foco: cada bloco e 1% dos estudantes - verde concluiu, amarelo segue retido, vermelho evadiu.",
  },
  multiplos: {
    titulo: "Comparacao regional",
    corpo:
      "Brasil e as 5 regioes lado a lado. Todos usam a mesma escala de 0 a 100% para revelar a desigualdade. A linha pontilhada mostra a media nacional para referencia rapida.",
  },
};

document.addEventListener("DOMContentLoaded", () => {
  const ids = [
    "scene", "selectionWorld", "explorationWorld", "drillCards",
    "drillBack", "indicatorView", "indicatorObjects", "infoPanel", "infoTitle",
    "infoValue", "infoDescription", "infoAccent", "infoOpenBtn", "contextKicker",
    "contextTitle", "contextLead", "indicatorGlow", "timelineView",
    "chartGlow", "chartPanel", "chartGrid", "focusBand", "timelineBars",
    "compareBars", "trendLine", "markers", "yearTicks", "annotations",
    "valueReadout", "narrativeTitle", "narrativeText", "narrativeYear",
    "guidedHint", "scrubberRow", "actionRow", "ctrlPrevYear", "ctrlNextYear",
    "ctrlYearLabel", "ctrlCompare", "ctrlCompareLabel", "ctrlSound",
    "ctrlSoundLabel", "ctrlReplay", "ctrlSkip",
    "backButton", "backLabel", "selectionTitle", "selectionLead", "selectionKicker",
    "transitionOverlay", "vrFade", "gazeCursor", "cameraRig", "camera", "hudTitle",
    "hudSubtitle", "hudLegend", "legendPrimary", "legendCompare", "stageSpot",
    "notaTitle", "notaBody",
    "compEnter", "composicaoView", "compGlow", "compPanel", "compScene",
    "compTitle", "compText", "compReadout", "compScrubber", "compYearLabel",
    "compPrev", "compNext", "compLegend", "compWall",
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
    "captionPanel", "visceralParticles",
    "homeView", "homeStory", "homeExplore", "galleryTitle", "galleryBack", "exploreBack", "walkStrip",
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
  bindHomeButtons();
  bindInfoOpen();
  bindDrillBack();
  bindBackButton();
  bindTimelineControls();
  bindCompControls();
  bindTourControls();
  bindVrCursorMode();
  document.addEventListener("pointerdown", initAudio, { once: true }); // autoplay policy
  startWalkLoop(); // strollytelling: caminhar percorre os anos na linha do tempo
  showHome();
  hideLoading(); // cena + dados prontos: remove o indicador de carregamento.
}

function hideLoading() {
  const o = document.getElementById("loadingOverlay");
  if (o) o.hidden = true;
}

function setNota(chave) {
  const nota = NOTAS[chave];
  if (!nota) return;
  dom.notaTitle.textContent = nota.titulo;
  dom.notaBody.textContent = nota.corpo;
  // Em VR o HUD 2D (DOM) nao existe no headset: ecoa o essencial da nota no
  // captionPanel acoplado a camera, para as duas condicoes do estudo verem o
  // mesmo scaffolding interpretativo.
  notifyVRNote(`${nota.titulo}: ${primeiraFrase(nota.corpo)}`);
}

let vrNoteTimer = null;

function primeiraFrase(texto) {
  const i = texto.indexOf(". ");
  return i > 0 ? texto.slice(0, i + 1) : texto;
}

function notifyVRNote(texto) {
  if (!state.vrMode || state.narrating || state.guided) return;
  setCaption(texto);
  clearTimeout(vrNoteTimer);
  vrNoteTimer = setTimeout(() => {
    if (!state.narrating) setCaption("");
  }, 6000);
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
  // (fix) O giro por mouse ja vem habilitado no proprio #camera (index.html).
  // A versao anterior aplicava look-controls na <a-scene>, que nao tem efeito.
}

