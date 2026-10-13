// ----------------------------------------------------------------------------
// Camada textual: a narrativa CALCULADA dos dados (nada fixo no codigo).
//
// A mesma logica da versao anterior, agora servindo a zona de contexto: cada
// anotacao e derivada da serie do contexto em foco, entao mudar de regiao ou de
// indicador reescreve a parede de texto inteira.
// ----------------------------------------------------------------------------

function computeNarrative(ctx, key) {
  const indicador = indicadorByKey(key);
  const serie = ctx.series[key];
  const anos = DADOS.anos;
  const validos = serie.map((v, i) => ({ v, ano: anos[i], i })).filter((d) => d.v != null);

  if (!validos.length) {
    const t = `Não há dados de ${rotulo(indicador.label).toLowerCase()} para ${rotuloContexto(ctx)}.`;
    return { manchete: rotuloContexto(ctx), texto: t, comparativo: "", peakIdx: -1, valleyIdx: -1 };
  }

  const primeiro = validos[0];
  const ultimo = validos[validos.length - 1];
  const maior = validos.reduce((a, b) => (b.v > a.v ? b : a));
  const menor = validos.reduce((a, b) => (b.v < a.v ? b : a));
  const diff = ultimo.v - primeiro.v;
  const tendencia = diff > 2 ? "crescimento" : diff < -2 ? "redução" : "estabilidade";
  const fase = diff > 2 ? "em alta" : diff < -2 ? "em queda" : "estável";
  const critico = indicador.sentido === "negativo" ? maior : menor;
  const rotuloCritico = indicador.sentido === "negativo" ? "maior" : "menor";

  let comparativo = "";
  if (ctx.tipo !== "brasil") {
    const bserie = DADOS.brasil.series[key];
    const bv = bserie ? bserie[ultimo.i] : null;
    if (bv != null) {
      const d = ultimo.v - bv;
      comparativo =
        `Em ${ultimo.ano} ficou ${fmt(Math.abs(d))} pp ${d >= 0 ? "acima" : "abaixo"} ` +
        `da média nacional (${fmt(bv)}%).`;
    }
  } else {
    comparativo = `Referência nacional: ${fmt(ultimo.v)}% em ${ultimo.ano}.`;
  }

  // Sem setas: a fonte MSDF local cobre o Latin-1, nao simbolos - uma seta
  // viraria tofu dentro do headset, onde nao ha como conferir.
  const manchete =
    `${rotuloCurto(ctx)}: ${rotulo(indicador.label).toLowerCase()} ${fase} ` +
    `(de ${fmt(primeiro.v)}% a ${fmt(ultimo.v)}%)`;
  const texto =
    `De ${fmt(primeiro.v)}% em ${primeiro.ano} para ${fmt(ultimo.v)}% em ${ultimo.ano}, ` +
    `com tendência de ${tendencia}. O ${rotuloCritico} valor da série foi ` +
    `${fmt(critico.v)}% em ${critico.ano}.`;

  return { manchete, texto, comparativo, peakIdx: maior.i, valleyIdx: menor.i, ultimoIdx: ultimo.i };
}

// Evento externo que atravessa a serie (a pandemia esta em dados.json).
function eventoDe(ano) {
  return (DADOS.eventos || []).find((e) => e.ano === ano) || null;
}

// As 3 anotacoes da zona de contexto. Sao "camadas retoricas" distintas:
// manchete (o que aconteceu), leitura (como a serie se move), contexto (com o
// que comparar / o que atravessou a serie).
function anotacoes(ctx, key, anoIdx) {
  const n = computeNarrative(ctx, key);
  const indicador = indicadorByKey(key);
  const anos = DADOS.anos;
  const serie = ctx.series[key];

  const blocos = [
    { kicker: "MANCHETE", titulo: rotuloContexto(ctx), corpo: n.manchete },
    { kicker: "LEITURA", titulo: rotulo(indicador.label), corpo: n.texto },
  ];

  let contexto = n.comparativo;
  if (anoIdx != null && serie[anoIdx] != null) {
    const ev = eventoDe(anos[anoIdx]);
    const absoluto = absolutoNoAno(ctx, key, anoIdx);
    let linha = `${anos[anoIdx]}: ${fmt(serie[anoIdx])}%`;
    if (absoluto) linha += ` (${absoluto})`;
    contexto = `${linha}. ${ev ? ev.titulo + ". " : ""}${n.comparativo}`;
  }
  blocos.push({ kicker: "CONTEXTO", titulo: "Com o que comparar", corpo: contexto });

  return blocos;
}

// Traduz a taxa em gente: a magnitude por tras do percentual.
const SUBSTANTIVO = { evasao: "evadidos", conclusao: "concluintes", retencao: "retidos" };

function absolutoNoAno(ctx, key, idx) {
  const contagens = ctx.series.contagens;
  if (!contagens) return "";
  const mapa = { evasao: "evadidos", conclusao: "concluidos", retencao: "retidos" };
  const campo = mapa[key];
  if (!campo || !contagens[campo]) return "";
  const n = contagens[campo][idx];
  if (n == null) return "";
  return `${fmtInt(n)} ${SUBSTANTIVO[key]}`;
}

// Fracoes da composicao do ano (para onde foram os estudantes daquele ano).
function composicaoDoAno(ctx, idx) {
  const c = ctx.series.contagens;
  if (!c) return null;
  const conc = c.concluidos ? c.concluidos[idx] : null;
  const ret = c.retidos ? c.retidos[idx] : null;
  const evad = c.evadidos ? c.evadidos[idx] : null;
  if (conc == null || ret == null || evad == null) return null;
  const total = conc + ret + evad;
  if (!total) return null;
  return {
    total,
    matriculas: ctx.series.matriculas ? ctx.series.matriculas[idx] : null,
    concluidos: conc / total,
    retidos: ret / total,
    evadidos: evad / total,
    brutos: { concluidos: conc, retidos: ret, evadidos: evad },
  };
}

// Ultimo ano com composicao utilizavel (nem toda serie vai ate 2024).
function ultimoAnoComComposicao(ctx) {
  for (let i = DADOS.anos.length - 1; i >= 0; i -= 1) {
    if (composicaoDoAno(ctx, i)) return i;
  }
  return DADOS.anos.length - 1;
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = { computeNarrative, anotacoes, composicaoDoAno, ultimoAnoComComposicao };
}
