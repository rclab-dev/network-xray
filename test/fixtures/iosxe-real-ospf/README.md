# test/fixtures/iosxe-real-ospf

Real router captures, not hand-made: the `show` outputs `clab-iosxe-collect.js --capture` saved from r1 and r2 of the
lab in `lab/` (Cisco IOL 17.18.02, containerlab 0.82.0), captured on 2026-11-05. The files are unchanged.

- LAN 10.20.0.0/24 (Ethernet0/1): r1 (priority 0), r2 (DR, priority 100), r3 (BDR, 50) and r4 (0), joined by a Linux
  bridge. r1 and r4 are both DROTHER, so they stay in 2WAY with each other.
- r1 Ethernet0/2 — r2 Ethernet0/2 (10.21.0.0/24), a second link between the same two routers.

| Folder | What was changed on the r1 – r2 link | r1 sees r2 on Ethernet0/2 | r2 sees r1 on Ethernet0/2 |
|---|---|---|---|
| `base` | nothing | `FULL/DR` | `FULL/BDR` |
| `exstart` | `ip mtu 1400` on r2's side, link bounced | `EXCHANGE/BDR` | `EXSTART/DR` |
| `init` | r2 drops OSPF coming in (`ip access-group … in`) | `INIT/DROTHER` | not listed |
| `shut` | `shutdown` on both ends (captured 2026-11-06, 45 s later) | not listed (Ethernet0/2 `DOWN`) | not listed (`DOWN`) |

`shut/r1_show_ip_ospf_database_router_self-originate.txt` is r1's own router-LSA at that time (2 links: Loopback0 and
Ethernet0/1, no 10.21.0.0/24).

In every folder r1 also sees r2 `FULL/DR`, r3 `FULL/BDR` and r4 `2WAY/DROTHER` on the LAN.
`test/iosxe-real.test.js` reads these the way `--from-dir` does.
