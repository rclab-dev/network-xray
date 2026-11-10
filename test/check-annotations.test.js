// check-annotations.test.js — examples/*/*.clab.yml.annotations.json (node positions read by the containerlab Web app and
// VS Code extension): one per topology, valid JSON, exactly the topology's nodes, finite positions, no two nodes on one spot,
// and <name>-solved laid out like <name>.
// Run: node --test        (from the repo root; Node >= 18, no dependencies)
'use strict';
var test = require('node:test');
var assert = require('node:assert');
var fs = require('fs');
var path = require('path');
var ct = require('../scripts/check-example-topologies.js');

var EXAMPLES = path.join(__dirname, '..', 'examples');

function labs() {
  var out = [];
  fs.readdirSync(EXAMPLES).sort().forEach(function (d) {
    var dir = path.join(EXAMPLES, d);
    if (!fs.statSync(dir).isDirectory()) return;
    fs.readdirSync(dir).filter(function (f) { return /\.clab\.yml$/.test(f); }).forEach(function (f) {
      out.push({ dir: d, file: path.join(dir, f), ann: path.join(dir, f + '.annotations.json') });
    });
  });
  return out;
}

function positions(lab) {
  var doc = JSON.parse(fs.readFileSync(lab.ann, 'utf8'));
  var p = {};
  (doc.nodeAnnotations || []).forEach(function (a) { p[a.id] = a.position; });
  return p;
}

test('every example topology has an annotations file with exactly its nodes', function () {
  var all = labs();
  assert.ok(all.length > 0, 'found lab files');
  all.forEach(function (lab) {
    assert.ok(fs.existsSync(lab.ann), 'missing ' + path.relative(EXAMPLES, lab.ann));
    var nodes = Object.keys(ct.parseYaml(fs.readFileSync(lab.file, 'utf8')).topology.nodes).sort();
    var p = positions(lab);
    assert.deepStrictEqual(Object.keys(p).sort(), nodes, lab.dir + ': annotation ids = topology nodes');
    var seen = {};
    nodes.forEach(function (n) {
      assert.ok(p[n] && isFinite(p[n].x) && isFinite(p[n].y), lab.dir + ': ' + n + ' has a finite position');
      var k = p[n].x + ',' + p[n].y;
      assert.ok(!seen[k], lab.dir + ': ' + n + ' and ' + seen[k] + ' on one spot');
      seen[k] = n;
    });
  });
});

test('<name>-solved is laid out like <name>', function () {
  labs().filter(function (lab) { return /-solved$/.test(lab.dir); }).forEach(function (lab) {
    var base = labs().filter(function (b) { return b.dir === lab.dir.replace(/-solved$/, '') && path.basename(b.file) === path.basename(lab.file); })[0];
    assert.ok(base, 'no base lab for ' + lab.dir);
    assert.deepStrictEqual(positions(lab), positions(base), lab.dir);
  });
});
