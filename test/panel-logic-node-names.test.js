'use strict';
// Run directly: node test/panel-logic-node-names.test.js (no child processes).
const test = require('node:test');
const assert = require('node:assert/strict');
const topo = require('../xray-topo-overlay.js');
test('constructor is a valid initial node name, not an already visited node', () => {
  const hops = topo.trace({ constructor: { routing_table: [] } }, {}, 'constructor', '8.8.8.0/24');
  assert.equal(hops.length, 1);
  assert.equal(hops[0].drop, true, 'empty routing table must report no route');
  assert.notEqual(hops[0].loop, true);
});
