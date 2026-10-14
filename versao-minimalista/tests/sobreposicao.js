// ----------------------------------------------------------------------------
// Nada em cima de nada: varredura de sobreposicao nas duas condicoes.
//
//   node tests/sobreposicao.js            (precisa do playwright)
//   node tests/sobreposicao.js --json r.json   (grava todos os achados)
//
// IMERSIVA (index.html, no modo desktop), em TODAS as combinacoes de contexto
// (Brasil + 5 regioes) x indicador (4) x ano (8) e nas 3 etapas do treino:
//   1. mesma superficie - para cada texto, cartao e placa, o que esta no mesmo
//      plano (ate 4,5 cm a frente ou atras) e se sobrepoe a ele: texto sobre
//      texto, texto sobre blocos, texto coberto por um plano a frente, texto
//      saindo do proprio fundo, cartao do grafico cobrindo a linha ou um ponto;
//   2. olhar - de cada ano da linha do tempo (os 8 trechos), raios do olho ate
//      15 pontos de cada texto: o que fica na frente.
// 2D (controle-2d.html), em 7 tamanhos de janela (1920x1080 ate 1280x650, a
// janela util de um notebook com o navegador aberto) e com a pergunta da
// tarefa na tela: retangulos de texto do DOM, texto saindo da caixa, caixa
// que nao cabe no palco (rolagem interna) e o desenho do grafico (canvas
// instrumentado: rotulos, cartoes, pontos e linhas).
//
// Regra: zero sobreposicao na mesma superficie e na 2D. Do olhar, nenhum
// texto fica desenhado em cima de outro objeto (o raio que passa pelo texto
// nao pode bater, logo atras, em nada que nao seja o fundo dele), os textos
// do painel nunca ficam tapados; os rotulos da mesa podem perder no maximo
// LIMITE_MESA dos pontos amostrados (de um ponto da faixa, uma coluna pode
// tapar a ponta de um rotulo de tras - e paralaxe, a pessoa da um passo).
// Os rotulos de zona do piso (wayfinding) ficam fora da regra do olhar.
// ----------------------------------------------------------------------------

const { chromium } = require("playwright");
const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "..");
const PORTA = 4189;
const LIMITE_MESA = 0.34;
// Texto desenhado em cima de um objeto logo atras dele (na imagem): ate 1 dos
// 15 pontos amostrados (a quina de um bloco pode encostar numa letra).
const LIMITE_SOBRE = 0.07;

const TIPOS = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".glb": "model/gltf-binary",
};

function servir() {
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      const rel = decodeURIComponent(req.url.split("?")[0]).replace(/^\/+/, "") || "index.html";
      const arquivo = path.join(ROOT, rel);
      if (!arquivo.startsWith(ROOT) || !fs.existsSync(arquivo) || fs.statSync(arquivo).isDirectory()) {
        res.writeHead(404).end("nao encontrado");
        return;
      }
      res.writeHead(200, { "content-type": TIPOS[path.extname(arquivo)] || "application/octet-stream" });
      fs.createReadStream(arquivo).pipe(res);
    });
    server.listen(PORTA, "127.0.0.1", () => resolve(server));
  });
}

