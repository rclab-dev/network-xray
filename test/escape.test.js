// escape.test.js — router-supplied text (node / interface names, prefixes, next hops, AS paths, areas)
// must reach the page as text, never as markup.
// Run: node --test        (from the repo root; Node >= 18, no dependencies)
//
// The browser files are loaded into a small vm sandbox (a stub window/document); each renderer gets a
// value like `r1<img src=x onerror=alert(1)>` and the HTML it returns must carry it escaped.
'use strict';
var test = require('node:test');
var assert = require('node:assert');
var fs = require('fs');
var path = require('path');
var vm = require('vm');

var ROOT = path.join(__dirname, '..');
var EVIL = 'r1<img src=x onerror=alert(1)>';
var EVIL_ESC = 'r1&lt;img src=x onerror=alert(1)&gt;';
var QUOTE = 'x" onmouseover="alert(1)';          // breaks out of a double-quoted attribute if not escaped
var SQUOTE = "2.2.2.2');alert(1);//";            // breaks out of a single-quoted JS string in an on* handler

// a do-nothing DOM node: every property read returns another stub, every call returns a stub
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
function sandbox() {
  var de = stub(); de.getAttribute = function () { return 'en'; };
  var doc = {
    getElementById: function () { return null; }, querySelector: function () { return null; },
    querySelectorAll: function () { return []; }, createElement: function () { return stub(); },
    addEventListener: function () {}, head: stub(), body: stub(), documentElement: de, readyState: 'complete', currentScript: null
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
  return ctx;
}
function load(ctx, file) { vm.runInContext(fs.readFileSync(path.join(ROOT, file), 'utf8'), ctx, { filename: file }); }
function fakeContainer() {
  return { innerHTML: '', style: {}, querySelectorAll: function () { return []; }, querySelector: function () { return null; },
    addEventListener: function () {}, getBoundingClientRect: function () { return { left: 0, top: 0, width: 600, height: 400 }; },
    classList: { add: function () {}, remove: function () {}, contains: function () { return false; } }, setAttribute: function () {} };
}
// no raw tag / attribute injected from the value
function assertNoMarkup(html, what) {
  assert.ok(html.indexOf('<img') < 0, what + ': raw <img> in output');
  assert.ok(html.indexOf('<script') < 0, what + ': raw <script> in output');
  assert.ok(!/" onmouseover=/.test(html), what + ': attribute break-out in output');
}

var core = sandbox();
load(core, 'xray-core.js');

test('xray-core _escapeHtml escapes text and both quote kinds, keeps plain names', function () {
  assert.strictEqual(core._escapeHtml(EVIL), EVIL_ESC);
  assert.strictEqual(core._escapeHtml('a"b\'c&d'), 'a&quot;b&#39;c&amp;d');
  assert.strictEqual(core._escapeHtml('r1 eth1 10.0.0.0/24 65001 65002'), 'r1 eth1 10.0.0.0/24 65001 65002');
  assert.strictEqual(core._escapeHtml(null), '');
  assert.strictEqual(core._escapeHtml(42), '42');
});

test('xray-core xrayBuildBgpView escapes prefix, next hop, AS path, status and on* arguments', function () {
  var routes = [
    { prefix: EVIL, nexthop: '1.1.1.1', as_path: '65001 <script>x</script>', status: '*>', origin: 'i', locprf: '200' },
    { prefix: EVIL, nexthop: SQUOTE, as_path: '65002', status: '*', origin: 'i', locprf: '100' },
    { prefix: '10.9.0.0/16', nexthop: '3.3.3.3', as_path: QUOTE, status: '*>', origin: 'i', metric: '<b>5' }
  ];
  var v = core.xrayBuildBgpView(routes);
  assertNoMarkup(v.table, 'bgp table');
  assert.ok(v.table.indexOf('<td>' + EVIL_ESC + '</td>') >= 0, 'prefix shown as text');
  assert.ok(v.table.indexOf('65001 &lt;script&gt;x&lt;/script&gt; i') >= 0, 'AS path shown as text');
  assert.ok(v.table.indexOf('&lt;b&gt;5') >= 0, 'metric shown as text');
  // the loser row's click handler gets its arguments as JSON strings inside the attribute
  assert.ok(v.table.indexOf("xrayCfToggle(this,&quot;" + EVIL_ESC + "&quot;,&quot;2.2.2.2&#39;);alert(1);//&quot;)") >= 0, 'loser row onclick quoted');
  assert.ok(v.table.indexOf("('2.2.2.2');") < 0 && v.table.indexOf("\\'') ") < 0);
  // a plain table still reads the same
  var plain = core.xrayBuildBgpView([{ prefix: '10.0.0.0/24', nexthop: '10.1.1.2', as_path: '65001', status: '*>', origin: 'i' }]);
  assert.ok(plain.table.indexOf('<td>10.0.0.0/24</td><td>10.1.1.2</td>') >= 0);
  assert.ok(plain.table.indexOf('<span class="bgp-st">*&gt;</span>') >= 0);
});

test('xray-core xrayBgpReasonHtml escapes the prefix', function () {
  var grp = [{ prefix: EVIL, nexthop: '1.1.1.1', status: '*>', locprf: '200' }, { prefix: EVIL, nexthop: '2.2.2.2', status: '*', locprf: '100' }];
  var html = core.xrayBgpReasonHtml(EVIL, core.xrayBgpDecision(grp), grp);
  assert.ok(html.length > 0);
  assertNoMarkup(html, 'bgp reason');
  assert.ok(html.indexOf(EVIL_ESC) >= 0);
});

test('xray-core DeepDive OSPF lines escape node, interface and area strings', function () {
  var s = {
    interfaces: {}, area_match: false, timer_match: true, ospf_active_on_interface: true,
    target_area: '0<img src=x onerror=alert(1)>', peer_area: '1', peer_id: EVIL, target_hello: 10, peer_hello: 10
  };
  s.interfaces[EVIL] = { up: true, ip: '10.0.0.1/30', via: QUOTE };
  var lines = core.xrayTriDeepLines(s, { targetName: EVIL });
  var html = lines.map(function (l) { return l.text; }).join('\n');
  assertNoMarkup(html, 'ospf deep lines');
  assert.ok(html.indexOf(EVIL_ESC) >= 0);
});

test('xray-unified renderSvg escapes interface, peer, node and protocol names', function () {
  var u = sandbox();
  load(u, 'xray-unified.js');
  var node = { target: EVIL, links: [{ iface: 'eth1<script>', peer: QUOTE, protocols: [{ proto: 'ospf<img src=x>', up: true }], selected: true }] };
  ['concentric', 'single'].forEach(function (tm) {
    var svg = u.XrayUnified.renderSvg(node, { tunnelMode: tm, processGlyph: 'inside' }) + u.XrayUnified.renderSvg(node, { tunnelMode: tm, processGlyph: 'outside' });
    assertNoMarkup(svg, 'unified ' + tm);
    assert.ok(svg.indexOf(EVIL_ESC) >= 0, 'node name shown as text');
    assert.ok(svg.indexOf('eth1&lt;script&gt;') >= 0, 'interface shown as text');
  });
  var plain = u.XrayUnified.renderSvg({ target: 'r1', links: [{ iface: 'eth1', peer: 'r2', protocols: [{ proto: 'ospf', up: true }] }] }, { processGlyph: 'inside' });
  assert.ok(plain.indexOf('>eth1 - r2</text>') >= 0 && plain.indexOf('>r1</text>') >= 0 && plain.indexOf('>OSPF</text>') >= 0);
});

test('xray-node-panel render escapes names in text and in data-prefix attributes', function () {
  var ctx = sandbox();
  load(ctx, 'xray-node-panel.js');
  var c = fakeContainer();
  var st = {
    target_node: EVIL, protocol: 'bgp',
    interfaces: { 'eth1<b>': { up: true, ip: '10.0.0.1/30' } }, 'r2<b>_iface': 'eth1<b>',
    routing_table: [{ prefix: QUOTE, out_iface: 'eth1<b>', protocol: 'bgp', selected: true }],
    bgp_routes: [{ prefix: EVIL, next_hop: '1.1.1.1', as_path: '65001 <script>', status: '*>' }]
  };
  ctx.XrayNodePanel.render(c, st, { figure: true });
  assertNoMarkup(c.innerHTML, 'node panel');
  assert.ok(c.innerHTML.indexOf('data-prefix="x&quot; onmouseover=&quot;alert(1)"') >= 0, 'attribute value quoted');
  assert.ok(c.innerHTML.indexOf(EVIL_ESC) >= 0);
  // the figure caption and the BGP title escape once (no "&amp;lt;")
  assert.ok(c.innerHTML.indexOf('&amp;lt;') < 0, 'no double escaping');
  var v = ctx.XrayNodePanel.buildBgpView(st.bgp_routes);
  assertNoMarkup(v.table + v.decision, 'node panel bgp view');
});

test('xray-topo-overlay render escapes node names in data-n attributes, labels and the prefix picker', function () {
  var ctx = sandbox();
  load(ctx, 'xray-topo-overlay.js');
  var c = fakeContainer();
  var states = {};
  states[QUOTE] = { target_node: QUOTE, interfaces: { eth1: { up: true, ip: '10.0.0.1/30' } }, routing_table: [{ prefix: EVIL, out_iface: 'eth1', next_hop: '10.0.0.2', protocol: 'ospf', selected: true }] };
  states.r2 = { target_node: 'r2', interfaces: { eth1: { up: true, ip: '10.0.0.2/30' } }, routing_table: [] };
  var pos = {}; pos[QUOTE] = { x: 100, y: 100 }; pos.r2 = { x: 300, y: 100 };
  ctx.XrayTopoOverlay.render(c, { states: states, positions: pos, links: [{ a: QUOTE, b: 'r2' }] }, { source: QUOTE, prefix: EVIL });
  assert.ok(c.innerHTML.length > 0);
  assertNoMarkup(c.innerHTML, 'topo overlay');
  assert.ok(c.innerHTML.indexOf('data-n="x&quot; onmouseover=&quot;alert(1)"') >= 0, 'data-n quoted');
});
