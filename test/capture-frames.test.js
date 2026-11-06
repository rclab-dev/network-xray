// capture-frames.test.js — scripts/capture-frames.js with a fake docker and a fake collector on PATH
// Run: node --test        (from the repo root; Node >= 18, no dependencies; no lab is started or read)
'use strict';
var test = require('node:test');
var assert = require('node:assert');
var fs = require('fs');
var os = require('os');
var path = require('path');
var cp = require('child_process');
var cf = require('../scripts/capture-frames.js');

var ROOT = path.join(__dirname, '..');
// the fake docker / collector below are run through #!/bin/sh wrappers: POSIX only (as the xray.sh tests)
var SH = process.platform === 'win32' ? 'the fakes are sh scripts' : false;
var SCRIPT = path.join(ROOT, 'scripts', 'capture-frames.js');
var TOPO = 'name: lab1\ntopology:\n  nodes:\n    r1: { kind: linux, image: frr }\n    r2: { kind: linux, image: frr }\n  links:\n    - endpoints: ["r1:eth1", "r2:eth1"]\n';

// fake docker: logs its arguments (one JSON line each call), exits FAKE_DOCKER_EXIT
var FAKE_DOCKER = [
  "var fs = require('fs'), d = process.env.FAKE_DIR;",
  "fs.appendFileSync(d + '/docker.log', JSON.stringify(process.argv.slice(2)) + '\\n');",
  "process.exit(Number(process.env.FAKE_DOCKER_EXIT || 0));"
].join('\n');
// fake collector: the lab "state" is the number of docker calls so far. FAKE_MODE:
//   settle (default) = stable at once · slow = changes for the first 3 reads after each docker call
//   flap = changes on every read · fail = exits 4 · hang = gives no answer for 60 s
var FAKE_COLLECT = [
  "var fs = require('fs'), d = process.env.FAKE_DIR, a = process.argv.slice(2), mode = process.env.FAKE_MODE || 'settle';",
  "fs.appendFileSync(d + '/collect.log', JSON.stringify({ argv: a, tmpdir: process.env.TMPDIR }) + '\\n');",
  "if (mode === 'fail') { process.stderr.write('cannot reach docker\\n'); process.exit(4); }",
  "if (mode === 'hang') Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 60000);",
  "var n = 0; try { n = fs.readFileSync(d + '/docker.log', 'utf8').split('\\n').filter(Boolean).length; } catch (e) {}",
  "var k = {}; try { k = JSON.parse(fs.readFileSync(d + '/k.json', 'utf8')); } catch (e) {}",
  "k.reads = (k.reads || 0) + 1; if (k.n !== n) { k.n = n; k.since = 0; } k.since++;",
  "fs.writeFileSync(d + '/k.json', JSON.stringify(k));",
  "var st = { r1: { applied: n, nx_stale_since: Date.now() }, r2: { applied: n } };",
  "if (mode === 'flap' || (mode === 'slow' && k.since <= 3)) st.r1.noise = k.reads;",
  "fs.writeFileSync(a[1] + '/xray-states.js', 'window.LIVE_STATES = ' + JSON.stringify(st) + ';\\nwindow.LIVE_WATCH = true;\\n');"
].join('\n');

function setup(steps) {
  var d = fs.mkdtempSync(path.join(os.tmpdir(), 'nx-capture-test-'));
  var bin = path.join(d, 'bin');
  fs.mkdirSync(bin);
  [['docker', FAKE_DOCKER], ['fake-collect', FAKE_COLLECT]].forEach(function (f) {
    fs.writeFileSync(path.join(d, f[0] + '.js'), f[1]);
    fs.writeFileSync(path.join(bin, f[0]), '#!/bin/sh\nexec "' + process.execPath + '" "' + path.join(d, f[0] + '.js') + '" "$@"\n');
    fs.chmodSync(path.join(bin, f[0]), 0o755);
  });
  fs.writeFileSync(path.join(d, 'lab.clab.yml'), TOPO);
  fs.writeFileSync(path.join(d, 'steps.json'), typeof steps === 'string' ? steps : JSON.stringify(steps));
  return d;
}
var FAST = ['--collector', 'fake-collect', '--interval', '0.1', '--settle', '2', '--min-wait', '0', '--timeout', '3'];
// PATH holds only the fakes, so no real docker or collector can be reached
function capture(d, extra, env) {
  var r = cp.spawnSync(process.execPath, [SCRIPT, path.join(d, 'lab.clab.yml'), path.join(d, 'steps.json'), path.join(d, 'out')].concat(FAST, extra || []), {
    cwd: d, encoding: 'utf8', timeout: 30000,
    env: Object.assign({}, process.env, { PATH: path.join(d, 'bin'), FAKE_DIR: d }, env || {})
  });
  return { code: r.status, stdout: r.stdout || '', stderr: r.stderr || '' };
}
function lines(f) { try { return fs.readFileSync(f, 'utf8').split('\n').filter(Boolean).map(JSON.parse); } catch (e) { return []; } }
function outFiles(d) { try { return fs.readdirSync(path.join(d, 'out')).sort(); } catch (e) { return []; } }
function frame(d, n) { return JSON.parse(fs.readFileSync(path.join(d, 'out', 'frame' + n + '.json'), 'utf8')); }

