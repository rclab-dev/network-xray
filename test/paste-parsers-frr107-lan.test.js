// paste-parsers-frr107-lan.test.js — the paste pages' parsers with real FRR 10.7.1 text from a LAN: three OSPF neighbors on one
// interface (plus a second link to one of them), a local route printed as "L * …", BGP rows suppressed by an aggregate (s>),
// and what the paste does not show (no ping, no traceroute, guessed addresses) listed as estimates instead of shown as fact.
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
function fx(n) { return fs.readFileSync(path.join(FX, 'frr107_lan_' + n + '.txt'), 'utf8'); }

test('a LAN: every neighbor on the interface is linked to this router, and no link is made up between them', function () {
  var f = FRR.build(fx('r1_route'), fx('r1_ospf_nei'), 'r1');
  assert.deepStrictEqual(plain(f._debug.peers).map(function (p) { return p.rid; }), ['2.2.2.2', '3.3.3.3', '4.4.4.4']);
  var nets = plain(f.config.networks).map(function (n) { return [n.members.map(function (m) { return m.node; }).join('-'), n.subnet]; });
  assert.deepStrictEqual(nets, [['r1-r2', '10.0.0.0/24'], ['r1-r3', '10.0.0.0/24'], ['r1-r4', '10.0.0.0/24'], ['r1-r2', '10.12.0.0/30']]);
  assert.ok(!f.config.networks.some(function (n) { return n.inferred; }), '2.2.2.2/32 over the LAN and the p2p link is one router, not a link between two');
  assert.ok(f.estimates.some(function (t) { return /eth1: a LAN with 3 neighbors/.test(t); }));
  assert.ok(f.estimates.some(function (t) { return /only r2 and r3 of the 3 neighbors are drawn/.test(t); }));
  assert.ok(f.estimates.some(function (t) { return /dashed r2-r3 line is the picture's layout/.test(t); }));
});

test('"L * 1.1.1.1/32" (FRR 10.7) is read, and a connected /32 is the address itself', function () {
  var f = FRR.build(fx('r1_route'), fx('r1_ospf_nei'), 'r1');
  var lo = plain(f._debug.routes).filter(function (r) { return r.prefix === '1.1.1.1/32'; }).map(function (r) { return [r.proto, r.selected]; });
  assert.deepStrictEqual(lo, [['L', false], ['C', true]]);
  assert.strictEqual(f.state.interfaces.lo.ip, '1.1.1.1/32');
  assert.strictEqual(f.state.interfaces.eth2.ip, '10.12.0.1/30');
});

test('a row that is not read does not lend its continuation lines to the route before it', function () {
  var text = 'O>* 2.2.2.2/32 [110/10] via 10.0.0.2, eth1, weight 1, 00:00:17\n' +
    'X?? something this parser does not know\n' +
    '  *                     via 10.12.0.2, eth2, weight 1, 00:00:17\n';
  var r = plain(FRR.parseRoutes(text));
  assert.strictEqual(r.length, 1);
  assert.strictEqual(r[0].nexthops.length, 1);
});

test('what the paste does not show: no green Ping OK, an unknown address stays empty and is listed', function () {
  var f = FRR.build(fx('r1_route'), fx('r1_ospf_nei'), 'r1');
  var ping = plain(f.config.xray.holo_fields).filter(function (h) { return h.label === 'Ping'; })[0];
  assert.ok(ping.format && !ping.ok, 'Ping is shown as unknown text, not an ok/err field');
  assert.ok(f.config.xray.holo_fields.every(function (h) { return typeof h.field === 'string'; }), 'the engine reads the field of every row (a row without one throws)');
  assert.ok(f.estimates.some(function (t) { return /no traceroute/.test(t); }));
  var noL = fx('r1_route').split('\n').filter(function (l) { return !/^L/.test(l); }).join('\n');   // like FRR 10.0: no L routes
  var g = FRR.build(noL, fx('r1_ospf_nei'), 'r1');
  assert.strictEqual(g.state.interfaces.eth1.ip, '');
  assert.ok(g.estimates.some(function (t) { return /^eth1: its own address is \?/.test(t) && /show interface brief/.test(t); }));
  var none = FRR.build('', '% OSPF instance not found', 'r1');
  assert.strictEqual(none.state.peer_sending_hello, false);
});

test('BGP: s> (suppressed by an aggregate) keeps its flag; a guessed self address is listed', function () {
  var b = BGP.build(fx('r1_bgp_summary'), fx('r1_ip_bgp'), 'r1');
  assert.deepStrictEqual(plain(b.bgpRows).map(function (r) { return r.status + ' ' + r.prefix; }),
    ['*> 172.16.0.0/16', 's> 172.16.1.0/24', 's> 172.16.2.0/24', '*> 192.168.30.0/24']);
  assert.ok(b.estimates.some(function (t) { return /address 10\.0\.0\.254 is a guess/.test(t); }));
  assert.ok(b.estimates.some(function (t) { return /interface names/.test(t); }));
  var p = plain(b.topo.nodes.r2).filter(function (i) { return i.name === 'eth1'; })[0];
  assert.strictEqual(p.prefix, 24, '192.168.30.0/24 drawn with its own length');
});