// ===========================================================================
// Lado da pagina (imersiva): roda dentro do navegador.
// ===========================================================================
function libCena() {
  window.__sobre = (function () {
    const THREE = AFRAME.THREE;
    const visivel = (o) => {
      for (let p = o; p; p = p.parent) if (p.visible === false) return false;
      return true;
    };
    const elDe = (o) => {
      for (let p = o; p; p = p.parent) if (p.el) return p.el;
      return null;
    };
    function caminho(el) {
      const partes = [];
      let e = el;
      let k = 0;
      while (e && e.tagName && e.tagName !== "A-SCENE" && k < 7) {
        let s = e.id ? "#" + e.id : e.tagName.toLowerCase().replace(/^a-/, "");
        if (!e.id && e.classList && e.classList.length) s += "." + Array.from(e.classList).join(".");
        partes.unshift(s);
        if (e.id) break;
        e = e.parentElement;
        k += 1;
      }
      return partes.join(">");
    }
    function rotulo(it) {
      let s = caminho(it.el);
      if (it.texto) s += ` "${it.texto.slice(0, 48)}"`;
      if (!it.ehTexto) s += ` [${it.tipo}]`;
      return s;
    }

    function coletar(raiz, excluir) {
      raiz.updateMatrixWorld(true);
      const itens = [];
      raiz.traverse((o) => {
        if (!(o.isMesh || o.isInstancedMesh) || !visivel(o)) return;
        const m = Array.isArray(o.material) ? o.material[0] : o.material;
        if (!m || m.visible === false) return;
        const opac = m.transparent ? m.opacity : 1;
        if (opac < 0.05) return;
        const el = elDe(o);
        if (!el || (excluir && excluir(el))) return;
        const g = o.geometry;
        if (!g) return;
        let bb;
        if (o.isInstancedMesh) {
          o.computeBoundingBox();
          bb = o.boundingBox.clone();
        } else {
          g.computeBoundingBox();
          bb = g.boundingBox.clone();
        }
        if (!bb || bb.isEmpty() || !isFinite(bb.min.x)) return;
        const ehTexto = el.tagName === "A-TEXT" && el.components.text && el.components.text.mesh === o;
        const texto = ehTexto ? String(el.getAttribute("value") || "") : null;
        if (ehTexto && !texto.trim()) return;
        const planar = bb.max.z - bb.min.z < 1e-5;
        const cantos = [];
        for (const x of [bb.min.x, bb.max.x])
          for (const y of [bb.min.y, bb.max.y])
            for (const z of planar ? [bb.min.z] : [bb.min.z, bb.max.z]) cantos.push(new THREE.Vector3(x, y, z).applyMatrix4(o.matrixWorld));
        const tipo = ehTexto ? "texto" : o.isInstancedMesh ? "voxels" : String(g.type || "mesh").replace("Buffer", "").replace("Geometry", "");
        itens.push({ o, el, ehTexto, texto, planar, opac, bb, cantos, tipo });
      });
      return itens;
    }

    // Plano de um item: origem, u, v, normal (a face visivel e o +Z local: o
    // texto do A-Frame tem escala Y negativa e u x v apontaria para tras).
    function referencial(it) {
      if (it._ref) return it._ref;
      const bb = it.bb;
      const M = it.o.matrixWorld;
      const c0 = new THREE.Vector3(bb.min.x, bb.min.y, bb.min.z).applyMatrix4(M);
      const c1 = new THREE.Vector3(bb.max.x, bb.min.y, bb.min.z).applyMatrix4(M);
      const c3 = new THREE.Vector3(bb.min.x, bb.max.y, bb.min.z).applyMatrix4(M);
      const u = c1.clone().sub(c0);
      const v = c3.clone().sub(c0);
      const w = u.length();
      const h = v.length();
      u.normalize();
      v.normalize();
      const n = new THREE.Vector3(0, 0, 1).transformDirection(M);
      it._ref = { c0, u, v, n, w, h };
      return it._ref;
    }

    function projetar(ref, it) {
      let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity, d0 = Infinity, d1 = -Infinity;
      it.cantos.forEach((p) => {
        const r = p.clone().sub(ref.c0);
        const x = r.dot(ref.u), y = r.dot(ref.v), d = r.dot(ref.n);
        x0 = Math.min(x0, x); x1 = Math.max(x1, x);
        y0 = Math.min(y0, y); y1 = Math.max(y1, y);
        d0 = Math.min(d0, d); d1 = Math.max(d1, d);
      });
      return { x0, x1, y0, y1, d0, d1 };
    }

    // Mesma superficie.
    function planar(itens, opts) {
      opts = opts || {};
      const TOL = 0.045;
      const MIN = 0.003;
      const achados = [];
      itens.forEach((a) => {
        if (!a.planar) return;
        const ref = referencial(a);
        if (ref.w < 1e-4 || ref.h < 1e-4) return;
        const areaA = ref.w * ref.h;
        let caixaA = null;
        itens.forEach((b) => {
          if (b === a) return;
          if (b.planar && Math.abs(referencial(b).n.dot(ref.n)) < 0.97) return;
          const p = projetar(ref, b);
          if (p.d1 < -TOL || p.d0 > TOL) return;
          if (!b.planar) {
            // objeto 3D: so se encosta no texto (plano inclinado corta a sala toda)
            if (p.d1 < -0.025 || p.d0 > 0.025) return;
            if (!caixaA) {
              caixaA = new THREE.Box3();
              a.cantos.forEach((c) => caixaA.expandByPoint(c));
              caixaA.expandByScalar(0.03);
            }
            const B3 = new THREE.Box3();
            b.cantos.forEach((c) => B3.expandByPoint(c));
            if (!caixaA.intersectsBox(B3)) return;
          }
          const ix = Math.min(ref.w, p.x1) - Math.max(0, p.x0);
          const iy = Math.min(ref.h, p.y1) - Math.max(0, p.y0);
          if (ix < MIN || iy < MIN) return;
          const contemA = p.x0 <= 0.002 && p.x1 >= ref.w - 0.002 && p.y0 <= 0.002 && p.y1 >= ref.h - 0.002;
          const areaB = (p.x1 - p.x0) * (p.y1 - p.y0);
          const dMeio = (p.d0 + p.d1) / 2;
          const frente = b.planar ? dMeio > 0.0005 : p.d1 > 0.004;
          const atras = b.planar ? dMeio < -0.0005 : p.d0 < -0.004 && p.d1 <= 0.004;
          const rec = (tipo) => achados.push({ tipo, a: rotulo(a), b: rotulo(b), mm: [Math.round(ix * 1000), Math.round(iy * 1000)] });
          if (a.ehTexto && b.ehTexto) {
            if (rotulo(a) < rotulo(b)) rec("texto-sobre-texto");
            return;
          }
          if (a.ehTexto) {
            if (b.tipo === "voxels") return rec("texto-sobre-blocos");
            if (frente && b.opac >= 0.3) return rec("texto-coberto");
            if (atras || Math.abs(dMeio) <= 0.0005) {
              if (contemA && areaB >= 2.5 * areaA) return; // o fundo do proprio texto
              if (b.opac < 0.3) return; // faixa translucida (evento, contorno de zona)
              return rec(areaB >= 2.5 * areaA ? "texto-sai-do-fundo" : "texto-sobre-elemento");
            }
            return;
          }
          if (atras && opts.cartoes && opts.cartoes(a) && opts.marcas && opts.marcas(b)) rec("cartao-cobre-marca");
        });
      });
      return achados;
    }

    // Olhar: texto vira um retangulo-procuracao (a geometria do bmfont e 2D e
    // nao responde a raio). Base direita (u, n x u, n) - com v para baixo,
    // makeBasis(u, v, n) seria um espelho.
    function procuracao(it) {
      if (it._proxy) return it._proxy;
      const ref = referencial(it);
      const m = new THREE.Mesh(new THREE.PlaneGeometry(Math.max(ref.w, 1e-4), Math.max(ref.h, 1e-4)), new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }));
      const v2 = ref.n.clone().cross(ref.u).normalize();
      m.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(ref.u, v2, ref.n));
      m.position.copy(ref.c0.clone().addScaledVector(ref.u, ref.w / 2).addScaledVector(ref.v, ref.h / 2));
      m.updateMatrixWorld(true);
      it._proxy = m;
      return m;
    }
    function oclusao(itens, olho) {
      const rc = new THREE.Raycaster();
      const alvos = itens.map((i) => (i.ehTexto ? procuracao(i) : i.o));
      alvos.forEach((o, k) => (o.__idx = k));
      const out = [];
      itens.filter((i) => i.ehTexto).forEach((t) => {
        const ref = referencial(t);
        const centro = ref.c0.clone().addScaledVector(ref.u, ref.w / 2).addScaledVector(ref.v, ref.h / 2);
        if (olho.clone().sub(centro).dot(ref.n) <= 0) return; // de costas
        const meu = procuracao(t);
        let cobertos = 0;
        let total = 0;
        const por = {};
        // (por cima) o raio que passa pelo texto e segue: se bate, logo atras
        // dele (ate 12 cm), num objeto que nao e o fundo onde o texto se apoia,
        // na imagem o texto fica desenhado em cima desse objeto (ex.: o rotulo
        // deitado da coluna sobre a quina da base, verde sobre verde).
        const up = Math.abs(ref.n.y) > 0.9 ? new THREE.Vector3(0, 0, 1) : new THREE.Vector3(0, 1, 0);
        const ax1 = new THREE.Vector3().crossVectors(ref.n, up).normalize();
        const ax2 = new THREE.Vector3().crossVectors(ref.n, ax1).normalize();
        const seguraTexto = (obj) => {
          const bx = new THREE.Box3().setFromObject(obj);
          const p1 = [], p2 = [];
          for (let i = 0; i < 8; i += 1) {
            const c = new THREE.Vector3(i & 1 ? bx.max.x : bx.min.x, i & 2 ? bx.max.y : bx.min.y, i & 4 ? bx.max.z : bx.min.z);
            p1.push(c.dot(ax1));
            p2.push(c.dot(ax2));
          }
          const c1 = centro.dot(ax1), c2 = centro.dot(ax2);
          return c1 >= Math.min(...p1) - 0.005 && c1 <= Math.max(...p1) + 0.005 && c2 >= Math.min(...p2) - 0.005 && c2 <= Math.max(...p2) + 0.005;
        };
        let sobre = 0;
        const sobreQuem = {};
        for (const fx of [0.08, 0.3, 0.5, 0.7, 0.92]) {
          for (const fy of [0.2, 0.5, 0.8]) {
            const p = ref.c0.clone().addScaledVector(ref.u, ref.w * fx).addScaledVector(ref.v, ref.h * fy);
            const dir = p.clone().sub(olho);
            const dist = dir.length();
            rc.set(olho, dir.normalize());
            rc.far = dist - 0.004;
            const hits = rc.intersectObjects(alvos, false).filter((h) => h.object !== meu && h.object !== t.o);
            total += 1;
            if (hits.length) {
              cobertos += 1;
              const nm = rotulo(itens[hits[0].object.__idx]);
              por[nm] = (por[nm] || 0) + 1;
            }
            rc.near = dist + 0.002;
            rc.far = dist + 0.12;
            const atras = rc.intersectObjects(alvos, false).filter((h) => h.object !== meu && h.object !== t.o && !itens[h.object.__idx].ehTexto);
            rc.near = 0;
            if (atras.length && !seguraTexto(atras[0].object)) {
              sobre += 1;
              const nm = rotulo(itens[atras[0].object.__idx]);
              sobreQuem[nm] = (sobreQuem[nm] || 0) + 1;
            }
          }
        }
        if (cobertos || sobre) out.push({ texto: rotulo(t), el: t.el, frac: +(cobertos / total).toFixed(2), por, fracSobre: +(sobre / total).toFixed(2), sobreQuem });
      });
      return out;
    }
    return { coletar, planar, oclusao };
  })();
}

