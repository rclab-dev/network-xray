// mcp-path-root.test.js - the MCP server reads only under one folder (v1.4.3): the --path / NX_MCP_PATH folder, else the
// folder it was started in; --allow-any-path reads anywhere. A symbolic link cannot lead outside. A state file over 64 MB
// is not read. Run: node --test
'use strict';
var test = require('node:test');
var assert = require('node:assert');
var fs = require('fs');
var os = require('os');
var path = require('path');
var cp = require('child_process');

var ROOT = path.join(__dirname, '..');
var MCP = path.join(ROOT, 'scripts', 'xray-mcp.js');
var STATE = { r1: { target_node: 'r1', interfaces: { eth1: { up: true, ip: '10.0.0.1/30' } } } };

function lab() {
  var d = fs.mkdtempSync(path.join(os.tmpdir(), 'nx-root-'));
  fs.mkdirSync(path.join(d, 'in')); fs.mkdirSync(path.join(d, 'out'));
  fs.writeFileSync(path.join(d, 'in', 'a.json'), JSON.stringify(STATE));
  fs.writeFileSync(path.join(d, 'out', 'b.json'), JSON.stringify(STATE));
  return d;
}
// one tools/call through the real server process (stdin -> stdout)
function call(args, opts, toolArgs) {
  var msgs = [
    { jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 't', version: '0' } } },
    { jsonrpc: '2.0', id: 2, method: 'tools/call', params: { name: 'lab_state', arguments: toolArgs } }
  ];
  var r = cp.spawnSync(process.execPath, [MCP].concat(args), Object.assign({ input: msgs.map(JSON.stringify).join('\n') + '\n', encoding: 'utf8' }, opts));
  var line = r.stdout.trim().split('\n').map(function (l) { return JSON.parse(l); }).filter(function (m) { return m.id === 2; })[0];
  return line.result;
}

test('started in a folder without --path: a path under it is read, one outside is not', function () {
  var d = lab();
  var ok = call([], { cwd: path.join(d, 'in') }, { path: path.join(d, 'in', 'a.json') });
  assert.ok(!ok.isError, JSON.stringify(ok));
  var no = call([], { cwd: path.join(d, 'in') }, { path: path.join(d, 'out', 'b.json') });
  assert.ok(no.isError); assert.match(JSON.stringify(no), /outside the folder this server reads/);
  assert.ok(!/r1|10\.0\.0\.1/.test(JSON.stringify(no)), 'nothing of the outside file is returned');
  fs.rmSync(d, { recursive: true, force: true });
});

test('--path sets the folder (a file\'s folder); NX_MCP_PATH too; --allow-any-path and NX_MCP_ALLOW_ANY_PATH=1 read anywhere', function () {
  var d = lab(), a = path.join(d, 'in', 'a.json'), b = path.join(d, 'out', 'b.json');
  assert.ok(!call(['--path', a], { cwd: os.tmpdir() }, {}).isError, 'the default path itself');
  assert.ok(call(['--path', a], { cwd: os.tmpdir() }, { path: b }).isError, 'outside the --path folder');
  assert.ok(call([], { cwd: os.tmpdir(), env: Object.assign({}, process.env, { NX_MCP_PATH: path.join(d, 'in') }) }, { path: b }).isError);
  assert.ok(!call(['--allow-any-path'], { cwd: path.join(d, 'in') }, { path: b }).isError);
  assert.ok(!call([], { cwd: path.join(d, 'in'), env: Object.assign({}, process.env, { NX_MCP_ALLOW_ANY_PATH: '1' }) }, { path: b }).isError);
  fs.rmSync(d, { recursive: true, force: true });
});

test('a symbolic link inside the folder that points outside is not followed out; ../ does not get out either', function (t) {
  var d = lab(), link = path.join(d, 'in', 'link.json');
  try { fs.symlinkSync(path.join(d, 'out', 'b.json'), link); } catch (e) { t.skip('cannot make a symbolic link here'); fs.rmSync(d, { recursive: true, force: true }); return; }
  assert.ok(call([], { cwd: path.join(d, 'in') }, { path: link }).isError);
  assert.ok(call([], { cwd: path.join(d, 'in') }, { path: path.join(d, 'in', '..', 'out', 'b.json') }).isError);
  fs.rmSync(d, { recursive: true, force: true });
});

