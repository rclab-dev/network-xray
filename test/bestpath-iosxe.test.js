// bestpath-iosxe.test.js — how clab-iosxe-collect.js reads IOS-XE `show ip bgp` and names the best-path step.
// Run: node --test        (from the repo root; Node >= 18, no dependencies)
//
// Each case is a small `show ip bgp` table (one prefix, two or three paths) laid out exactly like the captured
// test/fixtures/iosxe-q15 output (same header, rows one column right of it). Each one is decided at one of the
// IOS best-path steps that the plain-text table shows:
//   Weight, Local Pref, locally originated (next hop 0.0.0.0), AS_PATH length, Origin, MED, eBGP over iBGP,
// plus the status column itself ('*' valid, '>' best, 'i' internal).
//
// For every case:
//   1. parseBgpRoutes gives back what IOS printed (next hop, best/valid/internal, metric, LocPrf, weight, path, origin);
//   2. the best path is the row IOS marked '>' and no other;
//   3. run() (the --from-dir path) puts the same winner into state.bgp_routes with the step explainBestPath derived.
//
// What the text table cannot tell (tests below pin "" / no guess):
//   - IGP metric to the next hop, path age (oldest eBGP), router id, cluster list, neighbor address order:
//     not printed, so a tie on every printed column gives reason "".
//   - Whether a path came from a confederation peer, AS_SET contents beyond the braces, communities,
//     bgp always-compare-med / deterministic-med / missing-as-worst settings: not in this output.
//   - The local AS of an iBGP path is not printed; 'i' in the status column is the only iBGP signal.
'use strict';
var test = require('node:test');
var assert = require('node:assert');
var fs = require('fs');
var path = require('path');
var ios = require('../clab-iosxe-collect.js');

// ---- build tables in the captured layout -------------------------------------------------------------------

var Q15 = fs.readFileSync(path.join(__dirname, 'fixtures', 'iosxe-q15', 'r1', 'show_ip_bgp.txt'), 'utf8');
var PREAMBLE = Q15.slice(0, Q15.indexOf('     Network')).replace(/BGP table version is \d+/, 'BGP table version is 9');
var HEADER = '     Network          Next Hop            Metric LocPrf Weight Path';

function lpad(s, end, line) { s = s == null ? '' : String(s); var n = end - line.length - s.length; return line + (n > 0 ? ' '.repeat(n) : ' ') + s; }
// one row: status (e.g. '*>', '* i', '*>i'), network ('' = same prefix as the row above), next hop, numbers, path
function row(status, net, nh, metric, lp, weight, pathStr) {
  var l = ' ' + String(status).padEnd(3) + '  ' + String(net).padEnd(17) + nh;
  if (metric != null) l = lpad(metric, 49, l);
  if (lp != null) l = lpad(lp, 56, l);
  l = lpad(weight, 63, l);
  return l + ' ' + pathStr;
}
function table(rows) { return PREAMBLE + HEADER + '\n' + rows.join('\n') + '\n'; }

function summary(localAs, peers) {
  return 'BGP router identifier 1.1.1.1, local AS number ' + localAs + '\n' +
    'BGP table version is 9, main routing table version 9\n\n' +
    'Neighbor        V           AS MsgRcvd MsgSent   TblVer  InQ OutQ Up/Down  State/PfxRcd\n' +
    peers.map(function (p) { return p[0].padEnd(16) + '4' + String(p[1]).padStart(13) + '      20      22        9    0    0 00:15:10        1'; }).join('\n') + '\n';
}

// the next hops of every case are reachable (a path whose next hop is not in the routing table is marked
// not valid by the collector, as IOS would), except 9.9.9.9
var ROUTES = 'Gateway of last resort is not set\n\n' +
  '      2.0.0.0/32 is subnetted, 1 subnets\n' +
  'O        2.2.2.2 [110/11] via 10.1.0.2, 00:05:45, Ethernet0/1\n' +
  '      3.0.0.0/32 is subnetted, 1 subnets\n' +
  'O        3.3.3.3 [110/21] via 10.1.0.2, 00:05:45, Ethernet0/1\n' +
  '      10.0.0.0/8 is variably subnetted, 2 subnets, 2 masks\n' +
  'C        10.1.0.0/24 is directly connected, Ethernet0/1\n' +
  'L        10.1.0.1/32 is directly connected, Ethernet0/1\n';

