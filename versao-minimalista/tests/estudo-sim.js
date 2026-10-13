// ----------------------------------------------------------------------------
// Ensaio geral do ESTUDO, ponta a ponta, sem ninguem no headset.
//
// Sobe o server.js (com a api do estudo), abre a estacao do pesquisador, um
// Meta Quest 2 emulado (IWER) na condicao imersiva e depois a condicao 2D, e
// conduz uma sessao completa como o pesquisador faria: triagem, SSQ antes,
// treino de 3 gestos, exploracao (andando, teleportando, abrindo painel), as
// 3 tarefas pela estacao, SSQ depois. No meio, o "Wi-Fi cai" por alguns
// segundos. No fim roda estudo/analisar.js sobre o .jsonl gravado e confere
// se as variaveis dependentes saem dele - e o "rode a analise no seu proprio
// JSON antes do piloto" do conselho, automatizado.
//
//   npm i -D playwright iwer        (uma vez)
//   node tests/estudo-sim.js
//
// Os dados vao para uma pasta temporaria (nunca para dados-estudo/).
// ----------------------------------------------------------------------------

const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const http = require("node:http");
const { chromium } = require("playwright");

const ROOT = path.resolve(__dirname, "..");
const PASTA = fs.mkdtempSync(path.join(os.tmpdir(), "vrlab-estudo-sim-"));
process.env.VRLAB_DADOS_DIR = PASTA;
const { atender } = require(path.join(ROOT, "server.js"));
const { analisar, lerJsonl } = require(path.join(ROOT, "estudo", "analisar.js"));
const { pontuarSSQ } = require(path.join(ROOT, "estudo", "ssq.js"));
const PORTA = 4193;
const BASE = `http://127.0.0.1:${PORTA}`;
const P = "P90";

const resultados = [];
const registra = (id, passou, msg) => resultados.push({ id, passou: !!passou, msg });

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
  (process.env.NODE_PATH || "").split(path.delimiter).filter(Boolean).forEach((p) => candidatos.push(path.join(p, "iwer", "build", "iwer.min.js")));
  return candidatos.find((f) => fs.existsSync(f));
}

const SSQ_PRE = { 1: 0, 2: 1, 3: 0, 4: 1, 5: 0, 6: 0, 7: 0, 8: 0, 9: 0, 10: 0, 11: 0, 12: 0, 13: 0, 14: 0, 15: 0, 16: 0 };
const SSQ_POS = { 1: 1, 2: 1, 3: 0, 4: 2, 5: 1, 6: 0, 7: 0, 8: 1, 9: 0, 10: 1, 11: 0, 12: 1, 13: 0, 14: 0, 15: 0, 16: 0 };

