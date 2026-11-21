# HandsOn Pack: 問題の形 (problem.json, network-xray-lab/0)

*[English](../problem-format.md) | 日本語*

**HandsOn Pack** は、network-xray で解く問題として配る containerlab のラボです。中身は、ラボのトポロジーと設定、その隣に置く `problem.json` です。HandsOn Pack は形で、プログラムではありません (network-xray のほかに入れる物はありません)。この頁では、その形を説明します。ラボの壊れた状態と直した状態から `check` を書くには、[SolvedKit](solvedkit.md) を見てください。

`*.clab.yml` の隣に `problem.json` を置くと、network-xray は図の上に問題を出します。ラボが直ると **✓ Solved** の印も出します。`problem.json` の無いラボは、前とまったく同じに見えます。

`xray.sh` を使わない時は、`containerlab graph --static-dir` に渡すフォルダにも `problem.json` を置いてください。頁は問題の帯をそこから読みます (`xray.sh` ならリンクを張ってくれます)。`check` は、`*.clab.yml` の隣にある方から読みます。

[`examples/`](../../examples) にある公式の例は、どれもこの形です。自分の containerlab のラボにも使えます。

## 欄

| Field | 必須 | 意味 |
|---|---|---|
| `format` | 要る | 必ず `"network-xray-lab/0"` にします。`format` があっても値が違う時は、`check` を判定しません。 |
| `id` | 省ける | 問題の変わらない id です。例 `"yourname/yourrepo/bgp-filter-1"`。 |
| `version`, `author`, `license` | 省ける | 自由な文です。 |
| `q_number` | 省ける | 題の前に出す短いバッジです。例 `"Q21"`。 |
| `title_en`, `title_ja` | 省ける | 問題の題です。片方の言葉が無い時は、もう片方で出ます。 |
| `problem_en`, `problem_ja` | 省ける | 問題の文です。使えるタグは `<br>`・`<code>`・`<strong>`・`<span>` です。`<code>` の中の文は目立つように出て、クリックするとクリップボードに写ります。IP アドレス・プレフィックス・命令に使ってください。 |
| `focus` | 省ける | `{"node": "r1", "prefix": "8.8.8.0/24"}` — `node` は、最初に DeepDive を開くルータです。`prefix` は、開いた**どの**ルータの Routing table でも自動で選ばれます (その行が出た時に 1 回だけです。ほかの行を選んでいる間は選びません)。ただし、その行がルータ自身の宛先の時は選びません。つまり、connected / local の経路、`lo` から出る経路、出ていく interface の無い経路です。 |
| `check` | 省ける | ラボを解けたとする時です (下で説明します)。`check` が無ければ、✓ Solved の印は出ません。 |
| `check_note_en`, `check_note_ja` | 省ける | 人のための注です (例 "Also try: ping 8.8.8.8 from r1")。頁はこれを使いません。 |
| `solved_text_en`, `solved_text_ja` | 省ける | **ラボが解けている間だけ**、問題の下に出る短い文です (`solved_cta` の前に出ます)。たとえば、その直し方がなぜ効くかを書きます。使えるタグは問題の文と同じです。片方の言葉が無い時は、もう片方で出ます。これがあれば、自分のサイトを持たずに配った問題でも、答えを説明できます。 |
| `solved_cta` | 省ける | `{"label_en": "…", "label_ja": "…", "url_en": "https://…", "url_ja": "https://…"}` — **ラボが解けている間だけ**、問題の下に出るリンクです (1 つだけ)。たとえば、同じ問題を一歩ずつ解く説明へのリンクです。label はただの文で、角かっこ (`[square brackets]`) の中の部分がリンクになります (かっこが無ければ、label 全体がリンクになります)。リンクは `http(s)` だけです。片方の言葉が無い時は、もう片方で出ます。 |

ファイルに題か問題の文があれば、問題の帯が出ます。

## `check`

```json
"check": {
  "all": [
    ["r1", "routing_table", "some", [["prefix", "eq", "3.3.3.3/32"], ["selected", "eq", true], ["out_iface", "eq", "eth2"], ["protocol", "eq", "ospf"]]]
  ]
}
```

