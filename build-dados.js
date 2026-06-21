// Gera dados.json estatico a partir de EficienciaAcademica.csv (Plataforma Nilo Pecanha).
//
// Os indicadores da PNP sao percentuais e NAO podem ser somados/mediados diretamente.
// Por isso agregamos as CONTAGENS brutas (Concluidos, Evadidos, Retidos) por
// contexto/ano e recalculamos os percentuais e o Indice de Eficiencia pela formula
// oficial do dicionario de dados:
//
//   matriculas   = concluidos + evadidos + retidos
//   conclusao %  = concluidos / matriculas
//   evasao %     = evadidos   / matriculas
//   retencao %   = retidos    / matriculas
//   eficiencia % = conclusao% + (retencao% * conclusao%) / (conclusao% + evasao%)
//
// Saida: dados.json com Brasil + 5 regioes (cada uma com suas instituicoes).
// Uso: node build-dados.js

const fs = require("node:fs");
const path = require("node:path");

const CSV_PATH = path.resolve(__dirname, "Dados", "EficienciaAcademica.csv");
const OUT_PATH = path.resolve(__dirname, "dados.json");

const COL = {
  ano: 0,
  regiao: 1,
  uf: 2,
  estado: 3,
  orgPnp: 4,
  sigla: 5,
  instituicao: 6,
  campus: 7,
  concluidos: 8,
  concluidosPct: 9,
  eficienciaPct: 10,
  evadidos: 11,
  retidos: 12,
  retidosPct: 13,
  evasaoPct: 14,
};

// Numero brasileiro: "53,74" -> 53.74; vazio -> 0.
function num(value) {
  if (value === undefined || value === null) return 0;
  const cleaned = String(value).trim().replace(/\./g, "").replace(",", ".");
  if (cleaned === "") return 0;
  const parsed = Number(cleaned);
  return Number.isFinite(parsed) ? parsed : 0;
}

function novoAcumulador() {
  return { concluidos: 0, evadidos: 0, retidos: 0 };
}

function acumular(alvo, ano, linha) {
  if (!alvo[ano]) alvo[ano] = novoAcumulador();
  alvo[ano].concluidos += num(linha[COL.concluidos]);
  alvo[ano].evadidos += num(linha[COL.evadidos]);
  alvo[ano].retidos += num(linha[COL.retidos]);
}

// A partir das contagens acumuladas, devolve as series alinhadas a `anos`.
function calcularSeries(porAno, anos) {
  const conclusao = [];
  const evasao = [];
  const retencao = [];
  const eficiencia = [];
  const matriculas = [];
  // Contagens absolutas (numero de estudantes) por ano, para exibir junto do %.
  const contagens = { concluidos: [], evadidos: [], retidos: [] };

  anos.forEach((ano) => {
    const acc = porAno[ano] || novoAcumulador();
    const total = acc.concluidos + acc.evadidos + acc.retidos;
    matriculas.push(total);
    contagens.concluidos.push(acc.concluidos);
    contagens.evadidos.push(acc.evadidos);
    contagens.retidos.push(acc.retidos);

    if (total === 0) {
      conclusao.push(null);
      evasao.push(null);
      retencao.push(null);
      eficiencia.push(null);
      return;
    }

    const conc = (acc.concluidos / total) * 100;
    const evas = (acc.evadidos / total) * 100;
    const ret = (acc.retidos / total) * 100;
    const denom = conc + evas;
    const efic = denom === 0 ? conc : conc + (ret * conc) / denom;

    conclusao.push(round(conc));
    evasao.push(round(evas));
    retencao.push(round(ret));
    eficiencia.push(round(efic));
  });

  return { conclusao, evasao, retencao, eficiencia, matriculas, contagens };
}

function round(value) {
  return Math.round(value * 100) / 100;
}

