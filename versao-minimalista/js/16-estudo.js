// ----------------------------------------------------------------------------
// Fase 4 - Modo estudo (?estudo=1&p=P01).
// Painel 2D do PESQUISADOR (DOM: aparece no monitor espelhado, nunca dentro do
// headset) com 3 tarefas de compreensao CALCULADAS dos dados - nada fixo. O
// participante ve a pergunta como legenda no mundo; o pesquisador clica na
// opcao respondida em voz alta. Tempo e acerto vao para a telemetria.
// Fora do modo estudo, este modulo so mantem o lembrete de conforto em VR.
// ----------------------------------------------------------------------------

(function () {
  const params = new URLSearchParams(window.location.search);
  const modoEstudo = params.get("estudo") === "1";

  // ---- 4.4 Conforto: tempo continuo em headset + lembrete de pausa ----
  const PAUSA_MIN = 20;
  let vrDesde = null;
  let pausaTimer = null;

  document.addEventListener("DOMContentLoaded", () => {
    const scene = document.getElementById("scene");
    if (!scene) return;
    scene.addEventListener("enter-vr", () => {
      vrDesde = Date.now();
      tlog("vr", { evento: "enter" });
      clearInterval(pausaTimer);
      pausaTimer = setInterval(() => {
        if (!vrDesde) return;
        const min = Math.round((Date.now() - vrDesde) / 60000);
        if (min >= PAUSA_MIN && min % PAUSA_MIN === 0) {
          if (typeof setCaption === "function") {
            setCaption(`Voce esta ha ${min} min em VR - que tal uma pausa?`);
            setTimeout(() => { if (!state.narrating) setCaption(""); }, 6000);
          }
          tlog("vr", { evento: "lembrete-pausa", min });
        }
      }, 60000);
    });
    scene.addEventListener("exit-vr", () => {
      if (vrDesde) tlog("vr", { evento: "exit", minutos: Math.round((Date.now() - vrDesde) / 60000) });
      vrDesde = null;
      clearInterval(pausaTimer);
    });
  });

  if (!modoEstudo) return;

  // ---- 4.2 Tarefas de compreensao (derivadas de dados.json) ----
  let tarefas = null;
  let tarefaAtual = -1;
  let emAndamento = false;
  let tarefaT0 = 0;
  let areaEl = null;

  function montarTarefas() {
    if (tarefas || typeof DADOS === "undefined" || !DADOS) return;
    const anos = DADOS.anos;

    const bEv = DADOS.brasil.series.evasao;
    let pico = 0;
    bEv.forEach((v, i) => { if (v != null && (bEv[pico] == null || v > bEv[pico])) pico = i; });

    const regioesEf = DADOS.regioes.map((r) => ({ nome: r.nome, v: latestValue(r.series.eficiencia) ?? -1 }));
    const topEf = regioesEf.reduce((a, b) => (b.v > a.v ? b : a));

    const i24 = anos.length - 1;
    const m = DADOS.brasil.series.matriculas[i24];
    const conc = DADOS.brasil.series.contagens.concluidos[i24];
    const pc = Math.round((conc / m) * 100);
    const faixaDe = (p) => (p < 20 ? "menos de 20" : p < 40 ? "20 a 39" : p < 60 ? "40 a 59" : p < 80 ? "60 a 79" : "80 ou mais");

    tarefas = [
      { id: "T1", pergunta: "Em que ano a evasao do Brasil foi mais ALTA?",
        opcoes: anos.map(String), correta: String(anos[pico]) },
      { id: "T2", pergunta: "Qual regiao tem a MAIOR eficiencia academica em 2024?",
        opcoes: DADOS.regioes.map((r) => r.nome), correta: topEf.nome },
      { id: "T3", pergunta: "De cada 100 estudantes do Brasil (2024), quantos CONCLUIRAM?",
        opcoes: ["menos de 20", "20 a 39", "40 a 59", "60 a 79", "80 ou mais"], correta: faixaDe(pc) },
    ];
  }

  // ---- 4.1 Painel do pesquisador ----
  function botao(rotulo, onClick, destaque) {
    const b = document.createElement("button");
    b.type = "button";
    b.textContent = rotulo;
    b.style.cssText =
      "display:block;width:100%;margin-top:6px;padding:7px 10px;border-radius:7px;cursor:pointer;" +
      (destaque
        ? "background:#7b61ff;color:#fff;border:none;font-weight:700"
        : "background:rgba(255,255,255,.08);color:#dfe9f6;border:1px solid rgba(255,255,255,.18)");
    b.addEventListener("click", onClick);
    return b;
  }

  function iniciarTarefa(i) {
    tarefaAtual = i;
    emAndamento = true;
    tarefaT0 = performance.now();
    const t = tarefas[i];
    tlog("tarefa", { id: t.id, evento: "inicio" });
    if (typeof setCaption === "function") setCaption(`TAREFA ${i + 1}: ${t.pergunta}`);
    renderEstado();
  }

  function responder(opcao) {
    const t = tarefas[tarefaAtual];
    const tempoMs = Math.round(performance.now() - tarefaT0);
    const correta = opcao === t.correta;
    tlog("tarefa", { id: t.id, evento: "resposta", resposta: opcao, correta, tempoMs });
    emAndamento = false;
    if (typeof setCaption === "function") {
      setCaption("Resposta registrada. Obrigado!");
      setTimeout(() => { if (!state.narrating) setCaption(""); }, 2500);
    }
    renderEstado();
  }

  function renderEstado() {
    if (!areaEl) return;
    montarTarefas();
    areaEl.innerHTML = "";
    if (!tarefas) {
      areaEl.textContent = "Aguardando dados...";
      setTimeout(renderEstado, 800);
      return;
    }
    if (emAndamento) {
      const t = tarefas[tarefaAtual];
      const p = document.createElement("div");
      p.style.cssText = "color:#fff;font-weight:600";
      p.textContent = `${t.id}: ${t.pergunta}`;
      areaEl.appendChild(p);
      t.opcoes.forEach((op) => areaEl.appendChild(botao(op, () => responder(op))));
      return;
    }
    const prox = tarefaAtual + 1;
    if (prox < tarefas.length) {
      areaEl.appendChild(botao(`Iniciar tarefa ${prox + 1} de ${tarefas.length}`, () => iniciarTarefa(prox), true));
      const dica = document.createElement("div");
      dica.style.cssText = "margin-top:6px;color:#9fb0c8;font-size:12px";
      dica.textContent = "A pergunta aparece como legenda para o participante; registre aqui a resposta falada.";
      areaEl.appendChild(dica);
    } else {
      const fim = document.createElement("div");
      fim.style.cssText = "color:#8fe3c0;font-weight:600";
      fim.textContent = "Tarefas concluidas.";
      areaEl.appendChild(fim);
      areaEl.appendChild(botao("Exportar sessao", () => window.Telemetry.exportar(), true));
    }
  }

  document.addEventListener("DOMContentLoaded", () => {
    const panel = document.createElement("div");
    panel.id = "studyPanel";
    panel.style.cssText =
      "position:fixed;right:14px;top:64px;z-index:30;width:252px;padding:12px 14px;" +
      "background:rgba(8,13,24,.92);color:#e8f1fb;border:1px solid rgba(255,255,255,.22);" +
      "border-left:3px solid #7b61ff;border-radius:10px;pointer-events:auto;" +
      "font:13px/1.45 Inter,ui-sans-serif,sans-serif";
    const part = params.get("p") || "sem-id";
    panel.innerHTML =
      `<div style="font-weight:700;color:#b8a9ff;font-size:11px;letter-spacing:.06em;text-transform:uppercase">Modo estudo · ${part}</div>` +
      '<div id="studyArea" style="margin-top:8px"></div>';
    document.body.appendChild(panel);
    areaEl = panel.querySelector("#studyArea");
    renderEstado();
  });
})();
