// ----------------------------------------------------------------------------
// A PLANTA -> METROS.
//
// Fonte unica de verdade da geometria do ambiente: as coordenadas abaixo sao
// LIDAS do desenho planta_ambiente_vr_narrativo.svg (viewBox 680 x 451,15) e
// convertidas para o mundo 3D por uma escala unica. Mudar SALA_LARGURA_M
// reescala o ambiente inteiro mantendo as proporcoes do desenho.
//
// Convencao: no desenho, X cresce para a direita e Y cresce para BAIXO (a
// entrada fica embaixo, perto do leitor). No mundo A-Frame isso vira X para a
// direita e Z para a FRENTE (em direcao a entrada), que e exatamente o eixo em
// que a camera nasce olhando para -Z.
// ----------------------------------------------------------------------------

const PLANTA_SVG = {
  viewBox: { w: 680, h: 451.15 },
  // "planta baixa - vista de cima" = o mapa interativo (a sala inteira)
  sala: { x: 55, y: 48, w: 430, h: 280 },
  // "mapa de dados - camada de dados brutos"
  mapa: { x: 112, y: 82, w: 198, h: 186 },
  // "regiao em foco - gaze ativo" (esquematico: a regiao real vem do mapa)
  foco: { x: 127, y: 146, w: 94, h: 100 },
  // "contexto - anotacoes narrativas - camada textual"
  contexto: { x: 332, y: 86, w: 118, h: 150 },
  // "painel emergente (3D)" - sobe no eixo Z (= altura no mundo)
  painel: { x: 112, y: 6, w: 196, h: 28 },
  // "posicao do usuario" e "entrada"
  usuario: { cx: 298, cy: 278 },
  entrada: { cx: 268, cy: 330 },
};

// A sala tem 6,5 m de largura. Com as proporcoes do desenho isso da 4,23 m de
// profundidade: espaco suficiente para circular a mesa a pe num Quest 2 e
// pequeno o bastante para que tudo seja alcancavel so com o olhar.
const SALA_LARGURA_M = 6.5;

const PX_M = SALA_LARGURA_M / PLANTA_SVG.sala.w; // metros por pixel do desenho
const SVG_CX = PLANTA_SVG.sala.x + PLANTA_SVG.sala.w / 2; // 270
const SVG_CZ = PLANTA_SVG.sala.y + PLANTA_SVG.sala.h / 2; // 188

const _r2 = (v) => Math.round(v * 1000) / 1000;
const svgX = (px) => _r2((px - SVG_CX) * PX_M); // px do desenho -> X do mundo
const svgZ = (py) => _r2((py - SVG_CZ) * PX_M); // py do desenho -> Z do mundo
const svgD = (d) => _r2(d * PX_M); // distancia -> metros

const _cx = (r) => svgX(r.x + r.w / 2);
const _cz = (r) => svgZ(r.y + r.h / 2);

const PLANTA = {
  sala: {
    w: svgD(PLANTA_SVG.sala.w),
    d: svgD(PLANTA_SVG.sala.h),
    h: 3.0, // pe-direito (nao esta na vista de cima; escolhido para conforto)
  },

  // Mesa do mapa de dados. Tampo a 0,80 m: o olhar cai naturalmente sobre ela
  // e o painel emergente sobe para a altura dos olhos sem forcar o pescoco.
  mapa: {
    cx: _cx(PLANTA_SVG.mapa),
    cz: _cz(PLANTA_SVG.mapa),
    w: svgD(PLANTA_SVG.mapa.w),
    d: svgD(PLANTA_SVG.mapa.h),
    topo: 0.8,
    espessura: 0.09,
  },

  // Zona de contexto: camada textual, em pe, virada para quem observa o mapa.
  contexto: {
    cx: _cx(PLANTA_SVG.contexto),
    cz: _cz(PLANTA_SVG.contexto),
    w: svgD(PLANTA_SVG.contexto.w),
    d: svgD(PLANTA_SVG.contexto.h),
  },

  // Painel emergente: nasce sobre a regiao em foco e sobe ate baseY.
  // Largura reduzida em relacao ao desenho (2,96 m) para caber no campo de
  // visao do Quest 2 (~90 graus) a partir do ponto de observacao.
  painel: {
    cx: _cx(PLANTA_SVG.painel),
    cz: _cz(PLANTA_SVG.mapa), // fica SOBRE o mapa, nao atras dele
    w: 2.9,
    h: 1.4,
    // Borda de baixo. Com olhos a 1,60 m e o painel a ~2,05 m de distancia, a
    // faixa 1,18-2,58 m cai entre -12 e +26 graus de elevacao: leitura sem
    // esticar o pescoco, que e o que mata uma sessao longa de Quest 2.
    baseY: 1.18,
    subidaDe: 0.92, // altura de onde o painel comeca a subir (logo acima da mesa)
  },

  // "posicao do usuario" do desenho: o ponto de observacao, na quina proxima
  // do mapa. Vira um disco no piso (wayfinding) e destino de teleporte.
  usuario: { x: svgX(PLANTA_SVG.usuario.cx), z: svgZ(PLANTA_SVG.usuario.cy) },

  // Entrada: a seta do desenho aponta para dentro pela parede proxima.
  entrada: { x: svgX(PLANTA_SVG.entrada.cx), z: svgD(PLANTA_SVG.sala.h) / 2 - 0.15 },
};

