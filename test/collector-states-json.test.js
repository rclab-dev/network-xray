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

function collectOnce(extra, topo, stub) {
  var dir = fs.mkdtempSync(path.join(os.tmpdir(), 'nx-sj-')), out = path.join(dir, 'out');
  fs.mkdirSync(out);
  fs.writeFileSync(path.join(out, 'clab-collect.js'), stub || STUB);
  fs.writeFileSync(path.join(out, 'clab-iosxe-collect.js'), STUB);
  fs.writeFileSync(path.join(dir, 'lab.clab.yml'), topo || TOPO);
  var result = cp.spawnSync(process.execPath, [path.join(ROOT, 'clab-xray-collect.js'), path.join(dir, 'lab.clab.yml'), out, 'ospf'].concat(extra || []),
    { env: Object.assign({}, process.env, { TMPDIR: dir, TMP: dir, TEMP: dir }), encoding: 'utf8', timeout: 30000 });
  return { dir: dir, out: out, result: result };
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

test('the Docker image: the entrypoint drops scripts/ from the copy it runs, the collector reads the image\'s own scripts/', function () {
  var ep = fs.readFileSync(path.join(__dirname, '..', 'docker', 'entrypoint.sh'), 'utf8');
  var src = fs.readFileSync(path.join(__dirname, '..', 'clab-xray-collect.js'), 'utf8');
  var at = /^SRC=(\S+);/m.exec(ep);
  assert.ok(at && /rm -rf [^\n]*"\$WORK\/scripts"/.test(ep), 'the copy the image runs has no scripts/');
  assert.ok(src.indexOf("'" + at[1] + "/scripts/states-doc.js'") >= 0, 'the collector falls back to ' + at[1] + '/scripts/states-doc.js');
  var sd = fs.readFileSync(path.join(__dirname, '..', 'scripts', 'states-doc.js'), 'utf8');
  assert.ok(sd.indexOf("'" + at[1] + "/scripts/' + name") >= 0 && src.indexOf("StatesDoc.find(__dirname, 'xray-query.js')") >= 0,
    'xray-query.js is looked for the same way (states-doc.js find: next to the collector, then ' + at[1] + '/scripts/)');
});

function posTopo(r3) {
  return 'name: sj\ntopology:\n  nodes:\n    r1:\n      kind: linux\n      labels:\n        graph-posX: "200"\n        graph-posY: "40"\n' +
    '    r2: { kind: linux, labels: { graph-posX: 100, graph-posY: 200 } }\n    r3:\n      kind: linux\n' + r3 +
    '  links:\n    - endpoints: ["r1:eth1", "r2:eth1"]\n    - endpoints: ["r1:eth2", "r3:eth2"]\n';
}

test('nodes carry fixedx / fixedy from graph-posX / graph-posY when every router has both (Node graph draws them there)', function () {
  var r = collectOnce([], posTopo('      labels:\n        graph-posX: "300"\n        graph-posY: "200"\n'));
  try {
    var doc = JSON.parse(fs.readFileSync(path.join(r.out, 'xray-states.json'), 'utf8')), at = {};
    doc.nodes.forEach(function (n) { at[n.id] = [n.fixedx, n.fixedy]; });
    assert.deepStrictEqual(at, { r1: [200, 40], r2: [100, 200], r3: [300, 200] });
  } finally { fs.rmSync(r.dir, { recursive: true, force: true }); }
});

test('one router without a position -> no fixedx / fixedy at all (the Node graph lays them out itself)', function () {
  var r = collectOnce([], posTopo('      labels:\n        graph-level: 2\n'));
  try {
    var doc = JSON.parse(fs.readFileSync(path.join(r.out, 'xray-states.json'), 'utf8'));
    assert.strictEqual(doc.nodes.length, 3);
    assert.ok(doc.nodes.every(function (n) { return !('fixedx' in n) && !('fixedy' in n); }));
  } finally { fs.rmSync(r.dir, { recursive: true, force: true }); }
});

test('--settle stops after two equal rounds or times out on changing states', function () {
  var one = 'name: sj\ntopology:\n  nodes:\n    r1: { kind: linux }\n';
  var counter = "var fs=require('fs'),a=process.argv,o=a[a.indexOf('--out')+1],f=require('path').join(process.env.TMPDIR,'count'),n=fs.existsSync(f)?+fs.readFileSync(f,'utf8'):0;fs.writeFileSync(f,String(++n));";
  var stable = counter + "fs.writeFileSync(o,JSON.stringify({success:true,target_node:'r1'}));";
  var changing = counter + "fs.writeFileSync(o,JSON.stringify({success:true,target_node:'r1',round:n}));";
  var a = collectOnce(['--settle', '3', '--interval', '1'], one, stable);
  var b = collectOnce(['--settle', '3', '--interval', '1'], one, changing);
  try {
    assert.strictEqual(a.result.status, 0, a.result.stderr);
    assert.strictEqual(fs.readFileSync(path.join(a.dir, 'count'), 'utf8'), '2');
    assert.strictEqual(b.result.status, 3, b.result.stderr);
    assert.match(b.result.stderr, /did not settle in 3 s \(\d+ rounds\)/);
    assert.ok(fs.existsSync(path.join(b.out, 'xray-states.js')));
    assert.ok(fs.existsSync(path.join(b.out, 'xray-states.json')));
  } finally { fs.rmSync(a.dir, { recursive: true, force: true }); fs.rmSync(b.dir, { recursive: true, force: true }); }
});

test('--settle reports the router that changed after timing out', function () {
  var one = 'name: sj\ntopology:\n  nodes:\n    r1: { kind: linux }\n';
  var changing = "var fs=require('fs'),a=process.argv,o=a[a.indexOf('--out')+1],f=require('path').join(process.env.TMPDIR,'count'),n=fs.existsSync(f)?+fs.readFileSync(f,'utf8'):0;fs.writeFileSync(f,String(++n));fs.writeFileSync(o,JSON.stringify({success:true,target_node:'r1',round:n}));";
  var r = collectOnce(['--settle', '3', '--interval', '1'], one, changing);
  try {
    assert.strictEqual(r.result.status, 3, r.result.stderr);
    assert.match(r.result.stderr, /did not settle in 3 s \(\d+ rounds\)[^\n]*\n  r1: /);
  } finally { fs.rmSync(r.dir, { recursive: true, force: true }); }
});

test('--settle: routers that cannot be read never count as settled (the same empty round twice is not a lab at rest)', function () {
  var one = 'name: sj\ntopology:\n  nodes:\n    r1: { kind: linux }\n';
  var r = collectOnce(['--settle', '3', '--interval', '1'], one, 'process.exit(1);');
  try {
    assert.strictEqual(r.result.status, 3, r.result.stderr);
    assert.match(r.result.stderr, /did not settle/);
  } finally { fs.rmSync(r.dir, { recursive: true, force: true }); }
});
