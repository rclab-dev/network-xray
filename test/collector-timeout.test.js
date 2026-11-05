// collector-timeout.test.js — the real collectors against fake docker / sr_cli / ssh commands on PATH that hang, ignore
// SIGTERM, print half an answer or exit non-zero: a router that does not answer is cut at the collector's own timeout,
// reported as not answering (keeping its last state marked stale), and the other routers keep being read.
// Run: node --test        (from the repo root; Node >= 18, no dependencies; POSIX only: the fakes are sh scripts)
'use strict';
var test = require('node:test');
var assert = require('node:assert');
var fs = require('fs');
var os = require('os');
var path = require('path');
var cp = require('child_process');

var ROOT = path.join(__dirname, '..');
var POSIX = process.platform !== 'win32';
var SLOW = !!process.env.NX_SLOW_TESTS;   // the 60 s SSH timeout of the IOS collector is only checked when asked

// one fake for docker and ssh: what a router does is read from $FAKE_CTL/<container or host> (empty = answers)
var FAKE = [
  '#!/bin/sh',
  'if [ "$1" = ps ]; then echo fakeid; exit 0; fi',
  'if [ "$1" = inspect ]; then echo 10.0.0.9; exit 0; fi',
  'if [ "$(basename "$0")" = ssh ]; then eval "c=\\${$#}"; c=${c#*@}; else c="$2"; fi',
  'echo "$c" >> "$FAKE_CTL/calls"',
  'mode=$(cat "$FAKE_CTL/$c" 2>/dev/null)',
  'case "$mode" in',
  '  hang) exec sleep 90 ;;',
  '  ignoreterm) trap "" TERM; sleep 30; exit 0 ;;',
  '  partial) printf \'{"eth1": {"operationalStatus": "up", "ipAdd\'; exit 0 ;;',
  '  fail) echo "something went wrong" >&2; exit 1 ;;',
  'esac',
  'if [ "$(basename "$0")" = ssh ]; then',
  '  if [ "$mode" = sshpartial ]; then printf "r1#show ip interface brief\\nInterface IP-Address OK? Method Status Protocol\\nEthernet0/1 10.0.0.1 YES manual up up\\n"; exit 0; fi',
  '  echo "Connection refused" >&2; exit 255',
  'fi',
  // the address changes with every call, so a new read of a router gives a new state
  'n=$(wc -l < "$FAKE_CTL/calls" | tr -d " ")',
  'case "$*" in',
  '  *"show interface"*) echo "{\\"eth1\\":{\\"operationalStatus\\":\\"up\\",\\"ipAddresses\\":[{\\"address\\":\\"10.0.$((n / 250 % 250)).$((n % 250))/24\\"}]}}" ;;',
  '  *) echo "{}" ;;',
  'esac', ''].join('\n');

function sandbox() {
  var dir = fs.mkdtempSync(path.join(os.tmpdir(), 'nx-to-')), bin = path.join(dir, 'bin'), ctl = path.join(dir, 'ctl');
  fs.mkdirSync(bin); fs.mkdirSync(ctl);
  ['docker', 'ssh'].forEach(function (b) { fs.writeFileSync(path.join(bin, b), FAKE, { mode: 0o755 }); });
  return {
    dir: dir, ctl: ctl,
    env: Object.assign({}, process.env, { PATH: bin + path.delimiter + process.env.PATH, FAKE_CTL: ctl, TMPDIR: dir, TMP: dir, TEMP: dir }),
    set: function (who, mode) { fs.writeFileSync(path.join(ctl, who), mode || ''); },
    calls: function (who) { try { return fs.readFileSync(path.join(ctl, 'calls'), 'utf8').split('\n').filter(function (l) { return l === who; }).length; } catch (e) { return 0; } },
    // a fake still sleeping after its parent was killed may write once more: remove the directory a bit later
    done: function () { setTimeout(function () { try { fs.rmSync(dir, { recursive: true, force: true }); } catch (e) {} }, 500).unref(); }
  };
}

