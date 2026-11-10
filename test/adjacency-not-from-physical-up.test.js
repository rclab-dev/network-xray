'use strict';
// Screen logic: a physically down / not-adjacent link is drawn as it is (no child processes).
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
for (const protocol of ['ospf', 'bgp']) {
  const state = { target_node: 'r1', protocol, r2_iface: 'eth1',
    interfaces: { eth1: { up: true } }, routing_table: [] };
  test(protocol + ': topology must not infer adjacency from physical up', () => {
    const el = container();
    topo.render(el, { states: { r1: state }, positions: { r1: { x: 0, y: 0 }, r2: { x: 100, y: 0 } } });
    assert.doesNotMatch(el.innerHTML, /<line[^>]*stroke="var\(--xto-(?:ospf|bgp)\)"/);
  });
  test(protocol + ': node figure must not infer adjacency from physical up', () => {
    const el = container();
    panel.render(el, state, { figure: true });
    assert.doesNotMatch(el.innerHTML, /<line[^>]*stroke="var\(--xnp-(?:ospf|bgp)\)"/);
  });
  test(protocol + ': legacy conversion must not invent an established protocol', () => {
    const node = unified.fromLegacyState(state);
    assert.equal(node.links.some(l => l.protocols.some(p => p.up)), false);
  });
}
