// render.test.js — scripts/xray-render.js: one router as one static HTML page (v1.8.1).
// Run: node --test        (from the repo root; Node >= 18, no dependencies)
//
// - The page has no script and loads nothing from the network; it carries the panel's stylesheet and the skin's rule.
// - Default: dark ground, the cylinder picture, the tables; --skin slate-light: the light ground; --figure box: the box.
// - The one line: the BGP answer (why_path's summary) for a BGP route.
// - --detail summary leaves the tables out; --before shows what changed on the router, then before | now.
// - Names from the state are escaped; wrong input gives exit 2 and a message.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { renderPage } = require('../scripts/xray-render.js');
const query = require('../scripts/xray-query.js');

const ROOT = path.join(__dirname, '..');
const B = query.loadStates(path.join(ROOT, 'demo', 'bgp-lp', 'frameB.json'));
const A = query.loadStates(path.join(ROOT, 'demo', 'bgp-lp', 'frameA.json'));

test('a static page: no script, nothing loaded from elsewhere, the panel stylesheet and the skin rule', () => {
  const h = renderPage(B, 'r1');
  assert.doesNotMatch(h, /<script/i);
  assert.doesNotMatch(h, /\b(?:src|href)\s*=\s*["']?(?:https?:)?\/\//i);
  assert.match(h, /\.xnp-root\{--xnp-fg:/, 'the panel stylesheet');
  assert.match(h, /--xnp-figure:cylinder !important;/, 'the skin rule (default: the cylinder)');
  assert.match(h, /class="xnp-fig xnp-fig-cyl"/);
  assert.match(h, /Routing table/);
  assert.match(h, /background:#0a1016/, 'dark ground by default');
});

test('--skin slate-light: light ground; --figure box: the box', () => {
  const l = renderPage(B, 'r1', { skin: 'slate-light' });
  assert.match(l, /--xnp-bg:#ffffff !important;/);
  assert.match(l, /background:#eef1f5/);
  const b = renderPage(B, 'r1', { figure: 'box' });
  assert.doesNotMatch(b, /xnp-fig-cyl/);
  assert.match(b, /--xnp-figure:box !important;/);
});

test('the one line is the BGP answer for a BGP route', () => {
  const h = renderPage(B, 'r1');
  assert.match(h, /<p class="nx-line">r1 8\.8\.8\.0\/24 uses the path via r2 \(10\.10\.0\.20\), AS 65002: LocPrf 150 &gt; 100 \(via r3 \(10\.11\.0\.20\)\)<\/p>/);
});

test('--detail summary leaves the tables out; --before shows the change and before | now', () => {
  const s = renderPage(B, 'r1', { detail: 'summary' });
  assert.doesNotMatch(s, /Routing table/);
  assert.match(s, /xnp-fig-cyl/);
  const d = renderPage(B, 'r1', { before: A });
  assert.match(d, /What changed on r1/);
  assert.match(d, /<table class="nx-changes">/);
  assert.strictEqual((d.match(/class="xnp-root"/g) || []).length, 2, 'two panels: before and now');
});

test('names from the state are escaped', () => {
  const evil = JSON.parse(JSON.stringify(B));
  evil['<img src=x onerror=alert(1)>'] = Object.assign({}, B.r1, { target_node: '<img src=x onerror=alert(1)>' });
  const h = renderPage(evil, '<img src=x onerror=alert(1)>');
  assert.doesNotMatch(h, /<img src=x/);
  assert.match(h, /&lt;img src=x onerror=alert\(1\)&gt;/);
});

test('CLI: wrong input -> exit 2 with a message; a good one -> the page on stdout', () => {
  const run = (...a) => spawnSync(process.execPath, [path.join(ROOT, 'scripts', 'xray-render.js'), ...a], { encoding: 'utf8' });
  let r = run(path.join(ROOT, 'demo', 'bgp-lp', 'frameB.json'), 'r9');
  assert.strictEqual(r.status, 2); assert.match(r.stderr, /unknown router: r9/);
  r = run(path.join(ROOT, 'demo', 'bgp-lp', 'frameB.json'), 'r1', '--figure', 'oval');
  assert.strictEqual(r.status, 2); assert.match(r.stderr, /--figure must be cylinder or box/);
  r = run(path.join(ROOT, 'no-such-state.json'), 'r1');
  assert.strictEqual(r.status, 2); assert.match(r.stderr, /not found/);
  r = run(path.join(ROOT, 'demo', 'bgp-lp', 'frameB.json'), 'r1', '--skin', 'slate-light');
  assert.strictEqual(r.status, 0); assert.match(r.stdout, /^<!doctype html>/);
});
