// set-skin.test.js — xrayCore.setSkin(id | skin) and ?skin=<id>: a page that embeds X-Ray can pick its colors.
// Run: node --test   (from the repo root; Node >= 18, no dependencies)
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..');
const API = fs.readFileSync(path.join(ROOT, 'xray-api.js'), 'utf8');
const SKIN = fs.readFileSync(path.join(ROOT, 'xray-skin.js'), 'utf8');

function load(opts) {
  opts = opts || {};
  const store = {}, timers = [], engine = [];
  const el = () => ({ classList: { add() {}, remove() {}, contains: () => false }, style: { setProperty() {}, removeProperty() {} }, setAttribute() {}, appendChild() {}, querySelector: () => null, querySelectorAll: () => [] });
  const document = {
    readyState: 'complete', currentScript: null, head: el(), body: el(), documentElement: el(),
    querySelector: () => null, querySelectorAll: () => [], getElementById: () => null,
    createElement: () => ({ id: '', textContent: '', setAttribute() {} }), addEventListener() {},
  };
  const win = {
    document, location: { search: opts.search || '', hash: '' }, JSON,
    setTimeout: (fn) => { timers.push(fn); }, addEventListener() {},
    localStorage: { getItem: (k) => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); } },
  };
  if (!opts.noEngine) win.xraySetSkin = (s) => engine.push(s);
  win.window = win;
  vm.runInNewContext(API, win);
  if (!opts.noSkinJs) vm.runInNewContext(SKIN, win);
  engine.length = 0;   // XraySkin.init applied the stored / default skin on load
  return { win, core: win.xrayCore, engine, store, timers };
}

test('setSkin(id) applies that preset; an unknown id does nothing', () => {
  const t = load();
  assert.strictEqual(t.core.setSkin('containerlab'), true);
  assert.strictEqual(t.engine.length, 1);
  assert.strictEqual(t.engine[0].id, 'containerlab');
  assert.strictEqual(t.core.setSkin('no-such-skin'), false);
  assert.strictEqual(t.engine.length, 1);
  assert.deepStrictEqual(t.store, {});   // never written to localStorage
});

test('setSkin(object) passes only an id, #rrggbb colors, protocolOrder and surface', () => {
  const t = load();
  const evil = { id: '"><img src=x onerror=alert(1)>', colors: { link: '#112233', ospf: 'red;background:url(x)' }, protocolOrder: 'ospf-top', engineShape: '<svg onload=alert(1)>', rules: { x: 1 } };
  assert.strictEqual(t.core.setSkin(evil), true);
  const s = t.engine[0];
  assert.strictEqual(s.id, 'custom');
  assert.strictEqual(s.colors.link, '#112233');
  assert.match(s.colors.ospf, /^#[0-9a-f]{6}$/);          // a bad color falls back to the signature color
  assert.strictEqual(s.protocolOrder, 'ospf-top');
  assert.notStrictEqual(s.engineShape, evil.engineShape);
  assert.deepStrictEqual(Object.assign({}, s.rules), {});
  assert.strictEqual(s.surface, 'dark');                  // nx_skin_surface: not given = dark
  assert.strictEqual(t.core.setSkin({ colors: {}, surface: 'light' }), true);
  assert.strictEqual(t.engine[1].surface, 'light');
  assert.strictEqual(t.core.setSkin({ colors: {}, surface: 'url(x)' }), true);
  assert.strictEqual(t.engine[2].surface, 'dark');
  assert.strictEqual(t.core.setSkin(null), false);
  assert.strictEqual(t.core.setSkin(42), false);
});

test('setSkin without xray-skin.js does nothing; without the engine it does not loop through xrayCore.setSkin', () => {
  assert.strictEqual(load({ noSkinJs: true }).core.setSkin('containerlab'), false);
  const t = load({ noEngine: true });
  assert.strictEqual(t.core.setSkin('flat-docs'), true);   // XraySkin.apply -> xrayCore.setSkin -> returns at once
});

test('parseDeepLink reads ?skin=<id> (letters, digits, - and _ only)', () => {
  const { core } = load();
  assert.strictEqual(core.parseDeepLink('?skin=flat-docs', '').skin, 'flat-docs');
  assert.strictEqual(core.parseDeepLink('?skin=%7B%22colors%22%3A1%7D', '').skin, undefined);
});

test('the iframe embed passes setSkin through', () => {
  assert.match(fs.readFileSync(path.join(ROOT, 'xray-embed-frame.js'), 'utf8'), /var CALLS = \{[^}]*\bsetSkin: 1\b/);
  assert.match(fs.readFileSync(path.join(ROOT, 'xray-embed.js'), 'utf8'), /setSkin: function \(skin\) \{ send\('setSkin', \[skin\]\); \}/);
  assert.match(API, /setSkin: setSkin,\s*\n\s*startPolling: startPolling/);
});
