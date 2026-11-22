// collector-states-json.test.js — clab-xray-collect.js writes xray-states.json next to xray-states.js: the same states,
// as plain versioned JSON (schema 1) with Node-graph nodes / edges from the topology's links; --no-json leaves it out.
// Run: node --test        (from the repo root; Node >= 18, no dependencies)
'use strict';
var test = require('node:test');
var assert = require('node:assert');
var fs = require('fs');
var os = require('os');
var path = require('path');
var cp = require('child_process');

var ROOT = path.join(__dirname, '..');

// a stub per-node collector: writes a state whose eth1 is down on r2 only
var STUB = "var a=process.argv,o=a[a.indexOf('--out')+1],n=a[a.indexOf('--node')+1];" +
  "require('fs').writeFileSync(o,JSON.stringify({success:true,target_node:n,interfaces:{eth1:{up:n!=='r2'},eth2:{up:true}}}));";

var TOPO = 'name: sj\ntopology:\n  nodes:\n    r1: { kind: linux }\n    r2: { kind: linux }\n    r3: { kind: linux }\n  links:\n' +
  '    - endpoints: ["r1:eth1", "r2:eth1"]\n    - endpoints: ["r1:eth2", "r3:eth2"]\n';

function collectOnce(extra) {
  var dir = fs.mkdtempSync(path.join(os.tmpdir(), 'nx-sj-')), out = path.join(dir, 'out');
  fs.mkdirSync(out);
  fs.writeFileSync(path.join(out, 'clab-collect.js'), STUB);
  fs.writeFileSync(path.join(out, 'clab-iosxe-collect.js'), STUB);
  fs.writeFileSync(path.join(dir, 'lab.clab.yml'), TOPO);
  cp.spawnSync(process.execPath, [path.join(ROOT, 'clab-xray-collect.js'), path.join(dir, 'lab.clab.yml'), out, 'ospf'].concat(extra || []),
    { env: Object.assign({}, process.env, { TMPDIR: dir, TMP: dir, TEMP: dir }), stdio: 'ignore', timeout: 30000 });
  return { dir: dir, out: out };
}

test('xray-states.json carries the same states as xray-states.js, versioned, with nodes / edges', function () {
  var r = collectOnce();
  try {
    var js = fs.readFileSync(path.join(r.out, 'xray-states.js'), 'utf8').split('\n')[0].replace(/^window\.LIVE_STATES = /, '').replace(/;$/, '');
    var doc = JSON.parse(fs.readFileSync(path.join(r.out, 'xray-states.json'), 'utf8'));
    assert.strictEqual(doc.schema, 1);
    assert.ok(!isNaN(Date.parse(doc.generated)), 'generated is a date');
    assert.deepStrictEqual(doc.states, JSON.parse(js), 'states equal to LIVE_STATES');
    assert.deepStrictEqual(doc.nodes.map(function (n) { return n.id; }).sort(), ['r1', 'r2', 'r3']);
    assert.ok(doc.nodes.every(function (n) { return n.title === n.id && /^(ok|d+ issues?)$/.test(n.mainstat) && /^#/.test(n.color); }));
    assert.ok(Array.isArray(doc.routes) && Array.isArray(doc.adjacencies), 'the X-Ray answers (routes / adjacencies) are there');
    var e = {};
    doc.edges.forEach(function (x) { e[[x.source, x.target].sort().join('-')] = x.mainstat; });
    assert.strictEqual(doc.edges.length, 2, 'one edge per link');
    assert.strictEqual(e['r1-r2'], 'down', 'r2 eth1 down -> the r1-r2 edge is down');
    var red = doc.edges.filter(function (x) { return x.color === '#ef4444' && x.thickness === 4; }).map(function (x) { return [x.source, x.target].sort().join('-'); });
    assert.deepStrictEqual(red, ['r1-r2'], 'the down edge is drawn red and thick');
    assert.strictEqual(e['r1-r3'], 'up');
  } finally { fs.rmSync(r.dir, { recursive: true, force: true }); }
});

test('--no-json leaves xray-states.json out (xray-states.js is still written)', function () {
  var r = collectOnce(['--no-json']);
  try {
    assert.ok(fs.existsSync(path.join(r.out, 'xray-states.js')));
    assert.ok(!fs.existsSync(path.join(r.out, 'xray-states.json')));
  } finally { fs.rmSync(r.dir, { recursive: true, force: true }); }
});
