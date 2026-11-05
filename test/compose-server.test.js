// compose-server.test.js — the static server of the docker compose bundles (scripts/compose-server.js):
// page files only, the right Content-Type, safe headers, short error bodies. Run: node --test
'use strict';
var test = require('node:test');
var assert = require('node:assert');
var fs = require('fs');
var os = require('os');
var path = require('path');
var http = require('http');
var srv = require('../scripts/compose-server.js');

var dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'nx-csrv-')));
var root = path.join(dir, 'web');
fs.mkdirSync(path.join(root, 'sub'), { recursive: true });
fs.writeFileSync(path.join(root, 'index.html'), '<!doctype html><title>x</title>');
fs.writeFileSync(path.join(root, 'xray-core.js'), 'window.x=1;');
fs.writeFileSync(path.join(root, 'xray-states.js'), 'window.LIVE_STATES={};');
fs.writeFileSync(path.join(root, 'sub', 'a.css'), 'a{}');
fs.writeFileSync(path.join(root, '.hidden.js'), 'secret');
fs.writeFileSync(path.join(root, 'notes.txt'), 'secret');
fs.writeFileSync(path.join(root, 'xray-states.js.tmp'), 'partial');
fs.writeFileSync(path.join(dir, 'outside.js'), 'secret');
var canLink = true;
try { fs.symlinkSync(path.join(dir, 'outside.js'), path.join(root, 'link.js')); } catch (e) { canLink = false; }

var server, port;
test.before(function (t, done) {
  server = http.createServer(srv.handler(root)).listen(0, '127.0.0.1', function () { port = server.address().port; done(); });
});
test.after(function () { server.close(); fs.rmSync(dir, { recursive: true, force: true }); });

function get(p, method) {
  return new Promise(function (resolve, reject) {
    var req = http.request({ host: '127.0.0.1', port: port, path: p, method: method || 'GET' }, function (res) {
      var b = []; res.on('data', function (c) { b.push(c); });
      res.on('end', function () { resolve({ status: res.statusCode, headers: res.headers, body: Buffer.concat(b).toString() }); });
    });
    req.on('error', reject); req.end();
  });
}
function safeHeaders(r) {
  assert.strictEqual(r.headers['x-content-type-options'], 'nosniff');
  assert.match(r.headers['content-security-policy'], /default-src 'self'/);
  assert.match(r.headers['content-security-policy'], /object-src 'none'/);
  assert.match(r.headers['content-security-policy'], /frame-ancestors 'none'/);
}

test('compose server: page files with their Content-Type and safe headers', async function () {
  var r = await get('/');
  assert.strictEqual(r.status, 200); safeHeaders(r);
  assert.strictEqual(r.headers['content-type'], 'text/html; charset=utf-8');
  assert.match(r.body, /<title>x<\/title>/);
  r = await get('/static/xray-core.js');
  assert.strictEqual(r.status, 200); safeHeaders(r);
  assert.strictEqual(r.headers['content-type'], 'text/javascript; charset=utf-8');
  r = await get('/xray-states.js?t=123');
  assert.strictEqual(r.status, 200); assert.strictEqual(r.headers['cache-control'], 'no-store');
  r = await get('/sub/a.css');
  assert.strictEqual(r.status, 200); assert.strictEqual(r.headers['content-type'], 'text/css; charset=utf-8');
  r = await get('/favicon.ico');
  assert.strictEqual(r.status, 204);
});

test('compose server: no directory listing, no dot files, no other file types, nothing outside the folder', async function () {
  var paths = ['/sub', '/sub/', '/static/', '/.hidden.js', '/static/.hidden.js', '/notes.txt', '/xray-states.js.tmp',
    '/../outside.js', '/%2e%2e/outside.js', '/sub/..%2f..%2foutside.js', '/sub%5c..%5c..%5coutside.js', '/a%00.js', '/missing.js',
    'http://127.0.0.1/../outside.js'];
  if (canLink) paths.push('/link.js');
  for (var i = 0; i < paths.length; i++) {
    var r = await get(paths[i]);
    assert.strictEqual(r.status, 404, paths[i]);
    safeHeaders(r);
    assert.strictEqual(r.headers['content-type'], 'text/plain; charset=utf-8');
    assert.strictEqual(r.body, 'not found\n', paths[i]);
  }
});

test('compose server: a malformed URL gets a short reply and the server keeps running', async function () {
  var r = await get('/%E0%A4%A');
  assert.strictEqual(r.status, 404);
  assert.strictEqual(r.body, 'not found\n');
  assert.doesNotMatch(r.body, /Error|at /);
  r = await get('/');
  assert.strictEqual(r.status, 200);
});

test('compose server: only GET and HEAD', async function () {
  var r = await get('/', 'POST');
  assert.strictEqual(r.status, 405); safeHeaders(r);
  assert.strictEqual(r.headers.allow, 'GET, HEAD');
  r = await get('/xray-core.js', 'HEAD');
  assert.strictEqual(r.status, 200);
  assert.strictEqual(r.body, '');
  assert.strictEqual(r.headers['content-length'], String('window.x=1;'.length));
});

test('compose server: the bundles carry this server', function () {
  var src = fs.readFileSync(path.join(__dirname, '..', 'scripts', 'compose-server.js'));
  ['compose-ospf', 'compose-bgp-lp'].forEach(function (b) {
    assert.ok(src.equals(fs.readFileSync(path.join(__dirname, '..', 'demo', b, 'server', 'server.js'))), b);
  });
});
