// bgp-peer-states.test.js — BGP neighbors part-way through configuration, not only up/down, for FRR (json, clab-collect.js)
// and Cisco IOS-XE (text, clab-iosxe-collect.js).
// Run: node --test        (from the repo root; Node >= 18, no dependencies)
//
// One router r1 (AS 65001, router id 1.1.1.1). Each case builds the router's outputs from a short list of neighbors, in the
// same shape as the recorded captures (fixtures/frr-collect-sample, test/fixtures/iosxe-*):
//   FRR    : show interface json / show ip route json / show ip bgp summary json / show ip bgp json
//   IOS-XE : show ip interface brief / show ip route / show ip bgp summary / show ip bgp
// and checks the produced state: BGP configured or not, the router's AS, the neighbor list (address, AS, iBGP/eBGP, state)
// and the local interface each neighbor is on ('' when the outputs do not say).
'use strict';
var test = require('node:test');
var assert = require('node:assert');
var clab = require('../clab-collect.js');
var ios = require('../clab-iosxe-collect.js');

// A neighbor: { peer, ip, as, state, link }  link = { n, ip, len, up } (r1's side of the link to the peer) or null (no link).
// state is FRR's word; IOS prints the same word, or the prefix count when Established.
var LOCAL_AS = 65001;
function nb(peer, ip, as, state, link) { return { peer: peer, ip: ip, as: as, state: state, link: link || null }; }
function link(n, ip, len, up) { return { n: n, ip: ip, len: len || 24, up: up !== false }; }
function netOf(ip, len) {
  var o = ip.split('.').map(Number), v = ((o[0] << 24) >>> 0) + (o[1] << 16) + (o[2] << 8) + o[3];
  var m = len === 0 ? 0 : (0xFFFFFFFF << (32 - len)) >>> 0, x = (v & m) >>> 0;
  return [x >>> 24, (x >> 16) & 255, (x >> 8) & 255, x & 255].join('.');
}
var EST = function (s) { return s === 'Established'; };

// ---- FRR ------------------------------------------------------------------------------------------------------------
var FRR_IF = function (i) { return 'eth' + i; };
// opts: { bgp: false } = no `router bgp` (summary prints {} and the running-config has no router bgp)
function frrState(nbrs, opts) {
  opts = opts || {};
  var ifj = { lo: { administrativeStatus: 'up', operationalStatus: 'up', ipAddresses: [{ address: '1.1.1.1/32' }] } };
  var rt = { '1.1.1.1/32': [{ prefix: '1.1.1.1/32', protocol: 'connected', selected: true, nexthops: [{ directlyConnected: true, interfaceName: 'lo', active: true }] }] };
  var adj = [], peers = {};
  nbrs.forEach(function (x) {
    if (x.link) {
      var ifn = FRR_IF(x.link.n), pfx = netOf(x.link.ip, x.link.len) + '/' + x.link.len;
      ifj[ifn] = { administrativeStatus: 'up', operationalStatus: x.link.up ? 'up' : 'down', ipAddresses: [{ address: x.link.ip + '/' + x.link.len }] };
      if (x.link.up) rt[pfx] = [{ prefix: pfx, protocol: 'connected', selected: true, installed: true, nexthops: [{ directlyConnected: true, interfaceName: ifn, active: true, fib: true }] }];
      adj.push({ iface: ifn, peer: x.peer });
    }
    var p = { remoteAs: x.as, localAs: LOCAL_AS, version: 4, msgRcvd: 0, msgSent: 0, tableVersion: 0, outq: 0, inq: 0,
              peerUptime: EST(x.state) ? '00:01:00' : 'never', state: x.state, peerState: /Admin/.test(x.state) ? 'Admin' : 'OK', idType: 'ipv4' };
    if (EST(x.state)) { p.hostname = x.peer; p.pfxRcd = 1; p.pfxSnt = 1; p.msgRcvd = p.msgSent = 5; }
    peers[x.ip] = p;
  });
  // FRR prints {} for `show ip bgp summary json` when no neighbor is configured (and when BGP is not running)
  var sum = nbrs.length ? { ipv4Unicast: { routerId: '1.1.1.1', as: LOCAL_AS, vrfId: 0, vrfName: 'default', peerCount: nbrs.length, peers: peers } } : {};
  var bgp = opts.bgp === false ? {} : { vrfId: 0, vrfName: 'default', tableVersion: 1, routerId: '1.1.1.1', defaultLocPrf: 100, localAS: LOCAL_AS, routes: {} };
  return clab.collectFromJson({ node: 'r1', proto: 'bgp', adjacency: adj, interface: ifj, route: rt, bgpConfigured: opts.bgp !== false,
    bgpSummary: sum, bgp: bgp });
}

