// xray-query-edge-cases.test.js — scripts/xray-query.js with unusual but valid state:
// a router that could not be read is marked in list_routers and in the table, an IPv6 prefix matches however it is
// written, an interface or node named like an Object property stays data, router text reaches the terminal without
// control characters, and an address answered with a covering BGP prefix says so.
// Run: node --test        (from the repo root; Node >= 18, no dependencies)
'use strict';
var test = require('node:test');
var assert = require('node:assert');
var fs = require('fs');
var os = require('os');
var path = require('path');
var cp = require('child_process');

var ROOT = path.join(__dirname, '..');
var QUERY = path.join(ROOT, 'scripts', 'xray-query.js');
var q = require(QUERY);
var TMPS = [];
process.on('exit', function () { TMPS.forEach(function (d) { fs.rmSync(d, { recursive: true, force: true }); }); });

function lab(states) {
  var d = fs.mkdtempSync(path.join(os.tmpdir(), 'xq-edge-')); TMPS.push(d);
  Object.keys(states).forEach(function (n) { fs.writeFileSync(path.join(d, 'state_' + n + '.json'), JSON.stringify(states[n])); });
  return d;
}
function run(args) { return cp.spawnSync(process.execPath, [QUERY].concat(args), { encoding: 'utf8' }); }

var R1 = {
  target_node: 'r1', nos: 'frr',
  interfaces: { eth1: { up: true, ip: '10.0.0.1/30' }, constructor: { up: true, ip: '10.9.0.1/30' } },
  peer_links: [{ iface: 'eth1', peer: 'r2', up: true }],
  ospf_neighbors: [{ router_id: '2.2.2.2', state: 'Full', iface: 'constructor' }],
  bgp_neighbors: [{ peer_ip: '10.0.0.2', remote_as: 65002, state: 'Established' }],
  bgp_routes: [
    { prefix: '2001:db8::/32', next_hop: 'fe80::1', best: true, as_path: '65002', reason: 'Older Path\u001b[31mRED\u0007' },
    { prefix: '8.8.8.0/24', next_hop: '10.0.0.2', best: true, as_path: '65002' }
  ]
};
var R2 = { target_node: 'r2', interfaces: { eth1: { up: true } }, nx_unread: 'timeout', nx_stale_since: '2026-11-06T07:00:00Z' };

test('a router that could not be read is marked in list_routers and in the table', function () {
  var d = lab({ r1: R1, r2: R2 });
  var lr = q.listRouters(q.loadStates(d));
  var r2 = lr.routers.filter(function (r) { return r.name === 'r2'; })[0];
  assert.strictEqual(r2.unread, 'timeout');
  assert.strictEqual(r2.stale_since, '2026-11-06T07:00:00Z');
  assert.strictEqual(lr.routers.filter(function (r) { return r.name === 'r1'; })[0].unread, undefined, 'a router that was read has no mark');
  var t = run(['state', d, '--format', 'table']);
  assert.strictEqual(t.status, 0, t.stderr);
  assert.match(t.stdout, /UNREAD/);
  assert.match(t.stdout, /^ {2}r2 .*timeout/m);
  // no UNREAD column when every router was read
  var t2 = run(['state', lab({ r1: R1 }), '--format', 'table']);
  assert.doesNotMatch(t2.stdout, /UNREAD/);
});

test('an IPv6 prefix matches however it is written', function () {
  var st = q.loadStates(lab({ r1: R1 }));
  ['2001:db8::/32', '2001:DB8::/32', '2001:0db8:0::/32', '2001:0DB8:0000::/32'].forEach(function (p) {
    var w = q.why(st, 'r1', p);
    assert.strictEqual(w.candidates.length, 1, p);
  });
  assert.throws(function () { q.why(st, 'r1', '2001:db9::/32'); }, function (e) { return /^unknown prefix/.test(e.message); });
});

test('an interface named like an Object property stays data', function () {
  var t = run(['state', lab({ r1: R1, r2: R2 }), '--format', 'table']);
  assert.doesNotMatch(t.stdout, /function|native code/);
  var on = q.ospfNeighbors(q.loadStates(lab({ r1: R1 })), 'r1');
  assert.strictEqual(on.routers[0].neighbors[0].peer, undefined, 'no peer from Object.prototype');
});

test('router text reaches the terminal without control characters', function () {
  var t = run(['why', lab({ r1: R1 }), 'r1', '2001:db8::/32', '--format', 'table']);
  assert.strictEqual(t.status, 0, t.stderr);
  assert.doesNotMatch(t.stdout, /[\u0000-\u0008\u000b-\u001f\u007f]/, 'no control characters in the table');
  assert.match(t.stdout, /Older Path\?\[31mRED\?/);
  // JSON keeps the text as it was (escaped by JSON)
  assert.match(run(['why', lab({ r1: R1 }), 'r1', '2001:db8::/32']).stdout, /\\u001b\[31mRED/);
});

test('an address answered with the BGP prefix that contains it says so', function () {
  var st = q.loadStates(lab({ r1: R1 }));
  var w = q.whyPath(st, 'r1', '8.8.8.8');
  assert.strictEqual(w.prefix, '8.8.8.0/24');
  assert.strictEqual(w.destination, '8.8.8.8');
  assert.match(w.destination_note, /BGP prefix that contains the address/);
  assert.strictEqual(q.whyPath(st, 'r1', '8.8.8.0/24').destination_note, undefined, 'no note when the prefix itself was asked');
});
