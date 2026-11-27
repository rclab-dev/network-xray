// unread-parts.test.js — a router that is read while one part of it is not (no answer for that command, or an answer in a
// shape this version does not read) says so: the collector marks the part (nx_unread_parts) and every answer about it says
// "not read" instead of "none" (an SR Linux whose answers were not understood once looked like a healthy, empty router).
// Run: node --test        (from the repo root; Node >= 18, no dependencies)
'use strict';
var test = require('node:test');
var assert = require('node:assert');
var path = require('path');
var srl = require('../clab-srl-collect.js');
var Q = require('../scripts/xray-query.js');

var RW = path.join(__dirname, 'fixtures', 'srlv', 'root-wrap');
var ADJ = { 'ethernet-1/1.0': 'r2', 'ethernet-1/2.0': 'r3' };
function build(override) {
  var f = srl.dirFetch(RW);
  return srl.buildState(function (p) { return Object.prototype.hasOwnProperty.call(override, p) ? override[p] : f(p); }, 'r1', ADJ, 'bgp');
}

test('collector: every part read -> no nx_unread_parts', function () {
  assert.strictEqual(build({}).nx_unread_parts, undefined);
});

test('collector: no answer for the route table -> routes: noanswer; an unknown shape for the neighbors -> bgp_neighbors: shape', function () {
  var st = build({
    'network-instance default route-table ipv4-unicast': null,
    'network-instance default protocols bgp neighbor *': { 'some-new-root': { neighbor: [{ 'peer-address': '192.0.2.2', 'session-state': 'established' }] } }
  });
  assert.deepStrictEqual(st.nx_unread_parts, { routes: 'noanswer', bgp_neighbors: 'shape' });
  assert.deepStrictEqual(st.bgp_neighbors, [], 'nothing is guessed from a shape it does not read');
});

test('collector: {} and leaves only are "none there", not "not read"', function () {
  var st = build({ 'network-instance default protocols bgp neighbor *': {}, 'network-instance default bgp-rib afi-safi ipv4-unicast ipv4-unicast local-rib': { 'admin-state': 'enable' } });
  assert.strictEqual(st.nx_unread_parts, undefined);
});

function states() {
  var r1 = build({ 'network-instance default route-table ipv4-unicast': null, 'network-instance default protocols bgp neighbor *': { x: { y: [] } } });
  var r2 = build({}); r2.target_node = 'r2';
  return { r1: r1, r2: r2 };
}

test('lab_state (summarize): not_read names the router and the part; counts are of what was read', function () {
  var sm = Q.summarize(states());
  assert.deepStrictEqual(sm.not_read.map(function (x) { return x.router + ' ' + x.part + ' ' + x.why; }), ['r1 bgp_neighbors shape', 'r1 routes noanswer']);
  assert.ok(sm.not_read.every(function (x) { return /not read, not empty/.test(x.note); }));
  var n1 = sm.nodes.filter(function (n) { return n.name === 'r1'; })[0];
  assert.deepStrictEqual(n1.unread_parts, { bgp_neighbors: 'shape', routes: 'noanswer' });
  assert.ok(!('not_read' in Q.summarize({ r2: states().r2 })), 'no not_read when everything was read');
});

test('list_routers: a part that was not read has a null count, not 0', function () {
  var r1 = Q.listRouters(states()).routers.filter(function (r) { return r.name === 'r1'; })[0];
  assert.strictEqual(r1.counts.bgp_neighbors, null);
  assert.strictEqual(r1.counts.routes, null);
  assert.strictEqual(typeof r1.counts.bgp_routes, 'number');
});

test('bgp_neighbors / route_lookup: not_read for the router asked about; another router is not mentioned', function () {
  var st = states();
  assert.strictEqual(Q.bgpNeighbors(st, 'r1').not_read[0].part, 'bgp_neighbors');
  assert.ok(!('not_read' in Q.bgpNeighbors(st, 'r2')));
  var rl = Q.routeLookup(st, 'r1', '198.51.100.2');
  assert.deepStrictEqual(rl.not_read.map(function (x) { return x.part; }), ['routes']);
});

test('the text table says it once: "-" in the count and a not read line', function () {
  var t = Q.stateTable(states(), false);
  t = Array.isArray(t) ? t.join('\n') : String(t);
  assert.ok(/not read: r1 routes - no answer/.test(t), t);
  assert.ok(/not read: r1 bgp_neighbors - the router answered in a shape/.test(t), t);
});
