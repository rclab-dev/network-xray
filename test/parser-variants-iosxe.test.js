// parser-variants-iosxe.test.js — real-world variations of the IOS-XE `show` outputs that
// clab-iosxe-collect.js reads: long interface names and wrapped lines, empty tables, "% ..." lines,
// extra header lines (exec prompt timestamps), and BGP / OSPF entries with unusual but valid values.
// Run: node --test        (from the repo root; Node >= 18, no dependencies)
//
// The inputs are written inline. Their shape follows the captured outputs in test/fixtures/iosxe-*
// (column layout, headers) and the output formats in Cisco's IOS-XE command references (default route
// "O*E2", routes wrapped onto a second line, "Load for five secs" / "Time source is" header lines of
// `terminal exec prompt timestamp`, RPKI validation codes in `show ip bgp`, asdot AS numbers).
'use strict';
var test = require('node:test');
var assert = require('node:assert');
var fs = require('fs');
var path = require('path');
var ios = require('../clab-iosxe-collect.js');

var FIX = path.join(__dirname, 'fixtures');
function eachFixtureNode(fn) {
  fs.readdirSync(FIX).filter(function (d) { return /^iosxe-/.test(d); }).forEach(function (lab) {
    fs.readdirSync(path.join(FIX, lab)).filter(function (n) { return fs.statSync(path.join(FIX, lab, n)).isDirectory(); })
      .forEach(function (node) {
        var tx = {};
        ios.CMDS.forEach(function (c) {
          var f = path.join(FIX, lab, node, c[1].replace(/ /g, '_') + '.txt');
          if (fs.existsSync(f)) tx[c[0]] = fs.readFileSync(f, 'utf8');
        });
        fn(lab, node, tx);
      });
  });
}

var TS = 'Load for five secs: 1%/0%; one minute: 1%; five minutes: 1%\n' +
  'Time source is NTP, 09:12:01.123 UTC Wed Nov 4 2026\n\n';
var IFB_H = 'Interface              IP-Address      OK? Method Status                Protocol\n';
var OSPFN_H = 'Neighbor ID     Pri   State           Dead Time   Address         Interface\n';
var OSPFI_H = 'Interface    PID   Area            IP Address/Mask    Cost  State Nbrs F/C\n';
var BGP_PRE = 'BGP table version is 4, local router ID is 1.1.1.1\n' +
  'Status codes: s suppressed, d damped, h history, * valid, > best, i - internal, \n' +
  '              r RIB-failure, S Stale, m multipath, b backup-path, f RT-Filter, \n' +
  'Origin codes: i - IGP, e - EGP, ? - incomplete\n' +
  'RPKI validation codes: V valid, I invalid, N Not found\n\n';
var BGP_H = '     Network          Next Hop            Metric LocPrf Weight Path\n';
var BGPS_H = 'Neighbor        V           AS MsgRcvd MsgSent   TblVer  InQ OutQ Up/Down  State/PfxRcd\n';
var ROUTE_H = 'Codes: L - local, C - connected, S - static, R - RIP, M - mobile, B - BGP\n' +
  '       O - OSPF, IA - OSPF inter area, E1 - OSPF external type 1, E2 - OSPF external type 2\n' +
  '       + - replicated route, % - next hop override, p - overrides from PfR\n\n';

// a `show ip bgp` row with the numeric columns right-aligned under the header (as IOS prints it)
function bgpRow(status, net, nh, metric, lp, w, aspath) {
  var row = (' ' + status).padEnd(5) + String(net).padEnd(17) + nh;
  row = row.padEnd(48 - String(metric).length) + metric;
  row = row.padEnd(55 - String(lp).length) + lp;
  row = row.padEnd(62 - String(w).length) + w;
  return row + ' ' + aspath + '\n';
}
function unparsed(st) { return (st.parse_warnings || []).filter(function (w) { return w.why === 'unparsed'; }); }

// ---- extra header lines / timestamps -----------------------------------------------------------

