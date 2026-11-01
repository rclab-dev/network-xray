// xray-query.test.js - scripts/xray-query.js (state / why) on the saved fixtures, plus its error cases.
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
var Q15 = path.join(ROOT, 'test', 'fixtures', 'iosxe-q15');
var FRR_R1 = path.join(ROOT, 'fixtures', 'frr-collect-sample', 'r1');

function run(args) {
  var r = cp.spawnSync(process.execPath, [QUERY].concat(args), { encoding: 'utf8' });
  return { code: r.status, out: JSON.parse(r.stdout) };
}

// a saved FRR BGP lab (two paths to 203.0.113.0/24, FRR picked the LocalPref 200 one) in a temp dir
function frrBgpDir(withReason) {
  var dir = fs.mkdtempSync(path.join(os.tmpdir(), 'xq-'));
  var node = path.join(dir, 'r1');
  fs.mkdirSync(node);
  var best = { prefix: '203.0.113.0', prefixLen: 24, nexthops: [{ ip: '10.0.2.3' }], valid: true, bestpath: true,
    locPrf: 200, weight: 0, path: '65003', origin: 'IGP' };
  if (withReason) best.selectionReason = 'Local Pref';
  fs.writeFileSync(path.join(node, 'show_ip_bgp_summary.json'), JSON.stringify({ ipv4Unicast: { peers: {
    '10.0.1.2': { remoteAs: 65002, localAs: 65001, state: 'Established', pfxRcd: 1 },
    '10.0.2.3': { remoteAs: 65003, localAs: 65001, state: 'Established', pfxRcd: 1 } } } }));
  fs.writeFileSync(path.join(node, 'show_ip_bgp.json'), JSON.stringify({ routes: { '203.0.113.0/24': [
    { prefix: '203.0.113.0', prefixLen: 24, nexthops: [{ ip: '10.0.1.2' }], valid: true, locPrf: 100, weight: 0, path: '65002', origin: 'IGP' },
    best] } }));
  return node;
}

test('state: OSPF adjacency from the FRR sample (frr-collect.js --from-dir layout)', function () {
  var r = run(['state', FRR_R1]);
  assert.strictEqual(r.code, 0);
  assert.deepStrictEqual(r.out.nodes.map(function (n) { return n.name; }), ['r1']);
  assert.strictEqual(r.out.ospf_adjacencies.length, 1);
  var a = r.out.ospf_adjacencies[0];
  assert.strictEqual(a.node, 'r1');
  assert.strictEqual(a.neighbor_id, '2.2.2.2');
  assert.strictEqual(a.iface, 'eth0');
  assert.strictEqual(a.state, 'Full');
  assert.strictEqual(r.out.counts.ospf_full, 1);
});

test('state: a lab directory of state_<node>.json (iosxe-q15) gives nodes, paired links, OSPF and BGP', function () {
  var r = run(['state', Q15]);
  assert.strictEqual(r.code, 0);
  assert.deepStrictEqual(r.out.nodes.map(function (n) { return n.name; }), ['r1', 'r2', 'r3']);
  var l = r.out.links.filter(function (x) { return x.a === 'r1' && x.b === 'r2'; })[0];
  assert.ok(l, 'r1-r2 link');
  assert.strictEqual(l.a_iface, 'Ethernet0/1');
  assert.strictEqual(l.b_iface, 'Ethernet0/1');
  assert.strictEqual(r.out.links.length, 2, 'each cable once');
  var o = r.out.ospf_adjacencies.filter(function (x) { return x.node === 'r1'; })[0];
  assert.strictEqual(o.state, 'Full');
  assert.strictEqual(o.peer, 'r2');
  var b = r.out.bgp_sessions.filter(function (x) { return x.node === 'r1'; })[0];
  assert.strictEqual(b.peer_ip, '2.2.2.2');
  assert.strictEqual(b.type, 'iBGP');
  assert.strictEqual(b.established, true);
});

test('state: a single state JSON file and the xray-states.js form', function () {
  var r = run(['state', path.join(Q15, 'state_r2.json')]);
  assert.strictEqual(r.code, 0);
  assert.deepStrictEqual(r.out.nodes.map(function (n) { return n.name; }), ['r2']);
  var dir = fs.mkdtempSync(path.join(os.tmpdir(), 'xq-'));
  var states = {};
  ['r1', 'r2', 'r3'].forEach(function (n) { states[n] = JSON.parse(fs.readFileSync(path.join(Q15, 'state_' + n + '.json'), 'utf8')); });
  fs.writeFileSync(path.join(dir, 'xray-states.js'), 'window.LIVE_STATES = ' + JSON.stringify(states) + ';\nwindow.LIVE_WATCH = true;\n');
  var r2 = run(['state', path.join(dir, 'xray-states.js')]);
  assert.strictEqual(r2.code, 0);
  assert.strictEqual(r2.out.counts.nodes, 3);
  assert.deepStrictEqual(run(['state', dir]).out, r2.out, 'a directory holding xray-states.js');
});