- `check.all` は条件の並びです。条件が**全部**成り立つ時、ラボは解けたことになります。(format 0 で書けるのは `all` の形だけです。)
- 条件は 1 つずつ `[node, path, op, value]` の形です:
  - **node** — トポロジーにあるノードの名前です (`r1`)。条件は、そのノードの今の状態を読みます。この状態は `clab-xray-collect.js` が集めた物です。そのノードの状態がまだ無ければ、条件は成り立ちません。
  - **path** — ノードの状態の中を指す、点でつないだ path です。例 `interfaces.eth1.up`。`{key}` は、そのノード自身の値に置き換わります。例 `interfaces.{wan_iface}.up`。
  - **op** と **value** — 下にある 12 の op のどれかです。
- 頁は、更新のたびに (約 1 秒に 1 回) 状態を確かめます。collector が `--watch` で動いている間は (`xray.sh` はそうします)、**✓ Solved は、check が約 10 秒切れずに成り立ってから出ます**。なので、まだ落ち着く途中のラボで Solved がちらつくことはありません。check が成り立たなくなると、すぐにまた消えます。1 回だけの collect (`--watch` 無し) では頁がひとりでに更新しないので、1 回成り立てば足ります。
- 壊れた条件 (形が違う・知らない op) でも、例外を投げることはありません。その条件がただ成り立たないだけで、ブラウザのコンソールに警告が 1 つ出ます。

### op

| op | value | 成り立つ時 |
|---|---|---|
| `eq` / `ne` | 何でも | 値が等しい / 等しくない (同じ型の時) |
| `gt` `ge` `lt` `le` | 数 | 数として比べる (数だけ) |
| `in` | 並び | 値が、並びのどれかと等しい |
| `exists` / `absent` | (無し) | 値がある / 無い (null は無いとみなす) |
| `some` | `[path, op, value]` の並び | path が並びで、その要素の**少なくとも 1 つ**が、要素の条件を全部満たす |
| `none` | `[path, op, value]` の並び | 条件を満たす要素が**1 つも無い** (空の並びや、並びが無い時は成り立つ) |
| `count_ge` | `[N, list of [path, op, value]]` | 条件を満たす要素が N 個以上ある |

`some` / `none` / `count_ge` の中では、path は並びの要素 1 つの中を指します (node は書きません)。`{key}` は、その要素の値に置き換わります。

### 見られる物

collector は、ノードごとに状態のオブジェクトを 1 つ書きます。check にいちばん役に立つ欄は次のとおりです:

| path | 形 |
|---|---|
| `routing_table` | `{prefix, protocol, out_iface, next_hop, selected}` の並びです。`show ip route` と同じく、選ばれていない経路も入ります。入っている経路で次の段が 2 つ以上ある物 (ECMP) には、`nexthops: [{ip, iface}, …]` も付きます。`out_iface` / `next_hop` は、そのうちの最初の物です |
| `interfaces` | オブジェクト `{eth1: {up, ip}, …}` です |
| `route_resolution` | オブジェクト `{target, resolved, protocol, out_iface, next_hop, matched_prefix}` です。ノードが ping の宛先にどう届くかを示します。`resolved` は「次の段への経路がある」という意味だけです。なので、connected のサブネットの中の誤った次の段でも `true` のままです |
| `ospf_neighbors` | `{router_id, address, state, role, iface, full}` の並びです |
| `bgp_neighbors` | `{ip, remote_as, ibgp, state, up_down, pfx_rcvd}` の並びです。`vrf` (VRF の名前) は、default VRF の外のセッションにだけ付きます |
| `bgp_routes` | `{prefix, next_hop, as_path, best, weight, metric, origin}` の並びです。`prefix` はマスク無しで (`"8.8.8.0"`)、長さは `prefixlen` に入ります (`24`。/24 と /25 を見分けるには両方を比べます)。`as_path` は空白で区切った文字列です (`"65002"`)。`status` は `*>` (best)・`*=` (multipath: best と一緒に使う、同じ値の経路 — ECMP)・`* ` のどれかです。ECMP のプレフィックスでは、全部の経路に `multipath: true` が付きます。`vrf` (VRF の名前) は、default VRF の外の経路にだけ付きます。同じプレフィックスが 2 つの VRF にあり得るので、VRF の経路を見る check は `vrf` も比べます |

自分のラボが何を出すかは、collector が書いた `xray-states.js` を開いて、`LIVE_STATES.<node>` を見てください。

## check は設定でなく状態に対して書く

