// Edge cases for the BGP why queries and their MCP tools; run with node test/why-path-edge.test.js.
'use strict';
var test = require('node:test');
var assert = require('node:assert');
var fs = require('fs');
var path = require('path');
var query = require('../scripts/xray-query.js');
var mcp = require('../scripts/xray-mcp.js');

var prefix = '203.0.113.0/24';
function row(extra) {
  return Object.assign({ prefix: '203.0.113.0', prefixlen: 24, next_hop: '10.0.0.1',
    as_path: '65002', status: '* ', best: false }, extra);
}
function withState(routes, fn) {
  var state = { target_node: 'r1', interfaces: {}, bgp_routes: routes };
  var states = { r1: state };
  var dir = fs.mkdtempSync(path.join(__dirname, '.why-path-edge-'));
  try {
    fs.writeFileSync(path.join(dir, 'state_r1.json'), JSON.stringify(state));
    function call(name, destination) {
      var args = { path: dir, prefix: destination };
      args[name === 'why_best_path' ? 'node' : 'router'] = 'r1';
      return mcp.handle({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: name, arguments: args } }).result;
    }
    function answers(destination) {
      var w = query.why(states, 'r1', destination), p = query.whyPath(states, 'r1', destination);
      var mw = call('why_best_path', destination), mp = call('why_path', destination);
      assert.deepStrictEqual(mw.structuredContent, w);
      assert.deepStrictEqual(mp.structuredContent, p);
      return { why: w, path: p };
    }
    fn(states, call, answers);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
}

test('one candidate: both tools identify the best and its stored reason', function () {
  withState([row({ best: true, reason: 'Only path' })], function (states, call, answers) {
    var a = answers(prefix);
    assert.strictEqual(a.why.paths, 1);
    assert.strictEqual(a.why.best.next_hop, '10.0.0.1');
    assert.strictEqual(a.why.reason, 'Only path');
    assert.strictEqual(a.path.selected.next_hop, '10.0.0.1');
    assert.deepStrictEqual(a.path.candidates, []);
    assert.strictEqual(a.path.deciding_step, 'Only path');
    assert.strictEqual(a.path.reason_source, 'device');
  });
});

test('no candidate has local_pref: compare the AS paths', function () {
  withState([row({ best: true }), row({ next_hop: '10.0.0.2', as_path: '65002 65003' })], function (states, call, answers) {
    var a = answers(prefix);
    assert.strictEqual(a.why.paths, 2);
    assert.strictEqual(a.why.best.next_hop, '10.0.0.1');
    assert.ok(a.why.candidates.every(function (r) { return !('local_pref' in r); }));
    assert.strictEqual(a.path.selected.next_hop, '10.0.0.1');
    assert.strictEqual(a.path.candidates[0].next_hop, '10.0.0.2');
    assert.strictEqual(a.path.deciding_step, 'AS-Path');
    assert.strictEqual(a.path.reason_source, 'comparison');
  });
});

test('no candidate marked best: both tools say there is no selection', function () {
  withState([row({}), row({ next_hop: '10.0.0.2' })], function (states, call, answers) {
    var a = answers(prefix);
    assert.strictEqual(a.why.best, null);
    assert.strictEqual(a.why.reason, null);
    assert.strictEqual(a.why.candidates.length, 2);
    assert.match(a.why.note, /none of the 2 path\(s\) is marked best/);
    assert.strictEqual(a.path.selected, null);
    assert.strictEqual(a.path.candidates.length, 2);
    assert.strictEqual(a.path.deciding_step, null);
    assert.strictEqual(a.path.reason_source, null);
    assert.match(a.path.note, /none of the 2 path\(s\) is marked best/);
  });
});

test('no stored reason and tied candidates: neither tool invents a reason', function () {
  withState([row({ best: true }), row({ next_hop: '10.0.0.2' })], function (states, call, answers) {
    var a = answers(prefix);
    assert.strictEqual(a.why.best.next_hop, '10.0.0.1');
    assert.strictEqual(a.why.reason, null);
    assert.match(a.why.note, /no reason stored/);
    assert.strictEqual(a.path.selected.next_hop, '10.0.0.1');
    assert.strictEqual(a.path.deciding_step, null);
    assert.strictEqual(a.path.reason_source, null);
    assert.match(a.path.note, /later step not in the data/);
  });
});

test('host address versus exact prefix and missing prefix', function () {
  withState([row({ best: true, reason: 'Only path' })], function (states, call, answers) {
    var exact = answers(prefix).path;
    var host = query.whyPath(states, 'r1', '203.0.113.9');
    assert.deepStrictEqual(call('why_path', '203.0.113.9').structuredContent, host);
    assert.strictEqual(host.prefix, prefix);
    assert.strictEqual(host.destination, '203.0.113.9');
    assert.match(host.destination_note, /prefix that contains the address/);
    assert.deepStrictEqual(host.selected, exact.selected);
    assert.strictEqual(host.deciding_step, exact.deciding_step);
    assert.strictEqual(exact.destination, undefined);
    ['203.0.113.9', '198.51.100.0/24'].forEach(function (input) {
      var result = call('why_best_path', input);
      assert.strictEqual(result.isError, true);
      assert.match(result.content[0].text, /unknown prefix on r1/);
      assert.throws(function () { query.why(states, 'r1', input); }, function (e) { return /unknown prefix on r1/.test(e.message); });
    });
    var missing = call('why_path', '198.51.100.0/24');
    assert.strictEqual(missing.isError, true);
    assert.match(missing.content[0].text, /unknown prefix on r1/);
    assert.throws(function () { query.whyPath(states, 'r1', '198.51.100.0/24'); }, function (e) { return /unknown prefix on r1/.test(e.message); });
  });
});
