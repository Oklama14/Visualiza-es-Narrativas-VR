// Servidor estatico local (zero dependencias).
//
//   node server.js              -> desktop: http://127.0.0.1:4173/
//   node server.js 8080         -> troca a porta HTTP
//   node server.js --quest      -> Quest 2 pela rede Wi-Fi (HTTPS)
//
// Por que existe o modo --quest: o WebXR so funciona em "contexto seguro"
// (HTTPS ou localhost). Aberto como http://192.168.x.x no navegador do Quest,
// navigator.xr nem existe e o botao "Enter VR" cai numa tela cheia 2D, sem
// erro nenhum. No modo --quest o servidor escuta na rede e serve HTTPS com um
// certificado autoassinado gerado aqui mesmo, sem openssl (fica em .certs/,
// que nunca e servido). Na primeira visita o Quest avisa que a conexao nao e
// particular: Avancado -> Continuar. Depois disso o Enter VR funciona.
//
// Alternativa sem aviso de certificado: cabo USB + modo desenvolvedor,
//   adb reverse tcp:4173 tcp:4173
// e abrir http://localhost:4173/ no Quest (localhost conta como seguro).
//
// ESTUDO COM USUARIOS (api/estudo/*): este mesmo servidor e o "gravador" da
// sessao. A pagina do participante (?estudo=1&p=P01) manda a telemetria por
// POST e recebe os comandos do pesquisador por Server-Sent Events; a estacao
// do pesquisador (pesquisador.html, aberta NESTE notebook) conduz a sessao. Os
// dados vao para dados-estudo/<participante>.jsonl (uma linha por evento) -
// pasta que nunca e servida e esta no .gitignore. Comandos, estado e download
// dos dados so respondem a pedidos do proprio notebook (127.0.0.1).
// Para gravar noutro lugar (PowerShell):
//   $env:VRLAB_DADOS_DIR='D:\estudo'; node server.js --quest
const http = require("http");
const https = require("https");
const fs = require("fs");
const os = require("os");
const path = require("path");
const crypto = require("crypto");

const ROOT = __dirname;
const MODO_QUEST = process.argv.includes("--quest") || process.argv.includes("--rede");
const portaArg = process.argv.slice(2).find((a) => /^\d+$/.test(a));
const PORT = Number(portaArg) || 4173;
const PORT_HTTPS = 4443;
const HOST = MODO_QUEST ? "0.0.0.0" : "127.0.0.1";
const DIR_CERTS = path.join(ROOT, ".certs");
const DIR_DADOS = process.env.VRLAB_DADOS_DIR ? path.resolve(process.env.VRLAB_DADOS_DIR) : path.join(ROOT, "dados-estudo");

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".gif": "image/gif",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".wasm": "application/wasm",
  ".map": "application/json",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".ttf": "font/ttf",
  ".mp3": "audio/mpeg",
  ".glb": "model/gltf-binary",
  ".gltf": "model/gltf+json",
};

