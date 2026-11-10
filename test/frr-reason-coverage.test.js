// frr-reason-coverage.test.js — every selectionReason string FRR's bgpd can put on a best path, through the views.
// Run: node --test        (from the repo root; Node >= 18, no dependencies)
//
// The list is bgp_path_selection_reason2str() in FRR's bgpd/bgp_route.c (read on 2026-11-05 at the tags frr-8.4 and
// frr-10.7.1): 10.7.1 has these 28 strings; 8.4 has 25 of them (no "Admin Distance", "Accept Own", "AIGP").
// Recorded FRR 8.4 and 10.7 output with some of them: test/fixtures/bestpath-frr-real. For each reason the best path of a
// two-path table whose visible attributes tie (test/fixtures/bestpath-frr/older-path.json) or of an ECMP table
// (multipath.json) is given that reason, and the test checks:
//   - xray-core.js: the Best-Path box text (and the ECMP box in English and Japanese);
//   - xray-api.js:  the gallery Best-Path box text and the step highlighted in the FRR best-path order legend.
'use strict';
var test = require('node:test');
var assert = require('node:assert');
var fs = require('fs');
var path = require('path');
var vm = require('vm');
var clab = require('../clab-collect.js');

var ROOT = path.join(__dirname, '..');
var FIX = path.join(__dirname, 'fixtures', 'bestpath-frr');

// reason -> step it names in the legend of xray-api.js ('' = not a step of that legend)
var REASONS = {
  'Nothing to Select': '',
  'First path received': '',
  'EVPN Sticky Mac': '',
  'EVPN sequence number': '',
  'EVPN lower IP': '',
  'EVPN local ES path': '',
  'EVPN non proxy': '',
  'Admin Distance': '',
  'Weight': 'Weight',
  'Local Pref': 'LocPrf',
  'Accept Own': '',
  'Local Route': 'Local route',
  'AIGP': '',
  'Confederation based AS Path': 'AS-Path',
  'AS Path': 'AS-Path',
  'Origin': 'Origin',
  'MED': 'MED',
  'Peer Type': 'eBGP&gt;iBGP',
  'Confed Peer Type': 'eBGP&gt;iBGP',
  'IGP Metric': 'IGP metric',
  'Older Path': 'Older Path*',
  'Router ID': 'Router ID',   // nx_bp_tie_order (2026-11-09): FRR bgp_path_info_cmp - Router ID always, Older Path only between eBGP paths
  'Cluster length': '',
  'Path Staleness': '',
  'Locally configured route': '',
  'Neighbor IP': 'Neighbor IP',
  'Nothing left to compare': '',
  'Invalid (internal error)': ''
};
var NO_DECIDER = /^(First path received|Nothing to Select)$/;   // not a step: the generic tie text is shown
var NO_STEP = /^Nothing left to compare$/;                       // every step tied: no step is named as the decider

// ---- xray-core.js functions (cut out by name, as test/bestpath-frr.test.js does) ---------------------------
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
var NAMES = ['_escapeHtml', 'XRAY_BGP_CRITERIA', 'xrayBgpOriginChar', 'xrayBgpOriginRank', 'xrayBgpNum', 'xrayBgpNeighborAS',
  '_xrayAsPathLen', '_xrayBgpTieText', 'xrayBgpDecision', 'xrayBgpChainHtml', 'xrayBgpBracketEnabled', 'xrayBgpFrrReason', 'xrayBgpReasonHtml', '_xrayBgpKey',
  '_XRAY_ECMP_COLORS', '_xrayEcmpIpNum', '_xrayEcmpColorMap', '_xrayEcmpOf', '_xrayEcmpJa', '_xrayEcmpReasonHtml'];
var core = { window: {}, String: String, Number: Number, Math: Math, Object: Object, Array: Array, JSON: JSON, parseInt: parseInt, isNaN: isNaN };
vm.createContext(core);
vm.runInContext(NAMES.map(cut).join('\n'), core, { filename: 'xray-core.js (Best-Path functions)' });

// ---- xray-api.js functions (inside its IIFE: cut out by text) ----------------------------------------------
var API_SRC = fs.readFileSync(path.join(ROOT, 'xray-api.js'), 'utf8');
function apiCut(head) {
  var a = API_SRC.indexOf(head);
  if (a < 0) throw new Error('xray-api.js: ' + head.trim() + ' not found');
  return API_SRC.slice(a, API_SRC.indexOf('\n  }\n', a) + 4);
}
var api = { String: String, Object: Object, _lastState: null, _bgpChain: function () { return ''; } };
vm.createContext(api);
vm.runInContext([
  apiCut('  function _esc('),
  apiCut('  function _bgpReason('),
  API_SRC.slice(API_SRC.indexOf('  var _BGP_FRR_REASON_STEP = {'), API_SRC.indexOf('  function _bgpFrrReasonStep(')),
  apiCut('  function _bgpFrrReasonStep('),
  apiCut('  function _bgpIsIos(')
].join('\n') + '\nthis._bgpReason = _bgpReason; this._bgpFrrReasonStep = _bgpFrrReasonStep;', api, { filename: 'xray-api.js (Best-Path functions)' });

