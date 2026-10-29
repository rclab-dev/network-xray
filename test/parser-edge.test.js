// parser-edge.test.js — malformed / unusual FRR `show ... json` input must never make the collector throw.
// Run: node --test        (from the repo root; Node >= 18, no dependencies)
//
// Feeds empty output, missing keys, wrong types (string / number / null / array instead of object),
// zero OSPF/BGP neighbors, down interfaces and IPv6-only labs through the clab-collect.js parsers,
// buildState / collectFromJson, and frr-collect.js --from-dir; each result must be a sane state.
'use strict';
var test = require('node:test');
var assert = require('node:assert');
var fs = require('fs');
var os = require('os');
var path = require('path');
var clab = require('../clab-collect.js');
var frr = require('../frr-collect.js');

// values FRR (or a broken vtysh / a truncated file) could hand us in place of a json object
var JUNK = [undefined, null, '', 'not json', 0, 42, true, false, [], [null], [1, 'x'], {}, { x: null }];

// the invariants every produced state must keep, whatever the input
function assertSane(st, node) {
  assert.ok(st && typeof st === 'object', 'state is an object');
  assert.strictEqual(st.success, true);
  assert.strictEqual(st.target_node, node || 'r1');
  assert.ok(st.interfaces && typeof st.interfaces === 'object' && !Array.isArray(st.interfaces), 'interfaces is an object');
  Object.keys(st.interfaces).forEach(function (k) {
    assert.strictEqual(typeof st.interfaces[k].up, 'boolean', 'interfaces.' + k + '.up is boolean');
    assert.strictEqual(typeof st.interfaces[k].ip, 'string', 'interfaces.' + k + '.ip is string');
  });
  assert.strictEqual(typeof st.full_count, 'number');
  assert.ok(st.full_count >= 0);
  assert.strictEqual(typeof st.has_full, 'boolean');
  assert.strictEqual(typeof st.neighbor_state, 'string');
  assert.strictEqual(typeof st.wan_iface, 'string');
  assert.strictEqual(typeof st.lan_iface, 'string');
  assert.ok(st.route_resolution && typeof st.route_resolution.resolved === 'boolean', 'route_resolution.resolved is boolean');
  assert.ok(Array.isArray(st.routing_table), 'routing_table is an array');
  st.routing_table.forEach(function (r) { assert.strictEqual(typeof r.prefix, 'string', 'routing_table prefix is string'); });
  assert.ok(Array.isArray(st.bgp_neighbors), 'bgp_neighbors is an array');
  assert.ok(Array.isArray(st.ospf_neighbors), 'ospf_neighbors is an array');
  assert.doesNotThrow(function () { JSON.stringify(st); }, 'state is JSON-serializable');
}

// ---- individual parsers: junk in -> empty, well-typed result out ------------------------------

test('parsers return an empty result for junk top-level input', function () {
  JUNK.forEach(function (j) {
    var tag = JSON.stringify(j);
    var n = clab.parseOspfNeighbors(j);
    assert.deepStrictEqual(n.list, [], 'parseOspfNeighbors ' + tag);
    assert.deepStrictEqual(clab.parseOspfInterfaces(j), {}, 'parseOspfInterfaces ' + tag);
    // {x: null} is a well-formed iface map with one data-less iface -> kept as down, not junk
    if (tag === '{"x":null}') assert.deepStrictEqual(clab.parseInterfaces(j), { x: { up: false, ip: '', prefix: 24 } });
    else assert.deepStrictEqual(clab.parseInterfaces(j), {}, 'parseInterfaces ' + tag);
    assert.deepStrictEqual(clab.parseRoutes(j), [], 'parseRoutes ' + tag);
    assert.deepStrictEqual(clab.parseBgpSummary(j).list, [], 'parseBgpSummary ' + tag);
    assert.deepStrictEqual(clab.parseBgpRoutes(j), [], 'parseBgpRoutes ' + tag);
  });
});

