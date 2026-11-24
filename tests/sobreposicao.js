// ----------------------------------------------------------------------------
// Nada em cima de nada (versao 1, a do mapa): varredura de sobreposicao.
//
//   node tests/sobreposicao.js              (precisa do playwright)
//   node tests/sobreposicao.js --rapido     (Brasil, regioes e 6 instituicoes)
//   node tests/sobreposicao.js --json r.json  (grava todos os achados)
//   node tests/sobreposicao.js --contextos ifrr,ifro  (so esses contextos)
//
// Mesma ideia do tests/sobreposicao.js da versao minimalista, adaptada as
// etapas desta versao. Percorre, sem fades nem animacoes:
//   - mapa (parado e com o cartao de cada regiao), drill das 5 regioes;
//   - indicadores de todos os contextos (Brasil, 5 regioes, 64 instituicoes),
//     sem e com o painel de cada medidor, e com o mini-mapa aberto;
//   - linha do tempo de todos os contextos x 4 indicadores x 8 anos (com a
//     comparacao ligada quando existe) e a abertura guiada momento a momento;
//   - composicao de todos os contextos x 8 anos; small multiples x 4;
//   - as cenas dos 3 tours.
// Em cada estado, do ponto de vista da camera (0 1,6 0):
//   1. mesma superficie: texto sobre texto, texto sobre blocos, texto que sai
//      do proprio fundo, texto coberto por um plano a frente, cartao do grafico
//      cobrindo a linha ou um ponto;
//   2. na tela: letras de um texto em cima das letras de outro (planos
//      diferentes, mas o mesmo lugar na imagem);
//   3. olhar: raios do olho ate as letras de cada texto - o que fica na frente
//      (texto tapado) e o que fica logo atras (texto desenhado em cima de uma
//      linha, ponto, anel ou bloco que nao e o fundo dele);
//   4. HUD 2D: em 3 tamanhos de janela, texto ou alvo clicavel da cena atras
//      dos paineis do HUD, paineis do HUD um em cima do outro e texto da cena
//      cortado pela borda da janela;
//   5. VR: HUD de VR e legenda (presos a cabeca, desenhados por cima de tudo)
//      um sobre o outro, texto saindo do fundo, e o que eles escondem do mundo
//      olhando para a frente (aviso).
// Tambem acusa letra que a fonte nao tem (some sem aviso) e posicao NaN.
//
// Fonte: o A-Frame busca a kelsonsans em cdn.aframe.io. Sem internet, aponte
// FONTE_LOCAL para uma pasta com KelsonSans.fnt e KelsonSans.png.
// ----------------------------------------------------------------------------

const { chromium } = require("playwright");
const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "..");
const PORTA = +process.env.PORTA || 4191;
const RAPIDO = process.argv.includes("--rapido");
const FONTE_LOCAL = process.env.FONTE_LOCAL || "";
// Fracao maxima das letras de um texto que pode ficar tapada/em cima de algo.
const LIMITE = 0.04;
// Janelas do HUD 2D: monitor, notebook comum e notebook com o navegador aberto.
const JANELAS = [[1920, 1080], [1366, 768], [1280, 650]];

const TIPOS = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".glb": "model/gltf-binary",
  ".fnt": "text/plain; charset=utf-8",
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

async function abrir(browser, W, H, query) {
  const page = await browser.newPage({ viewport: { width: W, height: H } });
  const erros = [];
  page.on("pageerror", (e) => erros.push(e.message));
  if (FONTE_LOCAL) {
    await page.route(/cdn\.aframe\.io\/fonts\//, (route) => {
      const f = path.join(FONTE_LOCAL, route.request().url().split("/").pop());
      if (fs.existsSync(f)) route.fulfill({ path: f, headers: { "access-control-allow-origin": "*" } });
      else route.abort();
    });
  }
  await page.addInitScript(() => {
    try {
      localStorage.setItem("vrlab.onboarded.v1", "1");
    } catch (e) {
      /* sem storage */
    }
  });
  await page.goto(`http://127.0.0.1:${PORTA}/index.html${query || ""}`, { waitUntil: "load" });
  await page.waitForFunction(() => typeof DADOS !== "undefined" && DADOS && document.getElementById("loadingOverlay").hidden, null, { timeout: 45000 });
  await page.waitForTimeout(600);
  return { page, erros };
}

