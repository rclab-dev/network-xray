// embed-mode.test.js — ?embed=1 hides the page's own title / intro / top bar / footer (marked data-nx-chrome), so an iframe
// shows just the picture and the DeepDive. Run: node --test   (from the repo root; Node >= 18, no dependencies)
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..');
const SRC = fs.readFileSync(path.join(ROOT, 'xray-api.js'), 'utf8');

function load(search, hash) {
  const cls = new Set(), byId = {}, head = { kids: [], appendChild(e) { this.kids.push(e); if (e.id) byId[e.id] = e; } };
  const el = () => ({ classList: { add() {}, remove() {}, contains: () => false }, style: {}, setAttribute() {}, appendChild() {}, querySelector: () => null, querySelectorAll: () => [] });
  const document = {
    currentScript: null, head, body: el(),
    documentElement: { classList: { add: (c) => cls.add(c), remove: (c) => cls.delete(c), contains: (c) => cls.has(c) } },
    querySelector: () => null, querySelectorAll: () => [], getElementById: (id) => byId[id] || null,
    createElement: () => ({ id: '', textContent: '' }), addEventListener() {},
  };
  const win = { document, location: { search: search || '', hash: hash || '' }, setTimeout() {}, addEventListener() {}, JSON };
  win.window = win;
  vm.runInNewContext(SRC, win);
  return { win, cls, head };
}

test('?embed=1 (or #embed=1) turns on the embed look once; no flag leaves the page alone', () => {
  let t = load('?embed=1');
  assert.ok(t.cls.has('nx-embed'));
  assert.strictEqual(t.head.kids.length, 1);
  assert.match(t.head.kids[0].textContent, /html\.nx-embed \[data-nx-chrome\]\{display:none!important\}/);
  t.win.xrayCore.applyEmbedMode(true);
  assert.strictEqual(t.head.kids.length, 1);   // the style is added once
  assert.ok(load('', '#embed=1').cls.has('nx-embed'));
  t = load('?embed=0');
  assert.ok(!t.cls.has('nx-embed'));
  assert.strictEqual(load('?node=r1').head.kids.length, 0);
});

// Pages that ship: the title is marked, and the picture / DeepDive / replay bar are never marked.
const PAGES = ['xray-graph-nextui.html', 'xray-graph.html', 'demo/index.html', 'demo/index-bgp.html', 'demo/index-bgp-lp.html', 'demo/bgp-lp/page.html.tmpl'];
for (const f of PAGES) {
  test(f + ': the title is data-nx-chrome; the topology, DeepDive and replay bar are not', () => {
    const html = fs.readFileSync(path.join(ROOT, f), 'utf8');
    assert.match(html, /<h1 data-nx-chrome>/);
    assert.match(html, /<p class="sub"[^>]*data-nx-chrome/);
    const marked = html.match(/<[a-z0-9]+\b[^>]*\bdata-nx-chrome\b[^>]*>/g) || [];
    for (const tag of marked) assert.doesNotMatch(tag, /topo|deep-engine|replay|peers|clab-topology|ov-frame|id="ov"/, tag);
  });
}
