// xray-mcp.test.js - scripts/xray-mcp.js spoken to over stdio (JSON-RPC 2.0, one message per line).
// Run: node --test        (from the repo root; Node >= 18, no dependencies)
'use strict';
var test = require('node:test');
var assert = require('node:assert');
var path = require('path');
var cp = require('child_process');

var ROOT = path.join(__dirname, '..');
var SERVER = path.join(ROOT, 'scripts', 'xray-mcp.js');
var Q15 = path.join(ROOT, 'test', 'fixtures', 'iosxe-q15');
var FRR_R1 = path.join(ROOT, 'fixtures', 'frr-collect-sample', 'r1');

// send raw lines to a fresh server, close stdin, return the parsed reply lines keyed by id
function session(lines) {
  var r = cp.spawnSync(process.execPath, [SERVER], { input: lines.join('\n') + '\n', encoding: 'utf8', timeout: 10000 });
  assert.strictEqual(r.status, 0, r.stderr);
  var replies = r.stdout.split('\n').filter(Boolean).map(function (l) { return JSON.parse(l); });
  var byId = {};
  replies.forEach(function (m) { byId[m.id] = m; });
  return { replies: replies, byId: byId };
}
function req(id, method, params) { return JSON.stringify({ jsonrpc: '2.0', id: id, method: method, params: params }); }
function call(id, name, args) { return req(id, 'tools/call', { name: name, arguments: args }); }
var INIT = [
  req(1, 'initialize', { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'test', version: '0' } }),   // an older supported revision is answered as-is
  JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' })
];
function payload(reply) { return JSON.parse(reply.result.content[0].text); }

test('initialize and tools/list', function () {
  var s = session(INIT.concat([req(2, 'tools/list', {})]));
  assert.strictEqual(s.replies.length, 2, 'no reply to the notification');
  var init = s.byId[1];
  assert.strictEqual(init.jsonrpc, '2.0');
  assert.strictEqual(init.result.protocolVersion, '2025-06-18');
  assert.strictEqual(init.result.serverInfo.name, 'network-xray');
  assert.strictEqual(init.result.serverInfo.version, '1', 'the major version, as the image tag');
  assert.ok(init.result.capabilities.tools);
  var tools = s.byId[2].result.tools;
  assert.deepStrictEqual(tools.map(function (t) { return t.name; }),
    ['lab_state', 'why_best_path', 'list_routers', 'ospf_neighbors', 'ospf_interfaces', 'bgp_neighbors', 'route_lookup', 'why_path', 'state_diff']);
  tools.forEach(function (t) {
    assert.strictEqual(t.inputSchema.type, 'object');
    assert.strictEqual(t.annotations.readOnlyHint, true);
  });
  assert.deepStrictEqual(tools[1].inputSchema.required, ['path', 'node', 'prefix']);
});

test('initialize with an unknown protocol version answers with a supported one', function () {
  var s = session([req(1, 'initialize', { protocolVersion: '1999-01-01' })]);
  assert.strictEqual(s.byId[1].result.protocolVersion, '2025-11-25');
});

test('tools/call lab_state on the iosxe-q15 fixture and the FRR sample', function () {
  var s = session(INIT.concat([call(3, 'lab_state', { path: Q15 }), call(4, 'lab_state', { path: FRR_R1 })]));
  var r = s.byId[3].result;
  assert.ok(!r.isError);
  var out = payload(s.byId[3]);
  assert.deepStrictEqual(r.structuredContent, out);
  assert.deepStrictEqual(out.nodes.map(function (n) { return n.name; }), ['r1', 'r2', 'r3']);
  assert.strictEqual(out.counts.links, 2);
  assert.strictEqual(out.counts.ospf_full, out.counts.ospf_total);
  assert.ok(out.bgp_sessions.some(function (b) { return b.node === 'r1' && b.peer_ip === '2.2.2.2' && b.established; }));
  var frr = payload(s.byId[4]);
  assert.strictEqual(frr.ospf_adjacencies[0].neighbor_id, '2.2.2.2');
  assert.strictEqual(frr.ospf_adjacencies[0].state, 'Full');
});

