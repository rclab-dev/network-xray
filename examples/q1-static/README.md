# Problem 1 — "Why won't the ping go through?"

**RouteCrushLab Q1 as a containerlab lab, with the X-Ray view.** The lab starts in its **broken (fault) state** — find the cause and fix it.
Nodes: r1 (FRR), inet (Linux), sv (Linux)

> You want to ping the internet (`8.8.8.8`) from sv (the server), but there is no connectivity.
> Running `ping 8.8.8.8` on sv gets no reply.
> Look into r1 (the gateway router that sv uses to get out) and fix the cause.
> After fixing it, confirm that `ping 8.8.8.8` on sv gets a reply.

[日本語は下にあります](#日本語)

## Requirements
- Linux with **Docker**, **containerlab**, and **Node.js 18+**
- Your user in the `docker` group (or run with `sudo`)
- The FRR image is pulled on first start: `docker pull frrouting/frr@sha256:990e83490108b686fd6df3b1cafa6bdbb2714acb00eedb9a89693946f46f45ce`

## Start
From the repository root (`git clone https://github.com/rclab-dev/network-xray.git && cd network-xray`):
```bash
./demo.sh examples/q1-static/q1.clab.yml      # deploy -> keep collecting -> serve the graph
```
Open **http://localhost:8080/** (from another machine: `http://<host-ip>:8080/`). Port in use? add a port: `./demo.sh examples/q1-static/q1.clab.yml 8081`.
The solved version (to compare): `./demo.sh examples/q1-static-solved/q1.clab.yml` (stop this one first).
From a release package (one folder per problem): run `./run.sh` in that folder and open `:50080`.

## What you see
1. **Problem card** — the question (EN / 日本語 toggle) and a **"Solve it on RouteCrushLab (guest)"** button.
2. **Topology view** — the whole lab (containerlab graph, NeXt UI).
3. **DeepDive** — click a node to look inside the router: Routing Engine, routing table, LSDB / BGP Table, OSPF Hellos, tunnels. Red link = that interface is down.
The view follows the live lab (it re-collects every few seconds), so it changes as you fix things.

## Work on the lab
```bash
docker exec -it clab-q1-static-r1 vtysh      # router (FRR CLI)
docker exec -it clab-q1-static-inet sh         # Linux node (inet, sv), e.g. ping 8.8.8.8
```
The lab is closed: nodes cannot reach the real internet, just like on RouteCrushLab.

## Stop
```bash
# Ctrl-C stops the graph and the collector. Then remove the lab:
sudo containerlab destroy -t examples/q1-static/q1.clab.yml --cleanup
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

# 第1問「pingが通らない原因は？」

**RouteCrushLab の第1問を containerlab で動かし、X-Ray で中を見られるラボです。** 起動直後は**障害が起きた状態**です。原因を見つけて直してください。
ノード: r1(FRR)・inet(Linux)・sv(Linux)

> sv (サーバ) からインターネット (`8.8.8.8`) に ping を飛ばしたいのですが、通信できません。
> sv で `ping 8.8.8.8` を実行しても応答がありません。
> sv の出口になっている r1 (ゲートウェイルータ) を調べて、原因を直してください。
> 直したら、sv で `ping 8.8.8.8` が応答することを確認してください。

## 必要なもの
- Linux + **Docker**・**containerlab**・**Node.js 18 以上**
- 自分のユーザが `docker` グループに入っていること(または `sudo` で実行)
- 初回は FRR のイメージを取得: `docker pull frrouting/frr@sha256:990e83490108b686fd6df3b1cafa6bdbb2714acb00eedb9a89693946f46f45ce`

## 起動
リポジトリの直下で (`git clone https://github.com/rclab-dev/network-xray.git && cd network-xray`):
```bash
./demo.sh examples/q1-static/q1.clab.yml      # deploy → 状態を集め続ける → graph を配信
```
ブラウザで **http://localhost:8080/** を開く (別の PC からは `http://<このマシンの IP>:8080/`)。ポートが使用中なら末尾にポート: `./demo.sh examples/q1-static/q1.clab.yml 8081`。
解決版と比べるなら: `./demo.sh examples/q1-static-solved/q1.clab.yml` (先にこちらを止めてから)。
リリースのパッケージ (1 問ずつのフォルダ) なら、そのフォルダで `./run.sh` を実行して `:50080` を開く。

## 画面の見方
1. **問題カード** — 問題文(EN / 日本語 切替)と **「RouteCrushLab で解く (guest)」** ボタン。
2. **全体図** — トポロジ全体(containerlab graph・NeXt UI)。
3. **DeepDive** — ノードをクリックするとルータの中が見える: Routing Engine・経路表・LSDB / BGP Table・OSPF の Hello・トンネル。赤いリンク = その IF が down。
画面は動いているラボに追従します(数秒ごとに取り直し)。直すと表示も変わります。

## ラボを操作する
```bash
docker exec -it clab-q1-static-r1 vtysh      # ルータ(FRR の CLI)
docker exec -it clab-q1-static-inet sh         # Linux ノード(inet・sv)。例: ping 8.8.8.8
```
このラボは外部と切り離されています(RouteCrushLab と同じく、本物のインターネットには出られません)。

## 止める
```bash
# Ctrl-C で graph と状態の収集が止まる。そのあとラボを消す:
sudo containerlab destroy -t examples/q1-static/q1.clab.yml --cleanup
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
