// ----------------------------------------------------------------------------
// logic-check do ambiente "Camadas Retoricas Visiveis".
//
// Roda SEM navegador: carrega os modulos de js-ambiente/ num sandbox Node (vm)
// com stubs de DOM e exercita o que da para exercitar sem render - geometria da
// planta, conforto do painel no Quest 2, integridade das narrativas calculadas,
// aritmetica dos voxels e o contrato entre o HTML e o cache `dom`.
//
//   node tests/logic-check-ambiente.js
// ----------------------------------------------------------------------------

const vm = require("node:vm");
const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "..");
const DIR = path.join(ROOT, "js-ambiente");

const ORDEM = [
  "00-planta", "01-telemetria", "02-base", "03-audio", "04-narrativa",
  "05-headset", "07-tarefas", "10-voxel", "15-sala", "20-mapa", "30-contexto", "40-painel",
  "50-interacao", "60-boot", "70-faixa", "85-treino", "90-estudo",
];

function stubEl() {
  return {
    style: {}, dataset: {}, hidden: false, textContent: "",
    setAttribute() {}, getAttribute() { return null; }, removeAttribute() {},
    appendChild() {}, append() {}, remove() {},
    addEventListener() {}, querySelector() { return null; }, querySelectorAll() { return []; },
    classList: { add() {}, remove() {}, toggle() {} },
  };
}

const sandbox = {
  console, Math, JSON, Date, URLSearchParams, performance, Number, String, Array, Object, Boolean, Infinity, NaN,
  setTimeout, clearTimeout, setInterval, clearInterval, requestAnimationFrame: () => 0,
  window: { location: { search: "" }, localStorage: { getItem: () => null, setItem() {} } },
  document: {
    readyState: "loading",
    addEventListener() {},
    getElementById() { return null; },
    querySelector() { return null; },
    querySelectorAll() { return []; },
    createElement() { return stubEl(); },
    body: stubEl(),
  },
};
sandbox.window.document = sandbox.document;
sandbox.localStorage = sandbox.window.localStorage;
vm.createContext(sandbox);

const fontes = {};
for (const nome of ORDEM) {
  const arquivo = path.join(DIR, `${nome}.js`);
  fontes[nome] = fs.readFileSync(arquivo, "utf8");
  vm.runInContext(fontes[nome], sandbox, { filename: `${nome}.js` });
}

sandbox.__dados = JSON.parse(fs.readFileSync(path.join(ROOT, "dados.json"), "utf8"));
sandbox.__html = fs.readFileSync(path.join(ROOT, "index.html"), "utf8");
sandbox.__fontes = fontes;
sandbox.__arquivos = fs.readdirSync(DIR);
sandbox.__falhas = [];
sandbox.__info = [];

