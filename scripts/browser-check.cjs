'use strict';
const fs = require('node:fs/promises');
const path = require('node:path');
const assert = require('node:assert/strict');
const { createServer } = require('../server.cjs');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const fixtureMode = process.argv.includes('--fixture');
const root = path.resolve(__dirname, '..');
const artifacts = path.join(root, 'artifacts');
const fixtureAt = Date.now() - 90000;
let fixtureCalls = 0;
function fixturePairs() {
  return ['A', 'B', 'C', 'D', 'E'].map((letter, i) => ({
    chainId: 'solana', pairAddress: letter.repeat(32),
    baseToken: { address: letter.repeat(33), symbol: letter + '-QA', name: 'Browser fixture' },
    quoteToken: { symbol: 'SOL' }, priceUsd: String(0.01 * (i + 1) + fixtureCalls * 0.0001),
    marketCap: (i + 1) * 10000, fdv: (i + 1) * 12000,
    liquidity: { usd: (i + 1) * 2000 }, volume: { h24: (6 - i) * 800, m5: i * 70 },
    priceChange: { h24: i * 4 - 3, m5: 7 - i },
    txns: { h24: { buys: 10 + i, sells: i }, m5: { buys: i, sells: 0 } },
    pairCreatedAt: Date.now() - i * 800000
  }));
}

