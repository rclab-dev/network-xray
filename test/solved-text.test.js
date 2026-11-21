// solved-text.test.js - problem.json solved_text_en / solved_text_ja (xray-graph-nextui.html nx_solved_text): a short note shown
// under the problem only while the lab is solved, before the solved_cta link; a missing language falls back; the same tags
// as the problem text (<br> <code> <strong> <span>, no attributes), anything else stays text.
// The band code is cut out of xray-graph-nextui.html and run on a small fake document.
// Run: node --test        (from the repo root; Node >= 18, no dependencies)
'use strict';
var test = require('node:test');
var assert = require('node:assert');
var fs = require('fs');
var path = require('path');
var vm = require('vm');

var SRC = fs.readFileSync(path.join(__dirname, '..', 'xray-graph-nextui.html'), 'utf8');
function cut(name) {
  var m = new RegExp('^  function ' + name + '\\(', 'm').exec(SRC);
  assert.ok(m, name + ' not found');
  var i = SRC.indexOf('{', m.index), depth = 0, j = i;
  for (; j < SRC.length; j++) { if (SRC[j] === '{') depth++; else if (SRC[j] === '}' && --depth === 0) break; }
  return SRC.slice(m.index, j + 1);
}

// a fake element: children by class, innerHTML kept as a string
function el(cls) {
  var e = {
    className: cls || '', children: [], attrs: {}, innerHTML: '', textContent: '', parent: null,
    classList: { toggle: function () {} },
    get firstChild() { return e.children[0] || null; },
    querySelector: function (sel) { var c = sel.slice(1); return e.children.filter(function (x) { return x.className === c; })[0] || null; },
    appendChild: function (x) { x.parent = e; e.children.push(x); return x; },
    insertBefore: function (x, ref) { x.parent = e; var k = ref ? e.children.indexOf(ref) : -1; if (k < 0) e.children.push(x); else e.children.splice(k, 0, x); return x; },
    remove: function () { if (e.parent) e.parent.children.splice(e.parent.children.indexOf(e), 1); },
    getAttribute: function (k) { return k in e.attrs ? e.attrs[k] : null; },
    setAttribute: function (k, v) { e.attrs[k] = String(v); }
  };
  return e;
}
function page(pj, lang) {
  var host = el('');
  var ctx = {
    window: { __nxProblemJson: pj, __nxSolved: false },
    document: { getElementById: function () { return host; }, createElement: function () { return el(''); }, createTextNode: function (t) { var x = el(''); x.textContent = t; return x; } },
    localStorage: { getItem: function () { return lang || 'en'; } },
    URL: URL
  };
  ctx.window.document = ctx.document;
  vm.createContext(ctx);
  vm.runInContext(['nxSolvedPaint', 'nxSolvedLang', 'nxSolvedTextHtml', 'nxSolvedText', 'nxSolvedCta', 'nxIsRclLink'].map(cut).join('\n') +
    '\nthis.paint = nxSolvedPaint;', ctx);
  return { host: host, ctx: ctx, paint: function (solved) { ctx.window.__nxSolved = solved; ctx.paint(); } };
}
var classes = function (h) { return h.children.map(function (c) { return c.className; }); };

test('solved_text: not shown before the lab is solved, shown once it is, removed when it stops being solved', function () {
  var p = page({ title_en: 't', problem_en: 'p', solved_text_en: 'r1 now prefers r2: LocPrf 150.' });
  p.paint(false);
  assert.strictEqual(p.host.querySelector('.nxp-solved-text'), null);
  p.paint(true);
  assert.strictEqual(p.host.querySelector('.nxp-solved-text').innerHTML, 'r1 now prefers r2: LocPrf 150.');
  p.paint(false);
  assert.strictEqual(p.host.querySelector('.nxp-solved-text'), null);
});

test('solved_text: comes before the solved_cta link', function () {
  var p = page({ title_en: 't', problem_en: 'p', solved_text_en: 'why', solved_cta: { label_en: 'See [more]', url_en: 'https://example.com/x' } });
  p.paint(true);
  assert.deepStrictEqual(classes(p.host).filter(function (c) { return /solved-(text|cta)/.test(c); }), ['nxp-solved-text', 'nxp-solved-cta']);
});

test('solved_text: the problem-text tags are kept, anything else stays text', function () {
  var p = page({ title_en: 't', solved_text_en: 'Set <code>local-preference 150</code><br><strong>done</strong> <img src=x onerror=alert(1)> <span class="x">s</span>' });
  p.paint(true);
  assert.strictEqual(p.host.querySelector('.nxp-solved-text').innerHTML,
    'Set <code>local-preference 150</code><br><strong>done</strong> &lt;img src=x onerror=alert(1)&gt; &lt;span class=&quot;x&quot;&gt;s</span>');
});

test('solved_text: a missing language falls back to the other; none or only spaces = nothing shown', function () {
  var p = page({ title_en: 't', solved_text_ja: '日本語だけ' }, 'en');
  p.paint(true);
  assert.strictEqual(p.host.querySelector('.nxp-solved-text').innerHTML, '日本語だけ');
  var q = page({ title_en: 't', solved_text_en: '   ' });
  q.paint(true);
  assert.strictEqual(q.host.querySelector('.nxp-solved-text'), null);
  var r = page({ title_en: 't' });
  r.paint(true);
  assert.strictEqual(r.host.querySelector('.nxp-solved-text'), null);
});

test('solved_text: Japanese is picked on the 日本語 toggle', function () {
  var p = page({ title_en: 't', solved_text_en: 'english', solved_text_ja: 'にほんご' }, 'ja');
  p.paint(true);
  assert.strictEqual(p.host.querySelector('.nxp-solved-text').innerHTML, 'にほんご');
});

test('solved_cta: one \u25b6 only - the line has none when the Preview button carries it, and keeps it without the button', function () {
  var line = function (pj) {
    var p = page(pj); p.paint(true);
    var sc = p.host.querySelector('.nxp-solved-cta'), tx = sc.children[0];
    return { text: tx.children[0].textContent, buttons: sc.children.length - 1 };
  };
  var rcl = line({ title_en: 't', rcl_qid: 'q21', solved_text_en: 'why', solved_cta: { label_en: 'Try [the lab]', url_en: 'https://routecrushlab.com/lab/pl/q21' } });
  assert.strictEqual(rcl.buttons, 1);
  assert.strictEqual(rcl.text, 'Try ');
  var own = line({ title_en: 't', solved_cta: { label_en: 'See [more]', url_en: 'https://example.com/x' } });
  assert.strictEqual(own.buttons, 0);
  assert.strictEqual(own.text, '\u25b6 See ');
});
