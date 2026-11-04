// bgp-multipath.test.js — BGP multipath (ECMP) in FRR json and IOS-XE text.
// Run: node --test        (from the repo root; Node >= 18, no dependencies)
//
// One prefix with 2-4 equal paths, in two forms:
//   - installed together (FRR "multipath": true, IOS "*m" next to the "*>" row with maximum-paths > 1);
//   - equal on every printed attribute but NOT installed together (maximum-paths 1: no multipath mark).
// For each case:
//   1. every installed path carries multipath: true in state.bgp_routes, the others do not;
//   2. exactly one path is best (status '*>'); the other installed paths read '*=';
//   3. the routing-table row of the prefix lists the same next hops as the installed BGP paths.
//
// What this output cannot tell (not tested, nothing is guessed):
//   - why a path is NOT multipath when it looks equal: IGP metric to the next hop, router id, AS_PATH content
//     (multipath-relax), eBGP vs iBGP mixing, and the maximum-paths value itself are not in these shows;
//   - for FRR json, the order of the paths in the FIB and whether the kernel actually installed them
//     (only zebra's fib flag on each next hop of `show ip route json`);
//   - for IOS, the per-path traffic share (unequal-cost / dmzlink-bw) and the outgoing interface of a
//     recursive next hop when no covering route is in the table;
//   - which path was chosen by "Older Path" vs "Router ID" among the multipath set (FRR names it, IOS does not).
'use strict';
var test = require('node:test');
var assert = require('node:assert');
var clab = require('../clab-collect.js');
var ios = require('../clab-iosxe-collect.js');

var PFX = '203.0.113.0';
var NHS = ['10.1.0.2', '10.1.0.6', '10.1.0.10', '10.1.0.14'];
var IFS = ['eth1', 'eth2', 'eth3', 'eth4'];

function installed(st) { return st.bgp_routes.filter(function (r) { return r.prefix === PFX && r.multipath; }); }
function rtRow(st) { return st.routing_table.filter(function (r) { return r.prefix === PFX + '/24'; })[0]; }
function rtNextHops(row) { return (row.nexthops || [{ ip: row.next_hop, iface: row.out_iface }]).map(function (h) { return h.ip; }).sort(); }

// common checks for an ECMP prefix: n installed paths, one best
function expectEcmp(st, n, bestNh, total) {
  var paths = st.bgp_routes.filter(function (r) { return r.prefix === PFX; });
  assert.strictEqual(paths.length, total, 'every path is kept');
  var best = paths.filter(function (r) { return r.best; });
  assert.strictEqual(best.length, 1, 'one best');
  assert.strictEqual(best[0].next_hop, bestNh);
  assert.strictEqual(best[0].status, '*>');
  var mp = installed(st);
  assert.strictEqual(mp.length, n, 'every installed path is marked');
  assert.ok(best[0].multipath, 'the best of an ECMP prefix is installed too');
  mp.filter(function (r) { return !r.best; }).forEach(function (r) { assert.strictEqual(r.status, '*='); });
  paths.filter(function (r) { return !r.multipath; }).forEach(function (r) { assert.ok(!r.best); assert.notStrictEqual(r.status, '*='); });
  var row = rtRow(st);
  assert.ok(row && row.selected, 'the prefix is in the routing table');
  assert.strictEqual(row.protocol, 'bgp');
  assert.deepStrictEqual(rtNextHops(row), mp.map(function (r) { return r.next_hop; }).sort(), 'RIB next hops = installed BGP paths');
  assert.ok(Array.isArray(row.nexthops) && row.nexthops.length === n, 'the ECMP list has every installed path');
  assert.strictEqual(row.next_hop, row.nexthops[0].ip, 'next_hop stays the first one');
}

// ---- FRR json -------------------------------------------------------------------------------------------------

