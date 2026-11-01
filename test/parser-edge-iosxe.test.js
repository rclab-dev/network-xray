// parser-edge-iosxe.test.js — unusual IOS-XE `show` text must never make clab-iosxe-collect.js throw,
// and what cannot be read must be counted in parse_warnings instead of being guessed.
// Run: node --test        (from the repo root; Node >= 18, no dependencies)
//
// Feeds empty output, output cut by --More--, CLI errors, CRLF line endings and extra blank lines, wide
// BGP tables, long interface names, zero OSPF/BGP neighbors, a one-path BGP table and many ECMP next hops
// through the parsers and through run() (the same path as --from-dir). test/fixtures/iosxe-* give the
// shape of valid output.
'use strict';
var test = require('node:test');
var assert = require('node:assert');
var fs = require('fs');
var path = require('path');
var ios = require('../clab-iosxe-collect.js');

var FIX = path.join(__dirname, 'fixtures');
function loadNode(lab, node) {
  var tx = {};
  ios.CMDS.forEach(function (c) {
    var f = path.join(FIX, lab, node, c[1].replace(/ /g, '_') + '.txt');
    if (fs.existsSync(f)) tx[c[0]] = fs.readFileSync(f, 'utf8');
  });
  return tx;
}
function eachFixtureNode(fn) {
  fs.readdirSync(FIX).filter(function (d) { return /^iosxe-/.test(d); }).forEach(function (lab) {
    fs.readdirSync(path.join(FIX, lab)).filter(function (n) { return fs.statSync(path.join(FIX, lab, n)).isDirectory(); })
      .forEach(function (node) { fn(lab, node, loadNode(lab, node)); });
  });
}
function warnings(st, why) { return (st.parse_warnings || []).filter(function (w) { return !why || w.why === why; }); }

// the invariants every produced state must keep, whatever the input
function assertSane(st, node) {
  assert.ok(st && typeof st === 'object', 'state is an object');
  assert.strictEqual(st.success, true);
  assert.strictEqual(st.nos, 'ios-xe');
  assert.strictEqual(st.target_node, node || 'r1');
  assert.ok(st.interfaces && typeof st.interfaces === 'object' && !Array.isArray(st.interfaces), 'interfaces is an object');
  Object.keys(st.interfaces).forEach(function (k) {
    assert.strictEqual(typeof st.interfaces[k].up, 'boolean', 'interfaces.' + k + '.up is boolean');
    assert.strictEqual(typeof st.interfaces[k].ip, 'string', 'interfaces.' + k + '.ip is string');
  });
  assert.ok(Array.isArray(st.routing_table), 'routing_table is an array');
  st.routing_table.forEach(function (r) { assert.ok(/^\d+\.\d+\.\d+\.\d+\/\d+$/.test(r.prefix), 'routing_table prefix ' + r.prefix); });
  assert.ok(Array.isArray(st.bgp_neighbors), 'bgp_neighbors is an array');
  assert.ok(Array.isArray(st.ospf_neighbors), 'ospf_neighbors is an array');
  if (st.parse_warnings) assert.ok(Array.isArray(st.parse_warnings) && st.parse_warnings.length, 'parse_warnings is absent or a non-empty array');
  assert.doesNotThrow(function () { JSON.stringify(st); }, 'state is JSON-serializable');
}

var IFB_H = 'Interface              IP-Address      OK? Method Status                Protocol\n';
var OSPFN_H = 'Neighbor ID     Pri   State           Dead Time   Address         Interface\n';
var OSPFI_H = 'Interface    PID   Area            IP Address/Mask    Cost  State Nbrs F/C\n';
var BGP_H = '     Network          Next Hop            Metric LocPrf Weight Path\n';
var BGPS_H = 'BGP router identifier 1.1.1.1, local AS number 65001\nBGP table version is 4, main routing table version 4\n\n' +
  'Neighbor        V           AS MsgRcvd MsgSent   TblVer  InQ OutQ Up/Down  State/PfxRcd\n';
var ROUTE_H = 'Codes: L - local, C - connected, S - static, R - RIP, M - mobile, B - BGP\n' +
  '       + - replicated route, % - next hop override, p - overrides from PfR\n\nGateway of last resort is not set\n\n';

