// ospf-iface-panel.test.js — the OSPF interface rows in the DeepDive's Routing Engine panel (xray-core.js _xrayOspfIfLines,
// from state.ospf_ifaces): values, "?" for what the router did not report, red only for the values that must match and do
// not, folded by default with three or more interfaces, and router-supplied names rendered as text.
// Run: node --test        (from the repo root; Node >= 18, no dependencies)
//
// xray-core.js is loaded into a vm sandbox with a stub document (as in dom-insert-escape.test.js).
'use strict';
var test = require('node:test');
var assert = require('node:assert');
var fs = require('fs');
var path = require('path');
var vm = require('vm');

var ROOT = path.join(__dirname, '..');
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
function sandbox(lang) {
  var de = stub(); de.getAttribute = function () { return lang || 'en'; };
  var body = stub(); body.classList = { add: function () {}, remove: function () {}, toggle: function () {}, contains: function () { return false; } };
  var doc = {
    getElementById: function () { return null; }, querySelector: function () { return null; },
    querySelectorAll: function () { return []; }, createElement: function () { return stub(); },
    addEventListener: function () {}, head: stub(), body: body, documentElement: de, readyState: 'complete', currentScript: null
  };
  var ctx = {
    document: doc, console: console, setTimeout: function () { return 0; }, clearTimeout: function () {},
    setInterval: function () { return 0; }, clearInterval: function () {}, requestAnimationFrame: function () { return 0; },
    navigator: { userAgent: '' }, location: { search: '', href: '', hash: '' },
    localStorage: { getItem: function () { return null; }, setItem: function () {} },
    getComputedStyle: function () { return {}; }, addEventListener: function () {}
  };
  ctx.window = ctx; ctx.self = ctx;
  vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(path.join(ROOT, 'xray-core.js'), 'utf8'), ctx, { filename: 'xray-core.js' });
  return ctx;
}
function row(o) {
  return Object.assign({ peer: 'r2', area: '0.0.0.0', mtu: 1500, hello: 10, dead: 40, network_type: 'broadcast', cost: 10, role: 'DR',
    priority: 1, passive: false, auth: 'none', neighbors: 1, neighbors_adjacent: 1 }, o || {});
}
function texts(lines) { return lines.map(function (l) { return l.text; }); }