function atender(req, res) {
  try {
    // Ignora a query string (ex.: app.js?v=8) e decodifica %20 etc.
    let pathname = decodeURIComponent(req.url.split("?")[0]);
    if (pathname === "/") pathname = "/index.html";

    if (pathname.startsWith("/api/")) {
      api(req, res).catch((e) => responderJson(res, e.codigo || 500, { ok: false, erro: e.message }));
      return;
    }

    // Os dados dos participantes nunca saem como arquivo estatico (nem para
    // quem esta no Wi-Fi do laboratorio): so pela api, e so no notebook.
    if (pathname.split(/[\\/]/).some((seg) => seg === "dados-estudo")) {
      res.writeHead(403);
      res.end("403 Forbidden");
      return;
    }

    // Nada que comece com ponto (.certs, .git...) sai daqui: no modo --quest
    // o servidor esta na rede, e a chave do certificado mora em .certs/.
    if (pathname.split(/[\\/]/).some((seg) => seg.startsWith("."))) {
      res.writeHead(403);
      res.end("403 Forbidden");
      return;
    }

    // Resolve e impede sair da pasta do projeto (path traversal). O separador
    // no fim impede que uma pasta vizinha "versao-minimalista-x" passe no teste.
    const filePath = path.normalize(path.join(ROOT, pathname));
    if (filePath !== ROOT && !filePath.startsWith(ROOT + path.sep)) {
      res.writeHead(403);
      res.end("403 Forbidden");
      return;
    }

    fs.stat(filePath, (err, stat) => {
      if (err || !stat.isFile()) {
        res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
        res.end("404 Nao encontrado: " + pathname);
        return;
      }
      // So sai o que a pagina usa (html, js, css, json, imagens, modelos...). No
      // modo --quest o servidor esta na rede do laboratorio: planilhas, PDFs,
      // CSV e Markdown da pasta nao ficam baixaveis por quem estiver no Wi-Fi.
      const type = MIME[path.extname(filePath).toLowerCase()];
      if (!type) {
        res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
        res.end("404 Nao encontrado: " + pathname);
        return;
      }
      res.writeHead(200, {
        "Content-Type": type,
        // O navegador do Quest e teimoso com cache: sem isto, uma rodada de
        // teste roda o JS da rodada anterior. Servidor de desenvolvimento, sem
        // cache nenhum.
        "Cache-Control": "no-store, must-revalidate",
      });
      fs.createReadStream(filePath).pipe(res);
    });
  } catch (e) {
    res.writeHead(500);
    res.end("500 " + e.message);
  }
}

// ---------------------------------------------------------------------------
// API do estudo
// ---------------------------------------------------------------------------

const ID_OK = /^[A-Za-z0-9_-]{1,32}$/;
const LIMITE_CORPO = 2 * 1024 * 1024;
const CONDICOES = ["webxr", "2d"];
const COMANDOS = ["tarefa-iniciar", "tarefa-encerrar", "treino-iniciar", "treino-encerrar", "mensagem", "ir-entrada"];

// Estado em memoria (o arquivo .jsonl e a fonte da verdade; isto so alimenta
// a tela da estacao do pesquisador).
const estudo = { clientes: new Map(), resumo: new Map() };

function ehLocal(req) {
  const a = (req.socket && req.socket.remoteAddress) || "";
  return a === "127.0.0.1" || a === "::1" || a === "::ffff:127.0.0.1";
}

