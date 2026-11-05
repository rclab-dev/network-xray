// collector-long-run.test.js — clab-xray-collect.js --watch over many cycles with the real per-node collectors
// (FRR / SR Linux / IOS) and fake docker / vtysh / sr_cli / ssh commands on PATH that answer from the recorded
// fixtures, sometimes slowly and sometimes with an error. Checks that memory stays bounded, child processes are
// reaped, no temp files pile up and the state files are valid at the end.
// Run: node --test        (from the repo root; Node >= 18, no dependencies; Linux only: it reads /proc)
'use strict';
var test = require('node:test');
var assert = require('node:assert');
var fs = require('fs');
var os = require('os');
var path = require('path');
var cp = require('child_process');

var ROOT = path.join(__dirname, '..');
var SKIP = process.platform !== 'linux' || !fs.existsSync('/proc/self/stat') ? 'needs Linux (/proc and sh)' : false;

// one script for every fake command: argv[2] = the command name, the rest = its arguments
var FAKE = String.raw`'use strict';
var fs = require('fs'), path = require('path');
var tool = process.argv[2], args = process.argv.slice(3), E = process.env;
function sleep(ms) { Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms); }
function count(key) { var f = path.join(E.FAKE_LOG, key.replace(/[^A-Za-z0-9_-]+/g, '_')); fs.appendFileSync(f, 'x'); return fs.statSync(f).size; }
function rd(f) { try { return fs.readFileSync(f, 'utf8'); } catch (e) { return null; } }
function node(c) { return String(c).replace(/^clab-[^-]+-/, ''); }
function vtysh(c, a) {
  var n = count('vtysh-' + node(c)), cmds = [];
  for (var i = 0; i < a.length; i++) if (a[i] === '-c') cmds.push(a[++i]);
  if (n % 9 === 0) sleep(150);                                        // a slow reply now and then
  if (node(c) === 'r1' && n % 23 === 0) { process.stdout.write('% Unknown command: ' + cmds[0] + '\n'); return 0; }   // not JSON
  if (cmds.some(function (x) { return /^show ip ospf (vrf all )?interface json$/.test(x); })) count('run-' + node(c));   // once per collector run
  cmds.forEach(function (cmd) {
    if (!/ json$/.test(cmd)) { process.stdout.write('frr version 9.1\nrouter ospf\n ospf router-id 10.0.0.' + (node(c) === 'r1' ? 1 : 2) + '\n'); return; }
    var f = cmd.replace(/ json$/, '').replace(/ vrf all/, '').replace(/[^A-Za-z0-9]+/g, '_') + '.json';
    process.stdout.write((rd(path.join(E.FAKE_FRR, f)) || '{}').trim() + '\n');
  });
  return 0;
}
function srcli(c, a) {
  var n = count('srcli-' + node(c)), p = String(a[0] || '').replace(/^info from state /, '').replace(/ \| as json$/, '');
  if (p === 'network-instance default route-table ipv4-unicast') count('run-' + node(c));
  if (n % 11 === 0) sleep(200);
  process.stdout.write((rd(path.join(E.FAKE_SRL, p.replace(/[^A-Za-z0-9]+/g, '_').replace(/^_+|_+$/g, '') + '.json')) || '{}').trim() + '\n');
  return 0;
}
function docker(a) {
  if (a[0] === 'ps') { var nm = (a.join(' ').match(/clab-node-name=(\S+)/) || [])[1]; process.stdout.write('id-' + nm + '\n'); return 0; }
  if (a[0] === 'inspect') { process.stdout.write('127.0.0.1 \n'); return 0; }
  if (a[0] !== 'exec') { process.stderr.write('fake docker: ' + a[0] + '\n'); return 1; }
  var c = a[1], n = count('docker-' + node(c));
  if (node(c) === 'r2' && n % 40 >= 30) {   // r2 is "stopped" for a stretch of calls, then comes back
    process.stderr.write('Error response from daemon: container ' + c + ' is not running\n'); return 1;
  }
  if (a[2] === 'vtysh') return vtysh(c, a.slice(3));
  if (a[2] === 'sr_cli') return srcli(c, a.slice(3));
  process.stdout.write('OCI runtime exec failed: exec: "' + a[2] + '": executable file not found\n'); return 126;
}
function ssh() {
  var n = count('ssh');
  if (E.FAKE_SSH_HANG) { setInterval(function () {}, 1000); return null; }   // never answers
  var input = ''; try { input = fs.readFileSync(0, 'utf8'); } catch (e) {}
  if (n % 5 === 0) { process.stderr.write('ssh: connect to host 127.0.0.1 port 22: Connection refused\n'); return 255; }
  if (n % 3 === 0) sleep(400);
  count('run-c1');
  var out = 'c1>\n';
  input.split('\n').forEach(function (l) {
    l = l.trim(); if (!/^show /.test(l)) return;
    out += 'c1#' + l + '\n' + (rd(path.join(E.FAKE_IOS, l.replace(/[^A-Za-z0-9]+/g, '_') + '.txt')) || '') + '\n';
  });
  process.stdout.write(out + 'c1#exit\n');
  return 0;
}
var code = tool === 'docker' ? docker(args) : tool === 'vtysh' ? vtysh('clab-x-' + (process.env.FAKE_NODE || 'r1'), args)
  : tool === 'sr_cli' ? srcli('clab-x-s1', args) : tool === 'ssh' ? ssh() : 127;
if (code !== null) process.exitCode = code;
`;