function parse(text) {
  var warn = [];
  var r = ios.parseBgpRoutes(text, warn);
  assert.deepStrictEqual(warn, [], 'every row read: ' + JSON.stringify(warn));
  return r;
}
function stateOf(text, sum) {
  return ios.run({ bgp: text, bgpSummary: sum, route: ROUTES }, 'r1', '', 'bgp', '');
}
function bgpWarnings(st) { return (st.parse_warnings || []).filter(function (w) { return /show ip bgp$/.test(w.cmd || ''); }); }

// the attributes a parsed row must carry, compared field by field against what the table printed
function expectRow(r, e) {
  Object.keys(e).forEach(function (k) { assert.deepStrictEqual(r[k], e[k], r.nextHop + ' ' + k); });
}
// state.bgp_routes: one best per prefix, the one at next hop `nh`, with `reason`
function expectStateBest(st, nh, reason) {
  assert.deepStrictEqual(bgpWarnings(st), []);
  var best = st.bgp_routes.filter(function (r) { return r.best; });
  assert.strictEqual(best.length, 1, 'one best path');
  assert.strictEqual(best[0].next_hop, nh);
  assert.strictEqual(best[0].status, '*>');
  assert.strictEqual(best[0].reason || '', reason);
  st.bgp_routes.filter(function (r) { return !r.best; }).forEach(function (r) {
    assert.strictEqual(r.status, '* ');
    assert.ok(!r.reason, 'only the best path carries a reason');
  });
}

// ---- the layout helper reproduces the captured row byte for byte ------------------------------------------

test('layout: row() rebuilds the captured iosxe-q15 rows exactly', function () {
  assert.ok(Q15.indexOf(HEADER) >= 0);
  assert.ok(Q15.indexOf(row('*>i', '8.8.8.0/24', '2.2.2.2', 0, 100, 0, '65002 i')) >= 0);
  var r3 = fs.readFileSync(path.join(__dirname, 'fixtures', 'iosxe-q15', 'r3', 'show_ip_bgp.txt'), 'utf8');
  assert.ok(r3.indexOf(row('*>', '8.8.8.0/24', '0.0.0.0', 0, null, 32768, 'i')) >= 0);
  var r2 = fs.readFileSync(path.join(__dirname, 'fixtures', 'iosxe-q15', 'r2', 'show_ip_bgp.txt'), 'utf8');
  assert.ok(r2.indexOf(row('*>', '8.8.8.0/24', '10.11.0.20', 0, null, 0, '65002 i')) >= 0);
});

// ---- one case per decision step ------------------------------------------------------------------------------

test('Weight: higher weight wins even with a longer AS_PATH', function () {
  var t = table([
    row('*', '203.0.113.0/24', '10.1.0.2', 0, null, 0, '65002 i'),
    row('*>', '', '10.1.0.6', 0, null, 200, '65003 65004 i')
  ]);
  var r = parse(t);
  assert.strictEqual(r.length, 2);
  expectRow(r[0], { prefix: '203.0.113.0/24', nextHop: '10.1.0.2', best: false, valid: true, ibgp: false, status_raw: '*',
    metric: 0, local_pref: null, weight: 0, as_path: '65002', origin: 'IGP' });
  expectRow(r[1], { prefix: '203.0.113.0/24', nextHop: '10.1.0.6', best: true, valid: true, ibgp: false, status_raw: '*>',
    metric: 0, local_pref: null, weight: 200, as_path: '65003 65004', origin: 'IGP' });
  var st = stateOf(t, summary(65001, [['10.1.0.2', 65002], ['10.1.0.6', 65003]]));
  expectStateBest(st, '10.1.0.6', 'Weight');
  var b = st.bgp_routes.filter(function (x) { return x.best; })[0];
  assert.strictEqual(b.prefix, '203.0.113.0');
  assert.strictEqual(b.prefixlen, 24);
  assert.strictEqual(b.weight, 200);
});

test('Local Pref: higher LocPrf wins between iBGP paths', function () {
  var t = table([
    row('*>i', '198.51.100.0/24', '2.2.2.2', 0, 200, 0, '65002 65010 i'),
    row('* i', '', '3.3.3.3', 0, 100, 0, '65002 i')
  ]);
  var r = parse(t);
  expectRow(r[0], { nextHop: '2.2.2.2', best: true, valid: true, ibgp: true, status_raw: '*>i', local_pref: 200, weight: 0, metric: 0, as_path: '65002 65010' });
  expectRow(r[1], { nextHop: '3.3.3.3', best: false, valid: true, ibgp: true, status_raw: '* i', local_pref: 100, weight: 0, metric: 0, as_path: '65002' });
  expectStateBest(stateOf(t, summary(65001, [['2.2.2.2', 65001], ['3.3.3.3', 65001]])), '2.2.2.2', 'Local Pref');
});