test('one block per interface: header, then MTU / timers, type / area / cost / role, passive / auth / neighbours', function () {
  var ctx = sandbox('en');
  var lines = ctx._xrayOspfIfLines({ ospf_ifaces: { eth1: row({ mtu: 1500 }) } });
  var t = texts(lines);
  assert.strictEqual(lines.length, 4);
  assert.match(t[0], /re-ospfif-ind">▼<\/span> eth1 \(OSPF\)/, 'one interface: open');
  assert.strictEqual(t[1], 'MTU 1500 · hello 10 / dead 40');
  assert.strictEqual(t[2], 'broadcast · area 0.0.0.0 · cost 10 · DR');
  assert.strictEqual(t[3], 'passive no · auth none · nbrs 1');
  assert.strictEqual(lines[1].cls, 're-ospfif-row');
});

test('a value the router did not report is "?"; only the mismatched must-match values are red', function () {
  var ctx = sandbox('en');
  var t = texts(ctx._xrayOspfIfLines({ ospf_ifaces: { eth1: row({ mtu: null, auth: null, passive: null, role: 'BDR', neighbors_adjacent: 0, mismatch: ['hello', 'area'] }) } }));
  assert.strictEqual(t[1], 'MTU ? · <span style="color:#ff4444">hello 10</span> / dead 40');
  assert.strictEqual(t[2], 'broadcast · <span style="color:#ff4444">area 0.0.0.0</span> · cost 10 · BDR');
  assert.strictEqual(t[3], 'passive ? · auth ? · nbrs 1');
});

test('adjacent (Full) but a must-match value differs: a yellow warning under the header, shown even when folded', function () {
  var ctx = sandbox('en');
  var nt = { peer: 'r2', network_type: 'point-to-point', mismatch: ['network_type'], remote: { network_type: 'broadcast' } };
  var lines = ctx._xrayOspfIfLines({ ospf_ifaces: { eth3: row(nt) } });
  assert.strictEqual(lines[1].cls, 're-ospfif-warn');
  assert.match(lines[1].style, /#ffcc00/);
  assert.ok(!/display:none/.test(lines[1].style));
  assert.strictEqual(lines[1].text, '⚠ Full, but network type differs (point-to-point ⇔ broadcast) — routes from r2 can be missing');
  ctx._reOspfIfOpen = false;
  var folded = ctx._xrayOspfIfLines({ ospf_ifaces: { eth3: row(nt) } });
  assert.strictEqual(folded[1].cls, 're-ospfif-warn', 'still there when folded');
  assert.ok(!/display:none/.test(folded[1].style));
  var ja = sandbox('ja')._xrayOspfIfLines({ ospf_ifaces: { eth3: row(nt) } });
  assert.strictEqual(ja[1].text, '⚠ Full だが network type が違う (point-to-point ⇔ broadcast) — r2 からの経路が入らない事がある');
  var two = ctx._xrayOspfIfLines({ ospf_ifaces: { eth1: row({ mismatch: ['mtu', 'hello'], remote: {} }) } });
  assert.strictEqual(two[1].text, '⚠ Full, but MTU, hello differ', 'other fields: no route sentence');
  var notUp = ctx._xrayOspfIfLines({ ospf_ifaces: { eth1: row({ neighbors_adjacent: 0, mismatch: ['mtu'] }) } });
  assert.ok(notUp.every(function (l) { return l.cls !== 're-ospfif-warn'; }), 'not adjacent: the red values say it, no Full warning');
});

test('Japanese labels for authentication and neighbours', function () {
  var ctx = sandbox('ja');
  var t = texts(ctx._xrayOspfIfLines({ ospf_ifaces: { eth1: row() } }));
  assert.strictEqual(t[3], 'passive no · 認証 なし · 隣 1');
});

test('three or more interfaces start folded; the page choice (window._reOspfIfOpen) wins', function () {
  var ctx = sandbox('en');
  var three = { ospf_ifaces: { eth1: row(), eth2: row(), eth3: row() } };
  var lines = ctx._xrayOspfIfLines(three);
  assert.match(lines[0].text, /▶/);
  assert.match(lines[1].style, /display:none/);
  ctx._reOspfIfOpen = true;
  lines = ctx._xrayOspfIfLines(three);
  assert.match(lines[0].text, /▼/);
  assert.ok(!/display:none/.test(lines[1].style));
  ctx._reOspfIfOpen = false;
  assert.match(ctx._xrayOspfIfLines({ ospf_ifaces: { eth1: row() } })[1].style, /display:none/);
});

test('no ospf_ifaces, or not an object: no rows; rows that are not objects are skipped', function () {
  var ctx = sandbox('en');
  assert.deepStrictEqual(ctx._xrayOspfIfLines({}).length, 0);
  assert.deepStrictEqual(ctx._xrayOspfIfLines({ ospf_ifaces: 'x' }).length, 0);
  assert.deepStrictEqual(ctx._xrayOspfIfLines({ ospf_ifaces: [row()] }).length, 0);
  assert.strictEqual(ctx._xrayOspfIfLines({ ospf_ifaces: { a: 'x', b: [1], eth1: row() } }).length, 4);
});

test('interface names and values from the router render as text', function () {
  var ctx = sandbox('en');
  var bad = '<img src=x onerror=alert(1)>';
  var html = texts(ctx._xrayOspfIfLines({ ospf_ifaces: { ['eth1' + bad]: row({ role: bad, network_type: bad, area: bad, auth: bad }) } })).join('\n');
  assert.ok(html.indexOf('<img') < 0, html);
  assert.ok(html.indexOf('&lt;img') >= 0);
});

test('the live OSPF Routing Engine panel ends with the interface blocks', function () {
  var ctx = sandbox('en');
  ctx.xrayCore = {};   // the facade is present on the graph pages: the live summary builder is used
  var lines = ctx.xrayOspfDeepLines({ ospf_configured: true, ospf_neighbors: [], routing_table: [], interfaces: { eth1: { up: true, ip: '10.0.0.1/30' } },
    ospf_ifaces: { eth1: row() } });
  var t = texts(lines);
  assert.match(t[t.length - 4], /eth1 \(OSPF\)/);
  assert.strictEqual(t[t.length - 1], 'passive no · auth none · nbrs 1');
});
