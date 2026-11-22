/* xray-embed-frame.js — runs inside embed.html. Takes the calls that xray-embed.js sends from the embedding page
 * (postMessage) and passes them to the xrayCore facade (xray-api.js). Only the facade's own calls are accepted, only
 * from the parent window and only from the origin given in ?origin= (xray-embed.js sets it); without ?origin= only
 * this frame's own origin is trusted. Tells the page: 'ready', 'deepdive' {open}, 'size' {height}, 'error' {message}.
 */
(function (root) {
  'use strict';
  var KEY = 'xray-embed', VERSION = 1;
  var CALLS = { applyState: 1, setTopology: 1, setTrace: 1, openDeepDive: 1, openDeepDiveFor: 1, closeDeepDive: 1, selectPrefix: 1, setSkin: 1 };
  var doc = root.document;
  root.__nxEmbedFrame = true;   // xray-api.js: ?embed=1&view=deepdive does not nest the page the JavaScript embed talks to
  var parentOrigin = '';
  try { parentOrigin = new root.URLSearchParams(root.location.search).get('origin') || ''; } catch (e) {}
  if (!parentOrigin) parentOrigin = root.location.origin;
  var view = null;

  function tell(msg) {
    if (!root.parent || root.parent === root) return;
    msg[KEY] = VERSION;
    root.parent.postMessage(msg, parentOrigin && parentOrigin !== 'null' ? parentOrigin : '*');
  }
  function fail(message) { tell({ ev: 'error', message: String(message) }); }

  function handle(cmd, args) {
    var core = root.xrayCore;
    if (!core) return fail('xrayCore is not loaded');
    if (cmd === 'render') {
      view = core.renderTopology('#topo', args[0] || {}, args[1] || {});
      return;
    }
    if (!CALLS[cmd]) return fail('unknown call: ' + cmd);
    if (!view) return fail(cmd + ' before render');
    view[cmd].apply(view, args);
  }

  root.addEventListener('message', function (e) {
    if (e.source !== root.parent || root.parent === root) return;
    if (e.origin !== parentOrigin) return;
    var d = e.data;
    if (!d || typeof d !== 'object' || d[KEY] !== VERSION || typeof d.cmd !== 'string') return;
    try { handle(d.cmd, Array.isArray(d.args) ? d.args : []); } catch (err) { fail(err && err.message || err); }
  });

  doc.addEventListener('xraycore:deepdive', function (e) { tell({ ev: 'deepdive', open: !!(e && e.detail && e.detail.open) }); });

  var lastH = 0;
  function sendSize() {
    var h = Math.max(doc.documentElement.scrollHeight || 0, doc.body ? doc.body.scrollHeight || 0 : 0);
    if (h && h !== lastH) { lastH = h; tell({ ev: 'size', height: h }); }
  }
  if (typeof root.ResizeObserver === 'function') {
    try { new root.ResizeObserver(sendSize).observe(doc.documentElement); } catch (e) {}
  }

  /* nx_state_url (v1.6): embed.html?state=<URL>&poll=<seconds> draws with no JavaScript on the embedding page (a Grafana
     text panel, a NetBox custom link: an iframe and a URL only). The URL gives one JSON in the DATA-CONTRACT shapes:
       { "version": 1, "config": {...}, "topology": {...}, "trace": {...}, "state": {...} }   (or "states": { r1: {...}, ... })
     poll = read it again every N seconds (2-300; none = once); it is drawn again only when the text changed.
     The URL is read only if it is on this frame's own origin, or on an origin listed in embed-allow.json next to
     embed.html ({"origins": ["https://grafana.example"]}) — only whoever serves embed.html can add one, a link cannot.
     http(s) only, no cookies, no redirects (a redirect is an error: following it would already send a request to a site
     that is not allowed), read as JSON (never run, never put in as HTML). */
  var ORIGIN_RE = /^https?:\/\/[^\/?#\s@]+$/;
  function stateMsg(text) {
    var el = doc.getElementById('nx-state-msg');
    if (!el && doc.body) {
      el = doc.createElement('div');
      el.id = 'nx-state-msg';
      el.setAttribute('role', 'status');
      el.style.cssText = 'margin:12px;padding:10px 12px;border:1px solid #ef5350;border-radius:6px;color:#ffcdd2;font:13px/1.5 sans-serif';
      doc.body.insertBefore(el, doc.body.firstChild);
    }
    if (el) { el.textContent = text; el.style.display = text ? '' : 'none'; }
  }
  function loadAllow() {
    var u;
    try { u = new root.URL('embed-allow.json', root.location.href).href; } catch (e) { return Promise.resolve([]); }
    return root.fetch(u, { credentials: 'omit', cache: 'no-store', redirect: 'error' })
      .then(function (r) { return r.ok ? r.json() : {}; })
      .then(function (j) { return (j && Array.isArray(j.origins) ? j.origins : []).filter(function (o) { return typeof o === 'string' && ORIGIN_RE.test(o); }); },
        function () { return []; });
  }
  // The URL to read, or null: http(s) only, this origin or one in the allow list.
  function checkStateUrl(raw, allow) {
    var u;
    try { u = new root.URL(String(raw), root.location.href); } catch (e) { return null; }
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return null;
    if (u.origin === root.location.origin || (allow || []).indexOf(u.origin) >= 0) return u.href;
    return null;
  }
  function startStateUrl(raw, pollRaw) {
    var NOT_HERE = 'Not loaded: embed.html reads ?state= only from its own site, or from a site listed in embed-allow.json next to it.';
    var lastText = null, lastCfg = null, states = null, single = null, nodes = [];
    var poll = parseFloat(pollRaw);
    poll = poll > 0 ? Math.min(300, Math.max(2, poll)) * 1000 : 0;
    var first = checkStateUrl(raw, []);
    var allowP = first ? Promise.resolve([]) : loadAllow();   // embed-allow.json is read only for another origin
    function curNode() { var t = String(root._xrayTargetNode || '').replace(/^topo-node-/, ''); return t; }
    function pickState(snap, cfg) {
      if (snap.state && typeof snap.state === 'object') return snap.state;
      if (!states) return null;
      var want = curNode();
      if (!states[want]) { want = ((cfg && cfg.nodes) || []).filter(function (n) { return n && n.target; }).map(function (n) { return n.id; })[0]; }
      if (!states[want]) want = Object.keys(states)[0];
      return states[want] || null;
    }
    function draw(text) {
      if (text === lastText) return;   // same text = nothing to redraw
      var snap = JSON.parse(text);
      if (!snap || typeof snap !== 'object' || snap.version !== 1 || !snap.config || typeof snap.config !== 'object') throw new Error('not a network-xray state file (needs "version": 1 and "config")');
      lastText = text;
      states = snap.states && typeof snap.states === 'object' ? snap.states : null;
      single = snap.state && typeof snap.state === 'object' ? snap.state : null;
      nodes = (snap.config.nodes || []).map(function (n) { return n && n.id; });
      var core = root.xrayCore, cfgText = JSON.stringify(snap.config);
      if (!view || cfgText !== lastCfg) {
        view = core.renderTopology('#topo', snap.config, { topology: snap.topology, trace: snap.trace });
        lastCfg = cfgText;
      } else {
        if (snap.topology) view.setTopology(snap.topology);
        if (snap.trace) view.setTrace(snap.trace);
      }
      var st = pickState(snap, snap.config);
      if (st) view.applyState(st);
      stateMsg('');
    }
    // a link's ?node= / a click on a router opens that router with its own state when the file has states per router
    root.xrayDeepLinkOpenNode = function (id) {
      if (!view || nodes.indexOf(id) < 0) return;
      if (states) { if (states[id]) view.openDeepDiveFor(id, states[id]); } else view.openDeepDiveFor(id, single || undefined);
    };
    function tick() {
      allowP.then(function (allow) {
        var href = checkStateUrl(raw, allow);
        if (!href) { stateMsg(NOT_HERE); fail(NOT_HERE); return; }
        return root.fetch(href, { credentials: 'omit', cache: 'no-store', redirect: 'error' }).then(function (r) {   // a redirect is not followed (it would already reach a site that is not allowed)
          if (r.url && !checkStateUrl(r.url, allow)) throw new Error(NOT_HERE + ' (redirected)');
          if (!r.ok) throw new Error('state: HTTP ' + r.status);
          return r.text();
        }).then(draw);
      }).catch(function (e) { var m = 'state: ' + (e && e.message || e); stateMsg(m); fail(m); });
    }
    tick();
    if (poll) root.setInterval(function () { if (!doc.hidden) tick(); }, poll);
  }

  function ready() {
    tell({ ev: 'ready' }); sendSize();
    var st = null, pl = null;
    try { var q = new root.URLSearchParams(root.location.search); st = q.get('state'); pl = q.get('poll'); } catch (e) {}
    if (st) startStateUrl(st, pl);
  }
  if (doc.readyState === 'loading') doc.addEventListener('DOMContentLoaded', ready); else ready();
})(typeof window !== 'undefined' ? window : this);