const CHECKS = String.raw`
(function () {
  "use strict";
  var falhas = __falhas, info = __info;
  function ok(cond, msg) { if (!cond) falhas.push(msg); }
  function nota(msg) { info.push(msg); }
  function num(v) { return typeof v === "number" && isFinite(v); }

  DADOS = __dados;

  // -- caixas auxiliares (footprint no plano XZ) ----------------------------
  function caixa(cx, cz, w, d) {
    return { x0: cx - w / 2, x1: cx + w / 2, z0: cz - d / 2, z1: cz + d / 2 };
  }
  function sobrepoe(a, b) {
    return a.x0 < b.x1 && b.x0 < a.x1 && a.z0 < b.z1 && b.z0 < a.z1;
  }
  function dentro(interno, externo, margem) {
    margem = margem || 0;
    return interno.x0 >= externo.x0 + margem && interno.x1 <= externo.x1 - margem &&
           interno.z0 >= externo.z0 + margem && interno.z1 <= externo.z1 - margem;
  }

  var SALA = caixa(0, 0, PLANTA.sala.w, PLANTA.sala.d);
  var MESA = caixa(PLANTA.mapa.cx, PLANTA.mapa.cz, PLANTA.mapa.w, PLANTA.mapa.d);
  var CTX = caixa(PLANTA.contexto.cx, PLANTA.contexto.cz, PLANTA.contexto.w, PLANTA.contexto.d);

  // ========================================================================
  // G - Geometria da planta
  // ========================================================================

  // G1: a escala do desenho preserva a proporcao original.
  var propSvg = PLANTA_SVG.sala.w / PLANTA_SVG.sala.h;
  var propMundo = PLANTA.sala.w / PLANTA.sala.d;
  ok(Math.abs(propSvg - propMundo) < 0.01, "G1: a sala perdeu a proporcao do desenho (" + propSvg.toFixed(3) + " vs " + propMundo.toFixed(3) + ")");
  nota("G1 sala " + PLANTA.sala.w.toFixed(2) + " x " + PLANTA.sala.d.toFixed(2) + " m (pe-direito " + PLANTA.sala.h + " m)");

  // G2: mesa e zona de contexto cabem na sala, com folga para circular.
  ok(dentro(MESA, SALA, 0.35), "G2: a mesa do mapa encosta na parede (sem folga de circulacao)");
  ok(dentro(CTX, SALA, 0.2), "G2: a zona de contexto sai da sala");

  // G3: as duas camadas nao se sobrepoem - a tese do desenho e que o texto tem
  // lugar PROPRIO, nunca em cima do dado.
  ok(!sobrepoe(MESA, CTX), "G3: a zona de contexto invade a mesa do mapa (as camadas se sobrepoem)");
  nota("G3 vao entre mesa e contexto: " + (CTX.x0 - MESA.x1).toFixed(2) + " m");

  // G4: cada placa de 100 blocos cabe na pegada da sua regiao.
  var ladoPlaca = (PLACA.cols - 1) * PLACA.gap + PLACA.size;
  REGIOES_MESA.forEach(function (r) {
    ok(ladoPlaca <= r.w + 1e-6, "G4: a placa de 100 blocos (" + ladoPlaca.toFixed(3) + " m) nao cabe na largura de " + r.id + " (" + r.w + " m)");
    ok(ladoPlaca <= r.d + 1e-6, "G4: a placa de 100 blocos nao cabe na profundidade de " + r.id + " (" + r.d + " m)");
  });
  nota("G4 placa de regiao: " + ladoPlaca.toFixed(3) + " m de lado (menor regiao: " +
       Math.min.apply(null, REGIOES_MESA.map(function (r) { return Math.min(r.w, r.d); })).toFixed(3) + " m)");

  // G5: as regioes ficam dentro do tampo e nao se encavalam.
  var pegadas = REGIOES_MESA.map(function (r) { return { id: r.id, c: caixa(r.x, r.z, r.w, r.d) }; });
  var TAMPO = caixa(0, 0, PLANTA.mapa.w, PLANTA.mapa.d);
  pegadas.forEach(function (p) {
    ok(dentro(p.c, TAMPO, 0), "G5: a regiao " + p.id + " sai do tampo da mesa");
  });
  for (var i = 0; i < pegadas.length; i += 1) {
    for (var j = i + 1; j < pegadas.length; j += 1) {
      ok(!sobrepoe(pegadas[i].c, pegadas[j].c),
         "G5: as regioes " + pegadas[i].id + " e " + pegadas[j].id + " se sobrepoem no tampo");
    }
  }

  // G6: as colunas de indicador ficam na borda proxima, dentro do tampo e sem
  // pisar em nenhuma regiao.
  var larguraCol = (COLUNAS.cols - 1) * COLUNAS.gap + COLUNAS.size + 0.06;
  var alturaCol = (COLUNAS.cols - 1) * COLUNAS.gap + 0.03;
  ok(COLUNAS.xs.length >= DADOS.indicadores.length,
     "G6: ha " + DADOS.indicadores.length + " indicadores e so " + COLUNAS.xs.length + " posicoes de coluna");
  COLUNAS.xs.forEach(function (x, k) {
    var c = caixa(x, COLUNAS.z, larguraCol, 0.16);
    ok(dentro(c, TAMPO, 0), "G6: a coluna " + k + " sai do tampo da mesa");
    pegadas.forEach(function (p) {
      ok(!sobrepoe(c, p.c), "G6: a coluna " + k + " fica em cima da regiao " + p.id);
    });
  });
  for (var k = 1; k < COLUNAS.xs.length; k += 1) {
    ok(COLUNAS.xs[k] - COLUNAS.xs[k - 1] >= larguraCol,
       "G6: as colunas " + (k - 1) + " e " + k + " se tocam (passo " + (COLUNAS.xs[k] - COLUNAS.xs[k - 1]).toFixed(3) +
       " m < largura " + larguraCol.toFixed(3) + " m)");
  }
  nota("G6 coluna de indicador: " + larguraCol.toFixed(3) + " x " + alturaCol.toFixed(3) + " m");

  // G7: linha de visada do ponto de observacao ate a regiao MAIS PROXIMA passa
  // por cima das colunas. Se falhar, as colunas escondem parte do mapa.
  var OLHO = 1.6;
  var obs = { x: PLANTA.usuario.x, z: PLANTA.usuario.z };
  var topoCol = PLANTA.mapa.topo + COLUNAS.y0 + alturaCol;
  var zColMundo = PLANTA.mapa.cz + COLUNAS.z;
  REGIOES_MESA.forEach(function (r) {
    var alvo = { x: PLANTA.mapa.cx + r.x, z: PLANTA.mapa.cz + r.z };
    if (Math.abs(obs.z - alvo.z) < 1e-6) return;
    var t = (obs.z - zColMundo) / (obs.z - alvo.z);
    if (t <= 0 || t >= 1) return; // as colunas nao ficam entre o olho e a regiao
    var yNaColuna = OLHO + t * (PLANTA.mapa.topo + 0.05 - OLHO);
    ok(yNaColuna > topoCol,
       "G7: as colunas de indicador tapam a regiao " + r.id +
       " (visada a " + yNaColuna.toFixed(3) + " m, topo da coluna a " + topoCol.toFixed(3) + " m)");
  });

  // G10: de nenhum ano da linha do tempo uma coluna de indicador fica entre o
  // olho e o nome/valor de uma regiao. (Com o passo regular das colunas, de
  // 2024 a coluna de Eficiencia tapava o Sul - a resposta da T2.) Os rotulos
  // ficam na faixa entre a placa e a borda de quem olha (20-mapa.js: nome a
  // 4,5 cm e valor a 9,5 cm da borda da placa).
  var topoColuna = PLANTA.mapa.topo + COLUNAS.y0 + 0.03 + (COLUNAS.cols - 1) * COLUNAS.gap + COLUNAS.size / 2;
  var meiaLarg = ((COLUNAS.cols - 1) * COLUNAS.gap + COLUNAS.size + 0.06) / 2;
  var meiaPl = ((PLACA.cols - 1) * PLACA.gap + PLACA.size) / 2;
  var tapados = [];
  for (var ia = 0; ia < PLANTA.faixa.anos; ia += 1) {
    var olho = { x: PLANTA.faixa.x0 + (ia + 0.5) * PLANTA.faixa.trecho - PLANTA.mapa.cx, y: 1.6, z: PLANTA.faixa.z - PLANTA.mapa.cz };
    REGIOES_MESA.forEach(function (r) {
      var perto = Math.min(0, r.d / 2 - PLACA.faixaRotulos - meiaPl) + meiaPl;
      [0.045, 0.095].forEach(function (dz) {
        [-0.08, 0, 0.08].forEach(function (dx) {
          var p = { x: r.x + dx, y: PLANTA.mapa.topo + 0.024, z: r.z + perto + dz };
          COLUNAS.xs.forEach(function (cx, k) {
            if (!(p.z < COLUNAS.z && COLUNAS.z < olho.z)) return;
            var t = (olho.z - COLUNAS.z) / (olho.z - p.z);
            var x = olho.x + t * (p.x - olho.x);
            var y = olho.y + t * (p.y - olho.y);
            if (Math.abs(x - cx) < meiaLarg && y < topoColuna) tapados.push(r.id + " de " + (2017 + ia) + " pela coluna " + k);
          });
        });
      });
    });
  }
  ok(tapados.length === 0, "G10: colunas tapam rotulos de regiao vistos da linha do tempo: " + tapados.slice(0, 4).join("; "));
  if (!tapados.length) nota("G10 nenhuma coluna entre o olho (8 anos da faixa) e os rotulos das 5 regioes");

  // G8: a entrada e um vao de verdade na parede proxima, e as duas metades
  // somam a largura da sala.
  var vao = 1.15;
  var esq = PLANTA.entrada.x - vao / 2 + PLANTA.sala.w / 2;
  var dir = PLANTA.sala.w / 2 - (PLANTA.entrada.x + vao / 2);
  ok(esq > 0.2 && dir > 0.2, "G8: o vao da entrada estoura a parede proxima (esq " + esq.toFixed(2) + ", dir " + dir.toFixed(2) + ")");
  ok(Math.abs(esq + dir + vao - PLANTA.sala.w) < 1e-6, "G8: as metades da parede proxima nao fecham a largura da sala");

  // G9: os discos de piso (entrada, observacao, contexto) caem dentro da sala.
  [["usuario", PLANTA.usuario.x, PLANTA.usuario.z],
   ["entrada", PLANTA.entrada.x, PLANTA.entrada.z],
   ["contexto", PLANTA.contexto.cx, PLANTA.contexto.cz + PLANTA.contexto.d / 2 + 0.55]
  ].forEach(function (d) {
    ok(d[1] > SALA.x0 && d[1] < SALA.x1 && d[2] > SALA.z0 && d[2] < SALA.z1,
       "G9: o disco '" + d[0] + "' caiu fora da sala (" + d[1] + ", " + d[2] + ")");
  });
  // O ponto de observacao fica FORA da mesa (ninguem observa de dentro dela).
  ok(!(PLANTA.usuario.x > MESA.x0 && PLANTA.usuario.x < MESA.x1 &&
       PLANTA.usuario.z > MESA.z0 && PLANTA.usuario.z < MESA.z1),
     "G9: o ponto de observacao caiu DENTRO da mesa");

  // ========================================================================
  // F - Linha do tempo no piso (strollytelling, 70-faixa.js)
  // ========================================================================

  var F = PLANTA.faixa;
  var FAIXA_BOX = { x0: F.x0, x1: F.x1, z0: F.z - F.largura / 2, z1: F.z + F.largura / 2 };

  // F1: um trecho por ano, de ponta a ponta.
  ok(F.anos === DADOS.anos.length, "F1: a faixa tem " + F.anos + " trechos e a serie " + DADOS.anos.length + " anos");
  ok(Math.abs(F.x1 - F.x0 - F.anos * F.trecho) < 1e-6, "F1: o comprimento da faixa nao e anos x trecho");
  ok(F.trecho >= 0.15 && F.trecho <= 0.3, "F1: trecho de " + F.trecho + " m (um passo lateral curto e 15-30 cm)");
  ok(F.histerese > 0 && F.histerese < F.trecho / 2, "F1: a folga das fronteiras precisa ser menor que meio trecho");

  // F2: cabe na sala com folga e nao pisa na mesa nem na zona de contexto.
  // (a pessoa fica sobre a linha central: e ali que a parede de tras importa)
  ok(dentro(FAIXA_BOX, SALA, 0.2), "F2: a faixa encosta na parede (folga < 0,2 m)");
  ok(PLANTA.sala.d / 2 - F.z >= 0.35, "F2: quem esta na faixa fica a " + (PLANTA.sala.d / 2 - F.z).toFixed(2) + " m da parede de tras (minimo 0,35 m)");
  ok(!sobrepoe(FAIXA_BOX, MESA), "F2: a faixa invade a mesa do mapa");
  ok(!sobrepoe(FAIXA_BOX, CTX), "F2: a faixa invade a zona de contexto");
  ok(FAIXA_BOX.z0 - MESA.z1 >= 0.3, "F2: a faixa fica a " + (FAIXA_BOX.z0 - MESA.z1).toFixed(2) + " m da mesa (minimo 0,3 m para o corpo)");

  // F3: cabe na area real de 2 x 2 m do protocolo (com 20 cm de cada lado).
  ok(F.comprimento <= 1.6 + 1e-6, "F3: a faixa tem " + F.comprimento + " m - nao cabe com folga numa area de 2 x 2 m");

  // F4: a regra do ano. Centro de cada trecho = aquele ano; nas fronteiras,
  // so muda depois de passar a folga (sem pisca-pisca de quem balanca o corpo);
  // fora do corredor, o ano fica como estava.
  for (var a = 0; a < F.anos; a += 1) {
    var xc = F.x0 + (a + 0.5) * F.trecho;
    ok(anoNaFaixa(xc, F.z, null) === a, "F4: o centro do trecho " + a + " nao da o ano " + a);
    ok(anoNaFaixa(xc, F.z, a) === a, "F4: parado no centro do trecho " + a + " o ano muda");
  }
  for (var b = 1; b < F.anos; b += 1) {
    var xb = F.x0 + b * F.trecho;
    var dentroFolga = F.histerese * 0.6, foraFolga = F.histerese * 1.2;
    ok(anoNaFaixa(xb + dentroFolga, F.z, b - 1) === b - 1, "F4: o ano " + (b - 1) + " vira " + b + " antes da folga");
    ok(anoNaFaixa(xb + foraFolga, F.z, b - 1) === b, "F4: o ano " + (b - 1) + " nao vira " + b + " depois da folga");
    ok(anoNaFaixa(xb - dentroFolga, F.z, b) === b, "F4: voltando, o ano " + b + " vira " + (b - 1) + " antes da folga");
    ok(anoNaFaixa(xb - foraFolga, F.z, b) === b - 1, "F4: voltando, o ano " + b + " nao vira " + (b - 1) + " depois da folga");
  }
  ok(anoNaFaixa(F.x0 - 0.2, F.z, 3) === 0, "F4: alem da ponta de 2017 o ano nao e 2017");
  ok(anoNaFaixa(F.x1 + 0.2, F.z, 3) === F.anos - 1, "F4: alem da ponta de 2024 o ano nao e 2024");
  ok(anoNaFaixa(F.cx, F.z + F.corredorZ + 0.1, 5) === 5, "F4: fora do corredor (atras da faixa) o ano mudou");
  ok(anoNaFaixa(F.cx, F.z - F.corredorZ - 0.1, 2) === 2, "F4: fora do corredor (perto da mesa) o ano mudou");
  ok(anoNaFaixa(F.x1 + F.corredorX + 0.1, F.z, 4) === 4, "F4: longe da ponta o ano mudou");
  ok(anoNaFaixa(F.cx, F.z + F.corredorZ + 0.1, null) == null, "F4: fora do corredor, sem ano, inventou um ano");

  // F5: o painel e legivel das DUAS pontas da faixa (ele encara o centro).
  [["2017", F.x0], ["2024", F.x1]].forEach(function (pt) {
    var ddx = PLANTA.painel.cx - pt[1], ddz = PLANTA.painel.cz - F.z;
    var dist = Math.sqrt(ddx * ddx + ddz * ddz);
    var largura = 2 * Math.atan2(PLANTA.painel.w / 2, dist) * 180 / Math.PI;
    var normal = Math.atan2(PLANTA.usuario.x - PLANTA.painel.cx, PLANTA.usuario.z - PLANTA.painel.cz);
    var visada = Math.atan2(pt[1] - PLANTA.painel.cx, F.z - PLANTA.painel.cz);
    var obliquo = Math.abs(visada - normal) * 180 / Math.PI;
    ok(dist >= 1.2, "F5: da ponta de " + pt[0] + " o painel fica a " + dist.toFixed(2) + " m (perto demais)");
    ok(largura <= 82, "F5: da ponta de " + pt[0] + " o painel ocupa " + largura.toFixed(1) + " graus");
    ok(obliquo <= 35, "F5: da ponta de " + pt[0] + " o painel e visto " + obliquo.toFixed(1) + " graus de lado");
    nota("F5 da ponta de " + pt[0] + ": painel a " + dist.toFixed(2) + " m, " + largura.toFixed(1) + " graus, " + obliquo.toFixed(1) + " graus de lado");
  });

  // F6: o disco de volta fica na sala, fora da faixa e da mesa, e perto da zona
  // de contexto (e de la que se volta).
  var DF = PLANTA.discoFaixa;
  ok(DF.x > SALA.x0 + 0.3 && DF.x < SALA.x1 - 0.3 && DF.z > SALA.z0 + 0.3 && DF.z < SALA.z1 - 0.3, "F6: o disco de volta caiu fora da sala");
  ok(DF.x < F.x0 - 0.3 || DF.x > F.x1 + 0.3, "F6: o disco de volta encosta na faixa (quem anda olhando o piso o mira sem querer)");
  var discoCtx = { x: PLANTA.contexto.cx, z: PLANTA.contexto.cz + PLANTA.contexto.d / 2 + 0.55 };
  var dCtx = Math.hypot(DF.x - discoCtx.x, DF.z - discoCtx.z);
  ok(dCtx <= 2.5, "F6: o disco de volta fica a " + dCtx.toFixed(2) + " m de quem esta na zona de contexto (dificil de mirar)");
  ok(!(DF.x > MESA.x0 && DF.x < MESA.x1 && DF.z > MESA.z0 && DF.z < MESA.z1), "F6: o disco de volta caiu dentro da mesa");
  nota("F faixa x " + F.x0 + " a " + F.x1 + ", z " + F.z + "; trecho " + F.trecho + " m, folga " + F.histerese + " m; disco de volta em (" + DF.x + ", " + DF.z + ")");

  // ========================================================================
  // C - Conforto no Quest 2
  // ========================================================================

  var dx = PLANTA.painel.cx - obs.x, dz = PLANTA.painel.cz - obs.z;
  var distPainel = Math.sqrt(dx * dx + dz * dz);
  var elevTopo = Math.atan2(PLANTA.painel.baseY + PLANTA.painel.h - OLHO, distPainel) * 180 / Math.PI;
  var elevBase = Math.atan2(PLANTA.painel.baseY - OLHO, distPainel) * 180 / Math.PI;
  var larguraAng = 2 * Math.atan2(PLANTA.painel.w / 2, distPainel) * 180 / Math.PI;

  ok(elevTopo <= 30, "C1: o topo do painel exige " + elevTopo.toFixed(1) + " graus de elevacao (limite 30)");
  ok(elevBase >= -25, "C1: a base do painel exige " + elevBase.toFixed(1) + " graus para baixo (limite -25)");
  ok(larguraAng <= 82, "C2: o painel ocupa " + larguraAng.toFixed(1) + " graus de largura (FOV util do Quest 2 ~90)");
  ok(distPainel >= 1.2, "C3: o painel fica a " + distPainel.toFixed(2) + " m - perto demais (desconforto de vergencia)");
  nota("C painel a " + distPainel.toFixed(2) + " m; elevacao " + elevBase.toFixed(1) + " a " + elevTopo.toFixed(1) +
       " graus; largura " + larguraAng.toFixed(1) + " graus");

  // C5: o painel inclina PARA quem esta na marca (o topo vem na direcao do
  // olho). A rotacao do A-Frame e YXZ: X positivo traz o topo para frente.
  var incl = inclinacaoPainel({ x: PLANTA.painel.cx, z: PLANTA.painel.cz }, { x: obs.x, y: OLHO, z: obs.z });
  var elevCentro = Math.atan2(PLANTA.painel.cy - OLHO, distPainel) * 180 / Math.PI;
  ok(incl > 0 && Math.abs(incl - elevCentro) < 1,
     "C5: o painel inclina " + incl + " graus; para encarar o olho seriam " + elevCentro.toFixed(1));
  nota("C5 painel inclinado " + incl + " graus para o olho (centro " + elevCentro.toFixed(1) + " graus acima)");

  // C4: o mapa inteiro precisa ser alcancavel pelo olhar de quem esta na marca.
  REGIOES_MESA.forEach(function (r) {
    var ax = PLANTA.mapa.cx + r.x - obs.x, az = PLANTA.mapa.cz + r.z - obs.z;
    var dh = Math.sqrt(ax * ax + az * az);
    var depressao = Math.atan2(OLHO - PLANTA.mapa.topo, dh) * 180 / Math.PI;
    ok(depressao <= 55, "C4: olhar para " + r.id + " exige " + depressao.toFixed(1) + " graus para baixo (limite 55)");
  });

  // ========================================================================
  // P - Layout interno do painel
  // ========================================================================

  var meiaL = PLANTA.painel.w / 2, meiaA = PLANTA.painel.h / 2;
  var chartDir = CH.x1 + 0.1;                       // alvo do ano tem 0,2 de largura
  var paredeMeia = ((PAREDE.cols - 1) * PAREDE.gap + PAREDE.size) / 2;
  var paredeEsq = PAREDE.x - paredeMeia;
  var paredeTopo = PAREDE.y0 + (PAREDE.cols - 1) * PAREDE.gap + PAREDE.size / 2;

  ok(chartDir < paredeEsq, "P1: o grafico encosta na parede de blocos (" + chartDir.toFixed(3) + " vs " + paredeEsq.toFixed(3) + ")");
  ok(PAREDE.x + paredeMeia < meiaL - 0.05, "P2: a parede de blocos passa da borda direita do painel");
  ok(CH.x0 - 0.12 > -meiaL, "P2: os rotulos do eixo passam da borda esquerda do painel");
  ok(CH.baseY + CH.maxH < 0.24, "P3: o topo do grafico encosta no filete do cabecalho");
  ok(CH.baseY - 0.07 > -meiaA + 0.05, "P3: os rotulos de ano saem por baixo do painel");
  ok(paredeTopo < 0.17, "P4: a parede de blocos encosta no titulo 'para onde vao os alunos'");
  nota("P grafico [" + CH.x0 + ", " + chartDir.toFixed(2) + "] | parede [" + paredeEsq.toFixed(2) + ", " +
       (PAREDE.x + paredeMeia).toFixed(2) + "] | painel +-" + meiaL);

  // ========================================================================
  // D - Dados e narrativa
  // ========================================================================

  var contextos = [DADOS.brasil].concat(DADOS.regioes);
  var suspeito = /NaN|undefined|Infinity|null/;

  contextos.forEach(function (ctx) {
    DADOS.indicadores.forEach(function (ind) {
      var n = computeNarrative(ctx, ind.key);
      ok(!suspeito.test(n.manchete), "D1: manchete suja em " + ctx.id + "/" + ind.key + ": " + n.manchete);
      ok(!suspeito.test(n.texto), "D1: texto sujo em " + ctx.id + "/" + ind.key + ": " + n.texto);
      ok(!suspeito.test(n.comparativo), "D1: comparativo sujo em " + ctx.id + "/" + ind.key);
      ok(n.manchete.length > 10 && n.texto.length > 20, "D1: narrativa curta demais em " + ctx.id + "/" + ind.key);

      DADOS.anos.forEach(function (_, idx) {
        var blocos = anotacoes(ctx, ind.key, idx);
        ok(blocos.length === 3, "D2: a camada textual tem " + blocos.length + " anotacoes (esperado 3) em " + ctx.id + "/" + ind.key);
        blocos.forEach(function (b, bi) {
          ok(b.corpo && b.corpo.length > 0 && !suspeito.test(b.corpo),
             "D2: anotacao " + bi + " vazia ou suja em " + ctx.id + "/" + ind.key + " ano " + DADOS.anos[idx]);
          ok(b.titulo && b.titulo.length > 0, "D2: anotacao " + bi + " sem titulo em " + ctx.id + "/" + ind.key);
        });
      });
    });
  });
  nota("D1/D2 " + (contextos.length * DADOS.indicadores.length) + " narrativas e " +
       (contextos.length * DADOS.indicadores.length * DADOS.anos.length * 3) + " anotacoes verificadas");

  // D3: a parede da composicao soma SEMPRE 100 blocos.
  var anosComp = 0;
  contextos.forEach(function (ctx) {
    DADOS.anos.forEach(function (_, idx) {
      var comp = composicaoDoAno(ctx, idx);
      if (!comp) return;
      anosComp += 1;
      var ns = reparte100(comp);
      var soma = ns[0] + ns[1] + ns[2];
      ok(soma === 100, "D3: a parede de " + ctx.id + " em " + DADOS.anos[idx] + " soma " + soma + " blocos");
      ok(ns.every(function (n) { return n >= 0 && n <= 100; }),
         "D3: fatia invalida em " + ctx.id + "/" + DADOS.anos[idx] + ": " + ns.join("/"));
    });
  });
  nota("D3 " + anosComp + " composicoes anuais somam 100 blocos");

  // D4: blocosPara nunca estoura o trilho nem apaga um valor positivo.
  contextos.forEach(function (ctx) {
    DADOS.indicadores.forEach(function (ind) {
      ctx.series[ind.key].forEach(function (v, idx) {
        var n = blocosPara(v);
        ok(n >= 0 && n <= 100, "D4: " + n + " blocos para " + v + "% (" + ctx.id + "/" + ind.key + ")");
        if (v != null && v > 0) ok(n >= 1, "D4: " + v + "% virou 0 bloco em " + ctx.id + "/" + ind.key + " " + DADOS.anos[idx]);
      });
    });
  });

  // D4b: o rotulo do callout tem que seguir o SENTIDO do indicador. Num
  // indicador positivo (conclusao, eficiencia) o PIOR ano e o VALE, nao o pico;
  // numa taxa neutra (retencao) nao existe melhor nem pior. Este check existe
  // porque a versao original rotulava os dois extremos pela mesma regra e
  // chamava de "melhor ano" o pior ano de conclusao da serie.
  contextos.forEach(function (ctx) {
    DADOS.indicadores.forEach(function (ind) {
      var r = rotulosCallout(ind.sentido);
      var n = computeNarrative(ctx, ind.key);
      var serie = ctx.series[ind.key];
      var vCritico = serie[n[r.criticoEm]];
      var vOutro = serie[n[r.outroEm]];
      if (vCritico == null || vOutro == null || vCritico === vOutro) return;

      if (ind.sentido === "negativo") {
        ok(r.critico === "PIOR ANO" && vCritico > vOutro,
           "D4b: em " + ind.key + " (negativo) o PIOR ano deveria ser o maior valor");
      } else if (ind.sentido === "positivo") {
        ok(r.critico === "PIOR ANO" && vCritico < vOutro,
           "D4b: em " + ind.key + " (positivo) o PIOR ano deveria ser o MENOR valor, e veio " +
           vCritico + "% contra " + vOutro + "% em " + ctx.id);
      } else {
        ok(r.critico === "MAIOR" && r.outro === "MENOR",
           "D4b: um indicador neutro (" + ind.key + ") nao pode ter melhor nem pior ano");
      }
    });
  });

  // D4c: os dois cards nunca podem se encavalar. Quando pico e vale caem em
  // anos vizinhos, o segundo desce - a regra vive em buildSerie, entao aqui
  // conferimos a aritmetica que ela usa.
  var passoAno = (CH.x1 - CH.x0) / (DADOS.anos.length - 1);
  ok(CALLOUT.w + 0.08 > passoAno,
     "D4c: o limiar de colisao (" + (CALLOUT.w + 0.08).toFixed(2) +
     ") nao cobre nem um passo de ano (" + passoAno.toFixed(2) + ")");

  // D5: toda regiao tem leitmotiv (a ancora sonora nao pode faltar em nenhuma).
  DADOS.regioes.forEach(function (r) {
    ok(Array.isArray(REGIAO_MOTIFS[r.id]) && REGIAO_MOTIFS[r.id].length >= 2,
       "D5: a regiao " + r.id + " esta sem leitmotiv");
  });
  ok(REGIOES_MESA.length === DADOS.regioes.length,
     "D5: a planta tem " + REGIOES_MESA.length + " regioes e dados.json tem " + DADOS.regioes.length);
  REGIOES_MESA.forEach(function (r) {
    ok(!!contextoById(r.id), "D5: a regiao '" + r.id + "' da planta nao existe em dados.json");
  });

  // D6: o grafico cobre exatamente os anos da serie.
  ok(Math.abs(chartXFor(0) - CH.x0) < 1e-6 && Math.abs(chartXFor(DADOS.anos.length - 1) - CH.x1) < 1e-6,
     "D6: o eixo do tempo nao cobre 2017-2024 de ponta a ponta");
  ok(Math.abs(chartYFor(0) - CH.baseY) < 1e-6 && Math.abs(chartYFor(100) - (CH.baseY + CH.maxH)) < 1e-6,
     "D6: o eixo de valores nao vai de 0 a 100%");

  // D7: a historia se revela por passos e NUNCA adianta o futuro: antes de
  // 2024, nenhum texto cita um ano que a pessoa ainda nao percorreu, e os
  // callouts (pior/melhor ano) so existem no ultimo ano.
  var revelacoes = 0;
  contextos.forEach(function (ctx) {
    DADOS.indicadores.forEach(function (ind) {
      var serie = ctx.series[ind.key];
      var ultimoValido = lastValidIndex(serie);
      DADOS.anos.forEach(function (ano, idx) {
        var n = computeNarrative(ctx, ind.key, idx);
        ok(!suspeito.test(n.manchete + n.texto + n.comparativo), "D7: narrativa suja ate " + ano + " em " + ctx.id + "/" + ind.key);
        ok(n.completa === (idx >= ultimoValido), "D7: 'completa' errado ate " + ano + " em " + ctx.id + "/" + ind.key);
        var textos = anotacoes(ctx, ind.key, idx).map(function (bl) { return bl.corpo; }).join(" ") + " " + n.manchete;
        var futuros = (textos.match(/20[12][0-9]/g) || []).filter(function (y) { return Number(y) > ano; });
        ok(futuros.length === 0, "D7: ate " + ano + ", o texto de " + ctx.id + "/" + ind.key + " ja cita " + futuros.join(", "));
        var cs = calloutsDaSerie(ctx, ind.key, idx);
        if (idx < ultimoValido) ok(cs.length === 0, "D7: callout antes do fim (ate " + ano + ") em " + ctx.id + "/" + ind.key);
        revelacoes += 1;
      });
      ok(calloutsDaSerie(ctx, ind.key, DADOS.anos.length - 1).length > 0, "D7: sem callouts no fim da historia em " + ctx.id + "/" + ind.key);
    });
  });
  ok(/2024/.test(tituloMesa("eficiencia", 7)) && /2017/.test(tituloMesa("eficiencia", 0)), "D7: o titulo da mesa nao acompanha o ano");
  ok(kickerPainel(DADOS.brasil) !== kickerPainel(DADOS.regioes[0]), "D7: o painel do Brasil e o de uma regiao tem o mesmo cabecalho");
  nota("D7 " + revelacoes + " passos da historia sem adiantar o futuro");

  // ========================================================================
  // T - Tarefas do estudo (07-tarefas.js) e treino (85-treino.js)
  // ========================================================================

  // T1: o gabarito e calculado e cada resposta aceita e uma opcao da tarefa.
  var pacote = gerarTarefas(DADOS);
  ok(pacote.lista.length === 3, "T1: esperadas 3 tarefas, vieram " + pacote.lista.length);
  pacote.lista.forEach(function (t) {
    ok(t.opcoes.indexOf(t.correta) >= 0, "T1: a resposta estrita de " + t.id + " (" + t.correta + ") nao esta entre as opcoes");
    ok(t.aceitas.indexOf(t.correta) >= 0, "T1: " + t.id + " nao aceita a propria resposta estrita");
    t.aceitas.forEach(function (a) { ok(t.opcoes.indexOf(a) >= 0, "T1: " + t.id + " aceita " + a + ", que nao e opcao"); });
    ok(t.aceitas.length < t.opcoes.length, "T1: " + t.id + " aceita todas as opcoes (a tarefa nao discrimina nada)");
  });

  // T2: a tolerancia de 1 bloco. Qualquer candidato aceito fica a menos de
  // 1 pp do maximo; qualquer candidato recusado fica a 1 pp ou mais.
  var bEv = DADOS.brasil.series.evasao;
  var maxEv = Math.max.apply(null, bEv.filter(function (v) { return v != null; }));
  DADOS.anos.forEach(function (ano, i) {
    if (bEv[i] == null) return;
    var aceito = pacote.lista[0].aceitas.indexOf(String(ano)) >= 0;
    ok(aceito === (maxEv - bEv[i] < TOLERANCIA_PP), "T2: T1 trata " + ano + " (" + bEv[i] + "%) de forma inconsistente com a tolerancia");
  });
  var c1 = corrigirResposta(pacote.lista[0], pacote.lista[0].correta);
  ok(c1.correta && c1.corretaEstrita, "T2: a resposta estrita nao e corrigida como certa");
  nota("T1/T2 gabarito: " + pacote.lista.map(function (t) { return t.id + "=" + t.aceitas.join("|"); }).join("  ") +
       (pacote.avisos.length ? "  (" + pacote.avisos.length + " aviso(s) de empate)" : ""));

  // T3: o treino cabe na sala e a marca do passo fica perto (um passo real).
  var dentroSala = function (p, m) { return Math.abs(p.x) <= PLANTA.sala.w / 2 - m && Math.abs(p.z) <= PLANTA.sala.d / 2 - m; };
  ["inicio", "alvo", "disco", "marca"].forEach(function (k) {
    ok(dentroSala(TREINO_PONTOS[k], 0.4), "T3: o ponto de treino '" + k + "' fica a menos de 0,4 m da parede");
  });
  // O passo e LATERAL (para a direita, como na linha do tempo de verdade) e
  // atravessa uma fronteira de ano com a mesma folga.
  var passo = TREINO_PONTOS.marca.x - TREINO_PONTOS.disco.x;
  ok(Math.abs(TREINO_PONTOS.marca.z - TREINO_PONTOS.disco.z) < 1e-6, "T3: o passo do treino nao e lateral");
  ok(passo >= 0.2 && passo <= 0.5, "T3: o passo lateral do treino tem " + passo.toFixed(2) + " m (esperado 0,2-0,5 m)");
  ok(Math.abs(passo - TREINO_TRECHO) < 1e-6, "T3: a marca de 2018 nao fica no centro do 2o trecho");
  ok(TREINO_HISTERESE === PLANTA.faixa.histerese, "T3: o treino usa outra folga de fronteira que a linha do tempo");
  var dAlvo = Math.hypot(TREINO_PONTOS.alvo.x - TREINO_PONTOS.inicio.x, TREINO_PONTOS.alvo.z - TREINO_PONTOS.inicio.z);
  var elevAlvo = Math.atan2(TREINO_PONTOS.alvo.y - 1.6, dAlvo) * 180 / Math.PI;
  ok(elevAlvo > -25 && elevAlvo < 10, "T3: o alvo de pinca fica a " + elevAlvo.toFixed(1) + " graus do olhar");
  nota("T3 treino: alvo a " + dAlvo.toFixed(2) + " m (" + elevAlvo.toFixed(1) + " graus), passo de " + passo.toFixed(2) + " m");

  // ========================================================================
  // H - Contrato HTML <-> codigo
  // ========================================================================

  var idsHtml = {};
  var re = /id="([A-Za-z0-9_-]+)"/g, m;
  while ((m = re.exec(__html))) idsHtml[m[1]] = true;

  DOM_IDS.forEach(function (id) {
    ok(idsHtml[id], "H1: DOM_IDS pede #" + id + ", que nao existe no index.html");
  });

  // Todo dom.X usado nos modulos precisa estar em DOM_IDS - foi exatamente
  // este furo que deixou TODAS as legendas 3D mudas na versao anterior.
  var usados = {};
  Object.keys(__fontes).forEach(function (nome) {
    // Sem os comentarios: a propria explicacao desta regra cita "dom.X".
    var codigo = __fontes[nome].replace(/\/\/[^\n]*/g, "").replace(/\/\*[\s\S]*?\*\//g, "");
    var r2 = /\bdom\.([A-Za-z0-9_]+)\b/g, mm;
    while ((mm = r2.exec(codigo))) usados[mm[1]] = nome;
  });
  // Entidades criadas em JS (dom.X = ...) nao precisam estar no HTML.
  var criados = {};
  Object.keys(__fontes).forEach(function (nome) {
    var r3 = /\bdom\.([A-Za-z0-9_]+)\s*=[^=]/g, m4;
    while ((m4 = r3.exec(__fontes[nome]))) criados[m4[1]] = true;
  });
  Object.keys(usados).forEach(function (chave) {
    if (criados[chave]) return;
    ok(DOM_IDS.indexOf(chave) >= 0,
       "H2: " + usados[chave] + " usa dom." + chave + ", que nao esta em DOM_IDS (vai ser undefined)");
  });
  nota("H1/H2 " + DOM_IDS.length + " ids declarados, " + Object.keys(usados).length + " usados no codigo");

  // H3: todo script citado no HTML existe na pasta.
  var re3 = /js-ambiente\/([A-Za-z0-9_.-]+\.js)/g, m3;
  var citados = [];
  while ((m3 = re3.exec(__html))) if (citados.indexOf(m3[1]) < 0) citados.push(m3[1]);
  citados.forEach(function (f) {
    ok(__arquivos.indexOf(f) >= 0, "H3: o index.html carrega js-ambiente/" + f + ", que nao existe");
  });
  __arquivos.filter(function (f) { return /\.js$/.test(f); }).forEach(function (f) {
    ok(citados.indexOf(f) >= 0, "H3: js-ambiente/" + f + " existe mas o index.html nao carrega (codigo morto)");
  });
  nota("H3 " + citados.length + " modulos carregados na ordem do index.html");

  // H4: nenhum alvo de olhar sem a classe que o raycaster mira.
  var alvos = (__html.match(/class="[^"]*alvo-[a-z]+[^"]*"/g) || []);
  alvos.forEach(function (c) {
    ok(/\bclickable\b/.test(c), "H4: alvo sem a classe clickable: " + c);
  });
  nota("H4 " + alvos.length + " alvos estaticos de olhar no HTML");
})();
`;

vm.runInContext(CHECKS, sandbox, { filename: "checks.js" });

const falhas = sandbox.__falhas;
sandbox.__info.forEach((i) => console.log(`  · ${i}`));
console.log("");

if (falhas.length) {
  console.error(`FALHOU (${falhas.length}):`);
  falhas.forEach((f) => console.error(`  ✗ ${f}`));
  process.exit(1);
}
console.log("logic-check do ambiente: tudo verde.");
