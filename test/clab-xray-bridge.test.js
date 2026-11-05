'use strict';
// clab-xray-bridge.js: converter config -> drawable scene (toScene) and per-node DeepDive views (deepViews).
const test = require('node:test');
const assert = require('node:assert');
const path = require('path');
const bridge = require(path.join(__dirname, '..', 'clab-xray-bridge.js'));

const net = (a, b) => ({ name: 'net-' + a + b, members: [{ node: a, host_id: 10 }, { node: b, host_id: 20 }] });
const rt = (id, extra) => Object.assign({ id: id, type: 'router', role: 'Router' }, extra || {});

test('toScene: linear 3-node, normal vs fault state on the target', () => {
  const cfg = { id: 'lab', topology_type: 'linear_3node',
    nodes: [rt('r1'), rt('r2', { target: true }), rt('r3')], networks: [net('r1', 'r2'), net('r2', 'r3')] };
  const s = bridge.toScene(cfg);
  assert.strictEqual(s.config.xray.pattern, 'ospf_linear');
  assert.strictEqual(s.config.xray.ping_mode, 'from-r1');
  assert.strictEqual(s.config.xray.protocol, 'ospf');
  assert.deepStrictEqual(s._meta, { protocol: 'ospf', target: 'r2', peerCount: 2 });
  assert.strictEqual(s.topo.subnets['net-r1r2'], '10.1.0.0/24');
  assert.deepStrictEqual(s.topo.nodes.r2.map((i) => [i.name, i.ip, i.state]), [['eth0', '10.1.0.20', 'UP'], ['eth1', '10.2.0.10', 'UP']]);

  const n = s.states.normal;
  assert.strictEqual(n.target_node, 'r2');
  assert.strictEqual(n.full_count, 2);
  assert.strictEqual(n.r1_has_full, true);
  assert.strictEqual(n.r3_iface, 'eth1');
  assert.strictEqual(n.ping_ok, true);
  assert.strictEqual(n.route_resolution.resolved, true);
  assert.strictEqual(n.route_resolution.next_hop, '10.1.0.10');

  const f = s.states.fault;                       // the target's first link is cut
  assert.strictEqual(f.full_count, 1);
  assert.strictEqual(f.r1_has_full, false);
  assert.strictEqual(f.r1_neighbor_state, 'None');
  assert.strictEqual(f.peer_node, 'r3');
  assert.strictEqual(f.interfaces.eth0.up, false);
  assert.strictEqual(s.topos.fault.nodes.r2[0].state, 'DOWN');
  assert.strictEqual(s.topos.fault.nodes.r1[0].state, 'DOWN');
  assert.strictEqual(s.topos.normal.nodes.r1[0].state, 'UP');
});

test('toScene: triangle (every node is a direct peer) falls back to the last peer as the far node', () => {
  const cfg = { id: 't', topology_type: 'triangle', nodes: [rt('r1', { target: true }), rt('r2'), rt('r3')],
    networks: [net('r1', 'r2'), net('r2', 'r3'), net('r3', 'r1')] };
  const s = bridge.toScene(cfg, { protocol: 'bgp' });
  assert.strictEqual(s.config.xray.pattern, 'ospf_triangle');
  assert.strictEqual(s.config.xray.ping_mode, 'through');
  assert.strictEqual(s.config.xray.protocol, 'bgp');
  // last peer = r3; its first subnet is net-r2r3 (index 1) -> 10.2.0.1
  assert.strictEqual(s.states.normal.route_resolution.target, '10.2.0.1');
  assert.strictEqual(s.states.normal.route_resolution.matched_prefix, '10.2.0.0/24');
});

