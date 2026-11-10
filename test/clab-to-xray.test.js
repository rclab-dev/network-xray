'use strict';
// clab-to-xray.js: the minimal YAML loader, graph extraction, shape classification and config assembly.
const test = require('node:test');
const assert = require('node:assert');
const path = require('path');
const { spawnSync } = require('child_process');
const c = require(path.join(__dirname, '..', 'clab-to-xray.js'));
const CLI = path.join(__dirname, '..', 'clab-to-xray.js');

function lab(nodes, links) {
  let y = 'name: lab\ntopology:\n  nodes:\n';
  for (const n of nodes) y += '    ' + n.name + ':\n      kind: ' + (n.kind || 'linux') + '\n';
  y += '  links:\n';
  for (const [a, b] of links) y += '    - endpoints: ["' + a + ':eth1", "' + b + ':eth1"]\n';
  return y;
}

test('parseYaml: scalars, quotes, comments and flow lists', () => {
  const y = [
    'name: "my lab"   # trailing comment',
    'n: 42',
    'f: 1.5',
    'neg: -3',
    'yes: true',
    'no: false',
    'nothing: ~',
    'nul: null',
    "s: 'a # not a comment'",
    'url: http://x#frag',
    'empty: []',
    'list: [a, "b:c", 3]',
  ].join('\n');
  const o = c.parseYaml(y);
  assert.strictEqual(o.name, 'my lab');
  assert.strictEqual(o.n, 42);
  assert.strictEqual(o.f, 1.5);
  assert.strictEqual(o.neg, -3);
  assert.strictEqual(o.yes, true);
  assert.strictEqual(o.no, false);
  assert.strictEqual(o.nothing, null);
  assert.strictEqual(o.nul, null);
  assert.strictEqual(o.s, 'a # not a comment');
  assert.strictEqual(o.url, 'http://x#frag');   // '#' not after whitespace is not a comment
  assert.deepStrictEqual(o.empty, []);
  assert.deepStrictEqual(o.list, ['a', 'b:c', 3]);
});

test('parseYaml: empty / comment-only input gives an empty object', () => {
  assert.deepStrictEqual(c.parseYaml(''), {});
  assert.deepStrictEqual(c.parseYaml('# only a comment\n\n'), {});
});

test('parseYaml: CRLF line endings', () => {
  const o = c.parseYaml('a: 1\r\nb:\r\n  c: 2\r\n');
  assert.deepStrictEqual(o, { a: 1, b: { c: 2 } });
});

test('parseYaml: list of maps with continuation keys and nested blocks', () => {
  const y = [
    'items:',
    '  - name: a',
    '    kind: x',
    '    tags: [t1, t2]',
    '    sub:',
    '      k: v',
    '  - plain',
    '  - name: b',
  ].join('\n');
  assert.deepStrictEqual(c.parseYaml(y).items, [
    { name: 'a', kind: 'x', tags: ['t1', 't2'], sub: { k: 'v' } },
    'plain',
    { name: 'b' },
  ]);
});

test('parseYaml: indent errors and non key:value lines throw', () => {
  assert.throws(() => c.parseYaml('a: 1\n    b: 2\n'), /indent error/);
  assert.throws(() => c.parseYaml('a: 1\njust text\n'), /expected key/);
  assert.throws(() => c.parseYaml('l:\n  - a\n      - b\n'), /indent error/);
});

test('parseYaml: block-style endpoint list keeps "node:iface" strings (no space after the colon)', () => {
  const y = [
    'name: lab',
    'topology:',
    '  nodes:',
    '    r1:',
    '      kind: linux',
    '    r2:',
    '      kind: linux',
    '  links:',
    '    - endpoints:',
    '        - r1:eth1',
    '        - "r2:eth1"',
  ].join('\n');
  const doc = c.parseYaml(y);
  assert.deepStrictEqual(doc.topology.links, [{ endpoints: ['r1:eth1', 'r2:eth1'] }]);
  const r = c.convert(y);
  assert.strictEqual(r.ok, true);
  assert.strictEqual(r.config.topology_type, 'linear_2node');
  assert.deepStrictEqual(r.config.networks[0].members.map((m) => m.node), ['r1', 'r2']);
});

