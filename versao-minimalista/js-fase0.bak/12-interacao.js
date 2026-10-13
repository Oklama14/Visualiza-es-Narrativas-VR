// ----------------------------------------------------------------------------
// Modo de interacao (protege contra cliques fantasmas em objetos ocultos).
// ----------------------------------------------------------------------------

function setInteractionMode(mode) {
  tlog("modo", { modo: mode, etapa: state.stage }); // telemetria (no-op fora do estudo)
  toggleClickable(".home-clickable", mode === "home");
  toggleClickable(".gallery-clickable", mode === "gallery");
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
  state.vrMode = isEnabled;
  // Fase 0.5: em VR o WASD desliga (movimento artificial continuo = cinetose);
  // o deslocamento vem de passos reais ou do teleporte entre estacoes.
  setWasdEnabled(!isEnabled);
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
  playTransitionChime();
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

