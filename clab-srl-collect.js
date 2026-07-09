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

function ipOnly(pfx) { return pfx ? String(pfx).split('/')[0] : ''; }
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

  // BGP RIB -> bgp_routes (network / next-hop / AS-path / local-pref / origin / best)
  if (isBgp) {
    var rib = fetch('network-instance default bgp-rib afi-safi ipv4-unicast rib-in-out rib-in-post routes *');
    state.bgp_routes = ((rib && rib.route) || []).map(function (r) {
      var attr = r.attributes || r;
      var aspath = (attr['as-path'] && (attr['as-path'].segment || []).map(function (s) { return (s.member || []).join(' '); }).join(' ')) || attr['as-path-str'] || '';
      return {
        prefix: r.prefix || r['ipv4-prefix'] || '',
        next_hop: r['next-hop'] || attr['next-hop'] || '',
        as_path: aspath.trim(),
        local_pref: attr['local-pref'] != null ? attr['local-pref'] : (attr['local-preference'] != null ? attr['local-preference'] : 100),
        weight: 0,
        metric: attr.med != null ? attr.med : (attr['multi-exit-disc'] != null ? attr['multi-exit-disc'] : 0),
        origin: (attr.origin || 'i').charAt(0),
        best: r['best-route'] === true || r.best === true,
        status: (r['best-route'] === true || r.best === true) ? '*>' : '* '
      };
    });
  }

  // a forwarding decision to highlight (first non-local route with a real next hop off a real iface)
  var pick = state.routing_table.filter(function (r) { return r.next_hop && r.out_iface && r.out_iface.indexOf('system0') !== 0; })[0];
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
    state.pfx_rcvd = (state.bgp_routes || []).filter(function (r) { return r.best; }).length;
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
    'bgp-rib': { route: [{ prefix: '8.8.8.0/24', 'next-hop': '10.0.0.2', 'best-route': true, attributes: { 'as-path': { segment: [{ member: [65002, 65100] }] }, 'local-pref': 100, origin: 'igp' } }] },
    'next-hop-group': { 'next-hop-group': [{ index: 'g1', 'next-hop': [{ 'next-hop': 'n1' }] }] },
    'next-hop *': { 'next-hop': [{ index: 'n1', type: 'direct', 'ip-address': '10.0.0.2', subinterface: 'ethernet-1/1.0' }] },
    'route-table ipv4-unicast': { route: [{ 'ipv4-prefix': '8.8.8.0/24', 'route-type': 'bgp', 'next-hop-group': 'g1', active: true }] }
  });
  var b = buildState(bgpFetch, 'r1', { 'ethernet-1/1.0': 'r2' }, 'bgp');
  ok('bgp: protocol=bgp + bgp_configured', b.protocol === 'bgp' && b.bgp_configured === true);
  ok('bgp: r2 session Established -> has_full, proto bgp', b.r2_has_full === true && b.r2_proto === 'bgp');
  ok('bgp: route 8.8.8.0/24 proto bgp via ethernet-1/1.0', (b.routing_table.filter(function (r) { return r.prefix === '8.8.8.0/24'; })[0] || {}).protocol === 'bgp');
  var br = (b.bgp_routes || [])[0];
  ok('bgp: bgp_routes has 8.8.8.0/24, as-path "65002 65100", best', !!br && br.prefix === '8.8.8.0/24' && br.as_path === '65002 65100' && br.best === true && br.next_hop === '10.0.0.2');
  // full DeepDive contract (DATA-CONTRACT §4.4) parity
  ok('bgp: is_established + bgp_state Established', b.is_established === true && b.bgp_state === 'Established');
  ok('bgp: pfx_rcvd counts best routes + has_bgp_route', b.pfx_rcvd === 1 && b.has_bgp_route === true);
  ok('bgp: per-peer <peer>_established', b.r2_established === true);
  ok('bgp: reachability (ping_ok/cleared) + route_resolution bgp', b.ping_ok === true && b.cleared === true && b.route_resolution.protocol === 'bgp');

  console.log('\nSUMMARY: ' + pass + '/' + tot + ' PASS');
  return pass === tot;
}

// ---------------------------------------------------------------------------
function arg(name, def) { var i = process.argv.indexOf(name); return i >= 0 ? process.argv[i + 1] : def; }

if (process.argv.indexOf('--self-test') >= 0) {
  process.exit(selfTest() ? 0 : 1);
}

var lab = arg('--lab'), node = arg('--node'), proto = arg('--proto', 'ospf'), out = arg('--out');
if (!lab || !node) { console.error('usage: node clab-srl-collect.js --lab <lab> --node <node> --adj if:peer,... [--proto ospf|bgp] [--out file]  |  --self-test'); process.exit(2); }
var container = 'clab-' + lab + '-' + node;
var adj = {};
arg('--adj', '').split(',').filter(Boolean).forEach(function (p) { var i = p.indexOf(':'); if (i > 0) adj[p.slice(0, i)] = p.slice(i + 1); });

// live fetch: run `sr_cli "info from state <path> | as json"` inside the node
function srl(path) {
  try {
    var o = cp.execSync('docker exec ' + container + ' sr_cli "info from state ' + path + ' | as json"',
      { encoding: 'utf8', maxBuffer: 1024 * 1024 * 32, stdio: ['ignore', 'pipe', 'ignore'] });
    return JSON.parse(o);
  } catch (e) { return null; }
}

var state = buildState(srl, node, adj, proto);
var json = JSON.stringify(state, null, 2);
if (out) require('fs').writeFileSync(out, json); else process.stdout.write(json + '\n');
