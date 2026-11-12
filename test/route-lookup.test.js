// route-lookup.test.js - longest-prefix-match edge cases for routeLookup (scripts/xray-query.js) and the
// MCP route_lookup tool (scripts/xray-mcp.js).
// Run: node --test        (from the repo root; Node >= 18, no dependencies)
'use strict';
var test = require('node:test');
var assert = require('node:assert');
var fs = require('fs');
var os = require('os');
var path = require('path');

var query = require('../scripts/xray-query.js');
var mcp = require('../scripts/xray-mcp.js');

function row(prefix, protocol, nh, iface, extra) {
  var r = { prefix: prefix, protocol: protocol, next_hop: nh, out_iface: iface, selected: true };
  Object.keys(extra || {}).forEach(function (k) { r[k] = extra[k]; });
  return r;
}
function states(table) { return { r1: { target_node: 'r1', interfaces: {}, routing_table: table } }; }
function lookup(table, dst, vrf) { return query.routeLookup(states(table), 'r1', dst, vrf); }
// routeLookup throws a QueryError (a plain object with .message)
function throwsMsg(fn, re, label) {
  var err = null;
  try { fn(); } catch (e) { err = e; }
  assert.ok(err, 'expected a throw' + (label != null ? ' for ' + label : ''));
  assert.match(String(err.message), re, label);
}
function prefixOf(table, dst, vrf) { var r = lookup(table, dst, vrf).route; return r ? r.prefix : null; }

var NESTED = [
  row('0.0.0.0/0', 'static', '192.0.2.1', 'eth0'),
  row('10.0.0.0/8', 'bgp', '192.0.2.8', 'eth8'),
  row('10.1.0.0/16', 'ospf', '192.0.2.16', 'eth16'),
  row('10.1.2.0/24', 'static', '192.0.2.24', 'eth24'),
  row('10.1.2.3/32', 'ospf', '192.0.2.32', 'eth32')
];

// ---- default route only ----------------------------------------------------------------------
test('default route only: every IPv4 address matches 0.0.0.0/0', function () {
  var t = [row('0.0.0.0/0', 'static', '192.0.2.1', 'eth0')];
  ['0.0.0.0', '1.2.3.4', '127.0.0.1', '224.0.0.5', '255.255.255.255'].forEach(function (d) {
    var r = lookup(t, d);
    assert.strictEqual(r.route.prefix, '0.0.0.0/0', d);
    assert.strictEqual(r.next_hop, '192.0.2.1');
    assert.strictEqual(r.out_iface, 'eth0');
  });
});

test('IPv4 default does not catch IPv6 and ::/0 does not catch IPv4', function () {
  var t = [row('0.0.0.0/0', 'static', '192.0.2.1', 'eth0'), row('::/0', 'static', 'fe80::1', 'eth1')];
  assert.strictEqual(prefixOf(t, '2001:db8::1'), '::/0');
  assert.strictEqual(prefixOf(t, '198.51.100.1'), '0.0.0.0/0');
  var v4only = lookup([row('0.0.0.0/0', 'static', '192.0.2.1', 'eth0')], '2001:db8::1');
  assert.strictEqual(v4only.route, null);
  assert.match(v4only.note, /no installed route/);
});

test('empty table: route is null with a note, not an error', function () {
  var r = lookup([], '10.1.2.3');
  assert.strictEqual(r.route, null);
  assert.strictEqual(r.next_hop, null);
  assert.match(r.note, /no installed route/);
});

// ---- overlapping prefixes --------------------------------------------------------------------
test('overlapping /8 /16 /24 /32: the longest match wins', function () {
  assert.strictEqual(prefixOf(NESTED, '10.1.2.3'), '10.1.2.3/32');
  assert.strictEqual(prefixOf(NESTED, '10.1.2.4'), '10.1.2.0/24');
  assert.strictEqual(prefixOf(NESTED, '10.1.3.1'), '10.1.0.0/16');
  assert.strictEqual(prefixOf(NESTED, '10.2.0.1'), '10.0.0.0/8');
  assert.strictEqual(prefixOf(NESTED, '11.0.0.1'), '0.0.0.0/0');
});

test('overlapping prefixes: table order does not matter', function () {
  var rev = NESTED.slice().reverse();
  ['10.1.2.3', '10.1.2.4', '10.1.3.1', '10.2.0.1', '11.0.0.1'].forEach(function (d) {
    assert.strictEqual(prefixOf(rev, d), prefixOf(NESTED, d), d);
  });
});

