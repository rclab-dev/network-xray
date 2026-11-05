// parser-edge-srl.test.js — malformed / unusual SR Linux `info from state ... | as json` input must never
// make clab-srl-collect.js throw.
// Run: node --test        (from the repo root; Node >= 18, no dependencies)
//
// Feeds empty output, non-JSON text, missing keys, wrong types (string / number / null / array instead of
// object), zero BGP/OSPF neighbors, admin-down interfaces, IPv6-only addresses and very long names through
// buildState (with an injected fetch) and through --from-dir replay files; each result must be a sane state.
'use strict';
var test = require('node:test');
var assert = require('node:assert');
var fs = require('fs');
var os = require('os');
var path = require('path');
var cp = require('child_process');
var srl = require('../clab-srl-collect.js');

var SCRIPT = path.join(__dirname, '..', 'clab-srl-collect.js');
// values sr_cli (or a broken docker exec / a truncated capture file) could hand us in place of a json object
var JUNK = [undefined, null, '', 'not json', 0, 42, true, false, [], [null], [1, 'x'], {}, { x: null }];
var ADJ = { 'ethernet-1/1.0': 'r2', 'ethernet-1/2.0': 'r3' };

// fetch stub: the first key that is a substring of the requested state path wins (as in --self-test)
function fx(map) { return function (p) { for (var k in map) { if (p.indexOf(k) >= 0) return map[k]; } return null; }; }

// the invariants every produced state must keep, whatever the input
function assertSane(st, proto, adj) {
  adj = adj || ADJ;
  assert.ok(st && typeof st === 'object', 'state is an object');
  assert.strictEqual(st.success, true);
  assert.strictEqual(st.target_node, 'r1');
  assert.strictEqual(st.protocol, proto === 'bgp' ? 'bgp' : 'ospf');
  assert.ok(st.interfaces && typeof st.interfaces === 'object' && !Array.isArray(st.interfaces), 'interfaces is an object');
  Object.keys(st.interfaces).forEach(function (k) {
    assert.strictEqual(typeof st.interfaces[k].up, 'boolean', 'interfaces.' + k + '.up is boolean');
    assert.strictEqual(typeof st.interfaces[k].ip, 'string', 'interfaces.' + k + '.ip is string');
  });
  assert.ok(st.interfaces['system0.0'], 'loopback always present');
  assert.strictEqual(typeof st.full_count, 'number');
  assert.ok(st.full_count >= 0);
  assert.strictEqual(typeof st.has_full, 'boolean');
  assert.strictEqual(typeof st.neighbor_state, 'string');
  assert.strictEqual(typeof st.wan_iface, 'string');
  assert.strictEqual(typeof st.lan_iface, 'string');
  assert.strictEqual(typeof st.peer_node, 'string');
  assert.ok(st.route_resolution && typeof st.route_resolution.resolved === 'boolean', 'route_resolution.resolved is boolean');
  assert.ok(Array.isArray(st.routing_table), 'routing_table is an array');
  st.routing_table.forEach(function (r) {
    assert.strictEqual(typeof r.prefix, 'string', 'routing_table prefix is string');
    assert.strictEqual(typeof r.protocol, 'string', 'routing_table protocol is string');
    assert.strictEqual(typeof r.out_iface, 'string', 'routing_table out_iface is string');
  });
  Object.keys(adj).forEach(function (ifn) {
    var p = adj[ifn];
    assert.strictEqual(typeof st[p + '_iface'], 'string', p + '_iface');
    assert.strictEqual(typeof st[p + '_has_full'], 'boolean', p + '_has_full');
  });
  if (Object.keys(adj).length) assert.strictEqual(st.peer_links.length, Object.keys(adj).length, 'one peer_links row per adj link');
  if (proto === 'bgp') {
    assert.ok(Array.isArray(st.bgp_neighbors), 'bgp_neighbors is an array');
    st.bgp_neighbors.forEach(function (n) { assert.strictEqual(typeof n.state, 'string', 'bgp neighbor state is string'); });
    assert.ok(Array.isArray(st.bgp_routes), 'bgp_routes is an array');
    st.bgp_routes.forEach(function (r) { assert.strictEqual(typeof r.prefix, 'string'); assert.strictEqual(typeof r.as_path, 'string'); });
    assert.strictEqual(typeof st.pfx_rcvd, 'number');
  } else {
    assert.strictEqual(typeof st.ospf_configured, 'boolean');
    assert.ok(Array.isArray(st.lsdb_prefixes), 'lsdb_prefixes is an array');
    st.lsdb_prefixes.forEach(function (p) { assert.strictEqual(typeof p.text, 'string'); });
  }
  assert.doesNotThrow(function () { JSON.stringify(st); }, 'state is JSON-serializable');
}

