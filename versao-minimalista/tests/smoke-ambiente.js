// ----------------------------------------------------------------------------
// smoke do ambiente: sobe um servidor estatico, abre a cena num Chromium
// headless e exercita o caminho do desktop (que compartilha TODA a logica com
// o caminho do olhar - so muda quem dispara o mouseenter/click).
//
//   node tests/smoke-ambiente.js
//
// Verifica: boot sem erro de console, sala/mesa/regioes construidas, foco por
// hover, painel emergente com conteudo, troca de indicador, troca de ano,
// camada textual reescrita, parede somando 100 e fechamento do painel.
// Opcional: --shot <arquivo.png> salva uma captura da cena.
// ----------------------------------------------------------------------------

const { chromium } = require("playwright");
const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "..");
const PORTA = 4187;

const TIPOS = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
};

function servir() {
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      const rel = decodeURIComponent(req.url.split("?")[0]).replace(/^\/+/, "") || "index.html";
      const arquivo = path.join(ROOT, rel);
      if (!arquivo.startsWith(ROOT) || !fs.existsSync(arquivo) || fs.statSync(arquivo).isDirectory()) {
        res.writeHead(404).end("nao encontrado");
        return;
      }
      res.writeHead(200, { "content-type": TIPOS[path.extname(arquivo)] || "application/octet-stream" });
      fs.createReadStream(arquivo).pipe(res);
    });
    server.listen(PORTA, "127.0.0.1", () => resolve(server));
  });
}

const falhas = [];
const notas = [];
const ok = (cond, msg) => { if (!cond) falhas.push(msg); };

