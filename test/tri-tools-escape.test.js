// tri-tools-escape.test.js - the triangle tools card puts the problem's own text (its id, the shutdown button's label, the
// ping target) in as text, not HTML (v1.4.3). Run: node --test
'use strict';
var test = require('node:test');
var assert = require('node:assert');
var fs = require('fs');
var path = require('path');
var SRC = fs.readFileSync(path.join(__dirname, '..', 'xray-core.js'), 'utf8');

test('the id goes through _xrayJsArg, the label and the ping target through _escapeHtml', function () {
  assert.ok(SRC.indexOf("onclick=\"_triShutdownDirect(' + _xrayJsArg(qid) + ')\">' + _escapeHtml(_cfShutdown.label)") > 0);
  assert.ok(SRC.indexOf("r1: ping ' + _escapeHtml(pingDst) + '") > 0);
  assert.strictEqual(SRC.indexOf("_triShutdownDirect(\'' + qid"), -1, 'no raw id in the onclick');
  assert.strictEqual(SRC.indexOf("r1: ping ' + pingDst + '"), -1, 'no raw ping target');
});
