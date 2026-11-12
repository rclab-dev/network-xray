// xray-mcp-collect.test.js - the opt-in collect tool of scripts/xray-mcp.js: off unless --allow-collect, takes only a
// topology file and ospf|bgp, one run at a time, writes into its own directory, answers in the lab_state form + path.
// The collector runs for real against a fake docker on PATH (POSIX only for that part, as the xray.sh tests).
// Run: node --test        (from the repo root; Node >= 18, no dependencies)
'use strict';
var test = require('node:test');
var assert = require('node:assert');
var fs = require('fs');
var os = require('os');
var path = require('path');
var cp = require('child_process');

var ROOT = path.join(__dirname, '..');
var SERVER = path.join(ROOT, 'scripts', 'xray-mcp.js');
var SKIP = process.platform === 'win32' ? 'POSIX shell needed' : false;
// fake docker: `docker ps` lists nothing; `docker exec` waits NX_SLEEP s and answers as a stopped container
var DOCKER = "var a=process.argv.slice(2);require('fs').appendFileSync(process.env.NX_DLOG,JSON.stringify(a)+'\\n');" +
  "if(a[0]==='exec'){var t=Date.now()+1000*(+process.env.NX_SLEEP||0);while(Date.now()<t){}" +
  "process.stderr.write('Error response from daemon: No such container: '+a[1]+'\\n');process.exit(1);}";

function req(id, method, params) { return JSON.stringify({ jsonrpc: '2.0', id: id, method: method, params: params }); }
function call(id, name, args) { return req(id, 'tools/call', { name: name, arguments: args }); }
function payload(reply) { return JSON.parse(reply.result.content[0].text); }
function session(args, lines, env) {
  var r = cp.spawnSync(process.execPath, [SERVER].concat(args), { input: lines.join('\n') + '\n', encoding: 'utf8', timeout: 150000, env: env || process.env });
  assert.strictEqual(r.status, 0, r.stderr);
  var byId = {};
  r.stdout.split('\n').filter(Boolean).forEach(function (l) { var m = JSON.parse(l); byId[m.id] = m; });
  return byId;
}
function lab() {
  var dir = fs.mkdtempSync(path.join(os.tmpdir(), 'nx-mc-')), bin = path.join(dir, 'bin');
  fs.mkdirSync(bin);
  fs.writeFileSync(path.join(bin, 'docker.js'), DOCKER);
  fs.writeFileSync(path.join(bin, 'docker'), '#!/bin/sh\nexec "' + process.execPath + '" "' + path.join(bin, 'docker.js') + '" "$@"\n', { mode: 0o755 });
  var yml = path.join(dir, 'mc.clab.yml');
  fs.writeFileSync(yml, 'name: mc\ntopology:\n  nodes:\n    r1: { kind: linux, image: frr }\n    r2: { kind: linux, image: frr }\n  links:\n    - endpoints: ["r1:eth1", "r2:eth1"]\n');
  return { dir: dir, yml: yml, dlog: path.join(dir, 'docker.log'),
    env: function (sleep) { return Object.assign({}, process.env, { PATH: bin + path.delimiter + process.env.PATH, NX_DLOG: path.join(dir, 'docker.log'), NX_SLEEP: String(sleep || 0), TMPDIR: dir }); } };
}

test('collect is not offered without --allow-collect (the default tool list is unchanged)', function () {
  var s = session([], [req(1, 'tools/list', {}), call(2, 'collect', { topology: '/x/lab.clab.yml' })]);
  assert.ok(s[1].result.tools.every(function (t) { return t.name !== 'collect'; }));
  assert.strictEqual(s[2].error.code, -32602);
  assert.match(s[2].error.message, /Unknown tool: collect/);
});

