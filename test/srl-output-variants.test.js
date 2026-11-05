// srl-output-variants.test.js — SR Linux `info from state ... | as json` output that is unusual but valid.
// Run: node --test        (from the repo root; Node >= 18, no dependencies)
//
// Each test/fixtures/srlv/<case>/ holds the files a `--capture` run writes (file names from
// pathToFile), replayed through dirFetch -> buildState, the same way `--from-dir` does. See the README there
// for where each shape comes from.
'use strict';
var test = require('node:test');
var assert = require('node:assert');
var fs = require('fs');
var path = require('path');
var vm = require('vm');
var srl = require('../clab-srl-collect.js');

var DIR = path.join(__dirname, 'fixtures', 'srlv');
function replay(c, adj, proto) {
  var seen = [], f = srl.dirFetch(path.join(DIR, c));
  var st = srl.buildState(function (p) { seen.push(p); return f(p); }, 'r1', adj, proto);
  st._paths = seen; return st;
}
function row(st, ifn) { return st.peer_links.filter(function (r) { return r.iface === ifn; })[0]; }
function rt(st, pfx) { return st.routing_table.filter(function (r) { return r.prefix === pfx; })[0]; }

// AS_PATH length as the Best-Path view counts it (xray-core.js)
var CORE = fs.readFileSync(path.join(__dirname, '..', 'xray-core.js'), 'utf8');
var at = CORE.indexOf('function _xrayAsPathLen(');
var ctx = { String: String }; vm.createContext(ctx);
vm.runInContext(CORE.slice(at, CORE.indexOf('\n}', at) + 2), ctx);

test('every case dir is named by the README and holds only files a --capture run writes', function () {
  var readme = fs.readFileSync(path.join(DIR, 'README.md'), 'utf8');
  var known = ['interface', 'network-instance default protocols bgp neighbor *', 'network-instance default protocols ospf instance default area *',
    'network-instance default route-table ipv4-unicast', 'network-instance default route-table next-hop-group *',
    'network-instance default route-table next-hop *', 'network-instance default bgp-rib afi-safi ipv4-unicast ipv4-unicast local-rib',
    'network-instance default bgp-rib attr-sets'].map(srl.pathToFile).map(function (f) { return f.replace(/\.json$/, ''); });
  fs.readdirSync(DIR).filter(function (d) { return fs.statSync(path.join(DIR, d)).isDirectory(); }).forEach(function (d) {
    assert.ok(readme.indexOf('`' + d + '`') >= 0, d + ' is described in README.md');
    fs.readdirSync(path.join(DIR, d)).forEach(function (f) {
      var j = JSON.parse(fs.readFileSync(path.join(DIR, d, f), 'utf8'));
      assert.ok(j && typeof j === 'object', d + '/' + f + ' is a json object');
      if (d !== 'other-ni') assert.ok(known.some(function (k) { return f.indexOf(k) === 0; }), d + '/' + f + ' is a path the collector reads');
    });
  });
});

// ---- empty containers ----

test('empty containers (OSPF): no address, instance with no area, empty route lists -> not configured, Down', function () {
  var st = replay('empty-ospf', { 'ethernet-1/1.0': 'r2' }, 'ospf');
  assert.deepStrictEqual(st.interfaces, { 'ethernet-1/1.0': { ip: '', up: true }, 'system0.0': { ip: '', up: true } });
  assert.strictEqual(st.ospf_configured, false);
  assert.strictEqual(st.full_count, 0);
  assert.deepStrictEqual(st.routing_table, []);
  assert.deepStrictEqual(st.lsdb_prefixes, []);
  assert.strictEqual(st.route_resolution.resolved, false);
  assert.deepStrictEqual(row(st, 'ethernet-1/1.0'), { iface: 'ethernet-1/1.0', peer: 'r2', up: true, ip: '', full: false, state: 'Down', proto: 'ospf', peer_ip: '' });
  assert.strictEqual(st.r2_neighbor_state, 'None');
});

test('empty containers (OSPF): an area with no interfaces and an empty lsdb -> configured, nothing Full', function () {
  var st = replay('empty-ospf-area', { 'ethernet-1/1.0': 'r2' }, 'ospf');
  assert.strictEqual(st.ospf_configured, true);
  assert.strictEqual(st.has_full, false);
  assert.strictEqual(st.interfaces['ethernet-1/1.0'].ip, '10.0.0.1');
  assert.deepStrictEqual(st.lsdb_prefixes, []);
  assert.strictEqual(st.target_area, undefined, 'area / hello are mirrored only with a Full adjacency');
});