function setup() {
  var dir = fs.mkdtempSync(path.join(os.tmpdir(), 'nx-longrun-'));
  var bin = path.join(dir, 'bin'), out = path.join(dir, 'out'), tmp = path.join(dir, 'tmp'), log = path.join(dir, 'log');
  [bin, out, tmp, log].forEach(function (d) { fs.mkdirSync(d); });
  fs.writeFileSync(path.join(dir, 'fake.js'), FAKE);
  ['docker', 'vtysh', 'sr_cli', 'ssh'].forEach(function (t) {
    fs.writeFileSync(path.join(bin, t), '#!/bin/sh\nexec "' + process.execPath + '" "' + path.join(dir, 'fake.js') + '" ' + t + ' "$@"\n', { mode: 0o755 });
  });
  ['clab-collect.js', 'clab-srl-collect.js', 'clab-iosxe-collect.js'].forEach(function (f) { fs.copyFileSync(path.join(ROOT, f), path.join(out, f)); });
  var env = Object.assign({}, process.env, {
    PATH: bin + path.delimiter + process.env.PATH, TMPDIR: tmp, TMP: tmp, TEMP: tmp, FAKE_LOG: log,
    FAKE_FRR: path.join(ROOT, 'fixtures', 'frr-collect-sample', 'r1'), FAKE_SRL: path.join(ROOT, 'fixtures', 'srl-collect-sample', 'r1'),
    FAKE_IOS: path.join(ROOT, 'test', 'fixtures', 'iosxe-q15', 'r1')
  });
  delete env.XRAY_VTY_SOCK_DIR;
  return { dir: dir, out: out, tmp: tmp, log: log, env: env };
}
function runs(s, n) { try { return fs.statSync(path.join(s.log, 'run-' + n)).size; } catch (e) { return 0; } }
function listTree(d) {
  var acc = [];
  (function walk(p, rel) { fs.readdirSync(p).forEach(function (f) { var q = path.join(p, f), r = rel ? rel + '/' + f : f; acc.push(r); if (fs.lstatSync(q).isDirectory()) walk(q, r); }); })(d, '');
  return acc;
}
// every process on the machine: pid -> { ppid, state, cmd }
function procs() {
  var o = {};
  fs.readdirSync('/proc').forEach(function (p) {
    if (!/^\d+$/.test(p)) return;
    try {
      var st = fs.readFileSync('/proc/' + p + '/stat', 'utf8'), rp = st.lastIndexOf(')'), f = st.slice(rp + 2).split(' ');
      var cmd = ''; try { cmd = fs.readFileSync('/proc/' + p + '/cmdline', 'utf8').replace(/\0/g, ' '); } catch (e) {}
      o[p] = { ppid: +f[1], state: f[0], cmd: cmd };
    } catch (e) {}
  });
  return o;
}
function rssKb(pid) { try { return +(/VmRSS:\s+(\d+)/.exec(fs.readFileSync('/proc/' + pid + '/status', 'utf8')) || [])[1]; } catch (e) { return 0; } }
function mine(s) { var ps = procs(); return Object.keys(ps).filter(function (p) { return +p !== process.pid && ps[p].cmd.indexOf(s.dir) >= 0; }).map(function (p) { return p + ' ' + ps[p].state + ' ' + ps[p].cmd.slice(0, 160); }); }
function readStates(file) {
  var first = fs.readFileSync(file, 'utf8').split('\n')[0];
  assert.ok(/^window\.LIVE_STATES = .*;$/.test(first), 'xray-states.js starts with the states line: ' + first.slice(0, 80));
  return JSON.parse(first.replace(/^window\.LIVE_STATES = /, '').replace(/;$/, ''));
}
function waitFor(cond, ms, cb) { var t0 = Date.now(); (function poll() { if (cond() || Date.now() - t0 > ms) return cb(); setTimeout(poll, 100); })(); }

