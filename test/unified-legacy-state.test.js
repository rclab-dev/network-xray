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
const unified = page('xray-unified.js', 'XrayUnified');
const state = { target_node: 'r1', interfaces: { eth1: { up: false }, eth2: { up: true } },
  r2_iface: 'eth1', r2_has_full: false, r3_iface: 'eth2', r3_has_full: true,
  routing_table: [{ prefix: '8.8.8.0/24', out_iface: 'eth2', protocol: 'ospf' }],
  route_resolution: { matched_prefix: '8.8.8.0/24', out_iface: 'eth2' } };
test('legacy conversion preserves physical down in the generated figure', () => {
  const node = unified.fromLegacyState(state);
  assert.match(unified.renderSvg(node), /stroke="var\(--xto-linkDown,#ff4d4d\)"/,
    'eth1 must be drawn physically down');
});
test('legacy conversion selects the resolved eth2 egress', () => {
  const node = unified.fromLegacyState(state);
  assert.equal(node.links.find(l => l.selected)?.iface, 'eth2',
    'the renderer otherwise falls back to first link eth1');
});
test('unresolved legacy state does not emit a forwarding arrow by default', () => {
  const node = unified.fromLegacyState({ target_node: 'r1',
    interfaces: { eth1: { up: true } }, routing_table: [], route_resolution: null });
  assert.doesNotMatch(unified.renderSvg(node), /<polygon /,
    'no resolved route means no forwarding arrow');
});
