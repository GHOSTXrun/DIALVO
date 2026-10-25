'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const M = require('../public/scripts/market-model.js');
const { collectMarket } = require('../scripts/collect-market.cjs');
const now = Date.now();
function pair(letter, cap, volume, change, createdAt = now - 10000) {
  return {
    chainId: 'solana', pairAddress: letter.repeat(32),
    baseToken: { address: letter.repeat(33), symbol: letter, name: letter },
    quoteToken: { symbol: 'SOL' }, priceUsd: '0.003', marketCap: cap, fdv: 8000,
    liquidity: { usd: 1000 }, volume: { h24: volume, m5: volume / 10 },
    priceChange: { h24: change, m5: -change },
    txns: { h24: { buys: 4, sells: 2 } }, pairCreatedAt: createdAt
  };
}
const raw = [pair('A', 100, 800, 12), pair('B', 300, 100, -4), pair('C', 200, 400, 7, now - 200000)];

test('missing market cap remains missing and is never replaced with FDV', () => {
  const t = M.normalize({ ...raw[0], marketCap: null });
  assert.equal(t.cap, null);
  assert.equal(t.fdv, 8000);
  assert.equal(M.number(false), null);
  assert.equal(M.normalize({ ...raw[0], chainId: 'ethereum' }), null);
  assert.equal(M.normalize({ ...raw[0], pairAddress: 'invalid' }), null);
});

test('lane defaults differ, but an explicit sort is honored in every lane', () => {
  const tokens = M.merge(raw);
  assert.deepEqual(M.select(tokens, { lane: 'bonding' }).map(t => t.ticker), ['A', 'C', 'B']);
  assert.deepEqual(M.select(tokens, { lane: 'migrated' }).map(t => t.ticker), ['A', 'C']);
  assert.deepEqual(M.select(tokens, { lane: 'bonding', sort: 'cap' }).map(t => t.ticker), ['B', 'C', 'A']);
  assert.deepEqual(M.select(tokens, { lane: 'new', sort: 'cap' }).map(t => t.ticker), ['B', 'C', 'A']);
  assert.deepEqual(M.select(tokens, { lane: 'migrated', sort: 'cap' }).map(t => t.ticker), ['C', 'A']);
  assert.deepEqual(M.select(tokens, { lane: 'migrated', period: 'm5' }).map(t => t.ticker), ['B']);
});

test('filters, query, period and saved addresses produce consistent selections', () => {
  const tokens = M.merge(raw);
  assert.deepEqual(M.select(tokens, { query: 'B', watch: new Set([raw[1].baseToken.address]) }).map(t => t.ticker), ['B']);
  assert.deepEqual(M.select(tokens, { filters: { cap: 250 } }).map(t => t.ticker), ['B']);
  assert.deepEqual(M.select(tokens, { filters: { age: 1 }, now }).map(t => t.ticker).sort(), ['A', 'B']);
});

test('quote updates preserve the selected pool instead of switching charts to another pool', () => {
  const current = M.merge([raw[0]]);
  const original = { ...raw[0], priceUsd: '0.004' };
  const another = { ...raw[0], pairAddress: 'D'.repeat(32), priceUsd: '0.9', liquidity: { usd: 90000 } };
  const [updated] = M.patchQuotes(current, [original, another]);
  assert.equal(updated.id, current[0].id);
  assert.equal(updated.price, 0.004);
  assert.equal(M.merge([original, another])[0].id, another.pairAddress);
});

test('snapshots retain their collection time; future or empty snapshots are rejected', () => {
  const observedAt = new Date(now - 900000).toISOString();
  const snapshot = M.snapshot({ schemaVersion: 1, observedAt, pairs: raw }, now);
  assert.equal(snapshot.observedAt, now - 900000);
  assert.equal(snapshot.source, 'snapshot');
  assert.equal(M.snapshot({ schemaVersion: 1, observedAt: new Date(now + 120000).toISOString(), pairs: raw }, now), null);
  assert.equal(M.snapshot({ schemaVersion: 1, observedAt, pairs: [] }, now), null);
});

test('collector fails closed when every real source is unavailable', async () => {
  await assert.rejects(collectMarket({ fetchImpl: async () => { throw Error('offline'); } }), /No real Solana quotes/);
});

test('collector returns validated provider responses without generated prices', async () => {
  const data = await collectMarket({ fetchImpl: async url => new Response(JSON.stringify(url.includes('profiles') ? [] : { pairs: raw })) });
  assert.equal(data.pairs.length, 3);
  assert.equal(data.pairs[0].priceUsd, raw[0].priceUsd);
  assert.equal(data.provider, 'DEX Screener');
  assert.ok(Number.isFinite(Date.parse(data.observedAt)));
});

module.exports = { raw };
