// peer-type.test.js — the eBGP > iBGP step and the one-line answer (v1.8), against REAL FRR captures
// (test/fixtures/bestpath-frr-real/, FRR 8.4 and 10.7).
// Run: node --test        (from the repo root; Node >= 18, no dependencies)
//
// 1. clab-collect.js keeps FRR's pathFrom as bgp_routes[].peer_type (ebgp / ibgp; confed for a confederation peer).
// 2. The three best-path tables (xray-core.js, xray-api.js, xray-node-panel.js) give the same answer for every capture,
//    and the peer-type capture is decided by eBGP > iBGP in all three.
// 3. A path without peer_type (an older state file): the step is not compared, the words stay as they were.
// 4. why_path: the next hop's router name and the one-line summary.
'use strict';
var test = require('node:test');
var assert = require('node:assert');
var fs = require('fs');
var path = require('path');
var vm = require('vm');
var clab = require('../clab-collect.js');
var panel = require('../xray-node-panel.js');
var query = require('../scripts/xray-query.js');

var ROOT = path.join(__dirname, '..');
var FIX = path.join(__dirname, 'fixtures', 'bestpath-frr-real');
var VERSIONS = ['frr-8.4', 'frr-10.7'];
var STEPS = ['base', 'weight', 'local-pref', 'local-route', 'as-path', 'origin', 'med', 'peer-type', 'router-id', 'multipath', 'neighbor-ip'];

// ---- xray-core.js: the Best-Path functions, cut by name ----------------------------------------------------
var CORE_SRC = fs.readFileSync(path.join(ROOT, 'xray-core.js'), 'utf8');
function cut(name) {
  var m = new RegExp('^(function ' + name + '\\(|var ' + name + ' = )', 'm').exec(CORE_SRC);
  if (!m) throw new Error('xray-core.js: ' + name + ' not found');
  var start = m.index, end;
  if (m[1].indexOf('function') === 0) end = CORE_SRC.indexOf('\n}', start) + 2;
  else {
    var depth = 0, i = CORE_SRC.indexOf('=', start) + 1;
    for (; i < CORE_SRC.length; i++) {
      var c = CORE_SRC[i];
      if (c === '[' || c === '{' || c === '(') depth++;
      else if (c === ']' || c === '}' || c === ')') depth--;
      else if (c === ';' && depth === 0) break;
    }
    end = i + 1;
  }
  return CORE_SRC.slice(start, end);
}
var core = { window: {}, String: String, Number: Number, Math: Math, Object: Object, Array: Array, JSON: JSON, parseInt: parseInt, isNaN: isNaN };
vm.createContext(core);
vm.runInContext(['XRAY_BGP_CRITERIA', 'xrayBgpOriginChar', 'xrayBgpOriginRank', 'xrayBgpNum', 'xrayBgpNeighborAS', '_xrayAsPathLen',
  'xrayBgpDecision'].map(cut).join('\n'), core, { filename: 'xray-core.js (Best-Path functions)' });

// ---- xray-api.js: from its criteria table to the end of _bgpDecision (inside the IIFE: cut by text) ----------
var API_SRC = fs.readFileSync(path.join(ROOT, 'xray-api.js'), 'utf8');
var a0 = API_SRC.indexOf('  var _BGP_CRIT = ['), a1 = API_SRC.indexOf('  function _bgpDecision(');
assert.ok(a0 > 0 && a1 > a0, 'xray-api.js: the criteria table and _bgpDecision');
var api = { String: String, Math: Math };
vm.createContext(api);
vm.runInContext(API_SRC.slice(a0, API_SRC.indexOf('\n  }\n', a1) + 4) + '\nthis._bgpDecision = _bgpDecision;', api, { filename: 'xray-api.js (Best-Path functions)' });

