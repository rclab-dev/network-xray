// bestpath-property.test.js — property tests for the BGP best-path comparison logic.
// Run: node --test        (from the repo root; Node >= 18, no dependencies)
//
// A seeded pseudo-random generator builds sets of 2-5 BGP paths for one prefix with random Weight, Local Preference,
// locally originated, AS_PATH length, ORIGIN, MED (same and different neighbor AS), eBGP/iBGP, IGP metric and
// router ID. A reference elimination in this file picks the winner by the documented order (RFC 4271 9.1.2.2 + FRR):
//
//   Weight > Local Pref > Local Route > AS_PATH length > ORIGIN > MED (only between paths from the same neighbor AS)
//   > eBGP over iBGP > IGP metric > Router ID
//
// Each step keeps the paths that are best at that step; a tie keeps them all and moves on to the next step.
// Router IDs are unique, so there is always one winner. Locally originated paths carry weight 32768 and an empty
// AS_PATH, as FRR builds them, and at most one is generated.
//
// Code under test:
//   1. xray-core.js xrayBgpDecision (+ xrayBgpReasonHtml) — the DeepDive "why this path won" box. It does not choose:
//      the winner is the path the router marked best (docs/faq.md). It explains it with the visible columns only
//      (Weight, LocPrf, AS-Path, Origin, MED); deeper steps are reported as a tie / "MED not compared". By design it
//      names MED when the winner has the lowest MED among the remaining paths of its own neighbor AS, even if a path
//      from another AS is still in play (see expectedExplanation); that is tested as documented, not as the RFC.
//   2. xray-api.js _bgpDecision — the same explanation in the facade (kept in step with xray-core.js).
//   3. decision-bracket.html — the "See all decision steps" page. It does choose, by its documented simplified order
//      (Weight, Local Preference, AS-Path, Origin, MED, eBGP > iBGP, Older Path [only with age], Router ID [only with
//      compareRouterId]); it has no Local Route or IGP metric step.
//
// The browser files are cut by name and run in a vm context; nothing is loaded from the network.
'use strict';
var test = require('node:test');
var assert = require('node:assert');
var fs = require('fs');
var path = require('path');
var vm = require('vm');

var ROOT = path.join(__dirname, '..');
var SEED = 0x5eed2026;
var CASES = 3000;

// ---- load the code under test ---------------------------------------------------------------------------

