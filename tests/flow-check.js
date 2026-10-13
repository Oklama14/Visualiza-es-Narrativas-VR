/**
 * headless-flow.js - percorre os fluxos do app em jsdom, sem A-Frame/WebGL.
 * Objetivo: pegar excecoes de runtime, estados inconsistentes e clickables
 * fantasmas em cada transicao de tela.
 */
const fs = require("fs");
const path = require("path");

let JSDOM;
let VirtualConsole;
try {
  ({ JSDOM, VirtualConsole } = require(process.env.JSDOM_PATH || "jsdom"));
} catch (e) {
  console.log("flow-check: o jsdom nao esta instalado - teste pulado.");
  console.log("Para rodar:  npm install --no-save jsdom   (dependencia so de teste)");
  process.exit(0);
}

const raiz = process.env.APP_DIR || path.resolve(__dirname, "..");
const html = fs.readFileSync(path.join(raiz, "index.html"), "utf8")
  .replace(/<script src="assets\/aframe[^>]*><\/script>/, "")
  .replace(/<script>[\s\S]*?window\.AFRAME[\s\S]*?<\/script>/, "")
  .replace(/<script src="app\.js[^>]*><\/script>/, "");

const erros = [];
const vc = new VirtualConsole();
vc.on("jsdomError", (e) => erros.push("jsdomError: " + e.message));
vc.on("error", (...a) => erros.push("console.error: " + a.map((x) => (x && x.stack ? x.stack : String(x))).join(" ")));

const dom = new JSDOM(html, { runScripts: "outside-only", pretendToBeVisual: true, virtualConsole: vc });
const { window } = dom;

// --- stubs minimos de A-Frame -------------------------------------------------
function vec() {
  return { x: 0, y: 0, z: 0, set(x, y, z) { this.x = x; this.y = y; this.z = z; return this; } };
}
Object.defineProperty(window.Element.prototype, "object3D", {
  get() {
    if (!this._o3d) {
      this._o3d = { visible: true, position: vec(), rotation: vec(), scale: vec(), children: [], traverse(fn) { fn(this); }, material: {} };
    }
    return this._o3d;
  },
});
window.Element.prototype.emit = function () {};
Object.defineProperty(window.Element.prototype, "hasLoaded", { get() { return true; } });
// setAttribute do A-Frame aceita (nome, prop, valor); jsdom so aceita 2 args.
const setAttrOriginal = window.Element.prototype.setAttribute;
window.Element.prototype.setAttribute = function (nome, valor, extra) {
  if (extra !== undefined) {
    this._comp = this._comp || {};
    this._comp[nome] = Object.assign({}, this._comp[nome], { [valor]: extra });
    return;
  }
  if (valor && typeof valor === "object") {
    this._comp = this._comp || {};
    this._comp[nome] = valor;
    return setAttrOriginal.call(this, nome, JSON.stringify(valor));
  }
  return setAttrOriginal.call(this, nome, String(valor));
};
const getAttrOriginal = window.Element.prototype.getAttribute;
window.Element.prototype.getAttribute = function (nome) {
  if (this._comp && this._comp[nome]) return this._comp[nome];
  const bruto = getAttrOriginal.call(this, nome);
  if (nome === "text") return { value: getAttrOriginal.call(this, "value") || "" };
  return bruto;
};

// fetch do dados.json
const dados = fs.readFileSync(path.join(raiz, "dados.json"), "utf8");
window.fetch = () => Promise.resolve({ ok: true, json: () => Promise.resolve(JSON.parse(dados)) });

// --- carrega o app ------------------------------------------------------------
const appSrc = fs.readFileSync(path.join(raiz, "app.js"), "utf8");
const shim = "\n;window.__app = { get state(){return state;}, get DADOS(){return DADOS;}, enterIndicators, navigateBack };";
try {
  window.eval(appSrc + shim);
} catch (e) {
  erros.push("erro ao avaliar app.js: " + e.stack);
}
if (!window.__app) { console.log("app.js nao expos o estado"); process.exit(1); }
// jsdom dispara o proprio DOMContentLoaded; disparar de novo re-inicializaria o app.
if (window.document.readyState === "loading") {
  // sera disparado pelo jsdom
} else {
  window.document.dispatchEvent(new window.Event("DOMContentLoaded"));
}

// --- utilitarios de teste -----------------------------------------------------
const doc = window.document;
const esperar = (ms) => new Promise((r) => setTimeout(r, ms));
let passos = 0;
const falhas = [];

function checar(cond, msg) {
  passos += 1;
  if (!cond) falhas.push(msg);
}

function clicar(sel, idx = 0) {
  const alvos = doc.querySelectorAll(sel);
  if (!alvos[idx]) { falhas.push(`elemento nao encontrado: ${sel} [${idx}]`); return false; }
  alvos[idx].dispatchEvent(new window.Event("click", { bubbles: false }));
  return true;
}

function hover(sel, idx = 0, tipo = "mouseenter") {
  const alvos = doc.querySelectorAll(sel);
  if (!alvos[idx]) { falhas.push(`elemento nao encontrado p/ hover: ${sel} [${idx}]`); return false; }
  alvos[idx].dispatchEvent(new window.Event(tipo));
  return true;
}

// Clickables visiveis? (um .clickable dentro de uma view invisivel = clique fantasma)
function viewVisivel(el) {
  let atual = el;
  while (atual && atual !== doc.body) {
    if (atual.getAttribute && String(getAttrOriginal.call(atual, "visible")) === "false") return false;
    atual = atual.parentElement;
  }
  return true;
}

function conferirFantasmas(etapa) {
  const fantasmas = [...doc.querySelectorAll(".clickable")].filter((e) => !viewVisivel(e));
  if (fantasmas.length) {
    falhas.push(`[${etapa}] ${fantasmas.length} clickable(s) em elemento invisivel: ` +
      fantasmas.slice(0, 4).map((f) => f.className || f.tagName).join(", "));
  }
  passos += 1;
}

// --- roteiro ------------------------------------------------------------------
(async () => {
  await esperar(800);
  const st = () => window.__app.state.stage;
  const ctx = () => window.__app.state.context && window.__app.state.context.nome;

  checar((typeof window.__app.DADOS === "object" && window.__app.DADOS !== null), "dados.json nao carregou");
  checar(st() === "selection", `estagio inicial deveria ser selection (veio ${st()})`);
  conferirFantasmas("selecao");

  // 1. Brasil -> indicadores
  clicar("#brasilBtn .selection-clickable");
  await esperar(1600);
  checar(st() === "indicators", `Brasil deveria abrir indicadores (veio ${st()})`);
  checar(doc.querySelectorAll("#indicatorObjects .indicator-clickable").length === 4,
    "deveria haver 4 medidores clicaveis");
  conferirFantasmas("indicadores");

  // hover no medidor de eficiencia: painel abre, conectores NAO
  hover("#indicatorObjects .indicator-clickable", 2);
  await esperar(400);
  checar(String(getAttrOriginal.call(doc.getElementById("infoPanel"), "visible")) === "true",
    "painel de hover deveria abrir");
  checar(String(getAttrOriginal.call(doc.getElementById("indicatorLinks"), "visible")) !== "true",
    "painel-equacao NAO deveria abrir no hover");
  checar(String(getAttrOriginal.call(doc.getElementById("contextLead"), "visible")) === "false",
    "contextLead deveria sumir durante o hover");
  hover("#indicatorObjects .indicator-clickable", 2, "mouseleave");
  await esperar(400);
  checar(String(getAttrOriginal.call(doc.getElementById("contextLead"), "visible")) !== "false",
    "contextLead deveria voltar apos o hover");

  // 2. indicadores -> timeline
  clicar("#indicatorObjects .indicator-clickable", 0);
  await esperar(1600);
  checar(st() === "timeline", `clique no medidor deveria abrir a timeline (veio ${st()})`);
  checar(doc.querySelectorAll("#markers a-circle, #markers a-sphere, #markers *").length > 0,
    "timeline sem marcadores");
  conferirFantasmas("timeline");

  // pular introducao e navegar por ano
  clicar("#ctrlSkip .timeline-clickable");
  await esperar(1600);
  const anoAntes = getAttrOriginal.call(doc.getElementById("ctrlYearLabel"), "value");
  clicar("#ctrlPrevYear .timeline-clickable");
  await esperar(600);
  checar(getAttrOriginal.call(doc.getElementById("ctrlYearLabel"), "value") !== anoAntes,
    "botao de ano anterior nao mudou o ano");
  // No Brasil nao existe contexto de comparacao: o botao deve ficar apagado.
  checar(window.__app.state.compareContext === null, "Brasil nao deveria ter contexto de comparacao");
  checar(/n\/d/.test(getAttrOriginal.call(doc.getElementById("ctrlCompareLabel"), "value") || ""),
    "botao Comparar deveria aparecer indisponivel no Brasil");
  clicar("#ctrlCompare .timeline-clickable");
  await esperar(600);
  checar(window.__app.state.compareOn === false, "comparacao nao deveria ligar sem contexto");

  // 3. timeline -> indicadores -> composicao
  clicar("#ctrlBackIndicators .timeline-clickable");
  await esperar(1600);
  checar(st() === "indicators", `voltar deveria ir aos indicadores (veio ${st()})`);
  clicar("#compEnter .indicator-clickable");
  await esperar(1600);
  checar(st() === "composicao", `deveria abrir a composicao (veio ${st()})`);
  const readout = getAttrOriginal.call(doc.getElementById("compReadout"), "value") || "";
  checar(/concluintes/.test(readout) && /Fio causal/.test(readout),
    "readout da composicao sem as duas linhas: " + readout.slice(0, 60));
  checar(readout.split("\n").length === 2, "readout deveria ter exatamente 2 linhas");
  checar(!/NaN|undefined/.test(readout), "readout com NaN/undefined");
  checar(doc.querySelectorAll("#compScene .comp-seg").length === 8, "composicao deveria ter 8 anos");
  conferirFantasmas("composicao");
  clicar("#compBack .composicao-clickable");
  await esperar(1600);

  // 4. voltar ao mapa (o botao Voltar desempilha uma tela por vez) e abrir o small multiples
  for (let i = 0; i < 6 && st() !== "selection"; i += 1) {
    clicar("#backButton .exploration-clickable");
    await esperar(1500);
  }
  checar(st() === "selection", `voltar deveria retornar ao mapa (veio ${st()})`);
  clicar("#multiplosBtn .selection-clickable");
  await esperar(1500);
  checar(st() === "multiplos", `deveria abrir o small multiples (veio ${st()})`);
  checar(doc.querySelectorAll("#multiplosGrid .multiplos-clickable").length === 6,
    "small multiples deveria ter 6 paineis");
  checar(doc.querySelectorAll("#multiplosSelectors .multiplos-clickable").length === 4,
    "small multiples deveria ter 4 seletores");
  const titulo = getAttrOriginal.call(doc.getElementById("multiplosTitle"), "value") || "";
  const nota = getAttrOriginal.call(doc.getElementById("multiplosNote"), "value") || "";
  checar(titulo.length > 0 && !/NaN|undefined/.test(titulo), "titulo do small multiples: " + titulo);
  checar(nota.length > 0 && !/NaN|undefined/.test(nota), "nota do small multiples: " + nota);
  checar(nota.length <= 64, `nota deveria caber em 1 linha (${nota.length} chars): ${nota}`);
  conferirFantasmas("multiplos");

  // troca de indicador reconstroi a grade
  clicar("#multiplosSelectors .multiplos-clickable", 1);
  await esperar(1600);
  checar(doc.querySelectorAll("#multiplosGrid .multiplos-clickable").length === 6,
    "grade nao foi reconstruida ao trocar de indicador");
  // clicar num painel entra na timeline daquele contexto
  clicar("#multiplosGrid .multiplos-clickable", 0);
  await esperar(1500);
  checar(st() === "timeline", `clique no painel deveria abrir a timeline (veio ${st()})`);
  checar(!!ctx(), "contexto vazio ao entrar pela comparacao");

  // 5. tours
  clicar("#backButton .exploration-clickable");
  await esperar(1500);
  for (const [i, id] of ["panorama", "abismo", "jornada"].entries()) {
    const cartoes = doc.querySelectorAll("#tourGallery .selection-clickable");
    if (!cartoes[i]) { falhas.push("cartao de tour ausente: " + id); continue; }
    cartoes[i].dispatchEvent(new window.Event("click"));
    await esperar(1500);
    const total = (window.__app.state.tourScenes ? window.__app.state.tourScenes.length : 0);
    checar(total > 0, `tour ${id} sem cenas`);
    for (let n = 1; n < total; n += 1) {
      clicar("#tourNextBtn .tour-clickable");
      await esperar(1500);
      checar(window.__app.state.tourStep === n || window.__app.state.stage === "selection",
        `tour ${id}: passo ${n} nao avancou`);
      conferirFantasmas(`tour ${id} cena ${n + 1}`);
      // numa cena de indicadores com showLinks, o painel-equacao aparece e o cabecalho some
      const cena = JSON.stringify(window.__app.state.tourScenes[n] || {});
      const c = JSON.parse(cena);
      if (c.showLinks) {
        checar(String(getAttrOriginal.call(doc.getElementById("indicatorLinks"), "visible")) === "true",
          `tour ${id}: painel-equacao deveria aparecer na cena ${n + 1}`);
        checar(String(getAttrOriginal.call(doc.getElementById("contextTitle"), "visible")) === "false",
          `tour ${id}: cabecalho deveria sumir na cena ${n + 1}`);
        const chips = doc.querySelectorAll("#indicatorLinks a-text");
        checar(chips.length >= 8, `tour ${id}: painel-equacao sem chips`);
        const textos = [...chips].map((t) => getAttrOriginal.call(t, "value") || "").join(" ");
        checar(!/NaN|undefined/.test(textos), `tour ${id}: chip com NaN/undefined`);
      }
    }
    // encerra o tour (ultima cena -> CTA/fim)
    clicar("#tourNextBtn .tour-clickable");
    await esperar(1600);
    if (window.__app.state.stage !== "selection") {
      clicar("#backButton .exploration-clickable");
      await esperar(1600);
    }
    checar(window.__app.state.tourActive === false, `tour ${id} nao encerrou`);
  }

  // 6. drill-down por regiao
  clicar("#mapHotspots .selection-clickable", 0);
  await esperar(1500);
  checar(st() === "drill", `hotspot deveria abrir o drill (veio ${st()})`);
  conferirFantasmas("drill");
  clicar("#drillCards .drill-clickable", 0);
  await esperar(1500);
  checar(st() === "indicators", `drill deveria abrir indicadores (veio ${st()})`);

  // 7. comparacao regiao x Brasil (contexto com referencia definida)
  clicar("#indicatorObjects .indicator-clickable", 0);
  await esperar(1600);
  clicar("#ctrlSkip .timeline-clickable");
  await esperar(800);
  checar(!!window.__app.state.compareContext, "regiao deveria ter contexto de comparacao");
  clicar("#ctrlCompare .timeline-clickable");
  await esperar(600);
  checar(window.__app.state.compareOn === true, "comparacao nao ligou na regiao");
  checar(doc.getElementById("hudLegend").hidden === false, "legenda de comparacao deveria aparecer");
  clicar("#ctrlCompare .timeline-clickable");
  await esperar(600);
  checar(window.__app.state.compareOn === false, "comparacao nao desligou");
  conferirFantasmas("timeline apos comparacao");

  // 8. "Voltar" depois do drill volta para a lista de instituicoes (nao para o mapa)
  clicar("#backButton .exploration-clickable");
  await esperar(1600);
  clicar("#backButton .exploration-clickable");
  await esperar(1600);
  checar(st() === "drill" || st() === "selection", `Voltar apos drill foi para ${st()}`);

  // 9. navigateBack com uma entrada "composicao" no historico restaura o contexto
  //    (o ramo montava a tela com o contexto errado antes da correcao).
  const alvoComp = window.__app.DADOS.regioes[1];
  window.__app.state.history.push({
    stage: "composicao", context: alvoComp, indicatorKey: null,
    parentRegion: null, drillRegion: null,
  });
  clicar("#backButton .exploration-clickable");
  await esperar(800);
  checar(st() === "composicao", `Voltar deveria reabrir a composicao (veio ${st()})`);
  checar(window.__app.state.context === alvoComp,
    "composicao deveria usar o contexto guardado no historico");

  // 10. uma excecao no meio de uma transicao nao pode deixar o app travado
  //     (state.transitioning preso em true bloqueia todos os cliques).
  let quebrou = false;
  await window.__app.enterIndicators({ tipo: "regiao", nome: "quebrado", series: null })
    .catch(() => { quebrou = true; });
  checar(quebrou, "o contexto invalido deveria lancar excecao (senao este teste nao valida nada)");
  checar(window.__app.state.transitioning === false,
    "state.transitioning deveria voltar a false depois de uma excecao na transicao");

  console.log(`\npassos verificados: ${passos}`);
  if (erros.length) {
    console.log("\nERROS DE RUNTIME:");
    erros.forEach((e) => console.log("  - " + e));
  }
  if (falhas.length) {
    console.log("\nFALHAS:");
    falhas.forEach((f) => console.log("  - " + f));
  }
  console.log(`\n=== RESULTADO: ${falhas.length} falha(s), ${erros.length} erro(s) de runtime ===`);
  process.exit(falhas.length || erros.length ? 1 : 0);
})();
