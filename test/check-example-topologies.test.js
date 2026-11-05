// check-example-topologies.test.js — examples/*/*.clab.yml static checks (scripts/check-example-topologies.js)
// Run: node --test        (from the repo root; Node >= 18, no dependencies)
'use strict';
var test = require('node:test');
var assert = require('node:assert');
var fs = require('fs');
var os = require('os');
var path = require('path');
var ct = require('../scripts/check-example-topologies.js');

var FRR = 'frrouting/frr@sha256:990e83490108b686fd6df3b1cafa6bdbb2714acb00eedb9a89693946f46f45ce';

function problemLines(result) {
  var lines = [];
  Object.keys(result).forEach(function (f) { result[f].forEach(function (p) { lines.push(path.basename(path.dirname(f)) + ': ' + p); }); });
  return lines;
}

// examples dir in a temp folder: { "<dir>/<file>": text }
function makeExamples(files) {
  var root = fs.mkdtempSync(path.join(os.tmpdir(), 'nx-topo-'));
  Object.keys(files).forEach(function (rel) {
    var p = path.join(root, rel);
    fs.mkdirSync(path.dirname(p), { recursive: true });
    fs.writeFileSync(p, files[rel]);
  });
  return root;
}

test('every examples/*/*.clab.yml passes the static topology checks', function () {
  var result = ct.checkAll();
  assert.ok(Object.keys(result).length > 0, 'found lab files');
  assert.deepStrictEqual(problemLines(result), []);
});

test('parseYaml reads the subset the labs use', function () {
  var doc = ct.parseYaml([
    'name: lab1   # comment',
    '# full-line comment',
    'topology:',
    '  kinds:',
    '    cisco_iol:',
    '      image: vrnetlab/cisco_iol:17.18.02',
    '  nodes:',
    '    r1: { kind: linux, image: a@sha256:1, binds: [r1/x:/etc/x], exec: ["sh -c \'a # b\'", "echo \\"q\\""] }',
    '    r2:',
    '      kind: cisco_iol',
    "      startup-config: 'r2.cfg'",
    '  links:',
    '    - endpoints: ["r1:eth1", "r2:Ethernet0/1"]',
    '    - endpoints:',
    '        - r1:eth2',
    '        - r2:Ethernet0/2',
  ].join('\n'));
  assert.strictEqual(doc.name, 'lab1');
  assert.strictEqual(doc.topology.kinds.cisco_iol.image, 'vrnetlab/cisco_iol:17.18.02');
  assert.deepStrictEqual(doc.topology.nodes.r1.binds, ['r1/x:/etc/x']);
  assert.deepStrictEqual(doc.topology.nodes.r1.exec, ["sh -c 'a # b'", 'echo "q"']);
  assert.strictEqual(doc.topology.nodes.r2['startup-config'], 'r2.cfg');
  assert.deepStrictEqual(doc.topology.links, [
    { endpoints: ['r1:eth1', 'r2:Ethernet0/1'] },
    { endpoints: ['r1:eth2', 'r2:Ethernet0/2'] },
  ]);
});

test('parseYaml rejects what it cannot read', function () {
  assert.throws(function () { ct.parseYaml('a: { b: 1'); });
  assert.throws(function () { ct.parseYaml('a: 1\na: 2'); }, /duplicate key/);
  assert.throws(function () { ct.parseYaml('a:\n\tb: 1'); }, /tab/);
});

test('a good lab and its solved copy have no problems', function () {
  var lab = [
    'name: good',
    'topology:',
    '  nodes:',
    '    r1: { kind: linux, image: ' + FRR + ', binds: [r1/frr.conf:/etc/frr/frr.conf] }',
    '    h1: { kind: linux, image: alpine:3.20 }',
    '  links:',
    '    - endpoints: ["r1:eth1", "h1:eth1"]',
  ].join('\n');
  var root = makeExamples({
    'good/good.clab.yml': lab, 'good/r1/frr.conf': '!\n',
    'good-solved/good.clab.yml': lab.replace('name: good', 'name: good-solved'), 'good-solved/r1/frr.conf': '!\n',
  });
  assert.deepStrictEqual(problemLines(ct.checkAll(root)), []);
});