function load(v, s) { return JSON.parse(fs.readFileSync(path.join(FIX, v, s + '.json'), 'utf8')); }
function collect(bgp) { return clab.collectFromJson({ node: 'r1', proto: 'bgp', bgpConfigured: true, bgp: bgp }); }
function usable(st) { return st.bgp_routes.filter(function (r) { return r.valid !== false; }); }
// xray-core.js reads LocPrf from `locprf` (xrayBuildBgpView copies it from local_pref)
function coreRows(st) {
  return usable(st).map(function (r) { var o = JSON.parse(JSON.stringify(r)); if (o.locprf == null && o.local_pref != null) o.locprf = String(o.local_pref); return o; });
}
function answer(dec) { return !dec ? null : dec.kind === 'decided' ? dec.criterion.label : dec.kind; }
function panelAnswer(st) {
  var html = panel.buildBgpView(usable(st), {}).decision;
  var m = /best path by <b>([^<]+)<\/b>/.exec(html);
  if (m) return m[1];
  if (/locally originated/.test(html)) return 'local';
  if (/MED not compared/.test(html)) return 'medskip';
  if (/all visible attributes equal/.test(html)) return 'tie';
  return '(unrecognised)';
}

VERSIONS.forEach(function (v) {
  test(v + ': the collector keeps FRR\'s pathFrom as peer_type', function () {
    STEPS.forEach(function (s) {
      var bgp = load(v, s), st = collect(bgp), paths = bgp.routes[Object.keys(bgp.routes)[0]];
      paths.forEach(function (p, i) {
        var own = p.weight === 32768;   // the router's own route: learned from no peer, no peer_type
        var want = own ? undefined : p.pathFrom === 'internal' ? 'ibgp' : p.pathFrom === 'external' ? 'ebgp' : undefined;
        assert.strictEqual(st.bgp_routes[i].peer_type, want, s + ' path ' + i);
      });
    });
  });

  STEPS.forEach(function (s) {
    test(v + ' ' + s + ': xray-core.js, xray-api.js and xray-node-panel.js give the same answer', function () {
      var st = collect(load(v, s));
      var c = answer(core.xrayBgpDecision(coreRows(st)));
      var a = answer(api._bgpDecision(usable(st)));
      var p = panelAnswer(st);
      assert.strictEqual(a, c, 'xray-api.js = xray-core.js');
      var derived = ['local', 'single', 'tie', 'medskip', 'ambiguous', 'nobest'].indexOf(c) < 0;
      if (derived) assert.strictEqual(p, c, 'xray-node-panel.js = xray-core.js');
      else if (c !== 'local') {   // not decided by the compared columns: the panel names FRR's own reason, as the others do
        var best = usable(st).filter(function (r) { return r.best; })[0];
        assert.strictEqual(p, best.reason, 'xray-node-panel.js names FRR\'s reason');
      }
      if (s === 'peer-type') assert.strictEqual(c, 'eBGP > iBGP', 'FRR: Peer Type');
    });
  });

  test(v + ' peer-type: without peer_type (an older state file) the step is not compared', function () {
    var st = collect(load(v, 'peer-type'));
    st.bgp_routes.forEach(function (r) { delete r.peer_type; });
    var dec = core.xrayBgpDecision(coreRows(st));
    assert.notStrictEqual(answer(dec), 'eBGP > iBGP');
    assert.ok(!dec.chain.some(function (x) { return x.crit.key === 'peer'; }), 'no eBGP > iBGP step in the chain');
    assert.notStrictEqual(answer(api._bgpDecision(usable(st))), 'eBGP > iBGP');
    assert.doesNotMatch(panel.buildBgpView(usable(st), {}).decision, /best path by <b>eBGP/);
  });

  test(v + ' why_path: the next hop\'s router and the one-line answer', function () {
    var others = { r2: { interfaces: { eth1: { ip: '10.10.0.20/24' } } }, r3: { interfaces: { eth1: { ip: '10.11.0.20/24' } } }, r4: { interfaces: { eth1: { ip: '10.12.0.20/24' } } } };
    function why(s) { var states = Object.assign({ r1: collect(load(v, s)) }, others); return query.whyPath(states, 'r1', '203.0.113.0/24'); }
    var w = why('peer-type');
    assert.strictEqual(w.selected.peer, 'r2');
    assert.strictEqual(w.candidates[0].peer, 'r4');
    assert.strictEqual(w.selected.peer_type, 'ebgp');
    assert.strictEqual(w.summary, 'r1 203.0.113.0/24 uses the path via r2 (10.10.0.20), AS 65002: eBGP beats iBGP (via r4 (10.12.0.20))');
    assert.strictEqual(why('local-pref').summary, 'r1 203.0.113.0/24 uses the path via r3 (10.11.0.20), AS 65003: LocPrf 200 > 100 (via r2 (10.10.0.20))');
    assert.match(why('local-route').summary, /^r1 203\.0\.113\.0\/24: r1 originates it itself/);
    assert.match(why('router-id').summary, /: the router reports Router ID$/);
    // without the other routers in the data: the next hop address, no name
    var lone = query.whyPath({ r1: collect(load(v, 'peer-type')) }, 'r1', '203.0.113.0/24');
    assert.strictEqual(lone.selected.peer, undefined);
    assert.match(lone.summary, /uses the path via 10\.10\.0\.20, AS 65002: eBGP beats iBGP \(via 10\.12\.0\.20\)$/);
  });
});

