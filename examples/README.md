# examples/ — 21 troubleshooting problems (broken + solved) and one best-path showcase

Each of the 21 [RouteCrushLab](https://routecrushlab.com/?ref=oss&lang=en) problems (Q1–Q21) comes as two containerlab labs: the **broken** one (`<dir>/`, the lab starts in the fault state) and the **solved** one (`<dir>-solved/`, the fixed lab to compare with). `bgp-bestpath-multiprefix` (and its `-solved` copy) is an extra best-path showcase — not a broken lab.

[日本語は下にあります](#日本語)

## Start a lab
From the repository root:
```bash
./xray.sh examples/q21-bgp-lp/q21.clab.yml      # deploy -> keep collecting -> serve the X-Ray graph on :8080
```
Open **http://localhost:8080/** and click a router to open its DeepDive. Fix the lab in a router's shell (`docker exec -it clab-<lab name>-r1 vtysh`; the lab name is the `name:` in the `.clab.yml`, e.g. `q21-bgp-lp` / `q21-bgp-lp-solved`). In the problems (Q1–Q21) the band turns **✓ Solved** when the fault is fixed.
Each folder has its own README (the problem, the nodes, how to start and stop it). Requirements, the release packages and troubleshooting: see the [main README](../README.md).

## The labs
| Lab (broken / solved) | Protocol | Vendor | What is broken | Start |
|---|---|---|---|---|
| [q1-static](q1-static/) / [q1-static-solved](q1-static-solved/) | static | FRR | "Why won't the ping go through?" | `./xray.sh examples/q1-static/q1.clab.yml` |
| [q2-static](q2-static/) / [q2-static-solved](q2-static-solved/) | static | FRR | "Packets won't forward?" | `./xray.sh examples/q2-static/q2.clab.yml` |
| [q3-ospf](q3-ospf/) / [q3-ospf-solved](q3-ospf-solved/) | OSPF | FRR | "OSPF neighbor won't come up?" | `./xray.sh examples/q3-ospf/q3.clab.yml` |
| [q4-static](q4-static/) / [q4-static-solved](q4-static-solved/) | static | FRR | "I wrote the route, but it won't work?" | `./xray.sh examples/q4-static/q4.clab.yml` |
| [q5-ospf](q5-ospf/) / [q5-ospf-solved](q5-ospf-solved/) | OSPF | FRR | "Hellos should be flowing, and yet…" | `./xray.sh examples/q5-ospf/q5.clab.yml` |
| [q5-ospf-iol](q5-ospf-iol/) / [q5-ospf-iol-solved](q5-ospf-iol-solved/) | OSPF | Cisco IOL | "Hellos should be flowing, and yet…" | `./xray.sh examples/q5-ospf-iol/q5.clab.yml` |
| [q6-ospf](q6-ospf/) / [q6-ospf-solved](q6-ospf-solved/) | OSPF | FRR | "There's a redundant path, so why no failover?" | `./xray.sh examples/q6-ospf/q6.clab.yml` |
| [q7-ospf-static](q7-ospf-static/) / [q7-ospf-static-solved](q7-ospf-static-solved/) | OSPF + static | FRR | "There's a route, but the ping won't go through?" | `./xray.sh examples/q7-ospf-static/q7.clab.yml` |
| [q8-ospf](q8-ospf/) / [q8-ospf-solved](q8-ospf-solved/) | OSPF | FRR | "Both sides are sending Hellos, and yet…" | `./xray.sh examples/q8-ospf/q8.clab.yml` |
| [q9-ospf](q9-ospf/) / [q9-ospf-solved](q9-ospf-solved/) | OSPF | FRR | "Two paths, and neither one works?" | `./xray.sh examples/q9-ospf/q9.clab.yml` |
| [q10-ospf](q10-ospf/) / [q10-ospf-solved](q10-ospf-solved/) | OSPF | FRR | "For some reason, no Hellos are going out?" | `./xray.sh examples/q10-ospf/q10.clab.yml` |
| [q11-ospf-static](q11-ospf-static/) / [q11-ospf-static-solved](q11-ospf-static-solved/) | OSPF + static | FRR | "There's a direct link, so why the detour?" | `./xray.sh examples/q11-ospf-static/q11.clab.yml` |
| [q12-ospf-static](q12-ospf-static/) / [q12-ospf-static-solved](q12-ospf-static-solved/) | OSPF + static | FRR | "Secure a backup route that surfaces in an emergency!" | `./xray.sh examples/q12-ospf-static/q12.clab.yml` |
| [q13-bgp-static](q13-bgp-static/) / [q13-bgp-static-solved](q13-bgp-static-solved/) | BGP + static | FRR | "The BGP neighbor won't come up" | `./xray.sh examples/q13-bgp-static/q13.clab.yml` |
| [q14-bgp](q14-bgp/) / [q14-bgp-solved](q14-bgp-solved/) | BGP | FRR | "The iBGP neighbor won't come up" | `./xray.sh examples/q14-bgp/q14.clab.yml` |
| [q15-bgp-ospf-static](q15-bgp-ospf-static/) / [q15-bgp-ospf-static-solved](q15-bgp-ospf-static-solved/) | BGP + OSPF + static | FRR | "The route is in the BGP table, but packets don't arrive?" | `./xray.sh examples/q15-bgp-ospf-static/q15.clab.yml` |
| [q15-bgp-ospf-static-iol](q15-bgp-ospf-static-iol/) / [q15-bgp-ospf-static-iol-solved](q15-bgp-ospf-static-iol-solved/) | BGP + OSPF + static | Cisco IOL | "The route is in the BGP table, but packets don't arrive?" | `./xray.sh examples/q15-bgp-ospf-static-iol/q15.clab.yml` |
| [q16-bgp](q16-bgp/) / [q16-bgp-solved](q16-bgp-solved/) | BGP | FRR | "BGP came up, but the route doesn't arrive?" | `./xray.sh examples/q16-bgp/q16.clab.yml` |
| [q17-ospf-static](q17-ospf-static/) / [q17-ospf-static-solved](q17-ospf-static-solved/) | OSPF + static | FRR | "I redistributed, but the route doesn't appear" | `./xray.sh examples/q17-ospf-static/q17.clab.yml` |
| [q18-bgp](q18-bgp/) / [q18-bgp-solved](q18-bgp-solved/) | BGP | FRR | "Only some routes don't arrive" | `./xray.sh examples/q18-bgp/q18.clab.yml` |
| [q19-bgp](q19-bgp/) / [q19-bgp-solved](q19-bgp-solved/) | BGP | FRR | "The BGP session suddenly dropped" | `./xray.sh examples/q19-bgp/q19.clab.yml` |
| [q20-bgp](q20-bgp/) / [q20-bgp-solved](q20-bgp-solved/) | BGP | FRR | "The route I advertise never shows up on my peer" | `./xray.sh examples/q20-bgp/q20.clab.yml` |
| [q21-bgp-lp](q21-bgp-lp/) / [q21-bgp-lp-solved](q21-bgp-lp-solved/) | BGP | FRR | "Two ISPs, yet everything takes the slow one" | `./xray.sh examples/q21-bgp-lp/q21.clab.yml` |
| [q21-bgp-lp-iol](q21-bgp-lp-iol/) / [q21-bgp-lp-iol-solved](q21-bgp-lp-iol-solved/) | BGP | Cisco IOL | "Two ISPs, yet everything takes the slow one" | `./xray.sh examples/q21-bgp-lp-iol/q21.clab.yml` |
| [bgp-bestpath-multiprefix](bgp-bestpath-multiprefix/) / [bgp-bestpath-multiprefix-solved](bgp-bestpath-multiprefix-solved/) | BGP | FRR | Not broken: a different best-path winner per prefix (Local Preference vs AS-Path) | `./xray.sh examples/bgp-bestpath-multiprefix/multiprefix.clab.yml` |

The Cisco IOL (IOS-XE) labs need your own IOL image (see each folder's README). Each lab's routers and hosts are listed in its README.

Hints and the explanation of each problem are on RouteCrushLab — the problem card in the page has a **"Solve it on RouteCrushLab (guest)"** button (no account needed).

## Your own problem
Put a `problem.json` next to your `*.clab.yml` (the problem text, the route to focus on, and a `check` that turns the band to ✓ Solved). The format: [docs/problem-format.md](../docs/problem-format.md).

---

## 日本語

# examples/ — トラブルシュートの 21 問(壊れた版と直した版)と Best-Path の見本 1 つ

[RouteCrushLab](https://routecrushlab.com/?ref=oss&lang=ja) の 21 問(第1問〜第21問)は、それぞれ containerlab のラボが 2 つあります。**壊れた版**(`<フォルダ>/`・起動直後は障害が起きた状態)と、**直した版**(`<フォルダ>-solved/`・比べるための直したラボ)です。`bgp-bestpath-multiprefix`(と `-solved` の写し)は Best-Path を見せるための追加の見本で、壊れたラボではありません。

## ラボを起動する
リポジトリの直下で:
```bash
./xray.sh examples/q21-bgp-lp/q21.clab.yml      # deploy → 状態を集め続ける → X-Ray の graph を :8080 で配信
```
ブラウザで **http://localhost:8080/** を開き、ルータをクリックすると DeepDive が開きます。ルータのシェル(`docker exec -it clab-<ラボ名>-r1 vtysh`・ラボ名は `.clab.yml` の `name:`。例 `q21-bgp-lp` / `q21-bgp-lp-solved`)で直すと、問題(第1問〜第21問)では帯が **✓ Solved** になります。
各フォルダに README があります(問題文・ノード・起動と停止)。必要なもの・リリースのパッケージ・困ったときは [本体の README](../README.md) へ。

## ラボの一覧
| ラボ(壊れた版 / 直した版) | プロトコル | ベンダー | 何が壊れているか | 起動 |
|---|---|---|---|---|
| [q1-static](q1-static/) / [q1-static-solved](q1-static-solved/) | static | FRR | 「pingが通らない原因は？」 | `./xray.sh examples/q1-static/q1.clab.yml` |
| [q2-static](q2-static/) / [q2-static-solved](q2-static-solved/) | static | FRR | 「パケットが転送できない？」 | `./xray.sh examples/q2-static/q2.clab.yml` |
| [q3-ospf](q3-ospf/) / [q3-ospf-solved](q3-ospf-solved/) | OSPF | FRR | 「OSPFネイバーが確立しない？」 | `./xray.sh examples/q3-ospf/q3.clab.yml` |
| [q4-static](q4-static/) / [q4-static-solved](q4-static-solved/) | static | FRR | 「ルートを書いたのに使えない？」 | `./xray.sh examples/q4-static/q4.clab.yml` |
| [q5-ospf](q5-ospf/) / [q5-ospf-solved](q5-ospf-solved/) | OSPF | FRR | 「Helloは飛んでいるはずなのに…」 | `./xray.sh examples/q5-ospf/q5.clab.yml` |
| [q5-ospf-iol](q5-ospf-iol/) / [q5-ospf-iol-solved](q5-ospf-iol-solved/) | OSPF | Cisco IOL | 「Helloは飛んでいるはずなのに…」 | `./xray.sh examples/q5-ospf-iol/q5.clab.yml` |
| [q6-ospf](q6-ospf/) / [q6-ospf-solved](q6-ospf-solved/) | OSPF | FRR | 「冗長パスがあるのに迂回しない？」 | `./xray.sh examples/q6-ospf/q6.clab.yml` |
| [q7-ospf-static](q7-ospf-static/) / [q7-ospf-static-solved](q7-ospf-static-solved/) | OSPF + static | FRR | 「経路があるのにpingが通らない？」 | `./xray.sh examples/q7-ospf-static/q7.clab.yml` |
| [q8-ospf](q8-ospf/) / [q8-ospf-solved](q8-ospf-solved/) | OSPF | FRR | 「お互いHelloを送っているのに…」 | `./xray.sh examples/q8-ospf/q8.clab.yml` |
| [q9-ospf](q9-ospf/) / [q9-ospf-solved](q9-ospf-solved/) | OSPF | FRR | 「2つの道、どちらも通れない？」 | `./xray.sh examples/q9-ospf/q9.clab.yml` |
| [q10-ospf](q10-ospf/) / [q10-ospf-solved](q10-ospf-solved/) | OSPF | FRR | 「なぜかHelloが出ていない？」 | `./xray.sh examples/q10-ospf/q10.clab.yml` |
| [q11-ospf-static](q11-ospf-static/) / [q11-ospf-static-solved](q11-ospf-static-solved/) | OSPF + static | FRR | 「直結があるのに、なぜ遠回り？」 | `./xray.sh examples/q11-ospf-static/q11.clab.yml` |
| [q12-ospf-static](q12-ospf-static/) / [q12-ospf-static-solved](q12-ospf-static-solved/) | OSPF + static | FRR | 「緊急時に浮上するバックアップルートを確保せよ！」 | `./xray.sh examples/q12-ospf-static/q12.clab.yml` |
| [q13-bgp-static](q13-bgp-static/) / [q13-bgp-static-solved](q13-bgp-static-solved/) | BGP + static | FRR | 「BGPネイバーが張れない」 | `./xray.sh examples/q13-bgp-static/q13.clab.yml` |
| [q14-bgp](q14-bgp/) / [q14-bgp-solved](q14-bgp-solved/) | BGP | FRR | 「iBGPネイバーが張れない」 | `./xray.sh examples/q14-bgp/q14.clab.yml` |
| [q15-bgp-ospf-static](q15-bgp-ospf-static/) / [q15-bgp-ospf-static-solved](q15-bgp-ospf-static-solved/) | BGP + OSPF + static | FRR | 「BGP テーブルに経路情報があるのに、パケットが届かない？」 | `./xray.sh examples/q15-bgp-ospf-static/q15.clab.yml` |
| [q15-bgp-ospf-static-iol](q15-bgp-ospf-static-iol/) / [q15-bgp-ospf-static-iol-solved](q15-bgp-ospf-static-iol-solved/) | BGP + OSPF + static | Cisco IOL | 「BGP テーブルに経路情報があるのに、パケットが届かない？」 | `./xray.sh examples/q15-bgp-ospf-static-iol/q15.clab.yml` |
| [q16-bgp](q16-bgp/) / [q16-bgp-solved](q16-bgp-solved/) | BGP | FRR | 「BGPは張れたのに経路が届かない？」 | `./xray.sh examples/q16-bgp/q16.clab.yml` |
| [q17-ospf-static](q17-ospf-static/) / [q17-ospf-static-solved](q17-ospf-static-solved/) | OSPF + static | FRR | 「Redistributeしたのに経路が出ない」 | `./xray.sh examples/q17-ospf-static/q17.clab.yml` |
| [q18-bgp](q18-bgp/) / [q18-bgp-solved](q18-bgp-solved/) | BGP | FRR | 「一部の経路だけ来ない」 | `./xray.sh examples/q18-bgp/q18.clab.yml` |
| [q19-bgp](q19-bgp/) / [q19-bgp-solved](q19-bgp-solved/) | BGP | FRR | 「BGPセッションが突然切れた」 | `./xray.sh examples/q19-bgp/q19.clab.yml` |
| [q20-bgp](q20-bgp/) / [q20-bgp-solved](q20-bgp-solved/) | BGP | FRR | 「送ったはずの経路が相手に載らない」 | `./xray.sh examples/q20-bgp/q20.clab.yml` |
| [q21-bgp-lp](q21-bgp-lp/) / [q21-bgp-lp-solved](q21-bgp-lp-solved/) | BGP | FRR | 「2つのISPがあるのに遅い方ばかり」 | `./xray.sh examples/q21-bgp-lp/q21.clab.yml` |
| [q21-bgp-lp-iol](q21-bgp-lp-iol/) / [q21-bgp-lp-iol-solved](q21-bgp-lp-iol-solved/) | BGP | Cisco IOL | 「2つのISPがあるのに遅い方ばかり」 | `./xray.sh examples/q21-bgp-lp-iol/q21.clab.yml` |
| [bgp-bestpath-multiprefix](bgp-bestpath-multiprefix/) / [bgp-bestpath-multiprefix-solved](bgp-bestpath-multiprefix-solved/) | BGP | FRR | 壊れていない見本: プレフィックスごとに Best-Path の勝者が違う(Local Preference と AS-Path) | `./xray.sh examples/bgp-bestpath-multiprefix/multiprefix.clab.yml` |

Cisco IOL (IOS-XE) のラボは IOL のイメージを自分で用意します(各フォルダの README を参照)。ルータ・ホストの一覧も各フォルダの README にあります。

各問のヒントと解説は RouteCrushLab にあります — 画面の問題カードの **「RouteCrushLab で解く (guest)」** から(アカウント不要)。

## 自分の問題を作る
`*.clab.yml` の隣に `problem.json`(問題文・注目する経路・帯を ✓ Solved にする `check`)を置きます。書き方は [docs/problem-format.md](../docs/problem-format.md)(英語)。
