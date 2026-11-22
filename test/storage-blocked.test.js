// storage-blocked.test.js — in a sandboxed iframe (a dashboard panel, an MCP Apps host) reading localStorage throws.
// The DeepDive must still draw: the BGP table font size falls back to 1 and the DeepDive mode to the default, Standard.
// xray-core.js is a browser file, so the two readers are cut out of it by name and run with a localStorage that throws.
// Run: node --test   (from the repo root; Node >= 18, no dependencies)
'use strict';
var test = require('node:test');
var assert = require('node:assert');
var fs = require('fs');
var path = require('path');

var SRC = fs.readFileSync(path.join(__dirname, '..', 'xray-core.js'), 'utf8').replace(/\r\n/g, '\n');
function cut(name) {
  var m = new RegExp('\\nfunction ' + name + '\\(\\) \\{\\n[\\s\\S]*?\\n\\}\\n').exec(SRC);
  assert.ok(m, name + ' not found in xray-core.js');
  return m[0];
}
function run(storage) {
  return new Function('localStorage', cut('xrayDeepMode') + cut('_deBgpStoredFontSize') + 'return [xrayDeepMode(), _deBgpStoredFontSize()];')(storage);
}

test('localStorage that throws (a sandboxed iframe): Standard mode, no stored font size, no exception', function () {
  var blocked = { getItem: function () { var e = new Error('denied'); e.name = 'SecurityError'; throw e; } };
  var r = run(blocked);
  assert.strictEqual(r[0], 'normal');
  assert.ok(Number.isNaN(r[1]));
});

test('localStorage that works: the stored choices are read as before', function () {
  var store = { routecrush_deepdive_mode: 'simple', routecrush_de_bgp_fs: '1.3' };
  var r = run({ getItem: function (k) { return k in store ? store[k] : null; } });
  assert.deepStrictEqual(r, ['simple', 1.3]);
  r = run({ getItem: function () { return null; } });
  assert.strictEqual(r[0], 'normal');
});

test('no other localStorage read in xray-core.js is outside a try', function () {
  var lines = SRC.split('\n');
  lines.forEach(function (l, i) {
    if (!/localStorage\.getItem/.test(l)) return;
    var before = lines.slice(Math.max(0, i - 3), i).join('\n');
    assert.match(before, /try \{/, 'line ' + (i + 1) + ': ' + l.trim());
  });
});
