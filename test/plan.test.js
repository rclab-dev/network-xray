// plan.test.js — scripts/xray-plan.js: what each line of a proposed fix is for.
// Run: node --test        (from the repo root; Node >= 18, no dependencies)
//
// Real captures: test/fixtures/ospf-mismatch4 (FRR 8.4: hello / dead, network type, MTU, authentication differ per link) and
// demo/bgp-lp/frameA.json (r1 prefers r3 by LocPrf 100 > 50). q12 is hand-made from examples/q12-ospf-static (the area
// values of its configs: r1 eth2 in area 1, r3's end in area 0; no route to 3.3.3.3 yet) until a real capture is added.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const cp = require('node:child_process');
const { explainPlan } = require('../scripts/xray-plan.js');
const query = require('../scripts/xray-query.js');
const collect = require('../clab-collect.js');

const ROOT = path.join(__dirname, '..');

function mismatch4() {
  const FIX = path.join(__dirname, 'fixtures', 'ospf-mismatch4', 'frr84'), ifs = ['eth1', 'eth2', 'eth3', 'eth4'], st = {}, adj = {};
  ['r1', 'r2'].forEach((n) => {
    const peer = n === 'r1' ? 'r2' : 'r1';
    const r = cp.spawnSync(process.execPath, [path.join(ROOT, 'clab-collect.js'), '--fixtures', path.join(FIX, n), '--node', n,
      '--adj', ifs.map((i) => i + ':' + peer).join(','), '--proto', 'ospf'], { cwd: ROOT, encoding: 'utf8', timeout: 60000 });
    assert.equal(r.status, 0, r.stderr);
    st[n] = JSON.parse(r.stdout);
    adj[n] = ifs.map((i) => ({ iface: i, peer, peerIface: i }));
  });
  collect.pairOspfIfaces(st, adj);
  return st;
}
// q12, hand-made (see the head of this file)
function q12() {
  const ospfIf = (area, peer, peerIface) => ({ area, hello: 10, dead: 40, network_type: 'broadcast', mtu: 1500, peer, peer_iface: peerIface });
  const st = {
    r1: { target_node: 'r1', protocol: 'ospf', r2_iface: 'eth1', r3_iface: 'eth2', r2_has_full: true, r3_has_full: false,
      interfaces: { lo: { ip: '1.1.1.1/32' }, eth1: { ip: '10.10.0.10/24', up: true }, eth2: { ip: '10.11.0.10/24', up: true } },
      ospf_ifaces: { eth1: ospfIf('0.0.0.0', 'r2', 'eth1'), eth2: ospfIf('0.0.0.1', 'r3', 'eth1') },
      ospf_neighbors: [{ iface: 'eth1', state: 'Full/DR', router_id: '2.2.2.2', full: true }],
      routing_table: [{ prefix: '10.10.0.0/24', out_iface: 'eth1', protocol: 'connected', selected: true },
        { prefix: '10.11.0.0/24', out_iface: 'eth2', protocol: 'connected', selected: true }] },
    r3: { target_node: 'r3', protocol: 'ospf',
      interfaces: { lo: { ip: '3.3.3.3/32' }, eth1: { ip: '10.11.0.30/24', up: true } },
      ospf_ifaces: { eth1: ospfIf('0.0.0.0', 'r1', 'eth2') }, ospf_neighbors: [], routing_table: [] }
  };
  collect.pairOspfIfaces(st, { r1: [{ iface: 'eth2', peer: 'r3', peerIface: 'eth1' }], r3: [{ iface: 'eth1', peer: 'r1', peerIface: 'eth2' }] });
  return st;
}
const Q12_FIX = 'router ospf\n no network 10.11.0.0/24 area 1\n network 10.11.0.0/24 area 0\nip route 3.3.3.3/32 10.10.0.20 120\n';
const Q12_PROBLEM = JSON.parse(fs.readFileSync(path.join(ROOT, 'examples', 'q12-ospf-static', 'problem.json'), 'utf8'));
const tagOf = (r, line) => r.lines.filter((x) => x.line === line)[0].tag;

