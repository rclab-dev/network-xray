#!/usr/bin/env node
/*
 * clab-collect.js — collect LIVE per-node router state from a running containerlab lab and
 * emit an xray-core `state` object (same shape as frr-parse.js / clab-xray-bridge.js synthesize,
 * but from REAL `vtysh ... json` output instead of assuming everything is Full).
 *
 * real clab per-node collector. Scope = ONE node + its neighbors:
 *   - run `docker exec clab-<lab>-<node> vtysh -c "show ... json"` for that node only
 *   - map each OSPF/BGP neighbor to its clab peer NODE NAME by interface (link endpoints),
 *     so it works on real labs with arbitrary IP plans (no synthetic 10.x scheme needed)
 *   - produce a target-node-centric state the X-Ray DeepDive renders verbatim
 *
 * MODES
 *   live      node clab-collect.js --lab <lab> --node <n> [--proto ospf|bgp] [--out f.json]
 *   fixtures  node clab-collect.js --fixtures <dir> --node <n> [--adj eth0:r2,eth1:r3] [--proto ...]
 *   self-test node clab-collect.js --self-test     (parses bundled real FRR json, asserts fields)
 *
 * The state plugs straight into the gallery:
 *   var st = require('./clab-collect').collectFromJson({...});    // Node
 *   view.openDeepDiveFor('<node>', st);                           // browser (load st as JSON)
 *
 * Node-only (it shells out to docker); not a browser module.
 *
 * VERIFICATION: the JSON parsers + the produced state are live-verified against real FRR 8.4.
 * Beyond the offline checks (self-test + a headless DeepDive render against FRR `... json` output),
 * the LIVE `--lab/--node` docker-exec path was run end-to-end against a real 3-node containerlab
 * FRR OSPF lab (FRR 8.4): collector exit 0, 0 field mismatches, and the live state drove the
 * X-Ray DeepDive correctly. CAVEAT: only FRR 8.4 is live-verified so far — FRR's json key names
 * drift a little across 7.x/9.x, so parsing is defensive. If a key differs on your FRR version,
 * run `vtysh -c "show ... json"` yourself and feed it via `--fixtures`, and please open an issue
 * with the raw json so the parser can be widened.
 */
'use strict';

var cp = (typeof require === 'function') ? require('child_process') : null;
var fs = (typeof require === 'function') ? require('fs') : null;;
/* compose_socketless_vtysh: in compose-mode (env XRAY_VTY_SOCK_DIR set) reach each FRR via its shared vty socket (vtysh --vty_socket) instead of `docker exec`, so no /var/run/docker.sock is needed. */
var _VTY_SOCK = process.env.XRAY_VTY_SOCK_DIR || '';
/* nx_unread (2026-10-17): a router that cannot be read is reported as such (exit 3 + "NX_UNREAD <why> ..." on stderr)
   instead of an empty router: why = stopped (container not running / gone) | device (no vtysh: linux, cEOS, ...) |
   timeout (no answer in 8 s). Every docker exec is cut at 8 s, so one hung router cannot hold the whole picture. */
var NX_EXEC_MS = 8000;
function _nxErr(why, msg) { var e = new Error(msg || why); e.nxUnread = why; return e; }
function _nxClassify(e) {
  if (e && e.code === 'ETIMEDOUT') return _nxErr('timeout', 'no answer in ' + (NX_EXEC_MS / 1000) + ' s');
  var t = String((e && e.stderr) || '') + ' ' + String((e && e.stdout) || '') + ' ' + String((e && e.message) || '');   /* docker prints "OCI runtime exec failed" on stdout */
  /* only docker's own messages: FRR itself says e.g. "ospfd is not running" when a daemon is off - that is a readable router */
  if (/Error response from daemon:.*(is not running|is paused|is restarting)|No such container/i.test(t)) return _nxErr('stopped', 'the container is not running');
  if (/OCI runtime exec failed.*vtysh|exec: "vtysh": executable file not found/i.test(t)) return _nxErr('device', 'no vtysh in this container');
  return null;
}
function _vtyExec(bin, args, maxBuf) {
  try { return cp.execFileSync(bin, args, { encoding: 'utf8', maxBuffer: maxBuf, timeout: NX_EXEC_MS, stdio: ['ignore', 'pipe', 'pipe'] }); }
  catch (e) { var c = _nxClassify(e); throw c || e; }
}
function _vtyBase(container){ return _VTY_SOCK ? ['vtysh', ['--vty_socket', _VTY_SOCK + '/' + container]] : ['docker', ['exec', container, 'vtysh']]; }
function _stripVtyWarn(o){ if(!o) return o; var i = o.indexOf('{'); return i > 0 ? o.slice(i) : o; }
var path = (typeof require === 'function') ? require('path') : null;

// ---- FRR json parsers (defensive: FRR key names vary a little across 7.x/8.x/9.x) -----------

// show ip ospf neighbor json -> { byIface: { eth0: {rid,address,state,full} }, list:[...] }
function parseOspfNeighbors(j) {
  var out = { byIface: {}, list: [] };
  if (!j || !j.neighbors) return out;
  Object.keys(j.neighbors).forEach(function (rid) {
    var arr = j.neighbors[rid]; if (!Array.isArray(arr)) arr = [arr];
    arr.forEach(function (n) {
      var state = n.state || n.nbrState || n.converged || '';   // "Full/DR", "Init/-", "2-Way/DROther"
      // FRR 8.x `show ip ospf neighbor json` reports ifaceName as "eth1:10.1.12.2" (iface:local-ip);
      // strip the :ip so it matches the bare clab link iface (eth1) used for peer mapping & labels.
      // (route nexthop interfaceName and ospf-interface keys are already bare.)
      var rawIf = n.ifaceName || n.interfaceName || n.iface || '';
      var rec = {
        rid: rid,
        address: n.address || n.ifaceAddress || n.neighborIp || '',
        iface: String(rawIf).split(':')[0],
        state: state,
        full: /^full/i.test(state)
      };
      out.list.push(rec);
      if (rec.iface) out.byIface[rec.iface] = rec;
    });
  });
  return out;
}

// show ip ospf interface json -> { eth0: {up, ip, prefix, area, hello} }
function parseOspfInterfaces(j) {
  var out = {};
  if (!j || !j.interfaces) return out;
  Object.keys(j.interfaces).forEach(function (ifn) {
    var d = j.interfaces[ifn] || {};
    var hello = d.timerMsecs ? Math.round(d.timerMsecs / 1000)
              : (d.timerHelloInSecs != null ? d.timerHelloInSecs
              : (d.helloInterval != null ? d.helloInterval : 10));
    out[ifn] = {
      up: (d.ifUp != null ? !!d.ifUp : true),
      ospf: (d.ospfEnabled != null ? !!d.ospfEnabled : true),
      ip: d.ipAddress || (d.ipAddresses && d.ipAddresses[0] && (d.ipAddresses[0].address || d.ipAddresses[0])) || '',
      prefix: (d.ipAddressPrefixlen != null ? d.ipAddressPrefixlen : 24),
      area: d.area || '0',
      hello: hello,
      passive: !!d.timerPassiveIface   /* nx_ospf_passive_no_hello: passive IF sends no Hello */
    };
  });
  return out;
}

/* nx_kernel_tunnel_if (2026-10-20): when the host kernel has the ip_gre / ip6_gre / ip6_tunnel / ipip / sit / vti modules loaded
   (netlab loads some for MPLS / VXLAN), EVERY network namespace (= every router container) gets the module's fallback device
   (gre0, gretap0, erspan0, ip6gre0, ip6tnl0, tunl0, sit0, ip_vti0, ip6_vti0): admin down, never up, no address. They are not part
   of the lab and were drawn as interfaces missing from the topology. Dropped only in exactly that default form - a tunnel the user
   brought up / gave an address / named otherwise is kept. Shape seen on FRR 8.4 and 10.7.1 (`show interface json`). */
var _KERNEL_TUNNEL_IF = /^(gre0|gretap0|erspan0|ip6gre0|ip6tnl0|tunl0|sit0|ip_vti0|ip6_vti0)$/;
function _isKernelTunnelIf(ifn, d) {
  if (!_KERNEL_TUNNEL_IF.test(ifn) || !d || typeof d !== 'object') return false;
  if (!/^down$/i.test(String(d.administrativeStatus || ''))) return false;
  if (d.operationalStatus && /up/i.test(d.operationalStatus)) return false;
  if (d.linkUps != null && +d.linkUps > 0) return false;
  var addrs = Array.isArray(d.ipAddresses) ? d.ipAddresses : [];
  return addrs.length === 0;
}

// show interface json -> { eth0: {up, ip, prefix} }  (fallback when ospf interface json is thin)
function parseInterfaces(j) {
  var out = {};
  if (!j) return out;
  Object.keys(j).forEach(function (ifn) {
    var d = j[ifn] || {};
    if (_isKernelTunnelIf(ifn, d)) return;   /* nx_kernel_tunnel_if */
    var up = false;
    if (d.operationalStatus) up = /up/i.test(d.operationalStatus);
    else if (d.administrativeStatus) up = /up/i.test(d.administrativeStatus);
    else if (d.linkDetection != null || d.flags) up = /up/i.test(d.flags || '');
    var addr = '', pfx = 24;
    // nx_collect_ipv4_only: the first IPv4 address (FRR may list an IPv6 link-local fe80::… first, or only that)
    var v4 = (Array.isArray(d.ipAddresses) ? d.ipAddresses : []).filter(function (a) { return String((a && a.address) || a || '').indexOf(':') < 0; })[0];
    if (v4) {
      var a0 = v4.address || v4;
      if (typeof a0 === 'string' && a0.indexOf('/') >= 0) { addr = a0.split('/')[0]; pfx = +a0.split('/')[1] || 24; }
      else addr = a0;
    }
    // nx_collect_unnumbered: FRR marks an unnumbered iface (borrowing a loopback /32) with ipAddresses[0].unnumbered
    var unn = !!(v4 && v4.unnumbered);
    out[ifn] = unn ? { up: up, ip: addr, prefix: pfx, unnumbered: true } : { up: up, ip: addr, prefix: pfx };
  });
  return out;
}

