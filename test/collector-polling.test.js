// collector-polling.test.js — clab-xray-collect.js --watch with stub per-node collectors: a slow router does not hold
// back the others, and a router that is skipped this cycle is not reported as failed.
// Run: node --test        (from the repo root; Node >= 18, no dependencies)
'use strict';
var test = require('node:test');
var assert = require('node:assert');
var fs = require('fs');
var os = require('os');
var path = require('path');
var cp = require('child_process');

var ROOT = path.join(__dirname, '..');

// a stub collector: sleeps SLOW_MS when it reads the node named in SLOW_NODE, then writes a state with a timestamp
var STUB = "var a=process.argv,o=a[a.indexOf('--out')+1],n=a[a.indexOf('--node')+1];" +
  "var ms=n===process.env.SLOW_NODE?+process.env.SLOW_MS:20;Atomics.wait(new Int32Array(new SharedArrayBuffer(4)),0,0,ms);" +
  "require('fs').writeFileSync(o,JSON.stringify({success:true,target_node:n,interfaces:{},t:Date.now()}));";

function watchLab(topo, env, ms, done) {
  var dir = fs.mkdtempSync(path.join(os.tmpdir(), 'nx-poll-')), out = path.join(dir, 'out');
  fs.mkdirSync(out);
  fs.writeFileSync(path.join(out, 'clab-collect.js'), STUB);
  fs.writeFileSync(path.join(out, 'clab-iosxe-collect.js'), STUB);
  fs.writeFileSync(path.join(dir, 'lab.clab.yml'), topo);
  var ch = cp.spawn(process.execPath, [path.join(ROOT, 'clab-xray-collect.js'), path.join(dir, 'lab.clab.yml'), out, 'bgp', '--watch', '--interval', '1'],
    { env: Object.assign({}, process.env, { TMPDIR: dir, TMP: dir, TEMP: dir }, env), stdio: ['ignore', 'ignore', 'pipe'] });
  var err = '', seen = {};
  ch.stderr.on('data', function (d) { err += d; });
  var iv = setInterval(function () {
    var s; try { s = JSON.parse(fs.readFileSync(path.join(out, 'xray-states.js'), 'utf8').split('\n')[0].replace(/^window\.LIVE_STATES = /, '').replace(/;$/, '')); } catch (e) { return; }
    Object.keys(s).forEach(function (n) { (seen[n] = seen[n] || {})[s[n].t] = s[n]; });
  }, 25);
  setTimeout(function () {
    clearInterval(iv); ch.kill('SIGKILL');
    setTimeout(function () { try { fs.rmSync(dir, { recursive: true, force: true }); } catch (e) {} }, 500);   // stub children may still be writing
    done({ err: err, seen: seen, count: function (n) { return Object.keys(seen[n] || {}).length; } });
  }, ms);
}

var TWO = 'name: poll\ntopology:\n  nodes:\n    r1: { kind: linux }\n    r2: { kind: linux }\n    r3: { kind: linux }\n  links:\n' +
  '    - endpoints: ["r1:eth1", "r2:eth1"]\n    - endpoints: ["r2:eth2", "r3:eth1"]\n';

test('watch: a slow router keeps its last state and the others keep updating', function (t, done) {
  // r1 takes 5 s per read, the cycle waits at most 300 ms for it: r2 / r3 keep updating meanwhile (14 s: room for a slow process start, e.g. Windows)
  watchLab(TWO, { SLOW_NODE: 'r1', SLOW_MS: '5000', NX_CYCLE_WAIT_MS: '300' }, 14000, function (r) {
    assert.ok(r.count('r1') >= 1, 'the slow router is still read: ' + r.count('r1'));
    assert.ok(r.count('r2') >= r.count('r1') + 1, 'r2 updates more often than the slow r1 (+1: still passes on a busy machine running the whole suite; the old wait-for-all gives +0): ' + r.count('r2') + ' vs ' + r.count('r1'));
    Object.keys(r.seen.r1).forEach(function (k) { assert.ok(!r.seen.r1[k].nx_unread, 'r1 is not marked unread'); });
    assert.ok(!/COLLECT FAILED|cannot be read/.test(r.err), r.err);
    done();
  });
});

test('watch: a router whose next read falls due during a cycle is not reported as failed', function (t, done) {
  // r1 (IOS kind) is read every 2 s; r2 takes 1.5 s and the cycle waits for it, so r1's next read time passes mid-cycle
  // (16 s: a slow machine can take about 3 s per cycle here)
  var topo = 'name: pollios\ntopology:\n  nodes:\n    r1: { kind: cisco_iol }\n    r2: { kind: linux }\n  links:\n' +
    '    - endpoints: ["r1:eth1", "r2:eth1"]\n';
  watchLab(topo, { SLOW_NODE: 'r2', SLOW_MS: '1500', NX_CYCLE_WAIT_MS: '10000', NX_IOS_INTERVAL: '2' }, 16000, function (r) {
    assert.ok(r.count('r1') >= 2 && r.count('r2') >= 3, 'both routers are read: ' + r.count('r1') + ' / ' + r.count('r2'));
    assert.ok(!/COLLECT FAILED/.test(r.err), r.err);
    done();
  });
});
