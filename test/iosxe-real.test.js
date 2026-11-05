// iosxe-real.test.js — clab-iosxe-collect.js against REAL Cisco IOL captures (test/fixtures/iosxe-real-bgp, iosxe-real-ospf).
// Run: node --test        (from the repo root; Node >= 18, no dependencies)
//
// The captures are what `clab-iosxe-collect.js --capture` saved from a live IOL lab (see the fixtures' READMEs).
// They are read the way `--from-dir` reads them (the same file names), and checked against what IOS itself printed:
//   BGP:  the collector keeps the row IOS marked '>' as the best path, names the best-path step only where the
//         table shows it, marks a path with an unreachable next hop not valid, keeps multipath ('m') and the peer
//         states of the summary;
//   OSPF: every neighbor state IOS printed (FULL, 2WAY, EXCHANGE, EXSTART, INIT) comes out in FRR's spelling, with
//         the role and the interface, and nothing is left unread.
'use strict';
var test = require('node:test');
var assert = require('node:assert');
var fs = require('fs');
var path = require('path');
var ios = require('../clab-iosxe-collect.js');

var FILES = { ospfNeighbor: 'show_ip_ospf_neighbor.txt', ospfInterface: 'show_ip_ospf_interface_brief.txt',
  ospfInterfaceDetail: 'show_ip_ospf_interface.txt', ipInterface: 'show_ip_interface_brief.txt', route: 'show_ip_route.txt',
  bgpSummary: 'show_ip_bgp_summary.txt', bgp: 'show_ip_bgp.txt', protocols: 'show_ip_protocols.txt' };
function texts(dir) {
  var t = {};
  Object.keys(FILES).forEach(function (k) { var f = path.join(dir, FILES[k]); if (fs.existsSync(f)) t[k] = fs.readFileSync(f, 'utf8'); });
  return t;
}

// ---- BGP ------------------------------------------------------------------------------------------------------------
var BGP = path.join(__dirname, 'fixtures', 'iosxe-real-bgp');
var P = '203.0.113.0/24';
// step -> [next hop IOS marked '>', the reason the collector should name ('' = the table does not show the decider)]
var BGP_CASES = {
  'base':            ['10.10.0.20', ''],
  'weight':          ['10.11.0.20', 'Weight'],
  'local-pref':      ['10.11.0.20', 'Local Pref'],
  'local-route':     ['0.0.0.0', 'Weight'],          // a local route has weight 32768, as on FRR
  'as-path':         ['10.11.0.20', 'AS Path'],
  'origin':          ['10.11.0.20', 'Origin'],
  'med':             ['10.11.0.20', ''],             // bgp always-compare-med is not printed
  'peer-type':       ['10.12.0.20', 'AS Path'],      // IOS did not prepend towards the iBGP peer: its empty AS_PATH wins
  'invalid-nexthop': ['10.10.0.20', ''],
  'router-id':       ['10.10.0.20', ''],             // compare-routerid is not printed
  'multipath':       ['10.10.0.20', ''],
  'peers':           ['10.10.0.20', '']
};
function bgpState(step) {
  return ios.run(texts(path.join(BGP, step)), 'r1', 'Ethernet0/1:r2,Ethernet0/2:r3,Ethernet0/3:r4', 'bgp', '');
}
function rowsOf(st) { return (st.bgp_routes || []).filter(function (r) { return r.prefix + '/' + r.prefixlen === P; }); }   // state: prefix + prefixlen
function nh(r) { return r.next_hop || r.nexthop; }

test('iosxe-real-bgp: every capture folder has a case and vice versa', function () {
  var dirs = fs.readdirSync(BGP).filter(function (d) { return d !== 'lab' && fs.statSync(path.join(BGP, d)).isDirectory(); }).sort();
  assert.deepStrictEqual(dirs, Object.keys(BGP_CASES).sort());
});

Object.keys(BGP_CASES).forEach(function (step) {
  test('iosxe-real-bgp ' + step + ': the best path is the row IOS marked \'>\' and the step is named only where the table shows it', function () {
    var raw = ios.parseBgpRoutes(fs.readFileSync(path.join(BGP, step, 'show_ip_bgp.txt'), 'utf8'), []).filter(function (r) { return r.prefix === P; });
    var iosBest = raw.filter(function (r) { return r.best; });
    assert.strictEqual(iosBest.length, 1, 'IOS printed exactly one > row');
    assert.strictEqual(iosBest[0].nextHop, BGP_CASES[step][0]);
    var st = bgpState(step);
    var best = rowsOf(st).filter(function (r) { return (r.status || '').indexOf('>') !== -1; });
    assert.strictEqual(best.length, 1, 'the collector keeps one best path');
    assert.strictEqual(nh(best[0]), BGP_CASES[step][0]);
    assert.strictEqual(best[0].reason || '', BGP_CASES[step][1]);
    assert.deepStrictEqual(st.parse_warnings || [], [], 'nothing left unread');
  });
});

