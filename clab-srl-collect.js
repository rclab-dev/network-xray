#!/usr/bin/env node
/*
 * clab-srl-collect.js — Nokia SR Linux adapter for X-Ray (the SR Linux sibling of clab-collect.js).
 *
 * containerlab's flagship NOS is SR Linux; this reads ONE srl node's REAL control-plane state from a
 * running lab and emits the SAME `state` object the FRR collector does (see DATA-CONTRACT.md), so the
 * exact same DeepDive / node-panel / topology-overlay draw it — no engine change. The engine is
 * vendor-neutral; only the state *source* differs (SR Linux is YANG-modelled: `sr_cli "info from state
 * … | as json"`, not FRR's vtysh json).
 *
 *   node clab-srl-collect.js --lab <lab> --node <node> --adj ethernet-1/1.0:r2,ethernet-1/2.0:r3 \
 *        --proto ospf --out state.json
 *   node clab-srl-collect.js --self-test          # offline: verify the JSON->state mapping, no docker
 *
 * --adj maps each local (sub)interface to the clab peer node it faces (same idea as clab-collect.js),
 * so `<peer>_iface` / `<peer>_has_full` resolve regardless of IP plan. Scope: OSPF + BGP + routes +
 * interfaces.
 */
'use strict';
var cp = require('child_process');
var fs = require('fs');
var pathMod = require('path');

// --capture / --from-dir round-trip: map each state path to a stable filename with the SAME function
// both directions, so a live --capture run records exactly the files a later --from-dir run reads
// (the user never has to know the paths). Non-alnum -> '_' (e.g. "ethernet-1/1" -> "ethernet_1_1").
function pathToFile(p) { return String(p).replace(/[^A-Za-z0-9]+/g, '_').replace(/^_+|_+$/g, '') + '.json'; }
function dirFetch(dir) {
  return function (p) { try { return JSON.parse(fs.readFileSync(pathMod.join(dir, pathToFile(p)), 'utf8')); } catch (e) { return null; } };
}
function teeFetch(liveFn, dir) {
  try { fs.mkdirSync(dir, { recursive: true }); } catch (e) {}
  return function (p) { var r = liveFn(p); try { fs.writeFileSync(pathMod.join(dir, pathToFile(p)), JSON.stringify(r == null ? null : r, null, 2)); } catch (e) {} return r; };
}

function ipOnly(pfx) { return pfx ? String(pfx).split('/')[0] : ''; }
// loose subnet check (first 3 octets) for recursive next-hop -> connected-route iface resolution.
function sameNet24(prefix, ip) {
  if (!prefix || !ip) return false;
  // nx_srl_peer_map: the real prefix length when given (a /30 must not match the next /30); no length -> first 3 octets as before
  var _pl = parseInt(String(prefix).split('/')[1], 10);
  var _ip4 = function (s) { var o = ipOnly(s).split('.').map(Number); return o.length === 4 && o.every(function (x) { return x >= 0 && x <= 255; }) ? ((o[0] * 16777216) + (o[1] << 16) + (o[2] << 8) + o[3]) : null; };
  var _a = _ip4(prefix), _b = _ip4(ip);
  if (!isNaN(_pl) && _pl >= 0 && _pl <= 32 && _a !== null && _b !== null) { var _sz = Math.pow(2, 32 - _pl); return Math.floor(_a / _sz) === Math.floor(_b / _sz); }
  return ipOnly(prefix).split('.').slice(0, 3).join('.') === String(ip).split('.').slice(0, 3).join('.');
}
// dotted netmask -> prefix length (255.255.255.252 -> 30), for OSPF router-LSA stub links.
function maskToPfx(mask) {
  if (!mask) return 32;
  var n = 0; String(mask).split('.').forEach(function (o) { var b = parseInt(o, 10) || 0; while (b) { n += b & 1; b >>= 1; } });
  return n;
}
// OSPF area id: srl prints "0.0.0.0" for the backbone; show the short "0" the labs use.
function normArea(a) { var s = String(a == null ? '0' : a); if (s === '0.0.0.0') return '0'; var m = s.match(/^0\.0\.0\.(\d+)$/); return m ? m[1] : s; }
function splitIf(sub) { var m = /^(.*)\.(\d+)$/.exec(sub); return m ? { base: m[1], sub: m[2] } : { base: sub, sub: '0' }; }
var PROTO = { ospfv2: 'ospf', ospf3: 'ospf', local: 'connected', host: 'local', 'ip-vrf': 'connected', static: 'static', 'bgp': 'bgp', 'bgp-vpn': 'bgp', arpnd: 'connected', 'arp-nd': 'connected' };

