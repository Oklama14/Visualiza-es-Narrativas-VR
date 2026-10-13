// ----------------------------------------------------------------------------
// Etapa 1 - Selecao de contexto e drill-down.
// ----------------------------------------------------------------------------

function openDrill(region) {
  state.stage = "drill";
  state.drillRegion = region;
  dom.drillCards.innerHTML = "";

  // 6 colunas em ARCO (raio 3,4 m, +/-48 graus) mantem ate 24 cards - a maior
  // regiao, Nordeste - em 4 fileiras, todas dentro da sala e dentro do FOV.
  const entradas = [{ ...region, _rotulo: "Regiao inteira" }, ...region.instituicoes];
  const positions = arcPositions(entradas.length, 6, 3.4, 48, 0.7, 2.5);

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
  hideHomeSubviews(); // galeria inteira (cards + titulo + botao voltar)
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
  crumb("Inicio", "Mapa", `Regiao ${region.nome}`);
  setNota("drill");
  setInteractionMode("drill");
}

function closeDrill() {
  state.stage = "selection";
  state.drillRegion = null;
  state.history = []; // voltou ao mapa: zera a pilha de navegacao.
  updateBackLabel();
  setEntityVisible(dom.drillCards, false);
  setEntityVisible(dom.drillBack, false);
  showMapSelection();
}

// Mostra a visao principal de mapa (esconde o cabecalho/grid do drill).
// ---- Sub-vistas da selecao (Fase 1: home e mapa sao ESTACOES distintas). ----

// O sub-menu de historias mora na estacao Inicio; o mapa fica SEMPRE visivel
// na estacao Mapa (persistencia espacial = ancora de memoria, Liu et al. 2024).
function hideHomeSubviews() {
  setEntityVisible(dom.tourGallery, false);
  setEntityVisible(dom.galleryTitle, false);
  setEntityVisible(dom.galleryBack, false);
}

function showHome(teleport) {
  state.stage = "selection";
  state.selectionView = "home";
  hideHomeSubviews();
  setEntityVisible(dom.homeView, true);
  setEntityVisible(dom.roomSign, true);
  setEntityVisible(dom.mapPreview, false);
  setEntityVisible(dom.miniMapBase, false);
  dom.hudTitle.textContent = "Como voce quer comecar?";
  dom.hudSubtitle.textContent = "Historia guiada, exploracao livre - ou simplesmente caminhe pela sala";
  crumb("Inicio");
  setNota("home");
  setInteractionMode("home");
  if (teleport) blinkToStation("home");
}

// Galeria de historias (submenu de "Ver a historia", na estacao Inicio).
function showGallery() {
  state.stage = "selection";
  state.selectionView = "gallery";
  setEntityVisible(dom.homeView, false);
  setEntityVisible(dom.tourGallery, true);
  setEntityVisible(dom.galleryTitle, true);
  setEntityVisible(dom.galleryBack, true);
  setEntityVisible(dom.mapPreview, false);
  setEntityVisible(dom.miniMapBase, false);
  dom.hudTitle.textContent = "Escolha uma historia";
  dom.hudSubtitle.textContent = "Tres percursos guiados pelos dados";
  crumb("Inicio", "Historias");
  setNota("home");
  setInteractionMode("gallery");
}

// Exploracao livre: estacao Mapa (o drill troca o conteudo DESTA estacao).
function showMapSelection(teleport) {
  state.stage = "selection";
  state.selectionView = "map";
  // A galeria de historias mora na MESMA estacao da home: sem isto, ir da
  // galeria para o mapa (a pe ou pelo botao) deixava os cards das historias
  // sobrepostos aos cards da home na estacao Inicio.
  hideHomeSubviews();
  setEntityVisible(dom.homeView, true); // a home persiste na estacao dela
  setEntityVisible(dom.mapView, true);
  setEntityVisible(dom.mapKicker, true);
  setEntityVisible(dom.mapTitle, true);
  setEntityVisible(dom.drillCards, false);
  setEntityVisible(dom.drillBack, false);
  setEntityVisible(dom.selectionKicker, false);
  setEntityVisible(dom.selectionTitle, false);
  setEntityVisible(dom.selectionLead, false);
  setEntityVisible(dom.mapPreview, false);
  setEntityVisible(dom.miniMapBase, false);
  dom.hudTitle.textContent = "Escolha uma regiao";
  dom.hudSubtitle.textContent = "Olhe para uma regiao no mapa; clique para explorar";
  crumb("Inicio", "Mapa do Brasil");
  setNota("selecao");
  setInteractionMode("selection");
  if (teleport) blinkToStation("mapa");
}

// Botoes da home/galeria/mapa: navegam E teleportam entre as estacoes (1.6).
function bindHomeButtons() {
  const hoverFx = (container, hit) => {
    hit.addEventListener("mouseenter", () => container.setAttribute("animation__h", "property: scale; to: 1.05 1.05 1.05; dur: 150"));
    hit.addEventListener("mouseleave", () => container.setAttribute("animation__h", "property: scale; to: 1 1 1; dur: 150"));
  };
  const storyHit = dom.homeStory.querySelector(".home-clickable");
  storyHit.addEventListener("click", () => { if (!state.transitioning) showGallery(); });
  hoverFx(dom.homeStory, storyHit);

  const exploreHit = dom.homeExplore.querySelector(".home-clickable");
  exploreHit.addEventListener("click", () => { if (!state.transitioning) showMapSelection(true); });
  hoverFx(dom.homeExplore, exploreHit);

  const galleryHit = dom.galleryBack.querySelector(".gallery-clickable");
  galleryHit.addEventListener("click", () => { if (!state.transitioning) showHome(); });
  hoverFx(dom.galleryBack, galleryHit);

  const exploreBackHit = dom.exploreBack.querySelector(".selection-clickable");
  exploreBackHit.addEventListener("click", () => { if (!state.transitioning) showHome(true); });
  hoverFx(dom.exploreBack, exploreBackHit);
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
  dom.miniMapBase.setAttribute("animation__pos", "property: position; to: 0 -0.05 -1.15; dur: 240; easing: easeOutQuad");
  dom.miniMapBase.setAttribute("animation__scale", "property: scale; to: 0.3 0.3 0.3; dur: 240; easing: easeOutQuad");
  refreshRaycasters();
}

function closeMiniMap() {
  state.miniMapOpen = false;
  setEntityVisible(dom.miniMapContent, false);
  setEntityVisible(dom.miniMapTab, true);
  dom.miniMapContent.querySelectorAll(".minimap-region").forEach((e) => e.classList.remove("clickable"));
  dom.miniMapBase.setAttribute("animation__pos", "property: position; to: 0.66 -0.4 -1.4; dur: 200; easing: easeOutQuad");
  dom.miniMapBase.setAttribute("animation__scale", "property: scale; to: 0.22 0.22 0.22; dur: 200; easing: easeOutQuad");
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

