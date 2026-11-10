# test/fixtures/frr-ospf-iface

Real router captures, not hand-made: `show ip ospf interface json`, `show ip ospf neighbor json` and `show interface json`
from a two-router containerlab lab, once with FRR 8.4 (`frr84/`, the image of the example labs) and once with FRR 10.7.1
(`frr107/`), captured on 2026-11-09. The files are unchanged. File names are the ones `node clab-collect.js --fixtures <dir>`
reads.

| Link | r1 | r2 | What it shows |
|---|---|---|---|
| eth1 (10.1.12.0/24) | MD5 authentication, priority 100 | MD5 authentication | `Full`; r1 is the DR, r2 the BDR; `"authentication": "authenticationMessageDigest"` |
| eth2 (10.2.12.0/30) | point-to-point, hello 5 / dead 20, cost 30 | point-to-point, hello 10 / dead 40 | no neighbour (the timers differ) |
| eth3 (10.3.12.0/24) | simple password authentication, area 0 | `passive-interface`, area 0.0.0.1 | no neighbour; `"timerPassiveIface": true` on r2 |

FRR prints `authentication` only when it is configured and `timerPassiveIface` only when the interface is passive.
The `mtu` set on r2's eth3 was not applied inside the container, so every interface reports `mtuBytes` 9500
(containerlab's veth MTU); on FRR an MTU difference has to be made with `ip link set <interface> mtu <bytes>`.
`test/ospf-iface-params.test.js` reads these.
