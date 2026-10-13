// Laboratorio VR de Dados - Eficiencia Academica da Rede Federal (Plataforma Nilo Pecanha).
//
// Fluxo hibrido em 3 etapas:
//   1. Selecao de contexto: Brasil + 5 regioes (com drill-down para instituicoes).
//   2. Indicadores: os 4 indicadores do contexto como objetos 3D (valor mais recente).
//   3. Linha do tempo (grafico anotado): serie historica 2017-2024 de um indicador,
//      com eixo de grade, linha de tendencia, marcadores, callouts de pico/vale e
//      uma abertura guiada (martini glass) que apresenta a serie ano a ano antes de
//      liberar a exploracao livre (navegar, comparar, narrar).
//
// Dados vem de dados.json (gerado por build-dados.js). A-Frame e a unica lib externa.
// Narracao usa a Web Speech API nativa do navegador.

let DADOS = null;

// Geometria do grafico (coordenadas no mundo, dentro do ambiente escuro).
const CHART = {
  x0: -3.0,
  x1: 3.0,
  baseY: 1.15, // mais baixo: marcadores ficam proximos da altura dos olhos (1.6)
  maxH: 1.35,
  z: -3.3, // barras/linha/marcadores ficam a frente do painel (-3.4)
};

const MULTIPLOS = {
  cols: 3,
  rows: 2,
  w: 1.8,
  h: 1.1,
  x: [-1.95, 0, 1.95],
  y: [2.15, 0.95],
  z: -3.8
};

const state = {
  stage: "selection", // selection | drill | indicators | timeline | composicao
  selectionView: "home", // home | gallery | map (sub-vistas da etapa de selecao)
  vrMode: false, // true quando em headset (gaze fuse ativo)
  infoIndicator: null, // indicador cujo painel interpretativo esta aberto
  context: null,
  parentRegion: null,
  drillRegion: null,
  indicatorKey: null,
  yearIdx: null,
  compareOn: false,
  compareContext: null,
  narrating: false,
  soundOn: true, // sonificacao (notas, drone, acordes) ligada
  guided: false,
  guidedToken: 0,
  compYearIdx: null,
  miniMapOpen: false,
  transitioning: false,
  tourActive: false,
  tourStep: 0,
  tourId: null,      // A2: id da historia ativa (chave de TOURS)
  tourScenes: null,   // A2: array de cenas da historia ativa
  history: [],        // pilha de navegacao: cada avanco empilha a tela atual; "Voltar" desempilha
};

