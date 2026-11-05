// bestpath-frr-real.test.js — the Best-Path box against REAL FRR captures (test/fixtures/bestpath-frr-real/).
// Run: node --test        (from the repo root; Node >= 18, no dependencies)
//
// The same path as test/bestpath-frr.test.js (FRR json -> clab-collect.js collectFromJson -> xray-core.js
// xrayBgpDecision + xrayBgpReasonHtml), but the inputs are r1's own `show ip bgp json` from a containerlab lab,
// one capture per best-path step, with FRR 8.4 and FRR 10.7 (see the fixtures' README for how they were made).
// For every capture: the view marks FRR's best path, and names FRR's selectionReason as the decider.
// The BGP summary capture checks that peers which are not Established keep FRR's state words.
'use strict';
var test = require('node:test');
var assert = require('node:assert');
var fs = require('fs');
var path = require('path');
var vm = require('vm');
var clab = require('../clab-collect.js');

var FIX = path.join(__dirname, 'fixtures', 'bestpath-frr-real');
var VERSIONS = ['frr-8.4', 'frr-10.7'];

// ---- load the Best-Path functions of xray-core.js ---------------------------------------------------------

var CORE_SRC = fs.readFileSync(path.join(__dirname, '..', 'xray-core.js'), 'utf8');

// a top-level `function name(...) {...}` or `var name = ...;` of xray-core.js, as source text
function cut(name) {
  var m = new RegExp('^(function ' + name + '\\(|var ' + name + ' = )', 'm').exec(CORE_SRC);
  if (!m) throw new Error('xray-core.js: ' + name + ' not found');
  var start = m.index, end;
  if (m[1].indexOf('function') === 0) end = CORE_SRC.indexOf('\n}', start) + 2;            // closing brace at column 0
  else {                                                                                  // var X = [ ... ]; (may span lines)
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
var ctx = { window: {}, String: String, Number: Number, Math: Math, Object: Object, Array: Array, JSON: JSON, parseInt: parseInt, isNaN: isNaN };
vm.createContext(ctx);
vm.runInContext(NAMES.map(cut).join('\n'), ctx, { filename: 'xray-core.js (Best-Path functions)' });

// the two field fixes xrayBuildBgpView applies to state.bgp_routes before it calls xrayBgpDecision
function viewRows(bgpRoutes) {
  return bgpRoutes.map(function (r) {
    var o = JSON.parse(JSON.stringify(r));
    if ((o.locprf === undefined || o.locprf === null || o.locprf === '') && o.local_pref !== undefined && o.local_pref !== null && o.local_pref !== '') o.locprf = String(o.local_pref);
    if (!o.nexthop && o.next_hop) o.nexthop = o.next_hop;
    return o;
  });
}

// ---- run one capture through collector + view -------------------------------------------------------------

function explain(file) {
  var bgp = JSON.parse(fs.readFileSync(file, 'utf8'));
  var frrPaths = bgp.routes[Object.keys(bgp.routes)[0]];
  var frrBest = frrPaths.findIndex(function (p) { return p.bestpath === true || (p.bestpath && p.bestpath.overall === true); });
  var bp = frrPaths[frrBest].bestpath;
  var frrReason = (bp && typeof bp === 'object' ? bp.selectionReason : frrPaths[frrBest].selectionReason) || '';

  var st = clab.collectFromJson({ node: 'r1', proto: 'bgp', bgpConfigured: true, bgp: bgp });
  var rows = viewRows(st.bgp_routes);
  var usable = rows.filter(function (r) { return r.valid !== false; });   // as xrayBuildBgpView does
  var dec = ctx.xrayBgpDecision(usable);
  var key = ctx._xrayBgpKey(rows[0]);
  var html = ctx.xrayBgpReasonHtml(key, dec, rows);
  var text = html.replace(/<\/?[a-z][^>]*>/gi, ' ').replace(/&gt;/g, '>').replace(/&lt;/g, '<').replace(/\s+/g, ' ').trim();
  return { frrBest: frrBest, frrReason: frrReason, text: text,
    shownBest: rows.findIndex(function (r) { return (r.status || '').indexOf('>') !== -1; }),
    shown: shownDecider(text) };
}

// the decider the Best-Path box names, in FRR's selectionReason words
var LABEL_TO_FRR = { 'Weight': 'Weight', 'LocPrf': 'Local Pref', 'AS-Path': 'AS Path', 'Origin': 'Origin', 'MED': 'MED' };
function shownDecider(text) {
  var m;
  if (/locally originated/.test(text)) return 'Local Route';
  if ((m = /picked by (.+?) \(FRR/.exec(text))) return m[1].trim();                       // ECMP box
  if ((m = /best path by (.+?) \(FRR\)/.exec(text))) return m[1].trim();                  // FRR's own reason
  if ((m = /best path by (\S+)/.exec(text))) return LABEL_TO_FRR[m[1]] || m[1];           // derived from attributes
  if (/no single decider/.test(text)) return '(no single decider)';
  if (/breaks the tie by Older Path|tiebreak by Router ID/.test(text)) return '(generic tie-break text)';
  return '(unrecognised: ' + text + ')';
}

// ---- the captures -------------------------------------------------------------------------------------------

var STEPS = ['base', 'weight', 'local-pref', 'local-route', 'as-path', 'origin', 'med', 'peer-type', 'router-id', 'multipath', 'neighbor-ip'];

VERSIONS.forEach(function (v) {
  test(v + ': every capture has a step and vice versa', function () {
    var files = fs.readdirSync(path.join(FIX, v)).filter(function (f) { return /\.json$/.test(f) && f !== 'peers-summary.json'; })
      .map(function (f) { return f.slice(0, -5); }).sort();
    assert.deepStrictEqual(files, STEPS.slice().sort());
  });
  STEPS.forEach(function (s) {
    test(v + ' ' + s + ': the view marks FRR\'s best path and names FRR\'s selectionReason', function () {
      var x = explain(path.join(FIX, v, s + '.json'));
      assert.ok(x.frrBest >= 0 && x.frrReason, 'capture has a best path with a selectionReason');
      assert.strictEqual(x.shownBest, x.frrBest, 'best path marked by the view; text: ' + x.text);
      assert.strictEqual(x.shown, x.frrReason, 'decider shown = FRR selectionReason; text: ' + x.text);
    });
  });
  test(v + ' peers-summary: peers that are not Established keep FRR\'s state words', function () {
    var sum = JSON.parse(fs.readFileSync(path.join(FIX, v, 'peers-summary.json'), 'utf8'));
    var bgp = JSON.parse(fs.readFileSync(path.join(FIX, v, 'base.json'), 'utf8'));
    var st = clab.collectFromJson({ node: 'r1', proto: 'bgp', bgpConfigured: true, bgpSummary: sum, bgp: bgp });
    var got = {};
    (st.bgp_neighbors || []).forEach(function (n) { got[n.ip] = n.state; });
    assert.deepStrictEqual(got, { '10.10.0.20': 'Established', '10.11.0.20': 'Established', '10.12.0.20': 'Idle (Admin)', '192.0.2.1': 'Active' });
    assert.strictEqual(st.bgp_local_as, 65001);
  });
});
