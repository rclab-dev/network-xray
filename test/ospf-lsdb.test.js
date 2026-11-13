'use strict';
// The OSPF database and route table (v1.4): what clab-collect.js reads from FRR, and how route_lookup / lab_state use it to say
// why a destination has no OSPF route. Fixtures = FRR 10.7.1 output captured on a three-router lab (containerlab), one JSON per
// case: { r1: { ospf, database, self, route, routers, rib }, r2: …, r3: … } = show ip ospf / database / database router
// self-originate / route / database router / show ip route, each `… json`.
//   r1 - r2 - r3 triangle in area 0 (+ a second r1 - r3 link in area 1); loopbacks 1.1.1.1 / 2.2.2.2 / 3.3.3.3; r3 redistributes
//   the static 192.0.2.0/24. Cases: baseline, r2 loopback network statement removed, r2 loopback put in area 2, r3 router ID set
//   to 2.2.2.2 (same as r2), OSPF routes kept out of r1's RIB by a route-map, r3's redistribute static removed.
// Run: node --test        (from the repo root; Node >= 18, no dependencies)
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const collector = require('../clab-collect.js');
const q = require('../scripts/xray-query.js');

const DIR = path.join(__dirname, 'fixtures', 'frr-ospf-lsdb');
function states(name) {
  const raw = JSON.parse(fs.readFileSync(path.join(DIR, name + '.json'), 'utf8'));
  const out = {};
  for (const n of Object.keys(raw)) {
    const r = raw[n];
    out[n] = collector.collectFromJson({ node: n, proto: 'ospf', route: r.rib, ospfInfo: r.ospf, ospfDatabase: r.database, ospfSelf: r.self, ospfRoute: r.route, ospfRouters: r.routers });
  }
  return out;
}
const texts = (l) => l.map((w) => w.text);

test('collector: router ID, own stub networks, the database without MaxAge LSAs, OSPF route types', () => {
  const b = states('baseline');
  assert.equal(b.r2.ospf_router_id, '2.2.2.2');
  assert.deepEqual(b.r2.ospf_stubs, [{ prefix: '2.2.2.2/32', area: '0.0.0.0' }]);
  assert.deepEqual(b.r1.ospf_lsdb.filter((l) => l.type === 'external').map((l) => [l.prefix, l.adv_router, l.metric_type]), [['192.0.2.0/24', '3.3.3.3', 'E2']]);
  assert.deepEqual(b.r1.ospf_routes['2.2.2.2/32'], { type: 'N', area: '0.0.0.0', cost: 10, adv: ['2.2.2.2'] });
  // redistribute removed: the external LSAs still in the database are at MaxAge (being flushed) -> left out
  assert.deepEqual(states('redistribute-removed').r1.ospf_lsdb.filter((l) => l.type === 'external'), []);
  assert.equal(states('loopback-in-area-2').r1.ospf_routes['2.2.2.2/32'].type, 'N IA');
  assert.deepEqual(states('network-statement-removed').r2.ospf_stubs, [], 'r2 no longer has 2.2.2.2/32 in its router LSA');
});

test('route_lookup: nothing to explain when the OSPF route is there', () => {
  const r = q.routeLookup(states('baseline'), 'r1', '2.2.2.2');
  assert.equal(r.why, undefined);
  assert.equal(r.route.prefix, '2.2.2.2/32');
});

test('route_lookup why: a loopback that is not advertised (network statement removed)', () => {
  const r = q.routeLookup(states('network-statement-removed'), 'r1', '2.2.2.2');
  assert.equal(Object.keys(r)[0], 'why', 'the reason comes first');
  assert.deepEqual(r.why, ['r2 has 2.2.2.2/32 on lo but does not advertise it in OSPF (no network statement or ip ospf area for lo)']);
});

test('route_lookup why: an inter-area route (the loopback is in area 2)', () => {
  assert.deepEqual(q.routeLookup(states('loopback-in-area-2'), 'r1', '2.2.2.2').why, ['2.2.2.2/32 is an inter-area route here (N IA, advertised by 2.2.2.2)']);
});

test('route_lookup why and wrong: a duplicate router ID', () => {
  // r2 and r3 both 2.2.2.2: whichever router LSA arrived last stays, so either 2.2.2.2/32 or 3.3.3.3/32 is lost (in this
  // capture r3's LSA stayed and r2's loopback is gone); the lookup of the lost one says why
  const st = states('duplicate-router-id');
  const lost = ['2.2.2.2', '3.3.3.3'].map((d) => q.routeLookup(st, 'r1', d)).filter((r) => r.why);
  assert.equal(lost.length, 1, 'one of the two loopbacks is lost');
  assert.match(lost[0].why[0], /^r[23] advertises [23]\.[23]\.[23]\.[23]\/32 \(area 0\.0\.0\.0\), but r[23] and r[23] have the same OSPF router ID 2\.2\.2\.2: one router LSA replaces the other/);
  assert.deepEqual(texts(q.summarize(st).wrong), ['r2 and r3: the same OSPF router ID 2.2.2.2 (one router LSA replaces the other, so the prefixes of one of them are lost)']);
  assert.equal(q.ospfNeighbors(st, 'r3').wrong.length, 1, 'listed for each router that has the ID');
  // r1 holds a single router LSA for 2.2.2.2, and in this capture it carries r3's loopback
  assert.deepEqual(st.r1.ospf_router_lsas.filter((l) => l.adv_router === '2.2.2.2' && l.area === '0.0.0.0').map((l) => l.stubs), [['3.3.3.3/32', '10.0.23.0/24']]);
});

