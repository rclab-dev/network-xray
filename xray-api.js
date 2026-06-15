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
    st.textContent = sel + ' button:not(.topo-box-link),' + sel + ' a:not(.topo-box-link)' +
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
  function _paintBgpTable() {
    if (!_bgpSrc) return;
    var re = document.getElementById('de-re-panel');
    if (!re || !re.parentElement) return;   // cylinder not rendered yet
    var tgt = (window._xrayTargetNode || 'topo-node-r1').replace('topo-node-', '');
    var panel = document.getElementById('de-bgp-panel');
    if (!panel) {
      panel = document.createElement('div');
      panel.className = 'de-panel de-bgp-panel';   // reuse the engine's built-in CSS
      panel.id = 'de-bgp-panel';
      re.parentElement.appendChild(panel);
    }
    var rows = _bgpRows(), body;
    if (!rows || !rows.length) {
      body = '<div class="de-dim">no routes<br>(BGP session not established)</div>';
    } else {
      body = '<table class="de-bgp-table"><thead><tr><th>Network</th><th>Next-Hop</th><th>Status</th></tr></thead><tbody>';
      rows.forEach(function (rt) {
        body += '<tr><td>' + (rt.prefix || '') + '</td><td>' + (rt.nexthop || '') + '</td>' +
          '<td><span class="bgp-st">' + (rt.status || '') + '</span></td></tr>';
      });
      body += '</tbody></table>';
    }
    panel.innerHTML = '<div class="de-title">BGP Table (' + tgt + ')</div><div class="de-bgp-rows">' + body + '</div>';
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
  function openDeepDive() {
    document.body.classList.add('is-xray-mode');
    if (typeof window.xrayDeepDiveZoomIn === 'function') window.xrayDeepDiveZoomIn();
    else document.body.classList.add('is-xray-deep');
    _paintBgpTable();   // Seam C: (re)inject the BGP table now the cylinder is open
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

  // Apply one state snapshot to the rendered view (see DATA-CONTRACT.md §4).
  function applyState(state) {
    if (typeof window.applyXrayState !== 'function') {
      throw new Error('xrayCore: call renderTopology() before applyState()');
    }
    window.applyXrayState(state);
    _lastState = state;
    _paintBgpTable();   // Seam C: keep the BGP table in sync with the snapshot
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
    closeDeepDive: closeDeepDive,
    startPolling: startPolling,
    stopPolling: stopPolling
  };
})();
