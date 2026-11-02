// iosxe-ospf-states.test.js — IOS / IOS-XE `show ip ospf neighbor` and `show ip ospf interface brief`
// (plain text) across every neighbor state and the usual layouts: the parsed neighbor list, the states
// and the per-interface neighbor counts must match what IOS printed.
// Run: node --test        (from the repo root; Node >= 18, no dependencies)
//
// The outputs below follow the column layout of test/fixtures/iosxe-*/<node>/show_ip_ospf_*.txt.
// States are given back in FRR spelling (Full/DR, Full/Backup, 2-Way/DROther, ExStart/DR, ...), the
// spelling the engine (xray-core.js) compares against.
'use strict';
var test = require('node:test');
var assert = require('node:assert');
var ios = require('../clab-iosxe-collect.js');

var NEI_HDR = '\nNeighbor ID     Pri   State           Dead Time   Address         Interface\n';
var IFB_HDR = 'Interface    PID   Area            IP Address/Mask    Cost  State Nbrs F/C\n';

// r1: DR on the LAN Et0/1 (three neighbors), areas 0 / 1 / 2 / 3, one neighbor in every other state.
var R1_NEI = NEI_HDR +
  '2.2.2.2           1   FULL/BDR        00:00:38    10.0.12.2       Ethernet0/1\n' +
  '3.3.3.3           1   FULL/DROTHER    00:00:31    10.0.12.3       Ethernet0/1\n' +
  '4.4.4.4           1   FULL/DROTHER    00:00:33    10.0.12.4       Ethernet0/1\n' +
  '5.5.5.5           0   FULL/  -        00:00:35    10.1.15.5       Ethernet0/2\n' +
  '6.6.6.6           1   INIT/DROTHER    00:00:36    10.1.16.6       Ethernet0/3\n' +
  '7.7.7.7           1   EXSTART/DR      00:00:37    10.2.17.7       Ethernet1/0\n' +
  '8.8.8.8           1   EXCHANGE/BDR    00:00:32    10.2.18.8       Ethernet1/1\n' +
  '9.9.9.9           0   LOADING/  -     00:00:39    10.2.19.9       Ethernet1/2\n' +
  '10.10.10.10       1   DOWN/DROTHER    -           10.3.0.10       Ethernet1/3\n';
var R1_IFB = IFB_HDR +
  'Lo0          1     0               1.1.1.1/32         1     LOOP  0/0\n' +
  'Et0/1        1     0               10.0.12.1/24       10    DR    3/3\n' +
  'Et0/2        1     1               10.1.15.1/30       10    P2P   1/1\n' +
  'Et0/3        1     1               10.1.16.1/24       10    DR    0/1\n' +
  'Et1/0        1     2               10.2.17.1/24       10    BDR   0/1\n' +
  'Et1/1        1     2               10.2.18.1/24       10    DR    0/1\n' +
  'Et1/2        1     2               10.2.19.1/30       10    P2P   0/1\n' +
  'Et1/3        1     3               10.3.0.1/24        10    DR    0/1\n' +
  'Et2/0        1     3               10.3.20.1/24       10    DR    0/0\n' +
  'Et2/1        1     3               10.3.21.1/24       10    DOWN  0/0\n';

// r3: DROTHER on the same LAN: Full with the DR and the BDR, 2WAY with the other DROTHER (normal).
var R3_NEI = NEI_HDR +
  '1.1.1.1           1   FULL/DR         00:00:38    10.0.12.1       Ethernet0/1\n' +
  '2.2.2.2           1   FULL/BDR        00:00:35    10.0.12.2       Ethernet0/1\n' +
  '4.4.4.4           1   2WAY/DROTHER    00:00:33    10.0.12.4       Ethernet0/1\n';
var R3_IFB = IFB_HDR +
  'Lo0          1     0               3.3.3.3/32         1     LOOP  0/0\n' +
  'Et0/1        1     0               10.0.12.3/24       10    DROTH 2/3\n';
var R3_IPB = 'Interface              IP-Address      OK? Method Status                Protocol\n' +
  'Ethernet0/0            172.20.20.3     YES TFTP   up                    up\n' +
  'Ethernet0/1            10.0.12.3       YES TFTP   up                    up\n' +
  'Loopback0              3.3.3.3         YES TFTP   up                    up\n';