test('Local Pref: an eBGP row prints no LocPrf (read as null, compared as the default 100)', function () {
  var t = table([
    row('*', '198.51.100.0/24', '10.1.0.2', 0, null, 0, '65002 i'),
    row('*>i', '', '3.3.3.3', 0, 150, 0, '65003 65010 i')
  ]);
  var r = parse(t);
  assert.strictEqual(r[0].local_pref, null);
  assert.strictEqual(r[1].local_pref, 150);
  expectStateBest(stateOf(t, summary(65001, [['10.1.0.2', 65002], ['3.3.3.3', 65001]])), '3.3.3.3', 'Local Pref');
});

test('Locally originated: next hop 0.0.0.0 wins over a received path with the same weight', function () {
  // `neighbor ... weight 32768` on the peer, so weight ties and the local origin decides
  var t = table([
    row('*', '192.0.2.0/24', '10.1.0.2', 0, null, 32768, '65002 i'),
    row('*>', '', '0.0.0.0', 0, null, 32768, 'i')
  ]);
  var r = parse(t);
  expectRow(r[0], { nextHop: '10.1.0.2', best: false, weight: 32768, as_path: '65002', origin: 'IGP' });
  expectRow(r[1], { nextHop: '0.0.0.0', best: true, valid: true, ibgp: false, weight: 32768, metric: 0, local_pref: null, as_path: '', origin: 'IGP' });
  expectStateBest(stateOf(t, summary(65001, [['10.1.0.2', 65002]])), '0.0.0.0', 'Local Route');
});

test('AS_PATH length: the shortest of three paths wins', function () {
  var t = table([
    row('*', '203.0.113.0/24', '10.1.0.2', null, null, 0, '65002 65020 65030 i'),
    row('*>', '', '10.1.0.6', null, null, 0, '65003 i'),
    row('*', '', '10.1.0.10', null, null, 0, '65004 65030 i')
  ]);
  var r = parse(t);
  assert.strictEqual(r.length, 3);
  assert.deepStrictEqual(r.map(function (x) { return x.as_path; }), ['65002 65020 65030', '65003', '65004 65030']);
  assert.deepStrictEqual(r.map(function (x) { return x.metric; }), [null, null, null], 'blank Metric column -> null');
  assert.deepStrictEqual(r.map(function (x) { return x.best; }), [false, true, false]);
  expectStateBest(stateOf(t, summary(65001, [['10.1.0.2', 65002], ['10.1.0.6', 65003], ['10.1.0.10', 65004]])), '10.1.0.6', 'AS Path');
});

test('AS_PATH length: prepends count (65002 65002 65002 loses to 65003 65010)', function () {
  var t = table([
    row('*', '203.0.113.0/24', '10.1.0.2', 0, null, 0, '65002 65002 65002 i'),
    row('*>', '', '10.1.0.6', 0, null, 0, '65003 65010 i')
  ]);
  var r = parse(t);
  assert.strictEqual(r[0].as_path, '65002 65002 65002');
  expectStateBest(stateOf(t, summary(65001, [['10.1.0.2', 65002], ['10.1.0.6', 65003]])), '10.1.0.6', 'AS Path');
});

test('Origin: IGP (i) over EGP (e) over incomplete (?)', function () {
  var t = table([
    row('*', '203.0.113.0/24', '10.1.0.2', 0, null, 0, '65002 ?'),
    row('*', '', '10.1.0.6', 0, null, 0, '65003 e'),
    row('*>', '', '10.1.0.10', 0, null, 0, '65004 i')
  ]);
  var r = parse(t);
  assert.deepStrictEqual(r.map(function (x) { return x.origin; }), ['incomplete', 'EGP', 'IGP']);
  assert.deepStrictEqual(r.map(function (x) { return x.as_path; }), ['65002', '65003', '65004']);
  assert.deepStrictEqual(r.map(function (x) { return x.best; }), [false, false, true]);
  var st = stateOf(t, summary(65001, [['10.1.0.2', 65002], ['10.1.0.6', 65003], ['10.1.0.10', 65004]]));
  expectStateBest(st, '10.1.0.10', 'Origin');
  assert.deepStrictEqual(st.bgp_routes.map(function (x) { return x.origin; }), ['incomplete', 'EGP', 'IGP']);
});

