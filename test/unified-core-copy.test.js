'use strict';
// xray-core.js carries its own copy of the XrayUnified renderer (the pages load xray-core.js alone; xray-unified.js
// is the standalone file). The two must agree on fromLegacyState and on node.forwarding, or a state converted
// through window.XrayUnified on a page is drawn differently from the same state in the standalone file.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function run(src, file) {
  const window = {};
  const document = { getElementById: () => ({}), head: { appendChild() {} }, body: { classList: { contains: () => false } } };
  // the copy inside xray-core.js names two helpers of that file; the figure under test does not depend on their text
  const _xrayOspfStateWord = (st) => String(st == null ? "" : st);
  const _escapeHtml = (s) => String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  vm.runInNewContext(src, { window, document, _xrayOspfStateWord, _escapeHtml }, { filename: file });
  return window.XrayUnified;
}
function standalone() {
  return run(fs.readFileSync(path.join(__dirname, '..', 'xray-unified.js'), 'utf8'), 'xray-unified.js');
}
// the copy inside xray-core.js: the IIFE that ends with `root.XrayUnified = {...}`, cut out as text
function coreCopy() {
  const src = fs.readFileSync(path.join(__dirname, '..', 'xray-core.js'), 'utf8');
  const exp = src.indexOf('\n  root.XrayUnified = {');
  assert.ok(exp > 0, 'xray-core.js: root.XrayUnified not found');
  const start = src.lastIndexOf('\n(function(root) {', exp) + 1;
  const end = src.indexOf('\n})(typeof window !== "undefined" ? window : this);', exp);
  assert.ok(start > 0 && end > start, 'xray-core.js: XrayUnified IIFE not found');
  return run(src.slice(start, src.indexOf('\n', end + 1) + 1), 'xray-core.js (XrayUnified copy)');
}

const states = {
  'down link and resolved egress': { target_node: 'r1', interfaces: { eth1: { up: false }, eth2: { up: true } },
    r2_iface: 'eth1', r2_has_full: false, r3_iface: 'eth2', r3_has_full: true,
    routing_table: [{ prefix: '8.8.8.0/24', out_iface: 'eth2', protocol: 'ospf' }],
    route_resolution: { matched_prefix: '8.8.8.0/24', out_iface: 'eth2' } },
  'unresolved': { target_node: 'r1', interfaces: { eth1: { up: true } }, routing_table: [], route_resolution: null },
  'peer from peer_links, bgp, egress from the table row': { target_node: 'r1', protocol: 'bgp',
    interfaces: { eth1: { up: true }, eth2: { up: true }, lo: { up: true } },
    peer_links: [{ iface: 'eth1', peer: 'r2' }, { iface: 'eth2', peer: 'r3' }],
    r2_proto: 'bgp', r2_has_full: true, r3_proto: 'bgp', r3_has_full: false,
    routing_table: [{ prefix: '10.0.0.0/8', out_iface: 'eth1' }],
    route_resolution: { matched_prefix: '10.0.0.0/8' } },
  'egress is down': { target_node: 'r1', interfaces: { eth1: { up: false } }, r2_iface: 'eth1', r2_has_full: true,
    route_resolution: { out_iface: 'eth1' } }
};

const unified = standalone(), core = coreCopy();
const plain = (v) => JSON.parse(JSON.stringify(v));

for (const name of Object.keys(states)) {
  test('fromLegacyState in xray-core.js equals xray-unified.js: ' + name, () => {
    // the two run in separate vm contexts: compare the plain values, not the prototypes
    assert.deepEqual(plain(core.fromLegacyState(states[name])), plain(unified.fromLegacyState(states[name])));
  });
}

test('the copy in xray-core.js keeps physical down, selected egress and forwarding', () => {
  const node = core.fromLegacyState(states['down link and resolved egress']);
  assert.equal(node.links.find(l => l.iface === 'eth1').up, false);
  assert.equal(node.links.find(l => l.selected).iface, 'eth2');
  assert.equal(node.forwarding, true);
  assert.equal(core.fromLegacyState(states['unresolved']).forwarding, false);
  assert.equal(core.fromLegacyState(states['egress is down']).forwarding, false, 'a down egress does not forward');
});

test('the copy in xray-core.js draws no forwarding arrow when node.forwarding is false', () => {
  const node = core.fromLegacyState(states['down link and resolved egress']);
  const withArrow = core.renderSvg(node);
  const without = core.renderSvg(Object.assign({}, node, { forwarding: false }));
  assert.notEqual(withArrow, without);
  assert.ok(withArrow.length > without.length, 'the arrow is markup that the forwarding=false figure lacks');
  assert.match(withArrow, /stroke="var\(--xto-linkDown,#ff4d4d\)"/, 'eth1 is drawn physically down');
});
