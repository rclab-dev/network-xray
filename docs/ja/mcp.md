[English](../mcp.md)

# MCP サーバ: AI アシスタントにラボのことを聞く

`scripts/xray-mcp.js` は小さな [Model Context Protocol](https://modelcontextprotocol.io) のサーバです。MCP の
クライアント (Claude Code・Claude Desktop・そのほか stdio のサーバを起動できるクライアント) から、rclab-dev/network-xray にラボの
ことを聞けます。どのルータが動いているか、OSPF と BGP のネイバーは何か、ルータがどの BGP の経路をなぜ選んだか、
あるアドレスにどの経路を使うか、などです。

**読むだけ**です。collector が既に書いた state のファイルから答えます。ルータにログインせず、コマンドを打たず、
ファイルを書かず、ネットワークのソケットも開きません (例外は使う時だけ: `--allow-collect` を付けた時の `collect` は collector を 1 回走らせます。[ラボを読み直す](#ラボを読み直す-collect-使う時だけ))。`scripts/xray-query.js` と同じ関数を使うので、答えも同じです。

## state はどこから来るか

どのツールも引数 `path` を取ります。`path` には次のどれでも渡せます:

| `path` | 書く物 |
|---|---|
| `state_<node>.json` のファイル | `frr-collect.js` / `clab-collect.js` (`--out`)、および `test/fixtures/<lab>/` の fixture |
| `state_<node>.json` のファイルが入ったディレクトリ | 同じ物。ノードごとに 1 ファイル (例: `test/fixtures/iosxe-q15`) |
| `xray-states.js` のファイル、またはそれが入ったディレクトリ | `clab-xray-collect.js <topo.clab.yml> <out-dir>` |
| 保存した FRR の `show … json` のファイルが入ったディレクトリ (ノード = ディレクトリ名)、またはそういうノードのディレクトリが入ったディレクトリ | `frr-collect.js --from-dir` の置き方 (例: `fixtures/frr-collect-sample/r1`) |

先に collect してから、その出力をツールに渡します。サーバは呼ばれるたびにファイルを読み直すので、collector を
もう一度動かせば、次の答えは新しい state を使います。相対の `path` はサーバの作業ディレクトリから解決されます。
作業ディレクトリはクライアントが決め、リポジトリではないことが多いので、絶対パスを使ってください。

**`xray.sh` で動いているラボ:** `xray.sh` は collector の出力先をリポジトリのフォルダにするので、生きた state は
`/path/to/network-xray/xray-states.js` です。collector はルータの状態が変わった時にこのファイルを書き直します。ラボが動いている間、
このファイル (またはリポジトリのフォルダ) を `path` に渡します。呼ぶたびに最新の状態を読みます。`xray.sh` を止めた後も、ファイルには最後の状態が残ります。

**自分で graph を動かす containerlab のラボ** (README の「Labs started another way」): `clab-xray-collect.js … --watch` は
渡したフォルダに `xray-states.js` を書きます。そのフォルダを `path` に渡します。同じように最新の状態を読みます。

**`docker run` か netlab のツール:** state はコンテナの中です。画面がそれを配っているので、写しを保存して、そのファイルを
`path` に渡します (ポートは画面のポート):

```
mkdir -p ~/nx-state && curl -s http://localhost:8600/static/xray-states.js -o ~/nx-state/xray-states.js
```

これはその時の写しです。今の状態にするには `curl` をもう一度動かします。

## ラボを読み直す: collect (使う時だけ) <!-- nx_mcp_collect -->

`--allow-collect` を付けて起動すると、ツールが 1 つ増えます (`collect`)。AI アシスタントがルータの設定を変えた後、
MCP のツールだけで新しい状態を見られます (変える → `collect` → `why_path`)。旗が無い時は一覧に出ず、呼んでも断ります。

```
claude mcp add network-xray -- node /path/to/network-xray/scripts/xray-mcp.js --allow-collect
```

- `collect` が受けるのは `topology` (動いているラボの `*.clab.yml`・絶対パス) と、任意の `proto` (既定の `bgp` = OSPF も読む /
  OSPF だけのラボは `ospf`) だけ。そのラボに `clab-xray-collect.js` を 1 回走らせます。
- このツールは手元の Docker を読みます: 画面の collector と同じ読むだけのコマンド (`docker exec … vtysh` / `sr_cli` の
  `show`・Cisco IOS は SSH の `show`)。ルータは何も変わりませんが、collector と同じ権限 (Docker・IOS は `NX_IOS_PASSWORD`) が要ります。
- `xray-states.js` は自分のディレクトリ (サーバが終わると消す) に書き、repo には書きません。`xray.sh` の画面の状態はそのままです。
  答えは `lab_state` と同じ形 + `path` (そのファイル)。ほかのツールにはその `path` を渡してください。
- 同時に 1 本 (走っている間の 2 本目は断る)・最大 120 秒。

## 起動する

```
node scripts/xray-mcp.js
```

サーバに要るのは Node.js 18 以降だけです (npm install は不要)。stdin/stdout で JSON-RPC 2.0 を話し、1 行に 1 つの
メッセージ (MCP の stdio トランスポート) で、ログは stderr に書きます。対応するのは initialize を使う MCP の
リビジョン 2024-11-05 から 2025-11-25 までです。ステートレスな 2026-07-28 のリビジョンは実装していません。手で動かすと
stdin の入力を待ち、stdin が閉じると終わります。普段は MCP クライアントが起動してくれます。

クライアントなしで確かめるには、リポジトリのルートでリクエストをパイプで流し込みます (bash の書き方です。Windows では
Git Bash か WSL で)。ここではサーバをリポジトリで動かすので相対の `path` で動きます。クライアントからは絶対パスにします:

```
printf '%s\n' \
  '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-06-18","capabilities":{},"clientInfo":{"name":"example","version":"0"}}}' \
  '{"jsonrpc":"2.0","method":"notifications/initialized"}' \
  '{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"list_routers","arguments":{"path":"test/fixtures/iosxe-q15"}}}' \
  | node scripts/xray-mcp.js
```

`initialize` への返事:

```json
{"jsonrpc":"2.0","id":1,"result":{"protocolVersion":"2025-06-18","capabilities":{"tools":{"listChanged":false}},"serverInfo":{"name":"network-xray","version":"1"},"instructions":"Read-only questions about a network-xray lab from saved state files. No router is contacted."}}
```

## クライアントの設定

### Claude Code

```
claude mcp add network-xray -- node /path/to/network-xray/scripts/xray-mcp.js
```

これで、今のプロジェクトに自分だけのサーバとして追加されます (既定の `--scope local`)。すべてのプロジェクトで使うには
`--scope user` を使います。`--scope project` を使うと、共有できるようにプロジェクトの `.mcp.json` に書き込みます:

```
claude mcp add --scope project network-xray -- node /path/to/network-xray/scripts/xray-mcp.js
```

書き込まれる内容:

```json
{
  "mcpServers": {
    "network-xray": {
      "type": "stdio",
      "command": "node",
      "args": [
        "/path/to/network-xray/scripts/xray-mcp.js"
      ],
      "env": {}
    }
  }
}
```

その後 `claude mcp list` で `network-xray: node …/scripts/xray-mcp.js - √ Connected` と出るはずです。Windows では
`C:\...\scripts\xray-mcp.js` のパスを渡します。

### そのほかの MCP クライアント (JSON の設定)

stdio のサーバを起動するクライアントの多く (Claude Desktop もその 1 つ) は、次のような `mcpServers` のブロックを取ります。
Claude Desktop では `claude_desktop_config.json` に書きます (Settings → Developer → Edit Config)。ほかのクライアントは
それぞれのファイル名を使います。

```json
{
  "mcpServers": {
    "network-xray": {
      "command": "node",
      "args": ["/path/to/network-xray/scripts/xray-mcp.js"]
    }
  }
}
```

`node` がクライアントの `PATH` に無い時は、`command` に Node.js の実行ファイルのフルパスを書きます。

### 初めて使う時: サーバの承認

クライアントが初めてサーバを使う時、承認を求められることがあります。Claude Code は、プロジェクトの `.mcp.json` の
サーバを起動する前に確認します。承認するまで、`claude mcp get network-xray` は次のように出します:

```
  Status: ⏸ Pending approval (run `claude` to approve)
```

多くのクライアントは、ツールを呼ぶたび、または初めてツールを呼ぶ時にも確認します。既定の 8 つのツールはすべて読むだけと
印が付いており (`readOnlyHint: true`・`destructiveHint: false`)、渡した `path` だけを読みます (選んで使う `collect` の印は `readOnlyHint: false`・`destructiveHint: false`)。network-xray の state を
持たないファイルは `not a network-xray state file` で断り、エラーにファイルの中身は出しません。

## 聞く

クライアントがサーバを知ったら、普通の言葉で、パスを付けて聞きます。例:

- 「/path/to/network-xray/test/fixtures/iosxe-q15 に lab_state を使って。どのリンクが落ちている?」
- 「同じラボで、r1 はなぜ 8.8.8.0/24 にその経路を選ぶの?」
- 「同じラボで、r1 は 8.8.8.8 にどの経路を使う?」

AI がどのラボのことか分からない時は、もう一度パスを付けて聞きます。

## ツール

| ツール | 入力 | 返す物 |
|---|---|---|
| `lab_state` | `path` | ノードとインターフェース・リンク・OSPF の隣接・BGP のセッション・件数 |
| `why_best_path` | `path`, `node`, `prefix`, `vrf?` | そのプレフィックスの BGP の最良経路と、一緒に保存されている理由 |
| `list_routers` | `path` | ルータの名前・state のあるプロトコル・ルーティングテーブルを集めたか・行の数 |
| `ospf_neighbors` | `path`, `router?` | ルータごと: ネイバー ID・アドレス・状態・インターフェース・DR/BDR の役割・相手のノード |
| `ospf_interfaces` | `path`, `router?` | OSPF の interface ごと: MTU・hello / dead・network type・area・cost・役・passive・認証。リンクの向こう側と `mismatches` (合わないと隣接できないのに合っていない値を 1 行ずつ。例 `r1 eth1 MTU 1500 ⇔ r2 eth1 MTU 1400`) |
| `bgp_neighbors` | `path`, `router?` | ルータごと: ピア・リモート AS・iBGP/eBGP・状態・受け取ったプレフィックスの数 |
| `route_lookup` | `path`, `router`, `destination`, `vrf?` | 集めたルーティングテーブルでの最長一致 |
| `why_path` | `path`, `router`, `prefix`, `vrf?` | 選ばれた BGP の経路・ほかの候補と属性・決め手になったステップ・そのわけの出どころ |

`why_best_path` は、データに保存されているわけだけを返します (無ければ `null` と注記)。`why_path` はほかの候補も並べ、
ルータがわけを出していない時は、属性を自分で比べます (`reason_source`)。

引数はすべて文字列です。`?` は省ける引数の印です。うまくいった呼び出しは、同じ JSON のオブジェクトを 2 回返します:
`content[0].text` の文字として、そして `structuredContent` として。例えば、上の `list_routers` の呼び出しへの
返事の全体はこうなります:

```json
{"jsonrpc":"2.0","id":2,"result":{"content":[{"type":"text","text":"{\n  \"routers\": [\n    {\n      \"name\": \"r1\",\n      \"nos\": \"ios-xe\",\n      \"protocols\": [\n        \"ospf\",\n        \"bgp\"\n      ],\n      \"routing_table\": true,\n      \"counts\": {\n        \"ospf_neighbors\": 1,\n        \"bgp_neighbors\": 1,\n        \"bgp_routes\": 1,\n        \"routes\": 4\n      }\n    },\n    {\n      \"name\": \"r2\",\n      \"nos\": \"ios-xe\",\n      \"protocols\": [\n        \"ospf\",\n        \"bgp\"\n      ],\n      \"routing_table\": true,\n      \"counts\": {\n        \"ospf_neighbors\": 1,\n        \"bgp_neighbors\": 2,\n        \"bgp_routes\": 1,\n        \"routes\": 5\n      }\n    },\n    {\n      \"name\": \"r3\",\n      \"nos\": \"ios-xe\",\n      \"protocols\": [\n        \"bgp\"\n      ],\n      \"routing_table\": true,\n      \"counts\": {\n        \"ospf_neighbors\": 0,\n        \"bgp_neighbors\": 1,\n        \"bgp_routes\": 1,\n        \"routes\": 4\n      }\n    }\n  ],\n  \"count\": 3\n}"}],"structuredContent":{"routers":[{"name":"r1","nos":"ios-xe","protocols":["ospf","bgp"],"routing_table":true,"counts":{"ospf_neighbors":1,"bgp_neighbors":1,"bgp_routes":1,"routes":4}},{"name":"r2","nos":"ios-xe","protocols":["ospf","bgp"],"routing_table":true,"counts":{"ospf_neighbors":1,"bgp_neighbors":2,"bgp_routes":1,"routes":5}},{"name":"r3","nos":"ios-xe","protocols":["bgp"],"routing_table":true,"counts":{"ospf_neighbors":0,"bgp_neighbors":1,"bgp_routes":1,"routes":4}}],"count":3}}}
```

下の例は、リクエストの行と、返事の `structuredContent` を示しています。リポジトリのルートでサーバを動かし、
`test/fixtures/iosxe-q15` (3 台の Cisco IOS-XE ルータ: AS 65001 の r1 と r2 の間で OSPF、AS 65002 の r3 が
8.8.8.0/24 を広告) と `test/fixtures/iosxe-ecmp` に対して出した物です。

### lab_state

入力: `path`。

```json
{"jsonrpc":"2.0","id":3,"method":"tools/call","params":{"name":"lab_state","arguments":{"path":"test/fixtures/iosxe-q15"}}}
```

```json
{
  "nodes": [
    { "name": "r1", "nos": "ios-xe", "protocol": "bgp", "interfaces": [
      { "name": "Loopback0", "up": true, "ip": "1.1.1.1/32" },
      { "name": "Ethernet0/1", "up": true, "ip": "10.10.0.10/24" } ] },
    { "name": "r2", "nos": "ios-xe", "protocol": "bgp", "interfaces": [
      { "name": "Loopback0", "up": true, "ip": "2.2.2.2/32" },
      { "name": "Ethernet0/1", "up": true, "ip": "10.10.0.20/24" },
      { "name": "Ethernet0/2", "up": true, "ip": "10.11.0.10/24" } ] },
    { "name": "r3", "nos": "ios-xe", "protocol": "bgp", "interfaces": [
      { "name": "Ethernet0/1", "up": true, "ip": "10.11.0.20/24" },
      { "name": "Loopback0", "up": true, "ip": "8.8.8.8/32" } ] }
  ],
  "links": [
    { "a": "r1", "a_iface": "Ethernet0/1", "b": "r2", "b_iface": "Ethernet0/1", "up": true, "ospf_state": "Full" },
    { "a": "r2", "a_iface": "Ethernet0/2", "b": "r3", "b_iface": "Ethernet0/1", "up": true, "ospf_state": "Down" }
  ],
  "ospf_adjacencies": [
    { "node": "r1", "neighbor_id": "2.2.2.2", "address": "10.10.0.20", "iface": "Ethernet0/1", "state": "Full", "role": "DR", "peer": "r2" },
    { "node": "r2", "neighbor_id": "1.1.1.1", "address": "10.10.0.10", "iface": "Ethernet0/1", "state": "Full", "role": "Backup", "peer": "r1" }
  ],
  "bgp_sessions": [
    { "node": "r1", "peer_ip": "2.2.2.2", "remote_as": 65001, "type": "iBGP", "state": "Established", "established": true, "pfx_rcvd": 1 },
    { "node": "r2", "peer_ip": "1.1.1.1", "remote_as": 65001, "type": "iBGP", "state": "Established", "established": true, "pfx_rcvd": 0 },
    { "node": "r2", "peer_ip": "10.11.0.20", "remote_as": 65002, "type": "eBGP", "state": "Established", "established": true, "pfx_rcvd": 1 },
    { "node": "r3", "peer_ip": "10.11.0.10", "remote_as": 65001, "type": "eBGP", "state": "Established", "established": true, "pfx_rcvd": 0 }
  ],
  "counts": { "nodes": 3, "links": 2, "ospf_full": 2, "ospf_total": 2, "bgp_established": 4, "bgp_total": 4 }
}
```

r2–r3 のリンクが `ospf_state: "Down"` なのは、r3 に向けて OSPF が動いていないからです。このリンクでは eBGP だけが動いています。

### why_best_path

入力: `path`・`node`・`prefix` (合うプレフィックスが 1 つだけならプレフィックス長は省けます)・`vrf` (そのプレフィックスが
複数の VRF にある時だけ必要)。

```json
{"jsonrpc":"2.0","id":4,"method":"tools/call","params":{"name":"why_best_path","arguments":{"path":"test/fixtures/iosxe-q15","node":"r1","prefix":"8.8.8.0/24"}}}
```

```json
{
  "node": "r1",
  "prefix": "8.8.8.0/24",
  "paths": 1,
  "best": { "next_hop": "2.2.2.2", "as_path": "65002", "status": "*>", "local_pref": 100, "weight": 0, "metric": 0, "origin": "IGP", "best": true },
  "reason": "First path received",
  "reason_source": "bgp_routes[].reason (IOS-XE: derived by the collector from the printed columns)",
  "candidates": [
    { "next_hop": "2.2.2.2", "as_path": "65002", "status": "*>", "local_pref": 100, "weight": 0, "metric": 0, "origin": "IGP", "best": true }
  ]
}
```

`reason` はデータに保存されているわけです。FRR 自身の `selectionReason`、または IOS-XE では collector が出力の列から
割り出したわけです。どちらかは `reason_source` で分かります。データにわけが無い時は `reason` が `null` になり、`note` が
データにわけが無いことを示します。サーバがわけを推測することはありません。

### list_routers

入力: `path`。

```json
{"jsonrpc":"2.0","id":5,"method":"tools/call","params":{"name":"list_routers","arguments":{"path":"test/fixtures/iosxe-q15"}}}
```

```json
{
  "routers": [
    { "name": "r1", "nos": "ios-xe", "protocols": ["ospf", "bgp"], "routing_table": true,
      "counts": { "ospf_neighbors": 1, "bgp_neighbors": 1, "bgp_routes": 1, "routes": 4 } },
    { "name": "r2", "nos": "ios-xe", "protocols": ["ospf", "bgp"], "routing_table": true,
      "counts": { "ospf_neighbors": 1, "bgp_neighbors": 2, "bgp_routes": 1, "routes": 5 } },
    { "name": "r3", "nos": "ios-xe", "protocols": ["bgp"], "routing_table": true,
      "counts": { "ospf_neighbors": 0, "bgp_neighbors": 1, "bgp_routes": 1, "routes": 4 } }
  ],
  "count": 3
}
```

`protocols` には、データに OSPF のネイバーか LSDB があれば `ospf`、BGP のネイバーか BGP の経路があれば `bgp` が入ります。

### ospf_neighbors

入力: `path`・`router` (省略可。省くとすべてのルータ)。

```json
{"jsonrpc":"2.0","id":6,"method":"tools/call","params":{"name":"ospf_neighbors","arguments":{"path":"test/fixtures/iosxe-q15","router":"r1"}}}
```

```json
{
  "routers": [
    { "router": "r1", "neighbors": [
      { "neighbor": "2.2.2.2", "address": "10.10.0.20", "state": "Full", "interface": "Ethernet0/1", "role": "DR", "peer": "r2" } ] }
  ],
  "counts": { "total": 1, "full": 1 }
}
```

`role` と `peer` (ネイバーのノード名) は、データにある時だけ出ます。

### bgp_neighbors

入力: `path`・`router` (省略可。省くとすべてのルータ)。

```json
{"jsonrpc":"2.0","id":7,"method":"tools/call","params":{"name":"bgp_neighbors","arguments":{"path":"test/fixtures/iosxe-q15","router":"r2"}}}
```

```json
{
  "routers": [
    { "router": "r2", "peers": [
      { "peer": "1.1.1.1", "remote_as": 65001, "type": "iBGP", "state": "Established", "established": true, "prefixes_received": 0 },
      { "peer": "10.11.0.20", "remote_as": 65002, "type": "eBGP", "state": "Established", "established": true, "prefixes_received": 1 } ] }
  ],
  "counts": { "total": 2, "established": 2 }
}
```

データに数が無い時、`prefixes_received` は `null` です。BGP の無いルータは `"peers": []` で出ます。

### route_lookup

入力: `path`・`router`・`destination` (プレフィックス長の無い IPv4 か IPv6 のアドレス)・`vrf` (省略可。既定は
default VRF)。

```json
{"jsonrpc":"2.0","id":8,"method":"tools/call","params":{"name":"route_lookup","arguments":{"path":"test/fixtures/iosxe-q15","router":"r1","destination":"8.8.8.8"}}}
```

```json
{
  "router": "r1",
  "destination": "8.8.8.8",
  "vrf": "default",
  "route": { "prefix": "8.8.8.0/24", "protocol": "bgp", "next_hop": "2.2.2.2", "out_iface": "Ethernet0/1" },
  "next_hop": "2.2.2.2",
  "out_iface": "Ethernet0/1"
}
```

ECMP では、`route.nexthops` にすべてのネクストホップが入ります (`test/fixtures/iosxe-ecmp`):

```json
{"jsonrpc":"2.0","id":9,"method":"tools/call","params":{"name":"route_lookup","arguments":{"path":"test/fixtures/iosxe-ecmp","router":"r1","destination":"4.4.4.4"}}}
```

```json
{
  "router": "r1",
  "destination": "4.4.4.4",
  "vrf": "default",
  "route": {
    "prefix": "4.4.4.4/32", "protocol": "ospf", "next_hop": "10.13.0.3", "out_iface": "Ethernet0/2",
    "nexthops": [ { "ip": "10.13.0.3", "iface": "Ethernet0/2" }, { "ip": "10.12.0.2", "iface": "Ethernet0/1" } ]
  },
  "next_hop": "10.13.0.3",
  "out_iface": "Ethernet0/2"
}
```

探すのは、collector が保存したルーティングテーブルのうち、実際に入っている行だけです。サーバがルーティングを計算することは
ありません。直結の経路では `next_hop` が `null` です。何も合わない時は `route` が `null` になり、`note` がそう示します。
ルータのルーティングテーブルを集めていない時は、データにルーティングテーブルが無いと `note` が示します。

### why_path

入力: `path`・`router`・`prefix` (`8.8.8.0/24` のようなプレフィックス、またはその中のアドレス。アドレスだけを渡すと、それを含む
最も長い BGP のプレフィックスに合わせます)・`vrf` (そのプレフィックスが複数の VRF にある時だけ必要)。

答えには、選ばれた経路・ほかの `candidates` とその属性・`deciding_step`・`reason_source` が入ります。`reason_source` は、
ルータがわけを報告した時 (FRR の `selectionReason`) は `"device"`、collector がルータの表示から割り出した時 (Cisco IOS-XE は
わけを出さない・`why_best_path` と同じわけ) は `"derived"`、network-xray がデータの属性 (Weight・LocPrf・AS-Path・Origin・MED)
を比べて割り出した時は `"comparison"`、どちらでもない時は `null` で note が付きます。`"device"` と `"derived"` の時は、
属性を比べた結果を `comparison` に添えます (突き合わせ用)。

```json
{"jsonrpc":"2.0","id":11,"method":"tools/call","params":{"name":"why_path","arguments":{"path":"test/fixtures/iosxe-q15","router":"r1","prefix":"8.8.8.0/24"}}}
```

```json
{
  "router": "r1",
  "prefix": "8.8.8.0/24",
  "selected": {
    "next_hop": "2.2.2.2",
    "as_path": "65002",
    "status": "*>",
    "local_pref": 100,
    "weight": 0,
    "metric": 0,
    "origin": "IGP",
    "best": true
  },
  "candidates": [],
  "deciding_step": "First path received",
  "reason_source": "derived",
  "comparison": "Only path"
}
```

## エラー

ツールの呼び出しの入力が悪い時 (ファイルが無い・知らないファイル・知らないルータ・引数が足りない・引数が文字列でない・
destination がアドレスでない) は、返事に `isError: true` が付き、`structuredContent` の代わりに `{"error": "..."}` の
文字が入ります:

```json
{"jsonrpc":"2.0","id":10,"method":"tools/call","params":{"name":"why_best_path","arguments":{"path":"test/fixtures/iosxe-q15","node":"r9","prefix":"8.8.8.0/24"}}}
```

```json
{"jsonrpc":"2.0","id":10,"result":{"content":[{"type":"text","text":"{\n  \"error\": \"unknown node: r9 (known: r1, r2, r3)\"\n}"}],"isError":true}}
```

プロトコルの問題は JSON-RPC のエラーで返します。知らないツールは `-32602`、知らないメソッドは `-32601`、JSON で
ない行は `-32700`、形の崩れたリクエストは `-32600` を返します。

## 関連

- `scripts/xray-query.js`: 同じ質問をコマンドラインから (`state` と `why`)。
- `test/xray-mcp.test.js`: サーバを起動して、ここの返事を確かめるテスト。
