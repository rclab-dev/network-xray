// ipv6.test.js - IPv6 and dual-stack handling from FRR json to the state and the views that read it.
// Run: node --test        (from the repo root; Node >= 18, no dependencies)
//
// Fixtures: test/fixtures/frr-ipv6/ (the file names `node clab-collect.js --fixtures <dir>` reads).
'use strict';
var test = require('node:test');
var assert = require('node:assert');
var fs = require('fs');
var path = require('path');
var vm = require('vm');
var clab = require('../clab-collect.js');
var query = require('../scripts/xray-query.js');

var FIX = path.join(__dirname, 'fixtures', 'frr-ipv6');

// the same reader as `clab-collect.js --fixtures`: a missing file is null
function collect(dir, opts) {
  var rd = function (f) { try { return JSON.parse(fs.readFileSync(path.join(FIX, dir, f), 'utf8')); } catch (e) { return null; } };
  return clab.collectFromJson({ node: 'r1', proto: opts.proto, adjacency: opts.adj,
    ospfNeighbor: rd('ospf-neighbor.json'), ospfInterface: rd('ospf-interface.json'), interface: rd('interface.json'),
    route: rd('route.json'), bgpSummary: rd('bgp-summary.json'), bgp: rd('bgp.json'),
    ospf6Neighbor: rd('ospf6-neighbor.json'), ospf6Interface: rd('ospf6-interface.json'), route6: rd('route6.json') });
}
var BGP_ADJ = [{ iface: 'eth1', peer: 'r2' }, { iface: 'eth2', peer: 'r3' }];
var OSPF_ADJ = [{ iface: 'eth1', peer: 'r2' }, { iface: 'eth3', peer: 'r3' }];
function rowOf(s, prefix) { return s.routing_table.filter(function (r) { return r.prefix === prefix && r.selected; })[0]; }

// ---- parseRoutes -------------------------------------------------------------------------------
test('parseRoutes: IPv6 prefixes stay as FRR prints them, ::/0 and link-local next hops keep the interface', function () {
  var r = clab.parseRoutes({
    '::/0': [{ prefix: '::/0', protocol: 'static', selected: true, nexthops: [{ ip: 'fe80::1', interfaceName: 'eth1', active: true }] }],
    '2001:db8::/32': [{ prefix: '2001:db8::/32', protocol: 'bgp', selected: true, nexthops: [{ ip: '2001:db8:12::2', active: true }] }],
    '::ffff:0:0/96': [{ prefix: '::ffff:0:0/96', protocol: 'static', selected: true, nexthops: [{ ip: 'fe80::2', interfaceName: 'eth2' }] }]
  });
  assert.deepStrictEqual(r.map(function (x) { return x.prefix; }), ['::/0', '2001:db8::/32', '::ffff:0:0/96']);
  assert.deepStrictEqual(r[0].nexthops[0], { ip: 'fe80::1', iface: 'eth1', connected: false, active: true, fib: false });
  assert.strictEqual(r[1].nexthops[0].ip, '2001:db8:12::2');
  assert.strictEqual(r[1].nexthops[0].iface, '');
});

test('parseRoutes: `show ipv6 route vrf all json` (VRF keys have no "/", IPv6 prefix keys do)', function () {
  var r = clab.parseRoutes({
    default: { '::/0': [{ prefix: '::/0', protocol: 'static', selected: true, nexthops: [{ ip: 'fe80::1', interfaceName: 'eth1' }] }] },
    blue: { '2001:db8:b::/64': [{ prefix: '2001:db8:b::/64', protocol: 'connected', selected: true, nexthops: [{ directlyConnected: true, interfaceName: 'eth5' }] }] }
  });
  assert.strictEqual(r.length, 2);
  assert.strictEqual(r[0].prefix, '::/0');
  assert.strictEqual(r[0].vrf, undefined);
  assert.strictEqual(r[1].prefix, '2001:db8:b::/64');
  assert.strictEqual(r[1].vrf, 'blue');
});

// ---- dual-stack BGP lab ------------------------------------------------------------------------
test('dual-stack BGP: interfaces show IPv4 first, a v6-only link its global address, never a link-local', function () {
  var s = collect('bgp-r1', { proto: 'bgp', adj: BGP_ADJ });
  assert.strictEqual(s.interfaces.eth1.ip, '10.1.0.1/30');
  assert.strictEqual(s.interfaces.eth2.ip, '');                    // link-local only (unnumbered)
  assert.strictEqual(s.interfaces.eth3.ip, '2001:db8:14::1/64');   // upper-case FE80:: is skipped too
  assert.strictEqual(s.interfaces.lo.ip, '10.0.0.1/32');
});

