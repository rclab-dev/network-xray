// The iframe embed: xray-embed.js (on the embedding page) and xray-embed-frame.js (inside embed.html).
// Both run here in a small fake window; messages are delivered by hand so the order and the origin checks are visible.
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..');
const HOST_SRC = fs.readFileSync(path.join(ROOT, 'xray-embed.js'), 'utf8');
const FRAME_SRC = fs.readFileSync(path.join(ROOT, 'xray-embed-frame.js'), 'utf8');

function listeners() {
  const by = {};
  return {
    add(ev, fn) { (by[ev] = by[ev] || []).push(fn); },
    remove(ev, fn) { by[ev] = (by[ev] || []).filter((f) => f !== fn); },
    fire(ev, e) { (by[ev] || []).slice().forEach((f) => f(e)); },
    count(ev) { return (by[ev] || []).length; },
  };
}

// The embedding page at https://host.example, with one container element.
function hostWindow() {
  const L = listeners();
  const frameWin = { sent: [], postMessage(msg, target) { this.sent.push({ msg: JSON.parse(JSON.stringify(msg)), target }); } };
  const container = {
    children: [],
    appendChild(el) { this.children.push(el); el.parentNode = this; if (el.tagName === 'IFRAME') el.contentWindow = frameWin; return el; },
    removeChild(el) { this.children = this.children.filter((c) => c !== el); el.parentNode = null; },
  };
  const win = {
    location: { origin: 'https://host.example' },
    document: {
      baseURI: 'https://host.example/page/index.html',
      querySelector: (sel) => (sel === '#xray' ? container : null),
      createElement: (tag) => ({ tagName: String(tag).toUpperCase(), style: {}, attrs: {}, setAttribute(k, v) { this.attrs[k] = v; } }),
    },
    URL, Promise,
    addEventListener: L.add, removeEventListener: L.remove,
    setInterval: () => 1, clearInterval() {},
  };
  vm.runInNewContext(HOST_SRC, Object.assign(win, { window: win }));
  return { win, container, frameWin, L, fromFrame(data, origin) { L.fire('message', { source: frameWin, origin, data }); } };
}

// embed.html at https://xray.example?origin=…, with a stub xrayCore that records calls.
function frameWindow(search) {
  const L = listeners();
  const D = listeners();
  const parent = { got: [], postMessage(msg, target) { this.got.push({ msg: JSON.parse(JSON.stringify(msg)), target }); } };
  const calls = [];
  const view = {};
  ['applyState', 'setTopology', 'setTrace', 'openDeepDive', 'openDeepDiveFor', 'closeDeepDive'].forEach((n) => { view[n] = (...a) => calls.push([n, ...a]); });
  const win = {
    location: { origin: 'https://xray.example', search },
    parent,
    URLSearchParams,
    document: { readyState: 'complete', documentElement: { scrollHeight: 640 }, body: { scrollHeight: 600 }, addEventListener: D.add },
    addEventListener: L.add,
    xrayCore: { renderTopology: (sel, config, opts) => { calls.push(['render', sel, config, opts]); return view; } },
  };
  vm.runInNewContext(FRAME_SRC, Object.assign(win, { window: win }));
  return {
    win, parent, calls, D,
    fromParent(data, origin, source) { L.fire('message', { source: source || parent, origin, data }); },
  };
}

test('xray-embed.js: the iframe points at embed.html with this page\'s origin, and calls wait for "ready"', () => {
  const h = hostWindow();
  const x = h.win.xrayEmbed.mount('#xray', { src: '../embed.html', height: 400 });
  const frame = h.container.children[0];
  assert.strictEqual(frame.tagName, 'IFRAME');
  assert.strictEqual(frame.src, 'https://host.example/embed.html?origin=https%3A%2F%2Fhost.example');
  assert.match(frame.style.cssText, /height:400px/);
  x.render({ nodes: [{ id: 'r1' }] }, { trace: [] });
  x.applyState({ r1: { has_full: true } });
  x.openDeepDive();
  assert.strictEqual(h.frameWin.sent.length, 0, 'nothing is sent before the frame says ready');
  h.fromFrame({ 'xray-embed': 1, ev: 'ready' }, 'https://host.example');
  assert.deepStrictEqual(h.frameWin.sent.map((s) => s.msg.cmd), ['render', 'applyState', 'openDeepDive']);
  assert.ok(h.frameWin.sent.every((s) => s.target === 'https://host.example' && s.msg['xray-embed'] === 1));
  x.closeDeepDive();
  assert.strictEqual(h.frameWin.sent[3].msg.cmd, 'closeDeepDive', 'after ready, calls go straight out');
});