test('q12 with its check: the area lines fix what is wrong, the static route is for a requirement (the backup)', () => {
  const r = explainPlan(q12(), 'r1', Q12_FIX, { problem: Q12_PROBLEM });
  assert.equal(tagOf(r, 'no network 10.11.0.0/24 area 1'), 'fixes');
  assert.equal(tagOf(r, 'network 10.11.0.0/24 area 0'), 'fixes');
  const s = r.lines.filter((x) => x.line === 'ip route 3.3.3.3/32 10.10.0.20 120')[0];
  assert.equal(s.tag, 'requirement');
  assert.match(s.because, /makes 3\.3\.3\.3\/32 via eth1 \(10\.10\.0\.20 is on eth1's subnet\)/);
  assert.deepEqual(s.touches, ['eth1']);
  assert.match(r.lines.filter((x) => x.line === 'network 10.11.0.0/24 area 0')[0].because, /area 0\.0\.0\.1 ⇔ 0\.0\.0\.0/);
  assert.equal(r.summary, '3 lines: 2 fix what is wrong now, 1 is for a requirement');
});

test('q12 without the check: the static route is not_linked (never "unrelated"), and the note says why', () => {
  const r = explainPlan(q12(), 'r1', Q12_FIX, { requirements: 'r1 must still reach 3.3.3.3 via r2 if the r1-r3 link fails' });
  assert.equal(tagOf(r, 'ip route 3.3.3.3/32 10.10.0.20 120'), 'not_linked');
  assert.equal(r.requirements.text, 'r1 must still reach 3.3.3.3 via r2 if the r1-r3 link fails', 'the words come back as given');
  assert.match(r.note, /^no link found is not a warning/); assert.match(r.note, /may be for the requirement given in words/);
  assert.doesNotMatch(JSON.stringify(r), /unrelated"/);
});

test('a static route with a larger distance than the route there now is called a backup', () => {
  const st = q12();
  st.r1.routing_table.push({ prefix: '3.3.3.3/32', out_iface: 'eth2', protocol: 'ospf', selected: true });
  const r = explainPlan(st, 'r1', 'ip route 3.3.3.3/32 10.10.0.20 120', {});
  assert.match(r.lines[0].because, /distance 120 > ospf 110 \(default\) = used only when the ospf route is gone/);
});

test('real FRR captures: each interface line is tied to its own mismatch; cost and an unknown next hop are ?', () => {
  const r = explainPlan(mismatch4(), 'r1',
    'interface eth2\n ip ospf hello-interval 10\n ip ospf dead-interval 40\ninterface eth3\n no ip ospf network point-to-point\n' +
    'interface eth4\n ip ospf authentication message-digest\ninterface eth1\n ip ospf cost 50\nip route 9.9.9.0/24 10.0.0.99\nfoo bar', {});
  assert.equal(tagOf(r, 'ip ospf hello-interval 10'), 'fixes');
  assert.match(r.lines.filter((x) => x.line === 'ip ospf hello-interval 10')[0].because, /r1 eth2 ⇔ r2 eth2: OSPF no adjacency — hello 5 ⇔ 10/);
  assert.equal(tagOf(r, 'no ip ospf network point-to-point'), 'fixes');
  assert.equal(tagOf(r, 'ip ospf authentication message-digest'), 'fixes');
  assert.equal(tagOf(r, 'ip ospf cost 50'), '?');
  assert.equal(tagOf(r, 'ip route 9.9.9.0/24 10.0.0.99'), '?');
  assert.equal(tagOf(r, 'foo bar'), '?');
  assert.equal(tagOf(r, 'interface eth2'), 'fixes', 'a block header takes the strongest tag of its lines');
});

test('q21: the LocPrf value is shown next to the comparison now, and no winner is named', () => {
  const A = query.loadStates(path.join(ROOT, 'demo', 'bgp-lp', 'frameA.json'));
  const r = explainPlan(A, 'r1', 'route-map LOW-LP permit 10\n set local-preference 90\nrouter bgp 65001\n neighbor 10.10.0.20 route-map LOW-LP in', { prefix: '8.8.8.0/24' });
  const s = r.lines.filter((x) => x.line === 'set local-preference 90')[0];
  assert.equal(s.tag, '?');
  assert.match(s.because, /sets LocPrf 90 — routes from 10\.10\.0\.20 for 8\.8\.8\.0\/24: LocPrf now 50; the comparison now: LocPrf 100 > 50 \(best via 10\.11\.0\.20\)/);
  assert.match(s.because, /Which path wins after the change is not worked out here/);
  assert.doesNotMatch(s.because, /\b(will|would) (win|lose|be chosen)/);
});

test('CLI: table and json; wrong input -> exit 2', () => {
  const run = (args, input) => cp.spawnSync(process.execPath, [path.join(ROOT, 'scripts', 'xray-plan.js')].concat(args), { cwd: ROOT, encoding: 'utf8', input });
  let r = run(['demo/bgp-lp/frameA.json', 'r1', '-', '--format', 'table', '--prefix', '8.8.8.0/24'], 'route-map LOW-LP permit 10\n set local-preference 90\n');
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /\[ \? \] set local-preference 90/);
  r = run(['demo/bgp-lp/frameA.json', 'r9', '-'], 'ip route 1.1.1.1/32 10.0.0.1\n');
  assert.equal(r.status, 2); assert.match(r.stderr, /unknown router: r9/);
  r = run(['demo/bgp-lp/frameA.json', 'r1', '-', '--format', 'xml'], '');
  assert.equal(r.status, 2); assert.match(r.stderr, /--format must be json or table/);
});

test('the panel and render: the plan as one panel (a word with each tag) and a mark on the link the line touches', () => {
  const panel = require('../xray-node-panel.js');
  const plan = explainPlan(q12(), 'r1', Q12_FIX, { problem: Q12_PROBLEM });
  const h = panel.toHtml(q12().r1, { figure: true, plan: plan });
  assert.match(h, /Proposed fix: what each line is for/);
  assert.match(h, /<span class="xnp-plan-tag">for a requirement<\/span><span><span class="xnp-plan-line">ip route 3\.3\.3\.3\/32 10\.10\.0\.20 120<\/span>/);
  assert.match(h, /eth1 — r2<tspan fill="var\(--xnp-bgp\)" font-weight="700"> · for a requirement<\/tspan>/);
  assert.match(h, /eth2 — r3<tspan fill="var\(--xnp-down-text,#ff6b6b\)" font-weight="700"> · fix<\/tspan>/);
  const box = panel.toHtml(q12().r1, { figure: true, figureStyle: 'box', plan: plan });
  assert.match(box, / · for a requirement<\/tspan>/, 'the box picture carries the marks too');
  assert.doesNotMatch(panel.toHtml(q12().r1, { figure: true }), /Proposed fix/, 'no plan, no panel');
  const page = require('../scripts/xray-render.js').renderPage(query.loadStates(path.join(ROOT, 'demo', 'bgp-lp', 'frameA.json')), 'r1',
    { plan: 'route-map LOW-LP permit 10\n set local-preference 90\n<script>alert(1)</script>', prefix: '8.8.8.0/24' });
  assert.match(page, /Proposed fix/);
  assert.doesNotMatch(page, /<script>alert/, 'plan lines are escaped');
});

test('MCP explain_plan: listed read-only, answers like the function, takes node for router', () => {
  const mcp = require('../scripts/xray-mcp.js');
  const t = mcp.TOOLS.filter((x) => x.name === 'explain_plan')[0];
  assert.ok(t && t.annotations && t.annotations.readOnlyHint === true);
  const call = (args) => { const r = mcp.handle({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'explain_plan', arguments: args } }); return { err: !!r.result.isError, body: JSON.parse(r.result.content[0].text) }; };
  const STATE = path.join(ROOT, 'demo', 'bgp-lp', 'frameA.json');
  const a = call({ path: STATE, router: 'r1', lines: 'route-map LOW-LP permit 10\n set local-preference 90', prefix: '8.8.8.0/24' });
  assert.ok(!a.err, JSON.stringify(a.body));
  assert.deepEqual(a.body, explainPlan(query.loadStates(STATE), 'r1', 'route-map LOW-LP permit 10\n set local-preference 90', { prefix: '8.8.8.0/24' }));
  const b = call({ path: STATE, node: 'r1', lines: 'route-map LOW-LP permit 10\n set local-preference 90', prefix: '8.8.8.0/24' });
  assert.deepEqual(b.body, a.body);
  const p = call({ path: STATE, router: 'r1', lines: 'x', problem: path.join(ROOT, 'examples', 'q21-bgp-lp') });
  assert.ok(!p.err, JSON.stringify(p.body));
});

test('route-maps / prefix-lists merge per seq as FRR applies them (the running-config\'s other entries and matches stay)', () => {
  const A = query.loadStates(path.join(ROOT, 'demo', 'bgp-lp', 'frameA.json'));
  const PP = require('../policy-parse.js');
  A.r1.policy_config = PP.parse(['ip prefix-list ONLY8 seq 5 permit 8.8.8.0/24', 'route-map LOW-LP permit 10', ' match ip address prefix-list ONLY8',
    ' set local-preference 50', 'route-map LOW-LP permit 20', 'router bgp 65001', ' neighbor 10.10.0.20 route-map LOW-LP in']);
  // the plan re-enters seq 10 to change the value only: its match line stays -> 8.8.8.0/24 is taken by seq 10
  let r = explainPlan(A, 'r1', 'route-map LOW-LP permit 10\n set local-preference 90', { prefix: '8.8.8.0/24' });
  let s = r.lines.filter((x) => x.line === 'set local-preference 90')[0];
  assert.doesNotMatch(s.because, /does not take/, s.because);
  // a plan prefix-list line with the same seq replaces that entry: 8.8.8.0/24 is no longer matched by seq 10
  r = explainPlan(A, 'r1', 'ip prefix-list ONLY8 seq 5 permit 9.9.9.0/24\nroute-map LOW-LP permit 10\n set local-preference 90', { prefix: '8.8.8.0/24' });
  s = r.lines.filter((x) => x.line === 'set local-preference 90')[0];
  assert.match(s.because, /this entry does not take 8\.8\.8\.0\/24: route-map LOW-LP seq 20 permit/, s.because);
});

test('an OSPF router-id line: not_linked unless a duplicate router ID is listed as wrong', () => {
  const r = explainPlan(q12(), 'r1', 'router ospf\n ospf router-id 10.10.0.10', {});
  assert.equal(tagOf(r, 'ospf router-id 10.10.0.10'), 'not_linked');
  const st = q12(); st.r1.ospf_router_id = '9.9.9.9'; st.r3.ospf_router_id = '9.9.9.9';
  st.r1.ospf_routes = {}; st.r3.ospf_routes = {};
  const d = explainPlan(st, 'r1', 'router ospf\n ospf router-id 1.1.1.1', {});
  assert.equal(tagOf(d, 'ospf router-id 1.1.1.1'), 'fixes');
});

// ---- real captures (test/fixtures/plan-real): the broken labs of the three examples ----------------------------------
const REAL = (q) => query.loadStates(path.join(__dirname, 'fixtures', 'plan-real', q + '.json'));
const PROB = (q) => query.loadProblem(path.join(ROOT, 'examples', q));

test('real q12: the area lines fix what is wrong, the floating static route is for the check\'s backup condition', () => {
  const r = explainPlan(REAL('q12-ospf-static'), 'r1', Q12_FIX, { problem: PROB('q12-ospf-static') });
  assert.equal(tagOf(r, 'no network 10.11.0.0/24 area 1'), 'fixes');
  assert.equal(tagOf(r, 'network 10.11.0.0/24 area 0'), 'fixes');
  assert.equal(tagOf(r, 'ip route 3.3.3.3/32 10.10.0.20 120'), 'requirement');
});

test('real q3: the network line fixes the missing adjacency; the router-id line is not linked', () => {
  const r = explainPlan(REAL('q3-ospf'), 'r1', 'router ospf\n ospf router-id 10.10.0.10\n network 10.10.0.0/24 area 0', { problem: PROB('q3-ospf') });
  assert.equal(tagOf(r, 'network 10.10.0.0/24 area 0'), 'fixes');
  assert.equal(tagOf(r, 'ospf router-id 10.10.0.10'), 'not_linked');
});

test('real q21: the route-map is bound from the collected running-config; 90 is shown next to 100 > 50', () => {
  const r = explainPlan(REAL('q21-bgp-lp'), 'r1', 'route-map LOW-LP permit 10\n set local-preference 90', { problem: PROB('q21-bgp-lp') });
  const s = r.lines.filter((x) => x.line === 'set local-preference 90')[0];
  assert.equal(s.tag, '?');
  assert.match(s.because, /routes from 10\.10\.0\.20 for 8\.8\.8\.0\/24: LocPrf now 50; the comparison now: LocPrf 100 > 50/);
});

test('checks[]: each condition met now or not, with the lines tied to it (real q12 / q21)', () => {
  const r = explainPlan(REAL('q12-ospf-static'), 'r1', Q12_FIX, { problem: PROB('q12-ospf-static') });
  assert.equal(r.checks.length, 3);
  assert.deepEqual(r.checks.map((c) => c.met_now), [false, false, false]);
  assert.deepEqual(r.checks.map((c) => c.lines), [[2, 3], [2, 3], [4]], 'eth2 conditions <- the area lines; the eth1 route <- the static');
  const q = explainPlan(REAL('q21-bgp-lp'), 'r1', 'route-map LOW-LP permit 10\n set local-preference 90', { problem: PROB('q21-bgp-lp') });
  const best = q.checks.filter((c) => !c.met_now)[0];
  assert.ok(best && /best/.test(JSON.stringify(best.condition)), 'the best-path condition is not met now');
  assert.deepEqual(best.lines, [], 'no line of the plan is tied to it (the route-map line is ?)');
  const panel = require('../xray-node-panel.js').toHtml(REAL('q12-ospf-static').r1, { figure: true, plan: r });
  assert.match(panel, /The check now/);
  assert.match(panel, /✕ not met<\/span> r1 routing_table some prefix=3\.3\.3\.3\/32 out_iface=eth1 <span class="xnp-plan-why">← ip route 3\.3\.3\.3\/32 10\.10\.0\.20 120<\/span>/);
  assert.doesNotMatch(JSON.stringify(explainPlan(REAL('q12-ospf-static'), 'r1', Q12_FIX, {})), /"checks"/, 'no problem, no checks');
});

test('no policy_config in the state (the collector default): a route-map line not bound in the plan says how to tie it', () => {
  const st = REAL('q21-bgp-lp'); delete st.r1.policy_config;
  const r = explainPlan(st, 'r1', 'route-map LOW-LP permit 10\n set local-preference 90', { prefix: '8.8.8.0/24' });
  const s = r.lines.filter((x) => x.line === 'set local-preference 90')[0];
  assert.equal(s.tag, '?');
  assert.match(s.because, /only when the collector ran with --policy-config; add the neighbor line to the plan to tie it/);
  const b = explainPlan(st, 'r1', 'route-map LOW-LP permit 10\n set local-preference 90\nrouter bgp 65001\n neighbor 10.10.0.20 route-map LOW-LP in', { prefix: '8.8.8.0/24' });
  assert.match(b.lines.filter((x) => x.line === 'set local-preference 90')[0].because, /LocPrf now 50; the comparison now: LocPrf 100 > 50/, 'bound from the plan alone');
});
