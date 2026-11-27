// srl-root-wrap.test.js — SR Linux answers `info from state <path> | as json` in two shapes:
//   26.x: the node the path names        {"neighbor":[...]}
//   24.x: the whole tree from the root   {"network-instance":[{"name":"default","protocols":{"bgp":{"neighbor":[...]}}}]}
// Both must build the same state (a root-wrapped answer once read as an empty router: no BGP, no OSPF, no routes).
// Run: node --test        (from the repo root; Node >= 18, no dependencies)
'use strict';
var test = require('node:test');
var assert = require('node:assert');
var fs = require('fs');
var path = require('path');
var srl = require('../clab-srl-collect.js');

var SRLV = path.join(__dirname, 'fixtures', 'srlv');
var SAMPLE = path.join(__dirname, '..', 'fixtures', 'srl-collect-sample', 'r1');

// wrap a 26.x answer the way 24.x prints it: every path word becomes a container, a keyed list gets one
// entry with its key leaf, and `<list> *` at the end stays the list the answer already holds.
var KEY = { interface: 'name', subinterface: 'index', 'network-instance': 'name', instance: 'name', 'afi-safi': 'afi-safi-name' };
function wrap(p, j) {
  var t = p.split(' ');
  function build(i) {
    if (i >= t.length || t[i + 1] === '*') return j;
    var o = {};
    if (KEY[t[i]]) { var e = {}; e[KEY[t[i]]] = t[i] === 'subinterface' ? Number(t[i + 1]) : t[i + 1]; o[t[i]] = [Object.assign(e, build(i + 2))]; }
    else o[t[i]] = build(i + 1);
    return o;
  }
  return build(0);
}
function both(dir, adj, proto) {
  var f = srl.dirFetch(dir);
  var flat = srl.buildState(f, 'r1', adj, proto);
  var wrapped = srl.buildState(function (p) { var j = f(p); return j == null ? j : wrap(p, j); }, 'r1', adj, proto);
  return [flat, wrapped];
}

test('every recorded case builds the same state from the 24.x root-wrapped shape', function () {
  var cases = [
    [SAMPLE, { 'ethernet-1/1.0': 'r2' }, 'ospf'],
    [path.join(SRLV, 'bgp-odd'), { 'ethernet-1/1.0': 'r2', 'ethernet-1/2.0': 'r3' }, 'bgp'],
    [path.join(SRLV, 'ospf-odd'), { 'ethernet-1/1.0': 'r2', 'ethernet-1/2.0': 'r3' }, 'ospf'],
    [path.join(SRLV, 'subif-bgp'), { 'ethernet-1/1.100': 'r2', 'ethernet-1/1.200': 'r3' }, 'bgp'],
    [path.join(SRLV, 'subif-ospf'), { 'ethernet-1/1.10': 'r2', 'ethernet-1/1.20': 'r3', 'lag1.0': 'r4' }, 'ospf'],
    [path.join(SRLV, 'empty-bgp'), { 'ethernet-1/1.0': 'r2' }, 'bgp'],
    [path.join(SRLV, 'empty-ospf'), { 'ethernet-1/1.0': 'r2' }, 'ospf'],
  ];
  cases.forEach(function (c) {
    var s = both(c[0], c[1], c[2]);
    assert.deepStrictEqual(s[1], s[0], path.basename(c[0]) + ': wrapped == flat');
  });
  // the check is not empty: the recorded cases do have neighbors / routes
  var bgp = both(path.join(SRLV, 'bgp-odd'), { 'ethernet-1/1.0': 'r2' }, 'bgp')[1];
  assert.ok(bgp.bgp_neighbors.length > 0 && bgp.bgp_routes.length > 0, 'bgp-odd wrapped: neighbors and routes are read');
});

test('hand-written 24.x answers (root-wrapped, a module prefix on a key) read as a router with BGP, not an empty one', function () {
  var st = srl.buildState(srl.dirFetch(path.join(SRLV, 'root-wrap')), 'r1', { 'ethernet-1/1.0': 'r2', 'ethernet-1/2.0': 'r3' }, 'bgp');
  assert.strictEqual(st.interfaces['ethernet-1/1.0'].ip, '192.0.2.1');
  assert.strictEqual(st.interfaces['system0.0'].ip, '198.51.100.1');
  assert.strictEqual(st.bgp_neighbors.length, 2);
  var up = st.bgp_neighbors.filter(function (n) { return /establ/i.test(n.state || n.session_state || ''); });
  assert.strictEqual(up.length, 1, 'one established neighbor');
  assert.strictEqual(st.r2_has_full, true, 'r2 (192.0.2.2) is up');
  assert.strictEqual(st.r3_has_full, false, 'r3 (192.0.2.6) is not');
  var r = st.routing_table.filter(function (x) { return x.prefix === '198.51.100.2/32'; })[0];
  assert.ok(r && r.next_hop === '192.0.2.2', 'the BGP route resolves its next hop through next-hop-group / next-hop');
  assert.strictEqual(st.bgp_routes.length, 1);
});

test('nxUnwrap: an answer already in the 26.x shape is returned unchanged; a path missing from a wrapped answer reads as empty', function () {
  var flat = { neighbor: [{ 'peer-address': '192.0.2.2' }] };
  assert.strictEqual(srl.nxUnwrap('network-instance default protocols bgp neighbor *', flat), flat);
  assert.deepStrictEqual(srl.nxUnwrap('network-instance default protocols bgp neighbor *', { 'network-instance': [{ name: 'default', protocols: {} }] }), {});
  assert.deepStrictEqual(srl.nxUnwrap('network-instance default protocols bgp neighbor *', { 'network-instance': [{ name: 'red', protocols: { bgp: { neighbor: [{}] } } }] }), {}, 'another network-instance is not default');
  assert.deepStrictEqual(srl.nxUnwrap('interface ethernet-1/1 subinterface 0 ipv4', { interface: [{ name: 'ethernet-1/1', subinterface: [{ index: 0, ipv4: { address: [] } }] }] }), { address: [] });
});
