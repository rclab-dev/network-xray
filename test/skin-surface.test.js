// skin-surface.test.js — the skin's `surface` (dark | light) and the Slate (light) preset (v1.8.1).
// Run: node --test        (from the repo root; Node >= 18, no dependencies)
//
// - normalize(): surface 'light' is kept, anything else (or none, as in every older skin) is 'dark'.
// - The Slate (light) preset is a preset like the others: matchPresetId finds it, and a skin with the same colors on
//   a dark ground is not it.
// - applyXnpVars(): a light ground writes the panel's structural tokens (--xnp-bg / fg / border ...) as well as the
//   six skin colors; a dark ground writes only the colors (the panel keeps its own dark defaults), also right after
//   a light skin was applied.
// - The colors of a light skin are dark enough to read as text on its ground (WCAG contrast >= 4.5 for the ones
//   the panel uses as text).
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const SKIN = fs.readFileSync(path.join(__dirname, '..', 'xray-skin.js'), 'utf8');

function load() {
  const styles = {};
  const el = () => ({ style: { setProperty() {} }, appendChild(n) { if (n.id) styles[n.id] = n; } });
  const document = {
    readyState: 'complete', head: el(), documentElement: el(),
    getElementById: (id) => styles[id] || null,
    createElement: () => ({ id: '', textContent: '' }), addEventListener() {},
  };
  const store = {};
  const win = { document, JSON, localStorage: { getItem: (k) => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); } } };
  win.window = win;
  vm.runInNewContext(SKIN, win);
  return { S: win.XraySkin, css: () => (styles['xnp-skin-vars'] || {}).textContent || '' };
}

test('normalize: surface light is kept; missing or anything else is dark', () => {
  const { S } = load();
  assert.strictEqual(S.normalize({ surface: 'light' }).surface, 'light');
  assert.strictEqual(S.normalize({}).surface, 'dark');
  assert.strictEqual(S.normalize({ surface: 'LIGHT' }).surface, 'dark');
  assert.strictEqual(S.normalize({ surface: '<b>' }).surface, 'dark');
  assert.strictEqual(S.normalize(S.SIGNATURE).surface, 'dark');
});

test('the Slate (light) preset: found by matchPresetId, only with its light ground', () => {
  const { S } = load();
  const p = S.presetById('slate-light');
  assert.ok(p, 'preset exists');
  assert.strictEqual(p.surface, 'light');
  assert.strictEqual(S.matchPresetId(p), 'slate-light');
  assert.strictEqual(S.matchPresetId(Object.assign({}, p, { surface: 'dark' })), null);
  // the presets that were there before keep matching (they have no surface = dark)
  ['signature', 'containerlab', 'flat-docs', 'accessible'].forEach((id) => assert.strictEqual(S.matchPresetId(S.presetById(id)), id));
});

test('applyXnpVars: a light ground writes the structural tokens; a dark one writes only the colors', () => {
  const { S, css } = load();
  S.apply(S.presetById('slate-light'));
  let t = css();
  assert.match(t, /--xnp-bg:#ffffff !important;/);
  assert.match(t, /--xnp-fg:#1e2430 !important;/);
  assert.match(t, /--xnp-border:#d3d9e2 !important;/);
  assert.match(t, /--xnp-ospf:#16803a !important;/);
  S.apply(S.presetById('signature'));
  t = css();
  assert.doesNotMatch(t, /--xnp-bg:/, 'back on a dark skin the panel keeps its own ground');
  assert.match(t, /--xnp-ospf:#39ff14 !important;/);
});

test('a light skin\'s text colors read on its ground (contrast >= 4.5)', () => {
  const { S } = load();
  function lum(hex) {
    const c = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4)));
    return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
  }
  function contrast(a, b) { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); }
  const p = S.presetById('slate-light'), sf = S.SURFACES.light;
  // the panel writes these as text: ok (= ospf) on the selected row and in the BGP table, bgp-header (= bgp), muted (= down)
  [['ospf', p.colors.ospf], ['bgp', p.colors.bgp], ['down', p.colors.down], ['fg', sf.fg], ['route-fg', sf['route-fg']], ['note', sf.note], ['accent', sf.accent]]
    .forEach(([k, c]) => assert.ok(contrast(c, sf.bg) >= 4.5, k + ' ' + c + ' on ' + sf.bg + ' = ' + contrast(c, sf.bg).toFixed(2)));
  assert.ok(contrast(p.colors.ospf, sf['sel-bg']) >= 4.5, 'the selected route row (ok on sel-bg)');
});
