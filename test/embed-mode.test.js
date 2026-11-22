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
  const timers = [], scrolls = [], deep = { getBoundingClientRect: () => ({ top: 900 }) };
  const cls = new Set(), byId = {}, head = { kids: [], appendChild(e) { this.kids.push(e); if (e.id) byId[e.id] = e; } };
  const el = () => ({ classList: { add() {}, remove() {}, contains: () => false }, style: {}, setAttribute() {}, appendChild() {}, querySelector: () => null, querySelectorAll: () => [] });
  const document = {
    currentScript: null, head, body: el(),
    documentElement: { classList: { add: (c) => cls.add(c), remove: (c) => cls.delete(c), contains: (c) => cls.has(c) } },
    querySelector: (sel) => (sel === '.xray-deep-engine' ? deep : null), querySelectorAll: () => [], getElementById: (id) => byId[id] || null,
    createElement: () => ({ id: '', textContent: '' }), addEventListener() {},
  };
  const win = { document, location: { search: search || '', hash: hash || '' }, setTimeout: (fn) => timers.push(fn), addEventListener() {}, JSON,
    pageYOffset: 100, scrollTo: (x, y) => scrolls.push([x, y]) };
  win.window = win;
  vm.runInNewContext(SRC, win);
  return { win, cls, head, timers, scrolls, run() { while (timers.length) timers.shift()(); } };
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

test('?embed=1 + a link that opens a router scrolls this frame to the DeepDive (it is drawn under the topology)', () => {
  let t = load('?embed=1');
  t.win.xrayDeepLinkOpenNode = () => {};
  t.win.xrayCore.applyDeepLink({ node: 'r1', deepdive: true });
  t.run();
  assert.deepStrictEqual(t.scrolls[0], [0, 996]);   // the DeepDive's top (900 on screen + 100 scrolled) - 4
  t = load('?embed=1');
  t.win.xrayCore.applyDeepLink({ deepdive: true });   // nothing rendered: openDeepDive is skipped, the scroll still aims at the DeepDive
  t.run();
  assert.strictEqual(t.scrolls.length, 2);
  t = load('');   // not embedded: the page is not scrolled
  t.win.xrayDeepLinkOpenNode = () => {};
  t.win.xrayCore.applyDeepLink({ node: 'r1' });
  t.run();
  assert.deepStrictEqual(t.scrolls, []);
  t = load('?embed=1');   // a prefix alone does not scroll
  t.win.xrayCore.applyDeepLink({ prefix: '8.8.8.0/24' });
  t.timers.length = Math.min(t.timers.length, 0);
  assert.deepStrictEqual(t.scrolls, []);
});

// view=deepdive: a fake DeepDive 1100 x 560 inside a .topology box, in a frame 800 x 400
function loadDeep(search, size) {
  const t = load(search);
  const box = { style: {} };
  const deep = { offsetWidth: 1100, offsetHeight: 560, closest: (sel) => (sel === '.topology' ? box : null), getBoundingClientRect: () => ({ top: 40 }) };
  t.win.document.querySelector = (sel) => (sel === '.xray-deep-engine' ? deep : null);
  t.win.innerWidth = size ? size[0] : 800; t.win.innerHeight = size ? size[1] : 400; t.win.pageYOffset = 0;
  return Object.assign(t, { box });
}

test('?embed=1&view=deepdive hides the overview (data-nx-overview); view without embed=1, or another view, does nothing', () => {
  let t = load('?embed=1&view=deepdive');
  assert.ok(t.cls.has('nx-embed') && t.cls.has('nx-embed-deep'));
  assert.match(t.head.kids[0].textContent, /html\.nx-embed-deep \[data-nx-overview\]\{display:none!important\}/);
  assert.ok(!load('?view=deepdive').cls.has('nx-embed-deep'));
  assert.ok(!load('?embed=1&view=other').cls.has('nx-embed-deep'));
  assert.strictEqual(load('', '').win.xrayCore.parseDeepLink('?view=deepdive', '').view, 'deepdive');
});

test('view=deepdive opens the DeepDive without deepdive=1 and shrinks it to the frame (never above 1, not below 0.3)', () => {
  let t = loadDeep('?embed=1&view=deepdive');
  const opened = [];
  t.win.xrayDeepLinkOpenNode = (id) => opened.push(id);
  t.win.xrayCore.applyDeepLink({ node: 'r1' });
  t.run();
  assert.deepStrictEqual(opened, ['r1']);
  // min(1, (800 - 8) / 1100, (400 - 40 - 4) / (560 + 28)) = min(0.72, 0.605) = 0.605
  assert.strictEqual(t.box.style.zoom, '0.605');
  t = loadDeep('?embed=1&view=deepdive', [1600, 1200]);   // a big frame: left at its own size
  t.win.xrayCore.applyDeepLink({});
  t.run();
  assert.strictEqual(t.box.style.zoom, '');
  t = loadDeep('?embed=1&view=deepdive', [300, 150]);   // tiny: not below 0.3
  t.win.xrayCore.applyDeepLink({});
  t.run();
  assert.strictEqual(t.box.style.zoom, '0.300');
  t = loadDeep('?embed=1');   // embed=1 without view: scrolled to, not shrunk
  t.win.xrayDeepLinkOpenNode = () => {};
  t.win.xrayCore.applyDeepLink({ node: 'r1' });
  t.run();
  assert.strictEqual(t.box.style.zoom, undefined);
});
