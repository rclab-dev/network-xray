'use strict';
/* Edge cases for netlab-validate.js: unusual or malformed lab files and router output must never throw and never
   produce a false "pass". Router output is fed through a stub of child_process.execFile (no docker is run). */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const cp = require('child_process');
const nv = require('../netlab-validate.js');

/* ---- stubbed router: answers[`${container}|${command}`] or answers[command] = JSON value, Error, or raw string ---- */
let answers = {}, calls = [];
const realExecFile = cp.execFile;
cp.execFile = function (file, args, opts, cb) {
  const container = args[1], cmd = String(args[4]).replace(/^show /, '');
  calls.push(container + '|' + cmd);
  const key = has(answers, container + '|' + cmd) ? container + '|' + cmd : cmd;
  const a = has(answers, key) ? answers[key] : new Error('no such command in the stub');
  setImmediate(function () {
    if (a instanceof Error) return cb(a);
    cb(null, typeof a === 'string' && a.startsWith('RAW:') ? a.slice(4) : JSON.stringify(a));
  });
};
test.after(function () { cp.execFile = realExecFile; });
function has(o, k) { return Object.prototype.hasOwnProperty.call(o, k); }

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'nx-validate-'));
let seq = 0;
function writeLab(content) {
  const f = path.join(dir, 'lab' + (seq++) + '.json');
  fs.writeFileSync(f, typeof content === 'string' ? content : JSON.stringify(content));
  return f;
}
function loadLab(topo) {
  const lab = nv.load(writeLab(topo));
  lab.started = lab.mtime = 0;   /* long after the lab start: no convergence / wait: hold-off */
  return lab;
}
function runLab(lab, rtr) {
  answers = rtr || {}; calls = [];
  return new Promise(function (resolve) { nv.run(lab, 'clab-t-', resolve); });
}
async function judge(topo, rtr) { return runLab(loadLab(topo), rtr); }

const NODES = {
  r1: { device: 'frr', bgp: { neighbors: [{ name: 'r2', ipv4: '10.1.0.2' }], originate: ['10.0.0.1/24'] } },
  r2: { device: 'frr', bgp: { neighbors: [{ name: 'r1', ipv4: '10.1.0.1' }] } },
  e1: { device: 'eos', bgp: { neighbors: [{ name: 'r1', ipv4: '10.1.0.1' }] } }
};
const NGB = "bgp_neighbor(node.bgp.neighbors, 'r2')";
const SUMMARY = 'bgp vrf default summary json';
const UP = { ipv4Unicast: { peers: { '10.1.0.2': { state: 'Established', peerUptimeMsec: 600000 } } } };
function topo(validate, nodes) { return { name: 't', nodes: nodes || NODES, validate: validate }; }
function statuses(res) { return res.tests.map(function (t) { return t.status; }); }
function assertNoPass(res) {
  assert.strictEqual(res.counts.pass, 0, 'unexpected pass: ' + JSON.stringify(res.tests));
  res.tests.forEach(function (t) { assert.notStrictEqual(t.status, 'pass', t.name + ': ' + t.message); });
}

/* ---------- sanity: the stub works and valid input is still judged ---------- */
test('a valid bgp_neighbor test still passes and fails as before', async function () {
  let res = await judge(topo([{ name: 'ok', nodes: ['r1'], plugin: NGB }]), { [SUMMARY]: UP });
  assert.deepStrictEqual(statuses(res), ['pass']);
  res = await judge(topo([{ name: 'idle', nodes: ['r1'], plugin: NGB }]),
    { [SUMMARY]: { ipv4Unicast: { peers: { '10.1.0.2': { state: 'Idle' } } } } });
  assert.deepStrictEqual(statuses(res), ['fail']);
  assert.match(res.tests[0].message, /is in state Idle/);
});