test('parseOspfNeighbors: wrong-typed neighbor entries are skipped', function () {
  var cases = [
    { neighbors: {} },
    { neighbors: null },
    { neighbors: 'Full' },
    { neighbors: [] },
    { neighbors: [null] },
    { neighbors: { '2.2.2.2': null } },
    { neighbors: { '2.2.2.2': [null, 'x', 7] } },
    { neighbors: { '2.2.2.2': {} } }
  ];
  cases.forEach(function (j) {
    var out;
    assert.doesNotThrow(function () { out = clab.parseOspfNeighbors(j); }, JSON.stringify(j));
    out.list.forEach(function (r) { assert.strictEqual(r.full, false); assert.strictEqual(typeof r.iface, 'string'); });
  });
  // a neighbor with no state / no iface is kept as not Full and not mapped to an iface
  var o = clab.parseOspfNeighbors({ neighbors: { '2.2.2.2': {} } });
  assert.strictEqual(o.list.length, 1);
  assert.strictEqual(o.list[0].full, false);
  assert.deepStrictEqual(o.byIface, {});
});

test('parseOspfInterfaces: missing / null fields fall back to defaults', function () {
  var out = clab.parseOspfInterfaces({ interfaces: { eth1: null, eth2: {}, eth3: { ipAddresses: [null] }, eth4: 'x' } });
  ['eth1', 'eth2', 'eth3', 'eth4'].forEach(function (k) {
    assert.ok(out[k], k + ' present');
    assert.strictEqual(out[k].hello, 10, k + ' default hello');
    assert.strictEqual(out[k].area, '0', k + ' default area');
  });
});

test('parseInterfaces: null entries, odd ipAddresses, down and IPv6-only interfaces', function () {
  var out = clab.parseInterfaces({
    eth0: null,
    eth1: { operationalStatus: 'down', administrativeStatus: 'up', ipAddresses: [{ address: '10.0.1.1/30' }] },
    eth2: { ipAddresses: [null, 5, {}] },
    eth3: { operationalStatus: 'up', ipAddresses: [{ address: 'fe80::1/64' }, { address: '2001:db8:1::1/64' }] },
    eth4: { operationalStatus: 'up', ipAddresses: 'nonsense' }
  });
  assert.strictEqual(out.eth0.up, false);
  assert.strictEqual(out.eth1.up, false, 'oper down wins over admin up');
  assert.strictEqual(out.eth1.ip, '10.0.1.1');
  assert.strictEqual(out.eth1.prefix, 30);
  assert.ok(out.eth2, 'eth2 present');
  assert.strictEqual(out.eth3.ip, '2001:db8:1::1', 'IPv6-only: first global address, not link-local');
  assert.strictEqual(out.eth3.prefix, 64);
  assert.strictEqual(out.eth3.v6, true);
  assert.strictEqual(out.eth4.ip, '');
});

test('parseRoutes: wrong-typed nexthops / protocol / prefix do not throw', function () {
  var cases = [
    { '10.0.0.0/24': [{ prefix: '10.0.0.0/24', protocol: 'ospf', nexthops: 'eth0' }] },
    { '10.0.0.0/24': [{ prefix: '10.0.0.0/24', protocol: 'ospf', nexthops: { ip: '10.0.0.2' } }] },
    { '10.0.0.0/24': [{ prefix: '10.0.0.0/24', protocol: 'ospf', nexthops: [null, 3, 'x'] }] },
    { '10.0.0.0/24': [{ prefix: '10.0.0.0/24', protocol: 7, nexthops: [] }] },
    { '10.0.0.0/24': [{ prefix: 12345, protocol: 'ospf', nexthops: [] }] },
    { '10.0.0.0/24': null },
    { '10.0.0.0/24': [] },
    { '10.0.0.0/24': 'x' }
  ];
  cases.forEach(function (j) {
    var out;
    assert.doesNotThrow(function () { out = clab.parseRoutes(j); }, JSON.stringify(j));
    out.forEach(function (r) {
      assert.strictEqual(typeof r.prefix, 'string', 'prefix is a string');
      assert.strictEqual(typeof r.protocol, 'string', 'protocol is a string');
      assert.ok(Array.isArray(r.nexthops), 'nexthops is an array');
      r.nexthops.forEach(function (h) { assert.ok(h && typeof h === 'object', 'each nexthop is an object'); });
    });
  });
});