function build(fetch, proto, adj) {
  var st;
  assert.doesNotThrow(function () { st = srl.buildState(fetch, 'r1', adj || ADJ, proto); });
  assertSane(st, proto, adj);
  return st;
}

// ---- every state path returns the same junk ----------------------------------------------------

test('buildState: junk for every state path -> empty, sane state', function () {
  JUNK.forEach(function (j) {
    ['ospf', 'bgp'].forEach(function (proto) {
      var st = build(function () { return j; }, proto);
      assert.strictEqual(st.full_count, 0, JSON.stringify(j) + ' ' + proto);
      assert.strictEqual(st.has_full, false);
      assert.strictEqual(st.route_resolution.resolved, false);
      assert.strictEqual(st.ping_ok, false);
      if (proto === 'ospf') assert.strictEqual(st.ospf_configured, false, 'no area -> ospf not configured');
    });
  });
});

test('buildState: no adjacency at all (zero links)', function () {
  ['ospf', 'bgp'].forEach(function (proto) {
    var st = build(function () { return null; }, proto, {});
    assert.strictEqual(st.peer_node, '');
    assert.strictEqual(st.wan_iface, 'system0.0');
    assert.strictEqual(st.peer_links, undefined);
  });
});

// ---- each container key replaced by junk (list fields that are not lists, entries that are not objects)

var LISTISH = ['x', 7, true, {}, { a: 1 }, null, [null], [null, 'x', 3, []]];

test('interfaces: wrong-typed ipv4 subinterface output', function () {
  var variants = [{ address: 'x' }, { address: 5 }, { address: {} }, { address: [null] }, { address: [{}] },
    { address: [{ 'ip-prefix': null }] }, { address: [{ 'ip-prefix': 12345 }] }, { address: [{ 'ip-prefix': { a: 1 } }] },
    { address: [{ 'ip-prefix': ['10.0.0.1/30'] }] }, { 'admin-state': 7 }];
  variants.forEach(function (v) {
    var st = build(fx({ 'subinterface 0 ipv4': v }), 'ospf');
    assert.strictEqual(st.interfaces['ethernet-1/1.0'].up, true, JSON.stringify(v));
    assert.ok(/^(|\d+(\.\d+){3})$/.test(st.interfaces['ethernet-1/1.0'].ip), 'ip is empty or dotted: ' + JSON.stringify(st.interfaces['ethernet-1/1.0'].ip));
  });
});

test('ospf: wrong-typed area / interface / neighbor / lsdb lists', function () {
  var shapes = [];
  LISTISH.forEach(function (j) {
    shapes.push({ area: j });
    shapes.push({ area: [{ interface: j }] });
    shapes.push({ area: [{ interface: [{ 'interface-name': 'ethernet-1/1.0', neighbor: j }] }] });
    shapes.push({ area: [{ 'area-id': j, interface: [{ 'interface-name': j, 'hello-interval': j, neighbor: [{ 'adjacency-state': 'full' }] }] }] });
    shapes.push({ area: [{ lsdb: j }] });
    shapes.push({ area: [{ lsdb: { 'lsa-types': { 'lsa-type': j } } }] });
    shapes.push({ area: [{ lsdb: { 'lsa-types': { 'lsa-type': [{ type: 'router-lsa', lsas: { lsa: j } }] } } }] });
    shapes.push({ area: [{ lsdb: { 'lsa-types': { 'lsa-type': [{ type: 'router-lsa', lsas: { lsa: [{ 'router-lsa': { links: j } }] } }] } } }] });
  });
  shapes.forEach(function (oa) {
    var st = build(fx({ 'protocols ospf': oa }), 'ospf');
    assert.ok(st.full_count === 0 || st.full_count === 1, JSON.stringify(oa));
  });
});