(async () => {
  await fs.mkdir(artifacts, { recursive: true });
  const server = createServer(fixtureMode ? { cacheMs: 0, fetchImpl: async url => {
    fixtureCalls++;
    return new Response(JSON.stringify(url.includes('profiles') ? [] : url.includes('/tokens/') ? fixturePairs() : { pairs: fixturePairs() }));
  } } : {});
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const base = 'http://127.0.0.1:' + server.address().port;
  const browser = await chromium.launch({ headless: true, ...(process.env.BROWSER_EXECUTABLE ? { executablePath: process.env.BROWSER_EXECUTABLE } : {}) });
  const errors = [];
  const report = { mode: fixtureMode ? 'isolated-browser-fixtures' : 'real-provider', checks: [], errors };
  const record = name => { report.checks.push(name); console.log('PASS ' + name); };
  const snapshot = fixtureMode ? {
    schemaVersion: 1, provider: 'DEX Screener', observedAt: new Date(fixtureAt).toISOString(), pairs: fixturePairs()
  } : JSON.parse(await fs.readFile(path.join(root, 'public/data/market.json'), 'utf8'));
  function observe(page) {
    page.on('pageerror', error => errors.push(error.message));
  }
  try {
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
    const page = await context.newPage();
    observe(page);
    await page.goto(base + '/');
    await page.locator('#connection-window').waitFor();
    assert.equal(await page.evaluate(() => getComputedStyle(document.body).backgroundColor), 'rgb(3, 10, 44)');
    await page.screenshot({ path: path.join(artifacts, 'login-desktop.png'), fullPage: true });
    await page.locator('#cancel-connect').click();
    await page.waitForURL('**/dialvo-terminal.html#trenches');
    assert.equal(await page.evaluate(() => getComputedStyle(document.body).backgroundColor), 'rgb(3, 10, 44)');
    await page.locator('#list-new .token-card').first().waitFor({ timeout: 60000 });
    await page.waitForFunction(() => !state.loading && state.source === 'live', null, { timeout: 60000 });
    report.provider = await page.evaluate(() => ({ source: state.source, tokens: tokens.length, checkedAt: state.checkedAt }));
    assert.ok(report.provider.tokens > 0);
    record('entry routes to Trenches with received provider quotes');
    const firstAddress = await page.locator('#list-new .token-card').first().getAttribute('data-token');
    await page.locator('#list-new .token-card').first().locator('[data-watch]').click();
    await page.locator('.navigation [data-view="watchlist"]').click();
    assert.equal(await page.locator('#watch-count').textContent(), '1');
    assert.ok(await page.locator('#list-new .token-card').count());
    await page.reload();
    await page.locator('#list-new .token-card').first().waitFor({ timeout: 60000 });
    assert.equal(await page.locator('#watch-count').textContent(), '1');
    record('watchlist survives navigation and refresh');
    await page.locator('.navigation [data-view="trenches"]').click();
    await page.locator('#sort').selectOption('cap');
    const sorted = await page.evaluate(() => ['new', 'bonding', 'migrated'].every(lane => {
      const values = [...document.querySelectorAll('#list-' + lane + ' > .token-card')]
        .map(el => tokens.find(t => t.address === el.dataset.token)?.cap).filter(v => v !== null && v !== undefined);
      return values.every((v, i) => i === 0 || values[i - 1] >= v);
    }));
    assert.ok(sorted);
    record('explicit market-cap sort applies to all lanes');
    await page.locator('#period').selectOption('m5');
    assert.match(await page.locator('#lane-sort-bonding').textContent(), /Market cap/);
    await page.locator('#filter-btn').click();
    await page.locator('#f-cap').fill('999999999999999999999999999999');
    await page.locator('[data-action="apply-filters"]').click();
    assert.equal(await page.locator('#list-new .token-card').count(), 0);
    await page.locator('#list-new [data-action="clear-filters"]').click();
    await page.locator('#list-new .token-card').first().waitFor();
    record('filters remove results and can be cleared');
    await page.locator('#global-search').fill(firstAddress);
    await page.waitForTimeout(1000);
    await page.locator('#list-new .token-card').first().waitFor({ timeout: 30000 });
    assert.equal(await page.locator('#list-new .token-card').first().getAttribute('data-token'), firstAddress);
    record('contract search matches loaded or fetched markets');
    await page.locator('#global-search').fill('');
    await page.locator('#sort').selectOption('default');
    await page.waitForFunction(() => !state.loading && !state.quoteBusy);
    const initialCycle = Number(await page.locator('#feed-label').getAttribute('data-cycles'));
    await page.evaluate(() => { window.cardBeforePoll = document.querySelector('#list-new .token-card'); });
    await page.waitForFunction(cycle => state.successfulCycles > cycle && !state.quoteBusy, initialCycle, { timeout: 35000 });
    assert.ok(await page.evaluate(() => window.cardBeforePoll.isConnected));
    record('another quote cycle updates without destroying existing cards');
    await page.locator('#pause').click();
    assert.equal(await page.locator('#pause').getAttribute('aria-pressed'), 'true');
    const pausedCycle = Number(await page.locator('#feed-label').getAttribute('data-cycles'));
    await page.waitForTimeout(8500);
    assert.equal(Number(await page.locator('#feed-label').getAttribute('data-cycles')), pausedCycle);
    await page.locator('#pause').click();
    record('pause prevents automatic quote refresh');
    await page.locator('#list-new .token-card').first().locator('[data-token]').click();
    await page.locator('#detail-price').waitFor();
    assert.ok(await page.locator('#detail-price').textContent());
    await page.locator('#dialog [data-action="close"]').click();
    await page.screenshot({ path: path.join(artifacts, 'terminal-desktop.png'), fullPage: true });
    record('token detail opens with current price');

    const fallbackContext = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
    const fallback = await fallbackContext.newPage();
    observe(fallback);
    await fallback.route('**/api/**', route => route.abort());
    await fallback.route('https://api.dexscreener.com/**', route => route.abort());
    await fallback.route('**/data/market.json', route => route.fulfill({ json: snapshot }));
    await fallback.goto(base + '/dialvo-terminal.html#trenches');
    await fallback.locator('#list-new .token-card').first().waitFor({ timeout: 30000 });
    await fallback.waitForFunction(() => document.body.dataset.feed === 'snapshot');
    assert.match(await fallback.locator('#feed-label').textContent(), /SNAPSHOT/);
    assert.match(await fallback.locator('#status-message').textContent(), /snapshot collected/);
    assert.ok(await fallback.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
    await fallback.locator('[data-stage="bonding"]').click();
    assert.ok(await fallback.locator('[data-lane="bonding"]').isVisible());
    await fallback.screenshot({ path: path.join(artifacts, 'terminal-mobile-snapshot.png'), fullPage: true });
    record('mobile fallback displays actual snapshot with original timestamp and no horizontal overflow');
    await fallback.locator('#list-bonding .token-card').first().locator('[data-token]').click();
    await fallback.locator('#detail-price').waitFor();
    assert.ok(await fallback.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
    await fallback.screenshot({ path: path.join(artifacts, 'detail-mobile.png'), fullPage: true });
    record('mobile token details fit the viewport');
    await fallbackContext.close();
    assert.deepEqual(errors, []);
  } finally {
    await fs.writeFile(path.join(artifacts, 'acceptance.json'), JSON.stringify(report, null, 2));
    await browser.close();
    await new Promise(resolve => server.close(resolve));
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
