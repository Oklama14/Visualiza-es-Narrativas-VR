// ----------------------------------------------------------------------------
// Simulacao do Meta Quest 2 (WebXR emulado) para a versao principal.
//
// O smoke-test e o flow-check exercitam o desktop. Tudo o que so existe dentro
// do headset - local-floor, maos, controles Touch com laser, gaze, o que a
// pessoa enxerga sem virar o pescoco - so aparece numa sessao imersiva. Aqui
// ela e emulada com o IWER (Immersive Web Emulation Runtime, da Meta) como
// Meta Quest 2, com a internet bloqueada (laboratorio pode estar offline).
//
//   npm i -D playwright iwer         (uma vez)
//   node tests/quest-sim.js
//   node tests/quest-sim.js --shot visao-quest.png
//
// Verificacoes:
//   Q1  sessao imersiva abre e a cabeca fica a ~1,6 m (rig zerado em VR)
//   Q2  perfil do renderer (antialias, 72 Hz, foveacao)
//   Q3  maos: aparecem sem internet; UMA pinca = UM clique no alvo do olhar
//   Q4  maos: olhar parado NAO seleciona sozinho (com maos, quem confirma e a pinca)
//   Q5  controles: UM gatilho = UM clique, no alvo do laser (o olhar nao clica junto)
//   Q6  todos os alvos clicaveis de cada etapa sao alcancaveis pelo olhar e
//       ficam numa faixa confortavel de cabeca (relatorio de angulos)
//   Q7  reticulo, legenda e HUD de VR desenhados por cima do mundo
//   Q8  abertura guiada avanca mesmo se a voz (speechSynthesis) nunca terminar
//   Q9  "Voltar" depois de "Indicadores" nao repete a mesma tela
//   Q10 draw calls por quadro (estereo) nas etapas mais pesadas
//   Q11 console limpo
//   Q12 ao pegar os controles, o modelo da mao some (nao fica congelado no ar)
// ----------------------------------------------------------------------------

const { chromium } = require("playwright");
const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");

const args = process.argv.slice(2);
const argVal = (k) => {
  const i = args.indexOf(k);
  return i >= 0 ? args[i + 1] : null;
};
const ROOT = path.resolve(argVal("--root") || path.join(__dirname, ".."));
const PORTA = 4189;
const ORCAMENTO_DRAW_CALLS = 900; // por quadro, dois olhos

// Faixa confortavel para alvos de interacao, a partir do olho, sem girar o
// corpo: ate 60 graus para os lados, de -45 a +35 graus na vertical.
const CONFORTO = { az: 60, elevMax: 35, elevMin: -45 };

function acharIwer() {
  const candidatos = [];
  const subir = (base) => {
    let d = base;
    while (d && d !== path.dirname(d)) {
      candidatos.push(path.join(d, "node_modules", "iwer", "build", "iwer.min.js"));
      d = path.dirname(d);
    }
  };
  subir(process.cwd());
  subir(__dirname);
  (process.env.NODE_PATH || "")
    .split(path.delimiter)
    .filter(Boolean)
    .forEach((p) => candidatos.push(path.join(p, "iwer", "build", "iwer.min.js")));
  return candidatos.find((f) => fs.existsSync(f));
}

const TIPOS = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".glb": "model/gltf-binary",
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

const resultados = [];
const registra = (id, passou, msg) => resultados.push({ id, passou, msg });
const avisos = [];

