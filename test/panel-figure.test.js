// panel-figure.test.js — the single-node panel's two pictures (v1.8.1): the router as a cylinder (default) or as a box.
// Run: node --test        (from the repo root; Node >= 18, no dependencies)
//
// - Default (nothing set): the cylinder. opts.figureStyle 'box' or the CSS variable --xnp-figure: box: the box.
// - Both pictures say the same thing: each link with its peer, the tunnel colour when the adjacency is up, the arrow
//   toward the chosen route's out-interface, the caption "r1 <prefix> → <iface>".
// - A link whose adjacency is down has no tunnel; in the cylinder its wire is dashed.
// - The skin's panelFigure is written as --xnp-figure (xray-skin.js).
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function load(figureVar) {
  const window = {};
  const document = { getElementById: () => null, createElement: () => ({ textContent: '' }), head: { appendChild() {} } };
  const ctx = { window, document };
  if (figureVar != null) ctx.getComputedStyle = () => ({ getPropertyValue: (k) => (k === '--xnp-figure' ? figureVar : '') });
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '..', 'xray-node-panel.js'), 'utf8'), ctx, { filename: 'xray-node-panel.js' });
  return window.XrayNodePanel;
}
function draw(panel, state, opts) {
  const c = { innerHTML: '', classList: { add() {} }, querySelectorAll: () => [], querySelector: () => null };
  panel.render(c, state, Object.assign({ figure: true }, opts || {}));
  return c.innerHTML;
}
const R1 = {
  target_node: 'r1', protocol: 'bgp', bgp_configured: true,
  interfaces: { eth0: { ip: '10.11.0.10' }, eth1: { ip: '10.12.0.10' }, lo: { ip: '1.1.1.1' } },
  r2_iface: 'eth0', r3_iface: 'eth1', r2_has_full: true, r3_has_full: false,
  routing_table: [
    { prefix: '2.2.2.2/32', out_iface: 'eth0', next_hop: '10.11.0.20', protocol: 'ospf' },
    { prefix: '8.8.8.0/24', out_iface: 'eth0', next_hop: '10.11.0.20', protocol: 'bgp', selected: true }
  ],
  route_resolution: { matched_prefix: '8.8.8.0/24', resolved: true, out_iface: 'eth0' }
};

test('default picture = the cylinder; opts.figureStyle box = the box', () => {
  const p = load();
  const cyl = draw(p, R1);
  assert.match(cyl, /class="xnp-fig xnp-fig-cyl"/);
  assert.match(cyl, /<ellipse /, 'the cylinder\'s top rim');
  const box = draw(p, R1, { figureStyle: 'box' });
  assert.doesNotMatch(box, /xnp-fig-cyl/);
  assert.match(box, /<rect x="[\d.]+" y="[\d.]+" width="140" height="104" rx="12"/, 'the box');
});

test('the CSS variable --xnp-figure (a skin) picks the picture; opts.figureStyle wins over it', () => {
  assert.doesNotMatch(draw(load('box'), R1), /xnp-fig-cyl/);
  assert.doesNotMatch(draw(load(' "box" '), R1), /xnp-fig-cyl/, 'quotes and spaces as getComputedStyle may give them');
  assert.match(draw(load('cylinder'), R1), /xnp-fig-cyl/);
  assert.match(draw(load('something else'), R1), /xnp-fig-cyl/, 'an unknown value = the default');
  assert.match(draw(load('box'), R1, { figureStyle: 'cylinder' }), /xnp-fig-cyl/);
});

test('both pictures carry the same meaning: links and peers, tunnel only when up, arrow, caption', () => {
  const p = load();
  for (const style of ['cylinder', 'box']) {
    const h = draw(p, R1, { figureStyle: style });
    assert.match(h, /eth0 — r2/, style + ': eth0 with its peer');
    assert.match(h, /eth1 — r3/, style + ': eth1 with its peer');
    const bgpOn = (ifn) => (h.match(new RegExp('stroke="var\\(--xnp-bgp\\)"[^>]*data-xnp-link="' + ifn + '"', 'g')) || []).length;
    assert.strictEqual(bgpOn('eth0'), 2, style + ': the up BGP session = a tunnel line on both sides of eth0');
    assert.strictEqual(bgpOn('eth1'), 0, style + ': no adjacency on eth1 = no tunnel');
    assert.match(h, /<polygon fill="var\(--xnp-bgp\)"/, style + ': the arrow in the BGP colour (the chosen route is BGP)');
    assert.match(h, /r1  8\.8\.8\.0\/24 → eth0/, style + ': caption');
  }
  const sh = Object.assign({}, R1, { interfaces: Object.assign({}, R1.interfaces, { eth1: { ip: '10.12.0.10', up: false } }) });
  assert.match(draw(p, sh), /stroke="var\(--xnp-down-text,#ff6b6b\)"[^>]*stroke-dasharray="6 5"[^>]*data-xnp-link="eth1"/, 'a shut-down interface: red dashed link');
});

