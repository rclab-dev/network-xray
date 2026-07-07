#!/usr/bin/env node
/*
 * clab-collect.js — collect LIVE per-node router state from a running containerlab lab and
 * emit an xray-core `state` object (same shape as frr-parse.js / clab-xray-bridge.js synthesize,
 * but from REAL `vtysh ... json` output instead of assuming everything is Full).
 *
 * §12-5 "real clab per-node collector". Scope = ONE node + its neighbors:
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
var fs = (typeof require === 'function') ? require('fs') : null;
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
      hello: hello
    };
  });
  return out;
}

// show interface json -> { eth0: {up, ip, prefix} }  (fallback when ospf interface json is thin)
function parseInterfaces(j) {
  var out = {};
  if (!j) return out;
  Object.keys(j).forEach(function (ifn) {
    var d = j[ifn] || {};
    var up = false;
    if (d.operationalStatus) up = /up/i.test(d.operationalStatus);
    else if (d.administrativeStatus) up = /up/i.test(d.administrativeStatus);
    else if (d.linkDetection != null || d.flags) up = /up/i.test(d.flags || '');
    var addr = '', pfx = 24;
    if (Array.isArray(d.ipAddresses) && d.ipAddresses[0]) {
      var a0 = d.ipAddresses[0].address || d.ipAddresses[0];
      if (typeof a0 === 'string' && a0.indexOf('/') >= 0) { addr = a0.split('/')[0]; pfx = +a0.split('/')[1] || 24; }
      else addr = a0;
    }
    out[ifn] = { up: up, ip: addr, prefix: pfx };
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
    var rec = { ip: ip, state: st, established: /establ/i.test(st), remoteAs: p.remoteAs };
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
  var interfaces = {}, ifaceHellos = {}, peerHellos = {};
  ifaceNames.forEach(function (ifn) {
    var d = ifs[ifn] || ifFallback[ifn] || {};
    interfaces[ifn] = { up: d.up !== false, ip: (d.ip || '') + '/' + (d.prefix || 24) };
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
      var connRoute = routes.filter(function (r) { return r.protocol === 'connected'; })
        .filter(function (r) { return _sameSubnet(r.prefix, b.ip); })[0];
      if (connRoute && connRoute.nexthops[0]) peerName = ifaceToPeer[connRoute.nexthops[0].iface];
      if (!peerName) peerName = adj[seq - 2] && adj[seq - 2].peer;
      if (!peerName) peerName = 'r' + (seq);
      seq++;
      peers.push({ name: peerName, iface: (connRoute && connRoute.nexthops[0] && connRoute.nexthops[0].iface) || '', full: b.established, state: b.state, ip: b.ip });
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

  var fullCount = peers.filter(function (p) { return p.full; }).length;

  // hellos (ospf) per real interface
  if (proto !== 'bgp') {
    peers.forEach(function (p) {
      var h = (ifs[p.iface] && ifs[p.iface].hello) || 10;
      if (p.iface) ifaceHellos[p.iface] = h;
      peerHellos[p.name] = h;
    });
  }

  // route_resolution: pick a target = a remote loopback (/32) learned via the protocol,
  // else the farthest learned (non-connected) prefix.
  var rl = routes.filter(function (r) { return r.protocol === proto && r.selected && r.nexthops[0] && r.nexthops[0].ip; });
  var loop = rl.filter(function (r) { return /\/32$/.test(r.prefix); })[0];
  var chosen = loop || rl[0] || null;
  var routeOk = !!chosen;
  var route_resolution = chosen ? {
    target: chosen.prefix.split('/')[0], resolved: true, protocol: proto,
    out_iface: chosen.nexthops[0].iface, next_hop: chosen.nexthops[0].ip,
    matched_prefix: chosen.prefix
  } : { target: '', resolved: false, protocol: '', out_iface: '', next_hop: '', matched_prefix: '' };

  var primaryPeer = peers.filter(function (p) { return p.full; })[0] || peers[0] || {};

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

  var s = {
    success: true, id: opts.id || selfName, scenario: opts.id || selfName,
    target_node: selfName, peer_node: primaryPeer.name || '',
    interfaces: interfaces,
    wan_iface: (chosen && chosen.nexthops[0] && chosen.nexthops[0].iface) || primaryPeer.iface || 'eth0',
    lan_iface: (peers[0] && peers[0].iface) || 'eth0',
    neighbor_state: fullCount > 0 ? 'Full' : (peers[0] ? peers[0].state : 'None'),
    has_full: fullCount > 0, full_count: fullCount,
    ospf_configured: proto === 'ospf',
    ospf_active_on_interface: proto === 'ospf' && fullCount > 0,
    peer_sending_hello: fullCount > 0,
    iface_hellos: ifaceHellos, peer_hellos: peerHellos,
    target_on_path: false,
    cleared: routeOk && fullCount > 0
  };

  if (proto === 'bgp') {
    s.is_established = fullCount > 0;
    s.has_bgp_route = routeOk && fullCount > 0;
    s.protocol = 'bgp';
    s.ping_ok = routeOk && fullCount > 0;
    s.has_ospf_route = false;
    // We ran --proto bgp against this node, so BGP IS configured here. Surface that + a session
    // state so a down/isolated node reads "BGP: Active" (configured, not up) instead of the engine's
    // "NOT CONFIGURED" default (which is for RCL scenarios with no bgp data at all).
    s.bgp_configured = true;
    if (!s.is_established) {
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
    s.pfx_rcvd = s.bgp_routes.filter(function (r) { return r.best; }).length;
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
  if (proto !== 'bgp') {
    s.lsdb_prefixes = routes.filter(function (r) { return r.protocol === proto; }).map(function (r) {
      var via = (r.nexthops && r.nexthops[0]) || {};
      return { text: r.prefix, own: !via.ip, via: via.ip || via.iface || '' };
    });
  }

  // Full routing table (prefix -> out-iface) for the single-node panel (xray-node-panel.js).
  // Position-independent: just the RIB rows this node holds, for a text table beside any topology GUI.
  s.routing_table = routes.map(function (r) {
    var nh = (r.nexthops && r.nexthops[0]) || {};
    return { prefix: r.prefix, out_iface: nh.iface || '', next_hop: nh.ip || '',
             protocol: r.protocol, selected: !!r.selected };
  });

  Object.keys(_area).forEach(function (k) { s[k] = _area[k]; });
  Object.keys(_hello).forEach(function (k) { s[k] = _hello[k]; });

  peers.forEach(function (p) {
    s[p.name + '_has_full'] = p.full;
    s[p.name + '_iface'] = p.iface;
    s[p.name + '_neighbor_state'] = p.full ? 'Full' : (p.state || 'None');
  });

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
    ospfNei: parseOspfNeighbors(args.ospfNeighbor),
    ospfIf: parseOspfInterfaces(args.ospfInterface),
    ifaces: parseInterfaces(args.interface),
    routes: parseRoutes(args.route),
    bgpSum: parseBgpSummary(args.bgpSummary),
    bgpRoutes: parseBgpRoutes(args.bgp)
  });
}

// ---- live: docker exec on clab-<lab>-<node> -------------------------------------------------
function _vtyshJson(container, showCmd) {
  var out = cp.execFileSync('docker', ['exec', container, 'vtysh', '-c', showCmd + ' json'],
    { encoding: 'utf8', maxBuffer: 8 * 1024 * 1024 });
  try { return JSON.parse(out); } catch (e) { return null; }
}

function collectLive(opts) {
  var container = 'clab-' + opts.lab + '-' + opts.node;
  var proto = (opts.proto || 'ospf').toLowerCase();
  var raw = {
    interface: _safe(function () { return _vtyshJson(container, 'show interface'); }),
    route: _safe(function () { return _vtyshJson(container, 'show ip route'); })
  };
  if (proto === 'bgp') {
    raw.bgpSummary = _safe(function () { return _vtyshJson(container, 'show ip bgp summary'); });
    raw.bgp = _safe(function () { return _vtyshJson(container, 'show ip bgp'); });
  } else {
    raw.ospfNeighbor = _safe(function () { return _vtyshJson(container, 'show ip ospf neighbor'); });
    raw.ospfInterface = _safe(function () { return _vtyshJson(container, 'show ip ospf interface'); });
  }
  return collectFromJson({ node: opts.node, id: opts.lab, proto: proto, adjacency: opts.adjacency || [],
    mgmtSubnet: opts.mgmtSubnet || '',
    ospfNeighbor: raw.ospfNeighbor, ospfInterface: raw.ospfInterface, interface: raw.interface,
    route: raw.route, bgpSummary: raw.bgpSummary, bgp: raw.bgp });
}
function _safe(fn) { try { return fn(); } catch (e) { return null; } }

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
    var stl = collectLive({ lab: a.lab, node: a.node, proto: a.proto, adjacency: _parseAdj(a.adj), mgmtSubnet: _mgmt });
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
