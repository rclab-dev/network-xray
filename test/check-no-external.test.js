// check-no-external.test.js — served pages and user-run scripts reach no host outside the user's machine
// (scripts/check-no-external.js): only plain links to allowed hosts, no external loads, no tracking.
// Run: node --test        (from the repo root; Node >= 18, no dependencies)
'use strict';
var test = require('node:test');
var assert = require('node:assert');
var ce = require('../scripts/check-no-external.js');

function scan(rel, text) { return ce.scanText(rel, text); }

test('no served page or script references an external host', function () {
  var result = ce.checkAll();
  var lines = [];
  Object.keys(result).forEach(function (f) { result[f].forEach(function (p) { lines.push(f + ': ' + p); }); });
  assert.deepStrictEqual(lines, []);
});

test('the scan covers the pages, engine scripts, shell scripts and Dockerfiles', function () {
  var files = ce.listFiles();
  ['index.html', 'xray-graph.html', 'xray-graph-nextui.html', 'xray-core.js', 'xray.sh', 'docker/Dockerfile',
    'demo/compose-ospf/web/index.html', 'README.md'].forEach(function (f) {
    assert.ok(files.indexOf(f) >= 0, f + ' is scanned');
  });
  assert.ok(files.indexOf('scripts/check-no-external.js') < 0);
});

test('plain links to allowed hosts and local URLs pass', function () {
  assert.deepStrictEqual(scan('a.html', '<a href="https://github.com/rclab-dev/network-xray">src</a>'), []);
  assert.deepStrictEqual(scan('a.js', 'a.href = "https://routecrushlab.com/?ref=x";'), []);
  assert.deepStrictEqual(scan('a.js', 'fetch("api/state"); fetch("http://localhost:8080/x"); fetch("http://127.0.0.1/x");'), []);
  assert.deepStrictEqual(scan('a.sh', 'echo "open http://${HOST}:${PORT}/"'), []);
});

test('a link to a host that is not allowed fails', function () {
  var p = scan('a.html', '<a href="https://evil.example.net.attacker.io/">x</a>');
  assert.strictEqual(p.length, 1);
  assert.match(p[0], /attacker\.io/);
});

test('external loads fail even for an allowed link host', function () {
  [
    ['a.html', '<script src="https://github.com/x/y.js"></script>'],
    ['a.html', '<script src="//cdn.jsdelivr.net/npm/x"></script>'],
    ['a.html', '<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=X">'],
    ['a.html', '<img src="https://routecrushlab.com/pixel">'],
    ['a.css', '@font-face { src: url("https://github.com/f.woff2"); }'],
    ['a.css', '@import "https://github.com/a";'],
    ['a.js', 'fetch("https://github.com/api/latest")'],
    ['a.js', 'new WebSocket("wss://github.com/s")'],
    ['a.js', 'new EventSource("https://github.com/e")'],
    ['a.js', 'xhr.open("GET", "https://github.com/v")'],
    ['a.js', 'new Worker("https://github.com/w.js")'],
    ['a.js', 'new SharedWorker("https://github.com/w.js")'],
    ['a.js', 'var V = "https://routecrushlab.com/v.webm"; el.src = V;'],
    ['a.sh', 'curl -fsSL https://github.com/x/install | sh'],
    ['a.md', '```html\n<script src="https://unpkg.com/x"></script>\n```'],
  ].forEach(function (c) {
    assert.ok(scan(c[0], c[1]).length > 0, c[0] + ': ' + c[1]);
  });
});

test('analytics and tracking snippets fail', function () {
  assert.ok(scan('a.html', "<script>gtag('config', 'G-X')</script>").length > 0);
  assert.ok(scan('a.js', 'navigator.sendBeacon("/x", d)').length > 0);
});

test('an exception applies to its own file only', function () {
  var u = 'var P = "https://routecrushlab.com/static/pip/pl_en.webm";';
  assert.deepStrictEqual(scan('xray-graph-nextui.html', u), []);
  assert.ok(scan('xray-graph.html', u).length > 0);
});

test('markdown links are not restricted, markdown loads are', function () {
  assert.deepStrictEqual(scan('docs/a.md', 'See [x](https://zenn.dev/x) and <https://dev.to/y>.'), []);
  assert.ok(scan('docs/a.md', '<img src="https://img.shields.io/badge">').length > 0);
});

test('a private address or a .local name is another machine on the LAN, not this one', function () {
  ['fetch("http://10.1.2.3/x")', 'fetch("http://172.16.5.50:8080/s")', 'new WebSocket("ws://172.20.0.5/s")', 'fetch("http://nas.local/x")']
    .forEach(function (t) { assert.ok(scan('a.js', t).length > 0, t); });
  assert.deepStrictEqual(scan('a.js', 'fetch("http://127.0.0.1:8080/x"); fetch("http://[::1]/x"); fetch("http://lab.localhost/x")'), []);
});
