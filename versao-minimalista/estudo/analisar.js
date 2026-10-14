#!/usr/bin/env node
// ----------------------------------------------------------------------------
// Analise das sessoes do estudo: dados-estudo/*.jsonl -> uma linha por
// participante x condicao (variaveis dependentes prontas para a estatistica).
//
//   node estudo/analisar.js                       (le dados-estudo/)
//   node estudo/analisar.js dados-estudo/P01.jsonl
//   node estudo/analisar.js dados-estudo --csv resumo.csv
//   node estudo/analisar.js dados-estudo --json resumo.json
//
// O que sai, por participante x condicao:
//   identificacao ... versao do artefato, navegador, data dos dados, sessoes
//   protocolo ....... triagem registrada, SSQ antes/depois (N, O, D, total e
//                     variacao), treino (concluido, tempo de cada gesto),
//                     duracao da exploracao livre (marcada na estacao)
//   tarefas ......... acerto (com a tolerancia de 1 bloco) e acerto estrito,
//                     tempo de cada tarefa (cronometrado na estacao)
//   imersiva ........ metros andados x teleportados (e a proporcao a pe),
//                     tempo perto da mesa / da zona de contexto, tempo olhando
//                     para cada tipo de alvo, quadros por segundo (mediana e
//                     % abaixo da meta), perdas de rastreio da mao, pincas sem
//                     alvo
//   2D .............. tempo com o mouse em cada camada (mesa, painel,
//                     contexto, trilha de anos) - o equivalente do olhar
//   linha do tempo .. (v1, as duas condicoes) anos visitados, se percorreu os
//                     8, trocas de ano (pelo corpo / pela rolagem), tempo em
//                     cada ano, se chegou a 2024 antes da T1 e em que ano a
//                     pessoa estava ao responder cada tarefa; na imersiva,
//                     tempo sobre a faixa
//   interacao ....... focos, paineis abertos e indicadores trocados
//
// As metricas de movimento e de olhar contam so a EXPLORACAO (entre as marcas
// de inicio e fim da estacao); sem as marcas, a sessao inteira menos o treino.
// Sem dependencias: so Node.
// ----------------------------------------------------------------------------

const fs = require("node:fs");
const path = require("node:path");

const RAIZ = path.resolve(__dirname, "..");
const { PLANTA } = require(path.join(RAIZ, "js-ambiente", "00-planta.js"));
// Os anos da historia (o fim dela e o ultimo).
const ANOS = (() => {
  try {
    return JSON.parse(fs.readFileSync(path.join(RAIZ, "dados.json"), "utf8")).anos;
  } catch (e) {
    return [2017, 2018, 2019, 2020, 2021, 2022, 2023, 2024];
  }
})();
const ANO_FINAL = ANOS[ANOS.length - 1];

const AMOSTRA_S = 0.5; // pos/rolagem a 2 Hz
const SALTO_TELEPORTE_M = 1.0; // deslocamento > isto em 0,5 s sem evento = teleporte
const MARGEM_ZONA_M = 0.6;

// ---------------------------------------------------------------------------
// Leitura
// ---------------------------------------------------------------------------

function arquivosDe(entradas) {
  const lista = [];
  (entradas.length ? entradas : [path.join(RAIZ, "dados-estudo")]).forEach((e) => {
    if (!fs.existsSync(e)) return;
    if (fs.statSync(e).isDirectory()) {
      fs.readdirSync(e)
        .filter((f) => f.endsWith(".jsonl"))
        .forEach((f) => lista.push(path.join(e, f)));
    } else lista.push(e);
  });
  return lista;
}

function lerJsonl(arquivo) {
  const eventos = [];
  fs.readFileSync(arquivo, "utf8")
    .split(/\r?\n/)
    .forEach((linha, i) => {
      if (!linha.trim()) return;
      try {
        eventos.push(JSON.parse(linha));
      } catch (e) {
        console.warn(`${path.basename(arquivo)}:${i + 1} linha invalida (ignorada)`);
      }
    });
  return eventos;
}

// ---------------------------------------------------------------------------
// Utilidades
// ---------------------------------------------------------------------------