test('a confederation peer (AS_PATH starts with "( ... )", FRR says "external") is ranked with iBGP', function () {
  var bgp = load('frr-10.7', 'peer-type');
  var paths = bgp.routes[Object.keys(bgp.routes)[0]];
  paths[0].path = '(65010) 65002';
  var st = collect(bgp);
  assert.strictEqual(st.bgp_routes[0].peer_type, 'confed');
  assert.strictEqual(st.bgp_routes[1].peer_type, 'ibgp');
  var dec = core.xrayBgpDecision(coreRows(st));
  var step = dec.chain.filter(function (x) { return x.crit.key === 'peer'; })[0];
  assert.ok(step && step.status === 'tie', 'confed vs iBGP = a tie at eBGP > iBGP');
});

// ---- Cisco IOS-XE (real captures, test/fixtures/iosxe-real-bgp/): the `i` in the status column -------------
var ios = require('../clab-iosxe-collect.js');
var IOS_FILES = { ipInterface: 'show_ip_interface_brief.txt', route: 'show_ip_route.txt', bgpSummary: 'show_ip_bgp_summary.txt',
  bgp: 'show_ip_bgp.txt', protocols: 'show_ip_protocols.txt' };
function iosState(step) {
  var d = path.join(__dirname, 'fixtures', 'iosxe-real-bgp', step), t = {};
  Object.keys(IOS_FILES).forEach(function (k) { var f = path.join(d, IOS_FILES[k]); if (fs.existsSync(f)) t[k] = fs.readFileSync(f, 'utf8'); });
  return ios.run(t, 'r1', 'Ethernet0/1:r2,Ethernet0/2:r3,Ethernet0/3:r4', 'bgp', '');
}
function only(st) { return st.bgp_routes.filter(function (r) { return /^203\.0\.113\./.test(r.prefix); }); }

test('IOS-XE peer-type: the iBGP path (*>i) has peer_type ibgp, the other ebgp; the three tables agree', function () {
  var st = iosState('peer-type'), rows = only(st);
  assert.deepStrictEqual(rows.map(function (r) { return [r.next_hop, r.peer_type]; }), [['10.12.0.20', 'ibgp'], ['10.10.0.20', 'ebgp']]);
  // IOS did not prepend towards the iBGP peer: its empty AS_PATH wins before eBGP > iBGP is reached
  var c = answer(core.xrayBgpDecision(coreRows({ bgp_routes: rows })));
  assert.strictEqual(c, 'AS-Path');
  assert.strictEqual(answer(api._bgpDecision(rows.filter(function (r) { return r.valid !== false; }))), c);
  assert.strictEqual(panelAnswer({ bgp_routes: rows }), c);
});

test('IOS-XE local-route: the router\'s own route (next hop 0.0.0.0) gets no peer_type', function () {
  var rows = only(iosState('local-route'));
  var own = rows.filter(function (r) { return r.next_hop === '0.0.0.0'; })[0];
  assert.ok(own, 'the local route is in the table');
  assert.strictEqual(own.peer_type, undefined);
});
