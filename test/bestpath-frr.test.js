// bestpath-frr.test.js — how network-xray explains FRR's BGP best-path choice.
// Run: node --test        (from the repo root; Node >= 18, no dependencies)
//
// Each fixture in test/fixtures/bestpath-frr/ is a `show ip bgp json` table with one prefix and two or three
// paths, built to be decided at one step of FRR's documented order (RFC 4271 9.1 + FRR): Weight, Local Pref,
// Local Route, AS Path, ORIGIN, MED, Peer Type (eBGP over iBGP), IGP Metric, multipath, Older Path / Router ID,
// Neighbor IP. The best path carries FRR's own `bestpath` and `selectionReason` fields.
//
// The data goes the way it goes in the product:
//   FRR json -> clab-collect.js collectFromJson -> state.bgp_routes
//            -> xray-core.js xrayBgpDecision + xrayBgpReasonHtml (the DeepDive Best-Path box)
// xray-core.js is a browser file, so the functions the Best-Path box uses are cut out of it by name and run in
// a vm context with a bare `window`. Nothing in xray-core.js is changed.
//
// For every fixture two things are checked:
//   1. the winner the view marks (status '>') is FRR's best path;
//   2. the decider the view names is FRR's selectionReason.
// Where (2) does not hold today, the current text is pinned (so a change shows up) and a separate `todo` test
// states what FRR says; `node --test` reports those as todo, not as failures.
'use strict';
var test = require('node:test');
var assert = require('node:assert');
var fs = require('fs');
var path = require('path');
var vm = require('vm');
var clab = require('../clab-collect.js');

var FIX = path.join(__dirname, 'fixtures', 'bestpath-frr');

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