var CORE_SRC = fs.readFileSync(path.join(ROOT, 'xray-core.js'), 'utf8');
function cutCore(name) {   // a top-level `function name(` (closing brace at column 0) or `var name = ...;`
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
var CORE_NAMES = ['_escapeHtml', 'XRAY_BGP_CRITERIA', 'xrayBgpOriginChar', 'xrayBgpOriginRank', 'xrayBgpNum', 'xrayBgpNeighborAS',
  '_xrayAsPathLen', '_xrayBgpTieText', 'xrayBgpDecision', 'xrayBgpChainHtml', 'xrayBgpBracketEnabled', 'xrayBgpFrrReason',
  'xrayBgpReasonHtml', '_xrayBgpKey', '_XRAY_ECMP_COLORS', '_xrayEcmpIpNum', '_xrayEcmpColorMap', '_xrayEcmpOf', '_xrayEcmpJa',
  '_xrayEcmpReasonHtml'];
var core = { window: {}, String: String, Number: Number, Math: Math, Object: Object, Array: Array, JSON: JSON, parseInt: parseInt, isNaN: isNaN };
vm.createContext(core);
vm.runInContext(CORE_NAMES.map(cutCore).join('\n'), core, { filename: 'xray-core.js (Best-Path functions)' });

var API_SRC = fs.readFileSync(path.join(ROOT, 'xray-api.js'), 'utf8');
var api = { String: String, Math: Math, parseInt: parseInt, isNaN: isNaN, _xrayAsPathLen: core._xrayAsPathLen };
vm.createContext(api);
(function () {
  var a = API_SRC.indexOf('  var _BGP_CRIT = [');
  var f = API_SRC.indexOf('  function _bgpDecision(group) {');
  if (a < 0 || f < 0) throw new Error('xray-api.js: _BGP_CRIT / _bgpDecision not found');
  var end = API_SRC.indexOf('\n  }\n', f) + 4;
  vm.runInContext(API_SRC.slice(a, end) + '\nthis._bgpDecision = _bgpDecision;', api, { filename: 'xray-api.js (Best-Path functions)' });
})();

var BR_SRC = fs.readFileSync(path.join(ROOT, 'decision-bracket.html'), 'utf8');
var bracketRun = (function () {
  function between(from, to, inclusiveTo) {
    var a = BR_SRC.indexOf(from), b = BR_SRC.indexOf(to, a);
    if (a < 0 || b < 0) throw new Error('decision-bracket.html: ' + from + ' not found');
    return BR_SRC.slice(a, inclusiveTo ? BR_SRC.indexOf('\n', b + 1) : b);
  }
  var crit = between('var originRank', '\n];', true);                 // CRITERIA
  var sim = between('function betterSet(', 'var winnerId', true);    // tournament + winnerId
  var ctx = { Math: Math };
  vm.createContext(ctx);
  vm.runInContext('function run(data) { var LANG = "en"; var routes = data.routes;\n' + crit + '\n' + sim +
    '\nreturn { winnerId: winnerId, decidedAt: decidedAt, CRITERIA: CRITERIA, rowState: rowState }; }', ctx,
  { filename: 'decision-bracket.html (tournament)' });
  return ctx.run;
})();

// ---- seeded generator -----------------------------------------------------------------------------------

function mulberry32(a) {
  return function () {
    a |= 0; a = a + 0x6D2B79F5 | 0;
    var t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}
function pick(rng, arr) { return arr[Math.floor(rng() * arr.length)]; }

// small value ranges on purpose, so that ties (and "tie goes to the next step") are common
function genPaths(rng) {
  var n = 2 + Math.floor(rng() * 4);
  var rids = [1, 2, 3, 4, 5, 6, 7, 8].sort(function () { return rng() - 0.5; });
  var deep = rng() < 0.3;   // a share of sets equal on Weight..Origin, so MED and the steps after it are reached often
  var hasLocal = !deep && rng() < 0.15, paths = [];
  for (var i = 0; i < n; i++) {
    var local = hasLocal && i === 0;
    var nbr = pick(rng, ['65001', '65002', '65003']);
    var len = deep ? 1 : 1 + Math.floor(rng() * 3), asp = [nbr];
    for (var k = 1; k < len; k++) asp.push(String(65010 + Math.floor(rng() * 5)));
    paths.push({
      id: String.fromCharCode(65 + i),
      local: local,
      weight: local ? 32768 : deep ? 0 : pick(rng, [0, 0, 0, 100]),
      locprf: deep ? 100 : pick(rng, [100, 100, 100, 200, 50]),
      as_path: local ? '' : asp.join(' '),
      origin: deep ? 'IGP' : pick(rng, ['IGP', 'IGP', 'EGP', 'incomplete']),
      med: pick(rng, [0, 0, 10, 20]),
      ebgp: local ? false : rng() < 0.5,
      igp: local ? 0 : pick(rng, [0, 10, 20]),
      rid: '10.0.0.' + rids[i]
    });
  }
  return paths.sort(function () { return rng() - 0.5; });   // the winner is not always first
}

// ---- reference: the documented order --------------------------------------------------------------------

function nbrAS(p) { return p.as_path ? p.as_path.split(' ')[0] : ''; }
function asLen(p) { return p.as_path ? p.as_path.split(' ').length : 0; }
var ORIGIN_RANK = { IGP: 0, EGP: 1, incomplete: 2 };
function ridNum(p) { return p.rid.split('.').reduce(function (a, o) { return a * 256 + +o; }, 0); }

var STEPS = [
  { key: 'weight', hi: true, v: function (p) { return p.weight; } },
  { key: 'locprf', hi: true, v: function (p) { return p.locprf; } },
  { key: 'local', hi: true, v: function (p) { return p.local ? 1 : 0; } },
  { key: 'aspath', hi: false, v: asLen },
  { key: 'origin', hi: false, v: function (p) { return ORIGIN_RANK[p.origin]; } },
  { key: 'metric', med: true, v: function (p) { return p.med; } },
  { key: 'ebgp', hi: true, v: function (p) { return p.ebgp ? 1 : 0; } },
  { key: 'igp', hi: false, v: function (p) { return p.igp; } },
  { key: 'routerid', hi: false, v: ridNum }
];
// the steps the DeepDive box can see (xrayBgpDecision's XRAY_BGP_CRITERIA keys)
var VISIBLE = ['weight', 'locprf', 'aspath', 'origin', 'metric'];

function keepBest(alive, st) {
  if (st.med)   // RFC 4271 9.1.2.2 (c): a path loses only to a path from the SAME neighbor AS with a lower MED
    return alive.filter(function (p) { return !alive.some(function (o) { return nbrAS(o) === nbrAS(p) && o.med < p.med; }); });
  var vals = alive.map(st.v), best = st.hi ? Math.max.apply(null, vals) : Math.min.apply(null, vals);
  return alive.filter(function (p) { return st.v(p) === best; });
}

// elimination over `steps`; returns the winner, the deciding step and what was alive before each step
function eliminate(paths, steps) {
  var alive = paths.slice(), trace = [];
  for (var i = 0; i < steps.length; i++) {
    var before = alive;
    alive = keepBest(alive, steps[i]);
    trace.push({ step: steps[i], before: before, after: alive });
    if (alive.length === 1) return { winner: alive[0], decided: steps[i], trace: trace, alive: alive };
  }
  return { winner: alive.length === 1 ? alive[0] : null, decided: null, trace: trace, alive: alive };
}

// the bgp_routes shape the collectors write (core reads locprf, the api facade reads local_pref)
function toRows(paths, winner) {
  return paths.map(function (p) {
    return { prefix: '10.99.0.0/24', nexthop: p.local ? '0.0.0.0' : '192.0.2.' + p.rid.split('.')[3], status: p === winner ? '*>' : '*',
      weight: String(p.weight), locprf: String(p.locprf), local_pref: p.locprf, metric: String(p.med), as_path: p.as_path,
      origin: p.origin, router_id: p.rid, _p: p };
  });
}

function eachCase(fn) {
  var rng = mulberry32(SEED);
  for (var i = 0; i < CASES; i++) {
    var paths = genPaths(rng);
    var full = eliminate(paths, STEPS);
    fn(paths, full, i);
  }
}

// ---- properties of the reference itself -----------------------------------------------------------------

test('reference: the winner is best at every step in order, and ties move on to the next step', function () {
  eachCase(function (paths, full, i) {
    assert.ok(full.winner, 'case ' + i + ': unique router IDs always give one winner');
    full.trace.forEach(function (t, k) {
      assert.ok(t.after.indexOf(full.winner) >= 0, 'case ' + i + ': winner survives ' + t.step.key);
      if (t.after.length === t.before.length && k < full.trace.length - 1) {   // tie: nobody cut, next step runs
        assert.strictEqual(full.trace[k + 1].before.length, t.before.length);
      }
    });
  });
});

// ---- 1 + 2: the DeepDive explanation (xray-core.js and xray-api.js) --------------------------------------

// What the DeepDive box should say, by its documented model (xray-core.js comments, test/bestpath-frr.test.js
// med-three-paths note "by design"): Weight, LocPrf, AS-Path, Origin cut the paths in turn; then MED is compared only
// among the remaining paths from the winner's neighbor AS, and names MED when the winner has the lowest MED there, even
// if a path from another AS is still in play (that path is decided against later, by a step the box does not show).
// With no other remaining path from the winner's AS, MED is "not compared" when another remaining path has another MED.
function expectedExplanation(paths, winner) {
  var alive = paths;
  for (var i = 0; i < 4; i++) {
    var st = STEPS.filter(function (s) { return s.key === VISIBLE[i]; })[0];
    var before = alive;
    alive = keepBest(alive, st);
    assert.ok(alive.indexOf(winner) >= 0, 'the visible steps come before the others, so the winner survives them');
    if (alive.length === 1) {
      var others = before.filter(function (p) { return p !== winner; }).map(st.v);
      return { kind: 'decided', key: st.key, step: st, before: before, cmpVal: st.hi ? Math.max.apply(null, others) : Math.min.apply(null, others) };
    }
  }
  var medStep = STEPS.filter(function (s) { return s.key === 'metric'; })[0];
  var sameAS = alive.filter(function (p) { return p !== winner && nbrAS(p) === nbrAS(winner); });
  if (!sameAS.length) {
    var skip = alive.some(function (p) { return p !== winner && p.med !== winner.med; });
    return { kind: skip ? 'medskip' : 'tie' };
  }
  if (sameAS.every(function (p) { return p.med > winner.med; })) {
    return { kind: 'decided', key: 'metric', step: medStep, before: alive, cmpVal: Math.min.apply(null, sameAS.map(medStep.v)),
      otherASInPlay: alive.some(function (p) { return nbrAS(p) !== nbrAS(winner); }) };
  }
  return { kind: 'tie' };
}

function checkExplanation(decide, label, withHtml) {
  var stats = { decided: {}, tie: 0, medskip: 0, medOtherASInPlay: 0 }, bad = [];
  eachCase(function (paths, full, i) {
    var rows = toRows(paths, full.winner);
    var dec = decide(rows);
    var exp = expectedExplanation(paths, full.winner);
    var where = label + ' case ' + i + ' ' + JSON.stringify(paths.map(function (p) { return Object.assign({}, p, { best: p === full.winner }); }));
    try {
      assert.strictEqual(dec.best._p, full.winner, 'explains the marked best path');
      assert.strictEqual(dec.kind, exp.kind, 'kind');
      if (exp.kind === 'decided') {
        stats.decided[exp.key] = (stats.decided[exp.key] || 0) + 1;
        assert.strictEqual(dec.criterion.key, exp.key, 'deciding step');
        assert.strictEqual(dec.bestVal, dec.criterion.val(dec.best), 'bestVal');
        assert.strictEqual(dec.cmpVal, exp.cmpVal, 'cmpVal = the runner-up value at the deciding step');
        // the deciding step is the first visible step where the winner differs from a runner-up
        exp.before.filter(function (p) { return p !== full.winner; }).forEach(function (ru) {
          if (exp.step.med && nbrAS(ru) !== nbrAS(full.winner)) return;   // MED is not compared with another AS
          var first = VISIBLE.filter(function (k) {
            var st = STEPS.filter(function (s) { return s.key === k; })[0];
            return st.v(ru) !== st.v(full.winner);
          })[0];
          assert.strictEqual(first, exp.key, 'runner-up ' + ru.id + ' first differs at ' + first);
        });
        // every step before the decider is shown as a tie (or a skipped MED), never as a win
        dec.chain.slice(0, -1).forEach(function (st) {
          assert.ok(st.status === 'tie' || st.status === 'skip', 'earlier step ' + st.crit.key + ' is ' + st.status);
          if (st.status === 'tie' && st.crit.key !== 'origin') assert.strictEqual(st.bestVal, st.cmpVal, 'tie shows equal values');
        });
        assert.strictEqual(dec.chain[dec.chain.length - 1].status, 'win');
        // MED is named only against paths from the winner's neighbor AS (cmpVal above is the lowest MED among them)
        if (exp.key === 'metric' && exp.otherASInPlay) stats.medOtherASInPlay++;
        if (withHtml) {
          var html = core.xrayBgpReasonHtml('10.99.0.0/24', dec, rows);
          assert.ok(html.indexOf('best path by <b>' + dec.criterion.label + '</b>') >= 0, 'reason names ' + dec.criterion.label);
        }
      } else {
        stats[exp.kind]++;
        assert.ok(dec.chain.every(function (st) { return st.status !== 'win' && st.status !== 'amb'; }), 'no step shown as decider');
      }
    } catch (e) {
      if (bad.length < 5) bad.push(where + '\n    ' + e.message);
      else bad.push('');
    }
  });
  assert.strictEqual(bad.length, 0, bad.length + ' of ' + CASES + ' cases disagree; first ones:\n  ' + bad.filter(Boolean).join('\n  '));
  return stats;
}

test('xray-core.js xrayBgpDecision: deciding step = first visible step where the winner beats the runner-up', function () {
  var stats = checkExplanation(function (rows) { return core.xrayBgpDecision(rows); }, 'core', true);
  // the generator reaches every visible step and both undecided outcomes
  VISIBLE.forEach(function (k) { assert.ok(stats.decided[k] > 0, 'no case decided by ' + k); });
  assert.ok(stats.tie > 0 && stats.medskip > 0, 'tie ' + stats.tie + ' / medskip ' + stats.medskip);
  assert.ok(stats.medOtherASInPlay > 0, 'no case of MED named with another neighbor AS still in play');
});

test('xray-api.js _bgpDecision: same explanation as xray-core.js', function () {
  checkExplanation(function (rows) { return api._bgpDecision(rows); }, 'api', false);
});

test('MED is never the decider between paths from different neighbor ASes', function () {
  // two paths equal on every visible column except MED, different neighbor AS: the lower MED must not be named
  var a = { id: 'A', local: false, weight: 0, locprf: 100, as_path: '65001', origin: 'IGP', med: 0, ebgp: true, igp: 0, rid: '10.0.0.2' };
  var b = Object.assign({}, a, { id: 'B', as_path: '65002', med: 50, rid: '10.0.0.1' });
  [a, b].forEach(function (w) {
    var rows = toRows([a, b], w);
    [core.xrayBgpDecision(rows), api._bgpDecision(rows)].forEach(function (dec) {
      assert.strictEqual(dec.kind, 'medskip');
    });
  });
  // same neighbor AS: MED decides
  var c = Object.assign({}, b, { as_path: '65001' });
  var dec = core.xrayBgpDecision(toRows([a, c], a));
  assert.strictEqual(dec.kind, 'decided');
  assert.strictEqual(dec.criterion.key, 'metric');
});

// ---- 3: decision-bracket.html ---------------------------------------------------------------------------

// its documented order: no Local Route, no IGP metric; Older Path needs an age (none here); Router ID with compareRouterId
var BRACKET_STEPS = STEPS.filter(function (s) { return ['local', 'igp'].indexOf(s.key) < 0; });
var BRACKET_KEY = { weight: 'weight', locprf: 'localpref', aspath: 'aspathlen', origin: 'origin', metric: 'med', ebgp: 'ebgp', routerid: 'routerid' };

test('decision-bracket.html: winner and deciding row follow its documented order (MED only within one neighbor AS)', function () {
  var bad = [];
  eachCase(function (paths, full, i) {
    var routes = paths.map(function (p) {
      return { id: p.id, via: 'via ' + p.rid, as: 'AS' + (nbrAS(p) || '?'), _p: p,
        attrs: { weight: p.weight, localpref: p.locprf, aspathlen: asLen(p), origin: { IGP: 'i', EGP: 'e', incomplete: '?' }[p.origin],
          med: p.med, ebgp: p.ebgp, routerid: p.rid } };
    });
    var got = bracketRun({ routes: routes, compareRouterId: true });
    var exp = eliminate(paths, BRACKET_STEPS);
    try {
      assert.strictEqual(got.winnerId, exp.winner.id, 'winner');
      assert.strictEqual(got.CRITERIA[got.decidedAt].key, BRACKET_KEY[exp.decided.key], 'deciding row');
    } catch (e) {
      if (bad.length < 5) bad.push('bracket case ' + i + ' ' + JSON.stringify(paths) + '\n    ' + e.message);
      else bad.push('');
    }
  });
  assert.strictEqual(bad.length, 0, bad.length + ' of ' + CASES + ' cases disagree; first ones:\n  ' + bad.filter(Boolean).join('\n  '));
});

test('decision-bracket.html: Router ID (dotted quad) is compared as a number, and only with compareRouterId', function () {
  function r(id, rid) { return { id: id, as: 'AS' + id, attrs: { weight: 0, localpref: 100, aspathlen: 1, origin: 'i', med: 0, ebgp: true, routerid: rid } }; }
  var got = bracketRun({ routes: [r('A', '10.0.0.10'), r('B', '10.0.0.9')], compareRouterId: true });
  assert.strictEqual(got.winnerId, 'B');
  assert.strictEqual(got.CRITERIA[got.decidedAt].key, 'routerid');
  got = bracketRun({ routes: [r('A', '10.0.0.10'), r('B', '10.0.0.9')] });
  assert.strictEqual(got.winnerId, null, 'without compareRouterId the tie stays unresolved (Older Path)');
});
