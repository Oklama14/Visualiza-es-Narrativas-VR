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

// Nomes dos dois extremos da serie, por sentido do indicador.
// `criticoEm`/`outroEm` dizem qual campo da narrativa (peakIdx/valleyIdx) usar.
function rotulosCallout(sentido) {
  if (sentido === "negativo") {
    return { criticoEm: "peakIdx", critico: "PIOR ANO", outroEm: "valleyIdx", outro: "MELHOR ANO" };
  }
  if (sentido === "positivo") {
    return { criticoEm: "valleyIdx", critico: "PIOR ANO", outroEm: "peakIdx", outro: "MELHOR ANO" };
  }
  // neutro: a taxa de retencao nao e boa nem ruim por si - so alta ou baixa.
  return { criticoEm: "peakIdx", critico: "MAIOR", outroEm: "valleyIdx", outro: "MENOR" };
}

// Reparticao inteira dos 100 blocos entre concluidos / retidos / evadidos:
// arredonda cada fatia e devolve a sobra ao maior grupo, entao a parede soma
// SEMPRE exatamente 100 - sem isso um ano aparece com 99 ou 101 blocos e a
// promessa "1 bloco = 1%" quebra na cara de quem conta.
function reparte100(comp) {
  const ns = [comp.concluidos, comp.retidos, comp.evadidos].map((v) => Math.round(v * 100));
  const sobra = 100 - ns.reduce((a, b) => a + b, 0);
  ns[ns.indexOf(Math.max.apply(null, ns))] += sobra;
  return ns;
}

// ---------------------------------------------------------------------------
// Textos do painel e da mesa - os MESMOS nas duas condicoes do estudo.
// A condicao imersiva (40-painel.js, 20-mapa.js) e a 2D (controle-2d.html)
// escrevem exatamente estas strings; o teste de paridade confere.
// ---------------------------------------------------------------------------

const TEXTO_PAINEL_KICKER = "VISUALIZAÇÃO DA REGIÃO";

// Os dois cartoes do grafico: o ano critico e o outro extremo (um so se os
// dois caem no mesmo ano). tipo "critico" | "outro".
function calloutsDaSerie(ctx, key) {
  const ind = indicadorByKey(key);
  const serie = ctx.series[key];
  const narr = computeNarrative(ctx, key);
  const r = rotulosCallout(ind.sentido);
  const lista = [];
  const add = (idx, nome, tipo) => {
    if (idx == null || idx < 0 || serie[idx] == null) return;
    if (lista.some((c) => c.idx === idx)) return;
    lista.push({ idx, tipo, rotulo: `${nome} · ${DADOS.anos[idx]}`, valor: `${fmt(serie[idx])}%` });
  };
  add(narr[r.criticoEm], r.critico, "critico");
  add(narr[r.outroEm], r.outro, "outro");
  return lista;
}

function textoLeituraAno(ctx, key, idx) {
  const v = ctx.series[key][idx];
  return v == null ? `${DADOS.anos[idx]}  ·  sem dados` : `${DADOS.anos[idx]}   ${fmt(v)}%`;
}

// Parede de 100 blocos do ano: titulo, blocos [concluidos, retidos, evadidos]
// e as tres legendas.
function textosParede(ctx, idx) {
  const comp = composicaoDoAno(ctx, idx);
  const titulo = `${DADOS.anos[idx]}  ·  1 bloco = 1%`;
  if (!comp) return { titulo, blocos: null, comp: null, legendas: ["sem composição para este ano", "", ""] };
  const ns = reparte100(comp);
  return {
    titulo,
    blocos: ns,
    comp,
    legendas: [
      `${ns[0]} concluíram  (${fmtInt(comp.brutos.concluidos)})`,
      `${ns[1]} retidos  (${fmtInt(comp.brutos.retidos)})`,
      `${ns[2]} evadiram  (${fmtInt(comp.brutos.evadidos)})`,
    ],
  };
}

function tituloMesa(key) {
  const ind = indicadorByKey(key);
  return `${rotulo(ind.label).toUpperCase()} EM ${DADOS.anos[DADOS.anos.length - 1]}   ·   1 BLOCO = 1%`;
}

function textoValorRegiao(v) {
  return v == null ? "sem dados" : `${fmt(v)}%`;
}

// Nome curto do indicador nas colunas da mesa ("Eficiencia Academica" nao
// cabe; "Eficiencia" identifica sozinha).
function rotuloCurtoIndicador(ind) {
  return rotulo(ind.label).replace("Taxa de ", "").split(" ")[0];
}

// Quantos blocos acender para um valor percentual: arredonda ao inteiro e
// respeita o trilho de 100 (nunca estoura nem some com um valor > 0).
function blocosPara(valor) {
  if (valor == null) return 0;
  return Math.max(valor > 0 ? 1 : 0, Math.min(100, Math.round(valor)));
}

function rotuloEvento(ev) {
  return `${ev.ano} · Pandemia`;
}


if (typeof module !== "undefined" && module.exports) {
  module.exports = { computeNarrative, anotacoes, composicaoDoAno, ultimoAnoComComposicao, rotulosCallout, reparte100,
    calloutsDaSerie, textoLeituraAno, textosParede, tituloMesa, textoValorRegiao, rotuloCurtoIndicador, rotuloEvento, blocosPara, TEXTO_PAINEL_KICKER };
}
