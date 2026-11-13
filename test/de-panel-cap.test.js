// de-panel-cap.test.js — the DeepDive's Routing Engine panel and Routing table panel do not cover each other
// (xray-core.js window._xrayDeCapPlan: the numbers measured by capRt in, which panel to cap and how high out).
// Since v1.3.1 the Routing Engine panel ("What's wrong", open OSPF interface blocks) could reach down over the Routing table,
// so a click on a route row landed on the Routing Engine panel (q6 / q11 / q12: three OSPF routers, two interfaces each).
// Now the Routing Engine panel is capped (and scrolls inside) when the table cannot be capped under it; the table rows'
// centres are then outside the Routing Engine panel. The click itself is checked in a browser on the example labs.
// Run: node --test        (from the repo root; Node >= 18, no dependencies)
//
// xray-core.js is loaded into a vm sandbox with a stub document (as in ospf-iface-panel.test.js).
'use strict';
var test = require('node:test');
var assert = require('node:assert');
var fs = require('fs');
var path = require('path');
var vm = require('vm');

var ROOT = path.join(__dirname, '..');
function stub() {
  var fn = function () {};
  return new Proxy(fn, {
    get: function (t, k) {
      if (k === Symbol.toPrimitive) return function () { return ''; };
      if (k === 'length') return 0;
      if (typeof k === 'string' && Object.prototype.hasOwnProperty.call(t, k) && !(k in Function.prototype)) return t[k];
      return stub();
    },
    apply: function () { return stub(); },
    set: function (t, k, v) { t[k] = v; return true; }
  });
}
function sandbox() {
  var de = stub(); de.getAttribute = function () { return 'en'; };
  var body = stub(); body.classList = { add: function () {}, remove: function () {}, toggle: function () {}, contains: function () { return false; } };
  var doc = {
    getElementById: function () { return null; }, querySelector: function () { return null; },
    querySelectorAll: function () { return []; }, createElement: function () { return stub(); },
    addEventListener: function () {}, head: stub(), body: body, documentElement: de, readyState: 'complete', currentScript: null
  };
  var ctx = {
    document: doc, console: console, setTimeout: function () { return 0; }, clearTimeout: function () {},
    setInterval: function () { return 0; }, clearInterval: function () {}, requestAnimationFrame: function () { return 0; },
    navigator: { userAgent: '' }, location: { search: '', href: '', hash: '' },
    localStorage: { getItem: function () { return null; }, setItem: function () {} },
    getComputedStyle: function () { return {}; }, addEventListener: function () {}, innerWidth: 1400
  };
  ctx.window = ctx; ctx.self = ctx;
  vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(path.join(ROOT, 'xray-core.js'), 'utf8'), ctx, { filename: 'xray-core.js' });
  return ctx;
}
var plan = sandbox()._xrayDeCapPlan;

// q6-ospf-solved, r1, Standard, 1400 x 900 (measured in a browser on v1.3.2): Routing Engine 492..876, Routing table 707..885,
// route rows 20px high from 740 down
var Q6 = { side: true, reTop: 492, reH: 384, rtTop: 707, rtBottom: 885 };
var ROWS = [[740, 20], [760, 20], [800, 20], [839, 36]];

function reBottom(g, p) { return g.reTop + (p.re != null ? Math.min(p.re, g.reH) : g.reH); }
function rtTop(g, p) { return p.rt != null ? g.rtBottom - p.rt : g.rtTop; }

test('the plan is exported', function () {
  assert.strictEqual(typeof plan, 'function');
});

test('a long Routing Engine panel over the table (OSPF, two interfaces open): the Routing Engine panel is capped above the table', function () {
  var p = plan(Q6);
  assert.strictEqual(p.rt, null, 'the table is not capped (no room under the panel)');
  assert.strictEqual(p.re, 707 - 8 - 492, 'the panel ends 8px above the table');
  var reB = reBottom(Q6, p);
  ROWS.forEach(function (r) {
    var mid = r[0] + r[1] / 2;
    assert.ok(mid > reB, 'the centre of the row at ' + r[0] + ' is below the Routing Engine panel (' + reB + ')');
  });
});

test('up to ten more lines in the Routing Engine panel: still capped at the same height (it scrolls)', function () {
  var g = Object.assign({}, Q6, { reH: Q6.reH + 10 * 20 });
  assert.deepStrictEqual(JSON.parse(JSON.stringify(plan(g))), { rt: null, re: 207 });
});

test('a long Routing table under a short Routing Engine panel: the table is capped as before (nx_rt_cap)', function () {
  var g = { side: true, reTop: 492, reH: 120, rtTop: 400, rtBottom: 885 };
  var p = plan(g);
  assert.strictEqual(p.re, null);
  assert.strictEqual(p.rt, 885 - (492 + 120 + 8));
  assert.ok(rtTop(g, p) >= g.reTop + g.reH + 8, 'the table starts below the panel');
});

test('nothing to do: no overlap, side by side, or too little room to cap the panel', function () {
  assert.deepStrictEqual(JSON.parse(JSON.stringify(plan({ side: true, reTop: 492, reH: 150, rtTop: 707, rtBottom: 885 }))), { rt: null, re: null });
  assert.deepStrictEqual(JSON.parse(JSON.stringify(plan(Object.assign({}, Q6, { side: false })))), { rt: null, re: null });
  assert.deepStrictEqual(JSON.parse(JSON.stringify(plan({ side: true, reTop: 640, reH: 240, rtTop: 707, rtBottom: 885 }))), { rt: null, re: null }, 'only 59px above the table');
  assert.deepStrictEqual(JSON.parse(JSON.stringify(plan(null))), { rt: null, re: null });
});

// nx_rt_top_fixed: a Routing table placed from its top (the recorded demo with many routes, r1 = 17 routes): the Routing
// Engine panel 557..787 covered its first rows (607..). The cap alone does not move such a table, so it is also moved: its
// top goes to the plan's top (8px under the panel) and its height to the plan's rt (the bottom stays at 948).
test('a table placed from its top under a Routing Engine panel: the plan gives its new top under the panel and its height to the old bottom', function () {
  var g = { side: true, reTop: 557, reH: 230, rtTop: 607, rtBottom: 948 };
  var p = plan(g);
  assert.strictEqual(p.re, null, 'the Routing Engine panel is not capped');
  assert.strictEqual(p.top, 557 + 230 + 8, 'the table starts 8px under the panel');
  assert.strictEqual(p.rt, 948 - p.top, 'and ends where it ended (153px, as measured on the page)');
  assert.strictEqual(p.rt, 153);
  for (var y = p.top; y + 16 <= p.top + p.rt; y += 16) assert.ok(y + 8 > g.reTop + g.reH, 'row centre ' + (y + 8) + ' is under the panel');
});
