// paste-parsers-frr10.test.js — the paste pages' parsers (bgp-parse.js / frr-parse.js) with real FRR 10.0.0 text:
// a MED of 7 digits, a prefix that wraps to the next line, a best path that is the router's own, a summary that lists
// IPv6 unicast after IPv4, an eBGP session that shows (Policy), "% BGP instance not found", and two OSPF links to the
// same router with an ECMP route to its loopback (and that route not selected when a static wins).
// Run: node --test        (from the repo root; Node >= 18, no dependencies)
'use strict';
var test = require('node:test');
var assert = require('node:assert');
var fs = require('fs');
var path = require('path');
var vm = require('vm');

var ROOT = path.join(__dirname, '..');
var FX = path.join(__dirname, 'fixtures', 'frr10-paste');
var ctx = { window: {}, console: { log: function () {} } };
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(path.join(ROOT, 'bgp-parse.js'), 'utf8'), ctx);
vm.runInContext(fs.readFileSync(path.join(ROOT, 'frr-parse.js'), 'utf8'), ctx);
var BGP = ctx.window.BGPFRR, FRR = ctx.window.FRR;
function plain(x) { return JSON.parse(JSON.stringify(x)); }   // values made inside the vm: compare as plain data
function fx(n) { return fs.readFileSync(path.join(FX, n + '.txt'), 'utf8'); }

test('show ip bgp: every route is read (7-digit MED, wrapped prefix, own best path)', function () {
  var rs = plain(BGP.parseBgpTable(fx('r1_ip_bgp')).routes).map(function (r) {
    return [r.prefix, r.nexthop, r.best, r.metric, r.weight, r.as_path, r.origin];
  });
  assert.deepStrictEqual(rs, [
    ['8.8.8.0/24', '10.12.0.2', true, 1000000, 0, '65002', 'i'],
    ['10.1.0.0/24', '10.12.0.2', false, 1000000, 0, '65002', 'i'],
    ['10.1.0.0/24', '0.0.0.0', true, 0, 32768, '', 'i'],
    ['192.168.100.128/25', '10.12.0.2', true, 1000000, 0, '65002', 'i']
  ]);
});

test('show bgp summary: IPv4 unicast neighbors once each, (Policy) is an established session', function () {
  var n = plain(BGP.parseSummary(fx('r1_bgp_summary')).neighbors);
  assert.deepStrictEqual(n.map(function (x) { return [x.ip, x.state, x.pfxRcvd]; }),
    [['10.12.0.2', 'Established', 3], ['10.13.0.2', 'Established', 0]], 'the IPv6 unicast part lists 10.12.0.2 again');
  var p = BGP.parseSummary(fx('r3_bgp_summary')).neighbors;
  assert.strictEqual(p.length, 1);
  assert.strictEqual(p[0].established, true);
  assert.strictEqual(p[0].pfxRcvd, 0);
  assert.strictEqual(p[0].note, '(Policy)');
});

test('"% BGP instance not found" is no BGP, not an idle session', function () {
  var b = BGP.build(fx('r1_bgp_novrf'), '', 'r1');
  assert.strictEqual(b.state.bgp_configured, false);
});

test('the FORWARD arrow follows a best route learned from a peer, never a guess', function () {
  var b = BGP.build(fx('r1_bgp_summary'), fx('r1_ip_bgp'), 'r1');
  assert.strictEqual(b.state.best_path_via, 'r2', '8.8.8.0/24 is best via r2');
  // only the router's own route is best: no arrow
  var own = fx('r1_ip_bgp').split('\n').filter(function (l) { return !/8\.8\.8\.0|192\.168\.100|^\s+10\.12\.0\.2/.test(l); }).join('\n');
  var o = BGP.build(fx('r1_bgp_summary'), own, 'r1');
  assert.strictEqual(o.state.best_path_via, '');
});

test('two OSPF links to the same router: one router, two links, no link between peers', function () {
  var f = FRR.build(fx('r1_route'), fx('r1_ospf_nei'), 'r1');
  assert.deepStrictEqual(plain(f._debug.peers).map(function (p) { return p.rid; }), ['2.2.2.2']);
  assert.deepStrictEqual(plain(f.config.networks).map(function (n) { return n.subnet; }).sort(), ['10.12.0.0/30', '10.21.0.0/30']);
  assert.ok(!f.config.networks.some(function (n) { return n.inferred; }), 'no inferred link');
  assert.strictEqual(f.state.route_resolution.target, '2.2.2.2');
});

test('an OSPF route that is not selected (a static wins) is not the destination', function () {
  var f = FRR.build(fx('r1_route_with_static'), fx('r1_ospf_nei'), 'r1');
  assert.strictEqual(f.state.route_resolution.target, '');
  assert.strictEqual(f.state.has_ospf_route, false);
});
