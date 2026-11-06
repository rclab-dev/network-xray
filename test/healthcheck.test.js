// healthcheck.test.js — docker/healthcheck.js against a small local HTTP server (no Docker needed).
// Run: node --test        (from the repo root; Node >= 18, no dependencies)
'use strict';
var test = require('node:test');
var assert = require('node:assert');
var fs = require('fs');
var http = require('http');
var net = require('net');
var path = require('path');
var cp = require('child_process');

var SCRIPT = path.join(__dirname, '..', 'docker', 'healthcheck.js');
var hc = require(SCRIPT);

function listen(server, port) {
  return new Promise(function (resolve, reject) {
    server.once('error', reject);
    server.listen(port || 0, '127.0.0.1', function () { resolve(server.address().port); });
  });
}
function close(server) {
  return new Promise(function (resolve) {
    if (server.closeAllConnections) server.closeAllConnections();
    server.close(function () { resolve(); });
  });
}
function serve(status) {
  return http.createServer(function (req, res) { res.writeHead(status, { 'Content-Type': 'text/html' }); res.end('<html></html>'); });
}
// a port that nothing listens on (bound once, then released)
function freePort() {
  return new Promise(function (resolve) {
    var s = net.createServer();
    s.listen(0, '127.0.0.1', function () { var p = s.address().port; s.close(function () { resolve(p); }); });
  });
}
function portIsFree(port) {
  return new Promise(function (resolve) {
    var s = net.createServer();
    s.once('error', function () { resolve(false); });
    s.listen(port, '127.0.0.1', function () { s.close(function () { resolve(true); }); });
  });
}
function runScript() {
  return new Promise(function (resolve) {
    cp.execFile(process.execPath, [SCRIPT], { timeout: 15000 }, function (err) {
      resolve(err ? (typeof err.code === 'number' ? err.code : -1) : 0);
    });
  });
}
function pid1HasPort() {
  try { return fs.readFileSync('/proc/1/cmdline', 'utf8').split('\0').indexOf('--port') >= 0; } catch (e) { return false; }
}

var NUL = '\0';
function cmdline(args) { return ['/sbin/tini', '--', '/usr/local/bin/network-xray'].concat(args).join(NUL) + NUL; }

test('port: the default 8600 without --port, or when /proc/1/cmdline cannot be read', function () {
  assert.strictEqual(hc.DEFAULT_PORT, 8600);
  assert.strictEqual(hc.portFromCmdline(cmdline(['--topo', '/lab/clab.yml'])), 8600);
  assert.strictEqual(hc.portFromCmdline(''), 8600);
  assert.strictEqual(hc.portFromCmdline(undefined), 8600);
});

test('port: a changed --port is used; the last one wins, as in the entrypoint', function () {
  assert.strictEqual(hc.portFromCmdline(cmdline(['--topo', '/lab/clab.yml', '--port', '9123'])), 9123);
  assert.strictEqual(hc.portFromCmdline(cmdline(['--port', '9000', '--topo', '/lab/clab.yml'])), 9000);
  assert.strictEqual(hc.portFromCmdline(cmdline(['--port', '9000', '--port', '9001'])), 9001);
});

test('port: a missing or invalid --port value falls back to 8600', function () {
  ['', 'abc', '-1', '0', '65536', '99999', '123456', '80x'].forEach(function (v) {
    assert.strictEqual(hc.portFromCmdline(cmdline(['--port', v])), 8600, JSON.stringify(v));
  });
  assert.strictEqual(hc.portFromCmdline(cmdline(['--port'])), 8600);
  assert.strictEqual(hc.portFromCmdline(cmdline(['--port', '65535'])), 65535);
  assert.strictEqual(hc.portFromCmdline(cmdline(['--port', '1'])), 1);
});

test('healthy: the page answers 200 on a changed port', async function () {
  var s = serve(200);
  var port = await listen(s);
  try {
    assert.strictEqual(hc.portFromCmdline(cmdline(['--port', String(port)])), port);
    assert.strictEqual(await hc.check(port, { timeoutMs: 2000 }), true);
  } finally { await close(s); }
});

