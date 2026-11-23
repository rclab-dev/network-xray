// steps-in-frame.test.js — "See all decision steps" opens decision-bracket.html in a new window on a page of its own, and over
// the picture in a frame (an MCP Apps host, ?embed=1), where a new window is not allowed. Run: node --test (repo root)
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..');
const SRC = fs.readFileSync(path.join(ROOT, 'xray-api.js'), 'utf8');

function load(opts) {
  const cls = new Set(opts.embed ? ['nx-embed'] : []), opened = [], kids = [], keys = [];
  const mk = (tag) => ({ tagName: tag.toUpperCase(), style: {}, attrs: {}, children: [], textContent: '', setAttribute(k, v) { this.attrs[k] = v; }, appendChild(c) { this.children.push(c); c.parentNode = this; } });
  const body = { appendChild(e) { kids.push(e); e.parentNode = body; }, removeChild(e) { kids.splice(kids.indexOf(e), 1); e.parentNode = null; } };
  const document = {
    currentScript: null, head: mk('head'), body,
    documentElement: { getAttribute: () => 'en', classList: { add() {}, remove() {}, contains: (c) => cls.has(c) } },
    querySelector: () => null, querySelectorAll: () => [], getElementById: (id) => kids.filter((k) => k.id === id)[0] || null,
    createElement: mk, addEventListener: (ev, fn) => keys.push(fn), removeEventListener() {},
  };
  const win = { document, location: { search: '', hash: '' }, setTimeout() {}, addEventListener() {}, JSON, open: (u, t) => opened.push([u, t]) };
  if (opts.mcp) win.__nxMcpApp = true;
  if (opts.bracket) win.__nxBracketHtml = '<html><head></head><body>bracket</body></html>';
  win.window = win;
  vm.runInNewContext(SRC, win);
  return { win, opened, kids, keys };
}
const HREF = 'decision-bracket.html?d=eyJwIjoxfQ&lang=en';

test('a page of its own: a new window, and the link keeps its new-window mark', () => {
  const t = load({});
  t.win.xrayOpenDecisionSteps(HREF);
  assert.deepStrictEqual(t.opened, [[HREF, '_blank']]);
  assert.strictEqual(t.kids.length, 0);
  assert.strictEqual(t.win.xrayDecisionStepsMark(), ' ⧉');
});

test('?embed=1: over the picture (decision-bracket.html by its URL), no new window, no mark; Close and Esc close it', () => {
  const t = load({ embed: true });
  t.win.xrayOpenDecisionSteps(HREF);
  assert.deepStrictEqual(t.opened, []);
  assert.strictEqual(t.kids.length, 1);
  const frame = t.kids[0].children[1];
  assert.strictEqual(frame.tagName, 'IFRAME');
  assert.strictEqual(frame.src, HREF);
  assert.strictEqual(t.win.xrayDecisionStepsMark(), '');
  t.kids[0].children[0].onclick();
  assert.strictEqual(t.kids.length, 0);
  t.win.xrayOpenDecisionSteps(HREF);
  t.keys[t.keys.length - 1]({ key: 'Escape' });
  assert.strictEqual(t.kids.length, 0);
});

test('an MCP Apps host (no URL): decision-bracket.html from the page, given the same query; opening again replaces it', () => {
  const t = load({ mcp: true, bracket: true });
  t.win.xrayOpenDecisionSteps(HREF);
  const frame = t.kids[0].children[1];
  assert.strictEqual(frame.src, undefined);
  assert.match(frame.srcdoc, /window\.__nxBracketSearch = "\?d=eyJwIjoxfQ&lang=en";/);
  t.win.xrayOpenDecisionSteps(HREF);
  assert.strictEqual(t.kids.length, 1);
});

test('decision-bracket.html reads the query from window.__nxBracketSearch when it is given', () => {
  const html = fs.readFileSync(path.join(ROOT, 'decision-bracket.html'), 'utf8');
  assert.match(html, /var NX_QS = \(typeof window\.__nxBracketSearch === "string" && window\.__nxBracketSearch\) \|\| location\.search;/);
  assert.doesNotMatch(html, /new URLSearchParams\(location\.search\)/);
});
