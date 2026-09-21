// clab-xray-bridge.js — facade integration
//
// clab-to-xray.js only produces the render scaffold (topology/nodes/networks + a placeholder xray).
// This bridge covers the "facade territory": it fills in real values for xray.protocol/pattern/ping_mode/
// holo_fields plus live state (normal / fault), producing a scene that the xrayCore facade can actually draw.
//
// Design notes:
//  - The most common clab topology is a "small lab of FRR routers forming OSPF adjacencies" -> default protocol = OSPF.
//    (the converter fills protocol:'static' as a placeholder, which we override here)
//  - The state shape mirrors the OSPF state from frr-parse.js (proven to render in the frr-paste demo)
//    = supply every field the holo body / logic-line builders require -> avoid the empty-render regression.
//  - Works in both browser and Node (window or module.exports). Touches neither the live engine nor the OSS gallery core.
//
// Usage (browser):
//   var scene = clabXray.toScene(converterConfig);          // {config, states:{normal,fault}, topo}
//   var view  = xrayCore.renderTopology('#topo', scene.config, { topology: scene.topo });
//   view.applyState(scene.states.normal);                   // or .fault

(function (root) {
  'use strict';

  // Assign subnets by network order (10.<i>.0.0/24). member.host_id (10/20) is the last octet.
  function _subnetBase(i) { return '10.' + (i + 1) + '.0'; }
  function _ip(i, hostId) { return _subnetBase(i) + '.' + hostId; }

  // converter config -> a drawable scene (real config values + normal/fault state + topo snapshot)
  function toScene(cfg, opts) {
    opts = opts || {};
    var proto = opts.protocol || 'ospf';        // default for a clab router lab
    var nodes = (cfg.nodes || []).map(function (n) { return Object.assign({}, n); });
    var nets = cfg.networks || [];
    var target = nodes.filter(function (n) { return n.target; })[0] || nodes[0] || {};
    var targetId = target.id;

    // For each node, build the list of {iface, peer, subnetIdx, ip, peerIp} it belongs to
    var nodeIf = {};   // nodeId -> [{ iface, peer, net, ip, peerIp, hostId }]
    nodes.forEach(function (n) { nodeIf[n.id] = []; });
    nets.forEach(function (nw, i) {
      var ms = nw.members || [];
      if (ms.length !== 2) return;            // an X-Ray link is between exactly 2 parties
      var a = ms[0], b = ms[1];
      var aIp = _ip(i, a.host_id), bIp = _ip(i, b.host_id);
      if (nodeIf[a.node]) nodeIf[a.node].push({ peer: b.node, net: nw.name, ip: aIp, peerIp: bIp, hostId: a.host_id, idx: i });
      if (nodeIf[b.node]) nodeIf[b.node].push({ peer: a.node, net: nw.name, ip: bIp, peerIp: aIp, hostId: b.host_id, idx: i });
    });
    // Assign eth0, eth1, ... to each node's links in order
    Object.keys(nodeIf).forEach(function (id) {
      nodeIf[id].forEach(function (l, k) { l.iface = 'eth' + k; });
    });

    // --- fill in real values for config.xray ---
    var isTri = cfg.topology_type === 'triangle';
    var pattern = isTri ? 'ospf_triangle' : 'ospf_linear';
    var config = Object.assign({}, cfg);
    config.xray = {
      enabled: true, protocol: proto, pattern: pattern,
      ping_mode: isTri ? 'through' : 'from-r1',
      holo_fields: [
        { label: 'Neighbors', field: 'full_count', ok: '', err: '0' },
        { label: 'Route', field: 'has_ospf_route', ok: 'OK', err: 'NONE' },
        { label: 'Ping', field: 'ping_ok', ok: 'OK', err: 'FAIL' }
      ]
    };
    // Derive node.type from role (the engine draws server vs router based on n.type)
    config.nodes = nodes.map(function (n) {
      var t = (/server/i.test(n.role || '') ? 'server' : (/isp|internet|inet/i.test(n.id) ? 'isp' : 'router'));
      return Object.assign({}, n, { type: opts.keepType ? (n.type || t) : t });
    });

    // --- topo snapshot (Seam A): subnets + per-node iface UP/DOWN ---
    function buildTopo(downNet) {
      var subnets = {};
      nets.forEach(function (nw, i) { subnets[nw.name] = _subnetBase(i) + '.0/24'; });
      var topo = { success: true, subnets: subnets, nodes: {} };
      nodes.forEach(function (n) {
        topo.nodes[n.id] = nodeIf[n.id].map(function (l) {
          return { name: l.iface, ip: l.ip, prefix: 24, state: (l.net === downNet ? 'DOWN' : 'UP') };
        });
      });
      return topo;
    }

    // --- live state builder (same shape as the OSPF state from frr-parse.js) ---
    // downNet=null -> normal (all Full / route resolved / ping OK). A given downNet -> degraded by cutting that link.
    function buildState(downNet) {
      var tIfs = nodeIf[targetId] || [];
      var peers = tIfs.map(function (l) {
        return { name: l.peer, iface: l.iface, net: l.net, ip: l.ip, peerIp: l.peerIp,
                 full: (l.net !== downNet) };
      });
      var fullCount = peers.filter(function (p) { return p.full; }).length;
      // route: from the target to a "far node it is not directly linked to" (opposite vertex for a triangle, an end for linear).
      var farNode = nodes.filter(function (n) {
        return n.id !== targetId && !peers.some(function (p) { return p.name === n.id; });
      })[0] || (peers[peers.length - 1] && { id: peers[peers.length - 1].name });
      var primaryPeer = peers.filter(function (p) { return p.full; })[0] || peers[0];
      var routeOk = !!(farNode && primaryPeer);
      var stIfaces = {};
      tIfs.forEach(function (l) { stIfaces[l.iface] = { up: (l.net !== downNet), ip: l.ip + '/24' }; });
      var ifaceHellos = {}, peerHellos = {};
      tIfs.forEach(function (l) { if (l.net !== downNet) { ifaceHellos[l.iface] = 10; peerHellos[l.peer] = 10; } });

      var farSubnetIdx = farNode ? nets.findIndex(function (nw) {
        return (nw.members || []).some(function (m) { return m.node === farNode.id; });
      }) : -1;
      var farIp = farNode && farSubnetIdx >= 0 ? _ip(farSubnetIdx, 1) : '';

      var s = {
        success: true, id: config.id, scenario: config.id,
        target_node: targetId, peer_node: primaryPeer ? primaryPeer.name : '',
        interfaces: stIfaces,
        wan_iface: primaryPeer ? primaryPeer.iface : 'eth0',
        lan_iface: peers[0] ? peers[0].iface : 'eth0',
        neighbor_state: fullCount > 0 ? 'Full' : 'None',
        has_full: fullCount > 0, full_count: fullCount,
        ospf_configured: true, ospf_active_on_interface: fullCount > 0,
        peer_sending_hello: fullCount > 0,
        iface_hellos: ifaceHellos, peer_hellos: peerHellos,
        has_ospf_route: routeOk && fullCount > 0,
        ping_ok: routeOk && fullCount > 0,
        route_resolution: (routeOk && fullCount > 0)
          ? { target: farIp, resolved: true, protocol: 'ospf', out_iface: primaryPeer.iface,
              next_hop: primaryPeer.peerIp, matched_prefix: (farIp ? farIp.replace(/\.\d+$/, '.0') : '') + '/24' }
          : { target: farIp, resolved: false, protocol: '', out_iface: '', next_hop: '', matched_prefix: '' },
        target_on_path: false, cleared: routeOk && fullCount > 0
      };
      peers.forEach(function (p) {
        s[p.name + '_has_full'] = p.full;
        s[p.name + '_iface'] = p.iface;
        s[p.name + '_neighbor_state'] = p.full ? 'Full' : 'None';
      });
      return s;
    }

    // fault: bring down the target's first link (degraded scene)
    var firstNet = (nodeIf[targetId] && nodeIf[targetId][0] && nodeIf[targetId][0].net) || null;

    return {
      config: config,
      topo: buildTopo(null),
      states: { normal: buildState(null), fault: buildState(firstNet) },
      topos: { normal: buildTopo(null), fault: buildTopo(firstNet) },
      _meta: { protocol: proto, target: targetId, peerCount: (nodeIf[targetId] || []).length }
    };
  }

  // Multi-peer selector: for any topology node, enumerate the DeepDive "views" it can show.
  // The X-Ray cylinder has two sides (in/out peer), so a node with 3+ neighbors yields multiple views,
  // one per "which pair of peers to inspect". Each view is a 3-node sub-config (node + the 2 chosen peers),
  // within X-Ray's 3-shape limit, so it draws without passing the full N-node config.
  // A host (e.g. the clab graph shell) turns this array into buttons -> renders the chosen view via renderTopology + openDeepDiveFor.
  //   var views = clabXray.deepViews(fullConfig, 'r1');
  //   // views[i] = { label, peers:[a,b], scene:{config,topo,states} }
  //   var v = views[0]; var view = xrayCore.renderTopology('#topo', v.scene.config, {topology:v.scene.topo});
  //   view.openDeepDiveFor('r1', v.scene.states.normal);
  function deepViews(cfg, nodeId) {
    var nets = cfg.networks || [];
    // collect the node's neighbors (peer, net)
    var adj = [];
    nets.forEach(function (nw) {
      var ms = nw.members || [];
      if (ms.length !== 2) return;
      var a = ms[0].node, b = ms[1].node;
      if (a === nodeId) adj.push({ peer: b, net: nw });
      else if (b === nodeId) adj.push({ peer: a, net: nw });
    });
    var nodeById = {}; (cfg.nodes || []).forEach(function (n) { nodeById[n.id] = n; });
    function subScene(peerList) {
      // build a sub-config with the node at the center and peerList (1-2 nodes) around it -> toScene turns it into per-node state
      var ids = [nodeId].concat(peerList);
      // exactly one neighbor = an endpoint (stub) node -> the DeepDive is single-faced with no input (left) side.
      // the engine enters single-face mode via targetNode.single_link (toScene preserves node properties).
      var isStub = peerList.length === 1;
      var subNodes = ids.map(function (id) {
        var src = nodeById[id] || { id: id, type: 'router', role: 'Router' };
        return Object.assign({}, src, { target: (id === nodeId), single_link: (id === nodeId && isStub) });
      });
      // place the center in the middle (for linear/inverted-v display): peer1, node, peer2
      var ordered = peerList.length === 2 ? [peerList[0], nodeId, peerList[1]] : ids;
      subNodes.sort(function (x, y) { return ordered.indexOf(x.id) - ordered.indexOf(y.id); });
      var subNets = adj.filter(function (e) { return peerList.indexOf(e.peer) >= 0; }).map(function (e) { return e.net; });
      var subCfg = {
        success: true, id: cfg.id + '-' + nodeId, topology_type: peerList.length === 2 ? 'linear_3node' : 'linear_2node',
        layout: peerList.length === 2 ? 'inverted_v' : '', nodes: subNodes, networks: subNets,
        modes: cfg.modes || ['troubleshoot']
      };
      // Carry per-node positions (from graph-posX/posY, if the source config has them) for just this
      // sub-scene's nodes, so the unified renderer draws each peer tunnel at its real topology angle
      // (radial DeepDive) instead of the fixed left/right layout. No positions -> unchanged behaviour.
      if (cfg.positions) {
        var subPos = {};
        ids.forEach(function (id) { if (cfg.positions[id]) subPos[id] = cfg.positions[id]; });
        if (Object.keys(subPos).length) subCfg.positions = subPos;
      }
      return toScene(subCfg);
    }
    if (adj.length <= 2) {
      return [{ label: adj.map(function (e) { return e.peer; }).join(' / ') || nodeId,
        peers: adj.map(function (e) { return e.peer; }), scene: subScene(adj.map(function (e) { return e.peer; })) }];
    }
    // 3+ neighbors: enumerate unique peer pairs
    var views = [];
    for (var i = 0; i < adj.length; i++) {
      for (var j = i + 1; j < adj.length; j++) {
        var pr = [adj[i].peer, adj[j].peer];
        views.push({ label: pr[0] + ' ↔ ' + nodeId + ' ↔ ' + pr[1], peers: pr, scene: subScene(pr) });
      }
    }
    return views;
  }

  var api = { toScene: toScene, deepViews: deepViews };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.clabXray = api;
})(typeof window !== 'undefined' ? window : globalThis);