test('ospf: full adjacency with junk hello / area still sane', function () {
  var st = build(fx({ 'protocols ospf': { area: [null, { interface: [{ 'interface-name': 'ethernet-1/1.0', neighbor: [{ 'adjacency-state': 'full' }] }] }] } }), 'ospf');
  assert.strictEqual(st.r2_has_full, true);
  assert.strictEqual(st.r3_has_full, false);
});

test('ospf: zero neighbors -> configured but nothing Full', function () {
  var st = build(fx({ 'protocols ospf': { area: [{ 'area-id': '0.0.0.0', interface: [{ 'interface-name': 'ethernet-1/1.0', neighbor: [] }, { 'interface-name': 'ethernet-1/2.0' }] }] } }), 'ospf');
  assert.strictEqual(st.ospf_configured, true);
  assert.strictEqual(st.full_count, 0);
  assert.strictEqual(st.neighbor_state, 'None');
  assert.strictEqual(st.r2_neighbor_state, 'None');
  assert.deepStrictEqual(st.peer_links.map(function (r) { return r.state; }), ['Down', 'Down']);
});

test('bgp: wrong-typed neighbor list / entries / afi-safi', function () {
  var shapes = [];
  LISTISH.forEach(function (j) {
    shapes.push({ neighbor: j });
    shapes.push({ neighbor: [{ 'peer-address': '10.1.0.2', 'session-state': 'established', 'afi-safi': j }] });
    shapes.push({ neighbor: [{ 'peer-address': j, 'session-state': j, 'admin-state': j, 'peer-group': j, 'peer-as': j }] });
  });
  var fetchIf = { 'ethernet-1/1 subinterface 0 ipv4': { address: [{ 'ip-prefix': '10.1.0.1/30' }] } };
  shapes.forEach(function (bn) {
    fetchIf['bgp neighbor'] = bn;
    var st = build(fx(fetchIf), 'bgp');
    st.bgp_neighbors.forEach(function (n) { assert.strictEqual(typeof n.ip, 'string', 'bgp neighbor ip is string'); });
  });
});

test('bgp: zero neighbors -> Active, nothing established', function () {
  var st = build(fx({ 'bgp neighbor': { neighbor: [] } }), 'bgp');
  assert.deepStrictEqual(st.bgp_neighbors, []);
  assert.strictEqual(st.is_established, false);
  assert.strictEqual(st.bgp_state, 'Active');
  assert.strictEqual(st.pfx_rcvd, 0);
});

test('bgp: wrong-typed local-rib / attr-sets / as-path segments', function () {
  var shapes = [];
  LISTISH.forEach(function (j) {
    shapes.push({ rib: { route: j }, attr: null });
    shapes.push({ rib: null, attr: { 'attr-set': j } });
    shapes.push({ rib: { route: [{ prefix: '8.8.8.0/24', 'attr-id': '5' }] }, attr: { 'attr-set': [{ index: '5', 'as-path': j }] } });
    shapes.push({ rib: { route: [{ prefix: '8.8.8.0/24', 'attr-id': '5' }] }, attr: { 'attr-set': [{ index: '5', 'as-path': { segment: j } }] } });
    shapes.push({ rib: { route: [{ prefix: '8.8.8.0/24', 'attr-id': '5' }] }, attr: { 'attr-set': [{ index: '5', 'as-path': { segment: [{ member: j }] } }] } });
    shapes.push({ rib: { route: [{ prefix: j, 'attr-id': j, neighbor: j }] }, attr: { 'attr-set': [{ index: j, origin: j, 'next-hop': j }] } });
  });
  shapes.forEach(function (s) {
    build(fx({ 'local-rib': s.rib, 'attr-sets': s.attr }), 'bgp');
  });
});

