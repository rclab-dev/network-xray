// cli-help.test.js — every command-line entry point answers --help (usage on stdout, exit 0) and refuses an
// unknown option with one line naming it plus a hint to use --help (stderr, non-zero exit).
// Run: node --test        (from the repo root; Node >= 18, no dependencies; the shell scripts need bash)
'use strict';
var test = require('node:test');
var assert = require('node:assert');
var fs = require('fs');
var path = require('path');
var cp = require('child_process');

var ROOT = path.join(__dirname, '..');
var BASH = ['/bin/bash', '/usr/bin/bash'].filter(function (p) { return fs.existsSync(p); })[0] || '';

var NODE_ENTRIES = [
  'bgp-parse.js', 'clab-collect.js', 'clab-iosxe-collect.js', 'clab-srl-collect.js', 'clab-to-xray.js',
  'clab-xray-collect.js', 'frr-collect.js', 'netlab-validate.js', 'topojson-to-xray.js',
  'scripts/capture-frames.js', 'scripts/check-copies.js', 'scripts/check-examples.js', 'scripts/check-i18n.js', 'scripts/gen_compose_bundle.js',
  'scripts/hello-kf-selftest.js', 'scripts/nbr-own-list-selftest.js', 'scripts/ospf-state-word-selftest.js',
  'scripts/scale-bench.js', 'scripts/validate-states.js', 'scripts/xray-mcp.js', 'scripts/xray-query.js'
];
var SHELL_ENTRIES = ['xray.sh', 'demo.sh', 'docker/entrypoint.sh'];

// PATH is emptied for the node scripts so nothing (docker, ssh, containerlab) could be started by mistake
function run(entry, args) {
  var shell = /\.sh$/.test(entry);
  var r = cp.spawnSync(shell ? BASH : process.execPath, [path.join(ROOT, entry)].concat(args), {
    cwd: ROOT, encoding: 'utf8', timeout: 20000, input: '',
    env: Object.assign({}, process.env, shell ? {} : { PATH: '' })
  });
  return { code: r.status, stdout: r.stdout || '', stderr: r.stderr || '' };
}

NODE_ENTRIES.concat(SHELL_ENTRIES).forEach(function (entry) {
  var skip = /\.sh$/.test(entry) && !BASH ? 'bash is needed' : false;

  test(entry + ' --help prints usage and exits 0', { skip: skip }, function () {
    ['--help', '-h'].forEach(function (flag) {
      var r = run(entry, [flag]);
      assert.strictEqual(r.code, 0, flag + ': ' + r.stderr);
      assert.match(r.stdout, /^usage: /m, flag);
      assert.match(r.stdout, /-h, --help/, flag);
    });
  });

  test(entry + ' refuses an unknown option with a hint', { skip: skip }, function () {
    var r = run(entry, ['--no-such-option']);
    assert.notStrictEqual(r.code, 0);
    assert.notStrictEqual(r.code, null, 'finished in time');
    assert.match(r.stderr, /unknown option: --no-such-option\n/);
    assert.match(r.stderr, /Try '.*--help'/);
    assert.strictEqual(r.stdout, '');
  });
});

test('--help wins over other arguments, and an option value is not taken for an option', function () {
  var r = run('clab-iosxe-collect.js', ['--node', 'r1', '--help']);
  assert.strictEqual(r.code, 0); assert.match(r.stdout, /^usage: /);
  // "--node -x" is a (bad) node name, not an unknown option: the collector's own check answers
  r = run('clab-iosxe-collect.js', ['--lab', 'l', '--node', '-x']);
  assert.strictEqual(r.code, 2); assert.match(r.stderr, /plain names/);
  r = run('clab-xray-collect.js', ['--interval', '5', '--bogus']);
  assert.strictEqual(r.code, 2); assert.match(r.stderr, /unknown option: --bogus/);
});

test('a flag does not take the next word, so an unknown option after it is refused and -h after it shows help', function () {
  ['clab-collect.js', 'frr-collect.js'].forEach(function (entry) {
    ['--self-test', '--exclude-mgmt'].forEach(function (flag) {
      var r = run(entry, [flag, '-x']);
      assert.strictEqual(r.code, 2, entry + ' ' + flag + ' -x'); assert.match(r.stderr, /unknown option: -x\n/);
      r = run(entry, [flag, '-h']);
      assert.strictEqual(r.code, 0, entry + ' ' + flag + ' -h'); assert.match(r.stdout, /^usage: /);
    });
  });
});
