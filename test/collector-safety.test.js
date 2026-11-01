// collector-safety.test.js — names from a topology / the command line never reach a shell or ssh as options,
// and the temporary files the collectors use stay in a directory only this user can use.
// Run: node --test        (from the repo root; Node >= 18, no dependencies)
'use strict';
var test = require('node:test');
var assert = require('node:assert');
var fs = require('fs');
var os = require('os');
var path = require('path');
var cp = require('child_process');
var ios = require('../clab-iosxe-collect.js');

var ROOT = path.join(__dirname, '..');
function tmp(prefix) { return fs.mkdtempSync(path.join(os.tmpdir(), prefix)); }
var POSIX = typeof process.getuid === 'function';

test('iosxe: names and hosts that could be read as options or shell are refused', function () {
  ['r1', 'lab-1', 'r1.x_y'].forEach(function (n) { assert.ok(ios.SAFE_NAME.test(n), n); });
  ['-oProxyCommand=id', '$(id)', 'a;b', 'a b', '', '../x', 'a/b'].forEach(function (n) { assert.ok(!ios.SAFE_NAME.test(n), n); });
  ['172.20.20.5', 'r1.lab.local', 'fd00::5'].forEach(function (h) { assert.ok(ios.SAFE_HOST.test(h), h); });
  ['-oProxyCommand=id', '-p2222', 'a b', 'x;id', '$(id)', ''].forEach(function (h) { assert.ok(!ios.SAFE_HOST.test(h), h); });
});

test('iosxe: a bad --node / --host stops before docker or ssh is started', function () {
  var run = function (args) { return cp.spawnSync(process.execPath, [path.join(ROOT, 'clab-iosxe-collect.js')].concat(args), { encoding: 'utf8', env: Object.assign({}, process.env, { PATH: '' }) }); };
  var r1 = run(['--lab', 'l', '--node', '-x']);
  assert.strictEqual(r1.status, 2); assert.match(r1.stderr, /plain names/);
  var r2 = run(['--lab', 'l', '--node', 'r1', '--host', '-oProxyCommand=id']);
  assert.strictEqual(r2.status, 2); assert.match(r2.stderr, /host name or an IP/);
});

test('iosxe: the askpass helper is in a private new directory, holds no password and is removed', function () {
  process.env.NX_IOS_PASSWORD_TEST_MARK = 'not-in-file';
  var a = ios.makeAskpass();
  try {
    var dir = path.dirname(a.file);
    assert.notStrictEqual(dir, os.tmpdir());
    if (POSIX) {
      assert.strictEqual(fs.statSync(dir).mode & 0o077, 0, 'dir is 0700');
      assert.strictEqual(fs.statSync(a.file).mode & 0o077, 0, 'file is 0700');
    }
    var body = fs.readFileSync(a.file, 'utf8');
    assert.match(body, /\$NX_IOS_ASKPASS_VALUE/);
    assert.ok(!/admin|not-in-file/.test(body), 'no password in the file');
  } finally { a.remove(); delete process.env.NX_IOS_PASSWORD_TEST_MARK; }
  assert.ok(!fs.existsSync(path.dirname(a.file)), 'removed');
});

// clab-xray-collect.js end to end with a stub per-node collector that records where it was asked to write
var STUB = "var a=process.argv,o=a[a.indexOf('--out')+1],n=a[a.indexOf('--node')+1];" +
  "require('fs').writeFileSync(o,JSON.stringify({success:true,target_node:n,out:o,interfaces:{}}));";
var TOPO = 'name: safe\ntopology:\n  nodes:\n    r1: { kind: linux }\n    r2: { kind: linux }\n  links:\n' +
  '    - endpoints: ["r1:eth1", "r2:eth1"]\n' +
  '    - endpoints: ["r1:eth2", "r$(touch PWNED):eth1"]\n';

function runCollect(extra, tmpRoot) {
  var dir = tmp('nx-collect-'), out = path.join(dir, 'out');
  fs.mkdirSync(out);
  fs.writeFileSync(path.join(out, 'clab-collect.js'), STUB);
  fs.writeFileSync(path.join(dir, 'lab.clab.yml'), TOPO);
  var r = cp.spawnSync(process.execPath, [path.join(ROOT, 'clab-xray-collect.js'), path.join(dir, 'lab.clab.yml'), out].concat(extra || []),
    { cwd: dir, encoding: 'utf8', env: Object.assign({}, process.env, { TMPDIR: tmpRoot, TMP: tmpRoot, TEMP: tmpRoot }) });
  var txt = fs.readFileSync(path.join(out, 'xray-states.js'), 'utf8');
  var states = JSON.parse(txt.split('\n')[0].replace(/^window\.LIVE_STATES = /, '').replace(/;$/, ''));
  return { r: r, dir: dir, out: out, states: states };
}

[[], ['--serial']].forEach(function (extra) {
  test('clab-xray-collect ' + (extra[0] || '(parallel)') + ': a bad link name is left out and state files stay in a private dir', function () {
    var tmpRoot = tmp('nx-tmproot-');
    var c = runCollect(extra, tmpRoot);
    assert.strictEqual(c.r.status, 0, c.r.stderr);
    assert.deepStrictEqual(Object.keys(c.states).sort(), ['r1', 'r2']);
    assert.match(c.r.stderr, /left out a link/);
    assert.ok(!fs.existsSync(path.join(c.dir, 'PWNED')) && !fs.existsSync(path.join(c.out, 'PWNED')));
    var sdir = path.dirname(c.states.r1.out);
    assert.strictEqual(path.dirname(sdir), tmpRoot, 'under the tmp dir');
    assert.notStrictEqual(sdir, tmpRoot, 'not loose in the tmp dir');
    assert.strictEqual(path.basename(c.states.r1.out), 'safe-r1.json');
    if (POSIX) assert.strictEqual(fs.statSync(sdir).mode & 0o077, 0, 'state dir is 0700');
    // the only file written to the output directory is xray-states.js (next to the collector already there)
    assert.deepStrictEqual(fs.readdirSync(c.out).sort(), ['clab-collect.js', 'xray-states.js']);
  });
});

test('clab-xray-collect: a state dir that is open to others is not used', { skip: !POSIX }, function () {
  var tmpRoot = tmp('nx-tmproot-');
  var shared = path.join(tmpRoot, 'xray-state-u' + process.getuid());
  fs.mkdirSync(shared); fs.chmodSync(shared, 0o777);
  var c = runCollect(['--serial'], tmpRoot);
  assert.strictEqual(c.r.status, 0, c.r.stderr);
  var sdir = path.dirname(c.states.r1.out);
  assert.notStrictEqual(sdir, shared);
  assert.strictEqual(fs.statSync(sdir).mode & 0o077, 0);
  assert.deepStrictEqual(fs.readdirSync(shared), []);
});
