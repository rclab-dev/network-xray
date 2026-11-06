// srl-ospf-states.test.js — SR Linux OSPF neighbors (`info from state network-instance default protocols ospf
// instance default area * | as json`) across every adjacency state and the usual layouts: the per-peer
// keys and the per-link rows must carry the state srl reported, in the spelling the engine compares against.
// Run: node --test        (from the repo root; Node >= 18, no dependencies)
//
// The json below starts from the bundled real capture fixtures/srl-collect-sample/r1 (r1 facing r2 on
// ethernet-1/1.0) and only changes the area / interface / neighbor entries. States are given back in FRR
// spelling (Full, 2-Way, Init, ExStart, Exchange, Loading, Down), as the FRR and IOS-XE collectors do.
'use strict';
var test = require('node:test');
var assert = require('node:assert');
var fs = require('fs');
var path = require('path');
var vm = require('vm');
var srl = require('../clab-srl-collect.js');

var ROOT = path.join(__dirname, '..');
var SAMPLE = path.join(ROOT, 'fixtures', 'srl-collect-sample', 'r1');
var AREA_FILE = path.join(SAMPLE, 'network_instance_default_protocols_ospf_instance_default_area.json');

// The engine's own state order and colors, read from xray-core.js (so a spelling drift on either side fails here).
var CORE = fs.readFileSync(path.join(ROOT, 'xray-core.js'), 'utf8');
var ORDER = JSON.parse(/var _ord = (\[[^\]]*\]);/.exec(CORE)[1]);
var engine = (function () {
  var m = /function _xrayOspfNbrWord[\s\S]*?\nfunction _xrayOspfNbrColor\(st, role\) \{[\s\S]*?\n\}\n/.exec(CORE);
  assert.ok(m, 'xray-core.js: neighbor word / color helpers found');
  var b = /function _xrayOspfStateWord\(st\) \{[\s\S]*?\n\}\n\nfunction _xrayOspfBucket\(fsm\) \{[\s\S]*?\n\}\n/.exec(CORE);
  assert.ok(b, 'xray-core.js: the state bucket (tunnel line) helpers found');
  var ctx = {}; vm.runInNewContext(m[0] + b[0] + '\nthis.word = _xrayOspfNbrWord; this.ok = _xrayOspfNbrOk; this.color = _xrayOspfNbrColor; this.bucket = _xrayOspfBucket;', ctx);
  return ctx;
})();
var GREEN = '#39ff14', RED = '#ff4444', ORANGE = '#ff8c00';

function clone(x) { return JSON.parse(JSON.stringify(x)); }
var REAL = JSON.parse(fs.readFileSync(AREA_FILE, 'utf8'));
var REAL_IF = REAL.area[0].interface.filter(function (i) { return i['interface-name'] === 'ethernet-1/1.0'; })[0];
var REAL_NB = REAL_IF.neighbor[0];

// one neighbor entry in the real shape, with another state / router-id
function nbr(state, rid, addr) {
  var n = clone(REAL_NB); n['adjacency-state'] = state;
  if (rid) n['router-id'] = rid;
  if (addr) n.address = addr;
  return n;
}
// one interface entry in the real shape, with its own name and neighbor list
function iface(name, neighbors) {
  var i = clone(REAL_IF); i['interface-name'] = name;
  i['neighbor-count'] = neighbors.length;
  if (neighbors.length) i.neighbor = neighbors; else delete i.neighbor;
  return i;
}
function area(interfaces, id) { var a = clone(REAL.area[0]); a.interface = interfaces; if (id) a['area-id'] = id; return a; }

// replay the real capture, with the OSPF area answer swapped
function build(ospf, adj) {
  var base = srl.dirFetch(SAMPLE);
  var fetch = function (p) { return p.indexOf('protocols ospf') >= 0 ? ospf : base(p); };
  return srl.buildState(fetch, 'r1', adj || { 'ethernet-1/1.0': 'r2' }, 'ospf');
}
function one(state) { return build({ name: 'default', area: [area([iface('ethernet-1/1.0', [nbr(state)])])] }); }

// every word the collector puts out must be an engine word (or "None" = no neighbor at all)
function assertWords(st) {
  Object.keys(st).filter(function (k) { return /_neighbor_state$/.test(k); }).forEach(function (k) {
    assert.ok(st[k] === 'None' || ORDER.indexOf(st[k]) > 0, k + ' = ' + st[k] + ' is an engine state word');
  });
  (st.peer_links || []).forEach(function (r) {
    assert.ok(ORDER.indexOf(r.state) > 0, 'peer_links ' + r.iface + ' state = ' + r.state + ' is an engine state word');
  });
}