const r1 = (v) => (v == null || !isFinite(v) ? null : Math.round(v * 10) / 10);
const r2 = (v) => (v == null || !isFinite(v) ? null : Math.round(v * 100) / 100);

function mediana(xs) {
  if (!xs.length) return null;
  const s = xs.slice().sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

function caixa(cx, cz, w, d, margem) {
  return { x0: cx - w / 2 - margem, x1: cx + w / 2 + margem, z0: cz - d / 2 - margem, z1: cz + d / 2 + margem };
}
const dentro = (c, x, z) => x >= c.x0 && x <= c.x1 && z >= c.z0 && z <= c.z1;
const ZONA_MESA = caixa(PLANTA.mapa.cx, PLANTA.mapa.cz, PLANTA.mapa.w, PLANTA.mapa.d, MARGEM_ZONA_M);
const ZONA_CONTEXTO = caixa(PLANTA.contexto.cx, PLANTA.contexto.cz, PLANTA.contexto.w, PLANTA.contexto.d, MARGEM_ZONA_M);

function zonaDe(x, z) {
  // A faixa (o corredor da linha do tempo) vem primeiro: a caixa da mesa com
  // margem a alcanca. Depois a zona de contexto: as duas caixas com margem se
  // tocam no vao entre a mesa e o texto, e quem esta ali esta lendo.
  const F = PLANTA.faixa;
  if (F && Math.abs(z - F.z) <= F.corredorZ && x >= F.x0 - F.corredorX && x <= F.x1 + F.corredorX) return "faixa";
  if (dentro(ZONA_CONTEXTO, x, z)) return "contexto";
  if (dentro(ZONA_MESA, x, z)) return "mesa";
  if (Math.hypot(x - PLANTA.entrada.x, z - PLANTA.entrada.z) < MARGEM_ZONA_M) return "entrada";
  return "outro";
}

// Relogio comum: o servidor carimba `recebido` em cada linha. Para os eventos
// do participante (enviados em lotes), o atraso minimo recebido - ts estima a
// diferenca entre o relogio do aparelho e o do notebook.
function relogio(eventos) {
  const offsets = {};
  eventos.forEach((e) => {
    if (e.origem !== "participante" || e.ts == null || e.recebido == null) return;
    const k = e.sessao || "?";
    const d = e.recebido - e.ts;
    if (offsets[k] == null || d < offsets[k]) offsets[k] = d;
  });
  return (e) => (e.origem === "participante" && e.ts != null ? e.ts + (offsets[e.sessao || "?"] || 0) : e.ts != null ? e.ts : e.recebido);
}

// ---------------------------------------------------------------------------
// Uma linha de resultado por participante x condicao
// ---------------------------------------------------------------------------

function analisarGrupo(participante, condicao, eventos) {
  const quando = relogio(eventos);
  eventos = eventos.slice().sort((a, b) => quando(a) - quando(b));
  const part = eventos.filter((e) => e.origem === "participante");
  const est = eventos.filter((e) => e.origem === "pesquisador");
  const out = { participante, condicao };

  // ---- identificacao ----
  const versao = part.find((e) => e.tipo === "versao");
  out.versao_artefato = versao ? versao.artefato : null;
  out.scripts = versao ? versao.scripts : null;
  const ua = versao && versao.ua ? versao.ua : "";
  const browser = ua.match(/OculusBrowser\/\d+(?:\.\d+)*/) || ua.match(/(Chrome|Firefox|Edg|Safari)\/\d+(?:\.\d+)*/);
  out.navegador = browser ? browser[0] : null;
  out.quest = /Quest/.test(ua) ? (ua.match(/Quest[^;)]*/) || [""])[0].trim() : null;
  const boot = part.find((e) => e.tipo === "boot");
  out.dados_gerados = boot ? boot.dados : null;
  out.sessoes = new Set(part.map((e) => e.sessao)).size;
  out.reenvios = part.filter((e) => e.reenvio).length;
  out.duracao_s = part.length ? r1((quando(part[part.length - 1]) - quando(part[0])) / 1000) : null;

  // ---- protocolo ----
  out.triagem = est.some((e) => e.tipo === "triagem" && e.apto);
  const interrupcao = est.filter((e) => e.tipo === "interrupcao").pop();
  out.interrompida = interrupcao ? interrupcao.motivo : null;
  ["pre", "pos"].forEach((m) => {
    const s = est.filter((e) => e.tipo === "ssq" && e.momento === m).pop();
    out[`ssq_${m}_N`] = s ? s.escores.N : null;
    out[`ssq_${m}_O`] = s ? s.escores.O : null;
    out[`ssq_${m}_D`] = s ? s.escores.D : null;
    out[`ssq_${m}_total`] = s ? s.escores.TS : null;
  });
  out.ssq_delta_total = out.ssq_pre_total != null && out.ssq_pos_total != null ? r2(out.ssq_pos_total - out.ssq_pre_total) : null;

  const treinoIni = part.filter((e) => e.tipo === "treino" && e.evento === "inicio");
  const treinoFim = part.filter((e) => e.tipo === "treino" && e.evento === "fim");
  const fimTreino = treinoFim[treinoFim.length - 1];
  out.treino_concluido = !!(fimTreino && fimTreino.concluido);
  out.treino_s = fimTreino ? r1(fimTreino.ms / 1000) : null;
  part
    .filter((e) => e.tipo === "treino" && e.evento === "etapa")
    .forEach((e) => (out[`treino_${e.etapa}_s`] = r1(e.ms / 1000)));
  // janelas de treino (para tirar da exploracao)
  const janelasTreino = treinoIni.map((ini) => {
    const fim = treinoFim.find((f) => quando(f) >= quando(ini));
    return [quando(ini), fim ? quando(fim) : Infinity];
  });
  const emTreino = (e) => janelasTreino.some(([a, b]) => quando(e) >= a && quando(e) <= b);

  const expIni = est.filter((e) => e.tipo === "fase" && e.fase === "exploracao" && e.evento === "inicio").pop();
  const expFim = est.filter((e) => e.tipo === "fase" && e.fase === "exploracao" && e.evento === "fim").pop();
  out.exploracao_s = expIni && expFim ? r1((quando(expFim) - quando(expIni)) / 1000) : null;
  const naJanela = expIni
    ? (e) => quando(e) >= quando(expIni) && (!expFim || quando(e) <= quando(expFim))
    : (e) => !emTreino(e);
  out.janela = expIni ? "exploracao marcada" : "sessao sem treino";

  // ---- tarefas (respostas registradas na estacao; o painel local e reserva) ----
  const respostas = est.filter((e) => e.tipo === "tarefa" && e.evento === "resposta");
  const locais = part.filter((e) => e.tipo === "tarefa" && e.evento === "resposta");
  const porTarefa = {};
  locais.concat(respostas).forEach((e) => (porTarefa[e.id] = e)); // a da estacao vence
  let acertos = 0;
  let estritos = 0;
  const tempos = [];
  Object.keys(porTarefa)
    .sort()
    .forEach((id) => {
      const e = porTarefa[id];
      out[`${id}_resposta`] = e.resposta;
      out[`${id}_correta`] = !!e.correta;
      out[`${id}_estrita`] = !!e.corretaEstrita;
      out[`${id}_tempo_s`] = r1(e.tempoMs / 1000);
      if (e.correta) acertos += 1;
      if (e.corretaEstrita) estritos += 1;
      if (e.tempoMs != null) tempos.push(e.tempoMs / 1000);
    });
  out.tarefas_respondidas = Object.keys(porTarefa).length;

  // ---- linha do tempo (strollytelling, piloto-v1) ----
  // O ano em cada instante: eventos "ano" e as amostras de 2 Hz (pos/rolagem),
  // que carregam o ano desde a v1.
  const marcasAno = part
    .filter((e) => (e.tipo === "ano" || e.tipo === "pos" || e.tipo === "rolagem") && e.ano != null)
    .map((e) => ({ t: quando(e), ano: e.ano }));
  const anoEm = (t) => {
    let a = null;
    for (const m of marcasAno) {
      if (m.t > t) break;
      a = m.ano;
    }
    return a;
  };
  Object.keys(porTarefa).forEach((id) => (out[`${id}_ano`] = anoEm(quando(porTarefa[id]))));
  const inicioT1 = eventos.find((e) => e.tipo === "tarefa" && e.id === "T1" && (e.evento === "inicio" || e.evento === "exibida"));
  out.chegou_ao_fim_antes_T1 = inicioT1 && marcasAno.length ? marcasAno.some((m) => m.ano === ANO_FINAL && m.t <= quando(inicioT1)) : null;
  out.acertos = acertos;
  out.acertos_estritos = estritos;
  out.tempo_medio_tarefa_s = tempos.length ? r1(tempos.reduce((a, b) => a + b, 0) / tempos.length) : null;

  // ---- interacao (dentro da janela) ----
  const jan = part.filter(naJanela);
  const conta = (pred) => jan.filter(pred).length;
  out.focos = conta((e) => e.tipo === "foco");
  out.paineis_abertos = conta((e) => e.tipo === "painel" && e.evento === "abrir");
  out.trocas_indicador = conta((e) => e.tipo === "indicador");

  // Linha do tempo na janela: so contam as trocas feitas pela pessoa (o corpo
  // na faixa / a rolagem), nao a ancoragem pelo pesquisador.
  const trocasAno = jan.filter((e) => e.tipo === "ano" && (e.via === "posicao" || e.via === "rolagem"));
  out.trocas_ano = trocasAno.length;
  out.voltas_no_tempo = trocasAno.filter((e) => e.de != null && e.ano < e.de).length;
  const anosJan = new Set(jan.filter((e) => (e.tipo === "ano" || e.tipo === "pos" || e.tipo === "rolagem") && e.ano != null).map((e) => e.ano));
  const anoNoInicio = expIni ? anoEm(quando(expIni)) : null;
  if (anoNoInicio != null) anosJan.add(anoNoInicio);
  out.anos_visitados = anosJan.size;
  out.percorreu_todos = ANOS.every((a) => anosJan.has(a));
  const amostras = jan.filter((e) => (e.tipo === "pos" || e.tipo === "rolagem") && e.ano != null);
  const porAno = {};
  amostras.forEach((e) => (porAno[e.ano] = (porAno[e.ano] || 0) + AMOSTRA_S));
  ANOS.forEach((a) => (out[`tempo_ano_${a}_s`] = r1(porAno[a] || 0)));

  if (condicao === "2d") {
    out.cliques = conta((e) => e.tipo === "clique");
    const rol = jan.filter((e) => e.tipo === "rolagem");
    const mouse = {};
    rol.forEach((e) => (mouse[e.mouse || "nenhuma"] = (mouse[e.mouse || "nenhuma"] || 0) + AMOSTRA_S));
    ["mesa", "painel", "contexto", "trilha", "regua"].forEach((s) => (out[`tempo_mouse_${s}_s`] = r1(mouse[s] || 0)));
    return out;
  }

  // ---- imersiva: movimento, zonas, olhar, desempenho ----
  out.pincas = conta((e) => e.tipo === "pinca" || e.tipo === "gatilho");
  out.pincas_sem_alvo = conta((e) => (e.tipo === "pinca" || e.tipo === "gatilho") && !e.alvo);

  const pos = jan.filter((e) => e.tipo === "pos");
  const teleportes = jan.filter((e) => e.tipo === "teleporte");
  let andado = 0;
  let teleportado = 0;
  for (let i = 1; i < pos.length; i += 1) {
    const a = pos[i - 1];
    const b = pos[i];
    const d = Math.hypot(b.x - a.x, b.z - a.z);
    const houveTeleporte = teleportes.some((t) => quando(t) >= quando(a) && quando(t) <= quando(b));
    if (houveTeleporte || d > SALTO_TELEPORTE_M) teleportado += d;
    else andado += d;
  }
  out.teleportes = teleportes.length;
  out.metros_a_pe = r2(andado);
  out.metros_teleporte = r2(teleportado);
  out.proporcao_a_pe = andado + teleportado > 0 ? r2(andado / (andado + teleportado)) : null;

  const zonas = { faixa: 0, mesa: 0, contexto: 0, entrada: 0, outro: 0 };
  const olhar = {};
  pos.forEach((e) => {
    zonas[zonaDe(e.x, e.z)] += AMOSTRA_S;
    const k = e.alvo ? String(e.alvo).split(":")[0] : "nada";
    olhar[k] = (olhar[k] || 0) + AMOSTRA_S;
  });
  Object.keys(zonas).forEach((z) => (out[`tempo_zona_${z}_s`] = r1(zonas[z])));
  ["regiao", "indicador", "destino", "acao", "nada"].forEach((k) => (out[`olhar_${k}_s`] = r1(olhar[k] || 0)));

  const xr = part.find((e) => e.tipo === "xr");
  const meta = (xr && xr.frameRate) || 72;
  const fpsVr = pos.filter((e) => e.vr && e.fps != null).map((e) => e.fps);
  out.fps_meta = meta;
  out.fps_mediana = mediana(fpsVr);
  out.fps_pct_abaixo = fpsVr.length ? r1((100 * fpsVr.filter((f) => f < meta - 5).length) / fpsVr.length) : null;
  out.tempo_em_vr_s = r1(fpsVr.length * AMOSTRA_S);

  // Perda de rastreio so conta com a mao em uso (fontes de entrada = maos).
  let fontes = [];
  let perdas = 0;
  let perdidoDesde = {};
  let tempoPerdido = 0;
  part.forEach((e) => {
    if (e.tipo === "entrada") fontes = e.fontes || [];
    if (e.tipo !== "rastreio" || !naJanela(e)) return;
    const maoEmUso = fontes.some((f) => f.tipo === "mao" && f.lado === e.mao);
    if (e.estado === "perdido" && maoEmUso) {
      perdas += 1;
      perdidoDesde[e.mao] = quando(e);
    } else if (e.estado === "ok" && perdidoDesde[e.mao] != null) {
      tempoPerdido += quando(e) - perdidoDesde[e.mao];
      perdidoDesde[e.mao] = null;
    }
  });
  out.perdas_rastreio = perdas;
  out.tempo_rastreio_perdido_s = r1(tempoPerdido / 1000);
  return out;
}

