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
//
// UMA acao fisica = UMA confirmacao. No headset a mesma pinca chegava por dois
// caminhos - o `pinchstarted` do A-Frame e, ao soltar, o "click" que o cursor
// de olhar gera a partir do select da sessao XR - e o botao de som ligava e
// desligava na mesma pinca (o gatilho idem). Agora, em VR, quem confirma e o
// `selectstart` da sessao (a pinca do proprio sistema do Quest, bem mais firme
// que o limiar de 1,5 cm do A-Frame, e o gatilho dos controles); o
// `pinchstarted`/`triggerdown` do A-Frame so valem se o sistema nunca mandou
// select; e uma janela refrataria engole qualquer eco que sobrar.
// O aperto (grip) deixou de confirmar: e onde a mao descansa segurando o
// controle, e cada aperto selecionaria o que estivesse sob o olhar.
// ----------------------------------------------------------------------------

const DWELL_IN = 140; // ms olhando antes de assumir o foco (anti-tremor)
const DWELL_OUT = 260; // ms fora antes de largar o foco (anti-piscada)
const REFRATARIO_MS = 380; // dentro disto, uma segunda confirmacao e eco da primeira

let hoverEl = null; // alvo sob o olhar AGORA (a pinca age sobre este)
let dwellInTimer = null;
let dwellOutTimer = null;
let ultimaConfirmacao = -Infinity;
// O sistema do Quest ja mandou select para maos / controles nesta sessao?
const selectDoSistema = { mao: false, controle: false };

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

  // Desktop: o clique do mouse confirma direto. Em VR o "click" e so o eco do
  // select da sessao (que ja confirmou no selectstart) - ignorado.
  entidade.addEventListener("click", () => {
    if (state.vrMode) return;
    confirmar(entidade);
  });
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

// Porta unica das entradas do headset (pinca, gatilho). Devolve true se algo
// foi de fato confirmado.
function confirmarEntrada(origem, inputSource) {
  const agora = performance.now();
  if (agora - ultimaConfirmacao < REFRATARIO_MS) return false;
  ultimaConfirmacao = agora;
  const alvo = hoverEl;
  tlog(origem === "pinca" ? "pinca" : "gatilho", {
    mao: inputSource && inputSource.handedness ? inputSource.handedness : null,
    alvo: descreverAlvo(alvo),
  });
  if (!alvo) return false;
  pulsoHaptico(inputSource);
  confirmar(alvo);
  return true;
}

function descreverAlvo(e) {
  if (!e || !e.dataset) return null;
  const d = e.dataset;
  if (d.regiao) return `regiao:${d.regiao}`;
  if (d.indicador) return `indicador:${d.indicador}`;
  if (d.ano != null) return `ano:${d.ano}`;
  if (d.destino) return `destino:${d.destino}`;
  if (d.acao) return `acao:${d.acao}`;
  return null;
}

// Retorno no controle: um toque curto quando a confirmacao pegou em algo.
function pulsoHaptico(inputSource) {
  try {
    const atuador = inputSource && inputSource.gamepad && inputSource.gamepad.hapticActuators && inputSource.gamepad.hapticActuators[0];
    if (atuador && atuador.pulse) atuador.pulse(0.35, 35);
  } catch (e) {
    /* sem vibracao neste dispositivo */
  }
}

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
    // Alvos de ano so existem com o painel aberto (ver alvosDoPainel).
    if (state.painelAberto) selecionarAno(Number(e.dataset.ano), true);
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
  // Guinada E inclinacao: o painel fica acima dos olhos, entao o topo inclina
  // PARA quem olha (X positivo). A versao anterior usava -8 fixo, que deitava o
  // topo para tras e deixava a face 15 graus fora da linha do olhar.
  const cam = document.getElementById("camera");
  const cp = new AFRAME.THREE.Vector3(PLANTA.usuario.x, 1.6, PLANTA.usuario.z);
  if (cam && cam.object3D) cam.object3D.getWorldPosition(cp);
  const destino = { x: PLANTA.painel.cx, z: PLANTA.painel.cz };
  const guinada = encarar(destino, { x: cp.x, z: cp.z });
  dom.painel.setAttribute("rotation", `${inclinacaoPainel(destino, cp)} ${guinada} 0`);

  // Fio que liga a regiao ao painel (o tracejado do desenho).
  dom.fio.setAttribute("position", `${round2(p.x)} ${round2((0.86 + PLANTA.painel.baseY) / 2)} ${round2(p.z)}`);
  dom.fio.setAttribute("height", round2(PLANTA.painel.baseY - 0.86));

  setEntityVisible(dom.painel, true);
  setEntityVisible(dom.fio, true);
  alvosDoPainel(true);

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

