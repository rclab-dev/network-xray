// collector-prefix-names.test.js — clab-xray-collect.js with any topology prefix: and with routers that have no links.
// The container of each router comes from containerlab's labels (a fake docker answers `docker ps`), or, with no
// container yet, from containerlab's own name rule for the prefix. A router with no links is read too.
// The per-node collectors are stubs that log their arguments and write a small state.
// Run: node --test        (from the repo root; Node >= 18, no dependencies)
'use strict';
var test = require('node:test');
var assert = require('node:assert');
var fs = require('fs');
var os = require('os');
var path = require('path');
var cp = require('child_process');
var vm = require('vm');

var ROOT = path.join(__dirname, '..');
// the fake docker is run through a #!/bin/sh wrapper: POSIX only (as the xray.sh tests)
var SKIP = process.platform === 'win32' ? 'POSIX shell needed' : false;
var STUB = "var a=process.argv,fs=require('fs'),g=function(k){var i=a.indexOf(k);return i>=0?a[i+1]:null;},n=g('--node');" +
  "fs.appendFileSync(process.env.NX_LOG,JSON.stringify({node:n,container:g('--container'),adj:g('--adj')})+'\\n');" +
  "fs.writeFileSync(g('--out'),JSON.stringify({success:true,target_node:n,protocol:'ospf',interfaces:{},iface_hellos:{}}));";
// fake docker: `docker ps ...` prints $NX_PS (lines "<clab-node-name> <container name>"); logs every call
var DOCKER = "var fs=require('fs');fs.appendFileSync(process.env.NX_DLOG,JSON.stringify(process.argv.slice(2))+'\\n');" +
  "if(process.argv[2]==='ps')process.stdout.write(process.env.NX_PS||'');";

// yml = the topology text; ps = what docker ps answers. Returns { states, calls (one per router), docker (calls) }
function collectOnce(yml, ps) {
  var dir = fs.mkdtempSync(path.join(os.tmpdir(), 'nx-pf-')), out = path.join(dir, 'out'), bin = path.join(dir, 'bin');
  try {
    fs.mkdirSync(out); fs.mkdirSync(bin);
    ['clab-collect.js', 'clab-srl-collect.js'].forEach(function (f) { fs.writeFileSync(path.join(out, f), STUB); });
    fs.writeFileSync(path.join(bin, 'docker.js'), DOCKER);
    fs.writeFileSync(path.join(bin, 'docker'), '#!/bin/sh\nexec "' + process.execPath + '" "' + path.join(bin, 'docker.js') + '" "$@"\n', { mode: 0o755 });
    fs.writeFileSync(path.join(dir, 'lab.clab.yml'), yml);
    var log = path.join(dir, 'calls.log'), dlog = path.join(dir, 'docker.log');
    var r = cp.spawnSync(process.execPath, [path.join(ROOT, 'clab-xray-collect.js'), path.join(dir, 'lab.clab.yml'), out, 'ospf'],
      { cwd: dir, encoding: 'utf8', timeout: 120000,
        env: Object.assign({}, process.env, { PATH: bin + path.delimiter + process.env.PATH, NX_LOG: log, NX_DLOG: dlog, NX_PS: ps || '', TMPDIR: dir }) });
    assert.strictEqual(r.status, 0, r.stderr);
    var ctx = { window: {} };
    vm.runInNewContext(fs.readFileSync(path.join(out, 'xray-states.js'), 'utf8'), ctx);
    var rd = function (f) { return fs.existsSync(f) ? fs.readFileSync(f, 'utf8').trim().split('\n').filter(Boolean).map(JSON.parse) : []; };
    var calls = {}; rd(log).forEach(function (c) { calls[c.node] = c; });
    return { states: ctx.window.LIVE_STATES, calls: calls, docker: rd(dlog), stderr: r.stderr };
  } finally { fs.rmSync(dir, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 }); }
}
function lab(prefixLine, extraNodes) {
  return 'name: pf\n' + (prefixLine != null ? prefixLine + '\n' : '') + 'topology:\n  nodes:\n' +
    '    r1:\n      kind: linux\n    r2:\n      kind: linux\n' + (extraNodes || '') +
    '  links:\n    - endpoints: ["r1:eth1", "r2:eth1"]\n';
}

