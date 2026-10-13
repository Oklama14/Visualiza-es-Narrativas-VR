// ----------------------------------------------------------------------------
// TREINO: tres gestos antes das tarefas, numa sala sem dados.
//
// Participante nao especialista quase nunca usou um Quest. Sem treino, os
// primeiros minutos da exploracao medem a briga com o aparelho, nao a
// narrativa - e a condicao 2D nao tem essa curva. Aqui a pessoa aprende, com
// alvos neutros, exatamente os tres gestos que o ambiente usa:
//
//   1. pinca ...... olhar um alvo e beliscar (ou apertar o gatilho)
//   2. teleporte .. mirar um disco no piso e beliscar
//   3. passo ...... andar de verdade ate uma marca no piso
//
// Durante o treino a mesa, a zona de contexto, o painel e os discos somem e
// deixam de responder ao olhar (nenhum dado aparece). No fim tudo volta e a
// pessoa e levada para a porta - o ponto de partida padronizado da exploracao.
//
// Disparo: estacao do pesquisador (comando "treino-iniciar"), botao do painel
// local, ou ?treino=1 na URL (para testar). Cada etapa vai para a telemetria
// com o tempo que levou.
// ----------------------------------------------------------------------------

const TREINO = {
  ativo: false,
  etapa: -1,
  t0: 0,
  tEtapa: 0,
  grupo: null,
  ocultos: [],
  desligados: [],
  vigia: null,
};

// Pontos do treino, em coordenadas da sala (o centro da sala e a origem). A
// pessoa comeca de frente para a parede do fundo, com ~3 m livres a frente.
const TREINO_PONTOS = {
  inicio: { x: 0, z: 0.9, olhar: { x: 0, z: -2 } },
  alvo: { x: 0, y: 1.35, z: -0.5 },
  disco: { x: 1.3, z: -0.3, olhar: { x: 1.3, z: -2 } },
  marca: { x: 1.3, z: -0.9 },
};
const TREINO_RAIO_MARCA = 0.25; // m: cabeca dentro disto = chegou

const TREINO_ETAPAS = [
  { id: "pinca", legenda: "TREINO 1 de 3 · Olhe para o círculo azul e belisque (polegar + indicador, palma para fora) ou aperte o gatilho." },
  { id: "teleporte", legenda: "TREINO 2 de 3 · Mire o disco verde no piso e belisque para ir até ele." },
  { id: "passo", legenda: "TREINO 3 de 3 · Agora dê um passo de verdade para a frente, até a marca amarela no piso." },
];

function iniciarTreino(origem) {
  if (TREINO.ativo || !state.pronto) return false;
  if (state.painelAberto) fecharPainel();
  TREINO.ativo = true;
  state.treino = true;
  TREINO.t0 = performance.now();
  tlog("treino", { evento: "inicio", origem: origem || null });

  // Esconde as camadas de dados e tira TODOS os alvos atuais do olhar.
  TREINO.ocultos = [dom.mesaMapa, dom.contextoZona, dom.painel, dom.fio, dom.zonas, dom.discoUsuario, dom.discoEntrada, dom.discoContexto].filter(Boolean);
  TREINO.ocultos.forEach((e) => setEntityVisible(e, false));
  TREINO.desligados = Array.from(document.querySelectorAll(".clickable"));
  TREINO.desligados.forEach((e) => setClickable(e, false));

  TREINO.grupo = montarTreino();
  dom.scene.appendChild(TREINO.grupo);

  DESTINOS.treinoInicio = TREINO_PONTOS.inicio;
  DESTINOS.treino = TREINO_PONTOS.disco;
  irPara("treinoInicio");
  irParaEtapa(0);
  return true;
}

function montarTreino() {
  const P = TREINO_PONTOS;
  const g = el("a-entity", { id: "treino" });

  // 1. Alvo de pinca: um circulo azul na altura do peito, a 1,4 m.
  const alvo = el("a-entity", { position: `${P.alvo.x} ${P.alvo.y} ${P.alvo.z}`, visible: false });
  alvo.appendChild(el("a-ring", { "radius-inner": 0.15, "radius-outer": 0.19, material: "color: #ffffff; shader: flat; opacity: 0.7; transparent: true" }));
  const circulo = el("a-circle", { class: "treino-alvo", radius: 0.15, material: "color: #4cc9f0; shader: flat" });
  circulo.dataset.acao = "treino";
  circulo.dataset.treino = "pinca";
  alvo.appendChild(circulo);
  g.appendChild(alvo);

  // 2. Disco de teleporte verde (mesmo desenho dos discos da sala).
  const disco = el("a-entity", { position: `${P.disco.x} 0.01 ${P.disco.z}`, visible: false });
  disco.appendChild(el("a-ring", { "radius-inner": 0.2, "radius-outer": 0.28, rotation: "-90 0 0", material: "color: #1d9e75; shader: flat; opacity: 0.9; transparent: true" }));
  disco.appendChild(el("a-circle", { radius: 0.09, rotation: "-90 0 0", material: "color: #1d9e75; shader: flat" }));
  const discoHit = el("a-circle", { class: "treino-alvo", radius: 0.34, rotation: "-90 0 0", position: "0 0.004 0", material: "visible: false" });
  discoHit.dataset.acao = "treino";
  discoHit.dataset.treino = "teleporte";
  disco.appendChild(discoHit);
  g.appendChild(disco);

  // 3. Marca amarela no piso, um passo a frente de quem chegou pelo disco.
  const marca = el("a-entity", { position: `${P.marca.x} 0.01 ${P.marca.z}`, visible: false });
  marca.appendChild(el("a-ring", { "radius-inner": 0.16, "radius-outer": 0.24, rotation: "-90 0 0", material: "color: #ffd166; shader: flat; opacity: 0.95; transparent: true" }));
  marca.appendChild(el("a-circle", { radius: 0.05, rotation: "-90 0 0", material: "color: #ffd166; shader: flat" }));
  g.appendChild(marca);

  TREINO.partes = { alvo, circulo, disco, discoHit, marca };
  applyPendingTransforms(g);
  [circulo, discoHit].forEach(registrarAlvo);
  return g;
}

