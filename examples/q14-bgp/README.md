# Problem 14 — "The iBGP neighbor won't come up"

**RouteCrushLab Q14 as a containerlab lab, with the X-Ray view.** The lab starts in its **broken (fault) state** — find the cause and fix it.
Nodes: r1 (FRR), r2 (FRR)

> r1 and r2 are iBGP neighbors in the same AS (65001), configured to peer between their loopbacks (`1.1.1.1` ⇔ `2.2.2.2`).
> But the session stays **Active** and never reaches Established.
> Look into r1's BGP configuration and fix it so that the iBGP session becomes Established.
> After fixing it, confirm on r1 that the State/PfxRcd column for `2.2.2.2` in `show bgp summary` shows the number of received routes.

[日本語は下にあります](#日本語)

## Requirements
- Linux with **Docker**, **containerlab**, and **Node.js 18+**
- Your user in the `docker` group (or run with `sudo`)
- The FRR image is pulled on first start: `docker pull frrouting/frr@sha256:990e83490108b686fd6df3b1cafa6bdbb2714acb00eedb9a89693946f46f45ce`

## Start
From the repository root (`git clone https://github.com/rclab-dev/network-xray.git && cd network-xray`):
```bash
./demo.sh examples/q14-bgp/q14.clab.yml      # deploy -> keep collecting -> serve the graph
```
Open **http://localhost:8080/** (from another machine: `http://<host-ip>:8080/`). Port in use? add a port: `./demo.sh examples/q14-bgp/q14.clab.yml 8081`.
The solved version (to compare): `./demo.sh examples/q14-bgp-solved/q14.clab.yml` (stop this one first).
From a release package (one folder per problem): run `./run.sh` in that folder and open `:50080`.

## What you see
1. **Problem card** — the question (EN / 日本語 toggle) and a **"Solve it on RouteCrushLab (guest)"** button.
2. **Topology view** — the whole lab (containerlab graph, NeXt UI).
3. **DeepDive** — click a node to look inside the router: Routing Engine, routing table, LSDB / BGP Table, OSPF Hellos, tunnels. Red link = that interface is down.
The view follows the live lab (it re-collects every few seconds), so it changes as you fix things.
The band at the top turns **✓ Solved** once the lab is in the fixed state (a few seconds after the routes settle).

## Work on the lab
```bash
docker exec -it clab-q14-bgp-r1 vtysh      # router (FRR CLI)
```
The lab is closed: nodes cannot reach the real internet, just like on RouteCrushLab.

## Stop
```bash
# Ctrl-C stops the graph and the collector. Then remove the lab:
sudo containerlab destroy -t examples/q14-bgp/q14.clab.yml --cleanup
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
This package gives you the broken lab and the X-Ray view. **Hints and the explanation are on RouteCrushLab** — use the "Solve it on RouteCrushLab (guest)" button (no account needed).

---

## 日本語

# 第14問「iBGPネイバーが張れない」

**RouteCrushLab の第14問を containerlab で動かし、X-Ray で中を見られるラボです。** 起動直後は**障害が起きた状態**です。原因を見つけて直してください。
ノード: r1(FRR)・r2(FRR)

> r1 と r2 は同じ AS (65001) の iBGP ネイバーで、ループバック同士 (`1.1.1.1` ⇔ `2.2.2.2`) でセッションを張る設定です。
> ところが、セッションが Active のままで Established になりません。
> r1 の BGP の設定を調べて、iBGP のセッションが Established になるように直してください。
> 直したら、r1 で `show bgp summary` の `2.2.2.2` の行の State/PfxRcd に受け取った経路の数が表示されることを確認してください。

## 必要なもの
- Linux + **Docker**・**containerlab**・**Node.js 18 以上**
- 自分のユーザが `docker` グループに入っていること(または `sudo` で実行)
- 初回は FRR のイメージを取得: `docker pull frrouting/frr@sha256:990e83490108b686fd6df3b1cafa6bdbb2714acb00eedb9a89693946f46f45ce`

## 起動
リポジトリの直下で (`git clone https://github.com/rclab-dev/network-xray.git && cd network-xray`):
```bash
./demo.sh examples/q14-bgp/q14.clab.yml      # deploy → 状態を集め続ける → graph を配信
```
ブラウザで **http://localhost:8080/** を開く (別の PC からは `http://<このマシンの IP>:8080/`)。ポートが使用中なら末尾にポート: `./demo.sh examples/q14-bgp/q14.clab.yml 8081`。
解決版と比べるなら: `./demo.sh examples/q14-bgp-solved/q14.clab.yml` (先にこちらを止めてから)。
リリースのパッケージ (1 問ずつのフォルダ) なら、そのフォルダで `./run.sh` を実行して `:50080` を開く。

## 画面の見方
1. **問題カード** — 問題文(EN / 日本語 切替)と **「RouteCrushLab で解く (guest)」** ボタン。
2. **全体図** — トポロジ全体(containerlab graph・NeXt UI)。
3. **DeepDive** — ノードをクリックするとルータの中が見える: Routing Engine・経路表・LSDB / BGP Table・OSPF の Hello・トンネル。赤いリンク = その IF が down。
画面は動いているラボに追従します(数秒ごとに取り直し)。直すと表示も変わります。
ラボが直った状態になると、上の帯が **✓ Solved** になります(経路が落ち着いてから数秒)。

## ラボを操作する
```bash
docker exec -it clab-q14-bgp-r1 vtysh      # ルータ(FRR の CLI)
```
このラボは外部と切り離されています(RouteCrushLab と同じく、本物のインターネットには出られません)。

## 止める
```bash
# Ctrl-C で graph と状態の収集が止まる。そのあとラボを消す:
sudo containerlab destroy -t examples/q14-bgp/q14.clab.yml --cleanup
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
このパッケージは「壊れたラボ」と X-Ray の画面です。**ヒントと解説は RouteCrushLab にあります** — 問題カードの「RouteCrushLab で解く (guest)」から(アカウント不要)。