test('extractGraph: newer {node, interface} endpoints, missing endpoints, one-sided links', () => {
  const g = c.extractGraph({
    topology: {
      nodes: { r1: {}, r2: null },
      links: [
        { endpoints: [{ node: 'r1', interface: 'eth1' }, { node: 'r2', interface: 'eth1' }] },
        { type: 'host' },                       // no endpoints -> skipped
        null,
        { endpoints: ['r1:eth2'] },             // not a pair -> skipped
        { endpoints: [':eth1', 'r2:eth3'] },    // empty node name -> skipped
      ],
    },
  });
  assert.strictEqual(g.name, 'clab');
  assert.deepStrictEqual(g.nodes, [{ name: 'r1', kind: '', image: '' }, { name: 'r2', kind: '', image: '' }]);
  assert.deepStrictEqual(g.edges, [['r1', 'r2']]);
  assert.deepStrictEqual(c.extractGraph({}).nodes, []);
});

test('classify: duplicate (parallel) links are counted once', () => {
  const g = c.extractGraph(c.parseYaml(lab([{ name: 'r1' }, { name: 'r2' }], [['r1', 'r2'], ['r2', 'r1']])));
  const cls = c.classify(g, {});
  assert.strictEqual(cls.shape, 'linear_2node');
  assert.strictEqual(cls.edges.length, 1);
});

test('convert: triangle, linear_3node and inverted_v layout', () => {
  const tri = c.convert(lab([{ name: 'r1' }, { name: 'r2' }, { name: 'r3' }], [['r1', 'r2'], ['r2', 'r3'], ['r1', 'r3']]));
  assert.strictEqual(tri.config.topology_type, 'triangle');
  assert.strictEqual(tri.config.xray.pattern, 'ospf_triangle');

  const path3 = lab([{ name: 'r2' }, { name: 'r1' }, { name: 'r3' }], [['r1', 'r2'], ['r2', 'r3']]);
  const lin = c.convert(path3);
  assert.strictEqual(lin.config.topology_type, 'linear_3node');
  assert.strictEqual(lin.config.layout, '');
  assert.deepStrictEqual(lin.config.nodes.map((n) => n.id), ['r1', 'r2', 'r3']);   // chain order
  assert.strictEqual(lin.config.nodes.find((n) => n.target).id, 'r2');           // highest degree
  assert.strictEqual(c.convert(path3, { invertedV: true }).config.layout, 'inverted_v');
});

test('convert: a server end is placed first and never marked as target', () => {
  const y = lab([{ name: 'r1' }, { name: 'r2' }, { name: 'sv', kind: 'host' }], [['r1', 'r2'], ['r2', 'sv']]);
  const r = c.convert(y, { target: 'sv' });
  assert.deepStrictEqual(r.config.nodes.map((n) => n.id), ['sv', 'r2', 'r1']);
  assert.strictEqual(r.config.nodes[0].type, 'server');
  assert.strictEqual(r.config.nodes.some((n) => n.target), false);
  assert.ok(!r.config._warnings.some((w) => /All nodes classified as router/.test(w)));
});

test('convert: unsupported shapes return ok:false with the nodes and links', () => {
  const r = c.convert(lab([{ name: 'a' }, { name: 'b' }, { name: 'c' }, { name: 'd' }], [['a', 'b'], ['b', 'c'], ['c', 'd']]));
  assert.strictEqual(r.ok, false);
  assert.match(r.reason, /nodes=4, links\(dedup\)=3/);
  assert.deepStrictEqual(r.nodes, ['a', 'b', 'c', 'd']);
  assert.deepStrictEqual(r.links, ['a-b', 'b-c', 'c-d']);
  assert.strictEqual(c.convert('name: x\n').ok, false);   // no topology at all
});

test('convert: JSON input and invalid JSON', () => {
  const j = JSON.stringify({ name: 'j', topology: { nodes: { r1: {}, r2: {} }, links: [{ endpoints: ['r1:e1', 'r2:e1'] }] } });
  const r = c.convert(j, { json: true });
  assert.strictEqual(r.ok, true);
  assert.strictEqual(r.config.id, 'j');
  assert.strictEqual(r.config.positions, undefined);
  assert.throws(() => c.convert('{bad', { json: true }), SyntaxError);
});

test('convert: graph-posX/posY labels and graph-level fallback become positions', () => {
  const y = [
    'name: pos',
    'topology:',
    '  nodes:',
    '    r1: {kind: linux, labels: {graph-posX: "300", graph-posY: "40"}}',
    '    r2:',
    '      kind: linux',
    '      labels:',
    '        graph-level: 2',
    '  links:',
    '    - endpoints: ["r1:eth1", "r2:eth1"]',
  ].join('\n');
  const r = c.convert(y);
  assert.deepStrictEqual(r.config.positions.r1, { x: 300, y: 40 });
  assert.deepStrictEqual(r.config.positions.r2, { x: 200, y: 320 });   // tier 2: X0, Y0 + ROW_H
  // no hints at all -> no positions key
  assert.strictEqual(c.convert(lab([{ name: 'r1' }, { name: 'r2' }], [['r1', 'r2']])).config.positions, undefined);
});