// ===========================================================================
// Lado da pagina: medicao da cena (roda dentro do navegador).
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
      while (e && e.tagName && e.tagName !== "A-SCENE" && k < 6) {
        let s = e.id ? "#" + e.id : e.tagName.toLowerCase().replace(/^a-/, "");
        if (!e.id && e.classList && e.classList.length) s += "." + Array.from(e.classList).filter((c) => c !== "clickable" && c !== "hit").join(".");
        partes.unshift(s.replace(/\.$/, ""));
        if (e.id) break;
        e = e.parentElement;
        k += 1;
      }
      return partes.join(">");
    }
    function rotulo(it) {
      let s = caminho(it.el);
      if (it.texto) s += ` "${it.texto.replace(/\n/g, " / ").slice(0, 46)}"`;
      if (!it.ehTexto) s += ` [${it.tipo}]`;
      return s;
    }

    function coletar(raiz, excluir) {
      raiz.updateMatrixWorld(true);
      const itens = [];
      const nan = [];
      const fantasmas = []; // invisiveis (opacidade < 0,05) que ainda gravam profundidade
      let ordem = 0;
      raiz.traverse((o) => {
        if (o.isMesh || o.isInstancedMesh) o.__ordem = ordem++;
        if (!(o.isMesh || o.isInstancedMesh) || !visivel(o)) return;
        const el = elDe(o);
        if (!el || (excluir && excluir(el))) return;
        if (el.tagName === "A-SKY") return;
        if (!o.matrixWorld.elements.every(Number.isFinite)) {
          nan.push(caminho(el));
          return;
        }
        const m = Array.isArray(o.material) ? o.material[0] : o.material;
        if (!m || m.visible === false) return;
        const opac = m.transparent ? m.opacity : 1;
        if (opac < 0.05) {
          if (m.depthWrite !== false && m.depthTest !== false && o.geometry)
            fantasmas.push({ o, el, ehTexto: false, opac, tipo: "hitbox invisivel", transp: !!m.transparent, depthWrite: true, ro: o.renderOrder || 0 });
          return;
        }
        const g = o.geometry;
        if (!g) return;
        g.computeBoundingBox();
        const bb = g.boundingBox && g.boundingBox.clone();
        if (!bb || bb.isEmpty() || !isFinite(bb.min.x)) return;
        const ehTexto = el.tagName === "A-TEXT" && el.components.text && el.components.text.mesh === o;
        const texto = ehTexto ? String(el.getAttribute("value") || "") : null;
        if (ehTexto && !texto.trim()) return;
        if (ehTexto && (el.getAttribute("text") || {}).opacity === 0) return;
        const planar = bb.max.z - bb.min.z < 1e-5;
        const cantos = [];
        for (const x of [bb.min.x, bb.max.x])
          for (const y of [bb.min.y, bb.max.y])
            for (const z of planar ? [bb.min.z] : [bb.min.z, bb.max.z]) cantos.push(new THREE.Vector3(x, y, z).applyMatrix4(o.matrixWorld));
        const caixa = new THREE.Box3();
        cantos.forEach((c) => caixa.expandByPoint(c));
        const tipo = ehTexto ? "texto" : String(g.type || "mesh").replace("Buffer", "").replace("Geometry", "");
        const depthWrite = m.depthWrite !== false && m.depthTest !== false;
        itens.push({ o, el, ehTexto, texto, planar, opac, bb, cantos, caixa, tipo, transp: !!m.transparent, depthWrite, ro: o.renderOrder || 0 });
      });
      return { itens, nan, fantasmas };
    }

    // Letras: um quadrilatero por glifo (a geometria do bmfont tem 4 vertices
    // por letra). Cantos em coordenadas do mundo.
    function glifos(it) {
      if (it._gl) return it._gl;
      const pos = it.o.geometry.attributes.position;
      const k = pos.itemSize;
      const out = [];
      for (let i = 0; i + 3 < pos.count; i += 4) {
        const q = [];
        for (let j = 0; j < 4; j += 1) q.push(new THREE.Vector3(pos.array[(i + j) * k], pos.array[(i + j) * k + 1], k > 2 ? pos.array[(i + j) * k + 2] : 0).applyMatrix4(it.o.matrixWorld));
        out.push(q);
      }
      it._gl = out;
      return out;
    }

    // Plano de um item: origem, u, v, normal (a face visivel e o +Z local).
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
    function projetarPts(ref, pts) {
      let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity, d0 = Infinity, d1 = -Infinity;
      pts.forEach((p) => {
        const r = p.clone().sub(ref.c0);
        const x = r.dot(ref.u), y = r.dot(ref.v), d = r.dot(ref.n);
        x0 = Math.min(x0, x); x1 = Math.max(x1, x);
        y0 = Math.min(y0, y); y1 = Math.max(y1, y);
        d0 = Math.min(d0, d); d1 = Math.max(d1, d);
      });
      return { x0, x1, y0, y1, d0, d1 };
    }
    const inter = (a, b, min) => {
      const ix = Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0);
      const iy = Math.min(a.y1, b.y1) - Math.max(a.y0, b.y0);
      return ix > min && iy > min ? [ix, iy] : null;
    };
    // Retangulos das letras de `t`, no plano `ref` (encolhidos 15%: a caixa do
    // glifo inclui a margem do campo de distancia).
    function letrasNo(ref, t) {
      return glifos(t).map((q) => {
        const p = projetarPts(ref, q);
        const mx = (p.x1 - p.x0) * 0.15, my = (p.y1 - p.y0) * 0.15;
        return { x0: p.x0 + mx, x1: p.x1 - mx, y0: p.y0 + my, y1: p.y1 - my, d0: p.d0, d1: p.d1 };
      });
    }

    // 1. Mesma superficie.
    function planar(itens, opts) {
      opts = opts || {};
      const TOL = 0.045;
      const MIN = 0.003;
      const achados = [];
      const rec = (tipo, a, b, ij) => achados.push({ tipo, a: rotulo(a), b: rotulo(b), mm: ij ? [Math.round(ij[0] * 1000), Math.round(ij[1] * 1000)] : [0, 0] });
      itens.forEach((a) => {
        const ehCartao = opts.cartoes && opts.cartoes(a);
        if (!a.planar || (!a.ehTexto && !ehCartao)) return;
        const ref = referencial(a);
        if (ref.w < 1e-4 || ref.h < 1e-4) return;
        const perto = a.caixa.clone().expandByScalar(TOL + 0.01);
        const areaA = ref.w * ref.h;
        const caixaA = a.caixa.clone().expandByScalar(0.03);
        let letrasA = null;
        itens.forEach((b) => {
          if (b === a || !perto.intersectsBox(b.caixa)) return;
          if (b.planar && Math.abs(referencial(b).n.dot(ref.n)) < 0.97) return;
          const p = projetarPts(ref, b.cantos);
          if (p.d1 < -TOL || p.d0 > TOL) return;
          if (!b.planar) {
            if (p.d1 < -0.025 || p.d0 > 0.025) return;
            if (!caixaA.intersectsBox(b.caixa)) return;
          }
          const ij = inter({ x0: 0, x1: ref.w, y0: 0, y1: ref.h }, p, MIN);
          if (!ij) return;
          const contemA = p.x0 <= 0.002 && p.x1 >= ref.w - 0.002 && p.y0 <= 0.002 && p.y1 >= ref.h - 0.002;
          const areaB = (p.x1 - p.x0) * (p.y1 - p.y0);
          const dMeio = (p.d0 + p.d1) / 2;
          const frente = b.planar ? dMeio > 0.0005 : p.d1 > 0.004;
          const atras = b.planar ? dMeio < -0.0005 : p.d0 < -0.004 && p.d1 <= 0.004;
          if (ehCartao && !a.ehTexto) {
            if (atras && opts.marcas && opts.marcas(b)) rec("cartao-cobre-marca", a, b, ij);
            return;
          }
          if (!letrasA) letrasA = letrasNo(ref, a);
          // confirma letra a letra (a caixa de um texto de varias linhas tem cantos vazios)
          const alvoB = b.ehTexto ? letrasNo(ref, b) : [p];
          let hit = null;
          for (const la of letrasA) {
            for (const lb of alvoB) {
              hit = inter(la, lb, MIN);
              if (hit) break;
            }
            if (hit) break;
          }
          if (a.ehTexto && b.ehTexto) {
            if (hit && rotulo(a) < rotulo(b)) rec("texto-sobre-texto", a, b, hit);
            return;
          }
          if (b.tipo === "Box" && b.el.closest("#compScene") && hit) return rec("texto-sobre-blocos", a, b, hit);
          // anel, circulo, esfera, cilindro: a caixa engana (o furo do anel e
          // vazio) - quem decide e o teste do olhar, com os triangulos.
          if (!b.ehTexto && !/^(Plane|Box)$/.test(b.tipo)) return;
          if (frente && b.opac >= 0.3 && hit) return rec("texto-coberto", a, b, hit);
          if (atras || Math.abs(dMeio) <= 0.0005) {
            if (contemA && areaB >= 2.5 * areaA) return; // o fundo do proprio texto
            // todas as letras dentro de um plano/caixa atras: e o fundo dele
            if (/^(Plane|Box)$/.test(b.tipo) && letrasA.every((l) => l.x0 >= p.x0 - 0.002 && l.x1 <= p.x1 + 0.002 && l.y0 >= p.y0 - 0.002 && l.y1 <= p.y1 + 0.002)) return;
            if (b.opac < 0.3) return; // faixa translucida (brilho, banda de foco)
            if (areaB >= 2.5 * areaA) {
              // so e "sai do fundo" se alguma letra passa da borda do fundo
              const fora = letrasA.some((l) => l.x0 < p.x0 - 0.002 || l.x1 > p.x1 + 0.002 || l.y0 < p.y0 - 0.002 || l.y1 > p.y1 + 0.002);
              const dentro = letrasA.some((l) => inter(l, p, MIN));
              if (fora && dentro) rec("texto-sai-do-fundo", a, b, ij);
              return;
            }
            if (hit) rec("texto-sobre-elemento", a, b, hit);
          }
        });
      });
      return achados;
    }

    // 2. Na tela: letras de textos diferentes no mesmo lugar da imagem.
    function tela(itens, camera, W, H) {
      const achados = [];
      const textos = itens.filter((i) => i.ehTexto);
      const proj = (p) => {
        const v = p.clone().project(camera);
        return [((v.x + 1) / 2) * W, ((1 - v.y) / 2) * H, v.z];
      };
      const rects = textos.map((t) =>
        glifos(t).map((q) => {
          const ps = q.map(proj);
          const xs = ps.map((p) => p[0]), ys = ps.map((p) => p[1]);
          const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
          const mx = (x1 - x0) * 0.15, my = (y1 - y0) * 0.15;
          return { x0: x0 + mx, x1: x1 - mx, y0: y0 + my, y1: y1 - my, atras: ps.some((p) => p[2] > 1) };
        })
      );
      const caixa = rects.map((rs) => rs.reduce((a, r) => ({ x0: Math.min(a.x0, r.x0), x1: Math.max(a.x1, r.x1), y0: Math.min(a.y0, r.y0), y1: Math.max(a.y1, r.y1) }), { x0: Infinity, x1: -Infinity, y0: Infinity, y1: -Infinity }));
      for (let i = 0; i < textos.length; i += 1)
        for (let j = i + 1; j < textos.length; j += 1) {
          if (!inter(caixa[i], caixa[j], 0.5)) continue;
          let hit = null;
          for (const a of rects[i]) {
            if (a.atras) continue;
            for (const b of rects[j]) {
              if (b.atras) continue;
              hit = inter(a, b, 0.5);
              if (hit) break;
            }
            if (hit) break;
          }
          if (hit) {
            const [a, b] = [rotulo(textos[i]), rotulo(textos[j])].sort();
            achados.push({ tipo: "letras-na-mesma-posicao-da-tela", a, b, px: [Math.round(hit[0]), Math.round(hit[1])] });
          }
        }
      return achados;
    }

    // 3. Olhar: raios do olho ate as letras.
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
    // Fundo de um texto: plano ou caixa (nunca anel, esfera ou linha fina)
    // cuja face contem o centro do texto.
    function seguraTexto(t, obj, item) {
      if (!item || !/^(Plane|Box)$/.test(item.tipo)) return false;
      const ref = referencial(t);
      const centro = ref.c0.clone().addScaledVector(ref.u, ref.w / 2).addScaledVector(ref.v, ref.h / 2);
      const p = projetarPts(ref, item.cantos);
      const cx = centro.clone().sub(ref.c0).dot(ref.u), cy = centro.clone().sub(ref.c0).dot(ref.v);
      const fino = Math.min(p.x1 - p.x0, p.y1 - p.y0) < 0.03; // linha de grade, guia
      return !fino && cx >= p.x0 - 0.005 && cx <= p.x1 + 0.005 && cy >= p.y0 - 0.005 && cy <= p.y1 + 0.005;
    }
    // Um plano translucido A, na frente do texto T, apaga T onde o cobre se A
    // for desenhado ANTES de T e escrever profundidade: T falha no teste de
    // profundidade. Com sortTransparentObjects: false (padrao do A-Frame 1.5)
    // a ordem dos transparentes e a da cena; com true, do mais longe ao mais perto.
    function desenhadoAntes(a, t, camera, ordenaPorDistancia) {
      if (a.ro !== t.ro) return a.ro < t.ro;
      if (!a.transp) return true; // opacos vem antes de todos os transparentes
      if (!ordenaPorDistancia) return a.o.__ordem < t.o.__ordem;
      const za = new THREE.Vector3().setFromMatrixPosition(a.o.matrixWorld).project(camera).z;
      const zt = new THREE.Vector3().setFromMatrixPosition(t.o.matrixWorld).project(camera).z;
      return za > zt;
    }
    function oclusao(itens, olho, fantasmas) {
      const cena = document.querySelector("a-scene");
      const ordenaPorDistancia = !!(cena.getAttribute("renderer") || {}).sortTransparentObjects;
      const rc = new THREE.Raycaster();
      const todos = itens.concat(fantasmas || []);
      const alvos = todos.map((i) => (i.ehTexto ? procuracao(i) : i.o));
      alvos.forEach((o, k) => (o.__idx = k));
      const out = [];
      itens
        .filter((i) => i.ehTexto)
        .forEach((t) => {
          const ref = referencial(t);
          const centro = ref.c0.clone().addScaledVector(ref.u, ref.w / 2).addScaledVector(ref.v, ref.h / 2);
          if (olho.clone().sub(centro).dot(ref.n) <= 0) return; // de costas
          const meu = procuracao(t);
          const gl = glifos(t);
          const passo = Math.max(1, Math.floor(gl.length / 24));
          let total = 0, cobertos = 0, sobre = 0, apagados = 0;
          const por = {}, sobreQuem = {}, apagadoPor = {};
          for (let g = 0; g < gl.length; g += passo) {
            const q = gl[g];
            const p = q[0].clone().add(q[1]).add(q[2]).add(q[3]).multiplyScalar(0.25);
            const dir = p.clone().sub(olho);
            const dist = dir.length();
            dir.normalize();
            total += 1;
            rc.set(olho, dir);
            rc.near = 0;
            rc.far = dist - 0.004;
            const frente = rc.intersectObjects(alvos, false).filter((h) => h.object !== meu && h.object !== t.o);
            const hits = frente.filter((h) => h.object.__idx < itens.length && itens[h.object.__idx].opac >= 0.3);
            if (hits.length) {
              cobertos += 1;
              const nm = rotulo(itens[hits[0].object.__idx]);
              por[nm] = (por[nm] || 0) + 1;
            } else {
              const ap = frente.find((h) => {
                const a = todos[h.object.__idx];
                return !a.ehTexto && a.transp && a.opac < 0.5 && a.depthWrite && desenhadoAntes(a, t, cena.camera, ordenaPorDistancia);
              });
              if (ap) {
                apagados += 1;
                const nm = rotulo(todos[ap.object.__idx]);
                apagadoPor[nm] = (apagadoPor[nm] || 0) + 1;
              }
            }
            rc.near = dist + 0.002;
            rc.far = dist + 0.12;
            const atras = rc.intersectObjects(alvos, false).filter((h) => h.object !== meu && h.object !== t.o && h.object.__idx < itens.length && !itens[h.object.__idx].ehTexto && itens[h.object.__idx].opac >= 0.3);
            if (atras.length && !seguraTexto(t, atras[0].object, itens[atras[0].object.__idx])) {
              sobre += 1;
              const nm = rotulo(itens[atras[0].object.__idx]);
              sobreQuem[nm] = (sobreQuem[nm] || 0) + 1;
            }
          }
          if (cobertos || sobre || apagados) out.push({ texto: rotulo(t), frac: +(cobertos / total).toFixed(2), por, fracSobre: +(sobre / total).toFixed(2), sobreQuem, fracApagado: +(apagados / total).toFixed(2), apagadoPor });
        });
      return out;
    }

    // Marcas de dados transparentes (arco do medidor, linha, anel, mapa...)
    // apagadas pela ordem de desenho: um transparente que grava profundidade
    // (inclusive hitbox invisivel), desenhado antes e na frente, faz a marca
    // falhar no teste de profundidade. Opacos sao desenhados antes de todos os
    // transparentes e nunca sao apagados assim.
    const DADOS_SEL = "#indicatorObjects, #trendLine, #markers, #compareBars, #compScene, #multiplosGrid, #mapPanel, #miniMapPanel, #annotations, #efficacyPanel";
    function dadosApagados(itens, olho, fantasmas) {
      const cena = document.querySelector("a-scene");
      const ordenaPorDistancia = !!(cena.getAttribute("renderer") || {}).sortTransparentObjects;
      const todos = itens.concat(fantasmas || []);
      const objs = todos.map((i) => (i.ehTexto ? procuracao(i) : i.o));
      objs.forEach((o, k) => (o.__idx2 = k));
      const rc = new THREE.Raycaster();
      const out = [];
      itens
        .filter((i) => !i.ehTexto && i.transp && i.opac >= 0.3 && i.el.closest(DADOS_SEL))
        .forEach((alvo) => {
          let total = 0, apagados = 0;
          const quem = {};
          const bb = alvo.caixa;
          for (const fx of [0.2, 0.5, 0.8])
            for (const fy of [0.2, 0.5, 0.8]) {
              const p = new THREE.Vector3(bb.min.x + (bb.max.x - bb.min.x) * fx, bb.min.y + (bb.max.y - bb.min.y) * fy, (bb.min.z + bb.max.z) / 2);
              const dir = p.clone().sub(olho).normalize();
              rc.set(olho, dir);
              rc.near = 0;
              rc.far = 60;
              const meu = rc.intersectObject(alvo.o, false)[0];
              if (!meu) continue;
              total += 1;
              rc.far = meu.distance - 0.002;
              const ap = rc.intersectObjects(objs, false).find((h) => {
                const a = todos[h.object.__idx2];
                // so translucido/invisivel: um opaco na frente e oclusao normal
                // So o que e translucido de verdade (ou invisivel): um opaco - ou
                // quase (0,9) - na frente e oclusao normal, nao erro de ordem.
                return a !== alvo && !a.ehTexto && a.transp && a.opac < 0.5 && a.depthWrite && desenhadoAntes(a, alvo, cena.camera, ordenaPorDistancia);
              });
              if (ap) {
                apagados += 1;
                const nm = rotulo(todos[ap.object.__idx2]);
                quem[nm] = (quem[nm] || 0) + 1;
              }
            }
          if (apagados && total) out.push({ alvo: rotulo(alvo), frac: +(apagados / total).toFixed(2), quem });
        });
      return out;
    }

    // Exporta, em coordenadas do mundo, o que importa para o HUD 2D: as letras
    // de cada texto (caixas por linha) e as caixas dos alvos clicaveis.
    function exportar(itens) {
      const r3 = (v) => [+v.x.toFixed(3), +v.y.toFixed(3), +v.z.toFixed(3)];
      const textos = itens
        .filter((i) => i.ehTexto)
        .map((t) => ({ nome: rotulo(t), q: glifos(t).filter((_, k, a) => k % Math.max(1, Math.floor(a.length / 40)) === 0).map((q) => q.map(r3)) }));
      const alvos = [];
      document.querySelectorAll(".clickable").forEach((el) => {
        const o = el.getObject3D("mesh");
        if (!o || !visivel(o) || el.closest("#cameraRig")) return;
        const g = o.geometry;
        g.computeBoundingBox();
        const bb = g.boundingBox;
        const cs = [];
        for (const x of [bb.min.x, bb.max.x]) for (const y of [bb.min.y, bb.max.y]) for (const z of [bb.min.z, bb.max.z]) cs.push(r3(new THREE.Vector3(x, y, z).applyMatrix4(o.matrixWorld)));
        alvos.push({ nome: caminho(el), c: cs });
      });
      return { textos, alvos };
    }

    // Letras que a fonte nao tem: o bmfont pula o caractere sem avisar.
    // Rotulos marcados com data-linha-unica precisam caber em 1 linha (letra
    // larga em caixa alta quebra antes do wrap-count).
    function linhasQuebradas(raiz) {
      const out = [];
      raiz.traverse((o) => {
        const el = o.el;
        if (!el || el.tagName !== "A-TEXT" || !el.hasAttribute("data-linha-unica") || !visivel(o)) return;
        const c = el.components.text;
        if (!c || !c.mesh || c.mesh !== o) return;
        const v = String(el.getAttribute("value") || "");
        if (!v.trim()) return;
        const pos = o.geometry.attributes.position;
        if (!pos) return;
        const k = pos.itemSize;
        const ys = new Set();
        for (let i = 0; i + 3 < pos.count; i += 4) {
          let y = 0;
          for (let j = 0; j < 4; j += 1) y += pos.array[(i + j) * k + 1];
          ys.add(Math.round(y / 4 / 8)); // linhas ~ 60 unidades da fonte
        }
        // agrupa linhas vizinhas (letras com descendente)
        const ord = [...ys].sort((a, b) => a - b);
        let linhas = ord.length ? 1 : 0;
        for (let i = 1; i < ord.length; i += 1) if (ord[i] - ord[i - 1] > 3) linhas += 1;
        if (linhas > 1) out.push({ a: caminho(el), texto: v.slice(0, 60), linhas });
      });
      return out;
    }

    function letrasFaltando(raiz) {
      const out = [];
      raiz.traverse((o) => {
        const el = o.el;
        if (!el || el.tagName !== "A-TEXT" || !visivel(o)) return;
        const c = el.components.text;
        const fonte = c && c.currentFont;
        const v = String(el.getAttribute("value") || "");
        if (!fonte || !v) return;
        if (!fonte.__ids) fonte.__ids = new Set(fonte.chars.map((ch) => ch.id));
        const faltam = [...new Set([...v].filter((ch) => ch !== "\n" && !fonte.__ids.has(ch.codePointAt(0))))];
        if (faltam.length) out.push({ a: caminho(el), faltam: faltam.join(""), texto: v.slice(0, 60) });
      });
      return out;
    }

    return { coletar, planar, tela, oclusao, dadosApagados, exportar, letrasFaltando, linhasQuebradas, rotulo, referencial, projetarPts, glifos, inter };
  })();
}

