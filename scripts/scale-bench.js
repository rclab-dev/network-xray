#!/usr/bin/env node
/* scale-bench.js — how far the Node side of the data path scales with lab size.
 *
 * Builds synthetic FRR labs (a ring + a few chords, OSPF on every link, eBGP with every direct neighbor, one AS per
 * router) and times the steps that run in Node, with no containers and no browser:
 *   collect  per router: JSON.parse of the `show ... json` text, clab-collect.js collectFromJson (parse + buildState),
 *            JSON.stringify of the per-node state file
 *   merge    clab-xray-collect.js side: JSON.parse of every per-node state file into one states object, the cross-node
 *            Hello-in pass, and the `window.LIVE_STATES = ...` text written as xray-states.js
 * The input JSON follows the FRR 8.x shapes in clab-collect.js's self-test fixtures and fixtures/frr-collect-sample.
 * Times are the median of --iterations runs on one core, routers one after another (the real collect runs the
 * per-router collectors in parallel processes, so the collect column is an upper bound for its CPU time).
 *
 *   usage: node scripts/scale-bench.js [--routers 10,25,50,100,200] [--proto ospf|bgp] [--iterations 5] [--json]
 */
'use strict';
var path = require('path');
var COLLECT = require(path.join(__dirname, '..', 'clab-collect.js'));

var DEFAULT_SIZES = [10, 25, 50, 100, 200];

// ---- synthetic lab --------------------------------------------------------------------------------
function rid(i) { return '10.255.' + (i >> 8) + '.' + ((i & 255) + 1); }   // loopback / router id, i = 0-based
function name(i) { return 'r' + (i + 1); }

// ring r1-r2-...-rN-r1 plus floor(N/10) (at least 1) chords across the ring
function makeTopology(n) {
  var links = [], seen = {};
  function add(a, b) {
    var k = Math.min(a, b) + '-' + Math.max(a, b);
    if (a === b || seen[k]) return;
    seen[k] = true; links.push([a, b]);
  }
  for (var i = 0; i < n; i++) add(i, (i + 1) % n);
  var chords = Math.max(1, Math.floor(n / 10)), step = Math.max(1, Math.floor(n / chords));
  for (var c = 0; c < chords && n > 3; c++) { var a = (c * step) % n; add(a, (a + Math.floor(n / 2)) % n); }
  var ifs = [];   // ifs[i] = [{iface, peer, peerIface, ip, peerIp, subnet}]
  for (var r = 0; r < n; r++) ifs.push([]);
  links.forEach(function (l, li) {
    var subnet = '10.' + (1 + (li >> 8)) + '.' + (li & 255);
    var ea = 'eth' + (ifs[l[0]].length + 1), eb = 'eth' + (ifs[l[1]].length + 1);
    ifs[l[0]].push({ iface: ea, peer: l[1], peerIface: eb, ip: subnet + '.1', peerIp: subnet + '.2', subnet: subnet + '.0/30' });
    ifs[l[1]].push({ iface: eb, peer: l[0], peerIface: ea, ip: subnet + '.2', peerIp: subnet + '.1', subnet: subnet + '.0/30' });
  });
  return { n: n, links: links, ifs: ifs };
}

// first hop (index into ifs[src]) toward every router, and the hop count (BFS, unit cost)
function firstHops(topo, src) {
  var hop = new Array(topo.n).fill(-1), dist = new Array(topo.n).fill(-1), q = [src];
  dist[src] = 0;
  while (q.length) {
    var u = q.shift();
    topo.ifs[u].forEach(function (e, k) {
      if (dist[e.peer] >= 0) return;
      dist[e.peer] = dist[u] + 1; hop[e.peer] = u === src ? k : hop[u]; q.push(e.peer);
    });
  }
  return { hop: hop, dist: dist };
}

