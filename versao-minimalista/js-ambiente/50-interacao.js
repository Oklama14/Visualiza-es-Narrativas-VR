// ----------------------------------------------------------------------------
// INTERACAO: o olhar foca, a pinca confirma.
//
// O desenho e explicito: o que poe uma regiao "em foco" e o RAIO DE GAZE. A mao
// so confirma. Isso evita a fadiga do gaze-fuse (olhar parado 1,2 s a cada
// alvo) e a selecao acidental de quem so esta passando o olho pelo mapa.
//
// Tres entradas, mesma semantica:
//   - Quest 2 com hand tracking .... pinca (polegar + indicador)
//   - Quest 2 com controles ........ gatilho
//   - Desktop ...................... clique do mouse
// ----------------------------------------------------------------------------

const DWELL_IN = 140; // ms olhando antes de assumir o foco (anti-tremor)
const DWELL_OUT = 260; // ms fora antes de largar o foco (anti-piscada)

let hoverEl = null; // alvo sob o olhar AGORA (a pinca age sobre este)
let dwellInTimer = null;
let dwellOutTimer = null;

// ---------------------------------------------------------------------------
// Foco
// ---------------------------------------------------------------------------

function setFoco(id) {
  if (state.focoId === id) return;
  state.focoId = id;
  pintarFoco();
  updateMapa();
  if (!state.painelAberto) updateContexto();
  if (id) {
    const r = regioesEls[id];
    playRegionMotif(id, r ? r.grupo : null);
    tlog("foco", { regiao: id });
  }
}

function registrarAlvo(entidade) {
  entidade.addEventListener("mouseenter", () => {
    hoverEl = entidade;
    clearTimeout(dwellOutTimer);
    clearTimeout(dwellInTimer);
    if (entidade.dataset.regiao) {
      const id = entidade.dataset.regiao;
      dwellInTimer = setTimeout(() => setFoco(id), DWELL_IN);
    }
    realce(entidade, true);
  });

  entidade.addEventListener("mouseleave", () => {
    if (hoverEl === entidade) hoverEl = null;
    clearTimeout(dwellInTimer);
    if (entidade.dataset.regiao) {
      dwellOutTimer = setTimeout(() => {
        // Perder o foco nao fecha o painel: a leitura continua disponivel.
        if (!hoverEl || !hoverEl.dataset.regiao) setFoco(null);
      }, DWELL_OUT);
    }
    realce(entidade, false);
  });

  // Desktop: o clique do mouse confirma direto.
  entidade.addEventListener("click", () => confirmar(entidade));
}

// Realce imediato para alvos que nao sao regiao (indicador, ano, teleporte):
// resposta instantanea ao olhar, sem esperar o dwell.
function realce(entidade, on) {
  if (entidade.dataset.indicador) {
    const c = colunaEls[entidade.dataset.indicador];
    if (c && entidade.dataset.indicador !== state.indicadorKey) {
      setEntityVisible(c.halo, on);
      c.halo.setAttribute("material", "color", "#7fd4ff");
    }
  }
  if (entidade.dataset.ano != null) {
    const a = anoEls.find((x) => x.i === Number(entidade.dataset.ano));
    if (a && a.i !== state.anoIdx) {
      a.ponto.setAttribute("animation__h", `property: scale; to: ${on ? "1.3 1.3 1.3" : "1 1 1"}; dur: 120`);
    }
  }
  if (entidade.dataset.destino || entidade.dataset.acao) {
    entidade.parentNode.setAttribute("animation__h", `property: scale; to: ${on ? "1.12 1.12 1.12" : "1 1 1"}; dur: 130`);
  }
}

// ---------------------------------------------------------------------------
// Confirmacao (pinca / gatilho / clique)
// ---------------------------------------------------------------------------

function confirmar(alvo) {
  const e = alvo || hoverEl;
  if (!e || state.transitioning) return;

  if (e.dataset.regiao) {
    abrirPainel(e.dataset.regiao);
    return;
  }
  if (e.dataset.indicador) {
    trocarIndicador(e.dataset.indicador);
    return;
  }
  if (e.dataset.ano != null) {
    selecionarAno(Number(e.dataset.ano), true);
    return;
  }
  if (e.dataset.destino) {
    irPara(e.dataset.destino);
    return;
  }
  if (e.dataset.acao === "fechar") {
    fecharPainel();
    return;
  }
  if (e.dataset.acao === "som") {
    toggleSound();
  }
}

