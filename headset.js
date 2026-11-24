// ----------------------------------------------------------------------------
// headset.js - o que so existe dentro do Meta Quest 3 (e Quest 2).
//
// Carregado ANTES do app.js (o A-Frame so inicializa a cena com o documento
// "complete", entao da tempo de ajustar o renderer e registrar componentes).
//   - perfil do renderer pela URL, para comparar no headset sem editar codigo
//     (padrao Meta Quest 3: 90 Hz e foveacao 0; fallback Quest 2: ?hz=72&fov=0.5;
//      tambem aceita ?aa=0 ?fov=0..1 ?fps=1);
//   - `sobrepor`: reticulo, legenda e HUD de VR desenhados por cima do mundo;
//   - `reticulo-olhar`: o anel do olhar vai ate o ponto mirado (sem visao
//     dupla), cresce sobre o que da para selecionar e enche durante o fuse;
//   - `maos-locais`: o modelo das maos sai de assets/maos/ (offline);
//   - `controles-locais`: o modelo dos controles Touch Plus sai de assets/controles/ (offline);
//   - `medidor-fps`: fps real do headset e draw calls, so com ?fps=1;
//   - aviso quando a pagina foi aberta por HTTP na rede (sem WebXR).
// ----------------------------------------------------------------------------

const PERFIL_HEADSET = { hz: 90, aa: true, fov: 0, fps: false };

(function perfilDoHeadset() {
  const scene = document.querySelector("a-scene");
  if (!scene) return;
  const p = new URLSearchParams(window.location.search);

  // O atributo ainda e texto puro (a cena nao inicializou): da para reescrever.
  const atual = {};
  String(scene.getAttribute("renderer") || "")
    .split(";")
    .map((par) => par.split(":"))
    .filter((kv) => kv.length === 2 && kv[0].trim())
    .forEach(([k, v]) => (atual[k.trim()] = v.trim()));

  const hzParam = p.get("hz");
  if (hzParam === "90" || hzParam === "120") atual.highRefreshRate = "true";
  else if (hzParam === "72") atual.highRefreshRate = "false";
  if (p.get("aa") === "0") atual.antialias = "false";
  else if (p.get("aa") === "1") atual.antialias = "true";
  const fov = parseFloat(p.get("fov"));
  if (!Number.isNaN(fov)) atual.foveationLevel = String(Math.max(0, Math.min(1, fov)));

  scene.setAttribute(
    "renderer",
    Object.entries(atual)
      .map(([k, v]) => `${k}: ${v}`)
      .join("; ")
  );

  PERFIL_HEADSET.hz = hzParam === "120" ? 120 : atual.highRefreshRate === "true" ? 90 : 72;
  PERFIL_HEADSET.aa = atual.antialias !== "false";
  PERFIL_HEADSET.fov = Number.isNaN(Number(atual.foveationLevel)) ? 0 : Number(atual.foveationLevel);
  PERFIL_HEADSET.fps = p.get("fps") === "1";

  if (PERFIL_HEADSET.fps) {
    const t = document.getElementById("fpsTexto");
    if (t) t.setAttribute("medidor-fps", "");
  }
})();

// Sem contexto seguro o navegador nem expoe navigator.xr; o A-Frame nao avisa e
// o botao "Enter VR" so abre uma tela cheia 2D.
document.addEventListener("DOMContentLoaded", () => {
  const local = ["localhost", "127.0.0.1", "[::1]", "::1"].includes(window.location.hostname);
  const aviso = document.getElementById("avisoHttps");
  if (aviso && window.isSecureContext === false && !local) {
    aviso.hidden = false;
    console.warn("[headset] pagina aberta por HTTP fora do localhost: o WebXR fica indisponivel. Use node server.js --quest.");
  }
});

