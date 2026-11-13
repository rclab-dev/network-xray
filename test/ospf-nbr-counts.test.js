'use strict';
// The OSPF "Neighbor" line as counts (v1.4): with the OSPF interface rows in the state (ospf_ifaces), the Routing Engine panel says
// "Neighbor: Full 2 · no adjacency 1" - the OSPF interfaces that face a neighbour, with a Full adjacency / without (the same count
// as lab_state's ospf_ifaces_full / ospf_ifaces_without_adjacency) - instead of one word that turned orange when one was missing
// (an orange "Full" was read as "not Full"). The node panel (Lite) puts the same counts first in its What's wrong box.
// States without those rows keep the old line. Fixture = FRR 10.7.1 (test/fixtures/frr-hello-mismatch: r1 eth1 -> r2 hello 5 / 10).
// Run: node --test        (from the repo root; Node >= 18, no dependencies)
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const q = require('../scripts/xray-query.js');

const ROOT = path.join(__dirname, '..');
const LAB = () => JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', 'frr-hello-mismatch', 'lab-states.json'), 'utf8'));

function core(lang) {
  const doc = { getElementById: () => null, querySelector: () => null, querySelectorAll: () => [], createElement: () => ({ style: {} }),
    addEventListener() {}, head: { appendChild() {} }, body: { classList: { add() {}, remove() {}, toggle() {}, contains: () => false } },
    documentElement: { getAttribute: () => lang || 'en' } };
  const ctx = { document: doc, console: { log() {}, warn() {}, error() {} }, setTimeout: () => 0, clearTimeout() {}, setInterval: () => 0,
    clearInterval() {}, requestAnimationFrame: () => 0, navigator: { userAgent: '' }, location: { search: '', href: '', hash: '' },
    localStorage: { getItem: () => null, setItem() {} }, getComputedStyle: () => ({}), addEventListener() {} };
  ctx.window = ctx; ctx.self = ctx; ctx.xrayCore = {};
  vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(path.join(ROOT, 'xray-core.js'), 'utf8'), ctx, { filename: 'xray-core.js' });
  return ctx;
}
const plain = (t) => String(t).replace(/<[^>]+>/g, '').replace(/^(?:>|・) /, '> ');   /* the panel draws '> ' as '・ ' */
function nbrLine(st, lang) {
  const lines = core(lang).xrayOspfDeepLines(st, {});
  return Array.from(lines).filter((l) => /^> Neighbor: /.test(plain(l.text)))[0];
}

test('the RE panel: "Neighbor: Full 2 · no adjacency 1" for r1 (eth1 -> r2 has no adjacency), the count green, the missing one orange', () => {
  const l = nbrLine(LAB().r1);
  assert.equal(plain(l.text), '> Neighbor: Full 2 · no adjacency 1');
  assert.match(l.text, /<span style="color:#39ff14">Full 2<\/span>/, 'the Full count stays green (not turned orange)');
  assert.match(l.text, /<span style="color:#ff8c00">no adjacency 1<\/span>/);
});

test('the same numbers as lab_state (ospf_ifaces_full / ospf_ifaces_without_adjacency)', () => {
  const lab = LAB();
  const c = q.summarize(lab).counts;
  let full = 0, none = 0;
  for (const n of Object.keys(lab)) {
    const m = /Full (\d+)(?: · no adjacency (\d+))?/.exec(plain(nbrLine(lab[n]).text));
    full += Number(m[1]); none += Number(m[2] || 0);
  }
  assert.deepEqual([full, none], [c.ospf_ifaces_full, c.ospf_ifaces_without_adjacency]);
});

test('all Full: only the count; Japanese page: the words in Japanese', () => {
  assert.equal(plain(nbrLine(LAB().r3).text), '> Neighbor: Full 3');
  assert.equal(plain(nbrLine(LAB().r2, 'ja').text), '> Neighbor: Full 1 · 隣接なし 1');
});

test('passive interfaces and interfaces without a neighbour on the link are not counted; an interface with no neighbour row uses its own count', () => {
  const st = LAB().r1;
  st.ospf_ifaces.eth3.passive = true;
  st.ospf_ifaces.eth9 = { area: '0.0.0.0', passive: false };   /* no peer on the link: not facing a neighbour */
  assert.equal(plain(nbrLine(st).text), '> Neighbor: Full 1 · no adjacency 1');
  st.ospf_neighbors = st.ospf_neighbors.filter((n) => n.iface !== 'eth2');
  st.ospf_ifaces.eth2.neighbors_adjacent = 1;
  assert.equal(plain(nbrLine(st).text), '> Neighbor: Full 1 · no adjacency 1', 'eth2: no row, neighbors_adjacent 1 = Full');
});

test('a state without OSPF interface rows keeps the one-word line', () => {
  const st = LAB().r1;
  delete st.ospf_ifaces;
  assert.ok(!/no adjacency|Full \d/.test(plain(nbrLine(st).text)), plain(nbrLine(st).text));
});

function lite(st) {
  const window = {};
  const document = { getElementById: () => null, createElement: () => ({}), head: { appendChild() {} } };
  vm.runInNewContext(fs.readFileSync(path.join(ROOT, 'xray-node-panel.js'), 'utf8'), { window, document }, { filename: 'xray-node-panel.js' });
  const el = { innerHTML: '', classList: { add() {} }, querySelectorAll: () => [], querySelector: () => null };
  window.XrayNodePanel.render(el, st);
  return el.innerHTML;
}

test("Lite: the counts first in What's wrong", () => {
  const h = lite(LAB().r1);
  const box = h.slice(h.indexOf("What's wrong"));
  assert.match(box, /<div class="xnp-wrong-count"[^>]*>OSPF neighbor: <span class="xnp-wrong-none">Full 2<\/span> · <span class="xnp-wrong-down">no adjacency 1<\/span><\/div><div class="xnp-wrong-down">/);
  assert.match(lite(LAB().r3), /OSPF neighbor: <span class="xnp-wrong-none">Full 3<\/span><\/div><div class="xnp-wrong-none">/);
});