// the `show ... json` outputs of router i, as the text vtysh prints
function routerOutputs(topo, i, bfs) {
  var my = topo.ifs[i], fh = bfs[i];
  var nei = {}, oif = {}, intf = {}, route = {}, peers = {}, bgp = {};
  intf.lo = { administrativeStatus: 'up', operationalStatus: 'up', ipAddresses: [{ address: rid(i) + '/32' }] };
  intf.eth0 = { administrativeStatus: 'up', operationalStatus: 'up', ipAddresses: [{ address: '172.20.20.' + (2 + i % 250) + '/24' }] };
  oif.lo = { ifUp: true, ospfEnabled: true, ipAddress: rid(i), ipAddressPrefixlen: 32, area: '0.0.0.0', timerMsecs: 10000, timerPassiveIface: true };
  my.forEach(function (e) {
    nei[rid(e.peer)] = [{ priority: 1, state: 'Full/DR', address: e.peerIp, ifaceName: e.iface + ':' + e.ip, upTimeInMsec: 99000 }];
    oif[e.iface] = { ifUp: true, ospfEnabled: true, ipAddress: e.ip, ipAddressPrefixlen: 30, area: '0.0.0.0', timerMsecs: 10000 };
    intf[e.iface] = { administrativeStatus: 'up', operationalStatus: 'up', ipAddresses: [{ address: e.ip + '/30' }] };
    route[e.subnet] = [{ prefix: e.subnet, protocol: 'connected', selected: true,
      nexthops: [{ directlyConnected: true, interfaceName: e.iface, active: true, fib: true }] }];
    peers[e.peerIp] = { remoteAs: 65000 + e.peer, localAs: 65000 + i, state: 'Established', peerUptime: '00:10:00', pfxRcd: topo.n - 1, hostname: name(e.peer) };
  });
  route[rid(i) + '/32'] = [{ prefix: rid(i) + '/32', protocol: 'connected', selected: true,
    nexthops: [{ directlyConnected: true, interfaceName: 'lo', active: true, fib: true }] }];
  function viaHop(dst) { var e = my[fh.hop[dst]]; return { ip: e.peerIp, interfaceName: e.iface, active: true, fib: true }; }
  for (var d = 0; d < topo.n; d++) {
    if (d === i) continue;
    route[rid(d) + '/32'] = [{ prefix: rid(d) + '/32', protocol: 'ospf', selected: true, nexthops: [viaHop(d)] }];
    var pfx = '198.18.' + d + '.0';   // the prefix router d originates in BGP (d < 256)
    if (topo.n > 256) pfx = '198.' + (18 + (d >> 8)) + '.' + (d & 255) + '.0';
    // one path per direct neighbor; the shortest AS path is best
    var paths = my.map(function (e) {
      var dd = bfs[e.peer].dist[d];
      return { prefix: pfx, prefixLen: 24, nexthops: [{ ip: e.peerIp }], valid: true, weight: 0, origin: 'IGP',
        path: [65000 + e.peer].concat(new Array(dd).fill(65000 + d)).slice(0, dd + 1).join(' '), _len: dd };
    });
    var best = paths.reduce(function (b, p) { return p._len < b._len ? p : b; }, paths[0]);
    paths.forEach(function (p) { if (p === best) p.bestpath = true; delete p._len; });
    bgp[pfx + '/24'] = paths;
  }
  // the links that are not this router's own still show up as OSPF routes
  topo.links.forEach(function (l, li) {
    if (l[0] === i || l[1] === i) return;
    var s = '10.' + (1 + (li >> 8)) + '.' + (li & 255) + '.0/30', near = fh.dist[l[0]] <= fh.dist[l[1]] ? l[0] : l[1];
    route[s] = [{ prefix: s, protocol: 'ospf', selected: true, nexthops: [viaHop(near)] }];
  });
  return {
    ospfNeighbor: JSON.stringify({ neighbors: nei }, null, 2),
    ospfInterface: JSON.stringify({ interfaces: oif }, null, 2),
    interface: JSON.stringify(intf, null, 2),
    route: JSON.stringify(route, null, 2),
    bgpSummary: JSON.stringify({ ipv4Unicast: { routerId: rid(i), as: 65000 + i, peers: peers } }, null, 2),
    bgp: JSON.stringify({ routerId: rid(i), routes: bgp }, null, 2)
  };
}

function makeLab(n) {
  var topo = makeTopology(n), outputs = [], bfs = [];
  for (var j = 0; j < n; j++) bfs.push(firstHops(topo, j));
  for (var i = 0; i < n; i++) outputs.push(routerOutputs(topo, i, bfs));
  return { topo: topo, outputs: outputs };
}

// ---- the timed steps --------------------------------------------------------------------------------
// one per-router collector run, from the vtysh text to the per-node state file text (clab-collect.js --out)
function collectRouter(lab, i, proto) {
  var o = lab.outputs[i], p = function (s) { return JSON.parse(s); };
  var st = COLLECT.collectFromJson({
    node: name(i), id: name(i), proto: proto, mgmtSubnet: '172.20.20.0/24',
    adjacency: lab.topo.ifs[i].map(function (e) { return { iface: e.iface, peer: name(e.peer) }; }),
    ospfConfigured: true, bgpConfigured: true,
    ospfNeighbor: p(o.ospfNeighbor), ospfInterface: p(o.ospfInterface), interface: p(o.interface),
    route: p(o.route), bgpSummary: p(o.bgpSummary), bgp: p(o.bgp)
  });
  return JSON.stringify(st, null, 2);
}