test('dual-stack BGP: routing table rows for ::/0, link-local next hops and IPv6 ECMP', function () {
  var s = collect('bgp-r1', { proto: 'bgp', adj: BGP_ADJ });
  var d6 = rowOf(s, '::/0');
  assert.deepStrictEqual([d6.out_iface, d6.next_hop, d6.protocol], ['eth1', 'fe80::a8c1:abff:fe00:201', 'static']);
  var d4 = rowOf(s, '0.0.0.0/0');
  assert.deepStrictEqual([d4.out_iface, d4.next_hop], ['eth1', '10.1.0.2']);
  // an IPv4 route over an IPv6 link-local next hop (unnumbered BGP) keeps the next hop and its interface
  var v4ll = rowOf(s, '10.0.0.3/32');
  assert.deepStrictEqual([v4ll.out_iface, v4ll.next_hop], ['eth2', 'fe80::a8c1:abff:fe00:302']);
  var ecmp = rowOf(s, '2001:db8:100::/48');
  assert.deepStrictEqual(ecmp.nexthops, [{ ip: 'fe80::a8c1:abff:fe00:201', iface: 'eth1' }, { ip: 'fe80::a8c1:abff:fe00:302', iface: 'eth2' }]);
  // the same link-local prefix on two interfaces: both rows, only the selected one counts
  assert.strictEqual(s.routing_table.filter(function (r) { return r.prefix === 'fe80::/64'; }).length, 2);
  assert.strictEqual(rowOf(s, 'fe80::/64').out_iface, 'eth1');
});

test('dual-stack BGP: IPv6 and interface-named neighbors are listed and placed by hostname', function () {
  var s = collect('bgp-r1', { proto: 'bgp', adj: BGP_ADJ });
  assert.deepStrictEqual(s.bgp_neighbors.map(function (n) { return [n.ip, n.remote_as, n.state, n.iface]; }), [
    ['10.1.0.2', 65002, 'Established', 'eth1'],
    ['2001:db8:12::2', 65002, 'Established', 'eth1'],
    ['eth2', 65003, 'Established', 'eth2']
  ]);
  assert.deepStrictEqual(s.peer_links.map(function (p) { return [p.iface, p.peer, p.full]; }), [['eth1', 'r2', true], ['eth2', 'r3', true]]);
});

test('dual-stack BGP: BGP table next hop may be link-local; the target stays IPv4', function () {
  var s = collect('bgp-r1', { proto: 'bgp', adj: BGP_ADJ });
  var r3 = s.bgp_routes.filter(function (r) { return r.prefix === '10.0.0.3'; })[0];
  assert.strictEqual(r3.next_hop, 'fe80::a8c1:abff:fe00:302');
  assert.strictEqual(r3.prefixlen, 32);
  assert.strictEqual(s.pfx_rcvd, 2);   // the own 10.0.0.1/32 (next hop 0.0.0.0) is not received
  assert.strictEqual(s.route_resolution.target, '10.0.0.3');
  assert.strictEqual(s.route_resolution.out_iface, 'eth2');
  assert.strictEqual(s.route_resolution.next_hop, 'fe80::a8c1:abff:fe00:302');
});

test('dual-stack BGP: route lookup over the collected table keeps the two families apart', function () {
  var st = { r1: collect('bgp-r1', { proto: 'bgp', adj: BGP_ADJ }) };
  var pfx = function (dst) { var r = query.routeLookup(st, 'r1', dst).route; return r ? r.prefix : null; };
  assert.strictEqual(pfx('2001:db8:ff::2'), '2001:db8:ff::2/128');
  assert.strictEqual(pfx('2001:0DB8:00FF:0000:0000:0000:0000:0002'), '2001:db8:ff::2/128');
  assert.strictEqual(pfx('2001:db8:100:7::1'), '2001:db8:100::/48');
  assert.strictEqual(pfx('2001:db9::1'), '::/0');
  assert.strictEqual(pfx('fe80::a8c1:abff:fe00:201%eth1'), 'fe80::/64');
  assert.strictEqual(pfx('10.0.0.3'), '10.0.0.3/32');
  assert.strictEqual(pfx('192.0.2.1'), '0.0.0.0/0');
  assert.strictEqual(pfx('::ffff:10.0.0.3'), '::/0');   // an IPv4-mapped address is IPv6: not the IPv4 /32
  var ecmp = query.routeLookup(st, 'r1', '2001:db8:100::9');
  assert.strictEqual(ecmp.out_iface, 'eth1');
  assert.deepStrictEqual(ecmp.route.nexthops.map(function (h) { return h.iface; }), ['eth1', 'eth2']);
});