test('routes: wrong-typed route / next-hop-group / next-hop lists', function () {
  var shapes = [];
  LISTISH.forEach(function (j) {
    shapes.push({ rt: { route: j } });
    shapes.push({ rt: { route: [{ 'ipv4-prefix': j, 'route-type': j, 'next-hop-group': j }] } });
    shapes.push({ nhg: { 'next-hop-group': j } });
    shapes.push({ nhg: { 'next-hop-group': [{ index: 'g1', 'next-hop': j }] } });
    shapes.push({ nh: { 'next-hop': j } });
    shapes.push({ nh: { 'next-hop': [{ index: 'n1', 'ip-address': j, subinterface: j }] } });
  });
  shapes.forEach(function (s) {
    ['ospf', 'bgp'].forEach(function (proto) {
      build(fx({
        'route-table ipv4-unicast': s.rt || { route: [{ 'ipv4-prefix': '2.2.2.2/32', 'route-type': 'ospfv2', 'next-hop-group': 'g1' }] },
        'next-hop-group': s.nhg || { 'next-hop-group': [{ index: 'g1', 'next-hop': [{ 'next-hop': 'n1' }] }] },
        'next-hop *': s.nh || { 'next-hop': [{ index: 'n1', 'ip-address': '10.0.0.2', subinterface: 'ethernet-1/1.0' }] }
      }), proto);
    });
  });
});

test('routes: a route-type that names an Object.prototype member is not a protocol', function () {
  var st = build(fx({ 'route-table ipv4-unicast': { route: [
    { 'ipv4-prefix': '9.9.9.0/24', 'route-type': 'constructor' }, { 'ipv4-prefix': '9.9.8.0/24', 'route-type': 'toString' }] } }), 'ospf');
  assert.deepStrictEqual(st.routing_table.map(function (r) { return r.protocol; }), ['constructor', 'toString']);
});

// ---- realistic-but-unusual valid shapes ------------------------------------------------------

test('admin-down interface: up=false, adjacency down', function () {
  var st = build(fx({
    'ethernet-1/1 subinterface 0 ipv4': { 'admin-state': 'disable', address: [{ 'ip-prefix': '10.0.0.1/30' }] },
    'protocols ospf': { area: [{ interface: [{ 'interface-name': 'ethernet-1/1.0', neighbor: [] }] }] }
  }), 'ospf');
  assert.strictEqual(st.interfaces['ethernet-1/1.0'].up, false);
  assert.strictEqual(st.interfaces['ethernet-1/1.0'].ip, '10.0.0.1');
  assert.strictEqual(st.peer_links[0].up, false);
  assert.strictEqual(st.r2_has_full, false);
});

test('IPv6-only lab: no ipv4 address, v6 BGP peers and v6 next-hops do not throw', function () {
  var st = build(fx({
    'subinterface 0 ipv4': { 'admin-state': 'enable' },   // ipv4 container present, no address
    'bgp neighbor': { neighbor: [{ 'peer-address': '2001:db8:12::2', 'session-state': 'established', 'peer-as': 65002 }] },
    'local-rib': { route: [{ prefix: '2001:db8::2/128', neighbor: '2001:db8:12::2', 'origin-protocol': 'bgp', 'best-route': true, 'attr-id': '1' }] },
    'attr-sets': { 'attr-set': [{ index: '1', 'next-hop': '2001:db8:12::2' }] },
    'next-hop-group': { 'next-hop-group': [{ index: 'g1', 'next-hop': [{ 'next-hop': 'n1' }] }] },
    'next-hop *': { 'next-hop': [{ index: 'n1', 'ip-address': '2001:db8:12::2' }] },
    'route-table ipv4-unicast': { route: [{ 'ipv4-prefix': '2001:db8::/64', 'route-type': 'bgp', 'next-hop-group': 'g1' }] }
  }), 'bgp');
  assert.strictEqual(st.interfaces['ethernet-1/1.0'].ip, '');
  assert.strictEqual(st.bgp_neighbors.length, 1);
  assert.strictEqual(st.bgp_neighbors[0].state, 'Established');
  assert.strictEqual(st.r2_has_full, false, 'no v4 subnet to map the v6 peer to an adj iface');
  assert.strictEqual(st.bgp_routes[0].next_hop, '2001:db8:12::2');
});

test('very long interface and peer names', function () {
  var longIf = 'ethernet-1/' + new Array(400).join('9') + '.0', longPeer = 'r' + new Array(2000).join('x');
  var adj = {}; adj[longIf] = longPeer;
  var oa = { area: [{ interface: [{ 'interface-name': longIf, neighbor: [{ 'adjacency-state': 'full' }] }] }] };
  var st = build(fx({ 'protocols ospf': oa }), 'ospf', adj);
  assert.strictEqual(st[longPeer + '_has_full'], true);
  assert.strictEqual(st.peer_node, longPeer);
  // --from-dir: the long path maps to a filename the OS rejects -> read as "no data", never a throw
  withDir({}, function (dir) {
    var none = build(srl.dirFetch(dir), 'ospf', adj);
    assert.strictEqual(none.full_count, 0);
  });
});