// show ip route json -> [ {prefix, protocol, selected, nexthops:[{ip,iface,connected}]} ]
function parseRoutes(j) {
  var out = [];
  if (!j) return out;
  Object.keys(j).forEach(function (prefix) {
    var arr = j[prefix]; if (!Array.isArray(arr)) arr = [arr];
    arr.forEach(function (r) {
      var nhs = (r.nexthops || []).map(function (nh) {
        return { ip: nh.ip || null, iface: nh.interfaceName || nh.interface || '', connected: !!nh.directlyConnected, active: nh.active !== false };
      });
      out.push({
        prefix: r.prefix || prefix,
        protocol: (r.protocol || '').toLowerCase(),   // "ospf" | "bgp" | "connected" | "static" | "local"
        selected: !!r.selected,
        nexthops: nhs
      });
    });
  });
  return out;
}

// show ip bgp summary json -> { byIp: { "10.1.0.20": {state, established, remoteAs} } }
function parseBgpSummary(j) {
  var out = { byIp: {}, list: [] };
  var uni = j && (j.ipv4Unicast || j);     // some FRR nest under ipv4Unicast, some flat
  var peers = uni && uni.peers;
  if (!peers) return out;
  Object.keys(peers).forEach(function (ip) {
    var p = peers[ip] || {};
    var st = p.state || p.peerState || '';
    var rec = { ip: ip, state: st, established: /establ/i.test(st), remoteAs: p.remoteAs, localAs: p.localAs, ibgp: (p.remoteAs != null && p.localAs != null && p.remoteAs === p.localAs),
      upDown: p.peerUptime, pfxRcd: p.pfxRcd, hostname: p.hostname || '' };  /* nx_collect_peer_map: the peer's hostname (BGP hostname capability) */   /* nx_bgp_nbr_detail (2026-10-06): Up/Down + PfxRcd for the RE panel neighbor fold */
    out.byIp[ip] = rec; out.list.push(rec);
  });
  return out;
}

// show ip bgp json -> [ {prefix, bestNexthop, valid} ]
function parseBgpRoutes(j) {
  var out = [];
  var routes = j && (j.routes || j);
  if (!routes || typeof routes !== 'object') return out;
  Object.keys(routes).forEach(function (prefix) {
    if (prefix === 'vrfName' || prefix === 'tableVersion' || prefix === 'routerId') return;
    var arr = routes[prefix]; if (!Array.isArray(arr)) arr = [arr];
    arr.forEach(function (r) {
      if (!r || typeof r !== 'object') return;
      var nh = (r.nexthops && r.nexthops[0] && r.nexthops[0].ip) || (r.peerId) || '';
      out.push({ prefix: r.prefix || prefix, nextHop: nh, best: !!(r.bestpath || r.bestPath),
        as_path: (r.path != null ? String(r.path).trim() : ''),
        local_pref: (r.locPrf != null ? r.locPrf : (r.localPref != null ? r.localPref : null)),
        weight: r.weight, metric: r.metric, origin: r.origin,
        reason: r.selectionReason || '' });
    });
  });
  return out;
}