(async () => {
  const server = await servir();
  const browser = await chromium.launch({ args: ["--enable-unsafe-swiftshader", "--use-gl=swiftshader"] });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });

  const errosConsole = [];
  page.on("console", (m) => { if (m.type() === "error") errosConsole.push(m.text()); });
  page.on("pageerror", (e) => errosConsole.push(`pageerror: ${e.message}`));

  await page.goto(`http://127.0.0.1:${PORTA}/index.html`, { waitUntil: "load" });

  // Espera o boot terminar (state.pronto e setado no fim de initExperience).
  await page.waitForFunction(() => window.AMB && window.AMB.state.pronto, null, { timeout: 25000 })
    .catch(() => falhas.push("BOOT: state.pronto nunca ficou true (a cena nao subiu)"));
  await page.waitForTimeout(1200);

  // Fecha o onboarding: fora dele nada da cena e alcancavel pelo mouse.
  await page.evaluate(() => {
    const b = document.getElementById("onboardStart");
    if (b && !document.getElementById("onboardOverlay").hidden) b.click();
  });

  // ---- estrutura construida ------------------------------------------------
  const estrutura = await page.evaluate(() => ({
    sala: document.querySelectorAll("#sala > *").length,
    zonas: document.querySelectorAll("#zonas > *").length,
    regioes: document.querySelectorAll("#regioes > a-entity").length,
    colunas: document.querySelectorAll("#colunas > a-entity").length,
    slabs: document.querySelectorAll("#contextoSlabs > a-entity").length,
    alvosRegiao: document.querySelectorAll(".alvo-regiao").length,
    alvosIndicador: document.querySelectorAll(".alvo-indicador").length,
    loadingEscondido: document.getElementById("loadingOverlay").hidden,
  }));
  ok(estrutura.sala >= 10, `SALA: so ${estrutura.sala} elementos construidos`);
  ok(estrutura.zonas >= 8, `ZONAS: so ${estrutura.zonas} elementos de piso`);
  ok(estrutura.regioes === 5, `MAPA: ${estrutura.regioes} regioes (esperado 5)`);
  ok(estrutura.colunas === 4, `MAPA: ${estrutura.colunas} colunas de indicador (esperado 4)`);
  ok(estrutura.slabs === 3, `CONTEXTO: ${estrutura.slabs} anotacoes (esperado 3)`);
  ok(estrutura.alvosRegiao === 5, `GAZE: ${estrutura.alvosRegiao} alvos de regiao`);
  ok(estrutura.alvosIndicador === 4, `GAZE: ${estrutura.alvosIndicador} alvos de indicador`);
  ok(estrutura.loadingEscondido, "BOOT: o overlay de carregamento nao sumiu");
  notas.push(`estrutura: ${estrutura.regioes} regioes, ${estrutura.colunas} colunas, ${estrutura.slabs} anotacoes`);

  // ---- painel fechado no inicio -------------------------------------------
  const inicio = await page.evaluate(() => ({
    painelVisivel: document.getElementById("painel").object3D.visible,
    textoContexto: document.querySelector("#contextoSlabs a-text").getAttribute("value"),
  }));
  ok(!inicio.painelVisivel, "PAINEL: aparece antes de qualquer olhar (deveria ser emergente)");

  // ---- olhar numa regiao (hover) ------------------------------------------
  await page.evaluate(() => {
    document.querySelector('.alvo-regiao[data-regiao="nordeste"]').emit("mouseenter");
  });
  // O foco tem dwell de 140 ms (anti-tremor do olhar); sob carga o timer pode
  // atrasar, entao esperamos a CONDICAO em vez de um tempo fixo.
  const focou = await page
    .waitForFunction(() => window.AMB.state.focoId === "nordeste", null, { timeout: 4000 })
    .then(() => true)
    .catch(() => false);
  ok(focou, "FOCO: o olhar em nordeste nao chegou a state.focoId");

  // ---- confirmar: o painel emerge -----------------------------------------
  await page.evaluate(() => window.AMB.confirmar(document.querySelector('.alvo-regiao[data-regiao="nordeste"]')));
  await page.waitForTimeout(900);

  const aberto = await page.evaluate(() => {
    const val = (id) => document.getElementById(id).getAttribute("value");
    const p = document.getElementById("painel").object3D;
    return {
      visivel: p.visible,
      pos: [p.position.x, p.position.y, p.position.z].map((n) => +n.toFixed(2)),
      escala: +p.scale.x.toFixed(2),
      titulo: val("painelTitulo"),
      manchete: val("painelManchete"),
      readout: val("chartReadout"),
      legConc: val("paredeLegConc"),
      legRet: val("paredeLegRet"),
      legEvad: val("paredeLegEvad"),
      marcadores: document.querySelectorAll("#chartMarcadores > *").length,
      alvosAno: document.querySelectorAll(".alvo-ano").length,
      anotacoes: document.querySelectorAll("#chartAnotacoes > *").length,
      linha: document.querySelectorAll("#chartLinha > *").length,
      fio: document.getElementById("fio").object3D.visible,
      ctxTitulo: document.querySelectorAll("#contextoSlabs a-text")[1].getAttribute("value"),
    };
  });

  ok(aberto.visivel, "PAINEL: nao ficou visivel apos confirmar");
  ok(aberto.escala > 0.95, `PAINEL: a animacao de emergencia nao terminou (escala ${aberto.escala})`);
  ok(/Nordeste/.test(aberto.titulo), `PAINEL: titulo inesperado "${aberto.titulo}"`);
  ok(aberto.manchete.length > 15, "PAINEL: manchete vazia");
  ok(aberto.alvosAno === 8, `PAINEL: ${aberto.alvosAno} alvos de ano (esperado 8)`);
  ok(aberto.linha >= 7, `PAINEL: so ${aberto.linha} segmentos de linha`);
  ok(aberto.anotacoes >= 3, `PAINEL: so ${aberto.anotacoes} anotacoes (callouts + evento)`);
  ok(aberto.fio, "PAINEL: o fio ate a regiao nao apareceu");
  ok(/\d/.test(aberto.legConc) && /\d/.test(aberto.legRet) && /\d/.test(aberto.legEvad), "PAREDE: legenda sem numeros");
  ok(aberto.ctxTitulo.length > 0, "CONTEXTO: a camada textual nao foi reescrita");

  // a parede soma 100 blocos
  const soma = [aberto.legConc, aberto.legRet, aberto.legEvad]
    .map((s) => parseInt(String(s).trim(), 10))
    .reduce((a, b) => a + b, 0);
  ok(soma === 100, `PAREDE: as 3 fatias somam ${soma} blocos (esperado 100)`);
  notas.push(`painel: ${aberto.titulo} | ${aberto.readout} | parede ${soma} blocos`);

  // ---- trocar indicador ----------------------------------------------------
  const antes = aberto.manchete;
  await page.evaluate(() => window.AMB.confirmar(document.querySelector('.alvo-indicador[data-indicador="evasao"]')));
  await page.waitForTimeout(400);
  const depois = await page.evaluate(() => ({
    key: window.AMB.state.indicadorKey,
    manchete: document.getElementById("painelManchete").getAttribute("value"),
    alvosAno: document.querySelectorAll(".alvo-ano").length,
  }));
  ok(depois.key === "evasao", `INDICADOR: state.indicadorKey = ${depois.key}`);
  ok(depois.manchete !== antes, "INDICADOR: a manchete nao mudou ao trocar de indicador");
  ok(depois.alvosAno === 8, `INDICADOR: ${depois.alvosAno} alvos de ano apos redesenhar`);

  // ---- trocar ano ----------------------------------------------------------
  await page.evaluate(() => window.AMB.confirmar(document.querySelector('.alvo-ano[data-ano="3"]')));
  await page.waitForTimeout(350);
  const ano = await page.evaluate(() => ({
    idx: window.AMB.state.anoIdx,
    readout: document.getElementById("chartReadout").getAttribute("value"),
    paredeAno: document.getElementById("paredeAno").getAttribute("value"),
    ctxCorpo: document.querySelectorAll("#contextoSlabs a-text")[2].getAttribute("value"),
  }));
  ok(ano.idx === 3, `ANO: state.anoIdx = ${ano.idx} (esperado 3)`);
  ok(/2020/.test(ano.readout), `ANO: readout "${ano.readout}" nao mostra 2020`);
  ok(/2020/.test(ano.paredeAno), `ANO: a parede nao seguiu para 2020 ("${ano.paredeAno}")`);
  notas.push(`ano 2020: ${ano.readout}`);

  // ---- teleporte -----------------------------------------------------------
  await page.evaluate(() => window.AMB.confirmar(document.querySelector('[data-destino="usuario"]')));
  await page.waitForTimeout(400);
  const rig = await page.evaluate(() => {
    const p = document.getElementById("cameraRig").object3D.position;
    return { x: +p.x.toFixed(2), y: +p.y.toFixed(2), z: +p.z.toFixed(2) };
  });
  ok(rig.y === 0, `TELEPORTE: o rig foi para y=${rig.y} (precisa ser 0; em VR a altura vem do headset)`);
  notas.push(`rig apos teleporte: ${rig.x}, ${rig.y}, ${rig.z}`);

  // ---- fechar --------------------------------------------------------------
  await page.evaluate(() => window.AMB.confirmar(document.getElementById("painelFechar")));
  await page.waitForTimeout(300);
  const fechado = await page.evaluate(() => ({
    visivel: document.getElementById("painel").object3D.visible,
    fio: document.getElementById("fio").object3D.visible,
    regiao: window.AMB.state.regiaoId,
  }));
  ok(!fechado.visivel, "FECHAR: o painel continuou visivel");
  ok(!fechado.fio, "FECHAR: o fio continuou visivel");
  ok(fechado.regiao === null, `FECHAR: state.regiaoId = ${fechado.regiao}`);

  // ---- varredura completa --------------------------------------------------
  // 5 regioes x 4 indicadores x 8 anos = 160 combinacoes. Nao verificamos o
  // pixel: confiamos na trava de linha unica (setText -> console.error), que e
  // justamente o defeito que so apareceria dentro do headset.
  const combinacoes = await page.evaluate(async () => {
    const regioes = window.AMB.REGIOES_MESA.map((r) => r.id);
    const inds = ["evasao", "conclusao", "eficiencia", "retencao"];
    let n = 0;
    for (const r of regioes) {
      for (const i of inds) {
        window.AMB.trocarIndicador(i);
        window.AMB.abrirPainel(r);
        for (let a = 0; a < 8; a += 1) {
          window.AMB.selecionarAno(a, false);
          n += 1;
        }
      }
    }
    window.AMB.fecharPainel();
    return n;
  });
  ok(combinacoes === 160, `VARREDURA: ${combinacoes} combinacoes (esperado 160)`);
  notas.push(`varredura: ${combinacoes} combinacoes regiao x indicador x ano`);
  await page.waitForTimeout(300);

  // ---- console limpo -------------------------------------------------------
  const relevantes = errosConsole.filter((e) => !/WebGL|GPU|swiftshader|Failed to load resource.*favicon/i.test(e));
  ok(relevantes.length === 0, `CONSOLE: ${relevantes.length} erro(s): ${relevantes.slice(0, 4).join(" | ")}`);

  const shotIdx = process.argv.indexOf("--shot");
  if (shotIdx > 0 && process.argv[shotIdx + 1]) {
    // Captura do ponto de observacao do desenho, com o painel aberto.
    await page.evaluate(() => {
      window.AMB.irPara("usuario");
      window.AMB.abrirPainel("nordeste");
    });
    await page.waitForTimeout(1400);
    await page.screenshot({ path: process.argv[shotIdx + 1] });
    notas.push(`captura salva em ${process.argv[shotIdx + 1]}`);
  }

  await browser.close();
  server.close();

  notas.forEach((n) => console.log(`  · ${n}`));
  console.log("");
  if (falhas.length) {
    console.error(`FALHOU (${falhas.length}):`);
    falhas.forEach((f) => console.error(`  ✗ ${f}`));
    process.exit(1);
  }
  console.log("smoke do ambiente: tudo verde.");
})();
