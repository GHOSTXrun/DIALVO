'use strict';
const fs = require('node:fs/promises');
const path = require('node:path');
const Market = require('../public/scripts/market-model.js');
const API = 'https://api.dexscreener.com';

async function collectMarket({ fetchImpl = globalThis.fetch } = {}) {
  const failures = [];
  async function get(route) {
    const r = await fetchImpl(API + route, { headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(15000) });
    if (!r.ok) throw Error(route + ': HTTP ' + r.status);
    return r.json();
  }
  const results = await Promise.allSettled([
    get('/latest/dex/search?q=SOL'), get('/latest/dex/search?q=SOL%20USDC'), get('/token-profiles/latest/v1')
  ]);
  const pairs = [];
  for (const r of results.slice(0, 2)) {
    if (r.status === 'fulfilled' && Array.isArray(r.value.pairs)) pairs.push(...r.value.pairs);
    else failures.push('Market discovery source unavailable');
  }
  const profiles = results[2].status === 'fulfilled' && Array.isArray(results[2].value) ? results[2].value : [];
  const addresses = [...new Set(profiles.filter(p => p?.chainId === 'solana' && Market.addressPattern.test(p.tokenAddress)).map(p => p.tokenAddress))].slice(0, 60);
  const batches = [];
  for (let i = 0; i < addresses.length; i += 30) batches.push(get('/tokens/v1/solana/' + addresses.slice(i, i + 30).join(',')));
  for (const result of await Promise.allSettled(batches)) {
    if (result.status === 'fulfilled' && Array.isArray(result.value)) pairs.push(...result.value);
    else failures.push('Token quote source unavailable');
  }
  const byPool = new Map();
  for (const pair of pairs) if (Market.normalize(pair)) byPool.set(pair.pairAddress, pair);
  if (!byPool.size) throw Error('No real Solana quotes returned; no snapshot was written.');
  return {
    schemaVersion: 1,
    provider: 'DEX Screener',
    observedAt: new Date().toISOString(),
    coverage: 'Indexed Solana pools returned by token profiles and search; not a full-chain feed.',
    warnings: failures,
    pairs: [...byPool.values()]
  };
}

if (require.main === module) {
  (async () => {
    const data = await collectMarket();
    const directory = path.join(__dirname, '../public/data');
    await fs.mkdir(directory, { recursive: true });
    const target = path.join(directory, 'market.json');
    await fs.writeFile(target + '.tmp', JSON.stringify(data));
    await fs.rename(target + '.tmp', target);
    console.log(JSON.stringify({ provider: data.provider, observedAt: data.observedAt, pools: data.pairs.length, tokens: Market.merge(data.pairs).length }));
  })().catch(error => { console.error(error.message); process.exitCode = 1; });
}

module.exports = { collectMarket };
