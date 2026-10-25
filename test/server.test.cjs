'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { createServer } = require('../server.cjs');

async function serve(t, options = {}) {
  const server = createServer(options);
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  return 'http://127.0.0.1:' + server.address().port;
}

test('serves the connection entry, market page and local assets', async t => {
  const base = await serve(t);
  const entry = await fetch(base);
  const html = await entry.text();
  assert.equal(entry.status, 200);
  assert.match(html, /id="connection-window"/);
  assert.match(html, /scripts\/login\.js/);
  const terminal = await fetch(base + '/dialvo-terminal.html');
  assert.match(await terminal.text(), /id="board"/);
  for (const asset of ['/styles/login.css', '/styles/terminal.css', '/scripts/terminal.js', '/assets/pixel.ttf']) {
    assert.equal((await fetch(base + asset)).status, 200, asset);
  }
  const head = await fetch(base + '/', { method: 'HEAD' });
  assert.equal(head.status, 200);
  assert.equal(await head.text(), '');
});

test('health distinguishes a running server from a connected market feed', async t => {
  const base = await serve(t);
  const health = await (await fetch(base + '/api/health')).json();
  assert.equal(health.status, 'ok');
  assert.equal(health.market.lastSuccessAt, null);
});

test('proxies JSON, coalesces requests and records successful upstream contact', async t => {
  let requests = 0;
  const base = await serve(t, { fetchImpl: async url => {
    requests++;
    assert.equal(url, 'https://api.dexscreener.com/latest/dex/search?q=SOL');
    return new Response(JSON.stringify({ pairs: [{ chainId: 'solana' }] }));
  } });
  const responses = await Promise.all([fetch(base + '/api/latest/dex/search?q=SOL'), fetch(base + '/api/latest/dex/search?q=SOL')]);
  assert.deepEqual(await responses[0].json(), { pairs: [{ chainId: 'solana' }] });
  assert.equal(responses[1].status, 200);
  assert.equal(requests, 1);
  const health = await (await fetch(base + '/api/health')).json();
  assert.ok(health.market.lastSuccessAt);
});

test('unreachable upstream returns an error rather than fabricated prices', async t => {
  const base = await serve(t, { fetchImpl: async () => { throw new TypeError('offline'); } });
  const response = await fetch(base + '/api/latest/dex/search?q=SOL');
  assert.equal(response.status, 502);
  assert.equal((await response.json()).error, 'Market data unavailable');
  const health = await (await fetch(base + '/api/health')).json();
  assert.equal(health.market.lastSuccessAt, null);
  assert.ok(health.market.lastError);
});

test('rejects unknown proxy routes, cross-origin requests and private files', async t => {
  const base = await serve(t, { fetchImpl: async () => { throw Error('Must not reach upstream'); } });
  for (const file of ['/server.cjs', '/.env', '/api/https://example.com', '/api/tokens/v1/solana/not-valid', '/api/latest/dex/search']) {
    assert.equal((await fetch(base + file)).status, 404, file);
  }
  assert.equal((await fetch(base, { headers: { Origin: 'https://example.com' } })).status, 403);
  assert.equal((await fetch(base, { method: 'POST' })).status, 405);
});