// clab-xray-collect.js collectAll() + writeStates() after the children are done: read the per-node files into one
// states object, the cross-node Hello-in pass (same code as there), and the xray-states.js text
function mergeStates(lab, files, proto) {
  var states = {}, nodes = [], adj = {};
  lab.topo.ifs.forEach(function (my, i) {
    nodes.push(name(i));
    adj[name(i)] = my.map(function (e) { return { iface: e.iface, peer: name(e.peer), peerIface: e.peerIface }; });
  });
  nodes.forEach(function (n, i) { states[n] = JSON.parse(files[i]); });
  if (proto !== 'bgp') {
    nodes.forEach(function (cn) {
      var st = states[cn]; if (!st) return;
      var psm = st.peer_sending_hellos || (st.peer_sending_hellos = {});
      (adj[cn] || []).forEach(function (link) {
        var peerSt = states[link.peer];
        psm[link.peer] = !!(peerSt && !peerSt.nx_unread && peerSt.iface_hellos && peerSt.iface_hellos[link.peerIface]);
        var _pvh = peerSt && peerSt.iface_hellos && peerSt.iface_hellos[link.peerIface];
        if (_pvh > 0) (st.peer_hellos || (st.peer_hellos = {}))[link.peer] = _pvh;
      });
      st.peer_sending_hello = Object.keys(psm).some(function (k) { return psm[k]; });
    });
  }
  return 'window.LIVE_STATES = ' + JSON.stringify(states) + ';\n';
}

function now() { return Number(process.hrtime.bigint()) / 1e6; }
function median(a) { var s = a.slice().sort(function (x, y) { return x - y; }); return s[Math.floor(s.length / 2)]; }
function round(x) { return Math.round(x * 10) / 10; }

// runBench(n, {proto, iterations}) -> { row, text }   (text = the produced xray-states.js of the last run)
function runBench(n, opts) {
  opts = opts || {};
  var proto = opts.proto || 'ospf', iters = Math.max(1, opts.iterations || 5);
  var lab = makeLab(n), inputBytes = 0;
  lab.outputs.forEach(function (o) { Object.keys(o).forEach(function (k) { inputBytes += Buffer.byteLength(o[k]); }); });
  var tc = [], tm = [], text = '';
  for (var it = 0; it <= iters; it++) {   // run 0 = warm-up, not counted
    var t0 = now(), files = [];
    for (var i = 0; i < n; i++) files.push(collectRouter(lab, i, proto));
    var t1 = now();
    text = mergeStates(lab, files, proto);
    var t2 = now();
    if (it > 0) { tc.push(t1 - t0); tm.push(t2 - t1); }
  }
  var c = median(tc), m = median(tm);
  return {
    row: { routers: n, links: lab.topo.links.length, proto: proto, collect_ms: round(c), merge_ms: round(m),
      parse_merge_ms: round(c + m), state_bytes: Buffer.byteLength(text), input_bytes: inputBytes, iterations: iters },
    text: text
  };
}

function table(rows) {
  var head = ['routers', 'links', 'collect ms', 'merge ms', 'parse+merge ms', 'state bytes'];
  var body = rows.map(function (r) { return [r.routers, r.links, r.collect_ms.toFixed(1), r.merge_ms.toFixed(1), r.parse_merge_ms.toFixed(1), r.state_bytes]; });
  var w = head.map(function (h, k) { return Math.max(h.length, Math.max.apply(null, body.map(function (b) { return String(b[k]).length; }))); });
  var line = function (cells) { return cells.map(function (x, k) { return String(x).padStart(w[k]); }).join('  '); };
  return [line(head)].concat(body.map(line)).join('\n');
}

if (require.main === module) {
  var argv = process.argv.slice(2), sizes = DEFAULT_SIZES, proto = 'ospf', iterations = 5, json = false;
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
  var rows = sizes.map(function (n) { return runBench(n, { proto: proto, iterations: iterations }).row; });
  if (json) console.log(JSON.stringify({ node: process.version, proto: proto, rows: rows }, null, 2));
  else console.log('proto=' + proto + ' node ' + process.version + ' (median of ' + iterations + ')\n' + table(rows));
}

module.exports = { makeLab: makeLab, runBench: runBench };
