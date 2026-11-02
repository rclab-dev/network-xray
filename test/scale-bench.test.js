// scale-bench.test.js - scripts/scale-bench.js runs for a 10-router lab and produces a valid xray-states.js.
// Run: node --test        (from the repo root; Node >= 18, no dependencies)
'use strict';
var test = require('node:test');
var assert = require('node:assert');
var path = require('path');
var cp = require('child_process');
var vm = require('vm');

var BENCH = path.join(__dirname, '..', 'scripts', 'scale-bench.js');

test('scale-bench --json: 10 routers, one row with times and sizes', function () {
  var r = cp.spawnSync(process.execPath, [BENCH, '--routers', '10', '--iterations', '1', '--json'], { encoding: 'utf8', timeout: 60000 });
  assert.strictEqual(r.status, 0, r.stderr);
  var out = JSON.parse(r.stdout);
  assert.strictEqual(out.rows.length, 1);
  var row = out.rows[0];
  assert.strictEqual(row.routers, 10);
  assert.strictEqual(row.links, 11);   // ring of 10 + 1 chord
  assert.ok(row.collect_ms >= 0 && row.merge_ms >= 0 && row.parse_merge_ms >= 0);
  assert.ok(row.state_bytes > 1000, 'state_bytes ' + row.state_bytes);
});

test('scale-bench: the produced xray-states.js loads and holds one good state per router', function () {
  ['ospf', 'bgp'].forEach(function (proto) {
    var res = require(BENCH).runBench(10, { proto: proto, iterations: 1 });
    assert.ok(/^window\.LIVE_STATES = /.test(res.text));
    var ctx = { window: {} };
    vm.runInNewContext(res.text, ctx);
    var states = ctx.window.LIVE_STATES;
    assert.strictEqual(Object.keys(states).length, 10);
    Object.keys(states).forEach(function (n) {
      var s = states[n];
      assert.strictEqual(s.target_node, n);
      assert.strictEqual(s.success, true);
      assert.ok(s.ospf_neighbors.length >= 2 && s.ospf_neighbors.every(function (x) { return x.full; }), proto + ' ' + n + ' OSPF neighbors');
      assert.ok(s.bgp_neighbors.length >= 2 && s.bgp_neighbors.every(function (x) { return x.state === 'Established'; }), proto + ' ' + n + ' BGP neighbors');
      if (proto === 'ospf') assert.strictEqual(s.peer_sending_hello, true);
    });
  });
});

test('scale-bench: a bad argument exits 2', function () {
  var r = cp.spawnSync(process.execPath, [BENCH, '--routers', 'x'], { encoding: 'utf8' });
  assert.strictEqual(r.status, 2);
});
