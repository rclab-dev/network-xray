// states-schema.test.js - the collected state matches docs/dev/states-schema.json (scripts/validate-states.js).
// Run: node --test        (from the repo root; Node >= 18, no dependencies)
'use strict';
var test = require('node:test');
var assert = require('node:assert');
var fs = require('fs');
var os = require('os');
var path = require('path');
var cp = require('child_process');

var ROOT = path.join(__dirname, '..');
var V = require(path.join(ROOT, 'scripts', 'validate-states.js'));
var CLI = path.join(ROOT, 'scripts', 'validate-states.js');
var schema = V.loadSchema();

function router(st) { return V.validateStates({ kind: 'router', data: JSON.parse(JSON.stringify(st)) }, schema); }
function assertValid(st, what) {
  var errs = router(st);
  assert.deepStrictEqual(errs, [], what + ': ' + errs.map(function (e) { return e.path + ' ' + e.message; }).join('; '));
}
function tmpDir() { return fs.mkdtempSync(path.join(os.tmpdir(), 'nx-schema-')); }
function runNode(args) {
  var r = cp.spawnSync(process.execPath, args, { cwd: ROOT, encoding: 'utf8', timeout: 60000 });
  assert.strictEqual(r.status, 0, args.join(' ') + '\n' + r.stdout + r.stderr);
  return r;
}

test('schema: is JSON, draft 2020-12, uses only the keywords the validator checks', function () {
  assert.strictEqual(schema.$schema, 'https://json-schema.org/draft/2020-12/schema');
  assert.ok(schema.$defs.routerState);
  // validating anything walks the whole routerState schema; an unknown keyword would throw
  assert.doesNotThrow(function () { V.validate(schema, {}, schema); router({ target_node: 'x', interfaces: {} }); });
});

test('fixtures: every test/fixtures/*/state_*.json is a valid router state', function () {
  var dir = path.join(ROOT, 'test', 'fixtures'), n = 0;
  fs.readdirSync(dir).forEach(function (d) {
    var D = path.join(dir, d);
    if (!fs.statSync(D).isDirectory()) return;
    fs.readdirSync(D).filter(function (f) { return /^state_.*\.json$/.test(f); }).forEach(function (f) {
      assertValid(JSON.parse(fs.readFileSync(path.join(D, f), 'utf8')), d + '/' + f); n++;
    });
  });
  assert.ok(n >= 9, 'state fixtures found: ' + n);
});

test('fresh: FRR (frr-collect.js --from-dir on the bundled sample)', function () {
  var out = path.join(tmpDir(), 'state_r1.json');
  runNode(['frr-collect.js', '--node', 'r1', '--from-dir', 'fixtures/frr-collect-sample/r1', '--adj', 'eth0:r2', '--proto', 'ospf', '--out', out]);
  var st = JSON.parse(fs.readFileSync(out, 'utf8'));
  assert.strictEqual(st.target_node, 'r1');
  assertValid(st, 'frr r1');
  assert.strictEqual(cp.spawnSync(process.execPath, [CLI, out], { encoding: 'utf8' }).status, 0);
});

test('fresh: SR Linux (clab-srl-collect.js buildState on the bundled capture, as its self-test does)', function () {
  var srl = require(path.join(ROOT, 'clab-srl-collect.js'));
  var st = srl.buildState(srl.dirFetch(path.join(ROOT, 'fixtures', 'srl-collect-sample', 'r1')), 'r1', { 'ethernet-1/1.0': 'r2' }, 'ospf');
  assert.strictEqual(st.nos, 'srlinux');
  assertValid(st, 'srl r1');
});

test('fresh: IOS-XE (clab-iosxe-collect.js --from-dir on the self-test captures)', function () {
  var d = tmpDir();
  [['iosxe-q15', 'r1', 'Ethernet0/1:r2', 'bgp'], ['iosxe-q15', 'r2', 'Ethernet0/1:r1,Ethernet0/2:r3', 'bgp'],
   ['iosxe-q15', 'r3', 'Ethernet0/1:r2', 'bgp'], ['iosxe-unnumbered', 'dut', 'Ethernet0/1:x1', 'ospf']].forEach(function (c) {
    var out = path.join(d, c[0] + '-' + c[1] + '.json');
    runNode(['clab-iosxe-collect.js', '--from-dir', path.join('test', 'fixtures', c[0], c[1]), '--node', c[1], '--adj', c[2], '--proto', c[3], '--out', out]);
    var st = JSON.parse(fs.readFileSync(out, 'utf8'));
    assert.strictEqual(st.nos, 'ios-xe');
    assertValid(st, c[0] + ' ' + c[1]);
  });
});

