(function (root, factory) {
  'use strict';
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.DialvoMarket = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  const addressPattern = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
  const number = value => value === null || value === undefined || value === '' || typeof value === 'boolean'
    ? null : Number.isFinite(Number(value)) ? Number(value) : null;
  function safeURL(value) {
    try { const u = new URL(value); return ['https:', 'http:'].includes(u.protocol) ? u.href : ''; }
    catch { return ''; }
  }
  function stats(value, transactions = false) {
    const result = {};
    for (const period of ['m5', 'h1', 'h6', 'h24']) {
      result[period] = transactions
        ? { buys: number(value?.[period]?.buys), sells: number(value?.[period]?.sells) }
        : number(value?.[period]);
    }
    return result;
  }
  function normalize(raw) {
    if (!raw || raw.chainId !== 'solana' || !addressPattern.test(raw.baseToken?.address || '') || !addressPattern.test(raw.pairAddress || '')) return null;
    return {
      id: raw.pairAddress, address: raw.baseToken.address,
      ticker: String(raw.baseToken.symbol || raw.baseToken.address.slice(0, 6)),
      name: String(raw.baseToken.name || ''),
      image: safeURL(raw.info?.imageUrl) || 'assets/logo.webp',
      website: safeURL(raw.info?.websites?.[0]?.url),
      dex: String(raw.dexId || ''), quote: String(raw.quoteToken?.symbol || ''),
      price: number(raw.priceUsd), cap: number(raw.marketCap), fdv: number(raw.fdv),
      liquidity: number(raw.liquidity?.usd), createdAt: number(raw.pairCreatedAt),
      volumes: stats(raw.volume), changes: stats(raw.priceChange), txns: stats(raw.txns, true)
    };
  }
  function merge(rawPairs) {
    const tokens = new Map();
    for (const raw of rawPairs) {
      const t = normalize(raw);
      if (!t) continue;
      const previous = tokens.get(t.address);
      if (!previous || (t.liquidity ?? -1) > (previous.liquidity ?? -1)) tokens.set(t.address, t);
    }
    return [...tokens.values()];
  }
  function patchQuotes(current, rawPairs) {
    const pools = new Map();
    for (const raw of rawPairs) { const t = normalize(raw); if (t) pools.set(t.id, t); }
    const best = new Map(merge(rawPairs).map(t => [t.address, t]));
    return current.map(t => pools.get(t.id) || best.get(t.address) || t);
  }
  function metric(t, key, period = 'h24') {
    if (key === 'age') return t.createdAt;
    if (key === 'volume') return t.volumes[period];
    if (key === 'change') return t.changes[period];
    return t[key];
  }
  function select(tokens, options = {}) {
    const { query = '', watch = null, filters = {}, lane = null, sort = 'default', period = 'h24', now = Date.now() } = options;
    const q = query.trim().toLowerCase();
    const rows = tokens.filter(t => {
      if (watch && !watch.has(t.address)) return false;
      if (q && !(t.ticker + ' ' + t.name + ' ' + t.address).toLowerCase().includes(q)) return false;
      if (filters.cap && (t.cap === null || t.cap < filters.cap)) return false;
      if (filters.liquidity && (t.liquidity === null || t.liquidity < filters.liquidity)) return false;
      if (filters.age && (!t.createdAt || now - t.createdAt > filters.age * 60000)) return false;
      if (lane === 'migrated' && !(t.changes[period] > 0)) return false;
      return true;
    });
    const key = sort === 'default' ? lane === 'new' ? 'age' : lane === 'migrated' ? 'change' : 'volume' : sort;
    return rows.sort((a, b) => {
      const av = metric(a, key, period), bv = metric(b, key, period);
      if (av === null || av === undefined) return bv === null || bv === undefined ? a.address.localeCompare(b.address) : 1;
      if (bv === null || bv === undefined) return -1;
      return bv - av || a.address.localeCompare(b.address);
    });
  }
  function snapshot(data, now = Date.now()) {
    const at = Date.parse(data?.observedAt);
    if (data?.schemaVersion !== 1 || !Number.isFinite(at) || at > now + 60000 || !Array.isArray(data.pairs)) return null;
    const tokens = merge(data.pairs);
    return tokens.length ? { tokens, observedAt: at, source: 'snapshot' } : null;
  }
  return { addressPattern, number, safeURL, normalize, merge, patchQuotes, metric, select, snapshot };
});
