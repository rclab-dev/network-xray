# test/fixtures/bestpath-frr-real

Real router captures, not hand-made. Each file is FRR's own `show ip bgp json` (or `show bgp summary json`) from
router r1 of the lab in `lab/`, captured on 2026-11-05 with containerlab 0.82.0, once with FRR 8.4 and once with
FRR 10.7.1. The JSON is re-indented (2 spaces); nothing else was changed.

| Folder | FRR | Image |
|---|---|---|
| `frr-8.4/` | 8.4_git | `frrouting/frr@sha256:990e83490108…` (the image the examples use) |
| `frr-10.7/` | 10.7.1_git | `quay.io/frrouting/frr:10.7.1` (the image netlab uses) |

r1 (AS65001) hears 203.0.113.0/24 from r2 (AS65002) and r3 (AS65003) over eBGP, and from r4 (AS65001) over iBGP
when that peer is up. `lab/capture.sh` changes one setting per step, captures r1's table, and puts the setting back:

| File | What was changed | FRR's `selectionReason` |
|---|---|---|
| `base.json` | nothing (two eBGP paths with the same attributes) | 8.4: `Older Path` · 10.7: `Router ID` |
| `weight.json` | `neighbor 10.11.0.20 weight 100` on r1 | `Weight` |
| `local-pref.json` | route-map `set local-preference 200` on r1, in from r3 | `Local Pref` |
| `local-route.json` | r1 itself originates the prefix (`network`) | `Weight` (a local route gets weight 32768) |
| `as-path.json` | r2 prepends `65002 65002` | `AS Path` |
| `origin.json` | r2 sets origin incomplete | `Origin` |
| `med.json` | `bgp always-compare-med` on r1, r2 sends MED 50, r3 sends MED 10 | `MED` |
| `peer-type.json` | r3 shut down, iBGP peer r4 up (its AS_PATH made the same length) | `Peer Type` |
| `router-id.json` | `bgp bestpath compare-routerid` on r1 | `Router ID` |
| `multipath.json` | `maximum-paths 2` + `bgp bestpath as-path multipath-relax` on r1 | `Older Path` (`multipath`: 8.4 on the other path only, 10.7 on both) |
| `neighbor-ip.json` | r3 given r2's router ID + `bgp bestpath compare-routerid` | `Neighbor IP` |
| `peers-summary.json` | r4 shut down, plus a peer that cannot be reached (192.0.2.1) | peers `Established` ×2, `Idle (Admin)`, `Active` |

What these captures show that the hand-made `../bestpath-frr/` files do not:
- FRR names a locally originated route's win `Weight`, not `Local Route` (the local route has weight 32768).
- FRR prints `Origin`, not `ORIGIN`.
- FRR 8.4 does not set `multipath` on the best path of a multipath group; FRR 10.7 sets it on both.
- With nothing changed, FRR 8.4 decides by `Older Path` and FRR 10.7 by `Router ID`.

Not captured here: `IGP Metric` (needs two iBGP paths with different IGP costs) and confederation / AS_SET paths.
`test/bestpath-frr-real.test.js` runs every file through the collector and the Best-Path box, as
`test/bestpath-frr.test.js` does with the hand-made files.
