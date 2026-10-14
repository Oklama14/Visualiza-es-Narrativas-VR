// ----------------------------------------------------------------------------
// Estado, referencias do DOM e utilidades.
//
// Ambiente "Camadas Retoricas Visiveis": uma sala, tres camadas.
//   - camada de dados brutos ... a mesa do mapa (regioes + 4 indicadores)
//   - camada interpretativa .... o painel emergente (sobe sobre a regiao)
//   - camada textual ........... a zona de contexto (anotacoes narrativas)
// O leitor faz 3 coisas: entra, olha para uma regiao, ve a visualizacao subir.
// ----------------------------------------------------------------------------

let DADOS = null;
const dom = {};

// Fonte MSDF LOCAL. As fontes de estoque do A-Frame (kelsonsans, roboto...)
// sao baixadas de cdn.aframe.io em tempo de execucao: sem internet, TODO o
// texto do ambiente some - inclusive dentro do headset, onde o texto 3D e o
// unico canal que existe. Esta e gerada do Poppins Medium e mora em assets/,
// com o Latin-1 completo (entao o ambiente fala portugues com acento).
const FONTE = "assets/poppins-msdf.json";

const state = {
  pronto: false,
  vrMode: false,
  soundOn: true,
  // regiao sob o olhar agora (hover) x regiao confirmada (painel aberto)
  focoId: null,
  regiaoId: null,
  indicadorKey: "eficiencia",
  anoIdx: null,
  painelAberto: false,
  transitioning: false,
  narrating: false, // usado pelo modo estudo (legendas)
  maoAtiva: false, // hand tracking detectado nesta sessao
  legendaFixa: "", // pergunta da tarefa / instrucao do treino (ver setLegendaFixa)
  treino: false, // etapa de treino em andamento (85-treino.js)
};

// Paleta do ambiente (espelha o desenho da planta).
const CORES = {
  piso: "#0b1122",
  parede: "#0c1428",
  mesa: "#132133",
  mapaZona: "#123f33", // verde da "camada de dados brutos"
  mapaBorda: "#1d9e75",
  foco: "#a8620a", // ambar da "regiao em foco"
  focoBorda: "#ffa23a",
  contextoZona: "#1b1f27",
  contextoBorda: "#5a6472",
  painel: "#3b3392",
  painelBorda: "#8b7fe8",
  texto: "#eaf2ff",
  textoFraco: "#9fb2d6",
};

// ---------------------------------------------------------------------------
// Dados
// ---------------------------------------------------------------------------

function indicadorByKey(key) {
  return DADOS.indicadores.find((i) => i.key === key);
}

function contextoById(id) {
  if (!id || id === "brasil") return DADOS.brasil;
  return DADOS.regioes.find((r) => r.id === id) || null;
}

function latestValue(serie) {
  for (let i = serie.length - 1; i >= 0; i -= 1) if (serie[i] != null) return serie[i];
  return null;
}

function lastValidIndex(serie) {
  for (let i = serie.length - 1; i >= 0; i -= 1) if (serie[i] != null) return i;
  return serie.length - 1;
}

function extremos(serie) {
  let peakIdx = -1;
  let valleyIdx = -1;
  let max = -Infinity;
  let min = Infinity;
  serie.forEach((v, i) => {
    if (v == null) return;
    if (v > max) { max = v; peakIdx = i; }
    if (v < min) { min = v; valleyIdx = i; }
  });
  return { peakIdx, valleyIdx };
}

// dados.json vem sem acento (o build gera ASCII). Aqui e a CAMADA DE
// EXIBICAO: o ambiente fala portugues de verdade sem que ninguem precise
// reprocessar os dados. Se um dia o build passar a acentuar, este mapa vira
// identidade e pode sair.
const ACENTOS = {
  "Taxa de Evasao": "Taxa de Evasão",
  "Taxa de Conclusao": "Taxa de Conclusão",
  "Eficiencia Academica": "Eficiência Acadêmica",
  "Taxa de Retencao": "Taxa de Retenção",
  Evasao: "Evasão",
  Conclusao: "Conclusão",
  Retencao: "Retenção",
  Eficiencia: "Eficiência",
};

function rotulo(texto) {
  return ACENTOS[texto] || texto;
}

function rotuloContexto(ctx) {
  if (!ctx) return "";
  if (ctx.tipo === "brasil") return "Brasil";
  if (ctx.tipo === "regiao") return `Região ${ctx.nome}`;
  return ctx.nome;
}

function rotuloCurto(ctx) {
  if (!ctx) return "";
  return ctx.tipo === "brasil" ? "Brasil" : ctx.nome;
}

function fmt(value) {
  if (value == null) return "-";
  return (Math.round(value * 10) / 10).toFixed(1).replace(".", ",");
}

function fmtInt(n) {
  if (n == null) return "-";
  return Math.round(n).toLocaleString("pt-BR");
}

