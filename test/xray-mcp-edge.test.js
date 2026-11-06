// xray-mcp-edge.test.js - scripts/xray-mcp.js on bad or unusual input: unknown tools, bad arguments, unknown
// routers, empty / old / malformed / very large state files, special files, and addresses no table matches.
// Every case must give a clear error or an empty result, and the server must keep answering.
// Run: node --test        (from the repo root; Node >= 18, no dependencies)
'use strict';
var test = require('node:test');
var assert = require('node:assert');
var fs = require('fs');
var os = require('os');
var path = require('path');
var cp = require('child_process');
var mcp = require('../scripts/xray-mcp.js');

var ROOT = path.join(__dirname, '..');
var SERVER = path.join(ROOT, 'scripts', 'xray-mcp.js');
var Q15 = path.join(ROOT, 'test', 'fixtures', 'iosxe-q15');

var TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'xray-mcp-edge-'));
test.after(function () { fs.rmSync(TMP, { recursive: true, force: true }); });
function tmpFile(name, text) { var f = path.join(TMP, name); fs.writeFileSync(f, text); return f; }
function tmpDir(name) { var d = path.join(TMP, name); fs.mkdirSync(d, { recursive: true }); return d; }

var nextId = 100;
function rpc(method, params) { return mcp.handle({ jsonrpc: '2.0', id: nextId++, method: method, params: params }); }
function callTool(name, args) { return rpc('tools/call', { name: name, arguments: args }); }
// a tool call that must fail: an isError result whose JSON text has a non-empty error string
function toolError(name, args) {
  var r = callTool(name, args);
  assert.ok(r.result, 'a tool error is a result, not a JSON-RPC error: ' + JSON.stringify(r));
  assert.strictEqual(r.result.isError, true, JSON.stringify(r.result));
  assert.strictEqual(r.result.structuredContent, undefined);
  var body = JSON.parse(r.result.content[0].text);
  assert.strictEqual(typeof body.error, 'string');
  assert.ok(body.error.length > 0);
  return body.error;
}
function toolOk(name, args) {
  var r = callTool(name, args);
  assert.ok(r.result && !r.result.isError, JSON.stringify(r));
  return r.result.structuredContent;
}

// a raw stdio session with a time limit: a hang shows up as a timeout instead of a stuck test run
function session(lines, timeout) {
  var r = cp.spawnSync(process.execPath, [SERVER], { input: lines.join('\n') + '\n', encoding: 'utf8', timeout: timeout || 10000 });
  assert.strictEqual(r.error, undefined, 'server did not finish: ' + (r.error && r.error.message));
  assert.strictEqual(r.status, 0, r.stderr);
  var byId = {};
  var replies = r.stdout.split('\n').filter(Boolean).map(function (l) { return JSON.parse(l); });
  replies.forEach(function (m) { byId[m.id] = m; });
  return { replies: replies, byId: byId };
}
function line(id, method, params) { return JSON.stringify({ jsonrpc: '2.0', id: id, method: method, params: params }); }

var ALL_TOOLS = ['lab_state', 'why_best_path', 'list_routers', 'ospf_neighbors', 'bgp_neighbors', 'route_lookup', 'why_path'];

// ---- unknown tool names ---------------------------------------------------------------------
test('unknown tool names are JSON-RPC errors (-32602), including names of Object.prototype members', function () {
  ['nope', '', 'LAB_STATE', 'lab_state ', 'toString', 'constructor', '__proto__', 'hasOwnProperty'].forEach(function (n) {
    var r = callTool(n, { path: Q15 });
    assert.ok(r.error, n + ': ' + JSON.stringify(r));
    assert.strictEqual(r.error.code, -32602);
    assert.match(r.error.message, /^Unknown tool/);
  });
  [undefined, null, 5, {}, ['lab_state']].forEach(function (n) {
    var r = rpc('tools/call', { name: n, arguments: { path: Q15 } });
    assert.strictEqual(r.error.code, -32602, JSON.stringify(n));
  });
  // params missing, null or not an object
  [undefined, null, 'lab_state', 7, []].forEach(function (p) {
    var r = rpc('tools/call', p);
    assert.strictEqual(r.error.code, -32602, JSON.stringify(p));
  });
});

