# Problem 5 — "Hellos should be flowing, and yet…" (Cisco IOL)

**RouteCrushLab Q5 on Cisco IOL (IOS-XE) nodes, with the X-Ray view.** This is the **solved version** (the broken one is `examples/q5-ospf-iol/`).
Nodes: r1 (IOL), r2 (IOL). The same problem with FRR: `examples/q5-ospf-solved/`.

The original problem (already fixed in this version):
> The OSPF neighbor between r1 and r2 won't come up, so a ping from r1 to r2's loopback (`2.2.2.2`) fails as well.
> Find the cause, bring up the OSPF neighbor, and fix it so that a ping from r1 to `2.2.2.2` succeeds.
> After fixing it, confirm on r1 that `show ip ospf neighbor` shows r2 as Full and that `ping 2.2.2.2` gets a reply.

[日本語は下にあります](#日本語)

## Requirements
- Linux with **Docker**, **containerlab**, and **Node.js 18+**
- **Your own Cisco IOL image.** network-xray does not ship the IOL binary or a built image — obtain IOL under your own Cisco license, build the container with vrnetlab (`cisco_iol` kind), and change the `image:` line (now `vrnetlab/cisco_iol:17.18.02`) to your tag.

## Start
```bash
./demo.sh examples/q5-ospf-iol-solved/q5.clab.yml
```
Open **http://localhost:8080/**. IOL takes about a minute to boot; until SSH is up, the nodes are shown as not yet read.
network-xray reads the IOL nodes over SSH every 10 s, using only `show` commands (it changes no configuration).

## Stop
```bash
sudo containerlab destroy -t examples/q5-ospf-iol-solved/q5.clab.yml --cleanup
```

## 日本語

# 第5問「Helloは飛んでいるはずなのに…」 (Cisco IOL)

**RouteCrushLab の第5問を Cisco IOL (IOS-XE) で。** これは**解いた後の版**です (壊れた版は `examples/q5-ospf-iol/`)。
同じ問の FRR 版: `examples/q5-ospf-solved/`。

元の問題 (この版では直してあります):
> r1 と r2 の間で OSPF のネイバーが確立しません。
> そのため、r1 から r2 のループバック (`2.2.2.2`) にも ping が通りません。
> 原因を調べて OSPF のネイバーを確立させ、r1 から `2.2.2.2` に ping が通るように直してください。
> 直したら、r1 で `show ip ospf neighbor` に r2 が Full で表示され、`ping 2.2.2.2` が応答することを確認してください。

- Linux + Docker + containerlab + Node.js 18 以上。
- **IOL のイメージは自分で用意**してください。network-xray には IOL の本体も、作ったイメージも入っていません。IOL は自分の Cisco のライセンスで手に入れ、vrnetlab で `cisco_iol` を作り、topology の `image:` の行 (今は `vrnetlab/cisco_iol:17.18.02`) を自分のタグに変えます。
- 起動: `./demo.sh examples/q5-ospf-iol-solved/q5.clab.yml` → http://localhost:8080/ (IOL の起動に 1 分ほど)。
- 止める: `sudo containerlab destroy -t examples/q5-ospf-iol-solved/q5.clab.yml --cleanup`
