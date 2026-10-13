// ----------------------------------------------------------------------------
// Fase 1 - Percurso narrativo: estacoes fisicas, wayfinding e ativacao por
// proximidade (strollytelling estrutural). O componente `station` emite
// station-enter/leave; aqui decidimos O QUE acontece ao chegar em cada lugar.
// ----------------------------------------------------------------------------

// Pontos de observacao (= origem dos containers stX no index.html).
const STATION_SPOTS = {
  home:        { x: 0,    z: 2.2,  rot: 0,   nome: "Inicio" },
  mapa:        { x: -3.9, z: 0.9,  rot: 40,  nome: "Mapa do Brasil" },
  indicadores: { x: 3.9,  z: 0.9,  rot: -40, nome: "Indicadores" },
  timeline:    { x: 0,    z: -5.2, rot: 0,   nome: "Corredor do Tempo" },
  composicao:  { x: -4.2, z: -4.6, rot: 90,  nome: "Para onde vao os alunos" },
  comparacao:  { x: 4.2,  z: -4.6, rot: -90, nome: "Comparar regioes" },
};

const STATION_ORDER = ["home", "mapa", "indicadores", "timeline", "composicao", "comparacao"];

// Coloca o usuario no ponto de observacao (sem blink - usar dentro de fades).
function placeAtStation(id) {
  const s = STATION_SPOTS[id];
  if (!s) return;
  setVectorAttribute(dom.cameraRig, "position", `${s.x} 1.6 ${s.z}`);
  setVectorAttribute(dom.cameraRig, "rotation", `0 ${s.rot} 0`);
  state.currentStation = id;
  setWayfindingActive(id);
  // Sincroniza as zonas com a nova posicao (senao uma estacao cuja zona ainda
  // contem o destino fica latched e nunca mais dispara ao voltar caminhando).
  if (typeof resyncStations === "function") requestAnimationFrame(resyncStations);
}

// Teleporte com blink de conforto: o fallback de quem nao quer/pode caminhar
// (Fase 1.6 - a experiencia inteira e completavel sem andar).
async function blinkToStation(id) {
  if (!STATION_SPOTS[id]) return;
  comfortBlink();
  await wait(90);
  placeAtStation(id);
  tlog("teleporte", { para: id });
}

// Dica curta na legenda quando falta um prerequisito narrativo.
let stationHintTimer = null;
function stationHint(texto) {
  if (state.narrating || state.guided) return;
  setCaption(texto);
  clearTimeout(stationHintTimer);
  stationHintTimer = setTimeout(() => { if (!state.narrating) setCaption(""); }, 4000);
}

// Ativacao por chegada: reativa a cena se ela ja existe, constroi quando da,
// e orienta quando falta escolha previa (integridade narrativa preservada).
function onStationEnter(id) {
  if (state.transitioning || state.tourActive || state.guided) return;
  state.currentStation = id;

  switch (id) {
    case "home":
      if (state.stage !== "selection" || state.selectionView !== "home") {
        showHome();
        animateViewIn(dom.homeView); // 3.1: a cena "recebe" quem chega
      }
      break;

    case "mapa":
      if (dom.drillCards.object3D && dom.drillCards.object3D.visible) {
        state.stage = "drill";
        setInteractionMode("drill");
        setNota("drill");
      } else if (state.stage !== "selection" || state.selectionView !== "map") {
        showMapSelection();
        animateViewIn(dom.mapView);
      }
      break;

    case "indicadores":
      if (!state.context) {
        stationHint("Escolha um contexto no Mapa do Brasil para ativar os indicadores.");
        return;
      }
      if (state.stage !== "indicators") {
        state.stage = "indicators";
        setEntityVisible(dom.multiplosView, false);
        if (!(dom.indicatorView.object3D && dom.indicatorView.object3D.visible)) {
          setEntityVisible(dom.indicatorView, true);
          populateIndicators(state.context);
        }
        resetMiniMap(); // a comparacao esconde o mini-mapa; ao voltar, ele volta
        setInteractionMode("indicators");
        setNota("indicadores");
        animateViewIn(dom.indicatorView);
        dom.hudTitle.textContent = rotuloContexto(state.context);
        dom.hudSubtitle.textContent = "Escolha um indicador para abrir o Corredor do Tempo";
      }
      break;

    case "timeline":
      if (!state.context || !state.indicatorKey) {
        stationHint("Este e o Corredor do Tempo: escolha um contexto e um indicador para ativa-lo.");
        return;
      }
      if (state.stage !== "timeline") {
        if (dom.timelineView.object3D && dom.timelineView.object3D.visible) {
          state.stage = "timeline";
          setEntityVisible(dom.multiplosView, false);
          setEntityVisible(dom.composicaoView, false);
          resetMiniMap();
          setInteractionMode("timeline");
          setNota("timeline");
          animateViewIn(dom.timelineView);
        } else {
          enterTimeline(state.indicatorKey, true, true); // revisita a pe: sem abertura, sem teleporte
        }
      }
      break;

    case "composicao":
      if (!state.context) {
        stationHint("Escolha um contexto no mapa para ver para onde vao os alunos.");
        return;
      }
      if (state.stage !== "composicao") enterComposicao(true); // fromWalk
      break;

    case "comparacao":
      if (state.stage !== "multiplos") {
        enterMultiplos(state.indicatorKey || "eficiencia", true, true); // skipFade, fromWalk
      }
      break;
  }
}