// ---- missing / wrong-typed arguments --------------------------------------------------------
test('arguments that are not an object are an error for every tool', function () {
  ALL_TOOLS.forEach(function (t) {
    ['x', 5, true, [], [Q15]].forEach(function (a) {
      assert.match(toolError(t, a), /arguments must be an object/, t + ' ' + JSON.stringify(a));
    });
  });
});

test('missing required arguments are named in the error', function () {
  var required = {
    lab_state: ['path'], list_routers: ['path'], ospf_neighbors: ['path'], bgp_neighbors: ['path'],
    why_best_path: ['path', 'node', 'prefix'], route_lookup: ['path', 'router', 'destination'], why_path: ['path', 'router', 'prefix']
  };
  var full = { path: Q15, node: 'r1', router: 'r1', prefix: '10.0.0.0/8', destination: '10.0.0.1' };
  Object.keys(required).forEach(function (t) {
    assert.match(toolError(t, undefined), /missing argument: path/, t);
    assert.match(toolError(t, null), /missing argument: path/, t);
    assert.match(toolError(t, {}), /missing argument: path/, t);
    required[t].forEach(function (k) {
      var args = {};
      required[t].forEach(function (j) { if (j !== k) args[j] = full[j]; });
      assert.match(toolError(t, args), new RegExp('missing argument: ' + k), t + ' without ' + k);
      args[k] = '';
      assert.match(toolError(t, args), new RegExp('missing argument: ' + k), t + ' with empty ' + k);
      args[k] = null;
      assert.match(toolError(t, args), new RegExp('missing argument: ' + k), t + ' with null ' + k);
    });
  });
});

test('wrong-typed arguments are an error, not coerced', function () {
  [5, true, {}, [], ['a'], { path: Q15 }].forEach(function (v) {
    assert.match(toolError('lab_state', { path: v }), /argument path must be a string/);
    assert.match(toolError('ospf_neighbors', { path: Q15, router: v }), /argument router must be a string/);
    assert.match(toolError('bgp_neighbors', { path: Q15, router: v }), /argument router must be a string/);
    assert.match(toolError('why_best_path', { path: Q15, node: v, prefix: '10.0.0.0/8' }), /argument node must be a string/);
    assert.match(toolError('route_lookup', { path: Q15, router: 'r1', destination: v }), /argument destination must be a string/);
    assert.match(toolError('route_lookup', { path: Q15, router: 'r1', destination: '10.0.0.1', vrf: v }), /argument vrf must be a string/);
    assert.match(toolError('why_path', { path: Q15, router: 'r1', prefix: v }), /argument prefix must be a string/);
  });
});

test('destination / prefix strings that are not addresses are a clear error', function () {
  ['not-an-ip', '10.0.0', '10.0.0.256', '10.0.0.1/24', '::1::2', '1.2.3.4.5', ' ', 'x'.repeat(100000)].forEach(function (d) {
    var e = toolError('route_lookup', { path: Q15, router: 'r1', destination: d });
    assert.match(e, /destination is not an IPv4 or IPv6 address|missing destination/, JSON.stringify(d.slice(0, 20)));
  });
  assert.match(toolError('route_lookup', { path: Q15, router: 'r1', destination: '010.0.0.1' }), /leading zero/);
  assert.match(toolError('why_best_path', { path: Q15, node: 'r1', prefix: 'garbage' }), /unknown prefix on r1: garbage/);
  assert.match(toolError('why_path', { path: Q15, router: 'r1', prefix: 'garbage' }), /unknown prefix on r1: garbage/);
});