test('exec prompt timestamp lines before each captured output: same state, no unparsed warnings', function () {
  eachFixtureNode(function (lab, node, tx) {
    var stamped = {};
    Object.keys(tx).forEach(function (k) { stamped[k] = TS + tx[k]; });
    var a = ios.run(tx, node, 'Ethernet0/1:p,Ethernet0/2:q', 'ospf', '');
    var b = ios.run(stamped, node, 'Ethernet0/1:p,Ethernet0/2:q', 'ospf', '');
    assert.deepStrictEqual(b, a, lab + '/' + node);
    assert.deepStrictEqual(unparsed(b), [], lab + '/' + node);
  });
});

test('timestamp lines are not counted by any table parser', function () {
  var w = [];
  ios.parseOspfNeighbors(TS + OSPFN_H, w);
  ios.parseOspfInterfaces(TS + OSPFI_H, w);
  ios.parseInterfaces(TS + IFB_H, null, w);
  ios.parseRoutes(TS + ROUTE_H + 'Gateway of last resort is not set\n', w);
  ios.parseBgpSummary(TS + BGPS_H, w);
  ios.parseBgpRoutes(TS + BGP_PRE + BGP_H, w);
  assert.deepStrictEqual(w, []);
});

// ---- empty tables ------------------------------------------------------------------------------

test('header-only tables are empty results, not warnings', function () {
  var w = [];
  assert.deepStrictEqual(ios.parseOspfNeighbors(OSPFN_H, w).list, []);
  assert.deepStrictEqual(ios.parseOspfInterfaces(OSPFI_H, w), {});
  assert.deepStrictEqual(ios.parseInterfaces(IFB_H, null, w), {});
  assert.deepStrictEqual(ios.parseRoutes(ROUTE_H + 'Gateway of last resort is not set\n\n', w), []);
  var s = ios.parseBgpSummary('BGP router identifier 1.1.1.1, local AS number 65001\nBGP table version is 1, main routing table version 1\n\n' + BGPS_H, w);
  assert.deepStrictEqual(s.list, []);
  assert.strictEqual(s.localAs, '65001');
  assert.deepStrictEqual(ios.parseBgpRoutes(BGP_PRE + BGP_H, w), []);
  assert.deepStrictEqual(w, []);
});

// ---- "% ..." lines -----------------------------------------------------------------------------

test('"% ..." informational lines give empty results and are not counted as unparsed', function () {
  ['% BGP not active\n', '% OSPF: No router process 1\n', '%No OSPF neighbors found\n'].forEach(function (t) {
    var w = [];
    assert.deepStrictEqual(ios.parseBgpSummary(t, w).list, []);
    assert.deepStrictEqual(ios.parseBgpRoutes(t, w), []);
    assert.deepStrictEqual(ios.parseOspfNeighbors(t, w).list, []);
    assert.deepStrictEqual(ios.parseOspfInterfaces(t, w), {});
    assert.deepStrictEqual(w, [], JSON.stringify(t));
  });
});

// ---- long interface names and wrapped lines ----------------------------------------------------

test('long interface names with subinterfaces are read in every table', function () {
  var w = [];
  var ifb = ios.parseInterfaces(IFB_H +
    'TwentyFiveGigE1/0/1.4094 10.0.0.1      YES manual up                    up\n' +
    'Port-channel10.100     unassigned      YES unset  administratively down down\n', null, w);
  assert.deepStrictEqual(Object.keys(ifb), ['TwentyFiveGigE1/0/1.4094', 'Port-channel10.100']);
  assert.strictEqual(ifb['Port-channel10.100'].adminDown, true);
  var n = ios.parseOspfNeighbors(OSPFN_H +
    '10.255.255.254  255   FULL/DROTHER    00:00:39    10.0.0.2        TwentyFiveGigE1/0/1.4094\n', w);
  assert.strictEqual(n.list[0].iface, 'TwentyFiveGigE1/0/1.4094');
  var oi = ios.parseOspfInterfaces(OSPFI_H + 'Twe1/0/1.4094 1     0.0.0.0         10.0.0.1/30        1     P2P   1/1\n', w);
  assert.deepStrictEqual(Object.keys(oi), ['TwentyFiveGigE1/0/1.4094']);
  assert.deepStrictEqual(w, []);
});

