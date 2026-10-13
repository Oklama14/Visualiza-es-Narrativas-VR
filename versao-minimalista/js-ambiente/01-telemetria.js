// ----------------------------------------------------------------------------
// Telemetria de sessao (instrumento do estudo com usuarios).
//
// Ligada apenas com ?estudo=1 (ou ?telemetria=1) na URL. Sem parametro, o
// tlog() global vira no-op e nada e coletado (LGPD: coleta so em sessao de
// estudo, com id anonimo definido pelo pesquisador em ?p=P01).
//
// Para onde vao os dados: para o NOTEBOOK do pesquisador, nunca para a
// internet. A cada 2 s o lote novo vai por POST para o server.js que serviu a
// pagina (api/estudo/eventos), que grava uma linha por evento em
// dados-estudo/<participante>.jsonl. Enquanto o servidor nao confirma, o lote
// fica numa reserva no localStorage do proprio aparelho: se a pagina cair ou o
// Wi-Fi piscar, ele e reenviado no proximo carregamento. O botao "Exportar
// sessao" (download do JSON completo) continua existindo como terceira via.
//
// Mesma biblioteca nas duas condicoes: o <script> da condicao 2D declara
// data-condicao="2d"; sem o atributo, a condicao e "webxr".
//
// O que e registrado, alem dos eventos de interacao de cada modulo (tlog):
//   versao   artefato, ?v= dos scripts, navegador/sistema (userAgent), A-Frame
//   pos      (imersiva, 2 Hz) posicao da cabeca, guinada/inclinacao em graus,
//            se esta em VR, quadros por segundo e o alvo sob o olhar
//   rolagem  (2D, 2 Hz) posicao da rolagem e a secao mais visivel
//   xr       taxa de quadros da sessao imersiva
//   entrada  fontes de entrada ativas (maos / controles) a cada troca
// ----------------------------------------------------------------------------