test('tools/call why_best_path gives the best path and the stored reason', function () {
  var s = session(INIT.concat([call(5, 'why_best_path', { path: Q15, node: 'r1', prefix: '8.8.8.0/24' })]));
  var out = payload(s.byId[5]);
  assert.strictEqual(out.prefix, '8.8.8.0/24');
  assert.strictEqual(out.best.next_hop, '2.2.2.2');
  assert.strictEqual(out.best.as_path, '65002');
  assert.strictEqual(out.reason, 'First path received');
  assert.match(out.reason_source, /IOS-XE/);
});

test('tools/call why_best_path says when the reason is not in the data', function () {
  // two paths, one marked best, no reason stored with it
  var fs = require('fs'), os = require('os');
  var dir = fs.mkdtempSync(path.join(os.tmpdir(), 'xmcp-'));
  fs.writeFileSync(path.join(dir, 'state_r1.json'), JSON.stringify({ target_node: 'r1', interfaces: {},
    bgp_routes: [{ prefix: '203.0.113.0/24', next_hop: '10.0.2.3', best: true }, { prefix: '203.0.113.0/24', next_hop: '10.0.1.2' }] }));
  var s2 = session(INIT.concat([call(7, 'why_best_path', { path: dir, node: 'r1', prefix: '203.0.113.0/24' })]));
  var out = payload(s2.byId[7]);
  assert.strictEqual(out.best.next_hop, '10.0.2.3');
  assert.strictEqual(out.reason, null);
  assert.match(out.note, /not in the data/);
});

test('tool errors come back as isError results; protocol errors as JSON-RPC errors', function () {
  var s = session(INIT.concat([
    call(10, 'lab_state', { path: path.join(ROOT, 'no-such-file.json') }),
    call(11, 'why_best_path', { path: Q15, node: 'r9', prefix: '8.8.8.0/24' }),
    call(12, 'why_best_path', { path: Q15, node: 'r1' }),
    call(13, 'run_command', { cmd: 'reload' }),
    req(14, 'no/such/method', {}),
    '{ not json',
    req(15, 'ping', {})
  ]));
  [10, 11, 12].forEach(function (id) {
    var r = s.byId[id].result;
    assert.strictEqual(r.isError, true, String(id));
    assert.strictEqual(typeof payload(s.byId[id]).error, 'string');
  });
  assert.match(payload(s.byId[11]).error, /unknown node: r9/);
  assert.match(payload(s.byId[12]).error, /missing argument: prefix/);
  assert.strictEqual(s.byId[13].error.code, -32602);
  assert.strictEqual(s.byId[14].error.code, -32601);
  assert.strictEqual(s.byId[null].error.code, -32700);
  assert.deepStrictEqual(s.byId[15].result, {});
});

test('initialize: the newest initialize-based revision (2025-11-25) is answered as requested', function () {
  var s = session([req(1, 'initialize', { protocolVersion: '2025-11-25', capabilities: {}, clientInfo: { name: 'test', version: '0' } })]);
  assert.strictEqual(s.byId[1].result.protocolVersion, '2025-11-25');
});

// ---- list_routers / ospf_neighbors / bgp_neighbors / route_lookup ------------------------------
var ECMP = path.join(ROOT, 'test', 'fixtures', 'iosxe-ecmp');
function ok(reply) {
  var r = reply.result;
  assert.ok(!r.isError, r.content[0].text);
  var out = payload(reply);
  assert.deepStrictEqual(r.structuredContent, out, 'same JSON as structuredContent and as text');
  return out;
}
function isErr(reply, re) {
  var r = reply.result;
  assert.strictEqual(r.isError, true);
  assert.match(payload(reply).error, re);
}

test('list_routers: names and which protocols have state', function () {
  var s = session(INIT.concat([
    call(20, 'list_routers', { path: Q15 }),
    call(21, 'list_routers', { path: path.join(ROOT, 'no-such-dir') }),
    call(22, 'list_routers', { path: 42 }),
    call(23, 'list_routers', {})
  ]));
  var out = ok(s.byId[20]);
  assert.strictEqual(out.count, 3);
  assert.deepStrictEqual(out.routers.map(function (r) { return [r.name, r.protocols]; }),
    [['r1', ['ospf', 'bgp']], ['r2', ['ospf', 'bgp']], ['r3', ['bgp']]]);
  assert.strictEqual(out.routers[1].counts.bgp_neighbors, 2);
  assert.strictEqual(out.routers[0].routing_table, true);
  isErr(s.byId[21], /not found/);
  isErr(s.byId[22], /path must be a string/);
  isErr(s.byId[23], /missing argument: path/);
});