/* ---------- no tests / empty / odd validate sections ---------- */
test('no validate section, an empty list or an empty dict -> no tests, nothing checked', async function () {
  for (const v of [undefined, [], {}, null]) {
    const res = await judge(topo(v));
    assert.strictEqual(res.tests.length, 0, JSON.stringify(v));
    assert.strictEqual(res.counts.total, 0);
    assert.strictEqual(res.counts.checked, 0);
  }
});

test('validate as a string, number or boolean -> no tests (not one test per character)', async function () {
  for (const v of ['abc', 42, true]) {
    const res = await judge(topo(v));
    assert.strictEqual(res.tests.length, 0, JSON.stringify(v));
    assert.strictEqual(res.counts.checked, 0);
  }
});

test('list entries that are null, strings, numbers or lists -> not checked, no throw', async function () {
  const res = await judge(topo([null, 'x1', 7, [NGB], { name: 'real', nodes: ['r1'], plugin: NGB }]), { [SUMMARY]: UP });
  assert.deepStrictEqual(statuses(res), ['unsupported', 'unsupported', 'unsupported', 'unsupported', 'pass']);
  res.tests.forEach(function (t) { assert.strictEqual(typeof t.name, 'string'); });
});

test('dict-form validate with null / string / list values -> not checked', async function () {
  const res = await judge(topo({ a: null, b: 'text', c: [1, 2] }));
  assert.deepStrictEqual(res.tests.map(function (t) { return [t.name, t.status]; }),
    [['a', 'unsupported'], ['b', 'unsupported'], ['c', 'unsupported']]);
  assert.strictEqual(calls.length, 0);
});

test('a lab file that is null, a list or a string loads without throwing', async function () {
  for (const content of ['null', '[]', '"lab"', '0']) {
    const lab = nv.load(writeLab(content));
    assert.deepStrictEqual(lab.tests, [], content);
    const res = await runLab(lab);
    assert.strictEqual(res.counts.total, 0);
  }
});

test('run() with a hand-made lab missing tests / nodes does not throw', async function () {
  let res = await runLab({});
  assert.strictEqual(res.counts.total, 0);
  res = await runLab({ tests: [{ name: 'x', nodes: ['r1'], plugin: NGB }] });
  assertNoPass(res);
});

/* ---------- unknown or unreadable test types ---------- */
test('unknown test types stay "not checked"', async function () {
  const res = await judge(topo([
    { name: 'ospf', nodes: ['r1'], plugin: "ospf_neighbor(nodes.r2.ospf.router_id)" },
    { name: 'show', nodes: ['r1'], show: { frr: 'ip route json' }, valid: { frr: 'True' } },
    { name: 'exec', nodes: ['r1'], exec: 'ping 10.0.0.1' },
    { name: 'suzieq', nodes: ['r1'], suzieq: { show: 'bgp' } },
    { name: 'none', nodes: ['r1'] },
    { name: 'ping', nodes: ['r1'], plugin: "ping('10.0.0.1')" }
  ]));
  assert.deepStrictEqual(statuses(res), Array(6).fill('unsupported'));
  assert.strictEqual(calls.length, 0);
});

test('plugin names that are Object.prototype members are unknown, not crashes or fails', async function () {
  const res = await judge(topo(['__proto__', 'constructor', 'toString', 'hasOwnProperty', 'valueOf'].map(function (fn) {
    return { name: fn, nodes: ['r1'], plugin: fn + "('10.0.0.0/24')" };
  })));
  assert.deepStrictEqual(statuses(res), Array(5).fill('unsupported'));
  assert.strictEqual(calls.length, 0);
});

test('plugin that is not a string or cannot be parsed -> not checked', async function () {
  const res = await judge(topo([null, 123, {}, [], true, 'bgp_neighbor(', "bgp_neighbor('a') extra", 'bgp_prefix(#)', ''].map(function (p, i) {
    return { name: 't' + i, nodes: ['r1'], plugin: p };
  })));
  assert.deepStrictEqual(statuses(res), Array(9).fill('unsupported'));
  assert.strictEqual(calls.length, 0);
});