// ---- build engine-compatible state ----------------------------------------------------------
//
// inputs:
//   selfName   string           the clab node this output came from (becomes target_node)
//   adjacency  [{iface, peer}]   clab link endpoints for selfName (iface -> peer NODE NAME)
//   ospfNei / ospfIf / routes / bgpSum / bgpRoutes : parsed objects (any may be empty)
//   proto      'ospf' | 'bgp'
function buildState(opts) {
  var selfName = opts.selfName || 'r1';
  var proto = (opts.proto || 'ospf').toLowerCase();
  var adj = opts.adjacency || [];                       // [{iface, peer}]
  var nei = opts.ospfNei || { byIface: {}, list: [] };
  var ifs = opts.ospfIf || {};
  var ifFallback = opts.ifaces || {};
  var routes = opts.routes || [];
  var bgpSum = opts.bgpSum || { byIp: {}, list: [] };
  var bgpRt = opts.bgpRoutes || [];

  var ifaceToPeer = {};                                 // eth0 -> r2 (from clab links)
  adj.forEach(function (a) { if (a.iface) ifaceToPeer[a.iface] = a.peer; });

  // interfaces from ospf-interface json (preferred) else `show interface` fallback
  var ifaceNames = Object.keys(ifs).length ? Object.keys(ifs) : Object.keys(ifFallback);
  // Optional: drop clab management interfaces so the DeepDive panel shows only the topology's data
  // links. Opt-in via --exclude-mgmt (default mgmt subnet 172.20.20.0/24) / --mgmt-subnet <cidr>.
  // ★Identified by SUBNET, not iface name: some labs & the self-test fixtures legitimately use eth0
  // as a DATA interface, so a blanket "drop eth0" would hide real links. Default off = no change.
  var mgmtSubnet = opts.mgmtSubnet || '';
  if (mgmtSubnet) {
    ifaceNames = ifaceNames.filter(function (ifn) {
      var d = ifs[ifn] || ifFallback[ifn] || {};
      return !(d.ip && _sameSubnet(mgmtSubnet, d.ip));
    });
  }
  // nx_collect_iface_noip: "ip/prefix" only when the iface has an address (OSPF iface json first, else `show interface`,
  // e.g. an unnumbered iface borrowing 10.0.0.3/32); no address -> '' (was a bare "/24" for lo and l2-only links)
  function _ifIpStr(ifn) {
    var a = ifs[ifn] || {}, b = ifFallback[ifn] || {};
    var src = a.ip ? a : (b.ip ? b : null);
    return src ? src.ip + '/' + (src.prefix || 24) : '';
  }
  var interfaces = {}, ifaceHellos = {}, peerHellos = {}, peerSendingHellos = {};
  ifaceNames.forEach(function (ifn) {
    var d = ifs[ifn] || ifFallback[ifn] || {};
    interfaces[ifn] = { up: d.up !== false, ip: _ifIpStr(ifn) };
  });

  // peers: prefer OSPF neighbors (have liveness); label by iface via clab links, else sequential
  var peers = [];                                       // {name, iface, full, state}
  var seq = 2;
  if (proto === 'bgp') {
    // BGP peers keyed by neighbor IP; map IP -> peer node by matching the iface that route to it,
    // but simplest robust map: use adjacency order if available, else AS/ip label.
    bgpSum.list.forEach(function (b) {
      var peerName = null;
      // find the directly-connected iface whose subnet contains b.ip, map via clab link
      // nx_collect_peer_map: never match the loopback's own connected /32 (a session to a remote lo is not on lo)
      var connRoute = routes.filter(function (r) { return r.protocol === 'connected' && !(r.nexthops[0] && /^lo/i.test(r.nexthops[0].iface)); })
        .filter(function (r) { return _sameSubnet(r.prefix, b.ip); })[0];
      if (connRoute && connRoute.nexthops[0]) peerName = ifaceToPeer[connRoute.nexthops[0].iface];
      // not on a connected link (iBGP over lo / multihop): the peer's own hostname from the FRR summary (= the clab node name;
      // a non-adjacent peer, e.g. an RR client two hops away, simply has no link). Without a hostname: the old order-based guess.
      // a link whose iface is down has no connected route, but its address is still on the iface (show interface) = the session is on that link
      var _ifOn = connRoute ? '' : (Object.keys(ifFallback).filter(function (f) { var d = ifFallback[f] || {}; return !/^lo/i.test(f) && d.ip && _sameSubnet(d.ip + '/' + (d.prefix || 24), b.ip); })[0] || '');
      if (!peerName && _ifOn) peerName = ifaceToPeer[_ifOn];
      // the hostname as the clab node name: an adjacent node's own spelling when it matches ignoring case, else the short name (no domain)
      if (!peerName && !connRoute && !_ifOn && b.hostname) {
        var _hs = String(b.hostname).split('.')[0];
        peerName = (adj.filter(function (a) { return String(a.peer).toLowerCase() === _hs.toLowerCase() || String(a.peer).toLowerCase() === String(b.hostname).toLowerCase(); })[0] || {}).peer || _hs;
      }
      if (!peerName) peerName = adj[seq - 2] && adj[seq - 2].peer;
      if (!peerName) peerName = 'r' + (seq);
      seq++;
      /* nx_collect_peer_map: a session to an address reached by ROUTING (IGP/static, not connected) = iBGP over lo / multihop. Its packets go out
         the route's exit iface(s): when an exit iface is a link TO THIS PEER, the session rides that link (row + bgp_over_lo); otherwise
         (exit via another node / non-adjacent peer) it owns no link (iface '' and no fill-in from --adj). Not on a link subnet and no route
         at all (e.g. the local link IP was removed) = unknown -> the old behaviour (no mark). */
      var _loRt = (connRoute || _ifOn) ? null : routes.filter(function (r) { return r.selected && !/^(connected|local|kernel)$/.test(r.protocol) && r.prefix !== '0.0.0.0/0' && _sameSubnet(r.prefix, b.ip); })
        .sort(function (x, y) { return (parseInt(y.prefix.split('/')[1], 10) || 0) - (parseInt(x.prefix.split('/')[1], 10) || 0); })[0] || null;
      var _loExit = '';
      if (_loRt) { var _ex = (_loRt.nexthops || []).map(function (h) { return h.iface; }); _loExit = (adj.filter(function (a) { return a.peer === peerName && _ex.indexOf(a.iface) >= 0; })[0] || {}).iface || ''; }
      peers.push({ name: peerName, iface: (connRoute && connRoute.nexthops[0] && connRoute.nexthops[0].iface) || _ifOn || _loExit || '', full: b.established, state: b.state, ip: b.ip,
        overLo: !!_loRt && !!_loExit, noLink: !!_loRt && !_loExit });
    });
  } else {
    nei.list.forEach(function (n) {
      var peerName = ifaceToPeer[n.iface] || ('r' + (seq++));
      peers.push({ name: peerName, iface: n.iface, full: n.full, state: n.state, ip: n.address });
    });
  }

  // A peer declared in --adj but absent from the live neighbor/bgp list is a DOWN link (e.g. the
  // interface was shut). Emit it explicitly as down so the DeepDive per-peer row shows Down instead
  // of falling back to the engine's default Full.
  adj.forEach(function (a) {
    if (a.peer && !peers.some(function (p) { return p.name === a.peer; })) {
      peers.push({ name: a.peer, iface: a.iface || '', full: false, state: 'Down', ip: '' });
    }
  });


  // peer has no connected route; when the uplink is DOWN even the underlay connected route is gone, so
  // the bgpSum-derived iface stays '') must recover its topology-link iface from --adj. Without this the
  // link iface never enters `interfaces` -> wan/lan fall back to eth0(mgmt)/lo -> wan!=lan -> a spurious

  peers.forEach(function (p) {
    if (!p.iface && !p.noLink) { var _ai = adj.filter(function (a) { return a.peer === p.name; })[0]; if (_ai && _ai.iface) p.iface = _ai.iface; }  /* nx_collect_peer_map: a routed session whose exit is not a link to this peer owns no link */
  });

  var fullCount = peers.filter(function (p) { return p.full; }).length;

  // hellos (ospf): IF-scoped for hello-OUT + peer-scoped for hello-IN so the engine per-beam drive()
  // lights Hello ONLY on links actually running OSPF. Q9: r1-r3 iface not in the OSPF process -> its
  // beam gets no Hello; r1-r2 (Full) does. See reference_rcl_xray_ospf_active_peer_sending_if_scope_marker.
  if (proto !== 'bgp') {
    peers.forEach(function (p) {
      // hello-OUT is per-IFACE: emit only when the LOCAL iface participates in OSPF (present in `ifs` =
      // show ip ospf interface). A peer link whose iface is NOT OSPF-enabled must NOT enter iface_hellos,
      // else engine drive() `active = hasOwnProperty(iface_hellos, iface)` shows a spurious Hello on it.
      if (p.iface && ifs[p.iface] && !ifs[p.iface].passive) ifaceHellos[p.iface] = ifs[p.iface].hello || 10;  /* nx_ospf_passive_no_hello */
      // hello-IN is per-PEER: we hear a peer's Hello only when its neighbor exists beyond Down/None
      // (Init+ = a Hello was received). peer_sending_hellos gates hello-in per beam (forming: local
      // iface active but peer down -> out yes, in no).
      // hello-IN core value: show Hello RECV whenever we can HEAR the peer = neighbor state >= Init
      // (Init/2-Way/ExStart/Exchange/Loading/Full). This visualizes "Hello is flowing but the adjacency
      // is stuck below Full" (timer/router-id/MTU mismatch) -- NOT a Full gate. OFF only when we hear
      // NOTHING from the peer: Down / None / Attempt (Hellos sent but none received / dead-timer expired).
      var _peerUp = /^(full|loading|exchange|exstart|2-?way|init)/i.test(p.state || '') || !!p.full;
      peerSendingHellos[p.name] = _peerUp;
      if (_peerUp) peerHellos[p.name] = (ifs[p.iface] && ifs[p.iface].hello) || 10;
    });
  }

  // Ensure every real topology-link iface (from adjacency/peers) appears in `interfaces`, even when
  // it is NOT an OSPF-participating iface. OSPF-only collection (ifs) drops static/connected links
  // (e.g. q9 r1 eth2 static link to r3), so the engine saw 1 link-iface -> is-single-link-edge ->
  // the 2nd DeepDive beam had no geometry. Layer link ifaces on with ip/up from show-interface.
  peers.forEach(function (p) {
    if (p.iface && p.iface !== 'lo' && !interfaces[p.iface]) {
      var _pd = ifs[p.iface] || ifFallback[p.iface];
      interfaces[p.iface] = _pd ? { up: _pd.up !== false, ip: _ifIpStr(p.iface) } : { up: false, ip: '', absent: true };   /* nx_unread (F3): the router has no such iface -> not UP */
    }
  });
  // nx_collect_peer_map: every clab link iface too (a link with no OSPF and no BGP peer on it lost its UP/IP), when FRR knows it
  adj.forEach(function (a) {
    if (a.iface && !/^lo/i.test(a.iface) && !interfaces[a.iface] && (ifs[a.iface] || ifFallback[a.iface])) {
      var _ad = ifs[a.iface] || ifFallback[a.iface];
      interfaces[a.iface] = { up: _ad.up !== false, ip: _ifIpStr(a.iface) };
    }
  });
  // nx_collect_unnumbered: keep ip as is ("10.0.0.3/32") and flag the iface, so the page can say "(unnumbered)"
  Object.keys(interfaces).forEach(function (ifn) {
    if ((ifFallback[ifn] || {}).unnumbered && interfaces[ifn].ip) interfaces[ifn].unnumbered = true;
  });

  // Recursive out-iface resolver: a BGP route's immediate next-hop is often a remote loopback with
  // no directly-connected iface (iBGP/eBGP-multihop over an IGP). Resolve it via the RIB (the IGP
  // route to that next-hop) so the DeepDive knows the TRUE forwarding interface (Q14/Q15 coexist:
  // 2.2.2.0 via 2.2.2.2[r2 lo] -> OSPF 2.2.2.2/32 out eth1) instead of an empty/eth0-fallback iface
  // (which the engine reads as output-down -> a spurious red beam over the cyan tunnel).
  function _resolveIface(ip) {
    if (!ip) return '';
    var best = '', bestLen = -1;
    routes.forEach(function (r) {
      var nh = (r.nexthops && r.nexthops[0]) || {};
      if (!nh.iface || nh.iface === 'lo') return;
      var pl = parseInt((r.prefix || '').split('/')[1], 10); if (isNaN(pl) || pl === 0) return;  /* nx_collect_peer_map */
      if (_sameSubnet(r.prefix, ip) && pl > bestLen) { best = nh.iface; bestLen = pl; }
    });
    return best;
  }
  // route_resolution: pick a target = a remote loopback (/32) learned via the protocol,
  // else the farthest learned (non-connected) prefix.
  var rl = routes.filter(function (r) { return r.protocol === proto && r.selected && r.nexthops[0] && r.nexthops[0].ip; });
  var loop = rl.filter(function (r) { return /\/32$/.test(r.prefix); })[0];
  var chosen = loop || rl[0] || null;
  // rr_static_hostroute_fallback: proto-matched RIB has no target (e.g. Q12 ospf-static where the target /32 is
  // reached via a floating/base static, protocol!=proto) -> resolve rr from the selected best route
  // in the RIB so the DeepDive draws the forward arrow + RE Route line + dest (rr feeds many consumers).
  if (!chosen) {
    var _srl = routes.filter(function (r) { return r.selected && r.nexthops[0] && r.nexthops[0].ip && r.nexthops[0].iface && r.nexthops[0].iface !== 'lo'; });
    chosen = _srl.filter(function (r) { return /\/32$/.test(r.prefix); })[0] || _srl[0] || null;
  }
  var routeOk = !!chosen;
  var route_resolution = chosen ? {
    target: chosen.prefix.split('/')[0], resolved: true, protocol: chosen.protocol || proto,
    out_iface: chosen.nexthops[0].iface || _resolveIface(chosen.nexthops[0].ip), next_hop: chosen.nexthops[0].ip,
    matched_prefix: chosen.prefix
  } : { target: '', resolved: false, protocol: '', out_iface: '', next_hop: '', matched_prefix: '' };

  var _adjPeer = function (p) { return adj.some(function (a) { return a.peer === p.name; }); };  /* nx_collect_peer_map */
  var primaryPeer = peers.filter(function (p) { return p.full && !p.noLink && _adjPeer(p); })[0]
    || peers.filter(function (p) { return p.full; })[0] || peers[0] || {};

  // Area / hello timers for the DeepDive panel. A Full OSPF adjacency GUARANTEES matching area
  // and hello/dead timers (OSPF never reaches Full otherwise), so for a Full neighbor we can
  // soundly mirror the target's real area/hello onto the peer side (engine reads literal
  // r1_*/r2_* = target/peer). When not Full we leave them unset (the down panel omits the line).
  var _area = {}, _hello = {};
  if (proto !== 'bgp' && fullCount > 0) {
    var pif = ifs[primaryPeer.iface] || {};
    var tArea = _normArea(pif.area != null ? pif.area : '0');
    var tHello = pif.hello || 10;
    _area = { r1_area: tArea, r2_area: tArea, target_area: tArea, peer_area: tArea, area_match: true };
    _hello = { r1_hello: tHello, r2_hello: tHello, target_hello: tHello, peer_hello: tHello, timer_match: true };
  }

  // State-independent OSPF participation marker (RCL _ospf_iface_participates parity): a data-plane
  // iface is OSPF-active whenever `show ip ospf interface` lists it enabled+up (Internet Address/Area/
  // Hello present) -- NOT gated on the neighbor reaching Full. Real OSPF emits Hellos continuously, so
  // the Hello orb must stay lit while forming and at Full, and survive a transient neighbor-parse gap
  // or a collect that races ahead of Full (the old `nei.list.some(n=>n.full)` gate baked active=false).
  var _ospfActiveLocal = Object.keys(ifs).some(function (k) {
    return !/^lo/i.test(k) && ifs[k] && ifs[k].ospf !== false && ifs[k].up !== false && !ifs[k].passive;  /* nx_ospf_passive_no_hello */
  });
  /* nx_ospf_passive_no_hello: OSPF IF count for the heading (lo excluded, enabled+up, passive COUNTS = "OSPF: Running"), same name as RCL server */
  var _ospfIfCount = Object.keys(ifs).filter(function (k) {
    return !/^lo/i.test(k) && ifs[k] && ifs[k].ospf !== false && ifs[k].up !== false;
  }).length;
  var s = {
    success: true, id: opts.id || selfName, scenario: opts.id || selfName,
    target_node: selfName, peer_node: primaryPeer.name || '',
    interfaces: interfaces,
    wan_iface: route_resolution.out_iface || (chosen && chosen.nexthops[0] && chosen.nexthops[0].iface) || primaryPeer.iface || (Object.keys(interfaces).filter(function (k) { return k !== 'lo'; })[0]) || 'eth0',
    // Input/LAN iface: fall back to a REAL interface, never the mgmt default 'eth0' (excluded from
    // `interfaces`, so the engine reads it as input-down -> spurious red ✖/beam). For a single-uplink
    // source router (coexist/iBGP-over-lo: no distinct ingress) the origin is the loopback.
    // Input/LAN iface: for a genuine dual-link transit use the peer iface; otherwise MIRROR the
    // uplink (out_iface / first non-lo) so a single-uplink node keeps wan==lan == its one data IF ->
    // is-single-link-edge stays true (1 beam/band). Never 'eth0'(mgmt->input-down red) nor 'lo'
    // (lan!=wan -> single-link-edge false -> coexist bands grow BOTH sides = spurious '2 links').
    lan_iface: (peers[0] && peers[0].iface) || route_resolution.out_iface || (Object.keys(interfaces).filter(function (k) { return k !== 'lo'; })[0]) || 'lo',
    neighbor_state: fullCount > 0 ? 'Full' : (peers[0] ? peers[0].state : 'None'),
    has_full: fullCount > 0, full_count: fullCount,
    ospf_configured: opts.ospfConfigured !== undefined ? opts.ospfConfigured : (proto === 'ospf'), /* presence-fix-cfg */
    bgp_configured: opts.bgpConfigured !== undefined ? opts.bgpConfigured : (proto === 'bgp'),
    ospf_active_on_interface: (opts.ospfConfigured !== undefined ? opts.ospfConfigured : (proto === 'ospf')) && _ospfActiveLocal,  /* STATE-INDEPENDENT: local iface participates in OSPF (show ip ospf interface enabled+up), regardless of neighbor_state -> Hello-out orb lit while forming AND at Full; no blink-out on collect-before-Full / neighbor-parse gap */
    ospf_if_count: (opts.ospfConfigured !== undefined ? opts.ospfConfigured : (proto === 'ospf')) ? _ospfIfCount : 0,  /* nx_ospf_passive_no_hello */
    is_passive: ((opts.ospfConfigured !== undefined ? opts.ospfConfigured : (proto === 'ospf')) && Object.keys(ifs).some(function (k) { return !/^lo/i.test(k) && ifs[k] && ifs[k].passive; })),  /* nx_ospf_is_passive: same meaning as RCL server (any non-lo OSPF IF passive) -> engine "passive-interface: YES (Hello停止)" */
    ospf_neighbor_full: nei.list.some(function (n) { return n.full; }),  /* REAL OSPF Full from show ip ospf neighbor (coexist band Full even under --proto bgp) */
    peer_sending_hello: (opts.ospfConfigured !== undefined ? opts.ospfConfigured : (proto === 'ospf')) && nei.list.length > 0,  /* peer HEARD = ANY OSPF neighbor state (Init and beyond = we received the peer's Hello), not only Full -> Hello-in orb shows during forming too; honest: absent only when no neighbor at all (peer unconfigured/down) */
    iface_hellos: ifaceHellos, peer_hellos: peerHellos, peer_sending_hellos: peerSendingHellos,
    bgp_neighbors: (bgpSum.list || []).map(function (n) { var o = { ip: n.ip, remote_as: n.remoteAs, ibgp: !!n.ibgp, state: n.state }; if (n.upDown != null) o.up_down = n.upDown; if (n.pfxRcd != null) o.pfx_rcvd = n.pfxRcd; return o; }),
    ospf_neighbors: (nei.list || []).map(function (n) { var _p = String(n.state || '').split('/'); return { router_id: n.rid, address: n.address, state: _p[0] || '', role: _p[1] || '', iface: n.iface, full: !!n.full }; }),
    target_on_path: false,
    cleared: routeOk && fullCount > 0
  };

  // Dual-link leaf: when the node has >=2 distinct link ifaces but the route did not resolve (so wan
  // fell back to the same iface as lan), split them so the DeepDive draws BOTH beams (in != out).
  (function () {
    var _li = peers.map(function (p) { return p.iface; })
                   .filter(function (v, i, a) { return v && v !== 'lo' && a.indexOf(v) === i; });
    if (_li.length >= 2 && s.wan_iface === s.lan_iface) {
      var _other = _li.filter(function (f) { return f !== s.wan_iface; })[0];
      if (_other) s.lan_iface = _other;
    }
  })();

  if (proto === 'bgp') {
    s.is_established = fullCount > 0;
    s.has_bgp_route = routeOk && fullCount > 0;
    if (s.bgp_configured) s.protocol = 'bgp';  /* nx_state_driven: only when BGP actually configured (was forced for --proto bgp) */
    s.ping_ok = routeOk && fullCount > 0;
    s.has_ospf_route = false;
    // We ran --proto bgp against this node, so BGP IS configured here. Surface that + a session
    // state so a down/isolated node reads "BGP: Active" (configured, not up) instead of the engine's
    // "NOT CONFIGURED" default (which is for RCL scenarios with no bgp data at all).
    /* nx_state_driven: (removed the former `s.bgp_configured = true;` collect-mode force — L356 config-gates */
    /* bgp_configured from opts.bgpConfigured=running-config `router bgp`, so live BGP removal is reflected. */
    if (s.bgp_configured && !s.is_established) {  /* nx_state_driven: no bgp_state residual when BGP removed from config */
      var _dp = peers.filter(function (p) { return !p.full; })[0];
      s.bgp_state = (_dp && _dp.state && _dp.state !== 'Down') ? _dp.state : 'Active';
    }
    // surface learned bgp prefixes for the BGP table — ALL candidate paths (not only best), each with
    // the columns the DeepDive shows (next-hop / AS-path / LocPref / weight / origin) + a status flag
    // ("*>" best / "* " other). Emitting every path lets the Best-Path Decision panel explain WHY the
    // best won (e.g. LocPref 100 > 50) by grouping paths per prefix.
    s.bgp_routes = bgpRt.map(function (r) {
      var o = { prefix: r.prefix, next_hop: r.nextHop, as_path: r.as_path || '',
                best: !!r.best, status: r.best ? '*>' : '* ' };
      if (r.local_pref != null) o.local_pref = r.local_pref;
      if (r.weight != null) o.weight = r.weight;
      if (r.metric != null) o.metric = r.metric;
      if (r.origin) o.origin = r.origin;
      if (r.reason) o.reason = r.reason;
      return o;
    });
    // prefixes received = number of distinct prefixes (one best per prefix)
    // "Prefixes received" = distinct prefixes learned FROM a neighbor (best per prefix).
    // Exclude locally-originated routes (own lo/32 etc.: next-hop 0.0.0.0/empty) so the count is
    // what the router RECEIVED, not the total table size (which includes self-origin).
    // "Prefixes received" = distinct prefixes learned FROM a neighbor (peer next-hop), matching FRR
    // PfxRcd. NOT filtered by best: a received route can be non-best/unusable (Q15 next-hop-self
    // missing -> received but 'no valid path') yet it WAS received. Exclude locally-originated
    // (next-hop 0.0.0.0/empty = self). Dedup by prefix (multiple paths per prefix count once).
    s.pfx_rcvd = (function(){ var seen={}; s.bgp_routes.forEach(function(r){ if(r.next_hop && r.next_hop!=='0.0.0.0') seen[r.prefix]=1; }); return Object.keys(seen).length; })();
  } else {
    s.has_ospf_route = routeOk && fullCount > 0;
    s.ping_ok = routeOk && fullCount > 0;
  }
  s.route_resolution = (routeOk && fullCount > 0) ? route_resolution
    : { target: route_resolution.target, resolved: false, protocol: '', out_iface: '', next_hop: '', matched_prefix: '' };
  // All prefixes this node learned via the protocol (own = locally originated, no next-hop ip),
  // so the DeepDive LSDB can show the whole picture (link networks + remote loopbacks) instead of
  // just the one decision target. OSPF only: LSDB is an OSPF concept; BGP learned routes go through
  // s.bgp_routes (the BGP table), not here.
  // nx_state_driven: LSDB is an OSPF concept -> build from OSPF routes whenever OSPF is configured, regardless
  // of collect --proto (an OSPF node in a bgp-collected/mixed lab, or after live BGP removal, still has an LSDB).
  // Was gated on proto!=='bgp' + filtered by collect-mode proto -> empty LSDB for OSPF nodes under --proto bgp.
  if (s.ospf_configured) {
    s.lsdb_prefixes = routes.filter(function (r) { return r.protocol === 'ospf'; }).map(function (r) {
      var via = (r.nexthops && r.nexthops[0]) || {};
      return { text: r.prefix, own: !via.ip, via: via.ip || via.iface || '' };
    });
  }

  // Full routing table (prefix -> out-iface) for the single-node panel (xray-node-panel.js).
  // Position-independent: just the RIB rows this node holds, for a text table beside any topology GUI.
  s.routing_table = routes.filter(function (r) {
    // When mgmt exclusion is on, drop mgmt RIB rows too (the mgmt connected/local prefix and any
    // route whose next-hop is the mgmt gateway, e.g. the default 0.0.0.0/0) — identified by SUBNET,
    // matching the interface-level exclusion above, so eth0-as-data labs are unaffected.
    if (!mgmtSubnet) return true;
    var _nh0 = (r.nexthops && r.nexthops[0]) || {};
    var _pfxIp = (r.prefix || '').split('/')[0];
    if (_pfxIp && _sameSubnet(mgmtSubnet, _pfxIp)) return false;
    if (_nh0.ip && _sameSubnet(mgmtSubnet, _nh0.ip)) return false;
    return true;
  }).map(function (r) {
    var nh = (r.nexthops && r.nexthops[0]) || {};
    var _sel = !!r.selected;
    // mgmt-excluded view: a static default (0.0.0.0/0) is shadowed in the real FIB by the clab mgmt
    // KERNEL default (selected), which we've just dropped. With mgmt gone the static IS the installed
    // default, so promote it to selected so the (selected-only) routing-table panel renders it -- the

    // route_resolution); a down out-iface (Q1 eth1 shutdown) stays unselected = correctly not installed.
    if (mgmtSubnet && !_sel && r.protocol === 'static' && r.prefix === '0.0.0.0/0'
        && nh.iface && interfaces[nh.iface] && interfaces[nh.iface].up) _sel = true;
    return { prefix: r.prefix, out_iface: nh.iface || _resolveIface(nh.ip) || '', next_hop: nh.ip || '',
             protocol: r.protocol, selected: _sel };
  });

  // Static-lab route resolution: a pure-static topology has no OSPF/BGP neighbor (fullCount=0), so the
  // protocol-based route_resolution above stays empty and the DeepDive would show 'Route: NONE / DROP'
  // even when the upstream default route is up. Resolve the target via the scenario static default
  // (0.0.0.0/0 protocol 'static'), ignoring the containerlab mgmt KERNEL default that shadows it
  // (distance 0). Reachable iff that default's out-iface is up -> FORWARD; iface down (Q1 eth1
  // shutdown) leaves it unresolved -> NONE/DROP. OSPF/BGP labs are untouched (guarded on !_configured).
  if (!s.route_resolution.resolved && !s.ospf_configured && !s.bgp_configured) {
    // Generalized static-lab resolution: the scenario's reachability goal is the static route it
    // installs. Prefer a default (0.0.0.0/0 -> probe 8.8.8.8 convention); else the most-specific
    // static /N (e.g. Q4 next-hop-unreachable: 2.2.2.2/32). Ignore the containerlab mgmt KERNEL
    // default (protocol 'kernel', not 'static'). resolved iff FRR installed it (selected + nexthop
    // active) AND the out-iface is up -> FORWARD; unresolved (Q1 iface down / Q4 unreachable
    // next-hop) -> NONE/DROP, but the TARGET is still surfaced so the panel shows the real goal.
    var _statics = routes.filter(function (r) {
      return r.protocol === 'static' && r.nexthops && r.nexthops[0];
    });
    var _sdef = _statics.filter(function (r) { return r.prefix === '0.0.0.0/0'; })[0];
    var _sspec = _statics.filter(function (r) { return r.prefix !== '0.0.0.0/0'; })
      .sort(function (a, b) { return (parseInt(b.prefix.split('/')[1], 10) || 0) - (parseInt(a.prefix.split('/')[1], 10) || 0); })[0];
    var _st = _sdef || _sspec;
    if (_st) {
      var _snh = _st.nexthops[0];
      var _soif = _snh.iface || '';
      var _soifUp = !!(_soif && interfaces[_soif] && interfaces[_soif].up);
      // A static present in the RIB (show ip route) is already FRR-resolved; the mgmt KERNEL default
      // may shadow a static 0.0.0.0/0 (selected=false) yet the scenario intends it, so gate on
      // out-iface up (NOT selected). Fully-unresolvable statics (Q4 fault) aren't in the RIB at all
      // -> handled by the configStatics fallback below (resolved=false).
      var _stResolved = _soifUp;
      var _stTarget = (_st.prefix === '0.0.0.0/0') ? (opts.target || '8.8.8.8') : _st.prefix.split('/')[0];
      s.route_resolution = { target: _stTarget, resolved: _stResolved, protocol: 'static',
        out_iface: _soif, next_hop: _snh.ip || '', matched_prefix: _st.prefix };
      s.nh_reachable = _stResolved;
      s.ping_ok = _stResolved;
    } else if (opts.configStatics && opts.configStatics.length) {
      // No static in the RIB (fully-unresolved fault: FRR drops unresolvable statics). Surface the
      // TARGET from the configured static so the panel reads 'Route to <dest>: NONE / DROP' with the
      // real scenario destination -- resolution stays false (not installed = not reachable).
      var _cs = opts.configStatics.filter(function (r) { return r.prefix !== '0.0.0.0/0'; })
        .sort(function (a, b) { return (parseInt(b.prefix.split('/')[1], 10) || 0) - (parseInt(a.prefix.split('/')[1], 10) || 0); })[0]
        || opts.configStatics[0];
      if (_cs) {
        var _csTarget = (_cs.prefix === '0.0.0.0/0') ? (opts.target || '8.8.8.8') : _cs.prefix.split('/')[0];
        s.route_resolution = { target: _csTarget, resolved: false, protocol: 'static',
          out_iface: '', next_hop: _cs.nexthop || '', matched_prefix: _cs.prefix };
        s.nh_reachable = false;
        s.ping_ok = false;
      }
    }
  }
  Object.keys(_area).forEach(function (k) { s[k] = _area[k]; });
  Object.keys(_hello).forEach(function (k) { s[k] = _hello[k]; });

  var _keepUp = {};  /* nx_collect_keep_up: 2+ links/sessions to one peer -> an up one keeps the per-peer keys (was last-wins) */
  peers.forEach(function (p) {
    if (_keepUp[p.name] && !p.full) return;
    if (p.full) _keepUp[p.name] = true;
    s[p.name + '_has_full'] = p.full;
    s[p.name + '_iface'] = p.iface;
    s[p.name + '_neighbor_state'] = p.full ? 'Full' : (p.state || 'None');
  });

  // Real OSPF adjacency state, carried SEPARATELY from the primary (--proto) neighbor_state/has_full.
  // In a coexist lab the primary is BGP, so neighbor_state/<peer>_neighbor_state are the BGP session;
  // these dedicated ospf_* fields let the DeepDive OSPF layer show the TRUE OSPF neighbor state
  // (Full/2-Way/Init/Down) instead of echoing the BGP state. For a pure-OSPF lab they mirror the
  // primary (nei == the OSPF neighbors), so single-protocol output is unchanged in meaning.
  var _ospfByPeer = {};
  nei.list.forEach(function (n) { var _pn = n.iface ? ifaceToPeer[n.iface] : null; if (_pn && !(_ospfByPeer[_pn] && _ospfByPeer[_pn].full && !n.full)) _ospfByPeer[_pn] = n; });  /* nx_collect_keep_up: a Full neighbor keeps <peer>_ospf_* */
  s.ospf_neighbor_state = nei.list.some(function (n) { return n.full; }) ? 'Full'
    : (nei.list[0] ? nei.list[0].state : (s.ospf_configured ? 'Down' : 'None'));
  peers.forEach(function (p) {
    var _on = _ospfByPeer[p.name];
    s[p.name + '_ospf_full'] = !!(_on && _on.full);
    s[p.name + '_ospf_state'] = _on ? (_on.full ? 'Full' : _on.state) : (s.ospf_configured ? 'Down' : 'None');
  });
  // nx_bgp_mode_ospf_hello (2026-10-01): --proto bgp skips the OSPF Hello maps above (`if (proto !== 'bgp')`),
  // so a BGP-collected node that ALSO runs OSPF (coexist / OSPF-only after BGP removal) drew no Hello at all.
  // Same rules as the ospf branch: OUT = local iface listed by `show ip ospf interface`; IN = this peer's
  // REAL OSPF neighbor (_ospfByPeer) is Init or beyond. Only fills the maps when empty (ospf mode unchanged).
  if (proto === 'bgp' && s.ospf_configured) {
    var _ih = s.iface_hellos || {}, _ph = s.peer_hellos || {}, _psh = s.peer_sending_hellos || {};
    if (!Object.keys(_ih).length && !Object.keys(_ph).length && !Object.keys(_psh).length) {
      // nx_collect_peer_map: the clab links as well as the BGP peers (BGP peers over lo carry no link iface)
      peers.map(function (p) { return { name: p.name, iface: p.iface }; })
        .concat(adj.map(function (a) { return { name: a.peer, iface: a.iface }; })).forEach(function (p) {
        if (p.iface && ifs[p.iface] && !ifs[p.iface].passive) _ih[p.iface] = ifs[p.iface].hello || 10;  /* nx_ospf_passive_no_hello */
        var _on = _ospfByPeer[p.name];
        var _up = !!(_on && (_on.full || /^(full|loading|exchange|exstart|2-?way|init)/i.test(_on.state || '')));
        if (_psh[p.name] === true) return;
        _psh[p.name] = _up;
        if (_up) _ph[p.name] = (ifs[_on.iface] && ifs[_on.iface].hello) || (ifs[p.iface] && ifs[p.iface].hello) || 10;
      });
      s.iface_hellos = _ih; s.peer_hellos = _ph; s.peer_sending_hellos = _psh;
    }
  }

  /* nx_peer_links (2026-10-11, DeepDive N tunnels): one row PER LINK (= local iface), additive.
     The per-peer keys above (<peer>_iface / _has_full / _neighbor_state / _ospf_*) are keyed by the PEER NAME,
     so two links to the same peer overwrite each other and a down 2nd link is never emitted. peer_links keeps
     every topology link (--adj first: incl. IP-less / unused links), then live peers not in --adj. Loopback-only
     sessions (iBGP over lo: iface "" / lo) own no link and are not rows. Old keys unchanged = RCL / 2-peer same. */
  var _plRows = [], _plSeen = {};
  var _plOspfByIf = {};
  nei.list.forEach(function (n) { if (n.iface && !_plOspfByIf[n.iface]) _plOspfByIf[n.iface] = n; });
  var _plPeerByIf = function (ifn) { return peers.filter(function (p) { return p.iface === ifn; })[0] || null; };
  var _plAdd = function (ifn, peerName) {
    if (!ifn || /^lo/i.test(ifn) || _plSeen[ifn]) return;
    _plSeen[ifn] = true;
    var _lp = _plPeerByIf(ifn), _lo = _plOspfByIf[ifn], _li = interfaces[ifn] || {};
    _plRows.push({
      iface: ifn, peer: peerName || (_lp && _lp.name) || '',
      up: interfaces[ifn] ? _li.up !== false : !!_lp, ip: _li.ip || '',
      full: !!(_lp && _lp.full), state: _lp ? (_lp.full ? 'Full' : (_lp.state || 'None')) : 'Down',
      ospf_full: !!(_lo && _lo.full), ospf_state: _lo ? (_lo.full ? 'Full' : _lo.state) : (s.ospf_configured ? 'Down' : 'None'),
      peer_ip: (_lp && _lp.ip) || (_lo && _lo.address) || ''
    });
    if (_lp && _lp.overLo) _plRows[_plRows.length - 1].bgp_over_lo = true;  /* nx_collect_peer_map: the BGP state on this row is a loopback session to this peer, carried over this link */
  };
  adj.forEach(function (a) { _plAdd(a.iface, a.peer); });
  peers.forEach(function (p) { _plAdd(p.iface, p.name); });
  if (_plRows.length) s.peer_links = _plRows;

  return s;
}

