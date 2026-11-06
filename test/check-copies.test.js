// check-copies.test.js — scripts/check-copies.js: every copy of a root file under demo/compose-* is checked,
// and a differing copy is reported with the root file it differs from.
// Run: node --test        (from the repo root; Node >= 18, no dependencies)
'use strict';
var test = require('node:test');
var assert = require('node:assert');
var fs = require('fs');
var os = require('os');
var path = require('path');
var cp = require('child_process');
var cc = require('../scripts/check-copies.js');

var REPO = path.join(__dirname, '..');
var SCRIPT = path.join(REPO, 'scripts', 'check-copies.js');

function tree(files) {
  var root = fs.mkdtempSync(path.join(os.tmpdir(), 'check-copies-'));
  Object.keys(files).forEach(function (rel) {
    var abs = path.join(root, rel);
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    fs.writeFileSync(abs, files[rel]);
  });
  return root;
}

// a minimal repo with one bundle where every listed copy matches its root file
function fixture(extra) {
  var f = { 'demo/decision-bracket.html': 'decision-bracket.html\n', 'README.md': 'root readme\n', 'index.html': 'root index\n',
    'demo/compose-a/README.md': 'bundle readme\n', 'demo/compose-a/web/index.html': 'bundle index\n' };
  cc.WEB_COPIES.forEach(function (n) { f[n] = n + '\n'; f['demo/compose-a/web/' + n] = n + '\n'; });
  cc.COLLECTOR_COPIES.forEach(function (n) { f[n] = n + '\n'; f['demo/compose-a/collector/' + n] = n + '\n'; });
  cc.BUNDLE_CONSTANT.forEach(function (n) { f['demo/compose-a/' + n] = n + '\n'; });
  f['scripts/compose-server.js'] = f['demo/compose-a/server/server.js'] = 'compose server\n';   // scripts/compose-server.js -> <bundle>/server/server.js
  Object.keys(extra || {}).forEach(function (k) { f[k] = extra[k]; });
  return tree(f);
}

function fmt(list) {
  return list.map(function (u) { return '  ' + u.copy + ' <- ' + u.root + ' (same ' + u.why + ')'; }).join('\n');
}

test('every file in demo/compose-* that is a copy of a root file is listed in check-copies.js', function () {
  var miss = cc.unlisted(REPO);
  assert.deepStrictEqual(miss, [], 'copies of root files not checked by scripts/check-copies.js ' +
    '(add them to WEB_COPIES / COLLECTOR_COPIES, or to EXCEPTIONS with bundleFiles if they are not copies):\n' + fmt(miss));
});

test('the repository copies are identical (check-copies exits 0)', function () {
  var r = cp.spawnSync(process.execPath, [SCRIPT], { cwd: REPO, encoding: 'utf8' });
  assert.strictEqual(r.status, 0, r.stdout + r.stderr);
});

test('fixture: all listed and identical -> nothing reported', function () {
  var root = fixture();
  assert.deepStrictEqual(cc.unlisted(root), []);
  assert.ok(cc.check(root).every(function (g) { return g.same; }));
});

test('fixture: unlisted copy with the name of a root file is found, even when its content drifted', function () {
  var root = fixture({ 'frr-parse.js': 'parser v2\n', 'demo/compose-a/collector/frr-parse.js': 'parser v1\n' });
  assert.deepStrictEqual(cc.unlisted(root), [{ copy: 'demo/compose-a/collector/frr-parse.js', root: 'frr-parse.js', why: 'name' }]);
});

test('fixture: unlisted copy under another name is found by content', function () {
  var root = fixture({ 'xray-unified.js': 'unified\n', 'demo/compose-a/web/unified.js': 'unified\n' });
  assert.deepStrictEqual(cc.unlisted(root), [{ copy: 'demo/compose-a/web/unified.js', root: 'xray-unified.js', why: 'content' }]);
});

test('fixture: a listed copy in the wrong folder is not counted as listed', function () {
  var root = fixture({ 'demo/compose-a/collector/xray-core.js': 'xray-core.js\n' });
  assert.deepStrictEqual(cc.unlisted(root), [{ copy: 'demo/compose-a/collector/xray-core.js', root: 'xray-core.js', why: 'name' }]);
});

test('fixture: a differing copy names the copy and the root file', function () {
  var root = fixture({ 'demo/compose-a/web/xray-core.js': 'edited\n' });
  var g = cc.check(root).filter(function (x) { return !x.same; });
  assert.strictEqual(g.length, 1);
  assert.deepStrictEqual(g[0].problems, [{ path: 'demo/compose-a/web/xray-core.js', kind: 'differs' }]);
  assert.strictEqual(cc.describe(g[0], g[0].problems[0]), 'demo/compose-a/web/xray-core.js differs from xray-core.js (root file)');
});

test('fixture: a missing copy names the root file it should copy', function () {
  var root = fixture();
  fs.unlinkSync(path.join(root, 'demo/compose-a/collector/clab-collect.js'));
  var g = cc.check(root).filter(function (x) { return !x.same; })[0];
  assert.strictEqual(cc.describe(g, g.problems[0]), 'demo/compose-a/collector/clab-collect.js is missing (copy of clab-collect.js)');
});

test('CLI: --help exits 0, unknown option exits 2', function () {
  assert.strictEqual(cp.spawnSync(process.execPath, [SCRIPT, '--help'], { encoding: 'utf8' }).status, 0);
  assert.strictEqual(cp.spawnSync(process.execPath, [SCRIPT, '--nope'], { encoding: 'utf8' }).status, 2);
});
