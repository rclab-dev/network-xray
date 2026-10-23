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

/* nx_vrf_all (2026-10-19): `show ip ospf vrf all ... json` nests one object per VRF ({<vrf>:{vrfName, neighbors|interfaces}});
   the plain command has the key at the top. Returns [{vrf, obj}] for either form. */
function _ospfVrfParts(j, key) {
  if (!j || typeof j !== 'object') return [];
  if (j[key]) return [{ vrf: j.vrfName || 'default', obj: j }];
  return Object.keys(j).filter(function (k) { return j[k] && typeof j[k] === 'object' && j[k][key]; })
    .map(function (k) { return { vrf: j[k].vrfName || k, obj: j[k] }; });
}

// show ip ospf neighbor json -> { byIface: { eth0: {rid,address,state,full} }, list:[...] }
function parseOspfNeighbors(j) {
  var out = { byIface: {}, list: [] };
  _ospfVrfParts(j, 'neighbors').forEach(function (part) {   /* nx_vrf_all */
  var j = part.obj;
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
      if (part.vrf && part.vrf !== 'default') rec.vrf = part.vrf;   /* nx_vrf_all */
      out.list.push(rec);
      if (rec.iface) out.byIface[rec.iface] = rec;
    });
  });
  });
  return out;
}

/* nx_ospf6 (2026-10-19): OSPFv3. `show ipv6 ospf6 [vrf <v>] neighbor json` = {neighbors:[{neighborId, state:"Full", ifState,
   interfaceName}]} (an array, unlike v2). `vrf all` prints one such object per VRF with no VRF key, so the caller passes an
   array of objects (one per VRF) and the VRF comes from opts.vrfOf(iface). Same output shape as parseOspfNeighbors + af:"v6".
   ifState is OUR interface state (PointToPoint / DR / ...), not the neighbor's role, so it is not copied into the role. */
function parseOspf6Neighbors(objs, vrfOf) {
  var out = { byIface: {}, list: [] };
  (Array.isArray(objs) ? objs : [objs]).forEach(function (j) {
    if (!j || !Array.isArray(j.neighbors)) return;
    j.neighbors.forEach(function (n) {
      var state = String(n.state || '');
      var rec = { rid: n.neighborId || '', address: '', iface: String(n.interfaceName || '').split(':')[0], state: state,
        full: /^full/i.test(state), af: 'v6' };
      var _v = vrfOf ? vrfOf(rec.iface) : '';
      if (_v && _v !== 'default') rec.vrf = _v;
      out.list.push(rec);
      if (rec.iface) out.byIface[rec.iface] = rec;
    });
  });
  return out;
}

/* nx_ospf6: `show ipv6 ospf6 [vrf <v>] interface json` = flat {<if>:{status, attachedToArea, areaId, timerIntervalsConfigHello,
   timerPassiveIface, internetAddress:[{type, address}]}}; an interface without OSPFv3 has no attachedToArea. -> parseOspfInterfaces shape */
function parseOspf6Interfaces(objs, vrfOf) {
  var out = {};
  (Array.isArray(objs) ? objs : [objs]).forEach(function (j) {
    if (!j || typeof j !== 'object') return;
    Object.keys(j).forEach(function (ifn) {
      var d = j[ifn];
      if (!d || typeof d !== 'object' || d.attachedToArea !== true) return;
      var g = (Array.isArray(d.internetAddress) ? d.internetAddress : []).filter(function (a) {
        return a && a.type === 'inet6' && !/^fe80:/i.test(String(a.address || ''));
      })[0];
      var ga = g ? String(g.address) : '';
      out[ifn] = {
        up: d.status ? /^up$/i.test(d.status) : true, ospf: true,
        ip: ga.split('/')[0], prefix: ga.indexOf('/') >= 0 ? (+ga.split('/')[1] || 64) : 64,
        area: d.areaId || '0',
        hello: d.timerIntervalsConfigHello != null ? d.timerIntervalsConfigHello : 10,
        passive: !!d.timerPassiveIface, af: 'v6'
      };
      var _v = vrfOf ? vrfOf(ifn) : '';
      if (_v && _v !== 'default') out[ifn].vrf = _v;
    });
  });
  return out;
}

/* nx_ospf6: one OSPF view from v2 + v3. v2 wins per interface (the lines / Hello keep the v2 meaning on dual-stack links);
   v3 fills interfaces and neighbors v2 does not have. The neighbor list keeps both (af:"v6" on the v3 rows). */
function _mergeOspfNei(v2, v3) {
  var out = { byIface: {}, list: (v2.list || []).concat(v3.list || []) };
  Object.keys(v2.byIface || {}).forEach(function (k) { out.byIface[k] = v2.byIface[k]; });
  Object.keys(v3.byIface || {}).forEach(function (k) {
    var a = out.byIface[k], b = v3.byIface[k];
    if (!a || (!a.full && b.full)) out.byIface[k] = b;
  });
  return out;
}
function _mergeOspfIf(v2, v3) {
  var out = {};
  Object.keys(v2 || {}).forEach(function (k) { out[k] = v2[k]; });
  Object.keys(v3 || {}).forEach(function (k) {
    if (!out[k]) out[k] = v3[k];
    else { var c = {}; Object.keys(out[k]).forEach(function (x) { c[x] = out[k][x]; }); c.v6 = true; if (v3[k].area != null) c.area6 = v3[k].area; out[k] = c; }
  });
  return out;
}

// show ip ospf interface json -> { eth0: {up, ip, prefix, area, hello} }
function parseOspfInterfaces(j) {
  var out = {};
  _ospfVrfParts(j, 'interfaces').forEach(function (part) {   /* nx_vrf_all */
  var j = part.obj;
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
    if (part.vrf && part.vrf !== 'default') out[ifn].vrf = part.vrf;   /* nx_vrf_all */
  });
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
    /* nx_ospf6 (2026-10-19): an interface with NO IPv4 shows its first global IPv6 (an IPv6-only lab showed "eth1: UP" with no
       address). Interfaces that have IPv4 are unchanged. */
    if (!v4) {
      var g6 = (Array.isArray(d.ipAddresses) ? d.ipAddresses : []).map(function (a) { return String((a && a.address) || a || ''); })
        .filter(function (a) { return a.indexOf(':') >= 0 && !/^fe80:/i.test(a); })[0];
      if (g6) { out[ifn].ip = g6.split('/')[0]; out[ifn].prefix = g6.indexOf('/') >= 0 ? (+g6.split('/')[1] || 64) : 64; out[ifn].v6 = true; }
    }
    /* nx_vrf_all: `show interface vrf all json` = the same flat shape + vrfName (VRF interfaces were missing from `show interface`) */
    if (d.vrfName && d.vrfName !== 'default') out[ifn].vrf = d.vrfName;
    /* nx_vrf_master (2026-10-20): the VRF device itself (interfaceType "VRF" on FRR 8.4 / 10.7.1) is not a link -> dropped in
       buildState unless the topology uses that name as a link end */
    if (d.interfaceType === 'VRF') out[ifn].vrfMaster = true;
  });
  return out;
}