良い check は「**ネットワークが今は動く**」と言います。「**使う人がこの行をそのとおりに打った**」とは言いません。そうすれば、正しい直し方はどれも通ります。

- どのプロトコルやどの命令でそうなったかより、**トラフィックの行き先**を見ます。つまり、経路が `selected` で、正しい interface (`out_iface`) から出る、または正しい `next_hop` を使う、という事です。
  上の例 (公式の例 q11) は、誤った static route を消しても、その distance を上げても成り立ちます。static route の向け先を変えるのは数えません。問題は、OSPF で学んだ経路を求めているからです。
- **故障が消えた証拠を 1 つ**足します。たとえば、今は `full` になった OSPF ネイバーや、今は `Established` になった BGP ネイバーです。
- 問題が「X を変えないで」と言う時は、そういう変更が状態に残す跡を探します。たとえば公式の例 q20 では、r2 で故障を直すと AS path に 65099 が残ります。なので check は、r1 の AS だけの AS path を求めます。
- **connected のサブネットの中**にある、壊れた次の段に気を付けてください (例 `/24` の中の `10.10.0.99`)。そういう経路はまだ選ばれていて、まだ「resolved」に見えます。代わりに、その `next_hop` を本当のネイバーのアドレスと比べます。
- 状態だけで「解けた」を言えない時は (たとえば、違いが設定の 1 行だけで、それが目に見える物を何も変えない時)、`check` を書かないでください。誤った印より、印が無い方が良いのです。

## 頁なしでラボを判定する (SolvedKit)

SolvedKit が初めてなら、一歩ずつの手引きから始めてください: [solvedkit.md](solvedkit.md) (English: [../solvedkit.md](../solvedkit.md))。

`scripts/xray-query.js` は、保存した状態の上で、頁と同じ決まりで `check` を判定します。動いているラボもブラウザも要りません。要るのは Node だけです。problem.json (か、それのあるフォルダ) と、collector が書いた状態 (`xray-states.js`・`state_<node>.json`・それらの入ったフォルダ) を渡します:

```
node scripts/xray-query.js check run    examples/q21-bgp-lp demo/bgp-lp/frameB.json
node scripts/xray-query.js check verify examples/q21-bgp-lp demo/bgp-lp/frameA.json demo/bgp-lp/frameB.json --format table
```

- **`check run <problem.json> <state>`** — この状態で、ラボは解けているか? `status` は `solved`・`not_solved`・`cannot_judge` のどれかです (`cannot_judge` は、`check` が無い時、または check の中のルータが状態に無いか読めない時です。どれかは `reason` が言います)。終わりのコードは 0 / 1 / 2 なので、CI の job や採点の台本で使えます。判定するのは 1 回の読みだけです。頁はさらに、check が成り立ち続けるのを約 10 秒待ちます。それが欲しければ、collect し直して、もう一度流してください。
- **`check verify <problem.json> <broken> <solved>`** — 書いた check は、壊れたラボと解けたラボを見分けるか? 壊れた状態で成り立たず、解けた状態で成り立てば `ok` です。条件ごとに判定が付きます: `tells` (壊れた版で成り立たず、解けた版で成り立つ)、`both` (両方で成り立つ。「予備の経路がまだある」の様に、`tells` の条件と並んでいれば良い)、`wrong` (解けた版で成り立たない。解けたラボに印がいつまでも付かない)、`unknown` (ルータが読めない)。終わりのコードは 0 / 1 / 2 です。ラボを公開する前に、書いた check に流してください。

上の出力 (`--format table`) は、録画した q21 のデモで、Local Preference を直す前と後の物です:

```
Check: ok (broken: not solved, solved: solved)
  BROKEN  SOLVED  VERDICT  CONDITION
  no      yes     tells    r1 bgp_routes some [["prefix","eq","8.8.8.0"],["best","eq",true],["as_p~
  yes     yes     both     r1 bgp_routes some [["prefix","eq","8.8.8.0"],["as_path","eq","65003"]]
```

### check を提案させる

ラボが壊れた時の状態と、直した後の状態を 1 つずつ取っておきます。すると SolvedKit は、直して変わった所から `check` を提案します (変わった所は `xray-query.js diff` と同じです):

