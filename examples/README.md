# examples/ — 21 troubleshooting problems (broken + solved) and one best-path showcase

Each of the 21 [RouteCrushLab](https://routecrushlab.com) problems (Q1–Q21) comes as two containerlab labs: the **broken** one (`<dir>/`, the lab starts in the fault state) and the **solved** one (`<dir>-solved/`, the fixed lab to compare with). `bgp-bestpath-multiprefix` (and its `-solved` copy) is an extra best-path showcase — not a broken lab.

[日本語は下にあります](#日本語)

## Start a lab
From the repository root:
```bash
./demo.sh examples/q21-bgp-lp/q21.clab.yml      # deploy -> keep collecting -> serve the X-Ray graph on :8080
```
Open **http://localhost:8080/** and click a router to open its DeepDive. Fix the lab in a router's shell (`docker exec -it clab-<lab name>-r1 vtysh`; the lab name is the `name:` in the `.clab.yml`, e.g. `q21-bgp-lp` / `q21-bgp-lp-solved`). In the problems (Q1–Q21) the band turns **✓ Solved** when the fault is fixed.
Each folder has its own README (the problem, the nodes, how to start and stop it). Requirements, the release packages and troubleshooting: see the [main README](../README.md).

## The labs
| Folder (broken / solved) | Lab file | Routers & hosts | Problem |
|---|---|---|---|
| `q1-static` / `q1-static-solved` | `q1.clab.yml` | 3 | Problem 1 — "Why won't the ping go through?" |
| `q2-static` / `q2-static-solved` | `q2.clab.yml` | 3 | Problem 2 — "Packets won't forward?" |
| `q3-ospf` / `q3-ospf-solved` | `q3.clab.yml` | 2 | Problem 3 — "OSPF neighbor won't come up?" |
| `q4-static` / `q4-static-solved` | `q4.clab.yml` | 2 | Problem 4 — "I wrote the route, but it won't work?" |
| `q5-ospf` / `q5-ospf-solved` | `q5.clab.yml` | 2 | Problem 5 — "Hellos should be flowing, and yet…" |
| `q6-ospf` / `q6-ospf-solved` | `q6.clab.yml` | 3 | Problem 6 — "There's a redundant path, so why no failover?" |
| `q7-ospf-static` / `q7-ospf-static-solved` | `q7.clab.yml` | 2 | Problem 7 — "There's a route, but the ping won't go through?" |
| `q8-ospf` / `q8-ospf-solved` | `q8.clab.yml` | 2 | Problem 8 — "Both sides are sending Hellos, and yet…" |
| `q9-ospf` / `q9-ospf-solved` | `q9.clab.yml` | 3 | Problem 9 — "Two paths, and neither one works?" |
| `q10-ospf` / `q10-ospf-solved` | `q10.clab.yml` | 2 | Problem 10 — "For some reason, no Hellos are going out?" |
| `q11-ospf-static` / `q11-ospf-static-solved` | `q11.clab.yml` | 3 | Problem 11 — "There's a direct link, so why the detour?" |
| `q12-ospf-static` / `q12-ospf-static-solved` | `q12.clab.yml` | 3 | Problem 12 — "Secure a backup route that surfaces in an emergency!" |
| `q13-bgp-static` / `q13-bgp-static-solved` | `q13.clab.yml` | 2 | Problem 13 — "The BGP neighbor won't come up" |
| `q14-bgp` / `q14-bgp-solved` | `q14.clab.yml` | 2 | Problem 14 — "The iBGP neighbor won't come up" |
| `q15-bgp-ospf-static` / `q15-bgp-ospf-static-solved` | `q15.clab.yml` | 3 | Problem 15 — "The route is in the BGP table, but packets don't arrive?" |
| `q16-bgp` / `q16-bgp-solved` | `q16.clab.yml` | 2 | Problem 16 — "BGP came up, but the route doesn't arrive?" |
| `q17-ospf-static` / `q17-ospf-static-solved` | `q17.clab.yml` | 2 | Problem 17 — "I redistributed, but the route doesn't appear" |
| `q18-bgp` / `q18-bgp-solved` | `q18.clab.yml` | 2 | Problem 18 — "Only some routes don't arrive" |
| `q19-bgp` / `q19-bgp-solved` | `q19.clab.yml` | 2 | Problem 19 — "The BGP session suddenly dropped" |
| `q20-bgp` / `q20-bgp-solved` | `q20.clab.yml` | 2 | Problem 20 — "The route I advertise never shows up on my peer" |
| `q21-bgp-lp` / `q21-bgp-lp-solved` | `q21.clab.yml` | 3 | Problem 21 — "Two ISPs, yet everything takes the slow one" |
| `bgp-bestpath-multiprefix` / `bgp-bestpath-multiprefix-solved` | `multiprefix.clab.yml` | 3 | Extra — a different best-path winner per prefix (Local Preference vs AS-Path) (no ✓ Solved check) |

Hints and the explanation of each problem are on RouteCrushLab — the problem card in the page has a **"Solve it on RouteCrushLab (guest)"** button (no account needed).

## Your own problem
Put a `problem.json` next to your `*.clab.yml` (the problem text, the route to focus on, and a `check` that turns the band to ✓ Solved). The format: [docs/problem-format.md](../docs/problem-format.md).

---

## 日本語

# examples/ — トラブルシュートの 21 問(壊れた版と直した版)と Best-Path の見本 1 つ

[RouteCrushLab](https://routecrushlab.com) の 21 問(第1問〜第21問)は、それぞれ containerlab のラボが 2 つあります。**壊れた版**(`<フォルダ>/`・起動直後は障害が起きた状態)と、**直した版**(`<フォルダ>-solved/`・比べるための直したラボ)です。`bgp-bestpath-multiprefix`(と `-solved` の写し)は Best-Path を見せるための追加の見本で、壊れたラボではありません。

## ラボを起動する
リポジトリの直下で:
```bash
./demo.sh examples/q21-bgp-lp/q21.clab.yml      # deploy → 状態を集め続ける → X-Ray の graph を :8080 で配信
```
ブラウザで **http://localhost:8080/** を開き、ルータをクリックすると DeepDive が開きます。ルータのシェル(`docker exec -it clab-<ラボ名>-r1 vtysh`・ラボ名は `.clab.yml` の `name:`。例 `q21-bgp-lp` / `q21-bgp-lp-solved`)で直すと、問題(第1問〜第21問)では帯が **✓ Solved** になります。
各フォルダに README があります(問題文・ノード・起動と停止)。必要なもの・リリースのパッケージ・困ったときは [本体の README](../README.md) へ。

## ラボの一覧
| フォルダ(壊れた版 / 直した版) | ラボのファイル | ルータ・ホスト | 問題 |
|---|---|---|---|
| `q1-static` / `q1-static-solved` | `q1.clab.yml` | 3 | 第1問「pingが通らない原因は？」 |
| `q2-static` / `q2-static-solved` | `q2.clab.yml` | 3 | 第2問「パケットが転送できない？」 |
| `q3-ospf` / `q3-ospf-solved` | `q3.clab.yml` | 2 | 第3問「OSPFネイバーが確立しない？」 |
| `q4-static` / `q4-static-solved` | `q4.clab.yml` | 2 | 第4問「ルートを書いたのに使えない？」 |
| `q5-ospf` / `q5-ospf-solved` | `q5.clab.yml` | 2 | 第5問「Helloは飛んでいるはずなのに…」 |
| `q6-ospf` / `q6-ospf-solved` | `q6.clab.yml` | 3 | 第6問「冗長パスがあるのに迂回しない？」 |
| `q7-ospf-static` / `q7-ospf-static-solved` | `q7.clab.yml` | 2 | 第7問「経路があるのにpingが通らない？」 |
| `q8-ospf` / `q8-ospf-solved` | `q8.clab.yml` | 2 | 第8問「お互いHelloを送っているのに…」 |
| `q9-ospf` / `q9-ospf-solved` | `q9.clab.yml` | 3 | 第9問「2つの道、どちらも通れない？」 |
| `q10-ospf` / `q10-ospf-solved` | `q10.clab.yml` | 2 | 第10問「なぜかHelloが出ていない？」 |
| `q11-ospf-static` / `q11-ospf-static-solved` | `q11.clab.yml` | 3 | 第11問「直結があるのに、なぜ遠回り？」 |
| `q12-ospf-static` / `q12-ospf-static-solved` | `q12.clab.yml` | 3 | 第12問「緊急時に浮上するバックアップルートを確保せよ！」 |
| `q13-bgp-static` / `q13-bgp-static-solved` | `q13.clab.yml` | 2 | 第13問「BGPネイバーが張れない」 |
| `q14-bgp` / `q14-bgp-solved` | `q14.clab.yml` | 2 | 第14問「iBGPネイバーが張れない」 |
| `q15-bgp-ospf-static` / `q15-bgp-ospf-static-solved` | `q15.clab.yml` | 3 | 第15問「BGP テーブルに経路情報があるのに、パケットが届かない？」 |
| `q16-bgp` / `q16-bgp-solved` | `q16.clab.yml` | 2 | 第16問「BGPは張れたのに経路が届かない？」 |
| `q17-ospf-static` / `q17-ospf-static-solved` | `q17.clab.yml` | 2 | 第17問「Redistributeしたのに経路が出ない」 |
| `q18-bgp` / `q18-bgp-solved` | `q18.clab.yml` | 2 | 第18問「一部の経路だけ来ない」 |
| `q19-bgp` / `q19-bgp-solved` | `q19.clab.yml` | 2 | 第19問「BGPセッションが突然切れた」 |
| `q20-bgp` / `q20-bgp-solved` | `q20.clab.yml` | 2 | 第20問「送ったはずの経路が相手に載らない」 |
| `q21-bgp-lp` / `q21-bgp-lp-solved` | `q21.clab.yml` | 3 | 第21問「2つのISPがあるのに遅い方ばかり」 |
| `bgp-bestpath-multiprefix` / `bgp-bestpath-multiprefix-solved` | `multiprefix.clab.yml` | 3 | 追加の見本 — プレフィックスごとに Best-Path の勝者が違う(Local Preference と AS-Path)(✓ Solved の判定なし) |

各問のヒントと解説は RouteCrushLab にあります — 画面の問題カードの **「RouteCrushLab で解く (guest)」** から(アカウント不要)。

## 自分の問題を作る
`*.clab.yml` の隣に `problem.json`(問題文・注目する経路・帯を ✓ Solved にする `check`)を置きます。書き方は [docs/problem-format.md](../docs/problem-format.md)(英語)。