// ---- helpers --------------------------------------------------------------------------------------------
function rowsWith(fixture, reason) {
  var bgp = JSON.parse(fs.readFileSync(path.join(FIX, fixture + '.json'), 'utf8'));
  bgp.routes[Object.keys(bgp.routes)[0]].forEach(function (p) { if (p.selectionReason) p.selectionReason = reason; });
  var st = clab.collectFromJson({ node: 'r1', proto: 'bgp', bgpConfigured: true, bgp: bgp });
  return st.bgp_routes.map(function (r) {
    var o = JSON.parse(JSON.stringify(r));
    if ((o.locprf == null || o.locprf === '') && o.local_pref != null && o.local_pref !== '') o.locprf = String(o.local_pref);
    if (!o.nexthop && o.next_hop) o.nexthop = o.next_hop;
    return o;
  });
}
function text(html) {
  return html.replace(/<\/?[a-z][^>]*>/gi, ' ').replace(/&gt;/g, '>').replace(/&lt;/g, '<').replace(/\s+/g, ' ').trim();
}
function expectTie(t, reason) {
  if (NO_DECIDER.test(reason)) assert.match(t, /all (visible )?attributes equal — FRR decides by a step the table does not show \(eBGP > iBGP .*Older Path, between eBGP paths only .*Router ID\)/, t);
  else if (NO_STEP.test(reason)) {
    assert.match(t, /no step decided \(FRR: Nothing left to compare ?\)/, t);
    assert.doesNotMatch(t, /best path by|Older Path/, t);
  } else assert.ok(t.indexOf('all visible attributes equal — best path by ' + reason + ' (FRR)') >= 0, t);
}

test('the reason list has the 28 strings of FRR 10.7.1', function () {
  assert.strictEqual(Object.keys(REASONS).length, 28);
});

Object.keys(REASONS).forEach(function (reason) {
  test('FRR reason "' + reason + '": xray-core.js Best-Path box', function () {
    var rows = rowsWith('older-path', reason);
    var dec = core.xrayBgpDecision(rows);
    assert.strictEqual(dec.kind, 'tie');
    expectTie(text(core.xrayBgpReasonHtml(core._xrayBgpKey(rows[0]), dec, rows)), reason);
  });

  test('FRR reason "' + reason + '": xray-core.js ECMP box (en, ja)', function () {
    var rows = rowsWith('multipath', reason);
    var dec = core.xrayBgpDecision(rows), key = core._xrayBgpKey(rows[0]);
    var named = !NO_DECIDER.test(reason) && !NO_STEP.test(reason);
    core.window._xrayLang = 'en';
    var en = text(core.xrayBgpReasonHtml(key, dec, rows));
    core.window._xrayLang = 'ja';
    var ja = text(core.xrayBgpReasonHtml(key, dec, rows));
    delete core.window._xrayLang;
    if (named) {
      assert.ok(en.indexOf('was picked by ' + reason + " (FRR's last tie-breaker)") >= 0, en);
      assert.ok(ja.indexOf('は ' + reason + ' (FRR の最後の決め手) で選んだ') >= 0, ja);
    } else {
      assert.ok(en.indexOf('was picked by FRR.') >= 0, en);
      assert.ok(ja.indexOf('は FRR が選んだ。') >= 0, ja);
    }
  });

  test('FRR reason "' + reason + '": xray-api.js Best-Path box and legend step', function () {
    var rows = rowsWith('older-path', reason);
    var dec = core.xrayBgpDecision(rows);
    expectTie(text(api._bgpReason(core._xrayBgpKey(rows[0]), dec)), reason);
    assert.strictEqual(api._bgpFrrReasonStep(dec), REASONS[reason]);
  });
});

test('xray-api.js: every legend step a reason maps to is in the FRR order legend', function () {
  var m = /var _BGP_FRR_ORDER = (\[[^\]]*\]);/.exec(API_SRC);
  var order = JSON.parse(m[1].replace(/'/g, '"'));
  Object.keys(REASONS).forEach(function (r) { if (REASONS[r]) assert.ok(order.indexOf(REASONS[r]) >= 0, r + ' -> ' + REASONS[r]); });
});

test('xray-api.js: an IOS-XE node gets no FRR legend step from a reason', function () {
  api._lastState = { nos: 'ios-xe' };
  try { assert.strictEqual(api._bgpFrrReasonStep({ best: { reason: 'Older Path' } }), ''); }
  finally { api._lastState = null; }
});

// IOS-XE prints no reason: the IOS-XE collector infers one from the printed columns (e.g. "Peer Type", eBGP over iBGP).
// On an IOS-XE node the views must say it is inferred, not label it "(FRR)" as if the router had reported it.
test('IOS-XE node: an inferred reason is labelled as network-xray\'s inference, not "(FRR)" (xray-core.js and xray-api.js)', function () {
  var rows = rowsWith('older-path', 'Peer Type');
  var dec = core.xrayBgpDecision(rows), key = core._xrayBgpKey(rows[0]);
  core.window._lastXrayState = { nos: 'ios-xe' };
  api._lastState = { nos: 'ios-xe' };
  try {
    var c = text(core.xrayBgpReasonHtml(key, dec, rows)), a = text(api._bgpReason(key, dec));
    [c, a].forEach(function (t) {
      assert.ok(t.indexOf('best path by Peer Type (inferred by network-xray from the IOS-XE table; IOS-XE does not report a reason)') >= 0, t);
      assert.ok(t.indexOf('(FRR)') < 0, t);
    });
  } finally { delete core.window._lastXrayState; api._lastState = null; }
  // an FRR node keeps FRR's own label
  assert.ok(text(core.xrayBgpReasonHtml(key, dec, rows)).indexOf('best path by Peer Type (FRR)') >= 0);
});
