#!/usr/bin/env node
/* nbr-own-list-selftest.js — the "Hello sent, no neighbor" line (nx_ospf_nbr_own_list) reaches the Routing Engine
 * when an OSPF interface is up, not passive, and the router's own neighbor list is EMPTY (no row at all).
 *   usage: node scripts/nbr-own-list-selftest.js
 * 4 cases = FRR / IOS-XE (IOL) interface names x OSPF only (_xrayOspfRtSummaryLines) / BGP + OSPF (xrayBgpDeepLines, deep_coexist_ospf).
 * Plus the guards: a shut-down interface and a list with a Full row give no such line.
 * Loads the whole xray-core.js against a stub window/document.
 */
var fs = require('fs'), path = require('path'), vm = require('vm');
var _cli = process.argv.slice(2);
if (_cli.indexOf('-h') >= 0 || _cli.indexOf('--help') >= 0) { console.log('usage: node scripts/nbr-own-list-selftest.js\n  check the \"Hello sent, no neighbor\" line in xray-core.js (no options)\n  -h, --help  show this help'); process.exit(0); }
var _bad = _cli[0];
if (_bad) { console.error('nbr-own-list-selftest.js: unknown option: ' + _bad + "\nTry 'node scripts/nbr-own-list-selftest.js --help'."); process.exit(2); }

var src = fs.readFileSync(path.join(__dirname, '..', 'xray-core.js'), 'utf8');
var document = {
  documentElement: { getAttribute: function () { return 'en'; } },
  getElementById: function () { return null; }, querySelector: function () { return null; }, querySelectorAll: function () { return []; },
  createElement: function () { return { style: {}, setAttribute: function () {}, appendChild: function () {}, classList: { add: function () {} } }; },
  head: { appendChild: function () {} }, body: { appendChild: function () {} }, addEventListener: function () {}, readyState: 'complete'
};
var ctx = {
  document: document, console: console, addEventListener: function () {}, location: { search: '', hash: '', href: '' }, navigator: { userAgent: '' },
  setTimeout: function () {}, clearTimeout: function () {}, setInterval: function () {}, requestAnimationFrame: function () {},
  matchMedia: function () { return { matches: false, addListener: function () {} }; },
  localStorage: { getItem: function () { return null; }, setItem: function () {} }
};
ctx.window = ctx;
vm.createContext(ctx);
vm.runInContext(src, ctx, { filename: 'xray-core.js' });

var pass = 0, fail = 0;
function check(ok, msg) { console.log((ok ? 'PASS  ' : 'FAIL  ') + msg); if (ok) pass++; else fail++; }

/* r1 after the peer's interface went away: own interface up, Hello sent, nobody in the list */
function ospfState(lo, ifn) {
  var s = { success: true, target_node: 'r1', ospf_configured: true, ospf_active_on_interface: true,
    ospf_neighbors: [], iface_hellos: {}, interfaces: {}, neighbor_state: 'Down', r2_neighbor_state: 'Down', r2_iface: ifn,
    peer_sending_hello: false, peer_hellos: {}, routing_table: [{ prefix: '10.10.0.0/24', protocol: 'connected', out_iface: ifn }],
    route_resolution: { target: '2.2.2.2', resolved: false } };
  s.iface_hellos[ifn] = 10;
  s.interfaces[lo] = { up: true, ip: '1.1.1.1/32' };
  s.interfaces[ifn] = { up: true, ip: '10.10.0.10/24' };
  return s;
}
function withBgp(s) {   /* q15-like: iBGP to the peer's loopback, Idle */
  s.r2_established = false;
  s.bgp_neighbors = [{ ip: '2.2.2.2', remote_as: '65001', state: 'Idle', ibgp: true }];
  s.pfx_rcvd = 0;
  return s;
}
function text(lines) { return lines.map(function (l) { return l.text; }).join('\n'); }
function run(s, coexist) {
  ctx._scenarioConfig = coexist ? { xray: { deep_coexist_ospf: true } } : {};
  ctx._lastXrayState = s;
  ctx._lastXrayHierarchy = null;
  var lines = coexist ? ctx.xrayBgpDeepLines(s) : ctx._xrayOspfRtSummaryLines(s);
  ctx._lastXrayState = null;
  return text(lines);
}
var RX = /Hello sent, no neighbor: <span[^>]*>(.*?)<\/span>/;

[['FRR', 'lo', 'eth1'], ['IOS-XE', 'Loopback0', 'Ethernet0/1']].forEach(function (k) {
  [false, true].forEach(function (coexist) {
    var name = k[0] + (coexist ? ' BGP + OSPF' : ' OSPF only');
    var s = ospfState(k[1], k[2]); if (coexist) withBgp(s);
    var t = run(s, coexist), m = RX.exec(t);
    check(!!m && m[1].indexOf(k[2]) === 0 && /r2/.test(m[1]), name + ': neighbor list empty, ' + k[2] + ' up -> "Hello sent, no neighbor: ' + (m ? m[1].replace(/&[a-z]+;|→/g, '>') : '(none)') + '"');
    check((t.match(/Hello sent, no neighbor/g) || []).length === 1, name + ': the line is there once');

    var d = ospfState(k[1], k[2]); if (coexist) withBgp(d); d.interfaces[k[2]].up = false;
    check(!/Hello sent, no neighbor/.test(run(d, coexist)), name + ': ' + k[2] + ' shut down -> no line (a down interface sends no Hello)');

    var f = ospfState(k[1], k[2]); if (coexist) withBgp(f);
    f.ospf_neighbors = [{ router_id: '2.2.2.2', address: '10.10.0.20', state: 'Full', role: 'DR', iface: k[2], full: true }];
    f.neighbor_state = f.r2_neighbor_state = 'Full'; f.has_full = true;
    check(!/Hello sent, no neighbor/.test(run(f, coexist)), name + ': Full neighbor on ' + k[2] + ' -> no line');
  });
});

console.log('SUMMARY: ' + pass + '/' + (pass + fail) + ' PASS');
process.exit(fail ? 1 : 0);
