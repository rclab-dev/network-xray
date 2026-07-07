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
 *   bgp_routes    [{prefix,next_hop,as_path,local_pref,weight,metric,origin,best,status}] -> BGP table + Best-Path
 *   route_resolution.matched_prefix  -> highlights the forwarding-decision row in the routing table
 *   target_node / protocol / bgp_configured  -> labels & empty-state text
 *
 * Zero dependencies: plain DOM + one injected <style>. Nothing here reads window geometry, so the
 * output is identical no matter where the node sits in the graph. Best-Path logic is ported verbatim
 * from this gallery's xray-api.js facade (Weight -> LocPrf -> AS-Path -> Origin -> MED), so the "why
 * this path won" explanation matches the DeepDive exactly.  MIT — reuse freely.
 */
(function (root) {
  'use strict';

  function esc(s) {
    return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }
  function panel(title, bodyHtml) {
    return '<div class="xnp-panel"><div class="xnp-title">' + esc(title) + '</div>' + bodyHtml + '</div>';
  }

  // ---------- Best-Path decision (ported verbatim from xray-api.js — generic, hardcode-free) ----------
  var BGP_CRIT = [
    { key: 'weight', col: 'weight', label: 'Weight',  dir: 1,  val: function (r) { return bnum(r.weight, 0); } },
    { key: 'locprf', col: 'locprf', label: 'LocPrf',  dir: 1,  val: function (r) { return bnum(r.local_pref, 100); } },
    { key: 'aspath', col: 'path',   label: 'AS-Path', dir: -1, val: function (r) { return r.as_path ? r.as_path.split(/\s+/).filter(Boolean).length : 0; } },
    { key: 'origin', col: 'path',   label: 'Origin',  dir: -1, val: function (r) { var m = { i: 0, e: 1, '?': 2 }; return (r.origin in m) ? m[r.origin] : 3; } },
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
    var chain = [], medSkipped = false, c;
    for (c = 0; c < BGP_CRIT.length; c++) {
      var crit = BGP_CRIT[c], bv = crit.val(best), cohort = group;
      if (crit.key === 'metric') {
        var bAS = nbrAS(best); cohort = group.filter(function (r) { return nbrAS(r) === bAS; });
        if (cohort.length < 2) {
          var anyDiff = group.some(function (r) { return r !== best && crit.val(r) !== bv; });
          chain.push({ crit: crit, bestVal: bv, cmpVal: null, status: anyDiff ? 'skip' : 'tie' });
          if (anyDiff) medSkipped = true; continue;
        }
      }
      var cmp = null; cohort.forEach(function (r) { if (r === best) return; var v = crit.val(r); cmp = (cmp === null) ? v : (crit.dir > 0 ? Math.max(cmp, v) : Math.min(cmp, v)); });
      if (cohort.every(function (r) { return crit.val(r) === bv; })) { chain.push({ crit: crit, bestVal: bv, cmpVal: cmp, status: 'tie' }); continue; }
      if (!cohort.every(function (r) { return r === best || (crit.dir > 0 ? bv > crit.val(r) : bv < crit.val(r)); })) {
        chain.push({ crit: crit, bestVal: bv, cmpVal: cmp, status: 'amb' }); return { kind: 'ambiguous', best: best, chain: chain, col: null };
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
  function reasonHtml(p, dec) {
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
    if (dec.kind === 'medskip') return '<div class="xnp-reason xnp-note">★ ' + esc(p) + ' → <b>MED not compared</b> (different neighbor AS) — tiebreak by Router ID</div>' + ch;
    if (dec.kind === 'tie') return '<div class="xnp-reason xnp-note">★ ' + esc(p) + ' → all attributes equal — <b>tiebreak by Router ID</b></div>' + ch;
    return '<div class="xnp-reason xnp-note">★ ' + esc(p) + ' → <b>no single decider</b> — lower-level tiebreak</div>' + ch;
  }
  function bgpView(routes) {
    var order = [], groups = {};
    routes.forEach(function (r) { var p = r.prefix || ''; if (!groups[p]) { groups[p] = []; order.push(p); } groups[p].push(r); });
    var html = '<table class="xnp-bgp"><thead><tr><th>St</th><th>Network</th><th>Next-Hop</th><th>Metric</th><th>LocPrf</th><th>Weight</th><th>Path</th></tr></thead><tbody>';
    var reasons = '';
    order.forEach(function (p) {
      var grp = groups[p], dec = decide(grp), decCol = (dec && dec.kind === 'decided') ? dec.col : null;
      grp.forEach(function (rt) {
        var best = isBest(rt), w = (rt.weight === 0 || rt.weight) ? rt.weight : '';
        var nh = rt.next_hop || rt.nexthop || '';
        var pathDisp = (rt.as_path || '') + (rt.origin ? ((rt.as_path ? ' ' : '') + rt.origin) : '');
        var lpDisp = (rt.local_pref != null && rt.local_pref !== '') ? esc(rt.local_pref) : '<span class="xnp-default">100</span>';
        function cell(name, val) { return '<td' + (best && decCol === name ? ' class="xnp-decider"' : '') + '>' + val + '</td>'; }
        html += '<tr' + (best ? ' class="xnp-best"' : '') + '>' +
          '<td><span class="xnp-st">' + esc(rt.status || (rt.best ? '*>' : '* ')) + '</span></td>' +
          '<td>' + esc(rt.prefix || '') + '</td>' +
          '<td>' + esc(nh) + '</td>' +
          cell('metric', esc(rt.metric || '')) + cell('locprf', lpDisp) + cell('weight', esc(w)) + cell('path', esc(pathDisp)) +
          '</tr>';
      });
      reasons += reasonHtml(p, dec);
    });
    html += '</tbody></table>';
    if (reasons) reasons += '<div class="xnp-legend">Best-path order: Weight → LocPrf → AS-Path → Origin → MED</div>';
    return { table: html, decision: reasons };
  }

  // ---------- Routing table (prefix -> out-iface) ----------
  function routingHtml(state) {
    var rt = state.routing_table || [];
    if (!rt.length) return '';
    var sel = (state.route_resolution && state.route_resolution.matched_prefix) || '';
    var rows = rt.map(function (r) {
      var on = sel && r.prefix === sel;
      var dst = r.out_iface || r.next_hop || '—';
      return '<tr' + (on ? ' class="xnp-sel"' : '') + '>' +
        '<td>' + esc(r.prefix) + '</td>' +
        '<td>→ ' + esc(dst) + '</td>' +
        '<td class="xnp-proto">' + esc(r.protocol || '') + '</td></tr>';
    }).join('');
    return panel('Routing table', '<table class="xnp-rt"><tbody>' + rows + '</tbody></table>');
  }

  function bgpHtml(state) {
    var routes = state.bgp_routes;
    if (!routes || !routes.length) {
      // only show an empty BGP box for nodes that actually run BGP (avoid noise on pure-OSPF nodes)
      if (state.protocol !== 'bgp' && !state.bgp_configured) return '';
      return panel('BGP Table', '<div class="xnp-dim">no routes (BGP session not established)</div>');
    }
    var v = bgpView(routes);
    var tgt = state.target_node ? ' (' + esc(state.target_node) + ')' : '';
    return panel('BGP Table — show ip bgp' + tgt, v.table) +
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
      '.xnp-reason{color:var(--xnp-fg);margin-top:4px}.xnp-reason b{color:var(--xnp-decider-strong)}' +
      '.xnp-reason.xnp-note{color:var(--xnp-note)}' +
      '.xnp-chain{margin-top:3px;font-size:10px;color:var(--xnp-muted);line-height:1.6}' +
      '.xnp-chain .xnp-step-tie{color:var(--xnp-muted)}.xnp-chain .xnp-step-win{color:var(--xnp-decider-strong);font-weight:700}.xnp-chain .xnp-step-amb{color:var(--xnp-decider);font-weight:700}' +
      '.xnp-legend{margin-top:6px;font-size:10px;color:var(--xnp-muted)}' +
      '.xnp-dim{color:var(--xnp-muted)}';
    document.head.appendChild(s);
  }

  function render(container, state) {
    if (typeof document === 'undefined') return;
    if (typeof container === 'string') container = document.getElementById(container.replace(/^#/, '')) || document.querySelector(container);
    if (!container) return;
    injectCss();
    state = state || {};
    container.classList.add('xnp-root');
    container.innerHTML = routingHtml(state) + bgpHtml(state);
  }

  var api = { render: render, buildBgpView: bgpView };   // buildBgpView exposed for custom layouts
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.XrayNodePanel = api;
})(typeof window !== 'undefined' ? window : this);
