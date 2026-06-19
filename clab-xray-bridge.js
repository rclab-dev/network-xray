// clab-xray-bridge.js — 案A 後半 (facade 統合, worker1 2026-06-19)
//
// worker7 の clab-to-xray.js は描画 scaffold (topology/nodes/networks + placeholder xray) まで。
// このブリッジが「facade 領域」= xray.protocol/pattern/ping_mode/holo_fields の実値化 + live state
// (normal / fault) を供給し、xrayCore facade で実際に描けるシーンに仕上げる。
//
// 設計方針:
//  - clab トポロジは「FRR ルータが OSPF で隣接を組む小ラボ」が最も一般的 → 既定プロトコル = OSPF。
//    (変換器は protocol:'static' の仮値を入れるが、ここで上書きする)
//  - state 形は frr-parse.js (frr-paste デモで実描画実証済) の OSPF state と同型に揃える
//    = holo body / logic-line ビルダーが要求する field を全部供給 → §11 の空描画 regression を踏まない。
//  - ブラウザ/Node 両用 (window or module.exports)。live engine も OSS gallery 本体も触らない。
//
// 使い方 (ブラウザ):
//   var scene = clabXray.toScene(converterConfig);          // {config, states:{normal,fault}, topo}
//   var view  = xrayCore.renderTopology('#topo', scene.config, { topology: scene.topo });
//   view.applyState(scene.states.normal);                   // または .fault

(function (root) {
  'use strict';

  // network 順にサブネットを割当 (10.<i>.0.0/24)。member.host_id (10/20) が末尾オクテット。
  function _subnetBase(i) { return '10.' + (i + 1) + '.0'; }
  function _ip(i, hostId) { return _subnetBase(i) + '.' + hostId; }

  // converter config → 描画可能シーン (config 実値化 + normal/fault state + topo snapshot)
  function toScene(cfg, opts) {
    opts = opts || {};
    var proto = opts.protocol || 'ospf';        // clab ルータラボの既定
    var nodes = (cfg.nodes || []).map(function (n) { return Object.assign({}, n); });
    var nets = cfg.networks || [];
    var target = nodes.filter(function (n) { return n.target; })[0] || nodes[0] || {};
    var targetId = target.id;

    // node → そのノードが属する {iface, peer, subnetIdx, ip, peerIp} のリストを構築
    var nodeIf = {};   // nodeId -> [{ iface, peer, net, ip, peerIp, hostId }]
    nodes.forEach(function (n) { nodeIf[n.id] = []; });
    nets.forEach(function (nw, i) {
      var ms = nw.members || [];
      if (ms.length !== 2) return;            // X-Ray の link は 2 者間
      var a = ms[0], b = ms[1];
      var aIp = _ip(i, a.host_id), bIp = _ip(i, b.host_id);
      if (nodeIf[a.node]) nodeIf[a.node].push({ peer: b.node, net: nw.name, ip: aIp, peerIp: bIp, hostId: a.host_id, idx: i });
      if (nodeIf[b.node]) nodeIf[b.node].push({ peer: a.node, net: nw.name, ip: bIp, peerIp: aIp, hostId: b.host_id, idx: i });
    });
    // 各ノードの link に eth0,eth1,... を順に割当
    Object.keys(nodeIf).forEach(function (id) {
      nodeIf[id].forEach(function (l, k) { l.iface = 'eth' + k; });
    });

    // --- config の xray を実値化 ---
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
    // node.type を role から補正 (engine は n.type で server/router を描き分ける)
    config.nodes = nodes.map(function (n) {
      var t = (/server/i.test(n.role || '') ? 'server' : (/isp|internet|inet/i.test(n.id) ? 'isp' : 'router'));
      return Object.assign({}, n, { type: opts.keepType ? (n.type || t) : t });
    });

    // --- topo snapshot (Seam A): subnets + 各ノード iface UP/DOWN ---
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

    // --- live state ビルダー (frr-parse.js の OSPF state と同型) ---
    // downNet=null → normal (全 Full / 経路解決 / ping OK)。downNet 指定 → その link 断で degraded。
    function buildState(downNet) {
      var tIfs = nodeIf[targetId] || [];
      var peers = tIfs.map(function (l) {
        return { name: l.peer, iface: l.iface, net: l.net, ip: l.ip, peerIp: l.peerIp,
                 full: (l.net !== downNet) };
      });
      var fullCount = peers.filter(function (p) { return p.full; }).length;
      // 経路: target から「直接リンクしていない遠いノード」へ (triangle は対辺、linear は端)。
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

    // fault: target の最初の link を落とす (degraded シーン)
    var firstNet = (nodeIf[targetId] && nodeIf[targetId][0] && nodeIf[targetId][0].net) || null;

    return {
      config: config,
      topo: buildTopo(null),
      states: { normal: buildState(null), fault: buildState(firstNet) },
      topos: { normal: buildTopo(null), fault: buildTopo(firstNet) },
      _meta: { protocol: proto, target: targetId, peerCount: (nodeIf[targetId] || []).length }
    };
  }

  var api = { toScene: toScene };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.clabXray = api;
})(typeof window !== 'undefined' ? window : globalThis);
