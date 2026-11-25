# どの見せ方でも、絵の意味は同じ

*[English](../showing.md) | 日本語*

network-xray は同じ状態をいくつかの形で見せます: DeepDive (頁の上でルータ 1 台の中)・単ノードパネル (`xray-node-panel.js` の 2D の絵と表)・
`scripts/xray-render.js` が作る静的な頁・CLI と MCP の道具の文字の答え。skin は見た目 (色・暗い地か明るい地か・ルータを円柱か箱で描くか)
を変えますが、言っていることは変えません。どの見せ方も次の決まりを守ります。

| 意味 | 絵では | 文字の答えでは |
|---|---|---|
| ルータが選んだ経路 | `*>` の行を勝ちの色で。矢印がルータからその経路の出口 IF へ出る | `selected` (why_path)・`best: true` |
| 選んだ段 | その列を枠で囲む・`best path by <段> (<値> > <値>)`・その前の段は同じ (`=`)、決めた段に ✅ | `deciding_step`・`steps[]` (`tie` / `win`)・1 行の `summary` |
| ルータがわけを言った | `best path by <わけ> (FRR)` / `(reported by FRR)`。IOS-XE は `derived` (collector が割り出した) | `reason_source`: `device` / `derived` / `comparison` |
| データにわけが無い | 「表に出ない段」とその先の段を書く・どの段かは言い切らない | `deciding_step: null` と `note` |
| 隣接・セッションが上がっている | 灰色の線の上にプロトコルのトンネル: 緑 = OSPF Full・紫 = BGP Established | 状態の語 (`Full`・`Established`) |
| 上がっていない | 灰色の線だけ (円柱の絵では点線)。**What's wrong** にルータ自身の状態の語で | ルータが出したままの状態の語 (`Active`・`Idle (Admin)`・`ExStart` …) |
| 何かがおかしい | **What's wrong** に先に並べる・両端で揃うべき値は両方を | `wrong[]` (lab_state)・`mismatch` (ospf_interfaces) |
| 集めたデータに無い | `?` — down やおかしいとは見せない | `null` と note |
| 控えた状態から変わった | **Changed since the baseline** (頁)・**What changed on \<router\>** (render の `--before`) | `changes[]` (diff / state_diff) |

決まりの元:

1. **勝ちはルータが決めたもの。** network-xray は経路を選びません。ルータが best とした物に印を付け、データの属性からわけを説明します。
2. **推し量らない。** 決めた段がデータに無い時は、どの見せ方も段を言い切らずにそう書きます。
3. **色だけに頼らない。** 色の印にはどれも語か印 (`*>`・✅・`=`・点線・状態の語) が付く = 明るい地・印刷・色の見え方が違う人にも同じ答え。
4. **どこでも同じ語。** 段の名 (Weight・LocPrf・AS-Path・Origin・MED・eBGP > iBGP) とルータの状態の語は絵と文字で同じ。ルータ自身の語は出したままに。