test('show ip route: a route wrapped onto a second line keeps its next hop, distance and metric', function () {
  var w = [];
  var r = ios.parseRoutes(ROUTE_H + 'Gateway of last resort is not set\n\n' +
    '      10.0.0.0/8 is variably subnetted, 3 subnets, 2 masks\n' +
    'C        10.0.0.0/30 is directly connected, TenGigabitEthernet1/0/1.4094\n' +
    'L        10.0.0.1/32 is directly connected, TenGigabitEthernet1/0/1.4094\n' +
    'O E2     10.200.0.0/16 \n' +
    '           [110/20] via 10.0.0.2, 1w2d, TenGigabitEthernet1/0/1.4094\n', w);
  var x = r.filter(function (e) { return e.prefix === '10.200.0.0/16'; })[0];
  assert.strictEqual(x.subtype, 'E2');
  assert.strictEqual(x.distance, 110);
  assert.strictEqual(x.metric, 20);
  assert.deepStrictEqual(x.nexthops.map(function (h) { return [h.ip, h.iface]; }), [['10.0.0.2', 'TenGigabitEthernet1/0/1.4094']]);
  assert.deepStrictEqual(w, []);
});

// ---- OSPF: unusual but valid values ------------------------------------------------------------

test('show ip route: an OSPF default route printed as "O*E2" (no blank before the subcode) is read', function () {
  var w = [];
  var r = ios.parseRoutes(ROUTE_H + 'Gateway of last resort is 10.0.0.2 to network 0.0.0.0\n\n' +
    'O*E2  0.0.0.0/0 [110/1] via 10.0.0.2, 00:01:02, Ethernet0/1\n' +
    'O*IA  0.0.0.0/0 [110/11] via 10.0.0.6, 00:01:02, Ethernet0/2\n', w);
  assert.deepStrictEqual(r.map(function (e) { return [e.prefix, e.protocol, e.subtype, e.distance, e.metric, e.nexthops[0].iface]; }),
    [['0.0.0.0/0', 'ospf', 'E2', 110, 1, 'Ethernet0/1'], ['0.0.0.0/0', 'ospf', 'IA', 110, 11, 'Ethernet0/2']]);
  assert.deepStrictEqual(w, []);
});

test('show ip route: other codes with a star and blanks are read as before', function () {
  var r = ios.parseRoutes(ROUTE_H + 'S*    0.0.0.0/0 [1/0] via 10.0.0.2\n' + 'O IA     10.9.0.0/24 [110/65535] via 10.0.0.2, 00:01:02, Ethernet0/1\n');
  assert.deepStrictEqual(r.map(function (e) { return [e.prefix, e.protocol, e.subtype, e.metric]; }),
    [['0.0.0.0/0', 'static', '', 0], ['10.9.0.0/24', 'ospf', 'IA', 65535]]);
});

test('OSPF neighbor / interface tables: priority 255, ExStart/-, no dead time, decimal and dotted areas, max cost', function () {
  var w = [];
  var n = ios.parseOspfNeighbors(OSPFN_H +
    '10.0.0.9          0   EXSTART/  -     00:00:31    10.0.0.10       Tunnel100\n' +
    '10.0.0.8        255   2WAY/DROTHER    -           10.0.0.11       Port-channel10\n', w);
  assert.deepStrictEqual(n.list.map(function (x) { return [x.rid, x.state, x.full, x.iface]; }),
    [['10.0.0.9', 'ExStart/-', false, 'Tunnel100'], ['10.0.0.8', '2-Way/DROther', false, 'Port-channel10']]);
  var oi = ios.parseOspfInterfaces(OSPFI_H +
    'Et0/1        65535 4294967295      10.0.0.1/30        65535 DROTH 0/0\n' +
    'Lo0          1     0.0.0.10        10.255.0.1/32      1     LOOP  0/0\n' +
    'Et0/3        1     0               10.0.3.1/24        10    WAIT  0/0\n', w);
  assert.deepStrictEqual([oi['Ethernet0/1'].area, oi['Ethernet0/1'].cost, oi['Loopback0'].area, oi['Ethernet0/3'].area],
    ['4294967295', 65535, '0.0.0.10', '0']);
  assert.deepStrictEqual(w, []);
});

// ---- BGP: unusual but valid values -------------------------------------------------------------