// ---------------------------------------------------------------------------
// Pure mapping: SR Linux `info from state … | as json` outputs -> X-Ray state.
// `fetch(path)` returns the parsed JSON for one state path (or null). Injecting it keeps the mapping
// unit-testable offline (see --self-test) — the live path just wires fetch to docker exec + sr_cli.
// ---------------------------------------------------------------------------
function buildState(fetch, node, adj, proto) {
  var isBgp = proto === 'bgp';
  var state = { target_node: node, protocol: isBgp ? 'bgp' : 'ospf', interfaces: {} };
  var _ipPfx = {};   // nx_srl_peer_map: ifn -> 'ip/len' (the output keeps the bare ip)
  state.nos = 'srlinux';  /* nx_srl_nos: which NOS this state came from (the page picks the Best-path legend by it) */
  if (isBgp) state.bgp_configured = true;
  var _plByIf = {};   /* nx_peer_links: per-LINK liveness (the <peer>_* keys are per peer name = 2 links to one peer collide) */

  // interfaces (ip + up) for the adjacency ifaces + the loopback
  Object.keys(adj).concat(['system0.0']).forEach(function (ifn) {
    var s = splitIf(ifn);
    var j = fetch('interface ' + s.base + ' subinterface ' + s.sub + ' ipv4');
    var ip = j && j.address && j.address[0] && j.address[0]['ip-prefix'];
    state.interfaces[ifn] = { ip: ipOnly(ip), up: !(j && j['admin-state'] === 'disable') };
    if (ip) _ipPfx[ifn] = ip;
  });

  // adjacency -> <peer>_iface / <peer>_has_full / <peer>_proto
  if (isBgp) {
    // BGP: a neighbor is "up" when session-state == established. Map the neighbor's peer-address to a
    // clab peer via the interface subnet (its subinterface ip shares the /30), same idea as --adj.
    // nx_srl_peer_map: match the peer-address against each adj iface's own prefix (was a first-3-octets map: two /30 in one /24 overwrote each other)
    var _ifOf = function (pa) { return Object.keys(adj).filter(function (ifn) { return _ipPfx[ifn] && sameNet24(_ipPfx[ifn], pa); })[0] || null; };
    var bn = fetch('network-instance default protocols bgp neighbor *');
    // nx_srl_bgp_neighbors: the per-neighbor list in the FRR collector's shape (the RE counts it: "Established 3, Idle (Admin) 1")
    // a disabled neighbor carries no peer-as: borrow it from a neighbor in the same peer-group, else '-' (never "AS undefined")
    var _grpAs = {}; (bn && bn.neighbor || []).forEach(function (n) { if (n['peer-group'] && n['peer-as'] != null && _grpAs[n['peer-group']] == null) _grpAs[n['peer-group']] = n['peer-as']; });
    state.bgp_neighbors = (bn && bn.neighbor || []).map(function (n) {
      var _st = String(n['session-state'] || '').toLowerCase();
      var _nm = { established: 'Established', active: 'Active', idle: 'Idle', connect: 'Connect', opensent: 'OpenSent', openconfirm: 'OpenConfirm' }[_st] || (n['session-state'] || '');
      if (n['admin-state'] === 'disable' && _st !== 'established') _nm = 'Idle (Admin)';
      var _as = n['peer-as'] != null ? n['peer-as'] : (_grpAs[n['peer-group']] != null ? _grpAs[n['peer-group']] : '-');
      var _o = { ip: n['peer-address'] || '', remote_as: _as, ibgp: n['peer-type'] === 'ibgp', state: _nm };
      var _af = (n['afi-safi'] || []).filter(function (a) { return a['afi-safi-name'] === 'ipv4-unicast'; })[0];
      if (_af && _af['received-routes'] != null) _o.pfx_rcvd = _af['received-routes'];
      return _o;
    });
    (bn && bn.neighbor || []).forEach(function (n) {
      var pa = n['peer-address'] || '', ifn = _ifOf(pa), peer = ifn && adj[ifn];
      if (!peer) return;
      var _keep = state[peer + '_has_full'] === true && n['session-state'] !== 'established';  /* nx_srl_peer_map: an up session keeps the per-peer keys */
      if (!_keep) state[peer + '_iface'] = ifn;
      if (!_keep) state[peer + '_has_full'] = n['session-state'] === 'established';
      state[peer + '_proto'] = 'bgp';
      _plByIf[ifn] = { full: n['session-state'] === 'established', proto: 'bgp', peer_ip: pa };
    });
  } else {
    var oa = fetch('network-instance default protocols ospf instance default area *');
    ((oa && oa.area) || []).forEach(function (a) {
      (a.interface || []).forEach(function (iface) {
        var ifn = iface['interface-name'];
        (iface.neighbor || []).forEach(function (nb) {
          var peer = adj[ifn]; if (!peer) return;
          var _keepO = state[peer + '_has_full'] === true && nb['adjacency-state'] !== 'full';  /* nx_srl_peer_map: a Full adjacency keeps the per-peer keys */
          if (!_keepO) state[peer + '_iface'] = ifn;
          if (!_keepO) state[peer + '_has_full'] = nb['adjacency-state'] === 'full';
          state[peer + '_proto'] = 'ospf';
          _plByIf[ifn] = { full: _plByIf[ifn] && _plByIf[ifn].full || nb['adjacency-state'] === 'full', proto: 'ospf', peer_ip: '' };
        });
      });
    });
  }
  // any adj iface with no neighbor entry still records its peer iface (link exists, adjacency down)
  Object.keys(adj).forEach(function (ifn) { var peer = adj[ifn]; if (state[peer + '_iface'] == null) { state[peer + '_iface'] = ifn; state[peer + '_has_full'] = false; state[peer + '_proto'] = state.protocol; } });

  /* nx_peer_links: one row per adj link (incl. 2 links to the same peer / a link with no neighbor = Down). Additive. */
  var _plRows = Object.keys(adj).map(function (ifn) { var r = _plByIf[ifn], it = state.interfaces[ifn] || {};
    return { iface: ifn, peer: adj[ifn], up: !!state.interfaces[ifn] && it.up !== false, ip: it.ip || '', full: !!(r && r.full), state: r ? (r.full ? 'Full' : 'Down') : 'Down', proto: r ? r.proto : state.protocol, peer_ip: (r && r.peer_ip) || '' }; });
  if (_plRows.length) state.peer_links = _plRows;

  // routes: route -> next-hop-group -> next-hop (resolve ip + out-iface)
  var rt = fetch('network-instance default route-table ipv4-unicast');
  var nhgJson = fetch('network-instance default route-table next-hop-group *');
  var nhJson = fetch('network-instance default route-table next-hop *');
  var nhg = {}; ((nhgJson && nhgJson['next-hop-group']) || []).forEach(function (g) { var first = (g['next-hop'] || [])[0]; if (first) nhg[g.index] = first['next-hop']; });
  var nh = {}; ((nhJson && nhJson['next-hop']) || []).forEach(function (n) { nh[n.index] = { ip: n['ip-address'] || '', iface: n.subinterface || '' }; });
  state.routing_table = ((rt && rt.route) || []).filter(function (r) { return r.active !== false; }).map(function (r) {
    var resolved = nh[nhg[r['next-hop-group']]] || {};
    var protocol = PROTO[r['route-type']] || r['route-type'] || '';
    var oif = resolved.iface || (protocol === 'local' ? 'system0.0' : '');
    return { prefix: r['ipv4-prefix'], out_iface: oif, next_hop: resolved.ip || undefined, protocol: protocol, selected: true };
  });

  // recursive next-hop resolution: an indirect (BGP) route reports a next-hop IP but no out-iface --
  // srl resolves it via a connected route. Inherit the out-iface of the connected route toward that
  // next-hop so the forwarding decision / DeepDive can show the real egress interface.
  state.routing_table.forEach(function (r) {
    if (r.next_hop && !r.out_iface) {
      var via = state.routing_table.filter(function (c) {
        return c.out_iface && c.out_iface.indexOf('system0') !== 0 && parseInt(String(c.prefix).split('/')[1], 10) !== 0 && sameNet24(c.prefix, r.next_hop);  /* nx_srl_peer_map: not the default route */
      }).sort(function (x, y) { return (parseInt(String(y.prefix).split('/')[1], 10) || 0) - (parseInt(String(x.prefix).split('/')[1], 10) || 0); })[0];  /* nx_srl_peer_map: longest match */
      if (via) r.out_iface = via.out_iface;
    }
  });

  // BGP RIB -> bgp_routes. Use the LOCAL-RIB (the decision table): it holds BOTH this router's
  // OWN-originated routes (origin-protocol "local", next-hop 0.0.0.0) AND routes learned from peers
  // (origin-protocol "bgp"), each with a best-route flag and an attr-id into attr-sets (AS-path /
  // local-pref / next-hop / origin). Live-verified against srl v24. (rib-in-pre = received-only, which
  // dropped own-originated prefixes -- so the BGP table was missing e.g. this node's own loopback.)
  if (isBgp) {
    var rib = fetch('network-instance default bgp-rib afi-safi ipv4-unicast ipv4-unicast local-rib');
    var attrJson = fetch('network-instance default bgp-rib attr-sets');
    var attrById = {};
    (((attrJson && attrJson['attr-set']) || [])).forEach(function (a) {
      var aspath = (a['as-path'] && (a['as-path'].segment || []).map(function (s) { return (s.member || []).join(' '); }).join(' ')) || '';
      var o = String(a.origin || 'igp');
      attrById[String(a.index)] = {
        next_hop: a['next-hop'] || '',
        as_path: aspath.trim(),
        local_pref: a['local-pref'] != null ? a['local-pref'] : 100,
        med: a.med != null ? a.med : 0,
        origin: o === 'incomplete' ? '?' : o.charAt(0)
      };
    });
    state.bgp_routes = (((rib && rib.route) || [])).map(function (r) {
      var at = attrById[String(r['attr-id'])] || {};
      var own = r['origin-protocol'] === 'local';
      var nh = (at.next_hop && at.next_hop !== '0.0.0.0') ? at.next_hop : (own ? '' : (r.neighbor || ''));
      var best = r['best-route'] === true;
      return {
        prefix: r.prefix || '', next_hop: nh, as_path: at.as_path || '',
        local_pref: at.local_pref != null ? at.local_pref : 100, weight: 0,
        metric: at.med || 0, origin: at.origin || 'i',
        best: best, own: own, status: best ? '*>' : '* '
      };
    });
  }

  // a forwarding decision to highlight: prefer a route learned via THIS node's protocol (a remote
  // loopback /32 first), else any off-box route. Avoids picking a local connected /30 over the
  // ospf/bgp-learned destination the DeepDive should showcase.
  var offbox = state.routing_table.filter(function (r) { return r.next_hop && r.out_iface && r.out_iface.indexOf('system0') !== 0; });
  var protoRoutes = offbox.filter(function (r) { return r.protocol === state.protocol; });
  var pick = protoRoutes.filter(function (r) { return /\/32$/.test(r.prefix); })[0] || protoRoutes[0] || offbox[0];
  var routeOk = !!pick;
  state.route_resolution = pick
    ? { target: ipOnly(pick.prefix), resolved: true, protocol: pick.protocol, out_iface: pick.out_iface, next_hop: pick.next_hop, matched_prefix: pick.prefix }
    : { target: '', resolved: false, protocol: '', out_iface: '', next_hop: '', matched_prefix: '' };

  // ---- summary fields = the full DeepDive / node-panel contract (DATA-CONTRACT §4), so the SAME
  // DeepDive renders an SR Linux node with parity to an FRR node. The scout draft emitted only the
  // per-peer <peer>_* keys; without these top-level fields the cylinder panels read blank for srl. ----
  var peers = [];
  Object.keys(adj).forEach(function (ifn) { var p = adj[ifn]; if (peers.indexOf(p) < 0) peers.push(p); });
  var fullCount = peers.filter(function (p) { return state[p + '_has_full']; }).length;
  state.peer_node = peers.filter(function (p) { return state[p + '_has_full']; })[0] || peers[0] || '';  /* nx_srl_peer_node: the main peer (an up one first), as the FRR collector */
  var reach = routeOk && fullCount > 0;

  state.success = true; state.id = node; state.scenario = node;
  state.has_full = fullCount > 0;
  state.full_count = fullCount;
  state.neighbor_state = fullCount > 0 ? 'Full' : 'None';
  state.wan_iface = (pick && pick.out_iface) || (peers[0] && state[peers[0] + '_iface']) || 'system0.0';
  state.lan_iface = (peers[0] && state[peers[0] + '_iface']) || state.wan_iface;
  state.ping_ok = reach;
  state.cleared = reach;
  state.target_on_path = false;

  if (isBgp) {
    state.is_established = fullCount > 0;
    state.bgp_state = fullCount > 0 ? 'Established' : 'Active';
    state.has_bgp_route = reach;
    // prefixes received = distinct LEARNED prefixes (exclude own-originated), matching srl's "Rx" count.
    var _rcvd = {}; (state.bgp_routes || []).forEach(function (r) { if (!r.own) _rcvd[r.prefix] = true; });
    state.pfx_rcvd = Object.keys(_rcvd).length;
    peers.forEach(function (p) { state[p + '_established'] = !!state[p + '_has_full']; });
  } else {
    /* nx_unread (F1, 2026-10-17): OSPF only when the router has an OSPF instance with an area (was: always true here) */
    state.ospf_configured = !!(typeof oa !== 'undefined' && oa && (oa.area || []).length);
    state.ospf_active_on_interface = fullCount > 0;
    state.peer_sending_hello = fullCount > 0;
    state.has_ospf_route = reach;
    // LSDB: parse the REAL srl OSPF link-state DB (area[].lsdb router-LSAs), not a routing-table
    // approximation -- so it includes THIS router's OWN-originated prefixes (loopback + connected),
    // marked own via advertising-router == our router-id (== our loopback ip). Stub-network links are
    // prefixes; p2p links are neighbor pointers (not prefixes) and are skipped.
    var myRid = (state.interfaces['system0.0'] && state.interfaces['system0.0'].ip) || '';
    var lsdbSeen = {}, lsdb = [];
    ((oa && oa.area) || []).forEach(function (a) {
      var types = (a.lsdb && a.lsdb['lsa-types'] && a.lsdb['lsa-types']['lsa-type']) || [];
      types.forEach(function (t) {
        if (t.type !== 'router-lsa') return;
        ((t.lsas && t.lsas.lsa) || []).forEach(function (L) {
          var adv = L['advertising-router'] || '';
          ((L['router-lsa'] && L['router-lsa'].links) || []).forEach(function (lk) {
            if (lk.type !== 'router-lsa-stub-network') return;
            var pfx = lk['link-id'] + '/' + maskToPfx(lk['link-data']);
            if (lsdbSeen[pfx]) return; lsdbSeen[pfx] = true;
            lsdb.push({ text: pfx, own: !!(myRid && adv === myRid), via: adv });
          });
        });
      });
    });
    state.lsdb_prefixes = lsdb.length ? lsdb   // fall back to the RIB approximation only if no LSDB in the fetch
      : state.routing_table.filter(function (r) { return r.protocol === 'ospf'; }).map(function (r) {
        return { text: r.prefix, own: !r.next_hop, via: r.next_hop || r.out_iface || '' };
      });
    // Area / hello: a Full adjacency GUARANTEES matching area + hello timers (OSPF never reaches Full
    // otherwise), so mirror the target's real area/hello onto both sides -> clears the false "MISMATCH".
    if (fullCount > 0) {
      var _a0 = (oa && oa.area && oa.area[0]) || {};
      var _if0 = ((_a0.interface || []).filter(function (i) { return (i.neighbor || []).length; })[0]) || (_a0.interface || [])[0] || {};
      var tArea = normArea(_a0['area-id']), tHello = _if0['hello-interval'] || 10;
      state.r1_area = state.r2_area = state.target_area = state.peer_area = tArea; state.area_match = true;
      state.r1_hello = state.r2_hello = state.target_hello = state.peer_hello = tHello; state.timer_match = true;
    }
    peers.forEach(function (p) { state[p + '_neighbor_state'] = state[p + '_has_full'] ? 'Full' : 'None'; });
  }

  return state;
}

