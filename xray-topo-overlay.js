/*
 * xray-topo-overlay.js — drop-in, dependency-free "whole-topology" X-Ray overlay.
 *
 * The companion to xray-node-panel.js. Where that panel looks INSIDE one router, this draws the
 * WHOLE graph as a live control-plane picture:
 *   1. every link is coloured by its adjacency state — OSPF Full = green tunnel, BGP Established =
 *      purple tunnel, down/no-session = plain gray wire (see it converge / break at a glance);
 *   2. pick a destination prefix and click a source node, and the FORWARDING PATH lights up hop by
 *      hop across the graph (each router's own routing_table decides the next hop), with a DROP
 *      marker where a router has no route and a DEST ring where the packet arrives.
 *
 *   XrayTopoOverlay.render(containerEl, { states, positions }, opts);
 *
 * `states`    = { nodeName: <clab-collect.js per-node state>, ... }  (the window.LIVE_STATES shape)
 * `positions` = { nodeName: {x,y}, ... }  straight from the topology JSON / TopoViewer annotations
 *               (screen coords, y down) — same object the node panel takes, so links point the real way.
 *
 * Per-node fields used (see DATA-CONTRACT.md):
 *   <peer>_iface           interface facing <peer>  -> derive edges + follow a hop to the next node
 *   <peer>_has_full        adjacency Full / session Established on that link -> tunnel colour
 *   protocol               'bgp' | 'ospf'           -> link/tunnel colour
 *   routing_table [{prefix,out_iface,next_hop,protocol}]  -> longest-prefix lookup for the trace
 *   route_resolution.matched_prefix  -> default traced prefix
 *
 * Zero dependencies: plain DOM + one injected <style>. Every colour is a CSS variable on .xto-root,
 * so a host can re-theme it (e.g. map to VS Code theme vars) exactly like the node panel. MIT.
 */