// run one collector (async, so the tests below wait at the same time); resolves {code, ms, stdout, stderr}
function run(sb, args) {
  return new Promise(function (resolve) {
    var t0 = Date.now(), so = '', se = '';
    var ch = cp.spawn(process.execPath, args, { cwd: sb.dir, env: sb.env, stdio: ['ignore', 'pipe', 'pipe'] });
    ch.stdout.on('data', function (d) { so += d; }); ch.stderr.on('data', function (d) { se += d; });
    ch.on('close', function (c) { resolve({ code: c, ms: Date.now() - t0, stdout: so, stderr: se }); });
  });
}
var CLAB = path.join(ROOT, 'clab-collect.js'), SRL = path.join(ROOT, 'clab-srl-collect.js'),
  IOS = path.join(ROOT, 'clab-iosxe-collect.js'), FRR = path.join(ROOT, 'frr-collect.js');

// a hung router is cut at the 8 s docker-exec timeout (and asked only once): well under 2 x 8 s, never the fake's 30 s
function assertCut(r, what) {
  assert.strictEqual(r.code, 3, what + ': exit 3 (not answering), got ' + r.code + ' ' + r.stderr);
  assert.match(r.stderr, /NX_UNREAD timeout/, what);
  assert.ok(r.ms >= 7500 && r.ms < 15000, what + ': cut at about 8 s, took ' + r.ms + ' ms');
}

