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
  assert.ok(init.result.capabilities.tools);
  var tools = s.byId[2].result.tools;
  assert.deepStrictEqual(tools.map(function (t) { return t.name; }), ['lab_state', 'why_best_path']);
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
