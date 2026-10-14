// ----------------------------------------------------------------------------
// smoke do ambiente: sobe um servidor estatico, abre a cena num Chromium
// headless e exercita o caminho do desktop (que compartilha TODA a logica com
// o caminho do olhar - so muda quem dispara o mouseenter/click).
//
//   node tests/smoke-ambiente.js
//
// Verifica: boot sem erro de console, sala/mesa/regioes construidas, painel
// do Brasil em 2017 desde o inicio, linha do tempo no piso (andar muda o ano,
// sem pisca-pisca na fronteira, desfecho so em 2024), foco por hover, painel
// da regiao, troca de indicador mantendo o ano, volta pela faixa restaurando
// a ancora, parede somando 100 e fechamento voltando ao Brasil.
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
  page.on("pageerror", (e) => errosConsole.push(`pageerror: ${e.message}` + (process.env.STACK ? " @ " + e.stack : "")));

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

  // ---- inicio: painel do Brasil em 2017, linha do tempo no piso ------------
  // (piloto-v1) O painel e sempre visivel: sem regiao, mostra o Brasil. A
  // historia comeca em 2017 - a linha so tem o 1o ponto e nao ha desfecho.
  const visiveis = (sel) =>
    page.evaluate((q) => {
      const vis = (el) => {
        for (let o = el.object3D; o; o = o.parent) if (!o.visible) return false;
        return true;
      };
      return [...document.querySelectorAll(q)].filter((e) => e.object3D && vis(e)).length;
    }, sel);
  const inicio = await page.evaluate(() => {
    const val = (id) => document.getElementById(id).getAttribute("value");
    return {
      painelVisivel: document.getElementById("painel").object3D.visible,
      titulo: val("painelTitulo"),
      kicker: val("painelKicker"),
      ano: val("painelAno"),
      manchete: val("painelManchete"),
      anoIdx: window.AMB.state.anoIdx,
      faixa: !!document.getElementById("faixaTempo"),
      trechos: window.AMB.FAIXA ? window.AMB.FAIXA.trechos.length : 0,
      alvosAno: document.querySelectorAll(".alvo-ano").length,
      mesa: val("mesaValorTitulo"),
      rig: (() => { const p = document.getElementById("cameraRig").object3D.position; return { x: +p.x.toFixed(2), z: +p.z.toFixed(2) }; })(),
    };
  });
  ok(inicio.painelVisivel, "INICIO: o painel nao esta visivel (na v1 ele mostra o Brasil desde o comeco)");
  ok(/Brasil/i.test(inicio.titulo), `INICIO: o painel abre com "${inicio.titulo}" e nao com o Brasil`);
  ok(/BRASIL/.test(inicio.kicker), `INICIO: cabecalho do painel "${inicio.kicker}"`);
  ok(inicio.anoIdx === 0 && inicio.ano === "2017", `INICIO: a historia comeca em ${inicio.ano} (idx ${inicio.anoIdx}), esperado 2017`);
  ok(/2017/.test(inicio.manchete) && !/2018|2019|202\d/.test(inicio.manchete), `INICIO: a manchete adianta o futuro: "${inicio.manchete}"`);
  ok(/2017/.test(inicio.mesa), `INICIO: a mesa nao esta em 2017 ("${inicio.mesa}")`);
  ok(inicio.faixa && inicio.trechos === 8, `FAIXA: ${inicio.trechos} trechos no piso (esperado 8)`);
  ok(inicio.alvosAno === 0, `FAIXA: ${inicio.alvosAno} alvos de ano no grafico (na v1 o ano e do corpo)`);
  const F = await page.evaluate(() => window.AMB.PLANTA.faixa);
  ok(Math.abs(inicio.rig.x - (F.x0 + F.trecho / 2)) < 0.05 && Math.abs(inicio.rig.z - F.z) < 0.05,
     `FAIXA: a pessoa nasce em ${inicio.rig.x}, ${inicio.rig.z} e nao sobre 2017`);
  ok((await visiveis("#chartAnotacoes .callout")) === 0, "INICIO: callouts (desfecho) visiveis em 2017");
  ok((await visiveis("#chartLinha > *")) === 0, "INICIO: ha segmentos de linha antes do 2o ano");
  notas.push(`inicio: ${inicio.titulo} | ${inicio.manchete}`);

  // ---- andar: o corpo muda o ano -------------------------------------------
  // No desktop a cabeca e a camera; mexer a posicao local dela e o mesmo que
  // dar passos de lado em cima da faixa.
  const andar = (dx, dz) =>
    page.evaluate(([a, b]) => {
      const c = document.getElementById("camera").object3D.position;
      c.x = a;
      c.z = b;
    }, [dx, dz]);
  const esperaAno = (idx) =>
    page.waitForFunction((i) => window.AMB.state.anoIdx === i, idx, { timeout: 3000 }).then(() => true).catch(() => false);
  await andar(0.62, 0);
  ok(await esperaAno(3), "ANDAR: 0,6 m para a direita nao levou a 2020");
  const em2020 = await page.evaluate(() => ({
    readout: document.getElementById("chartReadout").getAttribute("value"),
    paredeAno: document.getElementById("paredeAno").getAttribute("value"),
    painelAno: document.getElementById("painelAno").getAttribute("value"),
    evento: document.getElementById("painelEvento").getAttribute("value"),
    mesa: document.getElementById("mesaValorTitulo").getAttribute("value"),
  }));
  ok(/2020/.test(em2020.readout), `ANDAR: readout "${em2020.readout}" nao mostra 2020`);
  ok(/2020/.test(em2020.paredeAno), `ANDAR: a parede nao seguiu para 2020 ("${em2020.paredeAno}")`);
  ok(em2020.painelAno === "2020", `ANDAR: o ano grande do painel e "${em2020.painelAno}"`);
  ok(/2020/.test(em2020.mesa), `ANDAR: a mesa nao seguiu para 2020 ("${em2020.mesa}")`);
  ok((await visiveis("#chartLinha > *")) === 3, `ANDAR: em 2020 a linha devia ter 3 segmentos visiveis`);
  ok((await visiveis("#chartAnotacoes .callout")) === 0, "ANDAR: callouts visiveis antes de 2024");
  notas.push(`2020 (andando): ${em2020.readout} | ${em2020.evento || "sem evento"}`);

  // balancar o corpo na fronteira 2019|2020 (+-3 cm) nao pisca o ano. A
  // fronteira fica 0,5 m a direita de quem nasceu no centro de 2017.
  const anoAntes = await page.evaluate(() => window.AMB.state.anoIdx);
  let mudou = 0;
  for (let k = 0; k < 10; k += 1) {
    await andar(0.5 + (k % 2 ? 0.03 : -0.03), 0);
    await page.waitForTimeout(60);
    if ((await page.evaluate(() => window.AMB.state.anoIdx)) !== anoAntes) mudou += 1;
  }
  ok(mudou === 0, `HISTERESE: oscilando +-3 cm na fronteira o ano mudou ${mudou} vez(es)`);

  await andar(1.55, 0);
  ok(await esperaAno(7), "ANDAR: ate a ponta direita nao levou a 2024");
  ok((await visiveis("#chartAnotacoes .callout")) >= 1, "FIM: os callouts (pior/melhor ano) nao aparecem em 2024");
  ok((await visiveis("#chartLinha > *")) === 7, "FIM: a linha inteira nao aparece em 2024");
  const fimTexto = await page.evaluate(() => document.getElementById("painelManchete").getAttribute("value"));
  notas.push(`2024: callouts visiveis; manchete "${fimTexto}"`);

  // fora do corredor (perto da mesa) o ano fica como esta
  await andar(0.3, -0.7);
  await page.waitForTimeout(250);
  ok((await page.evaluate(() => window.AMB.state.anoIdx)) === 7, "CORREDOR: sair da faixa mudou o ano");
  await andar(0, 0);
  ok(await esperaAno(0), "ANDAR: voltar a 2017 nao voltou o ano");

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

  // ---- confirmar: o painel emerge com a regiao -----------------------------
  await page.evaluate(() => window.AMB.confirmar(document.querySelector('.alvo-regiao[data-regiao="nordeste"]')));
  await page.waitForTimeout(900);
  // o ano e do corpo: anda ate 2024 com a regiao aberta
  await andar(1.55, 0);
  ok(await esperaAno(7), "PAINEL: com a regiao aberta, andar ate a ponta nao levou a 2024");

  const aberto = await page.evaluate(() => {
    const val = (id) => document.getElementById(id).getAttribute("value");
    const p = document.getElementById("painel").object3D;
    return {
      visivel: p.visible,
      escala: +p.scale.x.toFixed(2),
      titulo: val("painelTitulo"),
      manchete: val("painelManchete"),
      readout: val("chartReadout"),
      legConc: val("paredeLegConc"),
      legRet: val("paredeLegRet"),
      legEvad: val("paredeLegEvad"),
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
  ok(aberto.alvosAno === 0, `PAINEL: ${aberto.alvosAno} alvos de ano (o ano e do corpo)`);
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

  // ---- trocar indicador: o ano fica ----------------------------------------
  const antes = aberto.manchete;
  await page.evaluate(() => window.AMB.confirmar(document.querySelector('.alvo-indicador[data-indicador="evasao"]')));
  await page.waitForTimeout(400);
  const depois = await page.evaluate(() => ({
    key: window.AMB.state.indicadorKey,
    anoIdx: window.AMB.state.anoIdx,
    manchete: document.getElementById("painelManchete").getAttribute("value"),
  }));
  ok(depois.key === "evasao", `INDICADOR: state.indicadorKey = ${depois.key}`);
  ok(depois.manchete !== antes, "INDICADOR: a manchete nao mudou ao trocar de indicador");
  ok(depois.anoIdx === 7, `INDICADOR: trocar de indicador mudou o ano (idx ${depois.anoIdx})`);
  ok((await visiveis("#chartAnotacoes .callout")) >= 1, "INDICADOR: em 2024 os callouts sumiram depois de redesenhar");

  // ---- teleporte para o contexto e volta pela faixa (restaura a ancora) ----
  await andar(0, 0);
  ok(await esperaAno(0), "ANDAR: voltar a 2017 com a regiao aberta nao voltou o ano");
  const ancora = await page.evaluate(() => window.AMB.FAIXA.ancora);
  await page.evaluate(() => window.AMB.irPara("contexto"));
  await page.waitForTimeout(500);
  await page.evaluate(() => window.AMB.confirmar(document.querySelector('[data-destino="faixa"]')));
  // O teleporte espera o blink (setTimeout); com antialias ligado o quadro do
  // Chromium headless fica lento e o timer atrasa - espera a CONDICAO.
  await page
    .waitForFunction(
      (a) => {
        const p = document.getElementById("cameraRig").object3D.position;
        return Math.abs(p.x - a.x) < 0.02 && Math.abs(p.z - a.z) < 0.02;
      },
      ancora,
      { timeout: 5000 }
    )
    .catch(() => {});
  const rig = await page.evaluate(() => {
    const p = document.getElementById("cameraRig").object3D.position;
    return { x: +p.x.toFixed(2), y: +p.y.toFixed(2), z: +p.z.toFixed(2) };
  });
  ok(rig.y === 0, `TELEPORTE: o rig foi para y=${rig.y} (precisa ser 0; em VR a altura vem do headset)`);
  ok(Math.abs(rig.x - ancora.x) < 0.02 && Math.abs(rig.z - ancora.z) < 0.02,
     `TELEPORTE: a volta pela faixa parou em ${rig.x}, ${rig.z} e nao na ancora (${ancora.x}, ${ancora.z})`);
  ok(await esperaAno(0), "TELEPORTE: de volta sobre 2017, o ano nao e 2017");
  notas.push(`volta pela faixa: rig em ${rig.x}, ${rig.y}, ${rig.z} (ancora)`);

  // ---- fechar: o painel volta ao Brasil ------------------------------------
  await page.evaluate(() => window.AMB.confirmar(document.getElementById("painelFechar")));
  await page.waitForTimeout(400);
  const fechado = await page.evaluate(() => ({
    visivel: document.getElementById("painel").object3D.visible,
    titulo: document.getElementById("painelTitulo").getAttribute("value"),
    fio: document.getElementById("fio").object3D.visible,
    regiao: window.AMB.state.regiaoId,
  }));
  ok(fechado.visivel, "FECHAR: o painel sumiu (na v1 ele volta ao Brasil)");
  ok(/Brasil/i.test(fechado.titulo), `FECHAR: o painel ficou em "${fechado.titulo}"`);
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
          window.AMB.definirAno(a, "teste");
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

  // ---- rotulos de linha unica: o layout REAL tem 1 linha --------------------
  // A trava do setText so ve textos dinamicos e conta caracteres; aqui o que
  // vale e o layout que o A-Frame montou (letras largas quebram antes). Foi
  // assim que "CENTRO-OESTE" e "CAMADA DE DADOS BRUTOS" apareceram quebrados.
  const quebrados = await page.evaluate(() => {
    const r = [];
    document.querySelectorAll("a-text[data-linha-unica]").forEach((t) => {
      const c = t.components.text;
      const lay = c && c.currentFont && c.geometry && c.geometry.layout;
      if (lay && lay._linesTotal > 1) r.push(`"${t.getAttribute("value")}" (${lay._linesTotal} linhas)`);
    });
    return r;
  });
  ok(quebrados.length === 0, `TEXTO: rotulos de linha unica quebrados: ${quebrados.join(", ")}`);

  // ---- o laco de render continua vivo ---------------------------------------
  // Um erro lancado dentro do render (ex.: som posicional numa entidade com
  // posicao NaN) mata o requestAnimationFrame: a cena congela sem aviso -
  // dentro do headset, a imagem fica presa ao rosto.
  const quadros = () => page.evaluate(() => document.querySelector("a-scene").renderer.info.render.frame);
  const q0 = await quadros();
  await page.waitForTimeout(600);
  const q1 = await quadros();
  ok(q1 > q0, `RENDER: o laco de render parou (quadro ${q0} -> ${q1})`);

  // ---- console limpo -------------------------------------------------------
  const relevantes = errosConsole.filter((e) => !/WebGL|GPU|swiftshader|Failed to load resource.*favicon/i.test(e));
  ok(relevantes.length === 0, `CONSOLE: ${relevantes.length} erro(s): ${relevantes.slice(0, 4).join(" | ")}`);

  const shotIdx = process.argv.indexOf("--shot");
  if (shotIdx > 0 && process.argv[shotIdx + 1]) {
    // Captura do ponto de observacao do desenho, com o painel aberto.
    await page.evaluate(() => {
      window.AMB.irPara("faixa");
      window.AMB.abrirPainel("nordeste");
      document.getElementById("camera").object3D.position.x = 0.9; // sobre 2022
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
