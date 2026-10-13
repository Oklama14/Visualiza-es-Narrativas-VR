// ----------------------------------------------------------------------------
// Smoke test do fluxo de ESTACOES (Fases 0-4) - Chrome/Edge headless + CDP.
// Diferente do smoke original (cliques projetados), este dirige o app pelas
// funcoes publicas via Runtime.evaluate e verifica invariantes de estado,
// visibilidade, geometria e performance (draw calls). Cobre:
//   boot (6 estacoes, wayfinding, home), dica de prerequisito no Corredor,
//   explorar -> drill -> indicadores -> timeline (abertura guiada + pular +
//   caminhar pelos anos + callout por chegada + comparar) -> composicao
//   (parede, escala real) -> multiplos (6 paineis) -> tour completo com CTA ->
//   voltar por historico -> som on/off -> zero erros de console.
// Rode com: node tests/smoke-estacoes.js   (precisa de Chrome ou Edge)
// ----------------------------------------------------------------------------

const fs = require("node:fs");
const fsp = require("node:fs/promises");
const http = require("node:http");
const os = require("node:os");
const path = require("node:path");
const { spawn } = require("node:child_process");

const ROOT = path.resolve(__dirname, "..");
const MIME_TYPES = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml; charset=utf-8",
};
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function main() {
  if (typeof WebSocket !== "function") {
    throw new Error("Node.js precisa expor WebSocket global para rodar este teste.");
  }
  const browserPath = findBrowser();
  const server = await startServer();
  const chrome = await startBrowser(browserPath, server.url);

  try {
    const cdp = await connectToPage(chrome.port);
    await cdp.send("Page.enable");
    await cdp.send("Runtime.enable");
    await cdp.send("Log.enable");

    await assertBoot(cdp);
    await assertHintCorredor(cdp);
    await assertExplorarEDrill(cdp);
    await assertIndicadoresETimeline(cdp);
    await assertComposicao(cdp);
    await assertMultiplos(cdp);
    await assertVoltarPorHistorico(cdp);
    await assertTourCompleto(cdp);
    await assertSom(cdp);
    assertNoBrowserErrors(cdp.events);

    cdp.close();
    console.log("smoke-estacoes: concluido com sucesso.");
  } finally {
    chrome.process.kill();
    await new Promise((resolve) => server.instance.close(resolve));
  }
}

// ---- cenarios -------------------------------------------------------------

async function assertBoot(cdp) {
  await waitFor(
    cdp,
    "window.AFRAME && document.querySelector('a-scene')?.hasLoaded && typeof DADOS !== 'undefined' && DADOS && STATIONS.size === 6",
    "cena carregada com 6 estacoes registradas",
    20000
  );
  const st = await evalJson(cdp, `({
    home: document.getElementById('homeView')?.object3D.visible,
    mapa: document.getElementById('mapView')?.object3D.visible,
    way: document.getElementById('wayfinding')?.children.length,
    rigX: Math.round(document.getElementById('cameraRig').object3D.position.x * 10) / 10,
    rigZ: Math.round(document.getElementById('cameraRig').object3D.position.z * 10) / 10,
    modo: state.selectionView,
    hotspots: document.querySelectorAll('#mapHotspots .selection-clickable').length,
  })`);
  assert(st.home === true, "homeView deveria estar visivel no boot.");
  assert(st.mapa === true, "mapView deveria estar visivel no boot (estacao Mapa).");
  assert(st.way >= 15, `wayfinding com poucos filhos (${st.way}): trilha/discos ausentes?`);
  assert(st.rigX === 0 && st.rigZ === 2.2, `rig deveria nascer na estacao Inicio (0, 2.2), esta em (${st.rigX}, ${st.rigZ}).`);
  assert(st.modo === "home", "selectionView inicial deveria ser 'home'.");
  assert(st.hotspots === (await evalValue(cdp, "DADOS.regioes.length")), "hotspots != regioes.");

  // onboarding padronizado: aparece e dispensa.
  const onboardOn = await evalValue(cdp, "!document.querySelector('#onboardOverlay').hasAttribute('hidden')");
  assert(onboardOn, "Onboarding deveria aparecer na primeira visita.");
  await evalValue(cdp, "document.querySelector('#onboardStart').click(); true");
  await waitFor(cdp, "document.querySelector('#onboardOverlay').hasAttribute('hidden')", "onboarding dispensado");
}

async function assertHintCorredor(cdp) {
  // Pisar no Corredor sem indicador escolhido -> dica de prerequisito.
  await evalValue(cdp, "placeAtStation('timeline'); true");
  await waitFor(
    cdp,
    "(document.getElementById('captionText')?.getAttribute('text')?.value || '').includes('Corredor')",
    "dica de prerequisito ao chegar sem indicador"
  );
  await evalValue(cdp, "placeAtStation('home'); setCaption(''); true");
}