test('CLI: usage, unsupported topology exit code, and JSON output', (t) => {
  const os = require('os');
  const fs = require('fs');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'nx-c2x-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));

  const none = spawnSync(process.execPath, [CLI], { encoding: 'utf8' });
  assert.strictEqual(none.status, 1);
  assert.match(none.stderr, /usage:/);
  assert.strictEqual(spawnSync(process.execPath, [CLI, '--help'], { encoding: 'utf8' }).status, 0);

  const ok = path.join(dir, 'ok.clab.yml');
  fs.writeFileSync(ok, lab([{ name: 'r1' }, { name: 'r2' }, { name: 'r3' }], [['r1', 'r2'], ['r2', 'r3']]));
  const r = spawnSync(process.execPath, [CLI, ok, '--target', 'r1', '--inverted-v'], { encoding: 'utf8' });
  assert.strictEqual(r.status, 0, r.stderr);
  const cfg = JSON.parse(r.stdout);
  assert.strictEqual(cfg.layout, 'inverted_v');
  assert.strictEqual(cfg.nodes.find((n) => n.target).id, 'r1');

  const js = path.join(dir, 'ok.json');
  fs.writeFileSync(js, JSON.stringify({ topology: { nodes: { a: {}, b: {} }, links: [{ endpoints: ['a:e', 'b:e'] }] } }));
  const rj = spawnSync(process.execPath, [CLI, js], { encoding: 'utf8' });
  assert.strictEqual(rj.status, 0, rj.stderr);
  assert.strictEqual(JSON.parse(rj.stdout).topology_type, 'linear_2node');

  const bad = path.join(dir, 'bad.clab.yml');
  fs.writeFileSync(bad, lab([{ name: 'a' }], []));
  const rb = spawnSync(process.execPath, [CLI, bad], { encoding: 'utf8' });
  assert.strictEqual(rb.status, 2);
  assert.match(rb.stderr, /\[UNSUPPORTED\]/);
});

// ---- links and labels that used to give a wrong picture without a word ----
function y3(links, extra) {
  return 'name: t\ntopology:\n' + (extra || '') + '  nodes:\n    r1: {kind: linux}\n    r2: {kind: linux}\n    r3: {kind: linux}\n  links:\n' +
    links.map((l) => '    - endpoints: ' + l + '\n').join('');
}

test('convert: an end on host / mgmt-net / macvlan is left out (with a warning), not counted as a link', () => {
  const r = c.convert(y3(['["r1:eth1", "r2:eth1"]', '["r2:eth2", "r3:eth1"]', '["r3:eth9", "host:r3-eth9"]']));
  assert.strictEqual(r.config.topology_type, 'linear_3node');   // not a triangle
  assert.ok(r.config.networks.every((n) => n.members.every((m) => ['r1', 'r2', 'r3'].includes(m.node))));
  assert.ok(r.config._warnings.some((w) => /left out \(not a link between two nodes\): r3:eth9 - host:r3-eth9/.test(w)));
  // r3 with only a mgmt-net end has no link: not drawn as the end of a chain
  const m = c.convert(y3(['["r1:eth1", "r2:eth1"]', '["r3:eth1", "mgmt-net:r3-eth1"]']));
  assert.strictEqual(m.ok, false);
});

test('convert: a link end that is not a node (a typo) stops with its name; a self link is left out', () => {
  const r = c.convert(y3(['["r1:eth1", "r2:eth1"]', '["r2:eth2", "r3:eth1"]', '["r1:eth2", "rr3:eth2"]']));
  assert.strictEqual(r.ok, false);
  assert.match(r.reason, /not a node of this topology: r1:eth2 - rr3:eth2/);
  const s = c.convert(y3(['["r1:eth1", "r1:eth2"]', '["r1:eth3", "r2:eth1"]', '["r2:eth2", "r3:eth1"]']));
  assert.strictEqual(s.config.topology_type, 'linear_3node');   // not a triangle
  assert.ok(s.config._warnings.some((w) => /a node linked to itself/.test(w)));
});

test('convert: two links between the same nodes = one in the shape, both in config.links, and a warning', () => {
  const r = c.convert(y3(['["r1:eth1", "r2:eth1"]', '["r1:eth2", "r2:eth2"]', '["r2:eth3", "r3:eth1"]']));
  assert.strictEqual(r.config.topology_type, 'linear_3node');
  assert.deepStrictEqual(r.config.links, [
    { a: 'r1', aIf: 'eth1', b: 'r2', bIf: 'eth1' }, { a: 'r1', aIf: 'eth2', b: 'r2', bIf: 'eth2' }, { a: 'r2', aIf: 'eth3', b: 'r3', bIf: 'eth1' }]);
  assert.ok(r.config._warnings.some((w) => /^1 more link\(s\) between the same two nodes/.test(w)));
});

