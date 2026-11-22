// deeplink.test.js — a link can open a router, the DeepDive and a prefix: ?node=r1&deepdive=1&prefix=8.8.8.0/24 (or after #).
// Run: node --test        (from the repo root; Node >= 18, no dependencies)
//
// xray-api.js runs here in a small fake window (no engine): the names in the link are only used when the picture has them,
// a prefix is picked by clicking its Routing-table row (compared as text, never put into a selector), and the BGP decision
// opens only for a prefix the BGP table has.
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const SRC = fs.readFileSync(path.join(__dirname, '..', 'xray-api.js'), 'utf8');
const FRAME_SRC = fs.readFileSync(path.join(__dirname, '..', 'xray-embed-frame.js'), 'utf8');
const HOST_SRC = fs.readFileSync(path.join(__dirname, '..', 'xray-embed.js'), 'utf8');

function row(prefix, clicks) {
  return { getAttribute: (k) => (k === 'data-prefix' ? prefix : null), click() { clicks.push(prefix); } };
}

function load(opts) {
  opts = opts || {};
  const clicks = [], decisions = [], timers = [], listeners = {};
  let rows = (opts.rows || []).map((p) => row(p, clicks));
  const el = () => ({ classList: { add() {}, remove() {}, contains: () => false }, style: { setProperty() {} }, setAttribute() {}, appendChild() {}, querySelector: () => null, querySelectorAll: () => [] });
  const body = el();
  const document = {
    currentScript: null, body, documentElement: el(),
    querySelector: () => null,
    querySelectorAll: (sel) => (sel === '#de-routing-panel .de-rt-tbl tr[data-prefix]' ? rows : []),
    getElementById: () => null,
    createElement: el,
    addEventListener() {}, dispatchEvent() {},
  };
  const win = {
    document, location: { search: opts.search || '', hash: opts.hash || '', origin: 'https://xray.example' },
    setTimeout: (fn) => { timers.push(fn); return timers.length; }, clearTimeout() {}, setInterval: () => 1, clearInterval() {},
    addEventListener: (ev, fn) => { (listeners[ev] = listeners[ev] || []).push(fn); },
    CustomEvent: function () {}, JSON, Promise,
    _xrayLastBgpRoutes: opts.bgp || [],
    _xrayBgpKey: (r) => (r.prefix.indexOf('/') < 0 && r.prefixlen != null ? r.prefix + '/' + r.prefixlen : r.prefix),
    xrayBgpShowDecision: (p) => decisions.push(p),
  };
  win.window = win;
  vm.runInNewContext(SRC, win);
  return {
    win, core: win.xrayCore, clicks, decisions, timers, listeners,
    setRows(list) { rows = list.map((p) => row(p, clicks)); },
    runTimers(n) { for (let i = 0; i < (n || 50) && timers.length; i++) timers.shift()(); },
  };
}

test('parseDeepLink reads node / deepdive / prefix from ? and #, and # wins', () => {
  const { core } = load();
  assert.deepStrictEqual(Object.assign({}, core.parseDeepLink('?node=r1&deepdive=1&prefix=8.8.8.0%2F24', '')), { node: 'r1', deepdive: true, prefix: '8.8.8.0/24' });
  assert.deepStrictEqual(Object.assign({}, core.parseDeepLink('?node=r1', '#node=r2&prefix=2001:db8::/32')), { node: 'r2', prefix: '2001:db8::/32' });
  assert.deepStrictEqual(Object.assign({}, core.parseDeepLink('?origin=https://a.example&x=1', '')), {});
  assert.strictEqual(core.parseDeepLink('', '#deepdive=0').deepdive, false);
});

test('parseDeepLink drops names that are not a router name / a prefix (markup, script, bad escapes)', () => {
  const { core } = load();
  const bad = core.parseDeepLink('?node=%22%3E%3Cimg%20src%3Dx%20onerror%3Dalert(1)%3E&prefix=javascript:alert(1)', '#node=%E0%A4%A');
  assert.strictEqual(bad.node, undefined);
  assert.strictEqual(bad.prefix, undefined);
  assert.strictEqual(core.parseDeepLink('?prefix=10.0.0.0/8%27%5D', '').prefix, undefined);
});