test('empty containers (BGP): bgp with no neighbor list, empty local-rib and attr-sets -> Active, no routes', function () {
  var st = replay('empty-bgp', { 'ethernet-1/1.0': 'r2' }, 'bgp');
  assert.deepStrictEqual(st.bgp_neighbors, []);
  assert.deepStrictEqual(st.bgp_routes, []);
  assert.strictEqual(st.bgp_state, 'Active');
  assert.strictEqual(st.pfx_rcvd, 0);
  assert.strictEqual(st.r2_has_full, false);
  assert.strictEqual(row(st, 'ethernet-1/1.0').proto, 'bgp');
});

// ---- missing optional keys ----

test('missing optional keys (OSPF): defaults for admin-state, area-id, hello-interval, active, next-hop type', function () {
  var st = replay('nokeys-ospf', { 'ethernet-1/1.0': 'r2' }, 'ospf');
  assert.deepStrictEqual(st.interfaces['ethernet-1/1.0'], { ip: '10.0.0.1', up: true });
  assert.strictEqual(st.r2_has_full, true);
  assert.strictEqual(st.target_area, '0');
  assert.strictEqual(st.target_hello, 10);
  assert.deepStrictEqual(rt(st, '2.2.2.2/32'), { prefix: '2.2.2.2/32', out_iface: 'ethernet-1/1.0', next_hop: '10.0.0.2', protocol: 'ospf', selected: true });
  assert.strictEqual(rt(st, '10.0.0.0/30').out_iface, '', 'a route with no next-hop-group has no egress');
  assert.strictEqual(rt(st, '1.1.1.1/32').out_iface, 'system0.0');
});

test('missing optional keys (OSPF LSDB): no link-data reads as /32, a stub link with no link-id is left out', function () {
  var st = replay('nokeys-ospf', { 'ethernet-1/1.0': 'r2' }, 'ospf');
  assert.deepStrictEqual(st.lsdb_prefixes, [
    { text: '2.2.2.2/32', own: false, via: '2.2.2.2' },
    { text: '10.0.0.0/30', own: false, via: '' }]);
  st.lsdb_prefixes.forEach(function (p) { assert.ok(/^\d+(\.\d+){3}\/\d+$/.test(p.text), p.text); });
});

test('missing optional keys (BGP): no peer-as / peer-type / session-state / attr-set values', function () {
  var st = replay('nokeys-bgp', { 'ethernet-1/1.0': 'r2', 'ethernet-1/2.0': 'r3' }, 'bgp');
  assert.deepStrictEqual(st.bgp_neighbors, [
    { ip: '10.0.0.2', remote_as: '-', ibgp: false, state: 'Established' },
    { ip: '10.0.0.6', remote_as: '-', ibgp: false, state: '' }]);
  assert.strictEqual(st.r2_established, true);
  assert.strictEqual(st.r3_established, false);
  var r = st.bgp_routes;
  assert.strictEqual(r.length, 3);
  r.forEach(function (x) { assert.strictEqual(x.as_path, ''); assert.strictEqual(x.local_pref, 100); assert.strictEqual(x.metric, 0); assert.strictEqual(x.origin, 'i'); });
  assert.deepStrictEqual(r.map(function (x) { return [x.next_hop, x.best, x.status]; }), [['10.0.0.2', true, '*>'], ['10.0.0.6', false, '* '], ['10.0.0.2', true, '*>']]);
  assert.strictEqual(st.pfx_rcvd, 2);
});

// ---- network-instances other than default ----

test('other network-instances: only network-instance default is read; vrf / mgmt state is never asked for', function () {
  var st = replay('other-ni', { 'ethernet-1/1.0': 'r2', 'ethernet-1/3.0': 'r9' }, 'ospf');
  st._paths.forEach(function (p) { assert.ok(/^interface |^network-instance default /.test(p), 'read path ' + p); });
  assert.ok(fs.existsSync(path.join(DIR, 'other-ni', srl.pathToFile('network-instance red protocols ospf instance default area *'))));
  assert.strictEqual(st.r2_has_full, true);
  assert.strictEqual(st.r9_has_full, false, 'the Full neighbor in ip-vrf red does not count');
  assert.strictEqual(row(st, 'ethernet-1/3.0').state, 'Down');
  assert.strictEqual(row(st, 'ethernet-1/3.0').ip, '172.16.0.1');
  assert.ok(!rt(st, '0.0.0.0/0'), 'the mgmt default route is not in the table');
});