// ---- dual-stack OSPF (v2 + v3) -----------------------------------------------------------------
test('OSPFv2 + OSPFv3: one peer per link, v3 rows marked, the v3-only link is a peer of its own', function () {
  var s = collect('ospf-r1', { proto: 'ospf', adj: OSPF_ADJ });
  assert.deepStrictEqual(s.ospf_neighbors.map(function (n) { return [n.router_id, n.iface, n.state, n.af || 'v4']; }), [
    ['10.0.0.2', 'eth1', 'Full', 'v4'],
    ['10.0.0.2', 'eth1', 'Full', 'v6'],
    ['10.0.0.3', 'eth3', 'Full', 'v6']
  ]);
  assert.deepStrictEqual(s.peer_links.map(function (p) { return [p.iface, p.peer, p.full]; }), [['eth1', 'r2', true], ['eth3', 'r3', true]]);
  assert.strictEqual(s.full_count, 2);
  assert.strictEqual(s.interfaces.eth1.ip, '10.1.0.1/30');
  assert.strictEqual(s.interfaces.eth3.ip, '2001:db8:13::1/64');
});

test('OSPFv2 + OSPFv3: LSDB lists the ospf6 prefixes with their link-local next hop; the target stays IPv4', function () {
  var s = collect('ospf-r1', { proto: 'ospf', adj: OSPF_ADJ });
  assert.deepStrictEqual(s.lsdb_prefixes.map(function (p) { return [p.text, p.own, p.via]; }), [
    ['10.0.0.2/32', false, '10.1.0.2'],
    ['2001:db8:ff::2/128', false, 'fe80::a8c1:abff:fe00:201'],
    ['2001:db8:ff::3/128', false, 'fe80::a8c1:abff:fe00:303']
  ]);
  assert.strictEqual(s.route_resolution.target, '10.0.0.2');
  var v3 = rowOf(s, '2001:db8:ff::3/128');
  assert.deepStrictEqual([v3.out_iface, v3.next_hop, v3.protocol], ['eth3', 'fe80::a8c1:abff:fe00:303', 'ospf6']);
});

// ---- xray-core.js helpers ----------------------------------------------------------------------
var CORE_SRC = fs.readFileSync(path.join(__dirname, '..', 'xray-core.js'), 'utf8');
function cut(name) {
  var m = new RegExp('^function ' + name + '\\(', 'm').exec(CORE_SRC);
  if (!m) throw new Error('xray-core.js: ' + name + ' not found');
  return CORE_SRC.slice(m.index, CORE_SRC.indexOf('\n}', m.index) + 2);
}
var ctx = { window: {}, String: String };
vm.createContext(ctx);
vm.runInContext(['_escapeHtml', '_xrayNbrTag', 'xrayIpInPrefix'].map(cut).join('\n'), ctx, { filename: 'xray-core.js (IPv6 helpers)' });

test('xray-core _xrayNbrTag: an OSPFv3 neighbor row is tagged (v3)', function () {
  var s = collect('ospf-r1', { proto: 'ospf', adj: OSPF_ADJ });
  assert.deepStrictEqual(s.ospf_neighbors.map(function (n) { return ctx._xrayNbrTag(n); }), ['', ' (v3)', ' (v3)']);
});

test('xray-core xrayIpInPrefix: IPv4 unchanged; an IPv6 address is never read as IPv4', function () {
  var f = ctx.xrayIpInPrefix;
  assert.strictEqual(f('10.0.0.3', '10.0.0.0/24'), true);
  assert.strictEqual(f('10.0.1.3', '10.0.0.0/24'), false);
  assert.strictEqual(f('10.0.0.3', '0.0.0.0/0'), true);
  assert.strictEqual(f('10.0.0.3', '10.0.0.3'), true);
  assert.strictEqual(f('2001:db8::1', '2001:db8::1/128'), true);   // IPv6: exact address only
  assert.strictEqual(f('2001:db8::1', '0.0.0.0/0'), false);
  assert.strictEqual(f('::ffff:10.0.0.3', '0.0.0.0/0'), false);    // IPv4-mapped is IPv6 (was 0.0.0.3)
  assert.strictEqual(f('::ffff:10.0.0.3', '0.0.0.0/8'), false);
});
