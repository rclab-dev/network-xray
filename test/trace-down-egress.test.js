'use strict';
// Screen logic: a physically down / not-adjacent link is drawn as it is (no child processes).
const test = require('node:test');
const assert = require('node:assert/strict');
const topo = require('../xray-topo-overlay.js');
test('a physically down egress cannot deliver to the next router', () => {
  const prefix = '8.8.8.0/24';
  const states = {
    r1: { interfaces: { eth1: { up: false } }, r2_iface: 'eth1',
      routing_table: [{ prefix, out_iface: 'eth1', protocol: 'ospf' }] },
    r2: { routing_table: [{ prefix, out_iface: 'eth2', protocol: 'connected' }] }
  };
  const hops = topo.trace(states, { r1: { x: 0, y: 0 }, r2: { x: 100, y: 0 } }, 'r1', prefix);
  assert.equal(hops.some(h => h.node === 'r2' && (h.terminal || h.arrived)), false,
    'trace must stop before r2 when r1 eth1 is physically down');
});
