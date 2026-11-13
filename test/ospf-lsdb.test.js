'use strict';
// The OSPF database and route table (v1.4): what clab-collect.js reads from FRR, and how route_lookup / lab_state use it to say
// why a destination has no OSPF route. Fixtures = FRR 10.7.1 output captured on a three-router lab (containerlab), one JSON per
// case: { r1: { ospf, database, self, route, rib }, r2: …, r3: … } = show ip ospf / database / database router self-originate /
// route / show ip route, each `… json`.
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
    out[n] = collector.collectFromJson({ node: n, proto: 'ospf', route: r.rib, ospfInfo: r.ospf, ospfDatabase: r.database, ospfSelf: r.self, ospfRoute: r.route });
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
  const st = states('duplicate-router-id');
  assert.deepEqual(q.routeLookup(st, 'r1', '3.3.3.3').why,
    ['r3 advertises 3.3.3.3/32 (area 0.0.0.0), but r3 and r2 have the same OSPF router ID 2.2.2.2: one router LSA replaces the other, so 3.3.3.3/32 is lost']);
  assert.deepEqual(texts(q.summarize(st).wrong), ['r2 and r3: the same OSPF router ID 2.2.2.2 (one router LSA replaces the other, so the prefixes of one of them are lost)']);
  assert.equal(q.ospfNeighbors(st, 'r3').wrong.length, 1, 'listed for each router that has the ID');
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
