// ospf-line-word-color.test.js — the OSPF neighbor state word and the DeepDive line to that neighbor use one color table:
// Init / 2-Way orange, ExStart / Exchange / Loading / Full green, Down / None red (word) and no tunnel (line). Checked for the
// two-link tunnels (.de-side-ospf-<bucket>) and for the single-link line (body.xray-ospftun-<bucket> / xray-state-full), and the
// single-link line follows the neighbor state even when the collector's ospf_active_on_interface is false.
// The OSPF process circle (double ring in the cylinder) takes the same color (pulsing until Full, grey with no neighbor);
// the OSPF Hello balls moving on the links stay orange in every state.
// Run: node --test        (from the repo root; Node >= 18, no dependencies)
'use strict';
var test = require('node:test');
var assert = require('node:assert');
var fs = require('fs');
var path = require('path');
var vm = require('vm');

var ROOT = path.join(__dirname, '..');
var CORE = fs.readFileSync(path.join(ROOT, 'xray-core.js'), 'utf8');
var GREEN = '#39ff14', ORANGE = '#ff8c00', RED = '#ff4444';

// xray-core.js in a vm with a small stub document (same approach as dom-insert-escape.test.js)
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
  var cls = function () { return { add: function () {}, remove: function () {}, toggle: function () {}, contains: function () { return false; } }; };
  var de = stub(); de.getAttribute = function () { return 'en'; };
  var body = stub(); body.classList = cls();
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
    getComputedStyle: function () { return {}; }, addEventListener: function () {}
  };
  ctx.window = ctx; ctx.self = ctx;
  vm.createContext(ctx);
  vm.runInContext(CORE, ctx, { filename: 'xray-core.js' });
  return ctx;
}
var ctx = sandbox();