function clampIdx(value, length) {
  return Math.max(0, Math.min(length - 1, value));
}

function round2(value) {
  return Math.round(value * 100) / 100;
}

// ---------------------------------------------------------------------------
// A-Frame: criacao de entidades com transform aplicado de imediato.
// (mesmo utilitario da versao anterior: o object3D pode nao existir ainda
// quando o elemento e criado, entao a transformacao fica pendente no dataset)
// ---------------------------------------------------------------------------

// A-Frame desenha as fontes de estoque com o shader `sdf` (1 canal); a nossa e
// MSDF (3 canais). Faltando `shader: msdf`, o alfa vem do canal A - que no
// atlas MSDF e 255 em tudo - e cada glifo sai dentro de um retangulo cheio.
// E `negate` precisa ser FALSE: o padrao true existe para os atlas do proprio
// A-Frame, que sao invertidos; no nosso ele troca glifo por fundo.
// Como todo texto daqui usa a fonte local, os dois entram sozinhos.
function el(tagName, attributes = {}) {
  const element = document.createElement(tagName);
  if (tagName === "a-text" && attributes.font === FONTE) {
    attributes = Object.assign({ shader: "msdf", negate: false }, attributes);
  }
  Object.entries(attributes).forEach(([name, value]) => {
    if (name === "class") {
      String(value).split(" ").filter(Boolean).forEach((c) => element.classList.add(c));
      return;
    }
    const normalizedName = name.replace(/[A-Z]/g, (m) => `-${m.toLowerCase()}`);
    if (["position", "rotation", "scale"].includes(normalizedName)) {
      const vector = parseVector(value);
      if (vector) element.dataset[`vr${capitalize(normalizedName)}`] = `${vector.x} ${vector.y} ${vector.z}`;
      setVectorAttribute(element, normalizedName, value);
      return;
    }
    element.setAttribute(normalizedName, value);
  });
  return element;
}

function setVectorAttribute(element, name, value) {
  const vector = parseVector(value);
  if (!vector) { element.setAttribute(name, value); return; }
  // "x y z" e o formato que o vec3 do A-Frame entende. O formato antigo
  // ("x: 1; y: 2; z: 3") virava {x: NaN, y: 1, z: NaN} no componente; o
  // object3D era corrigido logo depois, mas uma entidade que so inicializava
  // depois desse acerto (filhos ainda carregando) ficava com posicao NaN - e o
  // som posicional preso nela derrubava o laco de render (na v1, ao andar na
  // linha do tempo logo depois de abrir uma regiao).
  element.setAttribute(name, `${vector.x} ${vector.y} ${vector.z}`);
  applyObject3DVector(element, name, vector);
}

function parseVector(value) {
  if (value && typeof value === "object") return value;
  if (typeof value !== "string") return value;
  const parts = value.trim().split(/\s+/).map(Number);
  if (parts.length !== 3 || parts.some(Number.isNaN)) return null;
  return { x: parts[0], y: parts[1], z: parts[2] };
}

function applyObject3DVector(element, name, vector) {
  if (!element.object3D) return;
  if (name === "position") { element.object3D.position.set(vector.x, vector.y, vector.z); return; }
  if (name === "scale") { element.object3D.scale.set(vector.x, vector.y, vector.z); return; }
  if (name === "rotation") {
    const toRad = Math.PI / 180;
    element.object3D.rotation.set(vector.x * toRad, vector.y * toRad, vector.z * toRad);
  }
}

function applyPendingTransforms(root) {
  const targets = [root, ...root.querySelectorAll("[data-vr-position], [data-vr-rotation], [data-vr-scale]")];
  const applyAll = () => {
    targets.forEach((t) => {
      if (t.dataset.vrPosition) setVectorAttribute(t, "position", t.dataset.vrPosition);
      if (t.dataset.vrRotation) setVectorAttribute(t, "rotation", t.dataset.vrRotation);
      if (t.dataset.vrScale) setVectorAttribute(t, "scale", t.dataset.vrScale);
    });
  };
  applyAll();
  requestAnimationFrame(applyAll);
}

function setEntityVisible(entity, isVisible) {
  if (!entity) return;
  entity.setAttribute("visible", isVisible);
  const apply = () => { if (entity.object3D) entity.object3D.visible = isVisible; };
  apply();
  requestAnimationFrame(apply);
}

// A-Frame dimensiona o texto por `width / wrapCount`. Sem wrapCount explicito
// (padrao 40), um rotulo de 2 caracteres como "24" sai com 1/20 da largura
// pedida - ilegivel num Quest 2, onde ~1 grau equivale a 20 pixels. Este helper
// pensa ao contrario: diga quantos caracteres cabem e a ALTURA que cada um deve
// ter, e ele devolve o par width/wrap-count correspondente.
//
// Referencia: a 2 m, 0,032 m por caractere ~= 0,9 grau ~= 18 px no Quest 2.
const M_CHAR = { painel: 0.032, mesa: 0.034, miudo: 0.026 };

