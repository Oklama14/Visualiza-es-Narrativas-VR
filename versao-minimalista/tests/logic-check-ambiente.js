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
  "10-voxel", "15-sala", "20-mapa", "30-contexto", "40-painel",
  "50-interacao", "60-boot", "90-estudo",
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
  Object.keys(usados).forEach(function (chave) {
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
