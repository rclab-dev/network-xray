'use strict';
// solvedkit.js + `xray-query.js check run|verify`: the page's Solved rules on saved states, without a lab or a page.
// Run: node --test        (from the repo root; Node >= 18, no dependencies)
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const cp = require('child_process');
const kit = require(path.join(__dirname, '..', 'solvedkit.js'));
const QUERY = path.join(__dirname, '..', 'scripts', 'xray-query.js');

// a two-router OSPF lab: broken = the adjacency is stuck and r1 has no route to r2's loopback
const route = (prefix, extra) => Object.assign({ prefix, protocol: 'ospf', out_iface: 'eth1', next_hop: '10.0.12.2', selected: true }, extra || {});
const BROKEN = {
  r1: { target_node: 'r1', interfaces: { eth1: { up: true, ip: '10.0.12.1/24' } }, ospf_neighbors: [{ router_id: '2.2.2.2', state: 'ExStart/DR', full: false }], routing_table: [] },
  r2: { target_node: 'r2', interfaces: { eth1: { up: true, ip: '10.0.12.2/24' } }, ospf_neighbors: [{ router_id: '1.1.1.1', state: 'ExStart/BDR', full: false }], routing_table: [] }
};
const SOLVED = {
  r1: { target_node: 'r1', interfaces: { eth1: { up: true, ip: '10.0.12.1/24' } }, ospf_neighbors: [{ router_id: '2.2.2.2', state: 'Full/DR', full: true }], routing_table: [route('2.2.2.2/32')] },
  r2: { target_node: 'r2', interfaces: { eth1: { up: true, ip: '10.0.12.2/24' } }, ospf_neighbors: [{ router_id: '1.1.1.1', state: 'Full/BDR', full: true }], routing_table: [route('1.1.1.1/32', { next_hop: '10.0.12.1' })] }
};
const ADJ = ['r1', 'ospf_neighbors', 'some', [['router_id', 'eq', '2.2.2.2'], ['full', 'eq', true]]];
const RT = ['r1', 'routing_table', 'some', [['prefix', 'eq', '2.2.2.2/32'], ['selected', 'eq', true], ['out_iface', 'eq', 'eth1']]];
const UP = ['r1', 'interfaces.eth1.up', 'eq', true];   // holds on both
const P = (all, extra) => Object.assign({ format: 'network-xray-lab/0', check: { all } }, extra || {});

test('run: solved / not solved, with one result per condition', () => {
  const ok = kit.run(P([ADJ, RT]), SOLVED);
  assert.strictEqual(ok.status, 'solved'); assert.strictEqual(ok.solved, true);
  assert.deepStrictEqual(ok.results.map(r => r.ok), [true, true]);
  const no = kit.run(P([ADJ, RT]), BROKEN);
  assert.strictEqual(no.status, 'not_solved'); assert.strictEqual(no.solved, false);
  assert.deepStrictEqual(no.results.map(r => r.ok), [false, false]);
});

test('run: the same answer as solved-check.js evaluate (the page band) when every node can be read', () => {
  const chk = require(path.join(__dirname, '..', 'solved-check.js'));
  for (const states of [BROKEN, SOLVED]) {
    for (const all of [[ADJ], [RT], [UP], [ADJ, RT, UP]]) {
      assert.strictEqual(kit.run(P(all), states).solved, chk.evaluate(P(all), states).ok);
    }
  }
});

test('run: a node that is missing or cannot be read leaves it open (cannot_judge), unless another condition clearly fails', () => {
  const noR1 = { r2: SOLVED.r2 };
  let r = kit.run(P([ADJ]), noR1);
  assert.strictEqual(r.status, 'cannot_judge'); assert.strictEqual(r.results[0].ok, null);
  assert.match(r.reason, /r1: not in the state/);
  r = kit.run(P([ADJ]), { r1: Object.assign({}, SOLVED.r1, { nx_unread: 'IS-IS is not read' }) });
  assert.strictEqual(r.status, 'cannot_judge'); assert.match(r.reason, /not readable \(IS-IS is not read\)/);
  r = kit.run(P([ADJ]), { r1: { target_node: 'r1', success: false } });
  assert.strictEqual(r.status, 'cannot_judge');
  // r2's condition fails outright -> not solved, whatever r1 would say
  r = kit.run(P([ADJ, ['r2', 'ospf_neighbors', 'some', [['full', 'eq', true]]]]), { r2: BROKEN.r2 });
  assert.strictEqual(r.status, 'not_solved');
});

