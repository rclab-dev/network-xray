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

// ---- suggest / init ----------------------------------------------------------------------------------------------
test('suggest: the route the fix brought (where the traffic goes) and the adjacency on the same router; verified', () => {
  const r = kit.suggest(BROKEN, SOLVED);
  assert.strictEqual(r.status, 'ok');
  assert.deepStrictEqual(r.check.all, [
    ['r1', 'routing_table', 'some', [['prefix', 'eq', '2.2.2.2/32'], ['selected', 'eq', true], ['out_iface', 'eq', 'eth1']]],
    ['r1', 'ospf_neighbors', 'some', [['router_id', 'eq', '2.2.2.2'], ['full', 'eq', true]]]
  ]);
  assert.strictEqual(r.verify.status, 'ok');
  assert.deepStrictEqual(r.focus, { node: 'r1', prefix: '2.2.2.2/32' });
  // r2's route and adjacency are candidates too, not in the check
  assert.ok(r.candidates.some(c => c.cond[0] === 'r2' && c.kind === 'path' && !c.in_check));
  assert.ok(r.candidates.every(c => c.holds_solved));
});

test('suggest: --focus picks the router; --max limits the check', () => {
  let r = kit.suggest(BROKEN, SOLVED, { focus: { node: 'r2' } });
  assert.deepStrictEqual(r.check.all.map(c => c[0]), ['r2', 'r2']);
  r = kit.suggest(BROKEN, SOLVED, { max: 1 });
  assert.strictEqual(r.check.all.length, 1); assert.strictEqual(r.check.all[0][1], 'routing_table');
});

test('suggest: a protocol change is a separate binds_method candidate, not in the check by default; a wrong next hop on the same interface adds next_hop', () => {
  const st = (proto, nh, ifc) => ({ r1: { target_node: 'r1', interfaces: { eth1: { up: true }, eth2: { up: true } }, routing_table: [{ prefix: '3.3.3.3/32', protocol: proto, out_iface: ifc || 'eth1', next_hop: nh, selected: true }] } });
  // the route moved (eth1 -> eth2) and is now learned by OSPF: the check names where it goes, not how it was learned
  let r = kit.suggest(st('static', '10.0.12.2'), st('ospf', '10.0.13.3', 'eth2'));
  assert.deepStrictEqual(r.check.all, [['r1', 'routing_table', 'some', [['prefix', 'eq', '3.3.3.3/32'], ['selected', 'eq', true], ['out_iface', 'eq', 'eth2']]]]);
  const b = r.candidates.find(x => x.binds_method);
  assert.deepStrictEqual(b.cond[3].slice(-1), [['protocol', 'eq', 'ospf']]); assert.strictEqual(b.in_check, false); assert.match(b.note, /static -> ospf/);
  assert.strictEqual(r.warnings, undefined);
  // only the protocol tells (same interface and next hop): then it is used, with a warning
  r = kit.suggest(st('static', '10.0.12.2'), st('ospf', '10.0.12.2'));
  assert.strictEqual(r.status, 'ok'); assert.strictEqual(r.check.all[0][3].slice(-1)[0][2], 'ospf');
  assert.match(r.warnings[0], /names how a route is learned/);
  r = kit.suggest(st('static', '10.0.12.99'), st('static', '10.0.12.2'));   // the next hop inside the connected subnet
  assert.deepStrictEqual(r.check.all[0][3], [['prefix', 'eq', '3.3.3.3/32'], ['selected', 'eq', true], ['out_iface', 'eq', 'eth1'], ['next_hop', 'eq', '10.0.12.2']]);
  assert.ok(!r.candidates[0].binds_method);
});

test('suggest: nothing changed, or nothing the check can use -> none with the reason (never a wrong check)', () => {
  let r = kit.suggest(SOLVED, SOLVED);
  assert.strictEqual(r.status, 'none'); assert.strictEqual(r.check, null); assert.match(r.reason, /no difference/);
  // only an OSPF timer changed (a configured value): not a condition
  const t = (h) => ({ r1: { target_node: 'r1', ospf_ifaces: { eth1: { hello: h, dead: h * 4 } } } });
  r = kit.suggest(t(10), t(5));
  assert.strictEqual(r.status, 'none'); assert.match(r.reason, /no condition the check can use/);
  assert.ok(r.skipped.some(x => /configured value/.test(x.why)));
  // the solved lab cannot be read: said so
  r = kit.suggest(BROKEN, { r1: { target_node: 'r1', nx_unread: 'IS-IS is not read' }, r2: BROKEN.r2 });
  assert.strictEqual(r.status, 'cannot_judge'); assert.deepStrictEqual(r.unread, ['r1: not readable (IS-IS is not read)']);
});