test('prefix boundaries: network, broadcast and the addresses just outside', function () {
  assert.strictEqual(prefixOf(NESTED, '10.1.2.0'), '10.1.2.0/24');
  assert.strictEqual(prefixOf(NESTED, '10.1.2.255'), '10.1.2.0/24');
  assert.strictEqual(prefixOf(NESTED, '10.1.1.255'), '10.1.0.0/16');
  assert.strictEqual(prefixOf(NESTED, '10.1.3.0'), '10.1.0.0/16');
  assert.strictEqual(prefixOf(NESTED, '9.255.255.255'), '0.0.0.0/0');
  assert.strictEqual(prefixOf(NESTED, '10.255.255.255'), '10.0.0.0/8');
});

test('non-octet-aligned lengths (/25, /31, /12)', function () {
  var t = [row('172.16.0.0/12', 'ospf', 'a', 'e1'), row('192.0.2.128/25', 'ospf', 'b', 'e2'), row('192.0.2.0/31', 'connected', '', 'e3')];
  assert.strictEqual(prefixOf(t, '172.31.255.255'), '172.16.0.0/12');
  assert.strictEqual(prefixOf(t, '172.32.0.0'), null);
  assert.strictEqual(prefixOf(t, '192.0.2.128'), '192.0.2.128/25');
  assert.strictEqual(prefixOf(t, '192.0.2.127'), null);
  assert.strictEqual(prefixOf(t, '192.0.2.1'), '192.0.2.0/31');
  assert.strictEqual(prefixOf(t, '192.0.2.2'), null);
});

// ---- host routes -----------------------------------------------------------------------------
test('host routes: /32, a bare address (= /32) and an IPv6 /128', function () {
  var t = [
    row('10.0.0.0/8', 'ospf', 'a', 'e1'),
    row('10.9.9.9', 'static', 'b', 'e2'),
    row('10.0.0.1/32', 'connected', '', 'lo'),
    row('2001:db8::/32', 'ospf6', 'fe80::1', 'e3'),
    row('2001:db8::1/128', 'connected', '', 'lo')
  ];
  var h = lookup(t, '10.0.0.1');
  assert.strictEqual(h.route.prefix, '10.0.0.1/32');
  assert.strictEqual(h.next_hop, null);   // connected: no gateway
  assert.strictEqual(h.out_iface, 'lo');
  assert.strictEqual(prefixOf(t, '10.0.0.2'), '10.0.0.0/8');
  assert.strictEqual(prefixOf(t, '10.9.9.9'), '10.9.9.9');
  assert.strictEqual(prefixOf(t, '10.9.9.8'), '10.0.0.0/8');
  assert.strictEqual(prefixOf(t, '2001:db8::1'), '2001:db8::1/128');
  assert.strictEqual(prefixOf(t, '2001:db8::2'), '2001:db8::/32');
});

test('a row with host bits set still covers its network', function () {
  assert.strictEqual(prefixOf([row('10.1.2.3/24', 'connected', '', 'e1')], '10.1.2.200'), '10.1.2.3/24');
});

// ---- same prefix from several protocols ------------------------------------------------------
// routing_table rows carry no administrative distance: the collector marks the installed one selected
// (FRR: only the winner is selected; IOS-XE prints only installed routes). The lookup follows that flag.
var SAME = [
  row('10.5.0.0/24', 'bgp', '192.0.2.20', 'eth2', { selected: false }),
  row('10.5.0.0/24', 'ospf', '192.0.2.110', 'eth3', { selected: false }),
  row('10.5.0.0/24', 'static', '192.0.2.1', 'eth1', { selected: false }),
  row('10.5.0.0/24', 'connected', '', 'eth4')
];

test('connected vs static vs OSPF vs BGP for one prefix: the selected row is returned', function () {
  var r = lookup(SAME, '10.5.0.9');
  assert.strictEqual(r.route.protocol, 'connected');
  assert.strictEqual(r.next_hop, null);
  assert.strictEqual(r.out_iface, 'eth4');
  assert.strictEqual(r.also, undefined);
  ['static', 'ospf', 'bgp'].forEach(function (p) {
    var t = SAME.map(function (x) { return row(x.prefix, x.protocol, x.next_hop, x.out_iface, { selected: x.protocol === p }); });
    assert.strictEqual(lookup(t, '10.5.0.9').route.protocol, p);
    assert.strictEqual(lookup(t.slice().reverse(), '10.5.0.9').route.protocol, p);
  });
});

test('same prefix: a distance field is not used, the selected flag decides', function () {
  var t = [row('10.6.0.0/24', 'ospf', 'a', 'e1', { distance: 110, selected: false }), row('10.6.0.0/24', 'bgp', 'b', 'e2', { distance: 200 })];
  assert.strictEqual(lookup(t, '10.6.0.1').route.protocol, 'bgp');
});