function trocarIndicador(key) {
  if (state.indicadorKey === key) return;
  state.indicadorKey = key;
  state.anoIdx = null;
  tlog("indicador", { key });
  updateMapa();
  if (state.painelAberto) renderPainel();
  updateContexto();
  const c = colunaEls[key];
  if (c) playSparkle(c.grupo);
}

// ---------------------------------------------------------------------------
// Painel emergente: nasce sobre a regiao e sobe.
// ---------------------------------------------------------------------------

function abrirPainel(id) {
  const r = regioesEls[id];
  if (!r) return;

  const jaAberto = state.painelAberto && state.regiaoId === id;
  state.regiaoId = id;
  state.anoIdx = null;
  setFoco(id);
  renderPainel();
  updateContexto();
  updateMapa();

  const p = new AFRAME.THREE.Vector3();
  r.grupo.object3D.getWorldPosition(p);

  // O painel encara quem o chamou: fica ancorado no lugar, mas legivel.
  const cam = document.getElementById("camera");
  const cp = new AFRAME.THREE.Vector3();
  if (cam && cam.object3D) cam.object3D.getWorldPosition(cp);
  const destino = { x: PLANTA.painel.cx, z: PLANTA.painel.cz };
  const guinada = cam ? encarar(destino, { x: cp.x, z: cp.z }) : 40;
  dom.painel.setAttribute("rotation", `-8 ${guinada} 0`);

  // Fio que liga a regiao ao painel (o tracejado do desenho).
  dom.fio.setAttribute("position", `${round2(p.x)} ${round2((0.86 + PLANTA.painel.baseY) / 2)} ${round2(p.z)}`);
  dom.fio.setAttribute("height", round2(PLANTA.painel.baseY - 0.86));

  setEntityVisible(dom.painel, true);
  setEntityVisible(dom.fio, true);
  setClickable(dom.painelFechar, true);

  if (!jaAberto) {
    dom.painel.setAttribute("position", `${round2(p.x)} ${PLANTA.painel.subidaDe} ${round2(p.z)}`);
    dom.painel.setAttribute("scale", "0.5 0.5 0.5");
    dom.painel.setAttribute("animation__sobe", {
      property: "position",
      from: `${round2(p.x)} ${PLANTA.painel.subidaDe} ${round2(p.z)}`,
      to: `${PLANTA.painel.cx} ${PLANTA.painel.cy} ${PLANTA.painel.cz}`,
      dur: 620,
      easing: "easeOutCubic",
    });
    dom.painel.setAttribute("animation__cresce", {
      property: "scale",
      from: "0.5 0.5 0.5",
      to: "1 1 1",
      dur: 620,
      easing: "easeOutCubic",
    });
    playEmergeChime(dom.painel);
    setCaption("Olhe para um ano no gráfico e belisque para abrir aquele ano.", 6000);
  }

  state.painelAberto = true;
  tlog("painel", { evento: "abrir", regiao: id });
  refreshRaycasters();
}

function fecharPainel() {
  if (!state.painelAberto) return;
  state.painelAberto = false;
  state.regiaoId = null;
  state.anoIdx = null;
  setClickable(dom.painelFechar, false);
  dom.painel.removeAttribute("animation__sobe");
  dom.painel.removeAttribute("animation__cresce");
  setEntityVisible(dom.painel, false);
  setEntityVisible(dom.fio, false);
  pintarFoco();
  updateMapa();
  updateContexto();
  tlog("painel", { evento: "fechar" });
  refreshRaycasters();
}

// ---------------------------------------------------------------------------
// Locomocao: passos reais + teleporte com blink (guardian pequeno)
// ---------------------------------------------------------------------------

function comfortBlink(ms = 150) {
  const overlay = document.getElementById("transitionOverlay");
  if (overlay) {
    overlay.classList.add("is-active");
    setTimeout(() => overlay.classList.remove("is-active"), ms);
  }
  if (dom.vrFade) {
    setEntityVisible(dom.vrFade, true);
    dom.vrFade.setAttribute("material", "opacity", 1);
    setTimeout(() => {
      dom.vrFade.setAttribute("material", "opacity", 0);
      setTimeout(() => setEntityVisible(dom.vrFade, false), 140);
    }, ms);
  }
}

const DESTINOS = {
  usuario: { x: PLANTA.usuario.x, z: PLANTA.usuario.z, olhar: PLANTA.mapa },
  entrada: { x: PLANTA.entrada.x, z: PLANTA.entrada.z, olhar: PLANTA.mapa },
  contexto: {
    x: PLANTA.contexto.cx,
    z: PLANTA.contexto.cz + PLANTA.contexto.d / 2 + 0.55,
    olhar: { cx: PLANTA.contexto.cx, cz: PLANTA.contexto.cz },
  },
};

