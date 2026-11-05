// check-problem-json.test.js — examples/*/problem.json must follow docs/problem-format.md and match their labs
// (scripts/check-problem-json.js).
// Run: node --test        (from the repo root; Node >= 18, no dependencies)
'use strict';
var test = require('node:test');
var assert = require('node:assert');
var fs = require('fs');
var os = require('os');
var path = require('path');
var cp = require('../scripts/check-problem-json.js');

test('every examples/*/problem.json is valid and matches its lab', function () {
  var lines = [];
  cp.checkAll().forEach(function (r) { r.problems.forEach(function (p) { lines.push(r.file + ': ' + p); }); });
  assert.deepStrictEqual(lines, []);
});

test('parsePrefix', function () {
  assert.strictEqual(cp.parsePrefix('8.8.8.0/24').canonical, true);
  assert.strictEqual(cp.parsePrefix('8.8.8.1/24').canonical, false);
  assert.strictEqual(cp.parsePrefix('0.0.0.0/0').len, 0);
  assert.strictEqual(cp.parsePrefix('8.8.8.0'), null);
  assert.strictEqual(cp.parsePrefix('8.8.8.256/24'), null);
  assert.strictEqual(cp.parsePrefix('10.0.0.0/8').inside(10 * 16777216 + 5), true);
});

function makeRoot() {
  var root = fs.mkdtempSync(path.join(os.tmpdir(), 'xray-pj-'));
  var topo = [
    'name: qx',
    'topology:',
    '  nodes:',
    '    r1: { kind: linux, image: frrouting/frr:v8.4.1 }',
    '    r2: { kind: linux, image: frrouting/frr:v8.4.1 }',
    '  links:',
    '    - endpoints: ["r1:eth1", "r2:eth1"]',
    '',
  ].join('\n');
  var conf = 'interface eth1\n ip address 10.10.0.10/24\n!\nip route 8.8.8.0/24 10.10.0.20\n';
  ['qx', 'qx-solved'].forEach(function (d) {
    var dir = path.join(root, 'examples', d);
    fs.mkdirSync(path.join(dir, 'r1'), { recursive: true });
    fs.writeFileSync(path.join(dir, 'qx.clab.yml'), topo);
    fs.writeFileSync(path.join(dir, 'r1', 'frr.conf'), conf);
  });
  return root;
}
function good(id) {
  return {
    format: 'network-xray-lab/0', id: 'rclab-dev/network-xray/' + id, title_en: 'T', problem_en: 'Ping <code>8.8.8.0/24</code><br>via 10.10.0.20.',
    focus: { node: 'r1', prefix: '8.8.8.0/24' },
    solved_cta: { label_en: 'See [this]', url_en: 'https://example.com/x' },
    check: { all: [
      ['r1', 'interfaces.eth1.up', 'eq', true],
      ['r1', 'routing_table', 'some', [['prefix', 'eq', '8.8.8.0/24'], ['out_iface', 'eq', 'eth1'], ['selected', 'eq', true]]],
      ['r1', 'bgp_routes', 'count_ge', [1, [['prefix', 'in', ['8.8.8.0']], ['next_hop', 'eq', '10.10.0.20']]]],
      ['r2', 'route_resolution.resolved', 'eq', true],
    ] },
  };
}
function write(root, d, obj) {
  fs.writeFileSync(path.join(root, 'examples', d, 'problem.json'), typeof obj === 'string' ? obj : JSON.stringify(obj, null, 2) + '\n');
}
function problemsOf(root) {
  var out = {};
  cp.checkAll(root).forEach(function (r) { out[r.dir] = r.problems; });
  return out;
}