test('parseBgpSummary: zero peers and wrong-typed peers', function () {
  assert.deepStrictEqual(clab.parseBgpSummary({ ipv4Unicast: { peers: {} } }).list, []);
  assert.deepStrictEqual(clab.parseBgpSummary({ ipv4Unicast: {} }).list, []);
  assert.deepStrictEqual(clab.parseBgpSummary({ ipv4Unicast: 'x' }).list, []);
  assert.deepStrictEqual(clab.parseBgpSummary({ ipv4Unicast: null }).list, []);
  var o = clab.parseBgpSummary({ ipv4Unicast: { peers: { '10.0.0.2': null, '10.0.0.6': 'Established' } } });
  o.list.forEach(function (p) { assert.strictEqual(p.established, false, p.ip + ' not established'); });
});

test('parseBgpRoutes: empty table and wrong-typed paths', function () {
  assert.deepStrictEqual(clab.parseBgpRoutes({ routerId: '1.1.1.1', routes: {} }), []);
  assert.deepStrictEqual(clab.parseBgpRoutes({ routerId: '1.1.1.1', routes: null }), []);
  var out = clab.parseBgpRoutes({ routerId: '1.1.1.1', routes: { '10.9.0.0/24': [null, 'x', { nexthops: 'x' }, { nexthops: [null] }] } });
  out.forEach(function (r) { assert.strictEqual(typeof r.prefix, 'string'); });
});

// ---- whole collector: junk in every slot -> a sane state ---------------------------------------

test('collectFromJson: empty output in every slot (OSPF and BGP)', function () {
  ['ospf', 'bgp'].forEach(function (proto) {
    var st = clab.collectFromJson({ node: 'r1', proto: proto });
    assertSane(st);
    assert.strictEqual(st.full_count, 0);
    assert.strictEqual(st.has_full, false);
    assert.strictEqual(st.neighbor_state, 'None');
    assert.strictEqual(st.route_resolution.resolved, false);
    assert.strictEqual(st.ping_ok, false);
  });
});

test('collectFromJson: the same junk value in every slot never throws', function () {
  JUNK.forEach(function (j) {
    ['ospf', 'bgp'].forEach(function (proto) {
      var st;
      assert.doesNotThrow(function () {
        st = clab.collectFromJson({ node: 'r1', proto: proto, adjacency: [{ iface: 'eth1', peer: 'r2' }],
          interface: j, route: j, route6: j, ospfNeighbor: j, ospfInterface: j, ospf6Neighbor: j, ospf6Interface: j,
          bgpSummary: j, bgp: j });
      }, proto + ' ' + JSON.stringify(j));
      assertSane(st);
      assert.strictEqual(st.r2_has_full, false, 'adj peer with no data is down');
    });
  });
});

test('collectFromJson: malformed route nexthops do not crash buildState', function () {
  var route = {
    '10.0.1.0/30': [{ prefix: '10.0.1.0/30', protocol: 'connected', selected: true, nexthops: 'eth1' }],
    '2.2.2.2/32': [{ prefix: '2.2.2.2/32', protocol: 'ospf', selected: true, nexthops: { ip: '10.0.1.2' } }],
    '3.3.3.3/32': [{ prefix: '3.3.3.3/32', protocol: 'ospf', selected: true, nexthops: [null] }],
    '4.4.4.4/32': [{ prefix: 4, protocol: 'static', selected: true, nexthops: [{ ip: '10.0.1.2', interfaceName: 'eth1' }] }]
  };
  ['ospf', 'bgp'].forEach(function (proto) {
    var st;
    assert.doesNotThrow(function () {
      st = clab.collectFromJson({ node: 'r1', proto: proto, adjacency: [{ iface: 'eth1', peer: 'r2' }], route: route,
        bgpSummary: { ipv4Unicast: { peers: { '10.0.1.2': { state: 'Established', remoteAs: 65002, localAs: 65001 } } } } });
    }, proto);
    assertSane(st);
  });
});

