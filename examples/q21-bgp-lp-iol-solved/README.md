# Problem 21 — "Two ISPs, yet everything takes the slow one" (Cisco IOL)

**RouteCrushLab Q21 on Cisco IOL (IOS-XE) nodes, with the X-Ray view.** This is the **solved version** (the broken one is `examples/q21-bgp-lp-iol/`).
Nodes: r1 (IOL), r2 (IOL), r3 (IOL). The same problem with FRR: `examples/q21-bgp-lp-solved/`.

The original problem (already fixed in this version):
> r1 is connected to two ISPs, r2 (fast ISP, AS65002) and r3 (slow ISP, AS65003), and receives `8.8.8.0/24` from both.
> But on r1, the path via r3 (the slow ISP) is the best path.
> Look into r1's BGP configuration and fix it so that the path via r2 (the fast ISP) becomes the best path.
> Keep the route from r3 as a backup.
> After fixing it, confirm with `show ip bgp` on r1 that the 8.8.8.0/24 path via r2 has `*>` and that the path via r3 is still there.

[日本語は下にあります](#日本語)

## Requirements
- Linux with **Docker**, **containerlab**, and **Node.js 18+**
- **Your own Cisco IOL image.** network-xray does not ship the IOL binary or a built image — obtain IOL under your own Cisco license, build the container with vrnetlab (`cisco_iol` kind), and change the `image:` line (now `vrnetlab/cisco_iol:17.18.02`) to your tag.

## Start
```bash
./demo.sh examples/q21-bgp-lp-iol-solved/q21.clab.yml
```
Open **http://localhost:8080/**. IOL takes about a minute to boot; until SSH is up, the nodes are shown as not yet read.
network-xray reads the IOL nodes over SSH every 10 s, using only `show` commands (it changes no configuration).

## Stop
```bash
sudo containerlab destroy -t examples/q21-bgp-lp-iol-solved/q21.clab.yml --cleanup
```

## 日本語

# 第21問「2つのISPがあるのに遅い方ばかり」 (Cisco IOL)

**RouteCrushLab の第21問を Cisco IOL (IOS-XE) で。** これは**解いた後の版**です (壊れた版は `examples/q21-bgp-lp-iol/`)。
同じ問の FRR 版: `examples/q21-bgp-lp-solved/`。

元の問題 (この版では直してあります):
> r1 は r2 (高速 ISP, AS65002) と r3 (低速 ISP, AS65003) の 2 つの ISP につながっていて、両方から `8.8.8.0/24` を受け取っています。
> ところが r1 では、r3 (低速 ISP) 経由が best path になっています。
> r1 の BGP の設定を調べて、r2 (高速 ISP) 経由が best path になるように直してください。
> r3 からの経路は予備として残してください。
> 直したら、r1 で `show ip bgp` を見て、8.8.8.0/24 の r2 経由の経路に `*>` が付き、r3 経由の経路も残っていることを確認してください。

- Linux + Docker + containerlab + Node.js 18 以上。
- **IOL のイメージは自分で用意**してください。network-xray には IOL の本体も、作ったイメージも入っていません。IOL は自分の Cisco のライセンスで手に入れ、vrnetlab で `cisco_iol` を作り、topology の `image:` の行 (今は `vrnetlab/cisco_iol:17.18.02`) を自分のタグに変えます。
- 起動: `./demo.sh examples/q21-bgp-lp-iol-solved/q21.clab.yml` → http://localhost:8080/ (IOL の起動に 1 分ほど)。
- 止める: `sudo containerlab destroy -t examples/q21-bgp-lp-iol-solved/q21.clab.yml --cleanup`
