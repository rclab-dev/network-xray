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
    // Column-count-independent tokenize + Up/Down detection, PLUS terminal line-wrap join: a real FRR
    // neighbor row can wrap across 2 physical lines (V/AS on line 1, Up/Down/State on line 2). If a
    // start row (IP + V + AS) has no Up/Down token yet, fold in the following line(s) until it does,
    // stopping at the next neighbor. Robust to column shifts / prompt / never / Active. (tested)
    var raw = (text || '').split(/\r?\n/);
    var out = { localAs: null, routerId: null, neighbors: [] };
    var mAs = (text || '').match(/local AS(?: number)?\s+(\d+)/i); if (mAs) out.localAs = mAs[1];
    var mRid = (text || '').match(/(?:router identifier|local router ID is)\s+([0-9.]+)/i); if (mRid) out.routerId = mRid[1];
    var ipRe = /^\d{1,3}(?:\.\d{1,3}){3}$/;
    var timeRe = /^(?:\d+:\d{2}:\d{2}|\d+[wdhms]\d*[wdhms]?|never)$/i;  // Up/Down: hh:mm:ss / 3d04h / 1w2d / never
    var rows = [];
    for (var i = 0; i < raw.length; i++) {
      var t = raw[i].trim().split(/\s+/).filter(Boolean);
      if (t.length >= 3 && ipRe.test(t[0]) && /^\d+$/.test(t[1]) && /^\d+$/.test(t[2])) {
        var joined = t.slice(), guard = 0;                       // fold wrapped continuation line(s)
        while (!joined.some(function (x) { return timeRe.test(x); }) && i + 1 < raw.length && guard < 2) {
          var nx = raw[i + 1].trim().split(/\s+/).filter(Boolean);
          if (nx.length && ipRe.test(nx[0]) && /^\d+$/.test(nx[1] || '')) break;   // next row is another neighbor → stop
          joined = joined.concat(nx); i++; guard++;
        }
        rows.push(joined);
      }
    }
    rows.forEach(function (t) {
      var si = -1; for (var k = 3; k < t.length; k++) { if (timeRe.test(t[k])) { si = k + 1; break; } }
      var state = si >= 0 && si < t.length ? t[si] : t[t.length - 1];
      var established = /^\d+$/.test(state);
      out.neighbors.push({ ip: t[0], remoteAs: t[2], established: established,
        pfxRcvd: established ? parseInt(state, 10) : 0, state: established ? 'Established' : state, up: si >= 1 ? t[si - 1] : '' });
    });
    return out;
  }

  // `show ip bgp` -> { localAs, routerId, routes:[{prefix, nexthop, best, aspath:[..], origin}] }
  function parseBgpTable(text) {
    // Header-driven column slicing (robust to right-aligned numeric cols / blank cells / flags) +
    // multipath continuation rows (`*` / blank Network → previous prefix) + attribute extraction
    // (Metric / LocPrf[blank=default 100] / Weight). (tested)
    var lines = (text || '').split(/\r?\n/);
    var out = { localAs: null, routerId: null, routes: [] };
    var mAs = (text || '').match(/local AS\s+(\d+)/i); if (mAs) out.localAs = mAs[1];
    var mRid = (text || '').match(/local router ID is\s+([0-9.]+)/i); if (mRid) out.routerId = mRid[1];
    var cols = null;   // column start offsets from the header row
    for (var i = 0; i < lines.length; i++) { var h = lines[i];
      if (/\bNetwork\b/.test(h) && /Next\s*Hop/i.test(h) && /\bPath\b/.test(h)) {
        cols = { network: h.indexOf('Network'), nexthop: h.search(/Next\s*Hop/i),
          metric: h.indexOf('Metric'), locprf: h.indexOf('LocPrf'), weight: h.indexOf('Weight'), path: h.indexOf('Path') };
        break; } }
    var ipRe = /^\d{1,3}(?:\.\d{1,3}){3}$/, lastPrefix = null;
    function num(s, d) { s = (s || '').trim(); return s === '' ? d : (isNaN(parseInt(s, 10)) ? d : parseInt(s, 10)); }
    lines.forEach(function (ln) {
      if (!cols) return;
      if (ln.indexOf('Network') >= 0 && /Next\s*Hop/i.test(ln)) return;   // skip header
      var flags = ln.slice(0, cols.network).trim();
      var netRaw = ln.slice(cols.network, cols.nexthop).trim();
      var nh = ln.slice(cols.nexthop, cols.metric).trim();
      if (!ipRe.test(nh)) return;                              // not a route row (preamble/footer)
      var metric = ln.slice(cols.metric, cols.locprf), locprf = ln.slice(cols.locprf, cols.weight), weight = ln.slice(cols.weight, cols.path);
      var pathRaw = ln.slice(cols.path).trim();
      var mPfx = netRaw.match(/\d{1,3}(?:\.\d{1,3}){3}\/\d+/);
      var prefix = mPfx ? mPfx[0] : lastPrefix;                // blank Network = continuation → previous prefix (multipath)
      if (!prefix) return; lastPrefix = prefix;
      var mo = pathRaw.match(/([ie?])\s*$/); var origin = mo ? mo[1] : '';
      var aspath = pathRaw.replace(/\s*[ie?]\s*$/, '').trim();
      var best = />/.test(flags);
      out.routes.push({ prefix: prefix, nexthop: nh, best: best, ibgp: /i/.test(flags.replace('>', '')),
        metric: num(metric, 0), local_pref: num(locprf, 100), weight: num(weight, 0),   // LocPrf blank = default 100
        as_path: aspath, origin: origin, status: best ? (/i/.test(flags.replace('>', '')) ? '*>i' : '*>') : (flags || '*') });
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
    // A self with EXACTLY 2 BGP peers is a dual-link apex: emit the engine's inverted_v contract so
    // the Overview draws r1 at the apex with both peer sessions as spokes (inverted-V), and the
    // DeepDive shows both tunnels (#de-tunnel-left / -right). others[] order decides left/right, so
    // peers are placed iface-ascending (eth0 = left, eth1 = right). Single-peer / 3+ peers keep the
    // linear layout ([peers…, self]) unchanged — no regression. (inverted_v spec)
    var isDual = peers.length === 2;
    var peerL = isDual ? peers[0] : null, peerR = isDual ? peers[1] : null;   // iface-ascending: eth0=left, eth1=right
    var selfNode = { id: selfName, role: 'AS ' + localAs, type: 'router', target: true };
    var peerNodes = peers.map(function (p) { return { id: p.name, role: 'AS ' + p.remoteAs, type: 'router' }; });
    var nodes = isDual
      ? [peerNodes[0], selfNode, peerNodes[1]]   // [peerL(eth0), self(apex/target), peerR(eth1)]
      : peerNodes.concat([selfNode]);            // single peer / other: observed router last (right)

    var networks = peers.map(function (p) {
      return { name: 'net-' + selfName + p.name, subnet: p.subnet,
        members: [{ node: p.name }, { node: selfName }] };
    });

    var config = {
      success: true, id: 'bgp-paste', topology_type: 'linear', layout: isDual ? 'inverted_v' : '',
      nodes: nodes, networks: networks,
      xray: { protocol: 'bgp', pattern: isDual ? 'bgp_multi' : 'bgp_linear', ping_mode: isDual ? 'from-r1' : 'cylinder-to-left',
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
    // dual-link apex (2 peers): the inverted-V DeepDive reads per-peer iface for the left/right tunnels
    // and best_path_via for the FORWARD arrow direction (tunnel colour comes from per-peer _established).
    if (isDual) {
      state[peerL.name + '_iface'] = peerL.iface;
      state[peerR.name + '_iface'] = peerR.iface;
      state.best_path_via = primaryPeer ? primaryPeer.name : (peerR.established ? peerR.name : peerL.name);
    }

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

    // BGP table rows (Seam C) — ALL candidate routes + decision attributes (shown inside the cylinder).
    // Same-prefix ≥2 candidates → _bgpBuildView groups them → the Best-Path Decision fires. The other
    // build() consumers (bestByPeer / topology) filter r.best separately, so they are unaffected.
    var bgpRows = tbl.routes.map(function (r) {
      return { prefix: r.prefix, nexthop: r.nexthop, status: r.status || (r.best ? '*>' : '*'),
        local_pref: r.local_pref, weight: r.weight, metric: r.metric, as_path: r.as_path, origin: r.origin, best: r.best };
    });

    return { config: config, state: state, topo: topo, trace: trace, bgpRows: bgpRows,
      _debug: { summary: sum, table: tbl, peers: peers } };
  }

  if (typeof window !== 'undefined') window.BGPFRR = { parseSummary: parseSummary, parseBgpTable: parseBgpTable, build: build };

  // Node self-test — real FRR fixture (owner's live multipath data). Run: `node bgp-parse.js`.
  // Browser: typeof process is undefined → skipped. (Not fabricated: this is a captured FRR paste.)
  if (typeof process !== 'undefined' && process.argv && /bgp-parse\.js$/.test(process.argv[1] || '')) {
    var SUM = ["BGP router identifier 10.59.0.10, local AS number 65001 vrf-id 0","","Neighbor        V         AS   MsgRcvd   MsgSent   TblVer  InQ OutQ  Up/Down State/PfxRcd   PfxSnt Desc","10.58.0.20      4      65002        15        15        2    0    0 00:00:27            1        1 N/A","10.59.0.20      4      65003        12        13        2    0    0 00:00:26            1        1 N/A","Total number of neighbors 2"].join('\n');
    var TBL = ["BGP table version is 2, local router ID is 10.59.0.10, vrf id 0","   Network          Next Hop            Metric LocPrf Weight Path","*> 8.8.8.0/24       10.59.0.20               0             0 65003 i","*                   10.58.0.20               0     50      0 65002 i","Displayed 1 routes and 2 total paths"].join('\n');
    var s = parseSummary(SUM), t = parseBgpTable(TBL), r = build(SUM, TBL, 'r1');
    var checks = [];
    function ck(name, cond) { checks.push((cond ? 'PASS' : 'FAIL') + '  ' + name); }
    var bestR = t.routes.filter(function (x) { return x.best; })[0], otherR = t.routes.filter(function (x) { return !x.best; })[0];
    ck('summary: 2 neighbors', s.neighbors.length === 2);
    ck('summary: both established (pfxRcvd)', s.neighbors.length === 2 && s.neighbors.every(function (n) { return n.established; }));
    ck('table: 2 routes', t.routes.length === 2);
    ck('table: same prefix 8.8.8.0/24 (multipath continuation kept)', t.routes.length === 2 && t.routes[0].prefix === '8.8.8.0/24' && t.routes[1].prefix === '8.8.8.0/24');
    ck('table: best LocPrf 100 (blank=default) > other 50', !!bestR && !!otherR && bestR.local_pref === 100 && otherR.local_pref === 50);
    ck('build: bgpRows = 2 candidates same prefix', r.bgpRows.length === 2 && r.bgpRows[0].prefix === r.bgpRows[1].prefix);
    ck('build: bgpRows carry local_pref attribute', r.bgpRows.length === 2 && r.bgpRows.every(function (x) { return typeof x.local_pref === 'number'; }));
    ck('build: topology unaffected (≥2 nodes)', r.config.nodes.length >= 2);
    ck('config: dual-link apex (inverted_v / bgp_multi / nodes r2—r1—r3)', r.config.layout === 'inverted_v' && r.config.xray.pattern === 'bgp_multi' && r.config.nodes.map(function (n) { return n.id; }).join(',') === 'r2,r1,r3');
    ck('state: per-peer iface (eth0/eth1) + best_path_via = winner (r3, LP100)', r.state.r2_iface === 'eth0' && r.state.r3_iface === 'eth1' && r.state.best_path_via === 'r3');
    console.log('bgp-parse self-test (real FRR fixture — multipath / LocPrf decider):');
    checks.forEach(function (c) { console.log('  ' + c); });
    var pass = checks.filter(function (c) { return c.indexOf('PASS') === 0; }).length;
    console.log('SUMMARY: ' + pass + '/' + checks.length + ' PASS');
  }
})();
