// ----------------------------------------------------------------------------
// Camada textual: a narrativa CALCULADA dos dados (nada fixo no codigo).
//
// A mesma logica da versao anterior, agora servindo a zona de contexto: cada
// anotacao e derivada da serie do contexto em foco, entao mudar de regiao ou de
// indicador reescreve a parede de texto inteira.
// ----------------------------------------------------------------------------

// ateIdx (opcional): a historia so conhece a serie ATE este ano - e o que o
// strollytelling revela a cada passo na linha do tempo (e a rolagem, na 2D).
// Sem ateIdx (ou no ultimo ano), a narrativa e a da serie inteira, com o
// desfecho ("o maior valor da serie foi ...").
function computeNarrative(ctx, key, ateIdx) {
  const indicador = indicadorByKey(key);
  const serie = ctx.series[key];
  const anos = DADOS.anos;
  const todos = serie.map((v, i) => ({ v, ano: anos[i], i })).filter((d) => d.v != null);
  const ultimoDaSerie = todos.length ? todos[todos.length - 1].i : -1;
  const completa = ateIdx == null || ateIdx >= ultimoDaSerie;
  const validos = completa ? todos : todos.filter((d) => d.i <= ateIdx);

  if (!validos.length) {
    const t = `Não há dados de ${rotulo(indicador.label).toLowerCase()} para ${rotuloContexto(ctx)}` +
      (completa ? "." : ` até ${anos[ateIdx]}.`);
    return { manchete: rotuloContexto(ctx), texto: t, comparativo: "", peakIdx: -1, valleyIdx: -1, completa };
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
  const nomeInd = rotulo(indicador.label).toLowerCase();
  if (validos.length === 1) {
    // Primeiro passo da historia: um ano so, nada a comparar ainda.
    return {
      manchete: `${rotuloCurto(ctx)}: ${nomeInd} em ${primeiro.ano} (${fmt(primeiro.v)}%)`,
      texto: `Em ${primeiro.ano}: ${fmt(primeiro.v)}%.`,
      comparativo,
      peakIdx: maior.i,
      valleyIdx: menor.i,
      ultimoIdx: ultimo.i,
      completa,
    };
  }
  const manchete = `${rotuloCurto(ctx)}: ${nomeInd} ${fase} (de ${fmt(primeiro.v)}% a ${fmt(ultimo.v)}%)`;
  // O desfecho (o ano extremo da serie) so existe quando a historia chega ao fim.
  const texto = completa
    ? `De ${fmt(primeiro.v)}% em ${primeiro.ano} para ${fmt(ultimo.v)}% em ${ultimo.ano}, ` +
      `com tendência de ${tendencia}. O ${rotuloCritico} valor da série foi ` +
      `${fmt(critico.v)}% em ${critico.ano}.`
    : `De ${fmt(primeiro.v)}% em ${primeiro.ano} para ${fmt(ultimo.v)}% em ${ultimo.ano}, ` +
      `com tendência de ${tendencia} até aqui.`;

  return { manchete, texto, comparativo, peakIdx: maior.i, valleyIdx: menor.i, ultimoIdx: ultimo.i, completa };
}

// Evento externo que atravessa a serie (a pandemia esta em dados.json).
function eventoDe(ano) {
  return (DADOS.eventos || []).find((e) => e.ano === ano) || null;
}

// As 3 anotacoes da zona de contexto. Sao "camadas retoricas" distintas:
// manchete (o que aconteceu), leitura (como a serie se move), contexto (com o
// que comparar / o que atravessou a serie).
function anotacoes(ctx, key, anoIdx) {
  const n = computeNarrative(ctx, key, anoIdx);
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

// O painel mostra o BRASIL quando nenhuma regiao esta aberta.
function kickerPainel(ctx) {
  return ctx && ctx.tipo === "brasil" ? "VISUALIZAÇÃO DO BRASIL" : TEXTO_PAINEL_KICKER;
}

// Valor de uma serie no ano da linha do tempo (sem ano: o ultimo valor).
function valorNoAno(serie, idx) {
  return idx == null ? latestValue(serie) : serie[idx] == null ? null : serie[idx];
}

// O ano grande do painel e, se houver, o evento daquele ano.
function textoAnoPainel(idx) {
  return String(DADOS.anos[idx]);
}
function textoEventoAno(idx) {
  const ev = eventoDe(DADOS.anos[idx]);
  return ev ? ev.titulo : "";
}

// Os dois cartoes do grafico: o ano critico e o outro extremo (um so se os
// dois caem no mesmo ano). tipo "critico" | "outro". Na linha do tempo, os
// cartoes sao o DESFECHO: so aparecem quando a historia chega ao ultimo ano
// (ateIdx no fim da serie); antes disso, a lista vem vazia.
function calloutsDaSerie(ctx, key, ateIdx) {
  const ind = indicadorByKey(key);
  const serie = ctx.series[key];
  if (ateIdx != null && ateIdx < lastValidIndex(serie)) return [];
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

// Onde por os cartoes do desfecho (pior/melhor ano) sem cobrir a linha, os
// pontos, a referencia nacional nem o outro cartao, e sem sair da area do
// grafico. Vale para as duas condicoes: quem chama passa X(i) e Y(v) e as
// medidas nas suas unidades (metros no painel 3D, pixels no canvas da 2D).
//   cfg: { X, Y, w, h, folga (do ponto ao centro do cartao), raio (dos
//          pontos), margem (meia espessura das linhas + respiro),
//          xMin, xMax, yMin, yMax (limites das BORDAS do cartao),
//          cima (+1 se y cresce para cima, como no 3D; -1 no canvas),
//          ref (serie de referencia, opcional) }
// Devolve, na ordem dos cartoes, o centro { x, y } de cada um.
function posicionarCartoes(cartoes, serie, cfg) {
  const pontosDe = (s) => (s || []).map((v, i) => (v == null ? null : { x: cfg.X(i), y: cfg.Y(v), i })).filter(Boolean);
  const segmentosDe = (pts) => pts.slice(1).map((p, k) => [pts[k], p]);
  const pts = pontosDe(serie);
  const linha = segmentosDe(pts);
  const ref = segmentosDe(pontosDe(cfg.ref));
  const validos = serie.filter((v) => v != null);
  const maior = Math.max(...validos);
  const lim = (v, a, b) => Math.max(a, Math.min(b, v));
  // comprimento de um segmento dentro de um retangulo (Liang-Barsky)
  const dentro = (s, r) => {
    const [a, b] = s;
    const dx = b.x - a.x, dy = b.y - a.y;
    let t0 = 0, t1 = 1;
    const p = [-dx, dx, -dy, dy];
    const q = [a.x - r[0], r[2] - a.x, a.y - r[1], r[3] - a.y];
    for (let k = 0; k < 4; k += 1) {
      if (p[k] === 0) {
        if (q[k] < 0) return 0;
      } else {
        const t = q[k] / p[k];
        if (p[k] < 0) t0 = Math.max(t0, t);
        else t1 = Math.min(t1, t);
      }
    }
    return t1 > t0 ? (t1 - t0) * Math.hypot(dx, dy) : 0;
  };
  const tocaPonto = (p, r) => {
    const cx = lim(p.x, r[0], r[2]), cy = lim(p.y, r[1], r[3]);
    return Math.hypot(p.x - cx, p.y - cy) < cfg.raio;
  };
  const cruza = (a, b) => a[0] < b[2] && b[0] < a[2] && a[1] < b[3] && b[1] < a[3];
  const colocados = [];
  return cartoes.map((c) => {
    const px = cfg.X(c.idx);
    const py = cfg.Y(serie[c.idx]);
    // o maior valor prefere ficar acima do ponto; o menor, abaixo
    const pref = serie[c.idx] >= maior ? 1 : -1;
    let melhor = null;
    [pref, -pref].forEach((lado) => [1, 1.7, 2.4].forEach((longe) => {
      [0, -0.3, 0.3, -0.6, 0.6, -1, 1].forEach((f) => {
        const x = lim(px + f * cfg.w, cfg.xMin + cfg.w / 2, cfg.xMax - cfg.w / 2);
        const yIdeal = py + cfg.cima * lado * cfg.folga * longe;
        const y = lim(yIdeal, cfg.yMin + cfg.h / 2, cfg.yMax - cfg.h / 2);
        const r = [x - cfg.w / 2, y - cfg.h / 2, x + cfg.w / 2, y + cfg.h / 2];
        // a linha tem espessura: o cartao precisa de folga em volta dela
        const m = cfg.margem || 0;
        const rm = [r[0] - m, r[1] - m, r[2] + m, r[3] + m];
        let custo = 0;
        // Qualquer pedaco de linha sob o cartao custa mais que as preferencias
        // de lado e de distancia (o cartao so cobre linha se nao houver outro
        // lugar): com custo so proporcional ao comprimento, 9 px da referencia
        // nacional saiam mais baratos que colocar o cartao do outro lado.
        linha.forEach((sg) => {
          const d = dentro(sg, rm);
          if (d > 0) custo += 2 + (4 * d) / cfg.w;
        });
        ref.forEach((sg) => {
          const d = dentro(sg, rm);
          if (d > 0) custo += 1.5 + (2.5 * d) / cfg.w;
        });
        pts.forEach((p) => {
          if (tocaPonto(p, rm)) custo += p.i === c.idx ? 10 : 5;
        });
        colocados.forEach((o) => {
          if (cruza(o, r)) custo += 50;
        });
        // perto do proprio ponto (o cartao nao tem fio ate ele)
        custo += (0.6 * Math.abs(x - px)) / cfg.w + (0.3 * Math.abs(y - yIdeal)) / cfg.h + (lado !== pref ? 0.25 : 0) + (longe - 1) * 0.4;
        if (!melhor || custo < melhor.custo - 1e-9) melhor = { x, y, r, custo };
      });
    }));
    colocados.push(melhor.r);
    return { x: melhor.x, y: melhor.y };
  });
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

function tituloMesa(key, anoIdx) {
  const ind = indicadorByKey(key);
  const ano = DADOS.anos[anoIdx == null ? DADOS.anos.length - 1 : anoIdx];
  return `${rotulo(ind.label).toUpperCase()} EM ${ano}   ·   1 BLOCO = 1%`;
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
    calloutsDaSerie, textoLeituraAno, textosParede, tituloMesa, textoValorRegiao, rotuloCurtoIndicador, rotuloEvento, blocosPara, TEXTO_PAINEL_KICKER,
    kickerPainel, valorNoAno, textoAnoPainel, textoEventoAno, posicionarCartoes };
}
