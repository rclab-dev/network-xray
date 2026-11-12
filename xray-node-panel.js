/*
 * xray-node-panel.js — drop-in, dependency-free "single-node" X-Ray panel.
 *
 * Renders ONE router's control-plane tables — Routing table + BGP table + Best-Path Decision —
 * as position-INDEPENDENT text panels (no graph, no coordinates, no D3). Made for embedding beside
 * any topology GUI whose node layout you don't control, e.g. a containerlab / vscode-containerlab
 * "Node Properties" tab: the user picks a node, you drop that node's state in here.
 *
 *   XrayNodePanel.render(containerEl, nodeState);   // containerEl = element or "#id" / selector
 *
 * `nodeState` = the object clab-collect.js emits per node (see DATA-CONTRACT.md). Fields used:
 *   routing_table [{prefix,out_iface,next_hop,protocol,selected}]   -> Routing table
 *   bgp_routes    [{prefix,prefixlen?,vrf?,next_hop,as_path,local_pref,weight,metric,origin,best,status,reason?}]
 *                 -> BGP table + Best-Path (one destination = prefix/length in one VRF; `reason` = the reason the
 *                    collector stored for the best path: FRR's selectionReason, or what the IOS-XE collector worked out)
 *   route_resolution.matched_prefix  -> highlights the forwarding-decision row in the routing table
 *   target_node / protocol / bgp_configured / nos  -> labels & empty-state text (nos = 'ios-xe' words the reason)
 *
 * Zero dependencies: plain DOM + one injected <style>. Nothing here reads window geometry, so the
 * output is identical no matter where the node sits in the graph. Best-Path logic is ported verbatim
 * from this gallery's xray-api.js facade (Weight -> LocPrf -> AS-Path -> Origin -> MED, each step among the
 * paths still in play), so the "why this path won" explanation matches the DeepDive exactly.  MIT — reuse freely.
 */
