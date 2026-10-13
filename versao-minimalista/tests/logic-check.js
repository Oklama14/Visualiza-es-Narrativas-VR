// ----------------------------------------------------------------------------
// logic-check (Fase 5.1) - roda SEM navegador: avalia os modulos js/ num
// sandbox Node (vm) com stubs de DOM e exercita a logica pura: integridade dos
// 70 contextos x 4 indicadores, narrativa sem NaN/undefined, momentos da
// abertura guiada, arredondamento dos voxels, geometria das estacoes (zonas de
// ativacao sem sobreposicao, conteudo dentro da sala), alinhamento do corredor,
// tarefas do estudo, leitmotivs/notas e historias curadas.
// Rode com: node tests/logic-check.js
// ----------------------------------------------------------------------------

const vm = require("node:vm");
const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "..");
const ORDEM = [
  "telemetry", "station", "voxel", "locomotion",
  "01-config", "02-audio", "03-historias", "04-boot", "05-selecao",
  "06-indicadores", "07-composicao", "08-timeline", "09-narrativa-guiada",
  "10-tour", "11-navegacao", "12-interacao", "13-util", "14-multiplos",
  "15-estacoes", "16-estudo",
];

function stubEl() {
  return {
    style: {}, dataset: {},
    setAttribute() {}, getAttribute() { return null; },
    appendChild() {}, append() {}, remove() {},
    addEventListener() {}, querySelector() { return null; }, querySelectorAll() { return []; },
    classList: { add() {}, remove() {}, toggle() {} },
  };
}

const sandbox = {
  console, Math, JSON, Date, URLSearchParams, performance,
  setTimeout, clearTimeout, setInterval, clearInterval,
  window: { location: { search: "" } },
  document: {
    readyState: "loading",
    addEventListener() {},
    getElementById() { return null; },
    querySelector() { return null; },
    querySelectorAll() { return []; },
    createElement() { return stubEl(); },
    body: stubEl(),
  },
  localStorage: { getItem() { return null; }, setItem() {} },
};
sandbox.window.document = sandbox.document;
vm.createContext(sandbox);

for (const nome of ORDEM) {
  const arquivo = path.join(ROOT, "js", `${nome}.js`);
  vm.runInContext(fs.readFileSync(arquivo, "utf8"), sandbox, { filename: `${nome}.js` });
}

sandbox.__dados = JSON.parse(fs.readFileSync(path.join(ROOT, "dados.json"), "utf8"));
sandbox.__html = fs.readFileSync(path.join(ROOT, "index.html"), "utf8");
// Fontes cruas dos modulos: usadas pelo S11 (registro do cache `dom`).
sandbox.__fontes = {};
for (const nome of ORDEM) {
  sandbox.__fontes[nome] = fs.readFileSync(path.join(ROOT, "js", `${nome}.js`), "utf8");
}
sandbox.__falhas = [];
sandbox.__info = [];

