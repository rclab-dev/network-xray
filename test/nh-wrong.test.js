'use strict';
// wrong also lists routes that cannot be used because the next hop is not reachable (v1.8), and lab_state can return only
// wrong and counts (only_problems). The states below are small hand-made ones in the shape the collectors write.
// Run: node --test        (from the repo root; Node >= 18, no dependencies)
const test = require('node:test');
const assert = require('node:assert/strict');
const q = require('../scripts/xray-query.js');
const mcp = require('../scripts/xray-mcp.js');

function router(extra) {
  return Object.assign({ interfaces: { eth1: { up: true, ip: '10.0.12.1/24' } }, routing_table: [], bgp_routes: [] }, extra);
}
const texts = (states) => q.summarize(states).wrong.map((w) => w.text);

test('a BGP prefix whose only path has an unreachable next hop: one line', () => {
  const s = { r1: router({ bgp_routes: [{ prefix: '203.0.113.0/24', next_hop: '10.9.0.2', status: '  ', valid: false }] }) };
  assert.deepEqual(texts(s), ['r1 203.0.113.0/24 via 10.9.0.2: BGP next hop not reachable (the path is not used)']);
  const w = q.summarize(s).wrong[0];
  assert.equal(w.protocol, 'bgp'); assert.equal(w.kind, 'down'); assert.equal(w.next_hop, '10.9.0.2');
});

test('a next hop the router resolves recursively (valid) is not listed', () => {
  // iBGP: next hop 2.2.2.2 is a loopback learnt by OSPF - the router marks the path valid and installs it
  const s = { r1: router({ bgp_routes: [{ prefix: '8.8.8.0/24', next_hop: '2.2.2.2', status: '*>', best: true }],
    routing_table: [{ prefix: '8.8.8.0/24', protocol: 'bgp', next_hop: '2.2.2.2', out_iface: 'eth1', selected: true,
      resolved_via: { ip: '10.0.12.2', iface: 'eth1' } }] }) };
  assert.deepEqual(texts(s), []);
});

test('one path not valid but another one valid: nothing (the prefix is reachable)', () => {
  const s = { r1: router({ bgp_routes: [
    { prefix: '8.8.8.0/24', next_hop: '10.9.0.2', status: '  ', valid: false },
    { prefix: '8.8.8.0/24', next_hop: '10.0.12.2', status: '*>', best: true }] }) };
  assert.deepEqual(texts(s), []);
});

test('a BGP prefix not valid but installed by another protocol: nothing', () => {
  const s = { r1: router({ bgp_routes: [{ prefix: '10.5.0.0', prefixlen: 24, next_hop: '10.9.0.2', status: '  ', valid: false }],
    routing_table: [{ prefix: '10.5.0.0/24', protocol: 'ospf', next_hop: '10.0.12.2', out_iface: 'eth1', selected: true }] }) };
  assert.deepEqual(texts(s), [], 'prefix + prefixlen is read as 10.5.0.0/24');
});

test('a static route not installed and nothing else installed: one line', () => {
  const s = { r1: router({ routing_table: [{ prefix: '2.2.2.2/32', protocol: 'static', next_hop: '10.0.99.2', out_iface: '', selected: false }] }) };
  assert.deepEqual(texts(s), ['r1 2.2.2.2/32 via 10.0.99.2: static route not installed (next hop not reachable)']);
});

test('a static route not installed because another route is installed (a better distance): nothing', () => {
  const s = { r1: router({ routing_table: [
    { prefix: '0.0.0.0/0', protocol: 'static', next_hop: '10.0.12.2', out_iface: 'eth1', selected: false },
    { prefix: '0.0.0.0/0', protocol: 'ospf', next_hop: '10.0.12.2', out_iface: 'eth1', selected: true }] }) };
  assert.deepEqual(texts(s), []);
});

test('a static route whose interface is down: only the interface line (not twice)', () => {
  const s = { r1: router({ interfaces: { eth1: { up: false, ip: '10.0.12.1/24' } },
    routing_table: [{ prefix: '0.0.0.0/0', protocol: 'static', next_hop: '10.0.12.2', out_iface: 'eth1', selected: false }] }) };
  assert.deepEqual(texts(s), ['r1 eth1: interface down']);
});

test('a recursive next hop resolved only through the management network: a warning', () => {
  const s = { r1: router({ routing_table: [{ prefix: '8.8.8.0/24', protocol: 'bgp', next_hop: '3.3.3.3', out_iface: 'eth0', selected: true,
    resolved_via: { ip: '172.20.20.1', iface: 'eth0', via_mgmt: true } }] }) };
  const w = q.summarize(s).wrong;
  assert.equal(w.length, 1); assert.equal(w[0].kind, 'warn');
  assert.equal(w[0].text, 'r1 8.8.8.0/24 via 3.3.3.3: the next hop is reached only through the containerlab management network (not inside the lab)');
});

test('lab_state only_problems: wrong and counts only; the default is unchanged', () => {
  const s = { r1: router({ routing_table: [{ prefix: '2.2.2.2/32', protocol: 'static', next_hop: '10.0.99.2', selected: false }] }) };
  const full = q.summarize(s);
  assert.deepEqual(Object.keys(full).slice(0, 2), ['wrong', 'nodes'], 'default: the whole summary');
  const tool = mcp.TOOLS.find((t) => t.name === 'lab_state');
  assert.equal(tool.inputSchema.properties.only_problems.type, 'boolean');
  assert.ok(tool.inputSchema.required.indexOf('only_problems') < 0, 'optional');
});

test('tools/call lab_state with only_problems: true returns wrong and counts only; a non-boolean is refused', () => {
  const path = require('node:path'), cp = require('node:child_process');
  const SERVER = path.join(__dirname, '..', 'scripts', 'xray-mcp.js');
  const Q15 = path.join(__dirname, 'fixtures', 'iosxe-q15');
  const req = (id, method, params) => JSON.stringify({ jsonrpc: '2.0', id, method, params });
  const lines = [req(1, 'initialize', { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'test', version: '0' } }),
    JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' }),
    req(3, 'tools/call', { name: 'lab_state', arguments: { path: Q15, only_problems: true } }),
    req(4, 'tools/call', { name: 'lab_state', arguments: { path: Q15, only_problems: 'yes' } }),
    req(5, 'tools/call', { name: 'lab_state', arguments: { path: Q15 } })];
  const r = cp.spawnSync(process.execPath, [SERVER], { input: lines.join('\n') + '\n', encoding: 'utf8', timeout: 10000, env: Object.assign({}, process.env, { NX_MCP_ALLOW_ANY_PATH: '1' }) });
  assert.equal(r.status, 0, r.stderr);
  const by = {}; r.stdout.split('\n').filter(Boolean).map((l) => JSON.parse(l)).forEach((m) => { by[m.id] = m; });
  const only = JSON.parse(by[3].result.content[0].text);
  assert.deepEqual(Object.keys(only), ['wrong', 'counts']);
  assert.ok(by[4].result.isError, 'only_problems must be true or false');
  const all = JSON.parse(by[5].result.content[0].text);
  assert.deepEqual(all.wrong, only.wrong); assert.deepEqual(all.counts, only.counts);
  assert.ok(Array.isArray(all.nodes), 'the default answer still has nodes');
});
