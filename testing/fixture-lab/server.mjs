#!/usr/bin/env node
/** Local two-origin fixture lab. No dependencies; never bind outside loopback. */
import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const base = path.join(path.dirname(fileURLToPath(import.meta.url)), 'public');
function portFrom(name, fallback) {
  const value = Number(process.env[name] ?? fallback);
  if (!Number.isInteger(value) || value < 1024 || value > 65535) {
    throw new Error(`${name} must be an integer from 1024 to 65535`);
  }
  return value;
}
const mainPort = portFrom('FIXTURE_PORT', 4173);
const framePort = portFrom('FIXTURE_FRAME_PORT', 4174);
if (mainPort === framePort) throw new Error('The two origins need different ports.');
const host = '127.0.0.1';
const origin = `http://${host}:${mainPort}`;
const frameOrigin = `http://${host}:${framePort}`;
const assets = new Map([
  ['/app.js', ['app.js', 'text/javascript; charset=utf-8']],
  ['/styles.css', ['styles.css', 'text/css; charset=utf-8']],
]);
const html = `<!doctype html>
<html lang="ru"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>AntiMirror · Fixture Lab</title><link rel="stylesheet" href="/styles.css"></head>
<body><main id="app" data-main-origin="${origin}" data-frame-origin="${frameOrigin}">
<header><p class="eyebrow">ANTIMIRROR / LOCAL FIXTURES</p><h1>Проверка сложных плееров</h1>
<p id="description">Синтетическое видео. Ни одного внешнего запроса.</p>
<label id="case-label">Сценарий <select id="case"></select></label></header>
<section id="controls" class="controls" aria-label="Управление сценарием"></section>
<p id="status" role="status">Подготовка…</p><section id="stage" aria-label="Стенд"></section>
<footer>Это тестовая страница, а не реализация расширения. Она сама не включает отражение.</footer>
</main><script type="module" src="/app.js"></script></body></html>`;

const servers = [];
for (const port of [mainPort, framePort]) {
  const server = http.createServer(async (req, res) => {
    try {
      if (!['GET', 'HEAD'].includes(req.method ?? '')) {
        res.writeHead(405, { Allow: 'GET, HEAD' }); res.end(); return;
      }
      const url = new URL(req.url ?? '/', `http://${host}:${port}`);
      let body; let type;
      if (url.pathname === '/health') {
        body = JSON.stringify({ ok: true, origin, frameOrigin, port });
        type = 'application/json; charset=utf-8';
      } else if (url.pathname === '/' || url.pathname === '/child') {
        body = html; type = 'text/html; charset=utf-8';
      } else if (assets.has(url.pathname)) {
        const [filename, contentType] = assets.get(url.pathname);
        body = await readFile(path.join(base, filename)); type = contentType;
      } else { res.writeHead(404); res.end('Not found'); return; }
      const headers = { 'Content-Type': type, 'Cache-Control': url.searchParams.get('case') === 'bfcache' ? 'private, max-age=0' : 'no-store',
        'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer' };
      if (url.searchParams.get('case') === 'strict-csp') {
        headers['Content-Security-Policy'] = "default-src 'self'; script-src 'self'; style-src 'self'; media-src 'self' blob:; object-src 'none'; base-uri 'none'";
      }
      res.writeHead(200, headers); res.end(req.method === 'HEAD' ? undefined : body);
    } catch (error) {
      console.error(error); res.writeHead(500); res.end('Fixture server error');
    }
  });
  server.on('error', (error) => {
    console.error(`Fixture port ${port}: ${error.message}. Set FIXTURE_PORT and FIXTURE_FRAME_PORT; do not kill unrelated processes.`);
    for (const item of servers) item.close();
    process.exitCode = 1;
  });
  servers.push(server);
  server.listen(port, host, () => console.log(`Listening at http://${host}:${port}`));
}
console.log(`Open ${origin}/?case=basic`);
for (const signal of ['SIGINT', 'SIGTERM']) {
  process.once(signal, () => { for (const server of servers) server.close(); });
}