test('suggest: a route that only disappeared is a "gone" candidate, used only when nothing else tells', () => {
  const extra = route('9.9.9.9/32', { protocol: 'static' });
  const b = JSON.parse(JSON.stringify(BROKEN)); b.r1.routing_table.push(extra);
  let r = kit.suggest(b, SOLVED);
  assert.ok(r.candidates.some(c => c.kind === 'gone' && !c.in_check));
  r = kit.suggest(b, JSON.parse(JSON.stringify(BROKEN)));
  assert.strictEqual(r.status, 'ok');
  assert.deepStrictEqual(r.check.all, [['r1', 'routing_table', 'none', [['prefix', 'eq', '9.9.9.9/32'], ['selected', 'eq', true]]]]);
  assert.match(r.warnings[0], /only says that a route is gone/);
});

test('suggest: the OSPF neighbor of a change is matched as a whole address (1.1.1.1 is not 1.1.1.10), in either order', () => {
  const st = (s10, first10) => {
    const a = { router_id: '1.1.1.1', state: 'Full/DR', full: true }, b = { router_id: '1.1.1.10', state: s10, full: s10 === 'Full/BDR' };
    return { r2: { target_node: 'r2', ospf_neighbors: first10 ? [b, a] : [a, b] } };
  };
  for (const first10 of [false, true]) {
    const r = kit.suggest(st('Init/DROther', first10), st('Full/BDR', first10));
    assert.strictEqual(r.status, 'ok', 'order ' + first10);
    assert.deepStrictEqual(r.check.all, [['r2', 'ospf_neighbors', 'some', [['router_id', 'eq', '1.1.1.10'], ['full', 'eq', true]]]]);
  }
});

test('cli: check suggest exits 2 when the solved lab cannot be read', (t) => {
  const L = tmpLab(t);
  const bad = L.write('unread.json', { r1: { target_node: 'r1', nx_unread: 'IS-IS is not read' }, r2: BROKEN.r2 });
  const r = q(['check', 'suggest', L.broken, bad]);
  assert.strictEqual(r.code, 2); assert.strictEqual(JSON.parse(r.out).status, 'cannot_judge');
});

test('real states: q21 demo frames -> the same two conditions as the hand-written official check (best via 65002, 65003 kept)', () => {
  const q = require(QUERY), root = path.join(__dirname, '..');
  const a = q.loadStates(path.join(root, 'demo', 'bgp-lp', 'frameA.json')), b = q.loadStates(path.join(root, 'demo', 'bgp-lp', 'frameB.json'));
  const r = kit.suggest(a, b, { focus: { node: 'r1' } });
  assert.strictEqual(r.status, 'ok');
  const hand = q.loadProblem(path.join(root, 'examples', 'q21-bgp-lp')).check.all;
  const key = (c) => c[0] + ' ' + c[1] + ' ' + JSON.stringify(c[3].filter(x => x[0] !== 'prefixlen'));
  assert.deepStrictEqual(r.check.all.map(key), hand.map(key));
});

test('real states: the OSPF demo frames C -> D (r1-r2 back up) -> the route and the adjacency on r1', () => {
  const q = require(QUERY), root = path.join(__dirname, '..');
  const r = kit.suggest(q.loadStates(path.join(root, 'demo', 'frameC.json')), q.loadStates(path.join(root, 'demo', 'frameD.json')));
  assert.strictEqual(r.status, 'ok');
  assert.deepStrictEqual(r.check.all.map(c => c[0] + ' ' + c[1]), ['r1 routing_table', 'r1 ospf_neighbors']);
});

test('init: a draft with empty text fields, focus and the verified check; none passes the reason on', () => {
  const r = kit.init(BROKEN, SOLVED, { id: 'me/lab-1' });
  assert.strictEqual(r.status, 'ok');
  assert.deepStrictEqual(Object.keys(r.problem), ['format', 'id', 'title_en', 'title_ja', 'problem_en', 'problem_ja', 'solved_text_en', 'solved_text_ja', 'focus', 'check', 'check_note_en', 'check_note_ja']);
  assert.strictEqual(r.problem.id, 'me/lab-1');
  assert.deepStrictEqual(r.problem.focus, { node: 'r1', prefix: '2.2.2.2/32' });
  assert.strictEqual(kit.verify(r.problem, BROKEN, SOLVED).status, 'ok');
  assert.strictEqual(kit.run(r.problem, SOLVED).status, 'solved');
  assert.ok(r.todo.some(t => /title_en/.test(t)));
  assert.deepStrictEqual(kit.init(BROKEN, SOLVED, { focus: { node: 'r2' } }).problem.focus, { node: 'r2' });
  const n = kit.init(SOLVED, SOLVED);
  assert.strictEqual(n.status, 'none'); assert.match(n.reason, /no difference/);
});