// ---- a router that is not in the lab --------------------------------------------------------
test('a router that is not in the lab is an error that lists the known routers', function () {
  ['r99', 'R1', ' r1', '__proto__', 'constructor', 'toString', 'hasOwnProperty'].forEach(function (n) {
    var known = /\(known: r1, r2, r3\)/;
    assert.match(toolError('ospf_neighbors', { path: Q15, router: n }), known, n);
    assert.match(toolError('bgp_neighbors', { path: Q15, router: n }), known, n);
    assert.match(toolError('route_lookup', { path: Q15, router: n, destination: '10.0.0.1' }), known, n);
    assert.match(toolError('why_path', { path: Q15, router: n, prefix: '10.0.0.0/8' }), known, n);
    assert.match(toolError('why_best_path', { path: Q15, node: n, prefix: '10.0.0.0/8' }), /unknown node: .*\(known: r1, r2, r3\)/, n);
  });
});

// ---- empty / stale state files --------------------------------------------------------------
test('missing, empty and non-state files are clear errors', function () {
  var missing = path.join(TMP, 'does-not-exist.json');
  ALL_TOOLS.forEach(function (t) {
    var args = { path: missing, node: 'r1', router: 'r1', prefix: '10.0.0.0/8', destination: '10.0.0.1' };
    if (t === 'lab_state' || t === 'list_routers') args = { path: missing };
    if (t === 'ospf_neighbors' || t === 'bgp_neighbors') args = { path: missing };
    if (t === 'why_best_path') { delete args.router; delete args.destination; }
    if (t === 'route_lookup') { delete args.node; delete args.prefix; }
    if (t === 'why_path') { delete args.node; delete args.destination; }
    assert.match(toolError(t, args), /^not found: /, t);
  });
  assert.match(toolError('lab_state', { path: tmpFile('empty.json', '') }), /^not a network-xray state file$/);
  assert.match(toolError('lab_state', { path: tmpFile('ws.json', ' \n\t\n') }), /^not a network-xray state file$/);
  assert.match(toolError('lab_state', { path: tmpFile('trunc.json', '{"target_node":"r1","interfaces":{') }), /^not a network-xray state file$/);
  assert.match(toolError('lab_state', { path: tmpFile('obj.json', '{}') }), /^not a network-xray state file$/);
  assert.match(toolError('lab_state', { path: tmpFile('arr.json', '[]') }), /^not a network-xray state file$/);
  assert.match(toolError('lab_state', { path: tmpFile('null.json', 'null') }), /^not a network-xray state file$/);
  assert.match(toolError('lab_state', { path: tmpFile('num.json', '42') }), /^not a network-xray state file$/);
  assert.match(toolError('lab_state', { path: tmpFile('xs.js', 'window.LIVE_STATES = {};\n') }), /^not a network-xray state file$/);
  assert.match(toolError('lab_state', { path: tmpFile('xs-bad.js', 'window.LIVE_STATES = {oops;\n') }), /^not a network-xray state file$/);
  assert.match(toolError('list_routers', { path: tmpDir('empty-dir') }), /no state files/);
  // a directory with only an empty state_<node>.json
  var d = tmpDir('dir-empty-state');
  fs.writeFileSync(path.join(d, 'state_r1.json'), '');
  assert.match(toolError('list_routers', { path: d }), /^not a network-xray state file$/);
});

test('a state from an older collector (only target_node) gives empty results, not errors', function () {
  var f = tmpFile('state_old.json', JSON.stringify({ target_node: 'r1' }));
  var s = toolOk('lab_state', { path: f });
  assert.deepStrictEqual(s.counts, { nodes: 1, links: 0, ospf_full: 0, ospf_total: 0, bgp_established: 0, bgp_total: 0 });
  assert.deepStrictEqual(toolOk('list_routers', { path: f }).routers[0].protocols, []);
  assert.deepStrictEqual(toolOk('ospf_neighbors', { path: f, router: 'r1' }).routers, [{ router: 'r1', neighbors: [] }]);
  assert.deepStrictEqual(toolOk('bgp_neighbors', { path: f }).routers, [{ router: 'r1', peers: [] }]);
  var rl = toolOk('route_lookup', { path: f, router: 'r1', destination: '10.0.0.1' });
  assert.strictEqual(rl.route, null);
  assert.match(rl.note, /no routing table in the data/);
  assert.match(toolError('why_best_path', { path: f, node: 'r1', prefix: '10.0.0.0/8' }), /no BGP table in the data/);
  assert.match(toolError('why_path', { path: f, router: 'r1', prefix: '10.0.0.1' }), /no BGP table in the data/);
});