test('activate= with an Object.prototype name is not treated as an address family', async function () {
  const res = await judge(topo([{ name: 'a', nodes: ['r1'], plugin: "bgp_neighbor(node.bgp.neighbors, 'r2', activate='constructor')" }]));
  assertNoPass(res);
  assert.strictEqual(calls.length, 0);
  assert.match(res.tests[0].message, /Unsupported address family constructor/);
});

/* ---------- nodes ---------- */
test('a test for a node that is not in the lab is never a pass', async function () {
  const res = await judge(topo([
    { name: 'ghost', nodes: ['r9'], plugin: NGB },
    { name: 'proto', nodes: ['constructor', '__proto__', 'toString'], plugin: NGB },
    { name: 'mixed', nodes: ['r1', 'r9'], plugin: NGB }
  ]), { [SUMMARY]: UP });
  assertNoPass(res);
  assert.deepStrictEqual(calls, ['clab-t-r1|' + SUMMARY]);
});

test('nodes given as a string, object, null or with odd entries -> no throw, no false pass', async function () {
  let res = await judge(topo([{ name: 's', nodes: 'r1', plugin: NGB }]), { [SUMMARY]: UP });
  assert.deepStrictEqual(statuses(res), ['pass']);   /* netlab accepts a single node name for a list */
  res = await judge(topo([
    { name: 'o', nodes: { r1: 1 }, plugin: NGB },
    { name: 'n', nodes: null, plugin: NGB },
    { name: 'x', nodes: [null, 5, {}, ['r1']], plugin: NGB },
    { name: 'none', plugin: NGB }
  ]), { [SUMMARY]: UP });
  assertNoPass(res);
  assert.strictEqual(calls.length, 0);
});

test('node data that is null or a string -> no throw, no false pass', async function () {
  const res = await judge(topo([{ name: 'n', nodes: ['a', 'b', 'c'], plugin: NGB }], { a: null, b: 'frr', c: { device: 'frr', bgp: null } }), { [SUMMARY]: UP });
  assertNoPass(res);
  assert.strictEqual(calls.length, 0);
});

test('the lab nodes section as a list or a string -> no throw, no false pass', async function () {
  for (const nodes of [['r1', 'r2'], 'r1', null]) {
    const res = await judge({ name: 't', nodes: nodes, validate: [{ name: 'x', nodes: ['r1', '0'], plugin: NGB }] }, { [SUMMARY]: UP });
    assertNoPass(res);
  }
});

test('routers that are not read (non-FRR) stay "not checked", also next to a passing FRR router', async function () {
  let res = await judge(topo([{ name: 'eos', nodes: ['e1'], plugin: "bgp_neighbor(node.bgp.neighbors, 'r1')" }]));
  assert.deepStrictEqual(statuses(res), ['unsupported']);
  assert.strictEqual(calls.length, 0);
  res = await judge(topo([{ name: 'mix', nodes: ['r1', 'e1'], plugin: NGB }]), { [SUMMARY]: UP });
  assert.deepStrictEqual(statuses(res), ['unsupported']);
  assert.strictEqual(res.counts.checked, 0);
  const nodes = topo([], { r1: NODES.r1, d1: { bgp: {} } }).nodes;   /* no device at all */
  res = await judge(topo([{ name: 'nodev', nodes: ['d1'], plugin: NGB }], nodes));
  assert.deepStrictEqual(statuses(res), ['unsupported']);
});

test('devices: filter that leaves nothing -> skipped, not counted', async function () {
  const res = await judge(topo([{ name: 'd', nodes: ['r1'], devices: ['eos'], plugin: NGB }]));
  assert.deepStrictEqual(statuses(res), ['skip']);
  assert.strictEqual(res.counts.total, 0);
  assert.strictEqual(res.counts.checked, 0);
});

