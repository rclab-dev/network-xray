// mcp-tools-snapshot.test.js - the MCP server's public tool list (name, description, inputSchema)
// must match test/fixtures/mcp-tools.snapshot.json.
//
// A failure here means a tool was added, removed, renamed, or its description or input schema
// changed. MCP clients rely on these, so check that the change is intended. If it is, update the
// snapshot and commit it together with the change:
//
//   UPDATE_MCP_SNAPSHOT=1 node --test test/mcp-tools-snapshot.test.js
//
// Run: node --test        (from the repo root; Node >= 18, no dependencies)
'use strict';
var test = require('node:test');
var assert = require('node:assert');
var fs = require('fs');
var path = require('path');
var cp = require('child_process');

var ROOT = path.join(__dirname, '..');
var SERVER = path.join(ROOT, 'scripts', 'xray-mcp.js');
var SNAPSHOT = path.join(__dirname, 'fixtures', 'mcp-tools.snapshot.json');
var UPDATE_HINT = 'If this change is intended, update the snapshot and commit it:\n' +
  '  UPDATE_MCP_SNAPSHOT=1 node --test test/mcp-tools-snapshot.test.js';

// ask a fresh server for tools/list over stdio, exactly as a client would
function listTools() {
  var lines = [
    { jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-11-25', capabilities: {}, clientInfo: { name: 'snapshot-test', version: '0' } } },
    { jsonrpc: '2.0', method: 'notifications/initialized' },
    { jsonrpc: '2.0', id: 2, method: 'tools/list', params: {} }
  ].map(function (m) { return JSON.stringify(m); });
  var r = cp.spawnSync(process.execPath, [SERVER], { input: lines.join('\n') + '\n', encoding: 'utf8', timeout: 10000 });
  assert.strictEqual(r.status, 0, r.stderr);
  var reply = r.stdout.split('\n').filter(Boolean).map(function (l) { return JSON.parse(l); })
    .filter(function (m) { return m.id === 2; })[0];
  assert.ok(reply && reply.result && Array.isArray(reply.result.tools), 'no tools/list result: ' + r.stdout);
  return reply.result.tools.map(function (t) {
    return { name: t.name, description: t.description, inputSchema: t.inputSchema };
  });
}

function render(tools) { return JSON.stringify(tools, null, 2) + '\n'; }

test('MCP tools/list matches the committed snapshot', function () {
  var actual = listTools();
  if (process.env.UPDATE_MCP_SNAPSHOT) {
    fs.writeFileSync(SNAPSHOT, render(actual));
    return;
  }
  assert.ok(fs.existsSync(SNAPSHOT), 'missing ' + path.relative(ROOT, SNAPSHOT) + '\n' + UPDATE_HINT);
  var expected = JSON.parse(fs.readFileSync(SNAPSHOT, 'utf8'));

  var names = function (list) { return list.map(function (t) { return t.name; }); };
  assert.deepStrictEqual(names(actual), names(expected),
    'MCP tool names or order changed.\n' + UPDATE_HINT);
  actual.forEach(function (t, i) {
    assert.deepStrictEqual(t, expected[i], 'MCP tool "' + t.name + '" changed.\n' + UPDATE_HINT);
  });
});

test('MCP tools snapshot file is in canonical form', function () {
  // keeps diffs to the snapshot readable: 2-space JSON, LF, trailing newline
  var text = fs.readFileSync(SNAPSHOT, 'utf8');
  assert.strictEqual(text, render(JSON.parse(text)), 'reformat with:\n  UPDATE_MCP_SNAPSHOT=1 node --test test/mcp-tools-snapshot.test.js');
});