test('route_lookup why and wrong: an OSPF route the RIB did not install', () => {
  const st = states('rib-filter');
  assert.deepEqual(q.routeLookup(st, 'r1', '2.2.2.2').why, ['r1 has the OSPF route 2.2.2.2/32 but it is not in the routing table (no better route either: filtered)']);
  assert.deepEqual(texts(q.summarize(st).wrong), ['r1 2.2.2.2/32: OSPF has this route but it is not in the routing table (no better route either: filtered)']);
});

test('route_lookup why: a static route that is not redistributed', () => {
  assert.deepEqual(q.routeLookup(states('redistribute-removed'), 'r1', '192.0.2.1').why,
    ['r3 has a static route 192.0.2.0/24 but no AS-external LSA for it is in the OSPF database (not redistributed)']);
});

test('a state without the OSPF database (older collector) gets no why', () => {
  const st = states('network-statement-removed');
  for (const n of Object.keys(st)) { delete st[n].ospf_router_id; delete st[n].ospf_stubs; delete st[n].ospf_lsdb; delete st[n].ospf_routes; }
  assert.equal(q.routeLookup(st, 'r1', '2.2.2.2').why, undefined);
});

// the page's LSDB panel (xray-core.js xrayUpdateLsdb): the LSAs themselves when the state has the database
const vm = require('node:vm');
function lsdbPanel(st, live) {
  const rows = [], hd = { textContent: 'LSDB', style: {} };
  const el = { style: {}, querySelector: (q) => (q === '.lsdb-hd' ? hd : null), querySelectorAll: () => [],
    appendChild: (d) => rows.push(d) };
  const doc = { getElementById: (id) => (id === 'de-lsdb' ? el : null), querySelector: () => null, querySelectorAll: () => [],
    createElement: () => ({ style: {} }), addEventListener() {}, head: { appendChild() {} },
    body: { classList: { add() {}, remove() {}, toggle() {}, contains: () => false } }, documentElement: { getAttribute: () => 'en' } };
  const ctx = { document: doc, console: { log() {}, warn() {}, error() {} }, setTimeout: () => 0, clearTimeout() {}, setInterval: () => 0,
    clearInterval() {}, requestAnimationFrame: () => 0, navigator: { userAgent: '' }, location: { search: '', href: '', hash: '' },
    localStorage: { getItem: () => null, setItem() {} }, getComputedStyle: () => ({}), addEventListener() {} };
  ctx.window = ctx; ctx.self = ctx;
  if (live) ctx.LIVE_STATES = live;
  vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'xray-core.js'), 'utf8'), ctx, { filename: 'xray-core.js' });
  ctx.xrayUpdateLsdb(Object.assign({ ospf_active_on_interface: true, has_full: true, full_count: 2 }, st), {});
  return { head: hd.textContent, rows: rows.map((d) => d.textContent) };
}

test('LSDB panel: a small table (prefix, LSA, from) - every router LSA stub, the inter-area routes OSPF uses, AS-external, counts in the header', () => {
  const sq = (r) => r.replace(/ +/g, ' ').trim();
  const p = lsdbPanel(states('baseline').r1);
  assert.match(p.head, /^LSDB R\d+·N\d+·S\d+·E1$/);
  assert.equal(sq(p.rows[0]), 'Prefix LSA From', 'a heading row');
  const rows = p.rows.map(sq);
  assert.ok(rows.includes('1.1.1.1/32 router own'), rows.join(' | '));
  assert.ok(rows.includes('2.2.2.2/32 router 2.2.2.2'), 'a router whose state the page does not have: its router ID');
  assert.ok(rows.includes('192.0.2.0/24 external E2 3.3.3.3'));
  assert.ok(!rows.some((r) => / inter-area /.test(r)), 'no inter-area route here: the summaries of the other ABR are not listed');
  const ia = lsdbPanel(states('loopback-in-area-2').r1).rows.map(sq);
  assert.ok(ia.includes('2.2.2.2/32 inter-area 2.2.2.2'), 'the inter-area route OSPF uses');
  // r2's loopback without a network statement: no LSA has it any more
  assert.ok(!lsdbPanel(states('network-statement-removed').r1).rows.some((r) => r.startsWith('2.2.2.2/32')));
});

test('LSDB panel: the node name instead of the router ID when the page has that node (window.LIVE_STATES)', () => {
  const st = states('baseline');
  const p = lsdbPanel(st.r1, st);
  assert.ok(p.rows.map((r) => r.replace(/ +/g, ' ').trim()).includes('2.2.2.2/32 router r2'));
});

test('LSDB panel: a state without the database keeps the old rows (OSPF routes) and the plain header', () => {
  const st = states('baseline').r1;
  delete st.ospf_router_lsas; delete st.ospf_lsdb;
  const p = lsdbPanel(st);
  assert.equal(p.head, 'LSDB');
  assert.ok(p.rows.includes('2.2.2.2/32'));
});