test('convert: inline maps are read (endpoints as {node, interface}, kind / labels inside {..})', () => {
  const r = c.convert(y3(['["r1:eth1", "r2:eth1"]', '["r2:eth2", "r3:eth1"]', '[{node: r1, interface: eth2}, {node: r3, interface: eth2}]']));
  assert.strictEqual(r.config.topology_type, 'triangle');
  assert.deepStrictEqual(r.config.links[2], { a: 'r1', aIf: 'eth2', b: 'r3', bIf: 'eth2' });
  const k = c.convert('name: t\ntopology:\n  nodes:\n    r1: {kind: linux}\n    pc1: {kind: host, image: alpine}\n  links:\n    - endpoints: ["r1:eth1", "pc1:eth1"]\n');
  assert.strictEqual(k.config.nodes.find((n) => n.id === 'pc1').type, 'server');   // from kind, not from the name
  // a node line with escaped quotes inside an exec string still reads (examples/q21 style)
  const q = c.parseYaml('topology:\n  nodes:\n    r1: { kind: linux, exec: ["sh -c \'vtysh -c \\"show ip bgp\\"\'"] }\n');
  assert.strictEqual(q.topology.nodes.r1.kind, 'linux');
});

test('convert: kind from topology defaults / groups; node names stay strings (001 is not 1)', () => {
  const y = 'name: t\ntopology:\n  defaults:\n    kind: linux\n  groups:\n    hosts:\n      kind: host\n  nodes:\n    001: {}\n    r2: {}\n    pc1: {group: hosts}\n' +
    '  links:\n    - endpoints: ["001:eth1", "r2:eth1"]\n    - endpoints: ["pc1:eth1", "r2:eth2"]\n';
  const g = c.extractGraph(c.parseYaml(y));
  assert.deepStrictEqual(g.nodes.map((n) => n.name + '=' + n.kind), ['001=linux', 'r2=linux', 'pc1=host']);
  const r = c.convert(y);
  assert.strictEqual(r.config.topology_type, 'linear_3node');
  assert.deepStrictEqual(r.config.nodes.map((n) => n.id), ['pc1', 'r2', '001']);   // the host end first
});

test('convert: a bridge (kind bridge) is reported as unsupported, not drawn as a router', () => {
  const r = c.convert('name: t\ntopology:\n  nodes:\n    r1: {kind: linux}\n    r2: {kind: linux}\n    br1: {kind: bridge}\n  links:\n' +
    '    - endpoints: ["r1:eth1", "br1:eth1"]\n    - endpoints: ["r2:eth1", "br1:eth2"]\n');
  assert.strictEqual(r.ok, false);
  assert.match(r.reason, /br1 \(kind bridge\)/);
});

test('convert: graph-pos labels of one node do not land on another', () => {
  const block = 'name: t\ntopology:\n  nodes:\n    r1:\n      kind: linux\n    r2:\n      kind: linux\n      labels:\n        graph-posX: "300"\n        graph-posY: "100"\n' +
    '  links:\n    - endpoints: ["r1:eth1", "r2:eth1"]\n';
  const r = c.convert(block);
  assert.deepStrictEqual(r.config.positions.r2, { x: 300, y: 100 });
  assert.notDeepStrictEqual(r.config.positions.r1, { x: 300, y: 100 });
  const flow = 'name: t\ntopology:\n  nodes:\n    r1: {kind: linux}\n    r1.dc2: {kind: linux, labels: {graph-posX: "300", graph-posY: "100"}}\n' +
    '  links:\n    - endpoints: ["r1:eth1", "r1.dc2:eth1"]\n';
  const f = c.convert(flow);
  assert.notDeepStrictEqual(f.config.positions.r1, { x: 300, y: 100 });
});

test('CLI and convert give the same checks (a typo end exits 2 with its name)', (t) => {
  const os = require('os');
  const fs = require('fs');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'nx-c2x-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const f = path.join(dir, 'typo.clab.yml');
  fs.writeFileSync(f, y3(['["r1:eth1", "r2:eth1"]', '["r2:eth2", "rr3:eth1"]']));
  const r = spawnSync(process.execPath, [CLI, f], { encoding: 'utf8' });
  assert.strictEqual(r.status, 2);
  assert.match(r.stderr, /rr3/);
});
