// frr-json-versions.test.js — the FRR `show … json` parsers read the key names FRR 8.x, 9.x and 10.x print.
// Run: node --test        (from the repo root; Node >= 18, no dependencies)
//
// Fixtures: test/fixtures/frr-json-versions/ (hand-made in the shape of FRR's JSON writers; see the README there).
'use strict';
var test = require('node:test');
var assert = require('node:assert');
var fs = require('fs');
var path = require('path');
var clab = require('../clab-collect.js');

var FIX = path.join(__dirname, 'fixtures', 'frr-json-versions');
function fx(name) { return JSON.parse(fs.readFileSync(path.join(FIX, name), 'utf8')); }

// ---- show ip ospf neighbor json ----------------------------------------------------------------------------

test('ospf neighbor 8.x: old + new keys -> state, address, bare iface', function () {
  var n = clab.parseOspfNeighbors(fx('ospf-neighbor-8.4.json'));
  assert.strictEqual(n.list.length, 1);
  assert.deepStrictEqual(n.byIface.eth0, { rid: '2.2.2.2', address: '10.1.0.20', iface: 'eth0', state: 'Full/DR', full: true });
});

test('ospf neighbor 9.x/10.x: only nbrState / ifaceAddress -> same record as 8.x', function () {
  var n = clab.parseOspfNeighbors(fx('ospf-neighbor-10.json'));
  assert.strictEqual(n.list.length, 2);
  assert.deepStrictEqual(n.byIface.eth0, { rid: '2.2.2.2', address: '10.1.0.20', iface: 'eth0', state: 'Full/DR', full: true });
  assert.deepStrictEqual(n.byIface.eth1, { rid: '3.3.3.3', address: '10.2.0.30', iface: 'eth1', state: 'Init/DROther', full: false });
});

test('ospf neighbor: 8.x and 10.x forms give the same parse', function () {
  var a = clab.parseOspfNeighbors(fx('ospf-neighbor-8.4.json')).byIface.eth0;
  var b = clab.parseOspfNeighbors(fx('ospf-neighbor-10.json')).byIface.eth0;
  assert.deepStrictEqual(a, b);
});

// ---- show ip ospf interface json ---------------------------------------------------------------------------

test('ospf interface: "ifUp": true -> up; only "ifDown" (false) -> down', function () {
  var i = clab.parseOspfInterfaces(fx('ospf-interface-down.json'));
  assert.strictEqual(i.eth0.up, true);
  assert.strictEqual(i.eth1.up, false);
  assert.strictEqual(i.eth0.hello, 10);
  assert.strictEqual(i.eth1.ip, '10.2.0.10');
  assert.strictEqual(i.eth1.prefix, 24);
});

test('ospf interface: neither ifUp nor ifDown (hand-made input) -> still up', function () {
  var i = clab.parseOspfInterfaces({ interfaces: { eth0: { ipAddress: '10.1.0.10', ipAddressPrefixlen: 24 } } });
  assert.strictEqual(i.eth0.up, true);
});

test('ospf interface down reaches the state (interfaces.eth1.up = false)', function () {
  var st = clab.collectFromJson({ node: 'r1', proto: 'ospf',
    adjacency: [{ iface: 'eth0', peer: 'r2' }, { iface: 'eth1', peer: 'r3' }],
    ospfNeighbor: fx('ospf-neighbor-10.json'), ospfInterface: fx('ospf-interface-down.json'), route: fx('route-10.json') });
  assert.strictEqual(st.interfaces.eth0.up, true);
  assert.strictEqual(st.interfaces.eth1.up, false);
  assert.strictEqual(st.r2_has_full, true);
  assert.strictEqual(st.r3_has_full, false);
});

// ---- show ip bgp summary json ------------------------------------------------------------------------------

test('bgp summary 10.x: ipv4Unicast.peers, state, AS, uptime, pfxRcd, hostname', function () {
  var s = clab.parseBgpSummary(fx('bgp-summary-10.json'));
  assert.strictEqual(s.localAs, 65001);
  assert.strictEqual(s.routerId, '10.0.0.1');
  var a = s.byIp['10.1.0.2'], b = s.byIp['10.1.0.6'];
  assert.strictEqual(a.established, true);
  assert.strictEqual(a.remoteAs, 65002);
  assert.strictEqual(a.ibgp, false);
  assert.strictEqual(a.upDown, '00:05:01');
  assert.strictEqual(a.pfxRcd, 3);
  assert.strictEqual(a.hostname, 'r2');
  assert.strictEqual(b.state, 'Idle (Admin)');
  assert.strictEqual(b.established, false);
  assert.strictEqual(b.hostname, '');
});

// ---- show ip bgp json --------------------------------------------------------------------------------------

test('bgp per-prefix form: only "bestpath.overall" marks the best path', function () {
  var r = clab.parseBgpRoutes(fx('bgp-prefix-dmed.json'));
  assert.strictEqual(r.length, 3);
  assert.deepStrictEqual(r.map(function (p) { return p.best; }), [true, false, false]);
  assert.strictEqual(r[0].reason, 'MED');
  assert.strictEqual(r[1].reason, '');
  assert.deepStrictEqual(r.map(function (p) { return p.valid; }), [true, true, false]);
  assert.strictEqual(r[0].prefixlen, 24);
  assert.strictEqual(r[1].nextHop, '10.1.0.6');
});

test('bgp table form: "bestpath": true is unchanged', function () {
  var r = clab.parseBgpRoutes(fx('../bestpath-frr/med.json'));
  assert.deepStrictEqual(r.map(function (p) { return p.best; }), [true, false]);
  assert.strictEqual(r[0].reason, 'MED');
});

// ---- show ip route json ------------------------------------------------------------------------------------

test('route 10.x: prefix, protocol, selected, next-hop ip / interfaceName / fib / directlyConnected', function () {
  var r = clab.parseRoutes(fx('route-10.json'));
  var c = r.filter(function (x) { return x.prefix === '10.1.0.0/24'; })[0];
  var o = r.filter(function (x) { return x.prefix === '2.2.2.2/32'; })[0];
  assert.strictEqual(c.protocol, 'connected');
  assert.deepStrictEqual(c.nexthops[0], { ip: null, iface: 'eth0', connected: true, active: true, fib: true });
  assert.strictEqual(o.protocol, 'ospf');
  assert.strictEqual(o.selected, true);
  assert.deepStrictEqual(o.nexthops[0], { ip: '10.1.0.20', iface: 'eth0', connected: false, active: true, fib: true });
  assert.strictEqual(o.vrf, undefined);
});

// validity must come from "valid" / overall best / multipath, not from any object-valued "bestpath"
test('per-prefix bestpath: a per-AS winner without "valid" is neither best nor valid; "overall: true" without "valid" is both', function () {
  var j = { prefix: '198.51.100.0/24', paths: [
    { nexthops: [{ ip: '10.0.0.3' }], path: '65003', bestpath: { bestpathFromAs: 65003 } },
    { nexthops: [{ ip: '10.0.0.2' }], path: '65002', bestpath: { overall: true, selectionReason: 'AS Path' } }
  ] };
  var r = clab.parseBgpRoutes(j);
  var a = r.filter(function (x) { return x.nextHop === '10.0.0.3'; })[0];
  var b = r.filter(function (x) { return x.nextHop === '10.0.0.2'; })[0];
  assert.strictEqual(a.best, false);
  assert.strictEqual(a.valid, false);
  assert.strictEqual(b.best, true);
  assert.strictEqual(b.valid, true);
  assert.strictEqual(b.reason, 'AS Path');
});
