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
  return ipOnly(prefix).split('.').slice(0, 3).join('.') === String(ip).split('.').slice(0, 3).join('.');
}
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
  if (isBgp) state.bgp_configured = true;

  // interfaces (ip + up) for the adjacency ifaces + the loopback
  Object.keys(adj).concat(['system0.0']).forEach(function (ifn) {
    var s = splitIf(ifn);
    var j = fetch('interface ' + s.base + ' subinterface ' + s.sub + ' ipv4');
    var ip = j && j.address && j.address[0] && j.address[0]['ip-prefix'];
    state.interfaces[ifn] = { ip: ipOnly(ip), up: !(j && j['admin-state'] === 'disable') };
  });

  // adjacency -> <peer>_iface / <peer>_has_full / <peer>_proto
  if (isBgp) {
    // BGP: a neighbor is "up" when session-state == established. Map the neighbor's peer-address to a
    // clab peer via the interface subnet (its subinterface ip shares the /30), same idea as --adj.
    var subnetOf = {};   // "10.0.0" (first 3 octets) -> ifn, to match a bgp peer-address to an adj iface
    Object.keys(adj).forEach(function (ifn) { var ip = state.interfaces[ifn] && state.interfaces[ifn].ip; if (ip) subnetOf[ip.split('.').slice(0, 3).join('.')] = ifn; });
    var bn = fetch('network-instance default protocols bgp neighbor *');
    (bn && bn.neighbor || []).forEach(function (n) {
      var pa = n['peer-address'] || '', ifn = subnetOf[pa.split('.').slice(0, 3).join('.')] || null, peer = ifn && adj[ifn];
      if (!peer) return;
      state[peer + '_iface'] = ifn;
      state[peer + '_has_full'] = n['session-state'] === 'established';
      state[peer + '_proto'] = 'bgp';
    });
  } else {
    var oa = fetch('network-instance default protocols ospf instance default area *');
    ((oa && oa.area) || []).forEach(function (a) {
      (a.interface || []).forEach(function (iface) {
        var ifn = iface['interface-name'];
        (iface.neighbor || []).forEach(function (nb) {
          var peer = adj[ifn]; if (!peer) return;
          state[peer + '_iface'] = ifn;
          state[peer + '_has_full'] = nb['adjacency-state'] === 'full';
          state[peer + '_proto'] = 'ospf';
        });
      });
    });
  }
  // any adj iface with no neighbor entry still records its peer iface (link exists, adjacency down)
  Object.keys(adj).forEach(function (ifn) { var peer = adj[ifn]; if (state[peer + '_iface'] == null) { state[peer + '_iface'] = ifn; state[peer + '_has_full'] = false; state[peer + '_proto'] = state.protocol; } });

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
        return c.out_iface && c.out_iface.indexOf('system0') !== 0 && sameNet24(c.prefix, r.next_hop);
      })[0];
      if (via) r.out_iface = via.out_iface;
    }
  });

  // BGP RIB -> bgp_routes. SR Linux separates the received routes (rib-in-pre: prefix + neighbor +
  // attr-id) from the path attributes (attr-sets, keyed by index). So join them: route.attr-id ->
  // attr-set.index. (Live-verified against srl v24 on containerlab; the older inline-attributes shape
  // this file first assumed does not exist.) `best` = the prefix that actually won into the route-table.
  if (isBgp) {
    var rib = fetch('network-instance default bgp-rib afi-safi ipv4-unicast ipv4-unicast rib-in-out rib-in-pre');
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
    var bgpBest = {};   // prefix installed as bgp in the route-table = the best/used path
    state.routing_table.forEach(function (r) { if (r.protocol === 'bgp') bgpBest[r.prefix] = true; });
    state.bgp_routes = (((rib && rib.route) || [])).map(function (r) {
      var at = attrById[String(r['attr-id'])] || {};
      var nh = (at.next_hop && at.next_hop !== '0.0.0.0') ? at.next_hop : (r.neighbor || '');
      var best = !!bgpBest[r.prefix];
      return {
        prefix: r.prefix || '', next_hop: nh, as_path: at.as_path || '',
        local_pref: at.local_pref != null ? at.local_pref : 100, weight: 0,
        metric: at.med || 0, origin: at.origin || 'i',
        best: best, status: best ? '*>' : '* '
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
    // prefixes received = distinct prefixes in the rib-in (received), matching srl's "Rx" count.
    var _rcvd = {}; (state.bgp_routes || []).forEach(function (r) { _rcvd[r.prefix] = true; });
    state.pfx_rcvd = Object.keys(_rcvd).length;
    peers.forEach(function (p) { state[p + '_established'] = !!state[p + '_has_full']; });
  } else {
    state.ospf_configured = true;
    state.ospf_active_on_interface = fullCount > 0;
    state.peer_sending_hello = fullCount > 0;
    state.has_ospf_route = reach;
    // LSDB view: prefixes learned via ospf (own = locally originated, no next-hop ip)
    state.lsdb_prefixes = state.routing_table.filter(function (r) { return r.protocol === 'ospf'; }).map(function (r) {
      return { text: r.prefix, own: !r.next_hop, via: r.next_hop || r.out_iface || '' };
    });
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
  var s = buildState(ospfFetch, 'r1', { 'ethernet-1/1.0': 'r2' }, 'ospf');
  ok('ospf: iface ip mapped (10.0.0.1)', s.interfaces['ethernet-1/1.0'].ip === '10.0.0.1');
  ok('ospf: loopback ip mapped (1.1.1.1)', s.interfaces['system0.0'].ip === '1.1.1.1');
  ok('ospf: r2 adjacency Full', s.r2_has_full === true && s.r2_iface === 'ethernet-1/1.0' && s.r2_proto === 'ospf');
  var ospfRoute = s.routing_table.filter(function (r) { return r.prefix === '2.2.2.2/32'; })[0];
  ok('ospf: route 2.2.2.2/32 via ethernet-1/1.0 nh 10.0.0.2 proto ospf', !!ospfRoute && ospfRoute.out_iface === 'ethernet-1/1.0' && ospfRoute.next_hop === '10.0.0.2' && ospfRoute.protocol === 'ospf');
  ok('ospf: host route -> protocol local, out system0.0', (s.routing_table.filter(function (r) { return r.prefix === '1.1.1.1/32'; })[0] || {}).protocol === 'local');
  ok('ospf: route_resolution picks the ospf route', s.route_resolution && s.route_resolution.matched_prefix === '2.2.2.2/32');
  // full DeepDive contract (DATA-CONTRACT §4) parity with FRR nodes
  ok('ospf: summary has_full/full_count/neighbor_state', s.has_full === true && s.full_count === 1 && s.neighbor_state === 'Full');
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
    // real srl model: received route (rib-in-pre) references an attr-id; the attributes live in attr-sets.
    'rib-in-out rib-in-pre': { route: [{ prefix: '8.8.8.0/24', neighbor: '10.0.0.2', 'path-id': 0, 'attr-id': '5' }] },
    'attr-sets': { 'attr-set': [{ index: '5', origin: 'igp', 'next-hop': '10.0.0.2', 'local-pref': 100, 'as-path': { segment: [{ member: [65002, 65100] }] } }] },
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
  var bgpRt = b.routing_table.filter(function (r) { return r.prefix === '8.8.8.0/24'; })[0] || {};
  ok('bgp: route 8.8.8.0/24 proto bgp', bgpRt.protocol === 'bgp');
  ok('bgp: indirect next-hop recursively resolved to ethernet-1/1.0 (out_iface)', bgpRt.out_iface === 'ethernet-1/1.0');
  ok('bgp: route_resolution picks the bgp /24 (not the connected /30)', b.route_resolution.matched_prefix === '8.8.8.0/24' && b.route_resolution.protocol === 'bgp');
  var br = (b.bgp_routes || [])[0];
  ok('bgp: bgp_routes has 8.8.8.0/24, as-path "65002 65100", best', !!br && br.prefix === '8.8.8.0/24' && br.as_path === '65002 65100' && br.best === true && br.next_hop === '10.0.0.2');
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
arg('--adj', '').split(',').filter(Boolean).forEach(function (p) { var i = p.indexOf(':'); if (i > 0) adj[p.slice(0, i)] = p.slice(i + 1); });

var fetchFn;
if (fromDir) {
  // offline replay: read the recorded `info from state ... | as json` files (no docker / no lab).
  if (!node) { console.error('usage: --from-dir <dir> --node <node> --adj if:peer,... [--proto ospf|bgp] [--out f]'); process.exit(2); }
  fetchFn = dirFetch(fromDir);
} else if (lab && node) {
  // live: run `sr_cli "info from state <path> | as json"` inside clab-<lab>-<node>.
  var container = 'clab-' + lab + '-' + node;
  var live = function (p) {
    try {
      var o = cp.execSync('docker exec ' + container + ' sr_cli "info from state ' + p + ' | as json"',
        { encoding: 'utf8', maxBuffer: 1024 * 1024 * 32, stdio: ['ignore', 'pipe', 'ignore'] });
      return JSON.parse(o);
    } catch (e) { return null; }
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
var json = JSON.stringify(state, null, 2);
if (out) fs.writeFileSync(out, json); else process.stdout.write(json + '\n');
if (capture && lab) console.error('captured state paths to ' + capture + '/ (replay: --from-dir ' + capture + ' --node ' + node + ' --adj <same> --proto ' + proto + ')');