// ---------------------------------------------------------------------------
// Offline self-test: feed the exact JSON shapes SR Linux emits (captured from a live srl v26 lab)
// through buildState and assert the mapping. No docker / no lab required.
// ---------------------------------------------------------------------------
function selfTest() {
  function fx(map) { return function (path) { for (var k in map) { if (path.indexOf(k) >= 0) return map[k]; } return null; }; }
  var pass = 0, tot = 0;
  function ok(name, cond) { tot++; if (cond) pass++; console.log((cond ? 'PASS' : 'FAIL') + '  ' + name); }

  // -- OSPF link2 (r1 facing r2 on ethernet-1/1.0) --
  var ospfFetch = fx({
    'interface ethernet-1/1 subinterface 0 ipv4': { 'admin-state': 'enable', address: [{ 'ip-prefix': '10.0.0.1/30' }] },
    'interface system0 subinterface 0 ipv4': { 'admin-state': 'enable', address: [{ 'ip-prefix': '1.1.1.1/32' }] },
    'protocols ospf': { area: [{ interface: [{ 'interface-name': 'ethernet-1/1.0', neighbor: [{ 'router-id': '2.2.2.2', 'adjacency-state': 'full' }] }] }] },
    'next-hop-group': { 'next-hop-group': [{ index: 'g1', 'next-hop': [{ 'next-hop': 'n1' }] }] },
    'next-hop *': { 'next-hop': [{ index: 'n1', type: 'direct', 'ip-address': '10.0.0.2', subinterface: 'ethernet-1/1.0' }] },
    'route-table ipv4-unicast': { route: [{ 'ipv4-prefix': '1.1.1.1/32', 'route-type': 'host', 'next-hop-group': 'gLocal', active: true }, { 'ipv4-prefix': '2.2.2.2/32', 'route-type': 'ospfv2', 'next-hop-group': 'g1', active: true }] }
  });
  // nx_srl_peer_map: two /30 links in one /24 -> each BGP peer lands on its own iface
  var twoFetch = fx({
    'interface ethernet-1/1 subinterface 0 ipv4': { 'admin-state': 'enable', address: [{ 'ip-prefix': '10.1.0.1/30' }] },
    'interface ethernet-1/2 subinterface 0 ipv4': { 'admin-state': 'enable', address: [{ 'ip-prefix': '10.1.0.5/30' }] },
    'interface system0 subinterface 0 ipv4': { 'admin-state': 'enable', address: [{ 'ip-prefix': '10.0.0.1/32' }] },
    'bgp neighbor': { neighbor: [{ 'peer-address': '10.1.0.2', 'session-state': 'established' }, { 'peer-address': '10.1.0.6', 'session-state': 'active' }] }
  });
  var s2 = buildState(twoFetch, 'r1', { 'ethernet-1/1.0': 'r2', 'ethernet-1/2.0': 'r3' }, 'bgp');
  ok('bgp: /30 peers in one /24 map to their own iface (r2 up on 1/1, r3 down on 1/2)',
    s2.r2_iface === 'ethernet-1/1.0' && s2.r2_has_full === true && s2.r3_iface === 'ethernet-1/2.0' && s2.r3_has_full === false);
  // 2 links to ONE peer (1st up, 2nd idle): the up session keeps r2_iface / r2_has_full
  var s3 = buildState(fx({
    'interface ethernet-1/1 subinterface 0 ipv4': { 'admin-state': 'enable', address: [{ 'ip-prefix': '10.1.0.1/30' }] },
    'interface ethernet-1/2 subinterface 0 ipv4': { 'admin-state': 'enable', address: [{ 'ip-prefix': '10.1.0.5/30' }] },
    'interface system0 subinterface 0 ipv4': { 'admin-state': 'enable', address: [{ 'ip-prefix': '10.0.0.1/32' }] },
    'bgp neighbor': { neighbor: [{ 'peer-address': '10.1.0.2', 'session-state': 'established' }, { 'peer-address': '10.1.0.6', 'session-state': 'idle' }] }
  }), 'r1', { 'ethernet-1/1.0': 'r2', 'ethernet-1/2.0': 'r2' }, 'bgp');
  ok('bgp: 2 links to one peer, the up one keeps r2_iface/r2_has_full (1/1.0 established, 1/2.0 idle)', s3.r2_iface === 'ethernet-1/1.0' && s3.r2_has_full === true && s3.is_established === true);
  var s = buildState(ospfFetch, 'r1', { 'ethernet-1/1.0': 'r2' }, 'ospf');
  ok('ospf: iface ip mapped (10.0.0.1)', s.interfaces['ethernet-1/1.0'].ip === '10.0.0.1');
  ok('nos: srlinux (nx_srl_nos)', s.nos === 'srlinux');
  ok('ospf: loopback ip mapped (1.1.1.1)', s.interfaces['system0.0'].ip === '1.1.1.1');
  ok('ospf: r2 adjacency Full', s.r2_has_full === true && s.r2_iface === 'ethernet-1/1.0' && s.r2_proto === 'ospf');
  var ospfRoute = s.routing_table.filter(function (r) { return r.prefix === '2.2.2.2/32'; })[0];
  ok('ospf: route 2.2.2.2/32 via ethernet-1/1.0 nh 10.0.0.2 proto ospf', !!ospfRoute && ospfRoute.out_iface === 'ethernet-1/1.0' && ospfRoute.next_hop === '10.0.0.2' && ospfRoute.protocol === 'ospf');
  ok('ospf: host route -> protocol local, out system0.0', (s.routing_table.filter(function (r) { return r.prefix === '1.1.1.1/32'; })[0] || {}).protocol === 'local');
  ok('ospf: route_resolution picks the ospf route', s.route_resolution && s.route_resolution.matched_prefix === '2.2.2.2/32');
  // full DeepDive contract (DATA-CONTRACT §4) parity with FRR nodes
  ok('ospf: summary has_full/full_count/neighbor_state', s.has_full === true && s.full_count === 1 && s.neighbor_state === 'Full');
  ok('peer_node: the up peer (nx_srl_peer_node)', s.peer_node === 'r2');
  ok('ospf: ospf_configured + active + reachability (ping_ok/cleared)', s.ospf_configured === true && s.ospf_active_on_interface === true && s.ping_ok === true && s.cleared === true && s.has_ospf_route === true);
  ok('ospf: route_resolution enriched (next_hop/protocol/target)', s.route_resolution.next_hop === '10.0.0.2' && s.route_resolution.protocol === 'ospf' && s.route_resolution.target === '2.2.2.2');
  ok('ospf: wan_iface = the uplink toward the route', s.wan_iface === 'ethernet-1/1.0');
  ok('ospf: lsdb_prefixes lists the learned 2.2.2.2/32 (via next-hop)', (s.lsdb_prefixes || []).some(function (p) { return p.text === '2.2.2.2/32' && p.own === false; }));
  ok('ospf: per-peer neighbor_state Full', s.r2_neighbor_state === 'Full');

  // -- BGP link2 (r1 eBGP to r2; r2 advertises 8.8.8.0/24) --
  var bgpFetch = fx({
    'interface ethernet-1/1 subinterface 0 ipv4': { 'admin-state': 'enable', address: [{ 'ip-prefix': '10.0.0.1/30' }] },
    'interface system0 subinterface 0 ipv4': { 'admin-state': 'enable', address: [{ 'ip-prefix': '1.1.1.1/32' }] },
    'protocols bgp neighbor': { neighbor: [{ 'peer-address': '10.0.0.2', 'session-state': 'established' }] },
    // real srl model: local-rib holds OWN-originated (origin-protocol "local") + learned ("bgp") routes,
    // each with best-route + an attr-id into attr-sets.
    'local-rib': { route: [
      { prefix: '8.8.8.0/24', neighbor: '10.0.0.2', 'origin-protocol': 'bgp', 'best-route': true, 'attr-id': '5' },
      { prefix: '1.1.1.1/32', neighbor: '0.0.0.0', 'origin-protocol': 'local', 'best-route': true, 'attr-id': '6' }
    ] },
    'attr-sets': { 'attr-set': [
      { index: '5', origin: 'igp', 'next-hop': '10.0.0.2', 'local-pref': 100, 'as-path': { segment: [{ member: [65002, 65100] }] } },
      { index: '6', origin: 'igp', 'next-hop': '0.0.0.0' }
    ] },
    // bgp next-hop (n1) is INDIRECT: it has the peer IP but no subinterface (srl resolves it via the
    // connected route). A connected 10.0.0.0/30 (nC -> ethernet-1/1.0) is present so recursive
    // resolution can inherit the egress iface -- exactly the live srl shape.
    'next-hop-group': { 'next-hop-group': [{ index: 'g1', 'next-hop': [{ 'next-hop': 'n1' }] }, { index: 'gC', 'next-hop': [{ 'next-hop': 'nC' }] }] },
    'next-hop *': { 'next-hop': [{ index: 'n1', type: 'indirect', 'ip-address': '10.0.0.2', subinterface: '' }, { index: 'nC', type: 'direct', 'ip-address': '10.0.0.1', subinterface: 'ethernet-1/1.0' }] },
    'route-table ipv4-unicast': { route: [{ 'ipv4-prefix': '8.8.8.0/24', 'route-type': 'bgp', 'next-hop-group': 'g1', active: true }, { 'ipv4-prefix': '10.0.0.0/30', 'route-type': 'arpnd', 'next-hop-group': 'gC', active: true }] }
  });
  var b = buildState(bgpFetch, 'r1', { 'ethernet-1/1.0': 'r2' }, 'bgp');
  ok('bgp: protocol=bgp + bgp_configured', b.protocol === 'bgp' && b.bgp_configured === true);
  ok('bgp: r2 session Established -> has_full, proto bgp', b.r2_has_full === true && b.r2_proto === 'bgp');
  // nx_srl_bgp_neighbors: the per-neighbor list, FRR spelling (established -> Established; admin disable -> Idle (Admin))
  var _bn = buildState(fx({
    'interface ethernet-1/1 subinterface 0 ipv4': { 'admin-state': 'enable', address: [{ 'ip-prefix': '10.1.0.1/30' }] },
    'interface ethernet-1/2 subinterface 0 ipv4': { 'admin-state': 'enable', address: [{ 'ip-prefix': '10.1.0.5/30' }] },
    'interface system0 subinterface 0 ipv4': { 'admin-state': 'enable', address: [{ 'ip-prefix': '1.1.1.1/32' }] },
    'protocols bgp neighbor': { neighbor: [
      { 'peer-address': '10.1.0.2', 'session-state': 'established', 'admin-state': 'enable', 'peer-as': 65002, 'peer-group': 'g2', 'peer-type': 'ebgp', 'afi-safi': [{ 'afi-safi-name': 'ipv4-unicast', 'received-routes': 3 }] },
      { 'peer-address': '10.1.0.6', 'session-state': 'idle', 'admin-state': 'disable', 'peer-group': 'g2', 'peer-type': 'ebgp' }] }
  }), 'r1', { 'ethernet-1/1.0': 'r2', 'ethernet-1/2.0': 'r2' }, 'bgp');
  ok('bgp_neighbors: 2 entries, Established (AS 65002, PfxRcd 3) + Idle (Admin)', Array.isArray(_bn.bgp_neighbors) && _bn.bgp_neighbors.length === 2
    && _bn.bgp_neighbors[0].state === 'Established' && _bn.bgp_neighbors[0].remote_as === 65002 && _bn.bgp_neighbors[0].pfx_rcvd === 3 && _bn.bgp_neighbors[0].ibgp === false
    && _bn.bgp_neighbors[1].state === 'Idle (Admin)' && _bn.bgp_neighbors[1].ip === '10.1.0.6' && _bn.bgp_neighbors[1].remote_as === 65002);
  var bgpRt = b.routing_table.filter(function (r) { return r.prefix === '8.8.8.0/24'; })[0] || {};
  ok('bgp: route 8.8.8.0/24 proto bgp', bgpRt.protocol === 'bgp');
  ok('bgp: indirect next-hop recursively resolved to ethernet-1/1.0 (out_iface)', bgpRt.out_iface === 'ethernet-1/1.0');
  ok('bgp: route_resolution picks the bgp /24 (not the connected /30)', b.route_resolution.matched_prefix === '8.8.8.0/24' && b.route_resolution.protocol === 'bgp');
  var brLearned = (b.bgp_routes || []).filter(function (r) { return r.prefix === '8.8.8.0/24'; })[0];
  var brOwn = (b.bgp_routes || []).filter(function (r) { return r.prefix === '1.1.1.1/32'; })[0];
  ok('bgp: learned 8.8.8.0/24 as-path "65002 65100" best via 10.0.0.2 (own=false)', !!brLearned && brLearned.as_path === '65002 65100' && brLearned.best === true && brLearned.next_hop === '10.0.0.2' && brLearned.own === false);
  ok('bgp: OWN-originated 1.1.1.1/32 in table (origin local, empty as-path, own=true)', !!brOwn && brOwn.own === true && brOwn.as_path === '' && brOwn.best === true);
  // full DeepDive contract (DATA-CONTRACT §4.4) parity
  ok('bgp: is_established + bgp_state Established', b.is_established === true && b.bgp_state === 'Established');
  ok('bgp: pfx_rcvd counts best routes + has_bgp_route', b.pfx_rcvd === 1 && b.has_bgp_route === true);
  ok('bgp: per-peer <peer>_established', b.r2_established === true);
  ok('bgp: reachability (ping_ok/cleared) + route_resolution bgp', b.ping_ok === true && b.cleared === true && b.route_resolution.protocol === 'bgp');

  // -- --from-dir round-trip against the bundled REAL srl capture (no docker / no lab) --
  var sampleDir = pathMod.join(__dirname, 'fixtures', 'srl-collect-sample', 'r1');
  var fd = buildState(dirFetch(sampleDir), 'r1', { 'ethernet-1/1.0': 'r2' }, 'ospf');
  ok('from-dir: replays bundled real srl capture (r1 OSPF Full)', fd.target_node === 'r1' && fd.full_count === 1 && fd.r2_has_full === true);
  ok('from-dir: route_resolution from recorded json (2.2.2.2/32 nh 10.0.0.2)', fd.route_resolution.matched_prefix === '2.2.2.2/32' && fd.route_resolution.next_hop === '10.0.0.2');

  // nx_peer_links: two links to the same peer (1/1.0 full, 1/2.0 no neighbor)
  var plFetch = fx({ 'protocols ospf': { area: [{ interface: [{ 'interface-name': 'ethernet-1/1.0', neighbor: [{ 'router-id': '2.2.2.2', 'adjacency-state': 'full' }] }] }] } });
  var pl = buildState(plFetch, 'r1', { 'ethernet-1/1.0': 'r2', 'ethernet-1/2.0': 'r2' }, 'ospf');
  ok('peer_links: 2 rows for 2 links to r2', pl.peer_links && pl.peer_links.length === 2);
  ok('peer_links: 1/1.0 Full, 1/2.0 Down (2nd link kept)', pl.peer_links[0].full === true && pl.peer_links[1].iface === 'ethernet-1/2.0' && pl.peer_links[1].state === 'Down');
  ok('peer_links: old r2_iface key unchanged (= the live 1/1.0)', pl.r2_iface === 'ethernet-1/1.0' && pl.r2_has_full === true);

  console.log('\nSUMMARY: ' + pass + '/' + tot + ' PASS');
  return pass === tot;
}

