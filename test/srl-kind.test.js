// srl-kind.test.js - which containerlab node kinds clab-xray-collect.js hands to the SR Linux reader (clab-srl-collect.js,
// sr_cli): srl and nokia_srlinux only; Nokia SR OS kinds (nokia_sros, nokia_srsim) have no sr_cli and are not SR Linux.
// isSrl is cut out of clab-xray-collect.js. Run: node --test        (from the repo root; Node >= 18, no dependencies)
'use strict';
var test = require('node:test');
var assert = require('node:assert');
var fs = require('fs');
var path = require('path');

var SRC = fs.readFileSync(path.join(__dirname, '..', 'clab-xray-collect.js'), 'utf8');
var m = /^function isSrl\(kind\) \{[^\n]*\}/m.exec(SRC);
var isSrl = new Function(m[0] + '\nreturn isSrl;')();

test('isSrl: srl and nokia_srlinux are SR Linux; nokia_sros, nokia_srsim, linux and cisco_iol are not', function () {
  assert.ok(m, 'isSrl not found in clab-xray-collect.js');
  ['srl', 'nokia_srlinux', 'NOKIA_SRLINUX'].forEach(function (k) { assert.strictEqual(isSrl(k), true, k); });
  ['nokia_sros', 'nokia_srsim', 'vr-sros', 'linux', 'cisco_iol', '', null, undefined].forEach(function (k) { assert.strictEqual(isSrl(k), false, String(k)); });
});
