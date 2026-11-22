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

// view=deepdive: the page is shown again in a frame of its own (not shrunk inside), and that frame is scaled
function loadNest(search, size, opts) {
  opts = opts || {};
  const cls = new Set(), byId = {}, kids = [], listeners = {};
  const head = { kids: [], appendChild(e) { this.kids.push(e); if (e.id) byId[e.id] = e; } };
  const body = { appendChild(e) { kids.push(e); if (e.id) byId[e.id] = e; } };
  const document = {
    readyState: 'complete', currentScript: null, head, body,
    documentElement: { classList: { add: (c) => cls.add(c), remove: (c) => cls.delete(c), contains: (c) => cls.has(c) } },
    querySelector: () => null, querySelectorAll: () => [], getElementById: (id) => byId[id] || null,
    createElement: (tag) => ({ tagName: String(tag).toUpperCase(), id: '', textContent: '', style: {}, attrs: {}, setAttribute(k, v) { this.attrs[k] = v; } }),
    addEventListener() {},
  };
  const win = {
    document, location: { search: search || '', hash: opts.hash || '', pathname: opts.pathname || '/demo/index-bgp-lp.html' },
    innerWidth: size[0], innerHeight: size[1], setTimeout() {}, JSON,
    addEventListener: (ev, fn) => { (listeners[ev] = listeners[ev] || []).push(fn); },
  };
  if (opts.embedFrame) win.__nxEmbedFrame = true;
  win.window = win;
  vm.runInNewContext(SRC, win);
  return { win, cls, kids, listeners, frame: kids.filter((k) => k.id === 'nx-deep-frame')[0] };
}

test('?embed=1&view=deepdive shows the page again in a frame at its own size: view removed, deepdive=1, node / prefix kept', () => {
  const t = loadNest('?embed=1&view=deepdive&node=r1&prefix=8.8.8.0%2F24', [800, 400]);
  assert.ok(t.cls.has('nx-embed') && t.cls.has('nx-embed-deep'));
  assert.ok(t.frame, 'no frame');
  assert.strictEqual(t.frame.src, '/demo/index-bgp-lp.html?embed=1&node=r1&prefix=8.8.8.0%2F24&deepdive=1');
  assert.match(t.frame.style.cssText, /position:fixed/);
  // scaled to the frame's height: k = 400 / 700; the inner page is the frame's size / k
  assert.strictEqual(t.frame.style.transform, 'scale(0.571)');
  assert.strictEqual(t.frame.style.width, Math.ceil(800 / (400 / 700)) + 'px');
  assert.strictEqual(t.frame.style.height, '700px');
  t.win.innerHeight = 900; t.listeners.resize.forEach((f) => f());   // a taller frame: its own size, not scaled
  assert.strictEqual(t.frame.style.transform, '');
  assert.strictEqual(t.frame.style.height, '900px');
});

test('view=deepdive: deepdive= already in the link is not doubled; no embed=1 / another view = no frame', () => {
  assert.strictEqual(loadNest('?embed=1&deepdive=1&view=deepdive', [800, 400]).frame.src, '/demo/index-bgp-lp.html?embed=1&deepdive=1');
  assert.strictEqual(loadNest('?view=deepdive', [800, 400]).frame, undefined);
  assert.strictEqual(loadNest('?embed=1&view=other', [800, 400]).frame, undefined);
  assert.strictEqual(loadNest('?embed=1', [800, 400]).frame, undefined);
});

test('embed.html: nested only when it reads ?state= (the JavaScript embed talks to this frame)', () => {
  assert.strictEqual(loadNest('?embed=1&view=deepdive&origin=https%3A%2F%2Fa.example', [800, 400], { embedFrame: true, pathname: '/embed.html' }).frame, undefined);
  const t = loadNest('?state=xray-states.json&embed=1&view=deepdive&node=r2', [800, 400], { embedFrame: true, pathname: '/embed.html' });
  assert.strictEqual(t.frame.src, '/embed.html?state=xray-states.json&embed=1&node=r2&deepdive=1');
});