function analisar(eventos) {
  const grupos = new Map();
  eventos.forEach((e) => {
    const k = `${e.participante}|${e.condicao}`;
    if (!grupos.has(k)) grupos.set(k, []);
    grupos.get(k).push(e);
  });
  return Array.from(grupos.entries())
    .map(([k, evs]) => {
      const [p, c] = k.split("|");
      return analisarGrupo(p, c, evs);
    })
    .sort((a, b) => (a.participante + a.condicao).localeCompare(b.participante + b.condicao));
}

function paraCsv(linhas) {
  const colunas = [];
  linhas.forEach((l) => Object.keys(l).forEach((k) => colunas.indexOf(k) < 0 && colunas.push(k)));
  const cel = (v) => {
    if (v == null) return "";
    const s = String(v);
    return /[",;\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [colunas.join(","), ...linhas.map((l) => colunas.map((c) => cel(l[c])).join(","))].join("\n") + "\n";
}

// ---------------------------------------------------------------------------

if (require.main === module) {
  const args = process.argv.slice(2);
  const valor = (k) => {
    const i = args.indexOf(k);
    return i >= 0 ? args[i + 1] : null;
  };
  const csv = valor("--csv");
  const json = valor("--json");
  const entradas = args.filter((a, i) => !a.startsWith("--") && !["--csv", "--json"].includes(args[i - 1]));
  const arquivos = arquivosDe(entradas);
  if (!arquivos.length) {
    console.error("Nenhum .jsonl encontrado (padrao: dados-estudo/).");
    process.exit(1);
  }
  const eventos = arquivos.flatMap(lerJsonl);
  const linhas = analisar(eventos);
  linhas.forEach((l) => {
    console.log(`\n== ${l.participante} · ${l.condicao} ==`);
    Object.entries(l).forEach(([k, v]) => {
      if (k === "participante" || k === "condicao") return;
      console.log(`  ${k.padEnd(28)} ${v == null ? "-" : v}`);
    });
  });
  if (csv) {
    fs.writeFileSync(csv, paraCsv(linhas));
    console.log(`\nCSV: ${csv} (${linhas.length} linha(s))`);
  }
  if (json) {
    fs.writeFileSync(json, JSON.stringify(linhas, null, 2));
    console.log(`JSON: ${json}`);
  }
}

module.exports = { analisar, analisarGrupo, lerJsonl, paraCsv, zonaDe };