if (window.AFRAME) {
  // -------------------------------------------------------------------------
  // Texto MSDF sem "pontinhos" (mesma correcao da versao minimalista). O shader
  // msdf do A-Frame 1.5 faz
  //   alpha = sigDist / fwidth(sigDist)
  // e, onde o campo de distancia e plano (miolo do "O", cantos de cada letra),
  // fwidth da 0: a divisao por zero e indefinida no GLSL ES e virava pontos e
  // blocos claros em volta das letras (visivel nos prints em 1920x1080). Um piso
  // minusculo no fwidth nao muda nada onde ele e > 0 e elimina o caso indefinido.
  // Precisa rodar antes de a cena criar os materiais (headset.js vem antes).
  // -------------------------------------------------------------------------
  const msdf = AFRAME.shaders && AFRAME.shaders.msdf && AFRAME.shaders.msdf.Shader;
  if (msdf && typeof msdf.prototype.fragmentShader === "string") {
    msdf.prototype.fragmentShader = msdf.prototype.fragmentShader.replace(
      "sigDist / fwidth(sigDist)",
      "sigDist / max(fwidth(sigDist), 0.00001)"
    );
  }

  // -------------------------------------------------------------------------
  // sobrepor: desenha a entidade (e filhos) por cima do mundo.
  // -------------------------------------------------------------------------
  AFRAME.registerComponent("sobrepor", {
    schema: { ordem: { default: 20 } },
    init() {
      this.aplicar = this.aplicar.bind(this);
      this.el.addEventListener("object3dset", this.aplicar);
    },
    update() {
      this.aplicar();
    },
    remove() {
      this.el.removeEventListener("object3dset", this.aplicar);
    },
    aplicar() {
      const ordem = this.data.ordem;
      this.el.object3D.traverse((o) => {
        o.renderOrder = ordem;
        if (!o.material) return;
        (Array.isArray(o.material) ? o.material : [o.material]).forEach((m) => {
          m.depthTest = false;
          m.depthWrite = false;
          m.transparent = true;
        });
      });
    },
  });

  // -------------------------------------------------------------------------
  // reticulo-olhar: fica na entidade do cursor de olhar (#gazeCursor) e cuida
  // do anel filho (#gazeRing).
  //   - profundidade: o anel vai ate o ponto mirado, com o mesmo tamanho
  //     angular. Preso a 1 m, com o alvo a 4 m, um dos dois saia duplo;
  //   - estado: maior/ambar sobre o que da para selecionar;
  //   - fuse: enquanto o olhar "segura" um alvo (modo sem maos nem controles),
  //     o anel cresce ate 1,75x no tempo do fuseTimeout - o retorno que a
  //     animacao do <a-cursor> antigo dava.
  // O raio do raycaster sai do olho (origin 0 0 1 desfaz o -1 da entidade).
  // -------------------------------------------------------------------------
  AFRAME.registerComponent("reticulo-olhar", {
    schema: {
      corNeutra: { type: "color", default: "#ffffff" },
      corAcao: { type: "color", default: "#ffd166" },
      semAlvo: { default: 2.5 },
    },
    init() {
      this.anel = this.el.querySelector("a-ring");
      this.estado = null;
      this.fuseDesde = 0;
      this.el.addEventListener("fusing", () => (this.fuseDesde = performance.now()));
      ["mouseleave", "click", "raycaster-intersection-cleared"].forEach((ev) => this.el.addEventListener(ev, () => (this.fuseDesde = 0)));
    },
    tick() {
      const anel = this.anel;
      if (!anel || !anel.object3D) return;
      const rc = this.el.components.raycaster;
      const ligado = this.el.sceneEl.is("vr-mode") && !!rc && rc.data.enabled;
      anel.object3D.visible = ligado;
      if (!ligado) return;

      const hit = rc.intersections && rc.intersections[0];
      const d = Math.max(0.25, Math.min(30, hit ? hit.distance : this.data.semAlvo)) * 0.97;
      anel.object3D.position.set(0, 0, 1 - d);

      const acao = !!hit;
      let k = d * (acao ? 1.35 : 1);
      if (this.fuseDesde) {
        const cur = this.el.getAttribute("cursor");
        const t = Math.min(1, (performance.now() - this.fuseDesde) / ((cur && cur.fuseTimeout) || 850));
        k *= 1 + 0.75 * t * t * t;
      }
      anel.object3D.scale.set(k, k, k);

      if (acao !== this.estado) {
        this.estado = acao;
        const malha = anel.getObject3D("mesh");
        if (malha && malha.material) malha.material.color.set(acao ? this.data.corAcao : this.data.corNeutra);
      }
    },
  });

  // -------------------------------------------------------------------------
  // maos-locais: modelo da mao servido pelo projeto (assets/maos/). O
  // hand-tracking-controls do A-Frame 1.5 busca em cdn.aframe.io; sem internet
  // a mao ficaria invisivel. O "generic-hand" do WebXR Input Profiles (MIT)
  // tem os ossos com os nomes das juntas do WebXR, que o A-Frame anima.
  // -------------------------------------------------------------------------
  AFRAME.registerComponent("maos-locais", {
    dependencies: ["hand-tracking-controls"],
    init() {
      const c = this.el.components["hand-tracking-controls"];
      if (!c) return;
      c.initMeshHandModel = function () {
        this.el.setAttribute("gltf-model", `assets/maos/${this.data.hand}.glb`);
      };
    },
    // Quando a pessoa pega os controles, a mao deixa de ser rastreada, mas o
    // hand-tracking-controls do A-Frame 1.5 para de atualizar sem esconder o
    // modelo: a mao ficava congelada no ar, onde foi vista pela ultima vez.
    tick() {
      const c = this.el.components["hand-tracking-controls"];
      const tc = this.el.components["tracked-controls"];
      const rastreada = !!(c && c.hasPoses && tc && tc.controller && tc.controller.hand);
      if (this.el.object3D.visible !== rastreada) this.el.object3D.visible = rastreada;
    },
  });

  // -------------------------------------------------------------------------
  // controles-locais: intercepta o oculus-touch-controls (criado pelo
  // laser-controls) para servir o modelo Meta Quest 3 Touch Plus a partir de
  // assets/controles/ sem requisicao a cdn.aframe.io (100% offline).
  // -------------------------------------------------------------------------
  AFRAME.registerComponent("controles-locais", {
    dependencies: ["laser-controls"],
    init() {
      this.aplicar = this.aplicar.bind(this);
      this.aplicar();
      this.el.addEventListener("componentinitialized", (e) => {
        if (e.detail && e.detail.name === "oculus-touch-controls") this.aplicar();
      });
    },
    aplicar() {
      const c = this.el.components["oculus-touch-controls"];
      if (!c || c.__vrlabLocal) return;
      c.__vrlabLocal = true;
      const orig = c.loadModel;
      c.loadModel = function (controller) {
        const lado = this.data && this.data.hand === "left" ? "left" : "right";
        const localUrl = `assets/controles/quest-touch-plus-${lado}.glb`;
        const origSetAttr = this.el.setAttribute;
        this.el.setAttribute = function (attr, val) {
          if (attr === "gltf-model" && typeof val === "string" && /^https?:\/\//i.test(val)) {
            return origSetAttr.call(this, attr, localUrl);
          }
          return origSetAttr.apply(this, arguments);
        };
        try {
          orig.call(this, controller);
          this.isTouchV3orPROorPlus = true;
        } finally {
          this.el.setAttribute = origSetAttr;
        }
      };
    },
  });

  // -------------------------------------------------------------------------
  // medidor-fps (?fps=1): quadros por segundo do PROPRIO headset e draw calls
  // do ultimo quadro (os dois olhos). Verde no alvo, ambar abaixo dele.
  // -------------------------------------------------------------------------
  AFRAME.registerComponent("medidor-fps", {
    init() {
      this.n = 0;
      this.t0 = 0;
      this.el.setAttribute("visible", true);
    },
    tick(t) {
      if (!this.t0) {
        this.t0 = t;
        return;
      }
      this.n += 1;
      const dt = t - this.t0;
      if (dt < 500) return;
      const scene = this.el.sceneEl;
      const fps = Math.round((this.n * 1000) / dt);
      const alvo = (scene.xrSession && scene.xrSession.frameRate) || (scene.is("vr-mode") ? PERFIL_HEADSET.hz : 60);
      const calls = scene.renderer.info.render.calls;
      this.el.setAttribute("value", `${fps}/${Math.round(alvo)} fps\n${calls} draw calls`);
      this.el.setAttribute("color", fps >= alvo - 3 ? "#9dffb0" : "#ffb35c");
      this.n = 0;
      this.t0 = t;
    },
  });
}