test('selectPrefix clicks only the row whose prefix is the same text; an unknown prefix does nothing', () => {
  const t = load({ rows: ['10.0.0.0/8', '8.8.8.0/24'] });
  assert.strictEqual(t.core.selectPrefix('8.8.8.0/24'), true);
  assert.deepStrictEqual(t.clicks, ['8.8.8.0/24']);
  assert.strictEqual(t.core.selectPrefix('8.8.8.0/25'), false);
  assert.strictEqual(t.core.selectPrefix(''), false);
  assert.deepStrictEqual(t.clicks, ['8.8.8.0/24']);
  assert.deepStrictEqual(t.decisions, []);   // not in the BGP table -> no decision
});

test('selectPrefix opens the Best-Path decision for a prefix the BGP table has (prefix + prefixlen too)', () => {
  const t = load({ bgp: [{ prefix: '203.0.113.0', prefixlen: 24 }] });
  assert.strictEqual(t.core.selectPrefix('203.0.113.0/24'), true);
  assert.deepStrictEqual(t.decisions, ['203.0.113.0/24']);
  assert.strictEqual(t.core.selectPrefix('198.51.100.0/24'), false);
});

test('applyDeepLink: a router the page knows is opened by the page hook; the prefix is picked once its row appears', () => {
  const t = load();
  const opened = [];
  t.win.xrayDeepLinkOpenNode = (id) => opened.push(id);
  assert.strictEqual(t.core.applyDeepLink({ node: 'r2', prefix: '8.8.8.0/24' }), true);
  assert.deepStrictEqual(opened, ['r2']);
  assert.deepStrictEqual(t.clicks, []);       // table not drawn yet -> retried later
  t.runTimers(1); t.setRows(['8.8.8.0/24']); t.runTimers(1);
  assert.deepStrictEqual(t.clicks, ['8.8.8.0/24']);
  t.runTimers(); assert.deepStrictEqual(t.clicks, ['8.8.8.0/24']);   // stops after it was picked
});

test('applyDeepLink: a prefix that never appears stops retrying; an empty link does nothing', () => {
  const t = load();
  t.core.applyDeepLink({ prefix: '8.8.8.0/24' });
  t.runTimers(100);
  assert.strictEqual(t.timers.length, 0);
  assert.strictEqual(t.core.applyDeepLink({}), false);
});

test('applyDeepLink without a page hook ignores a router that is not in the rendered config', () => {
  const t = load();
  let threw = null;
  try { t.core.applyDeepLink({ node: 'nope' }); } catch (e) { threw = e; }
  assert.strictEqual(threw, null);   // no config rendered -> unknown -> nothing (no "call renderTopology first" error)
});

test('#node=... after load is followed (hashchange)', () => {
  const t = load();
  const opened = [];
  t.win.xrayDeepLinkOpenNode = (id) => opened.push(id);
  t.win.location.hash = '#node=r3';
  (t.listeners.hashchange || []).forEach((f) => f());
  assert.deepStrictEqual(opened, ['r3']);
});

test('the iframe embed passes selectPrefix through (host API + frame allow-list)', () => {
  assert.match(FRAME_SRC, /var CALLS = \{[^}]*\bselectPrefix: 1\b/);
  assert.match(HOST_SRC, /selectPrefix: function \(prefix\) \{ send\('selectPrefix', \[prefix\]\); \}/);
  assert.match(SRC, /selectPrefix: selectPrefix,(\s*\n\s*\w+: \w+,)*\s*\n\s*startPolling: startPolling/);   // on the view renderTopology returns (the frame calls view[cmd])
});

test('the standalone page, the :8600 page, the BGP demos and the replay bar start on a linked router that is in the lab', () => {
  const R = (f) => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
  for (const f of ['xray-graph.html', 'xray-graph-nextui.html', 'demo/index.html', 'demo/index-bgp.html', 'demo/index-bgp-lp.html', 'demo/bgp-lp/page.html.tmpl']) {
    const s = R(f);
    assert.match(s, /if \(_dl\.node && NAMES\.indexOf\(_dl\.node\) >= 0\) start = _dl\.node;/, f);
    assert.match(s, /window\.xrayDeepLinkOpenNode = function \(id\) \{/, f);
  }
  assert.match(R('demo/replay-bar.js'), /if \(dl\.node && FRAMES\[0\] && FRAMES\[0\]\[dl\.node\]\) focus = dl\.node;/);
});
