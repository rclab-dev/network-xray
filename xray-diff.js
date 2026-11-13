/* xray-diff.js — what changed between two states of the same lab (a baseline you chose, and now).
 *
 *   var d = xrayDiff.diffStates(before, after, { node: 'r1' });   // before / after: { <node>: <state>, ... }
 *
 * Returns { changes: [...], counts: {...}, unchanged: [nodes], none: bool }. The changes come heaviest first
 * (a router gone, an interface down, an adjacency lost, a value both ends must share that changed, a BGP session down,
 * a best path that moved, routes removed or moved, then what came back or was added), so a reader (or a small model)
 * sees the change before the rest. Each change: { kind, node, item, before, after } plus, for routes, `originated_by`
 * (the router where that prefix was directly connected in the baseline, on its loopback when there is one).
 *
 * Not compared, because they move on their own: uptimes, counters, timers that only count down, the collector's
 * signatures and timestamps. The containerlab management network (172.20.20.0/24 by default, opts.mgmtSubnet) is
 * left out, the same as `--exclude-mgmt`. Runs in Node and in the page (no require, no fs). Nothing is sent anywhere.
 */
(function (root) {
  'use strict';

  // heaviest first; ties keep node / item order. A route now resolved through the management network ranks just
  // above the best-path changes (VIA_MGMT_RANK): it is why the lab still reaches a next hop the topology does not.
  var VIA_MGMT_RANK = 7.5;
  // causes first, then what they broke: a small model reads the top line as the answer
  var RANK = {
    node_removed: 0, node_unread: 1, iface_down: 2, ospf_if_left: 3, ospf_if_value: 4, bgp_peer_removed: 5,
    ospf_adjacency_lost: 6, bgp_session_down: 7, best_path_changed: 8, route_removed: 9, route_changed: 10,
    ospf_adjacency_state: 11, node_added: 12, iface_up: 13, ospf_adjacency_up: 14, ospf_adjacency_new: 15, ospf_if_joined: 16,
    bgp_session_up: 17, bgp_peer_added: 18, route_added: 19, iface_address: 20
  };
  // OSPF interface values that change what the router does (role / counts follow from them and are left out)
  var OSPF_IF_FIELDS = ['area', 'mtu', 'hello', 'dead', 'network_type', 'cost', 'passive', 'auth'];

  function obj(x) { return x && typeof x === 'object' && !Array.isArray(x) ? x : {}; }
  function arr(x) { return Array.isArray(x) ? x : []; }
  function str(x) { return x == null ? '' : String(x).trim(); }
  function isFull(s) { return /^full/i.test(str(s)); }
  function isEst(s) { return /^established$/i.test(str(s)); }

  function ip4(s) { var m = /^(\d+)\.(\d+)\.(\d+)\.(\d+)/.exec(str(s)); return m ? ((+m[1] << 24) >>> 0) + (+m[2] << 16) + (+m[3] << 8) + +m[4] : null; }
  function inNet(addr, net) {
    var m = /^([\d.]+)\/(\d+)$/.exec(str(net)), a = ip4(addr); if (!m || a == null) return false;
    var len = +m[2], mask = len === 0 ? 0 : (0xffffffff << (32 - len)) >>> 0;
    return ((a & mask) >>> 0) === ((ip4(m[1]) & mask) >>> 0);
  }
  // interfaces on the management network, per node (from the interface addresses)
  function mgmtIfaces(st, net) {
    var out = Object.create(null), ifs = obj(st.interfaces);
    Object.keys(ifs).forEach(function (i) { if (ifs[i] && inNet(ifs[i].ip, net)) out[i] = true; });
    return out;
  }

  function nbrKey(n) { return str(n.iface) + ' ' + str(n.router_id || n.neighbor_id || n.address); }
  function routeKey(r) { return (r.vrf ? '[vrf ' + r.vrf + '] ' : '') + str(r.prefix); }
  function bgpKey(r) {
    var p = str(r.prefix); if (r.prefixlen != null && p.indexOf('/') < 0) p += '/' + r.prefixlen;
    return (r.vrf ? '[vrf ' + r.vrf + '] ' : '') + p;
  }
  // the selected routes of a node: prefix -> sorted list of "next_hop on iface" (+ resolved_via), without the mgmt network
  function selectedRoutes(st, mg, net) {
    var out = Object.create(null);
    arr(st.routing_table).forEach(function (r) {
      if (!r || r.selected === false || !str(r.prefix)) return;
      if (mg[str(r.out_iface)] || (str(r.next_hop) && inNet(r.next_hop, net)) || inNet(String(r.prefix).split('/')[0], net) && String(r.prefix).split('/')[1] >= 24) return;
      var rv = r.resolved_via && typeof r.resolved_via === 'object' ? r.resolved_via : null;
      var mgmt = !!(rv && (rv.via_mgmt || r.via_mgmt));
      var nhs = arr(r.nexthops).filter(function (h) { return h && typeof h === 'object'; });   // ECMP: every next hop, not only the first
      var hops = (nhs.length > 1 ? nhs : [{ ip: r.next_hop, iface: r.out_iface }]).map(function (h) {
        var ip = str(h.ip != null ? h.ip : h.next_hop), ifc = str(h.iface != null ? h.iface : h.out_iface);
        return ip ? ip + (ifc ? ' on ' + ifc : '') : (ifc ? 'on ' + ifc : 'directly connected');
      });
      if (rv && rv.ip) hops = hops.map(function (h) { return h + ' (resolved via ' + str(rv.ip) + (rv.iface ? ' on ' + str(rv.iface) : '') + (mgmt ? ', management network' : '') + ')'; });
      var k = routeKey(r), e = (out[k] = out[k] || { protocol: str(r.protocol), hops: [], via_mgmt: false });
      e.hops = e.hops.concat(hops); if (mgmt) e.via_mgmt = true;
    });
    Object.keys(out).forEach(function (k) { out[k].hops = out[k].hops.filter(function (h, i, a) { return a.indexOf(h) === i; }).sort(); });
    return out;
  }
  // which router had this prefix directly connected in the baseline: a loopback first, else every router with it connected
  function originators(states, names, net) {
    var lo = Object.create(null), any = Object.create(null);
    names.forEach(function (n) {
      var mg = mgmtIfaces(states[n], net);
      arr(states[n].routing_table).forEach(function (r) {
        if (!r || str(r.protocol) !== 'connected' || mg[str(r.out_iface)]) return;
        var k = routeKey(r);
        ((/^lo/.test(str(r.out_iface)) ? lo : any)[k] = (/^lo/.test(str(r.out_iface)) ? lo : any)[k] || []).push(n);
      });
    });
    return function (k) { return (lo[k] || any[k] || []).filter(function (n, i, a) { return a.indexOf(n) === i; }).sort(); };
  }

  function diffStates(before, after, opts) {
    opts = opts || {};
    var net = opts.mgmtSubnet || '172.20.20.0/24';
    before = obj(before); after = obj(after);
    var all = Object.keys(before).concat(Object.keys(after)).filter(function (n, i, a) { return a.indexOf(n) === i; }).sort();
    var names = opts.node ? all.filter(function (n) { return n === opts.node; }) : all;
    var changes = [], touched = Object.create(null);
    function add(kind, node, item, b, a, extra) {
      var c = { kind: kind, node: node, item: item, before: b === undefined ? null : b, after: a === undefined ? null : a };
      if (extra) Object.keys(extra).forEach(function (k) { c[k] = extra[k]; });
      changes.push(c); touched[node] = true;
    }
    var originB = originators(before, Object.keys(before), net), originA = originators(after, Object.keys(after), net);
    function origin(k) { var o = originB(k); return o.length ? o : originA(k); }   // the baseline first; a prefix that is new is found in the new state

    names.forEach(function (n) {
      var B = before[n], A = after[n];
      if (B && !A) return add('node_removed', n, n, 'present', 'absent');
      if (!B && A) return add('node_added', n, n, 'absent', 'present');
      B = obj(B); A = obj(A);
      var unreadB = !!(B.unread || B.error), unreadA = !!(A.unread || A.error);
      if (!unreadB && unreadA) return add('node_unread', n, n, 'read', str((A.unread && A.unread.reason) || A.error || 'not read'));

      // interfaces
      var mgB = mgmtIfaces(B, net), mgA = mgmtIfaces(A, net), ib = obj(B.interfaces), ia = obj(A.interfaces);
      Object.keys(ib).concat(Object.keys(ia)).filter(function (i, k, l) { return l.indexOf(i) === k && !mgB[i] && !mgA[i]; }).sort().forEach(function (i) {
        var b = obj(ib[i]), a = obj(ia[i]);
        if (ib[i] && ia[i]) {
          if (b.up !== false && a.up === false) add('iface_down', n, i, 'up', 'down');
          else if (b.up === false && a.up !== false) add('iface_up', n, i, 'down', 'up');
          if (str(b.ip) !== str(a.ip)) add('iface_address', n, i, str(b.ip) || null, str(a.ip) || null);
        } else if (ib[i]) add('iface_down', n, i, 'up', 'absent');
      });

      // OSPF adjacencies
      var nb = Object.create(null), na = Object.create(null);
      arr(B.ospf_neighbors).forEach(function (x) { if (x) nb[nbrKey(x)] = x; });
      arr(A.ospf_neighbors).forEach(function (x) { if (x) na[nbrKey(x)] = x; });
      Object.keys(nb).concat(Object.keys(na)).filter(function (k, i, l) { return l.indexOf(k) === i; }).sort().forEach(function (k) {
        var b = nb[k], a = na[k], item = str((b || a).iface) + ' → ' + str((b || a).router_id || (b || a).address);
        if (b && !a) add('ospf_adjacency_lost', n, item, str(b.state), 'gone');
        else if (!b && a) add('ospf_adjacency_new', n, item, 'none', str(a.state));
        else if (str(b.state) !== str(a.state)) {
          var kind = isFull(b.state) && !isFull(a.state) ? 'ospf_adjacency_lost' : !isFull(b.state) && isFull(a.state) ? 'ospf_adjacency_up' : 'ospf_adjacency_state';
          add(kind, n, item, str(b.state), str(a.state));
        }
      });

      // OSPF interface values
      var ob = obj(B.ospf_ifaces), oa = obj(A.ospf_ifaces);
      Object.keys(ob).concat(Object.keys(oa)).filter(function (i, k, l) { return l.indexOf(i) === k; }).sort().forEach(function (i) {
        if (ob[i] && !oa[i]) return add('ospf_if_left', n, i, 'in OSPF', 'not in OSPF');
        if (!ob[i] && oa[i]) return add('ospf_if_joined', n, i, 'not in OSPF', 'in OSPF');
        OSPF_IF_FIELDS.forEach(function (f) {
          var b = obj(ob[i])[f], a = obj(oa[i])[f];
          if (b == null || a == null) return;   // not reported on one side: not compared
          if (String(b) !== String(a)) add('ospf_if_value', n, i + ' ' + f, b, a);
        });
      });

      // BGP sessions
      var pb = Object.create(null), pa = Object.create(null);
      arr(B.bgp_neighbors).forEach(function (x) { if (x && x.ip) pb[str(x.ip)] = x; });
      arr(A.bgp_neighbors).forEach(function (x) { if (x && x.ip) pa[str(x.ip)] = x; });
      Object.keys(pb).concat(Object.keys(pa)).filter(function (k, i, l) { return l.indexOf(k) === i; }).sort().forEach(function (ip) {
        var b = pb[ip], a = pa[ip];
        if (b && !a) return add('bgp_peer_removed', n, ip, str(b.state), 'gone');
        if (!b && a) return add('bgp_peer_added', n, ip, 'none', str(a.state));
        if (isEst(b.state) && !isEst(a.state)) add('bgp_session_down', n, ip, str(b.state), str(a.state));
        else if (!isEst(b.state) && isEst(a.state)) add('bgp_session_up', n, ip, str(b.state), str(a.state));
      });

      // BGP best paths
      function bests(st) {
        var o = Object.create(null);
        arr(st.bgp_routes).forEach(function (r) { if (r && (r.best === true || /^\*\s*>/.test(str(r.status)))) o[bgpKey(r)] = { via: str(r.next_hop), reason: r.reason || r.sel_reason || null }; });
        return o;
      }
      var bb = bests(B), ba = bests(A);
      Object.keys(bb).concat(Object.keys(ba)).filter(function (k, i, l) { return l.indexOf(k) === i; }).sort().forEach(function (k) {
        var b = bb[k], a = ba[k];
        if (b && a && b.via === a.via) return;
        add('best_path_changed', n, k, b ? 'via ' + b.via : 'no best path', a ? 'via ' + a.via : 'no best path',
          a && a.reason ? { reason: a.reason } : null);
      });

      // routing table (selected routes)
      var rb = selectedRoutes(B, mgB, net), ra = selectedRoutes(A, mgA, net);
      Object.keys(rb).concat(Object.keys(ra)).filter(function (k, i, l) { return l.indexOf(k) === i; }).sort().forEach(function (k) {
        var b = rb[k], a = ra[k], o = origin(k), extra = o.length ? { originated_by: o } : null;
        if (a && a.via_mgmt && !(b && b.via_mgmt)) extra = Object.assign(extra || {}, { via_mgmt: true });
        if (b && !a) add('route_removed', n, k, b.protocol + ' ' + b.hops.join(', '), 'absent', extra);
        else if (!b && a) add('route_added', n, k, 'absent', a.protocol + ' ' + a.hops.join(', '), extra);
        else if (b.protocol !== a.protocol || b.hops.join('|') !== a.hops.join('|')) add('route_changed', n, k, b.protocol + ' ' + b.hops.join(', '), a.protocol + ' ' + a.hops.join(', '), extra);
      });
    });

    changes.forEach(function (c, i) { c._i = i; });
    function rank(c) { return c.via_mgmt && /^route_/.test(c.kind) ? VIA_MGMT_RANK : RANK[c.kind]; }
    changes.sort(function (x, y) { return (rank(x) - rank(y)) || (x._i - y._i); });
    changes.forEach(function (c) { delete c._i; });
    var byKind = Object.create(null);
    changes.forEach(function (c) { byKind[c.kind] = (byKind[c.kind] || 0) + 1; });
    return {
      changes: changes,
      counts: { changes: changes.length, by_kind: byKind, nodes: names.length },
      unchanged: names.filter(function (n) { return !touched[n]; }),
      none: changes.length === 0
    };
  }

  /* ---- the page's baseline (v1.4 step 3): kept in memory only, never written anywhere --------------------------- */
  var LABEL = {
    en: { node_removed: 'router gone', node_unread: 'not read', iface_down: 'interface down', ospf_if_left: 'left OSPF',
      ospf_if_value: 'OSPF value', bgp_peer_removed: 'BGP peer gone', ospf_adjacency_lost: 'OSPF adjacency lost',
      bgp_session_down: 'BGP session down', best_path_changed: 'best path', route_removed: 'route gone', route_changed: 'route',
      ospf_adjacency_state: 'OSPF adjacency', node_added: 'router new', iface_up: 'interface up', ospf_adjacency_up: 'OSPF adjacency up',
      ospf_adjacency_new: 'OSPF adjacency new', ospf_if_joined: 'joined OSPF', bgp_session_up: 'BGP session up', bgp_peer_added: 'BGP peer new',
      route_added: 'route new', iface_address: 'address' },
    ja: { node_removed: 'ルータが消えた', node_unread: '読めない', iface_down: 'interface が down', ospf_if_left: 'OSPF から外れた',
      ospf_if_value: 'OSPF の値', bgp_peer_removed: 'BGP の相手が消えた', ospf_adjacency_lost: 'OSPF の隣接が切れた',
      bgp_session_down: 'BGP が落ちた', best_path_changed: '最良経路', route_removed: '経路が消えた', route_changed: '経路',
      ospf_adjacency_state: 'OSPF の隣接', node_added: 'ルータが増えた', iface_up: 'interface が up', ospf_adjacency_up: 'OSPF の隣接が戻った',
      ospf_adjacency_new: 'OSPF の隣接が増えた', ospf_if_joined: 'OSPF に入った', bgp_session_up: 'BGP が戻った', bgp_peer_added: 'BGP の相手が増えた',
      route_added: '経路が増えた', iface_address: 'アドレス' }
  };
  var TONE = { node_removed: 'bad', node_unread: 'bad', iface_down: 'bad', ospf_if_left: 'bad', ospf_if_value: 'bad', bgp_peer_removed: 'bad',
    ospf_adjacency_lost: 'bad', bgp_session_down: 'bad', route_removed: 'bad', iface_up: 'good', ospf_adjacency_up: 'good',
    bgp_session_up: 'good', ospf_adjacency_new: 'good' };
  var base = null, listeners = [];
  function fire() { listeners.slice().forEach(function (fn) { try { fn(base); } catch (e) {} }); }
  function setBaseline(states) {
    base = { states: JSON.parse(JSON.stringify(obj(states))), at: new Date() };
    fire();
    return base.at;
  }
  function clearBaseline() { base = null; fire(); }
  function getBaseline() { return base; }
  function onBaseline(fn) { if (typeof fn === 'function') listeners.push(fn); }
  // the lines a panel shows for one router: null when no baseline is kept; text is plain (the panel escapes it)
  function changeLines(now, node, lang) {
    if (!base) return null;
    var L = LABEL[lang === 'ja' ? 'ja' : 'en'];
    var d = diffStates(base.states, now, { node: node });
    return {
      at: base.at, none: d.none,
      items: d.changes.map(function (c) {
        var lbl = L[c.kind] || c.kind, t;
        if (/_(added|new|joined)$/.test(c.kind) || c.before === 'absent' || c.before === 'none') t = c.item + ': ' + lbl + ' — ' + c.after;
        else if (/_(removed|lost|left)$/.test(c.kind) && (c.after === 'absent' || c.after === 'gone' || c.after === 'not in OSPF'))
          t = c.item + ': ' + lbl + (lang === 'ja' ? ' (前は ' : ' (was ') + c.before + ')';
        else t = c.item + ': ' + lbl + ' ' + (c.before == null ? '-' : c.before) + ' → ' + (c.after == null ? '-' : c.after);
        if (c.reason) t += ' (' + c.reason + ')';
        if (c.originated_by && c.originated_by.length) t += lang === 'ja' ? ' [元: ' + c.originated_by.join(', ') + ']' : ' [from ' + c.originated_by.join(', ') + ']';
        return { kind: c.kind, tone: c.via_mgmt ? 'bad' : (TONE[c.kind] || 'note'), text: t };
      })
    };
  }

  var api = { diffStates: diffStates, KINDS: Object.keys(RANK), setBaseline: setBaseline, clearBaseline: clearBaseline,
    getBaseline: getBaseline, onBaseline: onBaseline, changeLines: changeLines };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.xrayDiff = api;
})(typeof window !== 'undefined' ? window : this);
