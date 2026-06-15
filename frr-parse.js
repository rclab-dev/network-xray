// frr-parse.js — throwaway prototype.
// Parse FRR `show ip route` + `show ip ospf neighbor` TEXT (what you copy from the CLI)
// and reconstruct a config + state for xray-core.js, inferring the local topology from
// one router's perspective (self + directly-connected neighbors + peer-peer links found
// via equal-cost routes). Tested against a 2-node and a triangle sample.

(function () {
  'use strict';

  // ---- parsers ----------------------------------------------------------------

  // Returns { ifaces: {eth0:{ip,prefix,subnet}}, localIps:Set, routes:[{proto,prefix,nexthops:[{ip,iface}],connected,local,selected}] }
  function parseRoutes(text) {
    var lines = text.split(/\r?\n/);
    var routes = [];
    var last = null;
    var reMain = /^([A-Za-z])([>*]{0,2})\s+([0-9.]+\/\d+)\s+(?:\[\d+\/\d+\]\s+)?(.*)$/;
    var reVia = /via\s+([0-9.]+),\s*([A-Za-z0-9._\/-]+)/;
    var reConn = /is\s+directly\s+connected,\s*([A-Za-z0-9._\/-]+)/;
    var reCont = /^\s+[*>]*\s*via\s+([0-9.]+),\s*([A-Za-z0-9._\/-]+)/; // ECMP continuation
    lines.forEach(function (ln) {
      var mc = ln.match(reCont);
      if (mc && last) { last.nexthops.push({ ip: mc[1], iface: mc[2] }); return; }
      var m = ln.match(reMain);
      if (!m) return;
      var proto = m[1];
      var flags = (m[2] || '');
      var prefix = m[3];
      var rest = m[4] || '';
      var r = { proto: proto, prefix: prefix, nexthops: [], connected: false, local: false,
                selected: /[>*]/.test(flags) };
      var mv = rest.match(reVia);
      var mn = rest.match(reConn);
      if (mv) r.nexthops.push({ ip: mv[1], iface: mv[2] });
      else if (mn) { r.connected = true; r.nexthops.push({ ip: null, iface: mn[1] }); }
      if (proto === 'L') r.local = true;
      if (proto === 'C' || proto === 'L') r.connected = true;
      routes.push(r);
      last = r;
    });
    return routes;
  }

  // Returns [{ rid, state, address, iface, localAddr }]
  function parseNeighbors(text) {
    var lines = text.split(/\r?\n/);
    // A real CLI often WRAPS a long neighbor row across several lines (narrow terminal).
    // So: a NEW record is a line that has "rid + priority + state/role"; any following
    // line WITHOUT that signature is a wrapped continuation and is joined onto it.
    var reNew  = /^([0-9.]+)\s+\d+\s+\S+\/\S+/;
    var reFull = /^([0-9.]+)\s+\d+\s+(\S+?)\/\S+\s+\S+\s+\S+\s+([0-9.]+)\s+([A-Za-z0-9._-]+):([0-9.]+)/;
    var out = [], buf = null;
    function flush() {
      if (buf == null) return;
      var joined = buf.replace(/\s+/g, ' ').trim();
      var m = joined.match(reFull);
      if (m) out.push({ rid: m[1], state: m[2], address: m[3], iface: m[4], localAddr: m[5] });
      buf = null;
    }
    lines.forEach(function (ln) {
      if (reNew.test(ln)) { flush(); buf = ln; }
      else if (buf != null && ln.trim()) { buf += ' ' + ln; }
    });
    flush();
    return out;
  }

  // ---- helpers ----------------------------------------------------------------

  function subnetOf(ip, prefix) { // crude /24 assumption for proto; uses route prefix when present
    return ip.split('.').slice(0, 3).join('.') + '.0';
  }

  // ---- reconstruct config + state --------------------------------------------

  // selfName: label for the router whose output this is (e.g. 'r1')
  function build(routeText, neiText, selfName) {
    selfName = selfName || 'r1';
    var routes = parseRoutes(routeText);
    var neighbors = parseNeighbors(neiText);

    // self interfaces from connected (C) + local (L) routes
    var ifaces = {};      // iface -> { ip, subnet }
    var localIps = {};    // ip -> true (this router's own addresses)
    routes.forEach(function (r) {
      if (r.local) { var ip = r.prefix.split('/')[0]; localIps[ip] = true;
        var ifn = r.nexthops[0] && r.nexthops[0].iface;
        if (ifn) { ifaces[ifn] = ifaces[ifn] || {}; ifaces[ifn].ip = ip; } }
      if (r.proto === 'C') { var ifn2 = r.nexthops[0] && r.nexthops[0].iface;
        if (ifn2) { ifaces[ifn2] = ifaces[ifn2] || {}; ifaces[ifn2].subnet = r.prefix; } }
    });

    // peers: one per OSPF neighbor. name them sequentially r2, r3, ...
    // map iface -> peer
    var peers = [];           // { name, rid, address, iface, state }
    var ifacePeer = {};       // iface -> peer.name
    var nextIdx = 2;
    neighbors.forEach(function (n) {
      var name = 'r' + (nextIdx++);
      var p = { name: name, rid: n.rid, address: n.address, iface: n.iface, full: /full/i.test(n.state), state: n.state };
      peers.push(p);
      ifacePeer[n.iface] = name;
    });

    // nodes
    var nodes = [{ id: selfName, role: 'router', type: 'router', target: true }];
    peers.forEach(function (p) {
      var node = { id: p.name, role: 'router', type: 'router' };
      // remote loopback (rid that also appears as a /32 OSPF route) → mark loopback
      routes.forEach(function (r) {
        if (r.proto === 'O' && r.prefix === p.rid + '/32') node.loopback = p.rid;
      });
      nodes.push(node);
    });

    // networks: self<->peer per directly-connected subnet
    var networks = [];
    Object.keys(ifaces).forEach(function (ifn) {
      var peerName = ifacePeer[ifn];
      if (!peerName) return;
      var subnet = ifaces[ifn].subnet || (ifaces[ifn].ip ? subnetOf(ifaces[ifn].ip) + '/24' : null);
      networks.push({ name: 'net-' + selfName + peerName, subnet: subnet,
        members: [{ node: selfName }, { node: peerName }] });
    });

    // infer peer<->peer link: an OSPF subnet reachable via 2+ different next-hops
    // whose next-hop ifaces map to 2 different peers = the link between those peers.
    routes.forEach(function (r) {
      if (r.proto !== 'O' || r.connected) return;
      var viaPeers = {};
      r.nexthops.forEach(function (nh) { var pn = ifacePeer[nh.iface]; if (pn) viaPeers[pn] = true; });
      var pn = Object.keys(viaPeers);
      if (pn.length >= 2) {
        networks.push({ name: 'net-' + pn[0] + pn[1], subnet: r.prefix,
          members: [{ node: pn[0] }, { node: pn[1] }], inferred: true });
      }
    });

    var topology_type = peers.length >= 2 ? 'triangle' : 'linear';

    var config = {
      id: 'frr-paste', topology_type: topology_type, layout: '',
      nodes: nodes, networks: networks,
      xray: { protocol: 'ospf', pattern: topology_type === 'triangle' ? 'ospf_triangle' : 'ospf_linear',
        ping_mode: 'from-r1',
        holo_fields: [
          { label: 'Neighbors', field: 'full_count', ok: '', err: '0' },
          { label: 'Route', field: 'has_ospf_route', ok: 'OK', err: 'NONE' },
          { label: 'Ping', field: 'ping_ok', ok: 'OK', err: 'FAIL' }
        ] }
    };

    // ---- state ----
    // pick a target: first /32 OSPF route (a remote loopback)
    var target = null, targetNh = null;
    routes.forEach(function (r) {
      if (!target && r.proto === 'O' && /\/32$/.test(r.prefix) && r.nexthops[0] && r.nexthops[0].ip) {
        target = r.prefix.split('/')[0]; targetNh = r.nexthops[0];
      }
    });

    var stateIfaces = {};
    Object.keys(ifaces).forEach(function (ifn) {
      stateIfaces[ifn] = { up: true, ip: (ifaces[ifn].ip || '') + (ifaces[ifn].subnet ? '/' + ifaces[ifn].subnet.split('/')[1] : '/24') };
    });

    var fullCount = peers.filter(function (p) { return p.full; }).length;
    var state = {
      success: true, id: 'frr-paste',
      interfaces: stateIfaces,
      wan_iface: targetNh ? targetNh.iface : (peers[0] && peers[0].iface),
      lan_iface: peers[0] ? peers[0].iface : '',
      neighbor_state: (peers[0] && peers[0].full) ? 'Full' : 'None',
      has_full: fullCount > 0, full_count: fullCount,
      ospf_active_on_interface: true,
      peer_sending_hello: true,
      has_ospf_route: !!target,
      ping_ok: !!target,
      route_resolution: target ? {
        target: target, resolved: true, protocol: 'ospf',
        out_iface: targetNh.iface, next_hop: targetNh.ip, matched_prefix: target + '/32'
      } : { target: '', resolved: false, protocol: '', out_iface: '', next_hop: '', matched_prefix: '' },
      target_on_path: false, cleared: !!target
    };
    // per-peer fields (multi-node) + dual-link DeepDive 用の per-side フィールド。
    // engine の dual-link 描画は各側 (peer ノード) の neighbor_state / has_full / IF の
    // Hello で「各ビーム=各IF自身の状態」を描く。貼付データ (show ip route + ospf neighbor)
    // に Hello interval は無いため既定 10s（正確な値が要るなら `show ip ospf interface`
    // も貼れるよう拡張する）。
    var ifaceHellos = {}, peerHellos = {};
    peers.forEach(function (p) {
      state[p.name + '_has_full'] = p.full;
      state[p.name + '_iface'] = p.iface;
      state[p.name + '_neighbor_state'] = p.state || (p.full ? 'Full' : 'None');
      if (p.iface) ifaceHellos[p.iface] = 10;   // 各IF自身の Hello (送信オーブ)
      peerHellos[p.name] = 10;                   // peer の Hello (受信オーブ)
    });
    state.iface_hellos = ifaceHellos;            // {ifName: Hello秒}
    state.peer_hellos = peerHellos;              // {peerNode: Hello秒}

    // topology snapshot (Seam A): subnets + per-node iface states
    var subnets = {};
    networks.forEach(function (nw) { if (nw.subnet) subnets[nw.name] = nw.subnet; });
    var topo = { success: true, subnets: subnets, nodes: {} };
    topo.nodes[selfName] = Object.keys(ifaces).map(function (ifn) {
      return { name: ifn, ip: ifaces[ifn].ip || '', prefix: 24, state: 'UP' };
    });

    // traceroute (Seam B): hops toward target (direct = 1 hop)
    var trace = target ? { success: true, reached: true, hops: [ (ifacePeer[targetNh.iface] || 'peer') ] }
                       : { success: true, reached: false, hops: [] };

    return { config: config, state: state, topo: topo, trace: trace,
             _debug: { routes: routes, neighbors: neighbors, peers: peers, ifaces: ifaces } };
  }

  window.FRR = { parseRoutes: parseRoutes, parseNeighbors: parseNeighbors, build: build };
})();