test('iosxe-real-bgp invalid-nexthop: IOS prints the path with \'*\', the collector marks it not valid (192.0.2.99 is not in the routing table)', function () {
  var raw = ios.parseBgpRoutes(fs.readFileSync(path.join(BGP, 'invalid-nexthop', 'show_ip_bgp.txt'), 'utf8'), []);
  var r = raw.filter(function (x) { return x.nextHop === '192.0.2.99'; })[0];
  assert.ok(r && r.valid && r.ibgp, 'IOS printed "* i" for it');
  var s = rowsOf(bgpState('invalid-nexthop')).filter(function (x) { return nh(x) === '192.0.2.99'; })[0];
  assert.strictEqual(s.valid, false);
});

test('iosxe-real-bgp multipath: the \'m\' row is kept as a multipath path next to the best path', function () {
  var rows = rowsOf(bgpState('multipath'));
  var other = rows.filter(function (r) { return nh(r) === '10.11.0.20'; })[0];
  assert.ok(/=|m/.test(other.status), 'status ' + JSON.stringify(other.status));
});

test('iosxe-real-bgp peers: the summary states are kept (a shut peer = Idle + admin_down, IOS words in state_raw; no route = Idle)', function () {
  var got = {};
  (bgpState('peers').bgp_neighbors || []).forEach(function (n) { got[n.ip] = [n.state, n.state_raw || '', !!n.admin_down]; });
  assert.deepStrictEqual(got, { '10.10.0.20': ['Established', '', false], '10.11.0.20': ['Established', '', false],
    '10.12.0.20': ['Idle', 'Idle (Admin)', true], '192.0.2.1': ['Idle', '', false] });
});

// ---- OSPF -----------------------------------------------------------------------------------------------------------
var OSPF = path.join(__dirname, 'fixtures', 'iosxe-real-ospf');
var LAN = [['2.2.2.2', 'Full', 'DR', 'Ethernet0/1'], ['3.3.3.3', 'Full', 'Backup', 'Ethernet0/1'], ['4.4.4.4', '2-Way', 'DROther', 'Ethernet0/1']];
var OSPF_CASES = {
  'base':    { r1: [['2.2.2.2', 'Full', 'DR', 'Ethernet0/2']].concat(LAN), r2link: ['1.1.1.1', 'Full', 'Backup'] },
  'exstart': { r1: [['2.2.2.2', 'Exchange', 'Backup', 'Ethernet0/2']].concat(LAN), r2link: ['1.1.1.1', 'ExStart', 'DR'] },
  'init':    { r1: [['2.2.2.2', 'Init', 'DROther', 'Ethernet0/2']].concat(LAN), r2link: null }
};
function ospfState(step, node) {
  return ios.run(texts(path.join(OSPF, step, node)), node, 'Ethernet0/1:lan,Ethernet0/2:' + (node === 'r1' ? 'r2' : 'r1'), 'ospf', '');
}
function key(n) { return [n.router_id, n.state, n.role, n.iface]; }

Object.keys(OSPF_CASES).forEach(function (step) {
  test('iosxe-real-ospf ' + step + ': r1 reads every neighbor IOS printed, in FRR\'s spelling', function () {
    var st = ospfState(step, 'r1');
    var got = (st.ospf_neighbors || []).map(key).sort();
    assert.deepStrictEqual(got, OSPF_CASES[step].r1.slice().sort());
    assert.deepStrictEqual(st.parse_warnings || [], [], 'nothing left unread');
  });
  test('iosxe-real-ospf ' + step + ': r2 on the r1 link', function () {
    var link = (ospfState(step, 'r2').ospf_neighbors || []).filter(function (n) { return n.iface === 'Ethernet0/2'; });
    if (!OSPF_CASES[step].r2link) assert.strictEqual(link.length, 0, 'r2 drops r1\'s Hellos: r1 is not listed');
    else assert.deepStrictEqual(key(link[0]).slice(0, 3), OSPF_CASES[step].r2link);
  });
});