// ===========================================================================
// Lado da pagina (2D): instrumenta o canvas antes de qualquer script.
// ===========================================================================
function instrumentarCanvas() {
  const P = CanvasRenderingContext2D.prototype;
  window.__cv = { itens: [], ligado: false };
  const T = () => window.__cv;
  const tr = (ctx, x, y) => {
    const m = ctx.getTransform();
    const d = window.devicePixelRatio || 1;
    return [(m.a * x + m.c * y + m.e) / d, (m.b * x + m.d * y + m.f) / d];
  };
  const oFillText = P.fillText;
  P.fillText = function (txt, x, y) {
    if (T().ligado) {
      const w = this.measureText(txt).width;
      const px = parseFloat(this.font) || 13;
      const al = this.textAlign;
      const x0 = al === "center" ? x - w / 2 : al === "right" || al === "end" ? x - w : x;
      const [a0, b0] = tr(this, x0, y - px * 0.78);
      const [a1, b1] = tr(this, x0 + w, y + px * 0.22);
      T().itens.push({ tipo: "texto", txt: String(txt), r: [a0, b0, a1, b1] });
    }
    return oFillText.apply(this, arguments);
  };
  const oFillRect = P.fillRect;
  P.fillRect = function (x, y, w, h) {
    if (T().ligado) {
      const [a0, b0] = tr(this, x, y);
      const [a1, b1] = tr(this, x + w, y + h);
      T().itens.push({ tipo: "ret", r: [Math.min(a0, a1), Math.min(b0, b1), Math.max(a0, a1), Math.max(b0, b1)], cor: String(this.fillStyle) });
    }
    return oFillRect.apply(this, arguments);
  };
  let caminho = [];
  let ultimo = null;
  const oBegin = P.beginPath;
  P.beginPath = function () {
    caminho = [];
    ultimo = null;
    return oBegin.apply(this, arguments);
  };
  const oMove = P.moveTo;
  P.moveTo = function (x, y) {
    ultimo = tr(this, x, y);
    return oMove.apply(this, arguments);
  };
  const oLine = P.lineTo;
  P.lineTo = function (x, y) {
    const p = tr(this, x, y);
    if (ultimo) caminho.push([ultimo, p]);
    ultimo = p;
    return oLine.apply(this, arguments);
  };
  const oArc = P.arc;
  P.arc = function (x, y, r) {
    caminho.push({ c: tr(this, x, y), r });
    return oArc.apply(this, arguments);
  };
  const oStroke = P.stroke;
  P.stroke = function () {
    if (T().ligado)
      caminho.forEach((s) =>
        Array.isArray(s)
          ? T().itens.push({ tipo: "seg", a: s[0], b: s[1], cor: String(this.strokeStyle), dash: this.getLineDash().length > 0 })
          : T().itens.push({ tipo: "anel", c: s.c, r: s.r })
      );
    return oStroke.apply(this, arguments);
  };
  const oFill = P.fill;
  P.fill = function () {
    if (T().ligado) caminho.forEach((s) => !Array.isArray(s) && T().itens.push({ tipo: "ponto", c: s.c, r: s.r }));
    return oFill.apply(this, arguments);
  };
}

