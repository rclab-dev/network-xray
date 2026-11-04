# test/fixtures/frr-json-versions

Small hand-made inputs for `test/frr-json-versions.test.js`, not router captures. Each file uses the key names
and value forms that FRR's own JSON writers print (FRRouting/frr at tags `frr-8.4`, `frr-9.1.3`, `frr-10.7.1`):

| file | command | FRR writer |
|---|---|---|
| `ospf-neighbor-8.4.json` | `show ip ospf neighbor json` | `ospfd/ospf_vty.c` `show_ip_ospf_neighbor_sub()`: 8.x prints the old keys (`priority`, `state`, `address`, ...) next to the new ones (`nbrPriority`, `nbrState`, `ifaceAddress`, ...) |
| `ospf-neighbor-10.json` | `show ip ospf neighbor json` | same function in 9.x / 10.x: only the new keys |
| `ospf-interface-down.json` | `show ip ospf interface json` | `ospfd/ospf_vty.c` `show_ip_ospf_interface_sub()`: an operative interface gets `"ifUp": true`, any other only `"ifDown": false` |
| `bgp-summary-10.json` | `show ip bgp summary json` | `bgpd/bgp_vty.c` `bgp_show_summary()` + `bgpd/bgpd.c` `peer_uptime()` |
| `bgp-prefix-dmed.json` | `show ip bgp json` (per-prefix path form) | `bgpd/bgp_route.c` `route_vty_out_detail()`: `"bestpath": {"bestpathFromAs": N}` on every per-AS winner when deterministic MED is on, `"overall": true` only on the best path; `"valid": false` on an unusable path |
| `route-10.json` | `show ip route json` | `zebra/zebra_vty.c` `vty_show_ip_route()` + the next-hop helper (`zebra/zebra_vty.c` in 8.4, `zebra/zebra_rnh.c` in 8.5-10.0, `lib/nexthop.c` in 10.7.1) |

Addresses, AS numbers and counters are made up.