async function assertExplorarEDrill(cdp) {
  await evalValue(cdp, "showMapSelection(true); true");
  await waitFor(cdp, "Math.abs(document.getElementById('cameraRig').object3D.position.x - STATION_SPOTS.mapa.x) < 0.01", "teleporte para a estacao Mapa");
  const clicaveis = await evalValue(cdp, "document.querySelectorAll('.selection-clickable.clickable').length");
  assert(clicaveis >= 8, `poucos clicaveis no mapa (${clicaveis}).`);

  await evalValue(cdp, "openDrill(DADOS.regioes[0]); true");
  const drill = await evalJson(cdp, `({
    cards: document.getElementById('drillCards').children.length,
    visivel: document.getElementById('drillCards').object3D.visible,
    modo: state.stage,
  })`);
  assert(drill.cards >= 2 && drill.visivel === true && drill.modo === "drill", "drill-down nao montou.");
  await evalValue(cdp, "closeDrill(); true");
  await waitFor(cdp, "document.getElementById('mapView').object3D.visible === true && state.selectionView === 'map'", "voltar do drill ao mapa");
}

async function assertIndicadoresETimeline(cdp) {
  // Regiao (nao Brasil) para poder testar Comparar depois.
  await evalValue(cdp, "pushHistory(); enterIndicators(DADOS.regioes[0]); true");
  await waitFor(cdp, "!state.transitioning && state.stage === 'indicators'", "indicadores prontos");
  const ind = await evalJson(cdp, `({
    objetos: document.getElementById('indicatorObjects').children.length,
    rigX: Math.round(document.getElementById('cameraRig').object3D.position.x * 10) / 10,
    voxels: [...document.getElementById('indicatorObjects').querySelectorAll('a-entity')].filter((e) => e.getObject3D && e.getObject3D('voxels')).length,
  })`);
  assert(ind.objetos === 4, `esperados 4 indicadores, ha ${ind.objetos}.`);
  assert(ind.rigX === (await evalValue(cdp, "STATION_SPOTS.indicadores.x")), "rig nao foi a estacao Indicadores.");
  assert(ind.voxels >= 4, `colunas de voxel ausentes (${ind.voxels}).`);

  await evalValue(cdp, "pushHistory(); enterTimeline('eficiencia'); true");
  await waitFor(cdp, "state.guided === true", "abertura guiada iniciou");
  await evalValue(cdp, "skipGuided(); true");
  await waitFor(cdp, "state.guided === false && document.getElementById('actionRow').object3D.visible === true", "exploracao livre liberada");

  const tl = await evalJson(cdp, `({
    marcadores: document.getElementById('markers').children.length,
    faixa: document.getElementById('walkStrip').children.length,
    torres: [...document.getElementById('timelineBars').querySelectorAll('a-entity')].filter((e) => e.getObject3D && e.getObject3D('voxels')).length,
  })`);
  assert(tl.marcadores >= 6, "marcadores da serie ausentes.");
  assert(tl.faixa >= 10, "faixa de anos no piso ausente.");
  assert(tl.torres >= 6, `torres de voxel ausentes no corredor (${tl.torres}).`);

  // Strollytelling: caminhar ate 2017 (x = -3) muda o ano em foco.
  await evalValue(cdp, "document.getElementById('cameraRig').setAttribute('position', '-3 1.6 -6.1'); true");
  await waitFor(cdp, "state.yearIdx === 0", "caminhar ate a ponta esquerda foca 2017");

  // Callout por chegada: ir ao ano do pico revela o callout dele.
  const peakIdx = await evalValue(cdp, "extremos(state.context.series[state.indicatorKey]).peakIdx");
  await evalValue(cdp, `selectYear(${peakIdx}); true`);
  await waitFor(cdp, `document.querySelector('[data-callout="${peakIdx}"]')?.object3D.visible === true`, "callout revelado ao chegar no ano");

  await evalValue(cdp, "placeAtStation('timeline'); toggleCompare(); true");
  await waitFor(cdp, "state.compareOn === true && document.getElementById('compareBars').object3D.visible === true", "comparacao com o Brasil ligada");
  await evalValue(cdp, "toggleCompare(); true");
}

