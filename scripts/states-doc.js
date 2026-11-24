/* states-doc.js - xray-states.json (schema 1): the states the page reads, as plain JSON, for other tools (a Grafana Infinity
   data source, a script), with the answers X-Ray gives: why each route was chosen and what is wrong on each adjacency.
   Used by clab-xray-collect.js (containerlab) and cml-xray.js (Cisco CML2), so both write the same document.
   Versioned: schema 1 = { schema, generated, states, routes, adjacencies, nodes, edges } (see DATA-CONTRACT.md).
   routes / adjacencies come from scripts/xray-query.js (whyPath, ospfInterfaces, bgpNeighbors) - nothing new is inferred here;
   without it (query = null: the demo copies) they are left out. nodes / edges carry the column names Grafana's Node graph reads.

   doc(statesJson, states, opt) -> the file's text
     statesJson = JSON.stringify(states) as the page file has it (states equal by construction)
     opt = { nodes: [names], adj: { node: [{ iface, peer, peerIface }] }, pos: { node: { x, y } } or null, query: xray-query or null }
   find(dir) -> require()d module from <dir>/scripts/<name> or /opt/network-xray/scripts/<name> (the Docker image runs the
     collector from a copy without scripts/), or null. */
'use strict';
var path = require('path');

function find(dir, name) {
  var got = null;
  [path.join(dir, 'scripts', name), '/opt/network-xray/scripts/' + name].some(function (f) {
    try { got = require(f); return true; } catch (e) { got = null; return false; }
  });
  return got;
}

function answers(states, query) {
  var routes = [], adjs = [];
  if (!query) return null;
  // routes: every selected route of every router; the reason is X-Ray's: BGP = the deciding step (whyPath), OSPF = the out-interface cost
  Object.keys(states).sort().forEach(function (n) {
    var st = states[n] || {};
    (st.routing_table || []).forEach(function (r) {
      if (!r || r.selected === false || !r.prefix) return;
      var row = { router: n, prefix: r.prefix, protocol: r.protocol || '', next_hop: r.next_hop || '', out_iface: r.out_iface || '', reason: r.protocol || '' };
      if (r.protocol === 'bgp') {
        try {
          var w = query.whyPath(states, n, r.prefix);
          if (w && w.deciding_step) {
            var win = (w.steps || []).filter(function (x) { return x.result === 'win'; })[0];
            row.reason = 'BGP: ' + w.deciding_step + (win ? ' (' + win.selected + ' vs ' + win.other + ')' : '');
            row.deciding_step = w.deciding_step;
          } else if (w && w.selected) row.reason = 'BGP: only path';
        } catch (e) { row.reason = 'BGP'; }
      } else if (r.protocol === 'ospf') {
        var c = ((st.ospf_ifaces || {})[r.out_iface] || {}).cost;
        row.reason = 'OSPF' + (c != null ? ': out-interface cost ' + c : '');
      }
      routes.push(row);
    });
  });
  // adjacencies: OSPF per interface pair (state, mismatch and X-Ray's sentence), BGP per session
  try {
    var oi = query.ospfInterfaces(states), seen = {};
    (oi.routers || []).forEach(function (rt) {
      (rt.interfaces || []).forEach(function (f) {
        if (!f.peer) return;
        var k1 = rt.router + ':' + f.interface, k2 = f.peer + ':' + (f.peer_interface || ''), id = k1 < k2 ? k1 + '-' + k2 : k2 + '-' + k1;
        if (seen[id]) return;
        seen[id] = true;
        var w = (oi.wrong || []).filter(function (x) { return (x.node === rt.router && x.iface === f.interface) || (x.node === f.peer && x.iface === f.peer_interface); })[0];
        var up = f.neighbors_adjacent > 0;
        adjs.push({ id: id, protocol: 'ospf', between: rt.router + ' ' + f.interface + ' ⇔ ' + f.peer + ' ' + (f.peer_interface || ''), state: up ? 'up' : 'down',
          detail: w ? String(w.text).replace(/^[^:]*⇔[^:]*:/, '').trim() : (up ? 'OSPF ' + (f.neighbor_state || 'up') : 'OSPF no adjacency'),   /* the sentence a person reads (X-Ray's) */
          a: rt.router, a_iface: f.interface, b: f.peer, b_iface: f.peer_interface || '', neighbor_state: f.neighbor_state || null,
          mismatch_keys: f.mismatch || [] });   /* for a program: which parameters differ */
      });
    });
  } catch (e) {}
  try {
    var bn = query.bgpNeighbors(states);
    (bn.routers || []).forEach(function (rt) {
      (rt.peers || []).forEach(function (pr) {
        adjs.push({ id: rt.router + '>' + pr.peer, protocol: 'bgp', between: rt.router + ' ⇔ ' + pr.peer + (pr.remote_as != null ? ' (AS ' + pr.remote_as + ')' : ''),
          state: pr.established ? 'up' : 'down', detail: (pr.type ? pr.type + ' ' : '') + (pr.state || '') + (pr.established && pr.prefixes_received != null ? ', ' + pr.prefixes_received + (pr.prefixes_received === 1 ? ' prefix' : ' prefixes') + ' received' : ''),
          a: rt.router, peer: pr.peer, remote_as: pr.remote_as, bgp_state: pr.state || '', prefixes_received: pr.prefixes_received });
      });
    });
  } catch (e) {}
  return { routes: routes, adjacencies: adjs };
}