// a `show ip bgp` row with the numeric columns right-aligned under the header (as IOS prints it)
function bgpRow(status, net, nh, metric, lp, w, aspath) {
  var row = (' ' + status).padEnd(5) + String(net).padEnd(17) + nh;
  row = row.padEnd(48 - String(metric).length) + metric;
  row = row.padEnd(55 - String(lp).length) + lp;
  row = row.padEnd(62 - String(w).length) + w;
  return row + ' ' + aspath + '\n';
}

// ---- junk / empty input ------------------------------------------------------------------------

var JUNK = [undefined, null, '', '\n\n\n', '\r\n\r\n', 0, 42, true, {}, [], ' --More-- ',
  "% Invalid input detected at '^' marker.", '% Incomplete command.', '   ^\n% Invalid input detected at \'^\' marker.\n'];

test('every parser returns an empty result for junk input, without throwing', function () {
  JUNK.forEach(function (j) {
    var tag = JSON.stringify(j);
    assert.deepStrictEqual(ios.parseOspfNeighbors(j).list, [], 'parseOspfNeighbors ' + tag);
    assert.deepStrictEqual(ios.parseOspfInterfaces(j), {}, 'parseOspfInterfaces ' + tag);
    assert.deepStrictEqual(ios.parseInterfaces(j), {}, 'parseInterfaces ' + tag);
    assert.deepStrictEqual(ios.parseRoutes(j), [], 'parseRoutes ' + tag);
    assert.deepStrictEqual(ios.parseBgpSummary(j).list, [], 'parseBgpSummary ' + tag);
    assert.deepStrictEqual(ios.parseBgpRoutes(j), [], 'parseBgpRoutes ' + tag);
    assert.deepStrictEqual(ios.parseOspfInterfaceDetail(j), {}, 'parseOspfInterfaceDetail ' + tag);
    assert.deepStrictEqual(ios.parseOspfTraffic(j), {}, 'parseOspfTraffic ' + tag);
    assert.deepStrictEqual(ios.parseBridgeDomains(j), {}, 'parseBridgeDomains ' + tag);
    assert.strictEqual(typeof ios.normIf(j), 'string', 'normIf ' + tag);
    assert.ok(['Idle', 'Connect', 'Active', 'OpenSent', 'OpenConfirm', 'Established'].indexOf(ios.normBgpState(j).state) >= 0, 'normBgpState ' + tag);
  });
});

test('parseWarnings tolerates missing arguments', function () {
  assert.deepStrictEqual(ios.parseWarnings(null, null), []);
  assert.deepStrictEqual(ios.parseWarnings({ bgpSummary: 'x', ospfInterface: 'y' }), []);
});

test('run(): every command empty -> a sane state, "empty" counted for the always-printing shows', function () {
  var tx = {}; ios.CMDS.forEach(function (c) { tx[c[0]] = ''; });
  var st = ios.run(tx, 'r1', 'Ethernet0/1:r2', 'ospf', '');
  assertSane(st);
  var empty = warnings(st, 'empty').map(function (w) { return w.cmd; }).sort();
  assert.deepStrictEqual(empty, ['show ip interface brief', 'show ip route']);
  assert.strictEqual(warnings(st, 'unparsed').length, 0);
});

test('run(): no outputs at all (every key missing) -> a sane state', function () {
  assertSane(ios.run({}, 'r1', '', 'bgp', ''));
});

// ---- CRLF and blank lines ----------------------------------------------------------------------

test('CRLF line endings and extra blank lines give exactly the same state as the fixtures', function () {
  eachFixtureNode(function (lab, node, tx) {
    var noisy = {};
    Object.keys(tx).forEach(function (k) { noisy[k] = '\r\n\r\n' + tx[k].replace(/\n/g, '\r\n\r\n') + '\r\n\r\n\r\n'; });
    var a = ios.run(tx, node, 'Ethernet0/1:p,Ethernet0/2:q', 'bgp', '');
    var b = ios.run(noisy, node, 'Ethernet0/1:p,Ethernet0/2:q', 'bgp', '');
    assertSane(b, node);
    assert.deepStrictEqual(b, a, lab + '/' + node);
  });
});

