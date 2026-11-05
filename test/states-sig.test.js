// states-sig.test.js — clab-xray-collect.js --watch writes xray-states.sig.js next to xray-states.js: run stays the same,
// gen moves on every write and only then, nodes[n] moves only for the router whose state changed, and no temporary
// file is left in the output directory. The page reads this small file first and the whole state file only on a new gen.
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
// stub per-node collector: copies <NX_STUB_DIR>/<node>.json to --out
var STUB = "var a=process.argv,o=a[a.indexOf('--out')+1],n=a[a.indexOf('--node')+1];" +
  "require('fs').copyFileSync(require('path').join(process.env.NX_STUB_DIR,n+'.json'),o);";

function readSig(out) {
  try { var ctx = { window: {} }; vm.runInNewContext(fs.readFileSync(path.join(out, 'xray-states.sig.js'), 'utf8'), ctx); return ctx.window.LIVE_SIG || null; }
  catch (e) { return null; }
}
function waitFor(fn, ms) {
  return new Promise(function (resolve, reject) {
    var t0 = Date.now();
    (function tick() { var v = fn(); if (v) return resolve(v); if (Date.now() - t0 > ms) return reject(new Error('timed out')); setTimeout(tick, 100); })();
  });
}
function sleep(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }

test('--watch: xray-states.sig.js follows the writes and says which router changed', { timeout: 60000 }, async function () {
  var dir = fs.mkdtempSync(path.join(os.tmpdir(), 'nx-sig-')), out = path.join(dir, 'out'), stub = path.join(dir, 'stub');
  fs.mkdirSync(out); fs.mkdirSync(stub);
  fs.writeFileSync(path.join(out, 'clab-collect.js'), STUB);
  var st = function (n, extra) { return JSON.stringify(Object.assign({ id: n, bgp_configured: true, bgp_neighbors: [] }, extra || {})); };
  fs.writeFileSync(path.join(stub, 'r1.json'), st('r1'));
  fs.writeFileSync(path.join(stub, 'r2.json'), st('r2'));
  fs.writeFileSync(path.join(dir, 'lab.clab.yml'), 'name: sg\ntopology:\n  nodes:\n    r1:\n      kind: linux\n    r2:\n      kind: linux\n' +
    '  links:\n    - endpoints: ["r1:eth1", "r2:eth1"]\n');
  var ch = cp.spawn(process.execPath, [path.join(ROOT, 'clab-xray-collect.js'), path.join(dir, 'lab.clab.yml'), out, 'bgp', '--watch', '--interval', '1'],
    { env: Object.assign({}, process.env, { NX_STUB_DIR: stub, TMPDIR: dir, TMP: dir, TEMP: dir }), stdio: ['ignore', 'ignore', 'pipe'] });
  var se = ''; ch.stderr.on('data', function (d) { se += d; });
  try {
    var a = await waitFor(function () { return readSig(out); }, 30000);
    assert.ok(a.run > 0 && a.gen >= 1, 'first sig: ' + JSON.stringify(a));
    assert.deepStrictEqual(Object.keys(a.nodes).sort(), ['r1', 'r2']);
    assert.ok(fs.existsSync(path.join(out, 'xray-states.js')), 'the state file is there when the sig says so');

    await sleep(3000);   // nothing changed: no new write
    var b = readSig(out);
    assert.strictEqual(b.gen, a.gen, 'gen stays while nothing changes');

    fs.writeFileSync(path.join(stub, 'r2.json'), st('r2', { bgp_neighbors: [{ ip: '10.0.0.1', state: 'Established' }] }));
    var c = await waitFor(function () { var s = readSig(out); return s && s.gen > b.gen ? s : null; }, 20000);
    assert.strictEqual(c.run, a.run, 'same collector run');
    assert.strictEqual(c.nodes.r1, b.nodes.r1, 'r1 did not change');
    assert.ok(c.nodes.r2 > b.nodes.r2, 'r2 changed: ' + JSON.stringify([b.nodes, c.nodes]));
    var ctx = { window: {} }; vm.runInNewContext(fs.readFileSync(path.join(out, 'xray-states.js'), 'utf8'), ctx);
    assert.strictEqual(ctx.window.LIVE_STATES.r2.bgp_neighbors.length, 1, 'the state file already has what the sig announced');

    assert.deepStrictEqual(fs.readdirSync(out).filter(function (f) { return /\.tmp$/.test(f); }), [], 'no temporary file left: ' + se);
  } finally {
    ch.kill('SIGKILL');
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
