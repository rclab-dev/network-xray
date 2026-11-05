// bestpath-iosxe-reason.test.js — the best-path step clab-iosxe-collect.js names from IOS-XE `show ip bgp` columns.
// Run: node --test        (from the repo root; Node >= 18, no dependencies)
//
// Tables are laid out like the captured test/fixtures/iosxe-q15 output (its preamble and header are reused).
// One case also uses the layout of Cisco's command reference examples for `show ip bgp`, where rows start
// two columns left of the header. Addresses are from the documentation ranges.
//
// Every case goes through run() (the --from-dir path), and the explainBestPath() export is checked
// directly too. A step that the printed columns cannot settle gives reason "" (unknown), never a guess.
'use strict';
var test = require('node:test');
var assert = require('node:assert');
var fs = require('fs');
var path = require('path');
var ios = require('../clab-iosxe-collect.js');

var Q15 = fs.readFileSync(path.join(__dirname, 'fixtures', 'iosxe-q15', 'r1', 'show_ip_bgp.txt'), 'utf8');
var PREAMBLE = Q15.slice(0, Q15.indexOf('     Network'));
var HEADER = '     Network          Next Hop            Metric LocPrf Weight Path';

function lpad(s, end, line) { s = String(s); var n = end - line.length - s.length; return line + (n > 0 ? ' '.repeat(n) : ' ') + s; }
// shift: how many columns the row sits left of the header (0 = captured q15 layout, 2 = Cisco reference layout)
function row(status, net, nh, metric, lp, weight, pathStr, shift) {
  var sh = shift || 0;
  var l = (sh ? String(status).padEnd(3) + ' ' : ' ' + String(status).padEnd(3) + '  ') + String(net).padEnd(17) + nh;
  if (metric != null) l = lpad(metric, 49 - sh, l);
  if (lp != null) l = lpad(lp, 56 - sh, l);
  l = lpad(weight, 63 - sh, l);
  return l + ' ' + pathStr;
}
function table(rows) { return PREAMBLE + HEADER + '\n' + rows.join('\n') + '\n'; }
function summary(peers) {
  return 'BGP router identifier 1.1.1.1, local AS number 65001\n' +
    'BGP table version is 9, main routing table version 9\n\n' +
    'Neighbor        V           AS MsgRcvd MsgSent   TblVer  InQ OutQ Up/Down  State/PfxRcd\n' +
    peers.map(function (p) { return p[0].padEnd(16) + '4' + String(p[1]).padStart(13) + '      20      22        9    0    0 00:15:10        1'; }).join('\n') + '\n';
}
// every next hop used below is reachable; 2.2.2.2 and 3.3.3.3 at different OSPF costs
var ROUTES = 'Gateway of last resort is not set\n\n' +
  '      2.0.0.0/32 is subnetted, 1 subnets\n' +
  'O        2.2.2.2 [110/11] via 10.1.0.2, 00:05:45, Ethernet0/1\n' +
  '      3.0.0.0/32 is subnetted, 1 subnets\n' +
  'O        3.3.3.3 [110/21] via 10.1.0.2, 00:05:45, Ethernet0/1\n' +
  '      10.0.0.0/8 is variably subnetted, 2 subnets, 2 masks\n' +
  'C        10.1.0.0/24 is directly connected, Ethernet0/1\n' +
  'L        10.1.0.1/32 is directly connected, Ethernet0/1\n';

// run the collector on one table; return the reason of the single best path, after checking the rows parsed
function reasonOf(rows, peers, nBest) {
  var t = table(rows), warn = [];
  var parsed = ios.parseBgpRoutes(t, warn);
  assert.deepStrictEqual(warn, [], 'every row read');
  assert.strictEqual(parsed.length, rows.length, 'one route per row');
  // explainBestPath on the parsed rows and run() must agree
  ios.explainBestPath(parsed);
  var st = ios.run({ bgp: t, bgpSummary: summary(peers), route: ROUTES }, 'r1', '', 'bgp', '');
  var best = st.bgp_routes.filter(function (r) { return r.best; });
  assert.strictEqual(best.length, nBest || 1, 'best paths');
  var pb = parsed.filter(function (r) { return r.best; });
  best.forEach(function (b, i) { assert.strictEqual(b.reason || '', pb[i].reason, 'run() and explainBestPath agree'); });
  st.bgp_routes.filter(function (r) { return !r.best; }).forEach(function (r) { assert.ok(!r.reason, 'only best paths carry a reason'); });
  return nBest ? best.map(function (b) { return b.reason || ''; }) : best[0].reason || '';
}
var EBGP3 = [['10.1.0.2', 65002], ['10.1.0.6', 65003], ['10.1.0.10', 65004]];
var IBGP2 = [['2.2.2.2', 65001], ['3.3.3.3', 65001]];