test('with --allow-collect it is listed, not read-only, and takes only topology, ospf|bgp and keep_previous', function () {
  var dir = fs.mkdtempSync(path.join(os.tmpdir(), 'nx-mc-'));
  try {
    var yml = path.join(dir, 'a.clab.yml'); fs.writeFileSync(yml, 'name: a\n');
    var s = session(['--allow-collect'], [req(1, 'tools/list', {}),
      call(2, 'collect', {}), call(3, 'collect', { topology: path.join(dir, 'a.txt') }), call(4, 'collect', { topology: path.join(dir, 'none.clab.yml') }),
      call(5, 'collect', { topology: yml, proto: 'isis' }), call(6, 'collect', { topology: yml, cmd: 'rm -rf /' }), call(7, 'collect', { topology: dir + '.yml' }),
      call(8, 'collect', 'x'), call(9, 'collect', { topology: yml, keep_previous: 'yes' })]);
    var t = s[1].result.tools.filter(function (x) { return x.name === 'collect'; })[0];
    assert.ok(t, 'listed');
    assert.deepStrictEqual(Object.keys(t.inputSchema.properties).sort(), ['keep_previous', 'proto', 'topology']);
    assert.deepStrictEqual(t.inputSchema.properties.proto.enum, ['bgp', 'ospf']);
    assert.strictEqual(t.annotations.readOnlyHint, false);
    assert.strictEqual(t.annotations.destructiveHint, false);
    var err = function (id) { assert.strictEqual(s[id].result.isError, true, String(id)); return payload(s[id]).error; };
    assert.match(err(2), /missing argument: topology/);
    assert.match(err(3), /containerlab topology file/);
    assert.match(err(4), /topology not found/);
    assert.match(err(5), /proto must be bgp or ospf/);
    assert.match(err(6), /only topology, proto and keep_previous, not: cmd/);
    assert.match(err(7), /topology not found|not a file/);
    assert.match(err(8), /arguments must be an object/);
    assert.match(err(9), /keep_previous must be true or false/);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('collect runs the collector once and answers in the lab_state form with the path it wrote', { skip: SKIP }, function () {
  var L = lab();
  try {
    var s = session(['--allow-collect'], [call(1, 'collect', { topology: L.yml, proto: 'ospf' })], L.env(0));
    assert.ok(!s[1].result.isError, JSON.stringify(s[1]));
    var o = payload(s[1]);
    assert.deepStrictEqual(Object.keys(o).slice(0, 3), ['path', 'topology', 'proto']);
    assert.strictEqual(o.proto, 'ospf');
    assert.strictEqual(o.topology, L.yml);
    assert.ok(o.nodes && o.links && o.counts, 'the lab_state summary');
    assert.deepStrictEqual(o.nodes.map(function (n) { return n.name || n.node || n; }).sort(), ['r1', 'r2']);
    assert.strictEqual(path.basename(o.path), 'xray-states.js');
    assert.ok(path.dirname(o.path) !== ROOT && path.dirname(o.path) !== L.dir, 'its own directory, not the repo or the lab folder');
    assert.ok(!fs.existsSync(path.dirname(o.path)), 'removed when the server exits');
    var execs = fs.readFileSync(L.dlog, 'utf8').trim().split('\n').map(JSON.parse).filter(function (a) { return a[0] === 'exec'; });
    assert.ok(execs.length >= 2, 'the routers were read');
    assert.ok(execs.every(function (a) { return a[2] === 'vtysh'; }), 'only vtysh (show) through docker exec');
  } finally { fs.rmSync(L.dir, { recursive: true, force: true }); }
});

test('two labs get two paths (the second collect does not overwrite the first lab\'s state)', { skip: SKIP }, async function () {
  var L = lab(), env = L.env(0), keep = {};
  ['PATH', 'NX_DLOG', 'NX_SLEEP'].forEach(function (k) { keep[k] = process.env[k]; process.env[k] = env[k]; });   // the collector runs as a child of this process
  try {
    var mcp = require(SERVER);
    mcp.setAllowCollect(true);
    var yml2 = path.join(L.dir, 'mc2.clab.yml');
    fs.writeFileSync(yml2, fs.readFileSync(L.yml, 'utf8').replace('name: mc', 'name: mc2'));
    var one = async function (id, topo) { var r = await mcp.handle(JSON.parse(call(id, 'collect', { topology: topo }))); assert.ok(!r.result.isError, JSON.stringify(r)); return r.result.structuredContent.path; };
    var p1 = await one(1, L.yml), p2 = await one(2, yml2), p3 = await one(3, L.yml);
    assert.notStrictEqual(p2, p1, 'another lab, another path');
    assert.strictEqual(p3, p1, 'the same lab, the same path');
    assert.ok(fs.existsSync(p1) && fs.existsSync(p2), 'both states are kept');
    mcp.setAllowCollect(false);
    fs.rmSync(path.dirname(path.dirname(p1)), { recursive: true, force: true });   // the server's own directory (an in-process server has no exit to remove it)
  } finally {
    Object.keys(keep).forEach(function (k) { if (keep[k] == null) delete process.env[k]; else process.env[k] = keep[k]; });
    fs.rmSync(L.dir, { recursive: true, force: true });
  }
});

test('a second collect while one runs is refused', { skip: SKIP }, function () {
  var L = lab();
  try {
    var s = session(['--allow-collect'], [call(1, 'collect', { topology: L.yml }), call(2, 'collect', { topology: L.yml })], L.env(2));
    assert.ok(!s[1].result.isError, JSON.stringify(s[1]));
    assert.strictEqual(s[2].result.isError, true);
    assert.match(payload(s[2]).error, /already running/);
  } finally { fs.rmSync(L.dir, { recursive: true, force: true }); }
});

test('keep_previous: only when asked, the state a collect replaces is kept and returned as previous; state_diff reads both', { skip: SKIP }, async function () {
  var L = lab(), env = L.env(0), keep = {};
  ['PATH', 'NX_DLOG', 'NX_SLEEP'].forEach(function (k) { keep[k] = process.env[k]; process.env[k] = env[k]; });
  try {
    var mcp = require(SERVER);
    mcp.setAllowCollect(true);
    var go = async function (id, a) { var r = await mcp.handle(JSON.parse(call(id, 'collect', a))); assert.ok(!r.result.isError, JSON.stringify(r)); return r.result.structuredContent; };
    var first = await go(1, { topology: L.yml, keep_previous: true });
    assert.strictEqual(first.previous, null, 'nothing earlier for this lab yet');
    var second = await go(2, { topology: L.yml, keep_previous: true });
    assert.strictEqual(path.basename(second.previous), 'xray-states.previous.js');
    assert.strictEqual(path.dirname(second.previous), path.dirname(second.path), 'in the same own directory');
    assert.ok(fs.existsSync(second.previous) && fs.existsSync(second.path));
    var d = await mcp.handle(JSON.parse(call(3, 'state_diff', { before: second.previous, after: second.path })));
    assert.ok(!d.result.isError, JSON.stringify(d));
    assert.strictEqual(d.result.structuredContent.none, true, 'the fake lab did not change between the two reads');
    var third = await go(4, { topology: L.yml });
    assert.ok(!('previous' in third), 'without keep_previous nothing is said about an older state');
    assert.ok(!fs.existsSync(second.previous), 'and nothing older is kept');
    mcp.setAllowCollect(false);
    fs.rmSync(path.dirname(path.dirname(third.path)), { recursive: true, force: true });
  } finally {
    Object.keys(keep).forEach(function (k) { if (keep[k] == null) delete process.env[k]; else process.env[k] = keep[k]; });
    fs.rmSync(L.dir, { recursive: true, force: true });
  }
});
