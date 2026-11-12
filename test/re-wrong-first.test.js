// re-wrong-first.test.js — the live Routing Engine panel puts what is wrong first ("What's wrong": interfaces down, OSPF
// interfaces with no adjacency or a must-match value that differs, BGP sessions not up; each OSPF line opens its block), and
// folds the healthy OSPF interfaces per interface (problems open; a block you open or close stays so for that node).
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
  return Object.assign({ peer: 'r2', area: '0.0.0.0', mtu: 1500, hello: 10, dead: 40, network_type: 'point-to-point', cost: 10, role: 'P2P',
    priority: 1, passive: false, auth: 'none', neighbors: 1, neighbors_adjacent: 1 }, o || {});
}
function texts(lines) { return Array.from(lines, function (l) { return String(l.text).replace(/<[^>]+>/g, ''); }); }
// r10 of the owner's screen: six OSPF interfaces, eth4 -> r11 down on hello / dead
function r10() {
  var o = {};
  ['eth1', 'eth2', 'eth3', 'eth5', 'eth6'].forEach(function (i, k) { o[i] = row({ peer: 'r' + (100 + k) }); });
  o.eth4 = row({ peer: 'r11', hello: 3, dead: 12, neighbors: 0, neighbors_adjacent: 0, mismatch: ['hello', 'dead'],
    remote: { hello: 10, dead: 40, mtu: 1500, area: '0.0.0.0', network_type: 'point-to-point', auth: 'none' } });
  return { target_node: 'r10', ospf_configured: true, routing_table: [{ prefix: '10.0.0.0/30', out_iface: 'eth1', protocol: 'connected', selected: true }],
    interfaces: { eth1: { up: true }, eth4: { up: true }, lo: { up: true } }, ospf_neighbors: [{ router_id: '123.100.100.100', iface: 'eth1', state: 'Full/-' }],
    ospf_ifaces: o };
}

test("What's wrong comes right under the title and names the interface, the neighbour and the values", function () {
  var ctx = sandbox('en'); ctx.xrayCore = {};
  var t = texts(ctx.xrayOspfDeepLines(r10(), {}));
  assert.strictEqual(t[0], '[Routing Engine]');
  assert.strictEqual(t[1], "What's wrong");
  assert.strictEqual(t[2], '✕ eth4 → r11: OSPF no adjacency — hello 3 ⇔ 10 · dead 12 ⇔ 40');
  assert.ok(!/What's wrong/.test(t.slice(3).join('\n')), 'once');
});

test('a wrong line opens its interface block (window._xrayReGoIf with the block number)', function () {
  var ctx = sandbox('en'); ctx.xrayCore = {};
  var lines = ctx.xrayOspfDeepLines(r10(), {});
  var go = lines[2].text.match(/_xrayReGoIf\((\d+)\)/);
  assert.ok(go, lines[2].text);
  var head = lines.filter(function (l) { return /data-ospfif="/.test(l.text || ''); })[Number(go[1])];
  assert.match(head.text, /eth4 \(OSPF\)/, 'the number is the eth4 block');
});

test('healthy interfaces are folded to one line (neighbour, Full); the one with a problem is open', function () {
  var ctx = sandbox('en');
  var lines = ctx._xrayOspfIfLines(r10());
  var heads = lines.filter(function (l) { return /re-ospfif-head/.test(l.text || ''); });
  assert.strictEqual(heads.length, 6);
  heads.forEach(function (h) {
    if (/eth4 \(OSPF\)/.test(h.text)) { assert.match(h.text, /▼/); assert.match(h.text, /→ r11 · no adjacency/); }
    else assert.match(h.text, /▶/);
  });
  assert.match(heads[0].text, /→ r100 · Full/, 'eth1: the neighbour state from ospf_neighbors');
  var rows = lines.filter(function (l) { return l.cls === 're-ospfif-row'; });
  assert.strictEqual(rows.filter(function (l) { return !/display:none/.test(l.style); }).length, 3, 'only the three rows of eth4 are shown');
  assert.ok(rows.every(function (l) { return /^data-ospfif="\d+"$/.test(l.attr); }), 'each row knows its block');
});

test('a block opened or closed by hand stays so for that node (per interface), not for the others', function () {
  var ctx = sandbox('en');
  var s = r10();
  ctx._xrayOspfIfLines(s);
  var n = ctx._reOspfIfKeys.indexOf('r10|eth1');
  ctx._reOspfIfOpenMap['r10|eth1'] = true;   // what the toggle stores
  var heads = ctx._xrayOspfIfLines(s).filter(function (l) { return /re-ospfif-head/.test(l.text || ''); });
  assert.match(heads[n].text, /▼/);
  assert.match(heads[1].text, /▶/, 'eth2 still folded');
  var other = Object.assign(r10(), { target_node: 'r12' });
  var h2 = ctx._xrayOspfIfLines(other).filter(function (l) { return /re-ospfif-head/.test(l.text || ''); });
  assert.match(h2[n].text, /▶/, 'another node keeps its own default');
});

test('Full but a value differs: a warning line; nothing wrong: one green line; BGP sessions not up; an interface down', function () {
  var ctx = sandbox('en'); ctx.xrayCore = {};
  var w = texts(ctx._xrayWrongLines({ ospf_ifaces: { eth1: row({ mismatch: ['network_type'], remote: { network_type: 'broadcast' } }) } }));
  assert.strictEqual(w[1], '⚠ eth1 → r2: OSPF Full, but network type point-to-point ⇔ broadcast');
  assert.deepStrictEqual(texts(ctx._xrayWrongLines({ ospf_ifaces: { eth1: row() } })), ["What's wrong", '✓ No mismatch or down adjacency']);
  var b = texts(ctx._xrayWrongLines({ interfaces: { eth2: { up: false } }, bgp_neighbors: [{ ip: '10.0.12.2', remote_as: '65009', state: 'Idle' }, { ip: '10.0.13.3', state: 'Established' }] }));
  assert.deepStrictEqual(b.slice(1), ['✕ eth2: interface down', '✕ BGP 10.0.12.2 (AS 65009): Idle']);
  assert.strictEqual(ctx._xrayWrongLines({ interfaces: { eth1: { up: true } } }).length, 0, 'no OSPF interface rows and no BGP list: nothing (demo states)');
  var pas = texts(ctx._xrayWrongLines({ ospf_ifaces: { eth3: row({ passive: true, neighbors: 0, neighbors_adjacent: 0 }) } }));
  assert.strictEqual(pas[1], '✓ No mismatch or down adjacency', 'a passive interface on purpose is not a problem');
});

test('Japanese labels', function () {
  var ctx = sandbox('ja');
  var t = texts(ctx._xrayWrongLines(r10()));
  assert.strictEqual(t[0], '問題のある所');
  assert.strictEqual(t[1], '✕ eth4 → r11: OSPF 隣接なし — hello 3 ⇔ 10 · dead 12 ⇔ 40');
});

test('router-supplied names in the wrong lines render as text', function () {
  var ctx = sandbox('en');
  var bad = '<img src=x onerror=alert(1)>';
  var html = ctx._xrayWrongLines({ ospf_ifaces: { ['eth1' + bad]: row({ peer: bad, neighbors_adjacent: 0 }) }, bgp_neighbors: [{ ip: bad, state: bad }] })
    .map(function (l) { return l.text; }).join('\n');
  assert.ok(html.indexOf('<img') < 0, html);
});
