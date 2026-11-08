// collector-vendor-names.test.js — clab-xray-collect.js with names that are not plain FRR names: an SR Linux peer's
// Hello is looked up by the name SR Linux prints (e1-1 -> ethernet-1/1.0), and a node may be called "constructor".
// The per-node collectors are stubs that copy <NX_STUB_DIR>/<node>.json to --out (as in states-write.test.js).
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
var STUB = "var a=process.argv,o=a[a.indexOf('--out')+1],n=a[a.indexOf('--node')+1];" +
  "require('fs').copyFileSync(require('path').join(process.env.NX_STUB_DIR,n+'.json'),o);";

// nodes = {name: {kind, state}}, links = [[a, ai, b, bi]]; returns window.LIVE_STATES after one run
function collectOnce(nodes, links) {
  var dir = fs.mkdtempSync(path.join(os.tmpdir(), 'nx-vn-')), out = path.join(dir, 'out'), stub = path.join(dir, 'stub');
  try {
    fs.mkdirSync(out); fs.mkdirSync(stub);
    ['clab-collect.js', 'clab-srl-collect.js'].forEach(function (f) { fs.writeFileSync(path.join(out, f), STUB); });
    var y = 'name: vn\ntopology:\n  nodes:\n';
    Object.keys(nodes).forEach(function (n) {
      y += '    ' + n + ':\n      kind: ' + nodes[n].kind + '\n';
      fs.writeFileSync(path.join(stub, n + '.json'), JSON.stringify(nodes[n].state));
    });
    y += '  links:\n';
    links.forEach(function (l) { y += '    - endpoints: ["' + l[0] + ':' + l[1] + '", "' + l[2] + ':' + l[3] + '"]\n'; });
    fs.writeFileSync(path.join(dir, 'lab.clab.yml'), y);
    var r = cp.spawnSync(process.execPath, [path.join(ROOT, 'clab-xray-collect.js'), path.join(dir, 'lab.clab.yml'), out, 'ospf'],
      { cwd: dir, encoding: 'utf8', env: Object.assign({}, process.env, { NX_STUB_DIR: stub, TMPDIR: dir, TMP: dir, TEMP: dir }), timeout: 120000 });
    assert.strictEqual(r.status, 0, r.stderr);
    var ctx = { window: {} };
    vm.runInNewContext(fs.readFileSync(path.join(out, 'xray-states.js'), 'utf8'), ctx);
    return ctx.window.LIVE_STATES;
  } finally { fs.rmSync(dir, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 }); }   // Windows: the collector may still hold a file for a moment
}
function ospfState(node, ifaces) {
  var h = {}; ifaces.forEach(function (i) { h[i] = 10; });
  return { success: true, target_node: node, protocol: 'ospf', interfaces: {}, iface_hellos: h };
}

test('an SR Linux peer sends Hello on ethernet-1/1.0: the FRR side sees it (the link says e1-1)', function () {
  var st = collectOnce({
    r1: { kind: 'linux', state: ospfState('r1', ['eth1']) },
    s1: { kind: 'nokia_srlinux', state: ospfState('s1', ['ethernet-1/1.0']) }
  }, [['r1', 'eth1', 's1', 'e1-1']]);
  assert.strictEqual(st.r1.peer_sending_hellos.s1, true, 'r1 hears s1');
  assert.strictEqual(st.r1.peer_hellos.s1, 10, 'with s1\'s Hello period');
  assert.strictEqual(st.s1.peer_sending_hellos.r1, true, 's1 hears r1 (FRR names are unchanged)');
});

test('an SR Linux peer that does not run OSPF on the link is still not sending Hello', function () {
  var st = collectOnce({
    r1: { kind: 'linux', state: ospfState('r1', ['eth1']) },
    s1: { kind: 'nokia_srlinux', state: ospfState('s1', ['ethernet-1/2.0']) }
  }, [['r1', 'eth1', 's1', 'e1-1']]);
  assert.strictEqual(st.r1.peer_sending_hellos.s1, false);
});

test('a node called "constructor" is left out with the other unusable names; the rest of the lab is read', function () {
  var st = collectOnce({
    r1: { kind: 'linux', state: ospfState('r1', ['eth1', 'eth2']) },
    r2: { kind: 'linux', state: ospfState('r2', ['eth1']) },
    constructor: { kind: 'linux', state: ospfState('constructor', ['eth1']) }
  }, [['r1', 'eth1', 'r2', 'eth1'], ['r1', 'eth2', 'constructor', 'eth1']]);
  assert.deepStrictEqual(Object.keys(st).sort(), ['r1', 'r2']);
  assert.strictEqual(st.r1.peer_sending_hellos.r2, true);
});
