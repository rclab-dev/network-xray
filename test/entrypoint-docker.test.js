// entrypoint-docker.test.js — docker/entrypoint.sh when it cannot talk to Docker: a fake "docker" command goes
// first on PATH and a fake socket path is given with DOCKER_HOST, so no Docker is needed.
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
var ENTRY = path.join(ROOT, 'docker', 'entrypoint.sh');
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
var SKIP = !POSIX ? 'POSIX only' : !BASH ? 'bash is needed' : false;
var TMPS = [];
test.after(function () { TMPS.forEach(function (d) { fs.rmSync(d, { recursive: true, force: true }); }); });

function setup() {
  var dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'nx-entry-')));
  TMPS.push(dir);
  var bin = path.join(dir, 'bin');
  fs.mkdirSync(bin);
  // docker info fails with $NX_DOCKER_ERR; any other docker call is recorded (there must be none)
  fs.writeFileSync(path.join(bin, 'docker'), '#!' + BASH + '\n' +
    'if [ "$1" = info ]; then echo "$NX_DOCKER_ERR" >&2; exit 1; fi\n' +
    'echo "$@" >> "$NX_LOG"; exit 0\n', { mode: 0o755 });
  var topo = path.join(dir, 'clab.yml');
  fs.writeFileSync(topo, 'name: lab\ntopology:\n  nodes:\n    r1: { kind: linux, image: frr }\n');
  return { dir: dir, bin: bin, topo: topo, log: path.join(dir, 'calls.log') };
}
function run(env, extra) {
  var e = Object.assign({}, process.env, { PATH: env.bin + path.delimiter + process.env.PATH, NX_LOG: env.log }, extra);
  var r = cp.spawnSync(BASH, [ENTRY, '--topo', env.topo], { env: e, encoding: 'utf8', timeout: 20000 });
  var lines = r.stderr.split('\n').filter(Boolean);
  assert.strictEqual(r.status, 1, r.stdout + r.stderr);
  assert.strictEqual(lines.length, 1, 'one line: ' + r.stderr);
  assert.ok(!fs.existsSync(env.log), 'no other docker calls');
  return lines[0];
}
function fakeSocket(dir) {
  var sock = path.join(dir, 'docker.sock');
  var srv = net.createServer(function (c) { c.destroy(); });
  return new Promise(function (resolve) { srv.listen(sock, function () { resolve({ path: sock, srv: srv }); }); });
}
var NOTE = /; the socket is root-equivalent on the host: lab machines only$/;
var MOUNT = '- mount the socket (-v /var/run/docker.sock:/var/run/docker.sock)';

test('entrypoint: socket not mounted (missing) -> says so and how to mount it', { skip: SKIP }, function () {
  var env = setup();
  var sock = path.join(env.dir, 'none.sock');
  var l = run(env, { DOCKER_HOST: 'unix://' + sock, NX_DOCKER_ERR: 'Cannot connect to the Docker daemon at unix://' + sock + '. Is the docker daemon running?' });
  assert.ok(l.startsWith('cannot talk to Docker: ' + sock + ' is missing ' + MOUNT), l);
  assert.match(l, NOTE);
});

test('entrypoint: a path that is not a socket (e.g. a folder made by -v) -> says so', { skip: SKIP }, function () {
  var env = setup();
  var sock = path.join(env.dir, 'docker.sock');
  fs.mkdirSync(sock);
  var l = run(env, { DOCKER_HOST: 'unix://' + sock, NX_DOCKER_ERR: 'Cannot connect to the Docker daemon at unix://' + sock + '. Is the docker daemon running?' });
  assert.ok(l.startsWith('cannot talk to Docker: ' + sock + ' is not a socket (is Docker running on the host?) ' + MOUNT), l);
  assert.match(l, NOTE);
});

test('entrypoint: permission denied (from Docker\'s error) -> root / --group-add, with the security note', { skip: SKIP }, async function () {
  var env = setup();
  var s = await fakeSocket(env.dir);
  try {
    var l = run(env, { DOCKER_HOST: '', NX_DOCKER_ERR: 'permission denied while trying to connect to the Docker daemon socket at unix://' + s.path + ': connect: permission denied' });
    var m = /^cannot talk to Docker: permission denied on (\S+) - run the container as root \(no --user\) or add --group-add (\d+|<socket group id>) \(with SELinux: --security-opt label=disable\)/.exec(l);
    assert.ok(m, l);
    assert.strictEqual(m[1], s.path);
    if (/^\d+$/.test(m[2])) assert.strictEqual(+m[2], fs.statSync(s.path).gid);
    assert.match(l, NOTE);
  } finally { s.srv.close(); }
});

test('entrypoint: a socket this user cannot open -> permission denied', { skip: SKIP || (process.getuid() === 0 && 'root can open any socket') }, async function () {
  var env = setup();
  var s = await fakeSocket(env.dir);
  try {
    fs.chmodSync(s.path, 0);
    var l = run(env, { DOCKER_HOST: 'unix://' + s.path, NX_DOCKER_ERR: 'error during connect' });
    assert.ok(l.startsWith('cannot talk to Docker: permission denied on ' + s.path + ' '), l);
  } finally { s.srv.close(); }
});

test('entrypoint: other Docker errors keep the old message', { skip: SKIP }, async function () {
  var env = setup();
  var s = await fakeSocket(env.dir);
  try {
    var l = run(env, { DOCKER_HOST: 'unix://' + s.path, NX_DOCKER_ERR: 'Error response from daemon: something else' });
    assert.strictEqual(l, 'cannot talk to Docker: mount the socket (-v /var/run/docker.sock:/var/run/docker.sock)');
    l = run(env, { DOCKER_HOST: 'tcp://127.0.0.1:1', NX_DOCKER_ERR: 'Cannot connect to the Docker daemon at tcp://127.0.0.1:1.' });
    assert.strictEqual(l, 'cannot talk to Docker: mount the socket (-v /var/run/docker.sock:/var/run/docker.sock)');
  } finally { s.srv.close(); }
});
