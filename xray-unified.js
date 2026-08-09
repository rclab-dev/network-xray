/*
 * xray-unified.js — unified variable-angle X-Ray renderer.
 *
 * Fully independent, additive path: it does not modify xray-core.js `xrayRenderDeepEngine`
 * or the node panel (`xray-node-panel.js`), so existing rendering is unchanged.
 * Scope = radial base (xrayRadialGeometry) + tunnelMode:'concentric'. Other axes accept keys
 * here; the meaningful differences are tunnelMode (single/concentric), engineShape
 * (circle/cylinder hint), and arrowMode.
 *
 * Data model (per-LINK protocol layers; see DATA-CONTRACT.md §3):
 *   node = { target, links:[ {iface, peer, protocols:[{proto,up}], selected} ], positions:{name:{x,y}} }
 *   Backward-compat derivation from a single scalar proto is handled by fromLegacyState().
 * Taste axes (see SKIN-CONTRACT.md §4):
 *   { engineShape:'circle'|'cylinder', processGlyph:'none'|'ball', arrowMode:'mono'|'proto',
 *     tunnelMode:'single'|'concentric', panelContent:'none'|'full', protocolOrder:'bgp-top'|'ospf-top' }
 */
(function (root) {
  'use strict';

  var PRESETS = {
    cinema: { engineShape: 'rect',     processGlyph: 'outside', arrowMode: 'proto', tunnelMode: 'concentric', panelContent: 'full', protocolOrder: 'bgp-top' },
    // light also uses tunnelMode:'concentric': co-location truth (concentric 2 layers) is kept even in the calm mode.
    //   what collapses is only richness (cylinder/glow/thickness/label/glyph); co-location is truth,
    //   not richness. 'single' folds one-protocol-per-link into a single color (a different taste, unused by the default preset).
    light:  { engineShape: 'circle',   processGlyph: 'none', arrowMode: 'mono',  tunnelMode: 'concentric', panelContent: 'none', protocolOrder: 'bgp-top' }
  };
  function resolveAxes(a) {
    var base = (a && a.preset && PRESETS[a.preset]) ? PRESETS[a.preset] : PRESETS.cinema;
    var out = {}; Object.keys(base).forEach(function (k) { out[k] = (a && a[k] != null) ? a[k] : base[k]; });
    return out;
  }

  // ── geometry ───────────────────────────────────────────────────────────
  // Radiate each link at its real angle toward the peer (atan2). Peers with no position are fanned out (spread).
  function xrayRadialGeometry(node, opt) {
    opt = opt || {};
    var pos = node.positions || {}, self = pos[node.target] || null;
    var realang = opt.realAngle !== false;
    var links = (node.links || []).map(function (lk) { return { iface: lk.iface, peer: lk.peer, link: lk }; });
    var miss = [];
    links.forEach(function (L) {
      var pp = pos[L.peer];
      if (realang && self && pp) L.angle = Math.atan2(pp.y - self.y, pp.x - self.x); // screen coords (y down)=graph dir
      else { L.angle = null; miss.push(L); }
    });
    miss.forEach(function (L, i) { L.angle = -Math.PI / 2 + (i + 1) * (Math.PI / (miss.length + 1)); });
    // legacy-pin: generalized by real link count (zero regression, opt.legacyPin). 1 link (edge node) = right 0deg
    //   (no phantom left link) / 2 links (transit node) = legacy L/R (180deg/0deg). 3+ = radial (not pinned).
    if (opt.legacyPin) {
      if (links.length === 1) links[0].angle = 0;
      else if (links.length === 2) { links[0].angle = Math.PI; links[1].angle = 0; }
    }
    return links;
  }

  // ── per-link protocol layers ──
  // Tunnel layer order (outer->inner) = DATA truth = the array order of protocols[] (DATA-CONTRACT §4.7).
  //   No reordering here (the dependency up->down is guaranteed by the collector/data side). `protocolOrder` (taste)
  //   it does not affect tunnels, only the visual flip of the process-ball stack (SKIN-CONTRACT.md v2).
  function linkLayers(link) {
    return (link.protocols || []).filter(function (p) { return p.up; }); // array order = outer->inner
  }
  function protoCol(p) { return p === 'bgp' ? 'var(--xto-bgp,#a855f7)' : p === 'static' ? 'var(--xto-static,#ffb347)' : 'var(--xto-ospf,#39ff14)'; }

  // ── render ─────────────────────────────────────────────────────────────
  function xrayRenderUnified(node, axes) {
    var ax = resolveAxes(axes);
    // richness (thickness/glow/label/large body) is driven only by richness axes such as engineShape.
    //   tunnelMode:'concentric' carries co-location truth (data), so it is not part of richness: even light gets concentric-thin.
    // rich (cinema look) = a rect body (green rounded rectangle, cinema). light = circle (white circle, minimal). Independent of tunnelMode.
    var rich = ax.engineShape === 'rect';
    var shape = ax.engineShape === 'rect' ? 'rect' : 'circle';
    // immersive frame (the node nearly fills the canvas, links are short stubs). Default off.
    var imm = axes && axes.immersive;
    var W = 460, H = 340, CX = W / 2, CY = H / 2;
    var R = imm ? 224 : 140, HW = imm ? 160 : 66, HH = imm ? 115 : 46, RER = imm ? 82 : 32;
    var links = xrayRadialGeometry(node, axes || {});
    function pt(a, r) { return [CX + Math.cos(a) * r, CY + Math.sin(a) * r]; }
    function bodyEdge(a) {   // edge of the node body (link endpoint = rect boundary or circle circumference)
      if (shape === 'rect') { var dx = Math.cos(a), dy = Math.sin(a), t = Math.min(dx ? HW / Math.abs(dx) : 1e9, dy ? HH / Math.abs(dy) : 1e9); return [CX + dx * t, CY + dy * t]; }
      return pt(a, RER);
    }
    function ln(p, q, col, w, glow) {
      return '<line x1="' + p[0].toFixed(1) + '" y1="' + p[1].toFixed(1) + '" x2="' + q[0].toFixed(1) + '" y2="' + q[1].toFixed(1) +
        '" stroke="' + col + '" stroke-width="' + w + '" stroke-linecap="round"' + (glow ? ' style="filter:drop-shadow(0 0 4px ' + col + ')"' : '') + '/>';
    }
    var s = '<svg viewBox="0 0 ' + W + ' ' + H + '" width="100%" class="xu-fig">';

    // z-order: (1) links first (behind) -> (2) node body (front) -> (3) legend/arrow/label (above face).
    //   = tunnels/links do not cover the node face (the node body is drawn last, on top).

    // ── (1) links (behind): cyan physical (center, thinnest) + protocol layers (outer) + DOWN = red dotted ──
    //   concentric layers (outer->inner) = BGP purple (outermost, thick) -> OSPF green -> cyan physical (center, thinnest, top). Follows array order (outer->inner, §4.7).
    //   physical cyan = `--xto-link` (skin color) / physical DOWN = `--xto-linkDown` (red skin color).
    links.forEach(function (L) {
      var a = L.angle, r0 = bodyEdge(a), ex = pt(a, R), layers = linkLayers(L.link), linkUp = L.link.up !== false, markerCol;
      // pipe cross-section: each layer is a parallel line offset ±perpendicular to the link, with a gap between layers.
      //   center = cyan physical (1 line) -> gap -> OSPF (2 lines at ±off) -> gap -> BGP (2 lines at ±off, outermost). Symmetric inner->outer rings.
      var perp = [-Math.sin(a), Math.cos(a)];
      function offLn(off, col, w, glow) { return ln([r0[0] + perp[0] * off, r0[1] + perp[1] * off], [ex[0] + perp[0] * off, ex[1] + perp[1] * off], col, w, glow); }
      var lw = rich ? 2 : 1.8, gap = rich ? 4 : 3;                       // thin lines / gap only between the link and the proto group
      if (!linkUp) {
        s += '<line x1="' + r0[0].toFixed(1) + '" y1="' + r0[1].toFixed(1) + '" x2="' + ex[0].toFixed(1) + '" y2="' + ex[1].toFixed(1) + '" stroke="var(--xto-linkDown,#ff4d4d)" stroke-width="' + (rich ? 3.5 : 2.5) + '" stroke-dasharray="6 5" stroke-linecap="round"/>';
        markerCol = 'var(--xto-linkDown,#ff4d4d)';
      } else {
        s += offLn(0, 'var(--xto-link,#00e5ff)', lw, false);            // cyan physical = 1 center line
        var ringLayers = (ax.tunnelMode === 'concentric') ? layers.slice().reverse() : (layers[0] ? [layers[0]] : []);  // inner->outer (OSPF->BGP)
        ringLayers.forEach(function (p, i) {
          var off = (lw + gap) + i * lw;                                 // OSPF = gap from cyan / BGP = adjacent to OSPF (no gap)
          s += offLn(+off, protoCol(p.proto), lw, rich);
          s += offLn(-off, protoCol(p.proto), lw, rich);
        });
        markerCol = 'var(--xto-link,#00e5ff)';   // IF marker = physical link color (UP = cyan)
      }
      if (ax.panelContent === 'full') {
        // (A) radial label = one line below the box (frame-outside), cyan, with a halo (paint-order stroke).
        // Style-aligned with the core renderer: x = base + cos(a)*8 nudge (non-immersive reachFor = R).
        var _co = Math.cos(a);
        var base = pt(a, R), lx = (base[0] + _co * 8).toFixed(1);
        var anc = _co > 0.35 ? 'start' : (_co < -0.35 ? 'end' : 'middle');
        var _lyR = (shape === 'rect' ? CY + HH : CY + RER) + 16;   // 16px below the box/circle bottom edge
        s += '<text x="' + lx + '" y="' + _lyR.toFixed(1) + '" fill="var(--xto-link,#00e5ff)" font-size="12" font-family="monospace" text-anchor="' + anc + '" paint-order="stroke" stroke="var(--xto-bg,#0d1620)" stroke-width="3" stroke-linejoin="round">' + L.iface + (L.peer ? ' - ' + L.peer : '') + '</text>';
      }
    });

    // ── (2) node body (front, drawn after links so tunnels do not cover the face). rect = green rounded rectangle / circle = white circle ──
    if (shape === 'rect') s += '<rect x="' + (CX - HW) + '" y="' + (CY - HH) + '" width="' + (HW * 2) + '" height="' + (HH * 2) + '" rx="14" fill="var(--xto-bg,#0d1620)" stroke="var(--xto-ok,#39ff14)" stroke-width="2"/>';
    else s += '<circle cx="' + CX + '" cy="' + CY + '" r="' + RER + '" fill="var(--xto-bg,#0d1620)" stroke="var(--xto-fg,#e6f2f5)" stroke-width="2"/>';
    if (shape === 'rect' && rich) {   // faint inner cylinder (decorative)
      var cw = HW * 0.4, cyT = CY - HH * 0.44, cyB = CY + HH * 0.44;
      s += '<ellipse cx="' + CX + '" cy="' + cyT.toFixed(1) + '" rx="' + cw.toFixed(1) + '" ry="' + (cw * 0.34).toFixed(1) + '" fill="none" stroke="var(--xto-fg,#e6f2f5)" stroke-width="1" opacity="0.26"/>';
      s += '<line x1="' + (CX - cw).toFixed(1) + '" y1="' + cyT.toFixed(1) + '" x2="' + (CX - cw).toFixed(1) + '" y2="' + cyB.toFixed(1) + '" stroke="var(--xto-fg,#e6f2f5)" stroke-width="1" opacity="0.2"/>';
      s += '<line x1="' + (CX + cw).toFixed(1) + '" y1="' + cyT.toFixed(1) + '" x2="' + (CX + cw).toFixed(1) + '" y2="' + cyB.toFixed(1) + '" stroke="var(--xto-fg,#e6f2f5)" stroke-width="1" opacity="0.2"/>';
      s += '<ellipse cx="' + CX + '" cy="' + cyB.toFixed(1) + '" rx="' + cw.toFixed(1) + '" ry="' + (cw * 0.34).toFixed(1) + '" fill="none" stroke="var(--xto-fg,#e6f2f5)" stroke-width="1" opacity="0.18"/>';
    }

    // ── (3) immersive: connect links into the inner cylinder (routing engine core) — links plug into the core ──
    //   cyan connector (body edge -> cylinder edge) + connection orb. Drawn after the body (front) so it is not covered. immersive only.
    if (imm && shape === 'rect' && rich) {
      var ccw = HW * 0.4, chh = HH * 0.44;
      var cylEdge = function (a) { var dx = Math.cos(a), dy = Math.sin(a), t = Math.min(dx ? ccw / Math.abs(dx) : 1e9, dy ? chh / Math.abs(dy) : 1e9); return [CX + dx * t, CY + dy * t]; };
      links.forEach(function (L) {
        if (L.link.up === false) return;
        var ca = L.angle, be = bodyEdge(ca), ce = cylEdge(ca);
        s += ln(ce, be, 'var(--xto-link,#00e5ff)', rich ? 2 : 1.8, false);
        s += '<circle cx="' + ce[0].toFixed(1) + '" cy="' + ce[1].toFixed(1) + '" r="3.5" fill="var(--xto-link,#00e5ff)"/>';
      });
    }

    // ── (2b) IF markers (small squares on the edge) = drawn after the body (front, visible as edge ports). color = physical link color ──
    links.forEach(function (L) {
      var m = bodyEdge(L.angle), mc = L.link.up !== false ? 'var(--xto-link,#00e5ff)' : 'var(--xto-linkDown,#ff4d4d)';
      s += '<rect x="' + (m[0] - 4).toFixed(1) + '" y="' + (m[1] - 4).toFixed(1) + '" width="8" height="8" fill="var(--xto-bg,#0d1620)" stroke="' + mc + '" stroke-width="1.5"/>';
    });

    // ── (3) processGlyph = dot + colored-text process legend. 'none'|'inside'|'outside' (placement folded into one axis) ──
    // Compact legend dots (no oversized ball). established = full color / not-established = pale.
    //   inside = vertical stack inside the body's top-left / outside = horizontal row outside the top edge (avoids overlapping the radial arrow paths).
    //   protocolOrder = legend order only (tunnel layer order = DATA-CONTRACT §4.7, untouched).
    if (ax.processGlyph === 'inside' || ax.processGlyph === 'outside') {
      var order = [], rank = { bgp: 2, ospf: 1, static: 0 }, upset = {};
      (node.links || []).forEach(function (lk) { (lk.protocols || []).forEach(function (p) { if (order.indexOf(p.proto) < 0) order.push(p.proto); if (p.up) upset[p.proto] = 1; }); });
      order.sort(function (a, b) { return (rank[b] || 0) - (rank[a] || 0); });
      if (ax.protocolOrder === 'ospf-top') order.reverse();
      var topY = (shape === 'rect' ? CY - HH : CY - RER), leftX = (shape === 'rect' ? CX - HW : CX - RER);
      if (ax.processGlyph === 'inside') {
        order.forEach(function (p, i) {
          var up = !!upset[p], col = up ? protoCol(p) : 'var(--xto-pale,#8aa0ab)', ly = topY + 15 + i * 14, lx = leftX + 9;
          s += '<circle cx="' + lx.toFixed(1) + '" cy="' + (ly - 3).toFixed(1) + '" r="4" fill="' + col + '"' + (up ? '' : ' opacity="0.6"') + '/>';
          s += '<text x="' + (lx + 8).toFixed(1) + '" y="' + ly.toFixed(1) + '" fill="' + col + '" font-size="10.5" font-family="monospace"' + (up ? '' : ' opacity="0.7"') + '>' + p.toUpperCase() + '</text>';
        });
      } else { // outside: place the legend in the largest angular gap with no link (empty sector) = neither arrows nor beams cross it (dynamic,
        //   topology-independent). Even with 3+ radial peers the legend auto-escapes into the link gap (no link crossing).
        var angs = links.map(function (L) { return L.angle; }).sort(function (a, b) { return a - b; });
        var gapMid = -Math.PI / 2, gapSize = -1;                    // default = up (when there are 0 links)
        for (var gi = 0; gi < angs.length; gi++) {
          var a1 = angs[gi], a2 = (gi + 1 < angs.length) ? angs[gi + 1] : angs[0] + 2 * Math.PI, g = a2 - a1;
          if (g > gapSize) { gapSize = g; gapMid = a1 + g / 2; }
        }
        if (gapMid > Math.PI) gapMid -= 2 * Math.PI;
        var lr = (shape === 'rect' ? Math.max(HW, HH) : RER) + 26, anc = pt(gapMid, lr), totalH = order.length * 14;
        order.forEach(function (p, i) {
          var up = !!upset[p], col = up ? protoCol(p) : 'var(--xto-pale,#8aa0ab)', ly = anc[1] - totalH / 2 + 10 + i * 14, lx = anc[0] - 14;
          s += '<circle cx="' + lx.toFixed(1) + '" cy="' + (ly - 3).toFixed(1) + '" r="4" fill="' + col + '"' + (up ? '' : ' opacity="0.6"') + '/>';
          s += '<text x="' + (lx + 8).toFixed(1) + '" y="' + ly.toFixed(1) + '" fill="' + col + '" font-size="10.5" font-family="monospace"' + (up ? '' : ' opacity="0.7"') + '>' + p.toUpperCase() + '</text>';
        });
      }
    }

    // ── (4) forwarding arrow (from inside the body -> body edge of the selected out-iface. radial = the exit side) ──
    // forwarding gate: when the route is unresolved (initial / DROP), no arrow / ping is drawn
    //   (opt.forwarding===false). Default (unspecified) = true = as before. hello is separate (adjacency), shown when OSPF is up.
    var fwd = !(axes && axes.forwarding === false);
    var selL = links.filter(function (L) { return L.link.selected; })[0] || links[0];
    if (selL && fwd) {
      // stop the arrow just short of the edge IF marker (8px) to avoid overlap
      var oa = selL.angle, _e = bodyEdge(oa), ti = [_e[0] - Math.cos(oa) * 9, _e[1] - Math.sin(oa) * 9], hs = 9;
      var from = pt(oa, (shape === 'rect' ? Math.min(HW, HH) : RER) * 0.2);
      var acol = ax.arrowMode === 'proto' ? protoCol((linkLayers(selL.link)[0] || {}).proto) : 'var(--xto-ok,#39ff14)';
      s += ln(from, ti, acol, 3.5, false);
      s += '<polygon fill="' + acol + '" points="' + ti[0].toFixed(1) + ',' + ti[1].toFixed(1) + ' ' +
        (ti[0] - Math.cos(oa - 0.5) * hs).toFixed(1) + ',' + (ti[1] - Math.sin(oa - 0.5) * hs).toFixed(1) + ' ' +
        (ti[0] - Math.cos(oa + 0.5) * hs).toFixed(1) + ',' + (ti[1] - Math.sin(oa + 0.5) * hs).toFixed(1) + '"/>';
    }

    // ── animated orbs along real angles: the orb follows the selected link's real-angle path (SVG animateMotion). ──
    //   Additive (only when the axes.animDemo flag is set). ping = center -> out (forwarding, cyan) /
    //   hello = both directions along OSPF-up links (green, adjacency). The animateMotion path works at any angle.
    // animMode axis (none|on) + animSpeed (default 1). Toggle/parameterization only; ping/hello behavior is unchanged.
    //   energy/beam parity can be added later via the same animateMotion mechanism.
    var spd = (axes && +axes.animSpeed) || 1;
    if (axes && axes.animMode === 'on') {
      // ping orb: along the selected link, from inside the body -> toward the peer (forwarding). Only when fwd (route resolved).
      if (selL && fwd) {
        var pa = selL.angle, pp0 = pt(pa, (shape === 'rect' ? Math.min(HW, HH) : RER) * 0.2), pp1 = pt(pa, R - 6);
        s += '<circle r="' + (rich ? 4 : 3) + '" fill="var(--xto-link,#00e5ff)" style="filter:drop-shadow(0 0 5px var(--xto-link,#00e5ff))">' +
          '<animateMotion dur="' + (1.5 / spd).toFixed(2) + 's" repeatCount="indefinite" path="M ' + pp0[0].toFixed(1) + ' ' + pp0[1].toFixed(1) + ' L ' + pp1[0].toFixed(1) + ' ' + pp1[1].toFixed(1) + '"/></circle>';
      }
      // hello orb: along each OSPF-up link, orange (idle = the hello/keepalive mechanism color; kept distinct from the green established tunnel)
      //   + 2 lanes (perpendicular ±offset): upper lane (+off) = send body->peer / lower lane (−off) = receive peer->body.
      //   = reproduces the classic "send/receive on the two sides of a link" at a variable angle (reusing the tunnel's perpendicular-offset mechanism).
      links.forEach(function (L) {
        if (L.link.up === false) return;
        if (!(L.link.protocols || []).some(function (p) { return p.proto === 'ospf' && p.up; })) return;
        // hello lanes sit in the "gap" (±~3) between the link (cyan center) and the OSPF tunnel (green ±6):
        //   the tunnel (green) is the "result" of exchanging hellos, not the lane the orb runs in -> separate the
        //   mechanism (hello) from the result (tunnel) into different channels. This lets hello-without-tunnel / tunnel-without-hello later visualize causality and failures.
        var ha = L.angle, perp = [-Math.sin(ha), Math.cos(ha)], off = rich ? 3 : 2.5, hc = 'var(--xto-idle,#ff8c00)';
        var hb = bodyEdge(ha), he = pt(ha, R - 6);
        function o2(p, d) { return [p[0] + perp[0] * d, p[1] + perp[1] * d]; }
        var sb = o2(hb, off), se = o2(he, off), rb = o2(he, -off), rE = o2(hb, -off);   // send = +off / receive = −off
        var hd = (1.8 / spd);   // offset send/receive by half a period (begin=hd/2) so they alternate along the link
        s += '<circle r="2.6" fill="' + hc + '" opacity="0.9"><animateMotion dur="' + hd.toFixed(2) + 's" repeatCount="indefinite" path="M ' + sb[0].toFixed(1) + ' ' + sb[1].toFixed(1) + ' L ' + se[0].toFixed(1) + ' ' + se[1].toFixed(1) + '"/></circle>';
        s += '<circle r="2.6" fill="' + hc + '" opacity="0.9"><animateMotion dur="' + hd.toFixed(2) + 's" begin="' + (hd / 2).toFixed(2) + 's" repeatCount="indefinite" path="M ' + rb[0].toFixed(1) + ' ' + rb[1].toFixed(1) + ' L ' + rE[0].toFixed(1) + ' ' + rE[1].toFixed(1) + '"/></circle>';
      });
    }

    // ── (5) node label (small, below the body) ──
    s += '<text x="' + CX + '" y="' + (CY + (shape === 'rect' ? HH : RER) - 6).toFixed(1) + '" fill="var(--xto-muted,#5f7d8a)" font-size="9" font-family="monospace" text-anchor="middle">' + node.target + '</text>';
    s += '</svg>';
    return s;
  }

  // ── backward compat: legacy clab-collect state (single <peer>_proto) -> per-link node ──
  function fromLegacyState(state) {
    var ifs = state.interfaces || {}, links = [];
    Object.keys(ifs).forEach(function (ifn) {
      if (ifn === 'lo') return;
      var peer = ''; Object.keys(state).forEach(function (k) { var m = /^(.+)_iface$/.exec(k); if (m && state[k] === ifn) peer = m[1]; });
      var proto = (peer && state[peer + '_proto']) || state.protocol || 'ospf';
      var up = peer && state[peer + '_has_full'] != null ? !!state[peer + '_has_full'] : true;
      links.push({ iface: ifn, peer: peer, protocols: [{ proto: proto === 'bgp' ? 'bgp' : 'ospf', up: up }] });
    });
    return { target: state.target_node, links: links, positions: state._positions || {} };
  }

  function render(container, node, axes) { if (container) container.innerHTML = xrayRenderUnified(node, axes); }

  root.XrayUnified = {
    render: render, renderSvg: xrayRenderUnified, geometry: xrayRadialGeometry,
    fromLegacyState: fromLegacyState, PRESETS: PRESETS
  };
})(typeof window !== 'undefined' ? window : this);