// ---- IOS-XE ---------------------------------------------------------------------------------------------------------
var IOS_IF = function (i) { return 'Ethernet' + Math.floor(i / 4) + '/' + (i % 4); };
function pad(s, n) { s = String(s); while (s.length < n) s += ' '; return s; }
function lpad(s, n) { s = String(s); while (s.length < n) s = ' ' + s; return s; }
function iosState(nbrs, opts) {
  opts = opts || {};
  var brief = 'Interface              IP-Address      OK? Method Status                Protocol\n' +
              'Ethernet0/0            172.20.20.9     YES TFTP   up                    up      \n';
  var route = 'Codes: L - local, C - connected, S - static, R - RIP, M - mobile, B - BGP\n\nGateway of last resort is not set\n\n' +
              '      1.0.0.0/32 is subnetted, 1 subnets\nC        1.1.1.1 is directly connected, Loopback0\n';
  var head = 'BGP router identifier 1.1.1.1, local AS number ' + LOCAL_AS + '\nBGP table version is 1, main routing table version 1\n';
  var sum = head + '\nNeighbor        V           AS MsgRcvd MsgSent   TblVer  InQ OutQ Up/Down  State/PfxRcd\n';
  var adj = [];
  nbrs.forEach(function (x) {
    if (x.link) {
      var ifn = IOS_IF(x.link.n);
      brief += pad(ifn, 23) + pad(x.link.ip, 16) + 'YES TFTP   ' + (x.link.up ? pad('up', 22) + 'up' : pad('down', 22) + 'down') + '      \n';
      if (x.link.up) route += 'C        ' + netOf(x.link.ip, x.link.len) + '/' + x.link.len + ' is directly connected, ' + ifn + '\n' +
                              'L        ' + x.link.ip + '/32 is directly connected, ' + ifn + '\n';
      adj.push(ifn + ':' + x.peer);
    }
    var tail = EST(x.state) ? '1' : x.state;
    sum += pad(x.ip, 16) + '4' + lpad(x.as, 13) + lpad(EST(x.state) ? 5 : 0, 8) + lpad(EST(x.state) ? 5 : 0, 8) + lpad(1, 9) + '    0    0 ' +
           pad(EST(x.state) ? '00:01:00' : 'never', 9) + lpad(tail, 8) + '\n';
  });
  brief += 'Loopback0              1.1.1.1         YES TFTP   up                    up      \n';
  // IOS: no `router bgp` -> "% BGP not active"; `router bgp` without neighbors -> the header only
  var texts = { ipInterface: brief, route: route, bgp: '',
    bgpSummary: opts.bgp === false ? '% BGP not active\n' : (nbrs.length ? sum : head) };
  return ios.run(texts, 'r1', adj.join(','), 'bgp', '');
}

var VENDORS = [
  { name: 'FRR', state: frrState, ifn: FRR_IF },
  { name: 'IOS-XE', state: iosState, ifn: IOS_IF }
];
function nbrOf(st, ip) { return (st.bgp_neighbors || []).filter(function (n) { return n.ip === ip; })[0]; }
// FRR prints "Idle (Admin)" as the state; the IOS-XE parser folds it to Idle and keeps the printed text in state_raw
function adminDown(n) { return n.state === 'Idle (Admin)' || (n.state === 'Idle' && n.admin_down === true && n.state_raw === 'Idle (Admin)'); }

