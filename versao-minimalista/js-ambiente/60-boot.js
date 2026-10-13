// ----------------------------------------------------------------------------
// BOOT: liga os dados a cena e conduz a entrada do leitor.
//
// As 3 acoes do desenho, nesta ordem: (1) entrar no ambiente, (2) olhar para
// uma regiao do mapa, (3) ver a visualizacao surgir acima. O onboarding diz
// exatamente isso e nada mais.
// ----------------------------------------------------------------------------

// Todo id usado como dom.X precisa estar aqui. A conferencia no fim do arquivo
// falha alto no console se algum sumir do HTML - foi assim que a versao
// anterior ficou com TODAS as legendas 3D mudas sem ninguem perceber.
const DOM_IDS = [
  "scene", "cameraRig", "camera", "gazeCursor", "vrFade", "captionPanel", "captionText",
  "sala", "zonas",
  "mesaMapa", "tampo", "tampoFace", "plinto", "regioes", "colunas",
  "mesaValorTitulo", "somBtn", "somLabel",
  "contextoSlabs", "contextoZona",
  "painel", "painelFundo", "painelKicker", "painelTitulo", "painelManchete",
  "painelAcento", "painelTopo", "painelFechar", "fio",
  "chartGrid", "chartLinha", "chartMarcadores", "chartAnotacoes", "chartReadout",
  "paredeHost", "paredeAno", "paredeLegConc", "paredeLegRet", "paredeLegEvad",
  "discoUsuario", "discoEntrada", "discoContexto",
  "hudTitle", "hudSubtitle", "notaPanel", "notaTitle", "notaBody",
];

document.addEventListener("DOMContentLoaded", () => {
  DOM_IDS.forEach((id) => {
    dom[id] = document.getElementById(id);
    if (!dom[id]) console.error(`[ambiente] id ausente no HTML: #${id}`);
  });

  initOnboarding();

  loadData()
    .then(() => initExperience())
    .catch((err) => {
      console.error(err);
      const o = document.getElementById("loadingOverlay");
      if (o) {
        o.classList.add("is-error");
        const t = document.getElementById("loadingText");
        if (t) t.textContent = "Erro ao carregar os dados. Rode via servidor local (node server.js) e recarregue.";
      }
    });

  window.setTimeout(() => {
    const o = document.getElementById("loadingOverlay");
    if (o && !o.hidden && !o.classList.contains("is-error")) {
      const t = document.getElementById("loadingText");
      if (t) t.textContent = "Ainda carregando... se estiver offline, salve assets/aframe-1.5.0.min.js no projeto.";
    }
  }, 15000);
});

async function loadData() {
  const response = await fetch("dados.json");
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  DADOS = await response.json();
}

function initExperience() {
  buildSala();
  posicionarPlanta();
  buildMapa();
  buildContexto();
  buildPainel();
  bindEntradas();

  updateContexto();
  pintarFoco();

  setText(dom.hudTitle, "Camadas retóricas visíveis");
  setText(dom.hudSubtitle, "Eficiência acadêmica da Rede Federal · 2017–2024");
  setNota(
    "Entrar, olhar, ver",
    "O mapa na mesa é a camada de dados brutos: cada região tem 100 blocos e cada bloco vale 1%. " +
      "Olhe para uma região e confirme: a visualização dela sobe no painel. O texto fica na zona de contexto, à direita — nunca por cima do dado."
  );

  // Autoplay: o audio so pode iniciar depois de um gesto do usuario.
  document.addEventListener("pointerdown", initAudio, { once: true });
  const scene = document.getElementById("scene");
  if (scene) scene.addEventListener("enter-vr", initAudio);

  state.pronto = true;
  hideLoading();
  tlog("boot", { ambiente: "planta-camadas-retoricas", dados: DADOS.meta ? DADOS.meta.gerado : null });
}

function hideLoading() {
  const o = document.getElementById("loadingOverlay");
  if (o) o.hidden = true;
}

// ---------------------------------------------------------------------------
// HUD 2D (monitor espelhado; nao existe dentro do headset)
// ---------------------------------------------------------------------------

let notaTimer = null;

function setNota(titulo, corpo) {
  if (!dom.notaPanel) return;
  setTextContent(dom.notaTitle, titulo);
  setTextContent(dom.notaBody, corpo);
  dom.notaPanel.classList.remove("is-dimmed");
  clearTimeout(notaTimer);
  notaTimer = setTimeout(() => dom.notaPanel.classList.add("is-dimmed"), 14000);
}

function setTextContent(node, value) {
  if (node) node.textContent = value;
}

// ---------------------------------------------------------------------------
// Onboarding (1a visita; sempre no modo estudo, para padronizar a sessao)
// ---------------------------------------------------------------------------

const ONBOARD_KEY = "vrlab.ambiente.onboarded.v1";

function initOnboarding() {
  const overlay = document.getElementById("onboardOverlay");
  const start = document.getElementById("onboardStart");
  const help = document.getElementById("helpBtn");
  if (!overlay || !start) return;

  const modoEstudo = new URLSearchParams(window.location.search).get("estudo") === "1";
  let visto = false;
  try { visto = window.localStorage.getItem(ONBOARD_KEY) === "1"; } catch (e) { visto = false; }

  if (modoEstudo || !visto) overlay.hidden = false;

  start.addEventListener("click", () => {
    overlay.hidden = true;
    try { window.localStorage.setItem(ONBOARD_KEY, "1"); } catch (e) { /* modo privado */ }
    initAudio();
  });

  if (help) help.addEventListener("click", () => { overlay.hidden = false; });
}

// ---------------------------------------------------------------------------
// Handle de inspecao.
// Os modulos sao scripts classicos: `const state` e `const PLANTA` ficam no
// escopo do script e NAO viram propriedades de window. Este objeto e o unico
// jeito de o smoke-test (e o console do navegador, com a tela espelhada do
// headset ao lado) alcancarem o estado do ambiente. So leitura e as acoes que
// ja existem na interface - nada aqui abre caminho novo.
// ---------------------------------------------------------------------------
window.AMB = {
  state,
  dom,
  PLANTA,
  REGIOES_MESA,
  confirmar,
  trocarIndicador,
  selecionarAno,
  abrirPainel,
  fecharPainel,
  irPara,
};
