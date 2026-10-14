// ----------------------------------------------------------------------------
// LINHA DO TEMPO NO PISO - o strollytelling (piloto-v1).
//
// O corpo faz a historia andar. Uma faixa de 8 trechos de 20 cm (2017 a 2024)
// no piso, paralela a mesa: andando DE LADO, de frente para a mesa e o painel,
// a pessoa percorre o tempo - a linha do grafico se desenha ate o ano em que
// ela esta, a parede de 100 blocos, a mesa e as anotacoes acompanham, e o
// desfecho (pior/melhor ano) so aparece quando ela chega a 2024. O olhar +
// pinca escolhem ONDE (a regiao); o corpo escolhe QUANDO (o ano).
//
// A geometria e a regra do ano (com folga de 5 cm nas fronteiras) estao em
// 00-planta.js (PLANTA.faixa, anoNaFaixa), onde os testes as alcancam.
//
// Ancora: a faixa precisa estar no MESMO lugar da sala real durante a sessao
// inteira (ela cabe numa area de 2 x 2 m). Ancorar = colocar 2017 sob a cabeca,
// olhando para a frente da faixa. Acontece na 1a entrada em VR, no fim do
// treino e pelo botao da estacao do pesquisador (depois de pedir a pessoa
// que fique sobre a marca de 2017 colada no chao). Quem sai da faixa por
// teleporte (para a zona de contexto) volta pelo disco ao lado de 2017, que
// RESTAURA a ancora - nao recalcula -, entao a faixa nao "anda" na sala real.
// ----------------------------------------------------------------------------

const FAIXA = { ancora: null, ancoradaEmVR: false, raiz: null, trechos: [] };

function buildFaixa() {
  const F = PLANTA.faixa;
  const raiz = el("a-entity", { id: "faixaTempo" });

  // Base da faixa (um tom acima do piso) e os 8 trechos, cada um com o ano
  // deitado no chao, legivel de quem esta em cima dela olhando a mesa.
  raiz.appendChild(
    el("a-plane", {
      rotation: "-90 0 0",
      width: round2(F.comprimento + 0.04),
      height: round2(F.largura + 0.04),
      position: `${F.cx} 0.007 ${F.z}`,
      material: "color: #0f1a2e; shader: flat",
    })
  );
  FAIXA.trechos = DADOS.anos.map((ano, i) => {
    const x = round2(F.x0 + (i + 0.5) * F.trecho);
    const placa = el("a-plane", {
      rotation: "-90 0 0",
      width: round2(F.trecho - 0.014),
      height: round2(F.largura - 0.03),
      position: `${x} 0.01 ${F.z}`,
      material: "color: #1b2a44; shader: flat",
    });
    const rotuloAno = el("a-text", Object.assign({
      value: String(ano),
      rotation: "-90 0 0",
      position: `${x} 0.014 ${round2(F.z + 0.05)}`,
      align: "center",
      color: "#8fa6c8",
      font: FONTE,
    }, escalaTexto(4, 0.042)));
    raiz.appendChild(placa);
    raiz.appendChild(rotuloAno);
    return { i, x, placa, rotuloAno };
  });

  // Sentido do tempo, nas PONTAS, na linha da faixa: "< PASSADO 2017 ... 2024
  // FUTURO >". Do lado da mesa eles formavam uma linha so com o rotulo
  // "CAMADA DE DADOS BRUTOS" do piso.
  const zSentido = F.z;
  raiz.appendChild(
    el("a-text", Object.assign({
      value: "< PASSADO",
      rotation: "-90 0 0",
      position: `${round2(F.x0 - 0.17)} 0.012 ${zSentido}`,
      align: "center",
      color: "#5f7797",
      font: FONTE,
    }, escalaTexto(9, 0.028)))
  );
  raiz.appendChild(
    el("a-text", Object.assign({
      value: "FUTURO >",
      rotation: "-90 0 0",
      position: `${round2(F.x1 + 0.17)} 0.012 ${zSentido}`,
      align: "center",
      color: "#5f7797",
      font: FONTE,
    }, escalaTexto(9, 0.028)))
  );

  dom.scene.appendChild(raiz);
  applyPendingTransforms(raiz);
  FAIXA.raiz = raiz;
  dom.faixaTempo = raiz;
  pintarFaixa();
}

