// ----------------------------------------------------------------------------
// Tarefas de compreensao do estudo - UMA definicao para as duas condicoes.
//
// Usada pela condicao imersiva (90-estudo.js), pela condicao 2D
// (controle-2d.html), pela estacao do pesquisador (pesquisador.html) e pelos
// testes. Antes cada pagina tinha a sua copia da conta; agora o gabarito so
// existe aqui, e e CALCULADO de dados.json (nada fixo).
//
// Tolerancia de 1 bloco: no ambiente, 1 bloco = 1%. Quando dois candidatos
// ficam a menos de 1 ponto percentual um do outro, a visualizacao nao tem
// como separa-los (os dois viram o mesmo numero de blocos) - e a evasao do
// Brasil em 2017 (49,49%) e 2018 (49,09%) e exatamente esse caso. A tarefa
// entao aceita os dois. A resposta ESTRITA (o maximo exato) tambem vai para a
// telemetria, para a analise poder usar qualquer um dos dois criterios.
//
// Funcao pura: recebe os dados, nao le estado global. Funciona no navegador
// (script classico) e no Node (module.exports).
// ----------------------------------------------------------------------------

const TOLERANCIA_PP = 1; // 1 bloco = 1 ponto percentual

const FAIXAS_T3 = [
  { rotulo: "menos de 20", de: 0, ate: 20 },
  { rotulo: "20 a 39", de: 20, ate: 40 },
  { rotulo: "40 a 59", de: 40, ate: 60 },
  { rotulo: "60 a 79", de: 60, ate: 80 },
  { rotulo: "80 ou mais", de: 80, ate: Infinity },
];

function _ultimoValor(serie) {
  for (let i = serie.length - 1; i >= 0; i -= 1) if (serie[i] != null) return serie[i];
  return null;
}

function _fmtPct(v) {
  return `${(Math.round(v * 10) / 10).toFixed(1).replace(".", ",")}%`;
}

// Todos os candidatos a menos de TOLERANCIA_PP do maior valor.
function _empatados(itens) {
  const validos = itens.filter((x) => x.v != null);
  const max = Math.max.apply(null, validos.map((x) => x.v));
  const estrito = validos.find((x) => x.v === max);
  const aceitos = validos.filter((x) => max - x.v < TOLERANCIA_PP);
  return { estrito, aceitos };
}

function gerarTarefas(dados) {
  const anos = dados.anos;
  const avisos = [];

  // T1: ano de maior evasao do Brasil.
  const t1 = _empatados(dados.brasil.series.evasao.map((v, i) => ({ chave: String(anos[i]), v })));
  if (t1.aceitos.length > 1) {
    avisos.push(
      `T1: ${t1.aceitos.map((a) => `${a.chave} (${_fmtPct(a.v)})`).join(" e ")} diferem menos de ` +
        `${TOLERANCIA_PP} ponto percentual (1 bloco) - todos contam como corretos; o maximo exato e ${t1.estrito.chave}.`
    );
  }

  // T2: regiao de maior eficiencia no ultimo ano.
  const t2 = _empatados(dados.regioes.map((r) => ({ chave: r.nome, v: _ultimoValor(r.series.eficiencia) })));
  if (t2.aceitos.length > 1) {
    avisos.push(`T2: ${t2.aceitos.map((a) => `${a.chave} (${_fmtPct(a.v)})`).join(" e ")} diferem menos de ${TOLERANCIA_PP} pp - todas contam como corretas.`);
  }

  // T3: de cada 100 estudantes do Brasil no ultimo ano, quantos concluiram.
  // A conta e a mesma da parede de 100 blocos (concluidos / matriculas).
  const iU = anos.length - 1;
  const conc = dados.brasil.series.contagens.concluidos[iU];
  const mat = dados.brasil.series.matriculas[iU];
  const pc = (conc / mat) * 100;
  const faixa = FAIXAS_T3.find((f) => pc >= f.de && pc < f.ate);
  // Perto da fronteira de uma faixa (a menos de 1 bloco), a faixa vizinha
  // tambem conta: 79,6% vira 80 blocos.
  const t3Aceitas = FAIXAS_T3.filter((f) => pc >= f.de - TOLERANCIA_PP && pc < f.ate + TOLERANCIA_PP).map((f) => f.rotulo);
  if (t3Aceitas.length > 1) {
    avisos.push(`T3: ${_fmtPct(pc)} fica a menos de ${TOLERANCIA_PP} pp da fronteira entre faixas - ${t3Aceitas.join(" e ")} contam como corretas.`);
  }

  return {
    tolerancia: TOLERANCIA_PP,
    avisos,
    lista: [
      {
        id: "T1",
        pergunta: "Em que ano a evasão do Brasil foi mais ALTA?",
        opcoes: anos.map(String),
        correta: t1.estrito.chave,
        aceitas: t1.aceitos.map((a) => a.chave),
      },
      {
        id: "T2",
        pergunta: `Qual região tem a MAIOR eficiência acadêmica em ${anos[iU]}?`,
        opcoes: dados.regioes.map((r) => r.nome),
        correta: t2.estrito.chave,
        aceitas: t2.aceitos.map((a) => a.chave),
      },
      {
        id: "T3",
        pergunta: `De cada 100 estudantes do Brasil (${anos[iU]}), quantos CONCLUÍRAM?`,
        opcoes: FAIXAS_T3.map((f) => f.rotulo),
        correta: faixa.rotulo,
        aceitas: t3Aceitas,
      },
    ],
  };
}

// Corrige uma resposta: { correta (com a tolerancia de 1 bloco), corretaEstrita }.
function corrigirResposta(tarefa, resposta) {
  return {
    correta: tarefa.aceitas.indexOf(resposta) >= 0,
    corretaEstrita: resposta === tarefa.correta,
  };
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = { gerarTarefas, corrigirResposta, TOLERANCIA_PP, FAIXAS_T3 };
}
