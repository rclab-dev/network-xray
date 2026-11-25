// xray-mcp-router-node.test.js - why_best_path names the router `node`, the other tools `router`: each takes both names.
// Run: node --test        (from the repo root; Node >= 18, no dependencies)
'use strict';
var test = require('node:test');
var assert = require('node:assert');
var path = require('path');
var mcp = require('../scripts/xray-mcp.js');

var STATE = path.join(__dirname, '..', 'demo', 'bgp-lp', 'frameA.json');
var nextId = 1;
function call(name, args) {
  var r = mcp.handle({ jsonrpc: '2.0', id: nextId++, method: 'tools/call', params: { name: name, arguments: args } });
  return { isError: !!r.result.isError, body: JSON.parse(r.result.content[0].text) };
}

test('every tool with router also lists node (and the other way round), same type', function () {
  mcp.TOOLS.forEach(function (t) {
    var p = t.inputSchema.properties;
    if (p.router || p.node) assert.ok(p.router && p.node && p.router.type === 'string' && p.node.type === 'string', t.name);
  });
});

test('why_best_path takes router (the other tools\' name) as node', function () {
  var a = call('why_best_path', { path: STATE, node: 'r1', prefix: '8.8.8.0/24' });
  var b = call('why_best_path', { path: STATE, router: 'r1', prefix: '8.8.8.0/24' });
  assert.ok(!a.isError && !b.isError, JSON.stringify(b.body));
  assert.deepStrictEqual(b.body, a.body);
});

test('why_path takes node (why_best_path\'s name) as router', function () {
  var a = call('why_path', { path: STATE, router: 'r1', prefix: '8.8.8.8' });
  var b = call('why_path', { path: STATE, node: 'r1', prefix: '8.8.8.8' });
  assert.ok(!a.isError && !b.isError, JSON.stringify(b.body));
  assert.deepStrictEqual(b.body, a.body);
});

test('router and node naming two different routers is an error, not a silent pick', function () {
  var r = call('why_path', { path: STATE, router: 'r1', node: 'r2', prefix: '8.8.8.8' });
  assert.ok(r.isError && /router and node name different routers/.test(r.body.error || ''), JSON.stringify(r.body));
});