test('MED: lower Metric wins between paths from the same neighbour AS', function () {
  var t = table([
    row('*', '203.0.113.0/24', '10.1.0.2', 50, null, 0, '65002 i'),
    row('*>', '', '10.1.0.6', 10, null, 0, '65002 i')
  ]);
  var r = parse(t);
  expectRow(r[0], { metric: 50, local_pref: null, weight: 0, best: false });
  expectRow(r[1], { metric: 10, local_pref: null, weight: 0, best: true });
  expectStateBest(stateOf(t, summary(65001, [['10.1.0.2', 65002], ['10.1.0.6', 65002]])), '10.1.0.6', 'MED');
});

test('MED: a large Metric (4294967294) is read as a number, and decides the three-path case', function () {
  var t = table([
    row('*>', '203.0.113.0/24', '10.1.0.2', 100, null, 0, '65002 i'),
    row('*', '', '10.1.0.6', 4294967294, null, 0, '65002 i'),
    row('*', '', '10.1.0.10', 200, null, 0, '65002 i')
  ]);
  var r = parse(t);
  assert.deepStrictEqual(r.map(function (x) { return x.metric; }), [100, 4294967294, 200]);
  expectStateBest(stateOf(t, summary(65001, [['10.1.0.2', 65002], ['10.1.0.6', 65002], ['10.1.0.10', 65002]])), '10.1.0.2', 'MED');
});

test('MED: not compared across neighbour ASes (the text cannot say what decided -> reason "")', function () {
  // IOS default: MED only between paths from the same AS. Here the best has the HIGHER MED and a different
  // first AS; the remaining steps (oldest eBGP path, router id) are not in the output -> no guess.
  var t = table([
    row('*>', '203.0.113.0/24', '10.1.0.2', 100, null, 0, '65002 i'),
    row('*', '', '10.1.0.6', 5, null, 0, '65003 i')
  ]);
  var r = parse(t);
  assert.deepStrictEqual(r.map(function (x) { return x.metric; }), [100, 5]);
  expectStateBest(stateOf(t, summary(65001, [['10.1.0.2', 65002], ['10.1.0.6', 65003]])), '10.1.0.2', '');
});

test('eBGP over iBGP: same LocPrf / AS_PATH / origin / MED, the external path wins', function () {
  var t = table([
    row('* i', '203.0.113.0/24', '3.3.3.3', 0, 100, 0, '65002 i'),
    row('*>', '', '10.1.0.2', 0, null, 0, '65002 i')
  ]);
  var r = parse(t);
  expectRow(r[0], { nextHop: '3.3.3.3', best: false, valid: true, ibgp: true, local_pref: 100 });
  expectRow(r[1], { nextHop: '10.1.0.2', best: true, valid: true, ibgp: false, local_pref: null });
  expectStateBest(stateOf(t, summary(65001, [['3.3.3.3', 65001], ['10.1.0.2', 65002]])), '10.1.0.2', 'Peer Type');
});

test('tie on every printed column (two iBGP paths): IGP metric / router id are not printed -> reason ""', function () {
  var t = table([
    row('*>i', '203.0.113.0/24', '2.2.2.2', 0, 100, 0, '65002 i'),
    row('* i', '', '3.3.3.3', 0, 100, 0, '65002 i')
  ]);
  var r = parse(t);
  assert.deepStrictEqual(r.map(function (x) { return x.best; }), [true, false]);
  expectStateBest(stateOf(t, summary(65001, [['2.2.2.2', 65001], ['3.3.3.3', 65001]])), '2.2.2.2', '');
});

// ---- the '>' marker -----------------------------------------------------------------------------------------

test('">" marker: the best path is the marked row wherever it sits, and only that row', function () {
  [0, 1, 2].forEach(function (at) {
    var nhs = ['10.1.0.2', '10.1.0.6', '10.1.0.10'];
    var t = table(nhs.map(function (nh, i) {
      return row(i === at ? '*>' : '*', i === 0 ? '203.0.113.0/24' : '', nh, 0, null, i === at ? 100 : 0, '6500' + (i + 2) + ' i');
    }));
    var r = parse(t);
    assert.strictEqual(r.length, 3);
    r.forEach(function (x, i) {
      assert.strictEqual(x.prefix, '203.0.113.0/24', 'continuation rows carry the prefix');
      assert.strictEqual(x.best, i === at, 'row ' + i + ' best');
      assert.strictEqual(x.valid, true);
    });
    expectStateBest(stateOf(t, summary(65001, nhs.map(function (nh, i) { return [nh, 65002 + i]; }))), nhs[at], 'Weight');
  });
});

