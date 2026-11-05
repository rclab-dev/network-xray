// states-sig-page.test.js — the pages' live poll with xray-states.sig.js, run on a small fake document:
// a restarted collector (new run, counters starting again at the same numbers) redraws the open router, and a failed
// load of xray-states.js is tried again on the next poll instead of being taken as seen.
// The poll code is cut out of xray-graph.html (startLivePoll) and xray-graph-nextui.html (__xrayLiveRefresh).
// Run: node --test        (from the repo root; Node >= 18, no dependencies)
'use strict';
var test = require('node:test');
var assert = require('node:assert');
var fs = require('fs');
var path = require('path');
var vm = require('vm');

var ROOT = path.join(__dirname, '..');

// a fake page: <script> elements are answered at once from `server` (sig / states / a failed load)
function fakePage(server) {
  var page = { draws: 0, loads: 0, tick: null };
  var win = { LIVE_WATCH: true, LIVE_STATES: server.states, __xrayCurNode: 'r2' };
  var doc = {
    hidden: false,
    body: { classList: { contains: function (c) { return c === 'is-xray-deep'; } } },
    querySelector: function () { return null; },
    createElement: function () { return { remove: function () {} }; },
    head: {
      appendChild: function (el) {
        if (/xray-states\.sig\.js/.test(el.src)) { win.LIVE_SIG = server.sig; el.onload(); return; }
        if (/xray-states\.js/.test(el.src)) {
          page.loads++;
          if (server.failNext) { server.failNext = false; el.onerror(); return; }
          win.LIVE_STATES = server.states; el.onload();
        }
      }
    }
  };
  var draw = function () { page.draws++; };
  win.xrayCore = { applyState: draw };
  win._xrayArrowFollow = function () {};
  win.applyXrayState = draw;
  win.__xrayShowNode = draw;
  win.__xrayDeriveProto = function () { return { ospf: false, bgp: false }; };
  page.ctx = vm.createContext({ window: win, document: doc, JSON: JSON, Date: Date, String: String,
    setInterval: function (fn) { page.tick = fn; return 1; } });
  page.win = win;
  return page;
}
function cut(file, from, to) {
  var s = fs.readFileSync(path.join(ROOT, file), 'utf8'), a = s.indexOf(from), b = s.indexOf(to, a);
  assert.ok(a >= 0 && b > a, file + ': the poll code was not found (' + from + ')');
  return s.slice(a, b + to.length);
}
var PAGES = {
  'xray-graph.html': function (page) {
    vm.runInContext(cut('xray-graph.html', '  function startLivePoll(base){', '\n  }\n') + '\nstartLivePoll("");', page.ctx);
    return function () { page.tick(); };
  },
  'xray-graph-nextui.html': function (page) {
    vm.runInContext(cut('xray-graph-nextui.html', '  var _sigOk = null', '\n  }\n  window.addEventListener'), page.ctx);
    return function () { page.win.__xrayLiveRefresh(function () {}); };
  }
};

Object.keys(PAGES).forEach(function (file) {
  test(file + ': a restarted collector redraws even when its counters match the old ones', function () {
    var server = { sig: { run: 1000, gen: 1, nodes: { r1: 1, r2: 1 }, extra: 1 }, states: { r1: {}, r2: { n: 0 } } };
    var page = fakePage(server), poll = PAGES[file](page);
    poll();
    var d0 = page.draws;
    poll();
    assert.strictEqual(page.draws, d0, 'a quiet poll does not redraw');
    // the collector is restarted: a new run, gen and counters start again at the same numbers, r2 changed meanwhile
    server.sig = { run: 2000, gen: 1, nodes: { r1: 1, r2: 1 }, extra: 1 }; server.states = { r1: {}, r2: { n: 3 } };
    poll();
    assert.strictEqual(page.win.LIVE_STATES.r2.n, 3, 'the new state was loaded');
    assert.ok(page.draws > d0, 'the open router is redrawn after the restart');
  });

  test(file + ': a failed load of xray-states.js is tried again on the next poll', function () {
    var server = { sig: { run: 1000, gen: 1, nodes: { r1: 1, r2: 1 }, extra: 1 }, states: { r1: {}, r2: { n: 0 } } };
    var page = fakePage(server), poll = PAGES[file](page);
    poll();
    var d0 = page.draws, l0 = page.loads;
    server.sig = { run: 1000, gen: 2, nodes: { r1: 1, r2: 2 }, extra: 1 }; server.states = { r1: {}, r2: { n: 5 } };
    server.failNext = true;
    poll();
    assert.strictEqual(page.loads, l0 + 1, 'it tried to load');
    assert.strictEqual(page.win.LIVE_STATES.r2.n, 0, 'the load failed: still the old state');
    poll();   // same sig as before: must load again, the last load did not arrive
    assert.strictEqual(page.win.LIVE_STATES.r2.n, 5, 'loaded on the next poll');
    assert.ok(page.draws > d0, 'and redrawn');
    var l1 = page.loads;
    poll();
    assert.strictEqual(page.loads, l1, 'once loaded, the same sig is quiet again');
  });
});
