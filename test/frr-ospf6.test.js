// frr-ospf6.test.js — OSPFv3 (FRR ospf6d) neighbors, interface areas and IPv6 routes read by clab-collect.js.
// Fixture shapes: FRR 10.x JSON (see test/fixtures/frr-ospf6/README.md).
// Run: node --test        (from the repo root; Node >= 18, no dependencies)
'use strict';
var test = require('node:test');
var assert = require('node:assert');
var fs = require('fs');
var path = require('path');
var cc = require('../clab-collect.js');

var FIX = path.join(__dirname, 'fixtures', 'frr-ospf6');
function load(f) { return JSON.parse(fs.readFileSync(path.join(FIX, f), 'utf8')); }
var ADJ = [{ iface: 'eth1', peer: 'r2' }, { iface: 'eth2', peer: 'sw1' }, { iface: 'eth3', peer: 'r6' }];

function collect(over) {
  var a = { node: 'r1', id: 'v3', proto: 'ospf', adjacency: ADJ, ospfConfigured: true,
    interface: load('interface.json'), ospf6Neighbor: load('ospf6-neighbor.json'),
    ospf6Interface: load('ospf6-interface.json'), route6: load('route6.json') };
  Object.keys(over || {}).forEach(function (k) { a[k] = over[k]; });
  return cc.collectFromJson(a);
}
function p2pNbr(state) {
  return [{ neighbors: [{ neighborId: '10.0.0.2', priority: 1, state: state, ifState: 'PointToPoint', interfaceName: 'eth1', interfaceState: 'PointToPoint' }] }];
}

test('neighbors: one v6 row per neighbor, VRF from the interface, Full flags', function () {
  var s = collect();
  assert.deepStrictEqual(s.ospf_neighbors, [
    { router_id: '10.0.0.2', address: '', state: 'Full', role: '', iface: 'eth1', full: true, af: 'v6' },
    { router_id: '10.0.0.3', address: '', state: 'Full', role: '', iface: 'eth2', full: true, af: 'v6' },
    { router_id: '10.0.0.4', address: '', state: 'Full', role: '', iface: 'eth2', full: true, af: 'v6' },
    { router_id: '10.0.0.5', address: '', state: '2-Way', role: 'DROther', iface: 'eth2', full: false, af: 'v6' },
    { router_id: '10.0.0.6', address: '', state: 'Init', role: '', iface: 'eth3', full: false, af: 'v6', vrf: 'red' }
  ]);
  assert.strictEqual(s.full_count, 2);
  assert.strictEqual(s.ospf_neighbor_state, 'Full');
  assert.strictEqual(s.r2_neighbor_state, 'Full');
  assert.strictEqual(s.r6_neighbor_state, 'Init');
  assert.strictEqual(s.r6_has_full, false);
});

test('neighbors: DR + BDR Full and a DROther in Twoway on one LAN -> the link is Full', function () {
  var s = collect();
  assert.strictEqual(s.sw1_ospf_full, true);
  assert.strictEqual(s.sw1_ospf_state, 'Full');
  assert.strictEqual(s.sw1_has_full, true);
  var row = s.peer_links.filter(function (r) { return r.iface === 'eth2'; })[0];
  assert.strictEqual(row.ospf_full, true);
  assert.deepStrictEqual(row.ospf_nbrs.map(function (n) { return n.state; }), ['Full', 'Full', '2-Way/DROther']);
});

test('neighbors: Hello is heard from Init up to Full, not from Down / Attempt', function () {
  var heard = { Init: true, Twoway: true, ExStart: true, ExChange: true, Loading: true, Full: true, Down: false, Attempt: false };
  Object.keys(heard).forEach(function (st) {
    var s = collect({ adjacency: [{ iface: 'eth1', peer: 'r2' }], ospf6Neighbor: p2pNbr(st) });
    assert.strictEqual(s.peer_sending_hellos.r2, heard[st], st + ': peer_sending_hellos');
    assert.strictEqual(s.r2_has_full, st === 'Full', st + ': r2_has_full');
    assert.strictEqual(s.ospf_neighbors[0].full, st === 'Full', st + ': full');
  });
});