test('a state file that changes or disappears between calls is read afresh each time', function () {
  var d = tmpDir('stale');
  var f = path.join(d, 'state_r1.json');
  fs.writeFileSync(f, JSON.stringify({ target_node: 'r1', routing_table: [{ prefix: '10.0.0.0/8', protocol: 'static', next_hop: '192.0.2.1' }] }));
  assert.strictEqual(toolOk('route_lookup', { path: d, router: 'r1', destination: '10.1.2.3' }).route.prefix, '10.0.0.0/8');
  fs.writeFileSync(f, JSON.stringify({ target_node: 'r1', routing_table: [] }));
  assert.strictEqual(toolOk('route_lookup', { path: d, router: 'r1', destination: '10.1.2.3' }).route, null);
  fs.writeFileSync(f, '');   // a collector caught half-way through a write
  assert.match(toolError('route_lookup', { path: d, router: 'r1', destination: '10.1.2.3' }), /^not a network-xray state file$/);
  fs.unlinkSync(f);
  assert.match(toolError('route_lookup', { path: d, router: 'r1', destination: '10.1.2.3' }), /no state files/);
  fs.rmSync(d, { recursive: true });
  assert.match(toolError('route_lookup', { path: d, router: 'r1', destination: '10.1.2.3' }), /^not found: /);
});

test('fields with the wrong type in the state give a clear isError result for every tool', function () {
  var f = tmpFile('state_odd.json', JSON.stringify({
    target_node: 'r1', interfaces: [], peer_links: { a: 1 }, bgp_routes: {}, ospf_neighbors: 'x', bgp_neighbors: 3,
    routing_table: [{ prefix: '10.0.0.0/8', nexthops: [null] }]
  }));
  [['lab_state', { path: f }], ['ospf_neighbors', { path: f }], ['bgp_neighbors', { path: f }],
    ['why_best_path', { path: f, node: 'r1', prefix: '10.0.0.0/8' }], ['why_path', { path: f, router: 'r1', prefix: '10.0.0.1' }],
    ['route_lookup', { path: f, router: 'r1', destination: '10.0.0.1' }]].forEach(function (c) {
    assert.match(toolError(c[0], c[1]), /^unexpected data \(maybe a field in the lab state has the wrong type\)/, c[0]);
  });
  assert.strictEqual(toolOk('list_routers', { path: f }).count, 1);
});

test('odd routing table rows are skipped; route lookups match nothing outside the table', function () {
  var f = tmpFile('state_rt.json', JSON.stringify({
    target_node: 'r1',
    routing_table: [null, 'x', 7, {}, { prefix: 5 }, { prefix: 'bogus' }, { prefix: '10.0.0.0/33' },
      { prefix: '10.0.0.0/8', protocol: 'ospf', next_hop: '192.0.2.1', out_iface: 'eth1' },
      { prefix: '10.1.0.0/16', protocol: 'bgp', next_hop: '192.0.2.9', selected: false },
      { prefix: '2001:db8::/32', protocol: 'static', next_hop: 'fe80::1', out_iface: 'eth2' },
      { prefix: '172.16.0.0/12', protocol: 'static', vrf: 'blue', next_hop: '198.51.100.1' }]
  }));
  var rl = function (d, vrf) { return toolOk('route_lookup', { path: f, router: 'r1', destination: d, vrf: vrf }); };
  assert.strictEqual(rl('10.1.2.3').route.prefix, '10.0.0.0/8', 'a not-selected /16 is not used');
  assert.strictEqual(rl('2001:db8::5').route.prefix, '2001:db8::/32');
  ['192.0.2.1', '0.0.0.0', '255.255.255.255', '11.0.0.1', '2001:db9::1', '::', '::ffff:10.0.0.1', '172.16.0.1'].forEach(function (d) {
    var r = rl(d);
    assert.strictEqual(r.route, null, d);
    assert.strictEqual(r.next_hop, null, d);
    assert.strictEqual(r.out_iface, null, d);
    assert.match(r.note, /no installed route in the routing table matches/, d);
  });
  assert.strictEqual(rl('172.16.0.1', 'blue').route.prefix, '172.16.0.0/12');
  var none = rl('10.0.0.1', 'no-such-vrf');
  assert.strictEqual(none.route, null);
  assert.match(none.note, /in VRF no-such-vrf/);
  // an empty table: empty result with a note
  var e = tmpFile('state_rt0.json', JSON.stringify({ target_node: 'r1', routing_table: [] }));
  var r0 = toolOk('route_lookup', { path: e, router: 'r1', destination: '10.0.0.1' });
  assert.strictEqual(r0.route, null);
  assert.match(r0.note, /no installed route/);
});