// OSPF area id: FRR prints "0.0.0.0" for the backbone; show the short "0" the labs use.
function _normArea(a) {
  if (a == null) return '0';
  var s = String(a);
  if (s === '0.0.0.0') return '0';
  var m = s.match(/^0\.0\.0\.(\d+)$/);   // 0.0.0.N -> N (common single-octet area ids)
  return m ? m[1] : s;
}

function _sameSubnet(prefix, ip) {
  if (!prefix || !ip) return false;
  // nx_collect_peer_map: the real prefix length when given (a /30 link must not match the next /30); no length -> first 3 octets as before
  var _pl = parseInt(String(prefix).split('/')[1], 10);
  var _ip4 = function (s) { var o = String(s).split('/')[0].split('.').map(Number); return o.length === 4 && o.every(function (x) { return x >= 0 && x <= 255; }) ? ((o[0] * 16777216) + (o[1] << 16) + (o[2] << 8) + o[3]) : null; };
  var _a = _ip4(prefix), _b = _ip4(ip);
  if (!isNaN(_pl) && _pl >= 0 && _pl <= 32 && _a !== null && _b !== null) {
    var _sz = Math.pow(2, 32 - _pl);
    return Math.floor(_a / _sz) === Math.floor(_b / _sz);
  }
  var net = prefix.split('/')[0].split('.').slice(0, 3).join('.');
  return ip.split('.').slice(0, 3).join('.') === net;
}