/* ---------- prefixes ---------- */
test('a prefix the lab does not have -> not checked', async function () {
  const res = await judge(topo([
    { name: 'a', nodes: ['r1'], plugin: 'bgp_prefix(nodes.r2.bgp.originate[0])' },
    { name: 'b', nodes: ['r1'], plugin: 'bgp_prefix(nodes.r1.bgp.originate[5])' },
    { name: 'c', nodes: ['r1'], plugin: 'bgp_prefix(nodes.r9.loopback.ipv4)' },
    { name: 'd', nodes: ['r1'], plugin: 'bgp_prefix(links[3].prefix.ipv4)' },
    { name: 'e', nodes: ['r1'], plugin: 'bgp_prefix(validate.x)' }
  ]));
  assert.deepStrictEqual(statuses(res), Array(5).fill('unsupported'));
  assert.strictEqual(calls.length, 0);
});

test('a value that is not a prefix (or no prefix at all) -> not checked, the router is not asked', async function () {
  const nodes = Object.assign({}, NODES, { r3: { device: 'frr', bgp: { originate: [null] }, loopback: { ipv4: true } } });
  const res = await judge(topo([
    "bgp_prefix('not-a-prefix')", 'bgp_prefix()', 'bgp_prefix(None)', 'bgp_prefix(True)', 'bgp_prefix(42)',
    "bgp_prefix('999.1.1.1/24')", "bgp_prefix('10.0.0.0/33')", "bgp_prefix({'a': 1})", 'bgp_prefix(node.loopback.ipv4)'
  ].map(function (p, i) { return { name: 't' + i, nodes: ['r3'], plugin: p }; }), nodes));
  assert.deepStrictEqual(statuses(res), Array(9).fill('unsupported'));
  assert.strictEqual(calls.length, 0);
});

test('getPrefix keeps its results for valid input', function () {
  assert.strictEqual(nv.getPrefix('10.0.0.1/24'), '10.0.0.0/24');
  assert.strictEqual(nv.getPrefix('10.0.0.1'), '10.0.0.1/32');
  assert.strictEqual(nv.getPrefix('0.0.0.0/0'), '0.0.0.0/0');
  assert.strictEqual(nv.getPrefix('255.255.255.255/32'), '255.255.255.255/32');
  assert.strictEqual(nv.getPrefix({ ipv4: '172.16.1.7/16' }), '172.16.0.0/16');
  assert.strictEqual(nv.getPrefix('2001:DB8::/64'), '2001:db8::/64');
  assert.strictEqual(nv.getPrefix('2001:db8::1'), '2001:db8::1/128');
});

test('a prefix that is not in the BGP table fails (present) and is settled before it passes (missing)', async function () {
  const show = 'bgp vrf default ipv4 unicast 10.0.0.0/24 json';
  let res = await judge(topo([{ name: 'p', nodes: ['r2'], plugin: 'bgp_prefix(nodes.r1.bgp.originate[0])' }]), { [show]: {} });
  assert.deepStrictEqual(statuses(res), ['fail']);
  res = await judge(topo([{ name: 'm', nodes: ['r2'], plugin: "bgp_prefix(nodes.r1.bgp.originate[0], state='missing')" }]),
    { [show]: {}, [SUMMARY]: { ipv4Unicast: { peers: { '10.1.0.1': { state: 'Active' } } } } });
  assert.deepStrictEqual(statuses(res), ['settling']);
  res = await judge(topo([{ name: 'm', nodes: ['r2'], plugin: "bgp_prefix(nodes.r1.bgp.originate[0], state='missing')" }]),
    { [show]: {}, [SUMMARY]: new Error('vtysh failed') });
  assert.deepStrictEqual(statuses(res), ['settling']);
});

