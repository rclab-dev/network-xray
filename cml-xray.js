#!/usr/bin/env node
/*
 * cml-xray.js - the X-Ray graph + DeepDive for a lab running in Cisco CML2 (CML-Free works). No containerlab, no docker.
 *
 *   CML_HOST=192.0.2.10 CML_USER=admin CML_PASSWORD=... node cml-xray.js --lab "my lab"
 *   -> open http://127.0.0.1:8710/
 *
 * - Topology: the CML REST API (nodes, interfaces, links of the lab whose title is --lab) is turned into the same data
 *   `containerlab graph` gives the page (xray-graph-nextui.html), and the page is served from here.
 * - Router state: IOS nodes are read over SSH on the lab's management network (read-only `show` commands) with the IOS-XE
 *   reader (clab-iosxe-collect.js) - the same state as an IOL node in containerlab. The consoles are left alone: you use them
 *   as you would without network-xray. The management network = an unmanaged switch with each router's management port
 *   (Ethernet0/0, best in a VRF) and one small jump host (node label nx-jump) that is also on an External Connector
 *   (System Bridge); cml-xray reaches the routers through the jump host (ssh ProxyCommand). See the README, "CML2".
 *   A router with no management address is drawn but not read (unless --console).
 *
 * Options:
 *   --lab <title>          the CML lab's title (or --lab-id <id>)
 *   --port <n>             page port (default 8710); --listen <addr> (default 127.0.0.1 = this PC only)
 *   --out <dir>            where xray-states.js is written (default ./cml-view)
 *   --interval <s>         seconds between reads of one node (default 10, at least 5)
 *   --insecure             do not check CML's TLS certificate (CML ships a self-signed one). Better: CML_CA_FILE=<cert file>
 *   --once                 read the topology, print it, and exit (no page)
 *   --enable-env <VAR>     when `enable` asks for a password: the environment variable that holds it (no enable password: nothing to pass)
 *   --proto ospf|bgp       which protocol the view is about (default: bgp when a router runs BGP, else ospf)
 *   --no-state             the topology only (do not read the routers)
 *   --jump <user@host>     the jump host to reach the management network through (default: the nx-jump node, which prints
 *                          "NX-JUMP ip=<address>" on its console when it is up - read from the console log, nothing typed)
 *   --mgmt <r1=ip,r2=ip>   management addresses by hand (default: from each router's configuration in the lab)
 *   --console              read over the CML console instead (the old way: show commands appear on the console you use;
 *                          the tool waits while someone types and has a Pause button) - only when you ask for it
 *   --quiet-wait <s>       --console only: after anything you type on the console, wait this long before reading (default 60)
 *   --sync-layout          moving a node on the graph moves it in the CML lab too (writes only the node's x / y; off by default)
 *   --pause-colour keep|grey  while paused, the routers keep their colour (keep) or are drawn grey as when not read (grey, default)
 *   --problem <file>       the lab's problem.json (network-xray-lab/0): the problem band above the graph and "✓ Solved" when its
 *                          check passes (default: "<lab title>.problem.json" in the current folder, when there is one)
 * Environment: CML_HOST, CML_USER, CML_PASSWORD (never on the command line), CML_CA_FILE (optional);
 *   NX_IOS_USER / NX_IOS_PASSWORD (the routers, default admin / admin as in the examples); NX_JUMP_USER (the jump host, default
 *   nx = the user the README's jump host script makes) and NX_JUMP_KEY (its private key file; else your ssh agent / ~/.ssh keys). The jump host takes a key only:
 *   cml-xray never sends it a password.
 * Read only: the tool sends `show` commands and API GETs; it never configures a router or changes the lab.
 */
'use strict';
var fs = require('fs'), path = require('path'), http = require('http'), https = require('https');

// ---- options ------------------------------------------------------------------------------------------------
var argv = process.argv.slice(2), opt = { port: 8710, listen: '127.0.0.1', out: './cml-view', interval: 10 };
for (var i = 0; require.main === module && i < argv.length; i++) {   // options only when run, not when required
  var a = argv[i];
  if (a === '--lab') opt.lab = argv[++i];
  else if (a === '--lab-id') opt.labId = argv[++i];
  else if (a === '--port') opt.port = parseInt(argv[++i], 10);
  else if (a === '--listen') opt.listen = argv[++i];
  else if (a === '--out') opt.out = argv[++i];
  else if (a === '--interval') opt.interval = Math.max(5, parseInt(argv[++i], 10) || 10);
  else if (a === '--insecure') opt.insecure = true;
  else if (a === '--once') opt.once = true;
  else if (a === '--enable-env') opt.enableEnv = argv[++i];
  else if (a === '--proto') opt.proto = argv[++i];
  else if (a === '--no-state') opt.noState = true;
  else if (a === '--quiet-wait') opt.quietWait = Math.max(0, parseInt(argv[++i], 10));   /* nx_cml_share */
  else if (a === '--sync-layout') opt.syncLayout = true;   /* nx_cml_sync */
  else if (a === '--console') opt.console = true;   /* nx_cml_ssh: the console way only when asked for */
  else if (a === '--jump') opt.jump = argv[++i];   /* nx_cml_ssh */
  else if (a === '--mgmt') opt.mgmt = argv[++i];   /* nx_cml_ssh */
  else if (a === '--problem') opt.problem = argv[++i];   /* nx_cml_problem */
  else if (a === '--pause-colour') opt.pauseColour = argv[++i];   /* nx_cml_pause: keep | grey (default grey) */
  else if (a === '--self-test') opt.selfTest = true;
  else if (a === '-h' || a === '--help') { usage(0); }
  else { console.error('!! unknown option ' + JSON.stringify(a)); usage(2); }
}
function usage(code) {
  console.error('usage: CML_HOST=<host> CML_USER=<user> CML_PASSWORD=<password> node cml-xray.js --lab "<lab title>" [--port 8710] [--listen 127.0.0.1] [--out ./cml-view] [--interval 10] [--insecure] [--once]');
  process.exit(code);
}

// ---- CML node definitions -> the node kinds the page knows (one table: also for writing CML lab files later) ----------
// The page draws kind host / linux as a server and everything else as a router. IOS-family kinds are read for state.
var KIND = {
  'iol-xe': 'cisco_iol', 'ioll2-xe': 'cisco_iol', iosv: 'cisco_vios', iosvl2: 'cisco_viosl2', csr1000v: 'cisco_csr1000v',
  cat8000v: 'cisco_c8000v', iosxrv9000: 'cisco_xrv9k', nxosv9000: 'cisco_n9kv', asav: 'cisco_asav',
  alpine: 'host', ubuntu: 'host', server: 'host', desktop: 'host', trex: 'host', 'net-tools': 'host',
  unmanaged_switch: 'bridge', external_connector: 'ext-container'
};
var IOS_DEFS = ['iol-xe', 'ioll2-xe', 'iosv', 'iosvl2', 'csr1000v', 'cat8000v'];   // read with the IOS-XE reader (G2)
var SAFE_NAME = /^[A-Za-z0-9][A-Za-z0-9_.-]{0,62}$/, SAFE_IF = /^[A-Za-z0-9][A-Za-z0-9_.\/-]{0,62}$/;

// ---- CML REST API (GET only + authenticate) ---------------------------------------------------------------------------
function apiClient(host, user, pass, ca, insecure) {
  var agent = new https.Agent({ ca: ca || undefined, rejectUnauthorized: !insecure, keepAlive: true });
  var token = null;
  function req(method, p, body) {
    return new Promise(function (res, rej) {
      var data = body == null ? null : JSON.stringify(body);
      var hd = { Accept: 'application/json' };
      if (data) { hd['Content-Type'] = 'application/json'; hd['Content-Length'] = Buffer.byteLength(data); }
      if (token) hd.Authorization = 'Bearer ' + token;
      var r = https.request({ host: host, port: 443, path: '/api/v0' + p, method: method, agent: agent, timeout: 30000, headers: hd }, function (x) {
        var s = ''; x.setEncoding('utf8'); x.on('data', function (d) { s += d; });
        x.on('end', function () { var j; try { j = JSON.parse(s); } catch (e) { j = s; } res({ status: x.statusCode, body: j }); });
      });
      r.on('error', function (e) {
        if (/self[- ]signed|unable to verify|certificate/i.test(e.message)) e.message += ' - CML uses its own certificate: set CML_CA_FILE=<its certificate> or pass --insecure';
        rej(e);
      });
      r.on('timeout', function () { r.destroy(new Error('CML did not answer in 30 s (' + host + ')')); });
      if (data) r.write(data); r.end();
    });
  }
  function login() {
    token = null;
    return req('POST', '/authenticate', { username: user, password: pass }).then(function (r) {
      if (r.status !== 200 || typeof r.body !== 'string') throw new Error('CML login failed (HTTP ' + r.status + ') - check CML_USER / CML_PASSWORD');
      token = r.body;
    });
  }
  function get(p) {   // one re-login when the token has expired (401)
    var go = function () { return req('GET', p); };
    return (token ? Promise.resolve() : login()).then(go).then(function (r) {
      if (r.status === 401) return login().then(go);
      return r;
    }).then(function (r) {
      if (r.status !== 200) throw new Error('CML GET ' + p + ' -> HTTP ' + r.status);
      return r.body;
    });
  }
  function patch(p, body) {   /* nx_cml_sync: the only write - a node's x / y */
    var go = function () { return req('PATCH', p, body); };
    return (token ? Promise.resolve() : login()).then(go).then(function (r) { if (r.status === 401) return login().then(go); return r; })
      .then(function (r) { if (r.status < 200 || r.status >= 300) throw new Error('CML PATCH ' + p + ' -> HTTP ' + r.status); return r.body; });
  }
  return { get: get, patch: patch };
}

// ---- the lab: find it by title, read its topology -----------------------------------------------------------------
function findLab(api, title, id) {
  if (id) return api.get('/labs/' + encodeURIComponent(id)).then(function (l) { return { id: id, title: l.lab_title || l.title || id }; });
  return api.get('/labs').then(function (ids) {
    return Promise.all((ids || []).map(function (x) { return api.get('/labs/' + encodeURIComponent(x)).then(function (l) { return { id: x, title: l.lab_title || l.title || '' }; }); }));
  }).then(function (labs) {
    var hit = labs.filter(function (l) { return l.title === title; });
    if (hit.length === 1) return hit[0];
    if (!hit.length) throw new Error('no CML lab titled ' + JSON.stringify(title) + ' - labs: ' + labs.map(function (l) { return JSON.stringify(l.title); }).join(', '));
    throw new Error(hit.length + ' CML labs are titled ' + JSON.stringify(title) + ' - pick one with --lab-id: ' + hit.map(function (l) { return l.id; }).join(', '));
  });
}
/* CML topology (GET /labs/<id>/topology: nodes[] with label / node_definition / x / y / interfaces[] {id, label},
   links[] {interface_a, interface_b} - CML 2.10; the lab YAML says i1 / i2) -> the data `containerlab graph` gives its template:
   { nodes: [{name, image, kind, state, ipv4_address, ipv6_address}], links: [{source, source_endpoint, target, target_endpoint}] }
   + adjacency per node ({iface, peer, peerIface}) for reading state. Node and interface names are kept as CML / IOS has them. */
function toClabData(topo) {
  var nodes = (topo.nodes || []).slice(), skipped = [];
  // left -> right as on the CML canvas (x, then y) when every node has a distinct position; else the API's order
  var okXY = nodes.length > 1 && nodes.every(function (n) { return isFinite(n.x) && isFinite(n.y) && n.x !== null && n.y !== null; })
    && new Set(nodes.map(function (n) { return n.x + ',' + n.y; })).size === nodes.length;
  if (okXY) nodes.sort(function (p, q) { return (p.x - q.x) || (p.y - q.y); });
  var mg = mgmtParts(topo);   /* nx_cml_ssh: the management network is how the routers are read, not part of the lab: not drawn */
  var byId = {}, ifById = {};
  nodes = nodes.filter(function (n) {
    if (mg.hidden[n.id]) return false;
    if (!SAFE_NAME.test(String(n.label || ''))) { skipped.push('node ' + JSON.stringify(String(n.label).slice(0, 40))); return false; }
    byId[n.id] = n; (n.interfaces || []).forEach(function (f) { ifById[f.id] = { node: n, label: String(f.label || '') }; });
    return true;
  });
  var data = {
    nodes: nodes.map(function (n) {
      var o = { name: n.label, image: n.image_definition || n.node_definition || '', kind: KIND[n.node_definition] || n.node_definition || '', state: n.state || '', ipv4_address: '', ipv6_address: '' };
      if (o.kind === 'host') o.group = 'server';   // the overview picks its icon from the group (as a containerlab group label would)
      return o;
    }),
    links: []
  };
  var adj = {};
  (topo.links || []).forEach(function (L) {
    var x = ifById[L.interface_a || L.i1], y = ifById[L.interface_b || L.i2];   // CML 2.10 API: interface_a / interface_b (lab YAML: i1 / i2)
    if (!x || !y) return;
    if (!SAFE_IF.test(x.label) || !SAFE_IF.test(y.label)) { skipped.push('link ' + JSON.stringify(x.label + ' - ' + y.label)); return; }
    data.links.push({ source: x.node.label, source_endpoint: x.label, target: y.node.label, target_endpoint: y.label });
    (adj[x.node.label] = adj[x.node.label] || []).push({ iface: x.label, peer: y.node.label, peerIface: y.label });
    (adj[y.node.label] = adj[y.node.label] || []).push({ iface: y.label, peer: x.node.label, peerIface: x.label });
  });
  var defs = {}; nodes.forEach(function (n) { defs[n.label] = n.node_definition || ''; });
  var ids = {}; nodes.forEach(function (n) { ids[n.label] = n.id; });   /* nx_cml_share: the console log is per node id */
  var cfgs = {}; nodes.forEach(function (n) { if (n.configuration != null) cfgs[n.label] = configText(n.configuration); });   /* nx_cml_ssh */
  return { data: data, adj: adj, defs: defs, ids: ids, skipped: skipped, pos: canvasPos(nodes), mgmt: { jump: mg.jump, jumpId: mg.jumpId, ifs: mg.ifs }, cfgs: cfgs };
}