test('helpers: junk in, no throw', function () {
  JUNK.concat(['10.0.0.1', '10.0.0.0/33', '2001:db8::/64', '1.2.3']).forEach(function (j) {
    assert.doesNotThrow(function () {
      srl.sameNet24(j, '10.0.0.2'); srl.sameNet24('10.0.0.0/30', j);
      assert.strictEqual(typeof srl.maskToPfx(j), 'number');
      assert.strictEqual(typeof srl.normArea(j), 'string');
      assert.strictEqual(typeof srl.pathToFile(j), 'string');
    }, JSON.stringify(j));
  });
});

// ---- --from-dir replay: empty / non-JSON / truncated / wrong-typed capture files ---------------

function withDir(files, fn) {
  var dir = fs.mkdtempSync(path.join(os.tmpdir(), 'xray-srl-edge-'));
  try {
    Object.keys(files).forEach(function (f) { fs.writeFileSync(path.join(dir, f), files[f]); });
    return fn(dir);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
}

var F = {
  if1: 'interface_ethernet_1_1_subinterface_0_ipv4.json',
  lo: 'interface_system0_subinterface_0_ipv4.json',
  ospf: 'network_instance_default_protocols_ospf_instance_default_area.json',
  bgp: 'network_instance_default_protocols_bgp_neighbor.json',
  rt: 'network_instance_default_route_table_ipv4_unicast.json',
  nh: 'network_instance_default_route_table_next_hop.json',
  nhg: 'network_instance_default_route_table_next_hop_group.json'
};

test('dirFetch / buildState: empty dir, empty files, non-JSON text, truncated json, wrong types', function () {
  function all(content) { var o = {}; Object.keys(F).forEach(function (k) { o[F[k]] = content; }); return o; }
  var variants = [{}, all(''), all('Error: Parsing error: Unknown token'), all('{"area": ['), all('null'), all('"oops"'), all('[]'), all('42'),
    all('{"area": "x", "neighbor": {}, "route": 7, "next-hop": [null], "next-hop-group": "g", "address": 1}')];
  variants.forEach(function (files, i) {
    ['ospf', 'bgp'].forEach(function (proto) {
      withDir(files, function (dir) {
        var st = build(srl.dirFetch(dir), proto, { 'ethernet-1/1.0': 'r2' });
        assert.strictEqual(st.full_count, 0, 'variant ' + i + ' ' + proto);
      });
    });
  });
});

test('CLI --from-dir on a junk capture still prints a sane state', function () {
  withDir({ 'interface_system0_subinterface_0_ipv4.json': 'not json', 'network_instance_default_protocols_ospf_instance_default_area.json': '{"area": [null, 3]}' }, function (dir) {
    var o = cp.execFileSync(process.execPath, [SCRIPT, '--from-dir', dir, '--node', 'r1', '--adj', 'ethernet-1/1.0:r2'], { encoding: 'utf8' });
    assertSane(JSON.parse(o), 'ospf', { 'ethernet-1/1.0': 'r2' });
  });
});

// ---- valid input keeps its exact meaning --------------------------------------------------------

test('bundled real srl capture replays unchanged (r1 OSPF Full to r2)', function () {
  var st = build(srl.dirFetch(path.join(__dirname, '..', 'fixtures', 'srl-collect-sample', 'r1')), 'ospf', { 'ethernet-1/1.0': 'r2' });
  assert.strictEqual(st.full_count, 1);
  assert.strictEqual(st.r2_has_full, true);
  assert.strictEqual(st.route_resolution.matched_prefix, '2.2.2.2/32');
  assert.strictEqual(st.route_resolution.next_hop, '10.0.0.2');
});

test('require() exports the mapping without running the CLI; --self-test still passes', function () {
  assert.strictEqual(typeof srl.buildState, 'function');
  var o = cp.execFileSync(process.execPath, [SCRIPT, '--self-test'], { encoding: 'utf8' });
  assert.ok(/SUMMARY: (\d+)\/\1 PASS/.test(o), o.slice(-200));
});