test('route lookups on the fixture for addresses in no table: empty result, or the default route where there is one', function () {
  ['198.18.0.1', '2001:db8:ffff::1', '224.0.0.5'].forEach(function (d) {
    ['r1', 'r2', 'r3'].forEach(function (n) {
      var r = toolOk('route_lookup', { path: Q15, router: n, destination: d });
      if (r.route) {
        assert.match(r.route.prefix, /^(0\.0\.0\.0|::)\/0$/, n + ' ' + d + ': ' + JSON.stringify(r.route));
      } else {
        assert.ok(typeof r.note === 'string' && r.note.length > 0);
        assert.strictEqual(r.next_hop, null);
      }
    });
  });
});

// ---- special files: the server must not block on them ---------------------------------------
test('a FIFO or a device as path is an error, and the server keeps answering', { skip: process.platform === 'win32' }, function (t) {
  var d = tmpDir('special');
  var fifo = path.join(d, 'fifo.json');
  var dirWithFifo = tmpDir('special/states');
  var frrWithFifo = tmpDir('special/frr-r1');
  var mk = cp.spawnSync('mkfifo', [fifo, path.join(dirWithFifo, 'state_r1.json'), path.join(frrWithFifo, 'show_ip_route.json')]);
  if (mk.status !== 0) { t.skip('mkfifo is not available here'); return; }   // say it was not run, not a pass
  fs.writeFileSync(path.join(dirWithFifo, 'state_r2.json'), JSON.stringify({ target_node: 'r2' }));
  var s = session([
    line(1, 'tools/call', { name: 'lab_state', arguments: { path: fifo } }),
    line(2, 'tools/call', { name: 'list_routers', arguments: { path: dirWithFifo } }),
    line(3, 'tools/call', { name: 'list_routers', arguments: { path: frrWithFifo } }),
    line(4, 'tools/call', { name: 'lab_state', arguments: { path: '/dev/null' } }),
    line(5, 'ping', {})
  ], 15000);
  assert.match(JSON.parse(s.byId[1].result.content[0].text).error, /not a regular file/);
  assert.deepStrictEqual(s.byId[2].result.structuredContent.routers.map(function (r) { return r.name; }), ['r2'], 'the FIFO state file is skipped');
  assert.strictEqual(s.byId[3].result.structuredContent.routers[0].counts.routes, 0, 'the FIFO show file is skipped');
  assert.strictEqual(s.byId[4].result.isError, true);
  assert.deepStrictEqual(s.byId[5].result, {});
});

