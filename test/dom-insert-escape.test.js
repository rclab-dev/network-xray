// dom-insert-escape.test.js — values from router output, topology files and problem.json that the xray-core.js
// renderers put into innerHTML (Routing Engine panel, packet columns, flow view, topology, DeepDive) must come out as text.
// Run: node --test        (from the repo root; Node >= 18, no dependencies)
//
// Same approach as escape.test.js: xray-core.js is loaded into a vm sandbox with a stub document, each renderer gets
// hostile values (a script tag, an <img onerror>, a quote that would break out of an attribute) and the HTML it
// produces is checked for raw markup.
'use strict';
var test = require('node:test');
var assert = require('node:assert');
var fs = require('fs');
var path = require('path');
var vm = require('vm');

var ROOT = path.join(__dirname, '..');
var IMG = 'r1<img src=x onerror=alert(1)>';
var IMG_ESC = 'r1&lt;img src=x onerror=alert(1)&gt;';
var SCRIPT = '<script>alert(1)</script>';
var SCRIPT_ESC = '&lt;script&gt;alert(1)&lt;/script&gt;';
var QUOTE = 'x" onmouseover="alert(1)';
var QUOTE_ESC = 'x&quot; onmouseover=&quot;alert(1)';

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
function el() { return { innerHTML: '', style: {}, classList: { add: function () {}, remove: function () {}, toggle: function () {}, contains: function () { return false; } }, addEventListener: function () {}, querySelector: function () { return null; }, querySelectorAll: function () { return []; } }; }
function sandbox(byId, bySel) {
  var de = stub(); de.getAttribute = function () { return 'en'; };
  var body = stub(); body.classList = { add: function () {}, remove: function () {}, toggle: function () {}, contains: function () { return false; } };
  var doc = {
    getElementById: function (id) { return (byId && byId[id]) || null; },
    querySelector: function (s) { return (bySel && bySel[s]) || null; },
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
function assertNoMarkup(html, what) {
  assert.ok(html.length > 0, what + ': empty output');
  assert.ok(html.indexOf('<img') < 0, what + ': raw <img> in output');
  assert.ok(html.indexOf('<script') < 0, what + ': raw <script> in output');
  assert.ok(!/" onmouseover=/.test(html), what + ': attribute break-out in output');
}
function joinText(lines) { return lines.map(function (l) { return l.text; }).join('\n'); }

test('Routing Engine panel (BGP): state, neighbor and next-hop strings render as text through xraySetDeepDive', function () {
  var panel = el();
  var ctx = sandbox(null, { '#de-re-panel': panel });
  var s = {
    protocol: 'bgp', bgp_configured: true, is_established: false, bgp_state: SCRIPT,
    bgp_neighbors: [{ ip: '10.0.0.2', remote_as: '65002', state: IMG, up_down: QUOTE, pfx_rcvd: '<b>3' }],
    pfx_rcvd: '<i>1', neighbor_ip: IMG, neighbor_correct: false, r2_actual_ip: SCRIPT,
    has_next_hop_self: false, bgp_next_hop: QUOTE, max_prefix_limit: '<u>5', r2_lp: '<b>', best_path_via: IMG,
    route_resolution: { resolved: true, target: IMG, next_hop: SCRIPT, protocol: 'bgp' }, interfaces: {}
  };
  var lines = ctx.xrayBgpDeepLines(s, {});
  ctx.xraySetDeepDive('#de-re-panel', lines);
  assertNoMarkup(panel.innerHTML, 'bgp RE panel');
  assert.ok(panel.innerHTML.indexOf(SCRIPT_ESC) >= 0, 'bgp_state shown as text');
  assert.ok(panel.innerHTML.indexOf(IMG_ESC) >= 0, 'neighbor state / neighbor_ip shown as text');
  assert.ok(panel.innerHTML.indexOf(QUOTE_ESC) >= 0, 'up_down / next hop shown as text');
  // a plain state still reads the same
  var plain = joinText(ctx.xrayBgpDeepLines({ bgp_configured: true, is_established: false, bgp_state: 'Active', interfaces: {} }, {}));
  assert.ok(plain.indexOf('>Active</span>') >= 0);
});

test('Routing Engine panel (OSPF): DR/BDR, neighbor states, Hello timers and advertised loopback render as text', function () {
  var ctx = sandbox();
  ctx.xrayEvaluateState = function () { return { ospfStatus: 'Running' }; };
  var s = {
    protocol: 'ospf', ospf_active_on_interface: true, neighbor_state: IMG, r1_hello: SCRIPT, r2_hello: '10',
    route_map_status: QUOTE, has_redistribute: true, dr_rid: IMG, bdr_rid: SCRIPT, full_count: QUOTE,
    route_resolution: { resolved: true, target: '2.2.2.2', next_hop: IMG, protocol: SCRIPT }, interfaces: {}
  };
  var html = joinText(ctx.xrayOspfDeepLines(s, { showAll: true }));
  assertNoMarkup(html, 'ospf RE lines');
  assert.ok(html.indexOf(IMG_ESC) >= 0 && html.indexOf(SCRIPT_ESC) >= 0 && html.indexOf(QUOTE_ESC) >= 0);
  var adv = joinText(ctx.xrayOspfDeepLines({ is_advertiser: true, loopback: IMG, target_area: QUOTE, interfaces: {}, route_resolution: {} }, {}));
  assertNoMarkup(adv, 'ospf advertiser line');
  // the OSPF neighbor-state word goes through the shared span helper
  assert.strictEqual(ctx._xrayOspfNbrSpan('Full'), '<span style="color:#39ff14">Full</span>');
  assertNoMarkup(ctx._xrayOspfNbrSpan(IMG), 'ospf neighbor span');
});

test('Routing Engine panel (static): lookup target, configured next hop and the static peer lines render as text', function () {
  var ctx = sandbox();
  var html = joinText(ctx.xrayStaticDeepLines({ interfaces: {}, config_next_hop: IMG, route_resolution: { target: SCRIPT } }, {}));
  assertNoMarkup(html, 'static RE lines');
  assert.ok(html.indexOf(IMG_ESC) >= 0 && html.indexOf(SCRIPT_ESC) >= 0);
  var srv = joinText(ctx._xrayServerLines('sv', [{ name: 'eth1', ip: QUOTE }], { nodes: {} }, {}, IMG));
  assertNoMarkup(srv, 'server peer lines');
  var bgpPeer = joinText(ctx._xrayPeerRouterLines('r2', [{ name: 'lo', ip: SCRIPT }], { protocol: 'bgp', bgp_state: IMG }));
  assertNoMarkup(bgpPeer, 'bgp peer lines');
});

test('packet columns and the capture summary escape tcpdump lines, protocol names and lane labels', function () {
  var ctx = sandbox();
  ctx._scenarioConfig = { capture: { nets: ['net-lan'], lanes: { 'net-lan': IMG } } };
  var pkts = [
    { net: 'net-lan', ts: 1, proto: 'OSPF', raw_line: '12:00 IP 10.0.0.1 > 224.0.0.5: OSPF ' + SCRIPT },
    { net: 'net-lan', ts: 2, proto: 'TCP', raw_line: '12:00 IP 10.0.0.1.179 > 10.0.0.2: Flags [S], ' + IMG },
    { net: 'net-lan', ts: 3, proto: 'ARP', raw_line: '12:00 ARP, Request who-has ' + QUOTE },
    { net: 'net-lan', ts: 4, proto: 'ICMP', raw_line: '12:00 IP 10.0.0.1 > 8.8.8.8: ICMP echo request ' + IMG },
    { net: 'net-lan', ts: 5, proto: IMG, raw_line: 'ICMP x' }
  ];
  var col = ctx.xrayBuildRawHTML(pkts).lan;
  assertNoMarkup(col, 'packet column');
  assert.ok(col.indexOf(SCRIPT_ESC) >= 0 && col.indexOf(IMG_ESC) >= 0);
  assert.ok(col.indexOf('<span style="color:#e74c3c;font-weight:bold">Flags [S]</span>') >= 0, 'SYN highlight kept');
  assertNoMarkup(ctx.xrayBuildRawSummary(pkts), 'capture summary');
});

test('flow view escapes node ids and network names from problem.json', function () {
  var ctx = sandbox();
  ctx._scenarioConfig = {
    capture: { nets: [IMG], lanes: {} },
    nodes: [{ id: SCRIPT, type: 'server' }, { id: QUOTE, type: 'router' }, { id: IMG, readonly: true }]
  };
  var html = ctx.xrayBuildFlowHTML({ events: [], status: { ping_total: '<b>5' } });
  assertNoMarkup(html, 'flow view');
  assert.ok(html.indexOf(SCRIPT_ESC) >= 0 && html.indexOf(QUOTE_ESC) >= 0 && html.indexOf(IMG_ESC) >= 0);
});

test('topology and DeepDive renderers escape node names, roles, loopbacks and network names', function () {
  var ctx = sandbox();
  var cfg = {
    nodes: [{ id: IMG, target: true, role: SCRIPT, loopback: QUOTE }, { id: QUOTE, role: IMG }],
    networks: [{ name: SCRIPT, members: [{ node: IMG }, { node: QUOTE }] }],
    xray: { protocol: 'ospf' }
  };
  var topo = ctx.xrayRenderTopology(cfg);
  assertNoMarkup(topo, 'topology');
  assert.ok(topo.indexOf(IMG_ESC) >= 0 && topo.indexOf(SCRIPT_ESC) >= 0);
  var de = ctx.xrayRenderDeepEngine(cfg, 'topo-node-' + IMG);
  assertNoMarkup(de, 'deep engine');
});
