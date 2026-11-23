// mcp-apps.test.js — the MCP Apps picture (io.modelcontextprotocol/ui): only a client that says it draws it gets the
// ui:// resource, the four tools that point at it and view_data; any other client sees the tools it saw before.
// Run: node --test   (from the repo root; Node >= 18, no dependencies)
'use strict';
var test = require('node:test');
var assert = require('node:assert');
var path = require('path');
var cp = require('child_process');

var ROOT = path.join(__dirname, '..');
var SERVER = path.join(ROOT, 'scripts', 'xray-mcp.js');
var Q15 = path.join(ROOT, 'test', 'fixtures', 'iosxe-q15');
var UI_CAPS = { extensions: { 'io.modelcontextprotocol/ui': { mimeTypes: ['text/html;profile=mcp-app'] } } };

function session(caps, lines) {
  var init = JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-11-25', capabilities: caps || {}, clientInfo: { name: 't', version: '0' } } });
  var r = cp.spawnSync(process.execPath, [SERVER], { input: [init].concat(lines).join('\n') + '\n', encoding: 'utf8', timeout: 20000, maxBuffer: 64 * 1024 * 1024, env: Object.assign({}, process.env, { NX_MCP_ALLOW_ANY_PATH: '1' }) });
  var byId = {};
  r.stdout.split('\n').filter(Boolean).forEach(function (l) { var m = JSON.parse(l); byId[m.id] = m; });
  return byId;
}
function req(id, method, params) { return JSON.stringify({ jsonrpc: '2.0', id: id, method: method, params: params || {} }); }

test('a client that does not say it draws MCP Apps: the same capabilities and tools as before, no view_data', function () {
  var s = session({}, [req(2, 'tools/list'), req(3, 'tools/call', { name: 'view_data', arguments: { path: Q15 } })]);
  assert.deepStrictEqual(s[1].result.capabilities, { tools: { listChanged: false } });
  var tools = s[2].result.tools;
  assert.ok(tools.every(function (t) { return !t._meta; }));
  assert.ok(!tools.some(function (t) { return t.name === 'view_data'; }));
  assert.match(s[3].error.message, /Unknown tool: view_data/);
  // the tool list is exactly the module's own list (the snapshot test checks that list)
  assert.deepStrictEqual(tools, JSON.parse(JSON.stringify(require(SERVER).TOOLS)));
});

test('a client that says so: four tools point at ui://network-xray/view.html; view_data is for the picture only', function () {
  var s = session(UI_CAPS, [req(2, 'tools/list')]);
  assert.deepStrictEqual(s[1].result.capabilities, { tools: { listChanged: false }, resources: { listChanged: false } });
  var by = {}; s[2].result.tools.forEach(function (t) { by[t.name] = t; });
  ['lab_state', 'why_best_path', 'why_path', 'ospf_neighbors'].forEach(function (n) {
    assert.deepStrictEqual(by[n]._meta, { ui: { resourceUri: 'ui://network-xray/view.html' } }, n);
  });
  ['list_routers', 'bgp_neighbors', 'route_lookup', 'state_diff', 'check_run'].forEach(function (n) { assert.strictEqual(by[n]._meta, undefined, n); });
  assert.deepStrictEqual(by.view_data._meta.ui.visibility, ['app']);
  assert.deepStrictEqual(by.view_data.annotations.readOnlyHint, true);
});

test('resources/read gives one HTML in the MCP Apps type, with the engine inlined and nothing loaded from outside', function () {
  var s = session(UI_CAPS, [req(2, 'resources/list'), req(3, 'resources/read', { uri: 'ui://network-xray/view.html' }), req(4, 'resources/read', { uri: 'ui://network-xray/other.html' })]);
  assert.deepStrictEqual(s[2].result.resources.map(function (r) { return [r.uri, r.mimeType]; }), [['ui://network-xray/view.html', 'text/html;profile=mcp-app']]);
  var c = s[3].result.contents[0];
  assert.strictEqual(c.mimeType, 'text/html;profile=mcp-app');
  var html = c.text;
  assert.strictEqual((html.match(/<script>/g) || []).length, 7);   // the six files + decision-bracket.html as text
  assert.strictEqual((html.match(/<\/script/gi) || []).length, 7);   // every closer is one of the seven: none inside the inlined files
  var outside = html.replace(/<script>[\s\S]*?<\/script>/g, '');   // the page around the six inline scripts
  assert.doesNotMatch(outside, /<script[^>]+src=|<link[^>]+href=|@import|\bsrc=|\bnx-inline:/);
  assert.ok(html.indexOf('window.xrayCore') > 0 && html.indexOf('clabXray') > 0 && html.indexOf('ui/initialize') > 0);
  assert.strictEqual(s[4].error.code, -32002);
});

test('the picture script asks for nothing on the network and opens no URL', function () {
  var js = require('fs').readFileSync(path.join(ROOT, 'ui', 'view.js'), 'utf8');
  assert.doesNotMatch(js, /\bfetch\(|XMLHttpRequest|WebSocket|window\.open|location\s*=|\.innerHTML\s*=/);
});

test('view_data: the lab state and its links in the graph shape; a file that is not a lab state is refused', function () {
  var s = session(UI_CAPS, [
    req(2, 'tools/call', { name: 'view_data', arguments: { path: Q15 } }),
    req(3, 'tools/call', { name: 'view_data', arguments: { path: path.join(ROOT, 'README.md') } })
  ]);
  var d = s[2].result.structuredContent;
  assert.deepStrictEqual(d.nodes.map(function (n) { return n.name; }).sort(), ['r1', 'r2', 'r3']);
  assert.deepStrictEqual(d.links.map(function (l) { return [l.source, l.target].sort().join('-'); }).sort(), ['r1-r2', 'r2-r3']);
  assert.ok(d.states.r1 && d.states.r2 && d.states.r3);
  assert.strictEqual(s[3].result.isError, true);
  assert.match(JSON.parse(s[3].result.content[0].text).error, /not a network-xray state file/);
});