test('fixture: the bundled capture is the shape these tests copy (one Full neighbor on ethernet-1/1.0)', function () {
  assert.strictEqual(REAL_NB['adjacency-state'], 'full');
  var st = build(REAL);
  assert.strictEqual(st.r2_has_full, true);
  assert.strictEqual(st.r2_neighbor_state, 'Full');
  assert.strictEqual(st.peer_links[0].state, 'Full');
  assertWords(st);
});

// srl adjacency-state -> [word, has_full, color]
var CASES = [
  ['full', 'Full', true, GREEN],
  ['two-way', '2-Way', false, ORANGE],
  ['init', 'Init', false, ORANGE],
  ['exstart', 'ExStart', false, GREEN],
  ['exchange', 'Exchange', false, GREEN],
  ['loading', 'Loading', false, GREEN],
  ['down', 'Down', false, RED]
];
CASES.forEach(function (c) {
  test('state ' + c[0] + ' -> ' + c[1], function () {
    var st = one(c[0]);
    assertWords(st);
    assert.strictEqual(st.r2_iface, 'ethernet-1/1.0');
    assert.strictEqual(st.r2_proto, 'ospf');
    assert.strictEqual(st.r2_has_full, c[2]);
    assert.strictEqual(st.r2_neighbor_state, c[1]);
    assert.strictEqual(st.peer_links.length, 1);
    assert.strictEqual(st.peer_links[0].state, c[1]);
    assert.strictEqual(st.peer_links[0].full, c[2]);
    assert.strictEqual(st.full_count, c[2] ? 1 : 0);
    assert.strictEqual(st.has_full, c[2]);
    assert.strictEqual(st.neighbor_state, c[2] ? 'Full' : 'None');
    assert.strictEqual(st.ospf_configured, true);
    assert.strictEqual(st.ospf_active_on_interface, c[2]);
    // the engine shows this word as-is and colors it as for an FRR router
    assert.strictEqual(engine.word(st.r2_neighbor_state), c[1]);
    assert.strictEqual(engine.color(engine.word(st.r2_neighbor_state)), c[3]);
  });
});

test('state spellings srl may print are read the same way (exchange-start, 2-way, upper case)', function () {
  assert.strictEqual(one('exchange-start').r2_neighbor_state, 'ExStart');
  assert.strictEqual(one('2-way').r2_neighbor_state, '2-Way');
  assert.strictEqual(one('TWO-WAY').r2_neighbor_state, '2-Way');
  assert.strictEqual(one('attempt').r2_neighbor_state, 'Attempt');
  var up = one('FULL');   // the word, has_full, the counts and the link row agree
  assert.strictEqual(up.r2_neighbor_state, 'Full');
  assert.strictEqual(up.r2_has_full, true);
  assert.strictEqual(up.full_count, 1);
  assert.strictEqual(up.peer_links[0].state, 'Full');
});

test('an unknown or missing adjacency-state reads as Down, never a made-up word', function () {
  ['', 'bogus', null, 7, undefined].forEach(function (v) {
    var n = nbr('full'); if (v === undefined) delete n['adjacency-state']; else n['adjacency-state'] = v;
    var st = build({ area: [area([iface('ethernet-1/1.0', [n])])] });
    assert.strictEqual(st.r2_has_full, false);
    assert.strictEqual(st.r2_neighbor_state, 'Down', JSON.stringify(v));
    assert.strictEqual(st.peer_links[0].state, 'Down');
    assertWords(st);
  });
});

test('several interfaces, one peer each, every state in two areas', function () {
  var adj = {}, ifs0 = [], ifs1 = [];
  CASES.forEach(function (c, i) {
    var ifn = 'ethernet-1/' + (i + 1) + '.0', peer = 'p' + (i + 1);
    adj[ifn] = peer;
    (i < 4 ? ifs0 : ifs1).push(iface(ifn, [nbr(c[0], (i + 2) + '.' + (i + 2) + '.' + (i + 2) + '.' + (i + 2), '10.0.' + i + '.2')]));
  });
  var st = build({ name: 'default', area: [area(ifs0), area(ifs1, '0.0.0.1')] }, adj);
  assertWords(st);
  CASES.forEach(function (c, i) {
    var peer = 'p' + (i + 1);
    assert.strictEqual(st[peer + '_iface'], 'ethernet-1/' + (i + 1) + '.0');
    assert.strictEqual(st[peer + '_neighbor_state'], c[1], peer);
    assert.strictEqual(st[peer + '_has_full'], c[2], peer);
    assert.strictEqual(st.peer_links[i].state, c[1]);
  });
  assert.strictEqual(st.full_count, 1);
  assert.strictEqual(st.peer_node, 'p1', 'the up peer is the main one');
});

