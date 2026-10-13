// ----------------------------------------------------------------------------
// Audio posicional (Web Audio pelo MESMO contexto do THREE).
//
// Os nos sintetizados viram fontes POSICIONAIS presas as entidades: a nota de
// um ano emana do marcador no grafico, o acorde da composicao emana da parede
// de blocos, o leitmotiv de uma regiao emana da propria regiao no mapa. Em VR
// isso e ancora espacial de verdade (atenuacao por distancia + pan binaural).
// ----------------------------------------------------------------------------

let audioCtx = null;
let masterGain = null;
let audioListener = null;

function initAudio() {
  if (audioCtx) {
    if (audioCtx.state === "suspended") audioCtx.resume();
    return;
  }
  if (window.AFRAME && AFRAME.THREE.AudioContext) {
    audioCtx = AFRAME.THREE.AudioContext.getContext();
  } else {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    audioCtx = new AC();
  }
  if (audioCtx.state === "suspended") audioCtx.resume();
  masterGain = audioCtx.createGain();
  masterGain.gain.value = state.soundOn ? 0.9 : 0;
  masterGain.connect(audioCtx.destination);
}

function getAudioListener() {
  if (audioListener) return audioListener;
  const cam = document.getElementById("camera");
  if (!cam || !cam.object3D || !window.AFRAME) return null;
  audioListener = new AFRAME.THREE.AudioListener();
  audioListener.setMasterVolume(state.soundOn ? 0.9 : 0);
  cam.object3D.add(audioListener);
  return audioListener;
}

function playAtEntity(entity, node, refDistance = 2, duracaoMs = 1200) {
  if (!entity || !entity.object3D) return false;
  const listener = getAudioListener();
  if (!listener) return false;
  const pa = new AFRAME.THREE.PositionalAudio(listener);
  pa.setNodeSource(node);
  pa.setRefDistance(refDistance);
  pa.setRolloffFactor(1.6);
  entity.object3D.add(pa);
  setTimeout(() => {
    try { entity.object3D.remove(pa); pa.disconnect(); } catch (e) { /* ja removido */ }
  }, duracaoMs);
  return true;
}

function audioOut() {
  return masterGain || (audioCtx && audioCtx.destination);
}

function audioReady() {
  return !!audioCtx && audioCtx.state === "running" && state.soundOn;
}

// Escala pentatonica: agradavel em qualquer ordem, entao a sonificacao nunca
// soa errada mesmo quando os dados pulam.
const PENTA = [220.0, 246.94, 293.66, 329.63, 392.0, 440.0, 493.88, 587.33, 659.25];

// Nota por ano: altura = valor do indicador; pan = posicao do ano na serie.
function playDataNote(valor, min, max, yearIdx, yearCount, srcEntity) {
  if (!audioReady() || valor == null) return;
  const t = max > min ? (valor - min) / (max - min) : 0.5;
  const freq = PENTA[Math.max(0, Math.min(PENTA.length - 1, Math.round(t * (PENTA.length - 1))))];

  const o = audioCtx.createOscillator();
  const g = audioCtx.createGain();
  o.type = "sine";
  o.frequency.value = freq;
  o.connect(g);

  const now = audioCtx.currentTime;
  g.gain.setValueAtTime(0, now);
  g.gain.linearRampToValueAtTime(0.07, now + 0.02);
  g.gain.exponentialRampToValueAtTime(0.001, now + 0.5);
  o.onended = () => { o.disconnect(); g.disconnect(); };
  o.start(now);
  o.stop(now + 0.55);

  if (!playAtEntity(srcEntity, g, 2, 900)) {
    // Fallback estereo: sem listener, o pan espelha a posicao do ano.
    const pan = audioCtx.createStereoPanner();
    pan.pan.value = yearCount > 1 ? (yearIdx / (yearCount - 1)) * 1.6 - 0.8 : 0;
    g.connect(pan);
    pan.connect(audioOut());
  }
}