(function () {
  const params = new URLSearchParams(window.location.search);
  const ligada = params.get("estudo") === "1" || params.get("telemetria") === "1";
  const ID_OK = /^[A-Za-z0-9_-]{1,32}$/;
  const pBruto = params.get("p");
  const participante = pBruto && ID_OK.test(pBruto) ? pBruto : null;

  const script = typeof document !== "undefined" ? document.currentScript : null;
  const condicao = (script && script.dataset && script.dataset.condicao) || "webxr";
  const versaoScripts = script && script.src ? (String(script.src).match(/[?&]v=([^&#]+)/) || [])[1] || null : null;

  // Versao do artefato que vai junto de CADA sessao. Suba quando o artefato
  // mudar (piloto-v0 -> estudo-v1): a analise separa as sessoes por ela.
  const VERSAO_ARTEFATO = "piloto-v0";

  const sessao = novaSessao();
  const eventos = []; // tudo o que foi coletado (para o download)
  let pendentes = []; // ainda nao confirmado pelo servidor
  const t0 = performance.now();
  const agora = () => Math.round(performance.now() - t0);

  const ENDPOINT = "api/estudo/eventos";
  const RESERVA = "vrlab.reserva.";
  const status = { servidor: "aguardando", enviados: 0, falhas: 0, ultimoOk: null, comandos: null };

  function novaSessao() {
    try {
      if (window.crypto && crypto.randomUUID) return crypto.randomUUID().slice(0, 8);
    } catch (e) {
      /* contexto sem crypto */
    }
    return Math.random().toString(36).slice(2, 10);
  }

  // tlog(tipo, dados): registro de evento. Global e sempre presente (no-op se
  // a telemetria estiver desligada) para os hooks nao precisarem de guarda.
  // t = ms desde o carregamento da pagina; ts = relogio do aparelho (epoch).
  window.tlog = function (tipo, dados) {
    if (!ligada) return;
    const ev = Object.assign({ t: agora(), ts: Date.now(), tipo }, dados || {});
    eventos.push(ev);
    pendentes.push(ev);
    agendarReserva();
  };

  // ---- reserva local (sobrevive a recarga / queda do Wi-Fi) ----------------
  let reservaTimer = null;
  function agendarReserva() {
    if (reservaTimer) return;
    reservaTimer = setTimeout(() => {
      reservaTimer = null;
      gravarReserva();
    }, 1500);
  }

  function gravarReserva() {
    try {
      const chave = RESERVA + sessao;
      if (!pendentes.length) window.localStorage.removeItem(chave);
      else window.localStorage.setItem(chave, JSON.stringify({ participante, sessao, condicao, eventos: pendentes }));
    } catch (e) {
      /* modo privado / cota cheia: o envio ao servidor e o download continuam */
    }
  }

  // ---- envio ao servidor do notebook ---------------------------------------
  let enviando = false;
  let espera = 0; // backoff depois de falha (ms)
  let proximaTentativa = 0;

  function postar(corpo, keepalive) {
    if (typeof fetch !== "function") return Promise.reject(new Error("sem fetch"));
    return fetch(ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(corpo),
      keepalive: !!keepalive,
      cache: "no-store",
    }).then((r) => {
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return r.json();
    });
  }

  function enviar(urgente) {
    if (!ligada || enviando || !pendentes.length) return;
    if (!urgente && Date.now() < proximaTentativa) return;
    // keepalive (saida da pagina) aceita no maximo 64 KB por requisicao.
    const lote = pendentes.slice(0, urgente ? 150 : 600);
    enviando = true;
    postar({ participante, sessao, condicao, origem: "participante", eventos: lote }, urgente)
      .then(() => {
        pendentes = pendentes.slice(lote.length);
        status.servidor = "ok";
        status.enviados += lote.length;
        status.ultimoOk = Date.now();
        espera = 0;
        gravarReserva();
      })
      .catch(() => {
        status.servidor = "sem-servidor";
        status.falhas += 1;
        espera = Math.min(15000, (espera || 1000) * 2);
        proximaTentativa = Date.now() + espera;
      })
      .then(() => {
        enviando = false;
      });
  }

  // Lotes que ficaram para tras numa sessao anterior (pagina fechada antes de
  // o servidor confirmar): reenvia uma vez e apaga a reserva se der certo.
  function reenviarSobras() {
    let chaves = [];
    try {
      const ls = window.localStorage;
      for (let i = 0; i < ls.length; i += 1) {
        const k = ls.key(i);
        if (k && k.indexOf(RESERVA) === 0 && k !== RESERVA + sessao) chaves.push(k);
      }
    } catch (e) {
      chaves = [];
    }
    chaves.forEach((k) => {
      let corpo = null;
      try {
        corpo = JSON.parse(window.localStorage.getItem(k));
      } catch (e) {
        corpo = null;
      }
      if (!corpo || !Array.isArray(corpo.eventos) || !corpo.eventos.length) return;
      corpo.origem = "participante";
      corpo.reenvio = true;
      postar(corpo, false)
        .then(() => {
          try { window.localStorage.removeItem(k); } catch (e) { /* ignora */ }
        })
        .catch(() => { /* fica para a proxima */ });
    });
  }

  function exportar() {
    const corpo = {
      app: "vrlab-versao-minimalista",
      versao: VERSAO_ARTEFATO,
      condicao,
      participante,
      sessao,
      exportadoEm: new Date().toISOString(),
      duracaoMs: agora(),
      eventos,
    };
    const blob = new Blob([JSON.stringify(corpo)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `vrlab-${condicao}-${participante || "sem-id"}-${sessao}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  }

  window.Telemetry = {
    ligada,
    participante,
    sessao,
    condicao,
    versao: VERSAO_ARTEFATO,
    exportar,
    eventos,
    status,
    enviarAgora: () => enviar(true),
    pendentes: () => pendentes.length,
    // Comandos da estacao do pesquisador (pesquisador.html), via SSE:
    // Telemetry.aoComando((c) => ...) recebe { tipo, id?, texto?, ... }.
    aoComando: (fn) => ouvintes.push(fn),
  };

  // ---- canal de comandos (estacao do pesquisador -> esta pagina) -----------
  // O pesquisador comanda pelo notebook (iniciar tarefa, treino, mensagem). No
  // Quest sem cabo nao ha como clicar num painel da pagina: o comando chega
  // por Server-Sent Events do mesmo server.js. O EventSource reconecta sozinho
  // se o Wi-Fi piscar.
  const ouvintes = [];
  let estadoConexao = null;
  function conectarComandos() {
    if (typeof EventSource === "undefined" || !participante) return;
    const url = `api/estudo/comandos?p=${encodeURIComponent(participante)}&sessao=${sessao}&condicao=${condicao}`;
    const fonte = new EventSource(url);
    const marca = (e) => {
      status.comandos = e;
      if (estadoConexao === e) return;
      estadoConexao = e;
      window.tlog("conexao", { estado: e });
    };
    fonte.onopen = () => marca("aberta");
    fonte.onerror = () => marca("caiu");
    fonte.onmessage = (m) => {
      let c = null;
      try {
        c = JSON.parse(m.data);
      } catch (e) {
        return;
      }
      if (!c || !c.tipo) return;
      window.tlog("comando", { comando: c.tipo, id: c.id || null, cid: c.cid || null });
      ouvintes.forEach((fn) => {
        try {
          fn(c);
        } catch (err) {
          console.error("[telemetria] comando", c.tipo, err);
        }
      });
    };
  }

  // ---- quadros por segundo (imersiva) --------------------------------------
  // O requestAnimationFrame da janela para durante a sessao XR; o tick do
  // A-Frame roda no laco da propria sessao, entao e ele que conta os quadros.
  const contador = { n: 0, desde: performance.now() };
  if (window.AFRAME && !AFRAME.components["telemetria-quadros"]) {
    AFRAME.registerComponent("telemetria-quadros", {
      tick() {
        contador.n += 1;
      },
    });
  }
  function fpsDesdeUltimaAmostra() {
    const t = performance.now();
    const dt = t - contador.desde;
    const fps = dt > 0 ? Math.round((contador.n * 1000) / dt) : null;
    contador.n = 0;
    contador.desde = t;
    return fps;
  }

  // Secao mais visivel da pagina 2D (elementos com data-secao).
  function secaoVisivel() {
    let melhor = null;
    let area = 0;
    document.querySelectorAll("[data-secao]").forEach((el) => {
      const r = el.getBoundingClientRect();
      const vis = Math.max(0, Math.min(r.bottom, window.innerHeight) - Math.max(r.top, 0));
      if (vis > area) {
        area = vis;
        melhor = el.dataset.secao;
      }
    });
    return melhor;
  }

  function amostrar() {
    const cam = document.getElementById("camera");
    if (cam && cam.object3D && window.AFRAME) {
      const THREE = AFRAME.THREE;
      const p = new THREE.Vector3();
      const q = new THREE.Quaternion();
      cam.object3D.getWorldPosition(p);
      cam.object3D.getWorldQuaternion(q);
      const e = new THREE.Euler().setFromQuaternion(q, "YXZ");
      const scene = document.querySelector("a-scene");
      const g = (rad) => Math.round((rad * 1800) / Math.PI) / 10;
      let alvo = null;
      try {
        // hoverEl / descreverAlvo moram em 50-interacao.js (escopo global).
        // eslint-disable-next-line no-undef
        if (typeof hoverEl !== "undefined" && typeof descreverAlvo === "function") alvo = descreverAlvo(hoverEl);
      } catch (err) {
        alvo = null;
      }
      window.tlog("pos", {
        x: +p.x.toFixed(2),
        y: +p.y.toFixed(2),
        z: +p.z.toFixed(2),
        guinada: g(e.y),
        inclinacao: g(e.x),
        vr: !!(scene && scene.is && scene.is("vr-mode")),
        fps: fpsDesdeUltimaAmostra(),
        alvo,
      });
      return;
    }
    // Condicao 2D: a "posicao" e onde a pagina esta rolada.
    const doc = document.documentElement;
    window.tlog("rolagem", {
      y: Math.round(window.scrollY || doc.scrollTop || 0),
      h: window.innerHeight,
      H: doc.scrollHeight,
      secao: secaoVisivel(),
    });
  }

  // Sobras de sessoes anteriores neste aparelho (mesmo fora do modo estudo:
  // o headset pode ter sido recarregado sem o ?estudo=1).
  if (typeof document !== "undefined" && document.addEventListener) {
    document.addEventListener("DOMContentLoaded", () => setTimeout(reenviarSobras, 1500));
  }

  if (!ligada) return;

  document.addEventListener("DOMContentLoaded", () => {
    const nav = typeof navigator !== "undefined" ? navigator : {};
    window.tlog("versao", {
      artefato: VERSAO_ARTEFATO,
      scripts: versaoScripts,
      condicao,
      ua: nav.userAgent || null,
      idioma: nav.language || null,
      aframe: window.AFRAME ? AFRAME.version : null,
      url: window.location.search,
      tela: window.screen ? `${screen.width}x${screen.height}` : null,
      janela: `${window.innerWidth}x${window.innerHeight}`,
      dpr: window.devicePixelRatio || 1,
    });

    const scene = document.querySelector("a-scene");
    if (scene) {
      scene.setAttribute("telemetria-quadros", "");
      const descreverFontes = (s) =>
        Array.from((s && s.inputSources) || []).map((f) => ({ lado: f.handedness, tipo: f.hand ? "mao" : "controle" }));
      let sessaoXR = null;
      const aoTrocar = () => window.tlog("entrada", { fontes: descreverFontes(sessaoXR) });
      scene.addEventListener("enter-vr", () => {
        sessaoXR = scene.xrSession || null;
        if (!sessaoXR) return;
        window.tlog("xr", { frameRate: sessaoXR.frameRate || null, blend: sessaoXR.environmentBlendMode || null });
        aoTrocar();
        sessaoXR.addEventListener("inputsourceschange", aoTrocar);
      });
      scene.addEventListener("exit-vr", () => {
        if (sessaoXR) sessaoXR.removeEventListener("inputsourceschange", aoTrocar);
        sessaoXR = null;
      });
    }

    conectarComandos();

    // Botao discreto de exportacao + estado do envio (so no monitor).
    const btn = document.createElement("button");
    btn.id = "telemetryExport";
    btn.type = "button";
    btn.style.cssText =
      "position:fixed;right:14px;bottom:14px;z-index:30;padding:8px 12px;" +
      "background:rgba(8,13,24,.85);color:#cfe9ff;border:1px solid rgba(255,255,255,.22);" +
      "border-radius:8px;cursor:pointer;pointer-events:auto;font:600 12px Inter,ui-sans-serif,sans-serif";
    const rotular = () => {
      const s = status.servidor === "ok" ? "notebook OK" : status.servidor === "sem-servidor" ? "SEM notebook - guardando aqui" : "conectando";
      btn.textContent = `Exportar sessão · ${s}`;
    };
    rotular();
    btn.addEventListener("click", exportar);
    document.body.appendChild(btn);
    setInterval(rotular, 2000);
  });

  setInterval(amostrar, 500);
  setInterval(() => enviar(false), 2000);
  window.addEventListener("pagehide", () => {
    gravarReserva();
    enviar(true);
  });
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") {
      gravarReserva();
      enviar(true);
    }
  });
})();