/* nx_cml_ssh: the management network in a CML lab = the jump host (label nx-jump, or the tag nx-jump), the unmanaged switch(es)
   it is on, and the External Connector(s) it is on. A router port linked to one of those switches is that router's management
   port. Returns the node ids to leave off the graph, the jump host and { router label: management port }. */
function mgmtParts(topo) {
  var nodes = topo.nodes || [], byId = {}, ifNode = {}, ifLabel = {};
  nodes.forEach(function (n) { byId[n.id] = n; (n.interfaces || []).forEach(function (f) { ifNode[f.id] = n.id; ifLabel[f.id] = String(f.label || ''); }); });
  var isJump = function (n) { return n && (n.label === 'nx-jump' || (n.tags || []).indexOf('nx-jump') >= 0); };
  var jump = nodes.filter(isJump)[0] || null, hidden = {}, ifs = {};
  if (!jump) return { hidden: hidden, jump: null, jumpId: null, ifs: ifs };
  hidden[jump.id] = true;
  var ends = (topo.links || []).map(function (L) { return [L.interface_a || L.i1, L.interface_b || L.i2]; });
  ends.forEach(function (e) {
    var a = byId[ifNode[e[0]]], b = byId[ifNode[e[1]]]; if (!a || !b) return;
    var other = a.id === jump.id ? b : (b.id === jump.id ? a : null);
    if (other && (other.node_definition === 'unmanaged_switch' || other.node_definition === 'external_connector')) hidden[other.id] = true;
  });
  var box = function (n) { return n.node_definition === 'unmanaged_switch' || n.node_definition === 'external_connector'; };
  ends.forEach(function (e) {
    var a = byId[ifNode[e[0]]], b = byId[ifNode[e[1]]]; if (!a || !b || box(a) && box(b)) return;   // a switch on the switch is not a router
    if (hidden[a.id] && a.node_definition === 'unmanaged_switch' && !hidden[b.id]) ifs[b.label] = ifLabel[e[1]];
    else if (hidden[b.id] && b.node_definition === 'unmanaged_switch' && !hidden[a.id]) ifs[a.label] = ifLabel[e[0]];
  });
  return { hidden: hidden, jump: jump.label, jumpId: jump.id, ifs: ifs };
}
/* a node's configuration from the API: a string, or (CML 2.7+) a list of { name, content } files - the IOS one is the text */
function configText(c) {
  if (typeof c === 'string') return c;
  if (Array.isArray(c)) return c.map(function (f) { return f && typeof f.content === 'string' ? f.content : ''; }).join('\n');
  return '';
}
/* the address on a router's management port, from its configuration ("interface <port>" ... " ip address A M"); a VRF on the
   port is fine (best: it keeps the management routes out of the lab's routing table). '' = none. */
function mgmtAddress(cfg, port) {
  var lines = String(cfg || '').replace(/\r/g, '').split('\n'), inIf = false, want = String(port || '').toLowerCase();
  for (var i = 0; i < lines.length; i++) {
    var l = lines[i], m = /^interface\s+(\S+)/i.exec(l);
    if (m) { inIf = m[1].toLowerCase() === want; continue; }
    if (/^\S/.test(l)) { inIf = false; continue; }
    var a = inIf && /^\s+ip address\s+(\d+\.\d+\.\d+\.\d+)\s+\d+\.\d+\.\d+\.\d+\s*$/i.exec(l);
    if (a) return a[1];
  }
  return '';
}

/* nx_cml_xy: the CML canvas x / y (y grows downward, like the screen) -> the page's layout box (W 560 x H 360, 70 / 60 margins),
   one scale for both axes (the shape is kept), centred. Every node must have x and y, else null (the page lays out as before). */
function canvasPos(nodes) {
  if (nodes.length < 2 || !nodes.every(function (n) { return n.x != null && n.y != null && isFinite(n.x) && isFinite(n.y); })) return null;
  var W = 560, H = 360, MX = 70, MY = 60;
  var xs = nodes.map(function (n) { return +n.x; }), ys = nodes.map(function (n) { return +n.y; });
  var x0 = Math.min.apply(null, xs), x1 = Math.max.apply(null, xs), y0 = Math.min.apply(null, ys), y1 = Math.max.apply(null, ys);
  var dx = x1 - x0, dy = y1 - y0;
  if (!dx && !dy) return null;   // all on one point: no shape to keep
  var sc = Math.min(dx ? (W - 2 * MX) / dx : Infinity, dy ? (H - 2 * MY) / dy : Infinity);
  var ox = (W - dx * sc) / 2, oy = (H - dy * sc) / 2, pos = {};
  nodes.forEach(function (n) { pos[n.label] = { x: Math.round(ox + (n.x - x0) * sc), y: Math.round(oy + (n.y - y0) * sc) }; });
  Object.defineProperty(pos, '_map', { value: { x0: x0, y0: y0, sc: sc, ox: ox, oy: oy }, enumerable: false });   /* nx_cml_sync: to go back to the CML canvas */
  return pos;
}
/* nx_cml_sync: a page place -> the CML canvas (whole numbers) */
function toCanvas(map, x, y) { return { x: Math.round((x - map.ox) / map.sc + map.x0), y: Math.round((y - map.oy) / map.sc + map.y0) }; }

// ---- the page: xray-graph-nextui.html as containerlab graph would render it, with CML wording -------------------------
var HERE = __dirname, TEMPLATE = path.join(HERE, 'xray-graph-nextui.html');
var CML_WORDS = [
  ['(containerlab NeXt UI × X-Ray DeepDive)', '(Cisco CML2 × X-Ray DeepDive)'],
  ['The topology view = the stock <b>containerlab graph</b> (NeXt UI), any size.', 'The topology view = your <b>CML2 lab</b> (NeXt UI), any size.'],
  ['全体図は素の <b>containerlab graph</b>（NeXt UI・サイズ自由）。', '全体図は <b>CML2 のラボ</b>（NeXt UI・サイズ自由）。'],
  ['ContainerLab Topology', 'CML2 Lab'],
  ['Node labels come from the topology file (clab.yml <code>nodes:</code>), not the device hostname.', 'Node labels are the node labels in your CML lab, not the device hostname.'],
  ['ノード名はトポロジ定義（clab.yml の <code>nodes:</code>）由来で、機器のホスト名ではありません。', 'ノード名は CML のラボのノードのラベルで、機器のホスト名ではありません。']
];
/* nx_cml_ssh: a node with no state yet shows the "Sample view" badge (clab-xray-bridge.js); its advice ("./xray.sh <lab>.clab.yml")
   is for containerlab. In a CML page it says what cml-xray does instead. The bridge is loaded after the page: wait for it. */
var SAMPLE_BODY = {
  en: 'Only the shape is drawn, from the CML lab. Colors, lines and states are not real: cml-xray has not read this node (yet). A router is read over SSH once the lab is started and its management network is up; other nodes are drawn only.',
  ja: 'CML のラボから形だけを描いています。色・線・状態は実物ではありません: cml-xray はこのノードを (まだ) 読んでいません。ルータはラボが起動し管理の網がつながると SSH で読みます。ほかのノードは描くだけです。'
};
/* nx_cml_lock (2026-11-06): the places come from the CML lab, so the nodes cannot be dragged on this page (click for DeepDive, zoom
   and moving the whole view stay) and the Horizontal / Vertical buttons are hidden (they re-arrange the nodes - not as in CML).
   One line in the graph's top bar, where the buttons were, says so (EN / JA, follows the page language). --sync-layout keeps
   dragging and the buttons (it writes the place to CML). */
var POS_EVERY_S = 5;   // the CML topology (places) is read again every 5 s and written to the page at once
var LOCK_WORDS = { en: 'Node positions come from your CML lab and can' + "'" + 't be moved here. Move a node in CML and the graph follows within about ' + (POS_EVERY_S + 1) + ' s.',
  ja: 'ノードの位置は CML のラボの通りで、ここでは動かせません。CML で動かすと約 ' + (POS_EVERY_S + 1) + ' 秒で図も動きます。' };
var LOCK_JS = '<script>(function(){var W=' + JSON.stringify(LOCK_WORDS).replace(/</g, '\\u003c') + ';var t=setInterval(function(){var tp=window.__nxTopo;if(!tp||typeof tp.nodeDraggable!=="function")return;clearInterval(t);tp.nodeDraggable(false);' +
  '["h-btn","v-btn"].forEach(function(i){var b=document.getElementById(i);if(b)b.style.display="none";});' +
  'var d=document.createElement("span");d.id="nx-cml-lock";d.style.cssText="font-size:12px;color:#64748b;text-align:right;max-width:62%;line-height:1.4";' +
  'var bar=document.querySelector(".ov-bar");if(bar)bar.appendChild(d);else{d.style.cssText+=";position:fixed;left:8px;bottom:8px";document.body.appendChild(d);}' +
  'var put=function(){var L="en";try{L=localStorage.getItem("nx-lang")||"en";}catch(e){}var s=W[L==="ja"?"ja":"en"];if(d.textContent!==s)d.textContent=s;};put();setInterval(put,1000);},200);})();</script>';
var SAMPLE_WORDS_JS ='<script>(function(){var t=setInterval(function(){var B=window.clabXray&&window.clabXray.SYNTHETIC_BADGE;if(!B)return;clearInterval(t);' +
  'var W=' + JSON.stringify(SAMPLE_BODY).replace(/</g, '\\u003c') + ';Object.keys(W).forEach(function(l){if(B[l])B[l].body=W[l];});' +
  'if(document.body.classList.contains("nx-synthetic")&&window.clabXray.markSynthetic)window.clabXray.markSynthetic(true);},100);})();</script>';
function renderPage(name, data, pos) {
  var html = fs.readFileSync(TEMPLATE, 'utf8'), miss = [];
  CML_WORDS.forEach(function (w) { if (html.indexOf(w[0]) < 0) miss.push(w[0]); html = html.split(w[0]).join(w[1]); });
  if (miss.length && !renderPage.warned) { renderPage.warned = true; console.error('!! page wording not found (the page changed?): ' + miss.join(' / ')); }
  var esc = function (s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); };
  var slot = '<script id="clab-data" type="application/json">{{ .Data }}</script>';
  if (html.indexOf(slot) < 0) throw new Error('the topology slot is missing in ' + TEMPLATE);
  html = html.split(slot).join('<script id="clab-data" type="application/json">' + JSON.stringify(data).replace(/</g, '\\u003c') + '</script>' +
    (pos ? '\n<script>window.XRAY_POS = ' + JSON.stringify(pos).replace(/</g, '\\u003c') + '; window.LIVE_POS = window.XRAY_POS;</script>' : ''));   /* nx_cml_xy */
  /* nx_cml_follow: when the places in xray-states.js change (moved in CML), put the nodes there (not while a node is being dragged) */
  html = html.replace('</body>', '<script>(function(){var last=JSON.stringify(window.XRAY_POS||null);setInterval(function(){var now=JSON.stringify(window.XRAY_POS||null);' +
    'if(now!==last&&window.XRAY_POS&&window.__nxApplyXrayPos&&!window.__nxDragging){last=now;try{window.__nxApplyXrayPos();}catch(e){}}},1000);})();</script></body>');
  html = html.replace('</body>', SAMPLE_WORDS_JS + '</body>');   /* nx_cml_ssh: the "Sample view" badge in CML words */
  if (renderPage.pauseBar) html = html.replace('</body>', pauseBar(renderPage.pauseVia) + '</body>');   /* nx_cml_share */
  if (renderPage.syncLayout) html = html.replace('</body>', SYNC_JS + '</body>');   /* nx_cml_sync */
  else html = html.replace('</body>', LOCK_JS + '</body>');   /* nx_cml_lock */
  return html.split('{{ .Name }}').join(esc(name));
}
/* nx_cml_sync: the page's centring moves every node by the same amount, so (page place - XRAY_POS) is the same for every node until one is
   dragged. That shift is learned while it is the same for all; after a drag, the nodes that are off by more than 2 are the moved ones. */
var SYNC_JS = '<script>(function(){var shift=null;var cur=function(){var o={};try{(window.__nxTopoNames?window.__nxTopoNames():Object.keys(window.XRAY_POS||{})).forEach(function(n){var nd=window.__nxTopo&&window.__nxTopo.getNode(n);if(nd&&nd.position){var c=nd.position();o[n]=[c.x,c.y];}});}catch(e){}return o;};' +
  'setInterval(function(){if(window.__nxDragging||!window.XRAY_POS)return;var P=window.XRAY_POS,o=cur(),d=null,same=true;Object.keys(o).forEach(function(n){if(!P[n])return;var v=[o[n][0]-P[n].x,o[n][1]-P[n].y];if(!d)d=v;else if(Math.abs(v[0]-d[0])>2||Math.abs(v[1]-d[1])>2)same=false;});if(d&&same)shift=d;},500);' +
  'window.__nxOnDragDone=function(){if(!shift||!window.XRAY_POS)return;var P=window.XRAY_POS,o=cur();Object.keys(o).forEach(function(n){if(!P[n])return;var x=o[n][0]-shift[0],y=o[n][1]-shift[1];if(Math.abs(x-P[n].x)>2||Math.abs(y-P[n].y)>2){' +
  'fetch("/api/pos",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({node:n,x:x,y:y})}).then(function(r){return r.json();}).then(function(j){if(j.error&&window.console)console.warn("CML layout:",j.error);});}});};})();</script>';
