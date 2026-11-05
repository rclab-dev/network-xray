# FRR OSPFv3 (ospf6d) JSON fixtures

Hand-built router `r1` output in the FRR 10.x JSON shapes (the shape of the FRR 10.7.1 capture in the
`clab-collect.js` self-test, netlab ospfv3 02-areas node x1, and of FRR `ospf6d/ospf6_neighbor.c` /
`ospf6d/ospf6_interface.c` / `zebra`). Read by `clab-collect.js` (`collectFromJson`), which reads
OSPFv3 only on a router with `router ospf6`. Checked by `test/frr-ospf6.test.js`.

| file | command | notes |
|---|---|---|
| `ospf6-neighbor.json` | `show ipv6 ospf6 vrf all neighbor json` | one `{neighbors:[...]}` object per VRF, no VRF key (default, then red) |
| `ospf6-interface.json` | `show ipv6 ospf6 vrf all interface json` | one flat `{<if>:{...}}` object per VRF; `eth5` / `gre0` not attached |
| `route6.json` | `show ipv6 route vrf all json` | `{<vrf>:{<prefix>:[...]}}` |
| `interface.json` | `show interface json` | gives each interface its VRF |

The collector runs the three OSPFv3 commands in one vtysh and sorts the returned objects by shape, so each
file holds the list of objects for its command.

Lab: `eth1` point-to-point to r2 (area 0, Full); `eth2` LAN to sw1 (area 0.0.0.1, Hello 2 s, r1 DROther:
DR Full, BDR Full, a DROther in `Twoway`); `eth3` in VRF red to r6 (area 0, `Init`); `eth4` passive in area 0.0.0.1.
