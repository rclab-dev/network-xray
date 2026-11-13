// state-diff-page.test.js - the page side of "what changed from a baseline" (v1.4): the baseline is kept in memory by
// xray-diff.js; the Full DeepDive's Routing Engine panel (xray-core.js) and the node panel (xray-node-panel.js) show,
// under "What's wrong", one line to keep a baseline, then what changed for that router. Run: node --test
'use strict';
var test = require('node:test');
var assert = require('node:assert');
var fs = require('fs');
var path = require('path');
var vm = require('vm');

var ROOT = path.join(__dirname, '..');
function load(rel) { return JSON.parse(fs.readFileSync(path.join(ROOT, rel), 'utf8')); }
function stub() {
  var fn = function () {};
  return new Proxy(fn, {
    get: function (t, k) {
      if (k === Symbol.toPrimitive) return function () { return ''; };
      if (k === 'length') return 0;
      if (typeof k === 'string' && Object.prototype.hasOwnProperty.call(t, k) && !(k in Function.prototype)) return t[k];
      return stub();
    },
    apply: function () { return stub(); },
    set: function (t, k, v) { t[k] = v; return true; }
  });
}
// xray-core.js and xray-diff.js in one sandbox, as a live page loads them
function fullPage(lang) {
  var de = stub(); de.getAttribute = function () { return lang || 'en'; };
  var body = stub(); body.classList = { add: function () {}, remove: function () {}, toggle: function () {}, contains: function () { return false; } };
  var doc = {
    getElementById: function () { return null; }, querySelector: function () { return null; }, querySelectorAll: function () { return []; },
    createElement: function () { return stub(); }, addEventListener: function () {}, head: stub(), body: body, documentElement: de,
    readyState: 'complete', currentScript: null
  };
  var ctx = {
    document: doc, console: console, setTimeout: function () { return 0; }, clearTimeout: function () {}, setInterval: function () { return 0; },
    clearInterval: function () {}, requestAnimationFrame: function () { return 0; }, navigator: { userAgent: '' }, location: { search: '', href: '', hash: '' },
    localStorage: { getItem: function () { return null; }, setItem: function () {} }, getComputedStyle: function () { return {}; }, addEventListener: function () {}
  };
  ctx.window = ctx; ctx.self = ctx;
  vm.createContext(ctx);
  ['xray-core.js', 'xray-diff.js'].forEach(function (f) { vm.runInContext(fs.readFileSync(path.join(ROOT, f), 'utf8'), ctx, { filename: f }); });
  return ctx;
}
// the sandbox's arrays come from another realm: copy them out before a strict compare
function texts(lines) { return JSON.parse(JSON.stringify(lines.map(function (l) { return String(l.text).replace(/<[^>]+>/g, ''); }))); }

test('xray-diff.js keeps a baseline in memory and gives the lines for one router (none, then the change)', function () {
  var xd = require(path.join(ROOT, 'xray-diff.js'));
  var A = load('demo/bgp-lp/frameA.json'), B = load('demo/bgp-lp/frameB.json');
  xd.clearBaseline();
  assert.strictEqual(xd.changeLines(B, 'r1'), null, 'no baseline, no lines');
  var seen = []; xd.onBaseline(function (b) { seen.push(!!b); });
  xd.setBaseline(A);
  A.r1.bgp_routes = [];   // a copy is kept: changing the object afterwards does not move the baseline
  assert.strictEqual(xd.changeLines(load('demo/bgp-lp/frameA.json'), 'r1').none, true);
  var r = xd.changeLines(B, 'r1');
  assert.deepStrictEqual(r.items.map(function (i) { return i.kind; }), ['best_path_changed', 'route_changed']);
  assert.strictEqual(r.items[0].text, '8.8.8.0/24: best path via 10.11.0.20 \u2192 via 10.10.0.20 (Local Pref)');
  assert.match(xd.changeLines(B, 'r1', 'ja').items[0].text, /^8\.8\.8\.0\/24: 最良経路 /);
  xd.clearBaseline();
  assert.deepStrictEqual(seen, [true, false]);
});

test('Full DeepDive: one line to keep a baseline, then "Changed since the baseline" for this router', function () {
  var w = fullPage('en');
  w.LIVE_STATES = load('demo/bgp-lp/frameA.json');
  var s = w.LIVE_STATES.r1;
  assert.deepStrictEqual(texts(w._xrayDiffLines(s)), ['\u25ce Keep the state now as the baseline (then see what changes)']);
  w._xrayDiffKeep();
  w.LIVE_STATES = load('demo/bgp-lp/frameB.json');
  var t = texts(w._xrayDiffLines(w.LIVE_STATES.r1));
  assert.match(t[0], /^Changed since the baseline \(\d\d:\d\d:\d\d\)/);
  assert.deepStrictEqual(t.slice(1), ['8.8.8.0/24: best path via 10.11.0.20 \u2192 via 10.10.0.20 (Local Pref)',
    '8.8.8.0/24: route bgp 10.11.0.20 on eth2 \u2192 bgp 10.10.0.20 on eth1']);
  assert.deepStrictEqual(texts(w._xrayDiffLines(w.LIVE_STATES.r2)).slice(1), ['(none) no change from the baseline']);
  w._xrayDiffClear();
  assert.strictEqual(texts(w._xrayDiffLines(s)).length, 1, 'back to the one line');
});