test('healthy: the script exits 0 when the page answers on the default port', async function (t) {
  if (pid1HasPort()) return t.skip('PID 1 here has a --port argument');
  if (!(await portIsFree(8600))) return t.skip('port 8600 is in use on this machine');
  var s = serve(200);
  await listen(s, 8600);
  try {
    assert.strictEqual(await runScript(), 0);
  } finally { await close(s); }
});

test('unhealthy: the script exits 1 when nothing answers on the default port', async function (t) {
  if (pid1HasPort()) return t.skip('PID 1 here has a --port argument');
  if (!(await portIsFree(8600))) return t.skip('port 8600 is in use on this machine');
  assert.strictEqual(await runScript(), 1);
});

test('server not started yet: unhealthy first, healthy once it listens', async function () {
  var port = await freePort();
  assert.strictEqual(await hc.check(port, { timeoutMs: 1000 }), false);
  var s = serve(200);
  await listen(s, port);
  try {
    assert.strictEqual(await hc.check(port, { timeoutMs: 2000 }), true);
  } finally { await close(s); }
});

test('connection refused: unhealthy, and quickly', async function () {
  var port = await freePort();
  var t0 = Date.now();
  assert.strictEqual(await hc.check(port, { timeoutMs: 3000 }), false);
  assert.ok(Date.now() - t0 < 2000, 'took ' + (Date.now() - t0) + ' ms');
});

test('slow answer past the timeout: unhealthy when the server never answers', async function () {
  var s = http.createServer(function () { /* never answers */ });
  var port = await listen(s);
  try {
    var t0 = Date.now();
    assert.strictEqual(await hc.check(port, { timeoutMs: 300 }), false);
    var ms = Date.now() - t0;
    assert.ok(ms >= 250 && ms < 2000, 'took ' + ms + ' ms');
  } finally { await close(s); }
});

test('slow answer past the timeout: unhealthy when the headers trickle in slower than the timeout', async function () {
  // bytes keep arriving (so the socket is never idle), but the whole answer takes longer than the timeout
  var timers = [];
  var s = net.createServer(function (sock) {
    sock.on('error', function () {});
    sock.resume(); // read, so the socket sees the client hang up and closes
    var parts = ['HTTP/1.1 200 OK\r\n', 'X-A: 1\r\n', 'X-B: 1\r\n', 'X-C: 1\r\n', 'X-D: 1\r\n', 'Content-Length: 0\r\n', '\r\n'];
    var i = 0;
    (function next() {
      if (i >= parts.length || sock.destroyed) return;
      sock.write(parts[i++]);
      timers.push(setTimeout(next, 150));
    })();
  });
  var port = await listen(s);
  try {
    var t0 = Date.now();
    assert.strictEqual(await hc.check(port, { timeoutMs: 400 }), false);
    assert.ok(Date.now() - t0 < 900, 'took ' + (Date.now() - t0) + ' ms');
  } finally { timers.forEach(clearTimeout); await close(s); }
});

test('an answer within the timeout is healthy', async function () {
  var s = http.createServer(function (req, res) { setTimeout(function () { res.end('ok'); }, 100); });
  var port = await listen(s);
  try {
    assert.strictEqual(await hc.check(port, { timeoutMs: 2000 }), true);
  } finally { await close(s); }
});

test('non-200 answers: 4xx and 5xx are unhealthy, 2xx and 3xx are healthy', async function () {
  var cases = [[404, false], [403, false], [500, false], [503, false], [204, true], [301, true], [302, true]];
  for (var i = 0; i < cases.length; i++) {
    var s = serve(cases[i][0]);
    var port = await listen(s);
    try {
      assert.strictEqual(await hc.check(port, { timeoutMs: 2000 }), cases[i][1], 'HTTP ' + cases[i][0]);
    } finally { await close(s); }
  }
});

test('the check asks for / on 127.0.0.1', async function () {
  var seen = null;
  var s = http.createServer(function (req, res) { seen = req.url; res.end('ok'); });
  var port = await listen(s);
  try {
    assert.strictEqual(await hc.check(port, { timeoutMs: 2000 }), true);
    assert.strictEqual(seen, '/');
  } finally { await close(s); }
});