test('other network-instances: a route leaked from another instance keeps its prefix, no egress from default', function () {
  var st = replay('other-ni', { 'ethernet-1/1.0': 'r2', 'ethernet-1/3.0': 'r9' }, 'ospf');
  assert.deepStrictEqual(rt(st, '172.16.0.0/30'), { prefix: '172.16.0.0/30', out_iface: '', next_hop: undefined, protocol: 'connected', selected: true });
  assert.strictEqual(st.route_resolution.matched_prefix, '2.2.2.2/32');
});

// ---- interfaces with subinterfaces ----

test('subinterfaces (OSPF): VLAN subinterfaces of one port face different peers; lag subinterface admin-down', function () {
  var st = replay('subif-ospf', { 'ethernet-1/1.10': 'r2', 'ethernet-1/1.20': 'r3', 'lag1.0': 'r4' }, 'ospf');
  assert.strictEqual(st.r2_iface, 'ethernet-1/1.10');
  assert.strictEqual(st.r2_has_full, true);
  assert.strictEqual(st.r3_iface, 'ethernet-1/1.20');
  assert.strictEqual(st.r3_neighbor_state, 'ExStart');
  assert.deepStrictEqual(st.interfaces['lag1.0'], { ip: '10.0.30.1', up: false });
  assert.strictEqual(row(st, 'lag1.0').state, 'Down');
  assert.strictEqual(rt(st, '3.3.3.3/32').out_iface, 'ethernet-1/1.20');
  assert.strictEqual(st.route_resolution.out_iface, 'ethernet-1/1.10');
});

test('subinterfaces: the address marked primary is the interface ip, even when a secondary is listed first', function () {
  var st = replay('subif-ospf', { 'ethernet-1/1.10': 'r2', 'ethernet-1/1.20': 'r3' }, 'ospf');
  assert.strictEqual(st.interfaces['ethernet-1/1.20'].ip, '10.0.20.1');
  assert.strictEqual(row(st, 'ethernet-1/1.20').ip, '10.0.20.1');
});

test('subinterfaces (BGP): /31 peers on .100 / .200 map to their own subinterface; indirect next-hop resolves', function () {
  var st = replay('subif-bgp', { 'ethernet-1/1.100': 'r2', 'ethernet-1/1.200': 'r3' }, 'bgp');
  assert.strictEqual(st.r2_iface, 'ethernet-1/1.100');
  assert.strictEqual(st.r2_has_full, true);
  assert.strictEqual(st.r3_iface, 'ethernet-1/1.200');
  assert.strictEqual(st.r3_has_full, false);
  assert.deepStrictEqual(rt(st, '8.8.8.0/24'), { prefix: '8.8.8.0/24', out_iface: 'ethernet-1/1.100', next_hop: '10.1.0.0', protocol: 'bgp', selected: true });
});

// ---- BGP: unusual but valid values ----

test('BGP unusual values: 4-byte ASN, OpenSent / OpenConfirm / Connect, 0 received routes, module-prefixed afi-safi', function () {
  var st = replay('bgp-odd', { 'ethernet-1/1.0': 'r2', 'ethernet-1/2.0': 'r3' }, 'bgp');
  assert.deepStrictEqual(st.bgp_neighbors, [
    { ip: '10.0.0.2', remote_as: 4200000001, ibgp: false, state: 'Established', pfx_rcvd: 0 },
    { ip: '10.0.0.6', remote_as: 65001, ibgp: true, state: 'OpenConfirm' },
    { ip: '10.0.0.10', remote_as: 65003, ibgp: false, state: 'OpenSent' },
    { ip: '10.0.0.14', remote_as: 65004, ibgp: false, state: 'Connect' }]);
  assert.strictEqual(st.r3_has_full, false, 'OpenConfirm is not up');
});

test('BGP unusual values: local-pref 0 and 2^32-1, MED 2^32-1, origin egp / incomplete, default route, own route', function () {
  var st = replay('bgp-odd', { 'ethernet-1/1.0': 'r2', 'ethernet-1/2.0': 'r3' }, 'bgp');
  var r = st.bgp_routes;
  assert.deepStrictEqual(r.map(function (x) { return [x.prefix, x.local_pref, x.metric, x.origin, x.status, x.own]; }), [
    ['203.0.113.0/24', 0, 4294967295, '?', '*>', false],
    ['203.0.113.0/24', 4294967295, 0, 'e', '* ', false],
    ['198.51.100.0/24', 100, 0, 'i', '*>', false],
    ['0.0.0.0/0', 100, 0, 'i', '*>', false],
    ['1.1.1.1/32', 100, 0, 'i', '*>', true]]);
  assert.strictEqual(r[4].next_hop, '');
  assert.strictEqual(st.pfx_rcvd, 3);
});