// the color named in a css rule's background (the fallback of var(--xto-…, #rrggbb))
function cssColor(selectorRx, what) {
  var m = new RegExp(selectorRx + '\\{background:([^;}!]*)').exec(CORE);
  assert.ok(m, 'css rule for ' + what);
  var c = /var\(--xto-[a-z]+,(#[0-9a-f]{6})\)/i.exec(m[1]);
  assert.ok(c, 'color in css for ' + what + ': ' + m[1]);
  return { color: c[1].toLowerCase(), dashed: /repeating-linear-gradient/.test(m[1]) };
}
function twoLinkLine(bucket) { return cssColor('\\.de-side-ospf-' + bucket + ' > \\.de-tunnel-wall', 'two-link ' + bucket); }
function singleLine(bucket) {
  return bucket === 'full' ? cssColor('\\.is-xray-deep\\.xray-state-full \\.de-tunnel-wall', 'single-link full')
    : cssColor('\\.is-xray-deep\\.xray-ospftun-' + bucket + ' \\.de-tunnel > \\.de-tunnel-wall', 'single-link ' + bucket);
}

// [word, bucket, color, dashed]
var STATES = [
  ['Init', 'init', ORANGE, true], ['2-Way', '2way', ORANGE, false],
  ['ExStart', 'exchange', GREEN, true], ['Exchange', 'exchange', GREEN, true], ['Loading', 'exchange', GREEN, true],
  ['Full', 'full', GREEN, false]
];

test('two-link tunnels and single-link line: the same color and dash for each state', function () {
  STATES.forEach(function (c) {
    assert.strictEqual(ctx._xrayOspfBucket(c[0]), c[1], c[0] + ' bucket');
    assert.deepStrictEqual(twoLinkLine(c[1]), { color: c[2], dashed: c[3] }, c[0] + ' two-link tunnel');
    assert.deepStrictEqual(singleLine(c[1]), { color: c[2], dashed: c[3] }, c[0] + ' single-link line');
  });
});

test('the state word has the color of its line, whatever the role (2-Way between DROthers is orange too)', function () {
  STATES.forEach(function (c) {
    ['DROther', 'DR', 'Backup', ''].forEach(function (role) {
      assert.strictEqual(ctx._xrayOspfNbrColor(c[0], role), c[2], c[0] + ' / ' + (role || 'no role'));
    });
    assert.strictEqual(ctx._xrayOspfNbrSpan(c[0], 'DROther').indexOf('color:' + c[2]) > 0, true, c[0] + ' span');
  });
  ['Down', 'None', '?'].forEach(function (w) { assert.strictEqual(ctx._xrayOspfNbrColor(w), RED, w); });
});

test('the summary line "Neighbor: 2-Way" between DROthers is orange like its line (no "(n/m Full)" tail)', function () {
  var lines = [];
  ctx._xrayOspfNbrSummaryPushList(lines, { ospf_configured: true, ospf_active_on_interface: true,
    ospf_neighbors: [{ router_id: "2.2.2.2", state: "2-Way", role: "DROther", full: false }, { router_id: "3.3.3.3", state: "2-Way", role: "DROther", full: false }] }, false, false);
  assert.strictEqual(lines.length, 1, JSON.stringify(lines));
  assert.ok(lines[0].text.indexOf("color:" + ORANGE) > 0 && lines[0].text.indexOf("Full)") < 0, lines[0].text);
});

// one single-link router facing r2 on eth1
function single(state, active) {
  var full = state === 'Full';
  return {
    interfaces: { eth1: { ip: '10.1.12.1/24', up: true }, lo: { ip: '1.1.1.1/32', up: true } }, wan_iface: 'eth1', r2_iface: 'eth1',
    peer_node: 'r2', ospf_configured: true, ospf_active_on_interface: active, iface_hellos: { eth1: 10 }, peer_sending_hello: state !== 'None',
    neighbor_state: state === 'None' ? 'None' : state + '/DROther', r2_neighbor_state: state === 'None' ? 'None' : state + '/DROther',
    has_full: full, full_count: full ? 1 : 0, r2_has_full: full,
    ospf_neighbor_state: state, ospf_neighbor_full: full, r2_ospf_state: state, r2_ospf_full: full,
    ospf_neighbors: state === 'None' ? [] : [{ router_id: '2.2.2.2', state: state, role: 'DROther', iface: 'eth1', full: full }],
    route_resolution: {}
  };
}
test('single link: the line bucket follows the neighbor state, also when ospf_active_on_interface is false', function () {
  ctx._xrayProtocol = 'ospf';
  STATES.forEach(function (c) {
    [true, false].forEach(function (active) {
      if (c[0] === 'Full' && !active) return;   // a Full neighbor always comes with an active interface
      var st = ctx.xrayEvaluateState(single(c[0], active));
      assert.strictEqual(st.ospfTunBucket, c[1], c[0] + ' (ospf_active_on_interface ' + active + ')');
    });
  });
  // no neighbor: no line state (bare link), with or without the flag
  assert.strictEqual(ctx.xrayEvaluateState(single('None', true)).ospfTunBucket, 'none');
  assert.strictEqual(ctx.xrayEvaluateState(single('None', false)).ospfTunBucket, 'none');
});

test('the OSPF process circle has the color of the line (pulsing until Full, grey with no neighbor)', function () {
  STATES.forEach(function (c) {
    var look = ctx._xrayOspfCoreLook({ ospfFull: c[0] === 'Full', ospfTunBucket: c[1] });
    assert.strictEqual(look.color, c[2], c[0] + ' ball color');
    assert.strictEqual(look.pulse, c[0] !== 'Full', c[0] + ' ball pulse');
  });
  assert.strictEqual(ctx._xrayOspfCoreLook({ ospfFull: false, ospfTunBucket: 'none' }), null, 'no neighbor: grey');
  assert.strictEqual(ctx._xrayOspfCoreLook({ ospfFull: true, ospfTunBucket: 'init' }).color, GREEN, 'two links, one Full: green');
});

test('single link: process circle, line and word agree for each state, also when ospf_active_on_interface is false', function () {
  ctx._xrayProtocol = 'ospf';
  STATES.forEach(function (c) {
    [true, false].forEach(function (active) {
      if (c[0] === 'Full' && !active) return;
      var st = ctx.xrayEvaluateState(single(c[0], active));
      var look = ctx._xrayOspfCoreLook(st);
      assert.ok(look, c[0] + ' (' + active + '): ball not grey');
      assert.strictEqual(look.color, singleLine(st.ospfTunBucket).color, c[0] + ' (' + active + '): ball = line');
      assert.strictEqual(look.color, ctx._xrayOspfNbrColor(c[0], 'DROther'), c[0] + ' (' + active + '): ball = word');
      assert.notStrictEqual(st.ospfPhase, 'inactive', c[0] + ' (' + active + '): phase');
    });
  });
  assert.strictEqual(ctx._xrayOspfCoreLook(ctx.xrayEvaluateState(single('None', true))), null, 'no neighbor: grey circle');
  assert.strictEqual(ctx._xrayOspfCoreLook(ctx.xrayEvaluateState(single('None', false))), null, 'no neighbor, no flag: grey circle');
});

test('the OSPF Hello balls stay orange: one color in the css, no state rule changes it', function () {
  var m = /background:radial-gradient\(circle,#fff,rgba\(var\(--xto-idle-rgb,255,140,0\)/.test(CORE);
  assert.ok(m, 'Hello ball gradient is orange');
  var other = CORE.match(/\.de-hello-orb[^{]*\{[^}]*background[^}]*\}/g) || [];
  assert.strictEqual(other.length, 1, 'only one Hello ball background rule: ' + other.join(' | '));
  assert.ok(!/de-hello-orb[^;]*\.style\.(background|backgroundColor)/.test(CORE), 'no inline Hello ball color');
});
