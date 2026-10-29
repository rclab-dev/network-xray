# Problem 15 — "The route is in the BGP table, but packets don't arrive?" (Cisco IOL)

**RouteCrushLab Q15 on Cisco IOL (IOS-XE) nodes, with the X-Ray view.** The lab starts in its **broken (fault) state** — find the cause and fix it.
Nodes: r1 (IOL), r2 (IOL), r3 (IOL). The same problem with FRR: `examples/q15-bgp-ospf-static/`.

> A ping from r1 to r3's loopback (`8.8.8.8`) fails.
> r1-r2 are connected with iBGP and OSPF, and r2-r3 with eBGP.
> r1's BGP table shows `8.8.8.0/24`, yet packets are not forwarded.
> Change r2's configuration so that a ping from r1 to `8.8.8.8` succeeds.
> After fixing it, confirm on r1 that 8.8.8.0/24 has `*>` in `show ip bgp` and that `ping 8.8.8.8` gets a reply.

[日本語は下にあります](#日本語)

## Requirements
- Linux with **Docker**, **containerlab**, and **Node.js 18+**
- **Your own Cisco IOL image.** network-xray does not ship the IOL binary or a built image — obtain IOL under your own Cisco license, build the container with vrnetlab (`cisco_iol` kind), and change the `image:` line (now `vrnetlab/cisco_iol:17.18.02`) to your tag.

## Start
```bash
./demo.sh examples/q15-bgp-ospf-static-iol/q15.clab.yml
```
Open **http://localhost:8080/**. IOL takes about a minute to boot; until SSH is up, the nodes are shown as not yet read.
network-xray reads the IOL nodes over SSH every 10 s, using only `show` commands (it changes no configuration).

## Stop
```bash
sudo containerlab destroy -t examples/q15-bgp-ospf-static-iol/q15.clab.yml --cleanup
```

## 日本語

# 第15問「BGP テーブルに経路情報があるのに、パケットが届かない？」 (Cisco IOL)

**RouteCrushLab の第15問を Cisco IOL (IOS-XE) で。** ラボは**壊れた状態**で始まります。原因を見つけて直してください。
同じ問の FRR 版: `examples/q15-bgp-ospf-static/`。

> r1 から r3 のループバック (`8.8.8.8`) に ping が通りません。
> r1-r2 間は iBGP と OSPF、r2-r3 間は eBGP でつながっています。
> r1 の BGP テーブルには `8.8.8.0/24` が見えているのに、パケットが転送されません。
> r2 の設定を変えて、r1 から `8.8.8.8` に ping が通るようにしてください。
> 直したら、r1 で `show ip bgp` の 8.8.8.0/24 に `*>` が付き、`ping 8.8.8.8` が応答することを確認してください。

- Linux + Docker + containerlab + Node.js 18 以上。
- **IOL のイメージは自分で用意**してください。network-xray には IOL の本体も、作ったイメージも入っていません。IOL は自分の Cisco のライセンスで手に入れ、vrnetlab で `cisco_iol` を作り、topology の `image:` の行 (今は `vrnetlab/cisco_iol:17.18.02`) を自分のタグに変えます。
- 起動: `./demo.sh examples/q15-bgp-ospf-static-iol/q15.clab.yml` → http://localhost:8080/ (IOL の起動に 1 分ほど)。
- 止める: `sudo containerlab destroy -t examples/q15-bgp-ospf-static-iol/q15.clab.yml --cleanup`