PLANTA.painel.cy = PLANTA.painel.baseY + PLANTA.painel.h / 2;

// Guinada (graus) para que uma entidade em `p` encare o ponto `alvo`.
// Em A-Frame, guinada 0 olha para -Z; a frente de uma entidade e +Z.
function encarar(p, alvo) {
  return _r2((Math.atan2(alvo.x - p.x, alvo.z - p.z) * 180) / Math.PI);
}

// Guinada da camera (olhar) de `p` para `alvo`: a camera olha para -Z.
function olharPara(p, alvo) {
  return _r2((Math.atan2(-(alvo.x - p.x), -(alvo.z - p.z)) * 180) / Math.PI);
}

// As 5 regioes no tampo, em coordenadas LOCAIS da mesa. Vem dos hotspots do
// mapa do Brasil da versao anterior (normalizados a uma imagem de 2,9 x 2,7) e
// sao reescalados para o tampo. No desenho a mesa e vista de cima: o norte
// geografico (y para cima na imagem) aponta para -Z, longe de quem observa.
const MAPA_IMG = { w: 2.9, h: 2.7 };
const REGIOES_IMG = [
  { id: "norte", nome: "Norte", x: -0.331, y: 0.649, w: 1.15, h: 0.7 },
  { id: "nordeste", nome: "Nordeste", x: 0.819, y: 0.374, w: 0.52, h: 0.62 },
  { id: "centro-oeste", nome: "Centro-Oeste", x: -0.003, y: -0.072, w: 0.6, h: 0.64 },
  { id: "sudeste", nome: "Sudeste", x: 0.584, y: -0.346, w: 0.52, h: 0.45 },
  { id: "sul", nome: "Sul", x: 0.14, y: -0.886, w: 0.34, h: 0.45 },
];

const _ex = PLANTA.mapa.w / MAPA_IMG.w;
const _ez = PLANTA.mapa.d / MAPA_IMG.h;

const REGIOES_MESA = REGIOES_IMG.map((r) => ({
  id: r.id,
  nome: r.nome,
  x: _r2(r.x * _ex),
  z: _r2(-r.y * _ez),
  w: _r2(r.w * _ex),
  d: _r2(r.h * _ez),
}));

// Placa de 100 blocos por regiao (1 bloco = 1%), deitada no tampo. O passo e
// pequeno o bastante para caber na menor regiao do desenho (Sul).
const PLACA = { cols: 10, gap: 0.032, size: 0.024 };

// Os 4 indicadores como colunas de voxel em pe na borda PROXIMA do tampo:
// a camada de dados brutos ao alcance da mao, longe de ocluir o mapa.
const COLUNAS = {
  z: _r2(PLANTA.mapa.d / 2 - 0.13), // local a mesa
  xs: [-1.05, -0.35, 0.35, 1.05],
  cols: 10,
  gap: 0.028,
  size: 0.023,
  y0: 0.02, // acima do tampo
};

if (typeof module !== "undefined" && module.exports) {
  module.exports = { PLANTA, PLANTA_SVG, REGIOES_MESA, PLACA, COLUNAS, encarar, olharPara, svgX, svgZ, svgD };
}
