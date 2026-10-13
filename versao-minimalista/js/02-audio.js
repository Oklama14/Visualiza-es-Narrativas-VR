// ----------------------------------------------------------------------------
// Motor de Áudio (Web Audio API)
// ----------------------------------------------------------------------------
let audioCtx = null;
let droneOsc1 = null;
let droneOsc2 = null;
let droneGain = null;
let droneFilter = null;
let droneStopTimer = null;

let masterGain = null;
let audioListener = null;

function initAudio() {
  if (audioCtx) {
    if (audioCtx.state === "suspended") audioCtx.resume();
    return;
  }
  // 3.2: usamos o MESMO AudioContext do THREE, para que os nossos nos
  // sintetizados possam virar fontes POSICIONAIS presas as entidades da cena.
  if (window.AFRAME && AFRAME.THREE.AudioContext) {
    audioCtx = AFRAME.THREE.AudioContext.getContext();
  } else {
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (!AudioContext) return;
    audioCtx = new AudioContext();
  }
  if (audioCtx.state === "suspended") audioCtx.resume();
  masterGain = audioCtx.createGain();
  masterGain.gain.value = state.soundOn ? 0.9 : 0;
  masterGain.connect(audioCtx.destination);
}

// Ouvinte binaural preso a camera (criado sob demanda).
function getAudioListener() {
  if (audioListener) return audioListener;
  const cam = document.getElementById("camera");
  if (!cam || !cam.object3D || !window.AFRAME) return null;
  audioListener = new AFRAME.THREE.AudioListener();
  audioListener.setMasterVolume(state.soundOn ? 0.9 : 0);
  cam.object3D.add(audioListener);
  return audioListener;
}

// Emite um no de audio DE uma entidade da cena: atenua com a distancia e faz
// pan binaural de verdade. Devolve false se nao der (chamador usa fallback).
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
  return masterGain || audioCtx.destination;
}

function audioReady() {
  return !!audioCtx && audioCtx.state === "running" && state.soundOn;
}

// Nota por ano: altura = valor (escala pentatonica, agradavel em qualquer ordem)
// e pan estereo = posicao do ano (2017 a esquerda -> 2024 a direita). O som
// espelha o strollytelling: andar para a direita "sobe" o tempo.
function playDataNote(valor, min, max, yearIdx, yearCount, srcEntity) {
  if (!audioReady() || valor == null) return;

  const pct = max === min ? 0.5 : (valor - min) / (max - min);
  const notes = [146.83, 164.81, 196.00, 220.00, 261.63, 293.66, 329.63, 392.00, 440.00, 523.25];
  const idx = Math.max(0, Math.min(notes.length - 1, Math.floor(pct * notes.length)));
  const freq = notes[idx];

  const now = audioCtx.currentTime;
  const gain = audioCtx.createGain();
  // 3.2: se ha entidade-fonte (o marcador do ano), o som emana DELA; senao,
  // fallback de pan estereo pela posicao do ano na linha.
  let tail = gain;
  if (!playAtEntity(srcEntity, gain, 2.5, 800)) {
    if (audioCtx.createStereoPanner && yearIdx != null && yearCount > 1) {
      const pan = audioCtx.createStereoPanner();
      pan.pan.value = -0.7 + (yearIdx / (yearCount - 1)) * 1.4;
      gain.connect(pan);
      tail = pan;
    }
    tail.connect(audioOut());
    setTimeout(() => { gain.disconnect(); if (tail !== gain) tail.disconnect(); }, 700);
  }

  // Duas senoides levemente desafinadas: timbre mais quente que o triangulo cru.
  const oscs = [0, 2.5].map((cents) => {
    const o = audioCtx.createOscillator();
    o.type = "sine";
    o.frequency.value = freq * Math.pow(2, cents / 1200);
    o.connect(gain);
    return o;
  });

  gain.gain.setValueAtTime(0, now);
  gain.gain.linearRampToValueAtTime(0.07, now + 0.015);
  gain.gain.exponentialRampToValueAtTime(0.001, now + 0.55);

  oscs.forEach((o) => {
    o.onended = () => o.disconnect();
    o.start(now);
    o.stop(now + 0.6);
  });
}