// ---- very large state -----------------------------------------------------------------------
test('a very large lab state is answered in reasonable time', function () {
  var states = {};
  for (var n = 0; n < 100; n++) {
    var rt = [], br = [];
    for (var i = 0; i < 1000; i++) {
      rt.push({ prefix: '10.' + (i >> 8) + '.' + (i & 255) + '.0/24', protocol: 'ospf', next_hop: '192.0.2.' + (n % 250 + 1), out_iface: 'eth1' });
      br.push({ prefix: '203.' + (i >> 8) + '.' + (i & 255) + '.0/24', next_hop: '192.0.2.1', as_path: '65001 65002', best: true, status: '*>' });
    }
    states['r' + n] = { target_node: 'r' + n, interfaces: { eth1: { up: true, ip: '192.0.2.1/24' } }, routing_table: rt, bgp_routes: br,
      peer_links: [{ peer: 'r' + ((n + 1) % 100), iface: 'eth1', up: true }],
      ospf_neighbors: [{ router_id: '10.255.0.' + n, state: 'Full', iface: 'eth1' }], bgp_neighbors: [{ ip: '192.0.2.2', state: 'Established' }] };
  }
  var f = tmpFile('xray-states-big.js', 'window.LIVE_STATES = ' + JSON.stringify(states) + ';\n');
  var t0 = Date.now();
  assert.strictEqual(toolOk('lab_state', { path: f }).counts.nodes, 100);
  assert.strictEqual(toolOk('list_routers', { path: f }).routers[42].counts.routes, 1000);
  assert.strictEqual(toolOk('ospf_neighbors', { path: f }).counts.full, 100);
  assert.strictEqual(toolOk('route_lookup', { path: f, router: 'r50', destination: '10.3.200.9' }).route.prefix, '10.3.200.0/24');
  assert.strictEqual(toolOk('route_lookup', { path: f, router: 'r50', destination: '10.200.0.1' }).route, null);
  assert.strictEqual(toolOk('why_path', { path: f, router: 'r7', prefix: '203.1.2.3' }).prefix, '203.1.2.0/24');
  assert.match(toolError('route_lookup', { path: f, router: 'r100', destination: '10.0.0.1' }), /unknown router: r100/);
  assert.ok(Date.now() - t0 < 30000, 'took ' + (Date.now() - t0) + ' ms');
});

// ---- the server process stays up ------------------------------------------------------------
test('one session with every kind of bad call: each gets a reply and the server exits cleanly', function () {
  var empty = tmpFile('state_e.json', '');
  var lines = [
    'not json', '{', '[]', '[1,2]', 'null', '42', '"x"', '{}', JSON.stringify({ jsonrpc: '1.0', id: 1, method: 'ping' }),
    JSON.stringify({ jsonrpc: '2.0', id: 2 }), JSON.stringify({ jsonrpc: '2.0', id: 3, method: 5 }),
    line(10, 'no/such/method', {}),
    line(11, 'tools/call', { name: 'nope', arguments: {} }),
    line(12, 'tools/call', { name: 'lab_state', arguments: 'x' }),
    line(13, 'tools/call', { name: 'lab_state', arguments: { path: 5 } }),
    line(14, 'tools/call', { name: 'lab_state', arguments: { path: empty } }),
    line(15, 'tools/call', { name: 'route_lookup', arguments: { path: Q15, router: 'r99', destination: '10.0.0.1' } }),
    line(16, 'tools/call', { name: 'route_lookup', arguments: { path: Q15, router: 'r1', destination: '198.18.0.1' } }),
    line(17, 'tools/call', { name: 'why_path', arguments: { path: Q15, router: 'r1', prefix: 'x'.repeat(200000) } }),
    JSON.stringify({ jsonrpc: '2.0', method: 'tools/call', params: { name: 'nope' } }),   // a notification: no reply
    line(18, 'ping', {})
  ];
  var s = session(lines);
  assert.strictEqual(s.replies.length, 20);
  s.replies.slice(0, 11).forEach(function (r) { assert.ok(r.error && r.error.code < -32000, JSON.stringify(r)); });
  assert.strictEqual(s.byId[10].error.code, -32601);
  assert.strictEqual(s.byId[11].error.code, -32602);
  [12, 13, 14, 15, 17].forEach(function (id) { assert.strictEqual(s.byId[id].result.isError, true, String(id)); });
  assert.strictEqual(s.byId[16].result.structuredContent.route, null);
  assert.deepStrictEqual(s.byId[18].result, {});
});
