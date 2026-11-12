'use strict';
// Run directly: node test/node-panel-scroll.test.js (no child processes).
// The node panel (xray-node-panel.js) keeps its routing table and BGP table in their own scroll boxes, as the Full
// DeepDive does: a long table scrolls inside the panel, so the figure above stays in view while a row is clicked.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

let css = '';
function page(file, api) {
  const window = {};
  const document = {
    getElementById: () => null,
    createElement: () => ({ set textContent(v) { css = v; } }),
    head: { appendChild() {} }
  };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '..', file), 'utf8'), { window, document }, { filename: file });
  return window[api];
}
const panel = page('xray-node-panel.js', 'XrayNodePanel');

// a stand-in for the box and the rows: positions in px, as the browser would report them
function fakeBox(top, height, scrollTop) {
  return { scrollTop: scrollTop, getBoundingClientRect() { return { top: top, bottom: top + height }; } };
}
function fakeRow(top, height) {
  return { getBoundingClientRect() { return { top: top, bottom: top + height }; } };
}
// a container that hands out the boxes / selected row the render asks for
function container(boxes) {
  return { innerHTML: '', classList: { add() {} }, querySelectorAll: () => [],
    querySelector: (q) => (boxes && boxes[q]) || null };
}

const many = Array.from({ length: 44 }, (_, i) => ({ prefix: '10.' + i + '.0.0/24', out_iface: 'eth' + (1 + (i % 3)), protocol: 'ospf' }));
const st = { target_node: 'r31', interfaces: { eth1: { up: true }, eth2: { up: true }, eth3: { up: true } }, routing_table: many,
  protocol: 'bgp', bgp_routes: [{ prefix: '203.0.113.0', prefixlen: 24, next_hop: '10.0.0.2', as_path: '65002', status: '*>', best: true }] };