(function (root) {
  'use strict';

  function esc(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
  function num(v) { return (Math.round(v * 10) / 10); }
  // map a client (screen) pixel to SVG user units — honours the viewBox scale + xMidYMid centering
  function clientToSvg(svg, cx, cy) {
    if (!svg || !svg.createSVGPoint || !svg.getScreenCTM) return { x: cx, y: cy };
    var m = svg.getScreenCTM(); if (!m) return { x: cx, y: cy };
    var pt = svg.createSVGPoint(); pt.x = cx; pt.y = cy;
    var p = pt.matrixTransform(m.inverse()); return { x: p.x, y: p.y };
  }

  // ---------- role / adjacency helpers (shared idiom with xray-node-panel.js) ----------
  function roleOf(name, st) {
    var k = ((st && st.kind) || '').toLowerCase();
    return (k === 'host' || k === 'linux' || k === 'linux-host' || /^(sv|server|host|client|pc|h\d+)$/i.test(name)) ? 'host' : 'router';
  }
  function protoOf(st) { return (st && st.protocol === 'bgp') ? 'bgp' : 'ospf'; }
  function adjUp(st, iface, peer) {
    if (!st) return false;
    if (peer && st[peer + '_has_full'] != null) return !!st[peer + '_has_full'];
    var i = st.interfaces && st.interfaces[iface];
    return i ? i.up !== false : true;
  }
  function peerByIface(st, iface) {   // which neighbour sits on this out-iface?  <peer>_iface === iface
    if (!st || !iface) return '';
    var hit = '';
    Object.keys(st).forEach(function (k) { var m = /^(.+)_iface$/.exec(k); if (m && st[k] === iface) hit = m[1]; });
    return hit;
  }

  // ---------- edges: derive the graph from every node's <peer>_iface fields ----------
  function deriveEdges(states) {
    var seen = {}, list = [];
    Object.keys(states).forEach(function (n) {
      var st = states[n];
      Object.keys(st).forEach(function (k) {
        var m = /^(.+)_iface$/.exec(k); if (!m) return;
        var peer = m[1], iface = st[k], key = [n, peer].sort().join('|');
        if (seen[key]) { var e = seen[key]; if (e.a === n) e.ia = iface; else e.ib = iface; return; }
        var ne = { a: n, b: peer, ia: (n < peer ? iface : ''), ib: (n < peer ? '' : iface), key: key };
        // store ifaces on the side they belong to regardless of a/b order
        if (n === ne.a) ne.ia = iface; else ne.ib = iface;
        seen[key] = ne; list.push(ne);
      });
    });
    return list;
  }
  function edgeUp(states, e) {
    var ua = adjUp(states[e.a], e.ia, e.b);
    var ub = states[e.b] ? adjUp(states[e.b], e.ib, e.a) : ua;   // host peer w/o state: trust the router side
    return ua && ub;
  }
  function edgeProto(states, e) {
    // per-link protocol first (both ends carry <peer>_proto, so the edge is coloured consistently);
    // fall back to "either endpoint speaks BGP" only when the collector didn't tag the adjacency.
    var p = (states[e.a] && states[e.a][e.b + '_proto']) || (states[e.b] && states[e.b][e.a + '_proto']);
    if (p) return p === 'bgp' ? 'bgp' : 'ospf';
    return (protoOf(states[e.a]) === 'bgp' || (states[e.b] && protoOf(states[e.b]) === 'bgp')) ? 'bgp' : 'ospf';
  }

  // ---------- longest-prefix lookup (real forwarding, not string-equality) ----------
  function ipToInt(ip) { var p = String(ip).split('.'); if (p.length !== 4) return null; var v = 0; for (var i = 0; i < 4; i++) { var o = parseInt(p[i], 10); if (isNaN(o)) return null; v = (v * 256) + o; } return v >>> 0; }
  function parseCidr(c) { var p = String(c).split('/'); var ip = ipToInt(p[0]); if (ip == null) return null; var len = p.length > 1 ? parseInt(p[1], 10) : 32; if (isNaN(len)) len = 32; return { ip: ip, len: len }; }
  function contains(route, dst) {   // does route-CIDR cover dst-CIDR's network?
    var r = parseCidr(route), d = parseCidr(dst); if (!r || !d) return false;
    if (d.len < r.len) return false;
    var mask = r.len === 0 ? 0 : (0xffffffff << (32 - r.len)) >>> 0;
    return ((r.ip & mask) >>> 0) === ((d.ip & mask) >>> 0);
  }
  function lookup(st, prefix) {
    var rt = st.routing_table || [], exact = null, best = null;
    for (var i = 0; i < rt.length; i++) {
      var r = rt[i];
      if (r.prefix === prefix) { exact = r; break; }
      if (contains(r.prefix, prefix)) { var pl = parseCidr(r.prefix); if (!best || pl.len > best._len) { best = r; best._len = pl.len; } }
    }
    return exact || best || null;
  }

  // ---------- trace a prefix hop-by-hop from a source node ----------
  function trace(states, positions, source, prefix) {
    var hops = [], visited = {}, cur = source, guard = 0;
    while (cur && guard++ < 64) {
      if (visited[cur]) { hops.push({ node: cur, loop: true }); break; }
      visited[cur] = 1;
      var st = states[cur];
      if (!st) { hops.push({ node: cur, terminal: true, arrived: true }); break; }
      var row = lookup(st, prefix);
      if (!row) { hops.push({ node: cur, drop: true }); break; }
      var terminal = row.out_iface === 'lo' || row.protocol === 'local' || row.protocol === 'connected';
      hops.push({ node: cur, out_iface: row.out_iface, next_hop: row.next_hop, protocol: row.protocol, terminal: terminal });
      if (terminal) break;
      var peer = peerByIface(st, row.out_iface);
      if (!peer) break;                                   // out-iface faces nothing we know
      if (!states[peer]) { hops.push({ node: peer, terminal: true, arrived: !!positions[peer] }); break; }
      cur = peer;
    }
    return hops;
  }

  // ---------- prefix candidates for the picker ----------
  function prefixList(states) {
    var set = {}, order = [];
    Object.keys(states).forEach(function (n) {
      (states[n].routing_table || []).forEach(function (r) {
        if (!r.prefix || r.out_iface === 'lo' || r.protocol === 'local' || r.protocol === 'connected') return;
        if (!set[r.prefix]) { set[r.prefix] = 1; order.push(r.prefix); }
      });
      (states[n].bgp_routes || []).forEach(function (r) { if (r.prefix && !set[r.prefix]) { set[r.prefix] = 1; order.push(r.prefix); } });
    });
    return order.sort();
  }
  function defaultPrefix(states, prefixes) {
    var first = Object.keys(states).map(function (n) { var rr = states[n].route_resolution; return rr && rr.matched_prefix; }).filter(Boolean)[0];
    return (first && prefixes.indexOf(first) >= 0) ? first : (prefixes[0] || '');
  }

  // ---------- SVG geometry ----------
  function bounds(positions, names) {
    var xs = names.map(function (n) { return positions[n] ? positions[n].x : null; }).filter(function (v) { return v != null; });
    var ys = names.map(function (n) { return positions[n] ? positions[n].y : null; }).filter(function (v) { return v != null; });
    if (!xs.length) return { minX: 0, minY: 0, w: 480, h: 320 };
    var pad = 72, minX = Math.min.apply(null, xs), maxX = Math.max.apply(null, xs), minY = Math.min.apply(null, ys), maxY = Math.max.apply(null, ys);
    return { minX: minX - pad, minY: minY - pad, w: (maxX - minX) + pad * 2, h: (maxY - minY) + pad * 2 };
  }
  function nodeBoxW(name) { return Math.max(46, name.length * 8 + 18); }
  function stubW(label) { return Math.max(64, String(label).length * 7 + 22); }

  // The traced prefix's DESTINATION network as a stub node: when the last hop delivers the packet off a
  // connected egress interface (not lo) that faces no known router, that egress is the leaf/dest network
  // (e.g. r4 eth2 -> 8.8.8.0/24). We synthesise a node for it just beyond the delivering router, in the
  // direction away from that router's neighbours, so the forwarding arrow completes onto a real endpoint.
  function destStub(states, positions, edges, hops, prefix) {
    if (!hops.length) return null;
    var last = hops[hops.length - 1];
    if (last.drop || last.loop || !last.terminal) return null;
    if (!last.out_iface || last.out_iface === 'lo') return null;
    var byState = states[last.node]; if (!byState) return null;
    var facing = peerByIface(byState, last.out_iface);
    if (facing && positions[facing]) return null;               // egress faces a known router -> no separate stub
    var rp = positions[last.node]; if (!rp) return null;
    var nb = [];
    edges.forEach(function (e) { var o = e.a === last.node ? e.b : (e.b === last.node ? e.a : null); if (o && positions[o]) nb.push(positions[o]); });
    var dx = 1, dy = 0;
    if (nb.length) { var cx = 0, cy = 0; nb.forEach(function (p) { cx += p.x; cy += p.y; }); cx /= nb.length; cy /= nb.length; dx = rp.x - cx; dy = rp.y - cy; var m = Math.hypot(dx, dy) || 1; dx /= m; dy /= m; }
    return { label: prefix, iface: last.out_iface, by: last.node, rp: rp, dx: dx, dy: dy, x: rp.x + dx * 118, y: rp.y + dy * 118 };
  }

  function svgFor(states, positions, sel) {
    var names = Object.keys(states);
    // include peer-only endpoints (hosts) that appear in edges but have no collected state
    var edges = deriveEdges(states);
    edges.forEach(function (e) { if (names.indexOf(e.b) < 0 && positions[e.b]) names.push(e.b); });
    var hops = (sel.prefix && sel.source) ? trace(states, positions, sel.source, sel.prefix) : [];
    var stub = destStub(states, positions, edges, hops, sel.prefix);

    var bb = bounds(positions, names);
    if (stub) { var pd = 66, x0 = Math.min(bb.minX, stub.x - pd), y0 = Math.min(bb.minY, stub.y - pd), x1 = Math.max(bb.minX + bb.w, stub.x + pd), y1 = Math.max(bb.minY + bb.h, stub.y + pd); bb = { minX: x0, minY: y0, w: x1 - x0, h: y1 - y0 }; }
    var s = '<svg class="xto-svg" viewBox="' + num(bb.minX) + ' ' + num(bb.minY) + ' ' + num(bb.w) + ' ' + num(bb.h) + '" width="100%" preserveAspectRatio="xMidYMid meet">';

    // trace path first (so adjacency tunnels & nodes sit on top of the amber glow). The path is a SOLID
    // amber underlay (no animation, so a screenshot reads the same as the live view); the directional
    // arrowheads are collected in `heads` and drawn LAST, on top of everything, so direction stays crisp.
    var heads = '';
    function traceLine(pa, pb) {
      s += '<line x1="' + num(pa.x) + '" y1="' + num(pa.y) + '" x2="' + num(pb.x) + '" y2="' + num(pb.y) + '" stroke="var(--xto-trace)" stroke-width="9" stroke-linecap="round" opacity="0.9"/>';
    }
    function traceHead(pb, ang, off) {   // arrowhead `off` px before pb (i.e. just outside the receiving node)
      var hx = pb.x - Math.cos(ang) * off, hy = pb.y - Math.sin(ang) * off, hs = 15;
      heads += '<polygon fill="var(--xto-trace)" stroke="var(--xto-bg)" stroke-width="1" points="' + num(hx) + ',' + num(hy) + ' ' +
        num(hx - Math.cos(ang - 0.5) * hs) + ',' + num(hy - Math.sin(ang - 0.5) * hs) + ' ' +
        num(hx - Math.cos(ang + 0.5) * hs) + ',' + num(hy - Math.sin(ang + 0.5) * hs) + '"/>';
    }
    for (var h = 0; h + 1 < hops.length; h++) {
      var from = hops[h].node, to = hops[h + 1].node;
      if (!positions[from] || !positions[to]) continue;
      var pa = positions[from], pb = positions[to];
      traceLine(pa, pb);
      traceHead(pb, Math.atan2(pb.y - pa.y, pb.x - pa.x), nodeBoxW(to) / 2 + 7);
    }
    if (stub) {   // final delivery arrow: from the last router INTO the destination stub pill's near edge
      var sw = stubW(stub.label), fdx = stub.rp.x - stub.x, fdy = stub.rp.y - stub.y, fm = Math.hypot(fdx, fdy) || 1;
      var ux = fdx / fm, uy = fdy / fm, t = Math.min(ux ? (sw / 2) / Math.abs(ux) : 1e9, uy ? 13 / Math.abs(uy) : 1e9);
      var pe = { x: stub.x + ux * t, y: stub.y + uy * t };
      traceLine(stub.rp, pe);
      traceHead(pe, Math.atan2(pe.y - stub.rp.y, pe.x - stub.rp.x), 3);
    }

    // links: gray physical wire + protocol-coloured tunnel overlay when the adjacency is up
    edges.forEach(function (e) {
      var pa = positions[e.a], pb = positions[e.b]; if (!pa || !pb) return;
      var up = edgeUp(states, e), pcol = edgeProto(states, e) === 'bgp' ? 'var(--xto-bgp)' : 'var(--xto-ospf)';
      s += '<line x1="' + num(pa.x) + '" y1="' + num(pa.y) + '" x2="' + num(pb.x) + '" y2="' + num(pb.y) + '" stroke="var(--xto-phys)" stroke-width="5" stroke-linecap="round"' + (up ? '' : ' stroke-dasharray="2 6"') + '/>';
      if (up) s += '<line x1="' + num(pa.x) + '" y1="' + num(pa.y) + '" x2="' + num(pb.x) + '" y2="' + num(pb.y) + '" stroke="' + pcol + '" stroke-width="2.5" stroke-linecap="round"/>';
    });

    // hop status by node (drop / arrived / on-path)
    var stat = {};
    hops.forEach(function (hp) { stat[hp.node] = hp.drop ? 'drop' : (hp.arrived || hp.terminal ? 'dest' : 'path'); });
    if (sel.source) stat[sel.source] = stat[sel.source] === 'dest' ? 'dest' : 'src';

    // nodes
    names.forEach(function (n) {
      var p = positions[n]; if (!p) return;
      var st = states[n], role = roleOf(n, st), w = nodeBoxW(n), hh = 13;
      var cls = 'xto-node xto-' + role + (stat[n] ? ' xto-' + stat[n] : '');
      var ring = stat[n] === 'drop' ? 'var(--xto-drop)' : (stat[n] === 'dest' ? 'var(--xto-ok)' : (stat[n] === 'src' || stat[n] === 'path') ? 'var(--xto-trace)' : (role === 'host' ? 'var(--xto-muted)' : 'var(--xto-accent)'));
      if (role === 'host') s += '<rect class="' + cls + '" x="' + num(p.x - w / 2) + '" y="' + num(p.y - hh) + '" width="' + w + '" height="' + (hh * 2) + '" rx="3" fill="var(--xto-bg)" stroke="' + ring + '" stroke-width="2" data-n="' + esc(n) + '"/>';
      else s += '<rect class="' + cls + '" x="' + num(p.x - w / 2) + '" y="' + num(p.y - hh) + '" width="' + w + '" height="' + (hh * 2) + '" rx="8" fill="var(--xto-bg)" stroke="' + ring + '" stroke-width="2.5" data-n="' + esc(n) + '"/>';
      s += '<text class="xto-nlabel" x="' + num(p.x) + '" y="' + num(p.y + 4) + '" text-anchor="middle" fill="' + ring + '" data-n="' + esc(n) + '">' + esc(n) + '</text>';
      if (stat[n] === 'drop') s += '<text x="' + num(p.x + w / 2 + 10) + '" y="' + num(p.y + 4) + '" fill="var(--xto-drop)" font-size="14" font-weight="700">✕ DROP</text>';
    });

    // destination stub network (the leaf prefix the trace delivers to) — a green pill, drawn on top
    if (stub) {
      var sw2 = stubW(stub.label), hh2 = 13;
      s += '<rect class="xto-stub" x="' + num(stub.x - sw2 / 2) + '" y="' + num(stub.y - hh2) + '" width="' + num(sw2) + '" height="' + (hh2 * 2) + '" rx="13" fill="var(--xto-bg)" stroke="var(--xto-ok)" stroke-width="2.5"/>' +
        '<text x="' + num(stub.x) + '" y="' + num(stub.y - hh2 - 5) + '" text-anchor="middle" fill="var(--xto-muted)" font-size="9" font-family="monospace">' + esc(stub.iface) + ' · dest net</text>' +
        '<text x="' + num(stub.x) + '" y="' + num(stub.y + 4) + '" text-anchor="middle" fill="var(--xto-ok)" font-size="11" font-weight="700" font-family="monospace">' + esc(stub.label) + '</text>';
    }

    s += heads + '</svg>';   // directional arrowheads on top, so the path direction is unambiguous in a still
    return { svg: s, hops: hops };
  }

  // ---------- hop caption ----------
  function hopsCaption(hops, prefix) {
    if (!hops.length) return '';
    var parts = hops.map(function (hp) {
      if (hp.drop) return '<span class="xto-hop-drop">' + esc(hp.node) + ' ✕ no route</span>';
      if (hp.terminal || hp.arrived) return '<span class="xto-hop-dest">' + esc(hp.node) + (hp.out_iface && hp.out_iface !== 'lo' ? '' : ' ★') + '</span>';
      if (hp.loop) return '<span class="xto-hop-drop">' + esc(hp.node) + ' ↻ loop</span>';
      return '<span class="xto-hop">' + esc(hp.node) + '<span class="xto-hop-if"> →' + esc(hp.out_iface || '?') + (hp.next_hop ? ' (' + esc(hp.next_hop) + ')' : '') + '</span></span>';
    });
    var end = hops[hops.length - 1];
    var verdict = end.drop ? '<b class="xto-v-drop">DROP</b>' : (end.loop ? '<b class="xto-v-drop">LOOP</b>' : '<b class="xto-v-ok">DELIVERED</b>');
    return '<div class="xto-cap"><span class="xto-cap-dst">' + esc(prefix) + '</span> ' + parts.join('<span class="xto-arw">→</span>') + '  ' + verdict + '</div>';
  }

  function injectCss() {
    if (document.getElementById('xray-topo-overlay-css')) return;
    var s = document.createElement('style'); s.id = 'xray-topo-overlay-css';
    s.textContent =
      '.xto-root{' +
        '--xto-fg:#cfe8ee;--xto-bg:#0b141c;--xto-panel:#0f1a24;--xto-border:#1f3a2a;--xto-accent:#4dd0e1;' +
        '--xto-muted:#5f7d8a;--xto-ok:#39e639;--xto-ospf:#39e639;--xto-bgp:#9a7fd1;--xto-phys:#46586a;' +
        '--xto-trace:#ffd54f;--xto-drop:#ef5350;' +
        '--xto-font:12px/1.45 "Cascadia Code",Consolas,Menlo,monospace;' +
        'font:var(--xto-font);color:var(--xto-fg)}' +
      '.xto-bar{display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin:0 0 8px}' +
      '.xto-bar label{color:var(--xto-muted)}' +
      '.xto-bar select{background:var(--xto-panel);color:var(--xto-fg);border:1px solid var(--xto-border);border-radius:4px;padding:3px 8px;font:inherit}' +
      '.xto-bar .xto-hint{color:var(--xto-muted);font-size:11px}' +
      '.xto-stage{background:var(--xto-panel);border:1px solid var(--xto-border);border-radius:8px;padding:6px}' +
      '.xto-svg{display:block;width:100%;max-height:440px}' +
      '.xto-node{cursor:pointer}.xto-nlabel{cursor:pointer;font:700 12px "Cascadia Code",Consolas,monospace;pointer-events:auto}' +
      '.xto-node:hover{filter:brightness(1.35)}' +
      '.xto-grabbable .xto-svg{touch-action:none}' +
      '.xto-grabbable .xto-node,.xto-grabbable .xto-nlabel{cursor:grab}' +
      '.xto-grabbable.xto-dragging .xto-node,.xto-grabbable.xto-dragging .xto-nlabel{cursor:grabbing}' +
      '.xto-legend{margin-top:6px;font-size:11px;color:var(--xto-muted);display:flex;gap:14px;flex-wrap:wrap}' +
      '.xto-legend i{font-style:normal}' +
      '.xto-sw{display:inline-block;width:22px;height:0;border-top:3px solid;vertical-align:middle;margin-right:5px}' +
      '.xto-cap{margin-top:8px;line-height:1.9}' +
      '.xto-cap-dst{color:var(--xto-accent);font-weight:700;margin-right:6px}' +
      '.xto-hop{color:var(--xto-fg)}.xto-hop-if{color:var(--xto-muted);font-size:11px}' +
      '.xto-hop-dest{color:var(--xto-ok);font-weight:700}.xto-hop-drop{color:var(--xto-drop);font-weight:700}' +
      '.xto-arw{color:var(--xto-trace);margin:0 5px}' +
      '.xto-v-ok{color:var(--xto-ok)}.xto-v-drop{color:var(--xto-drop)}';
    document.head.appendChild(s);
  }

  // render(container, { states, positions }, opts?)
  //   opts.prefix / opts.source seed the trace; otherwise it defaults to a resolvable prefix and the
  //   highest-degree node. Click any node to re-source the trace; change the picker to re-target it.
  //   opts.draggable:true  — drag nodes to reposition them (like the containerlab TopoViewer); a click
  //     that doesn't move still just re-sources the trace.  opts.onMove(name,{x,y}) fires after a drag
  //     so the host can persist the new coordinate (e.g. back into the topology annotations); pass
  //     opts.onMoving(name,{x,y}) to also fire continuously DURING the drag — wire it to re-render a
  //     detail view so the node figure's link angles follow the layout live.
  //   opts.onSelect(name,state) — fires when a node is CLICKED (and once on first render for the default
  //     node). Wire it to XrayNodePanel.render(...) to show that node's inside-the-router detail, so the
  //     overview becomes a click-through explorer: graph -> node -> Routing/BGP/Best-Path + figure.
  function render(container, data, opts) {
    if (typeof document === 'undefined') return;
    if (typeof container === 'string') container = document.getElementById(container.replace(/^#/, '')) || document.querySelector(container);
    if (!container) return;
    injectCss();
    data = data || {}; opts = opts || {};
    var states = data.states || {}, positions = data.positions || {};
    container._xtoData = data;                                   // latest data for the (once-bound) drag handlers
    if (opts.draggable != null) container._xtoDraggable = !!opts.draggable;
    if (opts.onMove) container._xtoOnMove = opts.onMove;         // drag END — persist the coordinate
    if (opts.onMoving) container._xtoOnMoving = opts.onMoving;   // DURING drag — for live UI that follows (e.g. a detail view)
    if (opts.onSelect) container._xtoOnSelect = opts.onSelect;   // fired when a node is clicked (not dragged)
    var draggable = !!container._xtoDraggable;
    function fireSelect(n) { if (container._xtoOnSelect && states[n]) { try { container._xtoOnSelect(n, states[n]); } catch (e) {} } }
    container.classList.add('xto-root');
    if (draggable) container.classList.add('xto-grabbable');

    var prefixes = prefixList(states);
    var sel = container._xtoSel || {};
    if (opts.prefix) sel.prefix = opts.prefix;
    if (opts.source) sel.source = opts.source;
    if (!sel.prefix || prefixes.indexOf(sel.prefix) < 0) sel.prefix = defaultPrefix(states, prefixes);
    if (!sel.source || !states[sel.source]) {
      sel.source = Object.keys(states).sort(function (a, b) { return deriveEdges(states).filter(function (e) { return e.a === b || e.b === b; }).length - deriveEdges(states).filter(function (e) { return e.a === a || e.b === a; }).length; })[0] || Object.keys(states)[0];
    }
    container._xtoSel = sel;

    var built = svgFor(states, positions, sel);
    var picker = '<div class="xto-bar"><label for="xto-dst">Trace destination</label>' +
      '<select id="xto-dst">' + prefixes.map(function (p) { return '<option value="' + esc(p) + '"' + (p === sel.prefix ? ' selected' : '') + '>' + esc(p) + '</option>'; }).join('') + '</select>' +
      '<span class="xto-hint">source: <b>' + esc(sel.source || '—') + '</b> · ' + (draggable ? 'drag a node to move it, click to trace from it' : 'click a node to change') + '</span></div>';
    var legend = '<div class="xto-legend">' +
      '<i><span class="xto-sw" style="border-color:var(--xto-ospf)"></span>OSPF Full</i>' +
      '<i><span class="xto-sw" style="border-color:var(--xto-bgp)"></span>BGP Established</i>' +
      '<i><span class="xto-sw" style="border-color:var(--xto-phys)"></span>link (no adjacency)</i>' +
      '<i><span class="xto-sw" style="border-color:var(--xto-trace)"></span>traced path</i></div>';
    container.innerHTML = picker + '<div class="xto-stage">' + built.svg + '</div>' + legend + hopsCaption(built.hops, sel.prefix);

    var dst = container.querySelector('#xto-dst');
    if (dst) dst.addEventListener('change', function () { container._xtoSel.prefix = dst.value; render(container, data, {}); });
    var nodes = container.querySelectorAll('[data-n]');
    if (!draggable) {
      Array.prototype.forEach.call(nodes, function (el) {
        el.addEventListener('click', function () { var n = el.getAttribute('data-n'); if (states[n]) { container._xtoSel.source = n; render(container, data, {}); fireSelect(n); } });
      });
    } else {
      // pointerdown starts a potential drag; the once-bound document move/up handlers below finish it
      Array.prototype.forEach.call(nodes, function (el) {
        el.addEventListener('pointerdown', function (ev) {
          ev.preventDefault();
          var n = el.getAttribute('data-n'), svg = container.querySelector('svg.xto-svg');
          var loc = clientToSvg(svg, ev.clientX, ev.clientY);
          var pos = (container._xtoData.positions || {})[n] || { x: loc.x, y: loc.y };
          container._xtoDrag = { n: n, dx: loc.x - pos.x, dy: loc.y - pos.y, cx0: ev.clientX, cy0: ev.clientY, moved: false };
          container.classList.add('xto-dragging');
        });
      });
      if (!container._xtoDragBound) {                            // bind ONCE — survives innerHTML re-renders
        container._xtoDragBound = true;
        document.addEventListener('pointermove', function (ev) {
          var d = container._xtoDrag; if (!d) return;
          var cd = container._xtoData, svg = container.querySelector('svg.xto-svg'); if (!svg) return;
          var loc = clientToSvg(svg, ev.clientX, ev.clientY);
          if (Math.abs(ev.clientX - d.cx0) + Math.abs(ev.clientY - d.cy0) > 3) d.moved = true;
          var np = (cd.positions || (cd.positions = {}))[d.n] = { x: loc.x - d.dx, y: loc.y - d.dy };
          render(container, cd, {});
          if (d.moved && container._xtoOnMoving) { try { container._xtoOnMoving(d.n, np); } catch (e) {} }
        });
        document.addEventListener('pointerup', function () {
          var d = container._xtoDrag; if (!d) return;
          container._xtoDrag = null; container.classList.remove('xto-dragging');
          var cd = container._xtoData;
          if (!d.moved) {                                        // a click, not a drag -> re-source the trace + open detail
            if (cd.states && cd.states[d.n]) { container._xtoSel.source = d.n; render(container, cd, {}); if (container._xtoOnSelect) { try { container._xtoOnSelect(d.n, cd.states[d.n]); } catch (e) {} } }
          } else if (container._xtoOnMove) {
            try { container._xtoOnMove(d.n, (cd.positions || {})[d.n]); } catch (e) {}
          }
        });
      }
    }
    if (!container._xtoInited) { container._xtoInited = true; fireSelect(sel.source); }   // seed the host's detail view once
    return built.hops;
  }

  var api = { render: render, trace: trace, deriveEdges: deriveEdges };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.XrayTopoOverlay = api;
})(typeof window !== 'undefined' ? window : this);