/* ---------- malformed router output ---------- */
test('malformed bgp_prefix output is never a pass', async function () {
  const show = 'bgp vrf default ipv4 unicast 10.0.0.0/24 json';
  const outputs = [null, [], 'text', 5, 'RAW:not json', 'RAW:', new Error('exec failed'),
    { prefix: '10.0.0.0/24', paths: null }, { prefix: '10.0.0.0/24', paths: 'x' }, { prefix: '10.0.0.0/24', paths: {} },
    { prefix: '10.0.0.0/24', paths: [null] }, { prefix: '10.0.0.0/24', paths: [{ nexthops: null }] },
    { prefix: '10.0.0.0/24', paths: [{ nexthops: [null] }] }, { prefix: '10.0.0.0/24', paths: [{ nexthops: 'x' }] },
    { prefix: '10.0.0.0/24', paths: [{ aspath: null, bestpath: null, peer: null }] }];
  for (const out of outputs) {
    const res = await judge(topo([
      { name: 'nh', nodes: ['r2'], plugin: "bgp_prefix(nodes.r1.bgp.originate[0], nh='10.1.0.1')" },
      { name: 'best', nodes: ['r2'], plugin: 'bgp_prefix(nodes.r1.bgp.originate[0], best=True)' },
      { name: 'asp', nodes: ['r2'], plugin: "bgp_prefix(nodes.r1.bgp.originate[0], aspath='65001', as_elements=[65001])" },
      { name: 'peer', nodes: ['r2'], plugin: "bgp_prefix(nodes.r1.bgp.originate[0], peer='10.0.0.1', locpref=100, med=0)" },
      { name: 'comm', nodes: ['r2'], plugin: "bgp_prefix(nodes.r1.bgp.originate[0], community={'community': '65000:1'})" },
      { name: 'clu', nodes: ['r2'], plugin: "bgp_prefix(nodes.r1.bgp.originate[0], clusterid='10.0.0.1')" }
    ]), { [show]: out });
    assertNoPass(res);
  }
});

test('malformed bgp_neighbor output is never a pass', async function () {
  const outputs = [null, [], 'text', 'RAW:{', new Error('exec failed'), { peers: null }, { peers: 'x' },
    { ipv4Unicast: null }, { ipv4Unicast: { peers: null } }, { ipv4Unicast: { peers: { '10.1.0.2': null } } },
    { ipv4Unicast: { peers: { '10.1.0.2': {} } } }, { ipv4Unicast: { peers: { '10.1.0.2': { state: '' } } } },
    { ipv4Unicast: { peers: { '10.1.0.2': { state: null } } } }, { ipv4Unicast: { peers: { '10.1.0.2': { state: 5 } } } },
    { ipv4Unicast: { peers: { '10.1.0.2': { state: 'Idle' } } } }];
  for (const out of outputs) {
    const res = await judge(topo([{ name: 'n', nodes: ['r1'], plugin: NGB }]), { [SUMMARY]: out });
    assertNoPass(res);
  }
});

test('malformed neighbor data in the lab is never a pass', async function () {
  for (const ngb of [null, 'r2', {}, [null], [null, { name: 'r2', ipv4: '10.1.0.2' }], [{ name: 'r2' }], [{ name: 'r2', ipv4: null }], 5]) {
    const nodes = { r1: { device: 'frr', bgp: { neighbors: ngb } } };
    const res = await judge(topo([{ name: 'n', nodes: ['r1'], plugin: NGB }], nodes), { [SUMMARY]: UP });
    assertNoPass(res);
  }
});

test('the tiers of a lab with odd groups do not throw', function () {
  assert.strictEqual(nv.tiers({ nodes: { a: {}, b: {} }, groups: { g: null, h: 'a', isp: { members: 'a' } } }), null);
  assert.deepStrictEqual(nv.tiers({ nodes: { a: {}, b: {} }, groups: { isp: { members: ['a'] }, x: null } }), { a: 0, b: 1 });
  assert.strictEqual(nv.tiers({}), null);
});
