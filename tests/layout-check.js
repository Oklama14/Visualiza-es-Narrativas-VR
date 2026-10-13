#!/usr/bin/env node
/**
 * layout-check.js - conferencia de LAYOUT sem navegador.
 *
 * Projeta os blocos de texto/painel de cada etapa no espaco de tela (camera em
 * 0 1.6 0, FOV vertical de 80 graus, olhando para -Z) e verifica:
 *   1. blocos vizinhos nao se sobrepoem verticalmente (folga minima);
 *   2. nada cai atras dos paineis 2D do HUD (topo-esquerda e rodape-esquerda);
 *   3. textos com largura estimada nao estouram a caixa que os contem.
 *
 * As alturas de texto usam a metrica do A-Frame text: a altura de linha e
 * proporcional a `width / (wrapCount + 0.5)` (fator ~2,3 para as fontes msdf).
 * E uma estimativa conservadora - serve para pegar encavalamento, nao para
 * medir pixel a pixel.
 *
 * Uso: node .\tests\layout-check.js
 */

const fs = require("fs");
const path = require("path");

const raiz = path.resolve(__dirname, "..");
const html = fs.readFileSync(path.join(raiz, "index.html"), "utf8");
const appSrc = fs.readFileSync(path.join(raiz, "app.js"), "utf8");
const DADOS = JSON.parse(fs.readFileSync(path.join(raiz, "dados.json"), "utf8"));

// ---------------------------------------------------------------------------
// Utilidades de projecao
// ---------------------------------------------------------------------------
const FOV = 80; // a-camera default
const OLHO = 1.6;
const LINE_FACTOR = 2.3; // altura de linha / (width / (wrapCount + 0.5))

const meiaAltura = (z) => Math.tan(((FOV / 2) * Math.PI) / 180) * Math.abs(z);
// % da altura da tela, do topo para baixo (0 = topo, 100 = rodape).
const pctTopo = (y, z) => ((1 - (y - OLHO) / meiaAltura(z)) / 2) * 100;
// % da largura da tela (assume 16:9; a faixa horizontal so importa para o HUD).
const pctEsq = (x, z) => ((x / (meiaAltura(z) * (16 / 9))) + 1) / 2 * 100;

const alturaLinha = (w, wrap) => (LINE_FACTOR * w) / (wrap + 0.5);
const larguraChar = (w, wrap) => w / (wrap + 0.5);
const linhas = (texto, wrap) => Math.max(1, Math.ceil(texto.length / wrap));

// Blocos de HUD 2D (fracao da tela) - medidos do styles.css em 1366x768,
// o pior caso realista de janela de apresentacao.
const HUD_TOPO = { x0: 2, x1: 34, y0: 3, y1: 20 }; // brand-panel
const HUD_RODAPE = { x0: 2, x1: 28, y0: 74, y1: 97 }; // nota-panel

// ---------------------------------------------------------------------------
// Leitura das constantes de geometria do app.js
// ---------------------------------------------------------------------------
function constDeApp(nome) {
  const re = new RegExp(`const ${nome}\\s*=\\s*(\\{[\\s\\S]*?\\n\\};|\\{[^\\n]*\\};)`);
  const m = appSrc.match(re);
  if (!m) throw new Error(`constante ${nome} nao encontrada em app.js`);
  // eslint-disable-next-line no-new-func
  return new Function(`return ${m[1].replace(/;$/, "")}`)();
}

const MULTIPLOS = constDeApp("MULTIPLOS");
const COMP = constDeApp("COMP");
const CAUSAL = constDeApp("CAUSAL");
const GAUGE = constDeApp("GAUGE");

// ---------------------------------------------------------------------------
// Leitura de atributos do index.html
// ---------------------------------------------------------------------------
function tagPorId(id) {
  const re = new RegExp(`<(a-[a-z-]+)\\s[^>]*id="${id}"[^>]*>`, "s");
  const m = html.match(re);
  if (!m) throw new Error(`elemento #${id} nao encontrado em index.html`);
  const attrs = {};
  m[0].replace(/([a-zA-Z-]+)="([^"]*)"/g, (_, k, v) => { attrs[k] = v; return ""; });
  return { tag: m[1], attrs };
}

function posDe(id) {
  const { attrs } = tagPorId(id);
  const [x, y, z] = (attrs.position || "0 0 0").split(/\s+/).map(Number);
  return { x, y, z };
}

function textoDe(id) {
  const { attrs } = tagPorId(id);
  const pos = posDe(id);
  return {
    ...pos,
    width: Number(attrs.width || 1),
    wrap: Number(attrs["wrap-count"] || 40),
  };
}