test('xray-embed.js: messages from another window or origin are ignored; events reach on(); destroy removes everything', () => {
  const h = hostWindow();
  const x = h.win.xrayEmbed.mount('#xray', { src: 'https://xray.example/embed.html', autoHeight: true });
  const frame = h.container.children[0];
  const seen = [];
  x.on('deepdive', (e) => seen.push(e.open));
  x.applyState({});
  h.L.fire('message', { source: {}, origin: 'https://xray.example', data: { 'xray-embed': 1, ev: 'ready' } });
  h.fromFrame({ 'xray-embed': 1, ev: 'ready' }, 'https://evil.example');
  assert.strictEqual(h.frameWin.sent.length, 0, 'a ready from the wrong window or origin is not trusted');
  h.fromFrame({ 'xray-embed': 1, ev: 'ready' }, 'https://xray.example');
  assert.strictEqual(h.frameWin.sent.length, 1);
  assert.strictEqual(h.frameWin.sent[0].target, 'https://xray.example');
  h.fromFrame({ 'xray-embed': 1, ev: 'deepdive', open: true }, 'https://xray.example');
  h.fromFrame({ 'xray-embed': 1, ev: 'size', height: 733.2 }, 'https://xray.example');
  h.fromFrame({ ev: 'deepdive', open: false }, 'https://xray.example');   // no version key: ignored
  assert.deepStrictEqual(seen, [true]);
  assert.strictEqual(frame.style.height, '734px');
  x.destroy();
  assert.strictEqual(h.container.children.length, 0);
  assert.strictEqual(h.L.count('message'), 0);
  x.applyState({});
  assert.strictEqual(h.frameWin.sent.length, 1, 'nothing is sent after destroy');
});

test('xray-embed.js: startPolling sends each state the page fetches', async () => {
  const h = hostWindow();
  const x = h.win.xrayEmbed.mount('#xray');
  h.fromFrame({ 'xray-embed': 1, ev: 'ready' }, 'https://host.example');
  x.startPolling(() => Promise.resolve({ r1: { has_full: true } }), 1000);
  await new Promise((r) => setImmediate(r));
  assert.deepStrictEqual(h.frameWin.sent.map((s) => s.msg.cmd), ['applyState']);
  assert.deepStrictEqual(h.frameWin.sent[0].msg.args, [{ r1: { has_full: true } }]);
});

test('xray-embed-frame.js: says ready, then runs only the facade\'s calls from the parent at the given origin', () => {
  const f = frameWindow('?origin=https%3A%2F%2Fhost.example');
  assert.deepStrictEqual(f.parent.got.map((g) => g.msg.ev), ['ready', 'size']);
  assert.ok(f.parent.got.every((g) => g.target === 'https://host.example'));
  f.fromParent({ 'xray-embed': 1, cmd: 'render', args: [{ nodes: [] }, { trace: [] }] }, 'https://host.example');
  f.fromParent({ 'xray-embed': 1, cmd: 'applyState', args: [{ r1: {} }] }, 'https://host.example');
  f.fromParent({ 'xray-embed': 1, cmd: 'openDeepDiveFor', args: ['r2'] }, 'https://host.example');
  assert.deepStrictEqual(f.calls, [['render', '#topo', { nodes: [] }, { trace: [] }], ['applyState', { r1: {} }], ['openDeepDiveFor', 'r2']]);
  f.fromParent({ 'xray-embed': 1, cmd: 'applyState', args: [{}] }, 'https://evil.example');
  f.fromParent({ 'xray-embed': 1, cmd: 'applyState', args: [{}] }, 'https://host.example', {});
  assert.strictEqual(f.calls.length, 3, 'wrong origin or not from the parent: ignored');
  f.fromParent({ 'xray-embed': 1, cmd: 'startPolling', args: [] }, 'https://host.example');
  assert.deepStrictEqual(f.parent.got.slice(-1)[0].msg, { ev: 'error', message: 'unknown call: startPolling', 'xray-embed': 1 });
  f.D.fire('xraycore:deepdive', { detail: { open: true } });
  assert.deepStrictEqual(f.parent.got.slice(-1)[0].msg, { ev: 'deepdive', open: true, 'xray-embed': 1 });
});

test('xray-embed-frame.js: without ?origin= only its own origin is trusted; a call before render is an error', () => {
  const f = frameWindow('');
  f.fromParent({ 'xray-embed': 1, cmd: 'render', args: [{}] }, 'https://host.example');
  assert.strictEqual(f.calls.length, 0);
  f.fromParent({ 'xray-embed': 1, cmd: 'applyState', args: [{}] }, 'https://xray.example');
  assert.deepStrictEqual(f.parent.got.slice(-1)[0].msg, { ev: 'error', message: 'applyState before render', 'xray-embed': 1 });
  assert.strictEqual(f.parent.got.slice(-1)[0].target, 'https://xray.example');
});

test('embed.html loads the engine, the facade and the frame script, and has the two hosts the facade uses', () => {
  const html = fs.readFileSync(path.join(ROOT, 'embed.html'), 'utf8');
  const order = ['xray-core.js', 'xray-api.js', 'xray-embed-frame.js'].map((s) => html.indexOf('src="' + s + '"'));
  assert.ok(order.every((i) => i > 0) && order[0] < order[1] && order[1] < order[2], 'scripts in order: core, facade, frame');
  assert.match(html, /id="topo"/);
  assert.match(html, /class="xray-deep-engine"/);
});
