// check-solved-pairs.test.js — examples/<name> and examples/<name>-solved differ only by the fix
// listed in scripts/solved-pairs-allow.json (scripts/check-solved-pairs.js).
// Run: node --test        (from the repo root; Node >= 18, no dependencies)
'use strict';
var test = require('node:test');
var assert = require('node:assert');
var fs = require('fs');
var os = require('os');
var path = require('path');
var cp = require('../scripts/check-solved-pairs.js');

function flat(result) {
  var lines = [];
  Object.keys(result).forEach(function (k) { result[k].forEach(function (p) { lines.push(k + ': ' + p); }); });
  return lines;
}

test('every examples/<name>-solved differs from examples/<name> only by the listed fix', function () {
  assert.deepStrictEqual(flat(cp.checkAll()), []);
});

test('every pair has an allowlist entry with a fix description', function () {
  var allow = cp.loadAllow();
  var names = cp.pairs(path.join(__dirname, '..', 'examples')).pairs;
  names.forEach(function (n) {
    assert.ok(allow[n], 'no allowlist entry for ' + n);
    assert.strictEqual(typeof allow[n].fix, 'string', 'no fix text for ' + n);
  });
});

test('diffLines reports removed and added lines', function () {
  assert.deepStrictEqual(cp.diffLines(['a', 'b', 'c'], ['a', 'x', 'c', 'd']), { removed: ['b'], added: ['x', 'd'] });
  assert.deepStrictEqual(cp.diffLines([], []), { removed: [], added: [] });
});

test('normLines reads <name>-solved as <name> and drops blank and comment lines', function () {
  var text = 'name: lab1-solved\n# solved version\n\n! comment\n  ip address 10.0.0.1/24  \n';
  assert.deepStrictEqual(cp.normLines(text, 'lab1'), ['name: lab1', 'ip address 10.0.0.1/24']);
});

function makeLab(dir, files) {
  Object.keys(files).forEach(function (f) {
    var p = path.join(dir, f);
    fs.mkdirSync(path.dirname(p), { recursive: true });
    fs.writeFileSync(p, files[f]);
  });
}

var BASE = {
  'README.md': 'broken\n',
  'lab.clab.yml': 'name: lab1\ntopology:\n  nodes:\n    r1: { kind: linux, image: frrouting/frr:v8.4.1 }\n    r2: { kind: linux, image: frrouting/frr:v8.4.1 }\n',
  'r1/frr.conf': 'interface eth1\n ip address 10.0.0.1/24\n shutdown\n',
  'r2/frr.conf': 'interface eth1\n ip address 10.0.0.2/24\n',
  'problem.json': '{\n  "id": "x/lab1"\n}\n',
};

function withPair(edit, fn) {
  var root = fs.mkdtempSync(path.join(os.tmpdir(), 'solved-pairs-'));
  try {
    var ex = path.join(root, 'examples');
    makeLab(path.join(ex, 'lab1'), BASE);
    var solved = Object.assign({}, BASE, {
      'README.md': 'solved\n',
      'lab.clab.yml': BASE['lab.clab.yml'].replace('name: lab1', 'name: lab1-solved'),
      'r1/frr.conf': 'interface eth1\n ip address 10.0.0.1/24\n',
      'problem.json': '{\n  "id": "x/lab1-solved"\n}\n',
    });
    edit(solved);
    Object.keys(solved).forEach(function (k) { if (solved[k] === null) delete solved[k]; });
    makeLab(path.join(ex, 'lab1-solved'), solved);
    fn(root);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}

var ALLOW = { lab1: { fix: 'no shutdown on r1', files: { 'r1/frr.conf': { removed: ['shutdown'], added: [] } } } };

test('a pair that differs only by the allowlisted fix and its name passes', function () {
  withPair(function () {}, function (root) {
    assert.deepStrictEqual(flat(cp.checkAll(root, ALLOW)), []);
  });
});

test('the fix is reported when it is not allowlisted', function () {
  withPair(function () {}, function (root) {
    assert.deepStrictEqual(flat(cp.checkAll(root, {})), ['lab1: r1/frr.conf: - shutdown']);
  });
});

test('a changed address, image tag or missing node is reported', function () {
  withPair(function (s) {
    s['r2/frr.conf'] = 'interface eth1\n ip address 10.0.0.3/24\n';
    s['lab.clab.yml'] = s['lab.clab.yml'].replace('r2: { kind: linux, image: frrouting/frr:v8.4.1 }', 'r2: { kind: linux, image: frrouting/frr:v9.0.0 }');
  }, function (root) {
    assert.deepStrictEqual(flat(cp.checkAll(root, ALLOW)), [
      'lab1: lab.clab.yml: - r2: { kind: linux, image: frrouting/frr:v8.4.1 }',
      'lab1: lab.clab.yml: + r2: { kind: linux, image: frrouting/frr:v9.0.0 }',
      'lab1: r2/frr.conf: - ip address 10.0.0.2/24',
      'lab1: r2/frr.conf: + ip address 10.0.0.3/24',
    ]);
  });
  withPair(function (s) {
    s['r2/frr.conf'] = null;
    s['lab.clab.yml'] = s['lab.clab.yml'].replace(/ {4}r2:.*\n/, '');
  }, function (root) {
    assert.deepStrictEqual(flat(cp.checkAll(root, ALLOW)), [
      'lab1: r2/frr.conf: missing in lab1-solved',
      'lab1: lab.clab.yml: - r2: { kind: linux, image: frrouting/frr:v8.4.1 }',
    ]);
  });
});

test('a problem.json change other than the id is reported', function () {
  withPair(function (s) { s['problem.json'] = '{\n  "q_number": "Q2",\n  "id": "x/lab1-solved"\n}\n'; }, function (root) {
    assert.deepStrictEqual(flat(cp.checkAll(root, ALLOW)), ['lab1: problem.json: + "q_number": "Q2",']);
  });
});

test('stale allowlist lines and entries are reported, and so is a -solved folder without its pair', function () {
  withPair(function () {}, function (root) {
    var allow = { lab1: { fix: 'x', files: { 'r1/frr.conf': { removed: ['shutdown'], added: ['no shutdown'] } } }, gone: { fix: 'y', files: {} } };
    fs.mkdirSync(path.join(root, 'examples', 'other-solved'));
    assert.deepStrictEqual(flat(cp.checkAll(root, allow)), [
      'lab1: r1/frr.conf: allowlisted addition not in the diff: no shutdown',
      'other-solved: no other folder for this -solved folder',
      'gone: allowlist entry for a pair that does not exist',
    ]);
  });
});