var STEPS = { proto: 'bgp', steps: [
  { name: 'steady', run: 'none' },
  { name: 'lp 150', node: 'r1', run: "vtysh -c 'conf t' -c 'route-map X permit 10' -c 'set local-preference 150'" },
  { name: 'r2 eth1 down', node: 'r2', run: 'ip link set eth1 down' }
] };

test('runs only the listed commands on the nodes (the collector is a fake here), one frame per step, and captions', { skip: SH }, function () {
  var d = setup(STEPS);
  var r = capture(d);
  assert.strictEqual(r.code, 0, r.stderr);
  assert.deepStrictEqual(lines(path.join(d, 'docker.log')), [
    ['exec', 'clab-lab1-r1', 'sh', '-c', "vtysh -c 'conf t' -c 'route-map X permit 10' -c 'set local-preference 150'"],
    ['exec', 'clab-lab1-r2', 'sh', '-c', 'ip link set eth1 down']
  ]);
  assert.deepStrictEqual(outFiles(d), ['captions.json', 'frame1.json', 'frame2.json', 'frame3.json']);
  // each frame is the state read after its step
  assert.deepStrictEqual([1, 2, 3].map(function (n) { return frame(d, n).r2.applied; }), [0, 1, 2]);
  assert.deepStrictEqual(JSON.parse(fs.readFileSync(path.join(d, 'out', 'captions.json'), 'utf8')), [
    { frame: 'frame1.json', name: 'steady', settled: true },
    { frame: 'frame2.json', name: 'lp 150', settled: true },
    { frame: 'frame3.json', name: 'r2 eth1 down', settled: true }
  ]);
  // the collector: one round (no --watch), the proto from the steps file, a private folder that is gone afterwards
  var c = lines(path.join(d, 'collect.log'));
  assert.ok(c.length >= 6);
  c.forEach(function (x) {
    assert.strictEqual(x.argv[0], path.join(d, 'lab.clab.yml'));
    assert.deepStrictEqual(x.argv.slice(2), ['bgp', '--exclude-mgmt']);
    assert.strictEqual(x.tmpdir, path.join(x.argv[1], 'tmp'));
    assert.ok(!fs.existsSync(x.argv[1]), 'work folder removed');
  });
  // nothing else written next to the topology
  assert.deepStrictEqual(fs.readdirSync(d).sort(), ['bin', 'collect.log', 'docker.log', 'docker.js', 'fake-collect.js', 'k.json', 'lab.clab.yml', 'out', 'steps.json'].sort());
});

test('waits until the state stops changing', { skip: SH }, function () {
  var d = setup(STEPS);
  // 6 reads per step, each a new process: give a busy machine room (the 3 s of FAST is close to that)
  var r = capture(d, ['--settle', '3', '--timeout', '15'], { FAKE_MODE: 'slow' });
  assert.strictEqual(r.code, 0, r.stderr);
  // 3 changing reads, then 3 equal ones, per step
  assert.ok(lines(path.join(d, 'collect.log')).length >= 3 * 5, r.stderr);
  [1, 2, 3].forEach(function (n) { assert.ok(!('noise' in frame(d, n).r1), 'frame' + n + ' is the settled state'); });
});

test('a step that never settles is saved as the last read, marked, exit 1', { skip: SH }, function () {
  var d = setup({ steps: [{ name: 'only', run: 'none' }] });
  var r = capture(d, ['--timeout', '1'], { FAKE_MODE: 'flap' });
  assert.strictEqual(r.code, 1);
  assert.match(r.stderr, /NOT settled within 1s/);
  assert.deepStrictEqual(JSON.parse(fs.readFileSync(path.join(d, 'out', 'captions.json'), 'utf8')), [{ frame: 'frame1.json', name: 'only', settled: false }]);
  assert.ok('noise' in frame(d, 1).r1);
});

test('--timeout also bounds a collector that gives no answer', { skip: SH }, function () {
  var d = setup({ proto: 'bgp', steps: [{ name: 'steady', run: 'none' }] });
  var t0 = Date.now();
  var r = capture(d, [], { FAKE_MODE: 'hang' });
  var ms = Date.now() - t0;
  assert.strictEqual(r.code, 1, r.stderr);
  assert.ok(ms < 12000, 'cut near --timeout 3 s, not after the 60 s hang: ' + ms + ' ms');
  assert.match(r.stdout + r.stderr, /collector gave no answer within \d+s/);
});

test('a failed command stops the run: later steps are not run', { skip: SH }, function () {
  var d = setup(STEPS);
  var r = capture(d, [], { FAKE_DOCKER_EXIT: '1' });
  assert.strictEqual(r.code, 1);
  assert.match(r.stderr, /the command failed on r1/);
  assert.strictEqual(lines(path.join(d, 'docker.log')).length, 1);
  assert.deepStrictEqual(outFiles(d), ['captions.json', 'frame1.json']);
});

