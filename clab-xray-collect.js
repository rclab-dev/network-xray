#!/usr/bin/env node
/*
 * clab-xray-collect.js — auto-wire REAL per-node X-Ray state into a containerlab graph.
 *
 * Parses a containerlab topology, derives each node's adjacency from the links, runs the right
 * per-node collector (clab-collect.js for FRR / clab-srl-collect.js for nokia_srlinux / clab-iosxe-collect.js for cisco_iol etc, by node kind),
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
var argv = process.argv.slice(2), validateFile = '', watch = false, intervalMs = 1000 /* nx_collect_interval_1s: default 1 s (was 3) */, mgmtArg = [], pos = [], serialCollect = false;
for (var ai = 0; ai < argv.length; ai++) {
  if (argv[ai] === '--watch') watch = true;
  else if (argv[ai] === '--validate') validateFile = argv[++ai] || '';   /* nx_netlab_validate: netlab topology JSON with validate: tests */
  else if (argv[ai] === '--serial') serialCollect = true;   /* nx_collect_parallel: old one-node-at-a-time collect */
  else if (argv[ai] === '--interval') intervalMs = Math.max(1, parseInt(argv[++ai], 10) || 3) * 1000;
  else if (argv[ai] === '--exclude-mgmt') mgmtArg = ['--exclude-mgmt'];                       // drop clab mgmt IF (172.20.20.0/24)
  else if (argv[ai] === '--mgmt-subnet') mgmtArg = ['--mgmt-subnet', argv[++ai] || ''];
  else pos.push(argv[ai]);
}
/* nx_no_shell (2026-10-17): names from the topology file never reach a shell. The per-node collectors are started with
   an argument array (no /bin/sh), and lab / node / interface names must look like names (letters, digits, _ . - and, for
   interfaces, /): anything else is left out of the view with one log line. A topology from someone else is only data. */
var SAFE_NAME = /^[A-Za-z0-9][A-Za-z0-9_.-]{0,62}$/, SAFE_IF = /^[A-Za-z0-9][A-Za-z0-9_.\/-]{0,62}$/;
function shown(s) { return JSON.stringify(String(s).slice(0, 80)); }   // log the name as data (quoted, no control characters)
// the parallel collect: `node -e PAR_RUNNER <jobs as JSON>` spawns every per-node collector at once (argument arrays) and
// writes each one's exit code next to its state file, as the old `( ... ) & wait` sh line did
/* nx_unread (2026-10-17): a router that cannot be read is shown as such, never as an empty router and never by freezing
   the whole picture. The per-node collectors exit 3 with "NX_UNREAD <why>" (stopped | device | timeout); a child that
   runs longer than CHILD_MS is killed (timeout). A router that timed out keeps its last good state marked stale
   (nx_unread: 'timeout', nx_stale_since) and is asked again only after RETRY_MS, so the other routers keep updating. */
var CHILD_MS = 25000, RETRY_MS = 10000;
/* nx_ios_interval (2026-10-27): an IOS node is read over SSH (a login + 7 shows each time) - not every second like FRR's docker exec.
   Between reads it keeps its last good state; FRR / SR Linux nodes are not affected. NX_IOS_INTERVAL=<seconds> to change. */
var IOS_MS = Math.max(2, parseInt(process.env.NX_IOS_INTERVAL || '10', 10) || 10) * 1000, iosNextAt = {};
var PAR_RUNNER = "var cp=require('child_process'),fs=require('fs');var jobs=JSON.parse(process.argv[1]);var left=jobs.length;" +
  "jobs.forEach(function(j){var done=false;var fin=function(c){if(done)return;done=true;try{fs.writeFileSync(j.code,String(c)+'\\n');}catch(e){}if(--left===0)process.exit(0);};" +
  "var fd='ignore';try{fd=fs.openSync(j.err,'w');}catch(e){}" +
  "var ch=cp.spawn(process.execPath,j.args,{stdio:['ignore','ignore',fd]});var to=setTimeout(function(){try{ch.kill('SIGKILL');}catch(e){}fin(124);}," + CHILD_MS + ");ch.on('error',function(){clearTimeout(to);fin(127);});ch.on('close',function(c){clearTimeout(to);fin(c==null?1:c);});});" +
  "if(!left)process.exit(0);";