// paths: [{nh, best, mp, valid}] ; ribNh: next hops (index into NHS) installed in the RIB
function frrBgp(paths, bestMp) {
  return { vrfId: 0, vrfName: 'default', tableVersion: 3, routerId: '10.0.0.1', defaultLocPrf: 100, localAS: 65001,
    routes: { '203.0.113.0/24': paths.map(function (p) {
      var o = { valid: p.valid !== false, pathFrom: 'external', prefix: PFX, prefixLen: 24, network: '203.0.113.0/24', weight: 0,
        peerId: p.nh, path: '65002 65010', origin: 'IGP', nexthops: [{ ip: p.nh, hostname: '', afi: 'ipv4', used: true }] };
      if (p.valid === false) delete o.valid;
      if (p.best) { o.bestpath = true; o.selectionReason = 'Older Path'; if (bestMp) o.multipath = true; }
      else if (p.mp) o.multipath = true;
      return o;
    }) } };
}
function frrRoute(ribIdx) {
  var r = { '203.0.113.0/24': [{ prefix: '203.0.113.0/24', protocol: 'bgp', selected: true, installed: true,
    nexthops: ribIdx.map(function (i) { return { ip: NHS[i], afi: 'ipv4', interfaceName: IFS[i], active: true, fib: true }; }) }] };
  ribIdx.forEach(function (i) {
    var net = NHS[i].replace(/\.\d+$/, '.' + (+NHS[i].split('.')[3] - 2)) + '/30';
    r[net] = [{ prefix: net, protocol: 'connected', selected: true, nexthops: [{ directlyConnected: true, interfaceName: IFS[i], active: true, fib: true }] }];
  });
  return r;
}
function frrSummary(n) {
  var peers = {}; for (var i = 0; i < n; i++) peers[NHS[i]] = { remoteAs: 65002, localAs: 65001, state: 'Established', peerUptime: '00:10:00', pfxRcd: 1 };
  return { ipv4Unicast: { as: 65001, routerId: '10.0.0.1', peers: peers } };
}
function frrState(paths, ribIdx, bestMp) {
  return clab.collectFromJson({ node: 'r1', proto: 'bgp', bgpConfigured: true,
    adjacency: ribIdx.map(function (i) { return { iface: IFS[i], peer: 'p' + i }; }),
    bgpSummary: frrSummary(paths.length), bgp: frrBgp(paths, bestMp), route: frrRoute(ribIdx) });
}

[2, 3, 4].forEach(function (n) {
  [false, true].forEach(function (bestMp) {
    test('FRR json: ' + n + ' equal paths installed' + (bestMp ? ' (best also carries multipath)' : ''), function () {
      var paths = NHS.slice(0, n).map(function (nh, i) { return { nh: nh, best: i === 0, mp: true }; });
      var idx = []; for (var i = 0; i < n; i++) idx.push(i);
      expectEcmp(frrState(paths, idx, bestMp), n, NHS[0], n);
    });
  });
});

test('FRR json: best is not the first path in the array', function () {
  var paths = [{ nh: NHS[0], mp: true }, { nh: NHS[1], mp: true }, { nh: NHS[2], best: true }];
  expectEcmp(frrState(paths, [0, 1, 2]), 3, NHS[2], 3);
});

test('FRR json: 3 equal paths, 2 installed (maximum-paths 2) - the third is a plain candidate', function () {
  var paths = [{ nh: NHS[0], best: true }, { nh: NHS[1], mp: true }, { nh: NHS[2] }];
  var st = frrState(paths, [0, 1]);
  expectEcmp(st, 2, NHS[0], 3);
  var third = st.bgp_routes.filter(function (r) { return r.next_hop === NHS[2]; })[0];
  assert.strictEqual(third.status, '* ');
  assert.ok(!third.multipath);
});

test('FRR json: equal paths, not installed (maximum-paths 1) - only the best, no multipath', function () {
  var paths = [{ nh: NHS[0], best: true }, { nh: NHS[1] }, { nh: NHS[2] }];
  var st = frrState(paths, [0]);
  assert.strictEqual(installed(st).length, 0);
  var ps = st.bgp_routes.filter(function (r) { return r.prefix === PFX; });
  assert.deepStrictEqual(ps.map(function (r) { return r.status; }), ['*>', '* ', '* ']);
  var row = rtRow(st);
  assert.strictEqual(row.next_hop, NHS[0]);
  assert.strictEqual(row.nexthops, undefined, 'one next hop: no ECMP list');
});

test('FRR json: an invalid path is never marked installed', function () {
  var paths = [{ nh: NHS[0], best: true }, { nh: NHS[1], mp: true }, { nh: NHS[2], valid: false }];
  var st = frrState(paths, [0, 1]);
  expectEcmp(st, 2, NHS[0], 3);
  var bad = st.bgp_routes.filter(function (r) { return r.next_hop === NHS[2]; })[0];
  assert.strictEqual(bad.valid, false);
  assert.strictEqual(bad.status, '  ');
});

// ---- IOS-XE text ----------------------------------------------------------------------------------------------