async function irPara(nome) {
  const d = DESTINOS[nome];
  if (!d) return;
  const rig = document.getElementById("cameraRig");
  if (!rig) return;
  comfortBlink();
  await wait(95);
  // Rig SEMPRE no chao (y = 0): em VR a altura vem do headset. Somar 1,6 aqui
  // faria o visitante flutuar a 3,2 m dentro do Quest.
  rig.setAttribute("position", `${d.x} 0 ${d.z}`);
  const alvo = { x: d.olhar.cx != null ? d.olhar.cx : d.olhar.x, z: d.olhar.cz != null ? d.olhar.cz : d.olhar.z };
  rig.setAttribute("rotation", `0 ${olharPara({ x: d.x, z: d.z }, alvo)} 0`);
  tlog("teleporte", { destino: nome });
}

// ---------------------------------------------------------------------------
// Entradas do Quest 2 e do desktop
// ---------------------------------------------------------------------------

function bindEntradas() {
  document.querySelectorAll(".clickable, .alvo-teleporte, .alvo-acao").forEach(registrarAlvo);

  const scene = document.getElementById("scene");

  // Hand tracking: a pinca e o "clique". Duas maos, mesma acao.
  ["handLeft", "handRight"].forEach((id) => {
    const m = document.getElementById(id);
    if (!m) return;
    m.addEventListener("pinchstarted", () => {
      state.maoAtiva = true;
      tlog("pinca", { mao: id });
      confirmar(null);
    });
    // A mao apareceu: o visitante esta sem controles, entao a dica muda.
    m.addEventListener("controllerconnected", () => {
      state.maoAtiva = true;
      setCaption("Mãos reconhecidas. Olhe para um alvo e belisque para confirmar.", 5000);
    });
  });

  // Controles Touch: gatilho (ou aperto) equivalem a pinca.
  ["ctrlLeft", "ctrlRight"].forEach((id) => {
    const c = document.getElementById(id);
    if (!c) return;
    ["triggerdown", "gripdown"].forEach((ev) => c.addEventListener(ev, () => confirmar(null)));
  });

  // Cursor de olhar: so no headset. No desktop quem mira e o mouse.
  scene.addEventListener("enter-vr", () => {
    state.vrMode = true;
    const cam = document.getElementById("camera");
    if (cam) {
      // local-floor: a altura real vem do headset, entao a camera volta a 0.
      cam.setAttribute("position", "0 0 0");
      cam.setAttribute("wasd-controls", "enabled", false); // locomocao continua = cinetose
      cam.setAttribute("look-controls", "enabled", false); // quem gira e o pescoco
    }
    if (dom.gazeCursor) {
      setEntityVisible(dom.gazeCursor, true);
      dom.gazeCursor.setAttribute("raycaster", "enabled", true);
    }
    scene.setAttribute("cursor", "rayOrigin", "entity");
    setCaption("Olhe para uma região do mapa e belisque (ou aperte o gatilho).", 7000);
    refreshRaycasters();
  });

  scene.addEventListener("exit-vr", () => {
    state.vrMode = false;
    const cam = document.getElementById("camera");
    if (cam) {
      cam.setAttribute("position", "0 1.6 0");
      cam.setAttribute("wasd-controls", "enabled", true);
      cam.setAttribute("look-controls", "enabled", true);
    }
    if (dom.gazeCursor) {
      setEntityVisible(dom.gazeCursor, false);
      dom.gazeCursor.setAttribute("raycaster", "enabled", false);
    }
    scene.setAttribute("cursor", "rayOrigin", "mouse");
    setCaption("");
    refreshRaycasters();
  });

  // Guarda de arrasto: girar a camera com o mouse nao deve selecionar.
  bindDragGuard();
}

// Um clique so conta se o ponteiro praticamente nao andou entre press e release.
function bindDragGuard() {
  const guard = { x: 0, y: 0, arrastou: false };
  window.addEventListener("mousedown", (e) => {
    guard.x = e.clientX;
    guard.y = e.clientY;
    guard.arrastou = false;
  });
  window.addEventListener("mousemove", (e) => {
    if (e.buttons && (Math.abs(e.clientX - guard.x) > 6 || Math.abs(e.clientY - guard.y) > 6)) guard.arrastou = true;
  });
  window.addEventListener(
    "click",
    (e) => {
      if (guard.arrastou) {
        e.stopPropagation();
        e.preventDefault();
      }
    },
    true
  );
}
