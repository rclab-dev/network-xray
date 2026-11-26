# X-Ray story — Story Contract / ストーリーの形

> **EN** — A **story** is a list of scenes, each one the whole state of a lab at one moment (the state the
> collectors write, see `DATA-CONTRACT.md`), with a title, a caption and a label saying where the state came from.
> `scripts/xray-story.js` checks a story and writes it as **one HTML page** that plays it: the scenes on the left
> (click one, Back / Next, Play), the lab and the open router's X-Ray on the right. The engine is inside the page,
> so it loads nothing from outside and works offline (`file://`, an attachment, a wiki).
>
> **JA** — **ストーリー** は段 (scene) の並びです。各段はある時点のラボの状態をまるごと持ち (collector が書く状態
> = `DATA-CONTRACT.md`)、題・説明・その状態の出所の札を付けます。`scripts/xray-story.js` がストーリーを確かめ、
> 再生する **1 枚の HTML** に書き出します: 左に段の一覧 (押す・前へ / 次へ・再生)、右にラボと開いたルータの X-Ray。
> engine を中に入れるので外から何も読まず、オフライン (`file://`・添付・wiki) で動きます。

- **Status**: version `"0.1"` (2026-11). / 版 `"0.1"`。
- **Related**: `DATA-CONTRACT.md` (the state of each scene / 各段の状態)、`scripts/capture-frames.js --story` (a draft
  story from a running lab / 動いているラボから下書き)、`demo/story-q21/` (an example / 例)。

```sh
node scripts/xray-story.js demo/story-q21/story.json              # writes demo/story-q21/story.html (not kept in git)
node scripts/xray-story.js my-story.json --out /tmp/my-story.html
node scripts/xray-story.js my-story.json --check                  # check only / 確かめだけ
./xray.sh story my-story.json --out my-story.html                 # the same / 同じ
node scripts/capture-frames.js lab.clab.yml steps.json out/ --story   # frames + a draft out/story.json
```

