// ja-headings.test.js - on the 日本語 toggle the engine's English panel headings are shown in Japanese (xray-api.js,
// nx_ja_headings): only a text node that is exactly a heading; protocol words and router output stay; the English comes
// back on the English toggle. Run: node --test
'use strict';
var test = require('node:test');
var assert = require('node:assert');
var fs = require('fs');
var path = require('path');
var vm = require('vm');

var SRC = fs.readFileSync(path.join(__dirname, '..', 'xray-api.js'), 'utf8');
var a = SRC.indexOf('  var _JA_HEADINGS'), b = SRC.indexOf('  function _localize(root)');
function load(nodes) {
  var ctx = { NodeFilter: { SHOW_TEXT: 4 }, String: String, Object: Object,
    document: { createTreeWalker: function () { var i = 0; return { nextNode: function () { return nodes[i++] || null; } }; } } };
  vm.createContext(ctx);
  vm.runInContext(SRC.slice(a, b) + '\nthis._jaHeading = _jaHeading; this._localizeHeadings = _localizeHeadings;', ctx);
  return ctx;
}

test('the headings found in xray-api.js', function () {
  assert.ok(a > 0 && b > a, 'nx_ja_headings block not found');
});

test('a whole heading is Japanese; a protocol word or a line of router output is not touched', function () {
  var c = load([]);
  assert.strictEqual(c._jaHeading('Routing table'), '経路表');
  assert.strictEqual(c._jaHeading(' Best-Path Decision '), ' 最良経路の決め方 ');
  assert.strictEqual(c._jaHeading('Router — Internal View'), 'ルータの中');
  ['LSDB', 'OSPF', 'Full', 'Established', 'Routing table for VRF default', 'show ip route'].forEach(function (t) {
    assert.strictEqual(c._jaHeading(t), null, t);
  });
});

test('日本語 then English: the English comes back as it was', function () {
  var nodes = [{ nodeValue: 'Routing Engine' }, { nodeValue: 'LSDB' }, { nodeValue: 'BGP Table' }];
  var c = load(nodes);
  c._localizeHeadings({}, true);
  assert.deepStrictEqual(nodes.map(function (n) { return n.nodeValue; }), ['ルーティング エンジン', 'LSDB', 'BGP の表']);
  c._localizeHeadings({}, true);   // again: nothing changes
  assert.strictEqual(nodes[0].nodeValue, 'ルーティング エンジン');
  c._localizeHeadings({}, false);
  assert.deepStrictEqual(nodes.map(function (n) { return n.nodeValue; }), ['Routing Engine', 'LSDB', 'BGP Table']);
});