/* nx_cml_share: "Reading ... [Pause]" - top right; the state follows window.XRAY_CML from xray-states.js */
/* nx_cml_pause (2026-11-06): after a click the bar keeps what was asked for until xray-states.js says the same (it used to flip
   back for a moment); while paused, the graph gets a big "Paused" in its middle (the nodes stay clickable for DeepDive).
   Words for the SSH way (the default) and for --console. */
var PAUSE_WORDS = {
  ssh: { en: ['Reading the routers (SSH)', 'Reading paused'], ja: ['ルータを読んでいます (SSH)', '読むのを一時停止中'] },
  console: { en: ['Reading from the CML consoles', 'Reading from CML: paused'], ja: ['CML のコンソールから読んでいます', 'CML から読むのを一時停止中'] },
  btn: { en: ['Pause', 'Resume', 'Pausing…', 'Resuming…'], ja: ['一時停止', '再開', '止めています…', '再開しています…'] },
  big: { en: ['⏸ Paused', 'Nothing is read from the routers. Press Resume to read again.'], ja: ['⏸ 一時停止中', 'ルータを読んでいません。「再開」を押すと読み直します。'] }
};
function pauseBar(via) {
  var W = { bar: PAUSE_WORDS[via === 'console' ? 'console' : 'ssh'], btn: PAUSE_WORDS.btn, big: PAUSE_WORDS.big };
  return '<div id="nx-cml-bar" style="position:fixed;top:8px;left:8px;z-index:9998;background:#0f1318;color:#cfd8dc;border:1px solid #37474f;border-radius:6px;padding:4px 8px;font:12px sans-serif">' +
  '<span id="nx-cml-txt"></span> <button id="nx-cml-btn" style="margin-left:6px"></button></div>' +
  '<script>(function(){var W=' + JSON.stringify(W).replace(/</g, '\\u003c') + ',want=null,wantAt=0;' +
  'var L=function(){try{return (localStorage.getItem("nx-lang")||"en")==="ja"?"ja":"en";}catch(e){return "en";}};' +
  'var big=null;var bigEl=function(){if(big)return big;var fr=document.querySelector(".ov-frame");if(!fr)return null;if(getComputedStyle(fr).position==="static")fr.style.position="relative";' +
  'big=document.createElement("div");big.id="nx-cml-paused";big.style.cssText="position:absolute;left:0;right:0;bottom:0;top:46px;display:none;align-items:center;justify-content:flex-start;padding-top:26px;flex-direction:column;background:rgba(15,19,24,.12);pointer-events:none;z-index:5;text-align:center";' +
  'big.innerHTML="<div style=\\"font:700 34px sans-serif;color:#fff;background:rgba(15,19,24,.88);border-radius:12px 12px 0 0;padding:10px 28px 4px\\"></div><div style=\\"font:14px sans-serif;color:#eceff1;background:rgba(15,19,24,.88);border-radius:0 0 12px 12px;padding:2px 28px 12px\\"></div>";fr.appendChild(big);return big;};' +
  'var show=function(){var real=!!(window.XRAY_CML&&window.XRAY_CML.paused);if(want!==null&&(real===want||Date.now()-wantAt>15000))want=null;' +
  'var p=want!==null?want:real,l=L();document.getElementById("nx-cml-txt").textContent=W.bar[l][p?1:0];' +
  'document.getElementById("nx-cml-btn").textContent=want!==null?W.btn[l][want?2:3]:W.btn[l][p?1:0];' +
  'var b=bigEl();if(b){b.style.display=p?"flex":"none";b.children[0].textContent=W.big[l][0];b.children[1].textContent=W.big[l][1];}};' +
  'document.getElementById("nx-cml-btn").onclick=function(){var p=want!==null?want:!!(window.XRAY_CML&&window.XRAY_CML.paused);want=!p;wantAt=Date.now();show();' +
  'fetch(p?"/api/resume":"/api/pause",{method:"POST"}).catch(function(){want=null;show();});};' +
  'show();setInterval(show,500);})();</script>';
}
var MIME = { '.html': 'text/html; charset=utf-8', '.js': 'application/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.woff': 'font/woff', '.woff2': 'font/woff2', '.ttf': 'font/ttf', '.eot': 'application/vnd.ms-fontobject', '.webm': 'video/webm' };
/* nx_cml_problem (2026-11-06): the lab's problem.json, as next to a containerlab topology: the page shows its band (title, text,
   the RouteCrushLab button) from /static/problem.json, and focus + check go into xray-states.js (window.XRAY_PROBLEM) for
   "✓ Solved". --problem <file>, else "<lab title>.problem.json" in the current folder. None = the page as before. */
