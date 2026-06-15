// CCNA 講師例のデータ — 2ルータ (R1—R2) の OSPF 隣接形成を 7 ステートで見せる。
// 実エンジン (xray-core.js) + xrayCore (xray-api.js) で描画。各状態は applyState で切替。
// 注: これは「隣接形成」の教材なので ping/traffic は使わない (ping オーブはデモCSSで非表示)。

window.CCNA_CONFIG = {
  success: true, id: 'ccna', topology_type: 'linear', layout: '',
  nodes: [
    { id: 'r1', role: 'Router', type: 'router', target: true },
    { id: 'r2', role: 'Router', type: 'router' }
  ],
  networks: [
    { name: 'net-r1r2', members: [{ node: 'r1', host_id: 1 }, { node: 'r2', host_id: 2 }] }
  ],
  xray: {
    protocol: 'ospf', pattern: 'ospf_linear', ping_mode: 'from-r1',
    holo_fields: [
      { label: 'Neighbor', field: 'neighbor_state', ok: 'Full', err: '—' },
      { label: 'LSDB', field: 'has_full', ok: 'Synced', err: 'syncing' }
    ]
  }
};

// 1 状態を生成。nbr=OSPF FSM 状態名、opts.peerHello=相手が Hello 送信中か、
// opts.ifUp=IF が up か。target=r1, peer=r2, 単一 IF eth0 (R1—R2 リンク)。
function _ccna(nbr, opts) {
  opts = opts || {};
  var ifUp = opts.ifUp !== false;
  var ospfOn = ifUp;                       // r1 は OSPF 有効 (IF up の間 Hello 送信)
  var peerHello = !!opts.peerHello && ifUp; // r2 が Hello 送信中か
  var full = (nbr === 'Full') && ifUp;
  var state = ifUp ? nbr : 'Down';
  return {
    success: true, scenario: 'ccna', target_node: 'r1', peer_id: 'r2', peer_node: 'r2',
    interfaces: { eth0: { up: ifUp, ip: '10.0.12.1/24' } },
    wan_iface: 'eth0', lan_iface: 'eth0',
    ospf_configured: true,
    ospf_active_on_interface: ospfOn,       // helloOut (r1 が Hello 送信)
    peer_sending_hello: peerHello,          // helloIn (r2 の Hello 受信)
    neighbor_state: state,
    has_full: full, full_count: full ? 1 : 0,
    has_ospf_route: full, ping_ok: false, cleared: false,
    iface_hellos: ospfOn ? { eth0: 10 } : {},  // 自IF Hello (送信オーブ)
    peer_hellos: { r2: 10 },                    // peer Hello (受信オーブ)
    r1_hello: 10, r2_hello: 10, target_hello: 10, peer_hello: 10,
    r1_dead: 40, r2_dead: 40, target_dead: 40, peer_dead: 40,
    target_area: '0.0.0.0', peer_area: '0.0.0.0', r1_area: '0.0.0.0', r2_area: '0.0.0.0',
    timer_match: true, area_match: true,
    // Full で初めて r2 の loopback 2.2.2.2/32 を OSPF 学習 →
    // Routing Engine パネル「Route: OSPF 2.2.2.2/32 / FORWARD」+ LSDB 行 + 円柱 FORWARD 矢印に出る。
    // Full 未満は target=2.2.2.2 を引くが resolved:false → パネル「Route to 2.2.2.2: NONE」。
    route_resolution: full
      ? { target: '2.2.2.2', resolved: true, protocol: 'ospf', out_iface: 'eth0', next_hop: '10.0.12.2', matched_prefix: '2.2.2.2/32' }
      : { target: '2.2.2.2', resolved: false, protocol: '', out_iface: '', next_hop: '', matched_prefix: '' },
    is_passive: false
  };
}

window.CCNA_STATES = {
  down:     _ccna('Down',     { peerHello: false }), // Hello 送信のみ、相手未応答
  init:     _ccna('Init',     { peerHello: true  }), // 相手 Hello 受信 (片方向)
  twoway:   _ccna('2-Way',    { peerHello: true  }), // 双方向 Hello 確立 (DR/BDR 選出)
  exstart:  _ccna('ExStart',  { peerHello: true  }), // Master/Slave 決定、DBD 交換開始
  exchange: _ccna('Exchange', { peerHello: true  }), // DBD 交換中 → LSDB 集約アニメ
  loading:  _ccna('Loading',  { peerHello: true  }), // 不足 LSA を要求・取得 → LSDB 集約
  full:     _ccna('Full',     { peerHello: true  }), // 完全同期 → トンネル + LSDB 緑
  linkdown: _ccna('Down',     { ifUp: false, peerHello: false }) // リンク断 → ✖・Hello 途絶
};

window.CCNA_DESC = {
  down:     'Down — Hello を送信しているが、相手からの Hello はまだ受信していない。',
  init:     'Init — 相手の Hello を受信(片方向)。まだ自分が相手の neighbor リストに載っていない。',
  twoway:   '2-Way — 双方向の Hello が成立。ここで DR/BDR が選出される。',
  exstart:  'ExStart — Master/Slave を決め、DBD(DB Description)交換を開始。',
  exchange: 'Exchange — DBD で LSDB の要約を交換中。→ 円柱内に LSA 集約アニメが流れる。',
  loading:  'Loading — 不足している LSA を LSR/LSU で要求・取得中。→ LSA 集約継続。',
  full:     'Full — LSDB 完全同期・隣接確立。r2 の loopback 2.2.2.2/32 を OSPF 学習 → Routing Engine パネル・LSDB・円柱の FORWARD 矢印に出る。トンネル表示・ゲージ緑・集約停止。',
  linkdown: 'Link Down — リンク断。Hello が途絶し隣接がダウン(✖)。'
};