test('fixtures (valid output) produce no unparsed-line warnings', function () {
  eachFixtureNode(function (lab, node, tx) {
    var st = ios.run(tx, node, 'Ethernet0/1:p,Ethernet0/2:q', 'ospf', '');
    assertSane(st, node);
    assert.deepStrictEqual(warnings(st, 'unparsed'), [], lab + '/' + node);
  });
});

test('splitByPrompt handles CRLF and blank lines between outputs', function () {
  var raw = 'r1#show ip ospf neighbor\r\n\r\n' + OSPFN_H.replace(/\n/g, '\r\n') +
    '1.1.1.1           1   FULL/BDR        00:00:33    10.10.0.10      Ethernet0/1\r\n\r\nr1#exit\r\n';
  var sp = ios.splitByPrompt(raw);
  assert.strictEqual(ios.parseOspfNeighbors(sp.ospfNeighbor).list.length, 1);
});

// ---- --More-- ----------------------------------------------------------------------------------

var MORE = ' --More-- \b\b\b\b\b\b\b\b\b         \b\b\b\b\b\b\b\b\b';

test('show ip route cut by --More--: the next route is not merged into the previous one', function () {
  var r = ROUTE_H + 'C        10.12.0.0/24 is directly connected, Ethernet0/1\n' +
    'O        10.1.0.0/24 [110/20] via 10.12.0.2, 00:01:02, Ethernet0/1\n' +
    MORE + 'O        10.4.0.0/24 [110/20] via 10.13.0.3, 00:01:02, Ethernet0/2\n' +
    '                     [110/20] via 10.12.0.2, 00:01:02, Ethernet0/1\n';
  var routes = ios.parseRoutes(r);
  var r1 = routes.filter(function (x) { return x.prefix === '10.1.0.0/24'; })[0];
  assert.deepStrictEqual(r1.nexthops.map(function (h) { return h.ip; }), ['10.12.0.2'], 'no invented ECMP next hop');
  var st = ios.run({ route: r, ipInterface: IFB_H + 'Ethernet0/1            10.12.0.1       YES NVRAM  up                    up\n' }, 'r1', 'Ethernet0/1:r2', 'ospf', '');
  assertSane(st);
  assert.ok(warnings(st, 'paging').some(function (w) { return w.cmd === 'show ip route'; }), 'paging counted');
});

test('show ip bgp cut by --More--: a path after the cut is not given to the previous prefix', function () {
  var b = BGP_H + bgpRow('*>', '10.1.0.0/24', '1.1.1.1', 0, '', 0, '65002 i') +
    MORE + bgpRow('*>', '10.2.0.0/24', '2.2.2.2', 0, '', 0, '65003 i') +
    bgpRow('* ', '', '3.3.3.3', 0, '', 0, '65004 65003 i');
  var rows = ios.parseBgpRoutes(b);
  assert.deepStrictEqual(rows.map(function (x) { return [x.prefix, x.nextHop]; }), [['10.1.0.0/24', '1.1.1.1']]);
  var st = ios.run({ bgp: b, bgpSummary: BGPS_H, route: ROUTE_H, ipInterface: IFB_H }, 'r1', '', 'bgp', '');
  assertSane(st);
  assert.ok(warnings(st, 'paging').some(function (w) { return w.cmd === 'show ip bgp'; }), 'paging counted');
});

test('--More-- in the table shows: rows on the cut line are dropped and paging is reported', function () {
  var tx = {
    ospfNeighbor: OSPFN_H + MORE + '1.1.1.1           1   FULL/BDR        00:00:33    10.10.0.10      Ethernet0/1\n',
    ospfInterface: OSPFI_H + MORE + 'Et0/1        1     0               10.10.0.20/24      10    DR    1/1\n',
    ipInterface: IFB_H + 'Ethernet0/1            10.10.0.20      YES NVRAM  up                    up\n --More-- ',
    bgpSummary: BGPS_H + MORE + '1.1.1.1         4        65001     112     115        4    0    0 00:05:38        0\n'
  };
  var st = ios.run(tx, 'r1', 'Ethernet0/1:r2', 'ospf', '');
  assertSane(st);
  assert.strictEqual(st.ospf_neighbors.length, 0);
  assert.deepStrictEqual(warnings(st, 'paging').map(function (w) { return w.cmd; }).sort(),
    ['show ip bgp summary', 'show ip interface brief', 'show ip ospf interface brief', 'show ip ospf neighbor']);
});

