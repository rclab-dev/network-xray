// xray-sh.test.js — xray.sh (and demo.sh) without containerlab or Docker: fake "containerlab", "docker",
// "node", "sudo" and "sleep" commands go first on PATH, record their arguments and print what the real
// tools would. xray.sh and demo.sh run from a copy in a temporary folder, so problem.json links are made there.
// Run: node --test        (from the repo root; Node >= 18, no dependencies; POSIX only - needs bash)
'use strict';
var test = require('node:test');
var assert = require('node:assert');
var fs = require('fs');
var os = require('os');
var path = require('path');
var net = require('net');
var cp = require('child_process');

var ROOT = path.join(__dirname, '..');
var POSIX = typeof process.getuid === 'function';

function which(cmd) {
  var dirs = (process.env.PATH || '').split(path.delimiter);
  for (var i = 0; i < dirs.length; i++) {
    var p = path.join(dirs[i], cmd);
    try { fs.accessSync(p, fs.constants.X_OK); return p; } catch (e) { /* next */ }
  }
  return '';
}
var BASH = POSIX ? which('bash') : '';
var REAL_SLEEP = POSIX ? which('sleep') : '';
var TMPS = [];
test.after(function () { TMPS.forEach(function (d) { fs.rmSync(d, { recursive: true, force: true }); }); });
var SKIP = !POSIX ? 'POSIX only' : (!BASH || !REAL_SLEEP) ? 'bash and sleep are needed' : false;

var LOGLINE = '{ printf \'%s\' "$(basename "$0")"; for a in "$@"; do printf \'\\t%s\' "$a"; done; printf \'\\n\'; } >> "$NX_LOG"\n';
var FAKES = {
  // sudo: record, then run the command (the fake containerlab, first on PATH)
  sudo: LOGLINE + 'exec "$@"\n',
  containerlab:
    LOGLINE +
    '[ -n "$NX_PJ" ] && { if [ -L "$NX_PJ" ]; then printf \'pj-link\\t%s\\n\' "$(readlink "$NX_PJ")"; else printf \'pj-none\\n\'; fi; } >> "$NX_LOG"\n' +
    'case "$1" in\n' +
    '  deploy) echo "INFO Containerlab started"; echo "| clab-lab-r1 | linux | running |" ;;\n' +
    '  graph) echo "INFO Serving topology graph on http://${7}"\n' +
    '         [ -n "$NX_GRAPH_BLOCK" ] && exec "$NX_REAL_SLEEP" 30 ;;\n' +
    'esac\n' +
    'exit 0\n',
  // docker ps: no containers, so the FRR wait loop has nothing to do
  docker: LOGLINE + 'exit 0\n',
  // node (the collector, started in the background); `node -e` (the --bind check) runs the real node
  node:
    '[ "$1" = -e ] && exec "$NX_REAL_NODE" "$@"\n' +
    LOGLINE +
    'echo $$ > "$NX_LOG.nodepid"\n' +
    '[ -n "$NX_GRAPH_BLOCK" ] && exec "$NX_REAL_SLEEP" 30 >/dev/null 2>&1\n' +
    'exit 0\n',
  // sleep: return at once (xray.sh waits 8 s for the first collection)
  sleep: 'exit 0\n'
};

function setup() {
  var dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'nx-xraysh-')));
  TMPS.push(dir);
  var here = path.join(dir, 'repo');
  var bin = path.join(dir, 'bin');
  fs.mkdirSync(bin);
  fs.mkdirSync(path.join(here, 'examples'), { recursive: true });
  ['xray.sh', 'demo.sh'].forEach(function (f) {
    fs.copyFileSync(path.join(ROOT, f), path.join(here, f));
    fs.chmodSync(path.join(here, f), 0o755);
  });
  fs.cpSync(path.join(ROOT, 'examples', 'q21-bgp-lp'), path.join(here, 'examples', 'q21-bgp-lp'), { recursive: true });
  fs.copyFileSync(path.join(ROOT, 'xray-graph-nextui.html'), path.join(here, 'xray-graph-nextui.html'));   // xray.sh stops when the template is missing
  Object.keys(FAKES).forEach(function (n) {
    fs.writeFileSync(path.join(bin, n), '#!' + BASH + '\n' + FAKES[n], { mode: 0o755 });
  });
  return { dir: dir, here: here, bin: bin, log: path.join(dir, 'calls.log') };
}