var NAMES = ['XRAY_BGP_CRITERIA', 'xrayBgpOriginChar', 'xrayBgpOriginRank', 'xrayBgpNum', 'xrayBgpNeighborAS',
  'xrayBgpDecision', 'xrayBgpChainHtml', 'xrayBgpBracketEnabled', 'xrayBgpFrrReason', 'xrayBgpReasonHtml', '_xrayBgpKey',
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

// ---- run one fixture through collector + view ---------------------------------------------------------

function load(name) { return JSON.parse(fs.readFileSync(path.join(FIX, name + '.json'), 'utf8')); }

function explain(name) {
  var bgp = load(name);
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
  return { frrBest: frrBest, frrReason: frrReason, rows: rows, dec: dec, text: text,
    shownBest: rows.findIndex(function (r) { return (r.status || '').indexOf('>') !== -1; }),
    shown: shownDecider(text) };
}

// the decider the Best-Path box names, in FRR's selectionReason words
var LABEL_TO_FRR = { 'Weight': 'Weight', 'LocPrf': 'Local Pref', 'AS-Path': 'AS Path', 'Origin': 'ORIGIN', 'MED': 'MED' };
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

// ---- the cases ---------------------------------------------------------------------------------------
// known: what the view shows today where it differs from FRR's selectionReason (see the todo tests)

var CASES = [
  { f: 'weight',          step: 'Weight' },
  { f: 'local-pref',      step: 'Local Pref' },
  { f: 'local-route',     step: 'Local Route',
    known: 'AS Path', why: 'no Local Route step: with equal weight the locally originated path wins by its empty AS_PATH in the view' },
  { f: 'as-path',         step: 'AS Path' },
  { f: 'as-path-set',     step: 'AS Path (AS_SET counts as 1)' },
  { f: 'as-path-confed',  step: 'AS Path (confederation segments do not count)' },
  { f: 'origin',          step: 'ORIGIN' },
  { f: 'med',             step: 'MED' },
  { f: 'med-missing',     step: 'MED (missing MED = 0)' },
  { f: 'med-diff-as',     step: 'MED not compared (different neighbor AS) -> Older Path' },
  { f: 'med-three-paths', step: 'MED vs the same-AS path, Older Path vs the other-AS path',
    known: 'MED', why: 'MED decides among the 65002 paths, so FRR\'s selectionReason (Older Path, against the 65003 path) is not shown' },
  { f: 'ebgp-over-ibgp',  step: 'Peer Type (eBGP over iBGP)' },
  { f: 'igp-metric',      step: 'IGP Metric' },
  { f: 'multipath',       step: 'multipath (ECMP), representative by Older Path' },
  { f: 'older-path',      step: 'Older Path' },
  { f: 'router-id',       step: 'Router ID' },
  { f: 'neighbor-ip',     step: 'Neighbor IP' },
  { f: 'reason-in-bestpath-object', step: 'Router ID, given as bestpath.selectionReason',
    known: '(generic tie-break text)', why: 'the collector reads only a top-level selectionReason, so bestpath: {overall, selectionReason} loses the reason' }
];

test('every fixture has a test case and vice versa', function () {
  var files = fs.readdirSync(FIX).filter(function (f) { return /\.json$/.test(f); }).map(function (f) { return f.slice(0, -5); }).sort();
  assert.deepStrictEqual(CASES.map(function (c) { return c.f; }).sort(), files);
});

CASES.forEach(function (c) {
  test(c.f + ': the view marks FRR\'s best path and names ' + (c.known ? 'the pinned decider' : 'FRR\'s selectionReason') + ' [' + c.step + ']', function () {
    var x = explain(c.f);
    assert.ok(x.frrBest >= 0 && x.frrReason, 'fixture has a best path with a selectionReason');
    assert.strictEqual(x.shownBest, x.frrBest, 'best path in the view = FRR bestpath');
    assert.strictEqual(x.dec.best, x.rows[x.frrBest], 'xrayBgpDecision explains FRR\'s best path');
    if (c.known) assert.strictEqual(x.shown, c.known, 'current decider text: ' + x.text);
    else assert.strictEqual(x.shown, x.frrReason, 'decider shown = FRR selectionReason; text: ' + x.text);
  });
  if (c.known) {
    test(c.f + ': decider matches FRR selectionReason', { todo: c.why }, function () {
      var x = explain(c.f);
      assert.strictEqual(x.shown, x.frrReason, 'text: ' + x.text);
    });
  }
});

// the attribute steps the view derives itself must agree with FRR's order, step by step
test('derived steps follow FRR\'s order: Weight, Local Pref, AS Path, ORIGIN, MED', function () {
  var keys = JSON.parse(JSON.stringify(ctx.XRAY_BGP_CRITERIA.map(function (c) { return c.key; })));
  assert.deepStrictEqual(keys, ['weight', 'locprf', 'aspath', 'origin', 'metric']);
  var dirs = JSON.parse(JSON.stringify(ctx.XRAY_BGP_CRITERIA.map(function (c) { return c.dir; })));
  assert.deepStrictEqual(dirs, [1, 1, -1, -1, -1], 'higher weight / local pref, shorter AS_PATH, lower origin / MED win');
});

test('steps before the decider are shown as ties', function () {
  var x = explain('med');
  var st = JSON.parse(JSON.stringify(x.dec.chain.map(function (s) { return s.crit.key + ':' + s.status; })));
  assert.deepStrictEqual(st, ['weight:tie', 'locprf:tie', 'aspath:tie', 'origin:tie', 'metric:win']);
});

test('MED from a different neighbor AS is shown as skipped, not as a decider', function () {
  var x = explain('med-diff-as');
  assert.strictEqual(x.dec.kind, 'medskip');
  assert.match(x.text, /MED not compared/);
});

test('eBGP path without locPrf compares as local preference 100 against an iBGP path', function () {
  var x = explain('ebgp-over-ibgp');
  var lp = x.dec.chain.filter(function (s) { return s.crit.key === 'locprf'; })[0];
  assert.strictEqual(lp.status, 'tie');
  assert.strictEqual(lp.bestVal, 100);
});

// AS_PATH length: FRR does not count confederation segments (RFC 5065); the step chain counts every token
test('as-path-confed: the AS-Path step counts the confederation path as FRR does', { todo: 'the step chain counts "(65100 65101) 65002" as 3 hops (FRR: 1) and shows the step as unresolved (?); the reason line falls back to FRR\'s "AS Path"' }, function () {
  var x = explain('as-path-confed');
  assert.strictEqual(x.dec.kind, 'decided', 'text: ' + x.text);
  assert.strictEqual(x.dec.criterion.key, 'aspath');
});
test('as-path-confed: current step chain (pinned)', function () {
  var x = explain('as-path-confed');
  assert.strictEqual(x.dec.kind, 'ambiguous');
  assert.match(x.text, /AS-Path 3<2 \?/);
});

// with no selectionReason in the data the view falls back to its own text; for eBGP paths FRR's default order
// reaches Older Path before Router ID (Router ID only with `bgp bestpath compare-routerid`)
function withoutReason(name) {
  var bgp = load(name);
  bgp.routes[Object.keys(bgp.routes)[0]].forEach(function (p) { delete p.selectionReason; });
  var st = clab.collectFromJson({ node: 'r1', proto: 'bgp', bgpConfigured: true, bgp: bgp });
  var rows = viewRows(st.bgp_routes), dec = ctx.xrayBgpDecision(rows);
  return ctx.xrayBgpReasonHtml(ctx._xrayBgpKey(rows[0]), dec, rows).replace(/<\/?[a-z][^>]*>/gi, ' ').replace(/\s+/g, ' ');
}
test('older-path without selectionReason: fallback text names Older Path for eBGP paths', { todo: 'xray-core.js says "tiebreak by Router ID" (xray-api.js says "FRR breaks the tie by Older Path")' }, function () {
  assert.match(withoutReason('older-path'), /Older Path/);
});
test('older-path without selectionReason: current fallback text (pinned)', function () {
  assert.match(withoutReason('older-path'), /all attributes equal — tiebreak by Router ID/);
});