// ---- CLI errors --------------------------------------------------------------------------------

test('"% Invalid input" / "% Incomplete command" -> cli_error, nothing parsed, not double-counted', function () {
  var inv = "              ^\n% Invalid input detected at '^' marker.\n";
  var tx = { ospfNeighbor: inv, ospfInterface: inv, ipInterface: IFB_H + 'Ethernet0/1            10.10.0.20      YES NVRAM  up                    up\n',
             route: '% Incomplete command.\n', bgpSummary: inv, bgp: '% Incomplete command.\n' };
  var st = ios.run(tx, 'r1', 'Ethernet0/1:r2', 'bgp', '');
  assertSane(st);
  assert.deepStrictEqual(warnings(st, 'cli_error').map(function (w) { return w.cmd; }).sort(),
    ['show ip bgp', 'show ip bgp summary', 'show ip ospf interface brief', 'show ip ospf neighbor', 'show ip route']);
  assert.deepStrictEqual(warnings(st, 'unparsed'), []);
  assert.strictEqual(st.routing_table.length, 0);
  assert.strictEqual(st.bgp_neighbors.length, 0);
});

// ---- rows that cannot be read are counted, not guessed ----------------------------------------

test('truncated / glued rows are counted as unparsed', function () {
  var tx = {
    ospfNeighbor: OSPFN_H + '1.1.1.1           1   FULL/BDR        00:00:33    10.10.0.10      Ethernet0/1\n2.2.2.2           1   FULL/D\n',
    ipInterface: IFB_H + 'Ethernet0/1            10.10.0.20      YES NVRAM  up                    up\nGigabitEthernet0/0/0.1000010.0.0.2 YES NVRAM  up  up\n',
    bgpSummary: BGPS_H + '10.1.0.2        4        65002      20\n',
    route: ROUTE_H + 'C        10.10.0.0/24 is directly connected, Ethernet0/1\nO        10.4.0.0/24 [110/20] via\n'
  };
  var st = ios.run(tx, 'r1', 'Ethernet0/1:r2', 'ospf', '');
  assertSane(st);
  var u = {}; warnings(st, 'unparsed').forEach(function (w) { u[w.cmd] = w.count; });
  assert.deepStrictEqual(u, { 'show ip ospf neighbor': 1, 'show ip interface brief': 1, 'show ip bgp summary': 1, 'show ip route': 1 });
  assert.strictEqual(st.ospf_neighbors.length, 1, 'the cut neighbor row is not guessed');
  assert.strictEqual(st.bgp_neighbors.length, 0, 'the cut BGP neighbor row is not guessed');
});

// ---- wide tables / long names -----------------------------------------------------------------

test('wide show ip bgp: large numbers that fit their columns, and a long AS path, are read', function () {
  var b = BGP_H + bgpRow('*>i', '10.2.2.0/24', '10.0.0.2', 4294967295, 999999, 32768, '65002 4200000001 65003 65004 65005 65006 65007 65008 65009 65010 65011 65012 ?');
  var r = ios.parseBgpRoutes(b)[0];
  assert.strictEqual(r.metric, 4294967295);
  assert.strictEqual(r.local_pref, 999999);
  assert.strictEqual(r.weight, 32768);
  assert.strictEqual(r.as_path, '65002 4200000001 65003 65004 65005 65006 65007 65008 65009 65010 65011 65012');
  assert.strictEqual(r.origin, 'incomplete');
});