test('why: BGP best path and the reason as stored (iosxe-q15 r1 8.8.8.0/24)', function () {
  var r = run(['why', Q15, 'r1', '8.8.8.0/24']);
  assert.strictEqual(r.code, 0);
  assert.strictEqual(r.out.prefix, '8.8.8.0/24');
  assert.strictEqual(r.out.best.next_hop, '2.2.2.2');
  assert.strictEqual(r.out.best.as_path, '65002');
  assert.strictEqual(r.out.reason, 'First path received');
  assert.strictEqual(r.out.paths, 1);
  assert.deepStrictEqual(run(['why', Q15, 'r1', '8.8.8.0']).out, r.out, 'prefix without length');
});

test('why: FRR selectionReason picked up through frr-collect.js (two paths, Local Pref)', function () {
  var r = run(['why', frrBgpDir(true), 'r1', '203.0.113.0/24']);
  assert.strictEqual(r.code, 0);
  assert.strictEqual(r.out.paths, 2);
  assert.strictEqual(r.out.best.next_hop, '10.0.2.3');
  assert.strictEqual(r.out.best.local_pref, 200);
  assert.strictEqual(r.out.reason, 'Local Pref');
  assert.strictEqual(r.out.candidates.length, 2);
});

test('why: no reason in the data -> reason null and a note, no guess', function () {
  var r = run(['why', frrBgpDir(false), 'r1', '203.0.113.0/24']);
  assert.strictEqual(r.code, 0);
  assert.strictEqual(r.out.best.next_hop, '10.0.2.3');
  assert.strictEqual(r.out.reason, null);
  assert.match(r.out.note, /not in the data/);
});

test('errors: missing file, unknown node, unknown prefix, bad command -> {"error"} and exit 2', function () {
  var cases = [
    ['state', path.join(ROOT, 'no-such-file.json')],
    ['state'],
    ['why', Q15, 'r9', '8.8.8.0/24'],
    ['why', Q15, 'r1', '192.0.2.0/24'],
    ['why', Q15, 'r1', '8.8.8.0/25'],
    ['why', Q15, 'r1'],
    ['bogus', Q15],
    []
  ];
  cases.forEach(function (c) {
    var r = run(c);
    assert.strictEqual(r.code, 2, JSON.stringify(c));
    assert.strictEqual(typeof r.out.error, 'string', JSON.stringify(c));
    assert.deepStrictEqual(Object.keys(r.out), ['error'], JSON.stringify(c));
  });
  assert.match(run(['why', Q15, 'r9', '8.8.8.0/24']).out.error, /unknown node: r9/);
  assert.match(run(['why', Q15, 'r1', '192.0.2.0/24']).out.error, /unknown prefix/);
  var bad = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'xq-')), 'bad.json');
  fs.writeFileSync(bad, '{ not json');
  assert.strictEqual(run(['state', bad]).code, 2);
});

// ---- second round: VRFs, inherited names, arguments, no invented conclusions ----
function twoVrfDir() {
  var dir = fs.mkdtempSync(path.join(os.tmpdir(), 'xq-vrf-'));
  var mk = function (vrf, nh, lp) { return { prefix: '198.51.100.0/24', vrf: vrf, next_hop: nh, local_pref: lp, best: true, reason: 'Local Pref' }; };
  fs.writeFileSync(path.join(dir, 'state_r1.json'), JSON.stringify({ target_node: 'r1', interfaces: {},
    bgp_neighbors: [{ ip: '10.0.0.2', remote_as: 65002, state: 'Established' }],
    bgp_routes: [mk('red', '10.0.1.2', 200), mk('blue', '10.0.9.2', 100)] }));
  return dir;
}
test('why: the same prefix in two VRFs asks for one, and the VRF argument picks it', function () {
  var dir = twoVrfDir();
  var a = run(['why', dir, 'r1', '198.51.100.0/24']);
  assert.strictEqual(a.code, 2); assert.match(a.out.error, /several VRFs/);
  var b = run(['why', dir, 'r1', '198.51.100.0/24', 'blue']);
  assert.strictEqual(b.code, 0); assert.strictEqual(b.out.vrf, 'blue'); assert.strictEqual(b.out.best.next_hop, '10.0.9.2');
});
test('why: inherited names are not nodes', function () {
  ['constructor', 'toString', '__proto__'].forEach(function (n) {
    var r = run(['why', Q15, n, '8.8.8.0/24']);
    assert.strictEqual(r.code, 2); assert.match(r.out.error, /unknown node/);
  });
});
test('extra or missing arguments are an error, not a different answer', function () {
  assert.strictEqual(run(['state', Q15, 'extra']).code, 2);
  assert.strictEqual(run(['why', Q15, 'r1']).code, 2);
  assert.strictEqual(run(['why', Q15, 'r1', '8.8.8.0/24', 'vrf', 'extra']).code, 2);
});
test('state: a session without the iBGP flag is not called eBGP', function () {
  var dir = twoVrfDir();
  var r = run(['state', dir]);
  assert.strictEqual(r.out.bgp_sessions[0].type, null);
});
test('why: reason_source follows the node OS', function () {
  assert.match(run(['why', Q15, 'r1', '8.8.8.0/24']).out.reason_source, /IOS-XE/);
  assert.match(run(['why', twoVrfDir(), 'r1', '198.51.100.0/24', 'red']).out.reason_source, /FRR/);
});