test('a lab that cannot be read stops the run before any command', { skip: SH }, function () {
  var d = setup(STEPS);
  var r = capture(d, ['--timeout', '1'], { FAKE_MODE: 'fail' });
  assert.strictEqual(r.code, 1);
  assert.match(r.stderr, /cannot read the lab: collector exited 4: cannot reach docker/);
  assert.deepStrictEqual(lines(path.join(d, 'docker.log')), []);
  assert.deepStrictEqual(outFiles(d), []);
});

test('bad steps are refused before anything runs', function () {
  [
    [{ steps: [{ name: 'a', node: 'r9', run: 'true' }] }, /node "r9" is not in the topology/],
    [{ steps: [{ name: 'a', run: 'true' }] }, /a command needs a "node"/],
    [{ steps: [{ name: 'a', node: 'r1', run: 'none' }] }, /"node" is given but "run" is "none"/],
    [{ steps: [{ name: 'a', run: 'none' }, { name: 'a', run: 'none' }] }, /used twice/],
    [{ steps: [{ name: 'a', run: 'none', cmd: 'x' }] }, /unknown key "cmd"/],
    [{ steps: [] }, /non-empty "steps"/],
    [{ proto: 'isis', steps: [{ name: 'a', run: 'none' }] }, /proto must be one of/],
    ['{ not json', /cannot read steps file/]
  ].forEach(function (c) {
    var d = setup(c[0]);
    var r = capture(d);
    assert.strictEqual(r.code, 2, JSON.stringify(c[0]));
    assert.match(r.stderr, c[1]);
    assert.deepStrictEqual(lines(path.join(d, 'docker.log')), []);
    assert.deepStrictEqual(lines(path.join(d, 'collect.log')), []);
    assert.ok(!fs.existsSync(path.join(d, 'out')));
  });
});

test('frames already in out-dir are kept unless --force', { skip: SH }, function () {
  var d = setup({ steps: [{ name: 'a', run: 'none' }] });
  fs.mkdirSync(path.join(d, 'out'));
  fs.writeFileSync(path.join(d, 'out', 'frame1.json'), 'old');
  var r = capture(d);
  assert.strictEqual(r.code, 2);
  assert.match(r.stderr, /already in out-dir \(use --force to replace\): frame1.json/);
  assert.strictEqual(fs.readFileSync(path.join(d, 'out', 'frame1.json'), 'utf8'), 'old');
  r = capture(d, ['--force']);
  assert.strictEqual(r.code, 0, r.stderr);
  assert.strictEqual(frame(d, 1).r1.applied, 0);
});

test('--dry-run prints the commands and runs nothing', function () {
  var d = setup(STEPS);
  var r = capture(d, ['--dry-run']);
  assert.strictEqual(r.code, 0, r.stderr);
  assert.match(r.stderr, /frame2 "lp 150": docker exec clab-lab1-r1 sh -c /);
  assert.match(r.stderr, /frame3 "r2 eth1 down": docker exec clab-lab1-r2 sh -c 'ip link set eth1 down'/);
  assert.deepStrictEqual(lines(path.join(d, 'docker.log')), []);
  assert.deepStrictEqual(lines(path.join(d, 'collect.log')), []);
  assert.ok(!fs.existsSync(path.join(d, 'out')));
});

test('the q21-bgp-lp example steps check out against its topology', function () {
  var out = fs.mkdtempSync(path.join(os.tmpdir(), 'nx-capture-test-'));
  var r = cp.spawnSync(process.execPath, [SCRIPT, path.join(ROOT, 'examples/q21-bgp-lp/q21.clab.yml'),
    path.join(ROOT, 'demo/capture/q21-bgp-lp.steps.json'), path.join(out, 'o'), '--dry-run'], { encoding: 'utf8', env: Object.assign({}, process.env, { PATH: '' }) });
  assert.strictEqual(r.status, 0, r.stderr);
  assert.match(r.stderr, /lab=q21-bgp-lp proto=bgp steps=4/);
  assert.strictEqual((r.stderr.match(/docker exec clab-q21-bgp-lp-r1 sh -c /g) || []).length, 3);
});

test('parseStates and stateKey', function () {
  assert.deepStrictEqual(cf.parseStates('window.LIVE_STATES = {"r1":{"a":1}};\nwindow.LIVE_WATCH = true;\n'), { r1: { a: 1 } });
  assert.strictEqual(cf.parseStates('window.OTHER = 1;\n'), null);
  assert.strictEqual(cf.stateKey({ b: 1, a: { y: 2, x: 1 } }), cf.stateKey({ a: { x: 1, y: 2 }, b: 1 }));
  assert.strictEqual(cf.stateKey({ r1: { a: 1, nx_stale_since: 5 } }), cf.stateKey({ r1: { a: 1, nx_stale_since: 9 } }));
  assert.notStrictEqual(cf.stateKey({ r1: { a: 1 } }), cf.stateKey({ r1: { a: 2 } }));
});