function analisar2d() {
  const achados = [];
  const nome = (el) => {
    let s = el.tagName.toLowerCase();
    if (el.id) s += "#" + el.id;
    else if (typeof el.className === "string" && el.className.trim()) s += "." + el.className.trim().split(/\s+/).join(".");
    return s;
  };
  const caminho = (el) => {
    const p = [];
    let e = el;
    let k = 0;
    while (e && e !== document.body && k < 4) {
      p.unshift(nome(e));
      if (e.id) break;
      e = e.parentElement;
      k += 1;
    }
    return p.join(">");
  };
  const visivel = (el) => {
    for (let e = el; e && e !== document; e = e.parentElement) {
      const s = getComputedStyle(e);
      if (s.display === "none" || s.visibility === "hidden" || +s.opacity === 0) return false;
    }
    return true;
  };
  // A parte visivel de um retangulo: recortada pelas caixas com rolagem
  // interna (o texto que passou da caixa nao aparece por cima de nada).
  const recorte = (el, r) => {
    let x0 = r.left, y0 = r.top, x1 = r.right, y1 = r.bottom;
    for (let e = el.parentElement; e && e !== document.body; e = e.parentElement) {
      if (getComputedStyle(e).overflow === "visible") continue;
      const c = e.getBoundingClientRect();
      x0 = Math.max(x0, c.left); y0 = Math.max(y0, c.top); x1 = Math.min(x1, c.right); y1 = Math.min(y1, c.bottom);
    }
    return { left: x0, top: y0, right: x1, bottom: y1 };
  };
  const textos = [];
  const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  let n;
  while ((n = w.nextNode())) {
    if (!n.textContent.trim()) continue;
    const el = n.parentElement;
    if (!el || !visivel(el) || el.closest("script,style,#studyPanel2d")) continue;
    const rg = document.createRange();
    rg.selectNodeContents(n);
    Array.from(rg.getClientRects()).forEach((r0) => {
      const r = recorte(el, r0);
      if (r.right - r.left > 1 && r.bottom - r.top > 1 && r.bottom > 0 && r.top < innerHeight) textos.push({ el, txt: n.textContent.trim().slice(0, 40), r });
    });
  }
  const inter = (a, b) => {
    const x = Math.min(a.right, b.right) - Math.max(a.left, b.left);
    const y = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
    return x > 1.5 && y > 1.5 ? [Math.round(x), Math.round(y)] : null;
  };
  for (let i = 0; i < textos.length; i += 1)
    for (let j = i + 1; j < textos.length; j += 1) {
      const a = textos[i];
      const b = textos[j];
      if (a.el === b.el || a.el.contains(b.el) || b.el.contains(a.el)) continue;
      const ij = inter(a.r, b.r);
      if (ij) achados.push({ tipo: "texto-sobre-texto", a: `${caminho(a.el)} "${a.txt}"`, b: `${caminho(b.el)} "${b.txt}"`, px: ij });
    }
  // texto vazando da propria caixa
  textos.forEach((t) => {
    for (let e = t.el; e && e !== document.body; e = e.parentElement) {
      const s = getComputedStyle(e);
      const caixa = s.overflow !== "visible" || /\b(card|regiao|coluna|cartao|ctx-bloco)\b/.test(e.className || "");
      if (!caixa) continue;
      const r = e.getBoundingClientRect();
      const fora = Math.max(r.left - t.r.left, t.r.right - r.right, r.top - t.r.top, t.r.bottom - r.bottom);
      if (fora > 1.5) achados.push({ tipo: "texto-vaza-da-caixa", a: `${caminho(t.el)} "${t.txt}"`, b: caminho(e), px: [Math.round(fora), 0] });
      break;
    }
  });
  // caixas do palco com rolagem interna: algo ficou escondido
  document.querySelectorAll(".palco *").forEach((e) => {
    const s = getComputedStyle(e);
    if (/(auto|scroll|hidden)/.test(s.overflowY) && e.scrollHeight > e.clientHeight + 2 && visivel(e))
      achados.push({ tipo: "conteudo-nao-cabe", a: caminho(e), b: "", px: [0, e.scrollHeight - e.clientHeight] });
  });
  // elementos fixos por cima de texto
  document.querySelectorAll("body *").forEach((e) => {
    const pos = getComputedStyle(e).position;
    if (pos !== "fixed" || !visivel(e) || e.id === "studyPanel2d") return;
    const r = e.getBoundingClientRect();
    textos.forEach((t) => {
      if (e.contains(t.el)) return;
      const ij = inter(r, t.r);
      if (ij) achados.push({ tipo: "fixo-cobre-texto", a: caminho(e), b: `${caminho(t.el)} "${t.txt}"`, px: ij });
    });
  });
  // canvas do grafico
  const cv = document.getElementById("grafico");
  const R = cv.getBoundingClientRect();
  const it = window.__cv.itens;
  const caixa = (o) => (o.tipo === "ponto" || o.tipo === "anel" ? [o.c[0] - o.r, o.c[1] - o.r, o.c[0] + o.r, o.c[1] + o.r] : o.r);
  const ib = (a, b) => {
    const x = Math.min(a[2], b[2]) - Math.max(a[0], b[0]);
    const y = Math.min(a[3], b[3]) - Math.max(a[1], b[1]);
    return x > 1 && y > 1 ? [Math.round(x), Math.round(y)] : null;
  };
  const segRet = (s, r) => {
    let t0 = 0, t1 = 1;
    const dx = s.b[0] - s.a[0], dy = s.b[1] - s.a[1];
    const p = [-dx, dx, -dy, dy];
    const q = [s.a[0] - r[0], r[2] - s.a[0], s.a[1] - r[1], r[3] - s.a[1]];
    for (let i = 0; i < 4; i += 1) {
      if (p[i] === 0) {
        if (q[i] < 0) return 0;
      } else {
        const t = q[i] / p[i];
        if (p[i] < 0) t0 = Math.max(t0, t);
        else t1 = Math.min(t1, t);
      }
    }
    return t1 > t0 ? (t1 - t0) * Math.hypot(dx, dy) : 0;
  };
  const txts = it.filter((o) => o.tipo === "texto");
  const cartoes = it.filter((o) => o.tipo === "ret" && o.r[2] - o.r[0] > 60 && o.r[3] - o.r[1] > 20 && /#081022/i.test(o.cor));
  const marcas = it.filter((o) => o.tipo === "ponto" || o.tipo === "anel");
  const grade = (s) => Math.abs(s.a[1] - s.b[1]) < 0.5 && s.b[0] - s.a[0] > R.width * 0.6;
  const segs = it.filter((o) => o.tipo === "seg" && !grade(o));
  const dentro = (t, c) => t.r[0] >= c.r[0] - 1 && t.r[2] <= c.r[2] + 1 && t.r[1] >= c.r[1] - 1 && t.r[3] <= c.r[3] + 1;
  for (let i = 0; i < txts.length; i += 1)
    for (let j = i + 1; j < txts.length; j += 1) {
      const x = ib(txts[i].r, txts[j].r);
      if (x) achados.push({ tipo: "grafico-texto-sobre-texto", a: `"${txts[i].txt}"`, b: `"${txts[j].txt}"`, px: x });
    }
  cartoes.forEach((c) => {
    txts.forEach((t) => {
      if (dentro(t, c)) return;
      const x = ib(t.r, c.r);
      if (x) achados.push({ tipo: "grafico-cartao-cobre-texto", a: "cartao", b: `"${t.txt}"`, px: x });
    });
    marcas.forEach((m) => {
      const x = ib(caixa(m), c.r);
      if (x) achados.push({ tipo: "grafico-cartao-cobre-ponto", a: "cartao", b: "ponto", px: x });
    });
    segs.forEach((s) => {
      const L = segRet(s, c.r);
      if (L > 2) achados.push({ tipo: "grafico-cartao-cobre-linha", a: "cartao", b: s.dash ? "referencia nacional" : "linha", px: [Math.round(L), 0] });
    });
    if (c.r[0] < -0.5 || c.r[2] > R.width + 0.5 || c.r[1] < -0.5 || c.r[3] > R.height + 0.5) achados.push({ tipo: "grafico-cartao-fora", a: "cartao", b: "canvas", px: [0, 0] });
  });
  for (let i = 0; i < cartoes.length; i += 1)
    for (let j = i + 1; j < cartoes.length; j += 1) {
      const x = ib(cartoes[i].r, cartoes[j].r);
      if (x) achados.push({ tipo: "grafico-cartao-sobre-cartao", a: "cartao", b: "cartao", px: x });
    }
  txts.forEach((t) => {
    if (cartoes.some((c) => dentro(t, c))) return;
    marcas.forEach((m) => {
      const x = ib(caixa(m), t.r);
      if (x) achados.push({ tipo: "grafico-texto-sobre-ponto", a: `"${t.txt}"`, b: "ponto", px: x });
    });
    segs.forEach((s) => {
      const L = segRet(s, t.r);
      if (L > 2) achados.push({ tipo: "grafico-texto-sobre-linha", a: `"${t.txt}"`, b: s.dash ? "referencia nacional" : "linha", px: [Math.round(L), 0] });
    });
    if (t.r[0] < -0.5 || t.r[2] > R.width + 0.5 || t.r[1] < -0.5 || t.r[3] > R.height + 0.5) achados.push({ tipo: "grafico-texto-cortado", a: `"${t.txt}"`, b: "canvas", px: [0, 0] });
  });
  return achados;
}

// ===========================================================================

function agrupar() {
  const g = {};
  return {
    add(lista, estado) {
      lista.forEach((a) => {
        const k = `${a.tipo} | ${a.a.replace(/ ".*?"/, "")} | ${a.b.replace(/ ".*?"/, "")}`;
        if (!g[k]) g[k] = { tipo: a.tipo, a: a.a, b: a.b, n: 0, ex: estado };
        g[k].n += 1;
      });
    },
    lista: () => Object.values(g).sort((x, y) => y.n - x.n),
  };
}

(async () => {
  const server = await servir();
  const browser = await chromium.launch({ args: ["--enable-unsafe-swiftshader", "--use-gl=swiftshader"] });
  const falhas = [];
  const notas = [];

  // ---------------------------------------------------------------- imersiva
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  const erros = [];
  page.on("pageerror", (e) => erros.push(e.message));
  await page.goto(`http://127.0.0.1:${PORTA}/index.html`, { waitUntil: "load" });
  await page.waitForFunction(() => window.AMB && window.AMB.state.pronto, null, { timeout: 30000 });
  await page.evaluate(() => {
    const b = document.getElementById("onboardStart");
    if (b && !document.getElementById("onboardOverlay").hidden) b.click();
  });
  await page.addScriptTag({ content: `(${libCena.toString()})();` });
  await page.waitForTimeout(800);

  const regs = await page.evaluate(() => window.AMB.REGIOES_MESA.map((r) => r.id));
  const inds = ["eficiencia", "conclusao", "evasao", "retencao"];
  const preparar = (r, k) =>
    page.evaluate(([r, k]) => {
      const A = window.AMB;
      A.fecharPainel();
      setFoco(null);
      A.trocarIndicador(k);
      if (r) A.abrirPainel(r);
      // painel ja no lugar final (sem a animacao de subida)
      const d = A.dom.painel;
      d.removeAttribute("animation__sobe");
      d.removeAttribute("animation__cresce");
      d.setAttribute("position", `${A.PLANTA.painel.cx} ${A.PLANTA.painel.cy} ${A.PLANTA.painel.cz}`);
      d.setAttribute("scale", "1 1 1");
    }, [r, k]);

  const sup = agrupar();
  let estadosVR = 0;
  for (const r of [null].concat(regs)) {
    for (const k of inds) {
      await preparar(r, k);
      await page.waitForTimeout(350);
      const res = await page.evaluate(() => {
        const A = window.AMB;
        const S = window.__sobre;
        const out = [];
        for (let a = 0; a < 8; a += 1) {
          A.definirAno(a, "teste");
          const itens = S.coletar(document.querySelector("a-scene").object3D, (el) => !!el.closest("#cameraRig"));
          out.push(
            S.planar(itens, {
              cartoes: (it) => !!it.el.closest(".callout"),
              marcas: (it) => !!(it.el.closest("#chartLinha") || it.el.closest("#chartMarcadores")),
            })
          );
        }
        return out;
      });
      res.forEach((ach, a) => {
        sup.add(ach, `${r || "brasil"}/${k}/${2017 + a}`);
        estadosVR += 1;
      });
    }
  }
  const treino = await page.evaluate(async () => {
    const S = window.__sobre;
    iniciarTreino("teste");
    await new Promise((r) => setTimeout(r, 400));
    const out = [];
    for (let i = 0; i < 3; i += 1) {
      irParaEtapa(i);
      await new Promise((r) => setTimeout(r, 200));
      out.push(S.planar(S.coletar(TREINO.grupo.object3D)));
    }
    encerrarTreino("teste");
    return out;
  });
  treino.forEach((ach, i) => sup.add(ach, `treino/etapa ${i + 1}`));
  const achSup = sup.lista();
  achSup.forEach((g) => falhas.push(`IMERSIVA ${g.tipo}: ${g.a} x ${g.b} (${g.n} estado(s); ex.: ${g.ex})`));
  notas.push(`imersiva, mesma superficie: ${estadosVR} estados + 3 etapas do treino, ${achSup.length} tipo(s) de sobreposicao`);

  // olhar a partir da faixa
  const olhos = await page.evaluate(() => {
    const F = window.AMB.PLANTA.faixa;
    // de cada ano da linha do tempo (a pessoa para em qualquer um deles)
    const o = {};
    for (let i = 0; i < F.anos; i += 1) o[String(2017 + i)] = [F.x0 + (i + 0.5) * F.trecho, 1.6, F.z];
    return o;
  });
  const piores = {};
  const sobrePior = {};
  for (const r of [null].concat(regs)) {
    for (const [k, a] of [["eficiencia", 0], ["evasao", 7], ["retencao", 3]]) {
      await preparar(r, k);
      await page.waitForTimeout(350);
      const res = await page.evaluate(([a, olhos]) => {
        const A = window.AMB;
        const S = window.__sobre;
        const THREE = AFRAME.THREE;
        A.definirAno(a, "teste");
        const itens = S.coletar(document.querySelector("a-scene").object3D, (el) => !!el.closest("#cameraRig"));
        const out = {};
        Object.entries(olhos).forEach(([nome, v]) => {
          out[nome] = S.oclusao(itens, new THREE.Vector3(v[0], v[1], v[2])).map((o) => ({
            texto: o.texto,
            frac: o.frac,
            por: o.por,
            painel: !!o.el.closest("#painel"),
            zona: !!o.el.closest("#zonas") || !!o.el.closest("#sala"),
          }));
        });
        return out;
      }, [a, olhos]);
      Object.entries(res).forEach(([olho, lista]) =>
        lista.forEach((o) => {
          if (o.zona) return; // rotulos de zona do piso e placa: wayfinding
          const chave = `${olho}|${o.texto.replace(/ ".*?"/, "")}`;
          if (!piores[chave] || o.frac > piores[chave].frac) piores[chave] = Object.assign({ olho, estado: `${r || "brasil"}/${k}/${2017 + a}` }, o);
          if (o.fracSobre > (sobrePior[chave] ? sobrePior[chave].fracSobre : 0)) sobrePior[chave] = Object.assign({ olho, estado: `${r || "brasil"}/${k}/${2017 + a}` }, o);
        })
      );
    }
  }
  let maiorMesa = 0;
  Object.values(piores).forEach((o) => {
    const quem = Object.keys(o.por).join(", ");
    if (o.painel && o.frac > 0) falhas.push(`OLHAR (faixa ${o.olho}): texto do painel tapado ${Math.round(o.frac * 100)}% - ${o.texto} por ${quem} (${o.estado})`);
    else if (o.frac > LIMITE_MESA) falhas.push(`OLHAR (faixa ${o.olho}): ${o.texto} tapado ${Math.round(o.frac * 100)}% por ${quem} (${o.estado})`);
    else maiorMesa = Math.max(maiorMesa, o.frac);
  });
  notas.push(`imersiva, do olhar (os 8 anos da faixa): painel sempre livre; rotulos da mesa tapados no maximo ${Math.round(maiorMesa * 100)}% (limite ${Math.round(LIMITE_MESA * 100)}%)`);
  let maiorSobre = 0;
  Object.values(sobrePior).forEach((o) => {
    if (o.fracSobre > LIMITE_SOBRE) falhas.push(`OLHAR (faixa ${o.olho}): ${o.texto} desenhado em cima de ${Object.keys(o.sobreQuem).join(", ")} em ${Math.round(o.fracSobre * 100)}% (${o.estado})`);
    else maiorSobre = Math.max(maiorSobre, o.fracSobre);
  });
  notas.push(`imersiva, do olhar: nenhum texto desenhado em cima de outro objeto (maior: ${Math.round(maiorSobre * 100)}%, limite ${Math.round(LIMITE_SOBRE * 100)}%)`);
  if (erros.length) falhas.push(`IMERSIVA: erro na pagina: ${erros.slice(0, 3).join(" | ")}`);
  await page.close();

  // ---------------------------------------------------------------------- 2D
  const plano = agrupar();
  let estados2d = 0;
  for (const [W, H] of [[1920, 1080], [1536, 864], [1440, 900], [1366, 768], [1366, 657], [1280, 720], [1280, 650]]) {
    const p = await browser.newPage({ viewport: { width: W, height: H } });
    p.on("pageerror", (e) => erros.push(e.message));
    await p.addInitScript({ content: `(${instrumentarCanvas.toString()})();` });
    await p.goto(`http://127.0.0.1:${PORTA}/controle-2d.html`, { waitUntil: "load" });
    await p.waitForFunction(() => window.CONTROLE2D && window.CONTROLE2D.state.pronto);
    await p.waitForTimeout(200);
    const regs2 = await p.evaluate(() => DADOS.regioes.map((r) => r.id));
    for (const r of [null].concat(regs2))
      for (const k of inds)
        for (const a of [0, 3, 5, 7]) {
          const tarefa = a === 7;
          const res = await p.evaluate(
            ([r, k, a, tarefa, fonte]) => {
              const C = window.CONTROLE2D;
              C.fecharPainel();
              C.setFoco(null);
              C.trocarIndicador(k);
              if (r) C.abrirPainel(r);
              C.rolarParaAno(a);
              const L = document.getElementById("legenda");
              if (tarefa) {
                L.textContent = "TAREFA 1: Em que ano a evasão do Brasil foi mais alta?";
                L.classList.add("visivel");
              } else L.classList.remove("visivel");
              window.__cv.itens = [];
              window.__cv.ligado = true;
              window.dispatchEvent(new Event("resize"));
              window.__cv.ligado = false;
              // eslint-disable-next-line no-new-func
              return new Function(`return (${fonte})();`)();
            },
            [r, k, a, tarefa, analisar2d.toString()]
          );
          plano.add(res, `${W}x${H} ${r || "brasil"}/${k}/${2017 + a}${tarefa ? " com a pergunta" : ""}`);
          estados2d += 1;
        }
    await p.close();
  }
  const ach2d = plano.lista();
  ach2d.forEach((g) => falhas.push(`2D ${g.tipo}: ${g.a} x ${g.b} (${g.n} estado(s); ex.: ${g.ex})`));
  notas.push(`2D: ${estados2d} estados em 7 tamanhos de janela, ${ach2d.length} tipo(s) de sobreposicao`);

  const iJson = process.argv.indexOf("--json");
  if (iJson > 0 && process.argv[iJson + 1]) {
    fs.writeFileSync(process.argv[iJson + 1], JSON.stringify({ imersiva: achSup, olhar: Object.values(piores), plano: ach2d }, null, 1));
  }

  await browser.close();
  server.close();

  notas.forEach((n) => console.log(`  · ${n}`));
  console.log("");
  if (falhas.length) {
    console.error(`FALHOU (${falhas.length}):`);
    falhas.slice(0, 40).forEach((f) => console.error(`  ✗ ${f}`));
    process.exit(1);
  }
  console.log("sobreposicao: tudo verde.");
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