function setAmbientDrone(trend, sentido) {
  if (!audioReady()) return;
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
  droneFilter.connect(audioOut());
  
  const now = audioCtx.currentTime;
  droneGain.gain.setValueAtTime(0, now);
  droneGain.gain.linearRampToValueAtTime(0.035, now + 1.5);
  
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

// Chime curto de 2 notas nas transicoes de etapa (orienta sem cansar).
function playTransitionChime() {
  if (!audioReady()) return;
  const now = audioCtx.currentTime;
  [293.66, 440.0].forEach((freq, i) => {
    const o = audioCtx.createOscillator();
    const g = audioCtx.createGain();
    o.type = "sine";
    o.frequency.value = freq;
    o.connect(g);
    g.connect(audioOut());
    const t = now + i * 0.09;
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(0.05, t + 0.02);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.5);
    o.onended = () => { o.disconnect(); g.disconnect(); };
    o.start(t);
    o.stop(t + 0.55);
  });
}

// Brilho curto quando um callout (pico/vale) e revelado na abertura guiada.
function playSparkle(srcEntity) {
  if (!audioReady()) return;
  const now = audioCtx.currentTime;
  const o = audioCtx.createOscillator();
  const g = audioCtx.createGain();
  o.type = "sine";
  o.frequency.value = 1174.66; // D6
  o.connect(g);
  if (!playAtEntity(srcEntity, g, 2, 600)) g.connect(audioOut());
  g.gain.setValueAtTime(0, now);
  g.gain.linearRampToValueAtTime(0.04, now + 0.01);
  g.gain.exponentialRampToValueAtTime(0.001, now + 0.4);
  o.onended = () => { o.disconnect(); g.disconnect(); };
  o.start(now);
  o.stop(now + 0.45);
}

// Acorde da composicao: 3 notas cujo volume segue a proporcao de cada destino.
// Conclusao = nota alta (A4), retencao = media (E4), evasao = grave (D3). Um ano
// com muita conclusao soa brilhante; um ano de evasao alta soa grave e escuro.
function playCompositionChord(frConc, frRet, frEvad, srcEntity) {
  if (!audioReady()) return;
  const now = audioCtx.currentTime;
  const bus = audioCtx.createGain(); // 3.2: acorde inteiro emana da parede
  const defs = [
    [440.0, frConc, 0.09],
    [329.63, frRet, 0.06],
    [146.83, frEvad, 0.1],
  ];
  defs.forEach(([freq, fr, peso], i) => {
    if (fr <= 0.01) return;
    const o = audioCtx.createOscillator();
    const g = audioCtx.createGain();
    o.type = "sine";
    o.frequency.value = freq;
    o.connect(g);
    g.connect(bus);
    const t = now + i * 0.07;
    const vol = 0.015 + peso * fr;
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(vol, t + 0.03);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.9);
    o.onended = () => { o.disconnect(); g.disconnect(); };
    o.start(t);
    o.stop(t + 0.95);
  });
  if (!playAtEntity(srcEntity, bus, 3, 1300)) bus.connect(audioOut());
}

// 3.3 Leitmotiv por estacao: 2-3 notas pentatonicas tocadas DO LUGAR da
// estacao ao chegar - ancora sonora somada a ancora espacial (Liu 2024).
const STATION_MOTIFS = {
  home: [293.66, 440.0],
  mapa: [293.66, 329.63, 392.0],
  indicadores: [329.63, 392.0, 493.88],
  timeline: [220.0, 293.66, 440.0],
  composicao: [196.0, 293.66, 392.0],
  comparacao: [246.94, 329.63, 493.88],
};

function playStationMotif(id, srcEntity) {
  if (!audioReady()) return;
  const notas = STATION_MOTIFS[id];
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
    const t = now + i * 0.14;
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(0.045, t + 0.02);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.55);
    o.onended = () => { o.disconnect(); g.disconnect(); };
    o.start(t);
    o.stop(t + 0.6);
  });
  if (!playAtEntity(srcEntity, bus, 2.5, 1400)) bus.connect(audioOut());
}

// Botao "Som": liga/desliga toda a sonificacao via masterGain.
function toggleSound() {
  state.soundOn = !state.soundOn;
  tlog("som", { ligado: state.soundOn });
  if (dom.ctrlSoundLabel) dom.ctrlSoundLabel.setAttribute("value", state.soundOn ? "Som ligado" : "Som mudo");
  if (!state.soundOn) stopAmbientDrone();
  if (audioCtx && masterGain) {
    const now = audioCtx.currentTime;
    masterGain.gain.cancelScheduledValues(now);
    masterGain.gain.setValueAtTime(masterGain.gain.value, now);
    masterGain.gain.linearRampToValueAtTime(state.soundOn ? 0.9 : 0, now + 0.2);
  }
  // Fontes posicionais (3.2) passam pelo listener, nao pelo masterGain.
  if (audioListener) audioListener.setMasterVolume(state.soundOn ? 0.9 : 0);
  if (state.soundOn && state.stage === "timeline") updateAmbientDrone();
}

