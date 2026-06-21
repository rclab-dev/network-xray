# X-Ray Core — Data Contract / データ契約

> **EN** — `xray-core.js` is a *data-driven* renderer. You hand it two plain objects — a
> **`config`** (the topology you want to draw) and a **`state`** (a snapshot of router
> protocol state) — and it draws the picture. It does **not** talk to any router, run any
> protocol, or fetch anything by itself. Everything it knows comes from the data you pass.
> This document is the complete shape of that data.
>
> **JA** — `xray-core.js` は *データ駆動* のレンダラです。**`config`**(描きたいトポロジ)と
> **`state`**(ルータのプロトコル状態のスナップショット)という2つのプレーンなオブジェクトを
> 渡すと、絵を描きます。ルータと通信したり、プロトコルを動かしたり、自分でデータを取りに行ったり
> は**一切しません**。エンジンが知っているのは、あなたが渡したデータだけ。本書はそのデータの
> 全体像です。

The fields below are all **generic networking concepts** (OSPF / BGP / static routes /
interfaces). None are tied to a specific router OS — they map 1:1 to `show` command output
from FRRouting, Cisco IOS, Arista EOS, Juniper, etc. See [§6](#6-bring-your-own-data--自分のデータで使う).

以下のフィールドはすべて **汎用的なネットワーク概念**(OSPF / BGP / 静的経路 / インターフェース)
です。特定のルータ OS に縛られておらず、FRRouting / Cisco IOS / Arista EOS / Juniper 等の
`show` コマンド出力に 1:1 で対応します([§6](#6-bring-your-own-data--自分のデータで使う) 参照)。

---

## Contents / 目次

1. [How it renders / 描画の仕組み](#1-how-it-renders--描画の仕組み)
2. [Quick start / クイックスタート](#2-quick-start--クイックスタート)
3. [`config` — topology & scenario / トポロジ・シナリオ定義](#3-config--topology--scenario--トポロジシナリオ定義)
4. [`state` — router state snapshot / 状態スナップショット](#4-state--router-state-snapshot--状態スナップショット)
5. [Seams — injecting live data / ライブデータの注入](#5-seams--injecting-live-data--ライブデータの注入)
6. [Bring your own data / 自分のデータで使う](#6-bring-your-own-data--自分のデータで使う)
7. [Limitations / 制約](#7-limitations--制約)

---

## 1. How it renders / 描画の仕組み

**EN** — Rendering is three function calls plus two optional "seams" where live data is
injected. The engine self-injects its CSS on load, so no stylesheet is required.

**JA** — 描画は3つの関数呼び出しと、ライブデータを注入する2つの任意「seam(継ぎ目)」です。
エンジンは読み込み時に CSS を自己注入するので、スタイルシートは不要です。

```
config ──▶ xrayRenderTopology(config) ──▶ topology HTML (draw into #topo-diagram)
config ──▶ xrayBuildApplyState(config) ──▶ window.applyXrayState(state)
state  ──▶ applyXrayState(state)        ──▶ updates the drawing to that snapshot

Seam A (optional): window._xrayTopologyData  = <topology snapshot>   // per-link UP/DOWN
Seam B (optional): window._xrayTraceFetcher  = fn(id) => Promise<trace>  // path arrows
```

Render path is chosen by `config.topology_type` / `config.xray.pattern`
(`linear`, `triangle`, `inverted_v`, …).

描画経路は `config.topology_type` / `config.xray.pattern`(`linear`/`triangle`/`inverted_v` 等)
で選ばれます。

---

## 2. Quick start / クイックスタート

```html
<div id="topo-diagram"></div>
<script src="xray-core.js"></script>   <!-- self-injects its CSS -->
<script>
  // 1. theme (sets CSS variables)
  xrayApplyTheme('troubleshoot');

  // 2. seed the globals the render path reads
  window._scenarioConfig   = config;          // the same object you pass below
  window._xrayTargetNode   = 'topo-node-r2';  // DOM id of the inspected node
  window._xrayLiveIfaceStates = {};           // live iface cache (empty = use snapshot)

  // 3. draw the topology
  document.getElementById('topo-diagram').innerHTML = xrayRenderTopology(config);

  // 4. build the per-config entry point
  xrayBuildApplyState(config);                 // -> window.applyXrayState

  // 5. inject seams + apply a snapshot
  window._xrayTopologyData = snapshot.topo;    // Seam A
  window._xrayTraceFetcher = () => Promise.resolve(snapshot.trace);  // Seam B
  document.body.classList.add('is-xray-mode');
  applyXrayState(snapshot.state);
</script>
```

**Required DOM / 必要な DOM**

| Element | Required? | Purpose |
|---|---|---|
| `#topo-diagram` | yes / 必須 | host for the topology drawing. トポロジ描画の入れ物。 |
| `#xray-deep-engine` (+ `.de-panel`) | optional / 任意 | DeepDive "cylinder" view. Hide with `display:none` if unused. DeepDive(円柱)ビュー。使わないなら `display:none`。 |

`window._xrayTargetNode` must be the DOM id of the inspected node, i.e. `'topo-node-' + <node.id with `target:true`>`.

`window._xrayTargetNode` は調査対象ノードの DOM id(= `'topo-node-' + <target:true のノードの id>`)。

### Per-node DeepDive / 任意ノードの DeepDive — `view.openDeepDiveFor(nodeId, state)`

Re-target the DeepDive cylinder to **any** node and open it. Use when the overview lives in another
graph tool (e.g. a containerlab graph) and you want node-click → "look inside that node", without
re-rendering an X-Ray overview. `state` is that node's snapshot (you supply it — a per-node collector
or your adapter); it is pure (no server fetch). Pairs with `xrayCore.renderTopology(...)` having been
called once first (the shared topology config is remembered).

任意ノードへ DeepDive を貼り替えて開く。全体図を別 graph ツール(例: containerlab graph)に任せ、
node クリック→「そのノードの中を見る」をしたいときに使う。`state` は呼び出し側が供給(per-node
collector / アダプタ)。先に `renderTopology()` を1回呼んでおくこと(共有 config を記憶している)。

```js
var view = xrayCore.renderTopology('#topo', config, { topology });
// later, on a node click in your overview:
view.openDeepDiveFor('r2', r2Snapshot);   // re-points the cylinder to r2 and zooms in
```

---

## 3. `config` — topology & scenario / トポロジ・シナリオ定義

Passed to `xrayRenderTopology(config)` and `xrayBuildApplyState(config)`.
`xrayRenderTopology(config)` と `xrayBuildApplyState(config)` に渡します。

| Field | Type | Meaning / 意味 |
|---|---|---|
| `id` | string | A label for this scenario. **Not interpreted by the renderer** — it is only handed back to your `_xrayTraceFetcher(id)`. Any string is fine. このシナリオのラベル。**レンダラは解釈しません** — `_xrayTraceFetcher(id)` に戻されるだけ。任意の文字列で可。 |
| `topology_type` | string | Drawing shape: `linear`, `triangle`, `inverted_v`, `multi`. 描画する形。 |
| `layout` | string | Optional layout hint (e.g. `inverted_v`). 任意のレイアウトヒント。 |
| `nodes[]` | array | The routers/hosts. See below. ルータ/ホスト。下表参照。 |
| `networks[]` | array | The links / subnets. See below. リンク/サブネット。下表参照。 |
| `xray` | object | Visualization config. See below. 可視化設定。下表参照。 |
| `capture` | object | Optional packet-capture view config. 任意のパケットキャプチャ設定。 |

### `config.nodes[]`

| Field | Type | Meaning / 意味 |
|---|---|---|
| `id` | string | Node id, e.g. `"r1"`. Used to build the DOM id `topo-node-r1`. ノード id。DOM id `topo-node-r1` を作るのに使う。 |
| `role` | string | Display label under the node, e.g. `"ルータ"` / `"Router"`. ノード下の表示ラベル。 |
| `type` | string | `"router"`, `"server"`, `"isp"` … (affects icon/logic lines). アイコン/ロジック行に影響。 |
| `target` | boolean | `true` for the **inspected** node (the one whose state is shown in detail). **調査対象**ノードに `true`。 |
| `loopback` | string | Optional loopback IP, e.g. `"3.3.3.3"`. 任意の loopback IP。 |

### `config.networks[]`

| Field | Type | Meaning / 意味 |
|---|---|---|
| `name` | string | Link id, e.g. `"net-r1r2"`. リンク id。 |
| `members[]` | array | `{ node: "r1", host_id: 10 }` — which nodes the link connects + their host octet. このリンクが繋ぐノード + ホスト部。 |

### `config.xray`

| Field | Type | Meaning / 意味 |
|---|---|---|
| `protocol` | string | `"ospf"` \| `"bgp"` \| `"static"`. Selects which state fields drive the protocol visuals. どのプロトコル可視化を駆動するか。 |
| `pattern` | string | Render pattern: `ospf_linear`, `ospf_triangle`, `bgp_multi`, … 描画パターン。 |
| `ping_mode` | string | Packet-flow direction: `from-r1`, `cylinder-to-left`, `through`, … パケット流の向き。 |
| `holo_fields[]` | array | The status panel rows. Each = `{ label, field, ok, err }`: read `state[field]`, show `ok` (green) if truthy else `err` (red). ステータスパネルの行。`state[field]` を読み、真なら `ok`(緑)/ 偽なら `err`(赤)を表示。 |

> The `id`, `pattern` names, and `ping_mode` names originate from RouteCrushLab's scenario
> set, but the **concepts** (a triangle topology, a from-r1 ping) are generic. You are free
> to define your own `holo_fields` and node/network shapes.
>
> `id`・`pattern` 名・`ping_mode` 名は RouteCrushLab のシナリオ群由来ですが、**概念**(三角
> トポロジ、r1 からの ping 等)は汎用です。`holo_fields` やノード/ネットワークは自由に定義できます。

---

## 4. `state` — router state snapshot / 状態スナップショット

Passed to `applyXrayState(state)`. This is **one frame** of router protocol state — exactly
what you would get from a `show`-command dump at one moment. Provide only the fields your
scenario needs; everything is optional and defaults sensibly.

`applyXrayState(state)` に渡します。これはルータのプロトコル状態の**1フレーム**で、ある瞬間の
`show` コマンドダンプに相当します。シナリオに必要なフィールドだけ渡せばよく、すべて任意で
妥当な既定値を持ちます。

### 4.1 L0 — Interfaces / インターフェース

| Field | Type | Meaning / 意味 |
|---|---|---|
| `interfaces` | object | `{ "eth0": { up: true, ip: "10.202.0.20/24" }, … }`. Per-interface link state + address. IF ごとのリンク状態 + アドレス。 |
| `wan_iface` | string | Name of the uplink/WAN interface. 上流(WAN)IF 名。 |
| `lan_iface` | string | Name of the downlink/LAN interface. 下流(LAN)IF 名。 |
| `sv_link_up` | boolean | Source/server-side link up (for server-origin pings). 送信元(サーバ)側リンクの up。 |

### 4.2 L4 — Route resolution / 経路解決

| Field | Type | Meaning / 意味 |
|---|---|---|
| `route_resolution` | object | The forwarding decision (see below). 転送判断(下表)。 |
| `ping_ok` | boolean | End-to-end reachability succeeded. エンド間到達成功。 |
| `r1_ping_ok` | boolean | Reachability from the origin node itself (next-hop reachability). 起点ノード自身からの到達性(next-hop 到達)。 |

`route_resolution` (often `rr`):

| Field | Type | Meaning / 意味 |
|---|---|---|
| `target` | string | Destination being resolved, e.g. `"3.3.3.3"`. 解決対象の宛先。 |
| `resolved` | boolean | A route exists. 経路が存在するか。 |
| `out_iface` | string | Outgoing interface for that route. その経路の出力 IF。 |
| `next_hop` | string | Next-hop IP. ネクストホップ IP。 |
| `matched_prefix` | string | The matched route prefix, e.g. `"3.3.3.3/32"`. マッチした経路プレフィックス。 |
| `protocol` | string | `"ospf"` \| `"bgp"` \| `"static"` \| `"connected"`. 経路の由来プロトコル。 |

### 4.3 OSPF

| Field | Type | Meaning / 意味 |
|---|---|---|
| `neighbor_state` | string | Adjacency FSM state: `Full` / `2-Way` / `Init` / `ExStart` / `Exchange` / `Loading` / `None`. 隣接 FSM 状態。 |
| `has_full` | boolean | Has at least one Full adjacency. Full 隣接が1つ以上ある。 |
| `full_count` | number | Number of Full neighbors. Full ネイバー数。 |
| `ospf_active_on_interface` | boolean | OSPF is enabled & sending Hellos on the interface. IF 上で OSPF 有効・Hello 送信中。 |
| `peer_sending_hello` | boolean | The peer's Hello is being received. 対向の Hello を受信している。 |
| `target_hello` / `r1_hello` / `r2_hello` | number | Hello timer (seconds) per node. ノード別 Hello タイマ(秒)。 |
| `timer_match` | boolean | Hello/Dead timers match between peers. 両端でタイマ一致。 |
| `target_area` / `r1_area` / `r2_area` | string | OSPF area id, e.g. `"0.0.0.0"`. OSPF エリア id。 |
| `area_match` | boolean | Areas match between peers. 両端でエリア一致。 |
| `target_rid` / `r1_rid` / `r2_rid` | string | OSPF Router ID per node. ノード別 Router ID。 |
| `rid_duplicate` | boolean | Duplicate Router ID detected. Router ID 重複を検出。 |
| `dr_rid` / `bdr_rid` | string | DR / BDR Router ID (broadcast networks). DR / BDR の Router ID(broadcast)。 |
| `is_passive` | boolean | Interface is `passive-interface` (no Hellos). IF が passive(Hello 送らない)。 |
| `has_redistribute` | boolean | Redistribution is configured. 再配布が設定されている。 |
| `route_map_status` | string | Route-map result: `"permit"` / `"deny"`. ルートマップ結果。 |

> **Multi-node form / 多ノード版** — for topologies with several peers (e.g. a triangle),
> use per-node fields named `<nodeId>_<field>`: `r3_has_full`, `r2_hello`, `r3_established`, …
> 複数ピア(三角等)では `<nodeId>_<field>` 形式のノード別フィールドを使います。

### 4.4 BGP

| Field | Type | Meaning / 意味 |
|---|---|---|
| `is_established` | boolean | BGP session is Established. BGP セッション確立。 |
| `bgp_state` | string | Session state string: `Established` / `Idle` / `Active` / `Connect` / … セッション状態文字列。 |
| `<nodeId>_established` | boolean | Per-peer session state, e.g. `r2_established`. ピア別セッション状態。 |
| `bgp_next_hop` | string | BGP next-hop IP. BGP ネクストホップ。 |
| `config_next_hop` | string | Configured (static) next-hop. 設定上の(静的)ネクストホップ。 |
| `has_next_hop_self` | boolean | `next-hop-self` is configured. `next-hop-self` 設定済み。 |
| `has_update_source` | boolean | `update-source` is configured. `update-source` 設定済み。 |
| `r2_lp` / `r3_lp` | number | LOCAL_PREF per peer. ピア別 LOCAL_PREF。 |
| `best_path_via` | string | Which peer the best path goes through. ベストパスの経由ピア。 |
| `pfx_rcvd` | number | Prefixes received. 受信プレフィックス数。 |
| `max_prefix_limit` | number | `maximum-prefix` limit. maximum-prefix 上限。 |
| `prefix_list_deny` | boolean | A prefix-list is denying the route. prefix-list で拒否されている。 |
| `neighbor_ip` | string | Peer IP address. ピア IP アドレス。 |

### 4.5 Static routes / 静的経路

| Field | Type | Meaning / 意味 |
|---|---|---|
| `has_static` | boolean | A static route is present. 静的経路がある。 |
| `static_is_best` | boolean | The static route is the selected best path. 静的経路がベストとして選択されている。 |
| `static_nh_valid` | boolean | The static next-hop is reachable. 静的ネクストホップが到達可能。 |

### 4.6 Meta / メタ

| Field | Type | Meaning / 意味 |
|---|---|---|
| `target_on_path` | boolean | Whether the inspected node sits on the active forwarding path. `false` dims its packet/ping animation ("bystander"). 調査対象が能動経路上にいるか。`false` で packet/ping 演出を抑制(傍観者)。 |
| `cleared` | boolean | The scenario is in its "solved/healthy" final state. シナリオが「解決済み/正常」最終状態。 |

---

## 5. Seams — injecting live data / ライブデータの注入

**EN** — Two pieces the engine would normally pull from a backend are *injected* by you. In
standalone use, inject static values; with a backend, inject fetchers. Both have no-op
fallbacks, so the engine still renders if you omit them.

**JA** — エンジンが通常バックエンドから取る2点を、あなたが*注入*します。standalone では静的値、
バックエンドありなら fetcher を注入。両方とも no-op フォールバックがあるので、省略しても描画は動きます。

### Seam A — topology / トポロジ

```js
window._xrayTopologyData = {
  subnets: { "net-r1r2": "10.202.0.0/24", "net-r2r3": "10.203.0.0/24", … },
  nodes:   { "r1": [ { name:"eth0", ip:"…", prefix:24, state:"UP" }, … ], … }
};
// optional fallback hook the engine calls if the above is unset:
window._xrayEnsureTopology = function () { /* set window._xrayTopologyData */ };
```

Drives per-link UP/DOWN colouring and subnet labels.
リンクごとの UP/DOWN 色とサブネットラベルを駆動します。

### Seam B — traceroute / トレースルート

```js
window._xrayTraceFetcher = function (id) {
  return Promise.resolve({ success: true, reached: true, hops: ["r2", "r3"] });
};
```

Drives the path arrows: `reached:false` → no arrow (no path); `hops.length<=1` → direct;
`hops.length>1` → multi-hop / detour.
経路矢印を駆動します:`reached:false` → 矢印なし(経路なし)/ `hops` 1要素 → 直結 /
2要素以上 → 多ホップ(迂回)。

**Live ping/packet animation (optional) / ping・パケット演出(任意)**

**EN** — The same `trace` plus `ping_ok` (§4) and `ping_mode` (§3) also drive a **live packet
("ping orb") animation** — a moving dot that shows traffic flowing along the path and through the
inspected router's cylinder in DeepDive. This is **traffic-specific** (it depends on *which* flow
you trace), separate from the always-meaningful protocol state (OSPF/BGP adjacency, LSDB, beams).
So it's **opt-in**: feed `trace` + `ping_ok` and it animates; omit them (or hide
`.de-ping-orb`/`.de-packet`/`.xray-packet-orb` in CSS) to keep a purely state-focused view. The
demos in this repo hide it on purpose to focus on protocol state; the engine fully supports it.

**JA** — 同じ `trace` に `ping_ok`(§4)と `ping_mode`(§3)を合わせると、**ping オーブ(動く
パケット)演出**が駆動します — 経路上、および DeepDive では調査対象ルータの円柱内を流れる
パケットを表示します。これは**「どの通信を trace したか」に依存する traffic 固有の演出**で、
常に意味を持つプロトコル状態(OSPF/BGP 隣接・LSDB・ビーム)とは別物です。よって**任意**:
`trace`+`ping_ok` を渡せば動き、渡さない(または CSS で `.de-ping-orb`/`.de-packet`/
`.xray-packet-orb` を非表示にする)と状態のみのビューになります。本リポジトリのデモは
プロトコル状態に集中するため意図的に非表示にしていますが、エンジンは完全に対応しています。

### Seam C — BGP table / BGP テーブル (facade method)

```js
// rows array, or a function(state) -> rows so it can reflect the current snapshot:
view.setBgpTable(function (state) {
  return state && state.is_established
    ? [{ prefix: "203.0.113.0/24", nexthop: "10.0.12.1", status: "*>" }]
    : [];   // empty until the session is up
});
```

**EN** — The DeepDive "BGP Table" box (the control-plane RIB shown to the right of the cylinder)
is server-fed in RouteCrushLab, so it is exposed here as a **facade method** rather than an engine
global. Supply `{ prefix, nexthop, status }` rows (or a `function(state)` for snapshot-reactive
content); the facade injects/repaints the box using the engine's built-in styling. Omit it for
OSPF/static demos.

**JA** — DeepDive の「BGP Table」ボックス(円柱の右に出る制御プレーンの RIB)は RouteCrushLab では
サーバ供給のため、ここでは engine グローバルではなく**ファサードのメソッド**として開いています。
`{ prefix, nexthop, status }` の配列(またはスナップショット連動の `function(state)`)を渡すと、
ファサードが engine 既存スタイルで箱を注入・再描画します。OSPF/static のデモでは不要です。

---

## 6. Bring your own data / 自分のデータで使う

**EN** — Every field above is a standard protocol concept, so the engine is **vendor-neutral**.
RouteCrushLab feeds it FRRouting output, but you can feed it **any** router OS by writing a
small adapter that maps that OS's `show` output into the shapes in §3–§4. The engine never
sees, and never cares, where the data came from.

**JA** — 上記のフィールドはすべて標準的なプロトコル概念なので、エンジンは**ベンダー非依存**です。
RouteCrushLab は FRRouting の出力を渡していますが、その OS の `show` 出力を §3–§4 の形に変換する
小さな adapter を書けば、**どの**ルータ OS でも渡せます。エンジンはデータの出どころを見ないし、
気にしません。

**Where each field comes from / 各フィールドの出どころ**

| Engine field | FRRouting | Cisco IOS |
|---|---|---|
| `interfaces[].up`, `.ip` | `show interface brief` | `show ip interface brief` |
| `route_resolution.*` | `show ip route <dst>` | `show ip route <dst>` |
| `neighbor_state`, `has_full`, `full_count` | `show ip ospf neighbor` | `show ip ospf neighbor` |
| `*_hello`, `*_area`, `is_passive` | `show ip ospf interface` | `show ip ospf interface` |
| `*_rid`, `rid_duplicate` | `show ip ospf` | `show ip ospf` |
| `dr_rid`, `bdr_rid` | `show ip ospf neighbor` | `show ip ospf neighbor` |
| `is_established`, `bgp_state`, `pfx_rcvd` | `show bgp summary` | `show ip bgp summary` |
| `bgp_next_hop`, `best_path_via` | `show bgp <prefix>` | `show ip bgp <prefix>` |
| `has_next_hop_self`, `has_update_source`, `max_prefix_limit`, `route_map_status` | `show running-config` | `show running-config` |
| `has_static`, `static_is_best`, `static_nh_valid` | `show ip route static` | `show ip route static` |

**Steps / 手順**

1. **EN** Fork this folder (`xray-core.js` + `index.html` + `data.js`).
   **JA** このフォルダ(`xray-core.js` + `index.html` + `data.js`)を fork。
2. **EN** Replace `data.js`: define your `DEMO_CONFIG` (§3) and your scene snapshots
   (`{ topo, trace, state }`, §4–§5). `data.js` is the worked reference example.
   **JA** `data.js` を差し替え:`DEMO_CONFIG`(§3)と各シーンのスナップショット
   (`{ topo, trace, state }`、§4–§5)を定義。`data.js` が動く参照実装です。
3. **EN** Either hand-write the snapshots, or write an adapter that parses your router's
   `show` output into them (the table above is the mapping).
   **JA** スナップショットを手書きするか、ルータの `show` 出力をそれに変換する adapter を書く
   (上の表が対応関係)。
4. **EN** Open `index.html`. No build, no server.
   **JA** `index.html` を開く。ビルド不要・サーバ不要。

---

## 7. Limitations / 制約

- **EN** This is a **renderer**, not a simulator. It draws the state you give it; it does
  not compute routing. — **JA** これは**レンダラ**でありシミュレータではありません。渡された
  状態を描くだけで、ルーティング計算はしません。
- **EN** It renders **snapshots**. Animation between snapshots is cosmetic, not a live feed.
  — **JA** **スナップショット**を描きます。スナップ間のアニメは演出で、ライブフィードでは
  ありません。
- **EN** The engine attaches `window.xray*` globals and expects specific DOM ids/classes
  (§2). It is a browser script, not an ES module. — **JA** エンジンは `window.xray*` の
  グローバルを生やし、特定の DOM id/class(§2)を前提とします。ES モジュールではなく
  ブラウザ script です。
- **EN** This OSS copy is a **comment-free distribution build**; the fully-commented source
  lives inside RouteCrushLab. — **JA** この OSS コピーは**コメント無しの配布ビルド**で、
  フルコメント版ソースは RouteCrushLab 内にあります。
- **EN** Issues are read but carry no SLA, and **pull requests are not accepted** (single
  copyright holder, for relicensing). Forking is welcome under the MIT license.
  — **JA** Issue は読みますが SLA なし、**PR は受け付けません**(再ライセンスのため単一著作権者)。
  MIT のもとで fork は歓迎します。
