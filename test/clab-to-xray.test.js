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
