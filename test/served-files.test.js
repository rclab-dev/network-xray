// served-files.test.js — the container serves a copy of the viewer (docker/entrypoint.sh): the copy keeps the page,
// its assets and the collectors, and leaves out the folders the page does not use. Run: node --test (needs bash)
'use strict';
var test = require('node:test');
var assert = require('node:assert');
var fs = require('fs');
var os = require('os');
var path = require('path');
var cp = require('child_process');

var ROOT = path.join(__dirname, '..');
var POSIX = typeof process.getuid === 'function';

test('container copy of the viewer: page files kept, other folders left out', { skip: !POSIX && 'POSIX only' }, function () {
  var entry = fs.readFileSync(path.join(ROOT, 'docker', 'entrypoint.sh'), 'utf8').split('\n');
  var i = entry.findIndex(function (l) { return /^rm -rf "\$WORK"; mkdir -p "\$WORK"; cp -a/.test(l); });
  assert.ok(i >= 0, 'the copy step in entrypoint.sh');
  var dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'nx-served-')));
  try {
    var src = path.join(dir, 'src'), work = path.join(dir, 'work');
    ['css', 'js', 'fonts', 'examples/q1', 'docker', 'test/fixtures', 'fixtures', 'demo', 'docs', 'scripts', '.git', '.github'].forEach(function (d) {
      fs.mkdirSync(path.join(src, d), { recursive: true }); fs.writeFileSync(path.join(src, d, 'f'), 'x');
    });
    ['xray-graph-nextui.html', 'xray-core.js', 'clab-xray-collect.js', 'netlab-validate.js', '.dockerignore'].forEach(function (f) {
      fs.writeFileSync(path.join(src, f), 'x');
    });
    cp.execFileSync('bash', ['-c', 'set -u; SRC="$1"; WORK="$2"\n' + entry[i] + '\n' + entry[i + 1], '_', src, work]);
    assert.deepStrictEqual(fs.readdirSync(work).sort(),
      ['clab-xray-collect.js', 'css', 'fonts', 'js', 'netlab-validate.js', 'xray-core.js', 'xray-graph-nextui.html']);
    assert.ok(fs.existsSync(path.join(src, 'test', 'fixtures', 'f')), 'the image itself is not changed');
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});