// ===========================================================================
// Lado da pagina: leva o app a cada estado sem fades nem animacoes.
// ===========================================================================
function libEstados() {
  // Animacoes com duracao zero (menos as de laco, como o giro dos aneis).
  const P = AFRAME.components.animation.Component.prototype;
  const upd = P.updateConfig;
  P.updateConfig = function () {
    if (!this.data.loop) {
      this.data.dur = 0;
      this.data.delay = 0;
    }
    return upd.apply(this, arguments);
  };
  window.animateViewIn = function (v) {
    if (!v) return;
    v.removeAttribute("animation__in");
    setVectorAttribute(v, "position", "0 0 0");
  };
  const fe = window.fadeEntity;
  window.fadeEntity = (e, s) => fe(e, s, 1);
  window.wait = () => Promise.resolve();
  // Abertura guiada: a fala so termina quando o teste manda (window.__prox()).
  window.narrateText = (text, token) =>
    new Promise((res) => {
      if (token && token !== state.guidedToken) return res();
      setCaption(text);
      window.__prox = () => {
        window.__prox = null;
        setCaption("");
        res();
      };
    });

  const quadro = () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => setTimeout(r, 0))));
  const ctxPorId = (id) => {
    if (id === "brasil") return DADOS.brasil;
    for (const r of DADOS.regioes) {
      if (r.id === id) return r;
      const i = r.instituicoes.find((x) => x.id === id);
      if (i) return i;
    }
    return null;
  };
  const maeDe = (ctx) => (ctx && ctx.tipo === "instituicao" ? DADOS.regioes.find((r) => r.instituicoes.includes(ctx)) : null);
  function mundo(qual) {
    setEntityVisible(dom.selectionWorld, qual === "sel");
    setEntityVisible(dom.explorationWorld, qual === "exp");
  }
  function limpar() {
    state.guidedToken += 1;
    state.guided = false;
    if (window.__prox) window.__prox();
    ["indicatorView", "timelineView", "composicaoView", "multiplosView", "tourPanel", "tourControls", "guidedQuestions"].forEach((k) => dom[k] && setEntityVisible(dom[k], false));
    hideInfoPanelNow();
    showIndicatorLinks(false);
    stopVisceral();
    state.tourActive = false;
    state.compareOn = false;
    dom.tourBar.hidden = true;
    dom.hudLegend.hidden = true;
    dom.compLegend.hidden = true;
    setCaption("");
    setEntityVisible(dom.vrHud, false);
    if (state.miniMapOpen) closeMiniMap();
  }
  function usarContexto(ctx) {
    state.context = ctx;
    state.parentRegion = maeDe(ctx);
    state.drillRegion = null;
    state.compareContext = resolveCompareContext(ctx);
    state.compareOn = false;
  }
  const E = {
    async mapa(reg) {
      limpar();
      mundo("sel");
      state.stage = "selection";
      setEntityVisible(dom.drillCards, false);
      setEntityVisible(dom.drillBack, false);
      showMapSelection();
      setInteractionMode("selection");
      if (reg) showRegionPreview(ctxPorId(reg));
      await quadro();
    },
    async drill(reg) {
      limpar();
      mundo("sel");
      openDrill(ctxPorId(reg));
      await quadro();
    },
    async indicadores(id, info, miniMapa) {
      limpar();
      mundo("exp");
      const ctx = ctxPorId(id);
      usarContexto(ctx);
      state.stage = "indicators";
      setEntityVisible(dom.indicatorView, true);
      populateIndicators(ctx);
      setInteractionMode("indicators");
      if (info) {
        showInfoPanel(indicadorByKey(info));
        dom.infoPanel.removeAttribute("animation__open");
        setVectorAttribute(dom.infoPanel, "scale", "0.85 0.85 0.85");
      }
      if (miniMapa) E.miniMapaAberto();
      await quadro();
    },
    // abre o mini-mapa e ja o poe no lugar final (sem esperar a animacao)
    miniMapaAberto() {
      openMiniMap();
      const b = dom.miniMapBase;
      b.removeAttribute("animation__pos");
      b.removeAttribute("animation__scale");
      const alvo = MINI_MAPA.aberto; // app.js
      setVectorAttribute(b, "position", alvo.pos);
      setVectorAttribute(b, "scale", alvo.esc);
    },
    async linha(id, key, comparar) {
      limpar();
      mundo("exp");
      usarContexto(ctxPorId(id));
      enterTimeline(key, true);
      if (comparar && state.compareContext) toggleCompare();
      await quadro();
      return DADOS.anos.length;
    },
    async ano(i) {
      state.yearIdx = i;
      updateYear();
      await quadro();
    },
    async guiada(id, key) {
      limpar();
      mundo("exp");
      usarContexto(ctxPorId(id));
      enterTimeline(key, false);
      await quadro();
      return !!window.__prox;
    },
    async proximoMomento() {
      if (window.__prox) window.__prox();
      await quadro();
      await quadro();
      return state.guided && !!window.__prox;
    },
    async composicao(id) {
      limpar();
      mundo("exp");
      usarContexto(ctxPorId(id));
      enterComposicao();
      await quadro();
    },
    async compAno(i) {
      selectCompYear(i);
      await quadro();
    },
    async multiplos(key) {
      limpar();
      mundo("exp");
      await enterMultiplos(key, true);
      await quadro();
    },
    async tour(id, n) {
      limpar();
      mundo("exp");
      state.tourActive = true;
      state.tourId = id;
      state.tourScenes = TOURS[id].cenas;
      await tourGoTo(n, true);
      await quadro();
      return TOURS[id].cenas.length;
    },
    async vr(ligado, legenda) {
      // como no enter-vr: HUD de VR ligado; a legenda (se houver) vai para a
      // 3D e o HUD se esconde enquanto ela aparece (setCaption).
      setEntityVisible(dom.vrHud, ligado);
      if (typeof setCaption === "function") setCaption(legenda || "", ligado);
      await quadro();
    },
    hud() {
      return {
        t: dom.hudTitle.textContent,
        s: dom.hudSubtitle.textContent,
        c: dom.breadcrumb.textContent,
        nt: dom.notaTitle.textContent,
        nb: dom.notaBody.textContent,
        lg: dom.hudLegend.hidden ? null : [dom.legendPrimary.textContent, dom.legendCompare.textContent],
        cl: !dom.compLegend.hidden,
        tb: dom.tourBar.hidden ? null : [dom.tourBarLabel.textContent, dom.tourBarStep.textContent],
        lg2: document.getElementById("legenda2d") && !document.getElementById("legenda2d").hidden ? document.getElementById("legenda2d").textContent : null,
      };
    },
  };
  window.__estado = E;
}

