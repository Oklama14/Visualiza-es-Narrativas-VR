// ----------------------------------------------------------------------------
// HEADSET: o que so existe dentro do Quest 2.
//
// Tudo aqui foi achado na simulacao do Quest 2 (tests/quest-sim.js), que o
// smoke do desktop nao alcanca:
//   - perfil do renderer ajustavel pela URL, para comparar no headset sem
//     editar codigo (?hz=90 ?aa=0 ?fov=0..1 ?fps=1);
//   - texto MSDF sem os pontinhos em volta das letras (divisao por zero no
//     shader do A-Frame);
//   - `sobrepor`: legenda, reticulo e medidor desenhados por cima do mundo
//     (presos a camera a 1 m, sumiam dentro da mesa quando a pessoa chegava
//     perto dela);
//   - `reticulo-olhar`: o anel do olhar vai ate o ponto mirado e cresce sobre
//     o que da para confirmar (pinca/gatilho tem retorno antes de acontecer);
//   - `maos-locais`: o modelo das maos sai de assets/maos/ (offline);
//   - `medidor-fps`: fps real do headset e draw calls, so com ?fps=1;
//   - aviso quando a pagina foi aberta por HTTP na rede (sem WebXR).
// ----------------------------------------------------------------------------

const PERFIL_HEADSET = { hz: 72, aa: true, fov: 0.5, fps: false };

(function perfilDoHeadset() {
  if (typeof document === "undefined" || typeof document.querySelector !== "function") return;
  const scene = document.querySelector("a-scene");
  if (!scene) return;
  const p = new URLSearchParams(window.location.search);

  // O A-Frame so inicializa a cena com o documento "complete"; este script
  // roda antes disso, entao o atributo ainda e texto puro e pode ser reescrito.
  const atual = {};
  String(scene.getAttribute("renderer") || "")
    .split(";")
    .map((par) => par.split(":"))
    .filter((kv) => kv.length === 2 && kv[0].trim())
    .forEach(([k, v]) => (atual[k.trim()] = v.trim()));

  if (p.get("hz") === "90") atual.highRefreshRate = "true";
  else if (p.get("hz") === "72") atual.highRefreshRate = "false";
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

  PERFIL_HEADSET.hz = atual.highRefreshRate === "true" ? 90 : 72;
  PERFIL_HEADSET.aa = atual.antialias !== "false";
  PERFIL_HEADSET.fov = Number(atual.foveationLevel);
  PERFIL_HEADSET.fps = p.get("fps") === "1";

  if (PERFIL_HEADSET.fps) {
    const t = document.getElementById("fpsTexto");
    if (t) t.setAttribute("medidor-fps", "");
  }
  if (typeof tlog === "function") tlog("perfil", Object.assign({}, PERFIL_HEADSET));
})();

// Sem contexto seguro o navegador nem expoe navigator.xr. O A-Frame nao avisa:
// o botao "Enter VR" so abre uma tela cheia 2D. Aqui o aviso fica explicito.
if (typeof document !== "undefined" && typeof window !== "undefined") {
  document.addEventListener("DOMContentLoaded", () => {
    const local = ["localhost", "127.0.0.1", "[::1]", "::1"].includes(window.location.hostname);
    const aviso = document.getElementById("avisoHttps");
    if (aviso && window.isSecureContext === false && !local) {
      aviso.hidden = false;
      console.warn("[headset] pagina aberta por HTTP fora do localhost: o WebXR fica indisponivel. Use node server.js --quest.");
    }
  });
}

if (typeof AFRAME !== "undefined") {
  // -------------------------------------------------------------------------
  // Texto MSDF sem "pontinhos". O shader msdf do A-Frame 1.5 faz
  //   alpha = sigDist / fwidth(sigDist)
  // e, onde o campo de distancia e plano (miolo do "a"/"g", borda de cada
  // letra), fwidth da 0: a divisao por zero e indefinida no GLSL ES e, na
  // simulacao, virava blocos e pontos em volta de toda letra - exatamente onde
  // o texto pequeno do headset ja e mais fragil. Um piso minusculo no fwidth
  // nao muda nada onde ele e > 0 e elimina o caso indefinido.
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
  // reticulo-olhar: o anel acompanha a profundidade do que esta sendo mirado.
  // Preso a 1 m, ele ficava "dentro" da mesa quando o alvo estava mais perto
  // (visao dupla, ou sumia de vez). Aqui ele vai ate o alvo, mantem o mesmo
  // tamanho angular e cresce/fica ambar sobre o que a pinca pode confirmar.
  // -------------------------------------------------------------------------
  const ACIONAVEL = (el) =>
    !!(el && el.dataset && (el.dataset.regiao || el.dataset.indicador || el.dataset.ano != null || el.dataset.destino || el.dataset.acao));

  AFRAME.registerComponent("reticulo-olhar", {
    schema: {
      corNeutra: { type: "color", default: "#ffffff" },
      corAcao: { type: "color", default: "#ffd166" },
      semAlvo: { default: 2.0 }, // distancia quando nada e mirado (m)
    },
    init() {
      this.anel = this.el.querySelector("a-ring");
      this.estado = null;
    },
    tick() {
      const anel = this.anel;
      if (!anel || !anel.object3D) return;
      const rc = this.el.components.raycaster;
      const ligado = this.el.sceneEl.is("vr-mode") && !!rc && rc.data.enabled;
      anel.object3D.visible = ligado;
      if (!ligado) return;

      const hit = rc.intersections && rc.intersections[0];
      const d = Math.max(0.25, Math.min(8, hit ? hit.distance : this.data.semAlvo)) * 0.97;
      // A entidade do cursor esta a 1 m a frente do olho; o raio sai do olho.
      anel.object3D.position.set(0, 0, 1 - d);

      const acao = !!hit && ACIONAVEL(hit.object.el);
      const k = d * (acao ? 1.45 : 1);
      anel.object3D.scale.set(k, k, k);

      if (acao !== this.estado) {
        this.estado = acao;
        const malha = anel.getObject3D("mesh");
        if (malha && malha.material) malha.material.color.set(acao ? this.data.corAcao : this.data.corNeutra);
      }
    },
  });

  // -------------------------------------------------------------------------
  // maos-locais: modelo de mao servido pelo proprio projeto.
  // O hand-tracking-controls do A-Frame 1.5 busca o modelo em cdn.aframe.io na
  // hora em que a mao aparece; sem internet a pinca funciona, mas a mao fica
  // invisivel - e a pessoa nao sabe se esta sendo vista. O modelo em
  // assets/maos/ e o "generic-hand" do WebXR Input Profiles (MIT), com os
  // ossos nomeados pelas juntas do WebXR, o que o A-Frame ja sabe animar.
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
      // Telemetria: cada vez que a mao entra ou sai do rastreamento dentro do
      // headset. Perda de rastreio so existe na condicao imersiva - e um
      // confundidor (e causa de frustracao) que a analise precisa enxergar.
      if (this.rastreada !== rastreada) {
        if (this.rastreada !== undefined && this.el.sceneEl.is("vr-mode") && typeof tlog === "function") {
          tlog("rastreio", { mao: c ? c.data.hand : null, estado: rastreada ? "ok" : "perdido" });
        }
        this.rastreada = rastreada;
      }
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

if (typeof module !== "undefined" && module.exports) {
  module.exports = { PERFIL_HEADSET };
}
