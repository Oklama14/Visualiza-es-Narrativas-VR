// ----------------------------------------------------------------------------
// Paridade entre as duas condicoes do estudo.
//
// Abre a condicao imersiva (index.html, no modo desktop) e a 2D
// (controle-2d.html) lado a lado, poe as duas no MESMO estado (indicador,
// regiao aberta ou Brasil, ano) e compara todo texto que a pessoa le: titulo
// da mesa, valores das 5 regioes e dos 4 indicadores, cabecalho, manchete e
// ano do painel, cartoes do grafico VISIVEIS (o desfecho so em 2024), leitura
// do ano, parede de 100 blocos e as 3 anotacoes da zona de contexto.
// O ano chega como na sessao: na imersiva, a cabeca anda sobre a faixa; na
// 2D, a pagina rola ate o passo do ano. Qualquer diferenca vira falha - era assim que a
// retencao aparecia como "Melhor ano" no 2D e "MAIOR/MENOR" na VR.
//
//   node tests/paridade-2d.js
//
// Precisa do playwright (npm i -D playwright) e de assets/aframe-1.5.0.min.js.
// ----------------------------------------------------------------------------

const path = require("node:path");
const fs = require("node:fs");
const os = require("node:os");
const http = require("node:http");
const { chromium } = require("playwright");

const ROOT = path.resolve(__dirname, "..");
process.env.VRLAB_DADOS_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "vrlab-paridade-"));
const { atender } = require(path.join(ROOT, "server.js"));
const PORTA = 4191;

const falhas = [];
const ok = (cond, msg) => {
  if (!cond) falhas.push(msg);
};

// Le, numa das paginas, todos os textos visiveis do estado atual.
const LER_VR = () => {
  const v = (e) => (e && e.components && e.components.text ? e.components.text.data.value : e ? e.getAttribute("value") : "") || "";
  const d = window.AMB.dom;
  const regioes = {};
  Object.entries(regioesEls).forEach(([id, r]) => (regioes[id] = v(r.valor)));
  const colunas = {};
  Object.entries(colunaEls).forEach(([k, c]) => (colunas[k] = v(c.valor)));
  const out = { mesa: v(d.mesaValorTitulo), regioes, colunas, contexto: slabEls.map((s) => [v(s.kicker), v(s.titulo), v(s.corpo)]) };
  const visivel = (e) => {
    for (let o = e.object3D; o; o = o.parent) if (!o.visible) return false;
    return true;
  };
  // So os cartoes que a pessoa VE (eles existem desde o inicio, escondidos
  // ate o fim da historia).
  const callouts = Array.from(d.chartAnotacoes.querySelectorAll(".callout"))
    .filter(visivel)
    .map((g) => Array.from(g.querySelectorAll("a-text")).map(v));
  out.painel = {
    kicker: v(d.painelKicker),
    titulo: v(d.painelTitulo),
    manchete: v(d.painelManchete),
    ano: v(d.painelAno),
    evento: v(d.painelEvento),
    readout: v(d.chartReadout),
    callouts,
    parede: [v(d.paredeAno), v(d.paredeLegConc), v(d.paredeLegRet), v(d.paredeLegEvad)],
  };
  out.anoIdx = window.AMB.state.anoIdx;
  return out;
};

const LER_2D = () => {
  const t = (id) => document.getElementById(id).textContent;
  const regioes = {};
  document.querySelectorAll(".regiao").forEach((b) => (regioes[b.dataset.regiao] = b.querySelector(".valor").textContent));
  const colunas = {};
  document.querySelectorAll(".coluna").forEach((c) => (colunas[c.dataset.indicador] = c.querySelector(".valor").textContent));
  const contexto = Array.from(document.querySelectorAll("#contextoSlabs .ctx-bloco")).map((b) => [
    b.querySelector(".k").textContent,
    b.querySelector(".t").textContent,
    b.querySelector(".c").textContent,
  ]);
  const out = { mesa: t("mesaValorTitulo"), regioes, colunas, contexto };
  out.painel = {
    kicker: t("painelKicker"),
    titulo: t("painelTitulo"),
    manchete: t("painelManchete"),
    ano: t("painelAno"),
    evento: t("painelEvento"),
    readout: t("chartReadout"),
    callouts: JSON.parse(document.getElementById("grafico").dataset.callouts || "[]"),
    parede: [t("paredeAno"), t("paredeLegConc"), t("paredeLegRet"), t("paredeLegEvad")],
  };
  out.anoIdx = window.CONTROLE2D.state.anoIdx;
  return out;
};

function comparar(rotulo, a, b, caminho) {
  caminho = caminho || "";
  if (typeof a !== "object" || a === null || typeof b !== "object" || b === null) {
    if (String(a).trim() !== String(b).trim()) falhas.push(`${rotulo} ${caminho}: VR "${a}" x 2D "${b}"`);
    return;
  }
  const chaves = new Set([...Object.keys(a), ...Object.keys(b)]);
  chaves.forEach((k) => comparar(rotulo, a[k], b[k], `${caminho}.${k}`));
}