// ===========================================================================
// Lado da pagina: HUD 2D (DOM) num estado dado.
// ===========================================================================
function medirHud(h, notaAberta) {
  const $ = (id) => document.getElementById(id);
  const nota = $("notaPanel");
  // A nota "Como ler" abre por alguns segundos ao entrar numa etapa e depois
  // se recolhe (so o titulo). O repouso e o recolhido; aberta e um aviso.
  if (nota) nota.classList.toggle("is-recolhida", !notaAberta);
  const l2 = $("legenda2d");
  if (l2) {
    l2.hidden = !h.lg2;
    l2.textContent = h.lg2 || "";
  }
  $("hudTitle").textContent = h.t;
  $("hudSubtitle").textContent = h.s;
  $("breadcrumb").textContent = h.c;
  $("notaTitle").textContent = h.nt;
  $("notaBody").textContent = h.nb;
  $("hudLegend").hidden = !h.lg;
  if (h.lg) {
    $("legendPrimary").textContent = h.lg[0];
    $("legendCompare").textContent = h.lg[1];
  }
  $("compLegend").hidden = !h.cl;
  $("tourBar").hidden = !h.tb;
  if (h.tb) {
    $("tourBarLabel").textContent = h.tb[0];
    $("tourBarStep").textContent = h.tb[1];
  }
  const caixas = {};
  const pegar = (nome, el) => {
    if (!el) return;
    const s = getComputedStyle(el);
    if (el.hidden || s.display === "none" || s.visibility === "hidden") return;
    const r = el.getBoundingClientRect();
    if (r.width < 1 || r.height < 1) return;
    caixas[nome] = { x0: r.left, y0: r.top, x1: r.right, y1: r.bottom };
  };
  pegar("painel do topo (.brand-panel)", document.querySelector(".brand-panel"));
  pegar("nota 'Como ler' (#notaPanel)", $("notaPanel"));
  pegar("legenda da comparacao (#hudLegend)", $("hudLegend"));
  pegar("legenda da composicao (#compLegend)", $("compLegend"));
  pegar("barra do tour (#tourBar)", $("tourBar"));
  pegar("botao ? (#helpBtn)", $("helpBtn"));
  pegar("botao VR do A-Frame", document.querySelector(".a-enter-vr-button"));
  pegar("legenda da narracao (#legenda2d)", $("legenda2d"));
  return { caixas, W: innerWidth, H: innerHeight };
}

