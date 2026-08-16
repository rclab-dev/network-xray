// xray-api.js — a small, clean facade over the X-Ray render engine (xray-core.js).
//
// The engine itself is driven through a handful of window globals and a specific DOM
// setup. This wrapper hides that: you get one object, `xrayCore`, with a tidy API:
//
//   xrayCore.applyTheme('troubleshoot');
//   var view = xrayCore.renderTopology('#topo', config, { topology, trace });
//   view.applyState(state);                       // one snapshot
//   view.startPolling(() => fetch('/state').then(r=>r.json()), 3000);  // or live
//
// Load order: <script src="xray-core.js"></script> THEN <script src="xray-api.js"></script>.
// `config` / `state` shapes are documented in DATA-CONTRACT.md.

(function () {
  'use strict';

  var _pollTimer = null;
  var _bgpSrc = null;     // Seam C source (rows array or function(state) -> rows)
  var _lastState = null;  // last applied snapshot (so the BGP table can reflect it)
  var _lastConfig = null; // last rendered config (so openDeepDiveFor can re-target the cylinder)

  function _need(name) {
    if (typeof window[name] !== 'function') {
      throw new Error('xrayCore: window.' + name + ' is missing — load xray-core.js before xray-api.js');
    }
  }

  // The engine disables ALL page buttons/links while is-xray-mode is on (it neutralizes
  // a host product's portal chrome). For a standalone library that would break the host
  // page's own controls, so we re-enable them (everything except the router→ttyd links).
  // Injected once; the repeated class out-specifies the engine's !important rule.
  function _ensureInteractive() {
    if (document.getElementById('xraycore-interactive')) return;
    var st = document.createElement('style');
    st.id = 'xraycore-interactive';
    var sel = 'body' + new Array(13).join('.is-xray-mode');
    // The engine's disable rule (.is-xray-mode button:not(...):not(#font-size-btn)) carries ID-level
    // specificity. Two !important rules are decided by specificity, so to win we must match its ID
    // tier: append two bogus :not(#id) (never match → selection unchanged) for ID specificity 2 > 1.
    var idBump = ':not(#_xcA):not(#_xcB)';
    st.textContent = sel + ' button:not(.topo-box-link)' + idBump + ',' + sel + ' a:not(.topo-box-link)' + idBump +
      '{pointer-events:auto!important;cursor:pointer!important}';
    (document.head || document.documentElement).appendChild(st);
  }

  // Set the CSS theme variables. mode: 'troubleshoot' | 'capture' | 'destroy'.
  function applyTheme(mode) {
    _need('xrayApplyTheme');
    window.xrayApplyTheme(mode || 'troubleshoot');
  }

  // Seam A — inject a static topology snapshot ({ subnets, nodes }) for per-link UP/DOWN.
  function setTopology(topo) {
    window._xrayTopologyData = topo;
    window._xrayEnsureTopology = function () { window._xrayTopologyData = topo; };
  }

  // Seam B — inject a static traceroute ({ success, reached, hops }) for the path arrows.
  function setTrace(trace) {
    window.__xcTrace = trace;
    window._xrayTraceFetcher = function () { return Promise.resolve(window.__xcTrace); };
  }

  // Seam C — the DeepDive "BGP Table" box (the control-plane RIB shown inside the cylinder,
  // next to the Routing Engine panel). The engine ships its CSS but in the full product the rows
  // come from the server; in a standalone page you supply them here. `src` is an array of
  // { prefix, nexthop, status } rows, or a function(state) -> rows so the table can reflect the
  // current snapshot (e.g. empty until the BGP session is Established). Repaints on applyState.
  function setBgpTable(src) { _bgpSrc = src; _paintBgpTable(); }
  function _bgpRows() {
    if (!_bgpSrc) return null;
    return (typeof _bgpSrc === 'function' ? _bgpSrc(_lastState) : _bgpSrc) || [];
  }
  // --- Best-Path Decision (best-path evaluation view) ---
  // Generic, hardcode-free: group candidate paths per prefix and explain WHY the best won (Weight →
  // LocPrf → AS-Path → Origin → MED tie-break). Reads the clab collector's bgp_routes shape.
  var _BGP_CRIT = [
    { key: 'weight', col: 'weight', label: 'Weight',  dir: 1,  val: function (r) { return _bnum(r.weight, 0); } },
    { key: 'locprf', col: 'locprf', label: 'LocPrf',  dir: 1,  val: function (r) { return _bnum(r.local_pref, 100); } },
    { key: 'aspath', col: 'path',   label: 'AS-Path', dir: -1, val: function (r) { return r.as_path ? r.as_path.split(/\s+/).filter(Boolean).length : 0; } },
    { key: 'origin', col: 'path',   label: 'Origin',  dir: -1, val: function (r) { var m = { i: 0, e: 1, '?': 2 }; return (r.origin in m) ? m[r.origin] : 3; } },
    { key: 'metric', col: 'metric', label: 'MED',     dir: -1, val: function (r) { return _bnum(r.metric, 0); } }
  ];
  function _bnum(v, d) { var n = parseInt(v, 10); return isNaN(n) ? d : n; }
  function _bNbrAS(r) { var t = (r.as_path || '').split(/\s+/).filter(Boolean); return t.length ? t[0] : ''; }
  function _bIsBest(r) { return (r.status || '').indexOf('>') !== -1 || r.best === true; }
  function _bgpDecision(group) {
    if (!group || !group.length) return null;
    var best = null; for (var i = 0; i < group.length; i++) { if (_bIsBest(group[i])) { best = group[i]; break; } }
    if (!best) return { kind: 'nobest' };
    var localOrigin = _bnum(best.weight, 0) === 32768;
    if (group.length < 2) return { kind: localOrigin ? 'local' : 'single', best: best, col: null };
    var chain = [], medSkipped = false;
    for (var c = 0; c < _BGP_CRIT.length; c++) {
      var crit = _BGP_CRIT[c], bv = crit.val(best), cohort = group;
      if (crit.key === 'metric') {
        var bAS = _bNbrAS(best); cohort = group.filter(function (r) { return _bNbrAS(r) === bAS; });
        if (cohort.length < 2) { var anyDiff = group.some(function (r) { return r !== best && crit.val(r) !== bv; });
          chain.push({ crit: crit, bestVal: bv, cmpVal: null, status: anyDiff ? 'skip' : 'tie' }); if (anyDiff) medSkipped = true; continue; }
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
  function _bgpChain(chain) {
    if (!chain || !chain.length) return '';
    var parts = chain.map(function (st) {
      var op = st.crit.dir > 0 ? '>' : '<';
      if (st.status === 'skip') return '<span class="bgp-step-tie">' + st.crit.label + ' (skipped: diff AS)</span>';
      if (st.status === 'tie') { var t = (st.crit.key === 'origin') ? (st.crit.label + ' (tie)') : (st.crit.label + ' ' + st.bestVal + '=' + st.cmpVal); return '<span class="bgp-step-tie">' + t + '</span>'; }
      var txt = (st.crit.key === 'origin') ? st.crit.label : (st.crit.label + ' ' + st.bestVal + op + st.cmpVal);
      return '<span class="bgp-step-' + (st.status === 'win' ? 'win' : 'amb') + '">' + txt + (st.status === 'win' ? ' ✅' : ' ?') + '</span>';
    });
    return '<div class="bgp-chain">' + parts.join(' → ') + '</div>';
  }
  function _bgpReason(p, dec) {
    if (!dec) return '';
    if (dec.kind === 'nobest') return '<div class="bgp-reason bgp-reason-note">◦ ' + p + ' → no valid path</div>';
    if (dec.kind === 'single') return '<div class="bgp-reason bgp-reason-note">★ ' + p + ' → <b>only path</b> (no alternatives)</div>';
    if (dec.kind === 'local') return '<div class="bgp-reason bgp-reason-note">★ ' + p + ' → <b>locally originated</b> (always preferred)</div>';
    var ch = _bgpChain(dec.chain);
    if (dec.kind === 'decided') {
      var op = dec.criterion.dir > 0 ? '>' : '<';
      var cmp = (dec.criterion.key !== 'origin' && dec.cmpVal !== null) ? ' (' + dec.bestVal + ' ' + op + ' ' + dec.cmpVal + ')' : '';
      var href = _bgpTier3Href(p, (dec._grp || []));   // routes carried on dec._grp (set in _bgpBuildView)
      var btn = '<span class="bgp-crit-btn" role="button" tabindex="0" data-bgp-crit>' + dec.criterion.label + '</span>';
      // pop is the IMMEDIATE next sibling of .bgp-reason (the delegated handler resolves it that way);
      // the inline chain summary follows the pop.
      return '<div class="bgp-reason">★ ' + p + ' → best path by ' + btn + cmp + '</div>' + _bgpBracketPop(dec, href) + ch;
    }
    // (iii) A visible-attribute tie is NOT decided by Router ID by default — FRR's real tie-breaker is
    //   Older Path (RFC 5004); Router ID applies only with `bgp bestpath compare-routerid`. The oldest
    //   path can't be derived from a `show ip bgp` snapshot (no receive timestamp), so we name the
    //   FRR rule rather than assert a specific winner. (A backend that supplies selectionReason would
    //   state the exact reason.)
    var _rfc5004 = ' (<a class="bgp-rfc-link" href="https://www.rfc-editor.org/rfc/rfc5004" target="_blank" rel="noopener">RFC 5004</a>; Router ID only with compare-routerid)';
    if (dec.kind === 'medskip') return '<div class="bgp-reason bgp-reason-note">★ ' + p + ' → <b>MED not compared</b> (different neighbor AS) — FRR breaks the tie by <b>Older Path</b>' + _rfc5004 + '</div>' + ch;
    if (dec.kind === 'tie') return '<div class="bgp-reason bgp-reason-note">★ ' + p + ' → all visible attributes equal — FRR breaks the tie by <b>Older Path</b>' + _rfc5004 + '</div>' + ch;
    return '<div class="bgp-reason bgp-reason-note">★ ' + p + ' → <b>no single decider</b> — lower-level tiebreak (Older Path / Router ID)</div>' + ch;
  }
  // --- Interactive decider: Tier2 popover (all decision steps) + Tier3 full-bracket link. ---
  // gallery is IIFE-private, so no inline onclick — the decision panel gets ONE delegated handler
  // (wired in _paintBgpTable); the HTML carries data-* attributes only.
  // Language: gallery has no lang variable (xrayI18nLang / _lang don't exist here); pages declare
  // <html lang>. Gallery pages are lang="en", so this returns 'en' for the OSS/Show HN default.
  function _bgpLang() {
    var l = (document.documentElement.getAttribute('lang') || 'en').toLowerCase();
    return l.indexOf('ja') === 0 ? 'ja' : 'en';
  }
  // Tier3 link — relative URL to the standalone decision-bracket.html, data-driven via base64url.
  // Encoding matches decision-bracket.html's decoder exactly (btoa(unescape(encodeURIComponent))
  // + url-safe  ↔  decodeURIComponent(escape(atob(url-unsafe)))). Payload shape = Tier3 DEFAULT.
  function _bgpTier3Href(prefix, grp) {
    try {
      var routes = (grp || []).map(function (r, i) {
        return { id: String.fromCharCode(65 + i), via: 'via ' + (r.next_hop || r.nexthop || '?'), as: 'AS' + (_bNbrAS(r) || '?'),
          attrs: { weight: _bnum(r.weight, 0), localpref: _bnum(r.local_pref, 100),
            aspathlen: r.as_path ? r.as_path.split(/\s+/).filter(Boolean).length : 0,
            origin: ({ i: 1, e: 1, '?': 1 }[r.origin]) ? r.origin : 'i', med: _bnum(r.metric, 0), ebgp: false,
            routerid: r.router_id || ('0.0.0.' + (i + 1)) } };
      });
      var json = JSON.stringify({ prefix: prefix, routes: routes });
      var b64 = btoa(unescape(encodeURIComponent(json))).replace(/\+/g, '-').replace(/\//g, '_');
      return 'decision-bracket.html?d=' + b64 + '&lang=' + _bgpLang();
    } catch (e) { return 'decision-bracket.html?lang=' + _bgpLang(); }
  }
  // Tier2 popover markup — each decision step (win / tie / skipped) + a link to the Tier3 bracket.
  function _bgpBracketPop(dec, tier3Href) {
    var rows = (dec.chain || []).map(function (st) {
      var op = st.crit.dir > 0 ? '&gt;' : '&lt;';
      if (st.status === 'win') {
        var vv = (st.crit.key === 'origin') ? '' : ('<b>' + st.bestVal + ' ' + op + ' ' + st.cmpVal + '</b> ');
        return '<div class="bp-row win"><span class="k">' + st.crit.label + '</span><span class="v">' + vv + '✅</span></div>';
      }
      var vtxt = (st.crit.key === 'origin' || st.status === 'skip') ? (st.status === 'skip' ? '(skipped)' : '=') : (st.bestVal + ' = ' + st.cmpVal);
      return '<div class="bp-row tie"><span class="k">' + st.crit.label + '</span><span class="v">' + vtxt + '</span></div>';
    }).join('');
    var head = dec.criterion.label + ' (' + dec.bestVal + ' ' + (dec.criterion.dir > 0 ? '&gt;' : '&lt;') + ' ' + dec.cmpVal + ')';
    var more = _bgpLang() === 'en' ? 'See all decision steps' : '判定の全ステップを見る';
    return '<div class="de-bgp-bracket-pop" data-bgp-pop>' +
      '<div class="bp-h">' + head + '<button type="button" class="bp-x" data-bgp-x title="close (ESC)">✕</button></div>' +
      rows +
      '<a class="bp-more" href="' + tier3Href + '" target="_blank" rel="noopener" data-bgp-more>' + more + ' ⧉</a>' +
      '</div>';
  }
  function _closeBgpPop() {
    var o = document.querySelectorAll('.de-bgp-bracket-pop.open');
    for (var i = 0; i < o.length; i++) o[i].classList.remove('open');
    document.removeEventListener('click', _bgpOutside);
    document.removeEventListener('keydown', _bgpEsc);
  }
  function _bgpOutside(e) {
    if (!e.target.closest || (!e.target.closest('.de-bgp-bracket-pop') && !e.target.closest('[data-bgp-crit]'))) _closeBgpPop();
  }
  function _bgpEsc(e) { if (e.key === 'Escape') _closeBgpPop(); }
  // Single delegated handler on the (stable) decision panel — toggles the pop, closes on ✕ / outside
  // / ESC, opens the Tier3 link in a new tab. The pop is the immediate next sibling of .bgp-reason.
  function _bgpPanelClick(e) {
    var t = e.target;
    if (t.closest('[data-bgp-x]')) { e.stopPropagation(); _closeBgpPop(); return; }
    if (t.closest('[data-bgp-more]')) { e.preventDefault(); e.stopPropagation(); var a = t.closest('[data-bgp-more]'); window.open(a.href, '_blank', 'noopener'); return; }
    var crit = t.closest('[data-bgp-crit]');
    if (crit) {
      e.stopPropagation();
      var reason = crit.closest('.bgp-reason');
      var pop = reason && reason.nextElementSibling && reason.nextElementSibling.hasAttribute('data-bgp-pop') ? reason.nextElementSibling : null;
      if (!pop) return;
      var open = pop.classList.contains('open');
      _closeBgpPop();
      if (!open) { pop.classList.add('open'); document.addEventListener('click', _bgpOutside); document.addEventListener('keydown', _bgpEsc); }
    }
  }
  function _bgpPanelKey(e) {
    if (e.key !== 'Enter' && e.key !== ' ') return;
    var crit = e.target && e.target.closest && e.target.closest('[data-bgp-crit]');
    if (crit) { e.preventDefault(); _bgpPanelClick({ target: crit, stopPropagation: function () {}, preventDefault: function () {} }); }
  }
  // (iii) The full FRR default best-path order, shown under the decision. It surfaces the deeper
  //   criteria the top-5 heuristic never reaches — notably Older Path (RFC 5004) as the real
  //   tie-breaker before Router ID (which only applies with `bgp bestpath compare-routerid`). The
  //   deciding step (derived here; FRR's selectionReason when a backend supplies one) is highlighted.
  var _BGP_FRR_ORDER = ['Weight', 'LocPrf', 'AS-Path', 'Origin', 'MED', 'eBGP&gt;iBGP', 'IGP metric', 'Older Path', 'Router ID*', 'Neighbor IP'];
  function _bgpOrderLegend(primaryLabel) {
    var parts = _BGP_FRR_ORDER.map(function (lbl) {
      return (primaryLabel && lbl === primaryLabel) ? '<span style="color:#ffd54f;font-weight:700">' + lbl + '</span>' : lbl;
    });
    var note = (_bgpLang() === 'ja')
      ? '* Router ID は compare-routerid 設定時のみ（既定は Older Path が先）'
      : '* Router ID only with `bgp bestpath compare-routerid` (default prefers Older Path)';
    var rfc = ' <a class="bgp-rfc-link" href="https://www.rfc-editor.org/rfc/rfc4271#section-9.1.2.2" target="_blank" rel="noopener">[RFC 4271 §9.1.2.2]</a>';
    return '<div class="bgp-legend" style="overflow-wrap:anywhere">Best-path order (FRR default): ' + parts.join(' &rarr; ') + rfc
      + '<br><span style="opacity:.7">' + note + '</span></div>';
  }
  function _bgpBuildView(routes) {
    var order = [], groups = {};
    routes.forEach(function (r) { var p = r.prefix || ''; if (!groups[p]) { groups[p] = []; order.push(p); } groups[p].push(r); });
    var html = '<table class="de-bgp-table"><thead><tr><th>St</th><th>Network</th><th>Next-Hop</th><th>Metric</th><th>LocPrf</th><th>Weight</th><th>Path</th></tr></thead><tbody>';
    var reasons = '';
    var _primaryLabel = '';   // (iii) first deciding criterion, to highlight in the FRR-order legend
    order.forEach(function (p) {
      var grp = groups[p], dec = _bgpDecision(grp), decCol = (dec && dec.kind === 'decided') ? dec.col : null;
      if (dec) dec._grp = grp;   // Tier3 href needs the candidate routes (min-diff: carry on dec)
      if (dec && dec.kind === 'decided' && dec.criterion && !_primaryLabel) _primaryLabel = dec.criterion.label;
      grp.forEach(function (rt) {
        var isBest = _bIsBest(rt), w = (rt.weight === 0 || rt.weight) ? rt.weight : '';
        var nh = rt.next_hop || rt.nexthop || '';
        var pathDisp = (rt.as_path || '') + (rt.origin ? ((rt.as_path ? ' ' : '') + rt.origin) : '');
        var lpDisp = (rt.local_pref != null && rt.local_pref !== '') ? rt.local_pref : '<span class="bgp-default">100</span>';
        function cell(name, val) { return '<td' + (isBest && decCol === name ? ' class="bgp-decider"' : '') + '>' + val + '</td>'; }
        html += '<tr' + (isBest ? ' class="bgp-best"' : '') + '>' +
          '<td><span class="bgp-st">' + (rt.status || (rt.best ? '*>' : '* ')) + '</span></td>' +
          '<td>' + (rt.prefix || '') + '</td>' +
          '<td>' + nh + '</td>' +
          cell('metric', rt.metric || '') + cell('locprf', lpDisp) + cell('weight', w) + cell('path', pathDisp) +
          '</tr>';
      });
      reasons += _bgpReason(p, dec);
    });
    html += '</tbody></table>';
    if (reasons) reasons += _bgpOrderLegend(_primaryLabel);
    return { table: html, decision: reasons };
  }
  function _bgpInjectCss() {
    if (document.getElementById('xray-bgp-decision-css')) return;
    var s = document.createElement('style'); s.id = 'xray-bgp-decision-css';
    s.textContent = '.bgp-chain{margin-top:3px;font-size:10px;color:#888;line-height:1.6;letter-spacing:0.2px}'
      + '.bgp-chain .bgp-step-tie{color:#6b7b8c}.bgp-chain .bgp-step-win{color:#ffd54f;font-weight:700}.bgp-chain .bgp-step-amb{color:#e0a060;font-weight:700}'
      + '.de-bgp-decision-panel .bgp-reason.bgp-reason-note{color:#7facc9}'
      + '.de-bgp-panel .de-bgp-table,.de-bgp-panel .de-bgp-table td{font-size:calc(12px * var(--xbgp-fs,1))}'
      + '.de-bgp-panel .de-bgp-table th{font-size:calc(11px * var(--xbgp-fs,1))}'
      + '.de-bgp-decision-panel .bgp-reason{font-size:calc(12px * var(--xbgp-fs,1))}'
      + '.de-bgp-decision-panel .bgp-chain,.de-bgp-decision-panel .bgp-legend{font-size:calc(10px * var(--xbgp-fs,1))}'
      // (iii) RFC links in the decision/legend: cyan + clickable. The engine's is-xray-mode pointer-events
      //   guard would otherwise disable them; a higher-specificity override re-enables just these links.
      + '.de-bgp-decision-panel .bgp-rfc-link,.de-bgp-decision-panel .bgp-legend a{color:#22d3ee!important;text-decoration:underline;pointer-events:auto!important;cursor:pointer!important}'
      // (iii)/#3 compact the decision panel so the tall full-FRR-order legend does not push its top up
      //   over the BGP Table's key 8.8.8.0 (LocPref 100 vs 50) row. Older Path/RFC stay INLINE (no
      //   hide-toggle) — just tighter type + spacing to reclaim vertical height (owner-chosen (A)).
      + '.de-bgp-decision-panel .bgp-legend{font-size:calc(9px * var(--xbgp-fs,1));line-height:1.3;margin-top:4px}'
      + '.de-bgp-decision-panel .bgp-legend span{font-size:calc(8.5px * var(--xbgp-fs,1))}'
      + '.de-bgp-decision-panel .bgp-reason{margin:2px 0}'
      + '.de-bgp-decision-panel .bgp-chain{margin-top:2px;line-height:1.4}'
      // Decision panel position: keep it clear of the BGP Table box (both default to
      // left:calc(50%+100px); table top-anchored, decision bottom-anchored).
      // !important so it wins over the engine default AND the older JS measurement below (now inert).
      + '.xray-deep-engine .de-bgp-decision-panel,.dd-engine .de-bgp-decision-panel{top:auto!important;bottom:64px!important;z-index:40!important;left:calc(50% + 100px);right:auto}'
      // When the BGP Table is tall (>=5 routes, e.g. the best-path hero) the bottom-anchored decision
      // panel would ride up into the table's last row. Drop it lower so the two panels stay clear.
      // Scoped to >=5 rows via :has() so the common 2-4 route demos are untouched. !important to win
      // over the bottom:64px rule above (both !important -> higher specificity of :has wins).
      + '.xray-deep-engine:has(.de-bgp-rows tr:nth-child(5)) .de-bgp-decision-panel,.dd-engine:has(.de-bgp-rows tr:nth-child(5)) .de-bgp-decision-panel{bottom:24px!important}'
      + '.xbgp-fs-ctl{float:right;font-weight:400}'
      + '.xbgp-fs-ctl button{background:#16202b;color:#9fb6c2;border:1px solid #2b3a44;border-radius:3px;font-size:11px;line-height:1;padding:1px 6px;margin-left:3px;cursor:pointer}'
      + '.xbgp-fs-ctl button:hover{color:#cfe8ee;border-color:#4dd0e1}'
      // --- interactive decider: clickable criterion + Tier2 bracket popover ---
      + '.de-bgp-decision-panel .bgp-crit-btn{color:#ffd54f;cursor:pointer;border-bottom:1.5px dashed #ffd54f;padding:0 1px;font-weight:800}'
      + '.de-bgp-decision-panel .bgp-crit-btn::after{content:" \\25BE";font-size:0.85em}'
      + '.de-bgp-decision-panel .bgp-crit-btn:hover,.de-bgp-decision-panel .bgp-crit-btn:focus-visible{background:rgba(255,213,79,0.16);border-radius:4px;outline:none}'
      + '.de-bgp-bracket-pop{position:relative;z-index:2;margin-top:8px;background:#0c1a28;border:1px solid rgba(255,213,79,0.55);border-radius:8px;padding:8px 10px;display:none;box-shadow:0 8px 24px -10px rgba(0,0,0,0.8)}'
      + '.de-bgp-bracket-pop.open{display:block}'
      + '.de-bgp-bracket-pop .bp-h{display:flex;align-items:center;font-size:11px;font-weight:700;color:#ffd54f;margin-bottom:6px}'
      + '.de-bgp-bracket-pop .bp-x{margin-left:auto;cursor:pointer;color:#8fb0c8;border:none;background:transparent;font-size:13px;line-height:1;padding:0 2px}'
      + '.de-bgp-bracket-pop .bp-x:hover{color:#ff4d4d}'
      + '.de-bgp-bracket-pop .bp-row{display:flex;justify-content:space-between;gap:14px;font-size:11px;padding:2px 2px;font-variant-numeric:tabular-nums}'
      + '.de-bgp-bracket-pop .bp-row .k{color:#8fb0c8}'
      + '.de-bgp-bracket-pop .bp-row.tie .v{color:#6b7b8c}'
      + '.de-bgp-bracket-pop .bp-row.win{background:rgba(57,255,20,0.08);border-radius:4px}'
      + '.de-bgp-bracket-pop .bp-row.win .v b{color:#00e5ff}'
      + '.de-bgp-bracket-pop .bp-more{display:block;margin-top:8px;padding-top:7px;border-top:1px dashed rgba(255,213,79,0.25);font-size:11px;color:#00e5ff;text-decoration:none;font-weight:700}'
      + '.de-bgp-bracket-pop .bp-more:hover{text-decoration:underline}'
      // belt-and-suspenders: _ensureInteractive already re-enables all a/button at (2,14,2); these
      // explicit rules document intent for the pop controls (the real cascade winner is that rule).
      + '.is-xray-mode .de-bgp-decision-panel a.bp-more{pointer-events:auto!important}'
      + '.is-xray-mode .de-bgp-decision-panel button.bp-x{pointer-events:auto!important}';
    document.head.appendChild(s);
  }
  function _paintBgpTable() {
    var dz0 = document.getElementById('de-bgp-decision-panel');
    if (!_bgpSrc) { if (dz0) dz0.style.display = 'none'; return; }
    var re = document.getElementById('de-re-panel');
    if (!re || !re.parentElement) return;   // cylinder not rendered yet
    _bgpInjectCss();
    var tgt = (window._xrayTargetNode || 'topo-node-r1').replace('topo-node-', '');
    var panel = document.getElementById('de-bgp-panel');
    if (!panel) { panel = document.createElement('div'); panel.className = 'de-panel de-bgp-panel'; panel.id = 'de-bgp-panel'; re.parentElement.appendChild(panel); }
    var dpanel = document.getElementById('de-bgp-decision-panel');
    if (!dpanel) { dpanel = document.createElement('div'); dpanel.className = 'de-panel de-bgp-decision-panel'; dpanel.id = 'de-bgp-decision-panel'; re.parentElement.appendChild(dpanel); }
    // Delegated decider handler — wired once on the stable panel (survives innerHTML repaints).
    if (!dpanel._bgpWired) { dpanel._bgpWired = true; dpanel.addEventListener('click', _bgpPanelClick); dpanel.addEventListener('keydown', _bgpPanelKey); }
    var rows = _bgpRows(), body, decision = '';
    if (!rows || !rows.length) {
      body = '<div class="de-dim">no routes<br>(BGP session not established)</div>';
    } else {
      var view = _bgpBuildView(rows); body = view.table; decision = view.decision;   // table + WHY-best
    }
    panel.innerHTML = '<div class="de-title">BGP Table (' + tgt + ')<span class="xbgp-fs-ctl">'
      + '<button data-fs="dn" title="smaller text">A−</button><button data-fs="up" title="larger text">A+</button></span></div>'
      + '<div class="de-bgp-rows">' + body + '</div>';
    // Don't repaint the decision panel while a bracket pop is open (a poll tick would wipe it) —
    // same guard as the engine's decision repaint (.de-bgp-bracket-pop.open). bgp-paste doesn't poll; noc-live does.
    var popOpen = !!document.querySelector('.de-bgp-bracket-pop.open');
    if (decision) { if (!popOpen) dpanel.innerHTML = '<div class="de-title">Best-Path Decision</div><div class="de-bgp-decision-rows">' + decision + '</div>'; dpanel.style.display = ''; }
    else { if (!popOpen) dpanel.style.display = 'none'; }
    _bgpFontInit();
    var de = document.querySelector('.xray-deep-engine'); if (de) de.style.setProperty('--xbgp-fs', window.__xbgpFs || 1);
    // Decision box position is now CSS-driven (see _bgpInjectCss): bottom:64px + z-index:40,
    // clear of the Table box. (Replaces the old measure-and-stack, which could overlap.)
  }
  function _bgpFontInit() {
    if (window.__xbgpFsInit) return; window.__xbgpFsInit = true; if (window.__xbgpFs == null) window.__xbgpFs = 1;
    document.addEventListener('click', function (e) {
      var b = e.target && e.target.closest && e.target.closest('.xbgp-fs-ctl button'); if (!b) return;
      window.__xbgpFs = Math.max(0.7, Math.min(1.5, (window.__xbgpFs || 1) + (b.getAttribute('data-fs') === 'up' ? 0.1 : -0.1)));
      var de = document.querySelector('.xray-deep-engine'); if (de) de.style.setProperty('--xbgp-fs', window.__xbgpFs);
      // (decision panel position is CSS-driven now — no re-measure needed on font change)
    });
  }

  // DeepDive — the "inside the router" cylinder view (forwarding plane, OSPF/BGP
  // processor, hello/ping beams). The engine renders it from the same config; it stays
  // hidden until deep mode is on, and applyState() drives it just like the overview.
  function _renderDeepEngine(config, targetId) {
    if (typeof window.xrayRenderDeepEngine !== 'function') return;
    var de = document.querySelector('.xray-deep-engine');
    if (de) de.innerHTML = window.xrayRenderDeepEngine(config, targetId);
  }
  // Zoom from the topology overview into the target router's cylinder.
  // Notify host pages (e.g. to sync a toggle button) however the DeepDive was opened/closed
  // — explicit button, target-router click, or the cylinder's built-in ✕.
  function _emitDeep(open) {
    try { document.dispatchEvent(new CustomEvent('xraycore:deepdive', { detail: { open: open } })); }
    catch (e) {}
  }
  // The engine's built-in cylinder close button ships a Japanese label ("✕ 閉じる").
  // For a language-neutral standalone library, relabel it to English. (the full product is unaffected —
  // it doesn't use this facade.) Idempotent; safe to call whenever the cylinder (re)renders.
  function _relabelClose() {
    var btns = document.querySelectorAll('.xray-focus-close');
    for (var i = 0; i < btns.length; i++) btns[i].innerHTML = '&#10005; Close';
  }

  // --- i18n: translate the engine's remaining built-in Japanese UI to English at runtime.
  // The engine (xray-core.js) is shared with a Japanese product; this facade
  // replaces Japanese DOM text/title strings via the window.xrayI18n dictionary (load xray-i18n.js).
  // No-op if absent. The full product does not use this facade.
  var _i18nKeys = null, _i18nObserver = null;
  var _i18nRe = /[①-⓿★☆✕　-ヿ㐀-鿿＀-￯]/;
  function _i18nReplace(s) {
    var d = window.xrayI18n, i, k;
    for (i = 0; i < _i18nKeys.length; i++) { k = _i18nKeys[i]; if (s.indexOf(k) >= 0) s = s.split(k).join(d[k]); }
    return s;
  }
  function _localize(root) {
    var d = window.xrayI18n;
    if (!d) return;
    if (!_i18nKeys) _i18nKeys = Object.keys(d).sort(function (a, b) { return b.length - a.length; });
    root = root || document.body;
    if (!root || !root.querySelectorAll) return;
    var w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, null), nodes = [], n;
    while ((n = w.nextNode())) nodes.push(n);
    for (var i = 0; i < nodes.length; i++) {
      var t = nodes[i].nodeValue;
      if (t && _i18nRe.test(t)) { var nt = _i18nReplace(t); if (nt !== t) nodes[i].nodeValue = nt; }
    }
    var els = root.querySelectorAll('[title]');
    for (var j = 0; j < els.length; j++) {
      var ti = els[j].getAttribute('title');
      if (ti && _i18nRe.test(ti)) { var x = _i18nReplace(ti); if (x !== ti) els[j].setAttribute('title', x); }
    }
  }
  function _localizeLive() {
    if (!window.xrayI18n) return;
    _localize(document.body);
    if (_i18nObserver || typeof MutationObserver !== 'function') return;
    _i18nObserver = new MutationObserver(function () {
      _i18nObserver.disconnect();
      _localize(document.body);
      _i18nObserver.observe(document.body, { childList: true, subtree: true, characterData: true });
    });
    _i18nObserver.observe(document.body, { childList: true, subtree: true, characterData: true });
  }

  // Drive the unified radial DeepDive overlay for radial-capable configs. A config is
  // radial-capable when it carries node positions (config.positions from a .clab.yml graph,
  // used for real per-link bearings) or is flagged deep_engine:'unified' (canonical even fan).
  // The full product drives this from a live poll; this static facade kicks it once, after the
  // zoom settles (is-xray-deep applied), so node-click DeepDive renders the radial engine.
  function _driveUnified() {
    try {
      var cfg = _lastConfig || window._scenarioConfig || {};
      var capable = (cfg.positions && Object.keys(cfg.positions).length) ||
        (cfg.xray && cfg.xray.deep_engine === 'unified') || cfg.deep_engine === 'unified';
      if (!capable) return;
      setTimeout(function () {
        try {
          // The engine helpers look the container up by id; demos mark it with the class only, so give it the id.
          var de = document.querySelector('.xray-deep-engine');
          if (de && !de.id) de.id = 'xray-deep-engine';
          if (typeof window._xrayUnifiedMount === 'function') window._xrayUnifiedMount(cfg);
          window._xrayUnifiedLastSig = null;
          if (typeof window._xrayRenderUnifiedLive === 'function') window._xrayRenderUnifiedLive(window._lastXrayState || {});
        } catch (e) {}
      }, 560);
    } catch (e) {}
  }

  function openDeepDive() {
    document.body.classList.add('is-xray-mode');
    if (typeof window.xrayDeepDiveZoomIn === 'function') window.xrayDeepDiveZoomIn();
    else document.body.classList.add('is-xray-deep');
    _relabelClose();    // English close label
    _paintBgpTable();   // Seam C: (re)inject the BGP table now the cylinder is open
    _localize(document.body);
    _driveUnified();    // radial engine for capable configs (positions / deep_engine:'unified')
    _emitDeep(true);
  }
  // Zoom back out to the overview.
  function closeDeepDive() {
    if (typeof window.xrayDeepDiveClose === 'function') window.xrayDeepDiveClose();
    else document.body.classList.remove('is-xray-deep');
    _emitDeep(false);
  }
  // The cylinder carries a built-in "✕ 閉じる" button that calls closeXrayDeep().
  window.closeXrayDeep = closeDeepDive;

  // Re-target the DeepDive cylinder to ANY node and open it (overview lives in another
  // graph tool, X-Ray provides per-node DeepDive). Lets a host page do node-click → look inside
  // that node, without re-rendering the overview. `state` is that node's snapshot (the caller
  // supplies it — e.g. a per-node collector or the clab bridge); pure, no server fetch.
  // The engine's deep renderer already takes a target id (xrayRenderDeepEngine(config, nodeId))
  // and reads window._xrayTargetNode, so this is a thin re-point + applyState + open.
  function openDeepDiveFor(nodeId, state) {
    if (!nodeId) return;
    if (!_lastConfig) throw new Error('xrayCore: call renderTopology() before openDeepDiveFor()');
    // The engine's deep renderer + zoom are target-centric: the cylinder must be built from a
    // config whose target IS this node (forceTarget), else the zoom can't bind and stays closed.
    var cfg = _lastConfig;
    if (!(cfg.nodes || []).some(function (n) { return n.id === nodeId && n.target; })) {
      cfg = JSON.parse(JSON.stringify(_lastConfig));
      (cfg.nodes || []).forEach(function (n) { n.target = (n.id === nodeId); });
    }
    window._xrayTargetNode = 'topo-node-' + nodeId;
    _renderDeepEngine(cfg, nodeId);           // (re)build the cylinder for this node
    if (state) applyState(state);             // drive its internals (also repaints BGP table + i18n)
    openDeepDive();
  }

  // Apply one state snapshot to the rendered view (see DATA-CONTRACT.md §4).
  function applyState(state) {
    if (typeof window.applyXrayState !== 'function') {
      throw new Error('xrayCore: call renderTopology() before applyState()');
    }
    window.applyXrayState(state);
    _lastState = state;
    _paintBgpTable();   // Seam C: keep the BGP table in sync with the snapshot
    _localize(document.body);
  }

  // Poll a fetcher for fresh data and apply it on an interval. Returns a stop() fn.
  // fetcher() -> (state | {state, topology, trace}) | Promise<...>.
  //   - bare state object        → applyState(state)            (single-snapshot feed)
  //   - {state, topology, trace} → setTopology/setTrace/applyState as present (full live snapshot,
  //     so the overview links/arrows update too — e.g. a NOC telemetry feed).
  function startPolling(fetcher, ms) {
    stopPolling();
    ms = ms || 3000;
    function tick() {
      Promise.resolve(fetcher()).then(function (r) {
        if (!r) return;
        if (r.topology || r.trace || r.state) {
          if (r.topology) setTopology(r.topology);
          if (r.trace) setTrace(r.trace);
          if (r.state) applyState(r.state);
        } else {
          applyState(r);  // bare state (backward compatible)
        }
      }).catch(function () {});
    }
    tick();
    _pollTimer = setInterval(tick, ms);
    return stopPolling;
  }
  function stopPolling() {
    if (_pollTimer) { clearInterval(_pollTimer); _pollTimer = null; }
  }

  // Draw the topology into `selector` and wire the engine to it.
  //   config         — see DATA-CONTRACT.md §3 (nodes / networks / xray / topology_type)
  //   opts.theme     — 'troubleshoot' (default) | 'capture' | 'destroy'
  //   opts.topology  — Seam A static topology snapshot (optional)
  //   opts.trace     — Seam B static traceroute (optional)
  //   opts.interactive — keep router→terminal (ttyd) links live (default: false, links inert)
  // Returns a view: { applyState, setTopology, setTrace, startPolling, stopPolling, target }.
  function renderTopology(selector, config, opts) {
    _need('xrayRenderTopology'); _need('xrayBuildApplyState');
    opts = opts || {};
    var host = typeof selector === 'string' ? document.querySelector(selector) : selector;
    if (!host) throw new Error('xrayCore.renderTopology: container not found: ' + selector);

    applyTheme(opts.theme || 'troubleshoot');

    var nodes = config.nodes || [];
    var target = nodes.filter(function (n) { return n.target; })[0] || nodes[0] || {};
    _lastConfig = config;   // remembered so openDeepDiveFor() can re-target the cylinder later
    window._scenarioConfig = config;
    window._xrayTargetNode = 'topo-node-' + (target.id || 'r1');
    window._xrayLiveIfaceStates = window._xrayLiveIfaceStates || {};

    if (opts.topology) setTopology(opts.topology);
    if (opts.trace) setTrace(opts.trace);

    host.innerHTML = window.xrayRenderTopology(config);
    if (!opts.interactive) {
      // Router boxes may carry live-terminal (ttyd) links; inert by default.
      host.querySelectorAll('a.topo-box-link').forEach(function (a) {
        a.removeAttribute('href'); a.removeAttribute('target');
      });
    }

    window.xrayBuildApplyState(config);
    document.body.classList.add('is-xray-mode');
    _ensureInteractive();

    // Pre-render the DeepDive cylinder for the target router (hidden until openDeepDive()).
    // Add an empty <div class="xray-deep-engine"></div> next to your topo host to enable it.
    _renderDeepEngine(config, target.id);
    _relabelClose();   // English close label on the pre-rendered cylinder
    _localizeLive();

    // UX: click the target router box in the overview to zoom into its DeepDive
    // (in addition to any explicit button). Only when a cylinder host is present.
    if (host.querySelector('a.topo-box-link') && document.querySelector('.xray-deep-engine')) {
      var tnode = document.getElementById('topo-node-' + (target.id || 'r1'));
      if (tnode) {
        tnode.style.cursor = 'pointer';
        tnode.title = 'Open the router (DeepDive)';
        tnode.addEventListener('click', function (e) {
          if (e) e.preventDefault();
          if (!document.body.classList.contains('is-xray-deep')) openDeepDive();
        });
      }
    }

    return {
      target: target.id,
      applyState: applyState,
      setTopology: setTopology,
      setTrace: setTrace,
      setBgpTable: setBgpTable,
      openDeepDive: openDeepDive,
      openDeepDiveFor: openDeepDiveFor,
      closeDeepDive: closeDeepDive,
      startPolling: startPolling,
      stopPolling: stopPolling
    };
  }

  window.xrayCore = {
    applyTheme: applyTheme,
    renderTopology: renderTopology,
    applyState: applyState,
    setTopology: setTopology,
    setTrace: setTrace,
    setBgpTable: setBgpTable,
    openDeepDive: openDeepDive,
    openDeepDiveFor: openDeepDiveFor,
    closeDeepDive: closeDeepDive,
    startPolling: startPolling,
    stopPolling: stopPolling
  };

  // Drop the node "Ping:" overlay line on paste demos: a standalone paste tool can't know the ping
  // target (the full product knows its lab's destination, but arbitrary pasted output carries none), so ping_ok is
  // always false → a misleading "Ping: FAIL". Wrap the two CORE line generators (loaded before this
  // facade) to filter that line; the BGP/OSPF status lines stay. The full product never loads this file → unaffected.
  ['xrayBgpLogicLines', 'xrayOspfLogicLines'].forEach(function (fn) {
    var orig = window[fn];
    if (typeof orig === 'function') {
      window[fn] = function (s) {
        return (orig(s) || []).filter(function (l) { return !/^Ping:/.test((l && l.text) || ''); });
      };
    }
  });
})();