var R3_RT = 'Codes: L - local, C - connected, S - static, R - RIP, M - mobile, B - BGP\n\n' +
  'Gateway of last resort is not set\n\n' +
  '      3.0.0.0/32 is subnetted, 1 subnets\n' +
  'C        3.3.3.3 is directly connected, Loopback0\n' +
  '      10.0.0.0/8 is variably subnetted, 2 subnets, 2 masks\n' +
  'C        10.0.12.0/24 is directly connected, Ethernet0/1\n' +
  'L        10.0.12.3/32 is directly connected, Ethernet0/1\n';

// r4: long interface names (sub-interfaces, port-channel), dotted and large area numbers.
var R4_NEI = NEI_HDR +
  '10.255.255.1      1   FULL/DR         00:00:34    172.16.100.1    TenGigabitEthernet1/0/1.1000\n' +
  '10.255.255.2      0   FULL/  -        00:00:39    172.16.200.2    Port-channel10.200\n' +
  '10.255.255.3      1   FULL/DR         00:00:36    172.16.250.1   GigabitEthernet0/0/0.4094\n' +
  '10.255.255.5      1   2WAY/DROTHER    00:00:31    172.16.250.5   GigabitEthernet0/0/0.4094\n';
var R4_IFB = IFB_HDR +
  'Te1/0/1.1000 1     0               172.16.100.2/24    1     BDR   1/1\n' +
  'Po10.200     1     10.0.0.1        172.16.200.1/30    1     P2P   1/1\n' +
  'Gi0/0/0.4094 1     4294967295      172.16.250.4/24   1     DROTH 1/2\n';

function byIfaceList(list) {
  var g = {};
  list.forEach(function (n) { (g[n.iface] = g[n.iface] || []).push(n); });
  return g;
}
function counts(list) {
  var g = byIfaceList(list), out = {};
  Object.keys(g).forEach(function (k) { out[k] = { full: g[k].filter(function (n) { return n.full; }).length, count: g[k].length }; });
  return out;
}
// every OSPF interface's F/C as IOS printed it == the neighbors parsed on that interface
function assertCountsMatch(ifb, nei) {
  var c = counts(nei.list);
  Object.keys(ifb).forEach(function (ifn) {
    var got = c[ifn] || { full: 0, count: 0 };
    assert.deepStrictEqual(got, { full: ifb[ifn].nbrFull, count: ifb[ifn].nbrCount }, ifn + ' F/C');
  });
  Object.keys(c).forEach(function (ifn) { assert.ok(ifb[ifn], 'neighbor interface ' + ifn + ' is an OSPF interface'); });
}

test('neighbor: every state and role, in order, as IOS printed it', function () {
  var warn = [];
  var nei = ios.parseOspfNeighbors(R1_NEI, warn);
  assert.deepStrictEqual(warn, [], 'no unread lines');
  assert.deepStrictEqual(nei.list.map(function (n) { return [n.rid, n.state, n.full, n.address, n.iface]; }), [
    ['2.2.2.2', 'Full/Backup', true, '10.0.12.2', 'Ethernet0/1'],
    ['3.3.3.3', 'Full/DROther', true, '10.0.12.3', 'Ethernet0/1'],
    ['4.4.4.4', 'Full/DROther', true, '10.0.12.4', 'Ethernet0/1'],
    ['5.5.5.5', 'Full/-', true, '10.1.15.5', 'Ethernet0/2'],
    ['6.6.6.6', 'Init/DROther', false, '10.1.16.6', 'Ethernet0/3'],
    ['7.7.7.7', 'ExStart/DR', false, '10.2.17.7', 'Ethernet1/0'],
    ['8.8.8.8', 'Exchange/Backup', false, '10.2.18.8', 'Ethernet1/1'],
    ['9.9.9.9', 'Loading/-', false, '10.2.19.9', 'Ethernet1/2'],
    ['10.10.10.10', 'Down/DROther', false, '10.3.0.10', 'Ethernet1/3']
  ]);
});

test('neighbor: FULL/DR and 2WAY/DROTHER (DROther side of a LAN)', function () {
  var nei = ios.parseOspfNeighbors(R3_NEI, []);
  assert.deepStrictEqual(nei.list.map(function (n) { return n.state; }), ['Full/DR', 'Full/Backup', '2-Way/DROther']);
  assert.deepStrictEqual(nei.list.map(function (n) { return n.full; }), [true, true, false]);
  assert.strictEqual(byIfaceList(nei.list)['Ethernet0/1'].length, 3, 'all three neighbors kept on Ethernet0/1');
});