test('with no container yet, each prefix: form gives containerlab\'s name for the router', { skip: SKIP }, function () {
  var cases = [[null, 'clab-pf-'], ['prefix: clab', 'clab-pf-'], ['prefix: "clab"', 'clab-pf-'], ['prefix:', 'clab-pf-'],
    ['prefix: ""', ''], ["prefix: ''", ''], ['prefix: __lab-name', 'pf-'], ['prefix: "__lab-name"', 'pf-'],
    ['prefix: foo', 'foo-pf-'], ['prefix: "foo"  # a comment', 'foo-pf-'], ['prefix: # the default', 'clab-pf-'],
    ['prefix: ' + 'p'.repeat(70), 'p'.repeat(70) + '-pf-']];
  cases.forEach(function (c) {
    var r = collectOnce(lab(c[0]));
    assert.deepStrictEqual(Object.keys(r.states).sort(), ['r1', 'r2'], String(c[0]));
    assert.strictEqual(r.calls.r1.container, c[1] + 'r1', String(c[0]));
    assert.strictEqual(r.calls.r2.container, c[1] + 'r2', String(c[0]));
  });
});

test('the container names come from containerlab\'s labels when the containers are there', { skip: SKIP }, function () {
  var r = collectOnce(lab('prefix: foo'), 'r1 foo-pf-r1\nr2 another-r2\n');
  assert.strictEqual(r.calls.r1.container, 'foo-pf-r1');
  assert.strictEqual(r.calls.r2.container, 'another-r2');
  var ps = r.docker.filter(function (a) { return a[0] === 'ps'; });
  assert.strictEqual(ps.length, 1, 'docker ps asked once in a one-shot run');
  assert.ok(ps[0].indexOf('label=containerlab=pf') >= 0, 'the lab\'s label');
  // the same lab name deployed twice (two prefixes): the container the prefix names
  r = collectOnce(lab(null), 'r1 x-pf-r1\nr1 clab-pf-r1\nr2 clab-pf-r2\n');
  assert.strictEqual(r.calls.r1.container, 'clab-pf-r1');
  // a label line that is not a plain name is not used
  r = collectOnce(lab(null), 'r1 bad;name\n');
  assert.strictEqual(r.calls.r1.container, 'clab-pf-r1');
});

test('a prefix that is not a plain name stops the collector', { skip: SKIP }, function () {
  var dir = fs.mkdtempSync(path.join(os.tmpdir(), 'nx-pf-'));
  try {
    fs.writeFileSync(path.join(dir, 'lab.clab.yml'), lab('prefix: "a b"'));
    var r = cp.spawnSync(process.execPath, [path.join(ROOT, 'clab-xray-collect.js'), path.join(dir, 'lab.clab.yml'), dir, 'ospf'], { encoding: 'utf8', timeout: 60000 });
    assert.strictEqual(r.status, 1);
    assert.match(r.stderr, /prefix .* is not a plain name/);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('a router with no links is read (empty adjacency); bridges and the host are not routers', { skip: SKIP }, function () {
  var r = collectOnce(lab(null, '    r3:\n      kind: linux\n    br1:\n      kind: bridge\n    "r4":\n      kind: linux\n      image: frrouting/frr:v8.4.1\n'));
  assert.deepStrictEqual(Object.keys(r.states).sort(), ['r1', 'r2', 'r3', 'r4']);
  assert.strictEqual(r.states.r3.success, true);
  assert.strictEqual(r.calls.r3.adj, '', 'no links: empty --adj');
  assert.strictEqual(r.calls.r1.adj, 'eth1:r2', 'linked routers as before');
  assert.ok(!r.calls.br1, 'a bridge is not read');
});

test('a lab with no links at all is read (it used to stop with "no links parsed")', { skip: SKIP }, function () {
  var r = collectOnce('name: pf\ntopology:\n  nodes:\n    r1:\n      kind: linux\n');
  assert.deepStrictEqual(Object.keys(r.states), ['r1']);
  assert.strictEqual(r.calls.r1.container, 'clab-pf-r1');
});