test('neighbors: the worst state on a LAN is shown (ospf6d spellings in the state order)', function () {
  var nb = function (rid, st, role) { return { neighborId: rid, state: st, ifState: role, interfaceName: 'eth2', interfaceState: 'DROther' }; };
  var s = collect({ adjacency: [{ iface: 'eth2', peer: 'sw1' }],
    ospf6Neighbor: [{ neighbors: [nb('10.0.0.3', 'Full', 'DR'), nb('10.0.0.4', 'ExChange', 'BDR'), nb('10.0.0.5', 'Twoway', 'DR')] }] });
  assert.strictEqual(s.sw1_ospf_state, '2-Way');
  assert.strictEqual(s.sw1_ospf_full, false);
});

test('interfaces: OSPFv3 interfaces with area, global IPv6, Hello, passive and VRF', function () {
  var s = collect();
  assert.deepStrictEqual(Object.keys(s.interfaces).sort(), ['eth1', 'eth2', 'eth3', 'eth4']);
  assert.deepStrictEqual(s.interfaces.eth1, { up: true, ip: '2001:db8:12::1/64', area: '0' });
  assert.deepStrictEqual(s.interfaces.eth2, { up: true, ip: '2001:db8:100::1/64', area: '1' });
  assert.deepStrictEqual(s.interfaces.eth4, { up: true, ip: '2001:db8:400::1/64', area: '1' });
  assert.deepStrictEqual(s.interfaces.eth3, { up: true, ip: '2001:db8:16::1/64', area: '0', vrf: 'red' });
  assert.strictEqual(s.ospf_if_count, 4);
  assert.deepStrictEqual(s.passive_ifaces, ['eth4']);
  assert.deepStrictEqual(s.iface_hellos, { eth1: 10, eth2: 2, eth3: 10 });
  assert.deepStrictEqual(s.peer_links.map(function (r) { return [r.iface, r.area]; }), [['eth1', '0'], ['eth2', '1'], ['eth3', '0']]);
});

test('interfaces: a router with only area 0 gets no area field', function () {
  var ifs = load('ospf6-interface.json');
  ifs[0].eth2.areaId = '0.0.0.0'; ifs[0].eth4.areaId = '0.0.0.0';
  var s = collect({ ospf6Interface: ifs });
  assert.strictEqual(s.interfaces.eth2.area, undefined);
  assert.strictEqual(s.interfaces.eth1.area, undefined);
});

test('routes: ospf6 routes in the routing table, the LSDB prefixes and the route lookup', function () {
  var s = collect();
  assert.deepStrictEqual(s.routing_table, [
    { prefix: '2001:db8:12::/64', out_iface: 'eth1', next_hop: '', protocol: 'ospf6', selected: false },
    { prefix: '2001:db8:12::/64', out_iface: 'eth1', next_hop: '', protocol: 'connected', selected: true },
    { prefix: '2001:db8:ff::2/128', out_iface: 'eth1', next_hop: 'fe80::a8c1:abff:fe00:201', protocol: 'ospf6', selected: true },
    { prefix: '2001:db8:300::/64', out_iface: 'eth2', next_hop: 'fe80::a8c1:abff:fe00:301', protocol: 'ospf6', selected: true },
    { prefix: '2001:db8:66::/64', out_iface: 'eth3', next_hop: 'fe80::a8c1:abff:fe00:601', protocol: 'ospf6', selected: true, vrf: 'red' }
  ]);
  assert.deepStrictEqual(s.lsdb_prefixes, [
    { text: '2001:db8:12::/64', own: true, via: 'eth1' },
    { text: '2001:db8:ff::2/128', own: false, via: 'fe80::a8c1:abff:fe00:201' },
    { text: '2001:db8:300::/64', own: false, via: 'fe80::a8c1:abff:fe00:301' },
    { text: '2001:db8:66::/64', own: false, via: 'fe80::a8c1:abff:fe00:601', vrf: 'red' }
  ]);
  assert.strictEqual(s.has_ospf_route, true);
  assert.deepStrictEqual(s.route_resolution, { target: '2001:db8:ff::2', resolved: true, protocol: 'ospf6', out_iface: 'eth1',
    next_hop: 'fe80::a8c1:abff:fe00:201', matched_prefix: '2001:db8:ff::2/128' });
});

test('no OSPFv3 data (an older FRR printed nothing) -> no v6 rows, no crash', function () {
  var s = collect({ ospf6Neighbor: [], ospf6Interface: [], route6: {} });
  assert.deepStrictEqual(s.ospf_neighbors, []);
  assert.strictEqual(s.ospf_if_count, 0);
  assert.strictEqual(s.r2_neighbor_state, 'Down');
});