var LAB = 'name: lr\ntopology:\n  nodes:\n    r1: { kind: linux }\n    r2: { kind: linux }\n    s1: { kind: nokia_srlinux }\n    c1: { kind: cisco_iol }\n  links:\n' +
  '    - endpoints: ["r1:eth1", "r2:eth1"]\n    - endpoints: ["r1:eth2", "s1:e1-1"]\n    - endpoints: ["r2:eth2", "c1:eth1"]\n';

test('watch: many cycles with fake routers - bounded memory, no leaked processes or temp files, valid state', { skip: SKIP, timeout: 90000 }, function (t, done) {
  var s = setup(), CYCLES = 14;
  fs.writeFileSync(path.join(s.dir, 'lab.clab.yml'), LAB);
  var ch = cp.spawn(process.execPath, [path.join(ROOT, 'clab-xray-collect.js'), path.join(s.dir, 'lab.clab.yml'), s.out, 'ospf', '--watch', '--interval', '1'],
    { env: Object.assign({}, s.env, { NX_IOS_INTERVAL: '2' }), stdio: ['ignore', 'pipe', 'pipe'] });
  var log = '';
  ch.stdout.on('data', function (d) { log += d; }); ch.stderr.on('data', function (d) { log += d; });
  var rss = [], maxZombies = 0, zSince = {}, maxZombieMs = 0, maxTmp = 0, maxStateFiles = 0, maxKids = 0;
  var iv = setInterval(function () {
    var ps = procs(), kids = Object.keys(ps).filter(function (p) { return ps[p].ppid === ch.pid; });
    // a runner that exits while the watcher waits for a cycle is a zombie until the watcher's next event-loop turn
    var zs = kids.filter(function (p) { return ps[p].state === 'Z'; }), now = Date.now();
    maxZombies = Math.max(maxZombies, zs.length);
    zs.forEach(function (p) { zSince[p] = zSince[p] || now; maxZombieMs = Math.max(maxZombieMs, now - zSince[p]); });
    maxKids = Math.max(maxKids, kids.length);
    try { var tr = listTree(s.tmp); maxTmp = Math.max(maxTmp, tr.length); maxStateFiles = Math.max(maxStateFiles, tr.filter(function (f) { return /^xray-state/.test(f); }).length); } catch (e) {}
    if (runs(s, 'r1') >= 3) rss.push(rssKb(ch.pid));
  }, 200);
  var t0 = Date.now();
  waitFor(function () { return runs(s, 'r1') >= CYCLES && runs(s, 's1') >= CYCLES && ch.exitCode === null; }, 70000, function () {
    clearInterval(iv);
    var alive = ch.exitCode === null, cycles = runs(s, 'r1');
    ch.kill('SIGTERM');
    // the collectors started in the last cycle finish on their own (they are not killed with the watcher)
    waitFor(function () { return !mine(s).length; }, 15000, function () {
      try {
        assert.ok(alive, 'the watcher is still running after ' + cycles + ' cycles:\n' + log.slice(-2000));
        assert.ok(cycles >= CYCLES && runs(s, 's1') >= CYCLES && runs(s, 'c1') >= 3, 'every collector ran many times: r1 ' + cycles + ', s1 ' + runs(s, 's1') + ', c1 ' + runs(s, 'c1') + ' in ' + (Date.now() - t0) + ' ms');
        assert.ok(/r2 cannot be read: the container is not running/.test(log), 'the fake errors were seen:\n' + log.slice(-2000));
        // memory: the watcher's RSS after the first cycles vs the end (no growth per cycle)
        var early = Math.max.apply(null, rss.slice(0, 5)), late = Math.max.apply(null, rss.slice(-5));
        assert.ok(rss.length > 10 && late - early < 20 * 1024, 'RSS stays bounded: ' + early + ' kB -> ' + late + ' kB');
        assert.ok(maxZombies <= 1 && maxZombieMs < 8000, 'exited children of the watcher are reaped (at most ' + maxZombies + ' at a time, for ' + maxZombieMs + ' ms)');
        assert.ok(maxKids <= 2, 'at most a runner (and its exiting predecessor) under the watcher: ' + maxKids);
        assert.deepStrictEqual(mine(s), [], 'no collector or fake command left running');
        // temp files: only the private state directory with a fixed set of files per node (+ the vrf-all marks file)
        var tr = listTree(s.tmp);
        assert.deepStrictEqual(tr.filter(function (f) { return !/^xray-state-u\d+(\/lr-(r1|r2|s1|c1)\.json(\.code|\.err)?)?$/.test(f) && !/^xray-vrfall-u\d+\.json$/.test(f); }), [], 'no stray temp files: ' + tr.join(', '));
        assert.ok(maxTmp <= 2 + 4 * 3 + 1 && maxStateFiles <= 1 + 4 * 3, 'temp files never pile up: max ' + maxTmp + ' entries');
        // state files are valid at the end
        var st = readStates(path.join(s.out, 'xray-states.js'));
        assert.deepStrictEqual(Object.keys(st).sort(), ['c1', 'r1', 'r2', 's1']);
        assert.ok(st.r1.success && st.s1.success, 'r1 / s1 were read');
        tr.filter(function (f) { return /\.json$/.test(f); }).forEach(function (f) { JSON.parse(fs.readFileSync(path.join(s.tmp, f), 'utf8')); });
        assert.ok(!fs.readdirSync(s.out).some(function (f) { return /\.tmp$/.test(f); }), 'no half-written output left');
        done();
      } catch (e) { done(e); }
      finally { try { fs.rmSync(s.dir, { recursive: true, force: true }); } catch (e) {} }
    });
  });
});

