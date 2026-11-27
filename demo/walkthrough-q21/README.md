# Walkthrough example: Q21 (BGP LocalPref) / Walkthrough の例: Q21 (BGP LocalPref)

**EN** — A [Walkthrough](../../WALKTHROUGH-CONTRACT.md) of one BGP lab in four scenes: the slow ISP wins, the fix
(LocPref 150), the fast link goes down, it comes back. The states are the four frames recorded from
`examples/q21-bgp-lp` (`../bgp-lp/frame{A..D}.json`, with the steps in `../capture/q21-bgp-lp.steps.json`).

**JA** — BGP のラボ 1 つを 4 つの段で見せる [Walkthrough](../../WALKTHROUGH-CONTRACT.md) の例です: 遅い ISP が勝つ・
直す (LocPref 150)・速い方の線が落ちる・戻る。状態は `examples/q21-bgp-lp` から記録した 4 つの frame
(`../bgp-lp/frame{A..D}.json`、手順は `../capture/q21-bgp-lp.steps.json`)。

| file | what / 何 |
|---|---|
| `walkthrough.json` | the Walkthrough, English / 英語 |
| `walkthrough.ja.json` | the same, Japanese / 日本語 |

The HTML page is not kept in git: make it, then open it (from the repo root). / HTML の頁は git に入れていません。作って
から開きます (repo の根で):

```sh
node scripts/xray-walkthrough.js demo/walkthrough-q21/walkthrough.json --out q21.html          # English
node scripts/xray-walkthrough.js demo/walkthrough-q21/walkthrough.ja.json --out q21.ja.html    # 日本語
```

Open `q21.html` in a browser (double-click is fine: it loads nothing from outside and works offline). Click a scene on the
left, or use Back / Next / Play (keys ← / → / Space). / `q21.html` をブラウザで開きます (ダブルクリックで良い・外から何も
読まずオフラインで動く)。左の段を押すか、前へ / 次へ / 再生 (キー ← / → / Space)。

To make your own, see [WALKTHROUGH-CONTRACT.md §2](../../WALKTHROUGH-CONTRACT.md#2-a-scene--段) (getting each scene's
state from your lab). / 自分の物を作るには [WALKTHROUGH-CONTRACT.md §2](../../WALKTHROUGH-CONTRACT.md#2-a-scene--段)
(各段の状態を自分のラボから採る) を。