function responderJson(res, codigo, obj) {
  if (res.headersSent) {
    res.end();
    return;
  }
  res.writeHead(codigo, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" });
  res.end(JSON.stringify(obj));
}

function lerCorpo(req) {
  return new Promise((resolve, reject) => {
    let total = 0;
    const partes = [];
    req.on("data", (c) => {
      total += c.length;
      if (total > LIMITE_CORPO) {
        reject(Object.assign(new Error("corpo grande demais"), { codigo: 413 }));
        req.destroy();
        return;
      }
      partes.push(c);
    });
    req.on("end", () => {
      try {
        resolve(JSON.parse(Buffer.concat(partes).toString("utf8") || "{}"));
      } catch (e) {
        reject(Object.assign(new Error("JSON invalido"), { codigo: 400 }));
      }
    });
    req.on("error", reject);
  });
}

function arquivoDe(participante) {
  return path.join(DIR_DADOS, `${participante}.jsonl`);
}

function gravar(participante, linhas) {
  if (!linhas.length) return;
  fs.mkdirSync(DIR_DADOS, { recursive: true });
  fs.appendFileSync(arquivoDe(participante), linhas.map((l) => JSON.stringify(l)).join("\n") + "\n");
}

function resumoDe(p) {
  if (!estudo.resumo.has(p)) {
    estudo.resumo.set(p, { eventos: 0, ultimo: null, recentes: [], pos: null, fps: null, perdasRastreio: 0, pincasNoVazio: 0, treino: null, conexao: null });
  }
  return estudo.resumo.get(p);
}

// Guarda o que a estacao precisa mostrar "ao vivo".
function lembrar(p, linhas) {
  const r = resumoDe(p);
  linhas.forEach((ev) => {
    r.eventos += 1;
    r.ultimo = ev.recebido;
    if (ev.tipo === "pos") {
      r.pos = { x: ev.x, z: ev.z, guinada: ev.guinada, vr: ev.vr, alvo: ev.alvo };
      if (ev.fps != null) r.fps = ev.fps;
      return;
    }
    if (ev.tipo === "rolagem") {
      r.pos = { secao: ev.secao, y: ev.y };
      return;
    }
    if (ev.tipo === "rastreio" && ev.estado === "perdido") r.perdasRastreio += 1;
    if ((ev.tipo === "pinca" || ev.tipo === "gatilho") && !ev.alvo) r.pincasNoVazio += 1;
    if (ev.tipo === "treino") r.treino = { evento: ev.evento, etapa: ev.etapa || null, concluido: ev.concluido };
    if (ev.tipo === "conexao") r.conexao = ev.estado;
    r.recentes.push({ recebido: ev.recebido, origem: ev.origem, tipo: ev.tipo, resumo: resumirEvento(ev) });
    if (r.recentes.length > 40) r.recentes.shift();
  });
}

function resumirEvento(ev) {
  const fora = ["t", "ts", "tipo", "participante", "sessao", "condicao", "origem", "recebido", "ua"];
  return Object.keys(ev)
    .filter((k) => fora.indexOf(k) < 0 && ev[k] !== undefined)
    .map((k) => `${k}=${typeof ev[k] === "object" ? JSON.stringify(ev[k]) : ev[k]}`)
    .join(" ")
    .slice(0, 160);
}

function clientesDe(p) {
  if (!estudo.clientes.has(p)) estudo.clientes.set(p, new Set());
  return estudo.clientes.get(p);
}

async function api(req, res) {
  const url = new URL(req.url, "http://servidor");
  const rota = url.pathname;

  // Telemetria do participante (headset ou pagina 2D) e registros da estacao.
  if (rota === "/api/estudo/eventos" && req.method === "POST") {
    const c = await lerCorpo(req);
    const origem = c.origem === "pesquisador" ? "pesquisador" : "participante";
    if (origem === "pesquisador" && !ehLocal(req)) return responderJson(res, 403, { ok: false, erro: "registro do pesquisador so pelo notebook" });
    const participante = ID_OK.test(c.participante || "") ? c.participante : "sem-id";
    const sessao = ID_OK.test(c.sessao || "") ? c.sessao : null;
    const condicao = CONDICOES.indexOf(c.condicao) >= 0 ? c.condicao : "desconhecida";
    const recebido = Date.now();
    const eventos = Array.isArray(c.eventos) ? c.eventos.slice(0, 5000) : [];
    // Os campos de identificacao sao do SERVIDOR: um evento nao consegue
    // se passar por outro participante.
    const linhas = eventos
      .filter((e) => e && typeof e === "object" && typeof e.tipo === "string")
      .map((e) => Object.assign({}, e, { participante, sessao, condicao, origem, recebido, reenvio: c.reenvio ? true : undefined }));
    gravar(participante, linhas);
    lembrar(participante, linhas);
    return responderJson(res, 200, { ok: true, gravados: linhas.length });
  }

  // Canal de comandos: a pagina do participante fica ouvindo (SSE).
  if (rota === "/api/estudo/comandos" && req.method === "GET") {
    const p = url.searchParams.get("p") || "";
    if (!ID_OK.test(p)) return responderJson(res, 400, { ok: false, erro: "participante invalido" });
    res.writeHead(200, {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-store",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    });
    res.write("retry: 2000\n\n");
    const cliente = {
      res,
      sessao: (url.searchParams.get("sessao") || "").slice(0, 32),
      condicao: CONDICOES.indexOf(url.searchParams.get("condicao")) >= 0 ? url.searchParams.get("condicao") : "desconhecida",
      desde: Date.now(),
    };
    clientesDe(p).add(cliente);
    const batimento = setInterval(() => res.write(": ping\n\n"), 15000);
    req.on("close", () => {
      clearInterval(batimento);
      clientesDe(p).delete(cliente);
    });
    return undefined;
  }

  // Daqui para baixo: so a estacao do pesquisador (o proprio notebook).
  if (!ehLocal(req)) return responderJson(res, 403, { ok: false, erro: "so pelo notebook do pesquisador" });

  if (rota === "/api/estudo/comandos" && req.method === "POST") {
    const c = await lerCorpo(req);
    const p = c.participante || "";
    const cmd = c.comando || {};
    if (!ID_OK.test(p)) return responderJson(res, 400, { ok: false, erro: "participante invalido" });
    if (COMANDOS.indexOf(cmd.tipo) < 0) return responderJson(res, 400, { ok: false, erro: "comando desconhecido" });
    const msg = {
      tipo: cmd.tipo,
      id: typeof cmd.id === "string" ? cmd.id.slice(0, 8) : undefined,
      texto: typeof cmd.texto === "string" ? cmd.texto.slice(0, 120) : undefined,
      ms: Number(cmd.ms) || undefined,
      cid: crypto.randomBytes(4).toString("hex"),
    };
    let entregues = 0;
    clientesDe(p).forEach((cli) => {
      if (c.condicao && cli.condicao !== c.condicao) return;
      cli.res.write(`data: ${JSON.stringify(msg)}\n\n`);
      entregues += 1;
    });
    const linha = Object.assign({ t: null, ts: Date.now(), tipo: "comando-enviado", comando: msg.tipo, entregues }, msg, {
      tipo: "comando-enviado",
      participante: p,
      sessao: null,
      condicao: CONDICOES.indexOf(c.condicao) >= 0 ? c.condicao : "desconhecida",
      origem: "pesquisador",
      recebido: Date.now(),
    });
    gravar(p, [linha]);
    lembrar(p, [linha]);
    return responderJson(res, 200, { ok: true, entregues, cid: msg.cid });
  }

  if (rota === "/api/estudo/estado" && req.method === "GET") {
    const nomes = new Set([...estudo.clientes.keys(), ...estudo.resumo.keys()]);
    const participantes = {};
    nomes.forEach((p) => {
      const r = estudo.resumo.get(p) || null;
      participantes[p] = {
        conectados: Array.from(clientesDe(p)).map((c) => ({ sessao: c.sessao, condicao: c.condicao, desde: c.desde })),
        resumo: r,
        arquivo: fs.existsSync(arquivoDe(p)),
      };
    });
    return responderJson(res, 200, {
      ok: true,
      agora: Date.now(),
      ips: ipsDaRede(),
      portaHttps: PORT_HTTPS,
      portaHttp: PORT,
      pastaDados: DIR_DADOS,
      participantes,
    });
  }

  if (rota === "/api/estudo/arquivo" && req.method === "GET") {
    const p = url.searchParams.get("p") || "";
    if (!ID_OK.test(p)) return responderJson(res, 400, { ok: false, erro: "participante invalido" });
    const arq = arquivoDe(p);
    if (!fs.existsSync(arq)) return responderJson(res, 404, { ok: false, erro: "sem dados para " + p });
    res.writeHead(200, {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Content-Disposition": `attachment; filename="${p}.jsonl"`,
      "Cache-Control": "no-store",
    });
    fs.createReadStream(arq).pipe(res);
    return undefined;
  }

  return responderJson(res, 404, { ok: false, erro: "rota desconhecida" });
}

// ---------------------------------------------------------------------------
// Rede local
// ---------------------------------------------------------------------------

// Placas virtuais (VirtualBox, WSL, Hyper-V, VMware, Docker) tambem tem IP,
// mas o Quest nunca esta nelas: vao para o fim da lista, marcadas.
const VIRTUAL = /virtualbox|vbox|vmware|vethernet|wsl|hyper-v|docker|loopback|tailscale|zerotier/i;

function redes() {
  const lista = [];
  Object.entries(os.networkInterfaces()).forEach(([nome, enderecos]) => {
    (enderecos || []).forEach((i) => {
      const v4 = i.family === "IPv4" || i.family === 4;
      if (v4 && !i.internal) lista.push({ ip: i.address, nome, virtual: VIRTUAL.test(nome) });
    });
  });
  return lista.sort((a, b) => a.virtual - b.virtual);
}

function ipsDaRede() {
  return redes().map((r) => r.ip);
}

// ---------------------------------------------------------------------------
// Certificado autoassinado em Node puro (X.509 v3, RSA-2048, SHA-256).
// So DER: um punhado de TLVs. Nao e para producao - e para o Quest aceitar
// HTTPS numa rede de laboratorio.
// ---------------------------------------------------------------------------

function derLen(n) {
  if (n < 0x80) return Buffer.from([n]);
  const bytes = [];
  while (n > 0) {
    bytes.unshift(n & 0xff);
    n >>= 8;
  }
  return Buffer.from([0x80 | bytes.length, ...bytes]);
}
const tlv = (tag, conteudo) => Buffer.concat([Buffer.from([tag]), derLen(conteudo.length), conteudo]);
const seq = (...partes) => tlv(0x30, Buffer.concat(partes));
const set = (...partes) => tlv(0x31, Buffer.concat(partes));
const ctx = (n, conteudo) => tlv(0xa0 + n, conteudo);
const nulo = () => Buffer.from([0x05, 0x00]);
const bool = (v) => tlv(0x01, Buffer.from([v ? 0xff : 0x00]));
const octetos = (b) => tlv(0x04, b);
const bits = (b) => tlv(0x03, Buffer.concat([Buffer.from([0x00]), b]));
const utf8 = (s) => tlv(0x0c, Buffer.from(s, "utf8"));

function inteiro(buf) {
  let b = buf;
  while (b.length > 1 && b[0] === 0x00 && b[1] < 0x80) b = b.subarray(1);
  if (b[0] & 0x80) b = Buffer.concat([Buffer.from([0x00]), b]);
  return tlv(0x02, b);
}

function oid(texto) {
  const p = texto.split(".").map(Number);
  const bytes = [40 * p[0] + p[1]];
  p.slice(2).forEach((v) => {
    const pilha = [v & 0x7f];
    v = Math.floor(v / 128);
    while (v > 0) {
      pilha.unshift((v & 0x7f) | 0x80);
      v = Math.floor(v / 128);
    }
    bytes.push(...pilha);
  });
  return tlv(0x06, Buffer.from(bytes));
}

function tempoUTC(d) {
  const z = (n) => String(n).padStart(2, "0");
  const s =
    z(d.getUTCFullYear() % 100) + z(d.getUTCMonth() + 1) + z(d.getUTCDate()) +
    z(d.getUTCHours()) + z(d.getUTCMinutes()) + z(d.getUTCSeconds()) + "Z";
  return tlv(0x17, Buffer.from(s, "ascii"));
}

function gerarCertificado(ips) {
  const { privateKey, publicKey } = crypto.generateKeyPairSync("rsa", { modulusLength: 2048 });
  const spki = publicKey.export({ type: "spki", format: "der" });
  const algSha256Rsa = seq(oid("1.2.840.113549.1.1.11"), nulo());
  const nome = seq(set(seq(oid("2.5.4.3"), utf8("vr-gpt laboratorio (desenvolvimento)"))));

  const agora = Date.now();
  const validade = seq(tempoUTC(new Date(agora - 864e5)), tempoUTC(new Date(agora + 397 * 864e5)));

  // subjectAltName: localhost + 127.0.0.1 + os IPs da rede no momento.
  const sans = [tlv(0x82, Buffer.from("localhost", "ascii"))];
  ["127.0.0.1", ...ips].forEach((ip) => sans.push(tlv(0x87, Buffer.from(ip.split(".").map(Number)))));
  const extensoes = ctx(
    3,
    seq(
      seq(oid("2.5.29.19"), bool(true), octetos(seq())), // basicConstraints: CA false
      seq(oid("2.5.29.15"), bool(true), octetos(tlv(0x03, Buffer.from([0x05, 0xa0])))), // keyUsage: digSig + keyEnc
      seq(oid("2.5.29.37"), octetos(seq(oid("1.3.6.1.5.5.7.3.1")))), // extKeyUsage: serverAuth
      seq(oid("2.5.29.17"), octetos(seq(...sans))) // subjectAltName
    )
  );

  const tbs = seq(
    ctx(0, inteiro(Buffer.from([0x02]))), // v3
    inteiro(crypto.randomBytes(16)),
    algSha256Rsa,
    nome,
    validade,
    nome,
    spki,
    extensoes
  );
  const assinatura = crypto.sign("sha256", tbs, privateKey);
  const der = seq(tbs, algSha256Rsa, bits(assinatura));

  const pem = (rotulo, b) =>
    `-----BEGIN ${rotulo}-----\n${b.toString("base64").match(/.{1,64}/g).join("\n")}\n-----END ${rotulo}-----\n`;
  return { cert: pem("CERTIFICATE", der), key: privateKey.export({ type: "pkcs8", format: "pem" }) };
}

function certificado(ips) {
  const arqCert = path.join(DIR_CERTS, "cert.pem");
  const arqKey = path.join(DIR_CERTS, "key.pem");
  try {
    const cert = fs.readFileSync(arqCert, "utf8");
    const key = fs.readFileSync(arqKey, "utf8");
    const x = new crypto.X509Certificate(cert);
    const valido = new Date(x.validTo).getTime() > Date.now() + 864e5;
    const cobre = ips.every((ip) => (x.subjectAltName || "").includes(`IP Address:${ip}`));
    if (valido && cobre) return { cert, key };
  } catch (e) {
    /* nao existe ainda ou ilegivel: gera de novo */
  }
  const novo = gerarCertificado(ips);
  fs.mkdirSync(DIR_CERTS, { recursive: true });
  fs.writeFileSync(arqCert, novo.cert);
  fs.writeFileSync(arqKey, novo.key);
  console.log("Certificado autoassinado gerado em .certs/ (vale para: localhost, 127.0.0.1, " + (ips.join(", ") || "-") + ")");
  return novo;
}

// ---------------------------------------------------------------------------

if (require.main === module) {
  const server = http.createServer(atender);
  server.on("error", (e) => {
    console.error(`Nao consegui abrir a porta ${PORT}: ${e.code === "EADDRINUSE" ? "ja esta em uso (outro servidor aberto?)" : e.message}`);
    process.exit(1);
  });
  server.listen(PORT, HOST, () => {
    if (!MODO_QUEST) {
      console.log("Servidor rodando em: http://127.0.0.1:" + PORT + "/");
      console.log("Servindo a pasta:    " + ROOT);
      console.log("Estacao do pesquisador: http://127.0.0.1:" + PORT + "/pesquisador.html");
      console.log("Dados do estudo em:     " + DIR_DADOS);
      console.log("Para o Quest 2 pela rede:  node server.js --quest");
      console.log("Para parar: Ctrl+C");
      return;
    }

    const ips = ipsDaRede();
    const { cert, key } = certificado(ips);
    const seguro = https.createServer({ cert, key }, atender);
    seguro.on("error", (e) => {
      console.error(`Nao consegui abrir a porta HTTPS ${PORT_HTTPS}: ${e.message}`);
      process.exit(1);
    });
    seguro.listen(PORT_HTTPS, HOST, () => {
      console.log("");
      console.log("Modo Quest 2 - servindo " + ROOT);
      console.log("");
      console.log("  Desktop (este PC):  http://127.0.0.1:" + PORT + "/");
      if (!ips.length) {
        console.log("  Nenhuma rede encontrada. Conecte o PC ao mesmo Wi-Fi do Quest.");
      }
      redes().forEach((r) => {
        const url = "https://" + r.ip + ":" + PORT_HTTPS + "/";
        console.log(
          (r.virtual ? "  (placa virtual)     " : "  No Quest 2 abra:    ") + url.padEnd(30) + "  " + r.nome +
            (r.virtual ? " - provavelmente nao e esta" : "")
        );
      });
      console.log("");
      console.log("  Estacao do pesquisador (neste PC): http://127.0.0.1:" + PORT + "/pesquisador.html");
      console.log("  Dados do estudo em: " + DIR_DADOS);
      console.log("");
      console.log("  1a vez no Quest: 'Sua conexao nao e particular' -> Avancado -> Continuar.");
      console.log("  Se o Quest nao abrir a pagina: libere o Node no Firewall do Windows (rede privada)");
      console.log("  e confira se o Wi-Fi do PC e do Quest e o mesmo.");
      console.log("");
      console.log("Para parar: Ctrl+C");
    });
  });
}

module.exports = { gerarCertificado, atender, DIR_DADOS };