// ---------------------------------------------------------------------------
function arg(name, def) { var i = process.argv.indexOf(name); return i >= 0 ? process.argv[i + 1] : def; }

if (process.argv.indexOf('--self-test') >= 0) {
  process.exit(selfTest() ? 0 : 1);
}

var node = arg('--node'), proto = arg('--proto', 'ospf'), out = arg('--out');
var fromDir = arg('--from-dir'), lab = arg('--lab'), capture = arg('--capture');
var adj = {};
/* nx_no_shell (2026-10-17): sr_cli is started with an argument array and every name must look like a name */
var SAFE_NAME = /^[A-Za-z0-9][A-Za-z0-9_.-]{0,62}$/, SAFE_IF = /^[A-Za-z0-9][A-Za-z0-9_.\/-]{0,62}$/;
arg('--adj', '').split(',').filter(Boolean).forEach(function (p) {
  var i = p.indexOf(':'); if (i <= 0) return;
  if (!SAFE_IF.test(p.slice(0, i)) || !SAFE_NAME.test(p.slice(i + 1))) { console.error('!! --adj: left out ' + JSON.stringify(p.slice(0, 80)) + ' (not a plain name)'); return; }
  adj[p.slice(0, i)] = p.slice(i + 1);
});
if ((lab && !SAFE_NAME.test(lab)) || (node && !SAFE_NAME.test(node))) { console.error('!! --lab / --node must be plain names (letters, digits, _ . -)'); process.exit(2); }