// Arbitragem entre zonas que se tocam: o Corredor do Tempo precisa de uma zona
// larga (6 m de caminhada) e por isso encosta em Composicao/Comparacao. Em vez
// de espremer a geometria, quem ATIVA e sempre a estacao mais PROXIMA - assim a
// sobreposicao deixa de ser um problema (nada de cenas trocando na fronteira).
// Importante: so competem as estacoes em cuja ZONA o visitante esta de fato
// (st.inside). Nas pontas do Corredor do Tempo (x = +/-3) o centro geometrico
// de Composicao/Comparacao chega a ficar mais perto, mas o visitante nao entrou
// naquelas zonas - e o Corredor que deve continuar valendo.
function nearestStationId() {
  const cam = document.getElementById("camera");
  if (!cam || !cam.object3D || !window.AFRAME) return null;
  const c = new AFRAME.THREE.Vector3();
  const p = new AFRAME.THREE.Vector3();
  cam.object3D.getWorldPosition(c);
  let melhor = null;
  let menor = Infinity;
  STATION_ORDER.forEach((id) => {
    const st = getStation(id);
    if (!st || !st.inside || !st.el.object3D) return;
    st.el.object3D.getWorldPosition(p);
    const d = Math.hypot(c.x - p.x, c.z - p.z);
    if (d < menor) { menor = d; melhor = id; }
  });
  return melhor;
}

function initStations() {
  STATION_ORDER.forEach((id) => {
    const st = getStation(id);
    if (!st) return;
    st.el.addEventListener("station-enter", () => {
      if (nearestStationId() !== id) return; // outra estacao esta mais perto
      playStationMotif(id, st.el); // 3.3: leitmotiv emana do lugar
      setWayfindingActive(id); // 3.1: disco "voce esta aqui"
      onStationEnter(id);
    });
  });
  buildWayfinding();
}

// 3.1: realca o disco da estacao atual no piso (e apaga o realce das demais).
function setWayfindingActive(id) {
  Object.entries(wayDiscs).forEach(([sid, disco]) => {
    const on = sid === id;
    disco.setAttribute(
      "material",
      `color: ${on ? "#4cc9f0" : "#2f5d8a"}; opacity: ${on ? 0.9 : 0.55}; transparent: true; shader: flat`
    );
  });
}

// Trilha luminosa no piso + disco e nome de cada estacao (Fase 1.4):
// referenciais fisicos que ancoram a memoria espacial da informacao.
let wayDiscs = {};

function buildWayfinding() {
  const root = document.getElementById("wayfinding");
  if (!root) return;
  root.innerHTML = "";
  wayDiscs = {};

  STATION_ORDER.forEach((id) => {
    const s = STATION_SPOTS[id];
    const disco = el("a-ring", {
      position: `${s.x} 0.02 ${s.z}`, rotation: "-90 0 0",
      radiusInner: 0.5, radiusOuter: 0.56,
      material: "color: #2f5d8a; opacity: 0.55; transparent: true; shader: flat",
    });
    const nome = el("a-text", {
      value: s.nome, position: `${s.x} 0.03 ${s.z + 0.85}`, rotation: "-90 0 0",
      width: 2.6, align: "center", color: "#7d9cc4", font: "kelsonsans",
    });
    root.append(disco, nome);
    applyPendingTransforms(disco);
    applyPendingTransforms(nome);
    wayDiscs[id] = disco;
  });

  for (let i = 0; i < STATION_ORDER.length - 1; i += 1) {
    const a = STATION_SPOTS[STATION_ORDER[i]];
    const b = STATION_SPOTS[STATION_ORDER[i + 1]];
    const dx = b.x - a.x;
    const dz = b.z - a.z;
    const len = Math.hypot(dx, dz) - 1.3; // folga para nao invadir os discos
    if (len <= 0) continue;
    // altura do plano corre na direcao (dx,dz): yaw = atan2(-dx,-dz) (ordem YXZ).
    const ang = (Math.atan2(-dx, -dz) * 180) / Math.PI;
    const seg = el("a-plane", {
      width: 0.06, height: round2(len), rotation: `-90 ${round2(ang)} 0`,
      position: `${round2((a.x + b.x) / 2)} 0.015 ${round2((a.z + b.z) / 2)}`,
      material: "color: #24476e; opacity: 0.5; transparent: true; shader: flat",
    });
    root.appendChild(seg);
    applyPendingTransforms(seg);
  }
}