(async () => {
  const iwerPath = acharIwer();
  if (!iwerPath) {
    console.error("IWER nao encontrado. Rode:  npm i -D playwright iwer");
    process.exit(2);
  }
  const iwerSrc = fs.readFileSync(iwerPath, "utf8");
  const server = http.createServer(atender);
  await new Promise((r) => server.listen(PORTA, "127.0.0.1", r));
  const browser = await chromium.launch({ args: ["--enable-unsafe-swiftshader", "--use-gl=swiftshader", "--autoplay-policy=no-user-gesture-required"] });
  const erros = [];
  const novaPagina = async (rotulo, xr) => {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 760 } });
    const page = await ctx.newPage();
    page.on("console", (m) => m.type() === "error" && erros.push(`${rotulo}: ${m.text()}`));
    page.on("pageerror", (e) => erros.push(`${rotulo}: ${e.message}`));
    page.on("dialog", (d) => {
      erros.push(`${rotulo}: dialogo inesperado "${d.message()}"`);
      d.dismiss();
    });
    if (xr) {
      await page.addInitScript({
        content: iwerSrc + ";(function(){var d=new IWER.XRDevice(IWER.metaQuest2,{stereoEnabled:true});d.installRuntime({forceInstall:true});window.__xr=d;})();",
      });
    }
    await page.route("**/*", (route) => (route.request().url().startsWith(BASE) ? route.continue() : route.abort()));
    return page;
  };

  // ---- estacao ---------------------------------------------------------------
  const est = await novaPagina("estacao");
  await est.goto(`${BASE}/pesquisador.html`);
  await est.fill("#pid", P);
  await est.check('input[name="cond"][value="webxr"]');
  await est.waitForFunction(() => document.querySelectorAll(".tarefa").length === 3);
  const marcarSSQ = async (momento, resp) => {
    for (const [n, v] of Object.entries(resp)) await est.check(`input[name="${momento}-${n}"][value="${v}"]`);
    await est.click(`#${momento}Salvar`);
    await est.waitForFunction((m) => /Total/.test(document.getElementById(`${m}Escores`).textContent), momento);
  };
  await est.check("#chkTriagem");
  await est.click("#btnTriagem");
  await marcarSSQ("pre", SSQ_PRE);

  // ---- headset ---------------------------------------------------------------
  const vr = await novaPagina("headset", true);
  await vr.goto(`${BASE}/index.html?estudo=1&p=${P}`);
  await vr.waitForFunction(() => window.AMB && window.AMB.state.pronto, null, { timeout: 30000 });
  await vr.evaluate(() => {
    const b = document.getElementById("onboardStart");
    if (b && !document.getElementById("onboardOverlay").hidden) b.click();
    const THREE = AFRAME.THREE;
    const scene = document.querySelector("a-scene");
    window.__sim = {
      cabecaLocal(x, y, z) {
        __xr.position.set(x, y, z);
      },
      olharMundo(p) {
        const rig = document.getElementById("cameraRig").object3D;
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
        const c = new THREE.Box3().setFromObject(el.object3D).getCenter(new THREE.Vector3());
        return { x: c.x, y: c.y, z: c.z };
      },
      quadros(n) {
        return new Promise((resolve) => {
          let k = 0;
          const s = scene.xrSession;
          const passo = () => (++k >= n || !s ? resolve() : s.requestAnimationFrame(passo));
          if (s) s.requestAnimationFrame(passo);
          else setTimeout(resolve, 50 * n);
        });
      },
      legenda: () => document.getElementById("captionText").components.text.data.value,
      // Anda de verdade (cabeca no espaco do rig) ate um ponto do MUNDO.
      async andarPara(wx, wz, passos) {
        const rig = document.getElementById("cameraRig").object3D;
        rig.updateMatrixWorld(true);
        const inv = new THREE.Matrix4().copy(rig.matrixWorld).invert();
        const alvo = new THREE.Vector3(wx, 1.6, wz).applyMatrix4(inv);
        const de = { x: __xr.position.x, z: __xr.position.z };
        for (let k = 1; k <= passos; k += 1) {
          const f = k / passos;
          __xr.position.set(de.x + (alvo.x - de.x) * f, 1.6, de.z + (alvo.z - de.z) * f);
          await this.quadros(4);
          await new Promise((r) => setTimeout(r, 60));
        }
      },
    };
  });
  const quadros = (n) => vr.evaluate((k) => window.__sim.quadros(k), n);
  await vr.evaluate(() => document.querySelector("a-scene").enterVR());
  await vr.waitForFunction(() => window.AMB.state.vrMode, null, { timeout: 10000 });
  await vr.evaluate(() => {
    __xr.primaryInputMode = "hand";
  });
  await quadros(30);
  const pinca = async () => {
    await vr.evaluate(() => __xr.hands.right.updatePinchValue(1));
    await quadros(12);
    await vr.evaluate(() => __xr.hands.right.updatePinchValue(0));
    await quadros(12);
  };
  const mirar = async (seletor) => {
    await vr.evaluate(async (s) => {
      window.__sim.olharMundo(window.__sim.centro(document.querySelector(s)));
      await window.__sim.quadros(10);
    }, seletor);
    await vr.waitForTimeout(250);
  };

  // canal de comandos aberto?
  const conectado = await est
    .waitForFunction(() => /conectada/.test(document.getElementById("vivo").textContent), null, { timeout: 8000 })
    .then(() => true)
    .catch(() => false);
  registra("E1", conectado, conectado ? "estacao ve o headset conectado (canal de comandos aberto)" : "a estacao NAO viu o headset conectar");

  // ---- treino ----------------------------------------------------------------
  await est.click("#btnTreino");
  await vr.waitForFunction(() => window.AMB.state.treino, null, { timeout: 5000 }).catch(() => {});
  const t0 = await vr.evaluate(() => ({ treino: window.AMB.state.treino, legenda: window.__sim.legenda(), mesa: document.getElementById("mesaMapa").object3D.visible }));
  await vr.waitForTimeout(300);
  await vr.evaluate(() => window.__sim.cabecaLocal(0, 1.6, 0));
  await quadros(6);
  await mirar('[data-treino="pinca"]');
  await pinca();
  const t1 = await vr.evaluate(() => window.__sim.legenda());
  await mirar('[data-treino="teleporte"]');
  await pinca();
  await vr.waitForTimeout(400);
  const t2 = await vr.evaluate(() => window.__sim.legenda());
  // passo real ate a marca amarela
  await vr.evaluate(() => window.__sim.andarPara(TREINO_PONTOS.marca.x, TREINO_PONTOS.marca.z, 6));
  await vr.waitForTimeout(600);
  const t3 = await vr.evaluate(() => ({ treino: window.AMB.state.treino, mesa: document.getElementById("mesaMapa").object3D.visible, clicaveis: document.querySelectorAll(".alvo-regiao.clickable").length }));
  registra(
    "E2",
    t0.treino && !t0.mesa && /TREINO 1/.test(t0.legenda) && /TREINO 2/.test(t1) && /TREINO 3/.test(t2) && !t3.treino && t3.mesa && t3.clicaveis === 5,
    `treino: sala sem dados ${!t0.mesa}; etapas ${[t0.legenda, t1, t2].map((l) => (l.match(/TREINO \d/) || ["?"])[0]).join(" -> ")}; ` +
      `concluido ${!t3.treino}; mesa de volta ${t3.mesa}; ${t3.clicaveis}/5 regioes respondem ao olhar`
  );

  // ---- exploracao ------------------------------------------------------------
  await est.click("#btnExpIni");
  await vr.evaluate(() => window.__sim.cabecaLocal(0, 1.6, 0));
  await vr.evaluate(() => window.AMB.irPara("usuario"));
  await vr.waitForTimeout(400);
  // anda ~1,2 m de verdade em volta do ponto de observacao
  for (let k = 0; k <= 12; k += 1) {
    await vr.evaluate((x) => window.__sim.cabecaLocal(x, 1.6, 0), -k * 0.1);
    await quadros(8);
    await vr.waitForTimeout(80);
  }
  await mirar('.alvo-regiao[data-regiao="nordeste"]');
  await vr.waitForTimeout(700); // amostras de olhar na regiao
  await pinca();
  await vr.waitForTimeout(900);
  const painel = await vr.evaluate(() => window.AMB.state.painelAberto);

  // "Wi-Fi cai" por 4 s: os lotes ficam na reserva e sao reenviados depois.
  await vr.route("**/api/estudo/eventos", (route) => route.abort());
  await mirar('[data-destino="contexto"]');
  await pinca();
  await vr.waitForTimeout(4000);
  const pendentesNaQueda = await vr.evaluate(() => window.Telemetry.pendentes());
  const reserva = await vr.evaluate(() => Object.keys(localStorage).filter((k) => k.startsWith("vrlab.reserva.")).length);
  await vr.unroute("**/api/estudo/eventos");

  // ---- tarefas ---------------------------------------------------------------
  const legendaT = [];
  for (const [id, resp] of [["T1", "2017"], ["T2", "Sul"], ["T3", "40 a 59"]]) {
    await est.click(`[data-iniciar="${id}"]`);
    await vr.waitForFunction((i) => /TAREFA/.test(window.__sim.legenda()) && window.__sim.legenda().indexOf(i === "T1" ? "1" : i === "T2" ? "2" : "3") >= 0, id, { timeout: 5000 }).catch(() => {});
    if (id === "T1") {
      // Uma dica passageira (como a do painel) nao pode apagar a pergunta.
      await vr.evaluate(() => setCaption("Olhe para um ano no gráfico e belisque para abrir aquele ano.", 300));
      await vr.waitForTimeout(700);
    }
    legendaT.push(await vr.evaluate(() => window.__sim.legenda()));
    await est.waitForTimeout(600);
    await est.click(`#op-${id} button:text-is("${resp}")`);
    await vr.waitForTimeout(400);
  }
  const depois = await vr.evaluate(() => window.__sim.legenda());
  registra(
    "E3",
    /TAREFA 1: Em que ano a evasão/.test(legendaT[0]) && /TAREFA 2/.test(legendaT[1]) && /TAREFA 3/.test(legendaT[2]) && !/TAREFA/.test(depois),
    `perguntas no headset: "${legendaT[0].slice(0, 42)}...", T2, T3 (a dica passageira nao apagou a T1); depois da resposta: "${depois}"`
  );
  await est.click("#btnExpFim");
  await marcarSSQ("pos", SSQ_POS);
  await vr.evaluate(() => window.Telemetry.enviarAgora());
  await vr.waitForTimeout(2500);
  const vrSessao = await vr.evaluate(() => {
    const ev = window.Telemetry.eventos;
    return { sessao: window.Telemetry.sessao, total: ev.length, ultimoT: ev[ev.length - 1].t, pendentes: window.Telemetry.pendentes() };
  });

  // ---- condicao 2D -----------------------------------------------------------
  await est.check('input[name="cond"][value="2d"]');
  const d2 = await novaPagina("2d");
  await d2.goto(`${BASE}/controle-2d.html?estudo=1&p=${P}`);
  await d2.waitForFunction(() => window.CONTROLE2D && window.CONTROLE2D.state.pronto);
  await est.waitForFunction(() => /conectada/.test(document.getElementById("vivo").textContent), null, { timeout: 8000 }).catch(() => {});
  await d2.hover('.regiao[data-regiao="sul"]');
  await d2.waitForTimeout(300);
  await d2.click('.regiao[data-regiao="sul"]');
  await d2.waitForTimeout(1200);
  await est.click('[data-iniciar="T1"]');
  await d2.waitForFunction(() => /TAREFA 1/.test(document.getElementById("legenda").textContent), null, { timeout: 5000 }).catch(() => {});
  const legenda2d = await d2.evaluate(() => document.getElementById("legenda").textContent);
  await est.waitForTimeout(500);
  await est.click('#op-T1 button:text-is("2018")');
  await d2.evaluate(() => window.Telemetry.enviarAgora());
  await d2.waitForTimeout(2500);
  registra("E4", /TAREFA 1: Em que ano/.test(legenda2d), `condicao 2D recebe a pergunta pela estacao: "${legenda2d.slice(0, 50)}..."`);

  // ---- o que ficou gravado ---------------------------------------------------
  const arquivo = path.join(PASTA, `${P}.jsonl`);
  const linhas = fs.existsSync(arquivo) ? lerJsonl(arquivo) : [];
  const daSessaoVR = linhas.filter((l) => l.sessao === vrSessao.sessao);
  const ateAgora = daSessaoVR.filter((l) => l.t <= vrSessao.ultimoT);
  const unicos = new Set(daSessaoVR.map((l) => JSON.stringify(Object.assign({}, l, { recebido: 0, reenvio: 0 }))));
  const ids = { size: unicos.size === daSessaoVR.length ? ateAgora.length : -1 };
  registra(
    "E5",
    pendentesNaQueda > 0 && reserva > 0 && ids.size === vrSessao.total,
    `queda de rede: ${pendentesNaQueda} evento(s) na reserva local; depois da volta, ${ids.size} de ${vrSessao.total} eventos do headset no .jsonl (sem perda, sem duplicata)`
  );
  const pos = daSessaoVR.find((l) => l.tipo === "pos" && l.vr);
  const versao = daSessaoVR.find((l) => l.tipo === "versao");
  registra(
    "E6",
    pos && ["x", "z", "guinada", "inclinacao", "fps", "alvo"].every((k) => k in pos) && versao && versao.artefato && versao.ua,
    `pos traz posicao + guinada/inclinacao + fps + alvo do olhar; versao = ${versao ? versao.artefato : "?"} (${versao && versao.ua ? "userAgent ok" : "sem userAgent"})`
  );

  const res = analisar(linhas);
  const rv = res.find((r) => r.condicao === "webxr") || {};
  const r2 = res.find((r) => r.condicao === "2d") || {};
  const esperadoPre = pontuarSSQ(SSQ_PRE).TS;
  const esperadoPos = pontuarSSQ(SSQ_POS).TS;
  registra(
    "E7",
    rv.triagem && rv.ssq_pre_total === esperadoPre && rv.ssq_pos_total === esperadoPos && rv.treino_concluido && rv.treino_passo_s != null && rv.exploracao_s > 0,
    `protocolo: triagem ${rv.triagem}; SSQ ${rv.ssq_pre_total} -> ${rv.ssq_pos_total} (delta ${rv.ssq_delta_total}); treino ${rv.treino_concluido ? "concluido" : "NAO"} em ${rv.treino_s} s; exploracao ${rv.exploracao_s} s`
  );
  registra(
    "E8",
    rv.T1_correta && rv.T1_estrita && rv.T2_correta && rv.T3_correta === false && rv.acertos === 2 && rv.T1_tempo_s > 0 && r2.T1_correta === true && r2.T1_estrita === false,
    `tarefas imersiva: ${rv.acertos}/3 (T3 errada de proposito), tempos ${rv.T1_tempo_s}/${rv.T2_tempo_s}/${rv.T3_tempo_s} s; 2D: T1 "2018" conta pela tolerancia de 1 bloco (estrita: ${r2.T1_estrita})`
  );
  registra(
    "E9",
    painel && rv.metros_a_pe >= 0.8 && rv.teleportes >= 1 && rv.metros_teleporte > 0.5 && rv.tempo_zona_mesa_s > 0 && rv.olhar_regiao_s > 0 && rv.fps_mediana > 0,
    `movimento: ${rv.metros_a_pe} m a pe, ${rv.teleportes} teleporte(s) (${rv.metros_teleporte} m), proporcao a pe ${rv.proporcao_a_pe}; ` +
      `zona mesa ${rv.tempo_zona_mesa_s} s / contexto ${rv.tempo_zona_contexto_s} s; olhar em regiao ${rv.olhar_regiao_s} s; fps mediana ${rv.fps_mediana}`
  );
  registra("E10", r2.tempo_secao_mesa_s > 0 && r2.paineis_abertos >= 1, `2D: ${r2.tempo_secao_mesa_s} s na mesa, ${r2.tempo_secao_painel_s} s no painel, ${r2.paineis_abertos} painel(is) aberto(s)`);

  const relevantes = erros.filter((m) => !/WebGL|GPU|swiftshader|favicon|ERR_FAILED|ERR_BLOCKED|ERR_ABORTED|Failed to load resource|api\/estudo\/eventos/i.test(m));
  registra("E11", relevantes.length === 0, relevantes.length ? `${relevantes.length} erro(s): ${relevantes.slice(0, 4).join(" | ")}` : "console limpo nas tres paginas");

  await browser.close();
  server.close();

  console.log(`\nEnsaio do estudo (estacao + Quest 2 emulado + 2D) - dados em ${PASTA}\n`);
  resultados.forEach((r) => console.log(`  ${r.passou ? "✓" : "✗"} ${r.id.padEnd(4)} ${r.msg}`));
  const falhas = resultados.filter((r) => !r.passou);
  console.log("");
  if (falhas.length) {
    console.log(`FALHOU: ${falhas.length} de ${resultados.length}.`);
    process.exit(1);
  }
  console.log("ensaio do estudo: tudo verde.");
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