// ---- assemble from a bundle of parsed-or-raw json -------------------------------------------
// raw: { ospfNeighbor, ospfInterface, interface, route, bgpSummary, bgp }  (each = FRR json object)
function collectFromJson(args) {
  var proto = (args.proto || 'ospf').toLowerCase();
  return buildState({
    selfName: args.node, id: args.id || args.node, proto: proto,
    adjacency: args.adjacency || [], mgmtSubnet: args.mgmtSubnet || '',
    ospfConfigured: args.ospfConfigured, bgpConfigured: args.bgpConfigured, /* presence-fix-cfg */
    ospfNei: parseOspfNeighbors(args.ospfNeighbor),
    ospfIf: parseOspfInterfaces(args.ospfInterface),
    ifaces: parseInterfaces(args.interface),
    routes: parseRoutes(args.route),
    configStatics: args.configStatics || [],
    bgpSum: parseBgpSummary(args.bgpSummary),
    bgpRoutes: parseBgpRoutes(args.bgp)
  });
}

// ---- live: docker exec on clab-<lab>-<node> -------------------------------------------------
function _vtyshJson(container, showCmd) {
  var _b = _vtyBase(container);
  var out = _vtyExec(_b[0], _b[1].concat(['-c', showCmd + ' json']), 8 * 1024 * 1024);   /* nx_unread */
  try { return JSON.parse(_stripVtyWarn(out)); } catch (e) { return null; }
}
// Run several `show ... json` commands in ONE vtysh process and return their parsed objects in order.
// Because the commands execute back-to-back inside a single vtysh session (microseconds apart) the
// reads are effectively atomic: e.g. `show ip bgp summary` (session state) and `show ip bgp` (learned
// routes) can never straddle a keepalive tick, so the snapshot is internally consistent by
// construction (no phantom "session Idle but routes present"). Splits the concatenated top-level
// JSON objects by brace depth (string-aware; 92 = backslash escape char).
function _vtyshBatch(container, showCmds) {
  var _b = _vtyBase(container); var args = _b[1].slice();
  showCmds.forEach(function (c) { args.push('-c', c + ' json'); });
  var out;
  try { out = _vtyExec(_b[0], args, 16 * 1024 * 1024); }   /* nx_unread */
  catch (e) { if (e && e.nxUnread) throw e; return showCmds.map(function () { return null; }); }
  var objs = [], depth = 0, start = -1, inStr = false, esc = false;
  for (var i = 0; i < out.length; i++) {
    var cc = out.charCodeAt(i);
    if (inStr) { if (esc) esc = false; else if (cc === 92) esc = true; else if (cc === 34) inStr = false; continue; }
    if (cc === 34) { inStr = true; continue; }
    if (cc === 123) { if (depth === 0) start = i; depth++; }
    else if (cc === 125) { depth--; if (depth === 0 && start >= 0) { objs.push(out.slice(start, i + 1)); start = -1; } }
  }
  return showCmds.map(function (c, idx) { try { return JSON.parse(objs[idx]); } catch (e) { return null; } });
}

