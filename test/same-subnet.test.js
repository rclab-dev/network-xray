'use strict';
const test = require('node:test');
const assert = require('node:assert');
const path = require('path');
const C = require(path.join(__dirname, '..', 'clab-collect.js'));

// the previous implementation, kept as the reference for the same answers on every input
function reference(prefix, ip) {
  if (!prefix || !ip) return false;
  var _pl = parseInt(String(prefix).split('/')[1], 10);
  var _ip4 = function (s) { var o = String(s).split('/')[0].split('.').map(Number); return o.length === 4 && o.every(function (x) { return x >= 0 && x <= 255; }) ? ((o[0] * 16777216) + (o[1] << 16) + (o[2] << 8) + o[3]) : null; };
  var _a = _ip4(prefix), _b = _ip4(ip);
  if (!isNaN(_pl) && _pl >= 0 && _pl <= 32 && _a !== null && _b !== null) {
    var _sz = Math.pow(2, 32 - _pl);
    return Math.floor(_a / _sz) === Math.floor(_b / _sz);
  }
  var net = prefix.split('/')[0].split('.').slice(0, 3).join('.');
  return ip.split('.').slice(0, 3).join('.') === net;
}
function outcome(fn, p, i) { try { return { v: fn(p, i) }; } catch (e) { return { err: e.constructor.name }; } }

test('_sameSubnet: prefix length is honored', () => {
  assert.strictEqual(C._sameSubnet('10.1.2.0/30', '10.1.2.1'), true);
  assert.strictEqual(C._sameSubnet('10.1.2.0/30', '10.1.2.5'), false);
  assert.strictEqual(C._sameSubnet('172.20.20.0/24', '172.20.20.9'), true);
  assert.strictEqual(C._sameSubnet('0.0.0.0/0', '8.8.8.8'), true);
  assert.strictEqual(C._sameSubnet('198.51.100.0', '198.51.100.7'), true);   // no length -> first 3 octets
  assert.strictEqual(C._sameSubnet('', '1.2.3.4'), false);
});

test('_sameSubnet: same answers as the previous implementation', () => {
  const P = ['172.20.20.0/24', '10.0.0.0/8', '0.0.0.0/0', '1.2.3.4/32', '10.1.2.0/30', '198.51.100.0', 'fe80::/64',
    '1..2.3/24', '256.1.1.1/24', ' 1.2.3.4/24', '0x1.2.3.4/16', '1e2.0.0.0/8', '1.2.3/24', '1.2.3.4.5/24', '10.1.2.0/abc',
    '10.1.2.0/33', '10.1.2.0/-1', '', null, undefined, 5, 'a.b.c.d/24', '-0.1.2.3/8', '1.2.3.4.'];
  const I = ['172.20.20.5', '10.1.2.1', '10.1.2.5', '1.2.3.4', '198.51.100.7', 'fe80::1', '0.0.0.0', '255.255.255.255',
    '1..2.3', ' 1.2.3.4', '0x1.2.3.4', '1.2.3', '10.1.2.3/30', 'abc', '', null, undefined, '-0.1.2.3', '1.2.3.4.5'];
  for (const p of P) for (const i of I) assert.deepStrictEqual(outcome(C._sameSubnet, p, i), outcome(reference, p, i), JSON.stringify([p, i]));
  for (let k = 0; k < 20000; k++) {
    const p = (k % 7) + '.' + (k % 300) + '.' + (k % 13) + '.' + (k % 260) + '/' + (k % 35);
    const i = (k % 5) + '.' + (k % 257) + '.' + (k % 11) + '.' + (k % 9);
    assert.strictEqual(C._sameSubnet(p, i), reference(p, i), p + ' ' + i);
  }
});

test('graph-bench runs on a small lab', () => {
  const G = require(path.join(__dirname, '..', 'scripts', 'dev', 'graph-bench.js'));
  for (const proto of ['ospf', 'bgp']) {
    const row = G.runGraphBench(6, { proto, iterations: 1 });
    assert.strictEqual(row.routers, 6);
    assert.ok(row.load_ms >= 0 && row.topo_ms >= 0 && row.views_all_ms >= 0 && row.diff_same_ms >= 0);
  }
});