test('cli: check suggest exits 0 / 1; check init --out writes a new file and never overwrites', (t) => {
  const L = tmpLab(t);
  let r = q(['check', 'suggest', L.broken, L.solved]);
  assert.strictEqual(r.code, 0); assert.strictEqual(JSON.parse(r.out).status, 'ok');
  r = q(['check', 'suggest', L.solved, L.solved, '--format', 'table']);
  assert.strictEqual(r.code, 1); assert.match(r.out, /^Suggested check: none/);
  const out = path.join(L.dir, 'new', 'problem.json'); fs.mkdirSync(path.dirname(out));
  r = q(['check', 'init', L.broken, L.solved, '--out', out]);
  assert.strictEqual(r.code, 0); assert.strictEqual(JSON.parse(r.out).written, out);
  assert.strictEqual(kit.run(JSON.parse(fs.readFileSync(out, 'utf8')), SOLVED).status, 'solved');
  r = q(['check', 'init', L.broken, L.solved, '--out', out]);
  assert.strictEqual(r.code, 2); assert.match(JSON.parse(r.out).error, /already exists/);
  for (const bad of [['--focus', 'r9'], ['--max', '0'], ['--mgmt-subnet', 'x']]) {
    r = q(['check', 'suggest', L.broken, L.solved].concat(bad));
    assert.strictEqual(r.code, 2, bad.join(' '));
  }
  r = q(['check', 'run', L.problem, L.solved, '--focus', 'r1']);
  assert.strictEqual(r.code, 2); assert.match(JSON.parse(r.out).error, /for check suggest/);
});

test('mcp: check_suggest and check_init (no file is written)', (t) => {
  const L = tmpLab(t);
  const mcp = require(path.join(__dirname, '..', 'scripts', 'xray-mcp.js'));
  const call = (name, args) => mcp.handle({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name, arguments: args } }).result;
  let r = call('check_suggest', { broken: L.broken, solved: L.solved, focus: 'r2' });
  assert.strictEqual(r.structuredContent.status, 'ok');
  assert.deepStrictEqual(r.structuredContent.check.all.map(c => c[0]), ['r2', 'r2']);
  const before = fs.readdirSync(L.dir).sort();
  r = call('check_init', { broken: L.broken, solved: L.solved });
  assert.strictEqual(r.structuredContent.problem.format, 'network-xray-lab/0');
  assert.deepStrictEqual(fs.readdirSync(L.dir).sort(), before);
  r = call('check_suggest', { broken: L.broken, solved: L.solved, focus: 'r9' });
  assert.strictEqual(r.isError, true); assert.match(r.content[0].text, /unknown node: r9/);
});

test('mcp: the check tools read problem.json and the states only under the server\'s folder (v1.4.3 path limit)', (t) => {
  const L = tmpLab(t);
  const mcp = require(path.join(__dirname, '..', 'scripts', 'xray-mcp.js'));
  const call = (name, args) => mcp.handle({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name, arguments: args } }).result;
  const outside = fs.mkdtempSync(path.join(os.tmpdir(), 'nx-solvedkit-out-'));
  t.after(() => { mcp.setPathRoot(null); fs.rmSync(outside, { recursive: true, force: true }); });
  const pOut = path.join(outside, 'problem.json'); fs.writeFileSync(pOut, JSON.stringify(P([ADJ])));
  mcp.setPathRoot(L.dir);
  assert.strictEqual(call('check_run', { problem: L.problem, path: L.solved }).structuredContent.status, 'solved');
  for (const [name, args] of [
    ['check_run', { problem: pOut, path: L.solved }],
    ['check_verify', { problem: pOut, broken: L.broken, solved: L.solved }],
    ['check_run', { problem: L.problem, path: path.join(outside, 'x.json') }]
  ]) {
    const r = call(name, args);
    assert.strictEqual(r.isError, true, name);
    assert.match(r.content[0].text, /outside the folder this server reads/, name);
  }
});

test('mcp: a problem.json inside the server\'s folder that is a link to a file outside is refused', (t) => {
  const L = tmpLab(t);
  const mcp = require(path.join(__dirname, '..', 'scripts', 'xray-mcp.js'));
  const outside = fs.mkdtempSync(path.join(os.tmpdir(), 'nx-solvedkit-link-'));
  t.after(() => { mcp.setPathRoot(null); fs.rmSync(outside, { recursive: true, force: true }); });
  const target = path.join(outside, 'problem.json'); fs.writeFileSync(target, JSON.stringify(P([ADJ])));
  const lab2 = path.join(L.dir, 'lab2'); fs.mkdirSync(lab2);
  try { fs.symlinkSync(target, path.join(lab2, 'problem.json')); } catch (e) { t.skip('no symlinks here (' + e.code + ')'); return; }
  mcp.setPathRoot(L.dir);
  const r = mcp.handle({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'check_run', arguments: { problem: lab2, path: L.solved } } }).result;
  assert.strictEqual(r.isError, true); assert.match(r.content[0].text, /outside the folder this server reads/);
});

test('cli: check init --out makes a folder that is not there yet, and with --format table writes once and exits 0', (t) => {
  const L = tmpLab(t);
  const out = path.join(L.dir, 'newlab', 'sub', 'problem.json');
  let r = q(['check', 'init', L.broken, L.solved, '--out', out, '--format', 'table']);
  assert.strictEqual(r.code, 0, r.err);
  assert.match(r.out, /written: /);
  assert.strictEqual(r.err, '');
  assert.strictEqual(kit.run(JSON.parse(fs.readFileSync(out, 'utf8')), SOLVED).status, 'solved');
  r = q(['check', 'init', L.broken, L.solved, '--out', out, '--format', 'table']);
  assert.strictEqual(r.code, 2); assert.match(r.err, /already exists/);
});
