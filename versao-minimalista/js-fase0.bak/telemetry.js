// ----------------------------------------------------------------------------
// Fase 0.4 - Telemetria de sessao (instrumento do estudo com usuarios).
// Ligada apenas com ?estudo=1 (ou ?telemetria=1) na URL. Sem parametro, o
// tlog() global vira no-op e nada e coletado (LGPD: coleta so em sessao de
// estudo, dados anonimos, exportados localmente pelo pesquisador).
// ----------------------------------------------------------------------------

(function () {
  const params = new URLSearchParams(window.location.search);
  const ligada = params.get("estudo") === "1" || params.get("telemetria") === "1";
  const eventos = [];
  const t0 = performance.now();

  const agora = () => Math.round(performance.now() - t0);

  // tlog(tipo, dados): registro de evento. Global e sempre presente (no-op se
  // a telemetria estiver desligada) para os hooks nao precisarem de guarda.
  window.tlog = function (tipo, dados) {
    if (!ligada) return;
    eventos.push(Object.assign({ t: agora(), tipo }, dados || {}));
  };

  function exportar() {
    const corpo = {
      app: "vrlab-versao-minimalista",
      exportadoEm: new Date().toISOString(),
      duracaoMs: agora(),
      eventos,
    };
    const blob = new Blob([JSON.stringify(corpo)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `vrlab-sessao-${Date.now()}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  }

  window.Telemetry = { ligada, exportar, eventos };

  if (!ligada) return;

  // Trajetoria: posicao da camera amostrada a 2 Hz (analise do percurso/strolling).
  setInterval(() => {
    const cam = document.getElementById("camera");
    if (!cam || !cam.object3D || !window.AFRAME) return;
    const p = new AFRAME.THREE.Vector3();
    cam.object3D.getWorldPosition(p);
    eventos.push({ t: agora(), tipo: "pos", x: +p.x.toFixed(2), y: +p.y.toFixed(2), z: +p.z.toFixed(2) });
  }, 500);

  // Botao discreto de exportacao (so aparece no modo estudo).
  const montarBotao = () => {
    const btn = document.createElement("button");
    btn.id = "telemetryExport";
    btn.type = "button";
    btn.textContent = "Exportar sessao";
    btn.style.cssText =
      "position:fixed;right:14px;bottom:14px;z-index:30;padding:8px 12px;" +
      "background:rgba(8,13,24,.85);color:#cfe9ff;border:1px solid rgba(255,255,255,.22);" +
      "border-radius:8px;cursor:pointer;pointer-events:auto;font:600 12px Inter,ui-sans-serif,sans-serif";
    btn.addEventListener("click", exportar);
    document.body.appendChild(btn);
  };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", montarBotao);
  else montarBotao();
})();
