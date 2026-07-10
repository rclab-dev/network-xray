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
  // RouteCrushLab's portal chrome). For a standalone library that would break the host
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
  // next to the Routing Engine panel). The engine ships its CSS but in RouteCrushLab the rows
  // come from the server; in a standalone page you supply them here. `src` is an array of
  // { prefix, nexthop, status } rows, or a function(state) -> rows so the table can reflect the
  // current snapshot (e.g. empty until the BGP session is Established). Repaints on applyState.
  function setBgpTable(src) { _bgpSrc = src; _paintBgpTable(); }
  function _bgpRows() {
    if (!_bgpSrc) return null;
    return (typeof _bgpSrc === 'function' ? _bgpSrc(_lastState) : _bgpSrc) || [];
  }
  // --- Best-Path Decision (ported from RCL xray_core xrayBuildBgpView) ---
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
      return '<div class="bgp-reason">★ ' + p + ' → best path by <b>' + dec.criterion.label + '</b>' + cmp + '</div>' + ch;
    }
    if (dec.kind === 'medskip') return '<div class="bgp-reason bgp-reason-note">★ ' + p + ' → <b>MED not compared</b> (different neighbor AS) — tiebreak by Router ID</div>' + ch;
    if (dec.kind === 'tie') return '<div class="bgp-reason bgp-reason-note">★ ' + p + ' → all attributes equal — <b>tiebreak by Router ID</b></div>' + ch;
    return '<div class="bgp-reason bgp-reason-note">★ ' + p + ' → <b>no single decider</b> — lower-level tiebreak</div>' + ch;
  }
  function _bgpBuildView(routes) {
    var order = [], groups = {};
    routes.forEach(function (r) { var p = r.prefix || ''; if (!groups[p]) { groups[p] = []; order.push(p); } groups[p].push(r); });
    var html = '<table class="de-bgp-table"><thead><tr><th>St</th><th>Network</th><th>Next-Hop</th><th>Metric</th><th>LocPrf</th><th>Weight</th><th>Path</th></tr></thead><tbody>';
    var reasons = '';
    order.forEach(function (p) {
      var grp = groups[p], dec = _bgpDecision(grp), decCol = (dec && dec.kind === 'decided') ? dec.col : null;
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
    if (reasons) reasons += '<div class="bgp-legend">Best-path order: Weight → LocPrf → AS-Path → Origin → MED</div>';
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
      + '.xbgp-fs-ctl{float:right;font-weight:400}'
      + '.xbgp-fs-ctl button{background:#16202b;color:#9fb6c2;border:1px solid #2b3a44;border-radius:3px;font-size:11px;line-height:1;padding:1px 6px;margin-left:3px;cursor:pointer}'
      + '.xbgp-fs-ctl button:hover{color:#cfe8ee;border-color:#4dd0e1}';
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
    var rows = _bgpRows(), body, decision = '';
    if (!rows || !rows.length) {
      body = '<div class="de-dim">no routes<br>(BGP session not established)</div>';
    } else {
      var view = _bgpBuildView(rows); body = view.table; decision = view.decision;   // table + WHY-best
    }
    panel.innerHTML = '<div class="de-title">BGP Table (' + tgt + ')<span class="xbgp-fs-ctl">'
      + '<button data-fs="dn" title="smaller text">A−</button><button data-fs="up" title="larger text">A+</button></span></div>'
      + '<div class="de-bgp-rows">' + body + '</div>';
    if (decision) { dpanel.innerHTML = '<div class="de-title">Best-Path Decision</div><div class="de-bgp-decision-rows">' + decision + '</div>'; dpanel.style.display = ''; }
    else { dpanel.style.display = 'none'; }
    _bgpFontInit();
    var de = document.querySelector('.xray-deep-engine'); if (de) de.style.setProperty('--xbgp-fs', window.__xbgpFs || 1);
    // Stack the Decision box directly UNDER the Table box so they never overlap. Both are top-right
    // absolute; the engine's default bottom-anchor on the decision panel collides when the table is
    // tall, so we measure the table and pin the decision just below it.
    if (decision) { dpanel.style.bottom = 'auto'; dpanel.style.top = (panel.offsetTop + panel.offsetHeight + 10) + 'px'; }
  }
  function _bgpFontInit() {
    if (window.__xbgpFsInit) return; window.__xbgpFsInit = true; if (window.__xbgpFs == null) window.__xbgpFs = 1;
    document.addEventListener('click', function (e) {
      var b = e.target && e.target.closest && e.target.closest('.xbgp-fs-ctl button'); if (!b) return;
      window.__xbgpFs = Math.max(0.7, Math.min(1.5, (window.__xbgpFs || 1) + (b.getAttribute('data-fs') === 'up' ? 0.1 : -0.1)));
      var de = document.querySelector('.xray-deep-engine'); if (de) de.style.setProperty('--xbgp-fs', window.__xbgpFs);
      var t = document.getElementById('de-bgp-panel'), dz = document.getElementById('de-bgp-decision-panel');
      if (t && dz && dz.style.display !== 'none') { dz.style.bottom = 'auto'; dz.style.top = (t.offsetTop + t.offsetHeight + 10) + 'px'; }
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
  // For a language-neutral standalone library, relabel it to English. (RCL is unaffected —
  // it doesn't use this facade.) Idempotent; safe to call whenever the cylinder (re)renders.
  function _relabelClose() {
    var btns = document.querySelectorAll('.xray-focus-close');
    for (var i = 0; i < btns.length; i++) btns[i].innerHTML = '&#10005; Close';
  }

  // --- i18n: translate the engine's remaining built-in Japanese UI to English at runtime.
  // The engine (xray-core.js) is shared with a Japanese product (RouteCrushLab); this facade
  // replaces Japanese DOM text/title strings via the window.xrayI18n dictionary (load xray-i18n.js).
  // No-op if absent. RCL does not use this facade.
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

  function openDeepDive() {
    document.body.classList.add('is-xray-mode');
    if (typeof window.xrayDeepDiveZoomIn === 'function') window.xrayDeepDiveZoomIn();
    else document.body.classList.add('is-xray-deep');
    _relabelClose();    // English close label
    _paintBgpTable();   // Seam C: (re)inject the BGP table now the cylinder is open
    _localize(document.body);
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

  // Re-target the DeepDive cylinder to ANY node and open it (§12-5: overview lives in another
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
      // Router boxes carry RouteCrushLab's live-terminal (ttyd) links; inert by default.
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

    // RCL UX: click the target router box in the overview to zoom into its DeepDive
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
})();