test('the cylinder: the protocols under it, and an OSPF-only router\'s dot in the OSPF colour', () => {
  const p = load();
  assert.match(draw(p, R1), />BGP<\/text>/);
  const o = Object.assign({}, R1, { protocol: 'ospf', bgp_configured: false, r2_proto: 'ospf', r3_proto: 'ospf',
    route_resolution: { matched_prefix: '2.2.2.2/32', resolved: true, out_iface: 'eth0' } });
  const h = draw(p, o);
  assert.match(h, /<circle cx="210" cy="[\d.]+" r="14" fill="var\(--xnp-ospf\)"/);
  assert.match(h, />OSPF<\/text>/);
});

test('xray-skin.js writes panelFigure as --xnp-figure (default cylinder)', () => {
  const styles = {};
  const el = () => ({ style: { setProperty() {} }, appendChild(n) { if (n.id) styles[n.id] = n; } });
  const document = { readyState: 'complete', head: el(), documentElement: el(), getElementById: (id) => styles[id] || null,
    createElement: () => ({ id: '', textContent: '' }), addEventListener() {} };
  const win = { document, JSON, localStorage: { getItem: () => null, setItem() {} } };
  win.window = win;
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '..', 'xray-skin.js'), 'utf8'), win);
  const S = win.XraySkin;
  assert.match(styles['xnp-skin-vars'].textContent, /--xnp-figure:cylinder !important;/, 'the default skin on load');
  S.apply(Object.assign(S.presetById('signature'), { panelFigure: 'box' }));
  assert.match(styles['xnp-skin-vars'].textContent, /--xnp-figure:box !important;/);
  assert.strictEqual(S.normalize({ panelFigure: '<x>' }).panelFigure, 'cylinder');
  assert.strictEqual(S.matchPresetId(Object.assign(S.presetById('signature'), { panelFigure: 'box' })), null);
});

test('a panel drawn before the skin came is drawn again when the skin changes its picture (xray:skin)', () => {
  let figureVar = '', onSkin = null;
  const window = {};
  const document = { getElementById: () => null, createElement: () => ({ textContent: '' }), head: { appendChild() {} },
    addEventListener: (type, fn) => { if (type === 'xray:skin') onSkin = fn; } };
  const ctx = { window, document, getComputedStyle: () => ({ getPropertyValue: (k) => (k === '--xnp-figure' ? figureVar : '') }) };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '..', 'xray-node-panel.js'), 'utf8'), ctx, { filename: 'xray-node-panel.js' });
  const c = { innerHTML: '', isConnected: true, classList: { add() {} }, querySelectorAll: () => [], querySelector: () => null };
  window.XrayNodePanel.render(c, R1, { figure: true });
  assert.match(c.innerHTML, /xnp-fig-cyl/, 'drawn first with no skin: the cylinder');
  assert.equal(typeof onSkin, 'function', 'the panel listens for xray:skin');
  figureVar = 'box'; onSkin();
  assert.doesNotMatch(c.innerHTML, /xnp-fig-cyl/, 'redrawn as the box');
  const before = c.innerHTML; onSkin();
  assert.equal(c.innerHTML, before, 'no change of picture: not drawn again');
});

test('OSPF tunnel by the neighbor state, as the DeepDive draws it (xray-core.js protoStyle)', () => {
  const p = load();
  const base = { target_node: 'r1', protocol: 'ospf', interfaces: { eth1: { ip: '10.0.0.1/24' } }, r2_iface: 'eth1', routing_table: [] };
  const look = (st) => {
    const h = draw(p, Object.assign({}, base, { ospf_neighbors: st ? [{ iface: 'eth1', state: st }] : [] }));
    const lines = h.match(/<line[^>]*data-xnp-link="eth1"\/>/g) || [];
    return lines.slice(1).map((l) => (/xnp-ospf/.test(l) ? 'green' : /xnp-idle/.test(l) ? 'orange' : '?') + (/stroke-dasharray/.test(l) ? '-dashed' : '-solid'));
  };
  assert.deepEqual(look('Full/DR'), ['green-solid', 'green-solid']);
  assert.deepEqual(look('Exchange/Backup'), ['green-dashed', 'green-dashed']);
  assert.deepEqual(look('Loading'), ['green-dashed', 'green-dashed']);
  assert.deepEqual(look('2-Way/DROther'), ['orange-solid', 'orange-solid']);
  assert.deepEqual(look('Init'), ['orange-dashed', 'orange-dashed']);
  assert.deepEqual(look(null), [], 'no neighbor: the link only');
  const h = draw(p, Object.assign({}, base, { ospf_neighbors: [] }));
  assert.match(h, /<line[^>]*stroke="var\(--xnp-phys\)" stroke-width="3\.5"[^>]*data-xnp-link="eth1"\/>/, 'the link up: solid in the link colour');
});