test('ospf_neighbors: per router neighbor, state, interface', function () {
  var s = session(INIT.concat([
    call(30, 'ospf_neighbors', { path: Q15 }),
    call(31, 'ospf_neighbors', { path: ECMP, router: 'r1' }),
    call(32, 'ospf_neighbors', { path: Q15, router: 'r9' }),
    call(33, 'ospf_neighbors', { path: Q15, router: ['r1'] })
  ]));
  var all = ok(s.byId[30]);
  assert.deepStrictEqual(all.routers.map(function (r) { return r.router; }), ['r1', 'r2', 'r3']);
  assert.deepStrictEqual(all.routers[0].neighbors[0],
    { neighbor: '2.2.2.2', address: '10.10.0.20', state: 'Full', interface: 'Ethernet0/1', role: 'DR', peer: 'r2' });
  assert.deepStrictEqual(all.routers[2].neighbors, []);
  assert.deepStrictEqual(all.counts, { total: 2, full: 2, ifaces_expected: 0, ifaces_without_adjacency: 0 });
  assert.deepStrictEqual(all.wrong, [], 'nothing wrong in q15: wrong is the first key and empty');
  assert.strictEqual(Object.keys(all)[0], 'wrong');
  var one = ok(s.byId[31]);
  assert.strictEqual(one.routers.length, 1);
  assert.deepStrictEqual(one.routers[0].neighbors.map(function (n) { return n.neighbor + '@' + n.interface; }),
    ['3.3.3.3@Ethernet0/2', '2.2.2.2@Ethernet0/1']);
  isErr(s.byId[32], /unknown router: r9 \(known: r1, r2, r3\)/);
  isErr(s.byId[33], /router must be a string/);
});

test('bgp_neighbors: per router peer, AS, state, prefixes received', function () {
  var s = session(INIT.concat([
    call(40, 'bgp_neighbors', { path: Q15, router: 'r2' }),
    call(41, 'bgp_neighbors', { path: FRR_R1 }),
    call(42, 'bgp_neighbors', { path: Q15, router: 'nope' }),
    call(43, 'bgp_neighbors', { path: Q15, router: 2 })
  ]));
  var out = ok(s.byId[40]);
  assert.deepStrictEqual(out.routers[0].peers, [
    { peer: '1.1.1.1', remote_as: 65001, type: 'iBGP', state: 'Established', established: true, prefixes_received: 0 },
    { peer: '10.11.0.20', remote_as: 65002, type: 'eBGP', state: 'Established', established: true, prefixes_received: 1 }
  ]);
  assert.deepStrictEqual(out.counts, { total: 2, established: 2 });
  var frr = ok(s.byId[41]);   // OSPF-only sample: the router is listed with no peers
  assert.deepStrictEqual(frr.routers, [{ router: 'r1', peers: [] }]);
  isErr(s.byId[42], /unknown router: nope/);
  isErr(s.byId[43], /router must be a string/);
});