test('run: nothing to judge -> cannot_judge with the reason', () => {
  assert.match(kit.run({ format: 'network-xray-lab/0' }, SOLVED).reason, /no check/);
  assert.match(kit.run(P([ADJ], { format: 'network-xray-lab/9' }), SOLVED).reason, /unsupported format/);
  assert.match(kit.run(null, SOLVED).reason, /not a problem\.json object/);
  assert.strictEqual(kit.run(P([]), SOLVED).status, 'cannot_judge');
  // no format at all is accepted, as on the page
  assert.strictEqual(kit.run({ check: { all: [ADJ] } }, SOLVED).status, 'solved');
});

test('run: a broken condition does not hold (never throws)', () => {
  const r = kit.run(P([['r1'], ['r1', 'x', 'nope', 1]]), SOLVED);
  assert.strictEqual(r.status, 'not_solved');
  assert.deepStrictEqual(r.results.map(x => x.ok), [false, false]);
});

test('verify: ok when the check fails on broken and holds on solved; verdict per condition', () => {
  const v = kit.verify(P([ADJ, RT, UP]), BROKEN, SOLVED);
  assert.strictEqual(v.status, 'ok'); assert.strictEqual(v.ok, true);
  assert.deepStrictEqual(v.conditions.map(c => c.verdict), ['tells', 'tells', 'both']);
  assert.deepStrictEqual(v.problems, []);
});