test('a valid broken / solved pair passes', function () {
  var root = makeRoot();
  try {
    write(root, 'qx', good('qx'));
    write(root, 'qx-solved', good('qx-solved'));
    assert.deepStrictEqual(problemsOf(root), { qx: [], 'qx-solved': [] });
    var solved = good('qx-solved');
    solved.check.all.pop();
    write(root, 'qx-solved', solved);
    assert.deepStrictEqual(problemsOf(root), { qx: [], 'qx-solved': ['check: differs from examples/qx/problem.json'] });
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test('broken problem.json files are reported', function () {
  var root = makeRoot();
  try {
    var bad = good('qx');
    bad.format = 'network-xray-lab/1';
    bad.titel_en = 'typo';
    bad.q_number = 21;
    bad.problem_en = 'Ping <b>9.9.9.9</b> <code>x';
    bad.focus = { node: 'r9', prefix: '8.8.8.1/24' };
    bad.solved_cta = { label_en: 'x', url_en: 'javascript:alert(1)' };
    bad.check.all = [
      ['r3', 'interfaces.eth1.up', 'eq', true],
      ['r1', 'interfaces.eth5.up', 'eq', 'yes'],
      ['r1', 'routing_table', 'some', [['prefix', 'eq', '7.7.7.0/24'], ['out_iface', 'eq', 'eth2'], ['selected', 'eq', 'true']]],
      ['r1', 'bgp_routes', 'some', [['prefix', 'eq', '8.8.8.0/24'], ['nexthop', 'eq', '10.10.0.99']]],
      ['r1', 'ospf_neighbors', 'count_ge', [0, []]],
      ['r1', 'route_resolution.resolved', 'is', true],
      ['r1', 'routing_tabel', 'exists'],
      ['r1', 'interfaces', 'gt', '1'],
    ];
    write(root, 'qx', bad);
    write(root, 'qx-solved', good('qx-solved'));
    var p = problemsOf(root);
    var expect = [
      'format: "network-xray-lab/1" (must be "network-xray-lab/0")',
      'titel_en: unknown key',
      'q_number: not a non-empty string',
      'problem_en: tag <b> is shown as text (only <br> <code> <strong> <span>)',
      'problem_en: tag </b> is shown as text (only <br> <code> <strong> <span>)',
      'problem_en: 1 <code> but 0 </code>',
      'solved_cta.url_en: not an http(s) url',
      'focus.node: "r9" is not in qx.clab.yml',
      'focus.prefix: 8.8.8.1/24 has host bits set',
      'check.all[0]: node "r3" is not in qx.clab.yml',
      'check.all[1]: r1 has no interface eth5 in qx.clab.yml',
      'check.all[1]: up is true/false, not "yes"',
      'check.all[2][0]: prefix 7.7.7.0/24 is not in the lab\'s files',
      'check.all[2][1]: r1 has no interface eth2 in qx.clab.yml',
      'check.all[2][2]: selected is true/false, not "true"',
      'check.all[3][0]: bgp_routes prefix 8.8.8.0/24 has a mask (use "8.8.8.0" and prefixlen)',
      'check.all[3][1]: bgp_routes items have no field "nexthop"',
      'check.all[4]: count_ge needs [N >= 1, [conditions]] (N = 0 is always true, so it checks nothing)',
      'check.all[5]: unknown op "is"',
      'check.all[6]: unknown state field "routing_tabel"',
      'check.all[7]: gt needs a number',
      'problem_en: 9.9.9.9 is not in the lab\'s files',
    ];
    assert.deepStrictEqual(p.qx, expect);
    assert.ok(p['qx-solved'].indexOf('check: differs from examples/qx/problem.json') >= 0);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test('missing / unreadable files and a wrong solved id are reported', function () {
  var root = makeRoot();
  try {
    write(root, 'qx', '{"format": "network-xray-lab/0",}');
    write(root, 'qx-solved', good('qx'));
    var p = problemsOf(root);
    assert.match(p.qx[0], /^not valid JSON/);
    assert.ok(p['qx-solved'].indexOf('id: "rclab-dev/network-xray/qx" (expected "rclab-dev/network-xray/qx-solved")') >= 0);
    assert.ok(p['qx-solved'].some(function (x) { return /the broken lab\) /.test(x); }));
    fs.rmSync(path.join(root, 'examples', 'qx', 'problem.json'));
    assert.deepStrictEqual(problemsOf(root).qx, ['missing']);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test('fixes: interface field typo, ne / IPv6 / empty values, count_ge 0, only config files are read', function () {
  var root = makeRoot();
  try {
    var pj = good('qx');
    pj.check.all = [
      ['r1', 'interfaces.eth1.upp', 'eq', true],
      ['r1', 'routing_table', 'none', [['next_hop', 'ne', '10.99.99.99']]],
      ['r1', 'routing_table', 'none', [['next_hop', 'eq', '']]],
      ['r1', 'bgp_routes', 'none', [['next_hop', 'eq', '2001:db8::1']]],
      ['r1', 'bgp_routes', 'count_ge', [0, [['next_hop', 'eq', '10.10.0.20']]]],
      ['r1', 'routing_table', 'some', [['next_hop', 'eq', '10.77.77.77']]],
    ];
    write(root, 'qx', pj);
    fs.writeFileSync(path.join(root, 'examples', 'qx', '.env'), 'GW=10.77.77.77\n');   // not a config file: not read
    var lines = problemsOf(root).qx;
    assert.ok(lines.some(function (l) { return /interfaces\.<iface> has no field "upp"/.test(l); }), lines.join('\n'));
    assert.ok(!lines.some(function (l) { return /10\.99\.99\.99|2001:db8|""/.test(l); }), lines.join('\n'));
    assert.ok(lines.some(function (l) { return /count_ge needs \[N >= 1.*always true/.test(l); }), lines.join('\n'));
    assert.ok(lines.some(function (l) { return /address 10\.77\.77\.77 is not in the lab's files/.test(l); }), lines.join('\n'));
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});