test('wide show ip bgp: numbers wider than their column (shifted or run together) are counted, not guessed', function () {
  var shifted = ' *>i  10.2.2.0/24      10.0.0.2        4294967295 4294967295  32768 65002 ?\n';
  var glued = ' *>i  10.3.3.0/24      10.0.0.2        4294967295429496729532768 65002 ?\n';
  var ok = bgpRow('*>i', '10.4.4.0/24', '10.0.0.2', 0, 100, 0, '65002 i');
  var warn = [];
  var rows = ios.parseBgpRoutes(BGP_H + shifted + glued + ok, warn);
  assert.deepStrictEqual(rows.map(function (x) { return x.prefix; }), ['10.4.4.0/24'], 'no weight / AS path guessed from shifted columns');
  assert.strictEqual(warn.length, 2);
  var st = ios.run({ bgp: BGP_H + shifted + glued + ok, bgpSummary: BGPS_H, route: ROUTE_H, ipInterface: IFB_H }, 'r1', '', 'bgp', '');
  assertSane(st);
  assert.deepStrictEqual(warnings(st, 'unparsed').map(function (w) { return [w.cmd, w.count]; }), [['show ip bgp', 2]]);
});

test('wide show ip bgp: a long network goes on its own line, next hop on the next', function () {
  var b = BGP_H + ' *>   192.168.100.128/25\n' + bgpRow('', '', '10.0.0.2', 0, 100, 0, '65002 i');
  var r = ios.parseBgpRoutes(b);
  assert.strictEqual(r.length, 1);
  assert.strictEqual(r[0].prefix, '192.168.100.128/25');
  assert.strictEqual(r[0].best, true);
});

test('wide show ip bgp: an AS path wrapped onto the next line is counted, and the next path is not misfiled', function () {
  var b = BGP_H + bgpRow('*>', '10.1.0.0/24', '1.1.1.1', 0, '', 0, '65002 65003 65004') +
    '                                                               65005 i\n' +
    bgpRow('* ', '', '2.2.2.2', 0, '', 0, '65009 i');
  var warn = [];
  var rows = ios.parseBgpRoutes(b, warn);
  assert.deepStrictEqual(rows.map(function (x) { return x.nextHop; }), ['1.1.1.1']);
  assert.strictEqual(warn.length, 1);
  assert.strictEqual(warn[0].cmd, 'show ip bgp');
});

test('long interface names are read in full in every table', function () {
  var ifb = IFB_H + 'GigabitEthernet0/0/0.1000 10.1.0.1     YES NVRAM  up                    up\n' +
    'TwentyFiveGigE1/0/1    10.2.0.1        YES NVRAM  administratively down down\n' +
    'Port-channel10.100     10.3.0.1        YES NVRAM  up                    up\n';
  var i = ios.parseInterfaces(ifb);
  assert.deepStrictEqual(Object.keys(i).sort(), ['GigabitEthernet0/0/0.1000', 'Port-channel10.100', 'TwentyFiveGigE1/0/1']);
  assert.strictEqual(i['TwentyFiveGigE1/0/1'].adminDown, true);
  var n = ios.parseOspfNeighbors(OSPFN_H + '10.0.0.2          1   FULL/DR         00:00:33    10.1.0.2        GigabitEthernet0/0/0.1000\n' +
    '10.0.0.3          0   FULL/  -        00:00:32    10.3.0.2        Port-channel10.100\n');
  assert.deepStrictEqual(n.list.map(function (x) { return x.iface; }), ['GigabitEthernet0/0/0.1000', 'Port-channel10.100']);
  var o = ios.parseOspfInterfaces(OSPFI_H + 'Gi0/0/0.1000 1     0               10.1.0.1/24        1     DR    1/1\n' +
    'Twe1/0/1     1     0.0.0.1         10.2.0.1/24        1     DOWN  0/0\n');
  assert.deepStrictEqual(Object.keys(o).sort(), ['GigabitEthernet0/0/0.1000', 'TwentyFiveGigE1/0/1']);
  var r = ios.parseRoutes(ROUTE_H + 'C        10.1.0.0/24 is directly connected, GigabitEthernet0/0/0.1000\n');
  assert.strictEqual(r[0].nexthops[0].iface, 'GigabitEthernet0/0/0.1000');
});