const CHECKS = String.raw`
(function () {
  "use strict";
  var falhas = __falhas, info = __info;
  function ok(cond, msg) { if (!cond) falhas.push(msg); }
  function limpa(s, onde) {
    ok(typeof s === "string" && s.length > 0, onde + ": texto vazio");
    ok(!/NaN|undefined|null/.test(String(s)), onde + ": texto sujo -> " + s);
  }

  DADOS = __dados;
  var anos = DADOS.anos;
  var contextos = [DADOS.brasil];
  DADOS.regioes.forEach(function (r) { contextos.push(r); (r.instituicoes || []).forEach(function (i) { contextos.push(i); }); });
  info.push("contextos: " + contextos.length + " | anos: " + anos.length);
  ok(contextos.length >= 70, "esperados >=70 contextos, ha " + contextos.length);

  // S1 - integridade das series e contagens
  var chaves = ["evasao", "conclusao", "eficiencia", "retencao"];
  contextos.forEach(function (c) {
    chaves.concat(["matriculas"]).forEach(function (k) {
      ok(Array.isArray(c.series[k]) && c.series[k].length === anos.length, c.id + "." + k + ": tamanho errado");
    });
    chaves.forEach(function (k) {
      c.series[k].forEach(function (v, i) {
        ok(v == null || (v >= 0 && v <= 100), c.id + "." + k + "[" + anos[i] + "]=" + v + " fora de 0-100");
      });
    });
    var ct = c.series.contagens;
    ok(ct && ct.concluidos && ct.evadidos && ct.retidos, c.id + ": contagens ausentes");
    if (ct) anos.forEach(function (_, i) {
      var m = c.series.matriculas[i];
      if (m > 0) {
        var soma = ct.concluidos[i] + ct.evadidos[i] + ct.retidos[i];
        ok(Math.abs(soma - m) <= Math.max(2, m * 0.02), c.id + "[" + anos[i] + "]: contagens (" + soma + ") != matriculas (" + m + ")");
      }
    });
  });

  // S2/S3 - narrativa e momentos para todos os contextos x indicadores
  var totalNarrativas = 0;
  contextos.forEach(function (c) {
    chaves.forEach(function (k) {
      var n = computeNarrative(c, k);
      limpa(n.manchete, c.id + "/" + k + "/manchete");
      limpa(n.texto, c.id + "/" + k + "/texto");
      limpa(n.fala, c.id + "/" + k + "/fala");
      totalNarrativas += 1;
      var serie = c.series[k];
      var temDado = serie.some(function (v) { return v != null; });
      if (temDado) {
        var ms = computeMomentos(c, k);
        ok(Array.isArray(ms) && ms.length >= 1, c.id + "/" + k + ": momentos vazios");
        ms.forEach(function (m) {
          ok(m.idx >= 0 && m.idx < anos.length, c.id + "/" + k + ": momento idx invalido " + m.idx);
          limpa(m.fala, c.id + "/" + k + "/momento");
        });
        var ex = extremos(serie);
        ok(serie[ex.peakIdx] != null && serie[ex.valleyIdx] != null, c.id + "/" + k + ": extremos em ano nulo");
      }
    });
    var cn = compNarrative(c);
    limpa(cn, c.id + "/compNarrative");
    var si = buildSintese(c);
    if (si) limpa(si, c.id + "/sintese");
  });
  info.push("narrativas verificadas: " + totalNarrativas);

  // S4 - arredondamento dos voxels da composicao (parede/torres de 100)
  var estouro = 0;
  contextos.forEach(function (c) {
    var ct = c.series.contagens;
    if (!ct) return;
    anos.forEach(function (_, i) {
      var m = c.series.matriculas[i];
      if (!(m > 0)) return;
      var nC = Math.round((ct.concluidos[i] / m) * 100);
      var nR = Math.round((ct.retidos[i] / m) * 100);
      ok(nC + nR <= 101, c.id + "[" + anos[i] + "]: voxels estouram (" + (nC + nR) + ")");
      if (nC + nR === 101) estouro += 1;
    });
  });
  info.push("casos de arredondamento 101 (evadidos=-1, tolerado): " + estouro);

  // S6 - geometria das estacoes: HTML x STATION_SPOTS x zonas de ativacao
  var re = /<a-entity id="st([A-Za-z]+)" position="([-\d.]+) 0 ([-\d.]+)" rotation="0 ([-\d.]+) 0" station="([^"]+)"/g;
  var m2, stations = {};
  function attr(s, nome) {
    var m = new RegExp(nome + ":\\s*([-\\d.]+)").exec(s);
    return m ? +m[1] : 0;
  }
  while ((m2 = re.exec(__html)) !== null) {
    var conf = m2[5];
    var sid = /id:\s*([a-z]+)/.exec(conf);
    if (!sid) continue;
    stations[sid[1]] = {
      x: +m2[2], z: +m2[3], rot: +m2[4],
      radius: attr(conf, "radius"), hyst: attr(conf, "hysteresis"),
      halfX: attr(conf, "halfX"), halfZ: attr(conf, "halfZ"),
    };
  }
  ok(Object.keys(stations).length === 6, "esperadas 6 estacoes no HTML, ha " + Object.keys(stations).length);
  STATION_ORDER.forEach(function (id) {
    ok(stations[id], "estacao sem container no HTML: " + id);
    var s = STATION_SPOTS[id], h = stations[id];
    if (s && h) {
      ok(Math.abs(s.x - h.x) < 0.001 && Math.abs(s.z - h.z) < 0.001, id + ": STATION_SPOTS != HTML (" + s.x + "," + s.z + " vs " + h.x + "," + h.z + ")");
      ok(Math.abs(s.rot - h.rot) < 0.001, id + ": rotacao divergente");
      ok(Math.abs(h.x) <= 8.5 && h.z >= -9 && h.z <= 6, id + ": ponto de observacao fora da sala");
    }
  });
  var ids = Object.keys(stations);
  function ehRet(S) { return S.halfX > 0 && S.halfZ > 0; }
  // Zonas circulares nao podem se sobrepor entre si.
  for (var a = 0; a < ids.length; a += 1) {
    for (var b = a + 1; b < ids.length; b += 1) {
      var A = stations[ids[a]], B = stations[ids[b]];
      if (ehRet(A) || ehRet(B)) continue; // zona retangular: regra propria abaixo
      var d = Math.hypot(A.x - B.x, A.z - B.z);
      ok(d > A.radius + B.radius, "zonas de " + ids[a] + " e " + ids[b] + " se sobrepoem (dist " + d.toFixed(2) + ")");
    }
  }
  // Zona retangular (Corredor do Tempo): precisa conter a faixa de caminhada
  // inteira (senao a cena pisca ao andar) e NAO pode conter o ponto de
  // observacao de nenhuma outra estacao (senao ativa a cena errada ao chegar).
  ids.forEach(function (id) {
    var S = stations[id];
    if (!ehRet(S)) return;
    ok(S.halfX >= WALK.half + 0.2, id + ": zona estreita demais para a faixa de caminhada (" + S.halfX + " < " + (WALK.half + 0.2) + ")");
    ok(Math.abs(WALK.z) + 0.2 <= S.halfZ, id + ": faixa de caminhada (z=" + WALK.z + ") fora da zona (halfZ=" + S.halfZ + ")");
    ids.forEach(function (outro) {
      if (outro === id) return;
      var O = stations[outro];
      var dentro = Math.abs(O.x - S.x) <= S.halfX + S.hyst && Math.abs(O.z - S.z) <= S.halfZ + S.hyst;
      ok(!dentro, "ponto de observacao de " + outro + " cai dentro da zona de " + id);
    });
  });

  // S6b - drill-down em arco: todos os cards dentro da sala e a frente do usuario.
  (function () {
    var stMapa = stations.mapa;
    if (!stMapa) return;
    var rad = (stMapa.rot * Math.PI) / 180, cs = Math.cos(rad), sn = Math.sin(rad);
    var maiorRegiao = 0;
    DADOS.regioes.forEach(function (r) { maiorRegiao = Math.max(maiorRegiao, r.instituicoes.length + 1); });
    var pos = arcPositions(maiorRegiao, 6, 3.4, 48, 0.7, 2.5);
    ok(pos.length === maiorRegiao, "arcPositions nao devolveu 1 posicao por card");
    pos.forEach(function (p, i) {
      var v = p.position.split(" ").map(Number);
      var wx = stMapa.x + v[0] * cs + v[2] * sn;
      var wz = stMapa.z - v[0] * sn + v[2] * cs;
      ok(Math.abs(wx) <= 8.2 && wz >= -8.7 && wz <= 5.7, "card " + i + " do drill fora da sala (" + wx.toFixed(2) + ", " + wz.toFixed(2) + ")");
      ok(v[1] - 0.32 > 0, "card " + i + " do drill abaixo do piso (y=" + v[1] + ")");
    });
  })();

  // S7 - corredor do tempo alinhado 1:1 com o grafico
  ok(Math.abs(WALK.half - CHART.x1) < 0.001, "WALK.half (" + WALK.half + ") != CHART.x1 (" + CHART.x1 + ")");
  for (var i = 0; i < anos.length; i += 1) {
    ok(Math.abs(walkXFor(i) - xFor(i)) < 0.001, "ano " + anos[i] + ": faixa do piso desalinhada do grafico");
  }
  var st = stations.timeline;
  if (st) ok(st.rot === 0 && st.x === 0, "stTimeline precisa de x=0/rot=0 (loop de caminhada usa X do mundo)");

  // S8 - tarefas do estudo derivaveis e consistentes
  var bEv = DADOS.brasil.series.evasao, pico = 0;
  bEv.forEach(function (v, i) { if (v != null && (bEv[pico] == null || v > bEv[pico])) pico = i; });
  ok(bEv[pico] != null, "T1: sem pico de evasao calculavel");
  var efs = DADOS.regioes.map(function (r) { return latestValue(r.series.eficiencia); });
  ok(efs.every(function (v) { return v != null; }), "T2: regiao sem eficiencia 2024");
  var i24 = anos.length - 1;
  var pc = Math.round((DADOS.brasil.series.contagens.concluidos[i24] / DADOS.brasil.series.matriculas[i24]) * 100);
  ok(pc >= 0 && pc <= 100, "T3: fracao de concluintes invalida (" + pc + ")");
  info.push("tarefas: T1=" + anos[pico] + " | T3=" + pc + " concluintes/100");

  // S9 - leitmotivs e notas cobrem o que e usado
  STATION_ORDER.forEach(function (id) { ok(STATION_MOTIFS[id], "estacao sem leitmotiv: " + id); });
  ["home", "selecao", "drill", "indicadores", "timeline", "composicao", "multiplos"].forEach(function (k) {
    ok(NOTAS[k], "setNota usa chave sem NOTAS: " + k);
  });

  // S11 - cache dom: todo id registrado existe no HTML e todo dom.X usado
  // esta registrado. Regressao do bug em que dom.captionText nunca era
  // registrado e setCaption() virava no-op (legendas 3D mudas na experiencia
  // inteira: abertura guiada, dicas de estacao, notas em VR e tarefas).
  (function () {
    var boot = __fontes["04-boot"];
    var bloco = /const ids = \[([\s\S]*?)\];/.exec(boot);
    ok(!!bloco, "04-boot: array de ids nao encontrado");
    if (!bloco) return;
    var registrados = (bloco[1].match(/"([^"]+)"/g) || []).map(function (s) { return s.slice(1, -1); });
    var idsHtml = {};
    (__html.match(/\bid="[^"]+"/g) || []).forEach(function (s) { idsHtml[s.slice(4, -1)] = true; });

    var usados = {};
    Object.keys(__fontes).forEach(function (f) {
      (__fontes[f].match(/\bdom\.[A-Za-z0-9_]+/g) || []).forEach(function (s) { usados[s.slice(4)] = f; });
    });

    registrados.forEach(function (id) {
      ok(idsHtml[id], "dom['" + id + "'] registrado mas nao existe no index.html");
    });
    Object.keys(usados).forEach(function (nome) {
      ok(registrados.indexOf(nome) >= 0, "dom." + nome + " usado (" + usados[nome] + ".js) mas nao registrado em 04-boot ids[]");
    });
    info.push("cache dom: " + registrados.length + " ids registrados, " + Object.keys(usados).length + " usados");
  })();

  // S12 - faixa de controles da timeline centrada em x=0 (nao jogada para um lado)
  (function () {
    function bloco(id) {
      var m = new RegExp('<a-entity id="' + id + '"[\\s\\S]*?\\n          </a-entity>').exec(__html);
      return m ? m[0] : "";
    }
    var alvos = [
      { id: "ctrlPrevYear", w: 0.5 }, { id: "ctrlNextYear", w: 0.5 },
      { id: "ctrlCompare", w: 1.02 }, { id: "ctrlSound", w: 1.15 }, { id: "ctrlReplay", w: 1.2 },
    ];
    var min = Infinity, max = -Infinity, achados = 0;
    alvos.forEach(function (a) {
      var m = new RegExp('id="' + a.id + '" position="([-\\d.]+) ([-\\d.]+) ([-\\d.]+)"').exec(__html);
      if (!m) return;
      achados += 1;
      min = Math.min(min, +m[1] - a.w / 2);
      max = Math.max(max, +m[1] + a.w / 2);
    });
    ok(achados === alvos.length, "controles da timeline: esperados " + alvos.length + ", achados " + achados);
    if (achados === alvos.length) {
      var centro = (min + max) / 2;
      ok(Math.abs(centro) < 0.12, "faixa de controles descentrada (centro em x=" + centro.toFixed(2) + ")");
      info.push("faixa de controles: " + min.toFixed(2) + " a " + max.toFixed(2));
    }
    void bloco;
  })();

  // S10 - historias curadas: contextos resolvem, modos e indicadores validos
  Object.keys(TOURS).forEach(function (tid) {
    TOURS[tid].cenas.forEach(function (cena, ci) {
      var onde = "tour " + tid + " cena " + (ci + 1);
      if (cena.tipo) { ok(["abertura", "fechamento"].indexOf(cena.tipo) >= 0, onde + ": tipo invalido"); return; }
      ok(["timeline", "composicao", "multiplos", "indicadores"].indexOf(cena.modo) >= 0, onde + ": modo invalido " + cena.modo);
      ok(resolveTourContext(cena.contextoId), onde + ": contexto nao resolve (" + cena.contextoId + ")");
      if (cena.indicador) ok(chaves.indexOf(cena.indicador) >= 0, onde + ": indicador invalido " + cena.indicador);
    });
  });
})();
`;

vm.runInContext(CHECKS, sandbox, { filename: "checks.js" });

sandbox.__info.forEach((linha) => console.log("  " + linha));
if (sandbox.__falhas.length) {
  console.error(`\nFALHAS (${sandbox.__falhas.length}):`);
  sandbox.__falhas.slice(0, 40).forEach((f) => console.error("  - " + f));
  if (sandbox.__falhas.length > 40) console.error(`  ... e mais ${sandbox.__falhas.length - 40}`);
  process.exitCode = 1;
} else {
  console.log("\nlogic-check: TODAS as verificacoes passaram.");
}
