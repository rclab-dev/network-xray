# Problem 16 — "BGP came up, but the route doesn't arrive?"

**RouteCrushLab Q16 as a containerlab lab, with the X-Ray view.** This is the **solved version** (the broken one is `examples/q16-bgp/`) — use it to see what the fixed lab looks like.
Nodes: r1 (FRR), r2 (FRR)

> A ping from r2 to r1's loopback (`1.1.1.1`) fails.
> The BGP session is **Established**, and traffic from r1 to r2 (`2.2.2.2`) works fine.
> Fix r1 so that `ping 1.1.1.1` from r2 succeeds.
> Do not change r2's configuration.
> After fixing it, confirm on r2 that `show ip bgp` shows `1.1.1.1/32` and that `ping 1.1.1.1` gets a reply.

[日本語は下にあります](#日本語)

## Requirements
- Linux with **Docker**, **containerlab**, and **Node.js 18+**
- Your user in the `docker` group (or run with `sudo`)
- The FRR image is pulled on first start: `docker pull frrouting/frr@sha256:990e83490108b686fd6df3b1cafa6bdbb2714acb00eedb9a89693946f46f45ce`

## Start
From the repository root (`git clone https://github.com/rclab-dev/network-xray.git && cd network-xray`):
```bash
./demo.sh examples/q16-bgp-solved/q16.clab.yml      # deploy -> keep collecting -> serve the graph
```
Open **http://localhost:8080/** (from another machine: `http://<host-ip>:8080/`). Port in use? add a port: `./demo.sh examples/q16-bgp-solved/q16.clab.yml 8081`.
The broken version (the problem): `./demo.sh examples/q16-bgp/q16.clab.yml` (stop this one first).
From a release package (one folder per problem): run `./run.sh` in that folder and open `:50080`.

## What you see
1. **Problem card** — the question (EN / 日本語 toggle) and a **"Solve it on RouteCrushLab (guest)"** button.
2. **Topology view** — the whole lab (containerlab graph, NeXt UI).
3. **DeepDive** — click a node to look inside the router: Routing Engine, routing table, LSDB / BGP Table, OSPF Hellos, tunnels. Red link = that interface is down.
The view follows the live lab (it re-collects every few seconds), so it changes as you fix things.

## Work on the lab
```bash
docker exec -it clab-q16-bgp-r1 vtysh      # router (FRR CLI)
```
The lab is closed: nodes cannot reach the real internet, just like on RouteCrushLab.

## Stop
```bash
# Ctrl-C stops the graph and the collector. Then remove the lab:
sudo containerlab destroy -t examples/q16-bgp-solved/q16.clab.yml --cleanup
# release package: ./stop.sh
```

## Troubleshooting
| Symptom | Fix |
|---|---|
| `address already in use` | another graph is on the port: add a port (`./demo.sh <lab.clab.yml> 8081`; release package: `PORT=50081 ./run.sh`) or stop it |
| deploy says the lab `already exists` | `./stop.sh` (or `containerlab destroy -t *.clab.yml --cleanup`) |
| `http://…:8080/xray-core.js` returns HTML | normal — containerlab graph serves files under `/static/` |
| `permission denied` from docker | add your user to the `docker` group, log in again |
| a collector is left after stopping | `pkill -f clab-xray-collect.js`, then `./stop.sh` |

## Answer and explanation
This package gives you the broken lab and the X-Ray view. **Hints, the check of your answer, and the explanation are on RouteCrushLab** — use the "Solve it on RouteCrushLab (guest)" button (no account needed).

---

## 日本語

# 第16問「BGPは張れたのに経路が届かない？」

**RouteCrushLab の第16問を containerlab で動かし、X-Ray で中を見られるラボです。** これは**解決版**です (壊れた版は `examples/q16-bgp/`)。直した後の様子と比べるために使ってください。
ノード: r1(FRR)・r2(FRR)

> r2 から r1 のループバック (`1.1.1.1`) に ping が通りません。
> BGP のセッションは Established で、r1 から r2 (`2.2.2.2`) への通信は正常です。
> r1 を直して、r2 から `ping 1.1.1.1` が成功するようにしてください。r2 の設定は変更しないでください。
> 直したら、r2 で `show ip bgp` に `1.1.1.1/32` が表示され、`ping 1.1.1.1` が応答することを確認してください。

## 必要なもの
- Linux + **Docker**・**containerlab**・**Node.js 18 以上**
- 自分のユーザが `docker` グループに入っていること(または `sudo` で実行)
- 初回は FRR のイメージを取得: `docker pull frrouting/frr@sha256:990e83490108b686fd6df3b1cafa6bdbb2714acb00eedb9a89693946f46f45ce`

## 起動
リポジトリの直下で (`git clone https://github.com/rclab-dev/network-xray.git && cd network-xray`):
```bash
./demo.sh examples/q16-bgp-solved/q16.clab.yml      # deploy → 状態を集め続ける → graph を配信
```
ブラウザで **http://localhost:8080/** を開く (別の PC からは `http://<このマシンの IP>:8080/`)。ポートが使用中なら末尾にポート: `./demo.sh examples/q16-bgp-solved/q16.clab.yml 8081`。
壊れた版 (問題) と比べるなら: `./demo.sh examples/q16-bgp/q16.clab.yml` (先にこちらを止めてから)。
リリースのパッケージ (1 問ずつのフォルダ) なら、そのフォルダで `./run.sh` を実行して `:50080` を開く。

## 画面の見方
1. **問題カード** — 問題文(EN / 日本語 切替)と **「RouteCrushLab で解く (guest)」** ボタン。
2. **全体図** — トポロジ全体(containerlab graph・NeXt UI)。
3. **DeepDive** — ノードをクリックするとルータの中が見える: Routing Engine・経路表・LSDB / BGP Table・OSPF の Hello・トンネル。赤いリンク = その IF が down。
画面は動いているラボに追従します(数秒ごとに取り直し)。直すと表示も変わります。

## ラボを操作する
```bash
docker exec -it clab-q16-bgp-r1 vtysh      # ルータ(FRR の CLI)
```
このラボは外部と切り離されています(RouteCrushLab と同じく、本物のインターネットには出られません)。

## 止める
```bash
# Ctrl-C で graph と状態の収集が止まる。そのあとラボを消す:
sudo containerlab destroy -t examples/q16-bgp-solved/q16.clab.yml --cleanup
# リリースのパッケージなら: ./stop.sh
```

## 困ったとき
| 症状 | 対処 |
|---|---|
| `address already in use` | 別の graph がそのポートを使っている: 末尾にポートを付ける (`./demo.sh <lab.clab.yml> 8081`・リリースのパッケージなら `PORT=50081 ./run.sh`) か、それを止める |
| deploy で `already exists` | `./stop.sh`(だめなら `containerlab destroy -t *.clab.yml --cleanup`) |
| `http://…:8080/xray-core.js` が HTML になる | 正常。containerlab graph は部品を `/static/` の下で配る |
| docker で `permission denied` | ユーザを `docker` グループに入れてログインし直す |
| 止めた後に収集プロセスが残る | `pkill -f clab-xray-collect.js` → `./stop.sh` |

## 答えと解説
このパッケージは「壊れたラボ」と X-Ray の画面です。**ヒント・答え合わせ・解説は RouteCrushLab にあります** — 問題カードの「RouteCrushLab で解く (guest)」から(アカウント不要)。