function collectLive(opts) {
  /* nx_no_shell (2026-10-17): the commands here are fixed and passed as argument arrays; the lab / node names become a
     container name (or a socket file name) and must be plain names */
  var _safeName = /^[A-Za-z0-9][A-Za-z0-9_.-]{0,62}$/;
  if (!_safeName.test(String(opts.node)) || (opts.lab != null && !_safeName.test(String(opts.lab)))) throw new Error('--lab / --node must be plain names (letters, digits, _ . -)');   /* nx_review_1017 (F-06): the lab name too, also with vtysh sockets */
  var container = (_VTY_SOCK ? opts.node : ('clab-' + opts.lab + '-' + opts.node));
  var proto = (opts.proto || 'ospf').toLowerCase();
  var raw = {
    interface: _safe(function () { return _vtyshJson(container, 'show interface'); }),
    route: _safe(function () { return _vtyshJson(container, 'show ip route'); })
  };
  if (proto === 'bgp') {
    var _bp = _vtyshBatch(container, ['show ip bgp summary', 'show ip bgp']);  /* atomic pair: no tick straddle */
    raw.bgpSummary = _bp[0]; raw.bgp = _bp[1];
  }
  // Always collect OSPF neighbor/interface (not only under --proto ospf): a coexist lab runs
  // --proto bgp but ALSO has OSPF, and the DeepDive OSPF band must reflect the REAL adjacency
  // (Full=green) instead of a presence guess (ospf_configured -> Init). Harmless null on pure BGP.
  raw.ospfNeighbor = _safe(function () { return _vtyshJson(container, 'show ip ospf neighbor'); });
  raw.ospfInterface = _safe(function () { return _vtyshJson(container, 'show ip ospf interface'); });
  // Atomic-consistency guard (BGP): `show ip bgp summary` and `show ip bgp` are separate vtysh
  // queries; a keepalive tick between them can make the summary momentarily read a peer as not
  // Established while the table still holds its learned routes -> a phantom 'Idle with routes'
  // snapshot. Re-query the summary until it is consistent with the table (established, or genuinely
  // no routes). This reflects the TRUE state via re-measurement, not inference.
  if (proto === 'bgp') {
    for (var _bt = 0; _bt < 4; _bt++) {
      var _sum = parseBgpSummary(raw.bgpSummary);
      var _rts = parseBgpRoutes(raw.bgp);
      var _anyEst = _sum.list.some(function (b) { return b.established; });
      if (_anyEst || !_rts.length) break;
      var _bpr = _vtyshBatch(container, ['show ip bgp summary', 'show ip bgp']);
      raw.bgpSummary = _bpr[0]; raw.bgp = _bpr[1];
    }
  }
  var _cfgTxt = _safe(function(){ return (function(){var _b=_vtyBase(container);return _vtyExec(_b[0],_b[1].concat(['-c','show running-config']),8*1024*1024);})(); }) || '';
  // Configured static routes (running-config) = TARGET source when a fault leaves the route fully
  // unresolved (FRR omits unresolvable statics from show ip route), so init/solved agree on the
  // scenario destination (Q4 2.2.2.2) instead of the 8.8.8.8 default.
  var _cfgStatics = _cfgTxt.split(String.fromCharCode(10)).map(function(l){ var m=l.trim().match(/^ip route (\S+) (\S+)/); return m?{prefix:m[1],nexthop:m[2]}:null; }).filter(Boolean);
  return collectFromJson({ node: opts.node, id: opts.lab, proto: proto, adjacency: opts.adjacency || [], configStatics: _cfgStatics,
    ospfConfigured: _cfgTxt.split(String.fromCharCode(10)).some(function(l){return l.trim().indexOf('router ospf')===0;}), bgpConfigured: _cfgTxt.split(String.fromCharCode(10)).some(function(l){return l.trim().indexOf('router bgp')===0;}),
    mgmtSubnet: opts.mgmtSubnet || '',
    ospfNeighbor: raw.ospfNeighbor, ospfInterface: raw.ospfInterface, interface: raw.interface,
    route: raw.route, bgpSummary: raw.bgpSummary, bgp: raw.bgp });
}
function _safe(fn) { try { return fn(); } catch (e) { if (e && e.nxUnread) throw e; return null; } }   /* nx_unread: a router that cannot be read is not 'empty' */