test('several neighbors on one LAN interface: Full wins, else the furthest state', function () {
  var st = build({ area: [area([iface('ethernet-1/1.0', [nbr('two-way', '3.3.3.3'), nbr('full', '2.2.2.2'), nbr('init', '4.4.4.4')])])] });
  assert.strictEqual(st.r2_has_full, true);
  assert.strictEqual(st.r2_neighbor_state, 'Full');
  assert.strictEqual(st.peer_links[0].state, 'Full');

  st = build({ area: [area([iface('ethernet-1/1.0', [nbr('init', '4.4.4.4'), nbr('exchange', '2.2.2.2'), nbr('two-way', '3.3.3.3')])])] });
  assert.strictEqual(st.r2_has_full, false);
  assert.strictEqual(st.r2_neighbor_state, 'Exchange');
  assert.strictEqual(st.peer_links[0].state, 'Exchange');
  assertWords(st);
});

test('two links to one peer: a Full link keeps the per-peer keys, the other row keeps its own state', function () {
  var adj = { 'ethernet-1/1.0': 'r2', 'ethernet-1/2.0': 'r2' };
  var st = build({ area: [area([iface('ethernet-1/1.0', [nbr('full')]), iface('ethernet-1/2.0', [nbr('exstart')])])] }, adj);
  assert.strictEqual(st.r2_iface, 'ethernet-1/1.0');
  assert.strictEqual(st.r2_has_full, true);
  assert.strictEqual(st.r2_neighbor_state, 'Full');
  assert.deepStrictEqual(st.peer_links.map(function (r) { return [r.iface, r.state, r.full]; }),
    [['ethernet-1/1.0', 'Full', true], ['ethernet-1/2.0', 'ExStart', false]]);

  // reverse order: the later Full link takes over, its word is Full (not the earlier ExStart)
  st = build({ area: [area([iface('ethernet-1/2.0', [nbr('exstart')]), iface('ethernet-1/1.0', [nbr('full')])])] }, adj);
  assert.strictEqual(st.r2_iface, 'ethernet-1/1.0');
  assert.strictEqual(st.r2_neighbor_state, 'Full');

  // neither Full: the per-peer word follows the link the per-peer iface names
  st = build({ area: [area([iface('ethernet-1/1.0', [nbr('loading')]), iface('ethernet-1/2.0', [nbr('init')])])] }, adj);
  assert.strictEqual(st.r2_iface, 'ethernet-1/2.0');
  assert.strictEqual(st.r2_neighbor_state, 'Init');
  assert.deepStrictEqual(st.peer_links.map(function (r) { return r.state; }), ['Loading', 'Init']);
  assertWords(st);
});

test('no neighbors: OSPF interface up but no neighbor entry -> None / Down row', function () {
  var st = build({ area: [area([iface('ethernet-1/1.0', [])])] });
  assert.strictEqual(st.ospf_configured, true);
  assert.strictEqual(st.r2_iface, 'ethernet-1/1.0');
  assert.strictEqual(st.r2_has_full, false);
  assert.strictEqual(st.r2_neighbor_state, 'None');
  assert.strictEqual(st.peer_links[0].state, 'Down');
  assert.strictEqual(st.full_count, 0);
  assert.strictEqual(engine.color(engine.word(st.r2_neighbor_state)), RED);
  assertWords(st);

  // a neighbor on an interface that is not a clab link is not a peer
  st = build({ area: [area([iface('ethernet-1/9.0', [nbr('full')])])] });
  assert.strictEqual(st.r2_has_full, false);
  assert.strictEqual(st.r2_neighbor_state, 'None');
});

test('empty output: no area / empty object / null -> no OSPF, None, Down row', function () {
  [null, {}, { name: 'default' }, { area: [] }].forEach(function (o) {
    var st = build(o);
    assert.strictEqual(st.ospf_configured, false, JSON.stringify(o));
    assert.strictEqual(st.r2_neighbor_state, 'None');
    assert.strictEqual(st.r2_has_full, false);
    assert.strictEqual(st.peer_links[0].state, 'Down');
    assert.strictEqual(st.neighbor_state, 'None');
    assert.strictEqual(st.full_count, 0);
    assertWords(st);
  });
});

test('engine: 2-Way between DROthers is a normal state (no "(n/m Full)" tail), but its word stays orange like its line', function () {
  var st = one('two-way');
  assert.strictEqual(engine.ok(st.r2_neighbor_state, 'DROther'), true);
  assert.strictEqual(engine.ok(st.r2_neighbor_state, ''), false);
  assert.strictEqual(engine.color(st.r2_neighbor_state, 'DROther'), ORANGE);
  assert.strictEqual(engine.color(st.r2_neighbor_state, ''), ORANGE);
});