test('show ip bgp summary: 4-byte and asdot AS numbers, long uptime, large counters, Idle (Admin) / (PfxCt)', function () {
  var w = [];
  var s = ios.parseBgpSummary('BGP router identifier 10.0.0.1, local AS number 65000.100\n' +
    'BGP table version is 9, main routing table version 9\n4 network entries using 992 bytes of memory\n\n' + BGPS_H +
    '192.0.2.1       4   4200000000 4294967295 12345678 9 0 0 52w6d         4294967\n' +
    '192.0.2.5       4    65000.200       0       0        1    0    0 never    Idle (Admin)\n' +
    '192.0.2.9       4    65000.100       0       0        1    0    0 00:00:05 Idle (PfxCt)\n', w);
  assert.deepStrictEqual(s.list.map(function (x) { return [x.ip, x.remoteAs, x.state, x.pfxRcd, x.upDown, x.ibgp, !!x.admin_down, !!x.max_prefix]; }), [
    ['192.0.2.1', 4200000000, 'Established', 4294967, '52w6d', false, false, false],
    ['192.0.2.5', '65000.200', 'Idle', null, 'never', false, true, false],
    ['192.0.2.9', '65000.100', 'Idle', null, '00:00:05', true, false, true]]);
  assert.deepStrictEqual(w, []);
});

test('show ip bgp: AS_SET, confederation segment, 4-byte AS, max metric / local-pref / weight', function () {
  var w = [];
  var r = ios.parseBgpRoutes(BGP_PRE + BGP_H +
    bgpRow('*>', '10.9.0.0/16', '192.0.2.1', 4294967295, '', 65535, '{65003,65004} ?') +
    bgpRow('*>i', '10.10.0.0/16', '10.0.0.2', '', 4294967295, 0, '65002 i') +
    bgpRow('*>i', '10.8.0.0/16', '10.0.0.2', 0, 100, 0, '(65010 65011) 4200000000 e'), w);
  assert.deepStrictEqual(r.map(function (x) { return [x.prefix, x.metric, x.local_pref, x.weight, x.as_path, x.origin]; }), [
    ['10.9.0.0/16', 4294967295, null, 65535, '{65003,65004}', 'incomplete'],
    ['10.10.0.0/16', null, 4294967295, 0, '65002', 'IGP'],
    ['10.8.0.0/16', 0, 100, 0, '(65010 65011) 4200000000', 'EGP']]);
  assert.deepStrictEqual(w, []);
});

test('show ip bgp: the default route printed without a mask is 0.0.0.0/0', function () {
  var r = ios.parseBgpRoutes(BGP_PRE + BGP_H + bgpRow('*>', '0.0.0.0', '192.0.2.1', 0, '', 0, '65002 i'));
  assert.deepStrictEqual(r.map(function (x) { return [x.prefix, x.best]; }), [['0.0.0.0/0', true]]);
  // other networks without a mask keep their classful length
  var c = ios.parseBgpRoutes(BGP_PRE + BGP_H + bgpRow('*>', '172.16.0.0', '192.0.2.1', 0, '', 0, '65002 i'));
  assert.strictEqual(c[0].prefix, '172.16.0.0/16');
});

test('show ip bgp: rows with an RPKI validation code are read like the same rows without it', function () {
  var w = [];
  var withCode = ios.parseBgpRoutes(BGP_PRE + BGP_H +
    bgpRow('V*>', '10.7.0.0/16', '192.0.2.1', 0, '', 0, '65002 i') +
    bgpRow('N*', '', '192.0.2.5', 0, '', 0, '65003 i') +
    bgpRow('I*>i', '10.6.0.0/16', '10.0.0.2', 0, 100, 0, 'i'), w);
  var plain = ios.parseBgpRoutes(BGP_PRE + BGP_H +
    bgpRow('*>', '10.7.0.0/16', '192.0.2.1', 0, '', 0, '65002 i') +
    bgpRow('*', '', '192.0.2.5', 0, '', 0, '65003 i') +
    bgpRow('*>i', '10.6.0.0/16', '10.0.0.2', 0, 100, 0, 'i'));
  assert.deepStrictEqual(w, []);
  assert.strictEqual(withCode.length, 3);
  assert.deepStrictEqual(withCode, plain);
});