// ---------------------------------------------------------------------------
// Blocos e verificacoes
// ---------------------------------------------------------------------------
let falhas = 0;
let avisos = 0;
const FOLGA_MIN = 1.0; // % da altura da tela entre blocos vizinhos

function blocoTexto(nome, id, texto) {
  const t = textoDe(id);
  const n = linhas(texto, t.wrap);
  const meia = (n * alturaLinha(t.width, t.wrap)) / 2;
  return {
    nome, z: t.z, topo: t.y + meia, base: t.y - meia,
    larguraTexto: Math.min(texto.length, t.wrap) * larguraChar(t.width, t.wrap),
    x: t.x,
  };
}

function blocoCaixa(nome, y, z, altura, x = 0) {
  return { nome, z, topo: y + altura / 2, base: y - altura / 2, x };
}

function conferirPilha(titulo, blocos) {
  console.log(`\n[${titulo}]`);
  const ordenados = [...blocos].sort((a, b) => pctTopo(a.topo, a.z) - pctTopo(b.topo, b.z));
  ordenados.forEach((b) => {
    console.log(
      `  ${b.nome.padEnd(26)} tela ${pctTopo(b.topo, b.z).toFixed(1)}% -> ${pctTopo(b.base, b.z).toFixed(1)}%`
    );
  });
  for (let i = 0; i < ordenados.length - 1; i += 1) {
    const a = ordenados[i];
    const b = ordenados[i + 1];
    const folga = pctTopo(b.topo, b.z) - pctTopo(a.base, a.z);
    if (folga < 0) {
      console.log(`  FALHA: "${a.nome}" sobrepoe "${b.nome}" (${folga.toFixed(1)}%)`);
      falhas += 1;
    } else if (folga < FOLGA_MIN) {
      console.log(`  AVISO: folga curta entre "${a.nome}" e "${b.nome}" (${folga.toFixed(1)}%)`);
      avisos += 1;
    }
  }
  // HUD 2D
  ordenados.forEach((b) => {
    const meiaLargura = (b.larguraTexto || 0) / 2;
    const xEsq = pctEsq(b.x - meiaLargura, b.z);
    const xDir = pctEsq(b.x + meiaLargura, b.z);
    const t = pctTopo(b.topo, b.z);
    const base = pctTopo(b.base, b.z);
    const cruza = (hud) =>
      xEsq < hud.x1 && xDir > hud.x0 && t < hud.y1 && base > hud.y0;
    if (b.larguraTexto && cruza(HUD_TOPO)) {
      console.log(`  AVISO: "${b.nome}" passa atras do painel HUD do topo`);
      avisos += 1;
    }
    if (b.larguraTexto && cruza(HUD_RODAPE)) {
      console.log(`  AVISO: "${b.nome}" passa atras da nota do rodape`);
      avisos += 1;
    }
  });
}

function conferirCabe(nome, larguraTexto, larguraCaixa) {
  if (larguraTexto > larguraCaixa) {
    console.log(`  FALHA: ${nome} estoura a caixa (${larguraTexto.toFixed(2)} > ${larguraCaixa.toFixed(2)})`);
    falhas += 1;
  } else {
    console.log(`  ok: ${nome} cabe (${larguraTexto.toFixed(2)} <= ${larguraCaixa.toFixed(2)})`);
  }
}

const fmt = (v) => v.toFixed(1).replace(".", ",");

// ---------------------------------------------------------------------------
// 1. Comparar regioes (small multiples)
// ---------------------------------------------------------------------------
const indicadores = DADOS.indicadores;
const tituloMultiplos = indicadores
  .map((i) => `${i.label} por regiao (2024)`)
  .sort((a, b) => b.length - a.length)[0];

const notaMultiplos = (() => {
  let pior = "";
  indicadores.forEach((ind) => {
    const vals = [DADOS.brasil, ...DADOS.regioes]
      .map((c) => ({ nome: c.nome, v: c.series[ind.key][c.series[ind.key].length - 1] ?? -1 }))
      .sort((a, b) => b.v - a.v);
    const regs = vals.filter((v) => DADOS.regioes.some((r) => r.nome === v.nome));
    const s = `${regs[0].nome} ${fmt(regs[0].v)}%  ·  ${regs[regs.length - 1].nome} ${fmt(regs[regs.length - 1].v)}%  ·  abismo de ${fmt(Math.abs(regs[0].v - regs[regs.length - 1].v))} pp`;
    if (s.length > pior.length) pior = s;
  });
  return pior;
})();