test('same prefix, none installed: falls back to a shorter installed route', function () {
  var t = SAME.map(function (x) { return row(x.prefix, x.protocol, x.next_hop, x.out_iface, { selected: false }); });
  t.push(row('10.0.0.0/8', 'bgp', '192.0.2.8', 'eth8'));
  assert.strictEqual(prefixOf(t, '10.5.0.9'), '10.0.0.0/8');
  assert.strictEqual(prefixOf(t.slice(0, 4), '10.5.0.9'), null);
});

test('rows without a selected flag count as installed', function () {
  var t = [{ prefix: '10.7.0.0/16', protocol: 'ospf', next_hop: 'a', out_iface: 'e1' }];
  assert.strictEqual(prefixOf(t, '10.7.1.1'), '10.7.0.0/16');
});

// ---- ECMP ------------------------------------------------------------------------------------
test('ECMP: every next hop of the row is returned, first one in next_hop', function () {
  var t = [row('10.8.0.0/24', 'ospf', '10.1.0.20', 'eth1', { nexthops: [{ ip: '10.1.0.20', iface: 'eth1' }, { ip: '10.1.0.30', iface: 'eth2' }] })];
  var r = lookup(t, '10.8.0.7');
  assert.deepStrictEqual(r.route.nexthops, [{ ip: '10.1.0.20', iface: 'eth1' }, { ip: '10.1.0.30', iface: 'eth2' }]);
  assert.strictEqual(r.next_hop, '10.1.0.20');
  assert.strictEqual(r.out_iface, 'eth1');
});

test('ECMP as separate installed rows of one prefix: the rest go in also', function () {
  var t = [row('10.8.0.0/24', 'bgp', '10.1.0.20', 'eth1'), row('10.8.0.0/24', 'bgp', '10.1.0.30', 'eth2'), row('10.0.0.0/8', 'bgp', 'x', 'e9')];
  var r = lookup(t, '10.8.0.7');
  assert.strictEqual(r.next_hop, '10.1.0.20');
  assert.deepStrictEqual(r.also.map(function (x) { return x.next_hop; }), ['10.1.0.30']);
});

test('ECMP next hop with missing fields comes back as empty strings', function () {
  var r = lookup([row('10.8.0.0/24', 'ospf', '', '', { nexthops: [{ ip: '10.1.0.20' }, { iface: 'eth2' }] })], '10.8.0.1');
  assert.deepStrictEqual(r.route.nexthops, [{ ip: '10.1.0.20', iface: '' }, { ip: '', iface: 'eth2' }]);
  assert.strictEqual(r.next_hop, null);
  assert.strictEqual(r.out_iface, null);
});

// ---- input forms -----------------------------------------------------------------------------
test('surrounding whitespace is trimmed; the trimmed form is echoed', function () {
  [' 10.1.2.4', '10.1.2.4 ', '\t10.1.2.4\n', '\r\n 10.1.2.4 \r\n'].forEach(function (d) {
    var r = lookup(NESTED, d);
    assert.strictEqual(r.route.prefix, '10.1.2.0/24', JSON.stringify(d));
    assert.strictEqual(r.destination, '10.1.2.4');
  });
});

test('leading zeros in an IPv4 octet are refused (octal to inet_aton, decimal elsewhere)', function () {
  ['010.1.2.3', '10.01.2.3', '10.1.02.3', '10.1.2.03', '00.0.0.0', '0010.1.2.3', '::ffff:010.1.2.3'].forEach(function (d) {
    throwsMsg(function () { lookup(NESTED, d); }, /not an IPv4 or IPv6 address/, d);
  });
  throwsMsg(function () { lookup(NESTED, '010.1.2.3'); }, /leading zero/);
  assert.strictEqual(prefixOf(NESTED, '10.0.0.0'), '10.0.0.0/8');   // a lone 0 is fine
  assert.strictEqual(prefixOf(NESTED, '0.0.0.0'), '0.0.0.0/0');
});

test('invalid addresses throw a clear error', function () {
  ['256.1.1.1', '10.1.2', '10.1.2.3.4', '10.1.2.3.', '.10.1.2.3', '10. 1.2.3', '10.1.2.3 x', '+10.1.2.3', '-1.0.0.0',
    '0x0a.1.2.3', '167838211', '10.1.2.3/32', '10.1.2.3%eth0', 'r1', 'not-an-ip', '1::2::3', '2001:db8::g',
    '1:2:3:4:5:6:7:8:9', '::1:2:3:4:5:6:7:8', '12345::1', '١٠.1.2.3'].forEach(function (d) {
    throwsMsg(function () { lookup(NESTED, d); }, /not an IPv4 or IPv6 address/, d);
  });
});

