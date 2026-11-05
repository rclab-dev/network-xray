// node-panel-origin.test.js — the node panel's Best-Path Origin step reads the collectors' words.
// Run: node --test        (from the repo root; Node >= 18, no dependencies)
//
// The collectors write origin as a word ("IGP" / "EGP" / "incomplete"); the panel's Origin step only knew the
// one-letter codes (i / e / ?), so two paths that differ only in origin came out "all attributes equal". The
// panel now reads both, like the DeepDive (xray-core.js / xray-api.js).
'use strict';
var test = require('node:test');
var assert = require('node:assert');
var np = require('../xray-node-panel.js');

function two(o1, o2) {
  return [
    { prefix: '203.0.113.0/24', next_hop: '10.0.0.1', as_path: '65002', local_pref: 100, weight: 0, metric: 0, origin: o1, best: true, status: '*>' },
    { prefix: '203.0.113.0/24', next_hop: '10.0.0.2', as_path: '65003', local_pref: 100, weight: 0, metric: 0, origin: o2, best: false, status: '* ' }
  ];
}
function text(v) { return String(v.decision || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' '); }

[['IGP', 'incomplete'], ['IGP', 'EGP'], ['EGP', 'incomplete'], ['i', '?'], ['igp', 'Incomplete']].forEach(function (c) {
  test('origin ' + c[0] + ' over ' + c[1] + ' is decided by Origin', function () {
    var t = text(np.buildBgpView(two(c[0], c[1])));
    assert.match(t, /best path by Origin/, t);
    assert.doesNotMatch(t, /all attributes equal/, t);
  });
});

test('the same origin word on both paths is still a tie at Origin', function () {
  var t = text(np.buildBgpView(two('IGP', 'IGP')));
  assert.doesNotMatch(t, /best path by Origin/, t);
});