function run(env, script, args, extra) {
  extra = extra || {};
  var e = Object.assign({}, process.env, {
    PATH: env.bin + path.delimiter + process.env.PATH,
    NX_LOG: env.log, NX_PJ: path.join(env.here, 'problem.json'), NX_REAL_SLEEP: REAL_SLEEP, NX_REAL_NODE: process.execPath
  }, extra.env || {});
  delete e.SUDO;
  if (extra.env && 'SUDO' in extra.env) e.SUDO = extra.env.SUDO;
  return new Promise(function (resolve) {
    var p = cp.spawn(BASH, [path.join(env.here, script)].concat(args), { env: e, cwd: env.here, detached: !!extra.detached });
    var out = '', err = '';
    p.stdout.on('data', function (d) {
      out += d;
      if (extra.onOut) extra.onOut(p, out);
    });
    p.stderr.on('data', function (d) { err += d; });
    var timer = setTimeout(function () { try { process.kill(extra.detached ? -p.pid : p.pid, 'SIGKILL'); } catch (x) { /* gone */ } }, 20000);
    p.on('close', function (code, signal) {
      clearTimeout(timer);
      resolve({ code: code, signal: signal, stdout: out, stderr: err, calls: readCalls(env.log) });
    });
  });
}

function readCalls(log) {
  var s = '';
  try { s = fs.readFileSync(log, 'utf8'); } catch (e) { return []; }
  return s.split('\n').filter(Boolean).map(function (l) { return l.split('\t'); });
}
function calls(r, name) { return r.calls.filter(function (c) { return c[0] === name; }).map(function (c) { return c.slice(1); }); }

function freePort() {
  return new Promise(function (resolve, reject) {
    var s = net.createServer();
    s.on('error', reject);
    s.listen(0, '127.0.0.1', function () { var p = s.address().port; s.close(function () { resolve(p); }); });
  });
}
function portInUse(port) {
  return new Promise(function (resolve) {
    var c = net.connect(port, '127.0.0.1');
    c.on('connect', function () { c.destroy(); resolve(true); });
    c.on('error', function () { resolve(false); });
  });
}

function writeLab(dir, name, opts) {
  opts = opts || {};
  fs.mkdirSync(path.join(dir, 'r1'), { recursive: true });
  var yml = path.join(dir, 'lab.clab.yml');
  fs.writeFileSync(yml, 'name: ' + name + '\ntopology:\n  nodes:\n    r1: { kind: linux, image: frr }\n');
  if (opts.ospf) fs.writeFileSync(path.join(dir, 'r1', 'frr.conf'), 'router ospf\n network 10.0.0.0/8 area 0\n');
  return yml;
}

