// check-examples.test.js — examples/*/README.md must match their labs (scripts/check-examples.js):
// ./xray.sh and topology file names, node names and kinds, addresses, relative links.
// Run: node --test        (from the repo root; Node >= 18, no dependencies)
'use strict';
var test = require('node:test');
var assert = require('node:assert');
var fs = require('fs');
var os = require('os');
var path = require('path');
var ce = require('../scripts/check-examples.js');

test('every examples/*/README.md is consistent with its lab', function () {
  var result = ce.checkAll();
  var lines = [];
  Object.keys(result).forEach(function (f) { result[f].forEach(function (p) { lines.push(f + ': ' + p); }); });
  assert.deepStrictEqual(lines, []);
});

test('examples/README.md lists every example folder', function () {
  var listed = ce.checkIndexReadme().listed;
  var missing = ce.exampleDirs().filter(function (d) { return !listed.has(d); });
  assert.deepStrictEqual(missing, []);
});

test('parseTopology reads one-line nodes, block nodes and kind default images', function () {
  var t = ce.parseTopology([
    'name: lab1',
    'topology:',
    '  kinds:',
    '    cisco_iol:',
    '      image: vrnetlab/cisco_iol:1',
    '  nodes:',
    '    r1: { kind: cisco_iol, startup-config: r1.cfg }',
    '    r2: { kind: linux, image: frrouting/frr:v8.4.1, binds: [a:b] }  # comment',
    '    h1:',
    '      kind: linux',
    '      image: alpine:3',
    '  links:',
    '    - endpoints: ["r1:e0/1", "r2:eth1"]',
  ].join('\n'));
  assert.strictEqual(t.name, 'lab1');
  assert.deepStrictEqual(Object.keys(t.nodes), ['r1', 'r2', 'h1']);
  assert.strictEqual(t.nodes.r1.image, 'vrnetlab/cisco_iol:1');
  assert.strictEqual(ce.vendorOf(t.nodes.r1), 'IOL');
  assert.strictEqual(ce.vendorOf(t.nodes.r2), 'FRR');
  assert.strictEqual(ce.vendorOf(t.nodes.h1), 'Linux');
  assert.strictEqual(ce.vendorOf({ kind: 'nokia_srlinux', image: 'ghcr.io/nokia/srlinux' }), 'SR Linux');
});

test('slug follows GitHub heading anchors', function () {
  assert.strictEqual(ce.slug('日本語'), '日本語');
  assert.strictEqual(ce.slug('Start a lab'), 'start-a-lab');
  assert.strictEqual(ce.slug('examples/ — 21 problems'), 'examples--21-problems');
});

test('a broken README is reported', function () {
  var root = fs.mkdtempSync(path.join(os.tmpdir(), 'xray-ex-'));
  try {
    var dir = path.join(root, 'examples', 'qx');
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'qx.clab.yml'), [
      'name: qx',
      'topology:',
      '  nodes:',
      '    r1: { kind: linux, image: frrouting/frr:v8.4.1 }',
      '    sv: { kind: linux, image: alpine:3, exec: ["ip addr add 10.0.0.2/24 dev eth1"] }',
      '',
    ].join('\n'));
    fs.writeFileSync(path.join(dir, 'README.md'), [
      '# QX',
      'Nodes: r1 (FRR), r9 (FRR)',
      '```bash',
      './demo.sh examples/qx/qx.clab.yml',
      'docker exec -it clab-qx-r2 vtysh',
      'docker exec -it clab-qx-sv vtysh',
      'docker exec -it clab-other-r1 vtysh',
      'sudo containerlab destroy -t examples/qx/q1.clab.yml --cleanup',
      '```',
      'Ping `10.0.0.2` and `10.9.9.9`. See [docs](../../docs/nope.md), [top](#nope) and `../qy/`.',
      '',
    ].join('\n'));
    var p = ce.checkExampleReadme('qx', root).join('\n');
    [
      'uses demo.sh',
      'no "./xray.sh examples/qx/qx.clab.yml" start command',
      'containerlab destroy -t examples/qx/q1.clab.yml: file does not exist',
      'no node "r2"',
      'sv is Linux, not FRR',
      'lab name is not "qx"',
      'nodes line: "r9" is not in qx.clab.yml',
      'nodes line: misses "sv"',
      'address 10.9.9.9 is not in the lab',
      'docs/nope.md does not exist',
      'link #nope: no such heading',
      '../qy/ does not exist',
    ].forEach(function (want) { assert.ok(p.indexOf(want) >= 0, 'expected: ' + want + '\n got:\n' + p); });
    assert.ok(p.indexOf('10.0.0.2') < 0, p);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
