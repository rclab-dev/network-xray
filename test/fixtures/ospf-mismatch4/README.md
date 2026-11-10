# test/fixtures/ospf-mismatch4

Real router captures, not hand-made, captured on 2026-11-11 with containerlab 0.83.0: two routers joined by four links,
each link with one OSPF interface value that differs between the two ends. The same lab twice:

- `frr84/` = FRR 8.4 (`show ip ospf interface json`, `show ip ospf neighbor json`, `show interface json`, `show ip route json`;
  the names `node clab-collect.js --fixtures <dir>` reads)
- `iol/` = Cisco IOL 17.18.02 (the `show` outputs `clab-iosxe-collect.js --capture` saves; the BGP, VRF and bridge-domain
  outputs, which were empty, are left out)

| Link (FRR / IOL) | r1 | r2 | What the routers did |
|---|---|---|---|
| eth1 / Ethernet0/1 | MTU 9500 (FRR, containerlab's veth) / 1500 (IOL) | MTU 1400 (`ip link set eth1 mtu 1400` / `ip mtu 1400`) | stuck in EXCHANGE / EXSTART |
| eth2 / Ethernet0/2 | hello 5, dead 20 | hello 10, dead 40 | no neighbour |
| eth3 / Ethernet0/3 | `ip ospf network point-to-point` | broadcast | **FULL**, but no route from the other router is installed |
| eth4 / Ethernet1/0 | MD5 authentication | none | no neighbour |

All four links are in area 0; the loopbacks (1.1.1.1/32, 2.2.2.2/32) are advertised. `test/ospf-mismatch4.test.js` reads these.