test('missing or blank destination', function () {
  ['', '   ', '\n', null, undefined].forEach(function (d) {
    throwsMsg(function () { lookup(NESTED, d); }, /missing destination/, JSON.stringify(d));
  });
});

test('unknown router and a router with no table', function () {
  throwsMsg(function () { query.routeLookup(states(NESTED), 'r9', '10.1.2.3'); }, /unknown router: r9/);
  var r = query.routeLookup({ r2: { target_node: 'r2', interfaces: {} } }, 'r2', '10.1.2.3');
  assert.strictEqual(r.route, null);
  assert.match(r.note, /no routing table in the data/);
});

test('malformed table rows are skipped, not fatal', function () {
  var t = [null, {}, row('default', 'static', 'a', 'e1'), row('10.0.0.0/33', 'static', 'b', 'e2'), row('10.0.0.0/x', 'static', 'c', 'e3'),
    row('300.0.0.0/8', 'static', 'd', 'e4'), row('10.0.0.0/8', 'ospf', 'ok', 'e5')];
  assert.strictEqual(lookup(t, '10.1.1.1').next_hop, 'ok');
});

// ---- IPv6 ------------------------------------------------------------------------------------
var V6 = [
  row('::/0', 'static', 'fe80::1', 'eth0'),
  row('2001:db8::/32', 'bgp', 'fe80::32', 'eth1'),
  row('2001:db8:1::/48', 'ospf6', 'fe80::48', 'eth2'),
  row('2001:db8:1:2::/64', 'connected', '', 'eth3'),
  row('2001:db8:1:2::5/128', 'static', 'fe80::128', 'eth4')
];

test('IPv6: longest match over /0 /32 /48 /64 /128', function () {
  assert.strictEqual(prefixOf(V6, '2001:db8:1:2::5'), '2001:db8:1:2::5/128');
  assert.strictEqual(prefixOf(V6, '2001:db8:1:2::6'), '2001:db8:1:2::/64');
  assert.strictEqual(prefixOf(V6, '2001:db8:1:3::1'), '2001:db8:1::/48');
  assert.strictEqual(prefixOf(V6, '2001:db8:2::1'), '2001:db8::/32');
  assert.strictEqual(prefixOf(V6, '2001:db9::1'), '::/0');
  assert.strictEqual(lookup(V6, '2001:db8:1:2::6').next_hop, null);
});

test('IPv6 address forms: case, leading zeros, full form, zone index, embedded IPv4', function () {
  ['2001:DB8:1:2::5', '2001:0db8:0001:0002:0000:0000:0000:0005', '2001:db8:1:2:0:0:0:5', ' 2001:db8:1:2::5\n', '2001:db8:1:2::5%eth3'].forEach(function (d) {
    assert.strictEqual(prefixOf(V6, d), '2001:db8:1:2::5/128', d);
  });
  assert.strictEqual(prefixOf(V6, '::'), '::/0');
  var t = [row('::ffff:0:0/96', 'static', 'x', 'e1'), row('10.0.0.0/8', 'ospf', 'y', 'e2')];
  assert.strictEqual(prefixOf(t, '::ffff:10.1.2.3'), '::ffff:0:0/96');   // an IPv6 address, not the IPv4 /8
  assert.strictEqual(prefixOf(t, '10.1.2.3'), '10.0.0.0/8');
});

// ---- VRF -------------------------------------------------------------------------------------
test('VRF: rows of another VRF are not used', function () {
  var t = [row('10.0.0.0/8', 'ospf', 'def', 'e1'), row('10.1.2.0/24', 'connected', '', 'v1', { vrf: 'cust' })];
  assert.strictEqual(prefixOf(t, '10.1.2.3'), '10.0.0.0/8');
  assert.strictEqual(prefixOf(t, '10.1.2.3', 'cust'), '10.1.2.0/24');
  var none = lookup(t, '11.0.0.1', 'cust');
  assert.strictEqual(none.route, null);
  assert.match(none.note, /in VRF cust/);
});