From an AI assistant, the MCP tool `story_check` checks a story file and returns what each scene shows; it writes
nothing ([docs/mcp.md](docs/mcp.md#story_check)). / AI アシスタントからは MCP の `story_check` (ファイルは書かない)。

Exit codes / 終了コード: 0 written or valid / 書いた・正しい, 1 not valid (every problem is listed) / 正しくない
(問題を全部出す), 2 a usage or read error / 使い方・読めない。

---

## 1. The story / ストーリー

```json
{
  "story": "0.1",
  "title": "Q21: why the slow ISP wins, and the fix",
  "description": "Two ISPs both advertise 8.8.8.0/24 ...",
  "lang": "en",
  "source": "observed",
  "topology": "../../examples/q21-bgp-lp/q21.clab.yml",
  "scenes": [
    {
      "id": "fault",
      "title": "The slow ISP r3 is best",
      "caption": "8.8.8.0/24 is heard from both ISPs ...",
      "state": "../bgp-lp/frameA.json",
      "show": { "node": "r1", "prefix": "8.8.8.0/24", "highlight": { "nodes": ["r3"], "links": [["r1", "r3"]] } },
      "dwell": 7000
    }
  ]
}
```

| key | needed | what / 何 |
|---|---|---|
| `story` | yes | `"0.1"` (the format version / 形の版) |
| `title` | yes | 1–120 characters / 1〜120 文字 |
| `description` | no | up to 2000 characters, shown under the title / 題の下に出る文 (2000 文字まで) |
| `lang` | no | `en` (default) or `ja`: the page's own words (buttons, labels) / 頁の決まった言葉 (ボタン・札) の言語 |
| `source` | no | the label of every scene that has none (default `unknown`) / 札の既定 (既定は `unknown`) |
| `topology` | yes | a `.clab.yml`, a `.json` with the containerlab graph data (`{nodes: [{name, kind}], links: [{source, target}]}`), or that object itself / `.clab.yml`・グラフの JSON・その物 |
| `scenes` | yes | 1–50 scenes / 1〜50 段 |
| `ext` | no | anything of your own (§4) / 自分用の欄 (§4) |

File names are relative to the story file. / ファイル名はストーリーのファイルからの相対。

## 2. A scene / 段

Each scene holds the **whole** state of the lab: nothing is carried over from the scene before, so any scene can be
shown first, and going back is the same as going forward. / 各段は状態を**まるごと**持ちます。前の段から何も引き
継がないので、どの段から見ても・戻っても同じに描けます。

| key | needed | what / 何 |
|---|---|---|
| `id` | yes | a plain name (letters, digits, `_ . -`, up to 64), not used twice; the page's address can open it (`#scene=fix`) / 重ならない名前 (頁のアドレス `#scene=fix` で開ける) |
| `title` | yes | 1–120 characters / 1〜120 文字 |
| `caption` | no | up to 2000 characters, shown under the title of the scene being shown / 見せている段の題の下に出る文 |
| `state` | yes | a file (`frameN.json` from capture-frames, `state_<node>.json`, `xray-states.js`) or the state itself: a map router → state, or one router's state; it must pass `scripts/validate-states.js` / ファイルかその物。validate-states を通ること |
| `source` | no | where the state came from (§3) / 出所の札 (§3) |
| `show.node` | no | the router to open; it must have a state in this scene (default: the open one, else the most connected) / 開くルータ (この段に状態があること) |
| `show.prefix` | no | the destination to pick in the BGP table / routing table, e.g. `8.8.8.0/24` / 表で選ぶ宛先 |
| `show.highlight` | no | `{nodes: [...], links: [["r1", "r2"], ...]}`: drawn in yellow on the lab picture (up to 20 each) / ラボの絵で黄色にする所 |
| `dwell` | no | milliseconds Play stays on the scene, 500–60000 (default 6000) / 再生で留まる時間 (既定 6000) |
| `ext` | no | anything of your own (§4) / 自分用の欄 (§4) |

## 3. Where the state came from / 出所の札

| `source` | page (en / ja) | meaning / 意味 |
|---|---|---|
| `observed` | observed / 実測 | read from a running lab (capture-frames: the state settled) / 動いているラボから読んだ (落ち着いた状態) |
| `observed-unsettled` | observed, not settled / 実測 (落ち着く前) | read from a lab, but it was still changing / 読んだが、まだ変わっている途中 |
| `answer-example` | answer example / 解答例 | the state of one way to solve it (written or recorded) / 解き方の 1 つの状態 |
| `illustrative` | illustrative / 説明用 | written by hand to explain / 説明のために手で書いた |
| `unknown` | source unknown / 出所不明 | not said / 言っていない |

**The label is what the author says. It is not checked** (the page says so). A state written by hand still has to
pass the states schema. / **札は作った人の申告で、確かめた物ではありません** (頁にもそう出ます)。手で書いた状態も
状態の schema を通る必要があります。

## 4. Your own fields: `ext` / 自分用の欄

Any key the format does not know is refused, so a typo is found. The one exception is `ext` (on the story and on each
scene): put your own fields under it, e.g. `"ext": {"myapp": {...}}`. `xray-story.js` accepts it and does **not** put it
into the page; a tool that reads the same story file can use it to draw more. / 形が知らない欄はエラー (書き間違いが
見つかる)。例外は `ext` (ストーリーと各段) だけで、自分用の欄はその下に置きます。`xray-story.js` は受け取り、頁には
**入れません**。同じファイルを読む別の道具が細かく描くのに使えます。

## 5. Rules the checker follows / 確かめの決まり

- Unknown keys are errors (except under `ext`); ids are not repeated; every node in `show` and in a state is in the
  topology; a highlighted link is a link of the topology. / 知らない欄・重なる id・トポロジに無い名前・無い線はエラー。
- Every problem is listed at once, and nothing is written for a story that is not valid. / 問題は全部まとめて出し、
  正しくないストーリーからは何も書きません。
- The story file is at most 16 MiB. / ストーリーのファイルは 16 MiB まで。

## 6. The page / 頁

- Every text from the story is set as text, never as HTML; the story data cannot end its `<script>` (`<` is written
  `\u003c`). / ストーリーの文は全部文字として出し、HTML にしません。データの `<` は `\u003c` で書きます。
- No script, style, font or image is loaded from anywhere; nothing is sent. / 外から何も読まず、何も送りません。
- Play starts stopped, moves on after each scene's `dwell`, stops at the last scene, and stops when the tab is hidden.
  Keys: ← / → (Back / Next), Space (Play / stop). / 再生は止まった状態で始まり、`dwell` ごとに進み、最後の段・
  タブが隠れた時に止まります。キー: ← / → (前へ / 次へ)、Space (再生 / 止める)。
- The router picture is the same engine as the containerlab graph page (`xray-graph.html`): a scene's state is what
  that page shows for the same state. / ルータの絵は containerlab の graph の頁と同じ engine で、同じ状態なら同じに
  描きます。
- Under each scene after the first, the page shows what changed from the scene before: worked out from the two states
  by `xray-diff.js` (the same changes as `state_diff`, heaviest first, three lines at most and how many more), each line
  with its router, and headed as worked out by network-xray (not written by the author). / 2 段目からは、前の段からの差を
  出します: 2 つの状態から `xray-diff.js` が出した物 (`state_diff` と同じ・重い順に 3 行まで・残りの数)、各行にルータの
  名前。作った人が書いた物でないと見出しで分かるようにします。