async function assertComposicao(cdp) {
  await evalValue(cdp, "pushHistory(); enterComposicao(); true");
  await waitFor(cdp, "state.stage === 'composicao'", "composicao ativa");
  const comp = await evalJson(cdp, `({
    parede: Boolean(document.getElementById('compWall').querySelector('a-entity')?.getObject3D('voxels')),
    torres: [...document.getElementById('compScene').querySelectorAll('a-entity')].filter((e) => e.getObject3D && e.getObject3D('voxels')).length,
    rigRot: Math.round(document.getElementById('cameraRig').object3D.rotation.y * 180 / Math.PI),
  })`);
  assert(comp.parede, "parede de 100 blocos ausente.");
  assert(comp.torres >= 6, `torres da composicao ausentes (${comp.torres}).`);
  assert(Math.abs(comp.rigRot - 90) <= 1, `rig deveria olhar a parede esquerda (rot 90), esta em ${comp.rigRot}.`);

  await evalValue(cdp, "toggleEscalaReal(); true");
  await waitFor(cdp, "state.escalaReal === true && document.getElementById('compWall').object3D.visible === false", "escala real ligada");
  const escala = await evalJson(cdp, `({
    blocos: Boolean(document.getElementById('escalaWall').querySelector('a-entity')?.getObject3D('voxels')),
    calls: document.querySelector('a-scene').renderer.info.render.calls,
  })`);
  assert(escala.blocos, "parede de escala real sem voxels.");
  assert(escala.calls < 500, `draw calls altos demais na escala real (${escala.calls}).`);
  await evalValue(cdp, "toggleEscalaReal(); stepCompYear(-1); true");
  await waitFor(cdp, "state.escalaReal === false", "voltou ao percentual");
}

async function assertMultiplos(cdp) {
  await evalValue(cdp, "pushHistory(); enterMultiplos('eficiencia'); true");
  await waitFor(cdp, "!state.transitioning && state.stage === 'multiplos'", "small multiples ativos");
  const mult = await evalJson(cdp, `({
    paineis: document.getElementById('multiplosGrid').children.length,
    micro: [...document.getElementById('multiplosGrid').querySelectorAll('a-entity')].filter((e) => e.getObject3D && e.getObject3D('voxels')).length,
    rigX: Math.round(document.getElementById('cameraRig').object3D.position.x * 10) / 10,
  })`);
  assert(mult.paineis === 6, `esperados 6 paineis, ha ${mult.paineis}.`);
  assert(mult.micro >= 6, `micro-colunas de voxel ausentes (${mult.micro}).`);
  assert(mult.rigX === (await evalValue(cdp, "STATION_SPOTS.comparacao.x")), "rig nao foi a estacao Comparacao.");
}

async function assertVoltarPorHistorico(cdp) {
  await evalValue(cdp, "navigateBack(); true");
  await waitFor(cdp, "!state.transitioning && state.stage === 'composicao'", "voltar: multiplos -> composicao");
  await evalValue(cdp, "navigateBack(); true");
  await waitFor(cdp, "!state.transitioning && state.stage === 'timeline'", "voltar: composicao -> timeline");
}

async function assertTourCompleto(cdp) {
  const cenas = await evalValue(cdp, "TOURS.panorama.cenas.length");
  await evalValue(cdp, "startTour('panorama'); true");
  await waitFor(cdp, "!state.transitioning && state.tourActive === true", "tour iniciado");
  assert(
    (await evalValue(cdp, "document.getElementById('tourPanel').object3D.visible")) === true,
    "cena de abertura do tour deveria mostrar o painel."
  );
  for (let i = 1; i < cenas; i += 1) {
    await evalValue(cdp, "tourNext(); true");
    await waitFor(cdp, `!state.transitioning && state.tourStep === ${i}`, `tour avancou para a cena ${i + 1}`);
  }
  assert(
    (await evalValue(cdp, "document.getElementById('tourCta').object3D.visible")) === true,
    "CTA do fechamento deveria estar visivel."
  );
  await evalValue(cdp, "document.querySelector('#tourCta .tour-clickable').dispatchEvent(new CustomEvent('click')); true");
  await waitFor(cdp, "!state.transitioning && state.tourActive === false && state.selectionView === 'map'", "CTA desagua no mapa");
}

async function assertSom(cdp) {
  await evalValue(cdp, "toggleSound(); true");
  const mudo = await evalJson(cdp, `({
    on: state.soundOn,
    label: document.getElementById('ctrlSoundLabel').getAttribute('text')?.value,
  })`);
  assert(mudo.on === false && mudo.label === "Som mudo", "toggle de som nao refletiu no estado/rotulo.");
  await evalValue(cdp, "toggleSound(); true");
}

// ---- harness (reaproveitado do smoke original) ------------------------------

async function waitFor(cdp, expression, label, timeoutMs = 15000) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    const result = await evalValue(cdp, `Boolean(${expression})`);
    if (result === true) return;
    await sleep(100);
  }
  throw new Error(`Timeout aguardando: ${label}`);
}

async function evalJson(cdp, expression) {
  const value = await evalValue(cdp, `JSON.stringify(${expression})`);
  return JSON.parse(value);
}

