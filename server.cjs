'use strict';
const http = require('node:http');
const fs = require('node:fs/promises');
const path = require('node:path');

const PUBLIC = path.join(__dirname, 'public');
const API = 'https://api.dexscreener.com';
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.webp': 'image/webp',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.ttf': 'font/ttf'
};

function validRoute(url) {
  const route = url.pathname.slice(4);
  if (route === '/token-profiles/latest/v1') return !url.search;
  if (route === '/latest/dex/search') {
    const q = url.searchParams.get('q');
    return !!q && q.length <= 150 && [...url.searchParams.keys()].every(k => k === 'q');
  }
  const addresses = route.match(/^\/tokens\/v1\/solana\/([1-9A-HJ-NP-Za-km-z,]+)$/);
  if (!addresses || url.search) return false;
  const items = addresses[1].split(',');
  return items.length <= 30 && items.every(a => /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(a));
}

function createServer({ fetchImpl = globalThis.fetch, cacheMs = 1000 } = {}) {
  const cache = new Map();
  const pending = new Map();
  const market = { lastSuccessAt: null, lastError: null };
  const startedAt = Date.now();

  async function upstream(route) {
    const cached = cache.get(route);
    if (cached && Date.now() - cached.at < cacheMs) return cached.body;
    if (pending.has(route)) return pending.get(route);
    const task = (async () => {
      const response = await fetchImpl(API + route, {
        headers: { Accept: 'application/json', 'Cache-Control': 'no-cache' },
        signal: AbortSignal.timeout(12000)
      });
      if (!response.ok) {
        const error = new Error('Market provider returned HTTP ' + response.status);
        error.status = response.status === 429 ? 429 : 502;
        throw error;
      }
      const body = await response.text();
      JSON.parse(body);
      market.lastSuccessAt = new Date().toISOString();
      market.lastError = null;
      cache.set(route, { body, at: Date.now() });
      if (cache.size > 150) cache.delete(cache.keys().next().value);
      return body;
    })();
    pending.set(route, task);
    try { return await task; } finally { pending.delete(route); }
  }

  return http.createServer(async (req, res) => {
    const send = (status, body, type = 'application/json; charset=utf-8') => {
      res.writeHead(status, {
        'Content-Type': type,
        'Cache-Control': 'no-store',
        'X-Content-Type-Options': 'nosniff',
        'Referrer-Policy': 'strict-origin-when-cross-origin'
      });
      res.end(req.method === 'HEAD' ? undefined : body);
    };
    try {
      if (!['GET', 'HEAD'].includes(req.method)) {
        res.setHeader('Allow', 'GET, HEAD');
        return send(405, JSON.stringify({ error: 'Method not allowed' }));
      }
      if (req.headers.origin) {
        let originHost;
        try { originHost = new URL(req.headers.origin).host; } catch { originHost = ''; }
        if (originHost !== req.headers.host) return send(403, JSON.stringify({ error: 'Origin not allowed' }));
      }
      const url = new URL(req.url, 'http://localhost');
      if (url.pathname === '/api/health') {
        return send(200, JSON.stringify({
          service: 'DIALVO',
          status: 'ok',
          uptimeSeconds: Math.floor((Date.now() - startedAt) / 1000),
          market: { ...market }
        }));
      }
      if (url.pathname.startsWith('/api/')) {
        if (!validRoute(url)) return send(404, JSON.stringify({ error: 'Unknown API route' }));
        try {
          return send(200, await upstream(url.pathname.slice(4) + url.search));
        } catch (error) {
          const code = error.cause?.code || error.code || error.name;
          market.lastError = code === 'EACCES'
            ? 'Network access denied (EACCES).'
            : error.name === 'TimeoutError' || error.name === 'AbortError'
              ? 'Market connection timed out.'
              : 'Market connection failed: ' + error.message;
          return send(error.status || 502, JSON.stringify({
            error: 'Market data unavailable', message: market.lastError
          }));
        }
      }
      let pathname;
      try { pathname = decodeURIComponent(url.pathname); } catch { return send(400, 'Bad request', 'text/plain'); }
      if (pathname === '/') pathname = '/index.html';
      const file = path.resolve(PUBLIC, '.' + pathname);
      if (!file.startsWith(PUBLIC + path.sep) || pathname.includes('\\')) {
        return send(404, 'Not found', 'text/plain');
      }
      const type = MIME[path.extname(file).toLowerCase()];
      if (!type) return send(404, 'Not found', 'text/plain');
      try {
        const body = await fs.readFile(file);
        return send(200, body, type);
      } catch (error) {
        if (['ENOENT', 'EISDIR', 'ENOTDIR'].includes(error.code)) return send(404, 'Not found', 'text/plain');
        throw error;
      }
    } catch {
      send(500, JSON.stringify({ error: 'Internal server error' }));
    }
  });
}

if (require.main === module) {
  const port = Number(process.env.PORT || 1999);
  const host = process.env.HOST || '127.0.0.1';
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    console.error('PORT must be an integer from 1 to 65535.');
    process.exit(1);
  }
  const server = createServer();
  server.on('error', error => { console.error('DIALVO:', error.message); process.exitCode = 1; });
  server.listen(port, host, () => console.log('DIALVO ready: http://' + host + ':' + port));
}

module.exports = { createServer };