(async () => {
  const iwerPath = acharIwer();
  if (!iwerPath) {
    console.error("IWER nao encontrado. Rode:  npm i -D playwright iwer");
    process.exit(2);
  }
  if (!fs.existsSync(path.join(ROOT, "assets", "aframe-1.5.0.min.js"))) {
    console.error("Este teste roda offline: falta assets/aframe-1.5.0.min.js (copie de versao-minimalista/assets/).");
    process.exit(2);
  }
  const iwerSrc = fs.readFileSync(iwerPath, "utf8");

  const server = await servir();
  const browser = await chromium.launch({ args: ["--enable-unsafe-swiftshader", "--use-gl=swiftshader", "--autoplay-policy=no-user-gesture-required"] });
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });

  const errosConsole = [];
  page.on("console", (m) => {
    if (m.type() === "error") errosConsole.push(m.text());
  });
  page.on("pageerror", (e) => errosConsole.push(`pageerror: ${e.message}`));

  await page.addInitScript({
    content:
      iwerSrc +
      `;(function () {
        var d = new IWER.XRDevice(IWER.metaQuest2, { stereoEnabled: true });
        d.installRuntime({ forceInstall: true });
        window.__xr = d;
        // Voz que nunca termina (nem onend nem onerror): pior caso do navegador
        // do headset. A abertura guiada tem de seguir mesmo assim.
        var falso = {
          speaking: false, pending: false, paused: false,
          speak: function () {}, cancel: function () {}, pause: function () {}, resume: function () {},
          getVoices: function () { return []; },
          addEventListener: function () {}, removeEventListener: function () {}
        };
        try { Object.defineProperty(window, "speechSynthesis", { value: falso, configurable: true }); } catch (e) {}
      })();`,
  });

  await page.route("**/*", (route) => {
    const u = route.request().url();
    if (u.startsWith(`http://127.0.0.1:${PORTA}/`) || u.startsWith("data:") || u.startsWith("blob:")) return route.continue();
    return route.abort();
  });

  await page.goto(`http://127.0.0.1:${PORTA}/index.html`, { waitUntil: "load" });
  await page
    .waitForFunction(
      () => window.AFRAME && document.querySelector("a-scene").hasLoaded && typeof DADOS !== "undefined" && DADOS && document.querySelectorAll("#mapHotspots .selection-clickable").length === DADOS.regioes.length,
      null,
      { timeout: 40000 }
    )
    .catch(() => registra("BOOT", false, "a cena nao subiu"));
  await page.evaluate(() => {
    const b = document.getElementById("onboardStart");
    if (b && !document.getElementById("onboardOverlay").hidden) b.click();
  });

  // ---- utilitarios ---------------------------------------------------------
  await page.evaluate(() => {
    const THREE = AFRAME.THREE;
    const scene = document.querySelector("a-scene");
    window.__sim = {
      rig: () => document.getElementById("cameraRig").object3D,
      cabecaMundo() {
        const cam = document.getElementById("camera").object3D;
        cam.updateMatrixWorld(true);
        const p = new THREE.Vector3();
        cam.getWorldPosition(p);
        return { x: +p.x.toFixed(3), y: +p.y.toFixed(3), z: +p.z.toFixed(3) };
      },
      paraLocal(p) {
        const rig = this.rig();
        rig.updateMatrixWorld(true);
        return new THREE.Vector3(p.x, p.y, p.z).applyMatrix4(new THREE.Matrix4().copy(rig.matrixWorld).invert());
      },
      olharMundo(p) {
        const alvo = this.paraLocal(p);
        const olho = new THREE.Vector3(__xr.position.x, __xr.position.y, __xr.position.z);
        const m = new THREE.Matrix4().lookAt(olho, alvo, new THREE.Vector3(0, 1, 0));
        const q = new THREE.Quaternion().setFromRotationMatrix(m);
        __xr.quaternion.set(q.x, q.y, q.z, q.w);
      },
      // Aponta o controle direito (laser) para p. A direcao do raio no espaco
      // do controle depende do modelo (o Touch do Quest 2 aponta ~37 graus para
      // baixo do eixo da empunhadura), entao a conta parte do raio REAL atual:
      // gira o controle pelo tanto que falta (chame 2x, com quadros no meio).
      apontarControle(p, ctrlId) {
        const el = document.getElementById(ctrlId || "rightHand");
        const rc = el.components.raycaster;
        el.object3D.updateMatrixWorld(true);
        rc.updateOriginDirection();
        const ray = rc.raycaster.ray;
        const quer = new THREE.Vector3(p.x, p.y, p.z).sub(ray.origin).normalize();
        const delta = new THREE.Quaternion().setFromUnitVectors(ray.direction.clone().normalize(), quer);
        const c = __xr.controllers.right;
        const q0 = new THREE.Quaternion(c.quaternion.x, c.quaternion.y, c.quaternion.z, c.quaternion.w);
        const q1 = delta.multiply(q0);
        c.quaternion.set(q1.x, q1.y, q1.z, q1.w);
      },
      centro(el) {
        el.object3D.updateMatrixWorld(true);
        const b = new THREE.Box3().setFromObject(el.object3D);
        const c = b.getCenter(new THREE.Vector3());
        const s = b.getSize(new THREE.Vector3());
        return { x: c.x, y: c.y, z: c.z, sx: s.x, sy: s.y, sz: s.z };
      },
      sobOlhar() {
        const c = document.getElementById("gazeCursor").components.cursor;
        return c && c.intersectedEl ? c.intersectedEl : null;
      },
      quadros(n) {
        return new Promise((resolve) => {
          let k = 0;
          const s = scene.xrSession;
          const passo = () => {
            k += 1;
            if (k >= n || !s) resolve();
            else s.requestAnimationFrame(passo);
          };
          if (s) s.requestAnimationFrame(passo);
          else setTimeout(resolve, 50 * n);
        });
      },
      // Lanca um raio do olho ate o centro do elemento contra TODOS os
      // .clickable (o que o olhar acertaria) e diz quem vem primeiro.
      primeiroNoOlhar(el) {
        const cab = this.cabecaMundo();
        const c = this.centro(el);
        const origem = new THREE.Vector3(cab.x, cab.y, cab.z);
        const dir = new THREE.Vector3(c.x, c.y, c.z).sub(origem).normalize();
        const r = new THREE.Raycaster(origem, dir, 0, 60);
        const objs = [];
        document.querySelectorAll(".clickable").forEach((e) => e.object3D && objs.push(e.object3D));
        const hits = r.intersectObjects(objs, true);
        let o = hits[0] && hits[0].object;
        while (o && !o.el) o = o.parent;
        return o ? o.el : null;
      },
      // Angulos do elemento a partir do olho (az > 0 = direita).
      angulos(el) {
        const cab = this.cabecaMundo();
        const c = this.centro(el);
        const dx = c.x - cab.x, dy = c.y - cab.y, dz = c.z - cab.z;
        const dh = Math.hypot(dx, dz);
        const dist = Math.hypot(dh, dy);
        return {
          az: +((Math.atan2(dx, -dz) * 180) / Math.PI).toFixed(0),
          el: +((Math.atan2(dy, dh) * 180) / Math.PI).toFixed(0),
          dist: +dist.toFixed(2),
          tam: +(((2 * Math.atan2(Math.max(c.sx, c.sy, c.sz) / 2, dist)) * 180) / Math.PI).toFixed(1),
        };
      },
      nome(el) {
        if (!el) return "-";
        const anc = el.closest("[id]");
        const cls = [...el.classList].find((k) => /-clickable$/.test(k)) || "";
        return `${anc ? "#" + anc.id : el.tagName.toLowerCase()}${el.dataset.region ? "[" + el.dataset.region + "]" : ""}${cls ? " ." + cls : ""}`;
      },
    };
  });

  const quadros = (n) => page.evaluate((k) => window.__sim.quadros(k), n);
  const pausa = (ms) => page.waitForTimeout(ms);
  const ocioso = () => page.waitForFunction(() => !state.transitioning, null, { timeout: 15000 }).catch(() => {});

  // ---- Q1: entrar em VR ----------------------------------------------------
  await page.evaluate(() => document.querySelector("a-scene").enterVR());
  const entrou = await page
    .waitForFunction(() => document.querySelector("a-scene").is("vr-mode"), null, { timeout: 10000 })
    .then(() => true)
    .catch(() => false);
  await quadros(10);
  const q1 = await page.evaluate(() => ({
    cabeca: window.__sim.cabecaMundo(),
    rigY: document.getElementById("cameraRig").object3D.position.y,
    apresentando: document.querySelector("a-scene").renderer.xr.isPresenting,
  }));
  registra("Q1", entrou && q1.apresentando && Math.abs(q1.cabeca.y - 1.6) < 0.05, `sessao imersiva; cabeca a ${q1.cabeca.y} m do piso (rig em y=${q1.rigY})`);

  // ---- Q2: renderer ----------------------------------------------------------
  const q2 = await page.evaluate(() => {
    const scene = document.querySelector("a-scene");
    return {
      aa: !!scene.renderer.getContext().getContextAttributes().antialias,
      fr: scene.xrSession && scene.xrSession.frameRate,
      fov: scene.renderer.xr.getFoveation(),
    };
  });
  registra("Q2", q2.aa && q2.fr === 72 && q2.fov <= 0.5, `antialias ${q2.aa ? "ligado" : "DESLIGADO"}; ${q2.fr} Hz; foveacao ${q2.fov}`);

  // ---- Q3/Q4: maos ---------------------------------------------------------
  await page.evaluate(() => {
    __xr.primaryInputMode = "hand";
  });
  await quadros(30);
  const q3mao = await page.evaluate(() => {
    const h = document.getElementById("handRightTrack") || null;
    const c = h && h.components["hand-tracking-controls"];
    return { existe: !!h, malha: !!(c && c.skinnedMesh), fuse: document.getElementById("gazeCursor").getAttribute("cursor").fuse };
  });

  // Conta cliques em todo elemento da cena (captura) para pegar ecos.
  await page.evaluate(() => {
    window.__cliques = [];
    document.querySelector("a-scene").addEventListener(
      "click",
      (e) => {
        if (e.target && e.target.classList && e.target.classList.contains("clickable")) window.__cliques.push(window.__sim.nome(e.target));
      },
      true
    );
  });
  // Alvo: o botao "Tour guiado"/"Brasil" do mapa. Antes, conta-se o clique,
  // e a acao e desfeita voltando ao mapa.
  const alvoQ3 = "#brasilBtn .selection-clickable";
  await page.evaluate(async (sel) => {
    window.__sim.olharMundo(window.__sim.centro(document.querySelector(sel)));
    await window.__sim.quadros(10);
    window.__cliques = [];
  }, alvoQ3);
  // Q4 primeiro: olhar parado por 1,6 s com as maos visiveis.
  await pausa(1600);
  await quadros(6);
  const q4 = await page.evaluate(() => ({ cliques: window.__cliques.slice(), stage: state.stage, sob: window.__sim.nome(window.__sim.sobOlhar()) }));
  registra(
    "Q4",
    q4.cliques.length === 0 && q4.stage === "selection",
    `olhar parado 1,6 s no "Brasil" com as maos a vista: ${q4.cliques.length} clique(s) (etapa: ${q4.stage}; sob o olhar: ${q4.sob})`
  );
  if (q4.stage !== "selection") {
    await ocioso();
    await page.evaluate(() => returnToSelection());
    await ocioso();
    await page.evaluate(async (sel) => {
      window.__sim.olharMundo(window.__sim.centro(document.querySelector(sel)));
      await window.__sim.quadros(10);
    }, alvoQ3);
  }
  await page.evaluate(() => (window.__cliques = []));
  await page.evaluate(() => __xr.hands.right.updatePinchValue(1));
  await quadros(12);
  await page.evaluate(() => __xr.hands.right.updatePinchValue(0));
  await quadros(12);
  await ocioso();
  const q3 = await page.evaluate(() => ({ cliques: window.__cliques.slice(), stage: state.stage, ctx: state.context && state.context.tipo }));
  registra(
    "Q3",
    q3mao.malha && q3.cliques.length === 1 && q3.stage === "indicators",
    `mao ${q3mao.malha ? "visivel (modelo local)" : "INVISIVEL"}; 1 pinca olhando "Brasil" -> ${q3.cliques.length} clique(s) [${q3.cliques.join(", ")}] -> etapa ${q3.stage}`
  );
  await page.evaluate(() => {
    state.history = [];
    return returnToSelection();
  });
  await ocioso();

  // ---- Q5: controles -------------------------------------------------------
  await page.evaluate(() => {
    __xr.primaryInputMode = "controller";
    __xr.controllers.right.position.set(0.2, 1.2, -0.3);
  });
  await quadros(30);
  // Olha para um lado, aponta o laser para outro: o clique tem de ir so para o laser.
  await page.evaluate(async () => {
    window.__sim.olharMundo(window.__sim.centro(document.querySelector("#mapHotspots [data-region='norte']")));
    const alvo = window.__sim.centro(document.querySelector("#brasilBtn .selection-clickable"));
    for (let i = 0; i < 3; i += 1) {
      window.__sim.apontarControle(alvo);
      await window.__sim.quadros(6);
    }
    window.__cliques = [];
  });
  const laser = await page.evaluate(() => {
    const rc = document.getElementById("rightHand").components.raycaster;
    return { ligado: rc && rc.data.enabled, alvo: window.__sim.nome(rc && rc.intersectedEls[0]) };
  });
  await page.evaluate(() => __xr.controllers.right.updateButtonValue("trigger", 1));
  await quadros(12);
  await page.evaluate(() => __xr.controllers.right.updateButtonValue("trigger", 0));
  await quadros(12);
  await ocioso();
  const q5 = await page.evaluate(() => ({
    cliques: window.__cliques.slice(),
    stage: state.stage,
    maoVisivel: ["handLeftTrack", "handRightTrack"].some((id) => {
      const h = document.getElementById(id);
      return h && h.object3D.visible;
    }),
  }));
  registra("Q12", !q5.maoVisivel, q5.maoVisivel ? "com os controles na mao, o modelo da mao ficou CONGELADO no ar" : "ao pegar os controles, as maos somem");
  registra(
    "Q5",
    laser.ligado && q5.cliques.length === 1 && /brasilBtn/.test(q5.cliques[0] || "") && q5.stage === "indicators",
    `laser ${laser.ligado ? "ligado" : "DESLIGADO"} mirando ${laser.alvo}; 1 gatilho -> ${q5.cliques.length} clique(s) [${q5.cliques.join(", ")}] -> etapa ${q5.stage}`
  );

  // ---- Q6: alcance do olhar e conforto, etapa por etapa ----------------------
  const etapas = [
    { nome: "mapa", ir: async () => { state.history = []; await returnToSelection(); } },
    { nome: "drill", ir: async () => { openDrill(DADOS.regioes.find((r) => r.id === "sul")); } },
    { nome: "indicadores", ir: async () => { await enterIndicators(DADOS.brasil); } },
    { nome: "linha do tempo", ir: async () => { enterTimeline("evasao", true); } },
    { nome: "composicao", ir: async () => { enterComposicao(); } },
    { nome: "comparacao", ir: async () => { await enterMultiplos("eficiencia"); } },
  ];
  const relatorio = [];
  const inalcancaveis = [];
  const desconfortaveis = [];
  for (const etapa of etapas) {
    await ocioso();
    await page.evaluate(`(${etapa.ir.toString()})()`);
    await pausa(1500);
    await ocioso();
    await quadros(4);
    const linhas = await page.evaluate(() => {
      const r = [];
      const vistos = new Set();
      document.querySelectorAll(".clickable").forEach((el) => {
        if (!el.object3D || !el.object3D.visible) return;
        const ang = window.__sim.angulos(el);
        const primeiro = window.__sim.primeiroNoOlhar(el);
        const nome = window.__sim.nome(el);
        const chave = nome + ang.az + ang.el;
        if (vistos.has(chave)) return;
        vistos.add(chave);
        r.push({ nome, ...ang, alcancavel: primeiro === el, tapadoPor: primeiro && primeiro !== el ? window.__sim.nome(primeiro) : null });
      });
      return r;
    });
    linhas.forEach((l) => {
      if (!l.alcancavel) inalcancaveis.push(`${etapa.nome}: ${l.nome} (tapado por ${l.tapadoPor || "nada"})`);
      if (Math.abs(l.az) > CONFORTO.az || l.el > CONFORTO.elevMax || l.el < CONFORTO.elevMin) {
        desconfortaveis.push(`${etapa.nome}: ${l.nome} a ${l.az}/${l.el} graus`);
      }
    });
    relatorio.push({ etapa: etapa.nome, linhas });
  }
  registra(
    "Q6",
    inalcancaveis.length === 0 && desconfortaveis.length === 0,
    (inalcancaveis.length ? `inalcancaveis: ${inalcancaveis.slice(0, 6).join("; ")}${inalcancaveis.length > 6 ? ` (+${inalcancaveis.length - 6})` : ""}. ` : "todos alcancaveis pelo olhar. ") +
      (desconfortaveis.length ? `fora da faixa de conforto (${CONFORTO.az} graus de lado, ${CONFORTO.elevMin}..${CONFORTO.elevMax} na vertical): ${desconfortaveis.join("; ")}` : "todos na faixa de conforto.")
  );

  // ---- Q7: reticulo, legenda e HUD por cima ----------------------------------
  const q7 = await page.evaluate(() => {
    const coleta = (root) => {
      const r = [];
      if (!root) return r;
      root.object3D.traverse((o) => {
        if (o.material) (Array.isArray(o.material) ? o.material : [o.material]).forEach((m) => r.push({ dt: m.depthTest, ro: o.renderOrder }));
      });
      return r;
    };
    const ok = (l) => l.length > 0 && l.every((m) => m.dt === false && m.ro > 0);
    const ret = document.getElementById("gazeRing") || document.getElementById("gazeCursor");
    return { reticulo: ok(coleta(ret)), legenda: ok(coleta(document.getElementById("captionPanel"))), hud: ok(coleta(document.getElementById("vrHud"))) };
  });
  registra("Q7", q7.reticulo && q7.legenda && q7.hud, `reticulo ${q7.reticulo ? "ok" : "SOME"}; legenda ${q7.legenda ? "ok" : "SOME"}; HUD de VR ${q7.hud ? "ok" : "SOME"} atras de objetos proximos`);

  // ---- Q8: abertura guiada com voz que nunca termina -----------------------
  await ocioso();
  await page.evaluate(async () => {
    state.history = [];
    await enterIndicators(DADOS.brasil);
  });
  await ocioso();
  const q8 = await page.evaluate(async () => {
    enterTimeline("evasao");
    const t0 = performance.now();
    const anos = [];
    while (performance.now() - t0 < 16000) {
      if (anos[anos.length - 1] !== state.yearIdx) anos.push(state.yearIdx);
      if (!state.guided && anos.length > 1) break;
      await new Promise((r) => setTimeout(r, 200));
    }
    return { passos: anos.length, guiado: state.guided, s: Math.round((performance.now() - t0) / 1000) };
  });
  registra("Q8", q8.passos >= 3, `voz muda: a abertura guiada passou por ${q8.passos} momento(s) em ${q8.s} s${q8.guiado ? " (ainda rodando)" : " e terminou"}`);
  await page.evaluate(() => skipGuided());

  // ---- Q9: Voltar depois de Indicadores ------------------------------------
  await ocioso();
  const q9 = await page.evaluate(async () => {
    state.history = [];
    await returnToSelection();
    const sul = DADOS.regioes.find((r) => r.id === "sul");
    openDrill(sul);
    // drill -> regiao inteira -> indicadores (como o clique do card faz)
    pushHistory();
    await enterIndicators(sul);
    onIndicatorClick(DADOS.indicadores[0]);
    await new Promise((r) => setTimeout(r, 900));
    skipGuided();
    backToIndicators();
    navigateBack();
    await new Promise((r) => setTimeout(r, 2200));
    return { stage: state.stage };
  });
  registra("Q9", q9.stage !== "indicators", `linha do tempo -> "Indicadores" -> "Voltar" leva a: ${q9.stage}`);

  // ---- Q10: draw calls -----------------------------------------------------
  const pesos = [];
  for (const etapa of [
    { nome: "mapa", ir: async () => { state.history = []; await returnToSelection(); } },
    { nome: "linha do tempo", ir: async () => { await enterIndicators(DADOS.brasil); enterTimeline("evasao", true); } },
    { nome: "comparacao", ir: async () => { await enterMultiplos("eficiencia"); } },
  ]) {
    await ocioso();
    await page.evaluate(`(${etapa.ir.toString()})()`);
    await pausa(1500);
    await ocioso();
    const r = await page.evaluate(async () => {
      __xr.quaternion.set(0, 0, 0, 1);
      await window.__sim.quadros(6);
      const info = document.querySelector("a-scene").renderer.info.render;
      return { calls: info.calls, tris: info.triangles };
    });
    pesos.push(`${etapa.nome} ${r.calls} dc/${Math.round(r.tris / 1000)}k tri`);
    if (r.calls > ORCAMENTO_DRAW_CALLS) avisos.push(`${etapa.nome}: ${r.calls} draw calls`);
  }
  registra("Q10", avisos.length === 0, pesos.join("; "));

  const shot = argVal("--shot");
  if (shot) {
    await page.evaluate(async () => {
      __xr.quaternion.set(0, 0, 0, 1);
      await window.__sim.quadros(10);
    });
    await page.screenshot({ path: shot });
  }

  const relevantes = errosConsole.filter((e) => !/WebGL|GPU|swiftshader|favicon|net::ERR_FAILED|ERR_BLOCKED|Failed to load resource/i.test(e));
  registra("Q11", relevantes.length === 0, relevantes.length ? `${relevantes.length} erro(s): ${relevantes.slice(0, 5).join(" | ")}` : "console limpo");

  await browser.close();
  server.close();

  console.log(`\nSimulacao Meta Quest 2 (IWER) - ${ROOT}\n`);
  resultados.forEach((r) => console.log(`  ${r.passou ? "✓" : "✗"} ${r.id.padEnd(4)} ${r.msg}`));
  if (args.includes("--angulos")) {
    console.log("\nAngulos dos alvos (az/elev em graus a partir do olho; tam = tamanho angular):");
    relatorio.forEach((e) => {
      console.log(`  [${e.etapa}]`);
      e.linhas.forEach((l) => console.log(`    ${l.alcancavel ? " " : "!"} ${l.nome.padEnd(48)} az ${String(l.az).padStart(4)}  el ${String(l.el).padStart(4)}  ${l.dist} m  ${l.tam} graus`));
    });
  }
  const falhas = resultados.filter((r) => !r.passou);
  console.log("");
  if (falhas.length) {
    console.log(`FALHOU: ${falhas.length} de ${resultados.length} verificacoes.`);
    process.exit(1);
  }
  console.log("simulacao Quest 2: tudo verde.");
})();