conferirPilha("1. Comparar regioes", [
  blocoTexto("titulo", "multiplosTitle", tituloMultiplos),
  blocoTexto("nota", "multiplosNote", notaMultiplos),
  blocoCaixa("seletores", posDe("multiplosSelectors").y, posDe("multiplosSelectors").z, 0.42),
  blocoCaixa("grade linha 1", MULTIPLOS.y[0], MULTIPLOS.z, MULTIPLOS.h),
  blocoCaixa("grade linha 2", MULTIPLOS.y[1], MULTIPLOS.z, MULTIPLOS.h),
  blocoCaixa("legenda", posDe("multiplosLegend").y, posDe("multiplosLegend").z, 0.12),
]);

// cabecalho interno dos paineis: nome (esquerda) x valor (direita)
const nomeMaior = [...DADOS.regioes.map((r) => r.nome), "BRASIL"].sort((a, b) => b.length - a.length)[0];
const charPainel = larguraChar(2.1, 40);
conferirCabe(
  "nome + valor no painel",
  nomeMaior.length * charPainel + "100,0%".length * charPainel + 0.2,
  MULTIPLOS.w - 0.2
);
conferirCabe(
  "rotulo do seletor",
  "Eficiencia".length * larguraChar(1.2, 12),
  1.4
);

// ---------------------------------------------------------------------------
// 2. Composicao "Para onde vao os alunos"
// ---------------------------------------------------------------------------
const tituloComp = (() => {
  const nomes = ["Brasil", ...DADOS.regioes.map((r) => r.nome),
    ...DADOS.regioes.flatMap((r) => r.instituicoes.map((i) => i.sigla || i.nome))];
  const maior = nomes.sort((a, b) => b.length - a.length)[0];
  return `Para onde vao os alunos - ${maior}`;
})();
const textoComp = "Em 2024, de 1.234.567 matriculas: 69,9% concluiram, 25,5% evadiram e 4,5% seguem retidos.";
const readoutComp =
  "2024: 999.999 concluintes · 999.999 retidos · 999.999 evadidos\nFio causal: 25,5% de evasao puxam a eficiencia para 73,3%.";

conferirPilha("2. Composicao (para onde vao os alunos)", [
  blocoTexto("titulo", "compTitle", tituloComp),
  blocoTexto("narrativa", "compText", textoComp),
  blocoCaixa("barras 100%", COMP.baseY + COMP.maxH / 2, COMP.z, COMP.maxH),
  blocoCaixa("rotulos de ano", COMP.baseY - 0.26, COMP.z, alturaLinha(1.5, 40)),
  blocoTexto("readout", "compReadout", readoutComp.split("\n")[0] + readoutComp.split("\n")[1]),
  blocoCaixa("controles", posDe("compScrubber").y, posDe("compScrubber").z, 0.44),
]);

// ---------------------------------------------------------------------------
// 3. Indicadores + painel-equacao (cena de tour)
// ---------------------------------------------------------------------------
const topoMedidor = GAUGE.y + GAUGE.rOut + 0.08; // marca do topo do medidor
conferirPilha("3. Indicadores com painel-equacao", [
  blocoCaixa("painel-equacao", CAUSAL.y, CAUSAL.z, CAUSAL.h),
  blocoCaixa("topo dos medidores", topoMedidor - 0.05, -2.7, 0.1),
  blocoCaixa("rotulo do medidor", GAUGE.y - GAUGE.rOut - 0.2, -3.25, alturaLinha(2.0, 18)),
  blocoCaixa("botao composicao", posDe("compEnter").y, posDe("compEnter").z, 0.4),
]);

const chipChar = larguraChar(1.9, 40);
conferirCabe("nome no chip", "Conclusao".length * chipChar, CAUSAL.chipW - 0.1);
conferirCabe(
  "linha de chips + resultado",
  3 * CAUSAL.chipW + 2 * CAUSAL.chipGap + 0.5 + CAUSAL.resW + 2 * CAUSAL.margem,
  CAUSAL.w
);

// ---------------------------------------------------------------------------
// 4. Indicadores em exploracao livre (painel de hover)
// ---------------------------------------------------------------------------
// O painel de hover e uma camada flutuante: por definicao ele passa por cima do
// topo dos medidores. Conferimos apenas que ele nao invade o cabecalho.
conferirPilha("4. Indicadores (hover)", [
  blocoTexto("titulo do contexto", "contextTitle", "Regiao Centro-Oeste"),
  blocoCaixa("painel de hover", posDe("infoPanel").y, posDe("infoPanel").z, 1.2 * 0.85),
]);
console.log("  (contextLead fica oculto enquanto o painel de hover aparece)");

// ---------------------------------------------------------------------------
console.log(`\n=== RESULTADO: ${falhas} falha(s), ${avisos} aviso(s) ===`);
process.exit(falhas > 0 ? 1 : 0);
