// ----------------------------------------------------------------------------
// Modo estudo (?estudo=1&p=P01) - lado do PARTICIPANTE.
//
// Quem conduz a sessao e a ESTACAO DO PESQUISADOR (pesquisador.html, aberta no
// notebook que roda o server.js). Ela manda comandos para esta pagina pelo
// canal da telemetria (01-telemetria.js):
//   tarefa-iniciar / tarefa-encerrar ... a pergunta aparece (e some) como
//                                        legenda fixa dentro do headset
//   treino-iniciar / treino-encerrar ... a etapa de treino (85-treino.js)
//   mensagem ........................... um aviso curto na legenda
//   ir-entrada ......................... leva a pessoa de volta a porta
// A resposta falada e registrada pelo pesquisador NA ESTACAO (com o tempo
// medido la). As tarefas e o gabarito vem de 07-tarefas.js - a mesma
// definicao da condicao 2D.
//
// Painel local (?painel=local): o painel antigo, em DOM, para quando a pagina
// roda no PC (Quest Link / Air Link / desktop) e nao ha estacao. Ele so
// aparece no monitor, nunca dentro do headset.
//
// Fora do modo estudo, este modulo so mantem o lembrete de conforto em VR.
// ----------------------------------------------------------------------------

(function () {
  const params = new URLSearchParams(window.location.search);
  const modoEstudo = params.get("estudo") === "1";

  // ---- Conforto: tempo continuo em headset + lembrete de pausa ----
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
          if (typeof setCaption === "function") setCaption(`Você está há ${min} min em VR - que tal uma pausa?`, 6000);
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

  // ---- Tarefas (07-tarefas.js) ----
  let pacote = null;
  function tarefas() {
    if (!pacote && typeof DADOS !== "undefined" && DADOS) pacote = gerarTarefas(DADOS);
    return pacote;
  }
  function acharTarefa(id) {
    const p = tarefas();
    if (!p) return null;
    const i = p.lista.findIndex((t) => t.id === id);
    return i < 0 ? null : { t: p.lista[i], n: i + 1 };
  }

  function exibirTarefa(id, origem) {
    const a = acharTarefa(id);
    if (!a) return;
    if (state.treino) encerrarTreino("tarefa");
    setLegendaFixa(`TAREFA ${a.n}: ${a.t.pergunta}`);
    tlog("tarefa", { id, evento: "exibida", origem });
  }

  function encerrarTarefa(id, origem) {
    setLegendaFixa("");
    setCaption("Resposta registrada. Obrigado!", 2500);
    tlog("tarefa", { id: id || null, evento: "encerrada", origem });
  }

  // ---- Comandos da estacao do pesquisador ----
  if (window.Telemetry && window.Telemetry.aoComando) {
    window.Telemetry.aoComando((c) => {
      if (!state.pronto) return;
      switch (c.tipo) {
        case "tarefa-iniciar":
          exibirTarefa(c.id, "estacao");
          break;
        case "tarefa-encerrar":
          encerrarTarefa(c.id, "estacao");
          break;
        case "treino-iniciar":
          iniciarTreino("estacao");
          break;
        case "treino-encerrar":
          encerrarTreino("estacao");
          break;
        case "mensagem":
          setCaption(String(c.texto || "").slice(0, 120), Math.min(20000, Number(c.ms) || 7000));
          break;
        case "ir-entrada":
          irPara("entrada");
          break;
        default:
          break;
      }
    });
  }

  // ---- Painel local (?painel=local) ----
  if (params.get("painel") !== "local") return;

  let tarefaAtual = -1;
  let emAndamento = false;
  let tarefaT0 = 0;
  let areaEl = null;

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
    const t = tarefas().lista[i];
    tarefaAtual = i;
    emAndamento = true;
    tarefaT0 = performance.now();
    tlog("tarefa", { id: t.id, evento: "inicio", origem: "painel-local" });
    exibirTarefa(t.id, "painel-local");
    renderEstado();
  }

  function responder(opcao) {
    const t = tarefas().lista[tarefaAtual];
    const tempoMs = Math.round(performance.now() - tarefaT0);
    const r = corrigirResposta(t, opcao);
    tlog("tarefa", { id: t.id, evento: "resposta", resposta: opcao, correta: r.correta, corretaEstrita: r.corretaEstrita, tempoMs, origem: "painel-local" });
    emAndamento = false;
    encerrarTarefa(t.id, "painel-local");
    renderEstado();
  }

  function renderEstado() {
    if (!areaEl) return;
    const p = tarefas();
    areaEl.innerHTML = "";
    if (!p) {
      areaEl.textContent = "Aguardando dados...";
      setTimeout(renderEstado, 800);
      return;
    }
    if (emAndamento) {
      const t = p.lista[tarefaAtual];
      const q = document.createElement("div");
      q.style.cssText = "color:#fff;font-weight:600";
      q.textContent = `${t.id}: ${t.pergunta}`;
      areaEl.appendChild(q);
      t.opcoes.forEach((op) => areaEl.appendChild(botao(op, () => responder(op))));
      return;
    }
    const prox = tarefaAtual + 1;
    if (tarefaAtual < 0) areaEl.appendChild(botao(state.treino ? "Encerrar treino" : "Treino (3 gestos)", () => (state.treino ? encerrarTreino("painel-local") : iniciarTreino("painel-local"))));
    if (prox < p.lista.length) {
      areaEl.appendChild(botao(`Iniciar tarefa ${prox + 1} de ${p.lista.length}`, () => iniciarTarefa(prox), true));
      const dica = document.createElement("div");
      dica.style.cssText = "margin-top:6px;color:#9fb0c8;font-size:12px";
      dica.textContent = "A pergunta aparece como legenda para o participante; registre aqui a resposta falada.";
      areaEl.appendChild(dica);
    } else {
      const fim = document.createElement("div");
      fim.style.cssText = "color:#8fe3c0;font-weight:600";
      fim.textContent = "Tarefas concluídas.";
      areaEl.appendChild(fim);
      areaEl.appendChild(botao("Exportar sessão", () => window.Telemetry.exportar(), true));
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
      `<div style="font-weight:700;color:#b8a9ff;font-size:11px;letter-spacing:.06em;text-transform:uppercase">Modo estudo · painel local · ${part.replace(/[^A-Za-z0-9_-]/g, "")}</div>` +
      '<div id="studyArea" style="margin-top:8px"></div>';
    document.body.appendChild(panel);
    areaEl = panel.querySelector("#studyArea");
    renderEstado();
    setInterval(() => {
      if (!emAndamento) renderEstado();
    }, 1500);
  });
})();
