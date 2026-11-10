// node-panel-bestpath.test.js — the node panel's Best-Path Decision and BGP table (xray-node-panel.js):
//   * each step compares the best only with the paths still in play (a path cut at LocPrf no longer counts at AS-Path),
//     the same as xray-core.js / xray-api.js;
//   * a reason the collector stored on the best path (bgp_routes[].reason / sel_reason) is named when the visible
//     attributes do not decide, and a tie is not attributed to Router ID;
//   * routes are grouped per destination (prefix/length and VRF), so two VRFs or two masks are not one comparison;
//   * a MED of 0 is shown as 0.
// Run: node --test        (from the repo root; Node >= 18, no dependencies)
'use strict';
var test = require('node:test');
var assert = require('node:assert');
var np = require('../xray-node-panel.js');

// tags out; a "<" that compares values ("1 < 2", as the DeepDive writes it) is kept as "‹" so it is not read as a tag
function text(html) { return String(html || '').replace(/<(?=[\s\d])/g, '‹').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim(); }
function row(o) {
  return Object.assign({ prefix: '203.0.113.0/24', next_hop: '10.0.0.1', as_path: '65002', local_pref: 100, weight: 0, metric: 0, origin: 'IGP', best: false, status: '* ' }, o);
}

test('a path cut at LocPrf does not count at AS-Path: A (LocPrf 200, 1 AS) beats B (200, 2 AS) by AS-Path', function () {
  var v = np.buildBgpView([
    row({ next_hop: '10.0.0.1', as_path: '65002', local_pref: 200, best: true, status: '*>' }),
    row({ next_hop: '10.0.0.2', as_path: '65003 65010', local_pref: 200 }),
    row({ next_hop: '10.0.0.3', as_path: '65004', local_pref: 100 })
  ]);
  var t = text(v.decision);
  assert.match(t, /best path by AS-Path \(1 ‹ 2\)/, t);
  assert.doesNotMatch(t, /no single decider/, t);
  assert.match(t, /LocPrf 200=200/, 'the LocPrf step is a tie among the paths still in play: ' + t);
});

test('a path that is better at a step than the marked best is still ambiguous', function () {
  var t = text(np.buildBgpView([
    row({ next_hop: '10.0.0.1', local_pref: 100, best: true, status: '*>' }),
    row({ next_hop: '10.0.0.2', local_pref: 200 })
  ]).decision);
  assert.match(t, /no single decider/, t);
});

test('a visible-attribute tie names the stored reason, not Router ID', function () {
  var same = function (o) { return row(Object.assign({ as_path: '65002', local_pref: 100 }, o)); };
  var frr = text(np.buildBgpView([same({ next_hop: '10.0.0.1', best: true, status: '*>', reason: 'Older Path' }), same({ next_hop: '10.0.0.2' })]).decision);
  assert.match(frr, /all visible attributes equal/, frr);
  assert.match(frr, /best path by Older Path \(reported by FRR\)/, frr);
  assert.doesNotMatch(frr, /tiebreak by Router ID/, frr);
  var sel = text(np.buildBgpView([same({ next_hop: '10.0.0.1', best: true, status: '*>', sel_reason: 'Router ID' }), same({ next_hop: '10.0.0.2' })]).decision);
  assert.match(sel, /best path by Router ID \(reported by FRR\)/, 'sel_reason is read too: ' + sel);
  var ios = text(np.buildBgpView([same({ next_hop: '10.0.0.1', best: true, status: '*>', reason: 'Peer Type' }), same({ next_hop: '10.0.0.2' })], { nos: 'ios-xe' }).decision);
  assert.match(ios, /best path by Peer Type \(derived by the collector from the IOS-XE table; IOS-XE reports no reason\)/, ios);
  var none = text(np.buildBgpView([same({ next_hop: '10.0.0.1', best: true, status: '*>' }), same({ next_hop: '10.0.0.2' })]).decision);
  assert.match(none, /all visible attributes equal/, none);
  assert.match(none, /a step the table does not show/, none);
  assert.doesNotMatch(none, /tiebreak by Router ID/, 'a tie is not attributed to one step: ' + none);
  var first = text(np.buildBgpView([same({ next_hop: '10.0.0.1', best: true, status: '*>', reason: 'First path received' }), same({ next_hop: '10.0.0.2' })]).decision);
  assert.doesNotMatch(first, /First path received/, '"First path received" is not a decider: ' + first);
});

test('when the visible attributes decide, that step is named even if a reason is stored', function () {
  var t = text(np.buildBgpView([
    row({ next_hop: '10.0.0.1', local_pref: 200, best: true, status: '*>', reason: 'Older Path' }),
    row({ next_hop: '10.0.0.2', local_pref: 100 })
  ]).decision);
  assert.match(t, /best path by LocPrf \(200 > 100\)/, t);
});

test('two VRFs with the same prefix are two destinations, each with its own decision', function () {
  var v = np.buildBgpView([
    { prefix: '10.0.0.0', prefixlen: 24, vrf: 'blue', best: true, status: '*>', weight: 100 },
    { prefix: '10.0.0.0', prefixlen: 24, vrf: 'red', best: true, status: '*>', weight: 200 }
  ]);
  assert.strictEqual((text(v.decision).match(/only path/g) || []).length, 2, text(v.decision));
  assert.match(v.table, /blue/); assert.match(v.table, /red/);
  assert.match(v.decision, /blue/); assert.match(v.decision, /red/);
});

test('two lengths of the same address are two destinations, shown with their length', function () {
  var v = np.buildBgpView([
    { prefix: '10.0.0.0', prefixlen: 16, best: true, status: '*>', weight: 100 },
    { prefix: '10.0.0.0', prefixlen: 24, best: true, status: '*>', weight: 200 }
  ]);
  assert.strictEqual((text(v.decision).match(/only path/g) || []).length, 2, text(v.decision));
  assert.match(v.table, /10\.0\.0\.0\/16/); assert.match(v.table, /10\.0\.0\.0\/24/);
  var same = np.buildBgpView([{ prefix: '10.0.0.0/24', best: true, status: '*>' }, { prefix: '10.0.0.0', prefixlen: 24, next_hop: '10.0.0.2' }]);
  assert.strictEqual((text(same.decision).match(/★/g) || []).length, 1, 'prefix with the length and prefix + prefixlen are the same destination: ' + text(same.decision));
});

test('a MED of 0 is shown as 0 in the Metric column', function () {
  var v = np.buildBgpView([{ prefix: '10.0.0.0/24', metric: 0, best: true, status: '*>' }]);
  var cells = (v.table.match(/<tbody><tr[^>]*>(.*?)<\/tr>/)[1].match(/<td[^>]*>(.*?)<\/td>/g) || []).map(function (c) { return c.replace(/<[^>]+>/g, ''); });
  assert.strictEqual(cells[3], '0', cells.join('|'));
  var none = np.buildBgpView([{ prefix: '10.0.0.0/24', best: true, status: '*>' }]);
  assert.strictEqual((none.table.match(/<tbody><tr[^>]*>(.*?)<\/tr>/)[1].match(/<td[^>]*>(.*?)<\/td>/g) || []).map(function (c) { return c.replace(/<[^>]+>/g, ''); })[3], '', 'no MED = empty');
});
