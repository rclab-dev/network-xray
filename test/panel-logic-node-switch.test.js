'use strict';
// Run directly: node test/panel-logic-node-switch.test.js (no child processes).
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
const panel = page('xray-node-panel.js', 'XrayNodePanel');
test('switching nodes resets a selected prefix absent from the new node', () => {
  const el = container();
  const p = '10.1.0.0/24', q = '10.2.0.0/24';
  panel.render(el, { target_node: 'r1', interfaces: { eth1: { up: true } },
    routing_table: [{ prefix: p, out_iface: 'eth1' }] }, { figure: true });
  assert.equal(el._xnpSel, p, 'r1 has selected P');
  panel.render(el, { target_node: 'r2', interfaces: { eth2: { up: true } },
    routing_table: [{ prefix: q, out_iface: 'eth2' }] }, { figure: true });
  assert.equal(el._xnpSel, q, 'r2 must select its own default Q');
  assert.match(el.innerHTML, /r2  10\.2\.0\.0\/24 → eth2/);
  assert.match(el.innerHTML, /<polygon /, 'r2 must have its forwarding arrow');
});