// ===========================================================================
// Node: projecao da camera do desktop (0 1,6 0, olhando para -Z, fov 80).
// ===========================================================================
const TAN = Math.tan((40 * Math.PI) / 180);
function projetar(p, W, H) {
  const vx = p[0], vy = p[1] - 1.6, vz = p[2];
  if (vz >= -0.01) return null;
  const a = W / H;
  return [((vx / -vz / (TAN * a) + 1) / 2) * W, ((1 - vy / -vz / TAN) / 2) * H];
}
function retDe(pts, W, H) {
  const ps = pts.map((p) => projetar(p, W, H)).filter(Boolean);
  if (ps.length < pts.length) return null;
  const xs = ps.map((p) => p[0]), ys = ps.map((p) => p[1]);
  return { x0: Math.min(...xs), x1: Math.max(...xs), y0: Math.min(...ys), y1: Math.max(...ys) };
}
const interR = (a, b, m) => {
  const ix = Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0);
  const iy = Math.min(a.y1, b.y1) - Math.max(a.y0, b.y0);
  return ix > m && iy > m ? [Math.round(ix), Math.round(iy)] : null;
};

function agrupar() {
  const g = {};
  return {
    add(lista, estado) {
      lista.forEach((a) => {
        const k = `${a.tipo} | ${String(a.a).replace(/ ".*?"/, "")} | ${String(a.b).replace(/ ".*?"/, "")}`;
        if (!g[k]) g[k] = { tipo: a.tipo, a: a.a, b: a.b, n: 0, ex: estado, med: a.mm || a.px };
        g[k].n += 1;
      });
    },
    lista: () => Object.values(g).sort((x, y) => y.n - x.n),
  };
}

