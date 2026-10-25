'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '..');

test('Pages root serves the actual login page and resolves assets under a repository subpath', () => {
  const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  assert.match(html, /id="connection-window"/);
  assert.doesNotMatch(html, /<base\b/);
  const origin = new URL('https://example.github.io/DIALVO/');
  for (const [, , ref] of html.matchAll(/\b(href|src)="([^"]+)"/g)) {
    if (ref.startsWith('#')) continue;
    const target = new URL(ref, origin);
    if (target.origin !== origin.origin) continue;
    assert.ok(target.pathname.startsWith('/DIALVO/public/'), ref);
    const file = path.join(root, target.pathname.slice('/DIALVO/'.length));
    assert.ok(fs.existsSync(file), ref);
  }
});

test('every entry button navigates to the terminal for both root and public pages', () => {
  const script = fs.readFileSync(path.join(root, 'public/scripts/login.js'), 'utf8');
  const scriptURL = 'https://example.github.io/DIALVO/public/scripts/login.js?v=pages-entry-1';
  for (const href of ['https://example.github.io/DIALVO/', 'https://example.github.io/DIALVO/public/']) {
    const events = {};
    const form = {};
    const visited = [];
    const context = vm.createContext({
      URL,
      location: { href, assign: url => visited.push(url) },
      document: {
        currentScript: { src: scriptURL },
        addEventListener: (type, callback) => { events[type] = callback; },
        querySelector: () => ({ addEventListener: (type, callback) => { form[type] = callback; } })
      }
    });
    vm.runInContext(script, context);
    events.click({ target: { closest: () => ({}) }, preventDefault() {}, stopImmediatePropagation() {} });
    form.submit({ preventDefault() {} });
    assert.deepEqual(visited, Array(2).fill('https://example.github.io/DIALVO/public/dialvo-terminal.html#trenches'));
  }
});
