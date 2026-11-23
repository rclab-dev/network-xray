// mcp-apps-view.test.js — ui/view.js, the MCP Apps picture, in a small fake window with a fake host (postMessage by hand):
// it starts with ui/initialize, takes the tool's arguments, asks for view_data and opens the router the tool was about.
// Run: node --test   (from the repo root; Node >= 18, no dependencies)
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const SRC = fs.readFileSync(path.join(__dirname, '..', 'ui', 'view.js'), 'utf8');
const tick = () => new Promise((r) => setImmediate(r));
async function settle() { for (let i = 0; i < 10; i++) await tick(); }

const DATA = {
  nodes: [{ name: 'r1' }, { name: 'r2' }, { name: 'r3' }],
  links: [{ source: 'r1', target: 'r2', source_endpoint: 'eth1', target_endpoint: 'eth1' }, { source: 'r2', target: 'r3', source_endpoint: 'eth2', target_endpoint: 'eth1' }],
  states: { r1: { protocol: 'bgp', bgp_routes: [] }, r2: { ospf_configured: true }, r3: {} },
};

function view() {
  const sent = [], calls = [], listeners = [];
  const msgEl = { textContent: '', className: '', style: {} };
  const host = { postMessage(m) { sent.push(JSON.parse(JSON.stringify(m))); } };
  const win = {
    parent: host, JSON, Promise,
    setTimeout: (fn) => fn(),
    document: { documentElement: { scrollHeight: 700, scrollWidth: 900 }, body: { scrollHeight: 650 }, getElementById: (id) => (id === 'nx-view-msg' ? msgEl : null) },
    addEventListener: (ev, fn) => { if (ev === 'message') listeners.push(fn); },
    clabXray: { deepViews: (cfg, id, o) => { calls.push(['deepViews', id, cfg.nodes.length, cfg.networks.length]); return [{ scene: { config: { nodes: cfg.nodes.slice(), xray: {} }, topo: {} } }]; } },
    xrayCore: {
      renderTopology: (sel, c) => calls.push(['render', sel, c.xray.protocol || null]),
      openDeepDiveFor: (id) => calls.push(['open', id]),
      setBgpTable: (src) => calls.push(['bgp', typeof src]),
      applyDeepLink: (l) => calls.push(['link', JSON.parse(JSON.stringify(l))]),
    },
  };
  win.window = win;
  vm.runInNewContext(SRC, win);
  const fromHost = (m, source) => listeners.forEach((f) => f({ source: source || host, data: Object.assign({ jsonrpc: '2.0' }, m) }));
  return { win, sent, calls, msgEl, fromHost, last: (method) => sent.filter((m) => m.method === method).pop() };
}

async function start(v, args, viewData) {
  const init = v.last('ui/initialize');
  v.fromHost({ id: init.id, result: { protocolVersion: '2026-01-26', hostCapabilities: { serverTools: {} }, hostContext: {} } });
  await settle();
  v.fromHost({ method: 'ui/notifications/tool-input', params: { arguments: args } });
  v.fromHost({ method: 'ui/notifications/tool-result', params: { content: [{ type: 'text', text: '...' }] } });
  await settle();
  const call = v.last('tools/call');
  if (call && viewData !== undefined) { v.fromHost(viewData(call.id)); await settle(); }
  return call;
}

test('ui/initialize, then initialized; the tool result asks for view_data with the tool\'s path only', async () => {
  const v = view();
  assert.deepStrictEqual(v.sent[0].method, 'ui/initialize');
  assert.strictEqual(v.sent[0].params.clientInfo.name, 'network-xray');
  const call = await start(v, { path: '/lab/x', node: 'r1', prefix: '8.8.8.0/24', other: 'x' });
  assert.ok(v.last('ui/notifications/initialized'));
  assert.deepStrictEqual(call.params, { name: 'view_data', arguments: { path: '/lab/x' } });
  const v2 = view();
  assert.deepStrictEqual((await start(v2, { node: 'r1' })).params.arguments, {});   // no path: the server's default
});

test('the router the tool was about is opened, as BGP when its state says so, and the prefix is picked', async () => {
  const v = view();
  await start(v, { node: 'r1', prefix: '8.8.8.0/24' }, (id) => ({ id, result: { structuredContent: DATA } }));
  assert.deepStrictEqual(v.calls, [['deepViews', 'r1', 3, 2], ['render', '#topo', 'bgp'], ['open', 'r1'], ['bgp', 'function'], ['link', { prefix: '8.8.8.0/24' }]]);
  assert.strictEqual(v.msgEl.style.display, 'none');
  assert.ok(v.last('ui/notifications/size-changed'));
});

test('router (why_path / ospf_neighbors) works too; a router that is not in the lab opens the most connected one', async () => {
  let v = view();
  await start(v, { router: 'r3' }, (id) => ({ id, result: { structuredContent: DATA } }));
  assert.deepStrictEqual(v.calls.filter((c) => c[0] === 'open'), [['open', 'r3']]);
  v = view();
  await start(v, { router: '"><img src=x onerror=alert(1)>' }, (id) => ({ id, result: { structuredContent: DATA } }));
  assert.deepStrictEqual(v.calls.filter((c) => c[0] === 'open'), [['open', 'r2']]);
  assert.ok(!v.calls.some((c) => c[0] === 'link'));   // no prefix given
});

test('view_data refused / an error result: the reason is shown as text and nothing is drawn', async () => {
  let v = view();
  await start(v, { node: 'r1' }, (id) => ({ id, error: { code: -32601, message: 'tools/call is not supported' } }));
  assert.deepStrictEqual(v.calls, []);
  assert.match(v.msgEl.textContent, /cannot read the lab state through the host \(tools\/call is not supported\)/);
  v = view();
  await start(v, { node: 'r1' }, (id) => ({ id, result: { isError: true, content: [{ type: 'text', text: '{}' }] } }));
  assert.deepStrictEqual(v.calls, []);
  assert.match(v.msgEl.textContent, /could not get the lab state/);
});

test('messages from anyone but the host are ignored; the same result twice is drawn once; teardown is answered', async () => {
  const v = view();
  v.fromHost({ method: 'ui/notifications/tool-input', params: { arguments: { node: 'r1' } } }, { postMessage() {} });
  v.fromHost({ method: 'ui/notifications/tool-result', params: {} }, { postMessage() {} });
  await settle();
  assert.ok(!v.last('tools/call'));
  await start(v, { node: 'r1' }, (id) => ({ id, result: { structuredContent: DATA } }));
  const n = v.sent.filter((m) => m.method === 'tools/call').length;
  v.fromHost({ method: 'ui/notifications/tool-result', params: {} });
  await settle();
  assert.strictEqual(v.sent.filter((m) => m.method === 'tools/call').length, n);
  v.fromHost({ id: 99, method: 'ui/resource-teardown', params: {} });
  assert.deepStrictEqual(v.sent.pop(), { id: 99, result: {}, jsonrpc: '2.0' });
});