// ---- MCP route_lookup ------------------------------------------------------------------------
test('MCP route_lookup: same answers and errors through the tool', function () {
  var dir = fs.mkdtempSync(path.join(os.tmpdir(), 'xrl-'));
  try {
    fs.writeFileSync(path.join(dir, 'state_r1.json'), JSON.stringify({ target_node: 'r1', interfaces: {}, routing_table: NESTED.concat(V6) }));
    var id = 0;
    var call = function (dst) {
      return mcp.handle({ jsonrpc: '2.0', id: ++id, method: 'tools/call', params: { name: 'route_lookup', arguments: { path: dir, router: 'r1', destination: dst } } }).result;
    };
    assert.strictEqual(call('10.1.2.3').structuredContent.route.prefix, '10.1.2.3/32');
    assert.strictEqual(call(' 10.1.3.1 ').structuredContent.route.prefix, '10.1.0.0/16');
    assert.strictEqual(call('2001:db8:1:3::1').structuredContent.route.prefix, '2001:db8:1::/48');
    var lz = call('010.1.2.3');
    assert.strictEqual(lz.isError, true);
    assert.match(lz.content[0].text, /leading zero/);
    var bad = call('10.1.2.256');
    assert.strictEqual(bad.isError, true);
    assert.match(bad.content[0].text, /not an IPv4 or IPv6 address/);
    var blank = call('  ');
    assert.strictEqual(blank.isError, true);
    assert.match(blank.content[0].text, /missing destination/);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

// ---- nx_resolved_via: a recursive next hop says what the router resolved it through -----------------------------
var clab = require('../clab-collect.js');
// test/fixtures/frr-recursive-mgmt/route.json = a real FRR 10.7.1 `show ip route 198.51.100.0/24 json` on r3 after next-hop-self
// was removed on r2: via 10.0.12.1 (recursive), installed through 172.20.20.1 on eth0 = the containerlab management network
var RECURSIVE = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', 'frr-recursive-mgmt', 'route.json'), 'utf8'));
function recState(mgmt) { return clab.collectFromJson({ node: 'r3', proto: 'bgp', bgpConfigured: true, route: RECURSIVE, mgmtSubnet: mgmt }); }
test('collector: a recursive next hop carries resolved_via (real FRR, management network -> via_mgmt)', function () {
  var row = recState('172.20.20.0/24').routing_table.filter(function (r) { return r.prefix === '198.51.100.0/24'; })[0];
  assert.strictEqual(row.next_hop, '10.0.12.1');
  assert.deepStrictEqual(row.resolved_via, { ip: '172.20.20.1', iface: 'eth0', via_mgmt: true });
});
test('collector: without a management subnet the resolving next hop is still named, not marked', function () {
  var row = recState('').routing_table.filter(function (r) { return r.prefix === '198.51.100.0/24'; })[0];
  assert.deepStrictEqual(row.resolved_via, { ip: '172.20.20.1', iface: 'eth0' });
});
test('route_lookup: recursive via the management network -> resolved_via and a note that it is not reachable in the lab', function () {
  var r = query.routeLookup({ r3: recState('172.20.20.0/24') }, 'r3', '198.51.100.1');
  assert.strictEqual(r.route.prefix, '198.51.100.0/24');
  assert.strictEqual(r.next_hop, '10.0.12.1');
  assert.deepStrictEqual(r.resolved_via, { ip: '172.20.20.1', iface: 'eth0', via_mgmt: true });
  assert.strictEqual(r.note, 'next hop 10.0.12.1 is recursive; FRR resolves it via 172.20.20.1 on eth0 (the management network, left out of this view) - inside the lab topology it is not reachable');
});
test('route_lookup: recursive inside the lab -> resolved_via and a plain note', function () {
  var t = [row('198.51.100.0/24', 'bgp', '2.2.2.2', '', { resolved_via: { ip: '10.0.23.2', iface: 'eth1' } })];
  var r = lookup(t, '198.51.100.1');
  assert.deepStrictEqual(r.route.resolved_via, { ip: '10.0.23.2', iface: 'eth1' });
  assert.strictEqual(r.note, 'next hop 2.2.2.2 is recursive; FRR resolves it via 10.0.23.2 on eth1');
});
test('route_lookup: a next hop that is not recursive gets no resolved_via and no note', function () {
  var r = lookup([row('198.51.100.0/24', 'bgp', '10.0.23.2', 'eth1')], '198.51.100.1');
  assert.strictEqual(r.resolved_via, undefined);
  assert.strictEqual(r.note, undefined);
});
test('collector: an ordinary (non-recursive) FRR route gets no resolved_via', function () {
  var route = { '10.0.23.0/24': [{ prefix: '10.0.23.0/24', protocol: 'ospf', selected: true, installed: true,
    nexthops: [{ ip: '10.0.13.1', interfaceName: 'eth2', active: true, fib: true }] }] };
  var st = clab.collectFromJson({ node: 'r3', proto: 'ospf', route: route });
  assert.ok(!('resolved_via' in st.routing_table[0]));
});
