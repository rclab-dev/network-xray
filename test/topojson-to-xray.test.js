'use strict';
// topojson-to-xray.js: FRR topotests JSON topology -> X-Ray config (edges, dummy links, shapes, graph lane, CLI).
const test = require('node:test');
const assert = require('node:assert');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { spawnSync } = require('child_process');
const t2x = require(path.join(__dirname, '..', 'topojson-to-xray.js'));
const CLI = path.join(__dirname, '..', 'topojson-to-xray.js');
const FIXTURE = path.join(__dirname, '..', 'fixtures', 'ospf_single_area.json');

test('isDummyLink: <router>-link<N> keys and "Dummy" descriptions', () => {
  const names = new Set(['r1', 'r2']);
  assert.strictEqual(t2x.isDummyLink('r1-link0', {}, names), true);
  assert.strictEqual(t2x.isDummyLink('R1-LINK3', {}, new Set(['R1'])), true);
  assert.strictEqual(t2x.isDummyLink('r9-link0', {}, names), false);          // base is not a router
  assert.strictEqual(t2x.isDummyLink('r2', { description: 'dummy stub' }, names), true);
  assert.strictEqual(t2x.isDummyLink('r2', { description: 42 }, names), false);
  assert.strictEqual(t2x.isDummyLink('r2', null, names), false);
});

test('golden fixture: 4-node full mesh goes to the graph lane without dummy nodes', () => {
  const r = t2x.convert(fs.readFileSync(FIXTURE, 'utf8'), {});
  assert.strictEqual(r.ok, true);
  assert.strictEqual(r.config.topology_type, 'graph');
  assert.strictEqual(r.config.layout, 'force');
  assert.deepStrictEqual(r.config.nodes.map((n) => n.id).sort(), ['r0', 'r1', 'r2', 'r3']);
  assert.strictEqual(r.config.networks.length, 6);
  assert.strictEqual(r.config.adjacency.length, 6);
  assert.ok(r.config.nodes.every((n) => n.router_id));
  assert.strictEqual(r.config.nodes.filter((n) => n.target).length, 1);
  assert.ok(r.config._warnings.some((w) => /4\+/.test(w)));

  const gd = t2x.convert(fs.readFileSync(FIXTURE, 'utf8'), { emit: 'graph-data' }).graphData;
  assert.strictEqual(gd.nodes.length, 4);
  assert.strictEqual(gd.links.length, 6);
});

test('edges: ospf.neighbors is authoritative; unknown neighbors are ignored', () => {
  const g = t2x.extractGraphTopojson({
    routers: {
      r1: { links: { r2: {}, r3: {} }, ospf: { router_id: '1.1.1.1', neighbors: { r2: {}, ghost: {} } } },
      r2: { links: { r1: {} }, ospf: { neighbors: { r1: {} } } },
      r3: { links: { r1: {} }, ospf: { neighbors: {} } },
    },
  });
  assert.strictEqual(g.name, 'frr-topotest');
  assert.deepStrictEqual(g.edges, [['r1', 'r2'], ['r2', 'r1']]);
});

test('edges without ospf.neighbors: links keys minus lo, loopback, dummy and non-routers', () => {
  const g = t2x.extractGraphTopojson({
    _name: 'fb',
    routers: {
      r1: {
        links: {
          lo: { ipv4: '1.1.1.1/32', type: 'loopback' },
          lo2: { type: 'loopback' },
          'r1-link0': {},
          r2: { description: 'Dummy to r2' },
          r3: { ospf: { area: 0, network: 'point-to-point' } },
          h1: {},
        },
        bgp: { local_as: 65001 },
      },
      r3: { links: { r1: { ospf: { area: '0.0.0.1' } } } },
      r2: {},
    },
  });
  assert.strictEqual(g.name, 'fb');
  assert.deepStrictEqual(g.edges, [['r1', 'r3'], ['r3', 'r1']]);
  // link meta comes from the first side seen
  assert.deepStrictEqual(g.linkMeta['r1 r3'], { area: '0', p2p: true });
  const r1 = g.nodes.find((n) => n.name === 'r1');
  assert.strictEqual(r1.loopback, '1.1.1.1/32');
  assert.strictEqual(r1.local_as, '65001');
  assert.strictEqual(g.nodes.find((n) => n.name === 'r2').loopback, null);
});

test('loopback without an ipv4 is reported as "auto"', () => {
  const g = t2x.extractGraphTopojson({ routers: { r1: { links: { lo: { type: 'loopback' } } } } });
  assert.strictEqual(g.nodes[0].loopback, 'auto');
});