// Inclinacao (graus, eixo X) para a face do painel apontar para o olho.
function inclinacaoPainel(destino, olho) {
  const distH = Math.hypot(olho.x - destino.x, olho.z - destino.z) || 1;
  const graus = (Math.atan2(PLANTA.painel.cy - olho.y, distH) * 180) / Math.PI;
  return round2(Math.max(-20, Math.min(20, graus)));
}

// Os alvos do painel (anos, fechar) e o bloqueio do olhar so existem com o
// painel ABERTO. O raycaster mira por classe, nao por visibilidade: sem isto,
// com o painel fechado, olhar para o ar acima da mesa ainda pegava os anos
// invisiveis - e uma pinca ali tocava nota e gravava "ano" na telemetria.
function alvosDoPainel(ligado) {
  setClickable(dom.painelFechar, ligado);
  document.querySelectorAll(".alvo-ano").forEach((a) => setClickable(a, ligado));
  if (dom.painelFundo) dom.painelFundo.classList.toggle("bloqueia-olhar", !!ligado);
  refreshRaycasters();
}

function fecharPainel() {
  if (!state.painelAberto) return;
  state.painelAberto = false;
  state.regiaoId = null;
  state.anoIdx = null;
  alvosDoPainel(false);
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

// Teleporte que leva a CABECA ao disco e o OLHAR ao alvo.
// No Quest a cabeca raramente esta no centro do rig: a pessoa ja andou pelo
// guardian e esta virada para algum lado. Mover so o rig deixava a cabeca a
// quase 1 m do disco, e girar o rig para "olhar o mapa" ignorava para onde ela
// estava virada. Aqui a conta desfaz o deslocamento e a guinada da cabeca.
async function irPara(nome) {
  const d = DESTINOS[nome];
  if (!d) return;
  const rig = document.getElementById("cameraRig");
  if (!rig) return;
  comfortBlink();
  await wait(95);
  const alvo = { x: d.olhar.cx != null ? d.olhar.cx : d.olhar.x, z: d.olhar.cz != null ? d.olhar.cz : d.olhar.z };
  const pose = poseRig({ x: d.x, z: d.z }, olharPara({ x: d.x, z: d.z }, alvo));
  // Rig SEMPRE no chao (y = 0): em VR a altura vem do headset. Somar 1,6 aqui
  // faria o visitante flutuar a 3,2 m dentro do Quest.
  rig.setAttribute("position", `${pose.x} 0 ${pose.z}`);
  rig.setAttribute("rotation", `0 ${pose.guinada} 0`);
  tlog("teleporte", { destino: nome });
}

// Pose do rig para que a cabeca (pose LOCAL ao rig: headset em VR, WASD e
// mouse no desktop) termine em `destino`, olhando na guinada `guinadaAlvo`.
function poseRig(destino, guinadaAlvo) {
  const cam = document.getElementById("camera");
  let lx = 0;
  let lz = 0;
  let guinadaCabeca = 0;
  if (cam && cam.object3D && window.AFRAME) {
    const o = cam.object3D;
    lx = o.position.x;
    lz = o.position.z;
    guinadaCabeca = (new AFRAME.THREE.Euler().setFromQuaternion(o.quaternion, "YXZ").y * 180) / Math.PI;
  }
  const guinada = guinadaAlvo - guinadaCabeca;
  const r = (guinada * Math.PI) / 180;
  // Rotacao em Y aplicada ao deslocamento local da cabeca.
  const wx = lx * Math.cos(r) + lz * Math.sin(r);
  const wz = -lx * Math.sin(r) + lz * Math.cos(r);
  return { x: round2(destino.x - wx), z: round2(destino.z - wz), guinada: round2(guinada) };
}

// ---------------------------------------------------------------------------
// Entradas do Quest 2 e do desktop
// ---------------------------------------------------------------------------

function bindEntradas() {
  document.querySelectorAll(".clickable, .alvo-teleporte, .alvo-acao").forEach(registrarAlvo);

  const scene = document.getElementById("scene");

  // Fallback do A-Frame: so vale enquanto o sistema do Quest nao tiver mandado
  // select para aquele tipo de entrada (ver o cabecalho deste arquivo).
  ["handLeft", "handRight"].forEach((id) => {
    const m = document.getElementById(id);
    if (!m) return;
    m.addEventListener("pinchstarted", () => {
      state.maoAtiva = true;
      if (!selectDoSistema.mao) confirmarEntrada("pinca", null);
    });
    // A mao apareceu: o visitante esta sem controles, entao a dica muda.
    m.addEventListener("controllerconnected", () => {
      if (state.maoAtiva) return; // as duas maos chegam juntas: uma legenda so
      state.maoAtiva = true;
      setCaption("Mãos reconhecidas. Olhe para um alvo e belisque (palma para fora) para confirmar.", 6000);
    });
  });

  ["ctrlLeft", "ctrlRight"].forEach((id) => {
    const c = document.getElementById(id);
    if (!c) return;
    c.addEventListener("triggerdown", () => {
      if (!selectDoSistema.controle) confirmarEntrada("gatilho", null);
    });
  });

  // Caminho principal no headset: o select da sessao XR (pinca do sistema e
  // gatilho dos controles), com o inputSource para saber qual mao vibrar.
  const aoSelecionar = (ev) => {
    const src = ev.inputSource;
    const ehMao = !!(src && src.hand);
    if (ehMao) {
      selectDoSistema.mao = true;
      state.maoAtiva = true;
    } else {
      selectDoSistema.controle = true;
    }
    confirmarEntrada(ehMao ? "pinca" : "gatilho", src);
  };

  let sessaoXR = null;

  // Cursor de olhar: so no headset. No desktop quem mira e o mouse.
  scene.addEventListener("enter-vr", () => {
    state.vrMode = true;
    selectDoSistema.mao = false;
    selectDoSistema.controle = false;
    sessaoXR = scene.xrSession || null;
    if (sessaoXR) sessaoXR.addEventListener("selectstart", aoSelecionar);
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
    // O raio do mouse sai de um ponto fixo da cena em VR e so produziria
    // hovers fantasmas; dentro do headset quem mira e so o olhar.
    scene.setAttribute("raycaster", "enabled", false);
    setCaption("Olhe para uma região do mapa e belisque (ou aperte o gatilho).", 7000);
    refreshRaycasters();
  });

  scene.addEventListener("exit-vr", () => {
    state.vrMode = false;
    if (sessaoXR) sessaoXR.removeEventListener("selectstart", aoSelecionar);
    sessaoXR = null;
    const cam = document.getElementById("camera");
    if (cam) {
      cam.setAttribute("position", "0 1.6 0");
      cam.setAttribute("wasd-controls", "enabled", true);
      cam.setAttribute("look-controls", "enabled", true);
    }
    if (dom.gazeCursor) {
      dom.gazeCursor.setAttribute("raycaster", "enabled", false);
    }
    scene.setAttribute("raycaster", "enabled", true);
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
