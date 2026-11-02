// bestpath-srl.test.js — how network-xray reads Nokia SR Linux's BGP best-path choice.
// Run: node --test        (from the repo root; Node >= 18, no dependencies)
//
// Each case is a small SR Linux BGP RIB in the shape clab-srl-collect.js reads (the same shape as its
// --self-test): `info from state network-instance default bgp-rib afi-safi ipv4-unicast ipv4-unicast local-rib`
// (route[] with prefix / neighbor / origin-protocol / best-route / attr-id) and
// `info from state network-instance default bgp-rib attr-sets` (attr-set[] with index / as-path / local-pref /
// med / origin / next-hop). One prefix, two or three paths, decided at one step of the BGP decision process:
// local preference, AS_PATH length, origin, MED, eBGP over iBGP. The device's own verdict is `best-route`.
//
// The data goes the way it goes in the product:
//   SR Linux json -> clab-srl-collect.js buildState -> state.bgp_routes
//                 -> xray-core.js xrayBgpDecision (the DeepDive Best-Path box)
// For every case:
//   1. each parsed row carries the attributes of its attr-set (next-hop, AS_PATH, local-pref, MED, origin);
//   2. exactly the path SR Linux marks best-route is marked best ('*>'), the others are not;
//   3. the decider the view derives from those attributes is the step the case was built for.
//
// What the SR Linux data read here cannot tell (so it is not asserted):
//   - why SR Linux picked the path: local-rib has a best-route flag, not a reason; the decider in (3) is derived
//     from the attributes, not reported by the device.
//   - peer type (eBGP / iBGP) per path: bgp_routes has no peer-type field, so eBGP over iBGP looks like a tie.
//   - whether MED / local-pref / origin were present: a missing MED reads as 0, a missing local-pref as 100,
//     a missing origin as IGP.
//   - IGP cost to the next-hop, router-id, peer address order, path age, multipath (used-route is not read).
'use strict';
var test = require('node:test');
var assert = require('node:assert');
var fs = require('fs');
var path = require('path');
var vm = require('vm');
var srl = require('../clab-srl-collect.js');

// ---- load the Best-Path functions of xray-core.js (as bestpath-frr.test.js does) ---------------------------

var CORE_SRC = fs.readFileSync(path.join(__dirname, '..', 'xray-core.js'), 'utf8');
function cut(name) {
  var m = new RegExp('^(function ' + name + '\\(|var ' + name + ' = )', 'm').exec(CORE_SRC);
  if (!m) throw new Error('xray-core.js: ' + name + ' not found');
  var start = m.index, end;
  if (m[1].indexOf('function') === 0) end = CORE_SRC.indexOf('\n}', start) + 2;
  else {
    var depth = 0, i = CORE_SRC.indexOf('=', start) + 1;
    for (; i < CORE_SRC.length; i++) {
      var c = CORE_SRC[i];
      if (c === '[' || c === '{' || c === '(') depth++;
      else if (c === ']' || c === '}' || c === ')') depth--;
      else if (c === ';' && depth === 0) break;
    }
    end = i + 1;
  }
  return CORE_SRC.slice(start, end);
}
var ctx = { window: {}, String: String, Number: Number, Math: Math, Object: Object, Array: Array, JSON: JSON, parseInt: parseInt, isNaN: isNaN };
vm.createContext(ctx);
vm.runInContext(['XRAY_BGP_CRITERIA', 'xrayBgpOriginChar', 'xrayBgpOriginRank', 'xrayBgpNum', 'xrayBgpNeighborAS',
  '_xrayAsPathLen', 'xrayBgpDecision'].map(cut).join('\n'), ctx, { filename: 'xray-core.js (Best-Path functions)' });

// the two field fixes xrayBuildBgpView applies to state.bgp_routes before it calls xrayBgpDecision
function viewRows(bgpRoutes) {
  return bgpRoutes.map(function (r) {
    var o = JSON.parse(JSON.stringify(r));
    if ((o.locprf === undefined || o.locprf === null || o.locprf === '') && o.local_pref !== undefined && o.local_pref !== null && o.local_pref !== '') o.locprf = String(o.local_pref);
    if (!o.nexthop && o.next_hop) o.nexthop = o.next_hop;
    return o;
  });
}

// ---- SR Linux output builders ---------------------------------------------------------------------------

