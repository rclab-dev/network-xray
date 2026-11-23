/* ui/view.js — the MCP Apps picture (runs inside ui/view.html, in the host's sandboxed iframe).
 *
 * It talks to the host only (postMessage, JSON-RPC 2.0, the io.modelcontextprotocol/ui extension): ui/initialize, then it
 * waits for the tool's arguments (ui/notifications/tool-input) and result (ui/notifications/tool-result), asks the server
 * for the lab state with the picture-only tool view_data (tools/call, through the host), and draws the router the tool was
 * about with its DeepDive open; a prefix in the arguments is picked as a click on its Routing-table row picks it. Names are
 * only used if the lab has them. Nothing is fetched, no URL is opened; what the host sends is drawn by the engine, which
 * escapes it, and messages to the person are set as text.
 */
(function (root) {
  'use strict';
  var doc = root.document, host = root.parent;
  var nextId = 1, waiting = {}, args = null, drawnFor = null;

  function msg(text, isErr) {
    var el = doc.getElementById('nx-view-msg');
    if (!el) return;
    el.textContent = text || '';
    el.className = isErr ? 'err' : '';
    el.style.display = text ? '' : 'none';
  }
  function post(m) { m.jsonrpc = '2.0'; host.postMessage(m, '*'); }
  function request(method, params) {
    var id = nextId++;
    post({ id: id, method: method, params: params || {} });
    return new Promise(function (ok, no) { waiting[id] = { ok: ok, no: no }; });
  }
  function notify(method, params) { post({ method: method, params: params || {} }); }

  function sendSize() {
    var h = Math.max(doc.documentElement.scrollHeight || 0, doc.body ? doc.body.scrollHeight || 0 : 0);
    var w = doc.documentElement.scrollWidth || 0;
    if (h) notify('ui/notifications/size-changed', { width: w, height: h });
  }

  // ---- the lab as the containerlab graph page builds it (xray-graph.html), from view_data's nodes / links / states ----
  function build(data) {
    var NAMES = (data.nodes || []).map(function (n) { return n && n.name; }).filter(function (n) { return typeof n === 'string' && n; });
    var ADJ = {}, EDGES = [];
    NAMES.forEach(function (n) { ADJ[n] = []; });
    var links = (data.links || []).filter(function (l) { return l && ADJ[l.source] && ADJ[l.target] && l.source !== l.target; });
    links.forEach(function (l) {
      var a = l.source, b = l.target;
      if (ADJ[a].indexOf(b) < 0) ADJ[a].push(b);
      if (ADJ[b].indexOf(a) < 0) ADJ[b].push(a);
      var k = [a, b].sort().join('|'); if (EDGES.indexOf(k) < 0) EDGES.push(k);
    });
    var cfg = {
      id: 'lab', topology_type: 'multi', layout: '',
      nodes: NAMES.map(function (n) { return { id: n, type: 'router', role: 'Router' }; }),
      networks: EDGES.map(function (k) { var p = k.split('|'); return { name: 'net-' + p[0] + p[1], members: [{ node: p[0], host_id: 10 }, { node: p[1], host_id: 20 }] }; }),
      modes: ['troubleshoot'],
      links: links.map(function (l) { return { a: l.source, aIf: String(l.source_endpoint || '').split(':')[0], b: l.target, bIf: String(l.target_endpoint || '').split(':')[0] }; })
    };
    // the same hub-and-spoke / circle layout as the graph page
    var W = 560, H = 360, cx = W / 2, cy = H / 2, R = Math.min(W, H) / 2 - 60, POS = {};
    var deg = function (n) { return (ADJ[n] || []).length; };
    if (NAMES.length === 1) POS[NAMES[0]] = [cx, cy];
    else if (NAMES.length === 2) { POS[NAMES[0]] = [W * 0.30, cy]; POS[NAMES[1]] = [W * 0.70, cy]; }
    else if (NAMES.length > 2) {
      var hub = NAMES.slice().sort(function (a, b) { return deg(b) - deg(a); })[0], leaves = NAMES.filter(function (n) { return n !== hub; });
      if (deg(hub) >= leaves.length) { POS[hub] = [cx, 70]; leaves.forEach(function (n, i) { POS[n] = [leaves.length === 1 ? cx : W * 0.18 + W * 0.64 * (i / (leaves.length - 1)), H - 70]; }); }
      else [hub].concat(leaves).forEach(function (n, i, all) { var a = (i / all.length) * Math.PI * 2 - Math.PI / 2; POS[n] = [cx + R * Math.cos(a), cy + R * Math.sin(a)]; });
    }
    cfg.positions = {}; Object.keys(POS).forEach(function (n) { cfg.positions[n] = { x: POS[n][0], y: POS[n][1] }; });
    return { names: NAMES, adj: ADJ, pos: POS, cfg: cfg, states: data.states || {} };
  }

  function openNode(lab, nodeId) {
    var st = lab.states[nodeId];
    var views = root.clabXray.deepViews(lab.cfg, nodeId, { state: st });
    if (!views.length) return false;
    var v = views[0], c = v.scene.config;
    c.xray = c.xray || {};
    if (st && (st.bgp_configured || st.protocol === 'bgp')) {
      c.xray.protocol = 'bgp';
      c.xray.pattern = (c.nodes || []).filter(function (n) { return n.id !== nodeId; }).length >= 2 ? 'bgp_multi' : 'bgp';
    } else if (st && st.ospf_configured) c.xray.protocol = 'ospf';
    if (st && st.ospf_configured && st.bgp_configured) c.xray.deep_coexist_ospf = true;
    try {   // left in the overview = left face (as the graph page does)
      var tn = (c.nodes || []).filter(function (n) { return n.id === nodeId; })[0];
      if (tn && tn.single_link) { var pe = (lab.adj[nodeId] || [])[0]; if (pe && lab.pos[pe] && lab.pos[nodeId]) tn.single_link = lab.pos[pe][0] < lab.pos[nodeId][0] ? 'left' : 'right'; }
      var peers = (c.nodes || []).filter(function (n) { return n.id !== nodeId; });
      if (peers.length === 2 && tn && lab.pos[peers[0].id] && lab.pos[peers[1].id] && lab.pos[peers[0].id][0] > lab.pos[peers[1].id][0]) c.nodes = [peers[1], tn, peers[0]];
    } catch (e) {}
    if (st) root._lastXrayState = st;
    root.xrayCore.renderTopology('#topo', c, { topology: v.scene.topo, trace: { success: true, reached: true, hops: [] } });
    root.xrayCore.openDeepDiveFor(nodeId, st || undefined);
    root.xrayCore.setBgpTable(st && (st.protocol === 'bgp' || st.bgp_configured) ? function (s) { return (s && s.bgp_routes) || []; } : null);
    return true;
  }

  function draw(data) {
    var lab = build(data);
    if (!lab.names.length) { msg('No routers in this lab state.', true); return; }
    var want = args && (args.node || args.router);
    var node = (typeof want === 'string' && lab.names.indexOf(want) >= 0) ? want
      : lab.names.slice().sort(function (a, b) { return (lab.adj[b] || []).length - (lab.adj[a] || []).length; })[0];
    root.xrayDeepLinkOpenNode = function (id) { if (lab.names.indexOf(id) >= 0) openNode(lab, id); };   // a click / #node= in the picture
    if (!openNode(lab, node)) { msg(node + ' has no links to draw.', true); return; }
    msg('');
    var pfx = args && args.prefix;
    if (typeof pfx === 'string' && pfx) root.xrayCore.applyDeepLink({ prefix: pfx });   // only a prefix the tables have
    root.setTimeout(sendSize, 600);
  }

  function onResult() {
    var key = JSON.stringify(args || {});
    if (key === drawnFor) return;
    drawnFor = key;
    msg('Loading the lab state...');
    var a = {};
    if (args && typeof args.path === 'string' && args.path) a.path = args.path;   // none: the server's default path
    request('tools/call', { name: 'view_data', arguments: a }).then(function (r) {
      var d = r && r.structuredContent;
      if (!r || r.isError || !d) { msg('The picture could not get the lab state' + (d && d.error ? ': ' + d.error : '.') + ' The answer above still holds.', true); return; }
      try { draw(d); } catch (e) { msg('The picture could not be drawn: ' + ((e && e.message) || e), true); }
    }, function (e) {
      msg('This app cannot read the lab state through the host (' + ((e && e.message) || 'tools/call refused') + '). The answer above still holds.', true);
    });
  }

  root.addEventListener('message', function (e) {
    if (e.source !== host) return;   // only the host
    var m = e.data;
    if (!m || typeof m !== 'object' || m.jsonrpc !== '2.0') return;
    if (m.id != null && waiting[m.id] && !m.method) {   // a reply to our request
      var w = waiting[m.id]; delete waiting[m.id];
      if (m.error) w.no(new Error(String(m.error.message || 'error'))); else w.ok(m.result);
      return;
    }
    if (m.method === 'ui/notifications/tool-input') { var p = m.params && m.params.arguments; args = p && typeof p === 'object' ? p : {}; return; }
    if (m.method === 'ui/notifications/tool-result') { if (!args) args = {}; onResult(); return; }
    if (m.method === 'ui/resource-teardown' && m.id != null) { post({ id: m.id, result: {} }); return; }
    if (m.id != null && m.method) post({ id: m.id, error: { code: -32601, message: 'Method not found' } });   // other requests
  });

  request('ui/initialize', {
    protocolVersion: '2026-01-26',
    clientInfo: { name: 'network-xray', version: '1' },
    appCapabilities: {}
  }).then(function () { notify('ui/notifications/initialized'); }, function (e) { msg('The host did not start the picture: ' + ((e && e.message) || e), true); });

  root.__nxView = { build: build };   // for the tests
})(typeof window !== 'undefined' ? window : this);