test('verify: not ok when the check already holds on broken, or fails on solved', () => {
  let v = kit.verify(P([UP]), BROKEN, SOLVED);
  assert.strictEqual(v.status, 'not_ok'); assert.match(v.problems.join(), /already holds on the broken lab/);
  v = kit.verify(P([ADJ, ['r1', 'routing_table', 'some', [['prefix', 'eq', '9.9.9.9/32']]]]), BROKEN, SOLVED);
  assert.strictEqual(v.status, 'not_ok'); assert.match(v.problems.join(), /does not hold on the solved lab \(1 condition/);
  assert.deepStrictEqual(v.conditions.map(c => c.verdict), ['tells', 'wrong']);
});

test('verify: cannot_judge when a node cannot be read in either lab, or there is no check', () => {
  let v = kit.verify(P([ADJ]), BROKEN, { r2: SOLVED.r2 });
  assert.strictEqual(v.status, 'cannot_judge'); assert.strictEqual(v.conditions[0].verdict, 'unknown');
  assert.match(v.problems[0], /^solved lab: cannot read r1/);
  v = kit.verify({ format: 'network-xray-lab/0' }, BROKEN, SOLVED);
  assert.strictEqual(v.status, 'cannot_judge'); assert.match(v.problems[0], /no check/);
});

// ---- the command line: files only, no lab --------------------------------------------------------
function tmpLab(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'nx-solvedkit-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const write = (name, obj) => { const p = path.join(dir, name); fs.writeFileSync(p, typeof obj === 'string' ? obj : JSON.stringify(obj)); return p; };
  fs.mkdirSync(path.join(dir, 'lab'));
  return {
    dir, write,
    problem: write('lab/problem.json', P([ADJ, RT])),
    broken: write('broken.json', BROKEN),
    solved: write('xray-states.js', 'window.LIVE_STATES = ' + JSON.stringify(SOLVED) + ';\n')
  };
}
function q(args) {
  const r = cp.spawnSync(process.execPath, [QUERY].concat(args), { encoding: 'utf8' });
  return { code: r.status, out: r.stdout, err: r.stderr };
}

test('cli: check run exits 0 solved / 1 not solved / 2 cannot judge, and takes the problem folder or the file', (t) => {
  const L = tmpLab(t);
  let r = q(['check', 'run', path.join(L.dir, 'lab'), L.solved]);
  assert.strictEqual(r.code, 0); assert.strictEqual(JSON.parse(r.out).status, 'solved');
  r = q(['check', 'run', L.problem, L.broken]);
  assert.strictEqual(r.code, 1); assert.strictEqual(JSON.parse(r.out).status, 'not_solved');
  r = q(['check', 'run', L.write('nocheck.json', { format: 'network-xray-lab/0' }), L.solved]);
  assert.strictEqual(r.code, 2); assert.strictEqual(JSON.parse(r.out).status, 'cannot_judge');
});

test('cli: check verify exits 0 / 1, with a table for people', (t) => {
  const L = tmpLab(t);
  let r = q(['check', 'verify', L.problem, L.broken, L.solved]);
  assert.strictEqual(r.code, 0); assert.strictEqual(JSON.parse(r.out).status, 'ok');
  r = q(['check', 'verify', L.problem, L.solved, L.solved, '--format', 'table']);
  assert.strictEqual(r.code, 1);
  assert.match(r.out, /^Check: not ok \(broken: solved, solved: solved\)/);
  assert.match(r.out, /BROKEN\s+SOLVED\s+VERDICT\s+CONDITION/);
  assert.ok(r.out.split('\n').every(l => l.length <= 100), 'lines stay under 100 characters');
});

test('cli: errors are {"error"} with exit 2 (missing file, bad JSON, wrong arguments)', (t) => {
  const L = tmpLab(t);
  for (const args of [
    ['check', 'run', path.join(L.dir, 'none.json'), L.solved],
    ['check', 'run', L.write('bad.json', '{nope'), L.solved],
    ['check', 'run', L.dir, L.solved],                    // a folder without problem.json
    ['check', 'run', L.problem],
    ['check', 'nope', L.problem, L.solved],
    ['check']
  ]) {
    const r = q(args);
    assert.strictEqual(r.code, 2, args.join(' '));
    assert.ok(JSON.parse(r.out).error, args.join(' '));
  }
});

test('the official examples: every problem.json is read without throwing; with no state nothing can be judged', () => {
  const ex = path.join(__dirname, '..', 'examples');
  for (const n of fs.readdirSync(ex)) {
    const pj = path.join(ex, n, 'problem.json');
    if (!fs.existsSync(pj)) continue;
    const p = JSON.parse(fs.readFileSync(pj, 'utf8'));
    const r = kit.run(p, {});
    assert.ok(['cannot_judge'].includes(r.status), n + ': ' + r.status);   // no state -> nothing can be read
  }
});

test('mcp: check_run and check_verify give the same answer as the command line; a bad problem.json is not quoted', (t) => {
  const L = tmpLab(t);
  const mcp = require(path.join(__dirname, '..', 'scripts', 'xray-mcp.js'));
  const call = (name, args) => mcp.handle({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name, arguments: args } }).result;
  let r = call('check_run', { problem: L.problem, path: L.solved });
  assert.strictEqual(r.structuredContent.status, 'solved');
  r = call('check_run', { problem: path.join(L.dir, 'lab'), path: L.broken });
  assert.strictEqual(r.structuredContent.status, 'not_solved');
  r = call('check_verify', { problem: L.problem, broken: L.broken, solved: L.solved });
  assert.strictEqual(r.structuredContent.status, 'ok');
  assert.deepStrictEqual(r.structuredContent.conditions.map(c => c.verdict), ['tells', 'tells']);
  r = call('check_run', { problem: L.write('secret.json', '{"token": "s3cr3t", nope'), path: L.solved });
  assert.strictEqual(r.isError, true);
  assert.ok(!/s3cr3t/.test(r.content[0].text), 'the file is not quoted');
  assert.match(r.content[0].text, /not a problem\.json/);
  r = call('check_verify', { problem: L.problem, broken: L.broken });
  assert.strictEqual(r.isError, true); assert.match(r.content[0].text, /missing argument: solved/);
});

test('real states: the recorded q21 demo frames (before / after the Local Preference fix) against the official q21 check', () => {
  const q = require(QUERY);
  const root = path.join(__dirname, '..');
  const p = q.loadProblem(path.join(root, 'examples', 'q21-bgp-lp'));
  const a = q.loadStates(path.join(root, 'demo', 'bgp-lp', 'frameA.json'));
  const b = q.loadStates(path.join(root, 'demo', 'bgp-lp', 'frameB.json'));
  assert.strictEqual(kit.run(p, a).status, 'not_solved');
  assert.strictEqual(kit.run(p, b).status, 'solved');
  const v = kit.verify(p, a, b);
  assert.strictEqual(v.status, 'ok');
  assert.deepStrictEqual(v.conditions.map(c => c.verdict), ['tells', 'both']);   // the slow path stays as the backup
  assert.strictEqual(kit.verify(p, b, a).status, 'not_ok');                         // swapped: it would never be solved
});