test('collectFromJson: zero OSPF neighbors with OSPF interfaces up', function () {
  var st = clab.collectFromJson({ node: 'r1', proto: 'ospf', adjacency: [{ iface: 'eth1', peer: 'r2' }],
    ospfNeighbor: { neighbors: {} },
    ospfInterface: { interfaces: { eth1: { ifUp: true, ospfEnabled: true, ipAddress: '10.0.1.1', ipAddressPrefixlen: 30, area: '0.0.0.0', timerMsecs: 10000 } } },
    route: { '10.0.1.0/30': [{ prefix: '10.0.1.0/30', protocol: 'connected', selected: true, nexthops: [{ directlyConnected: true, interfaceName: 'eth1' }] }] } });
  assertSane(st);
  assert.strictEqual(st.full_count, 0);
  assert.strictEqual(st.r2_has_full, false);
  assert.strictEqual(st.r2_neighbor_state, 'Down');
  assert.strictEqual(st.ospf_active_on_interface, true, 'local iface still runs OSPF');
  assert.strictEqual(st.peer_sending_hello, false, 'nothing heard from the peer');
  assert.strictEqual(st.interfaces.eth1.ip, '10.0.1.1/30');
});

test('collectFromJson: zero BGP peers', function () {
  var st = clab.collectFromJson({ node: 'r1', proto: 'bgp', adjacency: [{ iface: 'eth1', peer: 'r2' }],
    bgpSummary: { ipv4Unicast: { peers: {} } }, bgp: { routerId: '1.1.1.1', routes: {} } });
  assertSane(st);
  assert.deepStrictEqual(st.bgp_neighbors, []);
  assert.deepStrictEqual(st.bgp_routes, []);
  assert.strictEqual(st.pfx_rcvd, 0);
  assert.strictEqual(st.is_established, false);
  assert.strictEqual(st.bgp_state, 'Active');
});

test('collectFromJson: interfaces down -> not up, no false Full', function () {
  var st = clab.collectFromJson({ node: 'r1', proto: 'ospf', adjacency: [{ iface: 'eth1', peer: 'r2' }, { iface: 'eth2', peer: 'r3' }],
    interface: {
      eth1: { administrativeStatus: 'down', operationalStatus: 'down', ipAddresses: [{ address: '10.0.1.1/30' }] },
      eth2: { administrativeStatus: 'up', operationalStatus: 'down', ipAddresses: [{ address: '10.0.2.1/30' }] }
    },
    ospfNeighbor: { neighbors: {} }, route: {} });
  assertSane(st);
  assert.strictEqual(st.interfaces.eth1.up, false);
  assert.strictEqual(st.interfaces.eth2.up, false);
  assert.strictEqual(st.r2_has_full, false);
  assert.strictEqual(st.r3_has_full, false);
  assert.strictEqual(st.peer_links.length, 2);
  st.peer_links.forEach(function (l) { assert.strictEqual(l.up, false, l.iface + ' link down'); });
});

test('collectFromJson: IPv6-only lab (OSPFv3 + ipv6 routes, no IPv4 anywhere)', function () {
  var st = clab.collectFromJson({ node: 'r1', proto: 'ospf', adjacency: [{ iface: 'eth1', peer: 'r2' }],
    interface: { eth1: { operationalStatus: 'up', ipAddresses: [{ address: 'fe80::a8c1:abff:fe00:1/64' }, { address: '2001:db8:12::1/64' }] },
                 lo: { operationalStatus: 'up', ipAddresses: [{ address: '2001:db8::1/128' }] } },
    route: {}, ospfNeighbor: {}, ospfInterface: {},
    ospf6Neighbor: { neighbors: [{ neighborId: '2.2.2.2', state: 'Full', interfaceName: 'eth1' }] },
    ospf6Interface: { eth1: { status: 'up', attachedToArea: true, areaId: '0.0.0.0', timerIntervalsConfigHello: 10,
      internetAddress: [{ type: 'inet6', address: 'fe80::a8c1:abff:fe00:1/64' }, { type: 'inet6', address: '2001:db8:12::1/64' }] } },
    route6: {
      '2001:db8:12::/64': [{ prefix: '2001:db8:12::/64', protocol: 'connected', selected: true, nexthops: [{ directlyConnected: true, interfaceName: 'eth1' }] }],
      '2001:db8::2/128': [{ prefix: '2001:db8::2/128', protocol: 'ospf6', selected: true, nexthops: [{ ip: 'fe80::a8c1:abff:fe00:2', interfaceName: 'eth1', fib: true }] }]
    } });
  assertSane(st);
  assert.strictEqual(st.full_count, 1);
  assert.strictEqual(st.r2_has_full, true);
  assert.strictEqual(st.interfaces.eth1.ip, '2001:db8:12::1/64');
  assert.strictEqual(st.route_resolution.resolved, true);
  assert.strictEqual(st.route_resolution.matched_prefix, '2001:db8::2/128');
  assert.strictEqual(st.route_resolution.out_iface, 'eth1');
  assert.ok(st.lsdb_prefixes.some(function (p) { return p.text === '2001:db8::2/128'; }));
});

