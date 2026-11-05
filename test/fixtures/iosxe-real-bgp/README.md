# test/fixtures/iosxe-real-bgp

Real router captures, not hand-made: the `show` outputs `clab-iosxe-collect.js --capture` saved from router r1 of the
lab in `lab/` (Cisco IOL 17.18.02, containerlab 0.82.0), captured on 2026-11-05. The files are unchanged.

r1 (AS65001) hears 203.0.113.0/24 from r2 (AS65002) and r3 (AS65003) over eBGP, and from r4 (AS65001) over iBGP when
that peer is up. One setting was changed per step (and put back after the capture):

| Folder | What was changed | What IOS shows (`show ip bgp`) |
|---|---|---|
| `base` | nothing (two eBGP paths with the same printed attributes) | `*>` 10.10.0.20 — the decider is not printed |
| `weight` | `neighbor 10.11.0.20 weight 100` on r1 | `*>` 10.11.0.20, weight 100 |
| `local-pref` | route-map `set local-preference 200`, in from r3 | `*>` 10.11.0.20, LocPrf 200 |
| `local-route` | r1 itself originates the prefix (`network` + static to Null0) | `*>` 0.0.0.0, weight 32768 |
| `as-path` | r2 prepends `65002 65002` | `*>` 10.11.0.20 (shorter AS_PATH) |
| `origin` | r2 sets origin incomplete | `*>` 10.11.0.20 (`i` over `?`) |
| `med` | `bgp always-compare-med` on r1, MED 50 from r2 and 10 from r3 | `*>` 10.11.0.20 — the setting is not printed, so the MED step cannot be named from the table |
| `peer-type` | r3 shut down, iBGP peer r4 up with a route-map that prepends 65009 | `*>i` 10.12.0.20: IOS did not prepend towards the iBGP peer, so r4's empty AS_PATH wins |
| `invalid-nexthop` | r4 sets the next hop 192.0.2.99 (not in r1's routing table) | `* i` 192.0.2.99 next to `*>` 10.10.0.20 |
| `router-id` | `bgp bestpath compare-routerid` on r1 | `*>` 10.10.0.20 (router ID 2.2.2.2) — not printed |
| `multipath` | `maximum-paths 2` + `bgp bestpath as-path multipath-relax` | `*m` 10.11.0.20 and `*>` 10.10.0.20 |
| `peers` | r4 shut down, plus a peer that cannot be reached (192.0.2.1) | summary: `Idle (Admin)` and `Idle` (not `Active`: there is no route to 192.0.2.1) |

`test/iosxe-real.test.js` reads every folder the way `--from-dir` does and checks that the collector keeps the row IOS
marked `>`, names the step where the table shows it (Weight, Local Pref, AS Path, Origin) and names nothing where the
table cannot show it.
