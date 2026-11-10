// ospf-mismatch4.test.js — the four OSPF interface mismatches that stop or break an adjacency (MTU, Hello / Dead, network
// type, authentication), one per link, on real FRR 8.4 and Cisco IOL captures (test/fixtures/ospf-mismatch4): each end
// names the field, xray-query ospf-if gives one line per value, and the network-type link is Full but still a mismatch.
// Run: node --test        (from the repo root; Node >= 18, no dependencies)
'use strict';
var test = require('node:test');
var assert = require('node:assert');
var path = require('path');
var cp = require('child_process');

var ROOT = path.join(__dirname, '..');
var collect = require(path.join(ROOT, 'clab-collect.js'));
var query = require(path.join(ROOT, 'scripts', 'xray-query.js'));
var FIX = path.join(ROOT, 'test', 'fixtures', 'ospf-mismatch4');

function node(script, args) {
  var r = cp.spawnSync(process.execPath, [path.join(ROOT, script)].concat(args), { cwd: ROOT, encoding: 'utf8', timeout: 60000 });
  assert.strictEqual(r.status, 0, r.stderr);
  return JSON.parse(r.stdout);
}
// both routers read from the capture, then the ends paired the way clab-xray-collect.js pairs them
function lab(kind) {
  var ifs = kind === 'frr' ? ['eth1', 'eth2', 'eth3', 'eth4'] : ['Ethernet0/1', 'Ethernet0/2', 'Ethernet0/3', 'Ethernet1/0'];
  var states = {}, adj = {};
  ['r1', 'r2'].forEach(function (n) {
    var peer = n === 'r1' ? 'r2' : 'r1', a = ifs.map(function (i) { return i + ':' + peer; }).join(',');
    states[n] = kind === 'frr'
      ? node('clab-collect.js', ['--fixtures', path.join(FIX, 'frr84', n), '--node', n, '--adj', a, '--proto', 'ospf'])
      : node('clab-iosxe-collect.js', ['--from-dir', path.join(FIX, 'iol', n), '--node', n, '--adj', a, '--proto', 'ospf']);
    adj[n] = ifs.map(function (i) { return { iface: i, peer: peer, peerIface: i }; });
  });
  collect.pairOspfIfaces(states, adj);
  return { states: states, ifs: ifs };
}

[['frr', 'FRR 8.4', 9500], ['iol', 'Cisco IOL 17.18.02', 1500]].forEach(function (k) {
  var kind = k[0], mtu = k[2];
  test(k[1] + ': each link names its one mismatch, on both ends', function () {
    var L = lab(kind), i = L.ifs;
    ['r1', 'r2'].forEach(function (n) {
      var o = L.states[n].ospf_ifaces;
      assert.deepStrictEqual(o[i[0]].mismatch, ['mtu'], n + ' ' + i[0]);
      assert.deepStrictEqual(o[i[1]].mismatch, ['hello', 'dead'], n + ' ' + i[1]);
      assert.deepStrictEqual(o[i[2]].mismatch, ['network_type'], n + ' ' + i[2]);
      assert.deepStrictEqual(o[i[3]].mismatch, ['auth'], n + ' ' + i[3]);
    });
    assert.strictEqual(L.states.r1.ospf_ifaces[i[0]].mtu, mtu);
    assert.strictEqual(L.states.r2.ospf_ifaces[i[0]].mtu, 1400);
  });
  test(k[1] + ': the network-type link is adjacent (Full) and still a mismatch; the MTU link stops in Exchange', function () {
    var L = lab(kind), i = L.ifs, r1 = L.states.r1;
    assert.strictEqual(r1.ospf_ifaces[i[2]].neighbors_adjacent, 1);
    assert.strictEqual(r1.ospf_ifaces[i[2]].network_type, 'point-to-point');
    assert.strictEqual(r1.ospf_ifaces[i[2]].remote.network_type, 'broadcast');
    var st = function (ifn) { return (r1.ospf_neighbors || []).filter(function (x) { return x.iface === ifn; }).map(function (x) { return x.state; })[0]; };
    assert.match(String(st(i[2])), /^full/i);
    assert.match(String(st(i[0])), /^exchange/i);
    assert.strictEqual(st(i[1]), undefined, 'hello / dead differ: not listed');
    assert.strictEqual(st(i[3]), undefined, 'authentication differs: not listed');
  });
  test(k[1] + ': xray-query ospf-if gives the five lines', function () {
    var L = lab(kind), i = L.ifs;
    var res = query.ospfInterfaces(JSON.parse(JSON.stringify(L.states)));
    assert.deepStrictEqual(res.mismatches, [
      'r1 ' + i[0] + ' MTU ' + mtu + ' ⇔ r2 ' + i[0] + ' MTU 1400',
      'r1 ' + i[1] + ' hello 5 ⇔ r2 ' + i[1] + ' hello 10',
      'r1 ' + i[1] + ' dead 20 ⇔ r2 ' + i[1] + ' dead 40',
      'r1 ' + i[2] + ' network type point-to-point ⇔ r2 ' + i[2] + ' network type broadcast',
      'r1 ' + i[3] + ' auth md5 ⇔ r2 ' + i[3] + ' auth none'
    ]);
  });
});