test.describe('collector timeouts', { concurrency: true, skip: !POSIX }, function () {
  ['hang', 'ignoreterm'].forEach(function (mode) {
    test.it('FRR (clab-collect): a ' + mode + ' router is cut at 8 s and reported as not answering', async function () {
      var sb = sandbox(); sb.set('clab-l-r1', mode);
      try { assertCut(await run(sb, [CLAB, '--lab', 'l', '--node', 'r1', '--out', path.join(sb.dir, 'o.json')]), mode); }
      finally { sb.done(); }
      assert.ok(!fs.existsSync(path.join(sb.dir, 'o.json')), 'no state written for a router that did not answer');
      assert.strictEqual(sb.calls('clab-l-r1'), 1, 'not asked again after the timeout');
    });
    test.it('SR Linux: a ' + mode + ' router is cut at 8 s and reported as not answering', async function () {
      var sb = sandbox(); sb.set('clab-l-r1', mode);
      try { assertCut(await run(sb, [SRL, '--lab', 'l', '--node', 'r1', '--adj', 'ethernet-1/1:r2', '--out', path.join(sb.dir, 'o.json')]), mode); }
      finally { sb.done(); }
      assert.strictEqual(sb.calls('clab-l-r1'), 1, 'not asked again after the timeout');
    });
  });

  test.it('frr-collect --exec: a hung router is cut at 8 s and reported as not answering, not as an empty router', async function () {
    var sb = sandbox(); sb.set('r1', 'hang');
    var r;
    try { r = await run(sb, [FRR, '--node', 'r1', '--exec', 'docker exec r1', '--proto', 'ospf']); } finally { sb.done(); }
    assertCut(r, 'frr-collect');
    assert.ok(!/"success"/.test(r.stdout), 'no state printed: ' + r.stdout.slice(0, 80));
  });

  test.it('frr-collect as a module: a hung router does not make the next collectViaExec in the same process a timeout', async function () {
    var sb = sandbox(); sb.set('r1', 'hang');
    var js = 'var f = require(' + JSON.stringify(FRR) + ');' +
      'f.collectViaExec({ node: "r1", id: "r1", exec: "docker exec r1", proto: "ospf" });' +
      'var b = f.collectViaExec({ node: "r2", id: "r2", exec: "docker exec r2", proto: "ospf" });' +
      'console.log(JSON.stringify(Object.keys((b.state && b.state.interfaces) || {})));';
    var r;
    try { r = await run(sb, ['-e', js]); } finally { sb.done(); }
    assert.strictEqual(r.code, 0, r.stderr);
    assert.ok(sb.calls('r2') >= 1, 'r2 was asked after r1 timed out');
    assert.deepStrictEqual(JSON.parse(r.stdout.trim().split('\n').pop()), ['eth1'], 'r2 state read: ' + r.stdout.slice(0, 120));
  });

  test.it('a router that answers with half an output or exits non-zero is still a router that answered (no hang, not marked)', async function () {
    var sb = sandbox();
    try {
      for (var mode of ['partial', 'fail']) {
        sb.set('clab-l-r1', mode); sb.set('r1', mode);
        var a = await run(sb, [CLAB, '--lab', 'l', '--node', 'r1', '--out', path.join(sb.dir, 'a.json')]);
        assert.strictEqual(a.code, 0, mode + ' clab-collect: ' + a.stderr);
        var st = JSON.parse(fs.readFileSync(path.join(sb.dir, 'a.json'), 'utf8'));
        assert.ok(st.success && !st.nx_unread && st.target_node === 'r1', mode + ': ' + JSON.stringify(st).slice(0, 120));
        var s = await run(sb, [SRL, '--lab', 'l', '--node', 'r1', '--adj', 'ethernet-1/1:r2', '--out', path.join(sb.dir, 's.json')]);
        assert.strictEqual(s.code, 0, mode + ' srl: ' + s.stderr);
        var f = await run(sb, [FRR, '--node', 'r1', '--exec', 'docker exec r1']);
        assert.strictEqual(f.code, 0, mode + ' frr-collect: ' + f.stderr);
        [a, s, f].forEach(function (x) { assert.ok(x.ms < 5000, mode + ': answered at once, took ' + x.ms + ' ms'); });
      }
    } finally { sb.done(); }
  });

  test.it('IOS: an SSH that fails is not a router (device); half an answer keeps what was read', async function () {
    var sb = sandbox(), args = [IOS, '--node', 'r1', '--host', '10.0.0.9', '--adj', 'Ethernet0/1:r2'];
    try {
      sb.set('10.0.0.9', '');
      var r = await run(sb, args);
      assert.strictEqual(r.code, 3, r.stderr); assert.match(r.stderr, /NX_UNREAD device/);
      sb.set('10.0.0.9', 'sshpartial');
      var p = await run(sb, args);
      assert.strictEqual(p.code, 0, p.stderr);
      var st = JSON.parse(p.stdout);
      assert.ok(st.interfaces['Ethernet0/1'] && st.interfaces['Ethernet0/1'].ip === '10.0.0.1/24', JSON.stringify(st.interfaces));
    } finally { sb.done(); }
  });

  test.it('IOS: a hung SSH is cut at 60 s and reported as a timeout (NX_SLOW_TESTS=1)', { skip: !SLOW }, async function () {
    var sb = sandbox(); sb.set('10.0.0.9', 'hang');
    var r;
    try { r = await run(sb, [IOS, '--node', 'r1', '--host', '10.0.0.9', '--adj', 'Ethernet0/1:r2']); } finally { sb.done(); }
    assert.strictEqual(r.code, 124, r.stderr); assert.match(r.stderr, /NX_UNREAD timeout/);
    assert.ok(r.ms >= 59000 && r.ms < 70000, 'took ' + r.ms + ' ms');
  });

  // the whole lab, read by clab-xray-collect.js with the real FRR collector
  var TOPO = 'name: to\ntopology:\n  nodes:\n    r1: { kind: linux }\n    r2: { kind: linux }\n    r3: { kind: linux }\n  links:\n' +
    '    - endpoints: ["r1:eth1", "r2:eth1"]\n    - endpoints: ["r2:eth2", "r3:eth1"]\n';
  function labDir(sb) {
    var out = path.join(sb.dir, 'out'); fs.mkdirSync(out);
    fs.copyFileSync(CLAB, path.join(out, 'clab-collect.js'));
    fs.writeFileSync(path.join(sb.dir, 'lab.clab.yml'), TOPO);
    return out;
  }
  function readStates(out) {
    try { return JSON.parse(fs.readFileSync(path.join(out, 'xray-states.js'), 'utf8').split('\n')[0].replace(/^window\.LIVE_STATES = /, '').replace(/;$/, '')); }
    catch (e) { return null; }
  }

  test.it('one-shot: only the hung router is marked as not answering, the others are read', async function () {
    var sb = sandbox(), out = labDir(sb); sb.set('clab-to-r1', 'hang'); sb.set('clab-to-r3', 'fail');
    var r;
    try { r = await run(sb, [path.join(ROOT, 'clab-xray-collect.js'), path.join(sb.dir, 'lab.clab.yml'), out, 'ospf']); } finally { sb.done(); }
    var s = readStates(out);
    assert.ok(s, 'states written: ' + r.stderr);
    assert.ok(r.ms < 20000, 'cut at the 8 s router timeout, not the 25 s child timeout: ' + r.ms + ' ms');
    assert.deepStrictEqual([s.r1.success, s.r1.nx_unread], [false, 'timeout'], JSON.stringify(s.r1).slice(0, 160));
    assert.ok(s.r2.success && !s.r2.nx_unread && s.r2.interfaces.eth1, 'r2 read: ' + JSON.stringify(s.r2).slice(0, 160));
    assert.ok(s.r3.success && !s.r3.nx_unread, 'r3 answered (with an error): ' + JSON.stringify(s.r3).slice(0, 160));
    assert.match(r.stderr, /r1 cannot be read: no answer/);
    assert.ok(!/r2 cannot be read|r3 cannot be read|COLLECT FAILED/.test(r.stderr), r.stderr);
  });

  test.it('watch: a router that stops answering keeps its last state marked stale, the others keep updating, it comes back', async function () {
    var sb = sandbox(), out = labDir(sb);
    var ch = cp.spawn(process.execPath, [path.join(ROOT, 'clab-xray-collect.js'), path.join(sb.dir, 'lab.clab.yml'), out, 'ospf', '--watch', '--interval', '1'],
      { env: sb.env, stdio: ['ignore', 'ignore', 'pipe'] });
    var err = ''; ch.stderr.on('data', function (d) { err += d; });
    var phase = 'start', good = null, staleIps = {}, others = { r2: {}, r3: {} }, back = false, bad = [];
    try {
      await new Promise(function (resolve, reject) {
        var t0 = Date.now(), tHang = 0;
        var iv = setInterval(function () {
          var s = readStates(out), now = Date.now();
          if (now - t0 > 50000) { clearInterval(iv); return reject(new Error('timed out in phase ' + phase + '\n' + err)); }
          if (!s || !s.r1 || !s.r2 || !s.r3) return;
          ['r2', 'r3'].forEach(function (n) { if (s[n].nx_unread) bad.push(n + ' marked ' + s[n].nx_unread); });
          if (phase === 'start' && s.r1.success && !s.r1.nx_unread && s.r1.interfaces.eth1) {
            good = s.r1; sb.set('clab-to-r1', 'hang'); tHang = now; phase = 'hung';
          } else if (phase === 'hung' && s.r1.nx_unread) {
            if (s.r1.nx_unread !== 'timeout') bad.push('r1 marked ' + s.r1.nx_unread);
            staleIps[s.r1.interfaces.eth1 && s.r1.interfaces.eth1.ip] = s.r1.nx_stale_since;
            ['r2', 'r3'].forEach(function (n) { others[n][s[n].interfaces.eth1.ip] = 1; });
            // r2 / r3 updated at least twice while r1 shows stale: let r1 answer again
            if (Object.keys(others.r2).length >= 3 && Object.keys(others.r3).length >= 3) { sb.set('clab-to-r1', ''); phase = 'recover'; }
          } else if (phase === 'hung' && now - tHang > 4000 && !s.r1.nx_unread) {
            // until the 8 s timeout r1 keeps its last good state unmarked (still running, not failed)
            if (s.r1.interfaces.eth1.ip !== good.interfaces.eth1.ip) bad.push('r1 changed while hung');
          } else if (phase === 'recover' && !s.r1.nx_unread) { back = true; clearInterval(iv); resolve(); }
        }, 50);
      });
    } finally { ch.kill('SIGKILL'); sb.done(); }
    assert.deepStrictEqual(bad, []);
    assert.deepStrictEqual(Object.keys(staleIps), [good.interfaces.eth1.ip], 'r1 shows its last good state while stale');
    assert.ok(!isNaN(Date.parse(staleIps[good.interfaces.eth1.ip])), 'nx_stale_since is a time: ' + JSON.stringify(staleIps));
    assert.ok(back, 'r1 is read again after it answers');
    assert.match(err, /r1 cannot be read: no answer - showing its last good state as stale/);
    assert.match(err, /r1 collect OK again/);
    assert.ok(!/r2 cannot be read|r3 cannot be read|COLLECT FAILED/.test(err), err);
  });
});
