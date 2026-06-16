// bgp-parse.js — throwaway prototype, BGP sibling of frr-parse.js.
// Parse FRR `show bgp summary` + `show ip bgp` TEXT (what you copy from the CLI) and reconstruct
// a config + state for xray-core.js. Scope: small eBGP from one router's perspective — self + its
// BGP neighbors, and the prefixes it has learned. The engine renders BGP as a binary
// (Established or not) + the route it installs + the session tunnel (see bgp-data.js), so that is
// what we target. iBGP / route-reflectors / large tables / multipath are out of scope here.

(function () {
  'use strict';

  // ---- parsers ----------------------------------------------------------------

  // `show bgp summary` -> { localAs, routerId, neighbors:[{ip, remoteAs, established, pfxRcvd, state, up}] }
  function parseSummary(text) {
    var lines = (text || '').split(/\r?\n/);
    var out = { localAs: null, routerId: null, neighbors: [] };
    var mAs = (text || '').match(/local AS(?: number)?\s+(\d+)/i);
    if (mAs) out.localAs = mAs[1];
    var mRid = (text || '').match(/(?:router identifier|local router ID is)\s+([0-9.]+)/i);
    if (mRid) out.routerId = mRid[1];
    // Neighbor V AS MsgRcvd MsgSent TblVer InQ OutQ Up/Down State/PfxRcd ...
    var re = /^([0-9.]+)\s+(\d+)\s+(\d+)\s+\d+\s+\d+\s+\d+\s+\d+\s+\d+\s+(\S+)\s+(\S+)/;
    lines.forEach(function (ln) {
      var m = ln.match(re);
      if (!m) return;
      var ip = m[1], remoteAs = m[3], up = m[4], statepfx = m[5];
      var established = /^\d+$/.test(statepfx);
      out.neighbors.push({
        ip: ip, remoteAs: remoteAs,
        established: established,
        pfxRcvd: established ? parseInt(statepfx, 10) : 0,
        state: established ? 'Established' : statepfx,
        up: up
      });
    });
    return out;
  }

  // `show ip bgp` -> { localAs, routerId, routes:[{prefix, nexthop, best, aspath:[..], origin}] }
  function parseBgpTable(text) {
    var lines = (text || '').split(/\r?\n/);
    var out = { localAs: null, routerId: null, routes: [] };
    var mAs = (text || '').match(/local AS\s+(\d+)/i);
    if (mAs) out.localAs = mAs[1];
    var mRid = (text || '').match(/local router ID is\s+([0-9.]+)/i);
    if (mRid) out.routerId = mRid[1];
    // status flags (e.g. *>, *=, *>i, * i), then Network, Next Hop, ... Path, origin code.
    var re = /^([sdhSRr*>=i ]*?)\s*([0-9.]+\/\d+)\s+([0-9.]+)\s+(.*)$/;
    var lastPrefix = null;
    lines.forEach(function (ln) {
      var m = ln.match(re);
      if (!m) return;
      var flags = m[1] || '', prefix = m[2], nexthop = m[3], rest = m[4] || '';
      // a path line must end in an origin code (i/e/?) to be a real BGP route row (filters headers)
      var mp = rest.match(/(?:^|\s)((?:\d+\s+)*\d+)?\s*([ie?])\s*$/);
      if (!mp) return;
      var aspath = mp[1] ? mp[1].trim().split(/\s+/) : [];
      out.routes.push({
        prefix: prefix, nexthop: nexthop, best: /[>]/.test(flags),
        ibgp: /i/.test(flags), aspath: aspath, origin: mp[2]
      });
      lastPrefix = prefix;
    });
    return out;
  }

  // ---- helpers ----------------------------------------------------------------

  function net24(ip) { return ip.split('.').slice(0, 3).join('.') + '.0'; }
  function sameNet24(a, b) { return a && b && net24(a) === net24(b); }

  // ---- reconstruct config + state --------------------------------------------

  function build(summaryText, tableText, selfName) {
    selfName = selfName || 'r1';
    var sum = parseSummary(summaryText);
    var tbl = parseBgpTable(tableText);
    var localAs = sum.localAs || tbl.localAs || '';
    var routerId = sum.routerId || tbl.routerId || '';

    // peers: one per BGP neighbor. Placed to the LEFT of self (cylinder-to-left), so self is last.
    var peers = [];          // { name, ip, remoteAs, established, pfxRcvd, state, iface, selfIp, subnet }
    var ifaceByPeer = {};
    sum.neighbors.forEach(function (n, i) {
      var name = 'r' + (i + 2);
      var iface = i === 0 ? 'eth0' : 'eth' + i;
      var subnet = net24(n.ip) + '/24';
      // self's address on this link: router-id if it sits on the same /24, else .254 of the peer net
      var selfIp = sameNet24(routerId, n.ip) ? routerId : (net24(n.ip).replace(/\.0$/, '.254'));
      peers.push({ name: name, ip: n.ip, remoteAs: n.remoteAs, established: n.established,
        pfxRcvd: n.pfxRcvd, state: n.state, iface: iface, selfIp: selfIp, subnet: subnet });
      ifaceByPeer[name] = iface;
    });

    // learned best routes whose next-hop is a known peer → these are what self installs via BGP.
    var bestByPeer = {};   // peer.name -> first best route via it
    var peerByNh = {};
    peers.forEach(function (p) { peerByNh[p.ip] = p.name; });
    tbl.routes.forEach(function (r) {
      if (!r.best) return;
      var pn = peerByNh[r.nexthop];
      if (pn && !bestByPeer[pn]) bestByPeer[pn] = r;
    });
    // representative learned route (for the Routing Engine panel / FORWARD arrow / cylinder)
    var primaryPeer = peers.filter(function (p) { return p.established; })[0] || peers[0] || null;
    var primaryRoute = primaryPeer ? bestByPeer[primaryPeer.name] : null;
    if (!primaryRoute) { // fall back to any best route
      for (var i = 0; i < peers.length; i++) { if (bestByPeer[peers[i].name]) { primaryRoute = bestByPeer[peers[i].name]; primaryPeer = peers[i]; break; } }
    }

    // ---- config ----
    var nodes = [];
    peers.forEach(function (p) { nodes.push({ id: p.name, role: 'AS ' + p.remoteAs, type: 'router' }); });
    nodes.push({ id: selfName, role: 'AS ' + localAs, type: 'router', target: true });   // observed router last (right)

    var networks = peers.map(function (p) {
      return { name: 'net-' + selfName + p.name, subnet: p.subnet,
        members: [{ node: p.name }, { node: selfName }] };
    });

    var config = {
      success: true, id: 'bgp-paste', topology_type: 'linear', layout: '',
      nodes: nodes, networks: networks,
      xray: { protocol: 'bgp', pattern: 'bgp_linear', ping_mode: 'cylinder-to-left',
        holo_fields: [
          { label: 'BGP Session', field: 'is_established', ok: 'Established', fallback: 'bgp_state' },
          { label: 'Prefixes received', field: 'pfx_rcvd', ok: '', err: '0' }
        ] }
    };

    // ---- state ----
    var anyEst = peers.some(function (p) { return p.established; });
    var totalPfx = peers.reduce(function (a, p) { return a + (p.pfxRcvd || 0); }, 0);
    var stIfaces = {};
    peers.forEach(function (p) { stIfaces[p.iface] = { up: true, ip: p.selfIp + '/24' }; });

    var state = {
      success: true, scenario: 'bgp-paste',
      target_node: selfName, peer_node: primaryPeer ? primaryPeer.name : '', peer_id: primaryPeer ? primaryPeer.ip : '',
      interfaces: stIfaces,
      wan_iface: primaryPeer ? primaryPeer.iface : 'eth0',
      lan_iface: primaryPeer ? primaryPeer.iface : 'eth0',
      bgp_configured: true,
      is_established: anyEst,
      bgp_state: anyEst ? 'Established' : (primaryPeer ? primaryPeer.state : 'Idle'),
      pfx_rcvd: totalPfx,
      // OSPF-family fields off (BGP has no hello/LSDB)
      neighbor_state: 'None', has_full: false, ospf_configured: false, ospf_active_on_interface: false,
      iface_hellos: {}, peer_hellos: {}, peer_sending_hello: false,
      route_resolution: primaryRoute
        ? { target: primaryRoute.prefix.split('/')[0], resolved: true, protocol: 'bgp',
            out_iface: primaryPeer.iface, next_hop: primaryRoute.nexthop, matched_prefix: primaryRoute.prefix }
        : { target: '', resolved: false, protocol: '', out_iface: '', next_hop: '', matched_prefix: '' },
      ping_ok: false, cleared: false, is_passive: false
    };
    // per-peer established flags (engine reads `<peerNode>_established`)
    peers.forEach(function (p) { state[p.name + '_established'] = p.established; });

    // ---- topology snapshot (Seam A) ----
    var subnets = {};
    networks.forEach(function (nw) { subnets[nw.name] = nw.subnet; });
    var topo = { success: true, subnets: subnets, nodes: {} };
    topo.nodes[selfName] = peers.map(function (p) {
      return { name: p.iface, ip: p.selfIp, prefix: 24, state: 'UP' };
    });
    peers.forEach(function (p) {
      var ifs = [{ name: 'eth0', ip: p.ip, prefix: 24, state: 'UP' }];
      // if this peer advertises the representative prefix, show it as a stub network on the peer
      if (bestByPeer[p.name]) {
        var pfx = bestByPeer[p.name].prefix;
        ifs.push({ name: 'eth1', ip: pfx.split('/')[0].replace(/\.0$/, '.1'), prefix: 24, state: 'UP' });
      }
      topo.nodes[p.name] = ifs;
    });

    // trace (Seam B) suppressed — this is a session/route view, not a ping path
    var trace = { success: true, reached: false, hops: [] };

    // BGP table rows (Seam C) — the best routes self has learned (shown inside the cylinder)
    var bgpRows = tbl.routes.filter(function (r) { return r.best; }).map(function (r) {
      return { prefix: r.prefix, nexthop: r.nexthop, status: r.ibgp ? '*>i' : '*>' };
    });

    return { config: config, state: state, topo: topo, trace: trace, bgpRows: bgpRows,
      _debug: { summary: sum, table: tbl, peers: peers } };
  }

  window.BGPFRR = { parseSummary: parseSummary, parseBgpTable: parseBgpTable, build: build };
})();
