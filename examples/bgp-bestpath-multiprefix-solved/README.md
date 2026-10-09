# bgp-bestpath-multiprefix (advanced example — NOT RCL Q21)

Two prefixes with a **different best-path winner per prefix**:

- `8.8.8.0/24` — r1 prefers **r2** by **Local Preference** (r1 sets LocalPref 150 on r2's route).
- `9.9.9.0/24` — r1 prefers **r3** by **AS-Path length** (r2 prepends its own ASN on this prefix).

So the X-Ray Best-Path Decision shows a *different* winner and a *different* reason
(LocPrf vs AS-Path) depending on which prefix you inspect, and the Loser-Path
(counterfactual) arrow differs per route.

This is an **advanced showcase** and is **not** the RouteCrushLab Q21 lab. For the
Q21-faithful single-prefix Local-Preference demo (matching routecrushlab.com/lab/tl/q21
and the Zenn article), see `../q21-bgp-lp/`.

Deploy: `./demo.sh examples/bgp-bestpath-multiprefix/multiprefix.clab.yml 8080`
