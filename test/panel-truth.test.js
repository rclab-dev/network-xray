// panel-truth.test.js — the panels do not state what the data does not say: a BGP state that is not in the data is
// shown as "?" (not Idle), and a router's panel shows only its own area (not another router's). Run: node --test
// xray-core.js is loaded into a vm sandbox with a stub document (the same approach as dom-insert-escape.test.js).
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
    getComputedStyle: function () { return {}; }, addEventListener: function () {}
  };
  ctx.window = ctx; ctx.self = ctx;
  vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(path.join(ROOT, 'xray-core.js'), 'utf8'), ctx, { filename: 'xray-core.js' });
  return ctx;
}
function joinText(lines) { return lines.map(function (l) { return l.text; }).join('\n'); }

test('peer panel: BGP state not in the data -> "?" (not Idle), a reported state is shown as is', function () {
  var ctx = sandbox();
  var unknown = joinText(ctx._xrayPeerRouterLines('r2', [], { protocol: 'bgp' }));
  assert.match(unknown, /BGP: <span class="dim">\?<\/span>/);
  assert.doesNotMatch(unknown, /Idle/);
  var active = joinText(ctx._xrayPeerRouterLines('r2', [], { protocol: 'bgp', bgp_state: 'Active' }));
  assert.match(active, /BGP: <span class="warn">Active<\/span>/);
});

test('logic lines: BGP state not in the data -> "?" in the dim style', function () {
  var ctx = sandbox();
  var l = ctx.xrayBgpLogicLines({ protocol: 'bgp', bgp_configured: true })[0];
  assert.strictEqual(l.text, 'BGP: ?');
  assert.strictEqual(l.cls, 'dim');
});

test('peer panel: a router without its own area shows no area (not r2_area)', function () {
  var ctx = sandbox();
  var r3 = joinText(ctx._xrayPeerRouterLines('r3', [], { protocol: 'ospf', has_full: true, r2_area: '0.0.0.1' }));
  assert.doesNotMatch(r3, /area/);
  var r2 = joinText(ctx._xrayPeerRouterLines('r2', [], { protocol: 'ospf', has_full: true, r2_area: '0.0.0.1' }));
  assert.match(r2, /area 0\.0\.0\.1/);
});

test('static DeepDive: "nexthop unreachable" only when the data says so; no Config line when the next hop was not from a static route', function () {
  var ctx = sandbox();
  var base = { protocol: 'static', route_resolution: { resolved: false, target: '192.0.2.99' }, interfaces: {}, config_next_hop: '192.0.2.1' };
  var plain = joinText(ctx.xrayStaticDeepLines(Object.assign({}, base), { target: '192.0.2.99' }));
  assert.match(plain, /NOT INSTALLED/);
  assert.doesNotMatch(plain, /nexthop unreachable/);
  var down = joinText(ctx.xrayStaticDeepLines(Object.assign({ nh_reachable: false }, base), { target: '192.0.2.99' }));
  assert.match(down, /nexthop unreachable/);
  var peer = joinText(ctx.xrayStaticDeepLines(Object.assign({ config_next_hop_from: 'peer' }, base), { target: '192.0.2.99' }));
  assert.doesNotMatch(peer, /Config:/);
});
