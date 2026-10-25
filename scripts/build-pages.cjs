'use strict';
const fs = require('node:fs/promises');
const path = require('node:path');

(async () => {
  const root = path.resolve(__dirname, '..');
  const dist = path.join(root, 'dist');
  await fs.mkdir(dist, { recursive: true });
  await fs.cp(path.join(root, 'public'), path.join(dist, 'public'), { recursive: true });
  await fs.copyFile(path.join(root, 'index.html'), path.join(dist, 'index.html'));
  await fs.writeFile(path.join(dist, '.nojekyll'), '');
  const Market = require('../public/scripts/market-model.js');
  const data = JSON.parse(await fs.readFile(path.join(dist, 'public/data/market.json'), 'utf8'));
  const snapshot = Market.snapshot(data);
  if (!snapshot) throw Error('Invalid or empty real-market snapshot.');
  console.log('Pages bundle: ' + snapshot.tokens.length + ' tokens; collected ' + data.observedAt);
})().catch(error => { console.error(error.message); process.exitCode = 1; });