(function (root) {
  'use strict';

  function esc(s) {
    return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
  function attr(s) { return esc(s).replace(/'/g, '&#39;'); }   // an attribute value: quotes of both kinds escaped
  function panel(title, bodyHtml) {
    return '<div class="xnp-panel"><div class="xnp-title">' + esc(title) + '</div>' + bodyHtml + '</div>';
  }

  // ---------- Best-Path decision (ported verbatim from xray-api.js — generic, hardcode-free) ----------
  var BGP_CRIT = [
    { key: 'weight', col: 'weight', label: 'Weight',  dir: 1,  val: function (r) { return bnum(r.weight, 0); } },
    { key: 'locprf', col: 'locprf', label: 'LocPrf',  dir: 1,  val: function (r) { return bnum(r.local_pref, 100); } },
    { key: 'aspath', col: 'path',   label: 'AS-Path', dir: -1, val: function (r) { return r.as_path ? r.as_path.split(/\s+/).filter(Boolean).length : 0; } },
    { key: 'origin', col: 'path',   label: 'Origin',  dir: -1, val: function (r) { var m = { i: 0, e: 1, '?': 2, igp: 0, egp: 1, incomplete: 2 }; var o = String(r.origin == null ? '' : r.origin).trim().toLowerCase(); return (o in m) ? m[o] : 3; } },   /* nx_readme_audit_v2: the collectors write IGP / EGP / incomplete */
    { key: 'metric', col: 'metric', label: 'MED',     dir: -1, val: function (r) { return bnum(r.metric, 0); } }
  ];
  function bnum(v, d) { var n = parseInt(v, 10); return isNaN(n) ? d : n; }
  function nbrAS(r) { var t = (r.as_path || '').split(/\s+/).filter(Boolean); return t.length ? t[0] : ''; }
  function isBest(r) { return (r.status || '').indexOf('>') !== -1 || r.best === true; }
  function decide(group) {
    if (!group || !group.length) return null;
    var best = null, i; for (i = 0; i < group.length; i++) { if (isBest(group[i])) { best = group[i]; break; } }
    if (!best) return { kind: 'nobest' };
    var localOrigin = bnum(best.weight, 0) === 32768;
    if (group.length < 2) return { kind: localOrigin ? 'local' : 'single', best: best, col: null };
    // Each step compares the best only with the paths still in play after the earlier steps (a path cut at LocPrf no
    // longer counts at AS-Path), the same as xray-api.js / xray-core.js. MED is compared only among the remaining paths
    // of the best's neighbor AS. Before, every step compared the whole group again, so three paths where a step cut
    // some but not all came out "no single decider".
    var chain = [], medSkipped = false, alive = group, c;
    for (c = 0; c < BGP_CRIT.length; c++) {
      var crit = BGP_CRIT[c], bv = crit.val(best), cohort = alive;
      if (crit.key === 'metric') {
        var bAS = nbrAS(best); cohort = alive.filter(function (r) { return nbrAS(r) === bAS; });
        if (cohort.length < 2) {
          var anyDiff = alive.some(function (r) { return r !== best && crit.val(r) !== bv; });
          chain.push({ crit: crit, bestVal: bv, cmpVal: anyDiff ? null : bv, status: anyDiff ? 'skip' : 'tie' });
          if (anyDiff) medSkipped = true; continue;
        }
      }
      var cmp = null; cohort.forEach(function (r) { if (r === best) return; var v = crit.val(r); cmp = (cmp === null) ? v : (crit.dir > 0 ? Math.max(cmp, v) : Math.min(cmp, v)); });
      if (cohort.every(function (r) { return crit.val(r) === bv; })) { chain.push({ crit: crit, bestVal: bv, cmpVal: cmp, status: 'tie' }); continue; }
      if (!cohort.every(function (r) { return r === best || (crit.dir > 0 ? bv >= crit.val(r) : bv <= crit.val(r)); })) {   // only a better path makes it ambiguous
        chain.push({ crit: crit, bestVal: bv, cmpVal: cmp, status: 'amb' }); return { kind: 'ambiguous', best: best, chain: chain, col: null };
      }
      if (cohort.some(function (r) { return r !== best && crit.val(r) === bv; })) {   // some tie, the rest fall out
        alive = cohort.filter(function (r) { return crit.val(r) === bv; }); chain.push({ crit: crit, bestVal: bv, cmpVal: bv, status: 'tie' }); continue;
      }
      chain.push({ crit: crit, bestVal: bv, cmpVal: cmp, status: 'win' });
      return { kind: 'decided', best: best, chain: chain, criterion: crit, bestVal: bv, cmpVal: cmp, col: crit.col };
    }
    return { kind: medSkipped ? 'medskip' : 'tie', best: best, chain: chain, col: null };
  }
  function chainHtml(chain) {
    if (!chain || !chain.length) return '';
    var parts = chain.map(function (st) {
      var op = st.crit.dir > 0 ? '>' : '<';
      if (st.status === 'skip') return '<span class="xnp-step-tie">' + st.crit.label + ' (skipped: diff AS)</span>';
      if (st.status === 'tie') { var t = (st.crit.key === 'origin') ? (st.crit.label + ' (tie)') : (st.crit.label + ' ' + st.bestVal + '=' + st.cmpVal); return '<span class="xnp-step-tie">' + t + '</span>'; }
      var txt = (st.crit.key === 'origin') ? st.crit.label : (st.crit.label + ' ' + st.bestVal + op + st.cmpVal);
      return '<span class="xnp-step-' + (st.status === 'win' ? 'win' : 'amb') + '">' + txt + (st.status === 'win' ? ' ✅' : ' ?') + '</span>';
    });
    return '<div class="xnp-chain">' + parts.join(' → ') + '</div>';
  }
  // The reason the collector stored for the best path (DATA-CONTRACT 4.4 `reason`; `sel_reason` is read as a synonym):
  // FRR's own selectionReason, or the step the IOS-XE collector worked out from the printed columns. "First path
  // received" / "Nothing to select" name no step, so they are not used.
  function storedReason(best) {
    var r = best && (typeof best.reason === 'string' ? best.reason : (typeof best.sel_reason === 'string' ? best.sel_reason : ''));
    r = String(r || '').trim();
    return /^(first path received|nothing to select)$/i.test(r) ? '' : r;
  }
  function reasonHtml(p, dec, nos) {
    if (!dec) return '';
    if (dec.kind === 'nobest') return '<div class="xnp-reason xnp-note">◦ ' + esc(p) + ' → no valid path</div>';
    if (dec.kind === 'single') return '<div class="xnp-reason xnp-note">★ ' + esc(p) + ' → <b>only path</b> (no alternatives)</div>';
    if (dec.kind === 'local') return '<div class="xnp-reason xnp-note">★ ' + esc(p) + ' → <b>locally originated</b> (always preferred)</div>';
    var ch = chainHtml(dec.chain);
    if (dec.kind === 'decided') {
      var op = dec.criterion.dir > 0 ? '>' : '<';
      var cmp = (dec.criterion.key !== 'origin' && dec.cmpVal !== null) ? ' (' + dec.bestVal + ' ' + op + ' ' + dec.cmpVal + ')' : '';
      return '<div class="xnp-reason">★ ' + esc(p) + ' → best path by <b>' + dec.criterion.label + '</b>' + cmp + '</div>' + ch;
    }
    // The visible attributes do not decide. A stored reason names the step; without one, the tie is decided by a step
    // the table does not show (FRR: eBGP > iBGP -> IGP metric -> Older Path -> Router ID) and no single step is asserted.
    var fr = storedReason(dec.best);
    var by = fr ? 'best path by <b>' + esc(fr) + '</b>' + (nos === 'ios-xe' ? ' (derived by the collector from the IOS-XE table; IOS-XE reports no reason)' : ' (reported by FRR)')
      : 'decided by <b>a step the table does not show</b> (eBGP &gt; iBGP → IGP metric → Older Path → Router ID)';
    if (dec.kind === 'medskip') return '<div class="xnp-reason xnp-note">★ ' + esc(p) + ' → <b>MED not compared</b> (different neighbor AS) — ' + by + '</div>' + ch;
    if (dec.kind === 'tie') return '<div class="xnp-reason xnp-note">★ ' + esc(p) + ' → all visible attributes equal — ' + by + '</div>' + ch;
    return '<div class="xnp-reason xnp-note">★ ' + esc(p) + ' → <b>no single decider</b> — ' + (fr ? by : 'a later step not in the data') + '</div>' + ch;
  }
  // one destination = the prefix with its length (FRR gives `prefix` without it and `prefixlen` beside it) in one VRF
  function destOf(r) {
    var p = String(r.prefix || ''), len = r.prefixlen;
    if (p.indexOf('/') < 0 && len != null && len !== '') p += '/' + len;
    var v = r.vrf; v = (v == null || v === '' || v === 'default') ? '' : String(v);
    return { label: p, vrf: v, key: v + '|' + p };
  }
  // bgpView(routes, opts?)  —  opts.nos = the node's OS ('ios-xe' words a stored reason as the collector's, not FRR's)
  function bgpView(routes, opts) {
    var nos = opts && opts.nos, order = [], groups = {};
    routes.forEach(function (r) { var d = destOf(r); if (!groups[d.key]) { groups[d.key] = { dest: d, rows: [] }; order.push(d.key); } groups[d.key].rows.push(r); });
    var html = '<table class="xnp-bgp"><thead><tr><th>St</th><th>Network</th><th>Next-Hop</th><th>Metric</th><th>LocPrf</th><th>Weight</th><th>Path</th></tr></thead><tbody>';
    var reasons = '';
    order.forEach(function (k) {
      var grp = groups[k].rows, d = groups[k].dest, dec = decide(grp), decCol = (dec && dec.kind === 'decided') ? dec.col : null;
      var vrfTag = d.vrf ? ' <span class="xnp-vrf">[vrf ' + esc(d.vrf) + ']</span>' : '';
      grp.forEach(function (rt) {
        var best = isBest(rt), w = (rt.weight === 0 || rt.weight) ? rt.weight : '';
        var nh = rt.next_hop || rt.nexthop || '';
        var pathDisp = (rt.as_path || '') + (rt.origin ? ((rt.as_path ? ' ' : '') + rt.origin) : '');
        var lpDisp = (rt.local_pref != null && rt.local_pref !== '') ? esc(rt.local_pref) : '<span class="xnp-default">100</span>';
        function cell(name, val) { return '<td' + (best && decCol === name ? ' class="xnp-decider"' : '') + '>' + val + '</td>'; }
        html += '<tr' + (best ? ' class="xnp-best"' : '') + '>' +
          '<td><span class="xnp-st">' + esc(rt.status || (rt.best ? '*>' : '* ')) + '</span></td>' +
          '<td>' + esc(d.label) + vrfTag + '</td>' +
          '<td>' + esc(nh) + '</td>' +
          cell('metric', esc(rt.metric == null || rt.metric === '' ? '' : rt.metric)) + cell('locprf', lpDisp) + cell('weight', esc(w)) + cell('path', esc(pathDisp)) +
          '</tr>';
      });
      reasons += reasonHtml(d.label + (d.vrf ? ' [vrf ' + d.vrf + ']' : ''), dec, nos);
    });
    html += '</tbody></table>';
    if (reasons) reasons += '<div class="xnp-legend">Best-path order: Weight → LocPrf → AS-Path → Origin → MED</div>';
    return { table: html, decision: reasons };
  }

  // ---------- Routing table (prefix -> out-iface) ----------
  function routingHtml(state, sel, clickable) {
    var rt = state.routing_table || [];
    if (!rt.length) return '';
    var rows = rt.map(function (r) {
      var on = sel && r.prefix === sel;
      var dst = r.out_iface || r.next_hop || '—';
      return '<tr' + (on ? ' class="xnp-sel"' : '') + (clickable ? ' data-prefix="' + esc(r.prefix) + '"' : '') +
        ' data-find="' + attr([r.prefix, dst, r.protocol || ''].join(' ').toLowerCase()) + '">' +
        '<td>' + esc(r.prefix) + '</td>' +
        '<td>→ ' + esc(dst) + '</td>' +
        '<td class="xnp-proto">' + esc(r.protocol || '') + '</td></tr>';
    }).join('');
    // a filter (prefix / interface / protocol, typed text kept across re-renders) and the count per exit interface
    var byIf = {}; rt.forEach(function (r) { var k = r.out_iface || r.next_hop || '—'; byIf[k] = (byIf[k] || 0) + 1; });
    var counts = Object.keys(byIf).sort(function (a, b) { return byIf[b] - byIf[a] || (a < b ? -1 : 1); })
      .map(function (k) { return '<span class="xnp-cnt" data-find="' + attr(k.toLowerCase()) + '">' + esc(k) + ' ' + byIf[k] + '</span>'; }).join(' ');
    var tools = rt.length > 8 ? '<div class="xnp-tools"><input class="xnp-find" type="search" placeholder="filter: prefix, interface, protocol" aria-label="filter the routing table">' +
      '<div class="xnp-counts">' + rt.length + ' routes · ' + counts + '</div></div>' : '';
    // the table scrolls inside its own box (as in the Full DeepDive): a long table never pushes the figure out of view
    return panel('Routing table', tools + '<div class="xnp-scroll xnp-rt-box"><table class="xnp-rt' + (clickable ? ' xnp-click' : '') + '"><tbody>' + rows + '</tbody></table></div>');
  }

  // ---------- Node figure (position-INDEPENDENT: own fan layout, never reads graph coords) ----------
  function ifaceMap(state) {
    var ifs = state.interfaces || {}, out = {};
    Object.keys(ifs).forEach(function (ifn) {
      var peer = '';
      Object.keys(state).forEach(function (k) { var m = /^(.+)_iface$/.exec(k); if (m && state[k] === ifn) peer = m[1]; });
      var link = (state.peer_links || []).filter(function (l) { return l.iface === ifn; })[0];
      if (link) peer = link.peer;
      out[ifn] = { peer: peer, ip: (ifs[ifn] && ifs[ifn].ip) || '' };
    });
    // if the collector gave no interface list, fall back to the out-ifaces seen in the routing table
    if (!Object.keys(out).length) {
      (state.routing_table || []).forEach(function (r) { if (r.out_iface && r.out_iface !== 'lo' && !out[r.out_iface]) out[r.out_iface] = { peer: '', ip: '' }; });
    }
    return out;
  }
  function selOutIface(state, sel) {
    var row = (state.routing_table || []).filter(function (r) { return r.prefix === sel; })[0];
    return row ? (row.out_iface || '') : '';
  }
  // positions (optional) = { nodeName: {x,y} } straight from the topology JSON / annotations. When
  // given, each interface link is drawn at the REAL angle toward its peer (matches the graph); without
  // them it falls back to a fixed fan (still works, just position-independent).
  function ifaceAngles(state, names, ifm, positions) {
    var self = (positions && state.target_node) ? positions[state.target_node] : null, ang = {};
    if (self) {
      names.forEach(function (ifn) {
        var pp = ifm[ifn].peer && positions[ifm[ifn].peer];
        ang[ifn] = pp ? Math.atan2(pp.y - self.y, pp.x - self.x) : null;   // screen coords (y down) = graph dir
      });
      var miss = names.filter(function (n) { return ang[n] == null; });     // peers without a position: spread
      miss.forEach(function (ifn, i) { ang[ifn] = -Math.PI / 2 + (i + 1) * (Math.PI / (miss.length + 1)); });
    } else {
      names.forEach(function (ifn, i) { ang[ifn] = names.length === 1 ? 0 : (-0.62 + i * (1.24 / (names.length - 1))); });
    }
    return ang;
  }
  // is the adjacency/session on this interface up? (OSPF Full / BGP Established -> colour the tunnel)
  // A physically up interface alone is not an adjacency: without <peer>_has_full there is no tunnel colour.
  function adjUp(state, ifn, peer) {
    var i = state.interfaces && state.interfaces[ifn];
    if (i && i.up === false) return false;
    if (peer && state[peer + '_has_full'] != null) return !!state[peer + '_has_full'];
    return false;
  }
  // tunnel colour is a PER-LINK property (the adjacency/session on that link), not a per-node one:
  // read <peer>_proto for this interface's neighbour, falling back to the node's overall protocol.
  // Both ends carry the same <peer>_proto, so the same link is coloured identically from either side.
  function linkProto(state, peer) { var p = (peer && state[peer + '_proto']) || state.protocol; return p === 'bgp' ? 'bgp' : 'ospf'; }
  function pcolOf(state, peer) { return linkProto(state, peer) === 'bgp' ? 'var(--xnp-bgp)' : 'var(--xnp-ospf)'; }
  function figureSvg(state, sel, positions) {
    var ifm = ifaceMap(state);
    var names = Object.keys(ifm).filter(function (n) { return n !== 'lo'; });
    var W = 420, H = 340, CX = W / 2, CY = H / 2, HW = 70, HH = 52, RER = 38, R = 132;
    var ang = ifaceAngles(state, names, ifm, positions);
    function edge(a) { var dx = Math.cos(a), dy = Math.sin(a), t = Math.min(dx ? HW / Math.abs(dx) : 1e9, dy ? HH / Math.abs(dy) : 1e9); return [CX + dx * t, CY + dy * t]; }
    function re(a) { return [CX + Math.cos(a) * RER, CY + Math.sin(a) * RER]; }   // point on the white RE circle
    var num = function (v) { return v.toFixed(1); };
    var s = '<svg class="xnp-fig" viewBox="0 0 ' + W + ' ' + H + '" width="100%" preserveAspectRatio="xMidYMid meet">';
    // node box (rounded rect) — drawn first so links/circle sit on top
    s += '<rect x="' + (CX - HW) + '" y="' + (CY - HH) + '" width="' + (HW * 2) + '" height="' + (HH * 2) + '" rx="12" fill="var(--xnp-bg)" stroke="var(--xnp-ok)" stroke-width="2"/>';
    // interface links: run from the white RE circle all the way out to the peer — gray PHYSICAL wire +
    // a protocol-coloured TUNNEL overlay when the adjacency is up (green=OSPF Full, purple=BGP Established)
    names.forEach(function (ifn) {
      var a = ang[ifn], r0 = re(a), ex = CX + Math.cos(a) * R, ey = CY + Math.sin(a) * R, bp = edge(a), up = adjUp(state, ifn, ifm[ifn].peer);
      var pcol = pcolOf(state, ifm[ifn].peer);   // colour THIS link by ITS adjacency protocol
      var anchor = Math.cos(a) < -0.35 ? 'end' : (Math.cos(a) > 0.35 ? 'start' : 'middle');
      var lx = CX + Math.cos(a) * (R + 8), ly = CY + Math.sin(a) * (R + 8) + 4;
      s += '<line x1="' + num(r0[0]) + '" y1="' + num(r0[1]) + '" x2="' + num(ex) + '" y2="' + num(ey) + '" stroke="var(--xnp-phys)" stroke-width="7" stroke-linecap="round"/>';
      if (up) s += '<line x1="' + num(r0[0]) + '" y1="' + num(r0[1]) + '" x2="' + num(ex) + '" y2="' + num(ey) + '" stroke="' + pcol + '" stroke-width="3.5" stroke-linecap="round"/>';
      s += '<rect x="' + num(bp[0] - 5) + '" y="' + num(bp[1] - 5) + '" width="10" height="10" fill="var(--xnp-bg)" stroke="' + (up ? pcol : 'var(--xnp-phys)') + '" stroke-width="1.5"/>' +
        '<text x="' + num(lx) + '" y="' + num(ly) + '" fill="var(--xnp-accent)" font-size="13" font-family="monospace" text-anchor="' + anchor + '">' + esc(ifn) + (ifm[ifn].peer ? ' — ' + esc(ifm[ifn].peer) : '') + '</text>';
    });
    // white RoutingEngine circle on top (links terminate at its edge)
    s += '<circle cx="' + CX + '" cy="' + CY + '" r="' + RER + '" fill="var(--xnp-bg)" stroke="var(--xnp-fg)" stroke-width="2.5"/>';
    // forwarding arrow INSIDE the white circle, pointing toward the selected out-iface.
    // Colour it by the forwarding protocol so it stays coherent with the BGP/OSPF tunnel (was fixed green).
    var oif = selOutIface(state, sel);
    var _selRow = (state.routing_table || []).filter(function (r) { return r.prefix === sel; })[0];
    var _fwdBgp = (_selRow && _selRow.protocol === 'bgp') || (state.route_resolution && state.route_resolution.protocol === 'bgp');
    var _fwdCol = _fwdBgp ? 'var(--xnp-bgp)' : 'var(--xnp-ok)';
    if (oif && ang[oif] != null) {
      var a2 = ang[oif], ti = [CX + Math.cos(a2) * (RER - 9), CY + Math.sin(a2) * (RER - 9)], hs = 9;
      s += '<line x1="' + CX + '" y1="' + CY + '" x2="' + num(ti[0]) + '" y2="' + num(ti[1]) + '" stroke="' + _fwdCol + '" stroke-width="4"/>' +
        '<polygon fill="' + _fwdCol + '" points="' + num(ti[0]) + ',' + num(ti[1]) + ' ' + num(ti[0] - Math.cos(a2 - 0.5) * hs) + ',' + num(ti[1] - Math.sin(a2 - 0.5) * hs) + ' ' + num(ti[0] - Math.cos(a2 + 0.5) * hs) + ',' + num(ti[1] - Math.sin(a2 + 0.5) * hs) + '"/>';
    } else {
      s += '<circle cx="' + CX + '" cy="' + CY + '" r="5" fill="#a678e0"/>' +
        (oif === 'lo' ? '<text x="' + CX + '" y="' + (CY - HH - 8) + '" fill="var(--xnp-ok)" font-size="11" text-anchor="middle">→ lo (self)</text>' : '');
    }
    // legend + caption (a node can now have both OSPF and BGP links, so show both tunnel swatches)
    s += '<text x="14" y="' + (H - 26) + '" fill="var(--xnp-ospf)" font-size="11" font-family="monospace">━ OSPF</text>' +
      '<text x="72" y="' + (H - 26) + '" fill="var(--xnp-bgp)" font-size="11" font-family="monospace">━ BGP tunnel</text>' +
      '<text x="14" y="' + (H - 11) + '" fill="var(--xnp-phys)" font-size="11" font-family="monospace">━ physical link</text>';
    var cap = (state.target_node || 'node') + (sel ? '  ' + sel + (oif ? ' → ' + oif : '') : '');
    s += '<text x="' + (W - 14) + '" y="' + (H - 11) + '" fill="var(--xnp-ok)" font-size="12" text-anchor="end" font-family="monospace">' + esc(cap) + '</text></svg>';
    return '<div class="xnp-panel xnp-figpanel">' + s + '</div>';
  }

  function wrongHtml(state) {
    var ifs = state.interfaces || {}, o = state.ospf_ifaces, nb = Array.isArray(state.bgp_neighbors) ? state.bgp_neighbors : null;
    var hasO = !!(o && typeof o === 'object' && !Array.isArray(o));
    if (!hasO && !nb) return '';
    var items = [];
    Object.keys(ifs).forEach(function (k) { if (!/^lo/i.test(k) && ifs[k] && ifs[k].up === false) items.push(['down', esc(k) + ': interface down']); });
    var nbrState = function (ifn) { var l = Array.isArray(state.ospf_neighbors) ? state.ospf_neighbors : []; for (var i = 0; i < l.length; i++) if (l[i] && l[i].iface === ifn && l[i].state) return String(l[i].state).split('/')[0]; return ''; };
    var lbl = { mtu: 'MTU', hello: 'hello', dead: 'dead', network_type: 'network type', area: 'area', auth: 'auth', passive: 'passive' };
    var val = function (f, v) { return v == null || v === '' ? '?' : f === 'passive' ? (v ? 'yes' : 'no') : String(v); };
    if (hasO) Object.keys(o).forEach(function (ifn) {
      var r = o[ifn]; if (!r || typeof r !== 'object' || Array.isArray(r) || (ifs[ifn] && ifs[ifn].up === false)) return;
      var mm = Array.isArray(r.mismatch) ? r.mismatch : [], st = nbrState(ifn), adj = r.neighbors_adjacent > 0 || /^full/i.test(st);
      var rem = r.remote && typeof r.remote === 'object' ? r.remote : {};
      var pairs = mm.map(function (f) { return (lbl[f] || f) + ' ' + val(f, r[f]) + ' \u21d4 ' + val(f, rem[f]); }).join(' · ');
      var head = esc(ifn) + (r.peer ? ' \u2192 ' + esc(r.peer) : '') + ': OSPF ';
      if (mm.length && adj) items.push(['warn', head + 'Full, but ' + esc(pairs)]);
      else if (mm.length) items.push(['down', head + 'no adjacency \u2014 ' + esc(pairs)]);
      else if (!adj && r.peer && r.passive !== true && (r.neighbors_adjacent === 0 || (st && !/^full/i.test(st)))) items.push(['down', head + 'no adjacency' + (st ? ' (' + esc(st) + ')' : '')]);
    });
    (nb || []).forEach(function (b) {
      if (!b || /^established/i.test(String(b.state || ''))) return;
      items.push(['down', 'BGP ' + esc(b.ip || b.peer_ip || '?') + (b.remote_as ? ' (AS ' + esc(b.remote_as) + ')' : '') + ': ' + esc(b.state || 'not established')]);
    });
    var body = items.length ? items.map(function (it) { return '<div class="xnp-wrong-' + it[0] + '">' + (it[0] === 'warn' ? '\u26a0 ' : '\u2715 ') + it[1] + '</div>'; }).join('')
      : '<div class="xnp-wrong-none">\u2713 No mismatch or down adjacency</div>';
    return panel("What's wrong", body);
  }
  function bgpHtml(state) {
    var routes = state.bgp_routes;
    if (!routes || !routes.length) {
      // only show an empty BGP box for nodes that actually run BGP (avoid noise on pure-OSPF nodes)
      if (state.protocol !== 'bgp' && !state.bgp_configured) return '';
      return panel('BGP Table', '<div class="xnp-dim">no routes (BGP session not established)</div>');
    }
    var v = bgpView(routes, { nos: state.nos });
    var tgt = state.target_node ? ' (' + state.target_node + ')' : '';
    return panel('BGP Table — show ip bgp' + tgt, '<div class="xnp-scroll xnp-bgp-box">' + v.table + '</div>') +
      (v.decision ? panel('Best-Path Decision', v.decision) : '');
  }

  function injectCss() {
    if (document.getElementById('xray-node-panel-css')) return;
    var s = document.createElement('style'); s.id = 'xray-node-panel-css';
    // Every colour/size is a CSS custom property with a default, so a host can re-theme the panel by
    // overriding the variables on .xnp-root (or any ancestor) — e.g. map them to VS Code theme vars.
    s.textContent =
      '.xnp-root{' +
        '--xnp-fg:#cfe8ee;--xnp-bg:#0b141c;--xnp-border:#1f3a2a;--xnp-accent:#4dd0e1;' +
        '--xnp-route-fg:#bfe8c8;--xnp-muted:#5f7d8a;--xnp-sel-bg:#12331f;--xnp-ok:#39e639;' +
        '--xnp-bgp-header:#9a7fd1;--xnp-decider:#e0a84d;--xnp-decider-strong:#ffd54f;--xnp-note:#7facc9;' +
        '--xnp-ospf:#39e639;--xnp-bgp:#9a7fd1;--xnp-phys:#46586a;' +
        '--xnp-font:12px/1.45 "Cascadia Code",Consolas,Menlo,monospace;' +
        'font:var(--xnp-font);color:var(--xnp-fg)}' +
      '.xnp-panel{background:var(--xnp-bg);border:1px solid var(--xnp-border);border-radius:6px;padding:8px 10px;margin:0 0 10px 0}' +
      '.xnp-title{color:var(--xnp-accent);font-weight:700;letter-spacing:.3px;margin-bottom:6px}' +
      '.xnp-rt{border-collapse:collapse;width:100%}' +
      '.xnp-rt td{padding:2px 8px 2px 0;color:var(--xnp-route-fg);white-space:nowrap}' +
      '.xnp-rt td.xnp-proto{color:var(--xnp-muted);font-size:11px;text-align:right;width:100%}' +
      '.xnp-rt tr.xnp-sel td{background:var(--xnp-sel-bg);color:var(--xnp-ok)}' +
      '.xnp-bgp{border-collapse:collapse;width:100%}' +
      '.xnp-bgp th{color:var(--xnp-bgp-header);font-weight:600;text-align:left;padding:2px 10px 4px 0;border-bottom:1px solid var(--xnp-border)}' +
      '.xnp-bgp td{padding:2px 10px 2px 0;white-space:nowrap;color:var(--xnp-fg)}' +
      '.xnp-bgp tr.xnp-best td{color:var(--xnp-ok)}' +
      '.xnp-bgp .xnp-st{color:var(--xnp-ok);font-weight:700}' +
      '.xnp-bgp td.xnp-decider{outline:1px solid var(--xnp-decider);outline-offset:-1px;border-radius:2px}' +
      '.xnp-bgp .xnp-default{color:var(--xnp-muted)}' +
      '.xnp-bgp .xnp-vrf{color:var(--xnp-muted);font-size:10px}' +
      '.xnp-reason{color:var(--xnp-fg);margin-top:4px}.xnp-reason b{color:var(--xnp-decider-strong)}' +
      '.xnp-reason.xnp-note{color:var(--xnp-note)}' +
      '.xnp-chain{margin-top:3px;font-size:10px;color:var(--xnp-muted);line-height:1.6}' +
      '.xnp-chain .xnp-step-tie{color:var(--xnp-muted)}.xnp-chain .xnp-step-win{color:var(--xnp-decider-strong);font-weight:700}.xnp-chain .xnp-step-amb{color:var(--xnp-decider);font-weight:700}' +
      '.xnp-legend{margin-top:6px;font-size:10px;color:var(--xnp-muted)}' +
      '.xnp-dim{color:var(--xnp-muted)}' +
      '.xnp-figpanel{padding:6px 8px;position:sticky;top:0;z-index:2}.xnp-fig{display:block;max-height:360px}' +
      // the scroll bar is always shown (overflow-y: scroll = the browser's own bar, dark with color-scheme; Firefox: thin), and a soft
      // shade at the top / bottom edge says there is more (also where the system hides the bar until touched: macOS, phones)
      '.xnp-scroll{max-height:var(--xnp-scroll-h,240px);overflow-y:scroll;overscroll-behavior:contain;color-scheme:dark;' +
        'background:linear-gradient(var(--xnp-bg) 30%,rgba(11,20,28,0)) center top,linear-gradient(rgba(11,20,28,0),var(--xnp-bg) 70%) center bottom,' +
        'radial-gradient(farthest-side at 50% 0,rgba(77,208,225,.35),rgba(0,0,0,0)) center top,radial-gradient(farthest-side at 50% 100%,rgba(77,208,225,.35),rgba(0,0,0,0)) center bottom;' +
        'background-repeat:no-repeat;background-size:100% 28px,100% 28px,100% 10px,100% 10px;background-attachment:local,local,scroll,scroll}' +
      '@supports (-moz-appearance:none){.xnp-scroll{scrollbar-width:thin;scrollbar-color:#3a9aa8 #12232e}}' +
      '.xnp-tools{margin:0 0 6px 0}.xnp-find{width:100%;box-sizing:border-box;background:var(--xnp-bg);color:var(--xnp-fg);border:1px solid var(--xnp-border);border-radius:4px;padding:3px 6px;font:inherit}' +
      '.xnp-counts{margin-top:4px;font-size:10px;color:var(--xnp-muted);line-height:1.6}.xnp-cnt{cursor:pointer;white-space:nowrap}.xnp-cnt:hover{color:var(--xnp-accent)}' +
      '.xnp-wrong-down{color:#ff6b6b}.xnp-wrong-warn{color:var(--xnp-decider-strong)}.xnp-wrong-none{color:var(--xnp-ok)}' +
      '.xnp-rt.xnp-click tr[data-prefix]{cursor:pointer}' +
      '.xnp-rt.xnp-click tr[data-prefix]:hover td{background:var(--xnp-sel-bg)}';
    document.head.appendChild(s);
  }

  // the routing table filter: hide the rows that do not contain the text; a count (an exit interface) fills the box
  function applyFind(container, text) {
    var t = String(text || '').trim().toLowerCase();
    var rows = container.querySelectorAll('.xnp-rt tr[data-find]');
    Array.prototype.forEach.call(rows, function (tr) { tr.style.display = !t || tr.getAttribute('data-find').indexOf(t) >= 0 ? '' : 'none'; });
  }
  function wireFind(container, focus) {
    var inp = container.querySelector('.xnp-find'); if (!inp) return;
    inp.value = container._xnpFind || '';
    applyFind(container, inp.value);
    inp.addEventListener('input', function () { container._xnpFind = inp.value; applyFind(container, inp.value); });
    Array.prototype.forEach.call(container.querySelectorAll('.xnp-cnt'), function (c) {
      c.addEventListener('click', function () { inp.value = c.getAttribute('data-find'); container._xnpFind = inp.value; applyFind(container, inp.value); });
    });
    if (focus) { try { inp.focus(); inp.setSelectionRange(inp.value.length, inp.value.length); } catch (e) {} }
  }
  // scroll only the box (not the page or the host) so that the row is inside it; scrollIntoView would move every scroller
  function boxShow(box, row) {
    if (!box || !row || !box.getBoundingClientRect) return;
    var b = box.getBoundingClientRect(), r = row.getBoundingClientRect();
    if (r.top < b.top) box.scrollTop -= (b.top - r.top);
    else if (r.bottom > b.bottom) box.scrollTop += (r.bottom - b.bottom);
  }
  function defaultSel(state) {
    if (state.route_resolution && state.route_resolution.matched_prefix) return state.route_resolution.matched_prefix;
    var rt = state.routing_table || [];
    var nonLocal = rt.filter(function (r) { return r.out_iface && r.out_iface !== 'lo'; })[0];
    return (nonLocal || rt[0] || {}).prefix || '';
  }
  // render(container, state, opts?)  —  opts.figure:true adds the node figure with a clickable route arrow
  function render(container, state, opts) {
    if (typeof document === 'undefined') return;
    if (typeof container === 'string') container = document.getElementById(container.replace(/^#/, '')) || document.querySelector(container);
    if (!container) return;
    injectCss();
    opts = opts || {};
    state = state || {};
    container.classList.add('xnp-root');
    if (container._xnpNode !== state.target_node) container._xnpSel = '';
    container._xnpNode = state.target_node;
    var fig = !!opts.figure;
    var sel = fig ? (container._xnpSel || defaultSel(state)) : ((state.route_resolution && state.route_resolution.matched_prefix) || '');
    if (fig) container._xnpSel = sel;
    var keep = {}, same = container._xnpBoxNode === state.target_node;   // the boxes are rebuilt below: keep where the reader had scrolled them (same node only)
    ['.xnp-rt-box', '.xnp-bgp-box'].forEach(function (q) { var b = container.querySelector(q); if (b && same) keep[q] = b.scrollTop; });
    container._xnpBoxNode = state.target_node;
    var _f0 = container.querySelector('.xnp-find'), _hadFocus = !!(_f0 && typeof document !== 'undefined' && document.activeElement === _f0);
    if (!same) container._xnpFind = ''; else if (_f0) container._xnpFind = _f0.value;
    container.innerHTML = wrongHtml(state) + (fig ? figureSvg(state, sel, opts.positions) : '') + routingHtml(state, sel, fig) + bgpHtml(state);
    wireFind(container, _hadFocus);
    Object.keys(keep).forEach(function (q) { var b = container.querySelector(q); if (b) b.scrollTop = keep[q]; });
    boxShow(container.querySelector('.xnp-rt-box'), container.querySelector('.xnp-rt tr.xnp-sel'));
    if (fig) {   // click a routing row -> move the arrow to that prefix's out-iface (interactive)
      var rows = container.querySelectorAll('.xnp-rt.xnp-click tr[data-prefix]');
      Array.prototype.forEach.call(rows, function (tr) {
        tr.addEventListener('click', function () { container._xnpSel = tr.getAttribute('data-prefix'); render(container, state, opts); });
      });
    }
  }

  var api = { render: render, buildBgpView: bgpView };   // buildBgpView exposed for custom layouts
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.XrayNodePanel = api;
})(typeof window !== 'undefined' ? window : this);
