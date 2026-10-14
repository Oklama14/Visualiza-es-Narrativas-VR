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

// ---------------------------------------------------------------------------
// LINHA DO TEMPO NO PISO (strollytelling, piloto-v1).
//
// O corpo faz a historia andar: 8 trechos de 20 cm, um por ano (2017 a 2024),
// numa faixa de 1,60 m no vao livre entre a borda proxima da mesa e a parede
// da entrada, PARALELA a mesa e centrada sob o painel. Andar de lado (de
// frente para a mesa e o painel) percorre o tempo: esquerda = passado,
// direita = futuro - ninguem anda de costas de headset. A faixa inteira cabe
// numa area real de 2 x 2 m, sem teleporte sobre ela.
//
// O ano segue a CABECA (o Quest nao ve os pes). Para o ano nao piscar quando a
// pessoa balanca o corpo na fronteira, ha uma folga (histerese) de 5 cm: so
// troca quando a cabeca ja entrou 5 cm no trecho vizinho. Fora do corredor da
// faixa (longe dela, ou na zona de contexto) o ano fica onde estava.
// ---------------------------------------------------------------------------
const FAIXA_ANOS = 8;
const FAIXA_TRECHO_M = 0.2;
PLANTA.faixa = {
  anos: FAIXA_ANOS,
  trecho: FAIXA_TRECHO_M,
  comprimento: _r2(FAIXA_ANOS * FAIXA_TRECHO_M),
  cx: PLANTA.painel.cx,
  // 0,49 m depois da borda proxima da mesa: livra o rotulo "CAMADA DE DADOS
  // BRUTOS" do piso e fica a ~0,4 m da parede da entrada.
  z: _r2(PLANTA.mapa.cz + PLANTA.mapa.d / 2 + 0.49),
  largura: 0.32, // profundidade visual da faixa no piso
  histerese: 0.05,
  // corredor em que a faixa manda no ano (fora dele, o ano fica parado)
  corredorZ: 0.45,
  corredorX: 0.4,
};
PLANTA.faixa.x0 = _r2(PLANTA.faixa.cx - PLANTA.faixa.comprimento / 2);
PLANTA.faixa.x1 = _r2(PLANTA.faixa.cx + PLANTA.faixa.comprimento / 2);

// O ponto de observacao do desenho virou a linha do tempo: o CENTRO da faixa
// e de onde o painel, as colunas e a zona de contexto se orientam. (O ponto
// original do desenho continua em PLANTA_SVG.usuario.)
PLANTA.usuario = { x: PLANTA.faixa.cx, z: PLANTA.faixa.z };
// Disco de volta para a linha do tempo. Ele so RESTAURA a ancora (70-faixa.js):
// a pessoa reaparece sobre o ano em que o corpo dela esta, nao no disco - entao
// o lugar dele so precisa ser facil de mirar de onde se sai da faixa (a zona
// de contexto, a 1,5 m) e ficar fora do caminho: meio metro alem de 2024.
PLANTA.discoFaixa = { x: _r2(PLANTA.faixa.x1 + 0.5), z: PLANTA.faixa.z };

// Ano (indice 0..anos-1) para a cabeca em (x, z), dado o ano atual.
// - fora do corredor da faixa: devolve `atual` (o ano trava);
// - alem das pontas: 0 ou anos-1;
// - perto de uma fronteira: so troca depois de entrar `histerese` no vizinho.
// Funcao pura: e o que a condicao imersiva usa a cada quadro, e o que os testes
// conferem nas fronteiras.
function anoNaFaixa(x, z, atual, F) {
  F = F || PLANTA.faixa;
  if (Math.abs(z - F.z) > F.corredorZ) return atual;
  if (x < F.x0 - F.corredorX || x > F.x1 + F.corredorX) return atual;
  const ultimo = F.anos - 1;
  const bruto = Math.max(0, Math.min(ultimo, Math.floor((x - F.x0) / F.trecho)));
  if (atual == null || atual === bruto) return bruto;
  // Trecho atual "alargado" pela folga dos dois lados: dentro dele, nada muda.
  const ini = F.x0 + atual * F.trecho - (atual === 0 ? Infinity : F.histerese);
  const fim = F.x0 + (atual + 1) * F.trecho + (atual === ultimo ? Infinity : F.histerese);
  if (x >= ini && x < fim) return atual;
  return bruto;
}

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
  module.exports = { PLANTA, PLANTA_SVG, REGIOES_MESA, PLACA, COLUNAS, encarar, olharPara, svgX, svgZ, svgD, anoNaFaixa };
}
