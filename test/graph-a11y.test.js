'use strict';
/* graph pages: aria-label strings follow the page language, focus panning, layout toggle state.
 * The page helpers are plain functions inside the HTML; they are pulled out by name and run in a sandbox. */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { spawnSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const PAGES = ['xray-graph.html', 'xray-graph-nextui.html'];
const read = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');

// text from `marker` up to its matching closing brace (quotes and // comments skipped)
function block(src, marker) {
  const at = src.indexOf(marker);
  assert.ok(at >= 0, 'not found: ' + marker);
  let i = src.indexOf('{', at), depth = 0;
  for (; i < src.length; i++) {
    const c = src[i];
    if (c === '"' || c === "'") { const q = c; i++; while (i < src.length && src[i] !== q) { if (src[i] === '\\') i++; i++; } continue; }
    if (c === '/' && src[i + 1] === '/') { while (i < src.length && src[i] !== '\n') i++; continue; }
    if (c === '{') depth++;
    else if (c === '}' && --depth === 0) return src.slice(at, i + 1);
  }
  throw new Error('unbalanced: ' + marker);
}
const table = (f) => vm.runInNewContext('(' + block(read(f), 'var I18N =').replace(/^var I18N =\s*/, '') + ')');
const fn = (f, name) => vm.runInNewContext('(' + block(read(f), 'function ' + name + '(') + ')');

for (const f of PAGES) {
  test(f + ': node aria-label has English and Japanese text with a {name} slot', () => {
    const t = table(f);
    assert.match(t.en.node_open, /\{name\}/);
    assert.match(t.ja.node_open, /\{name\}/);
    assert.match(t.ja.node_open, /[ぁ-んァ-ヿ㐀-鿿]/);
    assert.notStrictEqual(t.en.node_open, t.ja.node_open);
  });

  test(f + ': overview nodes take their aria-label from the table, not a fixed English string', () => {
    const src = read(f);
    assert.match(src, /setAttribute\(\s*'data-i18n-aria'\s*,\s*'node_open'\s*\)/);
    assert.match(src, /querySelectorAll\('\[data-i18n-aria\]'\)/);   // re-applied on a language switch
  });

  test(f + ': nxFill fills {name} literally', () => {
    const nxFill = fn(f, 'nxFill');
    assert.strictEqual(nxFill('Open DeepDive for {name}', 'r1 (frr)'), 'Open DeepDive for r1 (frr)');
    assert.strictEqual(nxFill('{name} の DeepDive を開く', 'r2'), 'r2 の DeepDive を開く');
    assert.strictEqual(nxFill('{name}/{name}', '$&$1'), '$&$1/$&$1');   // no replace() patterns
    assert.strictEqual(nxFill('x {name}', null), 'x ');
    assert.strictEqual(nxFill('no slot', 'r1'), 'no slot');
  });
}

test('nxFill is the same in both pages', () => {
  assert.strictEqual(block(read(PAGES[0]), 'function nxFill('), block(read(PAGES[1]), 'function nxFill('));
});

test('nxPanDelta: shift that brings a focused node inside the overview', () => {
  const d = fn('xray-graph-nextui.html', 'nxPanDelta');
  const box = { left: 0, top: 0, right: 600, bottom: 360 };
  const r = (l, t, w, h) => ({ left: l, top: t, right: l + w, bottom: t + h });
  const eq = (got, want) => assert.deepStrictEqual({ dx: got.dx + 0, dy: got.dy + 0 }, want);
  eq(d(r(100, 100, 40, 40), box, 8), { dx: 0, dy: 0 });         // already inside
  eq(d(r(-30, 100, 40, 40), box, 8), { dx: 38, dy: 0 });        // off the left
  eq(d(r(580, 100, 40, 40), box, 8), { dx: -28, dy: 0 });       // off the right
  eq(d(r(100, -50, 40, 40), box, 8), { dx: 0, dy: 58 });        // under the bar / above the top
  eq(d(r(100, 400, 40, 40), box, 8), { dx: 0, dy: -88 });       // below the bottom
  eq(d(r(0, 0, 700, 40), box, 8), { dx: -50, dy: 8 });          // wider than the box: centred
  eq(d(r(5, 5, 40, 40), box), { dx: 0, dy: 0 });                // margin defaults to 0
});

test('Horizontal / Vertical buttons carry aria-pressed in the markup', () => {
  const src = read('xray-graph-nextui.html');
  for (const id of ['h-btn', 'v-btn']) {
    const m = src.match(new RegExp('<button[^>]*id="' + id + '"[^>]*>'));
    assert.ok(m, id + ' button');
    assert.match(m[0], /aria-pressed="(true|false)"/);
  }
  // a lab with rows starts in a known layout: its button is marked before the first press
  assert.match(src, /if \(window\.XRAY_TIERS\) setCur\(/);
});

test('check-i18n passes (data-i18n-aria keys included)', () => {
  const r = spawnSync(process.execPath, [path.join(ROOT, 'scripts/check-i18n.js')], { encoding: 'utf8' });
  assert.strictEqual(r.status, 0, r.stdout + r.stderr);
});
