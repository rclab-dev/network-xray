#!/usr/bin/env node
/* graph-bench.js — time and memory of the graph page steps that can run in Node, for large synthetic labs.
 *
 * Reuses the synthetic FRR labs of scripts/scale-bench.js (ring + chords, OSPF or eBGP) and measures:
 *   collect   per-router collectors + merge into xray-states.js text (scale-bench.js runBench)
 *   load      what each poll does when xray-states.js arrives: evaluate the script text (vm) -> window.LIVE_STATES
 *   topo      xray-graph.html boot: parse the containerlab graph JSON, build ADJ / EDGES / fullCfg, auto-layout.
 *             The code is sliced out of xray-graph.html itself (between `var rawNodes` and the renderView marker).
 *   views     clabXray.deepViews(fullCfg, node, {state}) for every node (the view model built on a node click)
 *   diff      the live poll's change detection: JSON.stringify(window.LIVE_STATES) compared with the last string,
 *             for an unchanged poll and for a poll where one router changed
 * Times are medians of --iterations runs (after one warm-up). Memory is the retained heap / string size.
 *
 *   usage: node scripts/dev/graph-bench.js [--routers 10,50,100,200] [--proto ospf|bgp] [--iterations 5] [--json]
 */
'use strict';
var fs = require('fs'), path = require('path'), vm = require('vm'), v8 = require('v8');
var ROOT = path.join(__dirname, '..', '..');
var SCALE = require(path.join(ROOT, 'scripts', 'scale-bench.js'));
var BRIDGE = require(path.join(ROOT, 'clab-xray-bridge.js'));

v8.setFlagsFromString('--expose_gc');
var gc = vm.runInNewContext('gc');

function now() { return Number(process.hrtime.bigint()) / 1e6; }
function median(a) { var s = a.slice().sort(function (x, y) { return x - y; }); return s[Math.floor(s.length / 2)]; }
function round(x) { return Math.round(x * 10) / 10; }
function mb(b) { return Math.round(b / 1048576 * 10) / 10; }
function heap() { gc(); gc(); return process.memoryUsage().heapUsed; }
function time(iters, fn) {
  var t = [];
  for (var i = 0; i <= iters; i++) { var t0 = now(); fn(); if (i > 0) t.push(now() - t0); }
  return median(t);
}

// the topology part of xray-graph.html's __xrayGraphBoot, as a function (DATA, LIVE_POS) -> { NAMES, ADJ, EDGES, POS, fullCfg }
function loadTopoCode() {
  var html = fs.readFileSync(path.join(ROOT, 'xray-graph.html'), 'utf8');
  var a = html.indexOf('var rawNodes'), b = html.indexOf('// ================= render one deepView');
  if (a < 0 || b < 0 || b < a) throw new Error('xray-graph.html: topology section markers not found');
  /* eslint-disable no-new-func */
  return new Function('DATA', 'document', 'window',
    html.slice(a, b) + '\nreturn { NAMES: NAMES, ADJ: ADJ, EDGES: EDGES, POS: POS, fullCfg: fullCfg };');
}

// the containerlab `graph` JSON the page gets for a synthetic lab
function graphData(lab) {
  var nodes = [], links = [];
  for (var i = 0; i < lab.topo.n; i++) nodes.push({ name: 'r' + (i + 1), kind: 'linux' });
  lab.topo.links.forEach(function (l) {
    var ea = lab.topo.ifs[l[0]].filter(function (e) { return e.peer === l[1]; })[0];
    links.push({ source: 'r' + (l[0] + 1), target: 'r' + (l[1] + 1),
      source_endpoint: ea.iface, target_endpoint: ea.peerIface });
  });
  return { nodes: nodes, links: links };
}

function evalStates(text) {   // what a <script src=xray-states.js> does
  var ctx = { window: {} };
  vm.runInNewContext(text, ctx);
  return ctx.window.LIVE_STATES;
}

