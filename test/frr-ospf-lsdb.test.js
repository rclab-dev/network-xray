// frr-ospf-lsdb.test.js — the OSPF LSDB summary read by frr-collect.js from `show ip ospf database json`.
// Run: node --test        (from the repo root; Node >= 18, no dependencies)
'use strict';
var test = require('node:test');
var assert = require('node:assert');
var fs = require('fs');
var os = require('os');
var path = require('path');
var frr = require('../frr-collect.js');

var FIX = path.join(__dirname, 'fixtures', 'frr-ospf-database');
function load(f) { return JSON.parse(fs.readFileSync(path.join(FIX, f), 'utf8')); }

var EXPECT_3R = [
  { type: 'router', ls_id: '1.1.1.1', adv_router: '1.1.1.1', age: 52, seq: '80000004', area: '0.0.0.0' },
  { type: 'router', ls_id: '2.2.2.2', adv_router: '2.2.2.2', age: 48, seq: '80000006', area: '0.0.0.0' },
  { type: 'router', ls_id: '3.3.3.3', adv_router: '3.3.3.3', age: 47, seq: '80000005', area: '0.0.0.0' },
  { type: 'network', ls_id: '10.1.0.20', adv_router: '2.2.2.2', age: 49, seq: '80000001', area: '0.0.0.0' },
  { type: 'network', ls_id: '10.2.0.30', adv_router: '3.3.3.3', age: 47, seq: '80000001', area: '0.0.0.0' }
];

test('older key style (CLI headings, advertisedRouter)', function () {
  assert.deepStrictEqual(frr.parseOspfDatabase(load('older-keys.json')), EXPECT_3R);
});

test('newer key style (camelCase, advertisingRouter, <key>Count ignored)', function () {
  assert.deepStrictEqual(frr.parseOspfDatabase(load('newer-keys.json')), EXPECT_3R);
});

test('summary, ASBR-summary and top-level AS-external LSAs', function () {
  assert.deepStrictEqual(frr.parseOspfDatabase(load('as-external.json')), [
    { type: 'summary', ls_id: '10.9.0.0', adv_router: '2.2.2.2', age: 300, seq: '80000002', area: '0.0.0.1' },
    { type: 'asbr-summary', ls_id: '4.4.4.4', adv_router: '2.2.2.2', age: 301, seq: '80000001', area: '0.0.0.1' },
    { type: 'as-external', ls_id: '192.0.2.0', adv_router: '4.4.4.4', age: 120, seq: '80000003', area: null }
  ]);
  var newer = { routerId: '1.1.1.1', areas: {},
    asExternalLinkStates: [{ lsId: '192.0.2.0', advertisingRouter: '4.4.4.4', lsaAge: 120, sequenceNumber: '80000003' }],
    asExternalLinkStatesCount: 1 };
  assert.deepStrictEqual(frr.parseOspfDatabase(newer),
    [{ type: 'as-external', ls_id: '192.0.2.0', adv_router: '4.4.4.4', age: 120, seq: '80000003', area: null }]);
});

test('only the six summary fields are kept', function () {
  frr.parseOspfDatabase(load('as-external.json')).concat(frr.parseOspfDatabase(load('newer-keys.json'))).forEach(function (r) {
    assert.deepStrictEqual(Object.keys(r), ['type', 'ls_id', 'adv_router', 'age', 'seq', 'area']);
  });
});

test('junk input gives an empty list, bad rows are skipped', function () {
  [null, undefined, 42, 'x', [], {}, { areas: null }, { areas: [] }, { areas: { '0.0.0.0': null } },
    { areas: { '0.0.0.0': { 'Router Link States': 'none' } } }, { routerLinkStates: {} }].forEach(function (j) {
    assert.deepStrictEqual(frr.parseOspfDatabase(j), [], JSON.stringify(j));
  });
  var r = frr.parseOspfDatabase(JSON.parse(JSON.stringify({ areas: { '0.0.0.0': {
    routerLinkStates: [null, 7, { lsId: '1.1.1.1' }, { advertisingRouter: '1.1.1.1' },
      { lsId: '9.9.9.9', advertisingRouter: '9.9.9.9', lsaAge: 'old' }],
    someFutureType: [{ lsId: 'y', advertisingRouter: 'y' }]
  } } }).replace('"someFutureType"', '"__proto__":[{"lsId":"x","advertisingRouter":"x"}],"constructor":[{"lsId":"c","advertisingRouter":"c"}],"someFutureType"')));
  assert.deepStrictEqual(r, [{ type: 'router', ls_id: '9.9.9.9', adv_router: '9.9.9.9', age: null, seq: '', area: '0.0.0.0' }]);
});

