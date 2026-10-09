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
 *   node clab-xray-collect.js lab.clab.yml ./network-xray            # writes ./network-xray/xray-states.js
 *   containerlab graph --topo lab.clab.yml --template ./network-xray/xray-graph.html --static-dir ./network-xray
 *
 * If xray-states.js is absent, xray-graph.html falls back to the topology-derived synthetic
 * scaffold (unchanged behaviour) — so this step is purely additive/opt-in.
 *
 *   Usage: node clab-xray-collect.js <topo.clab.yml> <out-dir> [proto]   (proto default: ospf)
 */
'use strict';
var fs = require('fs'), cp = require('child_process'), path = require('path'), os = require('os');

// flags (--watch / --interval N / --exclude-mgmt / --mgmt-subnet <cidr>) may appear in any order
var argv = process.argv.slice(2), watch = false, intervalMs = 1000 /* nx_collect_interval_1s: default 1 s (was 3) */, mgmtArg = '', pos = [], serialCollect = false;
for (var ai = 0; ai < argv.length; ai++) {
  if (argv[ai] === '--watch') watch = true;
  else if (argv[ai] === '--serial') serialCollect = true;   /* nx_collect_parallel: old one-node-at-a-time collect */
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
// Friendly guards: the first arg is a topology FILE (.clab.yml), not a directory. Passing the lab
// directory (a natural mistake) used to crash with a cryptic EISDIR — help instead of failing raw.
if (!fs.existsSync(topoPath)) {
  console.error('!! topology file not found: ' + topoPath);
  console.error('   expected a containerlab topology file, e.g.  node clab-xray-collect.js lab.clab.yml <out-dir>');
  process.exit(2);
}
if (fs.statSync(topoPath).isDirectory()) {
  var _ymls = fs.readdirSync(topoPath).filter(function (f) { return /\.clab\.ya?ml$/.test(f) || /\.ya?ml$/.test(f); });
  if (_ymls.length === 1) {
    var _picked = path.join(topoPath, _ymls[0]);
    console.error("note: '" + topoPath + "' is a directory; auto-using the topology file it contains: " + _picked);
    topoPath = _picked;
  } else {
    console.error("!! '" + topoPath + "' is a directory. Pass a containerlab topology file (.clab.yml), not the lab directory.");
    if (_ymls.length > 1) console.error('   found several — pick one: ' + _ymls.map(function (f) { return path.join(topoPath, f); }).join(', '));
    else console.error('   no *.clab.yml found in that directory.');
    process.exit(2);
  }
}
if (!/\.ya?ml$/.test(topoPath)) console.error('note: ' + topoPath + " doesn't look like a .clab.yml file — continuing anyway.");
var topo;
try { topo = fs.readFileSync(topoPath, 'utf8'); }
catch (e) { console.error('!! could not read topology file ' + topoPath + ': ' + (e && e.message ? e.message : e)); process.exit(2); }
if (!fs.existsSync(outDir)) {
  try { fs.mkdirSync(outDir, { recursive: true }); console.error('note: created output directory ' + outDir); }
  catch (e) { console.error('!! output directory does not exist and could not be created: ' + outDir + ' (' + (e && e.message ? e.message : e) + ')'); process.exit(2); }
} else if (!fs.statSync(outDir).isDirectory()) {
  console.error('!! output path is not a directory: ' + outDir);
  process.exit(2);
}
var lab = (topo.match(/^name:\s*"?([^"\s]+)"?/m) || [])[1];
if (!lab) { console.error('!! could not find `name:` in ' + topoPath); process.exit(1); }
// nx_collect_mgmt_from_topo: --exclude-mgmt uses the lab's own mgmt subnet when the topology sets one
//   (mgmt: / ipv4-subnet: ..., e.g. netlab = 192.168.121.0/24); otherwise containerlab's default 172.20.20.0/24.
if (mgmtArg === ' --exclude-mgmt') {
  var _mg = /^mgmt:[ \t]*\r?\n((?:[ \t]+.*\r?\n?)*)/m.exec(topo);
  var _sub = _mg && /^[ \t]+ipv4-subnet:[ \t]*["']?([0-9.]+\/[0-9]+)/m.exec(_mg[1]);
  if (_sub) mgmtArg = ' --mgmt-subnet ' + JSON.stringify(_sub[1]);
}

// derive per-node adjacency from links: endpoints: ["a:eth1", "b:eth2"]
var adj = {};
var re = /endpoints:\s*\[\s*"([^:"]+):([^"\]]+)"\s*,\s*"([^:"]+):([^"\]]+)"\s*\]/g, m;
// nx_collect_block_endpoints: also the block form that netlab and many hand-written labs use
//   - endpoints:
//     - "a:eth1"
//     - "b:eth2"
var reBlock = /endpoints:[ \t]*\r?\n[ \t]*-[ \t]*["']?([^:"'\s]+):([^"'\s]+)["']?[ \t]*\r?\n[ \t]*-[ \t]*["']?([^:"'\s]+):([^"'\s]+)["']?/g;
var seenLink = {};
[re, reBlock].forEach(function (rx) {
  while ((m = rx.exec(topo))) {
    var a = m[1], ai2 = m[2], b = m[3], bi = m[4];
    var lk = [a + ':' + ai2, b + ':' + bi].sort().join('|');
    if (seenLink[lk]) continue;
    seenLink[lk] = 1;
    (adj[a] = adj[a] || []).push({ iface: ai2, peer: b, peerIface: bi });
    (adj[b] = adj[b] || []).push({ iface: bi, peer: a, peerIface: ai2 });
  }
});
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

// nx_collect_keep_last_good (2026-10-05, Codespaces trial): a node whose collect fails keeps its last good
// state instead of disappearing (a watch that started failing used to overwrite xray-states.js with {} and
// the page fell back to the synthetic demo). The child's stderr is now shown so the cause is visible.
// When every node succeeds the output is exactly as before.
var lastGood = {};
var failSeen = {};   /* nx_quiet_log: node -> {msg, count} of the current run of identical failures */
function collectAll() {
  var states = {}, ok = 0, kept = 0;
  /* nx_collect_parallel (2026-10-09): start every node's collector at once in one sh and wait for all of them
     (about one node's time instead of the sum - 3 nodes ~4 s -> ~1.5 s). Exit code / stderr of each child go to
     small files next to its state file and are read below, so the failure handling is unchanged. --serial = old way. */
  var _par = !serialCollect && nodes.length > 1, _job = {};
  var _cmdOf = function (n) {
    var srl = isSrl(kindOf[n]);
    var script = srl ? srlCollect : collect;
    var adjStr = adj[n].map(function (l) { return (srl ? srlIface(l.iface) : l.iface) + ':' + l.peer; }).join(',');
    var mg = srl ? '' : mgmtArg;
    var out = path.join(os.tmpdir(), 'xray-state-' + lab + '-' + n +
      (typeof process.getuid === 'function' ? '-u' + process.getuid() : '') + '.json');
    return { out: out, cmd: 'node ' + JSON.stringify(script) + ' --lab ' + lab + ' --node ' + n +
      ' --proto ' + proto + ' --adj ' + adjStr + mg + ' --out ' + JSON.stringify(out) };
  };
  if (_par) {
    var _sh = nodes.map(function (n) {
      var c = _cmdOf(n); _job[n] = { code: c.out + '.code', err: c.out + '.err' };
      try { fs.unlinkSync(_job[n].code); } catch (e) {}
      return '( ' + c.cmd + ' 2>' + JSON.stringify(_job[n].err) + ' >/dev/null; echo $? > ' + JSON.stringify(_job[n].code) + ' ) &';
    }).join(' ') + ' wait';
    try { cp.execSync(_sh, { stdio: 'ignore', shell: '/bin/sh' }); } catch (e) {}
  }
  nodes.forEach(function (n) {
    var srl = isSrl(kindOf[n]);
    var script = srl ? srlCollect : collect;
    var adjStr = adj[n].map(function (l) { return (srl ? srlIface(l.iface) : l.iface) + ':' + l.peer; }).join(',');
    var mg = srl ? '' : mgmtArg;   // --exclude-mgmt is an FRR-collector flag; srl ignores it
    var out = path.join(os.tmpdir(), 'xray-state-' + lab + '-' + n +
      (typeof process.getuid === 'function' ? '-u' + process.getuid() : '') + '.json');   /* nx_tmp_per_user (2026-10-05): a collector run with sudo and one without no longer fight over a root-owned tmp file (EACCES forever) */   /* nx_lab_state_file (2026-10-01): lab in the name - two labs with the same node name (r2) must not share one tmp file */
    try {
      if (_par) {   /* nx_collect_parallel: the child already ran - read its exit code (and stderr on failure) */
        var _code = ''; try { _code = fs.readFileSync(_job[n].code, 'utf8').trim(); } catch (e) {}
        if (_code !== '0') { var _pe = new Error('Command failed: node collector exit ' + (_code || '?')); try { _pe.stderr = fs.readFileSync(_job[n].err, 'utf8'); } catch (e) {} throw _pe; }
      } else
      cp.execSync('node ' + JSON.stringify(script) + ' --lab ' + lab + ' --node ' + n +
        ' --proto ' + proto + ' --adj ' + adjStr + mg + ' --out ' + JSON.stringify(out),
        { stdio: ['ignore', 'ignore', 'pipe'] });
      states[n] = JSON.parse(fs.readFileSync(out, 'utf8'));
      lastGood[n] = states[n];
      if (failSeen[n]) { console.error('  ' + n + ' collect OK again (after ' + failSeen[n].count + ' failure(s))'); delete failSeen[n]; }   /* nx_quiet_log */
      ok++;
    } catch (e) {
      var errLines = e && e.stderr ? String(e.stderr).split('\n').map(function (x) { return x.trim(); }).filter(Boolean) : [];
      var errTail = errLines.filter(function (x) { return /Error|EACCES|ENOENT|denied|not found/i.test(x); })[0] || errLines[errLines.length - 1] || '';
      var _fm = '  ' + n + ' COLLECT FAILED: ' + String((e && e.message) || e).split('\n')[0] + (errTail ? ' | ' + errTail : '');   /* nx_quiet_log */
      var _fc = (failSeen[n] && failSeen[n].msg === _fm) ? ++failSeen[n].count : (failSeen[n] = { msg: _fm, count: 1 }).count;
      if (_fc === 1) console.error(_fm); else if (_fc % 12 === 0) console.error('  ' + n + ' still failing (same error x' + _fc + ')');
      if (lastGood[n]) { states[n] = lastGood[n]; kept++; }
    }
  });
  // Cross-node hello-IN (OSPF): a peer is "sending Hello" iff ITS facing iface participates in OSPF
  // (present in that peer's iface_hellos) -- INDEPENDENT of neighbor state. Makes "Hello flowing but
  // the adjacency is stuck below Full" visible: router-id duplicate (neighbor None), hello/dead-timer
  // or MTU mismatch -- both ends run OSPF on the link so Hellos ARE exchanged even though no adjacency
  // forms. The per-node collector can't see the peer, so resolve it from the peer node's iface_hellos.
  // RCL parity. The engine drive() still gates hello-in on the LOCAL iface being up (cut link = dark).
  if (proto !== 'bgp') {
    nodes.forEach(function (cn) {
      var st = states[cn]; if (!st) return;
      var psm = st.peer_sending_hellos || (st.peer_sending_hellos = {});
      (adj[cn] || []).forEach(function (link) {
        var peerSt = states[link.peer];
        psm[link.peer] = !!(peerSt && peerSt.iface_hellos && peerSt.iface_hellos[link.peerIface]);
        /* nx_peer_hello_from_iface (2026-10-06, q6): receive period = the peer's hello on the facing iface */
        var _pvh = peerSt && peerSt.iface_hellos && peerSt.iface_hellos[link.peerIface];
        if (_pvh > 0) (st.peer_hellos || (st.peer_hellos = {}))[link.peer] = _pvh;
      });
      st.peer_sending_hello = Object.keys(psm).some(function (k) { return psm[k]; });
    });
  }
  if (kept) console.error('  kept the last good state for ' + kept + ' node(s)');
  return { states: states, ok: ok, kept: kept };
}
// --watch sets window.LIVE_WATCH so the template opts in to live polling; a one-shot run omits it
// (the snapshot stays static), keeping the drop-in graph unchanged unless you ask for watch mode.
// Optional problem.json next to the topology (example labs): passed through as window.XRAY_PROBLEM so the
// page can open on the route the problem is about ("focus": {"node": "r1", "prefix": "8.8.8.0/24"}).
// No problem.json (your own lab) -> nothing is added and the page behaves as before.
function readProblem() {
  try { return JSON.parse(fs.readFileSync(path.join(path.dirname(topoPath), 'problem.json'), 'utf8')); } catch (e) { return null; }
}
function writeStates(states, live) {
  var prob = readProblem();
  var xp = null;
  if (prob && prob.focus) (xp = xp || {}).focus = prob.focus;
  if (prob && prob.check) { (xp = xp || {}).check = prob.check; if (prob.format) xp.format = prob.format; }   /* format: the evaluator skips an unknown version; check_note_* is README-only: not passed */
  fs.writeFileSync(dest, 'window.LIVE_STATES = ' + JSON.stringify(states) + ';\n' +
    (live ? 'window.LIVE_WATCH = true;\n' : '') +
    (xp ? 'window.XRAY_PROBLEM = ' + JSON.stringify(xp) + ';\n' : ''));   /* nx_problem_check (2026-10-06): focus + check (Solved) */
}

console.log('lab=' + lab + ' proto=' + proto + ' nodes=' + nodes.join(',') + (watch ? ' (watch ' + (intervalMs / 1000) + 's)' : ''));

if (!watch) {
  var r0 = collectAll();
  if (!r0.ok && !Object.keys(r0.states).length && fs.existsSync(dest)) {
    console.error('!! every node failed - kept the existing ' + dest);
    process.exitCode = 1;
  } else {
    writeStates(r0.states, false);
    console.log('wrote ' + dest + '  (' + r0.ok + '/' + nodes.length + ' nodes)');
  }
} else {
  /* nx_quiet_log (2026-10-06): xray-states.js is still rewritten on every change (the page stays exact), but the
     log line appears only when the summary changes. BGP states that are all "not up" (Idle/Connect/Active/OpenSent/
     OpenConfirm) count as one, so a session retrying Connect <-> Active no longer prints a line every few seconds.
     Idle with a reason, e.g. "Idle (PfxCt)", stays distinct. The line says what changed. */
  var _bgpCls = function (st) { st = String(st || ''); return /establ/i.test(st) ? 'Established' : (st.indexOf('(') >= 0 ? st : (st ? 'down' : '')); };
  var _ifUp = function (x) { return x && x.up === false ? 'down' : 'up'; };
  var _summary = function (states) {
    var o = {};
    Object.keys(states).sort().forEach(function (n) {
      var st = states[n] || {}, ifs = st.interfaces || {};
      o[n] = {
        bgp: (st.bgp_neighbors || []).map(function (x) { return x.ip + '=' + _bgpCls(x.state); }).join(','),
        ospf: (st.ospf_neighbors || []).map(function (x) { return (x.router_id || x.address || '?') + '=' + String(x.state || '').split('/')[0]; }).join(','),
        ifs: Object.keys(ifs).sort().map(function (k) { return k + '=' + _ifUp(ifs[k]); }).join(','),
        routes: (st.routing_table || []).length
      };
    });
    return o;
  };
  var lastSum = null;
  var last = '';
  var tick = function () {
    var r = collectAll();
    var json = JSON.stringify(r.states);
    if (!r.ok && !r.kept && last) { setTimeout(tick, intervalMs); return; }   /* nothing collected and nothing kept: keep the page as it is */
    if (json !== last) {   // only rewrite when something changed (no churn on idle)
      last = json;
      writeStates(r.states, true);
      var sum = _summary(r.states), what = [];
      if (lastSum) Object.keys(sum).forEach(function (n) { var a = lastSum[n] || {}, b = sum[n]; ['bgp', 'ospf', 'ifs', 'routes'].forEach(function (k) { if (String(a[k]) !== String(b[k])) what.push(n + ' ' + k + (k === 'routes' ? ' ' + a[k] + '->' + b[k] : '')); }); });
      if (!lastSum || what.length || r.ok < nodes.length) console.log('[' + new Date().toISOString() + '] updated xray-states.js (' + r.ok + '/' + nodes.length + ')' + (what.length ? ' - ' + what.join(', ') : ''));
      lastSum = sum;
    }
    setTimeout(tick, intervalMs);
  };
  tick();
}
