'use strict';
const M = require('../public/scripts/market-model.js');
const base = process.env.DIALVO_SITE_URL;

async function check() {
  if (!base || !base.startsWith('https://')) throw Error('DIALVO_SITE_URL must be the deployed HTTPS origin.');
  async function get(relative, json = false) {
    const url = new URL(relative, base.endsWith('/') ? base : base + '/');
    url.searchParams.set('verify', String(Date.now()));
    const response = await fetch(url, { headers: { 'Cache-Control': 'no-cache' }, signal: AbortSignal.timeout(12000) });
    if (!response.ok) throw Error(relative + ': HTTP ' + response.status);
    return json ? response.json() : response.text();
  }
  const [home, terminal, script, css, data] = await Promise.all([
    get('./'), get('public/dialvo-terminal.html'), get('public/scripts/terminal.js'),
    get('public/styles/terminal.css'), get('public/data/market.json', true)
  ]);
  if (!home.includes('id="connection-window"') || !home.includes('public/styles/login.css')) throw Error('Published homepage is not the DIALVO connection entry.');
  if (!terminal.includes('id="board"') || !terminal.includes('scripts/market-model.js')) throw Error('Published terminal is missing its market application.');
  if (!script.includes('syncCards') || !css.includes('--terminal-bg:#030a2c')) throw Error('Published scripts or theme are outdated.');
  const snapshot = M.snapshot(data);
  if (!snapshot || Date.now() - snapshot.observedAt > 3600000) throw Error('Published market snapshot is missing, invalid or older than one hour.');
  return { url: base, homepage: 'Connect To', terminal: 'ready', provider: data.provider, tokens: snapshot.tokens.length, observedAt: data.observedAt };
}

(async () => {
  let error;
  for (let attempt = 0; attempt < 8; attempt++) {
    try { console.log('Published application verified: ' + JSON.stringify(await check())); return; }
    catch (e) { error = e; console.log('Waiting for published assets: ' + e.message); }
    await new Promise(resolve => setTimeout(resolve, 5000));
  }
  throw error;
})().catch(error => { console.error(error.message); process.exitCode = 1; });
