# test/fixtures/srlv

Nokia SR Linux `sr_cli "info from state <path> | as json"` output with unusual but valid values, for
`test/srl-output-variants.test.js`. Each `<case>/` holds the files a `clab-srl-collect.js --capture` run
writes (one file per state path, named by `pathToFile`), so the test replays them the same way
`--from-dir` does.

These files are **hand-written, not captured from a router.** Their shape follows the real srlinux v24
capture in `fixtures/srl-collect-sample/r1/` (the top-level node, list names and key names), and the
Nokia SR Linux YANG model (`srl_nokia-interfaces`, `srl_nokia-ospf`, `srl_nokia-bgp`, `srl_nokia-bgp-rib`,
`srl_nokia-ip-route-tables`) for keys and values that capture does not show. Each case says which.

The state paths the collector reads (all of them are under `network-instance default`, plus one
`interface <port> subinterface <n> ipv4` per `--adj` interface and `system0.0`):

```
interface <port> subinterface <n> ipv4
network-instance default protocols ospf instance default area *
network-instance default protocols bgp neighbor *
network-instance default route-table ipv4-unicast
network-instance default route-table next-hop-group *
network-instance default route-table next-hop *
network-instance default bgp-rib afi-safi ipv4-unicast ipv4-unicast local-rib
network-instance default bgp-rib attr-sets
```

| case | what it covers | based on |
| --- | --- | --- |
| `empty-ospf` | ipv4 container with no `address`, `address: []`, OSPF instance with no `area`, empty route / next-hop lists | capture shape, lists emptied |
| `empty-ospf-area` | an area with `interface: []` and `lsdb: {}` | capture shape, lists emptied |
| `empty-bgp` | `bgp neighbor *` with no `neighbor` list, empty `local-rib` and `attr-sets` | self-test shape, lists emptied |
| `nokeys-ospf` | no `admin-state`, `area-id`, `hello-interval`, `router-id`, `active`, `next-hop-group`, next-hop `type`; router-LSA stub link without `link-data` or `link-id`; LSA without `advertising-router` | capture shape, optional leaves removed |
| `nokeys-bgp` | neighbor with no `peer-as` / `peer-type` / `afi-safi` / `session-state`; local-rib route with no `best-route` / `attr-id`; attr-set with no values | self-test shape, optional leaves removed |
| `other-ni` | a Full OSPF neighbor, a BGP neighbor and a default route in `ip-vrf red` / `mgmt` (files present, never read); a route leaked into default from `red` (`origin-network-instance`, `next-hop-group-network-instance: red`) | capture shape; leak leaves from `srl_nokia-ip-route-tables` |
| `subif-ospf` | VLAN subinterfaces `ethernet-1/1.10` / `.20` facing different peers, `lag1.0` admin-down, two addresses with the `primary` one listed second | capture shape (`primary: [null]` is how the capture prints it) |
| `subif-bgp` | `/31` eBGP peers on `ethernet-1/1.100` / `.200`, indirect BGP next-hop | self-test shape |
| `bgp-odd` | 4-byte ASN, `opensent` / `openconfirm` / `connect`, `received-routes: 0`, `afi-safi-name` with a module prefix, local-pref 0 and 4294967295, MED 4294967295, origin `egp` / `incomplete`, AS_SET, confederation sequence / set, prepending, a default route, an own route | self-test shape; segment `type` and enum values from `srl_nokia-bgp-rib` / `srl_nokia-bgp` (spelling not seen in a capture) |
| `ospf-odd` | areas `0.0.0.10` and `10.255.0.1`, hello 1 s / dead 3 s, `/31` link, broadcast LAN with two `two-way` DROthers and one `loading`, transit links and a network-LSA, `route-type` with a module prefix | capture shape; values from `srl_nokia-ospf` |

A module prefix (`srl_nokia-common:ospfv2`) is how YANG identity values look in JSON-IETF (gNMI) output;
the bundled `sr_cli` capture prints them without one. Both read the same.
