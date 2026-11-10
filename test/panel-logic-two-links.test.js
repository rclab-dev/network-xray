'use strict';
// Run directly: node test/panel-logic-two-links.test.js (no child processes).
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
// Only DOM operations used by render; inspect the actual generated markup.
function page(file, api) {
  const window = {};
  const document = { getElementById: () => ({}), head: { appendChild() {} } };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '..', file), 'utf8'),
    { window, document }, { filename: file });
  return window[api];
}
function container() {
  return { innerHTML: '', classList: { add() {} },
    querySelector: () => null, querySelectorAll: () => [] };
}
const topo = page('xray-topo-overlay.js', 'XrayTopoOverlay');
const panel = page('xray-node-panel.js', 'XrayNodePanel');
const unified = page('xray-unified.js', 'XrayUnified');
const prefix = '8.8.8.0/24';
const state = { target_node: 'r1', r2_iface: 'eth1', r2_has_full: true,
  interfaces: { eth1: { up: true }, eth2: { up: true } },
  peer_links: ['eth1', 'eth2'].map(iface => ({ iface, peer: 'r2', up: true,
    full: true, state: 'Full', ospf_full: true, ospf_state: 'Full' })),
  routing_table: [{ prefix, out_iface: 'eth2', protocol: 'ospf' }] };
const states = { r1: state, r2: { r1_iface: 'eth1', r1_has_full: true,
  interfaces: { eth1: { up: true }, eth2: { up: true } },
  peer_links: state.peer_links.map(l => ({ ...l, peer: 'r1' })),
  routing_table: [{ prefix, out_iface: 'lo', protocol: 'connected' }] } };
test('topology preserves two parallel links to r2', () => {
  assert.equal(topo.deriveEdges(states).length, 2);
});
test('trace resolves the peer on the second interface', () => {
  const hops = topo.trace(states, {}, 'r1', prefix);
  assert.equal(hops.at(-1).node, 'r2', 'eth2 must reach r2 through peer_links');
  assert.equal(hops.at(-1).terminal, true);
});
test('node figure labels eth2 with its peer', () => {
  const el = container();
  panel.render(el, state, { figure: true });
  assert.match(el.innerHTML, /eth2 — r2<\/text>/);
});
test('legacy conversion associates both interfaces with r2', () => {
  const links = unified.fromLegacyState(state).links;
  assert.equal(links.find(l => l.iface === 'eth2').peer, 'r2');
});