test('toScene: a single node without links gives a degraded but well-formed state', () => {
  const s = bridge.toScene({ id: 'solo', nodes: [rt('r1')] });
  const st = s.states.normal;
  assert.strictEqual(st.target_node, 'r1');
  assert.strictEqual(st.full_count, 0);
  assert.strictEqual(st.neighbor_state, 'None');
  assert.strictEqual(st.ping_ok, false);
  assert.strictEqual(st.peer_node, '');
  assert.strictEqual(st.wan_iface, 'eth0');
  assert.deepStrictEqual(st.route_resolution, { target: '', resolved: false, protocol: '', out_iface: '', next_hop: '', matched_prefix: '' });
  assert.deepStrictEqual(s.topo.subnets, {});
});

test('toScene: empty config does not throw', () => {
  const s = bridge.toScene({});
  assert.strictEqual(s._meta.target, undefined);
  assert.strictEqual(s._meta.peerCount, 0);
  assert.deepStrictEqual(s.config.nodes, []);
});

test('toScene: networks that are not point-to-point or name unknown nodes are skipped', () => {
  const cfg = { id: 'x', nodes: [rt('r1'), rt('r2')], networks: [
    { name: 'lan', members: [{ node: 'r1', host_id: 1 }, { node: 'r2', host_id: 2 }, { node: 'r3', host_id: 3 }] },
    { name: 'noMembers' },
    net('r1', 'ghost'),
    net('r1', 'r2'),
  ] };
  const s = bridge.toScene(cfg);
  assert.deepStrictEqual(s.topo.nodes.r1.map((i) => i.name), ['eth0', 'eth1']);   // net-r1ghost + net-r1r2
  assert.deepStrictEqual(s.topo.nodes.r2.map((i) => i.ip), ['10.4.0.20']);
  assert.strictEqual(s._meta.target, 'r1');                                         // no explicit target -> first node
});

test('toScene: node type derives from role / id unless keepType', () => {
  const cfg = { id: 'k', nodes: [{ id: 'sv1', role: 'Server', type: 'x' }, { id: 'isp1', type: 'router' }, { id: 'r1', type: 'custom' }] };
  assert.deepStrictEqual(bridge.toScene(cfg).config.nodes.map((n) => n.type), ['server', 'isp', 'router']);
  assert.deepStrictEqual(bridge.toScene(cfg, { keepType: true }).config.nodes.map((n) => n.type), ['x', 'router', 'custom']);
  assert.strictEqual(cfg.nodes[0].type, 'x', 'input config is not mutated');
});

test('deepViews: stub node -> single-link 2-node view', () => {
  const cfg = { id: 'lab', nodes: [rt('r1'), rt('r2'), rt('r3')], networks: [net('r1', 'r2'), net('r2', 'r3')] };
  const v = bridge.deepViews(cfg, 'r1');
  assert.strictEqual(v.length, 1);
  assert.deepStrictEqual(v[0].peers, ['r2']);
  const c = v[0].scene.config;
  assert.strictEqual(c.topology_type, 'linear_2node');
  assert.strictEqual(c.id, 'lab-r1');
  assert.strictEqual(c.nodes.find((n) => n.id === 'r1').single_link, true);
  assert.deepStrictEqual(c.modes, ['troubleshoot']);
});

test('deepViews: 2 peers -> centre node in the middle, inverted_v, positions and links carried', () => {
  const cfg = { id: 'lab', modes: ['capture'], nodes: [rt('r1'), rt('r2'), rt('r3')],
    networks: [net('r1', 'r2'), net('r2', 'r3')],
    positions: { r1: { x: 1, y: 1 }, r2: { x: 2, y: 2 } },
    links: [{ a: 'r2', b: 'r1', aIf: 'eth0', bIf: 'eth0' }, { a: 'r1', b: 'r3' }, null] };
  const v = bridge.deepViews(cfg, 'r2');
  assert.strictEqual(v.length, 1);
  assert.strictEqual(v[0].label, 'r1 / r3');
  const c = v[0].scene.config;
  assert.deepStrictEqual(c.nodes.map((n) => n.id), ['r1', 'r2', 'r3']);
  assert.strictEqual(c.layout, 'inverted_v');
  assert.strictEqual(c.nodes[1].target, true);
  assert.strictEqual(c.nodes[1].single_link, false);
  assert.deepStrictEqual(Object.keys(c.positions), ['r2', 'r1']);
  assert.deepStrictEqual(c.links, [{ a: 'r2', b: 'r1', aIf: 'eth0', bIf: 'eth0' }]);
  assert.deepStrictEqual(c.modes, ['capture']);
});

