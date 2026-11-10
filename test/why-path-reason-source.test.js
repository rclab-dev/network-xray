// why-path-reason-source.test.js — `why` and `why_path` (scripts/xray-query.js) agree on the stored best-path reason and
// say where it came from: reason_source "device" (FRR reported it), "derived" (the IOS-XE collector worked it out from the
// printed columns), "comparison" (network-xray compared the attributes in the data), or null.
// Run: node --test        (from the repo root; Node >= 18, no dependencies)
'use strict';
var test = require('node:test');
var assert = require('node:assert');
var path = require('path');
var q = require('../scripts/xray-query.js');

var Q15 = path.join(__dirname, 'fixtures', 'iosxe-q15');

function state(nos, routes) {
  var s = { target_node: 'r1', interfaces: {}, bgp_routes: routes };
  if (nos) s.nos = nos;
  return { r1: s };
}
function row(o) {
  return Object.assign({ prefix: '203.0.113.0', prefixlen: 24, next_hop: '10.0.0.1', as_path: '65002', local_pref: 100, weight: 0, metric: 0, origin: 'IGP', best: false, status: '* ' }, o);
}

test('IOS-XE: why_path returns the stored reason as "derived" and keeps the comparison (same reason as why)', function () {
  var st = q.loadStates(Q15);
  var w = q.why(st, 'r1', '8.8.8.0/24'), p = q.whyPath(st, 'r1', '8.8.8.0/24');
  assert.strictEqual(w.reason, 'First path received');
  assert.match(w.reason_source, /IOS-XE/);
  assert.strictEqual(p.deciding_step, 'First path received', 'the same reason the CLI why gives');
  assert.strictEqual(p.reason_source, 'derived');
  assert.strictEqual(p.comparison, 'Only path');
});

test('IOS-XE with two paths: the derived step and the comparison are both given', function () {
  var st = state('ios-xe', [
    row({ next_hop: '10.0.0.1', as_path: '65002', best: true, status: '*>', reason: 'AS Path' }),
    row({ next_hop: '10.0.0.2', as_path: '65003 65010' })
  ]);
  var p = q.whyPath(st, 'r1', '203.0.113.0/24');
  assert.strictEqual(p.deciding_step, 'AS Path');
  assert.strictEqual(p.reason_source, 'derived');
  assert.strictEqual(p.comparison, 'AS-Path');
});

test('FRR: a reason stored as sel_reason is read by why and why_path alike', function () {
  var st = state(undefined, [
    row({ next_hop: '10.0.0.1', best: true, status: '*>', sel_reason: 'Older Path' }),
    row({ next_hop: '10.0.0.2' })
  ]);
  var w = q.why(st, 'r1', '203.0.113.0/24'), p = q.whyPath(st, 'r1', '203.0.113.0/24');
  assert.strictEqual(w.reason, 'Older Path');
  assert.match(w.reason_source, /sel_reason.*FRR/);
  assert.strictEqual(p.deciding_step, 'Older Path');
  assert.strictEqual(p.reason_source, 'device');
  assert.strictEqual(p.comparison, undefined, 'a visible-attribute tie has no comparison step to add');
});

test('no stored reason: comparison, or null with a note', function () {
  var cmp = q.whyPath(state('frr', [row({ next_hop: '10.0.0.1', local_pref: 200, best: true, status: '*>' }), row({ next_hop: '10.0.0.2' })]), 'r1', '203.0.113.0/24');
  assert.strictEqual(cmp.deciding_step, 'LocPrf');
  assert.strictEqual(cmp.reason_source, 'comparison');
  var none = q.whyPath(state('ios-xe', [row({ next_hop: '10.0.0.1', best: true, status: '*>' }), row({ next_hop: '10.0.0.2' })]), 'r1', '203.0.113.0/24');
  assert.strictEqual(none.deciding_step, null);
  assert.strictEqual(none.reason_source, null);
  assert.match(none.note, /later step not in the data/);
});