function runGraphBench(n, opts) {
  opts = opts || {};
  var proto = opts.proto || 'ospf', iters = Math.max(1, opts.iterations || 5);
  var r = SCALE.runBench(n, { proto: proto, iterations: iters });
  var text = r.text, lab = SCALE.makeLab(n);
  var doc = { getElementById: function () { return { textContent: 'bench' }; } };
  var topoFn = loadTopoCode(), DATA = graphData(lab);
  var row = { routers: n, links: lab.topo.links.length, proto: proto, collect_ms: r.row.collect_ms, merge_ms: r.row.merge_ms,
    state_mb: mb(Buffer.byteLength(text)) };

  // load: evaluate xray-states.js
  var h0 = heap(), states = evalStates(text), h1 = heap();
  row.load_ms = round(time(iters, function () { evalStates(text); }));
  row.states_heap_mb = mb(h1 - h0);

  // topo: parse + adjacency + layout
  var g = topoFn(DATA, doc, {});
  row.topo_ms = round(time(iters, function () { topoFn(DATA, doc, {}); }));

  // views: deepViews for every node
  var names = g.NAMES;
  row.views_all_ms = round(time(iters, function () {
    names.forEach(function (id) { BRIDGE.deepViews(g.fullCfg, id, { state: states[id] }); });
  }));
  row.views_per_node_ms = round(row.views_all_ms / names.length * 1000) / 1000;

  // diff: the poll's change detection (JSON.stringify of all states + string compare)
  var last = JSON.stringify(states), h2 = heap();
  var keep = JSON.stringify(states); h2 = heap() - h2;
  row.last_string_mb = mb(Buffer.byteLength(keep));
  row.diff_same_ms = round(time(iters, function () { var cur = JSON.stringify(states); return cur !== last; }));
  var changed = evalStates(text), first = Object.keys(changed)[0];
  changed[first] = Object.assign({}, changed[first], { full_count: -1 });
  row.diff_changed_ms = round(time(iters, function () { var cur = JSON.stringify(changed); return cur !== last; }));
  row.poll_total_ms = round(row.load_ms + row.diff_same_ms);
  keep = null;
  return row;
}

function table(rows) {
  var cols = [['routers', 'routers'], ['state MB', 'state_mb'], ['collect', 'collect_ms'], ['merge', 'merge_ms'],
    ['load', 'load_ms'], ['heap MB', 'states_heap_mb'], ['topo', 'topo_ms'], ['views all', 'views_all_ms'],
    ['view/node', 'views_per_node_ms'], ['diff same', 'diff_same_ms'], ['diff chg', 'diff_changed_ms'], ['poll', 'poll_total_ms']];
  var body = rows.map(function (r) { return cols.map(function (c) { return String(r[c[1]]); }); });
  var w = cols.map(function (c, k) { return Math.max(c[0].length, Math.max.apply(null, body.map(function (b) { return b[k].length; }))); });
  var line = function (cells) { return cells.map(function (x, k) { return String(x).padStart(w[k]); }).join('  '); };
  return [line(cols.map(function (c) { return c[0]; }))].concat(body.map(line)).join('\n');
}

if (require.main === module) {
  var argv = process.argv.slice(2), sizes = [10, 50, 100, 200], proto = 'ospf', iterations = 5, json = false;
  for (var ai = 0; ai < argv.length; ai++) {
    if (argv[ai] === '--json') json = true;
    else if (argv[ai] === '--routers') sizes = String(argv[++ai] || '').split(',').map(function (x) { return parseInt(x, 10); });
    else if (argv[ai] === '--proto') proto = argv[++ai];
    else if (argv[ai] === '--iterations') iterations = parseInt(argv[++ai], 10);
    else { console.error('unknown argument ' + JSON.stringify(argv[ai])); process.exit(2); }
  }
  if (!sizes.length || sizes.some(function (n) { return !(n >= 3 && n <= 1000); })) { console.error('--routers: a list of numbers 3..1000'); process.exit(2); }
  if (proto !== 'ospf' && proto !== 'bgp') { console.error('--proto: ospf or bgp'); process.exit(2); }
  if (!(iterations >= 1)) { console.error('--iterations: a number >= 1'); process.exit(2); }
  var rows = sizes.map(function (n) { return runGraphBench(n, { proto: proto, iterations: iterations }); });
  if (json) console.log(JSON.stringify({ node: process.version, proto: proto, rows: rows }, null, 2));
  else console.log('proto=' + proto + ' node ' + process.version + ' (ms, median of ' + iterations + ')\n' + table(rows));
}

module.exports = { runGraphBench: runGraphBench, loadTopoCode: loadTopoCode, graphData: graphData };