// ---- zero neighbors / one path / many ECMP next hops ------------------------------------------

test('zero OSPF and BGP neighbors are real answers: empty lists, no warnings', function () {
  var tx = loadNode('iosxe-q15', 'r2');
  tx.ospfNeighbor = OSPFN_H;
  tx.bgpSummary = BGPS_H;
  tx.bgp = '';
  var st = ios.run(tx, 'r2', 'Ethernet0/1:r1,Ethernet0/2:r3', 'bgp', '');
  assertSane(st, 'r2');
  assert.strictEqual(st.ospf_neighbors.length, 0);
  assert.strictEqual(st.bgp_neighbors.length, 0);
  assert.strictEqual(st.full_count, 0);
  assert.strictEqual(st.parse_warnings, undefined);
});

test('a BGP table with only one path: it is best, "First path received"', function () {
  var tx = loadNode('iosxe-q15', 'r2');   // its show ip bgp has exactly one path
  var st = ios.run(tx, 'r2', 'Ethernet0/1:r1,Ethernet0/2:r3', 'bgp', '');
  assertSane(st, 'r2');
  assert.strictEqual(st.bgp_routes.length, 1);
  var p = st.bgp_routes[0];
  assert.strictEqual(p.prefix, '8.8.8.0');
  assert.strictEqual(p.prefixlen, 24);
  var raw = ios.parseBgpRoutes(tx.bgp);
  assert.strictEqual(raw.length, 1);
  assert.strictEqual(raw[0].best, true);
});

test('a route with 8 ECMP next hops keeps all of them, in order', function () {
  var r = ROUTE_H + '      10.0.0.0/8 is variably subnetted, 9 subnets, 2 masks\n';
  var ifb = IFB_H, adj = [];
  for (var k = 1; k <= 8; k++) {
    r += 'C        10.' + k + '.0.0/24 is directly connected, Ethernet' + Math.floor(k / 4) + '/' + (k % 4) + '\n';
    ifb += ('Ethernet' + Math.floor(k / 4) + '/' + (k % 4)).padEnd(23) + ('10.' + k + '.0.1').padEnd(16) + 'YES NVRAM  up                    up\n';
    adj.push('Ethernet' + Math.floor(k / 4) + '/' + (k % 4) + ':r' + (k + 1));
  }
  r += 'O        10.99.0.0/24 [110/20] via 10.1.0.2, 00:01:02, Ethernet0/1\n';
  for (k = 2; k <= 8; k++) r += '                      [110/20] via 10.' + k + '.0.2, 00:01:02, Ethernet' + Math.floor(k / 4) + '/' + (k % 4) + '\n';
  var parsed = ios.parseRoutes(r).filter(function (x) { return x.prefix === '10.99.0.0/24'; })[0];
  assert.strictEqual(parsed.nexthops.length, 8);
  var st = ios.run({ route: r, ipInterface: ifb }, 'r1', adj.join(','), 'ospf', '');
  assertSane(st);
  var row = st.routing_table.filter(function (x) { return x.prefix === '10.99.0.0/24'; })[0];
  assert.deepStrictEqual(row.nexthops.map(function (h) { return h.ip; }), [1, 2, 3, 4, 5, 6, 7, 8].map(function (k) { return '10.' + k + '.0.2'; }));
  assert.ok(row.nexthops.every(function (h) { return /^Ethernet\d\/\d$/.test(h.iface); }));
  assert.strictEqual(st.parse_warnings, undefined);
});

test('ECMP BGP next hops without an interface resolve recursively, not guessed', function () {
  var r = ROUTE_H + 'C        10.12.0.0/24 is directly connected, Ethernet0/1\n' +
    'B        8.8.8.0/24 [200/0] via 10.12.0.2, 00:00:04\n                   [200/0] via 10.77.0.2, 00:00:04\n';
  var x = ios.parseRoutes(r).filter(function (y) { return y.prefix === '8.8.8.0/24'; })[0];
  assert.strictEqual(x.nexthops[0].iface, 'Ethernet0/1');
  assert.strictEqual(x.nexthops[1].iface, '', 'no route covers 10.77.0.2 -> no interface invented');
});