test('BGP unusual values: AS_SET / confederation segments keep their brackets, so the view counts them right', function () {
  var st = replay('bgp-odd', { 'ethernet-1/1.0': 'r2' }, 'bgp');
  var r = st.bgp_routes;
  assert.strictEqual(r[0].as_path, '4200000001 {65010,65011}');
  assert.strictEqual(r[1].as_path, '(65101 65102) 65002 65100');
  assert.strictEqual(r[2].as_path, '4200000001 4200000001 4200000001', 'a prepended sequence is unchanged');
  assert.strictEqual(r[3].as_path, '[65103,65104] 4200000001');
  assert.strictEqual(ctx._xrayAsPathLen(r[0].as_path), 2, 'AS_SET counts as 1 (RFC 4271 9.1.2.2)');
  assert.strictEqual(ctx._xrayAsPathLen(r[1].as_path), 2, 'confederation sequence does not count (RFC 5065)');
  assert.strictEqual(ctx._xrayAsPathLen(r[2].as_path), 3);
});

test('BGP: as-path segment type spellings (as_set / as-set / AS_SET, module prefix) read the same way', function () {
  ['as_set', 'as-set', 'AS_SET', 'srl_nokia-bgp:as-set'].forEach(function (t) {
    var st = srl.buildState(function (p) {
      if (/local-rib/.test(p)) return { route: [{ prefix: '203.0.113.0/24', neighbor: '10.0.0.2', 'origin-protocol': 'bgp', 'best-route': true, 'attr-id': '1' }] };
      if (/attr-sets/.test(p)) return { 'attr-set': [{ index: '1', 'as-path': { segment: [{ type: 'as-sequence', member: [65002] }, { type: t, member: [65010, 65011] }] } }] };
      return null;
    }, 'r1', {}, 'bgp');
    assert.strictEqual(st.bgp_routes[0].as_path, '65002 {65010,65011}', t);
  });
});

// ---- OSPF: unusual but valid values ----

test('OSPF unusual values: area 0.0.0.10 and 10.255.0.1, hello 1 s, /31 link, LAN with 2-Way DROthers + Loading', function () {
  var st = replay('ospf-odd', { 'ethernet-1/1.0': 'r2', 'ethernet-1/2.0': 'r3' }, 'ospf');
  assert.strictEqual(st.target_area, '10');
  assert.strictEqual(st.target_hello, 1);
  assert.strictEqual(st.interfaces['ethernet-1/1.0'].ip, '10.0.0.0');
  assert.strictEqual(st.r2_has_full, true);
  assert.strictEqual(st.r3_neighbor_state, 'Loading', 'furthest state on the LAN');
  assert.strictEqual(row(st, 'ethernet-1/2.0').state, 'Loading');
  assert.deepStrictEqual(st.lsdb_prefixes, [
    { text: '1.1.1.1/32', own: true, via: '1.1.1.1' },
    { text: '10.0.0.0/31', own: true, via: '1.1.1.1' },
    { text: '2.2.2.2/32', own: false, via: '2.2.2.2' }], 'transit links and network-LSAs are not stub prefixes');
});

test('route-type with a YANG module prefix reads as the bare name (srl_nokia-common:ospfv2 -> ospf)', function () {
  var st = replay('ospf-odd', { 'ethernet-1/1.0': 'r2' }, 'ospf');
  assert.strictEqual(rt(st, '2.2.2.2/32').protocol, 'ospf');
  assert.strictEqual(st.route_resolution.protocol, 'ospf');
  assert.strictEqual(st.has_ospf_route, true);
});

test('bundled real srl capture: replays the same as before (no change for output that already parsed)', function () {
  var st = srl.buildState(srl.dirFetch(path.join(__dirname, '..', 'fixtures', 'srl-collect-sample', 'r1')), 'r1', { 'ethernet-1/1.0': 'r2' }, 'ospf');
  assert.deepStrictEqual(st.interfaces, { 'ethernet-1/1.0': { ip: '10.0.0.1', up: true }, 'system0.0': { ip: '1.1.1.1', up: true } });
  assert.deepStrictEqual(rt(st, '2.2.2.2/32'), { prefix: '2.2.2.2/32', out_iface: 'ethernet-1/1.0', next_hop: '10.0.0.2', protocol: 'ospf', selected: true });
  assert.strictEqual(st.route_resolution.matched_prefix, '2.2.2.2/32');
  assert.strictEqual(st.r2_has_full, true);
});
