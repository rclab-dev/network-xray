'use strict';
/* clab-graph-data.test.js - the {{ .Data }} that containerlab graph 0.82.0 really passes (test/fixtures/clab-graph-0.82)
 * has every field the two graph pages read. Run: node --test (repo root, Node >= 18, no dependencies). */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const FIX = path.join(__dirname, 'fixtures', 'clab-graph-0.82');
const DATA = JSON.parse(fs.readFileSync(path.join(FIX, 'data.json'), 'utf8'));

test('containerlab 0.82 graph data: nodes and links carry the fields the graph pages read', function () {
  assert.ok(Array.isArray(DATA.nodes) && DATA.nodes.length === 3, 'nodes');
  assert.ok(Array.isArray(DATA.links) && DATA.links.length === 2, 'links');
  DATA.nodes.forEach(function (n) {
    ['name', 'kind', 'image'].forEach(function (k) { assert.strictEqual(typeof n[k], 'string', n.name + '.' + k); });
  });
  DATA.links.forEach(function (l) {
    ['source', 'source_endpoint', 'target', 'target_endpoint'].forEach(function (k) { assert.strictEqual(typeof l[k], 'string', k); });
  });
  assert.deepStrictEqual(DATA.nodes.map(function (n) { return n.kind; }), ['linux', 'nokia_srlinux', 'cisco_iol']);
  assert.deepStrictEqual(DATA.links[0], { source: 'r1', source_endpoint: 'eth1', target: 'r2', target_endpoint: 'e1-1' });
  assert.strictEqual(DATA.nodes[0].group, 'g1', 'group is passed when the topology sets it');
});

test('containerlab 0.82 graph data: Go escapes < > & in the JSON and JSON.parse gives the text back', function () {
  const raw = fs.readFileSync(path.join(FIX, 'data.json'), 'utf8');
  assert.ok(raw.indexOf('\\u003c') >= 0 && raw.indexOf('<') < 0, 'raw JSON has no < (safe inside a script tag)');
  assert.strictEqual(DATA.nodes[0].image, 'frr<b>&x');
});

test('both graph pages read the node and link fields that containerlab passes', function () {
  ['xray-graph.html', 'xray-graph-nextui.html'].forEach(function (f) {
    const src = fs.readFileSync(path.join(ROOT, f), 'utf8');
    assert.ok(src.indexOf('id="clab-data"') >= 0, f + ': clab-data script');
    ['source_endpoint', 'target_endpoint', '.kind', '.name'].forEach(function (k) { assert.ok(src.indexOf(k) >= 0, f + ' reads ' + k); });
  });
});
