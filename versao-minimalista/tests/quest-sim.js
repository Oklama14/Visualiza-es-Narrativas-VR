// ----------------------------------------------------------------------------
// Simulacao do Quest 2 (WebXR emulado) - o teste que o smoke nao alcanca.
//
// O smoke-ambiente exercita o caminho do DESKTOP (mouse). Tudo o que so existe
// dentro do headset - local-floor, olhar a partir do olho, pinca, gatilho,
// teleporte com o corpo deslocado - so aparece numa sessao imersiva. Aqui ela e
// emulada com o IWER (Immersive Web Emulation Runtime, da Meta) configurado
// como Meta Quest 2: a cena entra em VR de verdade, a cabeca e posta em poses
// conhecidas e as maos/controles disparam os mesmos eventos do headset.
//
//   npm i -D playwright iwer         (uma vez)
//   node tests/quest-sim.js
//   node tests/quest-sim.js --shot visao-quest.png   (captura estereo)
//   node tests/quest-sim.js --root ../outra-copia    (testa outra pasta)
//
// O que verifica:
//   XR1  a sessao imersiva abre e a cabeca fica a ~1,6 m (nao 3,2 m)
//   XR2  todo alvo de olhar e alcancavel do ponto de observacao (inclusive os
//        que ficam a menos de 1 m do olho, como as colunas e o botao de som)
//   XR3  UMA pinca = UMA confirmacao (o botao de som nao pode ligar e desligar)
//   XR4  UM gatilho = UMA confirmacao
//   XR5  pinca numa regiao abre o painel
//   XR6  o painel e opaco ao olhar (nao da para focar uma regiao "atraves" dele)
//   XR7  painel fechado nao deixa alvos de ano invisiveis respondendo ao olhar
//   XR8  o painel inclina PARA quem olha (normal apontando para o olho)
//   XR9  teleporte poe a CABECA no disco, mesmo com o corpo fora do centro
//   XR10 legenda e reticulo desenhados por cima do mundo (nao somem na mesa)
//   XR11 antialias ligado e taxa de quadros pedida ao headset
//   XR12 orcamento de draw calls por quadro (estereo) com o painel aberto
//   XR13 console limpo durante toda a sessao
//   XR14 o modelo da mao carrega sem internet (assets/maos/)
//   XR15 ao pegar os controles, o modelo da mao some (nao fica congelado no ar)
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
const PORTA = 4188;

// Orcamento de draw calls por quadro, ja somando os dois olhos. O Quest 2 segura
// algumas centenas com shaders simples; acima disso o quadro de 13,9 ms (72 Hz)
// comeca a apertar no navegador.
const ORCAMENTO_DRAW_CALLS = 700;

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

