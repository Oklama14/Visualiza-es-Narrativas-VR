// Servidor estatico local (zero dependencias) para rodar o projeto sem Python.
// Uso:  node server.js        -> abre em http://127.0.0.1:4173/
// Opcional:  node server.js 8080   (troca a porta)
const http = require("http");
const fs = require("fs");
const path = require("path");

const ROOT = __dirname;
const PORT = Number(process.argv[2]) || 4173;
const HOST = "127.0.0.1";

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
};

const server = http.createServer((req, res) => {
  try {
    // Ignora a query string (ex.: app.js?v=8) e decodifica %20 etc.
    let pathname = decodeURIComponent(req.url.split("?")[0]);
    if (pathname === "/") pathname = "/index.html";

    // Resolve e impede sair da pasta do projeto (path traversal).
    const filePath = path.normalize(path.join(ROOT, pathname));
    if (!filePath.startsWith(ROOT)) {
      res.writeHead(403); res.end("403 Forbidden"); return;
    }

    fs.stat(filePath, (err, stat) => {
      if (err || !stat.isFile()) {
        res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
        res.end("404 Nao encontrado: " + pathname);
        return;
      }
      const type = MIME[path.extname(filePath).toLowerCase()] || "application/octet-stream";
      res.writeHead(200, { "Content-Type": type });
      fs.createReadStream(filePath).pipe(res);
    });
  } catch (e) {
    res.writeHead(500); res.end("500 " + e.message);
  }
});

server.listen(PORT, HOST, () => {
  console.log("Servidor rodando em: http://" + HOST + ":" + PORT + "/");
  console.log("Servindo a pasta:    " + ROOT);
  console.log("Para parar: Ctrl+C");
});
