#!/usr/bin/env node
/*
 * clab-xray-collect.js — auto-wire REAL per-node X-Ray state into a containerlab graph.
 *
 * Parses a containerlab topology, derives each node's adjacency from the links, runs the right
 * per-node collector (clab-collect.js for FRR / clab-srl-collect.js for nokia_srlinux, by node kind),
 * and writes <out-dir>/xray-states.js = `window.LIVE_STATES = { r1:{...}, r2:{...}, ... }`. FRR and
 * SR Linux emit the same state shape, so a mixed lab renders uniformly in the graph DeepDive.
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

// flags (--watch / --interval N / --exclude-mgmt / --mgmt-subnet <cidr>) may appear in any order
var argv = process.argv.slice(2), watch = false, intervalMs = 3000, mgmtArg = '', pos = [];
for (var ai = 0; ai < argv.length; ai++) {
  if (argv[ai] === '--watch') watch = true;
  else if (argv[ai] === '--interval') intervalMs = Math.max(1, parseInt(argv[++ai], 10) || 3) * 1000;
  else if (argv[ai] === '--exclude-mgmt') mgmtArg = ' --exclude-mgmt';                       // drop clab mgmt IF (172.20.20.0/24)
  else if (argv[ai] === '--mgmt-subnet') mgmtArg = ' --mgmt-subnet ' + JSON.stringify(argv[++ai] || '');
  else pos.push(argv[ai]);
}
var topoPath = pos[0], outDir = pos[1], proto = pos[2] || 'ospf';
if (!topoPath || !outDir) {
  console.error('usage: node clab-xray-collect.js <topo.clab.yml> <out-dir> [proto] [--watch] [--interval secs] [--exclude-mgmt | --mgmt-subnet <cidr>]');
  process.exit(2);
}
var topo = fs.readFileSync(topoPath, 'utf8');
var lab = (topo.match(/^name:\s*"?([^"\s]+)"?/m) || [])[1];
if (!lab) { console.error('!! could not find `name:` in ' + topoPath); process.exit(1); }

// derive per-node adjacency from links: endpoints: ["a:eth1", "b:eth2"]
var adj = {};
var re = /endpoints:\s*\[\s*"([^:"]+):([^"\]]+)"\s*,\s*"([^:"]+):([^"\]]+)"\s*\]/g, m;
while ((m = re.exec(topo))) {
  var a = m[1], ai2 = m[2], b = m[3], bi = m[4];
  (adj[a] = adj[a] || []).push({ iface: ai2, peer: b });
  (adj[b] = adj[b] || []).push({ iface: bi, peer: a });
}
var nodes = Object.keys(adj);
if (!nodes.length) { console.error('!! no links parsed from ' + topoPath); process.exit(1); }

// per-node kind (containerlab): dispatch nokia_srlinux nodes to clab-srl-collect.js (sr_cli), all
// others to clab-collect.js (FRR vtysh). Both speak the same --lab/--node/--adj/--proto/--out CLI and
// emit the same state shape, so a mixed FRR+srl lab produces one uniform window.LIVE_STATES.
var kindOf = {};
nodes.forEach(function (n) {
  var km = topo.match(new RegExp('\\b' + n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + ':\\s*\\{?[\\s\\S]{0,180}?kind:\\s*["\']?([\\w./-]+)'));
  kindOf[n] = km ? km[1] : '';
});
function isSrl(kind) { return /srl|srlinux|nokia/i.test(kind || ''); }
// containerlab short iface (e1-1) -> SR Linux routed subinterface (ethernet-1/1.0)
function srlIface(x) {
  var m = /^e(\d+)-(\d+)$/.exec(x);
  if (m) return 'ethernet-' + m[1] + '/' + m[2] + '.0';
  if (/^ethernet-\d+\/\d+$/.test(x)) return x + '.0';   // add the .0 subif if missing
  return x;
}

var collect = path.join(outDir, 'clab-collect.js');
var srlCollect = path.join(outDir, 'clab-srl-collect.js');
var anySrl = nodes.some(function (n) { return isSrl(kindOf[n]); });
var anyFrr = nodes.some(function (n) { return !isSrl(kindOf[n]); });
if (anyFrr && !fs.existsSync(collect)) { console.error('!! clab-collect.js not found in ' + outDir); process.exit(1); }
if (anySrl && !fs.existsSync(srlCollect)) { console.error('!! clab-srl-collect.js not found in ' + outDir + ' (needed for nokia_srlinux nodes)'); process.exit(1); }
var dest = path.join(outDir, 'xray-states.js');

function collectAll() {
  var states = {}, ok = 0;
  nodes.forEach(function (n) {
    var srl = isSrl(kindOf[n]);
    var script = srl ? srlCollect : collect;
    var adjStr = adj[n].map(function (l) { return (srl ? srlIface(l.iface) : l.iface) + ':' + l.peer; }).join(',');
    var mg = srl ? '' : mgmtArg;   // --exclude-mgmt is an FRR-collector flag; srl ignores it
    var out = path.join(os.tmpdir(), 'xray-state-' + n + '.json');
    try {
      cp.execSync('node ' + JSON.stringify(script) + ' --lab ' + lab + ' --node ' + n +
        ' --proto ' + proto + ' --adj ' + adjStr + mg + ' --out ' + JSON.stringify(out),
        { stdio: ['ignore', 'ignore', 'ignore'] });
      states[n] = JSON.parse(fs.readFileSync(out, 'utf8'));
      ok++;
    } catch (e) { console.error('  ' + n + ' COLLECT FAILED: ' + (e.message || e)); }
  });
  return { states: states, ok: ok };
}
// --watch sets window.LIVE_WATCH so the template opts in to live polling; a one-shot run omits it
// (the snapshot stays static), keeping the drop-in graph unchanged unless you ask for watch mode.
function writeStates(states, live) {
  fs.writeFileSync(dest, 'window.LIVE_STATES = ' + JSON.stringify(states) + ';\n' +
    (live ? 'window.LIVE_WATCH = true;\n' : ''));
}

console.log('lab=' + lab + ' proto=' + proto + ' nodes=' + nodes.join(',') + (watch ? ' (watch ' + (intervalMs / 1000) + 's)' : ''));

if (!watch) {
  var r0 = collectAll();
  writeStates(r0.states, false);
  console.log('wrote ' + dest + '  (' + r0.ok + '/' + nodes.length + ' nodes)');
} else {
  var last = '';
  var tick = function () {
    var r = collectAll();
    var json = JSON.stringify(r.states);
    if (json !== last) {   // only rewrite when something changed (no churn on idle)
      last = json;
      writeStates(r.states, true);
      console.log('[' + new Date().toISOString() + '] updated xray-states.js (' + r.ok + '/' + nodes.length + ')');
    }
    setTimeout(tick, intervalMs);
  };
  tick();
}