test('the routing table and the BGP table are each inside a scroll box', () => {
  const el = container();
  panel.render(el, st, { figure: true });
  assert.match(el.innerHTML, /<div class="xnp-scroll xnp-rt-box"><table class="xnp-rt xnp-click">/);
  assert.match(el.innerHTML, /<div class="xnp-scroll xnp-bgp-box"><table/);
  assert.match(css, /\.xnp-scroll\{max-height:var\(--xnp-scroll-h,240px\);overflow-y:scroll/, 'the box has a height and its scroll bar is always shown');
  assert.match(css, /overflow-y:scroll;overscroll-behavior:contain;color-scheme:dark/, 'the browser\'s own bar, always shown, dark');
  assert.match(css, /@supports \(-moz-appearance:none\)\{\.xnp-scroll\{scrollbar-width:thin;scrollbar-color:/, 'Firefox: a thin coloured bar');
  assert.match(css, /background-attachment:local,local,scroll,scroll/, 'a shade at the edge where more rows are');
  assert.match(css, /\.xnp-figpanel\{[^}]*position:sticky;top:0/, 'the figure stays at the top of a scrolling host');
});

// like the DOM: setting innerHTML builds a new box that starts at the top
function rebuildingContainer() {
  let html = '', box = fakeBox(400, 240, 0);
  return { classList: { add() {} }, querySelectorAll: () => [],
    get innerHTML() { return html; }, set innerHTML(v) { html = v; box = fakeBox(400, 240, 0); },
    querySelector: (q) => (q === '.xnp-rt-box' ? box : null), box: () => box };
}

test('a re-render keeps where the box was scrolled (same node)', () => {
  const el = rebuildingContainer();
  panel.render(el, st, { figure: true });
  el.box().scrollTop = 380;                        // the reader scrolls the box
  panel.render(el, st, { figure: true });          // a click re-renders the panel (a new box)
  assert.equal(el.box().scrollTop, 380, 'the new box is put back where the old one was');
});

test('another node starts its box at the top', () => {
  const el = rebuildingContainer();
  panel.render(el, st, { figure: true });
  el.box().scrollTop = 300;
  panel.render(el, Object.assign({}, st, { target_node: 'r10' }), { figure: true });
  assert.equal(el.box().scrollTop, 0, 'not restored from r31');
});

test('the selected row is brought into the box, and only the box scrolls', () => {
  const below = fakeBox(400, 240, 0), rowBelow = fakeRow(700, 20);         // row under the box: scroll down 80
  panel.render(container({ '.xnp-rt-box': below, '.xnp-rt tr.xnp-sel': rowBelow }), st, { figure: true });
  assert.equal(below.scrollTop, 80);
  const above = fakeBox(400, 240, 200), rowAbove = fakeRow(350, 20);       // row above the box: scroll up 50
  panel.render(container({ '.xnp-rt-box': above, '.xnp-rt tr.xnp-sel': rowAbove }), st, { figure: true });
  assert.equal(above.scrollTop, 150);
  const inside = fakeBox(400, 240, 120), rowIn = fakeRow(450, 20);         // row already visible: no move
  panel.render(container({ '.xnp-rt-box': inside, '.xnp-rt tr.xnp-sel': rowIn }), st, { figure: true });
  assert.equal(inside.scrollTop, 120);
});

// What's wrong first, and the filter (Lite)
test("What's wrong comes first: OSPF interface with no adjacency (values both ends), BGP session not up", () => {
  const el = container();
  panel.render(el, Object.assign({}, st, {
    ospf_ifaces: { eth4: { peer: 'r11', hello: 3, dead: 12, neighbors_adjacent: 0, mismatch: ['hello', 'dead'], remote: { hello: 10, dead: 40 } },
      eth1: { peer: 'r100', neighbors_adjacent: 1 } },
    bgp_neighbors: [{ ip: '10.0.12.2', remote_as: '65009', state: 'Idle' }] }), { figure: true });
  assert.ok(el.innerHTML.indexOf("What's wrong") < el.innerHTML.indexOf('<svg'), 'before the figure');
  assert.match(el.innerHTML, /✕ eth4 → r11: OSPF no adjacency — hello 3 ⇔ 10 · dead 12 ⇔ 40/);
  assert.match(el.innerHTML, /✕ BGP 10\.0\.12\.2 \(AS 65009\): Idle/);
  assert.doesNotMatch(el.innerHTML, /eth1 → r100/, 'a healthy interface is not listed');
  const ok = container();
  panel.render(ok, Object.assign({}, st, { ospf_ifaces: { eth1: { peer: 'r100', neighbors_adjacent: 1 } } }), { figure: true });
  assert.match(ok.innerHTML, /✓ No mismatch or down adjacency/);
  const none = container();
  panel.render(none, { target_node: 'r1', routing_table: many.slice(0, 3) }, { figure: true });
  assert.doesNotMatch(none.innerHTML, /What's wrong/, 'nothing to say without OSPF interface rows or a BGP list');
});

test('a filter box and the count per exit interface come with a long table; each row carries its text', () => {
  const el = container();
  panel.render(el, st, { figure: true });
  assert.match(el.innerHTML, /<input class="xnp-find" type="search"/);
  assert.match(el.innerHTML, /44 routes · <span class="xnp-cnt" data-find="eth1">eth1 15<\/span>/);
  assert.match(el.innerHTML, /<tr[^>]*data-find="10\.0\.0\.0\/24 eth1 ospf">/);
  const short = container();
  panel.render(short, Object.assign({}, st, { routing_table: many.slice(0, 5) }), { figure: true });
  assert.doesNotMatch(short.innerHTML, /xnp-find/, 'not for a short table');
});

test('the filter hides the rows without the text and keeps the text across a re-render of the same node', () => {
  const mkRow = (f) => ({ style: {}, getAttribute: () => f });
  let rows = [], inp = null, html = '';
  const newInput = () => { const i = { value: '', on: {}, addEventListener(k, fn) { this.on[k] = fn; } }; return i; };
  const el = { classList: { add() {} },
    get innerHTML() { return html; },
    set innerHTML(v) { html = v; inp = newInput(); rows = [mkRow('10.1.0.0/24 eth1 ospf'), mkRow('10.2.0.0/24 eth2 ospf')]; },   // like the DOM: new elements
    querySelector: (q) => (q === '.xnp-find' ? inp : null),
    querySelectorAll: (q) => (q === '.xnp-rt tr[data-find]' ? rows : []) };
  panel.render(el, st, { figure: true });
  inp.value = 'eth2'; inp.on.input();
  assert.deepStrictEqual(rows.map((r) => r.style.display), ['none', '']);
  panel.render(el, st, { figure: true });           // a new input and new rows
  assert.strictEqual(inp.value, 'eth2', 'the typed text is put back');
  assert.deepStrictEqual(rows.map((r) => r.style.display), ['none', ''], 'and applied to the new rows');
  panel.render(el, Object.assign({}, st, { target_node: 'r10' }), { figure: true });
  assert.strictEqual(inp.value, '', 'another node starts with no filter');
});