function loadProblem(file, title) {
  var auto = !file, f = file || path.resolve(String(title).replace(/[\\/:*?"<>|]/g, '_') + '.problem.json');
  if (auto && !fs.existsSync(f)) return null;
  var text, pj;
  try { text = fs.readFileSync(f, 'utf8').replace(/^\uFEFF/, ''); pj = JSON.parse(text); } catch (e) { console.error('!! --problem ' + f + ': ' + e.message + ' - no problem band'); return null; }
  if (!pj || typeof pj !== 'object' || Array.isArray(pj)) { console.error('!! --problem ' + f + ': not a problem.json object - no problem band'); return null; }
  var xp = null;
  if (pj.focus) (xp = xp || {}).focus = pj.focus;
  if (pj.check) { (xp = xp || {}).check = pj.check; if (pj.format) xp.format = pj.format; }
  return { file: f, text: text, xp: xp, check: !!pj.check };
}
function serve(getView) {
  var outDir = path.resolve(opt.out);
  var srv = http.createServer(function (q, r) {
    var u = decodeURIComponent(String(q.url || '/').split('?')[0]);
    var send = function (code, type, body) { r.writeHead(code, { 'Content-Type': type, 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' }); r.end(body); };
    if (q.method === 'POST' && u === '/api/pos' && serve.place) {   /* nx_cml_sync (local page, --sync-layout only) */
      var b = ''; q.on('data', function (d) { b += d; if (b.length > 20000) q.destroy(); });
      q.on('end', function () { var j; try { j = JSON.parse(b); } catch (e) { return send(400, 'text/plain', 'bad json'); }
        serve.place(j).then(function (r) { send(200, 'application/json', JSON.stringify(r)); }, function (e) { send(502, 'application/json', JSON.stringify({ error: e.message })); }); });
      return;
    }
    if (q.method === 'POST' && (u === '/api/pause' || u === '/api/resume') && serve.control) {   /* nx_cml_share: the [Pause] button (local page only) */
      serve.control(u === '/api/pause'); return send(200, 'application/json', JSON.stringify({ paused: u === '/api/pause' }));
    }
    if (q.method !== 'GET' && q.method !== 'HEAD') return send(405, 'text/plain', 'read only');
    if (u === '/' || u === '/index.html') {
      var v = getView();
      if (!v) return send(503, 'text/plain; charset=utf-8', 'reading the CML lab - reload in a few seconds');
      try { return send(200, MIME['.html'], renderPage(v.name, v.data, v.pos)); } catch (e) { return send(500, 'text/plain; charset=utf-8', e.message); }
    }
    var m = /^\/static\/(.+)$/.exec(u);
    if (!m) return send(404, 'text/plain', 'not found');
    var rel = path.normalize(m[1]);
    if (rel.split(path.sep).indexOf('..') >= 0 || path.isAbsolute(rel)) return send(404, 'text/plain', 'not found');
    if (rel === 'problem.json') return serve.problem ? send(200, 'application/json; charset=utf-8', serve.problem) : send(404, 'text/plain', 'not found');   /* nx_cml_problem */
    var f = rel === 'xray-states.js' ? path.join(outDir, rel) : path.join(HERE, rel);   // states from --out, the rest from the tool's folder
    fs.readFile(f, function (err, buf) {
      if (err) return send(404, 'text/plain', 'not found');
      send(200, MIME[path.extname(f).toLowerCase()] || 'application/octet-stream', buf);
    });
  });
  srv.on('error', function (e) { console.error('!! cannot listen on ' + opt.listen + ':' + opt.port + ' - ' + e.message); process.exit(1); });
  srv.listen(opt.port, opt.listen, function () {
    var shownHost = opt.listen === '0.0.0.0' ? '<this-pc-address>' : opt.listen;
    console.log('==> open http://' + shownHost + ':' + opt.port + '/');
  });
}

// ---- router state over the CML console server (G2) -----------------------------------------------------------------
/* One SSH session per IOS node to the CML console server (CML_HOST:22, the CML user), kept open:
   `open /<lab title>/<node label>/0` -> enable -> terminal length 0 / width 0 -> the IOS reader's show commands.
   Each command waits for the prompt to come back (no fixed sleeps). The texts go through the same reader as an IOL node in
   containerlab (clab-iosxe-collect.js: splitByPrompt drops and counts syslog lines, run() builds the state), so the page
   gets the same state. The password reaches ssh through a short-lived askpass helper (never on a command line). */
var cp = require('child_process'), os = require('os');
var IOS = null;
function iosReader() { return IOS || (IOS = require(path.join(HERE, 'clab-iosxe-collect.js'))); }
function makeAskpass(varName) {
  var dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cml-xray-'));
  var f;
  if (process.platform === 'win32') {   // a .cmd that asks node to print the variable (no cmd.exe quoting of the password)
    f = path.join(dir, 'askpass.cmd');
    fs.writeFileSync(f, '@"' + process.execPath + '" -e "process.stdout.write(process.env.' + varName + '+String.fromCharCode(10))"\r\n');
  } else {
    f = path.join(dir, 'askpass.sh');
    fs.writeFileSync(f, '#!/bin/sh\nprintf "%s\\n" "$' + varName + '"\n', { mode: 0o700 });
  }
  return { file: f, cleanup: function () { try { fs.unlinkSync(f); } catch (e) {} try { fs.rmdirSync(dir); } catch (e) {} } };
}
function Console(node, cfg) { this.node = node; this.cfg = cfg; this.buf = ''; this.host = null; this.alive = false; this.child = null; this.own = false; this.lastForeign = 0; }
/* nx_cml_share: a chunk made only of router log lines ("%OSPF-5-ADJCHG: ...", time stamps, blank) is not a person */
var SYSLOG_LINE = /^\s*(?:\*?[A-Za-z]{3}\s+\d+\s+[\d:.]+:?\s*)?%[A-Z0-9_]+-\d-[A-Z0-9_]+:/;
function foreignChunk(text) { return String(text).split('\n').some(function (l) { return l.trim() && !SYSLOG_LINE.test(l); }); }
/* the line can be read when it has been quiet and ends with the bare prompt - '' = yes, else why not */
Console.prototype.whyNot = function (quietMs, now) {
  if (!this.host) return 'no prompt';
  if ((now || Date.now()) - this.lastForeign < quietMs) return 'in use';
  var tail = this.buf.slice(this.buf.lastIndexOf('\n') + 1);
  var h = this.host.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');   /* nx_cml_share2: say what is going on */
  if (new RegExp('^' + h + '#\\s*$').test(tail)) return '';
  if (new RegExp('^' + h + '\\(config[^)]*\\)#').test(tail)) return 'config mode';
  if (/--More--/.test(tail)) return 'paged output';
  if (new RegExp('^' + h + '>\\s*$').test(tail)) return 'not in enable mode';
  return 'someone is typing';
};
Console.prototype.start = function () {
  var self = this, c = this.cfg;
  this.buf = ''; this.host = null;
  this.child = cp.spawn('ssh', ['-tt', '-p', '22', '-o', 'StrictHostKeyChecking=accept-new',   /* the console server key: remembered the first time, checked after (--insecure is for TLS only) */
    '-o', 'PreferredAuthentications=keyboard-interactive,password', '-o', 'PubkeyAuthentication=no', '-o', 'ServerAliveInterval=15',
    '-o', 'ConnectTimeout=15', '-o', 'LogLevel=ERROR'].concat([c.user + '@' + c.host]), { env: Object.assign({}, process.env, { SSH_ASKPASS: c.askpass, SSH_ASKPASS_REQUIRE: 'force', DISPLAY: process.env.DISPLAY || ':0' }), stdio: ['pipe', 'pipe', 'pipe'],
    detached: process.platform === 'win32', windowsHide: true });   /* nx_cml_stop: on Windows its own hidden console - an ssh -tt must not take over ours (Ctrl+C) */
  this.alive = true; this.err = '';
  this.child.stdout.on('data', function (d) {
    var t = d.toString().replace(/\r/g, '').replace(/\x1b\[[0-9;?]*[A-Za-z]/g, '');
    if (!self.own && foreignChunk(t)) self.lastForeign = Date.now();   /* nx_cml_share: someone else on the line */
    self.buf += t; if (self.buf.length > 400000) self.buf = self.buf.slice(-200000);
  });
  this.child.stderr.on('data', function (d) { self.err = (self.err + d.toString()).slice(-400); });
  this.child.on('exit', function () { self.alive = false; self.host = null; });
  this.child.on('error', function (e) { self.alive = false; self.err = e.message; });
  [this.child.stdin, this.child.stdout, this.child.stderr].forEach(function (p) { if (p) p.on('error', function () {}); });   /* nx_cml_stopped */
};
Console.prototype.send = function (line) { try { var w = this.child && this.child.stdin; if (w && w.writable) w.write(line + '\r'); } catch (e) {} };   /* nx_cml_stopped: not to an ended line */
Console.prototype.waitFor = function (re, from, ms) {
  var self = this, t0 = Date.now();
  return new Promise(function (res) {
    (function poll() {
      var m = re.exec(self.buf.slice(from));
      if (m) return res(m);
      if (!self.alive || Date.now() - t0 > ms) return res(null);
      setTimeout(poll, 100);
    })();
  });
};
Console.prototype.login = function (labTitle) {
  var self = this, c = this.cfg, at;
  var PROMPT = /\n([A-Za-z0-9._-]+)([>#])\s*$/;
  this.start(); this.own = true;   /* nx_cml_share: what arrives while logging in is the tool's own */
  // the console server greets with its own prompt ("consoles>"); then open the node's first console line
  return this.waitFor(/>\s*$/, 0, 20000).then(function (m) {
    if (!m) throw new Error('no answer from the CML console server' + (self.err ? ' (' + self.err.trim().split('\n').pop() + ')' : ''));
    at = self.buf.length; self.send('open /' + labTitle + '/' + self.node + '/0');
    return new Promise(function (r) { setTimeout(r, 1500); });
  }).then(function () {
    // wake the line: a booted router prints its prompt; "Press RETURN" or a line left at "Password:" needs more than one
    var tries = 0;
    return (function wake() { self.send(''); tries++; return self.waitFor(PROMPT, at, 8000).then(function (m) {
      if (!m && /\([a-z-]*config[^)]*\)#\s*$/i.test(self.buf.slice(at))) { var be = new Error('config mode'); be.busy = true; throw be; }   /* nx_cml_share2: someone is configuring - stop, send nothing more */
      return (m || tries >= 4) ? m : wake(); }); })();
  }).then(function (m) {
    if (!m) throw new Error('no IOS prompt on the console (is the node started and booted?)');
    if (/^consoles$/.test(m[1])) throw new Error('the console server did not open /' + labTitle + '/' + self.node + '/0');
    self.host = m[1];
    if (m[2] === '#') return;
    at = self.buf.length; self.send('enable');
    return self.waitFor(/(Password:\s*$)|(\n[A-Za-z0-9._-]+#\s*$)/, at, 10000).then(function (e) {
      if (!e) throw new Error('enable did not answer');
      if (e[2]) return;
      if (!c.enablePassword) {   // leave the line as it was (back at '>'), and do not ask again: it cannot work without the password
        self.send('');
        var fe = new Error('enable asks for a password: pass --enable-env <VARIABLE> (the variable holds it) - not read until then'); fe.fatal = true; throw fe;
      }
      var at2 = self.buf.length; self.send(c.enablePassword);
      return self.waitFor(new RegExp('\\n' + self.host + '#\\s*$'), at2, 10000).then(function (ok) { if (!ok) throw new Error('enable password not accepted'); });
    });
  }).then(function () { return self.cmd('terminal length 0'); }).then(function () { return self.cmd('terminal width 0'); })
    .then(function () { self.own = false; }, function (e) { self.own = false; throw e; });
};
Console.prototype.cmd = function (command) {
  var self = this, at = this.buf.length, was = this.own;
  this.own = true; this.send(command);
  return this.waitFor(new RegExp('\\n' + this.host + '#\\s*$'), at, this.cmdWaitMs || 30000).then(function (m) {
    self.own = was;
    if (!m) { self.host = null; throw new Error('no prompt after "' + command + '"'); }   // exec-timeout / someone else on the line -> log in again next round
    return self.buf.slice(at, at + m.index + m[0].length);
  });
};
Console.prototype.stop = function () { try { this.send('~.'); } catch (e) {} try { if (this.child) this.child.kill(); } catch (e) {} this.alive = false; this.host = null; };   /* nx_cml_stop */

// ---- router state over SSH on the management network (the default) ---------------------------------------------------
/* nx_cml_ssh: one short SSH session per router per round, through the jump host (ProxyCommand ssh -W), as clab-iosxe-collect.js
   reads an IOL node in containerlab: terminal length 0 / width 0 + the reader's show commands + exit. `terminal length` is the
   setting of that SSH line only (a vty): nothing to put back, and the console is never touched. The routers' host keys change
   with every wipe of the lab, so they are not remembered (it is a lab, reached through your own jump host). */
/* a path for ssh's own options and ProxyCommand: forward slashes (ssh reads a backslash as an escape) - Windows OpenSSH and Git's ssh both take C:/... */
function sshPath(p) { return String(p).replace(/\\/g, '/'); }
var SAFE_ADDR = /^(?:[A-Za-z0-9][A-Za-z0-9_.-]{0,252}|[0-9A-Fa-f:.]+)$/;   // a host name or an address, nothing ssh could read as an option
/* the askpass helper answers the router's password prompt (NX_IOS_PASSWORD); the jump host is reached with a key only (the hop to it
   runs with BatchMode, so it never asks). The helper holds no password (it is in its environment). */
function sshAskpass() {
  var dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cml-xray-'));
  var js = path.join(dir, 'askpass.js'), f;
  fs.writeFileSync(js, "process.stdout.write(String(process.env.NX_IOS_PASSWORD) + '\\n');\n", { mode: 0o600 });
  if (process.platform === 'win32') { f = path.join(dir, 'askpass.cmd'); fs.writeFileSync(f, '@"' + process.execPath + '" "' + js + '" %*\r\n'); }
  else { f = path.join(dir, 'askpass.sh'); fs.writeFileSync(f, '#!/bin/sh\nexec "' + process.execPath + '" "' + js + '" "$@"\n', { mode: 0o700 }); }
  /* the host keys of this run go to a file of its own, removed with the helper (not /dev/null or NUL: one of them is a plain file
     to the other ssh on Windows) */
  var known = path.join(dir, 'known_hosts');
  return { file: f, known: known, cleanup: function () {   // everything in the folder: the helper and the per-session host-key files
    try { fs.readdirSync(dir).forEach(function (x) { try { fs.unlinkSync(path.join(dir, x)); } catch (e) {} }); } catch (e) {}
    try { fs.rmdirSync(dir); } catch (e) {} } };
}
function sshOpts(known, q) { return ['-o', 'StrictHostKeyChecking=no', '-o', 'UserKnownHostsFile=' + (q ? '"' + sshPath(known) + '"' : sshPath(known)), '-o', 'LogLevel=ERROR', '-o', 'ConnectTimeout=15',
  '-o', 'ServerAliveInterval=5', '-o', 'ServerAliveCountMax=2']; }   // a router (or the jump host) that is stopped: ssh ends in about 10 s instead of waiting
function sshArgs(ip, jump, s) {
  /* the hop to the jump host: a key only (BatchMode = no password prompt, no askpass) */
  var known = s.known || (process.platform === 'win32' ? 'NUL' : '/dev/null');
  var proxy = ['ssh'].concat(sshOpts(known, true), ['-o', 'BatchMode=yes', '-o', 'PasswordAuthentication=no', '-o', 'KbdInteractiveAuthentication=no'],
    jump.key ? ['-o', 'IdentitiesOnly=yes', '-i', '"' + sshPath(jump.key) + '"'] : [], ['-W', '%h:%p', jump.user + '@' + jump.host]).join(' ');
  return ['-tt'].concat(sshOpts(known, false), ['-o', 'PreferredAuthentications=keyboard-interactive,password', '-o', 'PubkeyAuthentication=no',
    '-o', 'KexAlgorithms=+diffie-hellman-group14-sha1', '-o', 'HostKeyAlgorithms=+ssh-rsa', '-o', 'Ciphers=+aes128-cbc,aes256-cbc',
    '-o', 'ProxyCommand=' + proxy, s.user + '@' + ip]);
}
/* where to read each router: plan(n) -> Promise { ip } or { why } (not read); jumpHost() -> Promise { user, host, pass } or null.
   Addresses: --mgmt by hand, else the router's management port (the one on the nx-jump switch) in its configuration in the lab
   (the topology has it; else GET .../nodes/<id>/config - read only). The jump host: --jump, else the last "NX-JUMP ip=<address>"
   line in the nx-jump console log (read again every 30 s while it is not known, and every 5 min after). Bad arguments -> null. */
function sshPlanner(api, lab, view, opt) {
  var rUser = process.env.NX_IOS_USER || 'admin', rPass = process.env.NX_IOS_PASSWORD || 'admin';
  var jUser = process.env.NX_JUMP_USER || 'nx', jKey = process.env.NX_JUMP_KEY || '';
  if (jKey && (/["\r\n]/.test(jKey) || !fs.existsSync(jKey))) { console.error('!! NX_JUMP_KEY: no such key file ' + JSON.stringify(jKey)); return null; }
  if (!SAFE_NAME.test(rUser) || !SAFE_NAME.test(jUser)) { console.error('!! NX_IOS_USER / NX_JUMP_USER: a plain user name'); return null; }
  var byHand = {}, fixedJump = null;
  if (opt.mgmt) {
    var bad = String(opt.mgmt).split(',').filter(function (p) {
      var m = /^([^=\s]+)=([^=\s]+)$/.exec(p.trim()); if (!m || !SAFE_ADDR.test(m[2])) return true; byHand[m[1]] = m[2]; return false;
    });
    if (bad.length) { console.error('!! --mgmt r1=<address>,r2=<address>: ' + bad.join(', ')); return null; }
  }
  if (opt.jump) {
    var jm = /^(?:([^@\s]+)@)?([^@\s]+)$/.exec(opt.jump);
    if (!jm || !SAFE_ADDR.test(jm[2]) || (jm[1] && !SAFE_NAME.test(jm[1]))) { console.error('!! --jump <user@host>: ' + JSON.stringify(opt.jump)); return null; }
    fixedJump = { user: jm[1] || jUser, host: jm[2], key: jKey };
  }
  var cfgCache = {}, jump = null, jumpAt = 0, jumpP = null;
  function cfgOf(n) {
    var v = view(); if (v.cfgs && v.cfgs[n] != null) return Promise.resolve(v.cfgs[n]);
    if (cfgCache[n] != null) return Promise.resolve(cfgCache[n]);
    var id = v.ids && v.ids[n]; if (!id) return Promise.resolve('');
    return api.get('/labs/' + encodeURIComponent(lab.id) + '/nodes/' + encodeURIComponent(id) + '/config').then(function (c) { return (cfgCache[n] = configText(c)); }, function () { return ''; });
  }
  return {
    user: rUser, pass: rPass, kids: new Set(),
    plan: function (n) {
      if (byHand[n]) return Promise.resolve({ ip: byHand[n] });
      var v = view(), port = v.mgmt && v.mgmt.ifs[n];
      if (!fixedJump && !(v.mgmt && v.mgmt.jump)) return Promise.resolve({ why: 'the lab has no management network (no nx-jump node; or pass --jump and --mgmt) - README "CML2", or --console' });
      if (!port && !fixedJump) return Promise.resolve({ why: 'no port of it is on the management switch (the nx-jump one)' });
      return cfgOf(n).then(function (c) {
        var ip = port ? mgmtAddress(c, port) : mgmtVrfAddress(c);
        if (!ip) return { why: port ? 'its management port ' + port + ' has no "ip address" in its configuration' : 'no management address (pass --mgmt ' + n + '=<address>)' };
        return SAFE_ADDR.test(ip) ? { ip: ip } : { why: 'its management address is not a plain address' };
      });
    },
    jumpHost: function () {
      if (fixedJump) return Promise.resolve(fixedJump);
      var v = view(), id = v.mgmt && v.mgmt.jumpId;
      if (!id) return Promise.resolve(null);
      if (Date.now() - jumpAt < (jump ? 300000 : 30000)) return jumpP || Promise.resolve(jump);   // the routers of one round share one look
      jumpAt = Date.now();
      return (jumpP = api.get('/labs/' + encodeURIComponent(lab.id) + '/nodes/' + encodeURIComponent(id) + '/consoles/0/log?lines=500').then(function (log) {
        var all = String(log || '').match(/NX-JUMP ip=([0-9A-Fa-f:.]+)/g), last = all && /ip=(\S+)/.exec(all[all.length - 1])[1];
        if (last && SAFE_ADDR.test(last)) { if (!jump || jump.host !== last) console.log('jump host nx-jump: ' + last); jump = { user: jUser, host: last, key: jKey }; }
        jumpP = null; return jump;
      }, function () { jumpP = null; return jump; }));
    },
    failed: function () { if (!fixedJump) jumpAt = 0; }   // an SSH failure: look at the jump host's address again next round (DHCP may have moved it)
  };
}
/* a router's address on a port that is in a management VRF (vrf forwarding MGMT / Mgmt-intf / management...), for --jump labs
   without the nx-jump switch */
function mgmtVrfAddress(cfg) {
  var lines = String(cfg || '').replace(/\r/g, '').split('\n'), cur = null, vrf = false, ip = '';
  for (var i = 0; i <= lines.length; i++) {
    var l = lines[i] == null ? 'end' : lines[i];
    if (/^\S/.test(l)) { if (cur && vrf && ip) return ip; cur = /^interface\s+(\S+)/i.test(l) ? l : null; vrf = false; ip = ''; continue; }
    if (!cur) continue;
    if (/^\s+(?:vrf forwarding|ip vrf forwarding)\s+(\S*mgmt\S*|\S*management\S*)\s*$/i.test(l)) vrf = true;
    var a = /^\s+ip address\s+(\d+\.\d+\.\d+\.\d+)\s+\d+\.\d+\.\d+\.\d+\s*$/i.exec(l); if (a) ip = a[1];
  }
  return '';
}
/* nx_cml_ssh: one SSH session per router, kept open (as the console sessions were) and logged in once. A new session every round
   would put three or four log lines on the router's console each round (IOS logs SSH2_SESSION / LOGIN_SUCCESS / SSH2_CLOSE by
   default - seen on CML 2.10 + IOL 17.18): with one session they appear once, when it starts. The commands are sent one by one,
   each waiting for the prompt (the Console code). A vty does not get the router's log lines (no terminal monitor). */
function SshLine(n, ip, jump, s) { this.node = n; this.ip = ip; this.jump = jump; this.s = s; this.buf = ''; this.host = null; this.alive = false; this.child = null; this.err = ''; this.own = true; this.cmdWaitMs = 15000; }   /* nx_cml_stopped: a show waits 15 s (the console line keeps 30 s) */
SshLine.prototype.waitFor = Console.prototype.waitFor;
SshLine.prototype.send = Console.prototype.send;
SshLine.prototype.cmd = Console.prototype.cmd;
/* Windows: not detached. A detached ssh.exe has no console, so the ProxyCommand ssh it starts gets a new, visible console
   window (one black window per router). With windowsHide and no detached, Node starts ssh with CREATE_NO_WINDOW = a
   console of its own without a window: the ProxyCommand hop shares it (no window either), and ours is not touched (Ctrl+C). */
var SSH_SPAWN = { stdio: ['pipe', 'pipe', 'pipe'], detached: false, windowsHide: true };
var KNOWN_SEQ = 0;
SshLine.prototype.start = function () {
  var self = this, s = this.s;
  this.buf = ''; this.host = null; this.err = ''; this.code = null;
  /* a fresh host-key file for every session: a router that was stopped and started again has a new key, and with a
     remembered old one OpenSSH turns password login off ("to avoid man-in-the-middle attacks") - the router then logs
     User '' failed and the line never comes back. The keys are not kept anyway (the lab makes new ones on every start). */
  var so = s;
  if (s.known) { if (this.knownFile) try { fs.unlinkSync(this.knownFile); } catch (e) {} this.knownFile = s.known + '.' + (++KNOWN_SEQ); so = Object.assign({}, s, { known: this.knownFile }); }
  var ch = this.child = cp.spawn('ssh', sshArgs(this.ip, this.jump, so), Object.assign({ env: Object.assign({}, process.env, { SSH_ASKPASS: s.askpass, SSH_ASKPASS_REQUIRE: 'force', DISPLAY: process.env.DISPLAY || ':0',
    NX_IOS_PASSWORD: s.pass }) }, SSH_SPAWN));
  this.alive = true; s.kids.add(ch);
  ch.stdout.on('data', function (d) { self.buf += d.toString().replace(/\r/g, '').replace(/\x1b\[[0-9;?]*[A-Za-z]/g, ''); if (self.buf.length > 400000) self.buf = self.buf.slice(-200000); });
  ch.stderr.on('data', function (d) { self.err = (self.err + d.toString()).slice(-600); });
  /* nx_cml_stopped: a stopped router ends the ssh; a write to it after that is an 'error' event, which without a handler
     ends the whole program (seen 11-06: r1 stopped in CML -> write after end -> the page on 8710 was gone) */
  [ch.stdin, ch.stdout, ch.stderr].forEach(function (p) { if (p) p.on('error', function () {}); });
  ch.on('exit', function (code) { s.kids.delete(ch); if (self.child !== ch) return; self.alive = false; self.host = null; self.code = code; });
  ch.on('error', function (e) { self.alive = false; self.err = e.message; self.noSsh = e.code === 'ENOENT'; s.kids.delete(ch); });
};
SshLine.prototype.login = function () {
  var self = this, s = this.s, where = s.user + '@' + this.ip + ' via ' + this.jump.host;
  this.start();
  return this.waitFor(/(?:^|\n)([A-Za-z0-9._-]+)([>#])\s*$/, 0, 20000).then(function (m) {
    var why = self.err.trim() ? ': ' + self.err.trim().split('\n').pop() : '';
    if (!m) {
      var quiet = !self.buf.trim(); self.stop();
      /* as clab-iosxe-collect.js (v1.1.5, nx_cli_msgs): these two are not "still booting" - say what to fix */
      if (self.noSsh) { var ne = new Error('ssh not found on this machine: install an OpenSSH client (the routers are read over SSH)'); ne.fatal = true; throw ne; }
      if (/Permission denied|Authentication failed/i.test(self.err)) throw new Error('SSH login was denied (' + where + why + '): ' +
        (/@[^ ]*' *\(publickey\)|Permission denied \(publickey\)/i.test(self.err) ? 'the jump host did not take your key - NX_JUMP_USER / NX_JUMP_KEY (on Windows the key file must be readable by you only)' : 'set NX_IOS_USER / NX_IOS_PASSWORD to the routers\' login'));
      /* nx_cml_stopped: the router does not answer at all (stopped in CML, paused, still booting) - not a login problem (seen 11-06 on IOL) */
      if (/timed out|stdio forwarding failed|Connection refused|No route to host|Connection closed by .* port|Connection reset/i.test(self.err))
        throw new Error('the router does not answer over SSH (' + where + why + ') - stopped, or still booting? It is read again when it answers');
      if (quiet) throw new Error('SSH did not log in to ' + where + why + ' - check NX_IOS_USER / NX_IOS_PASSWORD (the jump host: NX_JUMP_USER and its key - NX_JUMP_KEY or your ssh agent; ' +
        'on Windows the key file must be readable by you only), that the router has finished booting, and its "ip ssh" / "line vty" settings');   // a wrong password: ssh prints nothing at LogLevel ERROR
      throw new Error('no IOS prompt over SSH from ' + where + why);
    }
    self.host = m[1];
    if (m[2] === '>') { self.stop(); var pe = new Error('the user ' + s.user + ' logs in at ">" - it needs privilege 15 (username ' + s.user + ' privilege 15 ...)'); pe.fatal = true; throw pe; }
  }).then(function () { return self.cmd('terminal length 0'); }).then(function () { return self.cmd('terminal width 0'); });   // this SSH line only: nothing to put back
};
SshLine.prototype.stop = function () {   /* nx_cml_stopped: safe to call twice, and on an ssh that has already ended */
  var ch = this.child;
  try { if (ch && ch.exitCode == null && ch.stdin && ch.stdin.writable) ch.stdin.end('exit\r'); } catch (e) {}
  try { if (ch && ch.exitCode == null) ch.kill(); } catch (e) {}
  this.alive = false; this.host = null;
};

function Collector(view, labTitle, cfg) {
  this.view = view; this.lab = labTitle; this.cfg = cfg; this.cons = {}; this.last = {}; this.lastAt = {}; this.fail = {}; this.fatal = {}; this.written = '';
}
Collector.prototype.nodes = function () { var v = this.view(); return Object.keys(v.defs).filter(function (n) { return IOS_DEFS.indexOf(v.defs[n]) >= 0; }); };
Collector.prototype.toRead = function () { var f = this.fatal; return this.nodes().filter(function (n) { return !f[n]; }); };
Collector.prototype.readNode = function (n) { return this.cfg.ssh ? this.readNodeSsh(n) : this.readNodeConsole(n); };   /* nx_cml_ssh */
Collector.prototype.readNodeSsh = function (n) {   /* nx_cml_ssh */
  var self = this, R = iosReader(), s = this.cfg.ssh, plan, raw = '';
  return s.plan(n).then(function (p) {
    plan = p;
    if (!plan.ip) { var e = new Error(plan.why); e.nomgmt = true; throw e; }
    return s.jumpHost();
  }).then(function (j) {
    if (!j) { var w = new Error('the jump host has no address yet (no "NX-JUMP ip=" line on the nx-jump console - is it started?)'); w.nomgmt = true; throw w; }
    var line = self.cons[n];
    if (line && (line.ip !== plan.ip || line.jump.host !== j.host || line.jump.user !== j.user)) { line.stop(); line = null; }   // the address moved: a new session
    if (!line) line = self.cons[n] = new SshLine(n, plan.ip, j, s);
    return R.CMDS.reduce(function (acc, cmd) {
      // each piece starts right after the previous prompt: the first one needs the prompt in front, or the splitter cannot name it
      return acc.then(function () { if (!raw) raw = line.host + '#'; return line.cmd(cmd[1]).then(function (t) { raw += t; }); });
    }, (line.alive && line.host) ? Promise.resolve() : line.login()).catch(function (e) { line.stop(); s.failed(); throw e; });
  }).then(function () {
    var v = self.view(), adjStr = (v.adj[n] || []).map(function (a) { return a.iface + ':' + a.peer; }).join(',');
    return { texts: R.splitByPrompt(raw), adjStr: adjStr, mgmtIp: plan.ip };
  });
};
Collector.prototype.readNodeConsole = function (n) {
  var self = this, R = iosReader(), c = this.cons[n] || (this.cons[n] = new Console(n, this.cfg));
  var raw = '';
  /* nx_cml_share: read only a quiet line at the bare prompt; before (re)connecting, the CML console log must end with a prompt */
  var busy = function (why) { var e = new Error(why); e.busy = true; return Promise.reject(e); };
  var quietMs = (this.cfg.quietWait == null ? 60 : this.cfg.quietWait) * 1000;
  if (c.alive && c.host) { var why = c.whyNot(quietMs); if (why) return busy(why); }
  var logOk = (c.alive && c.host) || !this.cfg.consoleLog ? Promise.resolve() : this.cfg.consoleLog(n).then(function (log) {
    var last = String(log || '').replace(/\r/g, '').split('\n').filter(function (l) { return l.trim(); }).pop() || '';
    if (last && !(/^[A-Za-z0-9._-]+[>#]\s*$/.test(last) && last.indexOf('(config') < 0) && !/^Press RETURN/i.test(last) && !/^consoles?>/.test(last)) return busy('the console is in use (its log does not end with a prompt)');
  }, function () { /* the log could not be read: connect as before */ });
  var p = logOk.then(function () { return (c.alive && c.host) ? null : (c.alive ? Promise.resolve(c.stop()) : Promise.resolve()).then(function () { return c.login(self.lab); }); });
  return R.CMDS.reduce(function (acc, cmd) {
    // each piece starts right after the previous prompt: the first one needs the prompt in front, or the splitter cannot name it
    return acc.then(function () { if (!raw) raw = c.host + '#'; return c.cmd(cmd[1]).then(function (t) { raw += t; }); });
  }, p).then(function () {
    var texts = R.splitByPrompt(raw), v = self.view();
    var adjStr = (v.adj[n] || []).map(function (a) { return a.iface + ':' + a.peer; }).join(',');
    return { texts: texts, adjStr: adjStr };
  });
};
/* nx_cml_stopped: one router that does not answer must not hold the others - each read has a limit (SSH: 20 s), after which
   the router is drawn as not answering (grey, its last state marked old) and its line is opened again next round */
Collector.prototype.readCapped = function (n) {
  var self = this, ms = this.cfg.ssh ? (this.cfg.readCapMs || 20000) : 0;
  if (!ms) return this.readNode(n);
  return new Promise(function (res, rej) {
    var done = false, t = setTimeout(function () { if (done) return; done = true; if (self.cons[n]) self.cons[n].stop(); rej(new Error('no answer in ' + Math.round(ms / 1000) + ' s')); }, ms);
    self.readNode(n).then(function (r) { if (done) return; done = true; clearTimeout(t); res(r); }, function (e) { if (done) return; done = true; clearTimeout(t); rej(e); });
  });
};
Collector.prototype.round = function () {
  var self = this, R = iosReader(), nodes = this.nodes(), got = {}, busy = {}, nomgmt = {};
  return Promise.all((this.paused ? [] : this.toRead()).map(function (n) {   /* nx_cml_share: paused = nothing is sent */
    return self.readCapped(n).then(function (r) { got[n] = r; }, function (e) {
      if (e.nomgmt) { nomgmt[n] = true; if ((self.nomgmtMsg || {})[n] !== e.message) { console.log('   ' + n + ': not read - ' + e.message); (self.nomgmtMsg = self.nomgmtMsg || {})[n] = e.message; } return; }   /* nx_cml_ssh: drawn, not read */
      if (e.busy) { busy[n] = e.message; if (self.busyMsg !== n + e.message) { console.log('   ' + n + ': ' + (e.message === 'config mode' ? 'someone is configuring it (config mode) - waiting, nothing is sent' : 'not read now (' + e.message + ') - waiting, nothing is sent')); self.busyMsg = n + e.message; } return; }   /* nx_cml_share: not a failure, keep the line */   /* nx_cml_share2 */
      var msg = e.message;
      if (e.fatal) self.fatal[n] = msg;
      if (!self.fail[n] || self.fail[n].msg !== msg) { console.error('!! ' + n + ': ' + msg); self.fail[n] = { msg: msg, count: 1 }; } else self.fail[n].count++;
      if (self.cons[n]) self.cons[n].stop();
    });
  })).then(function () {
    // one protocol for the lab, as demo.sh picks it: BGP when any router runs it, else OSPF
    var anyBgp = Object.keys(got).some(function (n) { return /BGP router identifier/.test(got[n].texts.bgpSummary || ''); });
    var proto = self.cfg.proto || (anyBgp ? 'bgp' : 'ospf'), states = {};
    nodes.forEach(function (n) {
      if (got[n]) {
        try {
          states[n] = R.run(got[n].texts, n, got[n].adjStr, proto, got[n].mgmtIp || '');   /* nx_cml_ssh: the management port is left out, as in containerlab */
          if (self.nomgmtMsg) delete self.nomgmtMsg[n];
          self.last[n] = states[n]; self.lastAt[n] = new Date().toISOString();
          if (self.fail[n]) { console.error('   ' + n + ': read again' + (self.fail[n].count > 1 ? ' (after ' + self.fail[n].count + ' failures)' : '')); delete self.fail[n]; }
        } catch (e) { console.error('!! ' + n + ': ' + e.message); }
      }
      var _why = self.paused ? 'paused' : (busy[n] ? 'busy' : 'timeout');   /* nx_cml_share */
      if (!states[n] && nomgmt[n]) states[n] = { target_node: n, nx_unread: 'nomgmt', interfaces: {} };   /* nx_cml_ssh: no stale state - it is not read at all */
      if (!states[n]) states[n] = self.last[n] ? Object.assign({}, self.last[n], { nx_unread: _why, nx_stale_since: self.lastAt[n] })
        : { success: _why === 'timeout' ? false : undefined, target_node: n, nx_unread: _why === 'timeout' ? 'error' : _why, interfaces: {} };   /* nx_cml_share2: an IOS node is read - never 'device' */
      if (busy[n] && states[n]) states[n].nx_busy = busy[n];   /* nx_cml_share2: config mode / someone is typing / ... */
      if (self.paused && states[n] && !states[n].nx_unread) states[n] = Object.assign({}, states[n], { nx_unread: 'paused', nx_stale_since: self.lastAt[n] });   /* nx_cml_pause: paused while this round was reading - written as paused, not as read */
    });
    crossNodeHellos(states, self.view().adj, proto);
    self.write(states, proto, nodes);
  });
};
/* nx_cml_lock: the page file - written after every round, and when the places change in CML (posMoved, from the topology read
   every POS_EVERY_S s) so a node moved in CML moves on the graph without waiting for the next round of show commands */
Collector.prototype.write = function (states, proto, nodes) {
  var self = this;
  this.lastW = { states: states, proto: proto, nodes: nodes };
  var _pos = self.view().pos || null;   /* nx_cml_follow */   /* nx_cml_ssh: self (this is not the collector inside the callback) */
  var body = JSON.stringify(states) + (self.paused ? '|p' : '') + JSON.stringify(_pos);
  if (body !== self.written) {
    self.written = body;
    var dest = path.join(path.resolve(self.cfg.out), 'xray-states.js'), tmp = dest + '.tmp';
    fs.writeFileSync(tmp, 'window.LIVE_STATES = ' + JSON.stringify(states) + ';\nwindow.LIVE_WATCH = true;\nwindow.XRAY_CML = ' + JSON.stringify({ paused: !!self.paused, keepColour: !!self.cfg.pauseKeepColour }) + ';\n' +
      (_pos ? 'window.XRAY_POS = ' + JSON.stringify(_pos) + '; window.LIVE_POS = window.XRAY_POS;\n' : '') +
      (self.cfg.problem ? 'window.XRAY_PROBLEM = ' + JSON.stringify(self.cfg.problem) + ';\n' : ''));   /* nx_cml_share */   /* nx_cml_follow */   /* nx_cml_problem: focus + check, as clab-xray-collect.js */
    fs.renameSync(tmp, dest);
    var line = 'state ' + nodes.map(function (n) { var s = states[n]; return n + (s.nx_unread ? '(' + s.nx_unread + ')' : ':' + (s.bgp_neighbors || []).filter(function (b) { return /establ/i.test(b.state); }).length + 'bgp/' + (s.ospf_neighbors || []).filter(function (o) { return o.full; }).length + 'ospf/' + (s.routing_table || []).length + 'rt'); }).join(' ') + ' (' + proto + ')';
    if (line !== self.logged) { self.logged = line; console.log('[' + new Date().toISOString() + '] ' + line); }   // the page file follows every change; the log only when the summary changes
  }
};
/* nx_cml_pause (2026-11-06): Pause / Resume are written to the page at once (not with the next round): paused = each router's last
   state marked paused; resumed = the last states without the mark, until the next round reads again */
Collector.prototype.setPaused = function (on) {
  var self = this; this.paused = !!on;
  if (!this.lastW) return;
  var st = {};
  this.lastW.nodes.forEach(function (n) {
    var s = self.lastW.states[n], base = self.last[n];
    if (on) st[n] = base && (!s || !s.nx_unread || s.nx_unread === 'paused') ? Object.assign({}, base, { nx_unread: 'paused', nx_stale_since: self.lastAt[n] }) : s;
    else st[n] = s && s.nx_unread === 'paused' && base ? base : s;
  });
  crossNodeHellos(st, self.view().adj, this.lastW.proto);
  this.write(st, this.lastW.proto, this.lastW.nodes);
};
Collector.prototype.posMoved = function () { if (this.lastW) this.write(this.lastW.states, this.lastW.proto, this.lastW.nodes); };
Collector.prototype.loop = function () {
  var self = this, t0 = Date.now();
  this.round().catch(function (e) { console.error('!! ' + e.message); }).then(function () {
    setTimeout(function () { self.loop(); }, Math.max(1000, self.cfg.interval * 1000 - (Date.now() - t0)));
  });
};
Collector.prototype.stop = function () { var c = this.cons; Object.keys(c).forEach(function (n) { c[n].stop(); });
  if (this.cfg.ssh) this.cfg.ssh.kids.forEach(function (ch) { try { ch.kill(); } catch (e) {} });   /* nx_cml_ssh */ };
/* same as clab-xray-collect.js: a peer "sends Hello" when ITS facing interface runs OSPF (its iface_hellos), whatever the neighbor
   state - so "Hellos flow but the adjacency is stuck" is visible */
function crossNodeHellos(states, adj, proto) {
  if (proto === 'bgp') return;
  Object.keys(states).forEach(function (cn) {
    var st = states[cn]; if (!st || st.nx_unread) return;
    var psm = st.peer_sending_hellos || (st.peer_sending_hellos = {});
    (adj[cn] || []).forEach(function (link) {
      var ps = states[link.peer];
      psm[link.peer] = !!(ps && !ps.nx_unread && ps.iface_hellos && ps.iface_hellos[link.peerIface]);
      var h = ps && ps.iface_hellos && ps.iface_hellos[link.peerIface];
      if (h > 0) (st.peer_hellos || (st.peer_hellos = {}))[link.peer] = h;
    });
    st.peer_sending_hello = Object.keys(psm).some(function (k) { return psm[k]; });
  });
}

// ---- self-test (offline) ---------------------------------------------------------------------------------------------
function selfTest() {
  var ok = 0, bad = 0, A = function (c, m) { if (c) ok++; else { bad++; console.error('FAIL ' + m); } };
  var nd = function (id, label, def, x, ifs) { return { id: id, label: label, node_definition: def, x: x, y: 0, interfaces: ifs.map(function (f) { return { id: id + f, label: f }; }) }; };
  var topo = { nodes: [nd('b', 'r2', 'iol-xe', 200, ['Ethernet0/1']), nd('a', 'r1', 'iol-xe', 100, ['Ethernet0/1', 'Ethernet0/2']), nd('c', 'r3', 'iol-xe', 300, ['Ethernet0/1']), nd('d', 'bad name', 'iol-xe', 400, ['Ethernet0/1'])],
    links: [{ interface_a: 'aEthernet0/1', interface_b: 'bEthernet0/1' }, { i1: 'aEthernet0/2', i2: 'cEthernet0/1' }, { interface_a: 'aEthernet0/2', interface_b: 'dEthernet0/1' }] };
  var t = toClabData(topo);
  A(t.data.nodes.map(function (n) { return n.name; }).join(',') === 'r1,r2,r3', 'nodes left -> right by x, an unsafe name left out: ' + t.data.nodes.map(function (n) { return n.name; }));
  A(t.data.nodes[0].kind === 'cisco_iol' && !('group' in t.data.nodes[0]), 'iol-xe -> cisco_iol (no group)');
  A(toClabData({ nodes: [nd('h', 'pc1', 'alpine', 0, ['eth0'])], links: [] }).data.nodes[0].group === 'server', 'a CML host node gets the server icon');
  A(t.data.links.length === 2 && t.data.links[0].source_endpoint === 'Ethernet0/1' && t.data.links[1].target === 'r3', 'links from interface_a/b (API) and i1/i2 (YAML): ' + JSON.stringify(t.data.links));
  A(JSON.stringify(t.adj.r1) === JSON.stringify([{ iface: 'Ethernet0/1', peer: 'r2', peerIface: 'Ethernet0/1' }, { iface: 'Ethernet0/2', peer: 'r3', peerIface: 'Ethernet0/1' }]), 'adjacency with the peer interface');
  A(t.skipped.length === 1 && /bad name/.test(t.skipped[0]), 'the unsafe node is reported: ' + t.skipped);
  var html = renderPage('lab <x>', t.data);
  A(html.indexOf('{{ .Data }}') < 0 && html.indexOf('"source_endpoint":"Ethernet0/1"') > 0, 'the topology is in the page');
  A(html.indexOf('lab &lt;x&gt;') > 0 && html.indexOf('lab <x>') < 0, 'the lab title is escaped');
  A(html.indexOf('(Cisco CML2 × X-Ray DeepDive)') > 0 && html.indexOf('CML2 Lab') > 0 && html.indexOf('ContainerLab Topology') < 0, 'CML wording on the page');
  /* nx_cml_xy */
  var tri = toClabData({ nodes: [nd('a', 'r1', 'iol-xe', 0, []), nd('b', 'r2', 'iol-xe', -200, []), nd('c', 'r3', 'iol-xe', 200, [])].map(function (n, i) { n.y = [-150, 100, 100][i]; return n; }), links: [] }).pos;
  A(tri && tri.r1.y < tri.r2.y && tri.r2.y === tri.r3.y && tri.r2.x < tri.r1.x && tri.r1.x < tri.r3.x, 'xy: CML q21 (r1 top, r2 / r3 below left / right) keeps its shape, y down: ' + JSON.stringify(tri));
  A(tri && Object.keys(tri).every(function (k) { return tri[k].x >= 0 && tri[k].x <= 560 && tri[k].y >= 0 && tri[k].y <= 360; }), 'xy: inside the page box');
  var part = toClabData({ nodes: [nd('a', 'r1', 'iol-xe', 0, []), nd('b', 'r2', 'iol-xe', 100, [])].map(function (n, i) { if (i) n.y = null; return n; }), links: [] }).pos;
  A(part === null, 'xy: a node without a place -> no places (the page lays out as before)');
  A(toClabData({ nodes: [{ id: 'a', label: 'r1', node_definition: 'iol-xe', interfaces: [] }, { id: 'b', label: 'r2', node_definition: 'iol-xe', interfaces: [] }], links: [] }).pos === null, 'xy: no x / y at all -> none');
  var row = toClabData({ nodes: [nd('a', 'r1', 'iol-xe', -300, []), nd('b', 'r2', 'iol-xe', 300, [])], links: [] }).pos;
  A(row && row.r1.y === row.r2.y && row.r1.x < row.r2.x, 'xy: one row (all y equal) -> scaled by x only: ' + JSON.stringify(row));
  A(renderPage('lab', { nodes: [], links: [] }, tri).indexOf('window.XRAY_POS = ') > 0 && renderPage('lab', { nodes: [], links: [] }, null).indexOf('window.XRAY_POS = ') < 0, 'xy: the page gets XRAY_POS only when there are places');
  /* nx_cml_share */
  var C0 = new Console('r1', {}); C0.host = 'r1'; C0.buf = 'x\nr1#'; C0.lastForeign = 0;
  A(C0.whyNot(60000, 1e13) === '', 'share: quiet line at the bare prompt -> read');
  C0.buf = 'x\nr1(config)#'; A(C0.whyNot(60000, 1e13) === 'config mode', 'share: config mode -> skip');
  C0.buf = 'x\nr1(config-route-map)#'; A(C0.whyNot(60000, 1e13) === 'config mode', 'share2: any config sub-mode -> config mode');
  C0.buf = 'x\nr1#conf'; A(C0.whyNot(60000, 1e13) === 'someone is typing', 'share: half-typed line -> skip');
  C0.buf = 'x\n --More-- '; A(C0.whyNot(60000, 1e13) === 'paged output', 'share: --More-- -> skip');
  C0.buf = 'x\nr1>'; A(C0.whyNot(60000, 1e13) === 'not in enable mode', 'share: user mode (someone left enable) -> skip');
  C0.buf = 'x\nr1#'; C0.lastForeign = 1e13 - 30000; A(C0.whyNot(60000, 1e13) === 'in use', 'share: someone typed 30 s ago -> wait');
  A(!foreignChunk('*Nov  2 02:41:07.123: %OSPF-5-ADJCHG: Process 1, Nbr 2.2.2.2 on Ethernet0/1 from LOADING to FULL\n') && foreignChunk('conf t\n') && foreignChunk('r1(config)#'), 'share: router log lines are not a person, typing is');
  /* nx_cml_sync */
  var rt = toClabData({ nodes: [nd('a', 'r1', 'iol-xe', 0, []), nd('b', 'r2', 'iol-xe', -200, []), nd('c', 'r3', 'iol-xe', 200, [])].map(function (n, i) { n.y = [-150, 100, 100][i]; return n; }), links: [] }).pos;
  A(['r1', 'r2', 'r3'].every(function (k, i) { var c = toCanvas(rt._map, rt[k].x, rt[k].y); return c.x === [0, -200, 200][i] && c.y === [-150, 100, 100][i]; }), 'sync: page place -> CML canvas gives the same x / y back (no drift)');
  var mv = toCanvas(rt._map, rt.r2.x + 48, rt.r2.y - 24);
  A(mv.x === -200 + Math.round(48 / rt._map.sc) && mv.y === 100 - Math.round(24 / rt._map.sc), 'sync: a drag is scaled back to the canvas: ' + JSON.stringify(mv));
  var R = iosReader();
  A(typeof R.run === 'function' && typeof R.splitByPrompt === 'function' && R.CMDS.length >= 7, 'the IOS reader is usable from here');
  var sp = R.splitByPrompt('r1#show ip route\nCodes: L - local\nr1#show ip bgp summary\n%BGP-5-ADJCHANGE: neighbor 10.0.0.2 Up\nBGP router identifier 1.1.1.1, local AS number 65001\nr1#');
  A(/Codes/.test(sp.route) && /router identifier/.test(sp.bgpSummary) && sp.__syslog === 1, 'console text split by prompt, syslog line counted');
  /* nx_cml_ssh */
  var ml = { nodes: [nd('j', 'nx-jump', 'alpine', 0, ['eth0', 'eth1']), nd('s', 'nx-mgmt', 'unmanaged_switch', 0, ['port0', 'port1', 'port2', 'port3']), nd('x', 'ext', 'external_connector', 0, ['port']),
      nd('a', 'r1', 'iol-xe', 100, ['Ethernet0/0', 'Ethernet0/1']), nd('b', 'r2', 'iol-xe', 200, ['Ethernet0/0', 'Ethernet0/1']), nd('h', 'sw9', 'unmanaged_switch', 300, ['port0'])],
    links: [{ interface_a: 'jeth0', interface_b: 'xport' }, { interface_a: 'jeth1', interface_b: 'sport0' }, { interface_a: 'aEthernet0/0', interface_b: 'sport1' },
      { interface_a: 'bEthernet0/0', interface_b: 'sport2' }, { interface_a: 'aEthernet0/1', interface_b: 'bEthernet0/1' }, { interface_a: 'hport0', interface_b: 'sport3' }] };
  ml.nodes[3].configuration = 'hostname r1\n!\ninterface Ethernet0/0\n vrf forwarding MGMT\n ip address 192.168.255.11 255.255.255.0\n!\ninterface Ethernet0/1\n ip address 10.0.0.1 255.255.255.252\n';
  var mt = toClabData(ml);
  A(mt.data.nodes.map(function (n) { return n.name; }).join(',') === 'r1,r2,sw9', 'ssh: the jump host, its switch and its External Connector are not drawn (another switch is): ' + mt.data.nodes.map(function (n) { return n.name; }));
  A(mt.data.links.length === 1 && mt.data.links[0].source_endpoint === 'Ethernet0/1' && JSON.stringify(mt.adj.r1) === JSON.stringify([{ iface: 'Ethernet0/1', peer: 'r2', peerIface: 'Ethernet0/1' }]), 'ssh: the management links are not drawn and not in the adjacency');
  A(mt.mgmt.jump === 'nx-jump' && mt.mgmt.ifs.r1 === 'Ethernet0/0' && mt.mgmt.ifs.r2 === 'Ethernet0/0' && !mt.mgmt.ifs.sw9, 'ssh: each router\'s management port = its port on the nx-jump switch: ' + JSON.stringify(mt.mgmt.ifs));
  A(mt.cfgs.r1 && mt.cfgs.r2 === undefined, 'ssh: the configuration comes with the topology when CML gives it');
  A(toClabData({ nodes: [nd('a', 'r1', 'iol-xe', 100, ['Ethernet0/0'])], links: [] }).mgmt.jump === null, 'ssh: a lab without nx-jump has no management network');
  A(mgmtAddress(mt.cfgs.r1, 'Ethernet0/0') === '192.168.255.11' && mgmtAddress(mt.cfgs.r1, 'Ethernet0/1') === '10.0.0.1' && mgmtAddress(mt.cfgs.r1, 'Ethernet0/2') === '', 'ssh: the address of one port from the configuration');
  A(mgmtAddress('interface Ethernet0/0\r\n ip address dhcp\r\n', 'Ethernet0/0') === '', 'ssh: a DHCP port has no address to use');
  A(mgmtVrfAddress(mt.cfgs.r1) === '192.168.255.11' && mgmtVrfAddress('interface Ethernet0/1\n ip address 10.0.0.1 255.255.255.0\n') === '', 'ssh: --jump labs: the address of the port in a management VRF');
  A(configText([{ name: 'ios_config.txt', content: 'hostname r1' }]) === 'hostname r1' && configText(null) === '', 'ssh: a configuration given as files (CML 2.7+)');
  var sa = sshArgs('192.168.255.11', { user: 'nx', host: '192.0.2.50' }, { user: 'admin' }), px = sa.filter(function (x) { return /^ProxyCommand=/.test(x); })[0] || '';
  A(sa[sa.length - 1] === 'admin@192.168.255.11' && /-W %h:%p nx@192\.0\.2\.50$/.test(px) && sa.indexOf('-tt') === 0 && !sa.some(function (x) { return /password/i.test(x) && !/Authentication/.test(x); }), 'ssh: through the jump host, no password on the command line: ' + px);
  var ak = sshAskpass(), askp = function (prompt) {
    var w = process.platform === 'win32', r = cp.spawnSync(w ? 'cmd.exe' : ak.file, w ? ['/d', '/c', ak.file, prompt] : [prompt], { encoding: 'utf8', env: Object.assign({}, process.env, { NX_IOS_PASSWORD: 'rpw' }) });
    return String(r.stdout || '').trim();
  };
  A(askp("admin@192.168.255.11's password: ") === 'rpw', 'ssh: the askpass answers the router password');
  A(/BatchMode=yes/.test(px) && /PasswordAuthentication=no/.test(px), 'ssh: the jump host is reached with a key only (no password prompt): ' + px);
  var pka = sshArgs('10.0.0.1', { user: 'nx', host: 'j', key: 'C:\\Users\\a b\\id_ed25519' }, { user: 'admin', known: 'C:\\Temp\\cml-xray-1\\known_hosts' });
  var pk = pka.filter(function (x) { return /^ProxyCommand=/.test(x); })[0] || '';
  A(pk.indexOf('IdentitiesOnly=yes -i "C:/Users/a b/id_ed25519" -W') > 0, 'ssh: NX_JUMP_KEY is used (quoted, forward slashes - ssh reads a backslash as an escape): ' + pk);
  A(pka.indexOf('UserKnownHostsFile=C:/Temp/cml-xray-1/known_hosts') > 0 && pk.indexOf('UserKnownHostsFile="C:/Temp/cml-xray-1/known_hosts"') > 0, 'ssh: the host keys go to the run\'s own file (both hops)');
  var ak2 = sshAskpass(); fs.writeFileSync(ak2.known, 'x'); ak2.cleanup(); A(!fs.existsSync(ak2.known) && !fs.existsSync(path.dirname(ak2.known)), 'ssh: the known_hosts file and its folder are removed with the helper');
  ak.cleanup(); A(!fs.existsSync(ak.file), 'ssh: the askpass helper is removed');
  var fakeApi = function (log, cfg) { return { get: function (p) { return /consoles/.test(p) ? Promise.resolve(log) : (/\/config$/.test(p) ? Promise.resolve(cfg) : Promise.reject(new Error('x'))); } }; };
  var mv2 = { mgmt: mt.mgmt, cfgs: { r1: mt.cfgs.r1 }, ids: { r1: 'a', r2: 'b' }, adj: mt.adj, defs: { r1: 'iol-xe', r2: 'iol-xe' } };
  var pl = sshPlanner(fakeApi('boot\nNX-JUMP ip=192.0.2.49\n...\nNX-JUMP ip=192.0.2.50\nlogin:', 'interface Ethernet0/0\n vrf forwarding MGMT\n ip address 192.168.255.12 255.255.255.0\n'), { id: 'L' }, function () { return mv2; }, {});
  var noJ = sshPlanner(fakeApi('', ''), { id: 'L' }, function () { return { mgmt: { jump: null, ifs: {} }, cfgs: {}, ids: {} }; }, {});
  var hand = sshPlanner(fakeApi('', ''), { id: 'L' }, function () { return { mgmt: { jump: null, ifs: {} }, cfgs: {}, ids: {} }; }, { mgmt: 'r1=10.9.9.1', jump: 'me@192.0.2.7' });
  A(sshPlanner(fakeApi('', ''), { id: 'L' }, function () { return mv2; }, { jump: '-oProxyCommand=x' }) === null && sshPlanner(fakeApi('', ''), { id: 'L' }, function () { return mv2; }, { mgmt: 'r1=-x' }) === null, 'ssh: --jump / --mgmt that ssh could read as an option are refused');
  var asyncTests = Promise.all([pl.plan('r1'), pl.plan('r2'), pl.jumpHost(), pl.jumpHost(), noJ.plan('r1'), hand.plan('r1'), hand.jumpHost(), hand.plan('r2')]).then(function (r) {
    A(r[0].ip === '192.168.255.11' && r[1].ip === '192.168.255.12', 'ssh: the addresses from the topology, else GET .../config: ' + JSON.stringify(r.slice(0, 2)));
    A(r[2] && r[2].host === '192.0.2.50' && r[2].user === 'nx' && r[3] === r[2], 'ssh: the jump host = the last NX-JUMP line of its console log, looked up once for the round: ' + JSON.stringify(r[2] && r[2].host));
    A(!r[4].ip && /no management network/.test(r[4].why), 'ssh: no nx-jump and no --jump -> not read, with why: ' + r[4].why);
    A(r[5].ip === '10.9.9.1' && r[6].host === '192.0.2.7' && r[6].user === 'me' && !r[7].ip, 'ssh: --mgmt / --jump by hand');
    var cv = { mgmt: { jump: null, ifs: {} }, cfgs: {}, ids: {}, adj: {}, defs: { r1: 'iol-xe' } };
    var outDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cml-xray-t-')), col = new Collector(function () { return cv; }, 'L', { ssh: noJ, out: outDir, interval: 10, problem: { focus: { node: 'r1' }, check: { all: [] }, format: 'network-xray-lab/0' } });
    var _log = console.log; console.log = function () {};
    return col.round().then(function () {
      console.log = _log;
      var txt = fs.readFileSync(path.join(outDir, 'xray-states.js'), 'utf8'), st = JSON.parse(/LIVE_STATES = (.*);\n/.exec(txt)[1]);
      var xp = /XRAY_PROBLEM = (.*);\n/.exec(txt);
      A(xp && JSON.parse(xp[1]).focus.node === 'r1' && JSON.parse(xp[1]).format === 'network-xray-lab/0', 'problem: focus + check go into xray-states.js (window.XRAY_PROBLEM)');
      A(st.r1 && st.r1.nx_unread === 'nomgmt' && st.r1.success === undefined, 'ssh: a router without a management network is on the page as "not read" (nomgmt), not as failed');
      try { fs.rmSync(outDir, { recursive: true, force: true }); } catch (e) {}
    }, function (e) { console.log = _log; A(false, 'ssh: round ' + e.message); });
  });
  A(SSH_SPAWN.windowsHide === true && SSH_SPAWN.detached === false, 'ssh: started hidden and not detached (Windows: no console window per router, for the ProxyCommand hop too)');
  (function () {   // nx_cml_problem: --problem / <lab title>.problem.json
    var d = fs.mkdtempSync(path.join(os.tmpdir(), 'cml-xray-p-')), keep = process.cwd(), _e = console.error; console.error = function () {};
    try {
      fs.writeFileSync(path.join(d, 'p.json'), '\uFEFF' + JSON.stringify({ format: 'network-xray-lab/0', title_en: 'T', focus: { node: 'r1' }, check: { all: [] }, check_note_en: 'x' }));
      var p = loadProblem(path.join(d, 'p.json'), 'L');
      A(p && p.check && p.xp.focus.node === 'r1' && p.xp.format === 'network-xray-lab/0' && !('check_note_en' in p.xp) && /title_en/.test(p.text), 'problem: --problem file read (BOM ok) - band text served as is, focus + check + format for the states');
      fs.writeFileSync(path.join(d, 'bad.json'), '{');
      A(loadProblem(path.join(d, 'bad.json'), 'L') === null, 'problem: a broken file -> no band (said once), not a crash');
      process.chdir(d);
      A(loadProblem(null, 'rcl-q9') === null, 'problem: no --problem and no <title>.problem.json -> nothing');
      fs.writeFileSync(path.join(d, 'rcl-q9.problem.json'), JSON.stringify({ title_en: 'T9' }));
      var a = loadProblem(null, 'rcl-q9');
      A(a && !a.check && a.xp === null && /T9/.test(a.text), 'problem: <lab title>.problem.json in the current folder is found; no check -> the band only');
    } finally { process.chdir(keep); console.error = _e; try { fs.rmSync(d, { recursive: true, force: true }); } catch (e) {} }
  })();
  var pgL = renderPage('lab', { nodes: [], links: [] }, null);
  A(pgL.indexOf('nodeDraggable(false)') > 0 && pgL.indexOf("be moved here. Move a node in CML") > 0 && /約 \d+ 秒/.test(pgL), 'lock: a CML page cannot drag nodes, and says so (EN / JA, with the seconds)');
  A(pgL.indexOf('["h-btn","v-btn"]') > 0 && pgL.indexOf('.ov-bar') > 0, 'lock: the Horizontal / Vertical buttons are hidden; the line sits in the graph\'s top bar');
  renderPage.pauseBar = true; renderPage.pauseVia = 'ssh'; var pgP = renderPage('lab', { nodes: [], links: [] }, null); renderPage.pauseBar = false;
  A(/ルータを読んでいます \(SSH\)/.test(pgP) && pgP.indexOf('nx-cml-paused') > 0 && /⏸ 一時停止中/.test(pgP) && pgP.indexOf('Reading from the CML consoles') < 0, 'pause: SSH words, and a big "Paused" over the graph');
  (function () {   // nx_cml_pause: Pause / Resume reach the page file at once
    var od = fs.mkdtempSync(path.join(os.tmpdir(), 'cml-xray-pz-')), v = { pos: null, adj: {} }, _l = console.log; console.log = function () {};
    var c = new Collector(function () { return v; }, 'L', { out: od, pauseKeepColour: true });
    var rd = function () { var x = fs.readFileSync(path.join(od, 'xray-states.js'), 'utf8'); return { st: JSON.parse(/LIVE_STATES = (.*);\n/.exec(x)[1]), cml: JSON.parse(/XRAY_CML = (.*);\n/.exec(x)[1]) }; };
    try {
      c.last.r1 = { target_node: 'r1', routing_table: [] }; c.lastAt.r1 = '2026-11-06T07:00:00.000Z';
      c.write({ r1: c.last.r1, r2: { target_node: 'r2', nx_unread: 'nomgmt' } }, 'ospf', ['r1', 'r2']);
      c.setPaused(true); var a = rd();
      A(a.cml.paused === true && a.cml.keepColour === true && a.st.r1.nx_unread === 'paused' && a.st.r1.nx_stale_since === '2026-11-06T07:00:00.000Z' && a.st.r2.nx_unread === 'nomgmt', 'pause: written at once - paused mark with the time; a not-read router stays not read');
      c.setPaused(false); var b = rd();
      A(b.cml.paused === false && !b.st.r1.nx_unread && b.st.r2.nx_unread === 'nomgmt', 'pause: resume written at once - the mark goes');
    } finally { console.log = _l; try { fs.rmSync(od, { recursive: true, force: true }); } catch (e) {} }
  })();
  renderPage.syncLayout = true; var pgS = renderPage('lab', { nodes: [], links: [] }, null); renderPage.syncLayout = false;
  A(pgS.indexOf('nodeDraggable(false)') < 0, 'lock: --sync-layout keeps dragging (it writes the place to CML)');
  (function () {   // nx_cml_lock: a node moved in CML -> the page file at once, without a round
    var od = fs.mkdtempSync(path.join(os.tmpdir(), 'cml-xray-w-')), v = { pos: { r1: { x: 0, y: 0 } }, adj: {} }, _l = console.log; console.log = function () {};
    var c = new Collector(function () { return v; }, 'L', { out: od });
    try {
      c.posMoved();
      A(!fs.existsSync(path.join(od, 'xray-states.js')), 'lock: nothing written before the first round');
      c.write({ r1: { target_node: 'r1' } }, 'ospf', ['r1']);
      v = { pos: { r1: { x: 120, y: 40 } }, adj: {} }; c.posMoved();
      A(/"x":120/.test(fs.readFileSync(path.join(od, 'xray-states.js'), 'utf8')), 'lock: a place changed in CML is written at once (no wait for the next round)');
    } finally { console.log = _l; try { fs.rmSync(od, { recursive: true, force: true }); } catch (e) {} }
  })();
  var so = sshOpts('k', false).join(' ');
  A(/ServerAliveInterval=5/.test(so) && /ServerAliveCountMax=2/.test(so), 'ssh: keepalive - a stopped router ends its ssh in about 10 s');
  asyncTests = asyncTests.then(function () {   // nx_cml_stopped: stop on an ssh that has ended, twice -> nothing thrown, no 'error' event that ends the program
    var ln = new SshLine('r1', '10.0.0.1', { user: 'nx', host: 'j' }, { kids: new Set() });
    var ch = ln.child = cp.spawn(process.execPath, ['-e', ''], { stdio: ['pipe', 'pipe', 'pipe'] });
    [ch.stdin, ch.stdout, ch.stderr].forEach(function (p) { p.on('error', function () {}); });
    return new Promise(function (res) { ch.on('exit', function () { setTimeout(res, 50); }); }).then(function () {
      var threw = false; try { ln.stop(); ln.stop(); } catch (e) { threw = true; }
      return new Promise(function (res) { setTimeout(res, 200); }).then(function () { A(!threw && !ln.alive, 'ssh: stop on an ended ssh, twice - safe'); });
    });
  });
  asyncTests = asyncTests.then(function () {   // nx_cml_stopped: a router that never answers is given up after the limit; the others are not held
    var c = new Collector(function () { return { adj: {} }; }, 'lab', { ssh: true, readCapMs: 300 }), stopped = 0, t0 = Date.now();
    c.cons.r1 = { stop: function () { stopped++; } };
    c.readNode = function (n) { return n === 'r1' ? new Promise(function () {}) : Promise.resolve({ texts: {}, adjStr: '' }); };
    var r2 = c.readCapped('r2');
    return c.readCapped('r1').then(function () { A(false, 'ssh: a router that never answers -> an error'); }, function (e) {
      A(/no answer in/.test(e.message) && stopped === 1 && Date.now() - t0 < 2000, 'ssh: a router that never answers -> "' + e.message + '" and its line closed');
      return r2.then(function (r) { A(r && r.adjStr === '', 'ssh: the other router is read meanwhile'); });
    });
  });
  var pg = renderPage('lab', { nodes: [], links: [] }, null);
  A(pg.indexOf('SYNTHETIC_BADGE') > 0 && pg.indexOf('cml-xray has not read this node (yet)') > 0 && pg.indexOf('./xray.sh') < pg.indexOf('SYNTHETIC_BADGE'), 'ssh: the "Sample view" badge says what cml-xray does, not ./xray.sh');
  asyncTests = asyncTests.then(function () {   // no ssh on this machine -> a fatal "install an OpenSSH client", not "still booting"
    var keep = process.env.PATH, ln = new SshLine('r1', '10.0.0.1', { user: 'nx', host: 'j' }, { user: 'admin', pass: 'x', askpass: 'none', kids: new Set() });
    process.env.PATH = path.join(os.tmpdir(), 'cml-xray-no-such-dir');
    var p = ln.login(); process.env.PATH = keep;
    return p.then(function () { A(false, 'ssh: no ssh -> an error'); }, function (e) { A(e.fatal && /ssh not found on this machine: install an OpenSSH client/.test(e.message), 'ssh: no ssh -> ' + e.message); });
  });
  asyncTests.then(function () {
    console.log('cml-xray self-test: ' + ok + ' ok, ' + bad + ' failed');
    process.exit(bad ? 1 : 0);
  });
}

// ---- main ------------------------------------------------------------------------------------------------------------
if (require.main === module && argv.indexOf('--self-test') >= 0) selfTest();
else if (require.main === module) {
  var host = process.env.CML_HOST, user = process.env.CML_USER, pass = process.env.CML_PASSWORD;
  if (!host || !user || !pass) { console.error('!! set CML_HOST, CML_USER and CML_PASSWORD in the environment (the password is never taken from the command line)'); process.exit(2); }
  if (!opt.lab && !opt.labId) { console.error('!! --lab "<the CML lab title>" is required'); usage(2); }
  var ca = null;
  if (process.env.CML_CA_FILE) { try { ca = fs.readFileSync(process.env.CML_CA_FILE); } catch (e) { console.error('!! CML_CA_FILE: ' + e.message); process.exit(2); } }
  var api = apiClient(host, user, pass, ca, opt.insecure);
  var view = null, lab = null, onPos = null;
  var refresh = function () {
    return api.get('/labs/' + encodeURIComponent(lab.id) + '/topology').then(function (topo) {
      var t = toClabData(topo), sk = t.skipped.join(', ');
      if (sk && (!view || view.skippedMsg !== sk)) console.error('!! left out (the name is not a plain name): ' + sk);
      if (onPos && view && JSON.stringify(view.pos) !== JSON.stringify(t.pos)) setTimeout(onPos, 0);   /* nx_cml_lock */
      view = { name: lab.title, data: t.data, adj: t.adj, defs: t.defs, ids: t.ids, pos: t.pos, skippedMsg: sk, mgmt: t.mgmt, cfgs: t.cfgs };   /* nx_cml_xy */   /* nx_cml_share: ids */   /* nx_cml_ssh: mgmt, cfgs */
      return view;
    });
  };
  findLab(api, opt.lab, opt.labId).then(function (l) { lab = l; return refresh(); }).then(function (v) {
    var ios = Object.keys(v.defs).filter(function (n) { return IOS_DEFS.indexOf(v.defs[n]) >= 0; });
    console.log('lab ' + JSON.stringify(lab.title) + ' (' + lab.id + '): ' + v.data.nodes.length + ' nodes, ' + v.data.links.length + ' links; IOS nodes: ' + (ios.join(', ') || 'none'));
    if (opt.once) { console.log(JSON.stringify({ data: v.data, adjacency: v.adj }, null, 1)); return; }
    fs.mkdirSync(path.resolve(opt.out), { recursive: true });
    try { fs.unlinkSync(path.join(path.resolve(opt.out), 'xray-states.js')); } catch (e) {}   // no state from an earlier run on the page
    var prob = loadProblem(opt.problem, lab.title);   /* nx_cml_problem */
    if (prob) { serve.problem = prob.text; console.log('problem: ' + prob.file + (prob.check ? ' (the band + "Solved" when its check passes)' : ' (the band; no check in it)')); }
    serve(function () { return view; });
    setInterval(function () { refresh().catch(function (e) { console.error('!! topology: ' + e.message); }); }, POS_EVERY_S * 1000);   // nx_cml_follow: CML's layout within seconds (nodes / links added: on the next page load)
    if (opt.noState || !ios.length) return;
    if (opt.proto && !/^(ospf|bgp)$/.test(opt.proto)) { console.error('!! --proto ospf or bgp'); process.exit(2); }
    var ap, cfgC = { proto: opt.proto, interval: opt.interval, out: opt.out, problem: prob ? prob.xp : null, pauseKeepColour: opt.pauseColour === 'keep' };
    if (!opt.console) {   /* nx_cml_ssh: the default - SSH on the management network; the consoles are left alone */
      var s = sshPlanner(api, lab, function () { return view; }, opt);
      if (!s) process.exit(2);
      ap = sshAskpass(); s.askpass = ap.file; s.known = ap.known; cfgC.ssh = s;
    } else {
      if (!SAFE_NAME.test(lab.title)) console.error('!! the lab title ' + JSON.stringify(lab.title) + ' has characters other than letters, digits, _ . - : the console server may not open it - rename the lab');
      if (opt.enableEnv && !process.env[opt.enableEnv]) { console.error('!! --enable-env ' + opt.enableEnv + ': that variable is not set'); process.exit(2); }
      console.log('!! --console: the show commands are typed on the CML consoles - you will see them there. Use the Pause button while you work on a console.');   /* nx_cml_ssh */
      ap = makeAskpass('CML_PASSWORD');
      Object.assign(cfgC, { host: host, user: user, askpass: ap.file, insecure: opt.insecure, enablePassword: opt.enableEnv ? process.env[opt.enableEnv] : null,
        quietWait: opt.quietWait, consoleLog: function (n) { var id = view.ids && view.ids[n]; return id ? api.get('/labs/' + encodeURIComponent(lab.id) + '/nodes/' + encodeURIComponent(id) + '/consoles/0/log?lines=5') : Promise.reject(new Error('no id')); } });   /* nx_cml_share */
    }
    var col = new Collector(function () { return view; }, lab.title, cfgC);
    onPos = function () { col.posMoved(); };   /* nx_cml_lock */
    if (cfgC.ssh) ios.forEach(function (n) { cfgC.ssh.plan(n).then(function (p) { if (p.ip) console.log('   ' + n + ': SSH ' + cfgC.ssh.user + '@' + p.ip + (opt.jump ? ' via ' + opt.jump : ' via nx-jump')); }); });   /* nx_cml_ssh: the not-read ones are said by the first round */
    if (/^(127\.|::1$|localhost$)/.test(opt.listen)) { serve.control = function (on) { col.setPaused(on); console.log(on ? 'paused: nothing is sent to the routers' : 'resumed'); };   /* nx_cml_pause: written at once */ renderPage.pauseBar = true; renderPage.pauseVia = opt.console ? 'console' : 'ssh'; }   /* nx_cml_share: local page only */
    if (opt.syncLayout && /^(127\.|::1$|localhost$)/.test(opt.listen)) {   /* nx_cml_sync: write back a moved node's x / y (local page only) */
      renderPage.syncLayout = true;
      serve.place = function (j) {
        var v = view, id = v && v.ids && v.ids[j && j.node], map = v && v.pos && v.pos._map;
        if (!id || !map || !isFinite(j.x) || !isFinite(j.y)) return Promise.reject(new Error('unknown node or no layout'));
        var c = toCanvas(map, +j.x, +j.y);
        return api.patch('/labs/' + encodeURIComponent(lab.id) + '/nodes/' + encodeURIComponent(id), { x: c.x, y: c.y }).then(function () {
          console.log('layout: ' + j.node + ' -> CML x ' + c.x + ', y ' + c.y); return refresh().then(function () { return { node: j.node, x: c.x, y: c.y }; }); });
      };
      console.log('--sync-layout: moving a node on the graph writes its x / y to the CML lab (nothing else)');
    } else if (opt.syncLayout) console.error('!! --sync-layout works only when the page is served to this PC (--listen 127.0.0.1)');
    /* nx_cml_stop: every way of ending stops the ssh children, removes the askpass helper and exits (a second Ctrl+C: at once) */
    var stopping = false;
    var bye = function () {
      if (stopping) { process.exit(1); }
      stopping = true; console.log(opt.console ? 'stopping (closing the CML consoles)...' : 'stopping...');
      try { col.stop(); } catch (e) {}
      ap.cleanup();
      setTimeout(function () { process.exit(0); }, 300);   // let the ssh children go first
    };
    ['SIGINT', 'SIGTERM', 'SIGBREAK', 'SIGHUP'].forEach(function (sig) { try { process.on(sig, bye); } catch (e) {} });
    if (process.stdin.isTTY) { process.stdin.on('data', function (d) { if (String(d).indexOf('\u0003') >= 0) bye(); }); process.stdin.resume(); }   // raw-mode Ctrl+C
    process.on('exit', function () { ap.cleanup(); });   // also when the process is ended another way (the helper holds no secret, but it is not left behind)
    console.log('reading ' + ios.join(', ') + (opt.console ? ' over the CML console' : ' over SSH on the management network') + ' every ' + opt.interval + ' s (show commands only)');
    col.loop();
  }).catch(function (e) { console.error('!! ' + e.message); process.exit(1); });
}

module.exports = { KIND: KIND, IOS_DEFS: IOS_DEFS, toClabData: toClabData, renderPage: renderPage,
  SshLine: SshLine, sshAskpass: sshAskpass, sshPlanner: sshPlanner, mgmtAddress: mgmtAddress, loadProblem: loadProblem };   /* nx_cml_ssh */   /* nx_cml_problem */