(async () => {
  const iwerPath = acharIwer();
  if (!iwerPath) {
    console.error("IWER nao encontrado. Rode:  npm i -D playwright iwer");
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

  // Runtime WebXR emulado ANTES de qualquer script da pagina: o A-Frame decide
  // no carregamento se existe headset.
  await page.addInitScript({
    content:
      iwerSrc +
      `;(function () {
        var d = new IWER.XRDevice(IWER.metaQuest2, { stereoEnabled: true });
        d.installRuntime({ forceInstall: true });
        window.__xr = d;
      })();`,
  });

  // Rede bloqueada para fora: o laboratorio pode estar offline, e o teste
  // precisa provar que a cena funciona assim (fonte, A-Frame, maos).
  await page.route("**/*", (route) => {
    const u = route.request().url();
    if (u.startsWith(`http://127.0.0.1:${PORTA}/`) || u.startsWith("data:") || u.startsWith("blob:")) return route.continue();
    return route.abort();
  });

  await page.goto(`http://127.0.0.1:${PORTA}/index.html`, { waitUntil: "load" });
  await page
    .waitForFunction(() => window.AMB && window.AMB.state.pronto, null, { timeout: 30000 })
    .catch(() => registra("BOOT", false, "state.pronto nunca ficou true"));
  await page.evaluate(() => {
    const b = document.getElementById("onboardStart");
    if (b && !document.getElementById("onboardOverlay").hidden) b.click();
  });

  // ---- utilitarios dentro da pagina ----------------------------------------
  await page.evaluate(() => {
    const THREE = AFRAME.THREE;
    const scene = document.querySelector("a-scene");
    window.__sim = {
      rig: () => document.getElementById("cameraRig").object3D,
      // Cabeca no espaco do rig (local-floor). O IWER guarda a pose do headset
      // nesse espaco; o A-Frame aplica por cima do rig.
      cabecaLocal(x, y, z) {
        __xr.position.set(x, y, z);
      },
      cabecaMundo() {
        const cam = document.getElementById("camera").object3D;
        cam.updateMatrixWorld(true);
        const p = new THREE.Vector3();
        cam.getWorldPosition(p);
        return { x: +p.x.toFixed(3), y: +p.y.toFixed(3), z: +p.z.toFixed(3) };
      },
      olharMundo(p) {
        const rig = this.rig();
        rig.updateMatrixWorld(true);
        const inv = new THREE.Matrix4().copy(rig.matrixWorld).invert();
        const alvo = new THREE.Vector3(p.x, p.y, p.z).applyMatrix4(inv);
        const olho = new THREE.Vector3(__xr.position.x, __xr.position.y, __xr.position.z);
        const m = new THREE.Matrix4().lookAt(olho, alvo, new THREE.Vector3(0, 1, 0));
        const q = new THREE.Quaternion().setFromRotationMatrix(m);
        __xr.quaternion.set(q.x, q.y, q.z, q.w);
      },
      centro(el) {
        el.object3D.updateMatrixWorld(true);
        const b = new THREE.Box3().setFromObject(el.object3D);
        const c = b.getCenter(new THREE.Vector3());
        return { x: c.x, y: c.y, z: c.z };
      },
      emMundo(el, local) {
        el.object3D.updateMatrixWorld(true);
        const v = new THREE.Vector3(local.x, local.y, local.z).applyMatrix4(el.object3D.matrixWorld);
        return { x: v.x, y: v.y, z: v.z };
      },
      sobOlhar() {
        const c = document.getElementById("gazeCursor");
        const cur = c && c.components.cursor;
        const e = cur && cur.intersectedEl;
        if (!e) return null;
        return {
          id: e.id || null,
          cls: e.className || "",
          dados: Object.assign({}, e.dataset),
        };
      },
      quadros(n) {
        // espera n quadros XR de verdade (o raycaster roda no tock do A-Frame)
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
    };
  });

  const quadros = (n) => page.evaluate((k) => window.__sim.quadros(k), n);
  const pausa = (ms) => page.waitForTimeout(ms);

  // ---- XR1: entrar em VR ---------------------------------------------------
  await page.evaluate(() => document.querySelector("a-scene").enterVR());
  const entrou = await page
    .waitForFunction(() => window.AMB.state.vrMode && document.querySelector("a-scene").is("vr-mode"), null, { timeout: 10000 })
    .then(() => true)
    .catch(() => false);
  if (!entrou) {
    registra("XR1", false, "a sessao imersiva nao abriu");
  } else {
    await quadros(10);
    const xr1 = await page.evaluate(() => ({
      cabeca: window.__sim.cabecaMundo(),
      rigY: document.getElementById("cameraRig").object3D.position.y,
      apresentando: document.querySelector("a-scene").renderer.xr.isPresenting,
    }));
    registra(
      "XR1",
      xr1.apresentando && Math.abs(xr1.cabeca.y - 1.6) < 0.05,
      `sessao imersiva; cabeca a ${xr1.cabeca.y} m do piso (rig em y=${xr1.rigY})`
    );
  }

  // ---- XR11: antialias e taxa de quadros -----------------------------------
  const xr11 = await page.evaluate(() => {
    const scene = document.querySelector("a-scene");
    const gl = scene.renderer.getContext();
    const attrs = gl.getContextAttributes();
    const s = scene.xrSession;
    return { antialias: !!attrs.antialias, frameRate: s && s.frameRate, foveacao: scene.getAttribute("renderer").foveationLevel };
  });
  registra(
    "XR11",
    xr11.antialias && xr11.frameRate === 72,
    `antialias ${xr11.antialias ? "ligado" : "DESLIGADO"}; taxa pedida ${xr11.frameRate} Hz; foveacao ${xr11.foveacao}`
  );

  // ---- vai para o ponto de observacao do desenho ---------------------------
  await page.evaluate(() => window.AMB.irPara("usuario"));
  await pausa(400);
  await page.evaluate(() => window.__sim.cabecaLocal(0, 1.6, 0));
  await quadros(4);

  // ---- XR2: todos os alvos de olhar sao alcancaveis -------------------------
  const alvos = await page.evaluate(() => {
    const lista = [];
    document.querySelectorAll(".alvo-regiao, .alvo-indicador, [data-destino], [data-acao='som']").forEach((el) => {
      const d = el.dataset;
      lista.push({ chave: d.regiao || d.indicador || d.destino || d.acao, seletor: d.regiao ? `[data-regiao="${d.regiao}"]` : d.indicador ? `[data-indicador="${d.indicador}"]` : d.destino ? `[data-destino="${d.destino}"]` : `[data-acao="${d.acao}"]` });
    });
    return lista;
  });
  const falhasOlhar = [];
  const distancias = [];
  for (const a of alvos) {
    // O disco do ponto de observacao fica sob os pes de quem esta nele; mira-lo
    // de cima e geometricamente degenerado. Pula.
    if (a.chave === "usuario") continue;
    const r = await page.evaluate(async (sel) => {
      const el = document.querySelector(sel);
      // Coluna de indicador: mira o BLOCO de voxels (o que a pessoa ve), nao
      // o alvo invisivel - e justamente o desencontro entre os dois que se testa.
      let mira = el;
      if (el.dataset.indicador) {
        const vox = Array.from(el.parentNode.children).find((c) => c.getObject3D && c.getObject3D("voxels"));
        if (vox) mira = vox;
      }
      const c = window.__sim.centro(mira);
      window.__sim.olharMundo(c);
      await window.__sim.quadros(8);
      const cab = window.__sim.cabecaMundo();
      const dist = Math.hypot(c.x - cab.x, c.y - cab.y, c.z - cab.z);
      return { sob: window.__sim.sobOlhar(), dist: +dist.toFixed(2) };
    }, a.seletor);
    const d = r.sob && r.sob.dados;
    const acertou = d && (d.regiao === a.chave || d.indicador === a.chave || d.destino === a.chave || d.acao === a.chave);
    distancias.push(`${a.chave} ${r.dist} m`);
    if (!acertou) falhasOlhar.push(`${a.chave} (a ${r.dist} m; olhar pegou ${r.sob ? JSON.stringify(r.sob.dados) : "nada"})`);
  }
  registra(
    "XR2",
    falhasOlhar.length === 0,
    falhasOlhar.length ? `alvos fora do alcance do olhar: ${falhasOlhar.join("; ")}` : `${alvos.length - 1} alvos alcancaveis (${distancias.join(", ")})`
  );

  // ---- XR3: uma pinca = uma confirmacao (botao de som) ----------------------
  await page.evaluate(() => {
    __xr.primaryInputMode = "hand";
  });
  await quadros(20);
  const maos = await page.evaluate(() => {
    const h = document.getElementById("handRight");
    const c = h.components["tracked-controls"];
    return !!(c && c.controller && c.controller.hand);
  });
  const pinca = async () => {
    await page.evaluate(() => __xr.hands.right.updatePinchValue(1));
    await quadros(12);
    await page.evaluate(() => __xr.hands.right.updatePinchValue(0));
    await quadros(12);
  };
  const gatilho = async () => {
    await page.evaluate(() => __xr.controllers.right.updateButtonValue("trigger", 1));
    await quadros(12);
    await page.evaluate(() => __xr.controllers.right.updateButtonValue("trigger", 0));
    await quadros(12);
  };
  // ---- XR14: a mao aparece mesmo sem internet ------------------------------
  // A rede externa esta bloqueada neste teste (page.route): o modelo tem de vir
  // do proprio projeto.
  await quadros(30);
  const xr14 = await page.evaluate(() => {
    const c = document.getElementById("handRight").components["hand-tracking-controls"];
    return { malha: !!(c && c.skinnedMesh), ossos: c && c.bones ? c.bones.length : 0, url: document.getElementById("handRight").getAttribute("gltf-model") };
  });
  registra("XR14", xr14.malha && xr14.ossos >= 25, `modelo da mao ${xr14.malha ? "carregado" : "NAO carregou"} (${xr14.ossos} ossos) de ${xr14.url}`);

  const somAntes = await page.evaluate(async () => {
    window.__sim.olharMundo(window.__sim.centro(document.querySelector('[data-acao="som"]')));
    await window.__sim.quadros(8);
    return { som: window.AMB.state.soundOn, sob: window.__sim.sobOlhar() };
  });
  const toggles = await page.evaluate(() => {
    window.__toggles = 0;
    const lbl = document.getElementById("somLabel");
    new MutationObserver(() => (window.__toggles += 1)).observe(lbl, { attributes: true, attributeFilter: ["value"] });
    return true;
  });
  void toggles;
  await pinca();
  const somDepois = await page.evaluate(() => ({ som: window.AMB.state.soundOn, toggles: window.__toggles, mao: window.AMB.state.maoAtiva }));
  registra(
    "XR3",
    maos && somAntes.sob && somAntes.sob.dados.acao === "som" && somDepois.som !== somAntes.som,
    `maos rastreadas: ${maos}; olhar no botao: ${!!(somAntes.sob && somAntes.sob.dados.acao === "som")}; ` +
      `1 pinca -> som ${somAntes.som ? "ligado" : "mudo"} -> ${somDepois.som ? "ligado" : "mudo"} (${somDepois.toggles} troca(s) de rotulo)`
  );

  // ---- XR4: um gatilho = uma confirmacao -----------------------------------
  await page.evaluate(() => {
    __xr.primaryInputMode = "controller";
  });
  await quadros(20);
  const g0 = await page.evaluate(() => ({ som: window.AMB.state.soundOn }));
  await page.evaluate(() => (window.__toggles = 0));
  await gatilho();
  const g1 = await page.evaluate(() => ({
    som: window.AMB.state.soundOn,
    toggles: window.__toggles,
    maoVisivel: ["handLeft", "handRight"].some((id) => document.getElementById(id).object3D.visible),
  }));
  registra("XR4", g1.som !== g0.som, `1 gatilho -> som ${g0.som ? "ligado" : "mudo"} -> ${g1.som ? "ligado" : "mudo"} (${g1.toggles} troca(s))`);
  registra("XR15", !g1.maoVisivel, g1.maoVisivel ? "com os controles na mao, o modelo da mao ficou CONGELADO no ar" : "ao pegar os controles, as maos somem");

  // ---- XR5: pinca numa regiao abre o painel --------------------------------
  await page.evaluate(() => {
    __xr.primaryInputMode = "hand";
  });
  await quadros(20);
  await page.evaluate(async () => {
    window.__sim.olharMundo(window.__sim.centro(document.querySelector('.alvo-regiao[data-regiao="sudeste"]')));
    await window.__sim.quadros(10);
  });
  await pausa(250); // dwell do foco
  await pinca();
  await pausa(900); // animacao de subida
  await quadros(4);
  const xr5 = await page.evaluate(() => ({ aberto: window.AMB.state.painelAberto, regiao: window.AMB.state.regiaoId }));
  registra("XR5", xr5.aberto && xr5.regiao === "sudeste", `painel ${xr5.aberto ? "aberto" : "FECHADO"} (regiao ${xr5.regiao})`);

  // ---- XR8: inclinacao do painel -------------------------------------------
  const xr8 = await page.evaluate(() => {
    const THREE = AFRAME.THREE;
    const p = document.getElementById("painel").object3D;
    p.updateMatrixWorld(true);
    const centro = new THREE.Vector3().setFromMatrixPosition(p.matrixWorld);
    const normal = new THREE.Vector3(0, 0, 1).transformDirection(p.matrixWorld);
    const cab = window.__sim.cabecaMundo();
    const paraOlho = new THREE.Vector3(cab.x, cab.y, cab.z).sub(centro).normalize();
    const ang = (Math.acos(Math.max(-1, Math.min(1, normal.dot(paraOlho)))) * 180) / Math.PI;
    const elev = (Math.asin(paraOlho.y) * 180) / Math.PI;
    return { ang: +ang.toFixed(1), normalY: +normal.y.toFixed(3), elev: +elev.toFixed(1) };
  });
  registra(
    "XR8",
    xr8.ang < 8,
    `normal do painel a ${xr8.ang} graus da linha do olhar (olho ${xr8.elev} graus abaixo do centro; normal.y = ${xr8.normalY})`
  );

  // ---- XR6: o painel e opaco ao olhar --------------------------------------
  // Mira a parte de baixo da parede de blocos: a linha do olhar continua, atras
  // do painel, ate a mesa. Se nada barrar, o olhar foca uma regiao invisivel.
  const xr6 = await page.evaluate(async () => {
    const painel = document.getElementById("painel");
    const pontos = [
      { x: 1.0, y: -0.6, z: 0 },
      { x: 0.6, y: -0.62, z: 0 },
      { x: -1.3, y: -0.66, z: 0 },
      { x: 1.3, y: 0.0, z: 0 },
    ];
    const vazou = [];
    for (const lp of pontos) {
      window.__sim.olharMundo(window.__sim.emMundo(painel, lp));
      await window.__sim.quadros(8);
      const s = window.__sim.sobOlhar();
      if (s && (s.dados.regiao || s.dados.indicador || s.dados.destino)) vazou.push(`${lp.x},${lp.y} -> ${JSON.stringify(s.dados)}`);
    }
    return vazou;
  });
  registra("XR6", xr6.length === 0, xr6.length ? `o olhar atravessa o painel: ${xr6.join("; ")}` : "painel barra o olhar (nada atras dele responde)");

  // ---- XR7: painel fechado nao deixa alvos fantasmas -----------------------
  const xr7 = await page.evaluate(async () => {
    const painel = document.getElementById("painel");
    const pontos = [-1.0, -0.5, 0.0, 0.3].map((x) => window.__sim.emMundo(painel, { x, y: -0.1, z: 0 }));
    window.AMB.fecharPainel();
    await window.__sim.quadros(6);
    const fantasmas = [];
    for (const p of pontos) {
      window.__sim.olharMundo(p);
      await window.__sim.quadros(8);
      const s = window.__sim.sobOlhar();
      if (s && (s.dados.ano != null || s.id === "painelFechar")) fantasmas.push(JSON.stringify(s.dados));
    }
    return fantasmas;
  });
  registra("XR7", xr7.length === 0, xr7.length ? `painel FECHADO e o olhar ainda pega: ${xr7.join(", ")}` : "sem alvos fantasmas com o painel fechado");

  // ---- XR10: legenda e reticulo por cima do mundo --------------------------
  const xr10 = await page.evaluate(() => {
    const coleta = (root) => {
      const r = [];
      root.object3D.traverse((o) => {
        if (o.material) {
          const ms = Array.isArray(o.material) ? o.material : [o.material];
          ms.forEach((m) => r.push({ depthTest: m.depthTest, renderOrder: o.renderOrder }));
        }
      });
      return r;
    };
    const leg = coleta(document.getElementById("captionPanel"));
    const ret = coleta(document.getElementById("gazeCursor"));
    const ok = (l) => l.length > 0 && l.every((m) => m.depthTest === false && m.renderOrder > 0);
    return { legenda: ok(leg), reticulo: ok(ret), nLeg: leg.length, nRet: ret.length };
  });
  registra(
    "XR10",
    xr10.legenda && xr10.reticulo,
    `legenda ${xr10.legenda ? "por cima" : "SOME atras de objetos proximos"}; reticulo ${xr10.reticulo ? "por cima" : "SOME atras de objetos proximos"}`
  );

  // ---- XR9: teleporte com o corpo fora do centro ---------------------------
  const xr9 = await page.evaluate(async () => {
    // O visitante andou 0,8 m para a direita e 0,4 m para tras no guardian e
    // esta olhando para o lado (60 graus) quando confirma o disco.
    window.__sim.cabecaLocal(0.8, 1.6, 0.4);
    const q = new AFRAME.THREE.Quaternion().setFromEuler(new AFRAME.THREE.Euler(0, (60 * Math.PI) / 180, 0));
    __xr.quaternion.set(q.x, q.y, q.z, q.w);
    await window.__sim.quadros(6);
    await window.AMB.irPara("contexto");
    await new Promise((r) => setTimeout(r, 300));
    await window.__sim.quadros(6);
    const cab = window.__sim.cabecaMundo();
    const disco = document.getElementById("discoContexto").object3D;
    disco.updateMatrixWorld(true);
    const d = new AFRAME.THREE.Vector3().setFromMatrixPosition(disco.matrixWorld);
    // Direcao do olhar depois do teleporte: deve apontar para a zona de contexto.
    const cam = document.getElementById("camera").object3D;
    const fwd = new AFRAME.THREE.Vector3(0, 0, -1).transformDirection(cam.matrixWorld);
    const zona = document.getElementById("contextoZona").object3D;
    zona.updateMatrixWorld(true);
    const zc = new AFRAME.THREE.Vector3().setFromMatrixPosition(zona.matrixWorld);
    const para = new AFRAME.THREE.Vector3(zc.x - cab.x, 0, zc.z - cab.z).normalize();
    const fwdH = new AFRAME.THREE.Vector3(fwd.x, 0, fwd.z).normalize();
    const angOlhar = (Math.acos(Math.max(-1, Math.min(1, fwdH.dot(para)))) * 180) / Math.PI;
    window.__sim.cabecaLocal(0, 1.6, 0);
    return { erro: +Math.hypot(cab.x - d.x, cab.z - d.z).toFixed(2), angOlhar: +angOlhar.toFixed(1) };
  });
  registra(
    "XR9",
    xr9.erro < 0.1 && xr9.angOlhar < 15,
    `cabeca a ${xr9.erro} m do disco de destino; olhar a ${xr9.angOlhar} graus da zona de contexto`
  );

  // ---- XR12: draw calls por quadro (painel aberto) -------------------------
  await page.evaluate(() => {
    window.AMB.irPara("usuario");
  });
  await pausa(300);
  const xr12 = await page.evaluate(async () => {
    window.AMB.abrirPainel("nordeste");
    await new Promise((r) => setTimeout(r, 900));
    const scene = document.querySelector("a-scene");
    window.__sim.olharMundo(window.__sim.centro(document.getElementById("painelFundo")));
    await window.__sim.quadros(6);
    const info = scene.renderer.info;
    let transp = 0;
    let textos = 0;
    let malhas = 0;
    scene.object3D.traverseVisible((o) => {
      if (!o.isMesh) return;
      malhas += 1;
      const m = Array.isArray(o.material) ? o.material[0] : o.material;
      if (m && m.transparent) transp += 1;
      if (o.el && o.el.tagName === "A-TEXT") textos += 1;
      else if (o.parent && o.parent.el && o.geometry && o.geometry.layout) textos += 1;
    });
    return { calls: info.render.calls, tris: info.render.triangles, malhas, transp, textos };
  });
  registra(
    "XR12",
    xr12.calls <= ORCAMENTO_DRAW_CALLS,
    `${xr12.calls} draw calls/quadro (2 olhos), ${xr12.tris} triangulos; ${xr12.malhas} malhas visiveis, ${xr12.transp} transparentes, ${xr12.textos} textos`
  );

  const shot = argVal("--shot");
  if (shot) {
    await page.evaluate(async () => {
      window.__sim.cabecaLocal(0, 1.6, 0);
      window.__sim.olharMundo(window.__sim.centro(document.getElementById("painelFundo")));
      await window.__sim.quadros(10);
    });
    await page.screenshot({ path: shot });
  }

  // ---- XR13: console limpo -------------------------------------------------
  const relevantes = errosConsole.filter((e) => !/WebGL|GPU|swiftshader|favicon|net::ERR_FAILED|ERR_BLOCKED|Failed to load resource/i.test(e));
  registra("XR13", relevantes.length === 0, relevantes.length ? `${relevantes.length} erro(s): ${relevantes.slice(0, 5).join(" | ")}` : "console limpo");

  await browser.close();
  server.close();

  console.log(`\nSimulacao Meta Quest 2 (IWER) - ${ROOT}\n`);
  resultados.forEach((r) => console.log(`  ${r.passou ? "✓" : "✗"} ${r.id.padEnd(5)} ${r.msg}`));
  const falhas = resultados.filter((r) => !r.passou);
  console.log("");
  if (falhas.length) {
    console.log(`FALHOU: ${falhas.length} de ${resultados.length} verificacoes.`);
    process.exit(1);
  }
  console.log("simulacao Quest 2: tudo verde.");
})();