// show ip route json -> [ {prefix, protocol, selected, nexthops:[{ip,iface,connected}]} ]
function parseRoutes(j, _vrf) {
  var out = [];
  if (!j || typeof j !== 'object') return out;
  Object.keys(j).forEach(function (prefix) {
    var arr = j[prefix];
    /* nx_vrf_all: `show ip|ipv6 route vrf all json` = {<vrf>:{<prefix>:[...]}}. A prefix key has "/"; a VRF key does not. */
    if (!_vrf && String(prefix).indexOf('/') < 0 && arr && typeof arr === 'object' && !Array.isArray(arr)) {
      parseRoutes(arr, prefix).forEach(function (r) { out.push(r); });
      return;
    }
    if (!Array.isArray(arr)) arr = [arr];
    arr.forEach(function (r) {
      if (!r || typeof r !== 'object') return;
      var nhs = (r.nexthops || []).map(function (nh) {
        return { ip: nh.ip || null, iface: nh.interfaceName || nh.interface || '', connected: !!nh.directlyConnected, active: nh.active !== false,
                 fib: nh.fib === true };   /* nx_ecmp: installed in the FIB (FRR sets fib:true only on the next-hops it uses) */
      });
      var _rr = {
        prefix: r.prefix || prefix,
        protocol: (r.protocol || '').toLowerCase(),   // "ospf" | "ospf6" | "bgp" | "connected" | "static" | "local"
        selected: !!r.selected,
        nexthops: nhs
      };
      var _rv = _vrf || r.vrfName || '';
      if (_rv && _rv !== 'default') _rr.vrf = _rv;   /* nx_vrf_all */
      out.push(_rr);
    });
  });
  return out;
}