test('each kind of problem is reported once, one line each', function () {
  var root = makeExamples({
    'bad/bad.clab.yml': [
      'name: "bad lab"',
      'topology:',
      '  kinds:',
      '    cisco_iol: { image: vrnetlab/cisco_iol:17.18.02 }',
      '  nodes:',
      '    r1: { kind: linux, image: ' + FRR + ', binds: [r1/missing.conf:/etc/frr/frr.conf] }',
      '    r2: { kind: cisco_iol, startup-config: ../outside.cfg }',
      '    r3: { kind: cisco_iol, startup-config: r3.cfg }',
      '    r4: { kind: ceos, image: ceos:4.32 }',
      '    r5: { kind: linux, image: ubuntu:24.04 }',
      '  links:',
      '    - endpoints: ["r1:eth1", "r2:Ethernet0/1"]',
      '    - endpoints: ["r1:eth1", "rX:eth1"]',
      '    - endpoints: ["r3"]',
    ].join('\n'),
    'pair/pair.clab.yml': 'name: pair\ntopology:\n  nodes:\n    a: { kind: linux, image: alpine }\n    b: { kind: linux, image: alpine }\n  links:\n    - endpoints: ["a:eth1", "b:eth1"]\n',
    'pair-solved/pair.clab.yml': 'name: pair-solved\ntopology:\n  nodes:\n    a: { kind: linux, image: alpine }\n    c: { kind: linux, image: alpine }\n  links:\n    - endpoints: ["a:eth1", "c:eth1"]\n',
  });
  assert.deepStrictEqual(problemLines(ct.checkAll(root)), [
    'bad: links[2]: endpoints must be a list of two "node:interface"',
    'bad: name: "bad lab" is not a plain lab name',
    'bad: node r1: bind r1/missing.conf does not exist',
    'bad: node r2: startup-config ../outside.cfg is outside the lab folder',
    'bad: node r3: startup-config r3.cfg does not exist',
    'bad: node r4: kind ceos is not supported (linux, cisco_iol, nokia_srlinux)',
    'bad: node r5: image ubuntu:24.04 is not supported for kind linux (frrouting/frr, alpine)',
    'bad: links[1]: r1:eth1 is already used by links[0]',
    'bad: links[1]: node rX is not in topology.nodes',
    'bad: no bad-solved/ next to it (every example has a solved twin)',
    'pair-solved: node b is missing from the solved copy',
    'pair-solved: node c is only in the solved copy',
    'pair-solved: link a:eth1 -- b:eth1 is missing from the solved copy',
    'pair-solved: link a:eth1 -- c:eth1 is only in the solved copy',
  ]);
});

test('the command line prints one line per problem and exits 1', function () {
  var cp = require('child_process');
  var root = makeExamples({ 'x/x.clab.yml': 'name: x/y\ntopology:\n  nodes:\n    a: { kind: linux, image: alpine }\n' });
  var r = cp.spawnSync(process.execPath, [path.join(__dirname, '..', 'scripts', 'check-example-topologies.js'), root], { encoding: 'utf8' });
  assert.strictEqual(r.status, 1);
  assert.match(r.stdout, /x\.clab\.yml: name: "x\/y" is not a plain lab name\n[^\n]*x\.clab\.yml: no x-solved\/ next to it[^\n]*\n$/);
  var ok = cp.spawnSync(process.execPath, [path.join(__dirname, '..', 'scripts', 'check-example-topologies.js')], { encoding: 'utf8' });
  assert.strictEqual(ok.status, 0, ok.stdout + ok.stderr);
});

test('a lab without its solved twin (either way) and a missing bind given under kinds: are reported', function () {
  var lab = function (name, extra) { return 'name: ' + name + '\ntopology:\n' + (extra || '') + '  nodes:\n    a: { kind: linux, image: alpine }\n'; };
  var root = makeExamples({
    'only/only.clab.yml': lab('only'),
    'orphan-solved/orphan.clab.yml': lab('orphan-solved'),
    'kb/kb.clab.yml': lab('kb', '  kinds:\n    linux: { binds: [missing.conf:/etc/x] }\n'),
    'kb-solved/kb.clab.yml': lab('kb-solved', '  kinds:\n    linux: { binds: [missing.conf:/etc/x] }\n')
  });
  var lines = problemLines(ct.checkAll(root));
  assert.ok(lines.indexOf('only: no only-solved/ next to it (every example has a solved twin)') >= 0, lines.join('\n'));
  assert.ok(lines.indexOf('orphan-solved: no orphan/ next to this solved lab') >= 0, lines.join('\n'));
  assert.ok(lines.indexOf('kb: node a: bind missing.conf does not exist') >= 0, lines.join('\n'));
});