(async () => {
  const server = http.createServer(atender);
  await new Promise((r) => server.listen(PORTA, "127.0.0.1", r));
  const browser = await chromium.launch({ args: ["--enable-unsafe-swiftshader", "--use-gl=swiftshader"] });
  const ctxNav = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const erros = [];
  const abrir = async (url) => {
    const p = await ctxNav.newPage();
    p.on("console", (m) => m.type() === "error" && erros.push(`${url}: ${m.text()}`));
    p.on("pageerror", (e) => erros.push(`${url}: ${e.message}`));
    await p.route("**/*", (route) => (route.request().url().startsWith(`http://127.0.0.1:${PORTA}/`) ? route.continue() : route.abort()));
    await p.goto(`http://127.0.0.1:${PORTA}/${url}`, { waitUntil: "load" });
    return p;
  };

  const vr = await abrir("index.html");
  await vr.waitForFunction(() => window.AMB && window.AMB.state.pronto, null, { timeout: 30000 });
  const d2 = await abrir("controle-2d.html");
  await d2.waitForFunction(() => window.CONTROLE2D && window.CONTROLE2D.state.pronto, null, { timeout: 15000 });

  const dados = JSON.parse(fs.readFileSync(path.join(ROOT, "dados.json"), "utf8"));
  const inds = dados.indicadores.map((i) => i.key);
  const regs = dados.regioes.map((r) => r.id);
  // Brasil e cada regiao, cada indicador, no inicio, no meio (2020, o ano do
  // evento) e no fim da historia (2024, com o desfecho).
  const ANOS = [0, 3, 7];
  const estados = [];
  [null].concat(regs).forEach((r) => inds.forEach((k) => ANOS.forEach((a) => estados.push({ k, r, a }))));

  // Imersiva: o ano e do corpo. A camera (a cabeca, no desktop) anda de lado
  // ate o centro do trecho do ano - a ancora poe 2017 sob a cabeca.
  const aplicarVR = async (e) =>
    vr.evaluate(async (e) => {
      const A = window.AMB;
      A.fecharPainel();
      setFoco(null);
      A.trocarIndicador(e.k);
      if (e.r) A.abrirPainel(e.r);
      document.getElementById("camera").object3D.position.x = e.a * A.PLANTA.faixa.trecho;
      const t0 = performance.now();
      while (A.state.anoIdx !== e.a && performance.now() - t0 < 3000) await new Promise((r) => setTimeout(r, 20));
    }, e);
  // 2D: a pagina rola ate o passo do ano.
  const aplicar2D = async (e) =>
    d2.evaluate((e) => {
      const C = window.CONTROLE2D;
      C.fecharPainel();
      C.setFoco(null);
      C.trocarIndicador(e.k);
      if (e.r) C.abrirPainel(e.r);
      C.rolarParaAno(e.a);
    }, e);

  let comparados = 0;
  for (const e of estados) {
    await aplicarVR(e);
    await aplicar2D(e);
    const a = await vr.evaluate(LER_VR);
    const b = await d2.evaluate(LER_2D);
    comparar(`[${e.k} / ${e.r || "brasil"} / ${2017 + e.a}]`, a, b);
    ok(a.anoIdx === e.a, `a imersiva nao chegou ao ano ${2017 + e.a} andando (ficou em ${a.anoIdx})`);
    ok(e.a === 7 || a.painel.callouts.length === 0, `desfecho visivel antes do fim em ${JSON.stringify(e)}`);
    ok(e.a !== 7 || a.painel.callouts.length > 0, `sem desfecho em 2024 em ${JSON.stringify(e)}`);
    comparados += 1;
  }

  // Tarefas: as duas paginas carregam o MESMO modulo (07-tarefas.js).
  const tVR = await vr.evaluate(() => JSON.stringify(gerarTarefas(DADOS)));
  const t2D = await d2.evaluate(() => JSON.stringify(gerarTarefas(DADOS)));
  ok(tVR === t2D, "as tarefas da condicao 2D diferem das da imersiva");
  const html2d = fs.readFileSync(path.join(ROOT, "controle-2d.html"), "utf8");
  ok(!/function\s+narrativa\s*\(|Melhor ano|Pico critico/.test(html2d), "controle-2d.html ainda tem logica narrativa propria");

  const relevantes = erros.filter((m) => !/WebGL|GPU|swiftshader|favicon|ERR_FAILED|ERR_BLOCKED|Failed to load resource/i.test(m));
  ok(relevantes.length === 0, `erros de console: ${relevantes.slice(0, 4).join(" | ")}`);

  await browser.close();
  server.close();

  console.log(`\nParidade 2D x imersiva: ${comparados} estados comparados ((Brasil + ${regs.length} regioes) x ${inds.length} indicadores x ${ANOS.length} anos, o ano chegando pelo corpo e pela rolagem)`);
  if (falhas.length) {
    falhas.slice(0, 25).forEach((f) => console.log("  ✗ " + f));
    console.log(`\nFALHOU: ${falhas.length} diferenca(s).`);
    process.exit(1);
  }
  console.log("  ✓ textos, valores, ano do painel, cartoes VISIVEIS do grafico, parede de blocos e anotacoes identicos");
  console.log("  ✓ o desfecho (pior/melhor ano) so aparece em 2024, nas duas condicoes");
  console.log("  ✓ tarefas e gabarito vindos do mesmo modulo (07-tarefas.js)");
  console.log("\nparidade: tudo verde.");
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