test('xray.sh: default lab and port deploy q21, start the collector and serve the graph on 0.0.0.0:8080', { skip: SKIP }, async function (t) {
  if (await portInUse(8080)) { t.skip('port 8080 is in use on this machine'); return; }
  var env = setup();
  var r = await run(env, 'xray.sh', []);
  var yml = path.join(env.here, 'examples', 'q21-bgp-lp', 'q21.clab.yml');
  assert.strictEqual(r.code, 0, r.stdout + r.stderr);
  assert.match(r.stdout, /==> deploying lab 'q21-bgp-lp' \(bgp\) \.\.\./);
  assert.deepStrictEqual(calls(r, 'sudo'), [['containerlab', 'deploy', '-t', yml, '--reconfigure']]);
  assert.deepStrictEqual(calls(r, 'docker')[0], ['ps', '--filter', 'label=containerlab=q21-bgp-lp', '--format', '{{.Names}}']);
  assert.deepStrictEqual(calls(r, 'node'), [[path.join(env.here, 'clab-xray-collect.js'), yml, env.here, 'bgp', '--exclude-mgmt', '--watch', '--interval', '1']]);
  assert.deepStrictEqual(calls(r, 'containerlab').pop(),
    ['graph', '--topo', yml, '--template', path.join(env.here, 'xray-graph-nextui.html'), '--static-dir', env.here, '-s', '0.0.0.0:8080']);
  assert.match(r.stdout, /open {2}http:\/\/<this machine>:8080\/ {3}\(listening on all addresses, 0\.0\.0\.0:8080/);
  assert.match(r.stdout, /docker exec -it clab-q21-bgp-lp-r1 vtysh/);
  assert.match(r.stdout, /stopped\. remove the lab with: {2}sudo containerlab destroy -t .*q21\.clab\.yml --cleanup/);
});

test('xray.sh: a given lab and port (relative path, OSPF, no sudo with SUDO=)', { skip: SKIP }, async function () {
  var env = setup();
  var labdir = path.join(env.here, 'mylab');
  var yml = writeLab(labdir, 'my-lab_1.x', { ospf: true });
  var port = await freePort();
  var r = await run(env, 'xray.sh', ['mylab/lab.clab.yml', String(port)], { env: { SUDO: '' } });
  assert.strictEqual(r.code, 0, r.stdout + r.stderr);
  assert.match(r.stdout, /deploying lab 'my-lab_1\.x' \(ospf\)/);
  assert.deepStrictEqual(calls(r, 'sudo'), []);
  var cl = calls(r, 'containerlab');
  assert.deepStrictEqual(cl[0], ['deploy', '-t', yml, '--reconfigure']);
  assert.deepStrictEqual(cl[cl.length - 1].slice(-2), ['-s', '0.0.0.0:' + port]);
  assert.strictEqual(calls(r, 'node')[0][3], 'ospf');
  assert.match(r.stdout, new RegExp('open {2}http://<this machine>:' + port + '/ {3}\\(listening on all addresses, 0\\.0\\.0\\.0:' + port));
  assert.ok(!fs.existsSync(path.join(env.here, 'problem.json')), 'no problem.json for a lab without one');
});

test('xray.sh: a port in use stops before deploy and suggests the next port', { skip: SKIP || (!which('timeout') && 'needs timeout') }, async function () {
  var env = setup();
  var srv = net.createServer(function (c) { c.destroy(); });
  await new Promise(function (res) { srv.listen(0, '127.0.0.1', res); });
  var port = srv.address().port;
  try {
    var r = await run(env, 'xray.sh', ['examples/q21-bgp-lp/q21.clab.yml', String(port)]);
    assert.strictEqual(r.code, 1);
    assert.match(r.stdout, new RegExp('port ' + port + ' is already in use'));
    assert.match(r.stdout, new RegExp('\\./xray\\.sh examples/q21-bgp-lp/q21\\.clab\\.yml ' + (port + 1)));
    assert.deepStrictEqual(r.calls, [], 'nothing deployed or started');
    assert.ok(!fs.existsSync(path.join(env.here, 'problem.json')));
  } finally { srv.close(); }
});

test('xray.sh: a missing topology stops with a message', { skip: SKIP }, async function () {
  var env = setup();
  var r = await run(env, 'xray.sh', ['no/such.clab.yml']);
  assert.strictEqual(r.code, 1);
  assert.match(r.stdout, /topology not found: no\/such\.clab\.yml/);
  assert.deepStrictEqual(r.calls, []);
});

test('xray.sh: a lab name that is not a plain name is refused before deploy', { skip: SKIP }, async function () {
  var env = setup();
  var bad = ['-x', 'a;id', '$(id)', 'a b', '.hidden', 'a/b'];
  for (var i = 0; i < bad.length; i++) {
    var dir = path.join(env.dir, 'bad' + i);
    writeLab(dir, bad[i]);
    var r = await run(env, 'xray.sh', [path.join(dir, 'lab.clab.yml')]);
    assert.strictEqual(r.code, 1, bad[i]);
    assert.match(r.stdout, /is not a plain name \(letters, digits, _ \. -\)/, bad[i]);
    assert.deepStrictEqual(r.calls, [], bad[i]);
  }
});

test('xray.sh: the problem.json link is made while running and removed at the end', { skip: SKIP }, async function () {
  var env = setup();
  var pj = path.join(env.here, 'problem.json');
  var lab = path.join(env.here, 'examples', 'q21-bgp-lp');
  var r = await run(env, 'xray.sh', ['examples/q21-bgp-lp/q21.clab.yml', String(await freePort())]);
  assert.strictEqual(r.code, 0, r.stdout + r.stderr);
  var seen = r.calls.filter(function (c) { return c[0] === 'pj-link'; });
  assert.ok(seen.length >= 2, 'link present during deploy and graph');
  seen.forEach(function (c) { assert.strictEqual(c[1], path.join(lab, 'problem.json')); });
  assert.ok(!fs.existsSync(pj) && !isLink(pj), 'link removed');

  // a stale link into examples/ (an earlier run that was killed) is replaced; a file you made is left alone
  fs.symlinkSync(path.join(env.here, 'examples', 'old', 'problem.json'), pj);
  r = await run(env, 'xray.sh', ['examples/q21-bgp-lp/q21.clab.yml', String(await freePort())]);
  assert.strictEqual(r.code, 0);
  seen = r.calls.filter(function (c) { return c[0] === 'pj-link'; });
  assert.strictEqual(seen[seen.length - 1][1], path.join(lab, 'problem.json'), 'stale link replaced by this lab\'s');
  assert.ok(!isLink(pj), 'link removed');
  fs.writeFileSync(pj, '{"mine":true}');
  r = await run(env, 'xray.sh', ['examples/q21-bgp-lp/q21.clab.yml', String(await freePort())]);
  assert.strictEqual(r.code, 0);
  assert.match(r.stdout, /problem\.json was not made by xray\.sh - left as is/);
  assert.strictEqual(fs.readFileSync(pj, 'utf8'), '{"mine":true}');
});

function isLink(p) { try { return fs.lstatSync(p).isSymbolicLink(); } catch (e) { return false; } }

test('xray.sh: Ctrl-C (SIGINT) stops the collector, removes the link and prints the clean-up command', { skip: SKIP }, async function () {
  var env = setup();
  var pj = path.join(env.here, 'problem.json');
  var sent = false;
  var r = await run(env, 'xray.sh', ['examples/q21-bgp-lp/q21.clab.yml', String(await freePort())], {
    detached: true, env: { NX_GRAPH_BLOCK: '1' },
    onOut: function (p, out) {
      // the fake graph prints "Serving" and then waits; Ctrl-C goes to the whole process group like a terminal
      if (!sent && /Serving topology graph/.test(out)) { sent = true; assert.ok(isLink(pj)); process.kill(-p.pid, 'SIGINT'); }
    }
  });
  assert.ok(sent, 'graph was reached: ' + r.stdout + r.stderr);
  assert.ok(r.code !== 0 || r.signal, 'stopped by the signal');
  assert.match(r.stdout, /stopped\. remove the lab with: {2}sudo containerlab destroy -t .*q21\.clab\.yml --cleanup/);
  assert.ok(!isLink(pj), 'problem.json link removed');
  var pid = Number(fs.readFileSync(env.log + '.nodepid', 'utf8'));
  var alive = true;
  for (var i = 0; i < 50 && alive; i++) {
    try { process.kill(pid, 0); await new Promise(function (res) { setTimeout(res, 50); }); } catch (e) { alive = false; }
  }
  assert.ok(!alive, 'collector stopped');
});

test('demo.sh: forwards all arguments to xray.sh', { skip: SKIP }, async function () {
  var env = setup();
  var port = await freePort();
  var tpl = path.join(env.dir, 'my template.html');
  fs.writeFileSync(tpl, '');   // xray.sh stops when the template is missing
  var r = await run(env, 'demo.sh', ['examples/q21-bgp-lp/q21.clab.yml', String(port), tpl]);
  assert.strictEqual(r.code, 0, r.stdout + r.stderr);
  assert.match(r.stderr, /demo\.sh is now xray\.sh - running \.\/xray\.sh/);
  assert.deepStrictEqual(calls(r, 'containerlab').pop(),
    ['graph', '--topo', path.join(env.here, 'examples', 'q21-bgp-lp', 'q21.clab.yml'), '--template', tpl,
      '--static-dir', env.here, '-s', '0.0.0.0:' + port]);
});

test('demo.sh: forwards --bind and --interval to xray.sh', { skip: SKIP }, async function () {
  var env = setup();
  var port = await freePort();
  var r = await run(env, 'demo.sh', ['--interval', '4', 'examples/q21-bgp-lp/q21.clab.yml', String(port), '--bind', '0.0.0.0']);
  assert.strictEqual(r.code, 0, r.stdout + r.stderr);
  assert.deepStrictEqual(calls(r, 'node')[0].slice(-2), ['--interval', '4']);
  assert.deepStrictEqual(calls(r, 'containerlab').pop().slice(-2), ['-s', '0.0.0.0:' + port]);
});

test('xray.sh: with no options the graph listens on 0.0.0.0 (as before) and the collector reads every second', { skip: SKIP }, async function () {
  var env = setup();
  var port = await freePort();
  var r = await run(env, 'xray.sh', ['examples/q21-bgp-lp/q21.clab.yml', String(port)]);
  assert.strictEqual(r.code, 0, r.stdout + r.stderr);
  assert.deepStrictEqual(calls(r, 'node')[0].slice(-3), ['--watch', '--interval', '1']);
  assert.deepStrictEqual(calls(r, 'containerlab').pop().slice(-2), ['-s', '0.0.0.0:' + port]);
  assert.match(r.stdout, /==> collecting router state every second /);
  assert.match(r.stdout, /listening on all interfaces \(0\.0\.0\.0\) - to allow only this machine, use --bind 127\.0\.0\.1/);   // nx_bind_note: the default says how to narrow it
  assert.match(r.stdout, new RegExp('open {2}http://<this machine>:' + port + '/ {3}\\(listening on all addresses, 0\\.0\\.0\\.0:' + port));
});

test('xray.sh: --bind and --interval go to the graph server and the collector, in any position', { skip: SKIP }, async function () {
  var env = setup();
  var port = await freePort();
  var tpl = path.join(env.here, 'xray-graph-nextui.html');
  var yml = path.join(env.here, 'examples', 'q21-bgp-lp', 'q21.clab.yml');
  var r = await run(env, 'xray.sh', ['--bind', '0.0.0.0', 'examples/q21-bgp-lp/q21.clab.yml', '--interval', '5', String(port), tpl]);
  assert.strictEqual(r.code, 0, r.stdout + r.stderr);
  assert.deepStrictEqual(calls(r, 'node'), [[path.join(env.here, 'clab-xray-collect.js'), yml, env.here, 'bgp', '--exclude-mgmt', '--watch', '--interval', '5']]);
  assert.deepStrictEqual(calls(r, 'containerlab').pop(),
    ['graph', '--topo', yml, '--template', tpl, '--static-dir', env.here, '-s', '0.0.0.0:' + port]);
  assert.match(r.stdout, /==> collecting router state every 5 s /);
  assert.match(r.stdout, new RegExp('open {2}http://<this machine>:' + port + '/ {3}\\(listening on all addresses, 0\\.0\\.0\\.0:' + port));
  assert.doesNotMatch(r.stdout, /to allow only this machine, use --bind/);   // nx_bind_note: only when --bind was not given

  // --opt=value form
  port = await freePort();
  r = await run(env, 'xray.sh', ['examples/q21-bgp-lp/q21.clab.yml', String(port), '--bind=127.0.0.1', '--interval=3']);
  assert.strictEqual(r.code, 0, r.stdout + r.stderr);
  assert.deepStrictEqual(calls(r, 'node').pop().slice(-2), ['--interval', '3']);
  assert.deepStrictEqual(calls(r, 'containerlab').pop().slice(-2), ['-s', '127.0.0.1:' + port]);
  assert.match(r.stdout, new RegExp('open {2}http://127\\.0\\.0\\.1:' + port + '/ '));
});

test('xray.sh: an address the graph cannot listen on stops before deploy with a clear message', { skip: SKIP }, async function () {
  var env = setup();
  var port = await freePort();
  var r = await run(env, 'xray.sh', ['--bind', '192.0.2.1', 'examples/q21-bgp-lp/q21.clab.yml', String(port)]);   // TEST-NET-1: not on this machine
  assert.strictEqual(r.code, 1, r.stdout + r.stderr);
  assert.match(r.stdout, new RegExp('the graph cannot listen on 192\\.0\\.2\\.1:' + port + ' \\(EADDRNOTAVAIL\\) - stopped, nothing was deployed'));
  assert.match(r.stdout, /192\.0\.2\.1 is not an address of this machine/);
  assert.deepStrictEqual(r.calls, [], 'nothing deployed or started');
  assert.ok(!fs.existsSync(path.join(env.here, '.xray.lock')), 'no lock left');
});

test('xray.sh: bad --bind / --interval values are refused before deploy', { skip: SKIP }, async function () {
  var env = setup();
  var cases = [
    [['--interval', '0'], /--interval must be a whole number of seconds \(1 or more\)/],
    [['--interval', '1.5'], /--interval must be a whole number of seconds/],
    [['--interval', ''], /--interval must be a whole number of seconds/],
    [['--interval'], /--interval needs a value/],
    [['--bind'], /--bind needs a value/],
    [['--bind', ''], /--bind must be an address/],
    [['--bind', 'a b'], /--bind must be an address/],
    [['--bind', '$(id)'], /--bind must be an address/]
  ];
  for (var i = 0; i < cases.length; i++) {
    var r = await run(env, 'xray.sh', cases[i][0]);
    assert.strictEqual(r.code, 1, cases[i][0].join(' '));
    assert.match(r.stdout, cases[i][1], cases[i][0].join(' '));
    assert.deepStrictEqual(r.calls, [], cases[i][0].join(' '));
  }
});