var PFX = '203.0.113.0/24';
function seg(asns) { return { segment: [{ type: 'as-sequence', member: asns }] }; }
// one path: the local-rib route + its attr-set
function p(idx, neighbor, best, attrs) {
  var a = { index: String(idx), 'next-hop': neighbor };
  Object.keys(attrs || {}).forEach(function (k) { a[k] = attrs[k]; });
  return { route: { prefix: PFX, neighbor: neighbor, 'origin-protocol': 'bgp', 'best-route': best, 'attr-id': String(idx) }, attr: a };
}
function fx(map) { return function (q) { for (var k in map) { if (q.indexOf(k) >= 0) return map[k]; } return null; }; }
function collect(paths, neighbors) {
  return srl.buildState(fx({
    'interface ethernet-1/1 subinterface 0': { address: [{ 'ip-prefix': '10.0.0.1/30' }], 'oper-state': 'up' },
    'interface ethernet-1/2 subinterface 0': { address: [{ 'ip-prefix': '10.0.0.5/30' }], 'oper-state': 'up' },
    'protocols bgp neighbor': { neighbor: neighbors },
    'local-rib': { route: paths.map(function (x) { return x.route; }) },
    'attr-sets': { 'attr-set': paths.map(function (x) { return x.attr; }) }
  }), 'r1', { 'ethernet-1/1.0': 'r2', 'ethernet-1/2.0': 'r3' }, 'bgp');
}
var EBGP2 = [
  { 'peer-address': '10.0.0.2', 'session-state': 'established', 'peer-as': 65002, 'peer-type': 'ebgp' },
  { 'peer-address': '10.0.0.6', 'session-state': 'established', 'peer-as': 65003, 'peer-type': 'ebgp' }];

// ---- the cases ------------------------------------------------------------------------------------------
// expect: per path, the attributes the parsed row must carry (in device order); decider: XRAY_BGP_CRITERIA key

var CASES = [
  { name: 'local-pref', decider: 'locprf', neighbors: EBGP2,
    paths: [p(1, '10.0.0.2', false, { 'as-path': seg([65002, 65100]), 'local-pref': 100, origin: 'igp' }),
            p(2, '10.0.0.6', true,  { 'as-path': seg([65003, 65200, 65100]), 'local-pref': 200, origin: 'igp' })],
    expect: [{ as_path: '65002 65100', local_pref: 100, origin: 'i', metric: 0 },
             { as_path: '65003 65200 65100', local_pref: 200, origin: 'i', metric: 0 }] },
  { name: 'as-path-length', decider: 'aspath', neighbors: EBGP2,
    paths: [p(1, '10.0.0.2', true,  { 'as-path': seg([65002, 65100]), 'local-pref': 100, origin: 'igp' }),
            p(2, '10.0.0.6', false, { 'as-path': seg([65003, 65200, 65100]), 'local-pref': 100, origin: 'igp' })],
    expect: [{ as_path: '65002 65100', local_pref: 100, origin: 'i' },
             { as_path: '65003 65200 65100', local_pref: 100, origin: 'i' }] },
  { name: 'as-path-length (two segments)', decider: 'aspath', neighbors: EBGP2,
    paths: [p(1, '10.0.0.2', false, { 'as-path': { segment: [{ type: 'as-sequence', member: [65002] }, { type: 'as-sequence', member: [65200, 65100] }] }, origin: 'igp' }),
            p(2, '10.0.0.6', true,  { 'as-path': seg([65003, 65100]), origin: 'igp' })],
    expect: [{ as_path: '65002 65200 65100' }, { as_path: '65003 65100' }] },
  { name: 'origin', decider: 'origin', neighbors: EBGP2,
    paths: [p(1, '10.0.0.2', false, { 'as-path': seg([65002, 65100]), 'local-pref': 100, origin: 'incomplete' }),
            p(2, '10.0.0.6', false, { 'as-path': seg([65003, 65100]), 'local-pref': 100, origin: 'egp' }),
            p(3, '10.0.0.10', true, { 'as-path': seg([65004, 65100]), 'local-pref': 100, origin: 'igp' })],
    expect: [{ origin: '?' }, { origin: 'e' }, { origin: 'i' }] },
  { name: 'med', decider: 'metric',
    neighbors: [{ 'peer-address': '10.0.0.2', 'session-state': 'established', 'peer-as': 65002, 'peer-type': 'ebgp' },
                { 'peer-address': '10.0.0.6', 'session-state': 'established', 'peer-as': 65002, 'peer-type': 'ebgp' }],
    paths: [p(1, '10.0.0.2', false, { 'as-path': seg([65002, 65100]), 'local-pref': 100, origin: 'igp', med: 50 }),
            p(2, '10.0.0.6', true,  { 'as-path': seg([65002, 65100]), 'local-pref': 100, origin: 'igp', med: 10 })],
    expect: [{ metric: 50 }, { metric: 10 }] },
  { name: 'ebgp-over-ibgp', decider: null,   // no peer type in bgp_routes: every visible attribute ties
    neighbors: [{ 'peer-address': '10.0.0.2', 'session-state': 'established', 'peer-as': 65001, 'peer-type': 'ibgp' },
                { 'peer-address': '10.0.0.6', 'session-state': 'established', 'peer-as': 65003, 'peer-type': 'ebgp' }],
    paths: [p(1, '10.0.0.2', false, { 'as-path': seg([65003]), 'local-pref': 100, origin: 'igp' }),
            p(2, '10.0.0.6', true,  { 'as-path': seg([65003]), 'local-pref': 100, origin: 'igp' })],
    expect: [{ as_path: '65003', local_pref: 100, next_hop: '10.0.0.2' }, { as_path: '65003', local_pref: 100, next_hop: '10.0.0.6' }] }
];