test('route_lookup: longest prefix match in the collected routing table', function () {
  var fs = require('fs'), os = require('os');
  var dir = fs.mkdtempSync(path.join(os.tmpdir(), 'xmcp-rt-'));
  fs.writeFileSync(path.join(dir, 'state_r1.json'), JSON.stringify({ target_node: 'r1', interfaces: {}, routing_table: [
    { prefix: '0.0.0.0/0', out_iface: 'eth1', next_hop: '10.0.0.1', protocol: 'static', selected: true },
    { prefix: '10.1.0.0/16', out_iface: 'eth2', next_hop: '10.0.1.2', protocol: 'ospf', selected: true },
    { prefix: '10.1.2.0/24', out_iface: 'eth3', next_hop: '10.0.2.2', protocol: 'bgp', selected: false },
    { prefix: '2001:db8::/32', out_iface: 'eth2', next_hop: 'fe80::2', protocol: 'ospf6', selected: true },
    { prefix: '2001:db8:1::/48', out_iface: 'eth4', next_hop: '', protocol: 'connected', selected: true },
    { prefix: '10.1.2.0/24', out_iface: 'v1', next_hop: '', protocol: 'connected', selected: true, vrf: 'cust' }
  ] }));
  fs.writeFileSync(path.join(dir, 'state_r2.json'), JSON.stringify({ target_node: 'r2', interfaces: {} }));
  var s = session(INIT.concat([
    call(50, 'route_lookup', { path: Q15, router: 'r1', destination: '8.8.8.8' }),
    call(51, 'route_lookup', { path: Q15, router: 'r3', destination: '192.0.2.1' }),
    call(52, 'route_lookup', { path: ECMP, router: 'r1', destination: '4.4.4.4' }),
    call(53, 'route_lookup', { path: dir, router: 'r1', destination: '10.1.2.3' }),   // the /24 is not installed -> /16
    call(54, 'route_lookup', { path: dir, router: 'r1', destination: '2001:db8:1::9' }),
    call(55, 'route_lookup', { path: dir, router: 'r1', destination: '2001:db8:2::9' }),
    call(56, 'route_lookup', { path: dir, router: 'r1', destination: '10.1.2.3', vrf: 'cust' }),
    call(57, 'route_lookup', { path: dir, router: 'r1', destination: '2001:db9::1' }),
    call(58, 'route_lookup', { path: dir, router: 'r2', destination: '10.1.2.3' }),
    call(60, 'route_lookup', { path: Q15, router: 'r9', destination: '8.8.8.8' }),
    call(61, 'route_lookup', { path: Q15, router: 'r1', destination: '8.8.8.256' }),
    call(62, 'route_lookup', { path: Q15, router: 'r1', destination: '8.8.8.0/24' }),
    call(63, 'route_lookup', { path: Q15, router: 'r1', destination: 'not-an-ip' }),
    call(64, 'route_lookup', { path: Q15, router: 'r1' }),
    call(65, 'route_lookup', { path: Q15, router: 'r1', destination: 134744072 })
  ]));
  var a = ok(s.byId[50]);
  assert.deepStrictEqual(a.route, { prefix: '8.8.8.0/24', protocol: 'bgp', next_hop: '2.2.2.2', out_iface: 'Ethernet0/1' });
  assert.strictEqual(a.next_hop, '2.2.2.2');
  assert.strictEqual(a.out_iface, 'Ethernet0/1');
  assert.strictEqual(a.vrf, 'default');
  var d = ok(s.byId[51]);   // only the static default matches
  assert.strictEqual(d.route.prefix, '0.0.0.0/0');
  assert.strictEqual(d.next_hop, '10.11.0.10');
  var e = ok(s.byId[52]);   // ECMP: every next hop is returned
  assert.strictEqual(e.route.prefix, '4.4.4.4/32');
  assert.deepStrictEqual(e.route.nexthops.map(function (h) { return h.ip; }), ['10.13.0.3', '10.12.0.2']);
  assert.strictEqual(ok(s.byId[53]).route.prefix, '10.1.0.0/16');
  var c = ok(s.byId[54]);   // connected: no gateway
  assert.strictEqual(c.route.prefix, '2001:db8:1::/48');
  assert.strictEqual(c.next_hop, null);
  assert.strictEqual(c.out_iface, 'eth4');
  assert.strictEqual(ok(s.byId[55]).next_hop, 'fe80::2');
  var v = ok(s.byId[56]);
  assert.strictEqual(v.route.out_iface, 'v1');
  assert.strictEqual(v.vrf, 'cust');
  var none = ok(s.byId[57]);
  assert.strictEqual(none.route, null);
  assert.match(none.note, /no installed route/);
  var noTable = ok(s.byId[58]);
  assert.strictEqual(noTable.route, null);
  assert.match(noTable.note, /no routing table in the data/);
  isErr(s.byId[60], /unknown router: r9/);
  isErr(s.byId[61], /not an IPv4 or IPv6 address/);
  isErr(s.byId[62], /not an IPv4 or IPv6 address/);
  isErr(s.byId[63], /not an IPv4 or IPv6 address/);
  isErr(s.byId[64], /missing argument: destination/);
  isErr(s.byId[65], /destination must be a string/);
  fs.rmSync(dir, { recursive: true, force: true });
});