// ---- each step the columns show ---------------------------------------------------------------------------

test('Weight decides (higher wins, though its AS_PATH, Origin and MED are all worse)', function () {
  assert.strictEqual(reasonOf([
    row('*', '203.0.113.0/24', '10.1.0.2', 0, null, 0, '65002 i'),
    row('*>', '', '10.1.0.6', 90, null, 100, '65003 65010 65020 ?')
  ], EBGP3), 'Weight');
});

test('Local Pref decides (iBGP 200 over iBGP 100 with a shorter AS_PATH)', function () {
  assert.strictEqual(reasonOf([
    row('* i', '198.51.100.0/24', '3.3.3.3', 0, 100, 0, '65002 i'),
    row('*>i', '', '2.2.2.2', 0, 200, 0, '65003 65002 i')
  ], IBGP2), 'Local Pref');
});

test('AS_PATH length decides', function () {
  assert.strictEqual(reasonOf([
    row('*>', '203.0.113.0/24', '10.1.0.2', 0, null, 0, '65002 i'),
    row('*', '', '10.1.0.6', 0, null, 0, '65003 65002 i')
  ], EBGP3), 'AS Path');
});

test('AS_PATH length: an AS_SET counts as one AS', function () {
  // best: 65002 + {65010,65011,65012} = 2; rival: 3
  assert.strictEqual(reasonOf([
    row('*>', '203.0.113.0/24', '10.1.0.2', 0, null, 0, '65002 {65010,65011,65012} i'),
    row('*', '', '10.1.0.6', 0, null, 0, '65003 65020 65030 i')
  ], EBGP3), 'AS Path');
  // equal length once the set counts as one: decided further down (Origin)
  assert.strictEqual(reasonOf([
    row('*>', '203.0.113.0/24', '10.1.0.2', 0, null, 0, '65002 {65010,65011} i'),
    row('*', '', '10.1.0.6', 0, null, 0, '65003 65020 ?')
  ], EBGP3), 'Origin');
});

test('Origin decides (IGP over EGP over incomplete)', function () {
  assert.strictEqual(reasonOf([
    row('*', '203.0.113.0/24', '10.1.0.2', 0, null, 0, '65002 ?'),
    row('*>', '', '10.1.0.6', 0, null, 0, '65003 i'),
    row('*', '', '10.1.0.10', 0, null, 0, '65004 e')
  ], EBGP3), 'Origin');
});

test('MED decides between paths from the same neighbour AS', function () {
  assert.strictEqual(reasonOf([
    row('*', '203.0.113.0/24', '10.1.0.2', 20, null, 0, '65002 i'),
    row('*>', '', '10.1.0.6', 10, null, 0, '65002 i')
  ], [['10.1.0.2', 65002], ['10.1.0.6', 65002]]), 'MED');
});

test('eBGP over iBGP decides', function () {
  assert.strictEqual(reasonOf([
    row('* i', '203.0.113.0/24', '2.2.2.2', 0, 100, 0, '65002 i'),
    row('*>', '', '10.1.0.2', 0, null, 0, '65002 i')
  ], [['2.2.2.2', 65001], ['10.1.0.2', 65002]]), 'Peer Type');
});

test('the closest rival names the step (one loses at Weight, the other at MED)', function () {
  assert.strictEqual(reasonOf([
    row('*>', '203.0.113.0/24', '10.1.0.2', 5, null, 10, '65002 i'),
    row('*', '', '10.1.0.6', 0, null, 0, '65002 i'),
    row('*', '', '10.1.0.10', 50, null, 10, '65002 i')
  ], [['10.1.0.2', 65002], ['10.1.0.6', 65002], ['10.1.0.10', 65002]]), 'MED');
});