test('neighbor: several neighbors on one interface are all kept in the list', function () {
  var nei = ios.parseOspfNeighbors(R1_NEI, []);
  assert.deepStrictEqual(byIfaceList(nei.list)['Ethernet0/1'].map(function (n) { return n.rid; }), ['2.2.2.2', '3.3.3.3', '4.4.4.4']);
});

test('neighbor: long interface names are read whole', function () {
  var warn = [];
  var nei = ios.parseOspfNeighbors(R4_NEI, warn);
  assert.deepStrictEqual(warn, []);
  assert.deepStrictEqual(nei.list.map(function (n) { return [n.iface, n.state]; }), [
    ['TenGigabitEthernet1/0/1.1000', 'Full/DR'],
    ['Port-channel10.200', 'Full/-'],
    ['GigabitEthernet0/0/0.4094', 'Full/DR'],
    ['GigabitEthernet0/0/0.4094', '2-Way/DROther']
  ]);
});

test('neighbor: no neighbors (header only, completely empty, CRLF) -> empty list, no warnings', function () {
  [NEI_HDR, '', '\r\n', NEI_HDR.replace(/\n/g, '\r\n')].forEach(function (t) {
    var warn = [];
    var nei = ios.parseOspfNeighbors(t, warn);
    assert.deepStrictEqual(nei.list, [], JSON.stringify(t));
    assert.deepStrictEqual(nei.byIface, {});
    assert.deepStrictEqual(warn, []);
  });
  assert.deepStrictEqual(ios.parseOspfNeighbors(undefined, []).list, []);
});

test('interface brief: areas, roles and F/C as printed', function () {
  var warn = [];
  var ifb = ios.parseOspfInterfaces(R1_IFB, warn);
  assert.deepStrictEqual(warn, []);
  var rows = Object.keys(ifb).map(function (k) { var d = ifb[k]; return [k, d.area, d.ospfState, d.nbrFull, d.nbrCount, d.up]; });
  assert.deepStrictEqual(rows, [
    ['Loopback0', '0', 'LOOP', 0, 0, true],
    ['Ethernet0/1', '0', 'DR', 3, 3, true],
    ['Ethernet0/2', '1', 'P2P', 1, 1, true],
    ['Ethernet0/3', '1', 'DR', 0, 1, true],
    ['Ethernet1/0', '2', 'BDR', 0, 1, true],
    ['Ethernet1/1', '2', 'DR', 0, 1, true],
    ['Ethernet1/2', '2', 'P2P', 0, 1, true],
    ['Ethernet1/3', '3', 'DR', 0, 1, true],
    ['Ethernet2/0', '3', 'DR', 0, 0, true],
    ['Ethernet2/1', '3', 'DOWN', 0, 0, false]
  ]);
  var r3 = ios.parseOspfInterfaces(R3_IFB, []);
  assert.deepStrictEqual([r3['Ethernet0/1'].ospfState, r3['Ethernet0/1'].nbrFull, r3['Ethernet0/1'].nbrCount], ['DROTH', 2, 3]);
});

test('interface brief: long names and dotted / large areas', function () {
  var warn = [];
  var ifb = ios.parseOspfInterfaces(R4_IFB, warn);
  assert.deepStrictEqual(warn, []);
  assert.deepStrictEqual(Object.keys(ifb).map(function (k) { return [k, ifb[k].area, ifb[k].ip, ifb[k].prefix, ifb[k].nbrFull, ifb[k].nbrCount]; }), [
    ['TenGigabitEthernet1/0/1.1000', '0', '172.16.100.2', 24, 1, 1],
    ['Port-channel10.200', '10.0.0.1', '172.16.200.1', 30, 1, 1],
    ['GigabitEthernet0/0/0.4094', '4294967295', '172.16.250.4', 24, 1, 2]
  ]);
});

test('interface brief: header only / empty -> no interfaces, no warnings', function () {
  [IFB_HDR, '', '\n\n'].forEach(function (t) {
    var warn = [];
    assert.deepStrictEqual(ios.parseOspfInterfaces(t, warn), {}, JSON.stringify(t));
    assert.deepStrictEqual(warn, []);
  });
});