// ---- why_path --------------------------------------------------------------------------------------
test('why_path: device-reported reason, inferred reason, single path, unknown router / prefix', function () {
  var fs = require('fs'), os = require('os');
  var dir = fs.mkdtempSync(path.join(os.tmpdir(), 'xmcp-why-'));
  var pfx = { prefix: '203.0.113.0', prefixlen: 24, origin: 'IGP' };
  function row(o) { return Object.assign({}, pfx, o); }
  // FRR: the router stored its selectionReason with the best path
  fs.writeFileSync(path.join(dir, 'state_r1.json'), JSON.stringify({ target_node: 'r1', nos: 'frr', interfaces: {}, bgp_routes: [
    row({ next_hop: '10.0.1.2', as_path: '65002', local_pref: 100, status: '* ' }),
    row({ next_hop: '10.0.2.3', as_path: '65003', local_pref: 200, status: '*>', best: true, reason: 'Local Pref' })
  ] }));
  // no reason in the data: the same MED comparison the Best-Path Decision panel makes
  fs.writeFileSync(path.join(dir, 'state_r2.json'), JSON.stringify({ target_node: 'r2', interfaces: {}, bgp_routes: [
    row({ next_hop: '10.0.3.2', as_path: '65002 65010', metric: 50, status: '* ' }),
    row({ next_hop: '10.0.4.2', as_path: '65002 65010', metric: 10, status: '*>', best: true }),
    row({ next_hop: '10.0.5.2', as_path: '65002 65010', metric: 90, status: '  ', valid: false })
  ] }));
  var s = session(INIT.concat([
    call(70, 'why_path', { path: dir, router: 'r1', prefix: '203.0.113.0/24' }),
    call(71, 'why_path', { path: dir, router: 'r2', prefix: '203.0.113.9' }),
    call(72, 'why_path', { path: Q15, router: 'r1', prefix: '8.8.8.0/24' }),
    call(73, 'why_path', { path: Q15, router: 'r9', prefix: '8.8.8.0/24' }),
    call(74, 'why_path', { path: Q15, router: 'r1', prefix: '198.51.100.0/24' }),
    call(75, 'why_path', { path: Q15, router: 'r1', prefix: '198.51.100.1' }),
    call(76, 'why_path', { path: Q15, router: 'r1' })
  ]));

  var dev = ok(s.byId[70]);
  assert.strictEqual(dev.prefix, '203.0.113.0/24');
  assert.strictEqual(dev.selected.next_hop, '10.0.2.3');
  assert.strictEqual(dev.selected.local_pref, 200);
  assert.deepStrictEqual(dev.candidates.map(function (c) { return [c.next_hop, c.local_pref]; }), [['10.0.1.2', 100]]);
  assert.strictEqual(dev.deciding_step, 'Local Pref');
  assert.strictEqual(dev.reason_source, 'device');
  assert.strictEqual(dev.comparison, 'LocPrf');   // the attribute comparison agrees

  var inf = ok(s.byId[71]);   // an address: matched to the BGP prefix that contains it
  assert.strictEqual(inf.prefix, '203.0.113.0/24');
  assert.strictEqual(inf.destination, '203.0.113.9');
  assert.strictEqual(inf.selected.next_hop, '10.0.4.2');
  assert.strictEqual(inf.deciding_step, 'MED');
  assert.strictEqual(inf.reason_source, 'comparison');
  assert.strictEqual(inf.candidates.length, 2, 'the not-valid path is listed, but not compared');
  assert.ok(inf.candidates.some(function (c) { return c.valid === false; }));
  var med = inf.steps.filter(function (x) { return x.step === 'MED'; })[0];
  assert.deepStrictEqual(med, { step: 'MED', selected: 10, other: 50, result: 'win' });

  var one = ok(s.byId[72]);   // IOS-XE: the stored reason is the collector's, not the router's -> "derived", the comparison beside it
  assert.strictEqual(one.selected.next_hop, '2.2.2.2');
  assert.deepStrictEqual(one.candidates, []);
  assert.strictEqual(one.deciding_step, 'First path received');
  assert.strictEqual(one.reason_source, 'derived');
  assert.strictEqual(one.comparison, 'Only path');

  isErr(s.byId[73], /unknown router: r9 \(known: r1, r2, r3\)/);
  isErr(s.byId[74], /unknown prefix on r1: 198\.51\.100\.0\/24/);
  isErr(s.byId[75], /unknown prefix on r1: 198\.51\.100\.1/);
  isErr(s.byId[76], /missing argument: prefix/);
  fs.rmSync(dir, { recursive: true, force: true });
});