test('IOS: an ssh that never answers is stopped by the collector itself (no orphan ssh, no askpass dir left)', { skip: SKIP, timeout: 60000 }, function (t, done) {
  // the watcher kills a per-node collector after 25 s; the collector has to give up on ssh before that, or ssh keeps
  // running and its askpass directory stays behind once per cycle
  var s = setup(), t0 = Date.now();
  var ch = cp.spawn(process.execPath, [path.join(s.out, 'clab-iosxe-collect.js'), '--lab', 'lr', '--node', 'c1', '--adj', 'Ethernet0/1:r2', '--out', path.join(s.dir, 'c1.json')],
    { env: Object.assign({}, s.env, { FAKE_SSH_HANG: '1', NX_IOS_SSH_MS: '20000' }), stdio: ['ignore', 'ignore', 'pipe'] });   // what clab-xray-collect.js sets for its children (by hand the limit is 60 s)
  var err = '';
  ch.stderr.on('data', function (d) { err += d; });
  var killer = setTimeout(function () { ch.kill('SIGKILL'); }, 25000);   // what the watcher does at 25 s
  ch.on('close', function (code) {
    clearTimeout(killer);
    var ms = Date.now() - t0;
    waitFor(function () { return !mine(s).length; }, 2000, function () {
      try {
        assert.ok(ms < 25000, 'the collector gave up by itself in ' + ms + ' ms');
        assert.strictEqual(code, 124, 'exit 124 (timeout): ' + err);
        assert.ok(/NX_UNREAD timeout/.test(err), err);
        assert.deepStrictEqual(mine(s), [], 'no ssh left running');
        assert.deepStrictEqual(fs.readdirSync(s.tmp), [], 'the askpass directory is removed');
        done();
      } catch (e) { done(e); }
      finally { try { fs.rmSync(s.dir, { recursive: true, force: true }); } catch (e) {} }
    });
  });
});