test('per-interface neighbor counts (F/C) match the parsed neighbor list', function () {
  [[R1_IFB, R1_NEI], [R3_IFB, R3_NEI], [R4_IFB, R4_NEI], [IFB_HDR, NEI_HDR]].forEach(function (p) {
    assertCountsMatch(ios.parseOspfInterfaces(p[0], []), ios.parseOspfNeighbors(p[1], []));
  });
});

test('state: ospf_neighbors carries every row with state and role split', function () {
  var st = ios.run({ ospfNeighbor: R1_NEI, ospfInterface: R1_IFB }, 'r1', '', 'ospf', '');
  assert.deepStrictEqual(st.ospf_neighbors.map(function (n) { return [n.router_id, n.state, n.role, n.iface, n.full]; }), [
    ['2.2.2.2', 'Full', 'Backup', 'Ethernet0/1', true],
    ['3.3.3.3', 'Full', 'DROther', 'Ethernet0/1', true],
    ['4.4.4.4', 'Full', 'DROther', 'Ethernet0/1', true],
    ['5.5.5.5', 'Full', '-', 'Ethernet0/2', true],
    ['6.6.6.6', 'Init', 'DROther', 'Ethernet0/3', false],
    ['7.7.7.7', 'ExStart', 'DR', 'Ethernet1/0', false],
    ['8.8.8.8', 'Exchange', 'Backup', 'Ethernet1/1', false],
    ['9.9.9.9', 'Loading', '-', 'Ethernet1/2', false],
    ['10.10.10.10', 'Down', 'DROther', 'Ethernet1/3', false]
  ]);
  assert.strictEqual(st.ospf_neighbor_full, true);
});

test('state: no neighbors at all -> empty ospf_neighbors, not Full', function () {
  [NEI_HDR, ''].forEach(function (t) {
    var st = ios.run({ ospfNeighbor: t, ospfInterface: R1_IFB }, 'r1', '', 'ospf', '');
    assert.deepStrictEqual(st.ospf_neighbors, []);
    assert.strictEqual(st.ospf_neighbor_full, false);
  });
});

test('judgement: a DROther pair in 2WAY on a broadcast LAN is not reported as a problem', function () {
  var st = ios.run({ ospfNeighbor: R3_NEI, ospfInterface: R3_IFB, ipInterface: R3_IPB, route: R3_RT }, 'r3', 'Ethernet0/1:sw1', 'ospf', '');
  assert.strictEqual(st.sw1_ospf_full, true, 'link judged Full: ' + st.sw1_ospf_state);
  assert.strictEqual(st.sw1_ospf_state, 'Full');
  assert.strictEqual(st.sw1_has_full, true);
  assert.strictEqual(st.sw1_neighbor_state, 'Full');
  var pl = st.peer_links.filter(function (r) { return r.peer === 'sw1'; })[0];
  assert.ok(pl && pl.ospf_full === true && pl.ospf_state === 'Full', JSON.stringify(pl));
  assert.deepStrictEqual(pl.ospf_nbrs.map(function (n) { return n.state; }), ['Full/DR', 'Full/Backup', '2-Way/DROther']);
  assert.ok(!(st.parse_warnings || []).length, JSON.stringify(st.parse_warnings));
});

test('judgement: a neighbor stuck below Full on the LAN is still reported (2WAY with the DR is not normal)', function () {
  var nei = NEI_HDR +
    '1.1.1.1           1   2WAY/DR         00:00:38    10.0.12.1       Ethernet0/1\n' +
    '4.4.4.4           1   2WAY/DROTHER    00:00:33    10.0.12.4       Ethernet0/1\n';
  var st = ios.run({ ospfNeighbor: nei, ospfInterface: R3_IFB, ipInterface: R3_IPB, route: R3_RT }, 'r3', 'Ethernet0/1:sw1', 'ospf', '');
  assert.strictEqual(st.sw1_ospf_full, false);
  assert.strictEqual(st.sw1_ospf_state, '2-Way');
});

test('judgement: ExStart keeps the FRR spelling the engine compares against', function () {
  var nei = NEI_HDR + '1.1.1.1           1   EXSTART/DR      00:00:38    10.0.12.1       Ethernet0/1\n';
  var st = ios.run({ ospfNeighbor: nei, ospfInterface: R3_IFB, ipInterface: R3_IPB, route: R3_RT }, 'r3', 'Ethernet0/1:sw1', 'ospf', '');
  assert.strictEqual(st.sw1_ospf_state, 'ExStart/DR');
  assert.strictEqual(st.ospf_neighbors[0].state, 'ExStart');
});
