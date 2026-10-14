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
//   3. passo ...... dar um passo DE LADO e ver o ano mudar (a linha do tempo
//                   em miniatura: 2017 | 2018) - a pessoa descobre sozinha que
//                   o corpo muda o tempo, sem explicacao
//
// Durante o treino a mesa, a zona de contexto, o painel, a linha do tempo e os
// discos somem e deixam de responder ao olhar (nenhum dado aparece). No fim
// tudo volta e a pessoa e devolvida a linha do tempo, no mesmo lugar da sala
// real (ancora restaurada; 70-faixa.js).
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
  // Mini linha do tempo: dois trechos de 30 cm, o 1o sob quem chega pelo
  // disco, o 2o logo a DIREITA. "marca" e o centro do trecho de 2018.
  marca: { x: 1.6, z: -0.3 },
};
const TREINO_TRECHO = 0.3;
const TREINO_HISTERESE = 0.05; // mesma folga da linha do tempo de verdade

const TREINO_ETAPAS = [
  { id: "pinca", legenda: "TREINO 1 de 3 · Olhe para o círculo azul e belisque (polegar + indicador, palma para fora) ou aperte o gatilho." },
  { id: "teleporte", legenda: "TREINO 2 de 3 · Mire o disco verde no piso e belisque para ir até ele." },
  { id: "passo", legenda: "TREINO 3 de 3 · Dê um passo de verdade para o lado DIREITO, até o 2018 no piso. Veja o ano mudar." },
];

function iniciarTreino(origem) {
  if (TREINO.ativo || !state.pronto) return false;
  if (state.painelAberto) fecharPainel();
  TREINO.ativo = true;
  state.treino = true;
  TREINO.t0 = performance.now();
  tlog("treino", { evento: "inicio", via: origem || null });

  // Esconde as camadas de dados e tira TODOS os alvos atuais do olhar.
  TREINO.ocultos = [dom.mesaMapa, dom.contextoZona, dom.painel, dom.fio, dom.zonas, dom.faixaTempo, dom.discoUsuario, dom.discoContexto].filter(Boolean);
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

  // 3. Mini linha do tempo: 2017 sob quem chegou pelo disco, 2018 a direita,
  // e o ano grande a frente, na altura dos olhos.
  const marca = el("a-entity", { visible: false });
  const t17 = el("a-plane", { rotation: "-90 0 0", width: TREINO_TRECHO - 0.02, height: 0.3, position: `${P.disco.x} 0.012 ${P.disco.z}`, material: "color: #ffd166; shader: flat" });
  const t18 = el("a-plane", { rotation: "-90 0 0", width: TREINO_TRECHO - 0.02, height: 0.3, position: `${P.marca.x} 0.012 ${P.marca.z}`, material: "color: #1b2a44; shader: flat" });
  marca.appendChild(t17);
  marca.appendChild(t18);
  [[P.disco.x, "2017"], [P.marca.x, "2018"]].forEach(([x, ano]) => {
    marca.appendChild(el("a-text", Object.assign({ value: ano, rotation: "-90 0 0", position: `${x} 0.016 ${P.disco.z + 0.05}`, align: "center", color: "#cfe0f4", font: FONTE }, escalaTexto(4, 0.05))));
  });
  const anoGrande = el("a-text", Object.assign({ value: "2017", position: `${round2((P.disco.x + P.marca.x) / 2)} 1.45 ${round2(P.disco.z - 1.3)}`, align: "center", color: "#ffffff", font: FONTE }, escalaTexto(4, 0.12)));
  marca.appendChild(anoGrande);
  g.appendChild(marca);

  TREINO.partes = { alvo, circulo, disco, discoHit, marca, t17, t18, anoGrande };
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
  if (i === 2) {
    // a mini linha do tempo sempre comeca em 2017 (o treino pode ser repetido)
    setText(p.anoGrande, "2017");
    p.t17.setAttribute("material", "color", "#ffd166");
    p.t18.setAttribute("material", "color", "#1b2a44");
  }
  setLegendaFixa(TREINO_ETAPAS[i].legenda);
  refreshRaycasters();

  clearInterval(TREINO.vigia);
  if (TREINO_ETAPAS[i].id === "passo") {
    // Chegou quando a CABECA entrou no trecho de 2018 (com a mesma folga da
    // linha do tempo). O passo e fisico; no desktop, a tecla D faz o papel.
    const p = TREINO.partes;
    const fronteira = TREINO_PONTOS.disco.x + TREINO_TRECHO / 2;
    TREINO.vigia = setInterval(() => {
      const cam = document.getElementById("camera");
      if (!cam || !cam.object3D) return;
      const c = new AFRAME.THREE.Vector3();
      cam.object3D.getWorldPosition(c);
      if (Math.abs(c.z - TREINO_PONTOS.disco.z) > 0.6) return;
      if (c.x >= fronteira + TREINO_HISTERESE) {
        setText(p.anoGrande, "2018");
        p.t17.setAttribute("material", "color", "#2c4a6e");
        p.t18.setAttribute("material", "color", "#ffd166");
        clearInterval(TREINO.vigia);
        // o tempo da etapa e o da chegada; os 0,9 s seguintes sao para ver o
        // ano mudar antes do aviso de concluido
        const ms = Math.round(performance.now() - TREINO.tEtapa);
        const etapa = TREINO.etapa;
        setTimeout(() => {
          if (TREINO.ativo && TREINO.etapa === etapa) concluirEtapa(ms);
        }, 900);
      }
    }, 100);
  }
}

function concluirEtapa(msMedido) {
  if (!TREINO.ativo) return;
  const etapa = TREINO_ETAPAS[TREINO.etapa];
  const ms = typeof msMedido === "number" ? msMedido : Math.round(performance.now() - TREINO.tEtapa);
  tlog("treino", { evento: "etapa", etapa: etapa.id, ms });
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
  // O painel volta (ele e sempre visivel agora); o fio so com regiao aberta.
  TREINO.ocultos.forEach((e) => setEntityVisible(e, e !== dom.fio || state.painelAberto));
  TREINO.desligados.forEach((e) => {
    // O "fechar" do painel so volta com uma regiao aberta (alvosDoPainel).
    if (e !== dom.painelFechar) setClickable(e, true);
  });
  alvosDoPainel(state.painelAberto);
  TREINO.ocultos = [];
  TREINO.desligados = [];
  delete DESTINOS.treino;

  setLegendaFixa("");
  // Devolve a pessoa a linha do tempo. Se ela ja tem ancora (o pesquisador
  // ancorou com a pessoa sobre a fita de 2017, ou a 1a entrada em VR), a
  // ancora e RESTAURADA - a faixa volta ao mesmo lugar da sala real, e o
  // passo lateral do treino a deixa um pouco a direita de 2017, sobre a faixa.
  // Sem ancora, ancora onde ela esta. Exceto quando quem encerrou foi uma
  // tarefa (teleportar no meio da pergunta confunde) ou o botao de ancorar
  // (que ancora logo em seguida, 90-estudo.js).
  if (motivo !== "tarefa" && motivo !== "ancora") {
    if (FAIXA.ancora) voltarParaFaixa();
    else ancorarFaixa("treino");
  }
  setCaption(
    concluido ? "Treino concluído! Volte para o 2017, à esquerda na linha do tempo, e aguarde o pesquisador." : "",
    concluido ? 9000 : 0
  );
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
  module.exports = { TREINO_PONTOS, TREINO_ETAPAS, TREINO_TRECHO, TREINO_HISTERESE };
}