function doc(statesJson, states, opt) {
  var nodes = opt.nodes || [], adj = opt.adj || {}, pos = opt.pos || null;
  var ans = answers(states, opt.query || null);
  var adjs = ans ? ans.adjacencies : [];
  var issues = {};
  adjs.forEach(function (a) { if (a.state === 'down' || (a.mismatch_keys && a.mismatch_keys.length)) { issues[a.a] = (issues[a.a] || 0) + 1; if (a.b) issues[a.b] = (issues[a.b] || 0) + 1; } });
  var ns = nodes.filter(function (n) { return n in states; }).map(function (n) {
    var st = states[n] || {}, k = issues[n] || 0;
    return { id: n, title: n, mainstat: st.success === false ? 'unread' : (k ? k + (k === 1 ? ' issue' : ' issues') : 'ok'),
      secondarystat: (function (c) { return c + (c === 1 ? ' route' : ' routes'); })((st.routing_table || []).filter(function (r) { return r && r.selected !== false; }).length),
      color: st.success === false ? '#9ca3af' : (k ? '#ef4444' : '#22c55e'),
      fixedx: pos && pos[n] ? pos[n].x : undefined, fixedy: pos && pos[n] ? pos[n].y : undefined };
  });
  var seen = {}, es = [];
  nodes.forEach(function (a) {
    (adj[a] || []).forEach(function (l) {
      var k1 = a + ':' + l.iface, k2 = l.peer + ':' + l.peerIface, id = k1 < k2 ? k1 + '-' + k2 : k2 + '-' + k1;
      if (seen[id]) return;
      seen[id] = true;
      var ia = ((states[a] || {}).interfaces || {})[l.iface], ib = ((states[l.peer] || {}).interfaces || {})[l.peerIface];
      var up = (ia && ib) ? (ia.up !== false && ib.up !== false ? 'up' : 'down') : 'unknown';
      var o = adjs.filter(function (x) { return x.protocol === 'ospf' && x.id === id; })[0];
      var bad = up === 'down' || (o && (o.state === 'down' || (o.mismatch_keys && o.mismatch_keys.length)));
      es.push({ id: id, source: a, target: l.peer,
        mainstat: o ? 'OSPF ' + (o.state === 'up' ? (o.neighbor_state || 'up') : 'down' + (o.mismatch_keys.length ? ': ' + o.mismatch_keys.join(', ') : '')) : up,
        secondarystat: o && o.detail ? o.detail : '',
        color: up === 'unknown' ? '#9ca3af' : (bad ? '#ef4444' : '#22c55e'), thickness: bad ? 4 : 2 });
    });
  });
  return '{"schema":1,"generated":' + JSON.stringify(new Date().toISOString()) + ',"states":' + statesJson +
    (ans ? ',"routes":' + JSON.stringify(ans.routes) + ',"adjacencies":' + JSON.stringify(ans.adjacencies) : '') +
    ',"nodes":' + JSON.stringify(ns) + ',"edges":' + JSON.stringify(es) + '}\n';
}

module.exports = { find: find, answers: answers, doc: doc };