function irParaEtapa(i) {
  const p = TREINO.partes;
  TREINO.etapa = i;
  TREINO.tEtapa = performance.now();
  setEntityVisible(p.alvo, i === 0);
  setClickable(p.circulo, i === 0);
  setEntityVisible(p.disco, i === 1);
  setClickable(p.discoHit, i === 1);
  setEntityVisible(p.marca, i === 2);
  setLegendaFixa(TREINO_ETAPAS[i].legenda);
  refreshRaycasters();

  clearInterval(TREINO.vigia);
  if (TREINO_ETAPAS[i].id === "passo") {
    // Chegou quando a CABECA esta sobre a marca (o passo e fisico; no
    // desktop, as teclas WASD fazem o mesmo papel).
    TREINO.vigia = setInterval(() => {
      const cam = document.getElementById("camera");
      if (!cam || !cam.object3D) return;
      const c = new AFRAME.THREE.Vector3();
      cam.object3D.getWorldPosition(c);
      if (Math.hypot(c.x - TREINO_PONTOS.marca.x, c.z - TREINO_PONTOS.marca.z) < TREINO_RAIO_MARCA) concluirEtapa();
    }, 100);
  }
}

function concluirEtapa() {
  if (!TREINO.ativo) return;
  const etapa = TREINO_ETAPAS[TREINO.etapa];
  tlog("treino", { evento: "etapa", etapa: etapa.id, ms: Math.round(performance.now() - TREINO.tEtapa) });
  if (typeof playSparkle === "function" && TREINO.grupo) playSparkle(TREINO.grupo);
  if (TREINO.etapa + 1 < TREINO_ETAPAS.length) {
    irParaEtapa(TREINO.etapa + 1);
    return;
  }
  encerrarTreino("concluido");
}

// Confirmacao de um alvo do treino (chamada por confirmar(), 50-interacao.js).
async function treinoConfirmar(e) {
  if (!TREINO.ativo) return;
  const etapa = TREINO_ETAPAS[TREINO.etapa];
  if (e.dataset.treino !== etapa.id) return;
  if (etapa.id === "teleporte") {
    setClickable(TREINO.partes.discoHit, false);
    await irPara("treino");
  }
  concluirEtapa();
}

// motivo: "concluido" | "remoto" | "tarefa" | outro texto curto.
function encerrarTreino(motivo) {
  if (!TREINO.ativo) return;
  clearInterval(TREINO.vigia);
  TREINO.ativo = false;
  state.treino = false;
  const concluido = motivo === "concluido";
  tlog("treino", {
    evento: "fim",
    concluido,
    motivo: motivo || null,
    etapas: concluido ? TREINO_ETAPAS.length : Math.max(0, TREINO.etapa),
    ms: Math.round(performance.now() - TREINO.t0),
  });

  if (TREINO.grupo && TREINO.grupo.parentNode) TREINO.grupo.parentNode.removeChild(TREINO.grupo);
  TREINO.grupo = null;
  TREINO.ocultos.forEach((e) => setEntityVisible(e, e !== dom.painel && e !== dom.fio));
  TREINO.desligados.forEach((e) => {
    // Os anos do painel so voltam com o painel aberto (alvosDoPainel).
    if (!e.classList.contains("alvo-ano") && e !== dom.painelFechar) setClickable(e, true);
  });
  TREINO.ocultos = [];
  TREINO.desligados = [];
  delete DESTINOS.treino;

  setLegendaFixa("");
  // Volta para a porta (o ponto de partida padronizado) - exceto quando quem
  // encerrou foi uma tarefa: teleportar a pessoa no meio da pergunta confunde.
  if (motivo !== "tarefa") irPara("entrada");
  setCaption(concluido ? "Treino concluído! Aguarde a orientação do pesquisador." : "", concluido ? 7000 : 0);
  refreshRaycasters();
}

// ?treino=1 (teste): comeca sozinho assim que o ambiente estiver montado.
(function () {
  if (new URLSearchParams(window.location.search).get("treino") !== "1") return;
  const tentar = () => {
    if (typeof state !== "undefined" && state.pronto) iniciarTreino("url");
    else setTimeout(tentar, 300);
  };
  document.addEventListener("DOMContentLoaded", () => setTimeout(tentar, 300));
})();

if (typeof module !== "undefined" && module.exports) {
  module.exports = { TREINO_PONTOS, TREINO_ETAPAS, TREINO_RAIO_MARCA };
}