test('collectFromJson: IPv6-only BGP peer (v6 session address) does not throw', function () {
  var st = clab.collectFromJson({ node: 'r1', proto: 'bgp', adjacency: [{ iface: 'eth1', peer: 'r2' }],
    interface: { eth1: { operationalStatus: 'up', ipAddresses: [{ address: '2001:db8:12::1/64' }] } },
    route6: { '2001:db8:12::/64': [{ prefix: '2001:db8:12::/64', protocol: 'connected', selected: true, nexthops: [{ directlyConnected: true, interfaceName: 'eth1' }] }] },
    bgpSummary: { ipv4Unicast: { peers: { '2001:db8:12::2': { state: 'Established', remoteAs: 65002, localAs: 65001 } } } } });
  assertSane(st);
  assert.strictEqual(st.bgp_neighbors.length, 1);
  assert.strictEqual(st.r2_has_full, true, 'the only adj peer takes the session');
});

test('buildState: called with no options at all', function () {
  assertSane(clab.buildState({}));
});

// ---- frr-collect.js --from-dir: empty / truncated / wrong-typed files --------------------------

function withDir(files, fn) {
  var dir = fs.mkdtempSync(path.join(os.tmpdir(), 'xray-edge-'));
  try {
    Object.keys(files).forEach(function (f) { fs.writeFileSync(path.join(dir, f), files[f]); });
    return fn(dir);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
}

test('frr-collect collectFromDir: empty dir, empty files, truncated json, wrong types', function () {
  var variants = [
    {},
    { 'show_interface.json': '', 'show_ip_route.json': '', 'show_ip_ospf_neighbor.json': '', 'show_ip_ospf_interface.json': '' },
    { 'show_interface.json': '{"eth1": {', 'show_ip_route.json': '{"10.0.0.0/24": [' },
    { 'show_interface.json': 'null', 'show_ip_route.json': '"oops"', 'show_ip_ospf_neighbor.json': '[]', 'show_ip_ospf_interface.json': '42' },
    { 'show_ip_ospf_neighbor.json': '{"neighbors": "none"}', 'show_ip_bgp_summary.json': '{"ipv4Unicast": {"peers": null}}' }
  ];
  variants.forEach(function (files, i) {
    ['ospf', 'bgp', 'auto'].forEach(function (proto) {
      withDir(files, function (dir) {
        var r;
        assert.doesNotThrow(function () { r = frr.collectFromDir({ node: 'r1', fromDir: dir, proto: proto, adjacency: [{ iface: 'eth1', peer: 'r2' }] }); }, 'variant ' + i + ' ' + proto);
        assert.ok(r.proto === 'ospf' || r.proto === 'bgp');
        assertSane(r.state);
        assert.strictEqual(r.state.full_count, 0);
      });
    });
  });
});

test('frr-collect resolveProto: junk show output falls back to ospf', function () {
  JUNK.forEach(function (j) {
    assert.strictEqual(frr.resolveProto(function () { return j; }, 'auto'), 'ospf', JSON.stringify(j));
  });
});
