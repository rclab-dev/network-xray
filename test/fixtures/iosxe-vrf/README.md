# IOS-XE VRF captures

Captured on Cisco IOL 17.18.02 (containerlab `cisco_iol`, the `examples/q5-ospf-iol` lab) on 2026-11-05, after adding
`vrf definition BLUE` with `Loopback9` (and later `Loopback10`) and an empty `vrf definition RED` on r1. r2 has only
containerlab's management VRF (`clab-mgmt`). Read by `clab-iosxe-collect.js` (`parseVrfs` / `parseWarnings`).

`r1_one_vrf_show_ip_interface_brief.txt` and `r1_one_vrf_show_ip_route.txt` are the same moment as `r1_one_vrf_show_vrf.txt`:
neither shows that `Loopback9` is in a VRF, which is why `show vrf` is read.