var HEADER = '     Network          Next Hop            Metric LocPrf Weight Path';
function lpad(s, end, line) { s = String(s); var n = end - line.length - s.length; return line + (n > 0 ? ' '.repeat(n) : ' ') + s; }
function row(status, net, nh) {
  var l = ' ' + String(status).padEnd(3) + '  ' + String(net).padEnd(17) + nh;
  l = lpad(0, 49, l); l = lpad(0, 63, l);
  return l + ' 65002 65010 i';
}
function iosTable(statuses) {
  return 'BGP table version is 9, local router ID is 10.0.0.1\n' +
    'Status codes: s suppressed, d damped, h history, * valid, > best, i - internal,\n' +
    '              r RIB-failure, S Stale, m multipath, b backup-path, f RT-Filter,\n' +
    '              x best-external, a additional-path, c RIB-compressed,\n' +
    'Origin codes: i - IGP, e - EGP, ? - incomplete\n\n' + HEADER + '\n' +
    statuses.map(function (s, i) { return row(s, i === 0 ? PFX + '/24' : '', NHS[i]); }).join('\n') + '\n';
}
function iosRoutes(ribIdx) {
  var t = 'Gateway of last resort is not set\n\n      10.0.0.0/8 is variably subnetted, 8 subnets, 2 masks\n';
  NHS.forEach(function (nh, i) {
    var net = nh.replace(/\.\d+$/, '.' + (+nh.split('.')[3] - 2));
    t += 'C        ' + net + '/30 is directly connected, Ethernet0/' + (i + 1) + '\n';
  });
  t += '      203.0.113.0/24 is subnetted, 1 subnets\n';
  ribIdx.forEach(function (i, k) {
    t += (k === 0 ? 'B        203.0.113.0 [20/0] via ' : '                     [20/0] via ') + NHS[i] + ', 00:01:02\n';
  });
  return t;
}
function iosSummary(n) {
  var s = 'BGP router identifier 10.0.0.1, local AS number 65001\nBGP table version is 9, main routing table version 9\n\n' +
    'Neighbor        V           AS MsgRcvd MsgSent   TblVer  InQ OutQ Up/Down  State/PfxRcd\n';
  for (var i = 0; i < n; i++) s += NHS[i].padEnd(16) + '4        65002      20      22        9    0    0 00:15:10        1\n';
  return s;
}
function iosState(statuses, ribIdx) {
  var warn = [];
  ios.parseBgpRoutes(iosTable(statuses), warn);
  assert.deepStrictEqual(warn, [], 'every row read');
  return ios.run({ bgp: iosTable(statuses), bgpSummary: iosSummary(statuses.length), route: iosRoutes(ribIdx) }, 'r1', '', 'bgp', '');
}

test('IOS-XE text: parseBgpRoutes reads "m" as multipath', function () {
  var r = ios.parseBgpRoutes(iosTable(['*m', '*>', '*']), []);
  assert.deepStrictEqual(r.map(function (x) { return !!x.multipath; }), [true, false, false]);
  assert.deepStrictEqual(r.map(function (x) { return x.best; }), [false, true, false]);
  assert.deepStrictEqual(r.map(function (x) { return x.status_raw; }), ['*m', '*>', '*']);
});

[2, 3, 4].forEach(function (n) {
  test('IOS-XE text: ' + n + ' equal paths installed (*> + *m)', function () {
    var st = [], idx = [];
    for (var i = 0; i < n; i++) { st.push(i === 1 ? '*>' : '*m'); idx.push(i); }
    expectEcmp(iosState(st, idx), n, NHS[1], n);
  });
});

test('IOS-XE text: iBGP multipath (*mi / *>i)', function () {
  var s = iosState(['*>i', '*mi'], [0, 1]);
  expectEcmp(s, 2, NHS[0], 2);
});

test('IOS-XE text: 3 equal paths, 2 installed - the plain "*" row is not marked', function () {
  var s = iosState(['*>', '*m', '*'], [0, 1]);
  expectEcmp(s, 2, NHS[0], 3);
  var third = s.bgp_routes.filter(function (r) { return r.next_hop === NHS[2]; })[0];
  assert.strictEqual(third.status, '* ');
});

test('IOS-XE text: equal paths, not installed (maximum-paths 1) - only the best', function () {
  var s = iosState(['*>', '*', '*'], [0]);
  assert.strictEqual(installed(s).length, 0);
  var row2 = rtRow(s);
  assert.strictEqual(row2.next_hop, NHS[0]);
  assert.strictEqual(row2.out_iface, 'Ethernet0/1');
  assert.strictEqual(row2.nexthops, undefined);
});

test('IOS-XE text: routing-table ECMP next hops resolve to their interfaces', function () {
  var row2 = rtRow(iosState(['*>', '*m', '*m'], [0, 1, 2]));
  assert.deepStrictEqual(row2.nexthops, [
    { ip: NHS[0], iface: 'Ethernet0/1' }, { ip: NHS[1], iface: 'Ethernet0/2' }, { ip: NHS[2], iface: 'Ethernet0/3' }]);
});

test('IOS: an m row without * (not valid) is not marked multipath', function () {
  var rows = ios.parseBgpRoutes(iosTable(['*>', ' m', '* ']), []);
  assert.strictEqual(rows.length, 3);
  assert.strictEqual(rows[1].valid, false);
  assert.ok(!rows[1].multipath, 'no * = not a candidate, not installed');
});
