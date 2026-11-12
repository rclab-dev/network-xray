// xray-diff.test.js - what changed between a baseline and now (xray-diff.js, xray-query.js diff, MCP state_diff).
// The pairs are real recordings: demo/bgp-lp (q21, one Local Preference changed on r1) and demo/frame* (the OSPF
// triangle, r1-r2 cut and restored). Run: node --test   (from the repo root; Node >= 18, no dependencies)
'use strict';
var test = require('node:test');
var assert = require('node:assert');
var fs = require('fs');
var path = require('path');
var cp = require('child_process');

var ROOT = path.join(__dirname, '..');
var xd = require(path.join(ROOT, 'xray-diff.js'));
var query = require(path.join(ROOT, 'scripts', 'xray-query.js'));
function load(rel) { return JSON.parse(fs.readFileSync(path.join(ROOT, rel), 'utf8')); }
function clone(o) { return JSON.parse(JSON.stringify(o)); }
function kinds(d) { return d.changes.map(function (c) { return c.kind; }); }

test('one Local Preference changed on r1 (q21): the best path that moved comes first, with the router\'s reason', function () {
  var d = xd.diffStates(load('demo/bgp-lp/frameA.json'), load('demo/bgp-lp/frameB.json'));
  assert.deepStrictEqual(kinds(d), ['best_path_changed', 'route_changed']);
  var c = d.changes[0];
  assert.deepStrictEqual([c.node, c.item, c.before, c.after, c.reason], ['r1', '8.8.8.0/24', 'via 10.11.0.20', 'via 10.10.0.20', 'Local Pref']);
  assert.deepStrictEqual(d.unchanged, ['r2', 'r3']);
  assert.strictEqual(d.none, false);
});

test('a link cut (OSPF triangle): interfaces down, then adjacencies lost, then routes removed, each with the router it came from', function () {
  var d = xd.diffStates(load('demo/frameA.json'), load('demo/frameB.json'));
  var k = kinds(d), first = function (x) { return k.indexOf(x); }, last = function (x) { return k.lastIndexOf(x); };
  assert.ok(last('iface_down') < first('ospf_adjacency_lost') && last('ospf_adjacency_lost') < first('route_removed'), k.join(','));
  assert.deepStrictEqual(d.changes.filter(function (c) { return c.kind === 'iface_down'; }).map(function (c) { return c.node + ' ' + c.item; }), ['r1 eth1', 'r2 eth1']);
  var lo = d.changes.filter(function (c) { return c.kind === 'route_removed' && c.item === '3.3.3.3/32' && c.node === 'r1'; })[0];
  assert.deepStrictEqual(lo.originated_by, ['r3'], 'a loopback prefix names the one router that has it');
  // restored: the same things come back, after anything that broke (nothing broke here)
  var back = xd.diffStates(load('demo/frameB.json'), load('demo/frameD.json'));
  assert.ok(kinds(back).every(function (x) { return /_up$|_new$|_added$/.test(x); }), kinds(back).join(','));
  var added = back.changes.filter(function (c) { return c.kind === 'route_added' && c.item === '2.2.2.2/32'; })[0];
  assert.deepStrictEqual(added.originated_by, ['r2'], 'a prefix new in the later state is found there');
});

test('nothing changed: none, no changes, every router unchanged', function () {
  var a = load('demo/frameA.json');
  var d = xd.diffStates(a, clone(a));
  assert.strictEqual(d.none, true);
  assert.deepStrictEqual(d.changes, []);
  assert.deepStrictEqual(d.unchanged, Object.keys(a).sort());
});

test('what moves by itself is not compared: uptimes, prefix counts, timestamps, the management network', function () {
  var a = load('demo/bgp-lp/frameA.json'), b = clone(a);
  b.r1.bgp_neighbors.forEach(function (n) { n.up_down = '01:02:03'; n.pfx_rcvd = 7; });
  b.r1.collected_at = 'later'; b.r1._sig = 99;
  b.r1.interfaces = Object.assign({}, b.r1.interfaces, { eth0: { up: false, ip: '172.20.20.3/24' } });
  a.r1.interfaces = Object.assign({}, a.r1.interfaces, { eth0: { up: true, ip: '172.20.20.3/24' } });
  b.r1.routing_table = (b.r1.routing_table || []).concat([{ prefix: '0.0.0.0/0', next_hop: '172.20.20.1', out_iface: 'eth0', protocol: 'kernel', selected: true }]);
  var d = xd.diffStates(a, b);
  assert.strictEqual(d.none, true, JSON.stringify(d.changes));
});

test('an OSPF interface value both ends must share, an interface leaving OSPF, a BGP session down, a router gone', function () {
  var a = load('demo/frameA.json'), b = clone(a);
  a.r1.ospf_ifaces = { eth1: { area: '0.0.0.0', hello: 10, dead: 40, mtu: 1500 }, eth2: { area: '0.0.0.0', hello: 10, dead: 40, mtu: 1500 } };
  b.r1.ospf_ifaces = { eth1: { area: '0.0.0.0', hello: 5, dead: 40, mtu: null } };   // mtu not reported now: not compared
  a.r2.bgp_neighbors = [{ ip: '10.0.0.9', state: 'Established' }]; b.r2.bgp_neighbors = [{ ip: '10.0.0.9', state: 'Active' }];
  delete b.r3;
  var d = xd.diffStates(a, b);
  assert.deepStrictEqual(d.changes.slice(0, 4).map(function (c) { return c.kind + ' ' + c.node + ' ' + c.item; }),
    ['node_removed r3 r3', 'ospf_if_left r1 eth2', 'ospf_if_value r1 eth1 hello', 'bgp_session_down r2 10.0.0.9']);
  var h = d.changes[2];
  assert.deepStrictEqual([h.before, h.after], [10, 5]);
  assert.ok(!d.changes.some(function (c) { return /mtu/.test(c.item); }), 'a value one side did not report is not compared');
});