async function evalValue(cdp, expression) {
  const result = await cdp.send("Runtime.evaluate", { awaitPromise: true, expression, returnByValue: true });
  if (result.exceptionDetails) {
    const exc = result.exceptionDetails;
    const msg = exc.exception && exc.exception.description ? exc.exception.description : exc.text || "Erro em Runtime.evaluate.";
    throw new Error(msg);
  }
  return result.result.value;
}

function assertNoBrowserErrors(events) {
  const runtimeExceptions = events.filter((e) => e.method === "Runtime.exceptionThrown");
  const consoleErrors = events.filter(
    (e) => e.method === "Runtime.consoleAPICalled" && ["error", "assert"].includes(e.params.type)
  );
  const logErrors = events.filter((e) => e.method === "Log.entryAdded" && e.params.entry.level === "error");
  if (runtimeExceptions.length) {
    console.error(JSON.stringify(runtimeExceptions[0], null, 2).slice(0, 800));
  }
  assert(runtimeExceptions.length === 0, `Excecoes no browser: ${runtimeExceptions.length}`);
  assert(consoleErrors.length === 0, `Console errors no browser: ${consoleErrors.length}`);
  assert(logErrors.length === 0, `Log errors no browser: ${logErrors.length}`);
}

async function startServer() {
  const server = http.createServer(async (request, response) => {
    try {
      const requestUrl = new URL(request.url, "http://127.0.0.1");
      const pathname = decodeURIComponent(requestUrl.pathname);
      const safePath = pathname === "/" ? "index.html" : pathname.replace(/^\/+/, "");
      const filePath = path.resolve(ROOT, safePath);
      if (!filePath.startsWith(ROOT)) {
        response.writeHead(403);
        response.end("Forbidden");
        return;
      }
      const body = await fsp.readFile(filePath);
      response.writeHead(200, { "Content-Type": MIME_TYPES[path.extname(filePath)] || "application/octet-stream" });
      response.end(body);
    } catch {
      response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
      response.end("Not found");
    }
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address();
  return { instance: server, url: `http://127.0.0.1:${port}/` };
}

async function startBrowser(browserPath, url) {
  const port = 9400 + Math.floor(Math.random() * 400);
  const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), "vr-min-smoke-"));
  const browserProcess = spawn(
    browserPath,
    [
      "--headless=new",
      "--disable-gpu",
      "--no-first-run",
      "--hide-scrollbars",
      "--autoplay-policy=no-user-gesture-required",
      `--remote-debugging-port=${port}`,
      `--user-data-dir=${userDataDir}`,
      "--window-size=1366,768",
      url,
    ],
    { stdio: "ignore" }
  );
  browserProcess.on("exit", (code) => {
    if (code && code !== 0) console.error(`Browser saiu com codigo ${code}.`);
  });
  return { port, process: browserProcess };
}

async function connectToPage(port) {
  const targets = await fetchJson(`http://127.0.0.1:${port}/json/list`);
  const pageTarget = targets.find((t) => t.type === "page");
  assert(pageTarget, "Nenhuma aba do browser foi encontrada.");
  return connectWebSocket(pageTarget.webSocketDebuggerUrl);
}

async function fetchJson(url, attempts = 80) {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      const response = await fetch(url);
      if (response.ok) return response.json();
    } catch { /* porta ainda subindo */ }
    await sleep(100);
  }
  throw new Error(`Nao foi possivel acessar ${url}`);
}

function connectWebSocket(wsUrl) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(wsUrl);
    const pending = new Map();
    const events = [];
    let id = 0;
    ws.addEventListener("open", () => {
      resolve({
        events,
        send(method, params = {}) {
          const messageId = ++id;
          ws.send(JSON.stringify({ id: messageId, method, params }));
          return new Promise((res, rej) => pending.set(messageId, { res, rej }));
        },
        close() { ws.close(); },
      });
    });
    ws.addEventListener("message", (event) => {
      const message = JSON.parse(event.data);
      if (message.method) events.push(message);
      if (!message.id || !pending.has(message.id)) return;
      const { res, rej } = pending.get(message.id);
      pending.delete(message.id);
      if (message.error) rej(new Error(JSON.stringify(message.error)));
      else res(message.result);
    });
    ws.addEventListener("error", reject);
  });
}

function findBrowser() {
  const candidates = [
    process.env.BROWSER_PATH,
    "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
    "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
    "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
    "/usr/bin/google-chrome",
    "/usr/bin/chromium-browser",
    "/usr/bin/chromium",
  ].filter(Boolean);
  const browserPath = candidates.find((candidate) => fs.existsSync(candidate));
  assert(browserPath, "Chrome ou Edge nao encontrado. Defina BROWSER_PATH para rodar o smoke test.");
  return browserPath;
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