test('Full DeepDive: the lines follow What\'s wrong in the Routing Engine panel, and say nothing without xray-diff.js', function () {
  var src = fs.readFileSync(path.join(ROOT, 'xray-core.js'), 'utf8');
  assert.strictEqual((src.match(/concat\(_xrayWrongLines\(s\)\)\.concat\(_xrayDiffLines\(s\)\)/g) || []).length, 2);
  var w = fullPage('ja'); vm.runInContext('delete window.xrayDiff', w);   // a page that did not load xray-diff.js
  w.LIVE_STATES = load('demo/bgp-lp/frameA.json');
  assert.strictEqual(w._xrayDiffLines(w.LIVE_STATES.r1).length, 0);
  var j = fullPage('ja'); j.LIVE_STATES = load('demo/bgp-lp/frameA.json');
  assert.match(texts(j._xrayDiffLines(j.LIVE_STATES.r1))[0], /今の状態を基準にする/);
});

test('node panel: the same section under What\'s wrong, from opts.states or the page\'s LIVE_STATES', function () {
  var window = {}, document = { getElementById: function () { return null; }, createElement: function () { return {}; }, head: { appendChild: function () {} } };
  var ctx = { window: window, document: document };
  ['xray-diff.js', 'xray-node-panel.js'].forEach(function (f) { vm.runInNewContext(fs.readFileSync(path.join(ROOT, f), 'utf8'), ctx, { filename: f }); });
  var panel = window.XrayNodePanel, xd = window.xrayDiff;
  var A = load('demo/bgp-lp/frameA.json'), B = load('demo/bgp-lp/frameB.json');
  var c = { innerHTML: '', classList: { add: function () {} }, querySelectorAll: function () { return []; }, querySelector: function () { return null; } };
  panel.render(c, B.r1, { states: B });
  assert.match(c.innerHTML, /data-xnp-diff="keep"/);
  assert.ok(c.innerHTML.indexOf('xnp-diff-keep') > c.innerHTML.indexOf("What's wrong"), 'under What\'s wrong');
  xd.setBaseline(A);
  panel.render(c, B.r1, { states: B });
  assert.match(c.innerHTML, /Changed since the baseline \(\d\d:\d\d:\d\d\)/);
  assert.match(c.innerHTML, /xnp-diff-note">8\.8\.8\.0\/24: best path via 10\.11\.0\.20 \u2192 via 10\.10\.0\.20 \(Local Pref\)/);
  window.LIVE_STATES = B;
  panel.render(c, B.r2, {});
  assert.match(c.innerHTML, /\(none\) no change from the baseline/);
  delete window.LIVE_STATES;
  panel.render(c, B.r2, {});
  assert.ok(!/xnp-diff/.test(c.innerHTML), 'no lab states: no section');
});

// many changes: the first three, then "N more" opens the rest (the owner 11-13); OSPF triangle r1 with a link cut,
// the baseline holding ten more routes that are gone
function manyStates() {
  var A = load('demo/frameA.json'), B = load('demo/frameB.json');
  for (var i = 1; i <= 10; i++) A.r1.routing_table.push({ prefix: '172.16.' + i + '.0/24', protocol: 'ospf', selected: true, next_hop: '10.1.12.2', out_iface: 'eth1' });
  return { A: A, B: B };
}

test('Full DeepDive, many changes: three lines show, the rest are drawn hidden behind "N more"; open stays open while the page is', function () {
  var w = fullPage('en'), m = manyStates();
  w.LIVE_STATES = m.A; w._xrayDiffKeep(); w.LIVE_STATES = m.B;
  var lines = JSON.parse(JSON.stringify(w._xrayDiffLines(m.B.r1)));
  var rows = lines.filter(function (l) { return /^re-diff( |$)/.test(l.cls); });
  assert.strictEqual(rows.length, 16, 'every line is drawn');
  assert.strictEqual(rows.filter(function (l) { return !/display:none/.test(l.style); }).length, 3, 'three are shown');
  assert.match(texts(lines).slice(-1)[0], /^▸ 13 more$/);
  assert.match(rows[0].text, /^eth1: interface up → down$/, 'the cause first');
  w._xrayDiffOpen = true;
  var open = JSON.parse(JSON.stringify(w._xrayDiffLines(m.B.r1)));
  assert.strictEqual(open.filter(function (l) { return /^re-diff( |$)/.test(l.cls) && !/display:none/.test(l.style); }).length, 16);
  assert.match(texts(open).slice(-1)[0], /^▾ fewer$/);
});

test('node panel, many changes: three lines, then "N more" opens the rest', function () {
  var window = {}, document = { getElementById: function () { return null; }, createElement: function () { return {}; }, head: { appendChild: function () {} } };
  ['xray-diff.js', 'xray-node-panel.js'].forEach(function (f) { vm.runInNewContext(fs.readFileSync(path.join(ROOT, f), 'utf8'), { window: window, document: document }, { filename: f }); });
  var m = manyStates(), c = { innerHTML: '', classList: { add: function () {} }, querySelectorAll: function () { return []; }, querySelector: function () { return null; } };
  window.xrayDiff.setBaseline(m.A);
  window.XrayNodePanel.render(c, m.B.r1, { states: m.B });
  assert.strictEqual((c.innerHTML.match(/class="xnp-diff-(bad|good|note)"/g) || []).length, 3);
  assert.match(c.innerHTML, /data-xnp-diff="more">▸ 13 more/);
  window._xrayDiffOpen = true;
  window.XrayNodePanel.render(c, m.B.r1, { states: m.B });
  assert.strictEqual((c.innerHTML.match(/class="xnp-diff-(bad|good|note)"/g) || []).length, 16);
});