// ---- CLI ------------------------------------------------------------------------------------
function _argMap(argv) {
  var m = {}; for (var i = 0; i < argv.length; i++) {
    if (argv[i].indexOf('--') === 0) { var k = argv[i].slice(2); var v = (argv[i + 1] && argv[i + 1].indexOf('--') !== 0) ? argv[++i] : true; m[k] = v; }
  } return m;
}
function _parseAdj(s) {     // "eth0:r2,eth1:r3" -> [{iface:'eth0',peer:'r2'},...]
  if (!s || s === true) return [];
  return String(s).split(',').map(function (p) { var kv = p.split(':'); return { iface: kv[0], peer: kv[1] }; });
}

// ---- bundled self-test fixtures (real FRR 8.x json shapes) ----------------------------------
var FIX = {
  // r1 in a linear r1--r2--r3 OSPF lab: Full with r2 on eth0; r2-r3 link is r3 side.
  ospfNeighbor: { neighbors: { '2.2.2.2': [
    { priority: 1, state: 'Full/DR', address: '10.1.0.20', ifaceName: 'eth0', upTimeInMsec: 99000 } ] } },
  ospfInterface: { interfaces: {
    eth0: { ifUp: true, ospfEnabled: true, ipAddress: '10.1.0.10', ipAddressPrefixlen: 24, area: '0.0.0.0', timerMsecs: 10000 } } },
  route: {
    '10.1.0.0/24': [ { prefix: '10.1.0.0/24', protocol: 'connected', selected: true, nexthops: [ { directlyConnected: true, interfaceName: 'eth0', active: true } ] } ],
    '2.2.2.2/32': [ { prefix: '2.2.2.2/32', protocol: 'ospf', selected: true, nexthops: [ { ip: '10.1.0.20', interfaceName: 'eth0', active: true } ] } ],
    '3.3.3.3/32': [ { prefix: '3.3.3.3/32', protocol: 'ospf', selected: true, nexthops: [ { ip: '10.1.0.20', interfaceName: 'eth0', active: true } ] } ],
    '10.2.0.0/24': [ { prefix: '10.2.0.0/24', protocol: 'ospf', selected: true, nexthops: [ { ip: '10.1.0.20', interfaceName: 'eth0', active: true } ] } ]
  },
  // BGP variant: r1 eBGP with r2, learned 203.0.113.0/24
  bgpSummary: { ipv4Unicast: { peers: { '10.1.0.20': { state: 'Established', remoteAs: 65002 } } } },
  bgp: { routes: { '203.0.113.0/24': [ { prefix: '203.0.113.0/24', nexthops: [ { ip: '10.1.0.20' } ], bestpath: true, valid: true } ] } }
};

function _assert(cond, msg) { if (!cond) { throw new Error('FAIL: ' + msg); } console.log('  PASS: ' + msg); }