// show ip bgp summary json -> { byIp: { "10.1.0.20": {state, established, remoteAs} } }
function parseBgpSummary(j) {
  var out = { byIp: {}, list: [] };
  /* nx_vrf_all (2026-10-19): `show ip bgp vrf all summary json` = {<vrf>:{(ipv4Unicast:)peers}}; the plain form has peers at the top */
  var parts = [];
  if (j && typeof j === 'object') {
    if (j.ipv4Unicast || j.peers) parts.push({ vrf: j.vrfName || 'default', obj: j });
    else Object.keys(j).forEach(function (k) { var v = j[k]; if (v && typeof v === 'object' && (v.ipv4Unicast || v.peers)) parts.push({ vrf: v.vrfName || k, obj: v }); });
  }
  parts.forEach(function (part) {
  var j = part.obj;
  var uni = j && (j.ipv4Unicast || j);     // some FRR nest under ipv4Unicast, some flat
  var peers = uni && uni.peers;
  if (!peers) return;
  Object.keys(peers).forEach(function (ip) {
    var p = peers[ip] || {};
    var st = p.state || p.peerState || '';
    var rec = { ip: ip, state: st, established: /establ/i.test(st), remoteAs: p.remoteAs, localAs: p.localAs, ibgp: (p.remoteAs != null && p.localAs != null && p.remoteAs === p.localAs),
      upDown: p.peerUptime, pfxRcd: p.pfxRcd, hostname: p.hostname || '' };  /* nx_collect_peer_map: the peer's hostname (BGP hostname capability) */   /* nx_bgp_nbr_detail (2026-10-06): Up/Down + PfxRcd for the RE panel neighbor fold */
    if (part.vrf && part.vrf !== 'default') rec.vrf = part.vrf;   /* nx_vrf_all */
    out.byIp[ip] = rec; out.list.push(rec);
  });
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
      /* nx_bgp_prefixlen (2026-10-23): FRR's "prefix" field has no length ("203.0.113.0", length in prefixLen) -> keep prefix as it was
         (problem.json checks compare it) and carry the length in prefixlen (from prefixLen, else from the "net/len" key) */
      var _pl = (r.prefixLen != null) ? +r.prefixLen : (/\/(\d+)$/.exec(String(r.prefix || prefix)) || [])[1];
      out.push({ prefix: r.prefix || prefix, prefixlen: (_pl != null && _pl !== '' && !isNaN(+_pl)) ? +_pl : null, nextHop: nh, best: !!(r.bestpath || r.bestPath),
        as_path: (r.path != null ? String(r.path).trim() : ''),
        local_pref: (r.locPrf != null ? r.locPrf : (r.localPref != null ? r.localPref : null)),
        weight: r.weight, metric: r.metric, origin: r.origin,
        reason: r.selectionReason || '', multipath: !!r.multipath });   /* nx_ecmp: FRR marks every installed equal path multipath */
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
  /* nx_vrf_master: drop the VRF device itself unless a topology link ends on that name */
  if (Object.keys(ifFallback).some(function (k) { return ifFallback[k] && ifFallback[k].vrfMaster; })) {
    var _ifF = {};
    Object.keys(ifFallback).forEach(function (k) {
      if (ifFallback[k] && ifFallback[k].vrfMaster && !adj.some(function (a) { return a.iface === k; })) return;
      _ifF[k] = ifFallback[k];
    });
    ifFallback = _ifF;
  }
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
    /* nx_ospf6: on a dual-stack link the same router is a v2 AND a v3 neighbor on the same iface -> one peer (v2 first, Full wins).
       Several routers on one LAN iface keep one peer each (different router ids). */
    /* ospf6d picks its router-id separately, so v2 and v3 may differ -> match a v3 neighbor to an existing peer on the
       same iface by the PEER NODE (clab link) first, else by router-id. v2 neighbors are pushed exactly as before. */
    nei.list.forEach(function (n) {
      var peerName = ifaceToPeer[n.iface];
      if (n.af === 'v6') {
        var _same = peers.filter(function (p) { return p.iface === n.iface && (peerName ? p.name === peerName : p.rid === n.rid); })[0];
        if (_same) { if (n.full && !_same.full) { _same.full = true; _same.state = n.state; } return; }
      }
      peerName = peerName || ('r' + (seq++));
      peers.push({ name: peerName, iface: n.iface, full: n.full, state: n.state, ip: n.address, rid: n.rid });
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
  /* nx_ospf6 / nx_vrf_all: OSPFv3 routes count as OSPF; the target stays in the default VRF and IPv4 first (as before) when there is one */
  var _rlAll = routes.filter(function (r) { return (r.protocol === proto || (proto === 'ospf' && r.protocol === 'ospf6')) && r.selected && r.nexthops[0] && r.nexthops[0].ip; });
  var _rlDef = _rlAll.filter(function (r) { return !r.vrf; });
  var rl = _rlDef.length ? _rlDef : _rlAll;
  var _rl4 = rl.filter(function (r) { return String(r.prefix).indexOf(':') < 0; });
  if (_rl4.length) rl = _rl4;
  var loop = rl.filter(function (r) { return /\/(32|128)$/.test(r.prefix); })[0];
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
    passive_ifaces: Object.keys(ifs).filter(function (k) { return !/^lo/i.test(k) && ifs[k] && ifs[k].passive; }),   /* nx_passive_state: which interfaces are passive (see below) */
    ospf_neighbor_full: nei.list.some(function (n) { return n.full; }),  /* REAL OSPF Full from show ip ospf neighbor (coexist band Full even under --proto bgp) */
    peer_sending_hello: (opts.ospfConfigured !== undefined ? opts.ospfConfigured : (proto === 'ospf')) && nei.list.length > 0,  /* peer HEARD = ANY OSPF neighbor state (Init and beyond = we received the peer's Hello), not only Full -> Hello-in orb shows during forming too; honest: absent only when no neighbor at all (peer unconfigured/down) */
    iface_hellos: ifaceHellos, peer_hellos: peerHellos, peer_sending_hellos: peerSendingHellos,
    bgp_neighbors: (bgpSum.list || []).map(function (n) { var o = { ip: n.ip, remote_as: n.remoteAs, ibgp: !!n.ibgp, state: n.state }; if (n.upDown != null) o.up_down = n.upDown; if (n.pfxRcd != null) o.pfx_rcvd = n.pfxRcd; return o; }),
    ospf_neighbors: (nei.list || []).map(function (n) { var _p = String(n.state || '').split('/'); var _o = { router_id: n.rid, address: n.address, state: _p[0] || '', role: _p[1] || '', iface: n.iface, full: !!n.full }; if (n.af) _o.af = n.af; if (n.vrf) _o.vrf = n.vrf; return _o; }),   /* nx_ospf6 / nx_vrf_all: af / vrf only when set */
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

  /* nx_passive_state (2026-10-20): a passive interface is shown as a STATE ("passive-interface: eth2", normal color), never as
     the cause of a fault (no red "YES (Hello stopped)") - in every lab, example or not; many interfaces are passive on purpose.
     When the neighbor does not come up, the neighbor line says so as before. is_passive is the engine's fault flag -> off here;
     passive_shown + passive_ifaces drive the plain state line (xray-core nx_passive_shown). */
  if (s.passive_ifaces.length) { s.is_passive = false; s.passive_shown = true; } else delete s.passive_ifaces;
  /* nx_ospf_area (2026-10-19): the OSPF area of each interface (v2, else v3) and of each link row, only for OSPF interfaces */
  /* only when it tells something: the router has 2+ areas or a non-backbone one (a single-area-0 lab, e.g. every OSS example, is unchanged) */
  var _areaOf = function (ifn) { var _a = ifs[ifn] && (ifs[ifn].area != null ? ifs[ifn].area : ifs[ifn].area6); return _a != null ? _normArea(_a) : null; };
  var _areaSet = {}; Object.keys(ifs).forEach(function (k) { if (!/^lo/i.test(k) && _areaOf(k) != null) _areaSet[_areaOf(k)] = 1; });
  var _areaShow = Object.keys(_areaSet).length > 1 || Object.keys(_areaSet).some(function (a) { return a !== '0'; });
  Object.keys(interfaces).forEach(function (ifn) { var _a = _areaOf(ifn); if (_areaShow && _a != null) interfaces[ifn].area = _a; if (ifs[ifn] && ifs[ifn].vrf) interfaces[ifn].vrf = ifs[ifn].vrf; else if (ifFallback[ifn] && ifFallback[ifn].vrf) interfaces[ifn].vrf = ifFallback[ifn].vrf; });   /* nx_vrf_all */
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
      if (r.prefixlen != null) o.prefixlen = r.prefixlen;   /* nx_bgp_prefixlen */
      if (r.local_pref != null) o.local_pref = r.local_pref;
      if (r.weight != null) o.weight = r.weight;
      if (r.metric != null) o.metric = r.metric;
      if (r.origin) o.origin = r.origin;
      if (r.reason) o.reason = r.reason;
      if (r.multipath) { o.multipath = true; if (!r.best) o.status = '*='; }   /* nx_ecmp: FRR's "=" = multipath, used together with the best */
      return o;
    });
    /* nx_ecmp_fix2: FRR's table json puts multipath only on the non-best equal paths; the best of such a prefix is installed
       with them (ECMP), so mark it too -> every path of an ECMP prefix has multipath: true */
    (function () { var _mpK = {}; s.bgp_routes.forEach(function (o) { if (o.multipath) _mpK[o.prefix + '/' + (o.prefixlen != null ? o.prefixlen : '')] = 1; });
      s.bgp_routes.forEach(function (o) { if (o.best && _mpK[o.prefix + '/' + (o.prefixlen != null ? o.prefixlen : '')]) o.multipath = true; }); })();
    // prefixes received = number of distinct prefixes (one best per prefix)
    // "Prefixes received" = distinct prefixes learned FROM a neighbor (best per prefix).
    // Exclude locally-originated routes (own lo/32 etc.: next-hop 0.0.0.0/empty) so the count is
    // what the router RECEIVED, not the total table size (which includes self-origin).
    // "Prefixes received" = distinct prefixes learned FROM a neighbor (peer next-hop), matching FRR
    // PfxRcd. NOT filtered by best: a received route can be non-best/unusable (Q15 next-hop-self
    // missing -> received but 'no valid path') yet it WAS received. Exclude locally-originated
    // (next-hop 0.0.0.0/empty = self). Dedup by prefix (multiple paths per prefix count once).
    s.pfx_rcvd = (function(){ var seen={}; s.bgp_routes.forEach(function(r){ if(r.next_hop && r.next_hop!=='0.0.0.0') seen[r.prefix + '/' + (r.prefixlen != null ? r.prefixlen : '')]=1; }); return Object.keys(seen).length; })();   /* nx_bgp_prefixlen: /24 and /25 are 2 */
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
    s.lsdb_prefixes = routes.filter(function (r) { return r.protocol === 'ospf' || r.protocol === 'ospf6'; }).map(function (r) {   /* nx_ospf6 */
      var via = (r.nexthops && r.nexthops[0]) || {};
      var _o = { text: r.prefix, own: !via.ip, via: via.ip || via.iface || '' };
      if (r.vrf) _o.vrf = r.vrf;   /* nx_vrf_all */
      return _o;
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
    var _row = { prefix: r.prefix, out_iface: nh.iface || _resolveIface(nh.ip) || '', next_hop: nh.ip || '',
             protocol: r.protocol, selected: _sel };
    if (r.vrf) _row.vrf = r.vrf;   /* nx_vrf_all */
    /* nx_ecmp (2026-10-23): an installed route with 2+ active next-hops (ECMP) carries them all; out_iface / next_hop stay the
       first one, so problem.json checks that read them are unchanged */
    var _act = (r.nexthops || []).filter(function (h) { return h && h.fib && (h.ip || h.iface); });
    if (_sel && _act.length > 1) _row.nexthops = _act.map(function (h) { return { ip: h.ip || '', iface: h.iface || _resolveIface(h.ip) || '' }; });
    return _row;
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
    if (_li.area != null) _plRows[_plRows.length - 1].area = _li.area;   /* nx_ospf_area */
    if (_li.vrf) _plRows[_plRows.length - 1].vrf = _li.vrf;   /* nx_vrf_all */
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
  var _ifs = parseInterfaces(args.interface);
  var _vrfOf = function (ifn) { return (_ifs[ifn] && _ifs[ifn].vrf) || ''; };   /* nx_ospf6: the OSPFv3 json has no VRF name -> from the interface */
  return buildState({
    selfName: args.node, id: args.id || args.node, proto: proto,
    adjacency: args.adjacency || [], mgmtSubnet: args.mgmtSubnet || '',
    ospfConfigured: args.ospfConfigured, bgpConfigured: args.bgpConfigured, /* presence-fix-cfg */
    ospfNei: _mergeOspfNei(parseOspfNeighbors(args.ospfNeighbor), parseOspf6Neighbors(args.ospf6Neighbor, _vrfOf)),   /* nx_ospf6 */
    ospfIf: _mergeOspfIf(parseOspfInterfaces(args.ospfInterface), parseOspf6Interfaces(args.ospf6Interface, _vrfOf)),
    ifaces: _ifs,
    routes: parseRoutes(args.route).concat(parseRoutes(args.route6)),
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
  var objs = _splitJsonObjs(out);
  return showCmds.map(function (c, idx) { try { return JSON.parse(objs[idx]); } catch (e) { return null; } });
}
/* nx_vrf_all_fallback (2026-10-19): an older FRR (the OSS examples pin a 2022 image) may refuse `... vrf all ... json` or
   print one object per VRF with no key -> JSON.parse fails -> null. Never lose the interfaces / routes / OSPF because of that: when the
   `vrf all` answer is null or not the expected shape, read the plain command (as before nx_vrf_all). A router whose FRR failed once is
   remembered in a small tmp file (10 min), so an old FRR does not pay one extra vtysh run per command on every cycle. */
var _VA_TTL = 10 * 60 * 1000;
function _vaFile() { var os = require('os'); return path.join(os.tmpdir(), 'xray-vrfall' + (typeof process.getuid === 'function' ? '-u' + process.getuid() : '') + '.json'); }
function _vaRead() { try { return JSON.parse(fs.readFileSync(_vaFile(), 'utf8')) || {}; } catch (e) { return {}; } }
function _vaNo(container, base) { var m = _vaRead(), k = container + '|' + base; return !!(m[k] && Date.now() - m[k] < _VA_TTL); }
function _vaMark(container, base) { if (container.indexOf('selftest-') !== 0) console.error('  vrf all not usable on ' + container + ' (' + base + ') -> plain command'); try { var m = _vaRead(); m[container + '|' + base] = Date.now(); fs.writeFileSync(_vaFile(), JSON.stringify(m)); } catch (e) {} }
var _VA_SHAPE = {
  'show interface': function (o) { return Object.keys(o).some(function (k) { var v = o[k]; return v && typeof v === 'object' && (v.operationalStatus != null || v.administrativeStatus != null || v.ipAddresses != null || v.vrfName != null); }); },
  'show ip route': function (o) { return parseRoutes(o).length > 0; },
  'show ip ospf neighbor': function (o) { return _ospfVrfParts(o, 'neighbors').length > 0; },
  'show ip ospf interface': function (o) { return _ospfVrfParts(o, 'interfaces').length > 0; }
};
function _vtyshJsonVrfAll(container, base) {
  var parts = base.split(' ');   /* "show ip ospf neighbor" -> "show ip ospf vrf all neighbor"; "show interface" -> "show interface vrf all" */
  var va = (parts.length > 3 && parts[2] === 'ospf') ? parts.slice(0, 3).concat(['vrf', 'all'], parts.slice(3)).join(' ') : base + ' vrf all';
  if (!_vaNo(container, base)) {
    var o = _vtyshJson(container, va);
    if (o && typeof o === 'object' && (_VA_SHAPE[base](o) || !Object.keys(o).length)) return o;   /* {} = understood, nothing there yet (OSPF not started) */
    _vaMark(container, base);   /* text / several objects / another shape -> the plain command = the reading before nx_vrf_all; `vrf all` again after 10 min */
  }
  return _vtyshJson(container, base);
}
/* the BGP pair: `vrf all summary` + the table, matched by position in one vtysh. If the summary came back as text / several objects the
   table slides into the summary's place -> check: the 2nd must be the table and the 1st must not be one; else the plain pair. */
function _bgpTableLike(o) { return !!(o && typeof o === 'object' && (o.routes || o.routerId != null || o.tableVersion != null)); }
function _bgpPairOk(p) {
  if (!p) return false;
  if (_bgpTableLike(p[0])) return false;                                   /* the table sits in the summary's place (summary was text) */
  if (p[1] && typeof p[1] === 'object' && (p[1].ipv4Unicast || p[1].peers)) return false;   /* a 2nd summary object (one per VRF, no key) */
  if (p[0] == null && p[1] != null) return false;                          /* summary unreadable */
  return true;                                                             /* incl. both empty (BGP not up yet) = keep `vrf all` */
}
function _splitJsonObjs(out) {
  var objs = [], depth = 0, start = -1, inStr = false, esc = false;
  for (var i = 0; i < out.length; i++) {
    var cc = out.charCodeAt(i);
    if (inStr) { if (esc) esc = false; else if (cc === 92) esc = true; else if (cc === 34) inStr = false; continue; }
    if (cc === 34) { inStr = true; continue; }
    if (cc === 123) { if (depth === 0) start = i; depth++; }
    else if (cc === 125) { depth--; if (depth === 0 && start >= 0) { objs.push(out.slice(start, i + 1)); start = -1; } }
  }
  return objs;
}
/* nx_ospf6 (2026-10-19): `show ipv6 ospf6 vrf all ... json` prints one object per VRF with no VRF key, and an older FRR may print
   nothing or a text line for a command -> the objects cannot be matched to commands by position. Run the OSPFv3 commands in ONE vtysh
   (one docker exec) and sort every returned object by its SHAPE: {neighbors:[...]} = neighbors / {<if>:{interfaceId}} = interfaces /
   {<prefix with "/">:[...]} or {<vrf>:{<prefix>:[...]}} = IPv6 routes. Anything else is ignored (= no OSPFv3 data, as before). */
function _classifyOspf6(objStrs) {
  var r = { nei: [], ifs: [], route: {} };
  objStrs.forEach(function (t) {
    var o; try { o = JSON.parse(t); } catch (e) { return; }
    if (!o || typeof o !== 'object') return;
    if (Array.isArray(o.neighbors)) { r.nei.push(o); return; }
    var ks = Object.keys(o); if (!ks.length) return;
    var v0 = o[ks[0]];
    if (v0 && typeof v0 === 'object' && !Array.isArray(v0) && (v0.interfaceId != null || v0.status != null || v0.attachedToArea != null)) { r.ifs.push(o); return; }
    var isRoute = ks.every(function (k) { return String(k).indexOf('/') >= 0 ? Array.isArray(o[k]) : (o[k] && typeof o[k] === 'object' && !Array.isArray(o[k])); });
    if (isRoute) ks.forEach(function (k) { r.route[k] = o[k]; });
  });
  return r;
}
function _vtyshOspf6(container) {
  var _b = _vtyBase(container); var args = _b[1].slice();
  ['show ipv6 ospf6 vrf all neighbor', 'show ipv6 ospf6 vrf all interface', 'show ipv6 route vrf all'].forEach(function (c) { args.push('-c', c + ' json'); });
  var out;
  try { out = _vtyExec(_b[0], args, 16 * 1024 * 1024); }
  catch (e) { if (e && e.nxUnread) throw e; return null; }
  return _classifyOspf6(_splitJsonObjs(out));
}

function collectLive(opts) {
  /* nx_no_shell (2026-10-17): the commands here are fixed and passed as argument arrays; the lab / node names become a
     container name (or a socket file name) and must be plain names */
  var _safeName = /^[A-Za-z0-9][A-Za-z0-9_.-]{0,62}$/;
  if (!_safeName.test(String(opts.node)) || (opts.lab != null && !_safeName.test(String(opts.lab)))) throw new Error('--lab / --node must be plain names (letters, digits, _ . -)');   /* nx_review_1017 (F-06): the lab name too, also with vtysh sockets */
  var container = (_VTY_SOCK ? opts.node : ('clab-' + opts.lab + '-' + opts.node));
  var proto = (opts.proto || 'ospf').toLowerCase();
  /* nx_vrf_all (2026-10-19): read every VRF (`vrf all`), not only the default one - an OSPF/BGP/interface inside a VRF was invisible
     (VRF links drawn as "no interface" = down). Same number of vtysh runs as before; the parsers accept the plain and the per-VRF form. */
  var raw = {
    interface: _safe(function () { return _vtyshJson(container, 'show interface'); }),   /* the plain command already lists VRF interfaces with vrfName (FRR 8.4 and 10.7.1) */
    route: _safe(function () { return _vtyshJsonVrfAll(container, 'show ip route'); })
  };
  var _BGP_PAIR = _vaNo(container, 'bgp-pair') ? ['show ip bgp summary', 'show ip bgp'] : ['show ip bgp vrf all summary', 'show ip bgp'];   /* nx_vrf_all: the summary of every VRF; the re-read below uses the same pair */
  if (proto === 'bgp') {
    var _bp = _vtyshBatch(container, _BGP_PAIR);  /* atomic pair: no tick straddle */
    if (_BGP_PAIR[0].indexOf('vrf all') >= 0 && !_bgpPairOk(_bp)) {   /* nx_vrf_all_fallback: the table slid into the summary's place -> the plain pair */
      _vaMark(container, 'bgp-pair'); _BGP_PAIR = ['show ip bgp summary', 'show ip bgp']; _bp = _vtyshBatch(container, _BGP_PAIR);
    }
    raw.bgpSummary = _bp[0]; raw.bgp = _bp[1];
  }
  // Always collect OSPF neighbor/interface (not only under --proto ospf): a coexist lab runs
  // --proto bgp but ALSO has OSPF, and the DeepDive OSPF band must reflect the REAL adjacency
  // (Full=green) instead of a presence guess (ospf_configured -> Init). Harmless null on pure BGP.
  raw.ospfNeighbor = _safe(function () { return _vtyshJsonVrfAll(container, 'show ip ospf neighbor'); });   /* nx_vrf_all_fallback */
  raw.ospfInterface = _safe(function () { return _vtyshJsonVrfAll(container, 'show ip ospf interface'); });
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
      var _bpr = _vtyshBatch(container, _BGP_PAIR);
      raw.bgpSummary = _bpr[0]; raw.bgp = _bpr[1];
    }
  }
  var _cfgTxt = _safe(function(){ return (function(){var _b=_vtyBase(container);return _vtyExec(_b[0],_b[1].concat(['-c','show running-config']),8*1024*1024);})(); }) || '';
  // Configured static routes (running-config) = TARGET source when a fault leaves the route fully
  // unresolved (FRR omits unresolvable statics from show ip route), so init/solved agree on the
  // scenario destination (Q4 2.2.2.2) instead of the 8.8.8.8 default.
  var _cfgStatics = _cfgTxt.split(String.fromCharCode(10)).map(function(l){ var m=l.trim().match(/^ip route (\S+) (\S+)/); return m?{prefix:m[1],nexthop:m[2]}:null; }).filter(Boolean);
  var _cfgLines = _cfgTxt.split(String.fromCharCode(10)).map(function (l) { return l.trim(); });
  /* nx_ospf6: OSPFv3 is read only on a router that has `router ospf6` (one extra vtysh run, none on IPv4-only labs) */
  var _ospf6On = _cfgLines.some(function (l) { return /^router ospf6\b/.test(l); });
  if (_ospf6On) { var _o6 = _safe(function () { return _vtyshOspf6(container); }); if (_o6) { raw.ospf6Neighbor = _o6.nei; raw.ospf6Interface = _o6.ifs; raw.route6 = _o6.route; } }
  return collectFromJson({ node: opts.node, id: opts.lab, proto: proto, adjacency: opts.adjacency || [], configStatics: _cfgStatics,
    ospfConfigured: _cfgLines.some(function(l){return l.indexOf('router ospf')===0;}),   /* "router ospf6" also starts with "router ospf" = OSPFv3-only routers count (nx_ospf6) */
    bgpConfigured: _bgpCfgWithNeighbor(_cfgLines),   /* nx_bgp_no_nbr */
    mgmtSubnet: opts.mgmtSubnet || '',
    ospfNeighbor: raw.ospfNeighbor, ospfInterface: raw.ospfInterface, interface: raw.interface,
    ospf6Neighbor: raw.ospf6Neighbor, ospf6Interface: raw.ospf6Interface, route6: raw.route6,
    route: raw.route, bgpSummary: raw.bgpSummary, bgp: raw.bgp });
}
/* nx_bgp_no_nbr (2026-10-19): `router bgp <AS>` with NO neighbor at all (netlab's FRR vrf module makes an empty one) is not a BGP that
   failed - drawing it as the red "BGP: Active" was false. BGP counts as configured only with a `router bgp` AND at least one
   `neighbor <x> [interface] remote-as|peer-group` line (any block, VRF ones included). Engine untouched: no bgp_configured = no BGP row. */
function _bgpCfgWithNeighbor(lines) {
  if (!lines.some(function (l) { return l.indexOf('router bgp') === 0; })) return false;
  return lines.some(function (l) { return /^neighbor\s+\S+\s+(interface\s+)?(remote-as|peer-group)\b/.test(l); });
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

/* nx_ospf6 / nx_vrf_all / nx_bgp_no_nbr (2026-10-19) self-tests. JSON shapes = FRR 10.7.1 (netlab ospfv3 02-areas, node x1)
   and the FRR source (ospf6_interface.c / ospf_vty.c / zebra). */
var FIX6 = {
  nei: { neighbors: [{ neighborId: '10.0.0.1', priority: 1, deadTime: '00:00:30', state: 'Full', ifState: 'PointToPoint', duration: '00:00:29', interfaceName: 'eth1', interfaceState: 'PointToPoint' }] },
  ifs: {
    eth1: { status: 'up', type: 'BROADCAST', interfaceId: 11135, operatingAsType: 'POINTOPOINT',
      internetAddress: [{ type: 'inet6', address: '2001:db8:3::2/64' }, { type: 'inet6', address: 'fe80::ebef:fe05:4b9a:8735/64' }],
      attachedToArea: true, instanceId: 0, areaId: '0.0.0.2', cost: 10, ospf6InterfaceState: 'PointToPoint', timerIntervalsConfigHello: 10, timerPassiveIface: false },
    gre0: { status: 'down', type: 'BROADCAST', interfaceId: 2 },
    lo: { status: 'up', type: 'LOOPBACK', interfaceId: 1, internetAddress: [{ type: 'inet6', address: '2001:db8:1:2::1/64' }], attachedToArea: true, areaId: '0.0.0.0', timerIntervalsConfigHello: 10 } },
  route6: { '2001:db8:1:1::/64': [{ prefix: '2001:db8:1:1::/64', protocol: 'ospf6', selected: true, nexthops: [{ ip: 'fe80::1', interfaceName: 'eth1', active: true }] }] },
  iface: { eth1: { operationalStatus: 'up', ipAddresses: [{ address: 'fe80::ebef:fe05:4b9a:8735/64' }, { address: '2001:db8:3::2/64' }], vrfName: 'default' },
           lo: { operationalStatus: 'up', ipAddresses: [{ address: '2001:db8:1:2::1/64' }], vrfName: 'default' } }
};
function selfTestOspf6Vrf() {
  console.log('self-test: OSPFv3 only (FRR 10.7.1 json): the neighbor, the interface and the IPv6 route are read');
  var s6 = collectFromJson({ node: 'x1', id: 'v3', proto: 'ospf', adjacency: [{ iface: 'eth1', peer: 'dut' }], ospfConfigured: true,
    interface: FIX6.iface, ospf6Neighbor: [FIX6.nei], ospf6Interface: [FIX6.ifs], route6: FIX6.route6 });
  _assert(s6.full_count === 1 && s6.dut_has_full === true, 'v3: dut Full on eth1');
  _assert(s6.ospf_if_count === 1, 'v3: 1 OSPF interface (lo excluded, gre0 not attached) -> heading Running');
  _assert(s6.ospf_neighbors.length === 1 && s6.ospf_neighbors[0].state === 'Full' && s6.ospf_neighbors[0].iface === 'eth1', 'v3: ospf_neighbors row');
  _assert(s6.interfaces.eth1.ip === '2001:db8:3::2/64', 'v3: eth1 shows its global IPv6 (not fe80, not empty)');
  _assert(s6.lsdb_prefixes.length === 1 && s6.lsdb_prefixes[0].text === '2001:db8:1:1::/64', 'v3: the ospf6 route is in the LSDB');
  _assert(s6.iface_hellos.eth1 === 10, 'v3: Hello on eth1');
  _assert(s6.interfaces.eth1.area === '2' && s6.peer_links[0].area === '2', 'area: eth1 area 0.0.0.2 -> "2" on the interface and the link row');

  console.log('self-test: dual-stack - the same router as a v2 and a v3 neighbor on eth1 = ONE peer, both rows listed');
  var sd = collectFromJson({ node: 'x1', id: 'ds', proto: 'ospf', adjacency: [{ iface: 'eth1', peer: 'dut' }], ospfConfigured: true,
    ospfNeighbor: { neighbors: { '10.0.0.1': [{ state: 'Full/-', address: '10.1.0.1', ifaceName: 'eth1:10.1.0.2' }] } },
    ospfInterface: { interfaces: { eth1: { ifUp: true, ipAddress: '10.1.0.2', ipAddressPrefixlen: 30, area: '0.0.0.0', timerMsecs: 10000 } } },
    ospf6Neighbor: [FIX6.nei], ospf6Interface: [FIX6.ifs] });
  _assert(sd.full_count === 1, 'dual-stack: full_count 1 (not 2)');
  _assert(sd.ospf_neighbors.length === 2 && sd.ospf_neighbors.filter(function (n) { return n.af === 'v6'; }).length === 1, 'dual-stack: 2 rows, the v3 one af v6');
  _assert(sd.interfaces.eth1.ip === '10.1.0.2/30', 'dual-stack: eth1 keeps its IPv4 address');
  _assert(sd.interfaces.eth1.area === undefined, 'area: a single-area-0 router gets no area field (OSS examples unchanged)');
  var sd2 = collectFromJson({ node: 'x1', id: 'ds', proto: 'ospf', adjacency: [{ iface: 'eth1', peer: 'dut' }], ospfConfigured: true,
    ospfNeighbor: { neighbors: { '10.0.0.1': [{ state: 'Full/-', address: '10.1.0.1', ifaceName: 'eth1' }] } },
    ospfInterface: { interfaces: { eth1: { ifUp: true, ipAddress: '10.1.0.2', ipAddressPrefixlen: 30, area: '0.0.0.0', timerMsecs: 10000 } } },
    ospf6Neighbor: [{ neighbors: [{ neighborId: '0.0.0.99', state: 'Full', interfaceName: 'eth1' }] }], ospf6Interface: [FIX6.ifs] });
  _assert(sd2.full_count === 1, 'dual-stack: v3 router-id differs from v2 -> still ONE peer (matched by the clab peer node)');

  console.log('self-test: nx_vrf_all_fallback - an old FRR that cannot answer `vrf all` keeps the plain reading');
  var _origJ = _vtyshJson, _asked = [];
  _vtyshJson = function (c, cmd) { _asked.push(cmd);
    if (/vrf all/.test(cmd)) return null;                                     /* old FRR: text / several objects -> null */
    if (cmd === 'show interface') return { eth1: { operationalStatus: 'up', ipAddresses: [{ address: '10.1.0.1/30' }] } };
    return null; };
  try {
    var _ct = 'selftest-' + process.pid;
    var _fi = _vtyshJsonVrfAll(_ct, 'show interface');
    _assert(_fi && _fi.eth1 && _asked.join('|') === 'show interface vrf all|show interface', 'fallback: vrf all null -> plain `show interface` read');
    _asked = []; _vtyshJsonVrfAll(_ct, 'show interface');
    _assert(_asked.join('|') === 'show interface', 'fallback: remembered -> only the plain command next time');
    _vtyshJson = function (c, cmd) { return cmd === 'show ip ospf vrf all neighbor' ? {} : null; };
    var _fo = _vtyshJsonVrfAll(_ct + 'b', 'show ip ospf neighbor');
    _assert(_fo && !Object.keys(_fo).length && !_vaNo(_ct + 'b', 'show ip ospf neighbor'), 'fallback: {} (OSPF not up yet) is understood - not remembered as unsupported');
  } finally {
    _vtyshJson = _origJ;
    try { var _vm = _vaRead(); Object.keys(_vm).forEach(function (k) { if (k.indexOf('selftest-') === 0) delete _vm[k]; }); fs.writeFileSync(_vaFile(), JSON.stringify(_vm)); } catch (e) {}   /* leave no test marks */
  }
  _assert(_bgpPairOk([{ 'default': { ipv4Unicast: { peers: {} } } }, { routerId: '1.1.1.1', routes: {} }]) === true, 'bgp pair: vrf-all summary + table = ok');
  _assert(_bgpPairOk([{ routerId: '1.1.1.1', routes: {} }, null]) === false, 'bgp pair: table in the summary place -> plain pair');
  _assert(_bgpPairOk([{ ipv4Unicast: { peers: {} } }, { ipv4Unicast: { peers: {} } }]) === false, 'bgp pair: two summary objects (per VRF, no key) -> plain pair');

  console.log('self-test: VRF (show ip ospf vrf all ... json) - the VRF neighbor and interface are read');
  var sv = collectFromJson({ node: 'dut', id: 'vrf', proto: 'ospf', adjacency: [{ iface: 'eth1', peer: 'x1' }, { iface: 'eth2', peer: 'x2' }], ospfConfigured: true,
    interface: { eth1: { operationalStatus: 'up', ipAddresses: [{ address: '10.1.0.1/30' }], vrfName: 'default' }, eth2: { operationalStatus: 'up', ipAddresses: [{ address: '10.1.0.5/30' }], vrfName: 'customer' } },
    ospfNeighbor: { 'default': { vrfName: 'default', neighbors: { '10.0.0.2': [{ state: 'Full/-', address: '10.1.0.2', ifaceName: 'eth1:10.1.0.1' }] } },
                    customer: { vrfName: 'customer', neighbors: { '10.0.0.3': [{ state: 'Full/-', address: '10.1.0.6', ifaceName: 'eth2:10.1.0.5' }] } } },
    ospfInterface: { 'default': { vrfName: 'default', interfaces: { eth1: { ifUp: true, ipAddress: '10.1.0.1', ipAddressPrefixlen: 30, area: '0.0.0.0', timerMsecs: 10000 } } },
                     customer: { vrfName: 'customer', interfaces: { eth2: { ifUp: true, ipAddress: '10.1.0.5', ipAddressPrefixlen: 30, area: '0.0.0.0', timerMsecs: 10000 } } } },
    route: { 'default': { '10.0.0.2/32': [{ prefix: '10.0.0.2/32', protocol: 'ospf', selected: true, nexthops: [{ ip: '10.1.0.2', interfaceName: 'eth1' }] }] },
             customer: { '10.0.0.3/32': [{ prefix: '10.0.0.3/32', protocol: 'ospf', selected: true, nexthops: [{ ip: '10.1.0.6', interfaceName: 'eth2' }] }] } } });
  _assert(sv.full_count === 2 && sv.x2_has_full === true, 'vrf: the customer-VRF neighbor x2 is Full');
  _assert(sv.interfaces.eth2 && sv.interfaces.eth2.up === true && sv.interfaces.eth2.ip === '10.1.0.5/30', 'vrf: eth2 (in VRF customer) is UP with its address');
  _assert(sv.ospf_neighbors.filter(function (n) { return n.iface === 'eth2'; }).length === 1, 'vrf: ospf_neighbors has the VRF row');
  _assert(sv.route_resolution.out_iface === 'eth1', 'vrf: the target stays in the default VRF');
  _assert((sv.routing_table.filter(function (r) { return r.prefix === '10.0.0.3/32'; })[0] || {}).vrf === 'customer', 'vrf: routing table row carries vrf');

  console.log('self-test: BGP summary per VRF (show ip bgp vrf all summary json)');
  var bs = parseBgpSummary({ 'default': { vrfName: 'default', ipv4Unicast: { peers: {} } }, d1: { vrfName: 'd1', ipv4Unicast: { peers: { '10.1.0.9': { state: 'Established', remoteAs: 65100, localAs: 65000 } } } } });
  _assert(bs.list.length === 1 && bs.list[0].established && bs.list[0].vrf === 'd1', 'bgp vrf: the VRF peer is read and Established');
  _assert(parseBgpSummary({ ipv4Unicast: { peers: { '10.1.0.20': { state: 'Active' } } } }).list.length === 1, 'bgp vrf: the plain form still works');

  console.log('self-test: nx_bgp_no_nbr - `router bgp` with no neighbor is not a BGP');
  _assert(_bgpCfgWithNeighbor(['router bgp 65000', 'bgp router-id 10.0.0.1']) === false, 'no neighbor -> false');
  _assert(_bgpCfgWithNeighbor(['router bgp 65000 vrf d1', 'neighbor 10.1.0.9 remote-as 65100']) === true, 'neighbor in a VRF block -> true');
  _assert(_bgpCfgWithNeighbor(['router bgp 65000', 'neighbor eth1 interface remote-as external']) === true, 'interface neighbor -> true');
  _assert(_bgpCfgWithNeighbor(['router ospf']) === false, 'no router bgp -> false');

  console.log('self-test: nx_passive_state - passive is a state (normal color), never the red fault flag, in every lab');
  var _ps = collectFromJson({ node: 'r1', id: 'q10', proto: 'ospf', adjacency: [{ iface: 'eth1', peer: 'r2' }], ospfConfigured: true,
    ospfNeighbor: { neighbors: {} },
    ospfInterface: { interfaces: { eth1: { ifUp: true, ipAddress: '10.10.0.10', ipAddressPrefixlen: 24, area: '0.0.0.0', timerMsecs: 5000, timerPassiveIface: true },
                                   lo: { ifUp: true, ipAddress: '1.1.1.1', ipAddressPrefixlen: 32, area: '0.0.0.0', timerPassiveIface: true } } } });
  _assert(_ps.is_passive === false && _ps.passive_shown === true && _ps.passive_ifaces.join(',') === 'eth1', 'passive: eth1 listed (lo not), is_passive off, passive_shown on');
  _assert(_ps.ospf_if_count === 1 && !_ps.iface_hellos.eth1, 'passive: still an OSPF interface (Running) and sends no Hello');
  _assert(_ps.passive_ifaces !== undefined && collectFromJson({ node: 'r1', proto: 'ospf', ospfConfigured: true, ospfInterface: FIX.ospfInterface }).passive_ifaces === undefined, 'passive: no passive interface -> no new fields');

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
  var _vmIf = { cust: { administrativeStatus: 'up', operationalStatus: 'up', vrfName: 'cust', type: 'Ethernet', interfaceType: 'VRF', ipAddresses: [] },
    eth1: { operationalStatus: 'up', ipAddresses: [{ address: '10.0.1.1/30' }] }, eth2: { operationalStatus: 'up', vrfName: 'cust', ipAddresses: [{ address: '10.0.2.1/30' }] } };
  var _vm1 = collectFromJson({ node: 'r1', id: 'st', proto: 'ospf', ospfConfigured: false, adjacency: [{ iface: 'eth1', peer: 'r2' }, { iface: 'eth2', peer: 'r3' }], interface: _vmIf });
  _assert(!_vm1.interfaces.cust && !!_vm1.interfaces.eth1 && _vm1.interfaces.eth2.vrf === 'cust', 'vrf master: the VRF device "cust" is not an interface line; its member eth2 keeps vrf');
  var _vm2 = collectFromJson({ node: 'r1', id: 'st', proto: 'ospf', ospfConfigured: false, adjacency: [{ iface: 'cust', peer: 'r9' }], interface: _vmIf });
  _assert(!!_vm2.interfaces.cust, 'vrf master: kept when a topology link ends on that name');

  console.log('self-test: OSPFv3 output sorted by shape (vrf all = several objects, no VRF key; an old FRR may print text)');
  var c6 = _classifyOspf6(_splitJsonObjs('% some text\n' + JSON.stringify(FIX6.nei) + JSON.stringify({ neighbors: [] }) + JSON.stringify(FIX6.ifs) + JSON.stringify({ 'default': FIX6.route6 })));
  _assert(c6.nei.length === 2 && c6.ifs.length === 1 && Object.keys(c6.route).length === 1, 'classify: 2 neighbor objects, 1 interface object, routes');
  _assert(parseRoutes(c6.route).length === 1, 'classify: the per-VRF IPv6 routes parse');
}

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
  _assert(sb.bgp_routes[0].prefixlen === 24, 'nx_bgp_prefixlen: length from the "net/len" prefix');

  console.log('self-test: BGP prefixlen (FRR json: prefix without length + prefixLen; /24 and /25 side by side)');
  var _plR = parseBgpRoutes({ routes: {
    '203.0.113.0/24': [ { prefix: '203.0.113.0', prefixLen: 24, nexthops: [ { ip: '10.1.0.20' } ], bestpath: true, path: '65001', origin: 'IGP' } ],
    '203.0.113.0/25': [ { prefix: '203.0.113.0', prefixLen: 25, nexthops: [ { ip: '10.1.0.20' } ], bestpath: true, path: '65001', origin: 'IGP' } ] } });
  _assert(_plR.length === 2 && _plR[0].prefix === '203.0.113.0' && _plR[0].prefixlen === 24 && _plR[1].prefixlen === 25,
    'prefix kept as FRR gives it (checks unchanged), length in prefixlen');
  var sbl = collectFromJson({ node: 'r1', proto: 'bgp', adjacency: [{ iface: 'eth0', peer: 'r2' }],
    bgpSummary: FIX.bgpSummary, bgp: { routes: {
      '203.0.113.0/24': [ { prefix: '203.0.113.0', prefixLen: 24, nexthops: [ { ip: '10.1.0.20' } ], bestpath: true } ],
      '203.0.113.0/25': [ { prefix: '203.0.113.0', prefixLen: 25, nexthops: [ { ip: '10.1.0.20' } ], bestpath: true } ] } },
    route: { '10.1.0.0/24': FIX.route['10.1.0.0/24'] } });
  _assert(sbl.bgp_routes.length === 2 && sbl.bgp_routes[1].prefixlen === 25, 'bgp_routes carries prefixlen');
  _assert(sbl.pfx_rcvd === 2, '/24 and /25 count as 2 prefixes received');

  console.log('self-test: ECMP (2 active next-hops in the RIB + 2 multipath BGP paths)');
  var sbe = collectFromJson({ node: 'r1', proto: 'bgp', adjacency: [{ iface: 'eth0', peer: 'r2' }],
    bgpSummary: FIX.bgpSummary, bgp: { routes: {
      '10.0.8.0/24': [ { prefix: '10.0.8.0', prefixLen: 24, nexthops: [ { ip: '10.1.0.30' } ], multipath: true, path: '65002', origin: 'IGP' },
                       { prefix: '10.0.8.0', prefixLen: 24, nexthops: [ { ip: '10.1.0.20' } ], multipath: true, bestpath: { overall: true, selectionReason: 'Neighbor IP' }, path: '65002', origin: 'IGP' } ] } },
    route: { '10.1.0.0/24': FIX.route['10.1.0.0/24'],
      '10.0.8.0/24': [ { prefix: '10.0.8.0/24', protocol: 'bgp', selected: true, nexthops: [
        { ip: '10.1.0.20', interfaceName: 'eth0', active: true, fib: true }, { ip: '10.1.0.30', interfaceName: 'eth0', active: true, fib: true } ] } ] } });
  var _er = sbe.routing_table.filter(function (r) { return r.prefix === '10.0.8.0/24'; })[0] || {};
  _assert(Array.isArray(_er.nexthops) && _er.nexthops.length === 2 && _er.nexthops[1].ip === '10.1.0.30', 'nx_ecmp: routing_table row carries both next-hops');
  _assert(_er.next_hop === '10.1.0.20' && _er.out_iface === 'eth0', 'nx_ecmp: out_iface / next_hop stay the first next-hop');
  var _eb = sbe.bgp_routes.filter(function (r) { return r.prefix === '10.0.8.0'; });
  _assert(_eb.length === 2 && _eb.every(function (r) { return r.multipath === true; }), 'nx_ecmp: both BGP paths multipath');
  _assert(_eb.filter(function (r) { return r.status === '*='; }).length === 1 && _eb.filter(function (r) { return r.status === '*>'; }).length === 1, 'nx_ecmp: status *> and *=');
  var _e1 = (sb.routing_table || []).filter(function (r) { return r.nexthops; }).length;
  _assert(_e1 === 0, 'nx_ecmp: a single-next-hop RIB has no nexthops field');
  var sbe2 = collectFromJson({ node: 'r1', proto: 'bgp', adjacency: [{ iface: 'eth0', peer: 'r2' }],
    bgpSummary: FIX.bgpSummary, bgp: { routes: {
      '10.0.8.0/24': [ { prefix: '10.0.8.0', prefixLen: 24, nexthops: [ { ip: '10.1.0.30' } ], multipath: true, path: '65002' },
                       { prefix: '10.0.8.0', prefixLen: 24, nexthops: [ { ip: '10.1.0.20' } ], bestpath: { overall: true }, path: '65002' } ] } },
    route: { '10.1.0.0/24': FIX.route['10.1.0.0/24'] } });
  _assert(sbe2.bgp_routes.filter(function (r) { return r.multipath === true; }).length === 2, 'nx_ecmp_fix2: the best of an ECMP prefix is multipath too (FRR table json shape)');

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

  selfTestOspf6Vrf();
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
      route: rd('route.json'), bgpSummary: rd('bgp-summary.json'), bgp: rd('bgp.json'),
      ospf6Neighbor: rd('ospf6-neighbor.json'), ospf6Interface: rd('ospf6-interface.json'), route6: rd('route6.json') });   /* nx_ospf6 */
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
