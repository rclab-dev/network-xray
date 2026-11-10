// xray-query-ospf-if.test.js — `xray-query.js ospf-if` and the MCP tool ospf_interfaces: each OSPF interface's values, the
// two ends of a link and one short line per value that must match but does not. States come from the real FRR 8.4 and
// IOL captures (test/fixtures/frr-ospf-iface, iosxe-ospf-iface) read by the collectors, as per-node files (paired here).
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
var query = require(QUERY);

function stateDir(script, fixtures, ifs) {
  var dir = fs.mkdtempSync(path.join(os.tmpdir(), 'nx-oif-'));
  ['r1', 'r2'].forEach(function (n) {
    var peer = n === 'r1' ? 'r2' : 'r1';
    var r = cp.spawnSync(process.execPath, [path.join(ROOT, script), fixtures === 'iol' ? '--from-dir' : '--fixtures',
      path.join(ROOT, 'test', 'fixtures', fixtures === 'iol' ? 'iosxe-ospf-iface' : 'frr-ospf-iface/frr84', n), '--node', n,
      '--adj', ifs.map(function (i) { return i + ':' + peer; }).join(','), '--proto', 'ospf'], { encoding: 'utf8', timeout: 60000 });
    assert.strictEqual(r.status, 0, r.stderr);
    fs.writeFileSync(path.join(dir, 'state_' + n + '.json'), r.stdout);
  });
  return dir;
}
var DIRS = [];
test.after(function () { DIRS.forEach(function (d) { fs.rmSync(d, { recursive: true, force: true }); }); });
function frrDir() { var d = stateDir('clab-collect.js', 'frr', ['eth1', 'eth2', 'eth3']); DIRS.push(d); return d; }
function iolDir() { var d = stateDir('clab-iosxe-collect.js', 'iol', ['Ethernet0/1', 'Ethernet0/2', 'Ethernet0/3']); DIRS.push(d); return d; }

test('FRR: per-node files are paired from the links; hello / dead, area, auth and passive differences are named', function () {
  var res = query.run(['ospf-if', frrDir()]);
  assert.strictEqual(res.counts.interfaces, 6);
  assert.strictEqual(res.counts.compared, 6);
  assert.deepStrictEqual(res.mismatches, [
    'r1 eth2 hello 5 ⇔ r2 eth2 hello 10',
    'r1 eth2 dead 20 ⇔ r2 eth2 dead 40',
    'r1 eth3 area 0.0.0.0 ⇔ r2 eth3 area 0.0.0.1',
    'r1 eth3 auth simple ⇔ r2 eth3 auth none',
    'r1 eth3 passive no ⇔ r2 eth3 passive yes'
  ]);
  var r1 = res.routers[0].interfaces;
  assert.strictEqual(r1[0].interface, 'eth1');
  assert.strictEqual(r1[0].peer_interface, 'eth1');
  assert.deepStrictEqual(r1[0].mismatch, []);
  assert.strictEqual(r1[0].auth, 'md5');
});

test('IOL: the MTU 1500 / 1400 line, and one router only from its side', function () {
  var res = query.run(['ospf-if', iolDir(), 'r2']);
  assert.strictEqual(res.routers.length, 1);
  assert.ok(res.mismatches.indexOf('r2 Ethernet0/3 MTU 1400 ⇔ r1 Ethernet0/3 MTU 1500') >= 0, JSON.stringify(res.mismatches));
  assert.ok(res.mismatches.indexOf('r2 Ethernet0/3 area 1 ⇔ r1 Ethernet0/3 area 0') >= 0);
  assert.ok(!res.mismatches.some(function (m) { return /Ethernet0\/1/.test(m); }), 'Ethernet0/1 is Full: nothing to say');
});

test('table form: ! marks the differing values, ? the unknown ones, every line under 100 characters', function () {
  var t = query.runTable(['ospf-if', frrDir()], false);
  assert.match(t, /OSPF interfaces \(6\)/);
  assert.match(t, /eth2 +r2 +0\.0\.0\.0 +9500 +5! +20!/);
  assert.match(t, /Must match for an adjacency, but do not \(5\)/);
  t.split('\n').forEach(function (l) { assert.ok(l.length < 100, l); });
});

test('a state without ospf_ifaces: no rows, no lines; an unknown router is an error', function () {
  var dir = fs.mkdtempSync(path.join(os.tmpdir(), 'nx-oif-')); DIRS.push(dir);
  fs.writeFileSync(path.join(dir, 'state_r1.json'), JSON.stringify({ success: true, target_node: 'r1', interfaces: {} }));
  var res = query.run(['ospf-if', dir]);
  assert.deepStrictEqual(res.mismatches, []);
  assert.strictEqual(res.counts.interfaces, 0);
  assert.throws(function () { query.run(['ospf-if', dir, 'r9']); }, function (e) { return /unknown router: r9/.test(e.message); });
});

test('MCP ospf_interfaces answers the same object', function () {
  var dir = frrDir();
  var lines = [
    { jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-11-25', capabilities: {}, clientInfo: { name: 't', version: '0' } } },
    { jsonrpc: '2.0', method: 'notifications/initialized' },
    { jsonrpc: '2.0', id: 2, method: 'tools/call', params: { name: 'ospf_interfaces', arguments: { path: dir, router: 'r1' } } }
  ].map(function (m) { return JSON.stringify(m); }).join('\n') + '\n';
  var r = cp.spawnSync(process.execPath, [path.join(ROOT, 'scripts', 'xray-mcp.js')], { input: lines, encoding: 'utf8', timeout: 60000 });
  var out = r.stdout.trim().split('\n').map(function (l) { return JSON.parse(l); }).filter(function (m) { return m.id === 2; })[0];
  assert.ok(out && out.result && !out.result.isError, r.stdout + r.stderr);
  assert.deepStrictEqual(out.result.structuredContent, JSON.parse(JSON.stringify(query.run(['ospf-if', dir, 'r1']))));
});
