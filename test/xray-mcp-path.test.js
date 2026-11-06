// xray-mcp-path.test.js - scripts/xray-mcp.js reads a path as xray-query.js does (any file name); a file that does
// not hold network-xray state is refused with one fixed message that never quotes the file.
// Run: node --test        (from the repo root; Node >= 18, no dependencies)
'use strict';
var test = require('node:test');
var assert = require('node:assert');
var fs = require('fs');
var os = require('os');
var path = require('path');
var mcp = require('../scripts/xray-mcp.js');
var query = require('../scripts/xray-query.js');

var ROOT = path.join(__dirname, '..');
var Q15 = path.join(ROOT, 'test', 'fixtures', 'iosxe-q15');
var FRR_R1 = path.join(ROOT, 'fixtures', 'frr-collect-sample', 'r1');
var NOT_STATE = 'not a network-xray state file';
var SECRET = 'SECRET-TOKEN-0123456789';

var TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'xray-mcp-path-'));
test.after(function () { fs.rmSync(TMP, { recursive: true, force: true }); });
function tmpFile(name, text) { var f = path.join(TMP, name); fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, text); return f; }

var nextId = 1;
function callTool(name, args) {
  return mcp.handle({ jsonrpc: '2.0', id: nextId++, method: 'tools/call', params: { name: name, arguments: args } }).result;
}
function refused(p, label) {
  var r = callTool('lab_state', { path: p });
  assert.strictEqual(r.isError, true, label + ': ' + JSON.stringify(r));
  assert.deepStrictEqual(JSON.parse(r.content[0].text), { error: NOT_STATE }, label);
  assert.ok(r.content[0].text.indexOf(SECRET) < 0, label + ': the error quotes the file');
}
function allowed(p, label) {
  var r = callTool('lab_state', { path: p });
  assert.ok(!r.isError, label + ': ' + r.content[0].text);
  assert.deepStrictEqual(r.structuredContent, query.summarize(query.loadStates(p)), label + ': same output as xray-query.js');
  return r.structuredContent;
}

var Q15_STATE = JSON.parse(fs.readFileSync(path.join(Q15, 'state_r1.json'), 'utf8'));

test('directories and .json / .js state files are read as before', function () {
  assert.strictEqual(allowed(Q15, 'state directory').counts.nodes, 3);
  allowed(FRR_R1, 'FRR show directory');
  allowed(path.join(Q15, 'state_r1.json'), 'state_<node>.json');
  allowed(tmpFile('lab.json', JSON.stringify({ r1: Q15_STATE })), '{node: state} object in a .json');
  allowed(tmpFile('UPPER.JSON', JSON.stringify(Q15_STATE)), 'upper-case extension');
  allowed(tmpFile('web/xray-states.js', 'window.LIVE_STATES = ' + JSON.stringify({ r1: Q15_STATE }) + ';\n'), 'xray-states.js');
  // relative paths still resolve from the working directory
  allowed(path.relative(process.cwd(), Q15) || '.', 'relative directory');
});

test('state is read whatever the file is called; other files are refused without quoting them', function () {
  allowed(tmpFile('state_r1.txt', JSON.stringify(Q15_STATE)), 'state JSON in a .txt (as xray-query.js reads it)');
  allowed(tmpFile('state_r1.json.bak', JSON.stringify(Q15_STATE)), 'state JSON in a .json.bak');
  allowed(tmpFile('noext-state', JSON.stringify(Q15_STATE)), 'state JSON without an extension');
  refused(tmpFile('secret', SECRET + '\n'), 'file without an extension that is not state');
  var gone = callTool('lab_state', { path: path.join(TMP, 'no-such-file') });
  assert.ok(gone.isError && /^not found: /.test(JSON.parse(gone.content[0].text).error), 'a missing path still says not found');
  if (process.platform !== 'win32') {
    refused('/dev/null', 'device');
    if (fs.existsSync('/etc/passwd')) refused('/etc/passwd', 'system file');
    if (fs.existsSync('/proc/self/environ')) refused('/proc/self/environ', 'process environment');
  }
});

test('.json / .js files that do not hold network-xray state are refused without quoting them', function () {
  refused(tmpFile('a.json', SECRET), 'not JSON');
  refused(tmpFile('b.json', '{"token":"' + SECRET + '"}'), 'JSON without node state');
  refused(tmpFile('c.json', JSON.stringify([SECRET])), 'JSON array');
  refused(tmpFile('d.js', 'module.exports = "' + SECRET + '";\n'), 'other JavaScript');
  refused(tmpFile('e.js', 'window.LIVE_STATES = {' + SECRET + '};\n'), 'broken xray-states.js');
  refused(tmpFile('dir-bad/state_r1.json', SECRET), 'directory with a broken state_<node>.json');
  refused(path.join(TMP, 'dir-bad'), 'directory with a broken state_<node>.json');
  if (process.platform !== 'win32') {
    var link = path.join(TMP, 'link-state.json');
    fs.symlinkSync(tmpFile('secret-target', SECRET), link);
    refused(link, 'a .json symlink to another file');
  }
});

test('every tool applies the same check to path', function () {
  var bad = tmpFile('secret2', SECRET);
  var calls = [
    ['lab_state', {}], ['list_routers', {}], ['ospf_neighbors', {}], ['bgp_neighbors', {}],
    ['why_best_path', { node: 'r1', prefix: '10.0.0.0/8' }],
    ['route_lookup', { router: 'r1', destination: '10.0.0.1' }],
    ['why_path', { router: 'r1', prefix: '10.0.0.0/8' }]
  ];
  calls.forEach(function (c) {
    var r = callTool(c[0], Object.assign({ path: bad }, c[1]));
    assert.strictEqual(r.isError, true, c[0]);
    assert.deepStrictEqual(JSON.parse(r.content[0].text), { error: NOT_STATE }, c[0]);
    var ok = callTool(c[0], Object.assign({ path: Q15 }, c[1]));
    assert.ok(!ok.isError || !/network-xray state file/.test(ok.content[0].text), c[0] + ' on a valid state');
  });
});