test('a next hop now resolved through the management network (B06, real FRR 10.7.1) comes first and says so', function () {
  var d = xd.diffStates(load('test/fixtures/frr-recursive-b06/before.json'), load('test/fixtures/frr-recursive-b06/after.json'));
  var c = d.changes[0];
  assert.deepStrictEqual([c.kind, c.node, c.item, c.via_mgmt], ['route_changed', 'r3', '198.51.100.0/24', true]);
  assert.match(c.after, /resolved via 172.20.20.1 on eth0, management network/);
  assert.ok(kinds(d).slice(1).every(function (k) { return k === 'best_path_changed'; }), kinds(d).join(','));
});

test('ECMP: one of two next hops gone is a change (every next hop is compared, not only the first)', function () {
  var row = function (nhs) { return { prefix: '10.9.9.0/24', protocol: 'ospf', selected: true, next_hop: nhs[0].ip, out_iface: nhs[0].iface, nexthops: nhs }; };
  var a = { r1: { routing_table: [row([{ ip: '10.0.12.2', iface: 'eth1' }, { ip: '10.0.13.3', iface: 'eth2' }])] } };
  var b = { r1: { routing_table: [row([{ ip: '10.0.12.2', iface: 'eth1' }])] } };
  var d = xd.diffStates(a, b);
  assert.deepStrictEqual(kinds(d), ['route_changed']);
  assert.match(d.changes[0].before, /10.0.13.3 on eth2/);
});

test('causes come before what they broke: an OSPF interface value before the adjacency it took down', function () {
  var a = load('demo/frameA.json'), b = clone(a);
  a.r1.ospf_ifaces = { eth1: { hello: 10 } }; b.r1.ospf_ifaces = { eth1: { hello: 5 } };
  b.r1.ospf_neighbors = (b.r1.ospf_neighbors || []).filter(function (x) { return x.iface !== 'eth1'; });
  var k = kinds(xd.diffStates(a, b));
  assert.ok(k.indexOf('ospf_if_value') >= 0 && k.indexOf('ospf_if_value') < k.indexOf('ospf_adjacency_lost'), k.join(','));
});

test('xray-query diff: the same answer, one router, a note when nothing changed, an unknown router is an error', function () {
  var a = 'demo/frameA.json', b = 'demo/frameB.json';
  var r = query.run(['diff', path.join(ROOT, a), path.join(ROOT, b), 'r3']);
  assert.ok(r.changes.length && r.changes.every(function (c) { return c.node === 'r3'; }));
  var same = query.run(['diff', path.join(ROOT, a), path.join(ROOT, a)]);
  assert.strictEqual(same.none, true);
  assert.strictEqual(same.note, 'no change from the baseline');
  assert.throws(function () { query.run(['diff', path.join(ROOT, a), path.join(ROOT, b), 'zz']); }, function (e) { return /unknown node: zz/.test(e.message); });
  var t = cp.spawnSync(process.execPath, [path.join(ROOT, 'scripts', 'xray-query.js'), 'diff', a, a, '--format', 'table'], { cwd: ROOT, encoding: 'utf8' });
  assert.strictEqual(t.status, 0, t.stderr);
  assert.match(t.stdout, /^Changed from the baseline \(0\)\n {2}\(none\)/);
  assert.ok(t.stdout.split('\n').every(function (l) { return l.length < 100; }), 'lines stay under 100 characters');
});

test('MCP state_diff: read-only, one of the default tools, the same answer as xray-query diff', async function () {
  var mcp = require(path.join(ROOT, 'scripts', 'xray-mcp.js'));
  var t = mcp.TOOLS.filter(function (x) { return x.name === 'state_diff'; })[0];
  assert.ok(t, 'listed by default');
  assert.strictEqual(t.annotations.readOnlyHint, true);
  assert.deepStrictEqual(t.inputSchema.required, ['before', 'after']);
  var args = { before: path.join(ROOT, 'demo/bgp-lp/frameA.json'), after: path.join(ROOT, 'demo/bgp-lp/frameB.json') };
  var r = await mcp.handle({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'state_diff', arguments: args } });
  assert.ok(!r.result.isError, JSON.stringify(r));
  assert.deepStrictEqual(r.result.structuredContent, query.run(['diff', args.before, args.after]));
});

test('xray-diff.js runs in the page too (no require, no fs)', function () {
  var src = fs.readFileSync(path.join(ROOT, 'xray-diff.js'), 'utf8');
  assert.ok(!/\brequire\s*\(/.test(src), 'no require');
  var win = {}; new Function('window', src)(win);
  assert.strictEqual(typeof win.xrayDiff.diffStates, 'function');
});