test('">" marker: a row without "*" (not valid) is kept, never best, and does not take the reason', function () {
  // IOS prints an unusable path (e.g. next hop unreachable) with only 'i' in the status column
  var t = table([
    row('*>i', '203.0.113.0/24', '2.2.2.2', 0, 100, 0, '65002 65010 i'),
    row('  i', '', '9.9.9.9', 0, 100, 0, '65002 i')
  ]);
  var r = parse(t);
  expectRow(r[0], { best: true, valid: true, ibgp: true, status_raw: '*>i' });
  expectRow(r[1], { best: false, valid: false, ibgp: true, status_raw: 'i', nextHop: '9.9.9.9' });
  var st = stateOf(t, summary(65001, [['2.2.2.2', 65001], ['9.9.9.9', 65001]]));
  assert.deepStrictEqual(bgpWarnings(st), []);
  var best = st.bgp_routes.filter(function (x) { return x.best; });
  assert.strictEqual(best.length, 1);
  assert.strictEqual(best[0].next_hop, '2.2.2.2');
  var inv = st.bgp_routes.filter(function (x) { return x.next_hop === '9.9.9.9'; })[0];
  assert.strictEqual(inv.valid, false);
  assert.strictEqual(inv.status, '  ');
  assert.strictEqual(inv.status_raw, 'i');
});

test('no ">" in the table: no path is best and no reason is made up', function () {
  var t = table([
    row('*', '203.0.113.0/24', '10.1.0.2', 0, null, 0, '65002 i'),
    row('*', '', '10.1.0.6', 0, null, 0, '65003 i')
  ]);
  var r = parse(t);
  assert.deepStrictEqual(r.map(function (x) { return x.best; }), [false, false]);
  var st = stateOf(t, summary(65001, [['10.1.0.2', 65002], ['10.1.0.6', 65003]]));
  assert.strictEqual(st.bgp_routes.filter(function (x) { return x.best || x.reason; }).length, 0);
});

test('single path: "First path received", as for the captured q15 table', function () {
  var t = table([row('*>', '203.0.113.0/24', '10.1.0.2', 0, null, 0, '65002 i')]);
  expectStateBest(stateOf(t, summary(65001, [['10.1.0.2', 65002]])), '10.1.0.2', 'First path received');
});

test('a not-valid path is not a candidate: it does not change the step named for the valid rivals', function () {
  // valid rival loses at Local Pref; the not-valid row (next hop 9.9.9.9 unreachable) ties down to AS_PATH.
  // IOS does not run best path over the not-valid row, so the step is Local Pref.
  var t = table([
    row('*>i', '203.0.113.0/24', '2.2.2.2', 0, 200, 0, '65002 i'),
    row('* i', '', '3.3.3.3', 0, 100, 0, '65002 i'),
    row('  i', '', '9.9.9.9', 0, 200, 0, '65002 65010 i')
  ]);
  var r = parse(t);
  assert.deepStrictEqual(r.map(function (x) { return x.valid; }), [true, true, false]);
  expectStateBestValid(stateOf(t, summary(65001, [['2.2.2.2', 65001], ['3.3.3.3', 65001], ['9.9.9.9', 65001]])), '2.2.2.2', 'Local Pref');
});

test('a not-valid path is not a candidate: best with only not-valid rivals gets no made-up step', function () {
  var t = table([
    row('*>i', '203.0.113.0/24', '2.2.2.2', 0, 100, 0, '65002 65010 i'),
    row('  i', '', '9.9.9.9', 0, 100, 0, '65002 i')
  ]);
  var st = stateOf(t, summary(65001, [['2.2.2.2', 65001], ['9.9.9.9', 65001]]));
  // the only rival is not valid, so there is nothing to compare and no step is named
  expectStateBestValid(st, '2.2.2.2', '');
});

// like expectStateBest, for tables that also hold a not-valid row
function expectStateBestValid(st, nh, reason) {
  assert.deepStrictEqual(bgpWarnings(st), []);
  var best = st.bgp_routes.filter(function (r) { return r.best; });
  assert.strictEqual(best.length, 1);
  assert.strictEqual(best[0].next_hop, nh);
  assert.strictEqual(best[0].reason || '', reason);
  st.bgp_routes.filter(function (r) { return r.valid === false; }).forEach(function (r) { assert.strictEqual(r.status, '  '); });
}