test('deepViews: a parallel link to the same peer does not duplicate that peer', () => {
  const cfg = { id: 'p', nodes: [rt('r1'), rt('r2')],
    networks: [net('r1', 'r2'), { name: 'net-r1r2-b', members: [{ node: 'r2', host_id: 10 }, { node: 'r1', host_id: 20 }] }] };
  const v = bridge.deepViews(cfg, 'r1');
  assert.deepStrictEqual(v[0].peers, ['r2']);
  assert.strictEqual(v[0].scene.config.nodes.length, 2);
  assert.strictEqual(v[0].scene.config.networks.length, 2);
});

test('deepViews: unknown or isolated node -> one view labelled with the node', () => {
  const v = bridge.deepViews({ id: 'x', nodes: [rt('r1')], networks: [] }, 'zz');
  assert.strictEqual(v.length, 1);
  assert.strictEqual(v[0].label, 'zz');
  assert.deepStrictEqual(v[0].peers, []);
  assert.strictEqual(v[0].scene.config.nodes[0].type, 'router');   // placeholder node
});

test('deepViews: 3+ peers -> one view; with a state, peers on real interfaces come first', () => {
  const cfg = { id: 'hub', nodes: [rt('h'), rt('a'), rt('b'), rt('c')],
    networks: [net('h', 'a'), net('h', 'b'), net('h', 'c')] };
  const plain = bridge.deepViews(cfg, 'h');
  assert.strictEqual(plain.length, 1);
  assert.deepStrictEqual(plain[0].peers, ['a', 'b', 'c']);
  assert.strictEqual(plain[0].scene.config.topology_type, 'linear_3node');

  const state = { a_iface: 'lo', b_iface: 'eth1', c_iface: 'eth2',
    interfaces: { eth1: { ip: '' }, eth2: { ip: '10.0.0.1/24' }, lo: { ip: '1.1.1.1/32' } } };
  assert.deepStrictEqual(bridge.deepViews(cfg, 'h', { state: state })[0].peers, ['c', 'a', 'b']);
});

test('deepViews: 3+ peers with cfg.links -> the session link must be the one on the state interface (SRL names)', () => {
  const cfg = { id: 'srl', nodes: [rt('h'), rt('a'), rt('b'), rt('c')],
    networks: [net('h', 'a'), net('h', 'b'), net('h', 'c')],
    links: [{ a: 'h', b: 'a', aIf: 'e1-1', bIf: 'e1-1' }, { a: 'b', b: 'h', aIf: 'e1-1', bIf: 'e1-2' }, { a: 'h', b: 'c', aIf: 'e1-3', bIf: 'e1-1' }] };
  const state = { a_iface: 'ethernet-1/9.0', b_iface: 'ethernet-1/2.0', c_iface: 'ethernet-1/3.0',
    interfaces: { 'ethernet-1/9.0': { ip: '10.0.9.1/31' }, 'ethernet-1/2.0': { ip: '10.0.2.1/31' }, 'ethernet-1/3.0': { ip: '10.0.3.1/31' } } };
  // a's state interface is not the a-link's interface -> a goes last
  assert.deepStrictEqual(bridge.deepViews(cfg, 'h', { state: state })[0].peers, ['b', 'c', 'a']);
});

test('markSynthetic: no DOM -> no-op', () => {
  assert.strictEqual(bridge.markSynthetic(true, 'en'), undefined);
  assert.ok(bridge.SYNTHETIC_BADGE.en.title && bridge.SYNTHETIC_BADGE.ja.title);
  assert.strictEqual(bridge.SYNTHETIC_TAG.ja, '(見本)');
});