if (mgmtArg[0] === '--mgmt-subnet' && !/^[0-9.]+\/[0-9]+$/.test(mgmtArg[1])) { console.error('!! --mgmt-subnet ' + shown(mgmtArg[1]) + ' is not an IPv4 subnet: ignored'); mgmtArg = []; }
var topoPath = pos[0], outDir = pos[1], proto = pos[2] || 'ospf';
if (!/^[a-z]{1,16}$/.test(proto)) { console.error('!! unknown proto ' + shown(proto)); process.exit(2); }
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
if (!SAFE_NAME.test(lab)) { console.error('!! the lab name ' + shown(lab) + ' is not a plain name (letters, digits, _ . -): not collecting'); process.exit(1); }   /* nx_no_shell */
// nx_collect_mgmt_from_topo: --exclude-mgmt uses the lab's own mgmt subnet when the topology sets one
//   (mgmt: / ipv4-subnet: ..., e.g. netlab = 192.168.121.0/24); otherwise containerlab's default 172.20.20.0/24.
if (mgmtArg.length === 1 && mgmtArg[0] === '--exclude-mgmt') {
  var _mg = /^mgmt:[ \t]*\r?\n((?:[ \t]+.*\r?\n?)*)/m.exec(topo);
  var _sub = _mg && /^[ \t]+ipv4-subnet:[ \t]*["']?([0-9.]+\/[0-9]+)/m.exec(_mg[1]);
  if (_sub) mgmtArg = ['--mgmt-subnet', _sub[1]];
}

// derive per-node adjacency from links: endpoints: ["a:eth1", "b:eth2"]
var adj = {};
var re = /endpoints:\s*\[\s*"([^:"]+):([^"\]]+)"\s*,\s*"([^:"]+):([^"\]]+)"\s*\]/g, m;
// nx_collect_block_endpoints: also the block form that netlab and many hand-written labs use
//   - endpoints:
//     - "a:eth1"
//     - "b:eth2"
var reBlock = /endpoints:[ \t]*\r?\n[ \t]*-[ \t]*["']?([^:"'\s]+):([^"'\s]+)["']?[ \t]*\r?\n[ \t]*-[ \t]*["']?([^:"'\s]+):([^"'\s]+)["']?/g;
/* nx_collect_dict_endpoints (2026-10-26): containerlab's extended link form - endpoints as node/interface maps:
     - type: veth
       endpoints:
         - node: r1
           interface: eth1
         - { node: r2, interface: eth1 }
   Only links with exactly two endpoints are links between nodes (host / mgmt-net / macvlan have one) - others are left out. */
function dictLinks(text) {
  var out = [], L = text.split(/\r?\n/);
  var ind = function (s) { return s.match(/^[ \t]*/)[0].length; };
  var val = function (s, k) { var x = new RegExp('(?:^|[{,\\s])' + k + ':[ \\t]*["\']?([^"\',}\\s]+)').exec(s); return x ? x[1] : ''; };
  for (var i = 0; i < L.length; i++) {
    if (!/^[ \t]*(?:-[ \t]*)?endpoints:[ \t]*$/.test(L[i])) continue;
    var base = ind(L[i]), items = [], cur = null;
    for (var j = i + 1; j < L.length && (!L[j].trim() || ind(L[j]) > base); j++) {
      var s = L[j]; if (!s.trim()) continue;
      if (/^[ \t]*-/.test(s)) { cur = { node: '', iface: '' }; items.push(cur); }
      if (!cur) continue;
      cur.node = cur.node || val(s, 'node'); cur.iface = cur.iface || val(s, 'interface');
    }
    if (items.length === 2 && items[0].node && items[0].iface && items[1].node && items[1].iface)
      out.push([items[0].node, items[0].iface, items[1].node, items[1].iface]);
  }
  return out;
}
var seenLink = {};
var dictRx = { exec: (function () { var all = dictLinks(topo), k = 0; return function () { return k < all.length ? [null].concat(all[k++]) : null; }; })() };
[re, reBlock, dictRx].forEach(function (rx) {
  while ((m = rx.exec(topo))) {
    var a = m[1], ai2 = m[2], b = m[3], bi = m[4];
    var lk = [a + ':' + ai2, b + ':' + bi].sort().join('|');
    if (seenLink[lk]) continue;
    seenLink[lk] = 1;
    if (!SAFE_NAME.test(a) || !SAFE_NAME.test(b) || !SAFE_IF.test(ai2) || !SAFE_IF.test(bi)) {   /* nx_no_shell */
      console.error('!! left out a link with a name that is not a plain name: ' + shown(a + ':' + ai2) + ' - ' + shown(b + ':' + bi));
      continue;
    }
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

/* nx_ios_collect (2026-10-27): Cisco IOS / IOS-XE kinds go to clab-iosxe-collect.js (SSH + plain-text show).
   It needs clab-collect.js next to it (it builds the state with the same buildState). */
function isIos(kind) { return /^cisco_iol/i.test(kind || ''); }   /* nx_ios_interval: only the kind checked on a real lab (IOL). c8000v / csr1000v (eth1 = GigabitEthernet2) / cat9kv come when checked */
// containerlab's Linux-side name (eth1) -> the IOS name every `show` prints. IOL: 4 ports per slot, Ethernet0/0 = mgmt.
function iosIface(x, kind) {
  var m = /^eth(\d+)$/.exec(x);
  if (m && /cisco_iol/i.test(kind || '')) { var k = +m[1]; return 'Ethernet' + Math.floor(k / 4) + '/' + (k % 4); }
  return x;
}

/* nx_vendors (2026-10-28): which collector reads a node, by its containerlab kind - one row per vendor.
   Every collector speaks the same --lab/--node/--adj/--proto/--out CLI and emits the same state shape, so a mixed
   lab gives one uniform window.LIVE_STATES. To add a vendor: add a row above 'frr' (the first row that matches
   wins, 'frr' matches everything) and put its collector next to this file.
     match(kind)    - this row reads the node
     script         - the collector next to this file
     iface(x, kind) - containerlab's link-side name (e1-1 / eth1) -> the name the router's own show prints
     frrArgs        - takes the FRR-collector-only flags (--exclude-mgmt)
     needsFrr       - its collector requires clab-collect.js (it builds the state with the same buildState)
     slow           - read again only every NX_IOS_INTERVAL s (SSH + plain-text show: console and CPU cost) */
var VENDORS = [
  { name: 'srlinux', match: isSrl, script: 'clab-srl-collect.js', what: 'nokia_srlinux nodes',
    iface: srlIface, frrArgs: false, needsFrr: false, slow: false },
  { name: 'iosxe', match: isIos, script: 'clab-iosxe-collect.js', what: 'Cisco IOS / IOS-XE nodes',
    iface: iosIface, frrArgs: false, needsFrr: true, slow: true },
  { name: 'frr', match: function () { return true; }, script: 'clab-collect.js', what: 'FRR nodes',
    iface: null, frrArgs: true, needsFrr: true, slow: false }
];
function vendorOf(n) {
  for (var i = 0; i < VENDORS.length; i++) if (VENDORS[i].match(kindOf[n] || '')) return VENDORS[i];
}
var collect = path.join(outDir, 'clab-collect.js');
var _used = {};
nodes.forEach(function (n) { var v = vendorOf(n); _used[v.name] = v; });
var _usedRows = Object.keys(_used).map(function (k) { return _used[k]; });
if (_usedRows.some(function (v) { return v.needsFrr; }) && !fs.existsSync(collect)) { console.error('!! clab-collect.js not found in ' + outDir); process.exit(1); }
_usedRows.forEach(function (v) {
  if (v.script !== 'clab-collect.js' && !fs.existsSync(path.join(outDir, v.script))) { console.error('!! ' + v.script + ' not found in ' + outDir + ' (needed for ' + v.what + ')'); process.exit(1); }
});
// which collector, adjacency string and extra args for one node
function nodeJob(n) {
  var v = vendorOf(n), k = kindOf[n];
  return {
    script: path.join(outDir, v.script),
    adjStr: adj[n].map(function (l) { return (v.iface ? v.iface(l.iface, k) : l.iface) + ':' + l.peer; }).join(','),
    mg: v.frrArgs ? mgmtArg : [],   // --exclude-mgmt is an FRR-collector flag (IOS drops its own mgmt port)
    slow: v.slow
  };
}
var dest = path.join(outDir, 'xray-states.js');

// nx_collect_keep_last_good (2026-10-05, Codespaces trial): a node whose collect fails keeps its last good
// state instead of disappearing (a watch that started failing used to overwrite xray-states.js with {} and
// the page fell back to the synthetic demo). The child's stderr is now shown so the cause is visible.
// When every node succeeds the output is exactly as before.
var lastGood = {};
var failSeen = {};
var lastGoodAt = {}, retryAt = {}, lastOut = {};   /* nx_unread */   /* nx_quiet_log: node -> {msg, count} of the current run of identical failures */
function collectAll() {
  var states = {}, ok = 0, kept = 0, unread = 0;
  /* nx_collect_parallel (2026-10-09): start every node's collector at once in one sh and wait for all of them
     (about one node's time instead of the sum - 3 nodes ~4 s -> ~1.5 s). Exit code / stderr of each child go to
     small files next to its state file and are read below, so the failure handling is unchanged. --serial = old way. */
  var _par = !serialCollect && nodes.length > 1, _job = {};
  var _cmdOf = function (n) {
    var _nj = nodeJob(n), script = _nj.script, adjStr = _nj.adjStr, mg = _nj.mg;   /* nx_ios_collect */
    var out = path.join(os.tmpdir(), 'xray-state-' + lab + '-' + n +
      (typeof process.getuid === 'function' ? '-u' + process.getuid() : '') + '.json');
    return { out: out, args: [script, '--lab', lab, '--node', n, '--proto', proto, '--adj', adjStr].concat(mg, ['--out', out]) };   /* nx_no_shell: an argument array */
  };
  if (_par) {
    /* nx_no_shell: one small node process starts every child with an argument array (no sh) and waits for all of them */
    var _jobs = nodes.filter(function (n) { return !(retryAt[n] > Date.now()) && !(iosNextAt[n] > Date.now() && lastGood[n]); }).map(function (n) {   /* nx_unread: back-off */   /* nx_ios_interval */
      var c = _cmdOf(n); _job[n] = { code: c.out + '.code', err: c.out + '.err' };
      try { fs.unlinkSync(_job[n].code); } catch (e) {}
      return { args: c.args, code: _job[n].code, err: _job[n].err };
    });
    try { cp.execFileSync(process.execPath, ['-e', PAR_RUNNER, JSON.stringify(_jobs)], { stdio: 'ignore' }); } catch (e) {}
  }
  nodes.forEach(function (n) {
    var _nj = nodeJob(n), script = _nj.script, adjStr = _nj.adjStr, mg = _nj.mg;   /* nx_ios_collect: FRR / SR Linux / IOS (--exclude-mgmt is FRR-only) */
    var out = path.join(os.tmpdir(), 'xray-state-' + lab + '-' + n +
      (typeof process.getuid === 'function' ? '-u' + process.getuid() : '') + '.json');   /* nx_tmp_per_user (2026-10-05): a collector run with sudo and one without no longer fight over a root-owned tmp file (EACCES forever) */   /* nx_lab_state_file (2026-10-01): lab in the name - two labs with the same node name (r2) must not share one tmp file */
    if (retryAt[n] > Date.now()) { if (lastOut[n]) states[n] = lastOut[n]; return; }   /* nx_unread: asked again after RETRY_MS */
    if (iosNextAt[n] > Date.now() && lastGood[n]) { states[n] = lastGood[n]; ok++; return; }   /* nx_ios_interval: not yet time to read this IOS node again */
    try {
      if (_par) {   /* nx_collect_parallel: the child already ran - read its exit code (and stderr on failure) */
        var _code = ''; try { _code = fs.readFileSync(_job[n].code, 'utf8').trim(); } catch (e) {}
        if (_code !== '0') { var _pe = new Error('Command failed: node collector exit ' + (_code || '?')); try { _pe.stderr = fs.readFileSync(_job[n].err, 'utf8'); } catch (e) {} throw _pe; }
      } else
      cp.execFileSync(process.execPath, [script, '--lab', lab, '--node', n, '--proto', proto, '--adj', adjStr].concat(mg, ['--out', out]),
        { stdio: ['ignore', 'ignore', 'pipe'], timeout: CHILD_MS });   /* nx_no_shell / nx_unread */
      states[n] = JSON.parse(fs.readFileSync(out, 'utf8'));
      lastGood[n] = states[n]; lastGoodAt[n] = new Date().toISOString(); delete retryAt[n];   /* nx_unread */
      if (_nj.slow) iosNextAt[n] = Date.now() + IOS_MS;   /* nx_ios_interval */
      if (failSeen[n]) { console.error('  ' + n + ' collect OK again (after ' + failSeen[n].count + ' failure(s))'); delete failSeen[n]; }   /* nx_quiet_log */
      ok++;
    } catch (e) {
      /* nx_unread: why the router could not be read */
      var _why = (/NX_UNREAD (stopped|device|timeout)/.exec(String((e && e.stderr) || '')) || [])[1]
        || ((e && e.code === 'ETIMEDOUT') || /exit 124$/.test(String((e && e.message) || '')) ? 'timeout' : '');
      if (_why) {
        if (_why === 'timeout') retryAt[n] = Date.now() + RETRY_MS;
        var _um = '  ' + n + ' cannot be read: ' + ({ stopped: 'the container is not running', device: 'not a router network-xray reads (no vtysh / sr_cli) - drawn only', timeout: 'no answer - showing its last good state as stale' })[_why];
        if (!(failSeen[n] && failSeen[n].msg === _um)) { console.error(_um); failSeen[n] = { msg: _um, count: 1 }; } else failSeen[n].count++;
        states[n] = (_why === 'timeout' && lastGood[n]) ? Object.assign({}, lastGood[n], { nx_unread: 'timeout', nx_stale_since: lastGoodAt[n] })
          : { success: false, target_node: n, nx_unread: _why, interfaces: {} };
        lastOut[n] = states[n]; unread++;
        return;
      }
      var errLines = e && e.stderr ? String(e.stderr).split('\n').map(function (x) { return x.trim(); }).filter(Boolean) : [];
      var errTail = errLines.filter(function (x) { return /Error|EACCES|ENOENT|denied|not found/i.test(x); })[0] || errLines[errLines.length - 1] || '';
      var _fm = '  ' + n + ' COLLECT FAILED: ' + String((e && e.message) || e).split('\n')[0] + (errTail ? ' | ' + errTail : '');   /* nx_quiet_log */
      var _fc = (failSeen[n] && failSeen[n].msg === _fm) ? ++failSeen[n].count : (failSeen[n] = { msg: _fm, count: 1 }).count;
      if (_fc === 1) console.error(_fm); else if (_fc % 12 === 0) console.error('  ' + n + ' still failing (same error x' + _fc + ')');
      if (lastGood[n]) { states[n] = lastGood[n]; kept++; }
      else { states[n] = { success: false, target_node: n, nx_unread: 'error', interfaces: {} }; unread++; }   /* nx_unread: never fall back to the demo state */
    }
    if (states[n]) lastOut[n] = states[n];
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
        psm[link.peer] = !!(peerSt && !peerSt.nx_unread && peerSt.iface_hellos && peerSt.iface_hellos[link.peerIface]);   /* nx_unread */
        /* nx_peer_hello_from_iface (2026-10-06, q6): receive period = the peer's hello on the facing iface */
        var _pvh = peerSt && peerSt.iface_hellos && peerSt.iface_hellos[link.peerIface];
        if (_pvh > 0) (st.peer_hellos || (st.peer_hellos = {}))[link.peer] = _pvh;
      });
      st.peer_sending_hello = Object.keys(psm).some(function (k) { return psm[k]; });
    });
  }
  if (kept) console.error('  kept the last good state for ' + kept + ' node(s)');
  return { states: states, ok: ok, kept: kept, unread: unread };
}
// --watch sets window.LIVE_WATCH so the template opts in to live polling; a one-shot run omits it
// (the snapshot stays static), keeping the drop-in graph unchanged unless you ask for watch mode.
// Optional problem.json next to the topology (example labs): passed through as window.XRAY_PROBLEM so the
// page can open on the route the problem is about ("focus": {"node": "r1", "prefix": "8.8.8.0/24"}).
// No problem.json (your own lab) -> nothing is added and the page behaves as before.
function readProblem() {
  try { return JSON.parse(fs.readFileSync(path.join(path.dirname(topoPath), 'problem.json'), 'utf8')); } catch (e) { return null; }
}
/* nx_netlab_validate (2026-10-15): a netlab lab's validate: tests (netlab-validate.js), judged on the FRR routers
   every few seconds -> window.XRAY_VALIDATE (the page shows the band, 3 / 5, ✓ Solved and marks on the graph). */
/* nx_graph_level (2026-10-15): rows given by the topology itself = containerlab's `graph-level` node label (1 = top row).
   Any lab (netlab: clab.labels: { graph-level: 1 } on a node, with the network-xray netlab defaults). It wins over the
   netlab group rule; nodes without the label go below the labelled ones. No label anywhere -> null. */
function graphLevels() {
  var lv = {}, any = false, nm = /^[ \t]*nodes:[ \t]*$/m.exec(topo), body = nm ? topo.slice(nm.index) : topo;   /* under nodes: only */
  nodes.forEach(function (n) {
    var esc = n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    var m = new RegExp('^([ \\t]+)' + esc + ':[ \\t]*\\r?\\n((?:\\1[ \\t]+.*\\r?\\n?|[ \\t]*\\r?\\n)*)', 'm').exec(body)
         || new RegExp('^[ \\t]+' + esc + ':[ \\t]*(\\{.*)$', 'm').exec(body);   /* nested block (blank lines allowed) or the one-line form */
    var g = m && /graph-level['"]?[ \t]*:[ \t]*['"]?(\d+)/.exec(m[m.length - 1]);
    if (g) { lv[n] = +g[1]; any = true; }
  });
  if (!any) return null;
  var vals = Object.keys(lv).map(function (k) { return lv[k]; }), max = Math.max.apply(null, vals);
  nodes.forEach(function (n) { if (lv[n] === undefined) lv[n] = max + 1; });
  var ks = []; nodes.forEach(function (n) { if (ks.indexOf(lv[n]) < 0) ks.push(lv[n]); }); ks.sort(function (a, b) { return a - b; });
  if (ks.length < 2) return null;
  nodes.forEach(function (n) { lv[n] = ks.indexOf(lv[n]); });
  return lv;
}
var clabTiers = graphLevels();
var VALIDATE = null, valRes = null, valLast = '', tierRes = clabTiers, lastStates = null, lastLive = false;
if (validateFile) {
  try { VALIDATE = require(path.join(__dirname, 'netlab-validate.js')); if (VALIDATE.setLiveStart) VALIDATE.setLiveStart(watch); }   /* nx_validate_clistart */
  catch (e) { console.error('!! --validate: netlab-validate.js not found next to the collector'); VALIDATE = null; }
}
var valPassSince = 0, VAL_HOLD_MS = 20000;   /* nx_validate_held */
function validateRound(cb) {
  var labv;
  try { labv = VALIDATE.load(validateFile); } catch (e) { return cb(false); }   /* no file yet (netlab create not run): no band */
  var nt = clabTiers || labv.tiers, tierChanged = JSON.stringify(nt) !== JSON.stringify(tierRes);   /* nx_netlab_tiers: rows for the graph */
  tierRes = nt;
  if (!labv.tests.length) return cb(tierChanged);
  VALIDATE.run(labv, 'clab-' + lab + '-', function (res) {
    /* nx_validate_held (2026-10-17): "all the checks network-xray reads pass" must hold for VAL_HOLD_MS, counted here (not from
       when the page was opened). A one-shot run (no --watch) has no time to wait: no converging, no hold. */
    var c0 = res.counts || {};
    if (!watch) res.converging = false;
    var partOk = c0.checked > 0 && !c0.fail && !c0.warning && !c0.pending && !c0.settling && c0.pass === c0.checked && !res.converging;
    if (partOk) { if (!valPassSince) valPassSince = Date.now(); } else valPassSince = 0;
    res.held = !!(partOk && (!watch || Date.now() - valPassSince >= VAL_HOLD_MS));
    var j = JSON.stringify(res), changed = j !== valLast;
    if (changed) { valLast = j; valRes = res; var c = res.counts; console.log('[' + new Date().toISOString() + '] validate: ' + c.pass + '/' + c.total + ' passed' + (c.fail ? ', ' + c.fail + ' failed' : '') + (c.pending ? ', ' + c.pending + ' not run' : '') + (c.settling ? ', ' + c.settling + ' waiting for routes' : '') + (c.unsupported ? ', ' + c.unsupported + ' not checked' : '')); }
    cb(changed || tierChanged);
  });
}
function writeStates(states, live) {
  lastStates = states; lastLive = live;
  var prob = readProblem();
  var xp = null;
  if (prob && prob.focus) (xp = xp || {}).focus = prob.focus;
  if (prob && prob.check) { (xp = xp || {}).check = prob.check; if (prob.format) xp.format = prob.format; }   /* format: the evaluator skips an unknown version; check_note_* is README-only: not passed */
  fs.writeFileSync(dest, 'window.LIVE_STATES = ' + JSON.stringify(states) + ';\n' +
    (live ? 'window.LIVE_WATCH = true;\n' : '') +
    (xp ? 'window.XRAY_PROBLEM = ' + JSON.stringify(xp) + ';\n' : '') +
    (valRes ? 'window.XRAY_VALIDATE = ' + JSON.stringify(valRes) + ';\n' : '') +
    (tierRes ? 'window.XRAY_TIERS = ' + JSON.stringify(tierRes) + ';\n' : ''));   /* nx_problem_check + nx_netlab_validate (2026-10-06): focus + check (Solved) */
}

console.log('lab=' + lab + ' proto=' + proto + ' nodes=' + nodes.join(',') + (watch ? ' (watch ' + (intervalMs / 1000) + 's)' : ''));

if (!watch) {
  if (VALIDATE) validateRound(function () { oneShot(); }); else oneShot();
}
function oneShot() {
  var r0 = collectAll();
  if (!r0.ok && !Object.keys(r0.states).length && fs.existsSync(dest)) {
    console.error('!! every node failed - kept the existing ' + dest);
    process.exitCode = 1;
  } else {
    writeStates(r0.states, false);
    console.log('wrote ' + dest + '  (' + r0.ok + '/' + nodes.length + ' nodes)');
  }
}
if (watch) {
  /* nx_netlab_validate: its own loop (one docker exec per node and command); the page file is rewritten only when the verdict changes */
  if (VALIDATE) (function vloop() { validateRound(function (changed) { if (changed && lastStates) writeStates(lastStates, lastLive); setTimeout(vloop, Math.max(intervalMs, 3000)); }); })();
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
    if (!r.ok && !r.kept && !r.unread && last) { setTimeout(tick, intervalMs); return; }   /* nx_unread: a router marked unreadable is news too */   /* nothing collected and nothing kept: keep the page as it is */
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