test('used as a module there is no limit unless setPathRoot is given (tests, embedding)', async function () {
  var mcp = require(MCP), d = lab();
  var r = await mcp.handle({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'lab_state', arguments: { path: path.join(d, 'out', 'b.json') } } });
  assert.ok(!r.result.isError);
  mcp.setPathRoot(path.join(d, 'in'));
  r = await mcp.handle({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'lab_state', arguments: { path: path.join(d, 'out', 'b.json') } } });
  assert.ok(r.result.isError);
  mcp.setPathRoot(null);
  fs.rmSync(d, { recursive: true, force: true });
});

test('a state file over 64 MB is not read', function () {
  var query = require(path.join(ROOT, 'scripts', 'xray-query.js'));
  var d = fs.mkdtempSync(path.join(os.tmpdir(), 'nx-big-')), f = path.join(d, 'big.json');
  var fd = fs.openSync(f, 'w'); fs.ftruncateSync(fd, 64 * 1024 * 1024 + 1); fs.closeSync(fd);
  assert.throws(function () { query.loadStates(f); }, function (e) { return /too large to read/.test(e.message); });
  fs.rmSync(d, { recursive: true, force: true });
});

test('a link inside an allowed folder that points outside is not read (each file in the folder is checked)', function (t) {
  var d = lab(), inDir = path.join(d, 'in2');
  fs.mkdirSync(inDir);
  try { fs.symlinkSync(path.join(d, 'out', 'b.json'), path.join(inDir, 'state_x.json')); } catch (e) { t.skip('cannot make a symbolic link here'); fs.rmSync(d, { recursive: true, force: true }); return; }
  var r = call([], { cwd: inDir }, { path: inDir });
  assert.ok(r.isError, JSON.stringify(r)); assert.match(JSON.stringify(r), /outside the folder this server reads/);
  fs.rmSync(d, { recursive: true, force: true });
});

test('started in the root of the file system without --path: nothing is read, it asks for --path', function () {
  var d = lab(), root = path.parse(os.tmpdir()).root;
  var r = call([], { cwd: root }, { path: path.join(d, 'in', 'a.json') });
  assert.ok(r.isError); assert.match(JSON.stringify(r), /root of the file system/);
  assert.ok(!call(['--path', path.join(d, 'in')], { cwd: root }, { path: path.join(d, 'in', 'a.json') }).isError, 'with --path it reads');
  fs.rmSync(d, { recursive: true, force: true });
});

test('--path ending in / is that folder even before it exists', function () {
  var d = lab(), later = path.join(d, 'later') + path.sep;
  var r = call(['--path', later], { cwd: os.tmpdir() }, { path: path.join(d, 'in', 'a.json') });
  assert.ok(r.isError, 'the parent folder is not allowed');
  fs.rmSync(d, { recursive: true, force: true });
});

test('a file over 64 MB inside a folder of FRR captures is not read either', function () {
  var query = require(path.join(ROOT, 'scripts', 'xray-query.js'));
  var d = fs.mkdtempSync(path.join(os.tmpdir(), 'nx-bigfrr-')), r1 = path.join(d, 'r1');
  fs.mkdirSync(r1);
  var fd = fs.openSync(path.join(r1, 'show_ip_route.json'), 'w'); fs.ftruncateSync(fd, 64 * 1024 * 1024 + 1); fs.closeSync(fd);
  assert.throws(function () { query.loadStates(d); }, function (e) { return /too large to read/.test(e.message); });
  fs.rmSync(d, { recursive: true, force: true });
});

test('loadStates passes every file and folder inside a folder to opts.check before reading (any OS)', function () {
  var query = require(path.join(ROOT, 'scripts', 'xray-query.js'));
  var d = fs.mkdtempSync(path.join(os.tmpdir(), 'nx-chk-'));
  fs.writeFileSync(path.join(d, 'state_r1.json'), JSON.stringify(STATE.r1));
  fs.mkdirSync(path.join(d, 'sub')); fs.writeFileSync(path.join(d, 'sub', 'show_ip_route.json'), '{}');
  var seen = [];
  query.loadStates(d, { check: function (p) { seen.push(path.relative(d, p)); } });
  assert.deepStrictEqual(seen.sort(), ['state_r1.json', 'sub', path.join('sub', 'show_ip_route.json')].sort());
  assert.throws(function () { query.loadStates(d, { check: function (p) { if (/state_r1/.test(p)) throw new Error('outside'); } }); }, /outside/);
  fs.rmSync(d, { recursive: true, force: true });
});
