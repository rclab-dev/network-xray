/* ui/story.js — the player of a story page (ui/story.html, written by scripts/xray-story.js).
 *
 * The scenes are listed on the left; one is shown at a time. Each scene carries the whole lab state, so going to any
 * scene (a click, Back / Next, ← / →, #scene=<id>) sets that state and nothing is carried over from the scene before.
 * Play moves on by itself after each scene's dwell time and stops at the last scene; it starts stopped, and stops when
 * the tab is hidden. The lab picture and the router's X-Ray are drawn by the engine (the same code as the containerlab
 * graph page); every text from the story is set as text, never as HTML.
 */
(function (root) {
  'use strict';
  var doc = root.document;
  var T = {
    en: { kicker: 'X-Ray story', prev: '← Back', next: 'Next →', play: '▶ Play', pause: '⏸ Pause', scene: 'Scene',
      note: 'The labels (observed, answer example, ...) are what the author of this story says; they are not checked.',
      src: { observed: 'observed', 'observed-unsettled': 'observed, not settled', 'answer-example': 'answer example', illustrative: 'illustrative', unknown: 'source unknown' },
      noState: ' has no state in this scene.', noLinks: ' has no links to inspect.', peers: ' neighbors — inspect peer-pair:', has: ' has ' },
    ja: { kicker: 'X-Ray ストーリー', prev: '← 前へ', next: '次へ →', play: '▶ 再生', pause: '⏸ 止める', scene: '段',
      note: '札 (実測・解答例 など) は作った人の申告で、確かめた物ではありません。',
      src: { observed: '実測', 'observed-unsettled': '実測 (落ち着く前)', 'answer-example': '解答例', illustrative: '説明用', unknown: '出所不明' },
      noState: ' はこの段に状態がありません。', noLinks: ' には見るリンクがありません。', peers: ' 台と隣り合う — 見る組:', has: ' は ' },
  };

  var el = doc.getElementById('nx-story'), STORY;
  function showErr(m) { var e = doc.getElementById('err'); if (e) { e.style.display = 'block'; e.textContent = m; } }
  try { STORY = JSON.parse(el.textContent); } catch (e) { showErr('The story data could not be read: ' + e.message); return; }
  var L = T[STORY.lang] || T.en, SCENES = STORY.scenes;
  if (!root.clabXray || typeof root.clabXray.deepViews !== 'function' || !root.xrayCore || typeof root.xrayCore.openDeepDiveFor !== 'function') {
    showErr('The X-Ray engine is missing from this page.'); return;
  }
  try { if (root.XraySkin) root.XraySkin.apply(root.XraySkin.presetById('signature')); } catch (e) {}

  // ---- the lab (the same build as the containerlab graph page) ----
  var NAMES = STORY.topology.nodes.map(function (n) { return n.name; });
  var KIND = {}; STORY.topology.nodes.forEach(function (n) { KIND[n.name] = n.kind || ''; });
  var ADJ = {}, EDGES = [];
  NAMES.forEach(function (n) { ADJ[n] = []; });
  STORY.topology.links.forEach(function (l) {
    var a = l.source, b = l.target;
    if (ADJ[a].indexOf(b) < 0) ADJ[a].push(b);
    if (ADJ[b].indexOf(a) < 0) ADJ[b].push(a);
    var k = [a, b].sort().join('|'); if (EDGES.indexOf(k) < 0) EDGES.push(k);
  });
  function roleOf(n) { var k = (KIND[n] || '').toLowerCase(); return (k === 'host' || k === 'linux-host' || /^(sv|server|host|client|pc|h\d+)$/i.test(n)) ? 'server' : 'router'; }
  var fullCfg = {
    id: 'story', topology_type: 'multi', layout: '', modes: ['troubleshoot'],
    nodes: NAMES.map(function (n) { var r = roleOf(n); return { id: n, type: r, role: r === 'server' ? 'Server' : 'Router' }; }),
    networks: EDGES.map(function (k) { var p = k.split('|'); return { name: 'net-' + p[0] + p[1], members: [{ node: p[0], host_id: 10 }, { node: p[1], host_id: 20 }] }; }),
  };
  var W = 560, H = 360, cx = W / 2, cy = H / 2, R = Math.min(W, H) / 2 - 60, POS = {};
  (function () {
    var deg = function (n) { return ADJ[n].length; };
    if (NAMES.length === 1) { POS[NAMES[0]] = [cx, cy]; return; }
    var hub = NAMES.slice().sort(function (a, b) { return deg(b) - deg(a); })[0], leaves = NAMES.filter(function (n) { return n !== hub; });
    if (NAMES.length >= 3 && deg(hub) >= leaves.length) {
      POS[hub] = [cx, 70];
      leaves.forEach(function (n, i) { POS[n] = [leaves.length === 1 ? cx : W * 0.18 + W * 0.64 * (i / (leaves.length - 1)), H - 70]; });
    } else [hub].concat(leaves).forEach(function (n, i, all) { var a = (i / all.length) * Math.PI * 2 - Math.PI / 2; POS[n] = [cx + R * Math.cos(a), cy + R * Math.sin(a)]; });
  })();
  fullCfg.positions = {}; Object.keys(POS).forEach(function (n) { fullCfg.positions[n] = { x: POS[n][0], y: POS[n][1] }; });

  var cur = 0, curNode = null, curPrefix = null;
  function stateOf(i) { return SCENES[i].state || {}; }

  function renderView(v, nodeId) {
    var st = stateOf(cur)[nodeId] || v.scene.states.normal;
    var cfg = v.scene.config; cfg.xray = cfg.xray || {}; cfg.deep_engine = 'unified';
    if (curPrefix) cfg.xray.key_prefix = curPrefix; else delete cfg.xray.key_prefix;
    if (st && st.protocol === 'bgp') {
      cfg.xray.protocol = 'bgp';
      cfg.xray.pattern = (cfg.nodes || []).filter(function (n) { return n.id !== nodeId; }).length >= 2 ? 'bgp_multi' : 'bgp';
    }
    try {   // the left peer in the picture is the left one in the DeepDive
      var tn = (cfg.nodes || []).filter(function (n) { return n.id === nodeId; })[0];
      if (tn && tn.single_link) { var pe = ADJ[nodeId][0]; if (pe && POS[pe]) tn.single_link = POS[pe][0] < POS[nodeId][0] ? 'left' : 'right'; }
      var peers = (cfg.nodes || []).filter(function (n) { return n.id !== nodeId; });
      if (peers.length === 2 && tn && POS[peers[0].id] && POS[peers[1].id] && POS[peers[0].id][0] > POS[peers[1].id][0]) cfg.nodes = [peers[1], tn, peers[0]];
    } catch (e) {}
    doc.body.classList.remove('is-xray-deep');
    root.xrayCore.renderTopology('#topo', cfg, { topology: v.scene.topo, trace: { success: true, reached: true, hops: [] } });
    root.xrayCore.openDeepDiveFor(nodeId, st);
    if (typeof root.xrayCore.setBgpTable === 'function') {
      root.xrayCore.setBgpTable(st && st.protocol === 'bgp' ? function (s) { return (s && s.bgp_routes) || []; } : null);
    }
    var de = doc.querySelector('.xray-deep-engine'); if (de) de.style.display = 'block';
  }

  function showNode(nodeId) {
    curNode = nodeId; root.__xrayCurNode = nodeId;
    paintOverview();
    var box = doc.getElementById('peers'); box.textContent = '';
    if (!stateOf(cur)[nodeId]) { showErr(nodeId + L.noState); }
    var views = root.clabXray.deepViews(fullCfg, nodeId);
    if (!views.length) { showErr(nodeId + L.noLinks); return; }
    if (views.length > 1) {
      var lbl = doc.createElement('span'); lbl.className = 'lbl'; lbl.textContent = nodeId + L.has + ADJ[nodeId].length + L.peers; box.appendChild(lbl);
      views.forEach(function (v, idx) {
        var b = doc.createElement('button'); b.type = 'button'; b.textContent = (v.peers || []).join(' ↔ ');
        b.onclick = function () { Array.prototype.forEach.call(box.querySelectorAll('button'), function (e) { e.classList.remove('cur'); }); b.classList.add('cur'); renderView(v, nodeId); };
        if (idx === 0) b.classList.add('cur');
        box.appendChild(b);
      });
    }
    renderView(views[0], nodeId);
  }
  root.__xrayShowNode = showNode;

  // ---- the picture of the lab: lines, then the routers (highlighted ones from the scene) ----
  var SVGNS = 'http://www.w3.org/2000/svg';
  function paintOverview() {
    var ov = doc.getElementById('ov'), hl = SCENES[cur].show.highlight || { nodes: [], links: [] };
    function lit(a, b) { return hl.links.some(function (p) { return (p[0] === a && p[1] === b) || (p[0] === b && p[1] === a); }); }
    ov.textContent = '';
    var svg = doc.createElementNS(SVGNS, 'svg'); svg.setAttribute('viewBox', '0 0 ' + W + ' ' + H);
    EDGES.forEach(function (k) {
      var p = k.split('|'), a = POS[p[0]], b = POS[p[1]], on = lit(p[0], p[1]);
      var ln = doc.createElementNS(SVGNS, 'line');
      ln.setAttribute('x1', a[0]); ln.setAttribute('y1', a[1]); ln.setAttribute('x2', b[0]); ln.setAttribute('y2', b[1]);
      ln.setAttribute('stroke', on ? '#ffca28' : '#455a64'); ln.setAttribute('stroke-width', on ? '5' : '2');
      svg.appendChild(ln);
    });
    ov.appendChild(svg);
    NAMES.forEach(function (n) {
      var b = doc.createElement('div');
      b.className = 'ov-node' + (hl.nodes.indexOf(n) >= 0 ? ' hl' : '') + (n === curNode ? ' sel' : '');
      b.setAttribute('data-n', n); b.setAttribute('role', 'button'); b.tabIndex = 0;
      b.textContent = n;
      if (KIND[n]) { var k = doc.createElement('span'); k.className = 'k'; k.textContent = KIND[n]; b.appendChild(k); }
      b.style.left = POS[n][0] + 'px'; b.style.top = POS[n][1] + 'px';
      b.onclick = function () { showNode(n); };
      b.onkeydown = function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); showNode(n); } };
      ov.appendChild(b);
    });
  }
  function fitOverview() {   // a narrow screen: the 560 px picture is zoomed to the width
    var o = doc.getElementById('ov'), w = (o.parentNode.clientWidth || 560) - 4;
    o.style.zoom = w < 562 ? (w / 562).toFixed(3) : '';
  }

  // ---- the scenes on the left ----
  var items = [];
  function txt(id, t) { var e = doc.getElementById(id); if (e) e.textContent = t; }
  txt('st-kicker', L.kicker); txt('st-title', STORY.title); txt('st-desc', STORY.description); txt('st-note', L.note);
  txt('st-prev', L.prev); txt('st-next', L.next);
  doc.querySelector('.st-side').setAttribute('aria-label', L.scene);
  var list = doc.getElementById('st-list');
  SCENES.forEach(function (s, i) {
    var li = doc.createElement('li'), b = doc.createElement('button');
    b.type = 'button'; b.className = 'st-item'; b.setAttribute('data-scene', s.id);
    var num = doc.createElement('span'); num.className = 'st-num'; num.textContent = L.scene + ' ' + (i + 1);
    var src = doc.createElement('span'); src.className = 'st-src ' + s.source; src.textContent = L.src[s.source] || s.source;
    var name = doc.createElement('span'); name.className = 'st-name'; name.textContent = s.title;
    var cap = doc.createElement('span'); cap.className = 'st-cap'; cap.textContent = s.caption;
    b.appendChild(num); b.appendChild(src); b.appendChild(name); b.appendChild(cap);
    b.onclick = function () { stop(); go(i); };
    li.appendChild(b); list.appendChild(li); items.push(b);
  });

  function pickPrefix(p) {
    if (!p || typeof root.xrayCore.selectPrefix !== 'function') return;
    var n = 0;
    (function tryPick() { if (curPrefix !== p) return; if (root.xrayCore.selectPrefix(p) || ++n > 20) return; root.setTimeout(tryPick, 250); })();
  }

  function go(i) {
    if (i < 0 || i >= SCENES.length) return;
    cur = i;
    var s = SCENES[i], st = stateOf(i);
    root.LIVE_STATES = st;
    var e = doc.getElementById('err'); if (e) { e.style.display = 'none'; e.textContent = ''; }
    var want = s.show.node || (st[curNode] ? curNode : null) || NAMES.slice().sort(function (a, b) { return ADJ[b].length - ADJ[a].length; }).filter(function (n) { return st[n]; })[0] || NAMES[0];
    var prefixChanged = (s.show.prefix || null) !== curPrefix;
    curPrefix = s.show.prefix || null;
    if (want !== curNode || prefixChanged || !doc.getElementById('de-re-panel') || typeof root.xrayCore.applyState !== 'function') showNode(want);
    else { paintOverview(); try { root.xrayCore.applyState(st[want]); } catch (err) { showNode(want); } }
    pickPrefix(curPrefix);
    items.forEach(function (b, k) { if (k === i) b.setAttribute('aria-current', 'step'); else b.removeAttribute('aria-current'); });
    doc.getElementById('st-prev').disabled = i === 0;
    doc.getElementById('st-next').disabled = i === SCENES.length - 1;
    try { if (root.history && root.history.replaceState) root.history.replaceState(null, '', '#scene=' + encodeURIComponent(s.id)); } catch (err) {}
  }

  // ---- Play: on to the next scene after its dwell time, stop at the last ----
  var timer = null, playing = false;
  function syncPlay() { var b = doc.getElementById('st-play'); b.textContent = playing ? L.pause : L.play; b.setAttribute('aria-pressed', String(playing)); }
  function arm() { if (timer) root.clearTimeout(timer); timer = playing ? root.setTimeout(function () { timer = null; if (cur >= SCENES.length - 1) { stop(); return; } go(cur + 1); arm(); }, SCENES[cur].dwell) : null; }
  function stop() { playing = false; arm(); syncPlay(); }
  function play() { if (cur >= SCENES.length - 1) go(0); playing = true; arm(); syncPlay(); }
  doc.getElementById('st-play').onclick = function () { if (playing) stop(); else play(); };
  doc.getElementById('st-prev').onclick = function () { stop(); go(cur - 1); };
  doc.getElementById('st-next').onclick = function () { stop(); go(cur + 1); };
  doc.addEventListener('keydown', function (e) {
    var t = e.target && e.target.tagName;
    if (t === 'INPUT' || t === 'TEXTAREA' || t === 'SELECT' || e.altKey || e.ctrlKey || e.metaKey) return;
    if (e.key === 'ArrowLeft') { e.preventDefault(); stop(); go(cur - 1); }
    else if (e.key === 'ArrowRight') { e.preventDefault(); stop(); go(cur + 1); }
    else if (e.key === ' ' && t !== 'BUTTON') { e.preventDefault(); if (playing) stop(); else play(); }
  });
  doc.addEventListener('visibilitychange', function () { if (doc.hidden && playing) stop(); });

  root.xrayStory = { go: function (i) { stop(); go(i); }, play: play, stop: stop, current: function () { return cur; }, count: SCENES.length };

  fitOverview();
  if (root.addEventListener) root.addEventListener('resize', fitOverview);
  var first = 0;
  try {
    var m = /(?:^|[#&])scene=([^&]+)/.exec(root.location.hash || '');
    if (m) { var id = decodeURIComponent(m[1]); SCENES.forEach(function (s, i) { if (s.id === id) first = i; }); }
  } catch (e) {}
  syncPlay();
  go(first);
})(window);