// Acorde da composicao: 3 notas com volume proporcional a cada fatia. Um ano
// bom soa brilhante; um ano de evasao alta soa grave.
function playCompositionChord(frConc, frRet, frEvad, srcEntity) {
  if (!audioReady()) return;
  const now = audioCtx.currentTime;
  const bus = audioCtx.createGain();
  [
    { f: 587.33, v: frConc },
    { f: 392.0, v: frRet },
    { f: 261.63, v: frEvad },
  ].forEach(({ f, v }) => {
    if (v == null || v <= 0) return;
    const o = audioCtx.createOscillator();
    const g = audioCtx.createGain();
    o.type = "triangle";
    o.frequency.value = f;
    o.connect(g);
    g.connect(bus);
    g.gain.setValueAtTime(0, now);
    g.gain.linearRampToValueAtTime(Math.min(0.075, 0.02 + v * 0.12), now + 0.04);
    g.gain.exponentialRampToValueAtTime(0.001, now + 1.1);
    o.onended = () => { o.disconnect(); g.disconnect(); };
    o.start(now);
    o.stop(now + 1.2);
  });
  if (!playAtEntity(srcEntity, bus, 2.2, 1400)) bus.connect(audioOut());
}

// Brilho curto: um callout revelado, um dado que aparece.
function playSparkle(srcEntity) {
  if (!audioReady()) return;
  const now = audioCtx.currentTime;
  const bus = audioCtx.createGain();
  [880.0, 1174.66].forEach((f, i) => {
    const o = audioCtx.createOscillator();
    const g = audioCtx.createGain();
    o.type = "sine";
    o.frequency.value = f;
    o.connect(g);
    g.connect(bus);
    const t = now + i * 0.07;
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(0.05, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.3);
    o.onended = () => { o.disconnect(); g.disconnect(); };
    o.start(t);
    o.stop(t + 0.35);
  });
  if (!playAtEntity(srcEntity, bus, 2, 800)) bus.connect(audioOut());
}

// Leitmotiv por regiao: 3 notas caracteristicas tocadas DO LUGAR da regiao no
// mapa. Somada a ancora espacial, e o que faz o leitor "reconhecer" o Nordeste
// antes de ler o rotulo.
const REGIAO_MOTIFS = {
  norte: [293.66, 392.0, 440.0],
  nordeste: [329.63, 440.0, 493.88],
  "centro-oeste": [261.63, 329.63, 392.0],
  sudeste: [220.0, 293.66, 440.0],
  sul: [246.94, 329.63, 493.88],
  brasil: [196.0, 293.66, 392.0],
};

function playRegionMotif(id, srcEntity) {
  if (!audioReady()) return;
  const notas = REGIAO_MOTIFS[id];
  if (!notas) return;
  const now = audioCtx.currentTime;
  const bus = audioCtx.createGain();
  notas.forEach((freq, i) => {
    const o = audioCtx.createOscillator();
    const g = audioCtx.createGain();
    o.type = "sine";
    o.frequency.value = freq;
    o.connect(g);
    g.connect(bus);
    const t = now + i * 0.12;
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(0.042, t + 0.02);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.5);
    o.onended = () => { o.disconnect(); g.disconnect(); };
    o.start(t);
    o.stop(t + 0.55);
  });
  if (!playAtEntity(srcEntity, bus, 2.5, 1300)) bus.connect(audioOut());
}

// Duas notas na emergencia do painel: o som de algo que sobe.
function playEmergeChime(srcEntity) {
  if (!audioReady()) return;
  const now = audioCtx.currentTime;
  const bus = audioCtx.createGain();
  [392.0, 587.33].forEach((f, i) => {
    const o = audioCtx.createOscillator();
    const g = audioCtx.createGain();
    o.type = "sine";
    o.frequency.value = f;
    o.connect(g);
    g.connect(bus);
    const t = now + i * 0.11;
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(0.05, t + 0.02);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.6);
    o.onended = () => { o.disconnect(); g.disconnect(); };
    o.start(t);
    o.stop(t + 0.65);
  });
  if (!playAtEntity(srcEntity, bus, 2.5, 1200)) bus.connect(audioOut());
}

function toggleSound() {
  state.soundOn = !state.soundOn;
  tlog("som", { ligado: state.soundOn });
  if (dom.somLabel) setText(dom.somLabel, state.soundOn ? "Som ligado" : "Som mudo");
  if (audioCtx && masterGain) {
    const now = audioCtx.currentTime;
    masterGain.gain.cancelScheduledValues(now);
    masterGain.gain.setValueAtTime(masterGain.gain.value, now);
    masterGain.gain.linearRampToValueAtTime(state.soundOn ? 0.9 : 0, now + 0.2);
  }
  // Fontes posicionais passam pelo listener, nao pelo masterGain.
  if (audioListener) audioListener.setMasterVolume(state.soundOn ? 0.9 : 0);
}
