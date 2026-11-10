# test/fixtures/iosxe-ospf-iface

Real router captures, not hand-made: the `show` outputs `clab-iosxe-collect.js --capture` saved from r1 and r2 of a
two-router Cisco IOL 17.18.02 lab (containerlab 0.82.0), captured on 2026-11-09. The files are unchanged (the BGP, VRF and
bridge-domain outputs, which were empty, are left out).

| Link | r1 | r2 | What it shows |
|---|---|---|---|
| Ethernet0/1 (10.1.12.0/24) | MD5 authentication, priority 100 | MD5 authentication | `FULL`; r1 DR, r2 BDR; "Cryptographic authentication enabled" |
| Ethernet0/2 (10.2.12.0/30) | point-to-point, hello 5 / dead 20, cost 30 | point-to-point, hello 10 / dead 40 | no neighbour (the timers differ) |
| Ethernet0/3 (10.3.12.0/24) | simple password authentication, area 0 | `ip mtu 1400`, `passive-interface`, area 1 | no neighbour; "Simple password authentication enabled" on r1, "No Hellos (Passive interface)" and "MTU is 1400 bytes" on r2 |

IOS prints an authentication line only when authentication is configured on the interface. `show_ip_interface.txt`
(the IP MTU) is the show `clab-iosxe-collect.js` takes for the OSPF interface panel. `test/ospf-iface-params.test.js` reads these.
