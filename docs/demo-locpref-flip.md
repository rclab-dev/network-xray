# Change one Local Preference, watch the best path move

`scripts/demo-locpref-flip.sh` runs the whole flow in one command on the q21 example
(`examples/q21-bgp-lp`: 3 FRR routers; r1 hears `8.8.8.0/24` from r2 and from r3):

1. deploys the lab and waits for r1 to hear `8.8.8.0/24` from both upstreams
2. reads the routers once and asks why r1 picked its path (`scripts/xray-query.js why`)
3. changes one thing on r1: the inbound route-map for r2 sets Local Preference 150 instead of 50
4. reads the routers again and asks again
5. removes the lab (`--keep` leaves it running)

> This shows the answer of problem q21. Solve q21 first if you want to.

```bash
bash scripts/demo-locpref-flip.sh            # from the repository root
SUDO= bash scripts/demo-locpref-flip.sh      # if containerlab runs without sudo
```

Needs Linux, Docker, containerlab and Node.js 18+. The answers in steps 2 and 4 are read from the same state
file the X-Ray page draws (`xray-states.js`), so the **Best-Path Decision** panel shows the same winner and
reason. To watch the picture change instead, open the lab with `./xray.sh examples/q21-bgp-lp/q21.clab.yml`
and type the change of step 3 on r1 (`docker exec -it clab-q21-bgp-lp-r1 vtysh`).

## Output

A real run (FRR 8.4, containerlab 0.82.0, Node.js 18.19.1; about 25 seconds):

```
== 1. deploying examples/q21-bgp-lp/q21.clab.yml (lab q21-bgp-lp)
waiting for r1 to hear 8.8.8.0/24 from r2 and r3 ...

== 2. before: why does r1 pick its path to 8.8.8.0/24?
Best path: r1 8.8.8.0/24, 2 paths
  best:      via 10.11.0.20  as-path 65003
  reason:    Local Pref
  source:    bgp_routes[].reason (FRR selectionReason)

Candidates
  B  NEXT HOP    AS PATH  LOCPRF  WEIGHT  MED  ORIGIN  STATUS
  *  10.11.0.20  65003         -       0    0  IGP     *>
     10.10.0.20  65002        50       0    0  IGP     *
(LOCPRF - = r1 sets none for that path, so FRR uses the default, 100)

== 3. the change on r1: Local Preference for the path from r2, 50 -> 150
   route-map LOW-LP permit 10 / set local-preference 150 (then: clear ip bgp 10.10.0.20 soft in)

== 4. after: why does r1 pick its path to 8.8.8.0/24?
Best path: r1 8.8.8.0/24, 2 paths
  best:      via 10.10.0.20  as-path 65002
  reason:    Local Pref
  source:    bgp_routes[].reason (FRR selectionReason)

Candidates
  B  NEXT HOP    AS PATH  LOCPRF  WEIGHT  MED  ORIGIN  STATUS
     10.11.0.20  65003         -       0    0  IGP     *
  *  10.10.0.20  65002       150       0    0  IGP     *>

== removing the lab
done
```

`10.10.0.20` is r2 (AS65002), `10.11.0.20` is r3 (AS65003). The change is made in r1's running
configuration only; the files in `examples/q21-bgp-lp/` are not changed.

---

# 日本語

## Local Preference を 1 か所変えて、最良経路が動くのを見る

`scripts/demo-locpref-flip.sh` は q21 の例題 (`examples/q21-bgp-lp`: FRR のルータ 3 台・r1 は `8.8.8.0/24` を
r2 と r3 から受ける) で、次の流れを 1 回で動かします:

1. ラボを立て、r1 が 2 つの上流から `8.8.8.0/24` を受けるまで待つ
2. ルータを 1 回読み、r1 がなぜその経路を選んだかを聞く (`scripts/xray-query.js why`)
3. r1 で 1 か所だけ変える: r2 からの経路に付ける受信側の route-map の Local Preference を 50 から 150 に
4. もう一度読み、もう一度聞く
5. ラボを消す (`--keep` で残す)

> q21 の答えが出ます。先に q21 を解きたい人は、解いてから。

```bash
bash scripts/demo-locpref-flip.sh            # repository の一番上で
SUDO= bash scripts/demo-locpref-flip.sh      # containerlab を sudo なしで動かす時
```

要るもの: Linux・Docker・containerlab・Node.js 18 以上。2 と 4 の答えは X-Ray の頁が描くのと同じ状態の
ファイル (`xray-states.js`) から読むので、**Best-Path Decision** の欄にも同じ勝者と理由が出ます。図が変わる所を
見たい時は `./xray.sh examples/q21-bgp-lp/q21.clab.yml` でラボを開き、3 の変更を r1 で打ってください
(`docker exec -it clab-q21-bgp-lp-r1 vtysh`)。

出力は上の **Output** (本物の実行・英語のまま)。`10.10.0.20` が r2 (AS65002)、`10.11.0.20` が r3 (AS65003)。
変更は r1 の動いている設定だけで、`examples/q21-bgp-lp/` のファイルは変わりません。