VENDORS.forEach(function (V) {
  test(V.name + ': no router bgp -> BGP not configured, no neighbors', function () {
    var st = V.state([], { bgp: false });
    assert.strictEqual(st.bgp_configured, false);
    assert.deepStrictEqual(st.bgp_neighbors, []);
    assert.strictEqual(st.is_established, false);
    assert.strictEqual(st.bgp_local_as, undefined, 'no AS without BGP');
    assert.strictEqual(st.bgp_state, undefined, 'no session state without BGP');
    assert.ok(!st.parse_warnings, JSON.stringify(st.parse_warnings));
  });

  test(V.name + ': router bgp with no neighbors -> configured, empty neighbor list', function () {
    var st = V.state([]);
    assert.strictEqual(st.bgp_configured, true);
    assert.deepStrictEqual(st.bgp_neighbors, []);
    assert.strictEqual(st.is_established, false);
    // IOS prints the local AS in the summary header; FRR's summary json is {} with no neighbor, so the AS is unknown there
    assert.strictEqual(st.bgp_local_as, V.name === 'FRR' ? undefined : LOCAL_AS);
    assert.ok(!st.parse_warnings, JSON.stringify(st.parse_warnings));
  });

  ['Idle', 'Connect', 'Active', 'OpenSent', 'OpenConfirm', 'Established'].forEach(function (s) {
    test(V.name + ': one eBGP neighbor in ' + s, function () {
      var st = V.state([nb('r2', '10.0.12.2', 65002, s, link(1, '10.0.12.1', 30))]);
      assert.strictEqual(st.bgp_configured, true);
      assert.strictEqual(st.bgp_local_as, LOCAL_AS);
      assert.strictEqual(st.bgp_neighbors.length, 1);
      var n = st.bgp_neighbors[0];
      assert.strictEqual(n.ip, '10.0.12.2');
      assert.strictEqual(n.remote_as, 65002);
      assert.strictEqual(n.ibgp, false);
      assert.strictEqual(n.state, s);
      assert.strictEqual(n.iface, V.ifn(1));
      assert.strictEqual(st.is_established, EST(s));
      assert.strictEqual(st.r2_iface, V.ifn(1));
      assert.strictEqual(st.r2_neighbor_state, EST(s) ? 'Full' : s);
      if (!EST(s)) assert.strictEqual(st.bgp_state, s);
      assert.strictEqual(st.interfaces[V.ifn(1)].up, true);
      assert.ok(!st.parse_warnings, JSON.stringify(st.parse_warnings));
    });
  });

  test(V.name + ': neighbor shut down (Idle (Admin))', function () {
    var st = V.state([nb('r2', '10.0.12.2', 65002, 'Idle (Admin)', link(1, '10.0.12.1', 30))]);
    var n = st.bgp_neighbors[0];
    assert.ok(adminDown(n), JSON.stringify(n));
    assert.strictEqual(n.iface, V.ifn(1));
    assert.strictEqual(st.is_established, false);
    assert.strictEqual(st.r2_iface, V.ifn(1));
    assert.ok(!st.parse_warnings, JSON.stringify(st.parse_warnings));
  });

  test(V.name + ': neighbor on an interface that is down', function () {
    var st = V.state([nb('r2', '10.0.12.2', 65002, 'Active', link(1, '10.0.12.1', 24, false))]);
    var n = st.bgp_neighbors[0];
    assert.strictEqual(n.state, 'Active');
    assert.strictEqual(n.iface, V.ifn(1), 'the address is still on the down interface');
    assert.strictEqual(st.interfaces[V.ifn(1)].up, false);
    assert.strictEqual(st.r2_iface, V.ifn(1));
    assert.strictEqual(st.is_established, false);
  });

  // IOS `show ip interface brief` has no mask: a down interface (no connected route) is read as /24, which also covers
  // the up /30 next to it. The neighbor must stay on the down interface, not move to the up one.
  test(V.name + ': /30 links, the down one next to an up one', function () {
    var st = V.state([
      nb('r2', '10.0.0.6', 65002, 'Established', link(1, '10.0.0.5', 30)),
      nb('r3', '10.0.0.2', 65003, 'Active', link(2, '10.0.0.1', 30, false))
    ]);
    assert.strictEqual(nbrOf(st, '10.0.0.6').iface, V.ifn(1));
    assert.strictEqual(nbrOf(st, '10.0.0.2').iface, V.ifn(2));
    assert.strictEqual(st.r3_iface, V.ifn(2));
    assert.strictEqual(st.r3_neighbor_state, 'Active');
    assert.strictEqual(st.r2_neighbor_state, 'Full');
  });

  // Two down /30 links. FRR's show interface json has the mask -> each neighbor on its own link. IOS's brief has none, so both
  // down interfaces read as 10.0.0.x/24 and both could hold either neighbor -> unknown (was: the first one, r2's link, for both).
  test(V.name + ': two down /30 links in the same /24', function () {
    var st = V.state([
      nb('r2', '10.0.0.2', 65002, 'Active', link(1, '10.0.0.1', 30, false)),
      nb('r3', '10.0.0.9', 65003, 'Active', link(2, '10.0.0.10', 30, false))
    ]);
    var known = V.name === 'FRR';
    assert.strictEqual(nbrOf(st, '10.0.0.2').iface, known ? V.ifn(1) : '');
    assert.strictEqual(nbrOf(st, '10.0.0.9').iface, known ? V.ifn(2) : '');
    assert.strictEqual(st.r2_iface, V.ifn(1));
    assert.strictEqual(st.r3_iface, V.ifn(2));
    assert.strictEqual(nbrOf(st, '10.0.0.9').state, 'Active');
  });

  test(V.name + ': mixed iBGP / eBGP in every state, a down link and a neighbor with no link', function () {
    var NB = [
      nb('r2', '10.0.12.2', 65002, 'Established', link(1, '10.0.12.1')),
      nb('r3', '10.0.13.2', 65003, 'Idle', link(2, '10.0.13.1')),
      nb('r4', '10.0.14.2', 65004, 'Connect', link(3, '10.0.14.1')),
      nb('r5', '10.0.15.2', 65001, 'Active', link(4, '10.0.15.1')),
      nb('r6', '10.0.16.2', 65006, 'OpenSent', link(5, '10.0.16.1')),
      nb('r7', '10.0.17.2', 65001, 'OpenConfirm', link(6, '10.0.17.1')),
      nb('r8', '10.0.18.2', 65001, 'Established', link(7, '10.0.18.1')),
      nb('r9', '10.0.19.2', 65009, 'Idle (Admin)', link(8, '10.0.19.1')),
      nb('r10', '10.0.20.2', 65010, 'Active', link(9, '10.0.20.1', 24, false)),
      nb('', '7.7.7.7', 65001, 'Active', null)   // iBGP to a loopback with no route to it yet
    ];
    var st = V.state(NB);
    assert.strictEqual(st.bgp_configured, true);
    assert.strictEqual(st.bgp_local_as, LOCAL_AS);
    assert.strictEqual(st.is_established, true);
    assert.deepStrictEqual(st.bgp_neighbors.map(function (n) { return n.ip; }), NB.map(function (x) { return x.ip; }));
    NB.forEach(function (x, i) {
      var n = nbrOf(st, x.ip), what = x.ip + ' ' + JSON.stringify(n);
      assert.strictEqual(n.remote_as, x.as, what);
      assert.strictEqual(n.ibgp, x.as === LOCAL_AS, what);
      if (/Admin/.test(x.state)) assert.ok(adminDown(n), what); else assert.strictEqual(n.state, x.state, what);
      assert.strictEqual(n.iface, x.link ? V.ifn(x.link.n) : '', what);
      if (x.peer) assert.strictEqual(st[x.peer + '_iface'], V.ifn(x.link.n), what);
    });
    assert.strictEqual(st.interfaces[V.ifn(9)].up, false);
    // the neighbor with no link gets no invented peer name
    assert.ok(!Object.keys(st).some(function (k) { return /^r1\d_/.test(k) && !/^r10_/.test(k); }), 'no r11_* keys');
    assert.ok(!st.parse_warnings, JSON.stringify(st.parse_warnings));
  });

  // FRR / IOS list neighbors by address, so 7.7.7.7 comes before 10.x. It must not take the first link (r2's).
  test(V.name + ': neighbor with no link and no route, listed first -> interface unknown, not the first link', function () {
    var st = V.state([
      nb('', '7.7.7.7', 65001, 'Active', null),
      nb('r2', '10.0.12.2', 65002, 'Idle', link(1, '10.0.12.1', 30))
    ]);
    assert.strictEqual(nbrOf(st, '7.7.7.7').iface, '');
    assert.strictEqual(nbrOf(st, '7.7.7.7').ibgp, true);
    assert.strictEqual(nbrOf(st, '10.0.12.2').iface, V.ifn(1));
    assert.strictEqual(st.r2_neighbor_state, 'Idle', "r2's row is r2's own session");
    assert.strictEqual(st.r2_iface, V.ifn(1));
    assert.strictEqual(st.bgp_state, 'Active');
    assert.strictEqual(st.peer_node, 'r2', 'the main peer is the named one, not the neighbor with no place');
    assert.strictEqual(st.neighbor_state, 'Idle', "the main neighbor state is r2's");
  });
});

test('parsers: the router AS and router id from the summaries', function () {
  var f = clab.parseBgpSummary({ ipv4Unicast: { routerId: '1.1.1.1', as: 65001, peers: { '10.0.12.2': { remoteAs: 65002, localAs: 65001, state: 'Connect' } } } });
  assert.strictEqual(f.localAs, 65001);
  assert.strictEqual(f.routerId, '1.1.1.1');
  assert.strictEqual(f.list[0].state, 'Connect');
  assert.deepStrictEqual(clab.parseBgpSummary({}).list, []);
  assert.strictEqual(clab.parseBgpSummary({}).localAs, undefined);
  var i = ios.parseBgpSummary('BGP router identifier 1.1.1.1, local AS number 65001\nBGP table version is 1, main routing table version 1\n');
  assert.strictEqual(i.routerId, '1.1.1.1');
  assert.strictEqual(String(i.localAs), '65001');
  assert.deepStrictEqual(i.list, []);
  assert.strictEqual(ios.parseBgpSummary('% BGP not active\n').routerId, '');
});