function main() {
  const raw = fs.readFileSync(CSV_PATH, "utf8");
  const linhas = raw.split(/\r?\n/).filter((l) => l.trim() !== "");
  const corpo = linhas.slice(1); // descarta cabecalho

  const anosSet = new Set();
  const brasil = {};
  const regioes = new Map(); // nomeRegiao -> { porAno, instituicoes: Map }

  corpo.forEach((linha) => {
    const cols = linha.split(";");
    const ano = Number(cols[COL.ano]);
    if (!Number.isInteger(ano)) return;
    anosSet.add(ano);

    const regiaoNome = (cols[COL.regiao] || "").trim();
    const sigla = (cols[COL.sigla] || "").trim();
    const instNome = (cols[COL.instituicao] || "").trim();
    if (!regiaoNome) return;

    // Brasil
    acumular(brasil, ano, cols);

    // Regiao
    if (!regioes.has(regiaoNome)) {
      regioes.set(regiaoNome, { porAno: {}, instituicoes: new Map() });
    }
    const reg = regioes.get(regiaoNome);
    acumular(reg.porAno, ano, cols);

    // Instituicao dentro da regiao
    const chaveInst = sigla || instNome;
    if (chaveInst) {
      if (!reg.instituicoes.has(chaveInst)) {
        reg.instituicoes.set(chaveInst, {
          sigla,
          nome: instNome,
          porAno: {},
        });
      }
      acumular(reg.instituicoes.get(chaveInst).porAno, ano, cols);
    }
  });

  const anos = [...anosSet].sort((a, b) => a - b);

  const contextoBrasil = {
    id: "brasil",
    nome: "Brasil",
    tipo: "brasil",
    series: calcularSeries(brasil, anos),
  };

  const ordemRegioes = ["Norte", "Nordeste", "Centro-Oeste", "Sudeste", "Sul"];
  const listaRegioes = [...regioes.keys()].sort(
    (a, b) => ordemRegioes.indexOf(a) - ordemRegioes.indexOf(b)
  );

  const regioesOut = listaRegioes.map((nome) => {
    const reg = regioes.get(nome);
    const instituicoes = [...reg.instituicoes.values()]
      .map((inst) => ({
        id: slug(inst.sigla || inst.nome),
        sigla: inst.sigla,
        nome: inst.nome,
        tipo: "instituicao",
        inconsistente: /IFRS/i.test(inst.sigla), // aviso oficial da base sobre o IFRS
        series: calcularSeries(inst.porAno, anos),
      }))
      .sort((a, b) => a.sigla.localeCompare(b.sigla, "pt-BR"));

    return {
      id: slug(nome),
      nome,
      tipo: "regiao",
      series: calcularSeries(reg.porAno, anos),
      instituicoes,
    };
  });

  const out = {
    meta: {
      fonte: "Plataforma Nilo Pecanha (PNP) - SETEC/MEC",
      indicador: "Eficiencia Academica",
      gerado: new Date().toISOString().slice(0, 10),
      observacao:
        "Agregados recalculados a partir das contagens brutas. Dados do IFRS podem conter inconsistencias (aviso da base original).",
    },
    anos,
    // Eventos de contexto exibidos como anotacoes na linha do tempo.
    eventos: [
      {
        ano: 2020,
        titulo: "Pandemia de COVID-19",
        texto:
          "Ensino remoto emergencial, suspensao de aulas presenciais e impactos socioeconomicos afetaram matricula, evasao e conclusao em toda a Rede Federal.",
      },
    ],
    indicadores: [
      {
        key: "evasao",
        label: "Taxa de Evasao",
        unidade: "%",
        cor: "#ff6b6b",
        sentido: "negativo",
        descricao:
          "Percentual de estudantes que interromperam o vinculo com a instituicao antes de concluir o curso.",
      },
      {
        key: "conclusao",
        label: "Taxa de Conclusao",
        unidade: "%",
        cor: "#3ad29f",
        sentido: "positivo",
        descricao:
          "Percentual de estudantes que concluiram o curso dentro do periodo previsto (+1 ano).",
      },
      {
        key: "eficiencia",
        label: "Eficiencia Academica",
        unidade: "%",
        cor: "#4cc9f0",
        sentido: "positivo",
        descricao:
          "Concluintes no prazo somados a uma projecao dos retidos que ainda podem concluir o curso.",
      },
      {
        key: "retencao",
        label: "Taxa de Retencao",
        unidade: "%",
        cor: "#ffd166",
        sentido: "neutro",
        descricao:
          "Percentual de matriculados que ultrapassaram o periodo previsto para integralizar o curso.",
      },
    ],
    brasil: contextoBrasil,
    regioes: regioesOut,
  };

  fs.writeFileSync(OUT_PATH, JSON.stringify(out, null, 2), "utf8");

  // Resumo no console para conferencia.
  const totalInst = regioesOut.reduce((s, r) => s + r.instituicoes.length, 0);
  console.log("dados.json gerado em:", OUT_PATH);
  console.log("Anos:", anos.join(", "));
  console.log("Regioes:", regioesOut.length, "| Instituicoes:", totalInst);
  console.log(
    "Brasil 2024 -> evasao:",
    contextoBrasil.series.evasao[anos.length - 1],
    "| conclusao:",
    contextoBrasil.series.conclusao[anos.length - 1],
    "| eficiencia:",
    contextoBrasil.series.eficiencia[anos.length - 1]
  );
}

function slug(value) {
  return String(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

main();
