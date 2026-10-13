// ----------------------------------------------------------------------------
// SSQ - Simulator Sickness Questionnaire (Kennedy, Lane, Berbaum & Lilienthal,
// 1993). 16 sintomas, cada um de 0 (nenhum) a 3 (severo), em tres subescalas
// que se sobrepoem: Nausea (N), Oculomotor (O) e Desorientacao (D).
//
//   N  = soma(itens N) x 9,54
//   O  = soma(itens O) x 7,58
//   D  = soma(itens D) x 13,92
//   TS = (soma N + soma O + soma D) x 3,74     (escore total)
//
// Usado pela estacao do pesquisador (registro pre/pos) e pelo script de
// analise. Os rotulos em portugues servem para o REGISTRO: aplique o
// questionario na versao aprovada no protocolo do CEP; o que importa aqui e a
// ordem e o significado de cada item (o original em ingles vai junto).
// ----------------------------------------------------------------------------

const SSQ_ITENS = [
  { n: 1, pt: "Desconforto geral", en: "General discomfort", sub: ["N", "O"] },
  { n: 2, pt: "Cansaço", en: "Fatigue", sub: ["O"] },
  { n: 3, pt: "Dor de cabeça", en: "Headache", sub: ["O"] },
  { n: 4, pt: "Cansaço visual", en: "Eyestrain", sub: ["O"] },
  { n: 5, pt: "Dificuldade de focar a vista", en: "Difficulty focusing", sub: ["O", "D"] },
  { n: 6, pt: "Aumento da salivação", en: "Increased salivation", sub: ["N"] },
  { n: 7, pt: "Sudorese (suor)", en: "Sweating", sub: ["N"] },
  { n: 8, pt: "Náusea (enjoo)", en: "Nausea", sub: ["N", "D"] },
  { n: 9, pt: "Dificuldade de concentração", en: "Difficulty concentrating", sub: ["N", "O"] },
  { n: 10, pt: "Sensação de cabeça pesada", en: "Fullness of head", sub: ["D"] },
  { n: 11, pt: "Visão embaçada", en: "Blurred vision", sub: ["O", "D"] },
  { n: 12, pt: "Tontura (olhos abertos)", en: "Dizzy (eyes open)", sub: ["D"] },
  { n: 13, pt: "Tontura (olhos fechados)", en: "Dizzy (eyes closed)", sub: ["D"] },
  { n: 14, pt: "Vertigem", en: "Vertigo", sub: ["D"] },
  { n: 15, pt: "Desconforto no estômago", en: "Stomach awareness", sub: ["N"] },
  { n: 16, pt: "Arrotos", en: "Burping", sub: ["N"] },
];

const SSQ_ESCALA = ["Nenhum", "Leve", "Moderado", "Severo"];
const SSQ_PESOS = { N: 9.54, O: 7.58, D: 13.92, TS: 3.74 };

// respostas: { 1: 0..3, 2: 0..3, ... 16: 0..3 }. Item faltando = erro (o
// escore so vale com os 16).
function pontuarSSQ(respostas) {
  const faltando = SSQ_ITENS.filter((it) => {
    const v = respostas[it.n];
    return !(v === 0 || v === 1 || v === 2 || v === 3);
  });
  if (faltando.length) {
    return { completo: false, faltando: faltando.map((it) => it.n) };
  }
  const somas = { N: 0, O: 0, D: 0 };
  SSQ_ITENS.forEach((it) => it.sub.forEach((s) => (somas[s] += respostas[it.n])));
  const r2 = (v) => Math.round(v * 100) / 100;
  return {
    completo: true,
    somas,
    N: r2(somas.N * SSQ_PESOS.N),
    O: r2(somas.O * SSQ_PESOS.O),
    D: r2(somas.D * SSQ_PESOS.D),
    TS: r2((somas.N + somas.O + somas.D) * SSQ_PESOS.TS),
  };
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = { SSQ_ITENS, SSQ_ESCALA, SSQ_PESOS, pontuarSSQ };
}