test('2-3 routers map onto linear / triangle shapes with ospf link metadata', () => {
  const tri = t2x.convert({
    routers: {
      r1: { links: { r2: { ospf: { area: 0 } }, r3: {} } },
      r2: { links: { r1: {}, r3: {} } },
      r3: { links: { r1: {}, r2: {} } },
    },
  });
  assert.strictEqual(tri.config.topology_type, 'triangle');
  assert.strictEqual(tri.config.xray.pattern, 'ospf_triangle');
  assert.strictEqual(tri.config.xray.protocol, 'ospf');
  const n12 = tri.config.networks.find((n) => n.name === 'net-r1r2');
  assert.strictEqual(n12.ospf_area, '0');
  assert.strictEqual(n12.ospf_network, undefined);

  const lin = { routers: { b: { bgp: { local_as: 1 }, links: { a: {}, c: {} } }, a: { links: { b: {} } }, c: { links: { b: {} } } } };
  const r = t2x.convert(JSON.stringify(lin), { invertedV: true });
  assert.strictEqual(r.config.topology_type, 'linear_3node');
  assert.strictEqual(r.config.layout, 'inverted_v');
  assert.deepStrictEqual(r.config.nodes.map((n) => n.id), ['a', 'b', 'c']);
  assert.strictEqual(r.config.xray.protocol, 'bgp');
  assert.strictEqual(r.config.nodes.find((n) => n.target).id, 'b');
  assert.strictEqual(r.config.nodes.find((n) => n.id === 'b').local_as, '1');
});

test('server-named routers without routing blocks are servers and never targets', () => {
  const r = t2x.convert({ routers: { h1: { links: { r1: {} } }, r1: { links: { h1: {} } } } }, { target: 'h1' });
  assert.strictEqual(r.config.topology_type, 'linear_2node');
  assert.deepStrictEqual(r.config.nodes.map((n) => [n.id, n.type]), [['h1', 'server'], ['r1', 'router']]);
  assert.strictEqual(r.config.nodes.some((n) => n.target), false);
  assert.strictEqual(t2x.convert({ routers: { h1: { links: { r1: {} } }, r1: { links: { h1: {} } } } },
    { emit: 'graph-data' }).graphData.nodes[0].kind, 'host');
});

test('disconnected 2-3 node topologies go to the graph lane instead of failing', () => {
  const r = t2x.convert({ routers: { r1: {}, r2: {} } });
  assert.strictEqual(r.ok, true);
  assert.strictEqual(r.config.topology_type, 'graph');
  assert.deepStrictEqual(r.config.networks, []);
});

test('fewer than 2 routers -> ok:false; invalid JSON throws', () => {
  assert.deepStrictEqual(t2x.convert({ routers: { r1: {} } }),
    { ok: false, reason: t2x.convert({}).reason, nodes: ['r1'], links: [] });
  assert.strictEqual(t2x.convert({}).ok, false);
  assert.throws(() => t2x.convert('{nope'), SyntaxError);
});

test('CLI: selftest, usage, unsupported exit code, graph-data output', (t) => {
  const st = spawnSync(process.execPath, [CLI, '--selftest'], { encoding: 'utf8' });
  assert.strictEqual(st.status, 0, st.stderr);
  assert.match(st.stdout, /SELFTEST PASS/);

  const none = spawnSync(process.execPath, [CLI], { encoding: 'utf8' });
  assert.strictEqual(none.status, 1);
  assert.match(none.stderr, /usage:/);
  assert.strictEqual(spawnSync(process.execPath, [CLI, '-h'], { encoding: 'utf8' }).status, 0);

  const gd = spawnSync(process.execPath, [CLI, FIXTURE, '--emit', 'graph-data', '--target', 'r1'], { encoding: 'utf8' });
  assert.strictEqual(gd.status, 0, gd.stderr);
  assert.strictEqual(JSON.parse(gd.stdout).links.length, 6);

  const cfg = spawnSync(process.execPath, [CLI, FIXTURE, '--target', 'r2'], { encoding: 'utf8' });
  assert.strictEqual(cfg.status, 0, cfg.stderr);
  assert.strictEqual(JSON.parse(cfg.stdout).nodes.find((n) => n.target).id, 'r2');

  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'nx-t2x-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const one = path.join(dir, 'one.json');
  fs.writeFileSync(one, JSON.stringify({ routers: { r1: {} } }));
  const r = spawnSync(process.execPath, [CLI, one], { encoding: 'utf8' });
  assert.strictEqual(r.status, 2);
  assert.match(r.stderr, /\[UNSUPPORTED\][\s\S]*routers: r1/);
});
