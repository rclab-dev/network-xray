// xray-mcp-default-path.test.js - scripts/xray-mcp.js with a default path (--path <p> or NX_MCP_PATH): the tools that
// take `path` use it when the client leaves `path` out, tools/list shows `path` as optional, a given `path` still wins,
// and without a default nothing changes. Run: node --test        (from the repo root; Node >= 18, no dependencies)
'use strict';
var test = require('node:test');
var assert = require('node:assert');
var path = require('path');
var cp = require('child_process');
var mcp = require('../scripts/xray-mcp.js');
var query = require('../scripts/xray-query.js');

var ROOT = path.join(__dirname, '..');
var SERVER = path.join(ROOT, 'scripts', 'xray-mcp.js');
var Q15 = path.join(ROOT, 'test', 'fixtures', 'iosxe-q15');
var FRR_R1 = path.join(ROOT, 'fixtures', 'frr-collect-sample', 'r1');

var nextId = 1;
function rpc(method, params) { return mcp.handle({ jsonrpc: '2.0', id: nextId++, method: method, params: params || {} }).result; }
function call(name, args) { return rpc('tools/call', { name: name, arguments: args }); }
function listed(name) { return rpc('tools/list').tools.filter(function (t) { return t.name === name; })[0]; }
function plain(x) { return JSON.parse(JSON.stringify(x)); }

test.afterEach(function () { mcp.setDefaultPath(null); });

test('no default path: path stays required and a call without it is an error (as before)', function () {
  assert.deepStrictEqual(listed('lab_state').inputSchema.required, ['path']);
  var r = call('lab_state', {});
  assert.strictEqual(r.isError, true);
  assert.deepStrictEqual(JSON.parse(r.content[0].text), { error: 'missing argument: path' });
  assert.deepStrictEqual(plain(rpc('tools/list').tools), plain(mcp.TOOLS), 'the list is exactly the one without a default');
});

test('with a default path: path is optional in tools/list (the text says so, without the folder: the definitions stay the same), state_diff is unchanged', function () {
  mcp.setDefaultPath(Q15);
  ['lab_state', 'why_best_path', 'list_routers', 'ospf_neighbors', 'ospf_interfaces', 'bgp_neighbors', 'route_lookup', 'why_path'].forEach(function (n) {
    var t = listed(n);
    assert.ok(t.inputSchema.required.indexOf('path') < 0, n + ': path still required');
    assert.match(t.inputSchema.properties.path.description, /Optional here: leave it empty/, n + ': the description says path may be empty');
    assert.ok(t.inputSchema.properties.path.description.indexOf(Q15) < 0, n + ': no folder name in the description (nx_mcp_path_desc_stable)');
  });
  assert.deepStrictEqual(listed('state_diff').inputSchema.required, ['before', 'after']);
  assert.deepStrictEqual(mcp.TOOLS.filter(function (t) { return t.name === 'lab_state'; })[0].inputSchema.required, ['path'], 'TOOLS itself is not changed');
});

test('with a default path: a call without path reads the default; a given path still wins', function () {
  mcp.setDefaultPath(Q15);
  var r = call('lab_state', {});
  assert.ok(!r.isError, r.content[0].text);
  assert.deepStrictEqual(r.structuredContent, query.summarize(query.loadStates(Q15)));
  var r2 = call('lab_state', { path: FRR_R1 });
  assert.deepStrictEqual(r2.structuredContent, query.summarize(query.loadStates(FRR_R1)), 'the client path is used as given');
  var r3 = call('list_routers', { path: '' });
  assert.deepStrictEqual(r3.structuredContent, query.listRouters(query.loadStates(Q15)), 'an empty path means the default');
});

// the server as a client starts it: --path, NX_MCP_PATH, and --path winning over NX_MCP_PATH
function runServer(args, env) {
  var lines = [
    { jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-11-25', capabilities: {}, clientInfo: { name: 'default-path-test', version: '0' } } },
    { jsonrpc: '2.0', id: 2, method: 'tools/call', params: { name: 'list_routers', arguments: {} } }
  ].map(function (m) { return JSON.stringify(m); }).join('\n') + '\n';
  var e = Object.assign({}, process.env); delete e.NX_MCP_PATH; Object.assign(e, env || {});
  var r = cp.spawnSync(process.execPath, [SERVER].concat(args), { input: lines, env: e, encoding: 'utf8', timeout: 30000 });
  return { status: r.status, stderr: r.stderr, out: r.stdout.split('\n').filter(Boolean).map(function (l) { return JSON.parse(l); }) };
}
var WANT = query.listRouters(query.loadStates(Q15));

test('the server started with --path <p>, --path=<p> or NX_MCP_PATH answers without a path', function () {
  [[['--path', Q15], {}], [['--path=' + Q15], {}], [[], { NX_MCP_PATH: Q15 }]].forEach(function (c) {
    var r = runServer(c[0], c[1]);
    var res = r.out.filter(function (m) { return m.id === 2; })[0].result;
    assert.ok(!res.isError, JSON.stringify(c) + ': ' + res.content[0].text);
    assert.deepStrictEqual(res.structuredContent, WANT, JSON.stringify(c));
  });
});

test('--path wins over NX_MCP_PATH; a default that is not there yet is said on stderr and not found on call', function () {
  var r = runServer(['--path', Q15], { NX_MCP_PATH: path.join(ROOT, 'no-such-state-dir') });
  assert.deepStrictEqual(r.out.filter(function (m) { return m.id === 2; })[0].result.structuredContent, WANT);
  var r2 = runServer([], { NX_MCP_PATH: path.join(ROOT, 'no-such-state-dir') });
  assert.match(r2.stderr, /default path does not exist yet/);
  assert.strictEqual(r2.out.filter(function (m) { return m.id === 2; })[0].result.isError, true);
});

test('--path without a value is a usage error (exit 2)', function () {
  var r = cp.spawnSync(process.execPath, [SERVER, '--path'], { input: '', encoding: 'utf8', timeout: 30000 });
  assert.strictEqual(r.status, 2);
  assert.match(r.stderr, /--path needs a value/);
});