```
node scripts/xray-query.js check suggest demo/bgp-lp/frameA.json demo/bgp-lp/frameB.json --focus r1 --format table
node scripts/xray-query.js check init    demo/bgp-lp/frameA.json demo/bgp-lp/frameB.json --out mylab/problem.json
```

```
Suggested check: ok (fails on broken, holds on solved)
  USE  KIND    TELLS  CONDITION
  *    path    yes    r1 bgp_routes some [["prefix","eq","8.8.8.0"],["prefixlen","eq",24],["best",~
  -    path    yes    r1 routing_table some [["prefix","eq","8.8.8.0/24"],["selected","eq",true],[~
  *    backup  no     r1 bgp_routes some [["prefix","eq","8.8.8.0"],["prefixlen","eq",24],["as_pat~
```

- **`check suggest <broken> <solved>`** は、条件に使える変化を 1 つずつ、解けた状態から、この頁の言うやり方で書きます。種類は次のとおりです: **path** (今 interface 経由で選ばれている経路、または BGP の best path)、**evidence** (OSPF の隣接が Full・BGP のセッションが Established・interface が up)、**backup** (古い best path がまだある。それを消したら解けたことにならないように)、**gone** (消えた経路。ほかに 2 つを見分ける物が無い時だけ使う)。候補はどれも、両方の状態で判定します。提案の `check` (`*`) は、最初の path・同じルータの evidence・BGP の best path の backup でできていて、壊れた版で成り立たず、解けた版で成り立つことを確かめてあります。終わりのコードは 0 です。使える条件のどれでも 2 つの状態を見分けられない時は 1 です (わけは `reason` と `skipped` が言います)。`--focus <node>` / `--prefix <p>` で、ルータと宛先から始めます。`--max <n>` で check の数の上限を決めます (既定は 3)。
- **`check init <broken> <solved>`** は、problem.json の下書きを作ります。下書きには、その check と `focus`、そして空の `title_*`・`problem_*`・`id` (自分で書く所) が入ります。`--out <file>` で、ファイルに書きます (フォルダが無ければ作ります)。既にあるファイルは決して上書きしません。
- ほかの解き方は推し量りません。直したことで経路の学び方が変わった時、それを名指す条件 (`protocol`) は、`binds_method` の印が付いた別の候補になり、提案の check には入りません。入れると、同じ経路に別のやり方で届く直し方が数えられなくなるからです。問題がそのやり方を求める時だけ足してください (公式の例 q11 はそうです)。そういう条件だけ、または消えた経路だけが 2 つの状態を見分ける時は、それを使い、`warnings` がそう言います。設定した値 (OSPF のタイマー・area) は条件になりません。条件になるのは、その値がもたらす隣接です。
- 状態に出ない変化は提案できません (ping の結果・router ID・maximum-prefix の値・リンクが落ちて初めて分かる fail-over)。collector が読めないルータも同じです。

MCP のツール `check_run`・`check_verify`・`check_suggest`・`check_init` も同じ答えを返します ([mcp.md](mcp.md))。解けた状態 1 つでは、正しい直し方を全部は見せられません。`verify` と `suggest` が言うのは「check がこの 2 つの状態を見分ける」という事で、「ほかのどの解き方も受け入れる」という事ではありません。check は、ネットワークがすることに置いてください (上を見てください)。

## 例 (公式の例 q21-bgp-lp)

```json
{
  "format": "network-xray-lab/0",
  "id": "rclab-dev/network-xray/q21-bgp-lp",
  "title_en": "Problem 21 — \"Two ISPs, yet everything takes the slow one\"",
  "focus": {"node": "r1", "prefix": "8.8.8.0/24"},
  "check": {
    "all": [
      ["r1", "bgp_routes", "some", [["prefix", "eq", "8.8.8.0"], ["best", "eq", true], ["as_path", "eq", "65002"]]],
      ["r1", "bgp_routes", "some", [["prefix", "eq", "8.8.8.0"], ["as_path", "eq", "65003"]]]
    ]
  },
  "check_note_en": "Also try: shut down r1's eth1 and confirm the path via r3 takes over."
}
```

1 つ目の条件は、速い ISP (AS 65002) 経由の経路が今は best だ、と言います。2 つ目は、遅い ISP (AS 65003) 経由の経路が予備としてまだ残っている、と言います。r2 からの LOCAL_PREF を上げても、r3 からの LOCAL_PREF を下げても、weight を使っても、この check を満たします。