// ===========================================================================

module.exports = { servir, abrir, libCena, libEstados, medirHud };
if (require.main === module) principal();

async function principal() {
  const t0 = Date.now();
  const server = await servir();
  const browser = await chromium.launch({ args: ["--enable-unsafe-swiftshader", "--use-gl=swiftshader", "--ignore-gpu-blocklist"] });
  const falhas = [];
  const avisos = [];
  const notas = [];

  // Janela pequena 16:9 (o SwiftShader desenha cada quadro na CPU); a medicao
  // "na tela" usa uma tela virtual de 1366x768 com a mesma proporcao.
  const { page, erros } = await abrir(browser, 480, 270, "?aa=0");
  await page.addScriptTag({ content: `(${libCena.toString()})();(${libEstados.toString()})();` });

  const ids = await page.evaluate(() => {
    const inst = DADOS.regioes.flatMap((r) => r.instituicoes.map((i) => ({ id: i.id, n: (i.sigla || "").length + i.nome.length })));
    return { regs: DADOS.regioes.map((r) => r.id), inst, ind: DADOS.indicadores.map((i) => i.key), anos: DADOS.anos.length };
  });
  // --rapido: as 6 instituicoes de nome mais longo (o pior caso de texto).
  const insts = RAPIDO ? ids.inst.sort((a, b) => b.n - a.n).slice(0, 6).map((i) => i.id) : ids.inst.map((i) => i.id);
  // --contextos a,b: so esses (para repetir um caso depressa)
  const iCtx = process.argv.indexOf("--contextos");
  const contextos = iCtx > 0 && process.argv[iCtx + 1] ? process.argv[iCtx + 1].split(",") : ["brasil", ...ids.regs, ...insts];

  const sup = agrupar(); // mesma superficie + tela
  const olhar = {}; // pior caso por texto
  const faltando = {};
  const nans = new Set();
  const quebradas = {};
  const apagadosDados = {};
  const capturas = []; // { hud, cena } para o HUD 2D
  let estados = 0;

  async function medir(nome, opts) {
    opts = opts || {};
    const r = await page.evaluate(
      ([exportar]) => {
        const S = window.__sobre;
        const cena = document.querySelector("a-scene");
        const { itens, nan, fantasmas } = S.coletar(cena.object3D, (el) => !!el.closest("#cameraRig"));
        const W = 1366, H = 768;
        const p = S.planar(itens, {
          cartoes: (it) => !!it.el.closest("[data-callout]") && it.tipo === "Plane" && it.opac > 0.9 && S.referencial(it).w > 1,
          marcas: (it) => !!(it.el.closest("#markers") || it.el.closest("#trendLine") || it.el.closest("#compareBars")),
        });
        const t = S.tela(itens, cena.camera, W, H);
        const o = S.oclusao(itens, new AFRAME.THREE.Vector3(0, 1.6, 0), fantasmas);
        const da = S.dadosApagados(itens, new AFRAME.THREE.Vector3(0, 1.6, 0), fantasmas);
        const f = S.letrasFaltando(cena.object3D);
        const lq = S.linhasQuebradas(cena.object3D);
        return { p, t, o, da, f, lq, nan, hud: window.__estado.hud(), cena: exportar ? S.exportar(itens) : null };
      },
      [!opts.semHud]
    );
    estados += 1;
    if (estados % 50 === 0) process.stderr.write(`  ... ${estados} estados (${nome}), ${Math.round((Date.now() - t0) / 1000)} s\n`);
    sup.add(r.p, nome);
    sup.add(r.t, nome);
    r.o.forEach((o) => {
      const k = o.texto.replace(/ ".*?"/, "");
      const v = olhar[k] || (olhar[k] = { texto: o.texto, frac: 0, fracSobre: 0, fracApagado: 0, por: {}, sobreQuem: {}, apagadoPor: {}, ex: nome, exSobre: nome, exApagado: nome });
      if (o.frac > v.frac) Object.assign(v, { frac: o.frac, por: o.por, ex: nome });
      if (o.fracApagado > v.fracApagado) Object.assign(v, { fracApagado: o.fracApagado, apagadoPor: o.apagadoPor, exApagado: nome });
      if (o.fracSobre > v.fracSobre) Object.assign(v, { fracSobre: o.fracSobre, sobreQuem: o.sobreQuem, exSobre: nome });
    });
    r.f.forEach((f) => {
      const k = f.a.replace(/>a-text$/, "") + " " + f.faltam;
      if (!faltando[k]) faltando[k] = Object.assign({ ex: nome }, f);
    });
    r.nan.forEach((n) => nans.add(n));
    r.da.forEach((d) => {
      const k = d.alvo.replace(/ ".*?"/, "");
      if (!apagadosDados[k] || d.frac > apagadosDados[k].frac) apagadosDados[k] = Object.assign({ ex: nome }, d);
    });
    r.lq.forEach((q) => {
      const k = q.a;
      if (!quebradas[k]) quebradas[k] = Object.assign({ ex: nome }, q);
    });
    if (r.cena) capturas.push({ nome, hud: r.hud, cena: r.cena });
  }

  const E = (fn, ...args) => page.evaluate(([fn, args]) => window.__estado[fn](...args), [fn, args]);

  // ---- mapa e drill
  await E("mapa", null);
  await medir("mapa");
  for (const r of ids.regs) {
    await E("mapa", r);
    await medir(`mapa + cartao ${r}`);
  }
  for (const r of ids.regs) {
    await E("drill", r);
    await medir(`drill ${r}`);
  }
  // ---- indicadores
  for (const c of contextos) {
    await E("indicadores", c, null, false);
    await medir(`indicadores ${c}`);
    for (const k of ids.ind) {
      await E("indicadores", c, k, false);
      await medir(`indicadores ${c} + painel ${k}`, { semHud: c !== "brasil" && !ids.regs.includes(c) });
    }
  }
  await E("indicadores", "brasil", null, true);
  await medir("indicadores brasil + mini-mapa aberto");
  // ---- linha do tempo
  for (const c of contextos) {
    for (const k of ids.ind) {
      const n = await E("linha", c, k, c !== "brasil");
      for (let a = 0; a < n; a += 1) {
        await E("ano", a);
        await medir(`linha ${c}/${k}/${2017 + a}${c !== "brasil" ? " comparando" : ""}`);
      }
    }
  }
  await E("linha", "brasil", "evasao", false);
  await E("ano", 7);
  await page.evaluate(() => window.__estado.miniMapaAberto());
  await page.waitForTimeout(100);
  await medir("linha brasil/evasao + mini-mapa aberto");
  // ---- abertura guiada (momento a momento)
  const guiados = RAPIDO ? ["brasil", ids.regs[0]] : ["brasil", ...ids.regs];
  let momentos = 0;
  for (const c of guiados) {
    for (const k of ids.ind) {
      let ativo = await E("guiada", c, k);
      let m = 0;
      while (ativo && m < 12) {
        await medir(`abertura guiada ${c}/${k} momento ${m + 1}`);
        momentos += 1;
        ativo = await E("proximoMomento");
        m += 1;
      }
    }
  }
  // ---- composicao
  for (const c of contextos) {
    await E("composicao", c);
    for (let a = 0; a < ids.anos; a += 1) {
      await E("compAno", a);
      await medir(`composicao ${c}/${2017 + a}`);
    }
  }
  // ---- small multiples
  for (const k of ids.ind) {
    await E("multiplos", k);
    await medir(`comparar regioes ${k}`);
  }
  // ---- tours
  const tours = await page.evaluate(() => Object.keys(TOURS));
  for (const t of tours) {
    const n = await E("tour", t, 0);
    for (let i = 0; i < n; i += 1) {
      await E("tour", t, i);
      await medir(`tour ${t} cena ${i + 1}`);
    }
  }

  // ---- VR: HUD de VR e legenda (presos a cabeca, por cima de tudo)
  const vr = await (async () => {
    const out = { sup: agrupar(), escondidos: {} };
    const casos = [
      ["mapa", () => E("mapa", null)],
      ["indicadores brasil", () => E("indicadores", "brasil", null, false)],
      ["linha brasil/evasao", () => E("linha", "brasil", "evasao", false)],
      ["composicao brasil", () => E("composicao", "brasil")],
      ["comparar regioes", () => E("multiplos", "eficiencia")],
    ];
    const falas = await page.evaluate(() => {
      const f = [""];
      ["brasil", "norte"].forEach((id) => {
        const ctx = id === "brasil" ? DADOS.brasil : DADOS.regioes.find((r) => r.id === id);
        DADOS.indicadores.forEach((i) => {
          f.push(computeNarrative(ctx, i.key).fala);
          computeMomentos(ctx, i.key).forEach((m) => f.push(m.fala));
        });
      });
      return [...new Set(f)].sort((a, b) => b.length - a.length).slice(0, 3).concat([""]);
    });
    for (const [nome, ir] of casos) {
      await ir();
      for (const fala of [falas[0], falas[falas.length - 1]]) {
        await E("vr", true, fala);
        const r = await page.evaluate(() => {
          const S = window.__sobre;
          const THREE = AFRAME.THREE;
          const cena = document.querySelector("a-scene");
          const rig = document.getElementById("cameraRig");
          const hud = S.coletar(rig.object3D).itens.filter((i) => i.el.closest("#vrHud") || i.el.closest("#captionPanel"));
          const p = S.planar(hud);
          // angulos (azimute, elevacao) a partir do olho, olhando para -Z
          const olho = new THREE.Vector3(0, 1.6, 0);
          const ang = (v) => {
            const d = v.clone().sub(olho);
            return [(Math.atan2(d.x, -d.z) * 180) / Math.PI, (Math.atan2(d.y, Math.hypot(d.x, d.z)) * 180) / Math.PI];
          };
          const retAng = (pts) => {
            const a = pts.map(ang);
            return { x0: Math.min(...a.map((q) => q[0])), x1: Math.max(...a.map((q) => q[0])), y0: Math.min(...a.map((q) => q[1])), y1: Math.max(...a.map((q) => q[1])) };
          };
          const fundos = hud.filter((i) => !i.ehTexto && i.planar && i.opac >= 0.5).map((i) => ({ nome: S.rotulo(i), r: retAng(i.cantos) }));
          const cap = fundos.find((f) => f.nome.includes("captionPanel"));
          const hudBg = fundos.find((f) => f.nome.includes("vrHud") && f.r.y1 - f.r.y0 > 5);
          const pares = [];
          if (cap && hudBg) {
            const hudTextos = hud.filter((i) => i.ehTexto && i.el.closest("#vrHud"));
            hudTextos.forEach((t) => {
              const rt = retAng(S.glifos(t).flat());
              const ix = Math.min(rt.x1, cap.r.x1) - Math.max(rt.x0, cap.r.x0);
              const iy = Math.min(rt.y1, cap.r.y1) - Math.max(rt.y0, cap.r.y0);
              if (ix > 0.2 && iy > 0.2) pares.push({ tipo: "vr-legenda-cobre-hud", a: S.rotulo(t), b: cap.nome, px: [+ix.toFixed(1), +iy.toFixed(1)] });
            });
          }
          // o que o HUD/legenda escondem do mundo (olhando para a frente)
          const mundo = S.coletar(cena.object3D, (el) => !!el.closest("#cameraRig")).itens;
          const esc = [];
          mundo
            .filter((i) => i.ehTexto || i.el.classList.contains("clickable"))
            .forEach((i) => {
              const ri = retAng(i.ehTexto ? S.glifos(i).flat() : i.cantos);
              fundos.forEach((f) => {
                const ix = Math.min(ri.x1, f.r.x1) - Math.max(ri.x0, f.r.x0);
                const iy = Math.min(ri.y1, f.r.y1) - Math.max(ri.y0, f.r.y0);
                if (ix > 0.3 && iy > 0.3) esc.push(`${S.rotulo(i)} sob ${f.nome.split(" ")[0]}`);
              });
            });
          return { p, pares, esc, faixas: fundos.map((f) => `${f.nome.split(" ")[0]} ${f.r.y1.toFixed(1)}..${f.r.y0.toFixed(1)} graus, ${f.r.x0.toFixed(1)}..${f.r.x1.toFixed(1)}`) };
        });
        out.sup.add(r.p, `VR ${nome}${fala ? " com legenda" : ""}`);
        out.sup.add(r.pares, `VR ${nome} com legenda`);
        r.esc.forEach((e) => (out.escondidos[e] = nome));
        out.faixas = r.faixas;
      }
      await E("vr", false, "");
    }
    return out;
  })();

  if (erros.length) falhas.push(`erro na pagina: ${[...new Set(erros)].slice(0, 3).join(" | ")}`);
  await page.close();

  // ---- resultado da cena
  const achSup = sup.lista().filter((g) => {
    const mm = /#miniMap|#miniBrasilBtn/;
    if ((mm.test(g.a) || mm.test(g.b)) && /mini-mapa aberto/.test(g.ex)) {
      avisos.push(`mini-mapa aberto (painel que a pessoa abriu): ${g.tipo} ${g.a} x ${g.b}`);
      return false;
    }
    return true;
  });
  achSup.forEach((g) => falhas.push(`${g.tipo}: ${g.a}  x  ${g.b}  (${g.n} estado(s); ex.: ${g.ex}; ${g.med ? g.med.join("x") : ""}${g.tipo.startsWith("letras") ? " px" : " mm"})`));
  notas.push(`cena: ${estados} estados (${contextos.length} contextos, ${momentos} momentos da abertura guiada), ${achSup.length} tipo(s) de sobreposicao`);
  let maiorOlhar = 0;
  const soMiniMapa = (quem) => Object.keys(quem).length && Object.keys(quem).every((k) => /#miniMap|#miniBrasilBtn/.test(k));
  Object.values(olhar).forEach((o) => {
    if (o.frac > LIMITE && soMiniMapa(o.por)) {
      avisos.push(`mini-mapa aberto (painel que a pessoa abriu) cobre ${o.texto} (${Math.round(o.frac * 100)}%; ex.: ${o.ex})`);
      o.frac = 0;
    }
    if (o.fracSobre > LIMITE && soMiniMapa(o.sobreQuem)) o.fracSobre = 0;
    if (o.frac > LIMITE) falhas.push(`texto-tapado (do olho): ${o.texto} ${Math.round(o.frac * 100)}% das letras atras de ${Object.keys(o.por).join(", ")} (ex.: ${o.ex})`);
    else maiorOlhar = Math.max(maiorOlhar, o.frac);
    if (o.fracApagado > LIMITE) falhas.push(`texto-apagado-pela-ordem-de-desenho: ${o.texto} ${Math.round(o.fracApagado * 100)}% das letras somem atras de ${Object.keys(o.apagadoPor).join(", ")} (translucido desenhado antes, gravando profundidade; ex.: ${o.exApagado})`);
    if (o.fracSobre > LIMITE) falhas.push(`texto-em-cima-de-objeto (do olho): ${o.texto} ${Math.round(o.fracSobre * 100)}% das letras sobre ${Object.keys(o.sobreQuem).join(", ")} (ex.: ${o.exSobre})`);
  });
  Object.values(faltando).forEach((f) => falhas.push(`letra-que-a-fonte-nao-tem: "${f.faltam}" em ${f.a} ("${f.texto}"; ex.: ${f.ex}) - a letra some`));
  nans.forEach((n) => falhas.push(`posicao-NaN: ${n}`));
  Object.values(apagadosDados).forEach((d) => {
    if (d.frac > 0.15 && soMiniMapa(d.quem)) return avisos.push(`mini-mapa aberto cobre ${d.alvo}`);
    if (d.frac > 0.15) falhas.push(`marca-apagada-pela-ordem-de-desenho: ${d.alvo} ${Math.round(d.frac * 100)}% some atras de ${Object.keys(d.quem).join(", ")} (ex.: ${d.ex})`);
  });
  Object.values(quebradas).forEach((q) => falhas.push(`rotulo-de-uma-linha-quebrou: ${q.a} ("${q.texto}", ${q.linhas} linhas; ex.: ${q.ex})`));
  vr.sup.lista().forEach((g) => falhas.push(`VR ${g.tipo}: ${g.a}  x  ${g.b}  (${g.n}; ex.: ${g.ex})`));
  const esc = Object.keys(vr.escondidos);
  if (esc.length) avisos.push(`VR, olhando para a frente, o HUD/legenda escondem ${esc.length} texto(s)/alvo(s) do mundo; ex.: ${esc.slice(0, 4).join(" | ")}`);
  if (vr.faixas) notas.push(`VR: faixas (elevacao, azimute) - ${vr.faixas.join("; ")}`);

  // ---- HUD 2D em 3 janelas
  const hud = agrupar();
  const cortes = agrupar();
  const hudHud = agrupar();
  const notaAbertaGrupo = agrupar();
  let medidas = 0;
  for (const [W, H] of JANELAS) {
    const { page: p2 } = await abrir(browser, W, H, "?aa=0");
    await p2.evaluate(() => document.querySelector("a-scene").renderer.setAnimationLoop(null));
    const cache = new Map();
    const cacheAberta = new Map();
    for (const cap of capturas) {
      const chave = JSON.stringify(cap.hud);
      // nota aberta (primeiros segundos de cada etapa): so aviso
      let ma = cacheAberta.get(chave);
      if (!ma) {
        ma = await p2.evaluate(new Function("h", `return (${medirHud.toString()})(h, true)`), cap.hud);
        cacheAberta.set(chave, ma);
      }
      const notaA = Object.entries(ma.caixas).find(([n]) => n.startsWith("nota"));
      if (notaA) {
        const listaA = [];
        cap.cena.alvos.forEach((a) => {
          const r = retDe(a.c, W, H);
          const x = r && interR(r, notaA[1], 6);
          if (x && x[0] * x[1] >= 0.25 * (r.x1 - r.x0) * (r.y1 - r.y0)) listaA.push({ tipo: "nota-aberta-cobre-alvo (primeiros segundos)", a: a.nome, b: notaA[0], px: x });
        });
        notaAbertaGrupo.add(listaA, `${W}x${H} ${cap.nome}`);
      }
      let m = cache.get(chave);
      if (!m) {
        m = await p2.evaluate(new Function("h", `return (${medirHud.toString()})(h, false)`), cap.hud);
        cache.set(chave, m);
        // paineis do HUD um sobre o outro
        const nomes = Object.keys(m.caixas);
        const lista = [];
        for (let i = 0; i < nomes.length; i += 1)
          for (let j = i + 1; j < nomes.length; j += 1) {
            const x = interR(m.caixas[nomes[i]], m.caixas[nomes[j]], 1);
            if (x) lista.push({ tipo: "hud-sobre-hud", a: nomes[i], b: nomes[j], px: x });
          }
          hudHud.add(lista, `${W}x${H} ${cap.nome}`);
      }
      medidas += 1;
      const lista = [];
      const listaCorte = [];
      cap.cena.textos.forEach((t) => {
        const linhas = t.q.map((q) => retDe(q, W, H)).filter(Boolean);
        if (!linhas.length) return;
        Object.entries(m.caixas).forEach(([nome, c]) => {
          const x = linhas.map((l) => interR(l, c, 2)).find(Boolean);
          if (x) lista.push({ tipo: "texto-da-cena-atras-do-hud", a: t.nome, b: nome, px: x });
        });
        const fora = linhas.some((l) => l.x0 < -1 || l.x1 > W + 1 || l.y0 < -1 || l.y1 > H + 1);
        const dentro = linhas.some((l) => l.x1 > 0 && l.x0 < W && l.y1 > 0 && l.y0 < H);
        if (fora && dentro) listaCorte.push({ tipo: "texto-cortado-pela-borda-da-janela", a: t.nome, b: "", px: [0, 0] });
      });
      cap.cena.alvos.forEach((a) => {
        const r = retDe(a.c, W, H);
        if (!r) return;
        Object.entries(m.caixas).forEach(([nome, c]) => {
          const x = interR(r, c, 6);
          if (x) {
            // so conta se o HUD cobre um pedaco relevante do alvo (>= 25%)
            const area = (r.x1 - r.x0) * (r.y1 - r.y0);
            if (x[0] * x[1] >= 0.25 * area) lista.push({ tipo: "alvo-clicavel-atras-do-hud", a: a.nome, b: nome, px: x });
          }
        });
      });
      hud.add(lista, `${W}x${H} ${cap.nome}`);
      cortes.add(listaCorte, `${W}x${H} ${cap.nome}`);
    }
    await p2.close();
  }
  hudHud.lista().forEach((g) => falhas.push(`HUD 2D ${g.tipo}: ${g.a} x ${g.b} (${g.n} estado(s); ex.: ${g.ex})`));
  hud.lista().forEach((g) => falhas.push(`HUD 2D ${g.tipo}: ${g.a}  x  ${g.b}  (${g.n} estado(s); ex.: ${g.ex}; ${g.med.join("x")} px)`));
  cortes.lista().forEach((g) => avisos.push(`HUD 2D ${g.tipo}: ${g.a} (${g.n} estado(s); ex.: ${g.ex})`));
  notaAbertaGrupo.lista().forEach((g) => avisos.push(`HUD 2D ${g.tipo}: ${g.a} (${g.n} estado(s); ex.: ${g.ex})`));
  notas.push(`HUD 2D: ${capturas.length} estados x ${JANELAS.length} janelas (${JANELAS.map((j) => j.join("x")).join(", ")})`);

  const iJson = process.argv.indexOf("--json");
  if (iJson > 0 && process.argv[iJson + 1]) {
    fs.writeFileSync(process.argv[iJson + 1], JSON.stringify({ falhas, avisos, notas, cena: achSup, olhar: Object.values(olhar), hud: hud.lista(), cortes: cortes.lista(), vr: vr.sup.lista(), vrEscondidos: vr.escondidos }, null, 1));
  }

  await browser.close();
  server.close();

  notas.forEach((n) => console.log(`  · ${n}`));
  console.log(`  · ${Math.round((Date.now() - t0) / 1000)} s`);
  avisos.forEach((a) => console.log(`  ! ${a}`));
  console.log("");
  if (falhas.length) {
    console.error(`FALHOU (${falhas.length}):`);
    falhas.slice(0, 80).forEach((f) => console.error(`  ✗ ${f}`));
    if (falhas.length > 80) console.error(`  ... e mais ${falhas.length - 80} (use --json)`);
    process.exit(1);
  }
  console.log("sobreposicao: tudo verde.");
}

process.on("unhandledRejection", (e) => {
  console.error(e);
  process.exit(1);
});