var fetchFn, nxUnread = null;   /* nx_unread: [why, message] when the router cannot be read */
if (fromDir) {
  // offline replay: read the recorded `info from state ... | as json` files (no docker / no lab).
  if (!node) { console.error('usage: --from-dir <dir> --node <node> --adj if:peer,... [--proto ospf|bgp] [--out f]'); process.exit(2); }
  fetchFn = dirFetch(fromDir);
} else if (lab && node) {
  // live: run `sr_cli "info from state <path> | as json"` inside clab-<lab>-<node>.
  var container = 'clab-' + lab + '-' + node;
  var live = function (p) {
    if (!/^[A-Za-z0-9 *._\/-]+$/.test(p)) return null;   /* nx_no_shell: a state path is words, never a second command */
    if (nxUnread) return null;   /* nx_unread: once the router did not answer / is not there, stop asking this round */
    try {
      var o = cp.execFileSync('docker', ['exec', container, 'sr_cli', 'info from state ' + p + ' | as json'],
        { encoding: 'utf8', maxBuffer: 1024 * 1024 * 32, timeout: 8000, stdio: ['ignore', 'pipe', 'pipe'] });
      return JSON.parse(o);
    } catch (e) {
      /* nx_unread (2026-10-17): the same 3 reasons as the FRR collector (docker's own messages only) */
      var t = String((e && e.stderr) || '') + ' ' + String((e && e.stdout) || '') + ' ' + String((e && e.message) || '');   /* docker prints "OCI runtime exec failed" on stdout */
      if (e && e.code === 'ETIMEDOUT') nxUnread = ['timeout', 'no answer in 8 s'];
      else if (/Error response from daemon:.*(is not running|is paused|is restarting)|No such container/i.test(t)) nxUnread = ['stopped', 'the container is not running'];
      else if (/OCI runtime exec failed.*sr_cli|exec: "sr_cli": executable file not found/i.test(t)) nxUnread = ['device', 'no sr_cli in this container'];
      return null;
    }
  };
  fetchFn = capture ? teeFetch(live, capture) : live;   // --capture <dir> records for later --from-dir
} else {
  console.error('usage:\n' +
    '  --lab <lab> --node <node> --adj if:peer,... [--proto ospf|bgp] [--capture <dir>] [--out f]   (live via docker exec)\n' +
    '  --from-dir <dir> --node <node> --adj if:peer,... [--proto ospf|bgp] [--out f]                (offline replay)\n' +
    '  --self-test');
  process.exit(2);
}

var state = buildState(fetchFn, node, adj, proto);
if (nxUnread) { console.error('NX_UNREAD ' + nxUnread[0] + ' ' + nxUnread[1]); process.exit(3); }   /* nx_unread: not an empty router */
var json = JSON.stringify(state, null, 2);
if (out) fs.writeFileSync(out, json); else process.stdout.write(json + '\n');
if (capture && lab) console.error('captured state paths to ' + capture + '/ (replay: --from-dir ' + capture + ' --node ' + node + ' --adj <same> --proto ' + proto + ')');