// nChars e a MAIOR string que este rotulo vai exibir: se o texto passar disso
// o A-Frame quebra a linha e a segunda linha cai em cima do que estiver embaixo.
// `data-linha-unica` liga a trava no setText.
function escalaTexto(nChars, mPorChar) {
  return { width: round2(nChars * mPorChar), "wrap-count": nChars, "data-linha-unica": "1" };
}

// Versao para quando a string ja e conhecida: cabe sempre, encolhendo a letra
// se for preciso para nao passar de larguraMax.
function escalaPara(texto, mPorChar, larguraMax) {
  const n = Math.max(String(texto).length, 1);
  const m = larguraMax ? Math.min(mPorChar, larguraMax / n) : mPorChar;
  return escalaTexto(n, m);
}

function setText(entity, value) {
  if (!entity) return;
  const texto = value == null ? "" : String(value);
  entity.setAttribute("value", texto);
  avisaSeQuebrar(entity, texto);
}

// Trava contra a quebra silenciosa: um rotulo de linha unica que recebe um texto
// maior que o seu wrapCount quebra em duas linhas e escreve por cima do vizinho
// - sem erro nenhum, so um borrao que so aparece dentro do headset. Aqui ela
// vira erro de console, e o smoke-test falha por causa dele.
function avisaSeQuebrar(entity, texto) {
  if (!entity.dataset || entity.dataset.linhaUnica !== "1") return;
  const t = entity.getAttribute("text");
  const limite = t && t.wrapCount;
  if (limite && texto.length > limite) {
    console.error(
      `[ambiente] "${texto}" tem ${texto.length} caracteres e o rotulo #${entity.id || "?"} ` +
        `so comporta ${limite} numa linha - vai quebrar por cima do vizinho.`
    );
    return;
  }
  // Contar caracteres nao basta: o A-Frame quebra pela LARGURA medida, e
  // letras largas (caixa alta, "M", "W") quebram antes do wrap-count. Quando a
  // fonte ja carregou, o layout real diz quantas linhas sairam.
  const comp = entity.components && entity.components.text;
  const layout = comp && comp.currentFont && comp.geometry && comp.geometry.layout;
  if (layout && layout._linesTotal > 1) {
    console.error(
      `[ambiente] "${texto}" quebrou em ${layout._linesTotal} linhas no rotulo #${entity.id || "?"} ` +
        `(letras largas demais para o wrap-count ${limite}) - vai escrever por cima do vizinho.`
    );
  }
}

// O raycaster mira por CLASSE, nao por visibilidade: tirar a classe e o unico
// jeito de um alvo escondido parar de responder ao olhar.
function setClickable(entity, enabled) {
  if (!entity) return;
  entity.classList.toggle("clickable", !!enabled);
}

function refreshRaycasters() {
  requestAnimationFrame(() => {
    document.querySelectorAll("[raycaster]").forEach((entity) => {
      const component = entity.components && entity.components.raycaster;
      if (component) component.refreshObjects();
    });
  });
}

function wait(ms) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

function capitalize(value) {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function shadeColor(hex, percent) {
  const n = hex.replace("#", "");
  const amount = Math.round(2.55 * percent);
  const ch = (i) => Math.max(0, Math.min(255, parseInt(n.slice(i, i + 2), 16) + amount)).toString(16).padStart(2, "0");
  return `#${ch(0)}${ch(2)}${ch(4)}`;
}

// Legenda 3D acoplada a camera: o unico canal de texto que existe DENTRO do
// headset (o HUD em DOM nao aparece la).
let legendaTimer = null;

// Legenda FIXA: a pergunta de uma tarefa do estudo (ou a instrucao do treino)
// tem de continuar visivel enquanto a pessoa explora. As dicas passageiras
// ("Olhe para um ano...") ainda aparecem por cima dela, mas, quando somem, a
// fixa volta - antes a dica apagava a pergunta e ela nao voltava mais.
function setLegendaFixa(text) {
  state.legendaFixa = text || "";
  setCaption(state.legendaFixa);
}

function setCaption(text, autoHideMs) {
  const t = text || state.legendaFixa || "";
  if (dom.captionText) setText(dom.captionText, t);
  if (dom.captionPanel) setEntityVisible(dom.captionPanel, !!t.length);
  clearTimeout(legendaTimer);
  if (text && autoHideMs) {
    legendaTimer = setTimeout(() => {
      if (!state.narrating) setCaption("");
    }, autoHideMs);
  }
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = { state, CORES, fmt, fmtInt, round2, extremos, latestValue, lastValidIndex, rotuloContexto, rotuloCurto, clampIdx };
}
