// BGP 例のデータ — 2ルータ (R1 AS65001 — R2 AS65002) の eBGP セッション確立を見せる。
// 実エンジン (xray-core.js) + xrayCore (xray-api.js) で描画。各状態は applyState で切替。
// 注: 観察対象 (円柱を開くルータ) は r2。peer = r1 (左)。r1 が 203.0.113.0/24 を広告 → r2 が学習。
//     ping/traffic は使わない教材なので ping オーブはデモ CSS で非表示。
//
// ★ engine の BGP 描画は「Established か否か」の二値 (OSPF のような FSM 中間状態の描き分けは無い)。
//   円柱は session-down → Established + 経路学習を描き、BGP FSM の途中段階は 3 段インジケータで補う
//   (OSPF 例で Init/2-Way をインジケータで示したのと同じ方針)。

window.BGP_CONFIG = {
  success: true, id: 'bgp', topology_type: 'linear', layout: '',
  nodes: [
    { id: 'r1', role: 'AS 65001', type: 'router' },
    { id: 'r2', role: 'AS 65002', type: 'router', target: true }   // 観察対象 = r2
  ],
  networks: [
    { name: 'net-r1r2', members: [{ node: 'r1', host_id: 1 }, { node: 'r2', host_id: 2 }] }
  ],
  xray: {
    protocol: 'bgp', pattern: 'bgp_linear', ping_mode: 'cylinder-to-left',  // peer r1 は左
    holo_fields: [
      { label: 'BGP Session', field: 'is_established', ok: 'Established', fallback: 'bgp_state' },
      { label: 'Prefix 203.0.113.0/24', field: 'pfx_rcvd', ok: 'received', err: '—' }
    ]
  }
};

// 1 状態を生成。fsm = BGP FSM 状態名、opts.ifUp = r2-r1 リンクが up か。
// 観察対象 r2 / peer r1 / 単一 IF eth0 (R1—R2 リンク, r2 側 10.0.12.2)。
function _bgp(fsm, opts) {
  opts = opts || {};
  var ifUp = opts.ifUp !== false;
  var est = (fsm === 'Established') && ifUp;
  var bstate = ifUp ? fsm : 'Active';   // リンク断 → TCP :179 が張れず Active (再試行) に転落
  return {
    success: true, scenario: 'bgp', target_node: 'r2', peer_id: 'r1', peer_node: 'r1',
    interfaces: { eth0: { up: ifUp, ip: '10.0.12.2/24' } },
    wan_iface: 'eth0', lan_iface: 'eth0',
    bgp_configured: true,                 // router bgp は設定済 (FSM が進む) → BGP プロセッサ core 点灯
    is_established: est,                   // ★主たる真偽: Established か否か (トンネル表示を駆動)
    bgp_state: bstate,                     // 表示用 FSM 文字列 (fallback)
    r1_established: est,                   // per-peer (peer = r1)
    pfx_rcvd: est ? 1 : 0,                 // 受信プレフィクス数
    // BGP は OSPF の hello/LSDB を使わない → OSPF 系フィールドは無効化 (hello オーブを出さない)
    neighbor_state: 'None', has_full: false, ospf_configured: false, ospf_active_on_interface: false,
    iface_hellos: {}, peer_hellos: {}, peer_sending_hello: false,
    // Established で初めて peer (r1 / AS65001) の広告する 203.0.113.0/24 を学習 →
    // Routing Engine パネル「Route: BGP 203.0.113.0/24 / FORWARD」+ 円柱 FORWARD 矢印 + トンネル(紫)。
    route_resolution: est
      ? { target: '203.0.113.0', resolved: true, protocol: 'bgp', out_iface: 'eth0', next_hop: '10.0.12.1', matched_prefix: '203.0.113.0/24' }
      : { target: '203.0.113.0', resolved: false, protocol: '', out_iface: '', next_hop: '', matched_prefix: '' },
    ping_ok: false, cleared: false, is_passive: false
  };
}

window.BGP_STATES = {
  idle:        _bgp('Idle'),        // BGP 設定済だが TCP 未開始
  connect:     _bgp('Connect'),     // peer の TCP :179 へ接続試行中
  opensent:    _bgp('OpenSent'),    // TCP 確立 → OPEN 送信、相手の OPEN 待ち
  openconfirm: _bgp('OpenConfirm'), // 相手 OPEN 受信 → 最初の KEEPALIVE 待ち
  established: _bgp('Established'),  // セッション確立 → UPDATE で経路学習・トンネル紫
  linkdown:    _bgp('Active', { ifUp: false })  // リンク断 → Active (再試行)・✖
};

window.BGP_DESC = {
  idle:        'Idle — BGP は設定済みだが、まだ TCP 接続を開始していない初期状態。',
  connect:     'Connect — peer の TCP :179 への接続を試行中(3-way handshake 待ち)。',
  opensent:    'OpenSent — TCP 確立。OPEN(AS番号・hold time・capabilities)を送信し、相手の OPEN を待つ。',
  openconfirm: 'OpenConfirm — 相手の OPEN を受信。最初の KEEPALIVE を待っている。',
  established: 'Established — セッション確立。KEEPALIVE/UPDATE が流れ、peer(AS 65001)が広告する 203.0.113.0/24 を学習 → Routing Engine パネル・円柱 FORWARD 矢印・トンネル(紫)に出る。',
  linkdown:    'Link Down — リンク断で TCP :179 が張れず、セッションは Active(再試行)に転落(✖)。'
};
