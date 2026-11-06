// cml-xray.test.js — runs cml-xray.js --self-test (offline: no CML, no ssh to a lab; a local page server on 127.0.0.1)
// Run: node --test        (from the repo root; Node >= 18, no dependencies)
'use strict';
var test = require('node:test');
var assert = require('node:assert');
var path = require('path');
var cp = require('child_process');

test('cml-xray --self-test: all pass', function () {
  var r = cp.spawnSync(process.execPath, [path.join(__dirname, '..', 'cml-xray.js'), '--self-test'], { encoding: 'utf8', timeout: 120000 });
  var out = (r.stdout || '') + (r.stderr || '');
  assert.match(out, /cml-xray self-test: \d+ ok, 0 failed/, out.split('\n').filter(function (l) { return /FAIL/.test(l); }).join('\n') || out.slice(-400));
  assert.strictEqual(r.status, 0);
});