CASES.forEach(function (c) {
  test(c.name + ': parsed paths carry the device attributes and its best-route', function () {
    var st = collect(c.paths, c.neighbors);
    var rows = st.bgp_routes.filter(function (r) { return r.prefix === PFX; });
    assert.strictEqual(rows.length, c.paths.length, 'one row per local-rib path');
    rows.forEach(function (r, i) {
      var dev = c.paths[i];
      assert.strictEqual(r.next_hop, dev.attr['next-hop'], 'path ' + i + ' next-hop');
      assert.strictEqual(r.own, false, 'path ' + i + ' learned, not own');
      Object.keys(c.expect[i]).forEach(function (k) { assert.strictEqual(r[k], c.expect[i][k], 'path ' + i + ' ' + k); });
      assert.strictEqual(r.best, dev.route['best-route'], 'path ' + i + ' best = best-route');
      assert.strictEqual(r.status, dev.route['best-route'] ? '*>' : '* ', 'path ' + i + ' status marker');
    });
    assert.strictEqual(rows.filter(function (r) { return r.best; }).length, 1, 'exactly one best path');
  });

  test(c.name + ': the view explains the device best path ' + (c.decider ? 'by ' + c.decider : 'as a tie of visible attributes'), function () {
    var rows = viewRows(collect(c.paths, c.neighbors).bgp_routes);
    var dec = ctx.xrayBgpDecision(rows);
    var devBest = c.paths.findIndex(function (x) { return x.route['best-route'] === true; });
    assert.strictEqual(dec.best, rows[devBest], 'view best = SR Linux best-route');
    if (c.decider) {
      assert.strictEqual(dec.kind, 'decided');
      assert.strictEqual(dec.criterion.key, c.decider);
    } else {
      assert.strictEqual(dec.kind, 'tie', 'eBGP/iBGP is not visible in bgp_routes');
    }
  });
});

// the active/best marker: best-route is the only flag read; anything but JSON true is not best
test('best marker: only best-route === true marks a path best; no best-route -> no best path', function () {
  var st = collect([
    p(1, '10.0.0.2', false, { 'as-path': seg([65002]) }),
    p(2, '10.0.0.6', undefined, { 'as-path': seg([65003]) })
  ], EBGP2);
  assert.deepStrictEqual(st.bgp_routes.map(function (r) { return r.status; }), ['* ', '* ']);
  assert.strictEqual(ctx.xrayBgpDecision(viewRows(st.bgp_routes)).kind, 'nobest');
});

// a path whose attr-set is missing keeps the device best-route, with the documented defaults
test('missing attr-set: best-route kept, next-hop from local-rib neighbor, defaults LP 100 / MED 0 / origin i', function () {
  var st = collect([{ route: { prefix: PFX, neighbor: '10.0.0.2', 'origin-protocol': 'bgp', 'best-route': true, 'attr-id': '99' }, attr: { index: '1' } }], EBGP2);
  var r = st.bgp_routes[0];
  assert.strictEqual(r.best, true);
  assert.strictEqual(r.next_hop, '10.0.0.2');
  assert.strictEqual(r.local_pref, 100);
  assert.strictEqual(r.metric, 0);
  assert.strictEqual(r.origin, 'i');
  assert.strictEqual(r.as_path, '');
});