test('fresh: xray-states.js (window.LIVE_STATES) from scale-bench, OSPF and BGP, through the CLI', function () {
  var bench = require(path.join(ROOT, 'scripts', 'scale-bench.js'));
  ['ospf', 'bgp'].forEach(function (proto) {
    var d = tmpDir(), f = path.join(d, 'xray-states.js');
    fs.writeFileSync(f, bench.runBench(6, { proto: proto, iterations: 1 }).text + 'window.LIVE_WATCH = true;\n');
    var parsed = V.parseStates(fs.readFileSync(f, 'utf8'), f);
    assert.strictEqual(parsed.kind, 'map');
    assert.strictEqual(Object.keys(parsed.data).length, 6);
    assert.deepStrictEqual(V.validateStates(parsed, schema), [], proto);
    var r = cp.spawnSync(process.execPath, [CLI, d], { encoding: 'utf8' });
    assert.strictEqual(r.status, 0, r.stdout + r.stderr);
    assert.match(r.stdout, /ok +.*xray-states\.js \(6 routers\)/);
  });
});

test('unread router entry (clab-xray-collect.js) is valid', function () {
  assertValid({ success: false, target_node: 'r9', nx_unread: 'stopped', interfaces: {} }, 'unread');
});

test('rejects: wrong shapes are reported with a path', function () {
  var good = JSON.parse(fs.readFileSync(path.join(ROOT, 'test', 'fixtures', 'iosxe-q15', 'state_r1.json'), 'utf8'));
  function errsOf(mut) { var s = JSON.parse(JSON.stringify(good)); mut(s); return router(s).map(function (e) { return e.path + ' ' + e.message; }); }
  assert.deepStrictEqual(errsOf(function (s) { delete s.target_node; }), ['/ missing required property "target_node"']);
  assert.deepStrictEqual(errsOf(function (s) { s.interfaces['Ethernet0/1'].up = 'yes'; }), ['/interfaces/Ethernet0~11/up expected boolean, got string']);
  assert.deepStrictEqual(errsOf(function (s) { s.r2_has_full = 1; }), ['/r2_has_full expected boolean, got integer']);
  assert.deepStrictEqual(errsOf(function (s) { s.full_count = -1; }), ['/full_count expected >= 0, got -1']);
  assert.deepStrictEqual(errsOf(function (s) { s.routing_table[0].selected = null; }), ['/routing_table/0/selected expected boolean, got null']);
  assert.deepStrictEqual(errsOf(function (s) { s.nx_unread = 'gone'; }), ['/nx_unread expected one of ["stopped","device","timeout","error"], got "gone"']);
  // a map: each value is a router
  assert.deepStrictEqual(V.validateStates({ kind: 'map', data: { r1: { target_node: 'r1' } } }, schema).map(function (e) { return e.path + ' ' + e.message; }),
    ['/r1 missing required property "interfaces"']);
  // unknown keys stay allowed (the format is open)
  assert.deepStrictEqual(errsOf(function (s) { s.some_new_field = { a: 1 }; }), []);
});

test('validator: an unsupported schema keyword is an error, not silently ignored', function () {
  assert.throws(function () { V.validate({ type: 'string', pattern: '^a' }, 'b'); }, /unsupported schema keyword "pattern"/);
});

test('CLI: exit 1 with the error on a bad file, 2 on usage / unreadable input', function () {
  var d = tmpDir(), f = path.join(d, 'state_r1.json');
  fs.writeFileSync(f, JSON.stringify({ target_node: 'r1', interfaces: { eth1: { up: true } } }));
  var r = cp.spawnSync(process.execPath, [CLI, f], { encoding: 'utf8' });
  assert.strictEqual(r.status, 1);
  assert.match(r.stdout, /FAIL .*state_r1\.json\n  \/interfaces\/eth1: missing required property "ip"/);
  assert.strictEqual(cp.spawnSync(process.execPath, [CLI], { encoding: 'utf8' }).status, 2);
  fs.writeFileSync(f, '{not json');
  assert.strictEqual(cp.spawnSync(process.execPath, [CLI, f], { encoding: 'utf8' }).status, 2);
});

// nx_schema_walk / nx_schema_kind (2026-11-03): the whole schema is checked, not only the branches the data visits;
// a map with a node named target_node is still a map
test('schema check: an unsupported keyword in an unused $defs entry is reported', function () {
  var s = JSON.parse(JSON.stringify(V.loadSchema()));
  s.$defs = s.$defs || {}; s.$defs.unusedForTest = { type: 'string', format: 'ipv4' };
  assert.throws(function () { V.validate(s, {}); }, /unsupported schema keyword "format"/);
});
test('schema check: an unsupported keyword under a property the data does not have is reported', function () {
  var s = JSON.parse(JSON.stringify(V.loadSchema()));
  var rs = s.$defs.routerState, k = Object.keys(rs.properties).filter(function (n) { return n !== 'target_node'; })[0];
  rs.properties[k] = { type: 'string', minLength: 1 };
  assert.throws(function () { V.validateStates({ kind: 'router', data: { target_node: 'r1' } }, s); }, /unsupported schema keyword "minLength"/);
});
test('parseStates: a map with a node named target_node is a map; one router (target_node is text) is a router', function () {
  assert.strictEqual(V.parseStates(JSON.stringify({ r1: { target_node: 'r1' }, target_node: { target_node: 'target_node' } }), 'm.json').kind, 'map');
  assert.strictEqual(V.parseStates(JSON.stringify({ target_node: 'r1' }), 'r.json').kind, 'router');
});