test('Cisco reference layout (rows two columns left of the header) gives the same steps', function () {
  assert.strictEqual(reasonOf([
    row('*>', '203.0.113.0/24', '10.1.0.2', 0, null, 0, '65002 i', 2),
    row('*', '', '10.1.0.6', 0, null, 0, '65003 65002 i', 2)
  ], EBGP3), 'AS Path');
  assert.strictEqual(reasonOf([
    row('* i', '198.51.100.0/24', '3.3.3.3', 0, 100, 0, '65002 i', 2),
    row('*>i', '', '2.2.2.2', 0, 200, 0, '65002 i', 2)
  ], IBGP2), 'Local Pref');
});

// ---- steps the output does not show: always unknown ----------------------------------------------------------

test('IGP metric to the next hop is not judged: iBGP tie with different OSPF costs -> ""', function () {
  // 2.2.2.2 is closer (cost 11 vs 21) and is best, but the table does not say that is why
  assert.strictEqual(reasonOf([
    row('*>i', '203.0.113.0/24', '2.2.2.2', 0, 100, 0, '65002 i'),
    row('* i', '', '3.3.3.3', 0, 100, 0, '65002 i')
  ], IBGP2), '');
});

test('router ID / oldest path are not judged: eBGP tie from two ASes -> ""', function () {
  assert.strictEqual(reasonOf([
    row('*', '203.0.113.0/24', '10.1.0.2', 0, null, 0, '65002 i'),
    row('*>', '', '10.1.0.6', 0, null, 0, '65003 i')
  ], EBGP3), '');
});

test('neighbour address is not judged: two sessions to the same neighbour AS, all columns equal -> ""', function () {
  assert.strictEqual(reasonOf([
    row('*>', '203.0.113.0/24', '10.1.0.2', 0, null, 0, '65002 i'),
    row('*', '', '10.1.0.6', 0, null, 0, '65002 i')
  ], [['10.1.0.2', 65002], ['10.1.0.6', 65002]]), '');
});

test('a full tie with one rival hides a step won against another rival -> ""', function () {
  assert.strictEqual(reasonOf([
    row('*>i', '203.0.113.0/24', '2.2.2.2', 0, 200, 0, '65002 i'),
    row('* i', '', '3.3.3.3', 0, 200, 0, '65002 i'),
    row('*', '', '10.1.0.2', 0, null, 0, '65002 i')
  ], [['2.2.2.2', 65001], ['3.3.3.3', 65001], ['10.1.0.2', 65002]]), '');
});

// ---- columns that cannot settle it: unknown instead of a guess ---------------------------------------------

test('multipath: the best and its "m" sibling tie, so the step is unknown even when a third path lost earlier', function () {
  assert.strictEqual(reasonOf([
    row('*>i', '203.0.113.0/24', '2.2.2.2', 0, 200, 0, '65002 i'),
    row('*mi', '', '3.3.3.3', 0, 200, 0, '65002 i'),
    row('* i', '', '10.1.0.2', 0, 100, 0, '65002 i')
  ], [['2.2.2.2', 65001], ['3.3.3.3', 65001], ['10.1.0.2', 65001]]), '');
});

test('the columns say a rival should have won (an attribute not shown decided) -> ""', function () {
  // the 10.1.0.10 path has higher weight than the marked best: something not printed (e.g. a policy) is at play,
  // so the AS_PATH win over 10.1.0.6 is not named either
  assert.strictEqual(reasonOf([
    row('*>', '203.0.113.0/24', '10.1.0.2', 0, null, 0, '65002 i'),
    row('*', '', '10.1.0.6', 0, null, 0, '65003 65002 i'),
    row('*', '', '10.1.0.10', 0, null, 50, '65004 i')
  ], EBGP3), '');
});

test('origin code missing from the Path column -> "" (not read as incomplete)', function () {
  assert.strictEqual(reasonOf([
    row('*>', '203.0.113.0/24', '10.1.0.2', 10, null, 0, '65002'),
    row('*', '', '10.1.0.6', 20, null, 0, '65002')
  ], [['10.1.0.2', 65002], ['10.1.0.6', 65002]]), '');
});