test('collectFromDir: bundled sample carries ospf_lsdb, existing fields unchanged', function () {
  var dir = path.join(__dirname, '..', 'fixtures', 'frr-collect-sample', 'r1');
  var st = frr.collectFromDir({ node: 'r1', fromDir: dir, proto: 'ospf', adjacency: [{ iface: 'eth0', peer: 'r2' }] }).state;
  assert.deepStrictEqual(st.ospf_lsdb, EXPECT_3R);
  assert.strictEqual(st.full_count, 1);
  assert.ok(Array.isArray(st.lsdb_prefixes) && st.lsdb_prefixes.some(function (p) { return p.text === '2.2.2.2/32'; }),
    'derived lsdb_prefixes still there');
});

test('collectFromDir: no database file -> no ospf_lsdb; bgp -> not read', function () {
  var src = path.join(__dirname, '..', 'fixtures', 'frr-collect-sample', 'r1');
  var dir = fs.mkdtempSync(path.join(os.tmpdir(), 'xray-lsdb-'));
  try {
    ['show_ip_ospf_neighbor.json', 'show_ip_ospf_interface.json', 'show_ip_route.json'].forEach(function (f) {
      fs.copyFileSync(path.join(src, f), path.join(dir, f));
    });
    var st = frr.collectFromDir({ node: 'r1', fromDir: dir, proto: 'ospf' }).state;
    assert.ok(!('ospf_lsdb' in st));
    fs.copyFileSync(path.join(src, 'show_ip_ospf_database.json'), path.join(dir, 'ospf-database.json'));
    assert.strictEqual(frr.collectFromDir({ node: 'r1', fromDir: dir, proto: 'ospf' }).state.ospf_lsdb.length, 5, 'alt file name');
    assert.ok(!('ospf_lsdb' in frr.collectFromDir({ node: 'r1', fromDir: dir, proto: 'bgp' }).state));
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('real capture: FRR 8.4 (camelCase keys with advertisedRouter) gives one row per LSA', function () {
  assert.deepStrictEqual(frr.parseOspfDatabase(load('frr-8.4-captured.json')), [
    { type: 'router', ls_id: '2.2.2.2', adv_router: '2.2.2.2', age: 8, seq: '80000004', area: '0.0.0.0' },
    { type: 'router', ls_id: '10.10.0.10', adv_router: '10.10.0.10', age: 7, seq: '80000003', area: '0.0.0.0' },
    { type: 'network', ls_id: '10.10.0.10', adv_router: '10.10.0.10', age: 7, seq: '80000001', area: '0.0.0.0' }
  ]);
});

test('the area is kept (the same LSA in two areas = two rows) and a missing age is null, not 0', function () {
  var L = function (age) { var o = { lsId: '2.2.2.2', advertisedRouter: '2.2.2.2', sequenceNumber: '80000001' }; if (age !== undefined) o.lsaAge = age; return o; };
  var r = frr.parseOspfDatabase({ areas: { '0.0.0.0': { routerLinkStates: [L(5)] }, '0.0.0.1': { routerLinkStates: [L()] } } });
  assert.deepStrictEqual(r.map(function (x) { return [x.area, x.age]; }), [['0.0.0.0', 5], ['0.0.0.1', null]]);
  [null, ''].forEach(function (v) {
    assert.strictEqual(frr.parseOspfDatabase({ areas: { '0.0.0.0': { routerLinkStates: [L(v)] } } })[0].age, null, JSON.stringify(v));
  });
});
