// Servidor estático de desenvolvimento para o frontend (totem + admin)
// O backend/API roda separadamente (npm start dentro de backend/).
const http = require('http');
const fs = require('fs');
const path = require('path');

const PORTA = 8091;
const RAIZ = path.join(__dirname, 'frontend');
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json',
  '.webmanifest': 'application/manifest+json',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
};

http
  .createServer((req, res) => {
    let caminho = decodeURIComponent(req.url.split('?')[0]);
    // Painel administrativo em /admin
    if (caminho === '/admin' || caminho.startsWith('/admin/')) {
      const rel = caminho.replace(/^\/admin\/?/, '') || 'index.html';
      const alvo = path.join(RAIZ, 'admin', rel);
      return fs.readFile(alvo, (err, dados) => {
        if (err) { res.writeHead(404); res.end('404'); return; }
        res.writeHead(200, { 'Content-Type': MIME[path.extname(alvo)] || 'application/octet-stream' });
        res.end(dados);
      });
    }

    // Totem na raiz
    if (caminho.endsWith('/')) caminho += 'index.html';
    const alvo = path.join(RAIZ, 'totem', caminho);
    fs.readFile(alvo, (err, dados) => {
      if (err) {
        res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end('404');
        return;
      }
      res.writeHead(200, { 'Content-Type': MIME[path.extname(alvo)] || 'application/octet-stream' });
      res.end(dados);
    });
  })
  .listen(PORTA, '127.0.0.1', () => {
    console.log(`Totem:  http://127.0.0.1:${PORTA}`);
    console.log(`Admin:  http://127.0.0.1:${PORTA}/admin`);
  });
