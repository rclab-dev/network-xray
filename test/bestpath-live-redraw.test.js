// bestpath-live-redraw.test.js — the Best-Path Decision box follows a new state while it is open.
// Run: node --test        (from the repo root; Node >= 18, no dependencies)
//
// On a live lab the BGP table and the Best-Path Decision box are drawn again each time a state arrives
// (xray-core.js xrayRenderBgpTableReplay -> showDecision). An open LocPrf (etc.) pop-up in the box used to stop
// that redraw: change LocPref with the pop-up open and the table showed the new best while the box kept the old
// comparison. Now the box is redrawn with the new values and the pop-up is opened again in the new box.
//
// xray-core.js is a browser file, so showDecision is cut out of it by name and run with a tiny stand-in for the
// two DOM boxes (only what showDecision touches). Nothing in xray-core.js is changed.
'use strict';
var test = require('node:test');
var assert = require('node:assert');
var fs = require('fs');
var path = require('path');

var SRC = fs.readFileSync(path.join(__dirname, '..', 'xray-core.js'), 'utf8').replace(/\r\n/g, '\n');
var m = /\n  function showDecision\(html\) \{\n[\s\S]*?\n  \}\n/.exec(SRC);

// a box whose content is an html string; ".de-bgp-bracket-pop" is found when the string has one
function fakeBoxes() {
  var drows = { html: '' }, pop = null;
  Object.defineProperty(drows, 'innerHTML', {
    get: function () { return this.html; },
    set: function (v) {
      this.html = String(v);
      pop = /class="de-bgp-bracket-pop/.test(this.html) ? { cls: {}, classList: { add: function (c) { pop.cls[c] = true; }, contains: function (c) { return !!pop.cls[c]; } } } : null;
    }
  });
  var dbox = {
    style: { display: 'none' },
    querySelector: function (sel) {
      if (sel === '.de-bgp-bracket-pop') return pop;
      if (sel === '.de-bgp-bracket-pop.open') return pop && pop.cls.open ? pop : null;
      return null;
    }
  };
  return { dbox: dbox, drows: drows, pop: function () { return pop; } };
}
function load(b) {
  var doc = { querySelector: function (sel) { return b.dbox.querySelector(sel); } };
  return new Function('dbox', 'drows', 'document', m[0] + '\nreturn showDecision;')(b.dbox, b.drows, doc);
}
var OLD = '<div class="bgp-reason">8.8.8.0/24 best path by LocPrf (100 &gt; 50)</div><div class="de-bgp-bracket-pop">LocPrf (100 &gt; 50)</div>';
var NEW = '<div class="bgp-reason">8.8.8.0/24 best path by LocPrf (150 &gt; 100)</div><div class="de-bgp-bracket-pop">LocPrf (150 &gt; 100)</div>';

test('showDecision is found in xray-core.js', function () {
  assert.ok(m, 'function showDecision(html) not found');
});

test('pop-up closed: a new state redraws the box (as before)', function () {
  var b = fakeBoxes(), show = load(b);
  show(OLD); show(NEW);
  assert.strictEqual(b.drows.innerHTML, NEW);
  assert.strictEqual(b.dbox.style.display, '');
  assert.ok(!b.pop().cls.open, 'pop-up stays closed');
});

test('pop-up open: a new state redraws the box and the pop-up shows the new values', function () {
  var b = fakeBoxes(), show = load(b);
  show(OLD); b.pop().classList.add('open');
  show(NEW);
  assert.strictEqual(b.drows.innerHTML, NEW, 'box has the new comparison (150 > 100), not the old (100 > 50)');
  assert.ok(b.pop().cls.open, 'the pop-up is open again in the new box');
});

test('pop-up open, new box without a pop-up: nothing to reopen', function () {
  var b = fakeBoxes(), show = load(b);
  show(OLD); b.pop().classList.add('open');
  var plain = '<div class="bgp-reason">8.8.8.0/24 only one path</div>';
  show(plain);
  assert.strictEqual(b.drows.innerHTML, plain);
  assert.strictEqual(b.pop(), null);
});

// the pop-up adds these two to document when it opens and removes them when it closes: they must exist
function cutFn(name) {
  var r = new RegExp('\\nfunction ' + name + '\\(e\\) \\{\\n[\\s\\S]*?\\n\\}\\n').exec(SRC);
  return r && r[0];
}
test('the pop-up closes on a click outside it and on ESC (handlers exist)', function () {
  var o = cutFn('xrayBgpOutsideBracketPop'), k = cutFn('xrayBgpEscBracketPop');
  assert.ok(o && k, 'xrayBgpOutsideBracketPop / xrayBgpEscBracketPop are defined');
  var closed = 0, close = function () { closed++; };
  var f = new Function('xrayBgpCloseBracketPop', o + k + '\nreturn [xrayBgpOutsideBracketPop, xrayBgpEscBracketPop];')(close);
  var inPop = { closest: function (s) { return s === '.de-bgp-bracket-pop' ? {} : null; } };
  var outside = { closest: function () { return null; } };
  f[0]({ target: inPop }); assert.strictEqual(closed, 0, 'a click inside the pop-up keeps it');
  f[0]({ target: outside }); assert.strictEqual(closed, 1, 'a click outside closes it');
  f[1]({ key: 'Enter' }); assert.strictEqual(closed, 1);
  f[1]({ key: 'Escape' }); assert.strictEqual(closed, 2, 'ESC closes it');
});

test('no routes: the box is hidden even with the pop-up open', function () {
  var b = fakeBoxes(), show = load(b);
  show(OLD); b.pop().classList.add('open');
  show('');
  assert.strictEqual(b.dbox.style.display, 'none');
});