function selfTest() {
  console.log('self-test: OSPF (r1, Full with r2 on eth0, loopbacks 2.2.2.2/3.3.3.3 learned)');
  var st = collectFromJson({ node: 'r1', id: 'lin', proto: 'ospf',
    adjacency: [{ iface: 'eth0', peer: 'r2' }],
    ospfNeighbor: FIX.ospfNeighbor, ospfInterface: FIX.ospfInterface, route: FIX.route });
  _assert(st.target_node === 'r1', 'target_node = r1');
  _assert(st.full_count === 1, 'full_count = 1 (real neighbor Full/DR)');
  _assert(st.r2_has_full === true, 'r2 labeled via clab link (eth0->r2) and Full');
  _assert(st.r2_iface === 'eth0', 'r2 iface = eth0');
  _assert(st.interfaces.eth0 && st.interfaces.eth0.ip === '10.1.0.10/24', 'eth0 ip from ospf-interface json');
  _assert(st.iface_hellos.eth0 === 10, 'hello = 10s parsed from timerMsecs 10000');
  // nx_collect_keep_up: 2 links to one peer, the 2nd down -> the up one keeps r2_iface / r2_has_full / r2_neighbor_state
  (function () {
    var _ku = buildState({ selfName: 'r1', proto: 'bgp', adjacency: [{ iface: 'eth1', peer: 'r2' }, { iface: 'eth2', peer: 'r2' }],
      ifaces: { eth1: { up: true, ip: '10.0.1.1', prefix: 30 }, eth2: { up: true, ip: '10.0.2.1', prefix: 30 } },
      routes: [{ prefix: '10.0.1.0/30', protocol: 'connected', selected: true, nexthops: [{ iface: 'eth1' }] }, { prefix: '10.0.2.0/30', protocol: 'connected', selected: true, nexthops: [{ iface: 'eth2' }] }],
      bgpSum: { byIp: {}, list: [{ ip: '10.0.1.2', state: 'Established', established: true, remoteAs: 65002, localAs: 65001 }, { ip: '10.0.2.2', state: 'Active', established: false, remoteAs: 65002, localAs: 65001 }] } });
    _assert(_ku.r2_iface === 'eth1' && _ku.r2_has_full === true && _ku.r2_neighbor_state === 'Full', 'keep_up: 2 links to r2 (eth1 Established, eth2 Active) -> r2_iface eth1 / Full');
    var _k1 = buildState({ selfName: 'r1', proto: 'bgp', adjacency: [{ iface: 'eth1', peer: 'r2' }],
      ifaces: { eth1: { up: true, ip: '10.0.1.1', prefix: 30 } }, routes: [{ prefix: '10.0.1.0/30', protocol: 'connected', selected: true, nexthops: [{ iface: 'eth1' }] }],
      bgpSum: { byIp: {}, list: [{ ip: '10.0.1.2', state: 'Active', established: false, remoteAs: 65002, localAs: 65001 }] } });
    _assert(_k1.r2_iface === 'eth1' && _k1.r2_has_full === false && _k1.r2_neighbor_state === 'Active', 'keep_up: one link to r2, down -> unchanged (r2 Active)');
  })();
  _assert(st.has_ospf_route === true && st.ping_ok === true, 'route resolved + ping_ok');
  _assert(st.route_resolution.next_hop === '10.1.0.20' && st.route_resolution.out_iface === 'eth0', 'route_resolution next-hop/iface real');
  _assert(/\/32$/.test(st.route_resolution.matched_prefix), 'target prefers a remote loopback /32');
  _assert(st.area_match === true && st.r1_area === '0' && st.r2_area === '0', 'area_match true + r1/r2 area = 0 (Full implies match; clears Area MISMATCH)');
  _assert(st.timer_match === true && st.r1_hello === 10 && st.r2_hello === 10, 'timer_match true + hellos mirrored from real iface');

  console.log('self-test: OSPF ifaceName "eth0:10.1.0.10" (real FRR 8.4 form) -> iface stripped to bare, peer still maps');
  var fixIp = JSON.parse(JSON.stringify(FIX));
  fixIp.ospfNeighbor.neighbors['2.2.2.2'][0].ifaceName = 'eth0:10.1.0.10';
  var sip = collectFromJson({ node: 'r1', proto: 'ospf', adjacency: [{ iface: 'eth0', peer: 'r2' }],
    ospfNeighbor: fixIp.ospfNeighbor, ospfInterface: FIX.ospfInterface, route: FIX.route });
  _assert(sip.r2_iface === 'eth0', 'ifaceName ":ip" stripped to bare eth0');
  _assert(sip.r2_has_full === true, 'peer still maps to r2 via bare iface (not mislabeled to seq name)');
  _assert(sip.lan_iface === 'eth0', 'lan_iface bare (no :ip leak)');

  console.log('self-test: OSPF DOWN (neighbor Init -> not Full)');
  var down = JSON.parse(JSON.stringify(FIX));
  down.ospfNeighbor.neighbors['2.2.2.2'][0].state = 'Init/-';
  var sd = collectFromJson({ node: 'r1', proto: 'ospf', adjacency: [{ iface: 'eth0', peer: 'r2' }],
    ospfNeighbor: down.ospfNeighbor, ospfInterface: FIX.ospfInterface, route: { '10.1.0.0/24': FIX.route['10.1.0.0/24'] } });
  _assert(sd.full_count === 0 && sd.has_full === false, 'full_count 0 when Init');
  _assert(sd.r2_has_full === false && sd.r2_neighbor_state === 'Init/-', 'per-peer reflects Init/-');
  _assert(sd.has_ospf_route === false && sd.cleared === false, 'no route / not cleared when down');

  console.log('self-test: OSPF peer in --adj but absent from neighbors (shut link) -> emitted Down');
  // adj has two peers (eth0:r1, eth1:r3) but the fixture neighbor list only has the eth0 one (-> r1
  // Full). eth1's peer r3 is absent (link down) and must be emitted as Down, not default Full.
  var sgone = collectFromJson({ node: 'r2', proto: 'ospf', adjacency: [{ iface: 'eth0', peer: 'r1' }, { iface: 'eth1', peer: 'r3' }],
    ospfNeighbor: FIX.ospfNeighbor, ospfInterface: FIX.ospfInterface, route: FIX.route });
  _assert(sgone.r1_has_full === true && sgone.r1_neighbor_state === 'Full', 'live neighbor on eth0 -> r1 Full');
  _assert(sgone.r3_has_full === false && sgone.r3_neighbor_state === 'Down', 'absent --adj peer r3 emitted Down (not default Full)');

  console.log('self-test: BGP (Established, 203.0.113.0/24 best)');
  var sb = collectFromJson({ node: 'r1', proto: 'bgp', adjacency: [{ iface: 'eth0', peer: 'r2' }],
    bgpSummary: FIX.bgpSummary, bgp: FIX.bgp,
    route: { '203.0.113.0/24': [ { prefix: '203.0.113.0/24', protocol: 'bgp', selected: true, nexthops: [ { ip: '10.1.0.20', interfaceName: 'eth0', active: true } ] } ],
             '10.1.0.0/24': FIX.route['10.1.0.0/24'] } });
  _assert(sb.is_established === true, 'is_established when peer Established');
  _assert(sb.has_bgp_route === true, 'has_bgp_route true');
  _assert(sb.bgp_routes.length === 1 && sb.bgp_routes[0].prefix === '203.0.113.0/24', 'bgp_routes carries best prefix');
  _assert(sb.r2_has_full === true, 'bgp peer mapped to clab node r2 via connected subnet');

  // --- clab mgmt-interface exclusion (opt-in, identified by SUBNET not iface name) ---
  var _mgIf = { eth0: { up: true, ip: '172.20.20.3', prefix: 24 }, eth1: { up: true, ip: '10.0.0.1', prefix: 24 } };
  var _mgAdj = [{ iface: 'eth1', peer: 'r2' }];
  var sKeep = buildState({ selfName: 'r1', proto: 'ospf', ifaces: _mgIf, adjacency: _mgAdj });
  _assert(sKeep.interfaces.eth0 && sKeep.interfaces.eth1, 'mgmt: default off keeps both eth0(mgmt) and eth1(data)');
  var sDrop = buildState({ selfName: 'r1', proto: 'ospf', ifaces: _mgIf, adjacency: _mgAdj, mgmtSubnet: '172.20.20.0/24' });
  _assert(!sDrop.interfaces.eth0 && sDrop.interfaces.eth1, 'mgmt: --mgmt-subnet drops eth0(172.20.20.x) by subnet, keeps eth1(data)');
  var sEth0Data = buildState({ selfName: 'r1', proto: 'ospf', ifaces: { eth0: { up: true, ip: '10.0.0.1', prefix: 24 } }, adjacency: [{ iface: 'eth0', peer: 'r2' }], mgmtSubnet: '172.20.20.0/24' });
  _assert(sEth0Data.interfaces.eth0, 'mgmt: eth0 as DATA iface (10.0.0.x) NOT dropped by mgmt-subnet (subnet-based, not name-based)');

  console.log('self-test: nx_peer_links - two links to the same peer (eth1 Full, eth2 shut) + an IP-less spare link');
  var _plNei = { neighbors: { '2.2.2.2': [ { state: 'Full/DR', address: '10.1.0.20', ifaceName: 'eth1:10.1.0.10' } ] } };
  var _plIf = { interfaces: { eth1: { ifUp: true, ospfEnabled: true, ipAddress: '10.1.0.10', ipAddressPrefixlen: 24, area: '0.0.0.0', timerMsecs: 10000 },
    eth2: { ifUp: false, ospfEnabled: true, ipAddress: '10.2.0.10', ipAddressPrefixlen: 24, area: '0.0.0.0', timerMsecs: 10000 } } };
  var spl = collectFromJson({ node: 'r1', proto: 'ospf', adjacency: [{ iface: 'eth1', peer: 'r2' }, { iface: 'eth2', peer: 'r2' }, { iface: 'eth3', peer: 'r3' }],
    ospfNeighbor: _plNei, ospfInterface: _plIf, interface: { eth3: { up: true } }, route: FIX.route });
  _assert(Array.isArray(spl.peer_links) && spl.peer_links.length === 3, 'peer_links: one row per link (3) incl. 2 links to r2');
  _assert(spl.peer_links[0].iface === 'eth1' && spl.peer_links[0].peer === 'r2' && spl.peer_links[0].full === true && spl.peer_links[0].ospf_state === 'Full', 'peer_links eth1 -> r2 Full');
  _assert(spl.peer_links[1].iface === 'eth2' && spl.peer_links[1].peer === 'r2' && spl.peer_links[1].full === false && spl.peer_links[1].state === 'Down' && spl.peer_links[1].up === false, 'peer_links eth2 -> r2 Down (2nd link kept, not overwritten)');
  _assert(spl.peer_links[2].iface === 'eth3' && spl.peer_links[2].peer === 'r3' && spl.peer_links[2].ip === '' && spl.peer_links[2].state === 'Down', 'peer_links eth3 -> r3 IP-less spare link kept');
  _assert(spl.r2_iface === 'eth1' && spl.r2_has_full === true, 'old per-peer keys unchanged (r2 = the live eth1)');
  _assert(st.peer_links && st.peer_links.length === 1 && st.peer_links[0].iface === 'eth0' && st.peer_links[0].peer === 'r2', 'single-link lab: peer_links = [eth0 -> r2]');

  console.log('self-test: nx_kernel_tunnel_if - the kernel fallback tunnels (FRR 8.4 / 10.7.1 `show interface json` shape) are dropped');
  var _kt = parseInterfaces({
    gre0: { administrativeStatus: 'down', linkUps: 0, linkDowns: 0, vrfName: 'default', mtu: 1476, flags: '<NOARP>', type: 'GRE over IP', interfaceType: 'GRE', ipAddresses: [] },
    gretap0: { administrativeStatus: 'down', linkUps: 0, vrfName: 'default', flags: '<BROADCAST,MULTICAST>', type: 'Ethernet', interfaceType: 'GRETAP', ipAddresses: [] },
    erspan0: { administrativeStatus: 'down', linkUps: 0, vrfName: 'default', type: 'Ethernet', interfaceType: 'Other', ipAddresses: [] },
    ip6gre0: { administrativeStatus: 'down', linkUps: 0, type: 'GRE over IPv6', interfaceType: 'IP6GRE', ipAddresses: [] },
    ip6tnl0: { administrativeStatus: 'down', linkUps: 0, type: 'IPIP6 Tunnel', interfaceType: 'Other', ipAddresses: [] },
    tunl0: { administrativeStatus: 'down', linkUps: 0, ipAddresses: [] },
    sit0: { administrativeStatus: 'down', ipAddresses: [] },
    gre1: { administrativeStatus: 'down', linkUps: 0, type: 'GRE over IP', ipAddresses: [] },
    eth1: { administrativeStatus: 'up', operationalStatus: 'up', linkUps: 1, ipAddresses: [{ address: '10.1.0.1/30' }] },
    eth2: { administrativeStatus: 'down', linkUps: 0, ipAddresses: [] }
  });
  _assert(['gre0', 'gretap0', 'erspan0', 'ip6gre0', 'ip6tnl0', 'tunl0', 'sit0'].every(function (k) { return !_kt[k]; }), 'tunnel: 7 kernel fallback devices dropped');
  _assert(!!_kt.gre1 && !!_kt.eth1 && !!_kt.eth2, 'tunnel: a user GRE (gre1), an up iface and a shut iface (eth2) are kept');
  _assert(!!parseInterfaces({ gre0: { administrativeStatus: 'up', operationalStatus: 'up', linkUps: 1, ipAddresses: [{ address: '192.0.2.1/30' }] } }).gre0, 'tunnel: gre0 that is up with an address is kept');
  console.log('\nALL SELF-TESTS PASSED');
}

// ---- main -----------------------------------------------------------------------------------
if (typeof require !== 'undefined' && require.main === module) {
  var a = _argMap(process.argv.slice(2));
  // --mgmt-subnet <cidr> (explicit) or --exclude-mgmt (default clab mgmt 172.20.20.0/24); else off.
  var _mgmt = (a['mgmt-subnet'] && a['mgmt-subnet'] !== true) ? a['mgmt-subnet']
    : (a['exclude-mgmt'] ? '172.20.20.0/24' : '');
  if (a['self-test']) { selfTest(); }
  else if (a.fixtures) {
    var dir = a.fixtures, rd = function (f) { try { return JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')); } catch (e) { return null; } };
    var st = collectFromJson({ node: a.node, id: a.lab || a.node, proto: a.proto, adjacency: _parseAdj(a.adj), mgmtSubnet: _mgmt,
      ospfNeighbor: rd('ospf-neighbor.json'), ospfInterface: rd('ospf-interface.json'), interface: rd('interface.json'),
      route: rd('route.json'), bgpSummary: rd('bgp-summary.json'), bgp: rd('bgp.json') });
    var out = JSON.stringify(st, null, 2);
    if (a.out && a.out !== true) { fs.writeFileSync(a.out, out); console.log('wrote ' + a.out); } else console.log(out);
  }
  else if (a.lab && a.node) {
    var stl;
    try { stl = collectLive({ lab: a.lab, node: a.node, proto: a.proto, adjacency: _parseAdj(a.adj), mgmtSubnet: _mgmt }); }
    catch (e) { if (e && e.nxUnread) { console.error('NX_UNREAD ' + e.nxUnread + ' ' + e.message); process.exit(3); } throw e; }   /* nx_unread */
    var outl = JSON.stringify(stl, null, 2);
    if (a.out && a.out !== true) { fs.writeFileSync(a.out, outl); console.log('wrote ' + a.out); } else console.log(outl);
  }
  else {
    console.log('usage:\n  --self-test\n  --fixtures <dir> --node <n> [--adj eth0:r2,eth1:r3] [--proto ospf|bgp] [--exclude-mgmt|--mgmt-subnet <cidr>] [--out f]\n  --lab <lab> --node <n> [--proto ospf|bgp] [--adj eth0:r2] [--exclude-mgmt|--mgmt-subnet <cidr>] [--out f]');
  }
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { parseOspfNeighbors: parseOspfNeighbors, parseOspfInterfaces: parseOspfInterfaces,
    parseInterfaces: parseInterfaces, parseRoutes: parseRoutes, parseBgpSummary: parseBgpSummary,
    parseBgpRoutes: parseBgpRoutes, buildState: buildState, collectFromJson: collectFromJson, collectLive: collectLive };
}