test('Path column empty -> "" (AS_PATH length cannot be read)', function () {
  assert.strictEqual(reasonOf([
    row('*>', '203.0.113.0/24', '10.1.0.2', 0, null, 0, ''),
    row('*', '', '10.1.0.6', 0, null, 0, '65003 i')
  ], EBGP3), '');
});

test('a step before AS_PATH still decides when the Path column is missing (Weight)', function () {
  assert.strictEqual(reasonOf([
    row('*>', '203.0.113.0/24', '10.1.0.2', 0, null, 100, ''),
    row('*', '', '10.1.0.6', 0, null, 0, '')
  ], EBGP3), 'Weight');
});

test('confederation segment in the AS_PATH -> "" (length and peer type depend on the confederation)', function () {
  assert.strictEqual(reasonOf([
    row('*>', '203.0.113.0/24', '10.1.0.2', 0, 100, 0, '(65010) 65002 i'),
    row('*', '', '10.1.0.6', 0, null, 0, '65003 65020 65002 i')
  ], EBGP3), '');
});

test('MED not compared across ASes but lower on the best: always-compare-med would name MED -> ""', function () {
  assert.strictEqual(reasonOf([
    row('* i', '203.0.113.0/24', '2.2.2.2', 50, 100, 0, '65003 i'),
    row('*>', '', '10.1.0.2', 10, null, 0, '65002 i')
  ], [['2.2.2.2', 65001], ['10.1.0.2', 65002]]), '');
});

test('MED not compared across ASes and higher on the best: the next step is still named', function () {
  // with always-compare-med the iBGP path would have won, so the device is not comparing MED here
  assert.strictEqual(reasonOf([
    row('* i', '203.0.113.0/24', '2.2.2.2', 10, 100, 0, '65003 i'),
    row('*>', '', '10.1.0.2', 50, null, 0, '65002 i')
  ], [['2.2.2.2', 65001], ['10.1.0.2', 65002]]), 'Peer Type');
});

test('MED blank on the best (missing = 0 by default) still decides; blank on the loser -> ""', function () {
  assert.strictEqual(reasonOf([
    row('*>', '203.0.113.0/24', '10.1.0.2', null, null, 0, '65002 i'),
    row('*', '', '10.1.0.6', 20, null, 0, '65002 i')
  ], [['10.1.0.2', 65002], ['10.1.0.6', 65002]]), 'MED');
  // the blank MED would win by default, so missing-as-worst (not shown) must be on: no guess
  assert.strictEqual(reasonOf([
    row('*>', '203.0.113.0/24', '10.1.0.2', 20, null, 0, '65002 i'),
    row('*', '', '10.1.0.6', null, null, 0, '65002 i')
  ], [['10.1.0.2', 65002], ['10.1.0.6', 65002]]), '');
});

test('two rows marked ">" for one prefix: no step is named for either', function () {
  assert.deepStrictEqual(reasonOf([
    row('*>', '203.0.113.0/24', '10.1.0.2', 0, null, 100, '65002 i'),
    row('*>', '', '10.1.0.6', 0, null, 0, '65003 i'),
    row('*', '', '10.1.0.10', 0, null, 0, '65004 i')
  ], EBGP3, 2), ['', '']);
});

test('explainBestPath: AS_SET / confederation counting on hand-built routes', function () {
  function R(o) { return Object.assign({ prefix: 'p', nextHop: '10.1.0.9', best: false, valid: true, ibgp: false, as_path: '65002', origin: 'IGP', local_pref: null, weight: 0, metric: 0, reason: '' }, o); }
  var rs = [R({ best: true, as_path: '65002 {65010,65011}' }), R({ as_path: '65003 65004 65005' })];
  ios.explainBestPath(rs);
  assert.strictEqual(rs[0].reason, 'AS Path');
  rs = [R({ best: true, as_path: '65002 {65010,65011}' }), R({ as_path: '65003 65004' })];
  ios.explainBestPath(rs);
  assert.strictEqual(rs[0].reason, '', 'equal length, nothing else differs');
});
