#!/usr/bin/env node
/*
 * clab-xray-collect.js — auto-wire REAL per-node X-Ray state into a containerlab graph.
 *
 * Parses a containerlab topology, derives each node's adjacency from the links, runs
 * clab-collect.js (live docker-exec) for every node, and writes <out-dir>/xray-states.js
 * = `window.LIVE_STATES = { r1:{...}, r2:{...}, ... }`.
 *
 * Then serve the graph as usual — xray-graph.html optionally loads xray-states.js from the
 * same --static-dir and shows the REAL routing state instead of the synthetic scaffold:
 *
 *   node clab-xray-collect.js lab.clab.yml ./xray-core            # writes ./xray-core/xray-states.js
 *   containerlab graph --topo lab.clab.yml --template ./xray-core/xray-graph.html --static-dir ./xray-core
 *
 * If xray-states.js is absent, xray-graph.html falls back to the topology-derived synthetic
 * scaffold (unchanged behaviour) — so this step is purely additive/opt-in.
 *
 *   Usage: node clab-xray-collect.js <topo.clab.yml> <out-dir> [proto]   (proto default: ospf)
 */
'use strict';
var fs = require('fs'), cp = require('child_process'), path = require('path'), os = require('os');

var topoPath = process.argv[2], outDir = process.argv[3], proto = process.argv[4] || 'ospf';
if (!topoPath || !outDir) {
  console.error('usage: node clab-xray-collect.js <topo.clab.yml> <out-dir> [proto]');
  process.exit(2);
}
var topo = fs.readFileSync(topoPath, 'utf8');
var lab = (topo.match(/^name:\s*"?([^"\s]+)"?/m) || [])[1];
if (!lab) { console.error('!! could not find `name:` in ' + topoPath); process.exit(1); }

// derive per-node adjacency from links: endpoints: ["a:eth1", "b:eth2"]
var adj = {};
var re = /endpoints:\s*\[\s*"([^:"]+):([^"\]]+)"\s*,\s*"([^:"]+):([^"\]]+)"\s*\]/g, m;
while ((m = re.exec(topo))) {
  var a = m[1], ai = m[2], b = m[3], bi = m[4];
  (adj[a] = adj[a] || []).push({ iface: ai, peer: b });
  (adj[b] = adj[b] || []).push({ iface: bi, peer: a });
}
var nodes = Object.keys(adj);
if (!nodes.length) { console.error('!! no links parsed from ' + topoPath); process.exit(1); }

var collect = path.join(outDir, 'clab-collect.js');
if (!fs.existsSync(collect)) { console.error('!! clab-collect.js not found in ' + outDir); process.exit(1); }

console.log('lab=' + lab + ' proto=' + proto + ' nodes=' + nodes.join(','));
var states = {}, ok = 0;
nodes.forEach(function (n) {
  var adjStr = adj[n].map(function (l) { return l.iface + ':' + l.peer; }).join(',');
  var out = path.join(os.tmpdir(), 'xray-state-' + n + '.json');
  try {
    cp.execSync('node ' + JSON.stringify(collect) + ' --lab ' + lab + ' --node ' + n +
      ' --proto ' + proto + ' --adj ' + adjStr + ' --out ' + JSON.stringify(out),
      { stdio: ['ignore', 'ignore', 'ignore'] });
    states[n] = JSON.parse(fs.readFileSync(out, 'utf8'));
    console.log('  ' + n + ' (adj ' + adjStr + ') -> ' + (states[n].neighbor_state || '?') +
      ' full_count=' + states[n].full_count);
    ok++;
  } catch (e) { console.error('  ' + n + ' COLLECT FAILED: ' + (e.message || e)); }
});

var dest = path.join(outDir, 'xray-states.js');
fs.writeFileSync(dest, 'window.LIVE_STATES = ' + JSON.stringify(states) + ';\n');
console.log('wrote ' + dest + '  (' + ok + '/' + nodes.length + ' nodes)');