// Trecho atual aceso na cor do indicador; anos ja percorridos, meio tom;
// anos ainda por vir, escuros.
function pintarFaixa() {
  if (!FAIXA.trechos.length) return;
  const cor = indicadorByKey(state.indicadorKey).cor;
  FAIXA.trechos.forEach((t) => {
    const atual = t.i === state.anoIdx;
    const passado = state.anoIdx != null && t.i < state.anoIdx;
    t.placa.setAttribute("material", "color", atual ? cor : passado ? "#2c4a6e" : "#1b2a44");
    t.rotuloAno.setAttribute("color", atual ? "#081022" : passado ? "#cfe0f4" : "#8fa6c8");
  });
}

// O corpo manda no ano: a cada quadro, a posicao da cabeca vira um ano.
if (window.AFRAME && !AFRAME.components["faixa-tempo"]) {
  AFRAME.registerComponent("faixa-tempo", {
    init() {
      this.p = new AFRAME.THREE.Vector3();
    },
    tick() {
      if (typeof state === "undefined" || !state.pronto || state.treino) return;
      const cam = dom.camera;
      if (!cam || !cam.object3D) return;
      cam.object3D.getWorldPosition(this.p);
      const novo = anoNaFaixa(this.p.x, this.p.z, state.anoIdx);
      if (novo !== state.anoIdx) definirAno(novo, "posicao", { x: round2(this.p.x), z: round2(this.p.z) });
    },
  });
}

function aplicarPoseRig(pose) {
  const rig = dom.cameraRig;
  if (!rig) return;
  rig.setAttribute("position", `${pose.x} 0 ${pose.z}`);
  rig.setAttribute("rotation", `0 ${pose.guinada} 0`);
}

// Poe 2017 sob a cabeca, olhando para a frente da faixa (para a mesa).
// Assim o eixo da faixa coincide com o "andar de lado" de quem esta ali.
async function ancorarFaixa(origem) {
  const F = PLANTA.faixa;
  comfortBlink();
  await wait(95);
  const pose = poseRig({ x: round2(F.x0 + F.trecho / 2), z: F.z }, 0);
  aplicarPoseRig(pose);
  FAIXA.ancora = pose;
  if (state.vrMode) FAIXA.ancoradaEmVR = true;
  tlog("faixa", { evento: "ancorada", via: origem || null });
  definirAno(0, "ancora");
  pintarFaixa();
}

// Volta para a linha do tempo pelo disco ao lado de 2017: restaura a ancora.
async function voltarParaFaixa() {
  if (!FAIXA.ancora) {
    await ancorarFaixa("disco");
    return;
  }
  comfortBlink();
  await wait(95);
  aplicarPoseRig(FAIXA.ancora);
  tlog("teleporte", { destino: "faixa" });
}

// Ancora inicial (desktop): o rig nasce com a cabeca sobre 2017.
function ancoraInicial() {
  const F = PLANTA.faixa;
  FAIXA.ancora = { x: round2(F.x0 + F.trecho / 2), z: F.z, guinada: 0 };
  aplicarPoseRig(FAIXA.ancora);
}

// Na 1a entrada em VR, a faixa se ancora onde a pessoa esta (o pesquisador a
// posiciona antes sobre a marca de 2017 colada no chao).
document.addEventListener("DOMContentLoaded", () => {
  const scene = document.getElementById("scene");
  if (!scene) return;
  scene.addEventListener("enter-vr", () => {
    if (FAIXA.ancoradaEmVR || !state.pronto) return;
    // espera um quadro: a pose do headset so chega depois do enter-vr
    setTimeout(() => {
      if (!FAIXA.ancoradaEmVR && !state.treino) ancorarFaixa("entrada-vr");
    }, 300);
  });
});

// Handle de inspecao (60-boot.js cria window.AMB; esta parte mora aqui porque
// os scripts classicos nao enxergam declaracoes de arquivos que ainda nao
// carregaram).
if (typeof window !== "undefined" && window.AMB) {
  Object.assign(window.AMB, { ancorarFaixa, voltarParaFaixa, FAIXA, pintarFaixa });
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = { FAIXA };
}
