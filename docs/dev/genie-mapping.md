# Genie JSON to IOS-XE parts

`require('./genie-to-xray.js').genieToParts(genieByCommand, args)` returns
`{ p: { ospfNei, ospfIf, ifaces, routes, bgpSum, bgpRoutes }, det, err }`.
Pass this directly to `iosxePartsToState(parts, args, buildState)`.
`args.mgmtIp` filters the management address, as in the text reader. Text command
values in `args` are never used to fill missing JSON. Input JSON is not mutated.

The q5 captures validate default-VRF IPv4 only. **real** means the key occurs in
these fixtures, not that every possible value or IOS release has been tested.
**guess** means an implemented candidate schema with no q5 evidence; obtain a
real capture before relying on these branches. No pyATS code or runtime is used.

Paths below use these abbreviations:

- `B` = `instance.<pid>.areas.<area>.interfaces.<iface>` (`show_ip_ospf_interface_brief`).
- `D` = `vrf.default.address_family.ipv4.instance.<pid>.areas.<area>.interfaces.<iface>` (`show_ip_ospf_interface`).
- `I` = `interface.<iface>` (`show_ip_interface_brief`).
- `M` = `<iface>` (`show_ip_interface`).
- `R` = `vrf.default.address_family.ipv4.routes.<prefix>` (`show_ip_route`).
- `N` = `vrf.default.instance.<pid>.areas.<area>.interfaces.<iface>.neighbors.<rid>` (`show_ip_ospf_neighbor`, guess).
- `S` = `vrf.default` (`show_ip_bgp_summary`, guess).
- `G` = `vrf.default.address_family.<af>.routes.<prefix>.index.<index>` (`show_ip_bgp`, guess).

| network-xray part field | <- Genie key path (command) | real / guess |
| --- | --- | --- |
| p.ospfIf interface key, area | B's iface and area keys; `normIf`, `0.0.0.0` -> `0` | real |
| p.ospfIf up, ospfState, role | B.state; DOWN -> up:false; role prefers D.state uppercase | real |
| p.ospfIf ospf | Presence in B -> true | real |
| p.ospfIf ip, prefix | B.ip_address split at `/`; prefix is numeric | real |
| p.ospfIf cost | B.cost | real |
| p.ospfIf nbrFull, nbrCount | B.nbrs_full, B.nbrs_count | real |
| p.ospfIf nbrs, nbrsAdj | D.statistics.nbr_count, adj_nbr_count; fallback B.nbrs_count, nbrs_full | real |
| p.ospfIf hello, helloKnown | D.hello_interval; otherwise brief-only IOS parts default 10, with no helloKnown flag | real |
| p.ospfIf dead, netType, priority | D.dead_interval, interface_type uppercase, priority | real |
| p.ospfIf mtu | M.mtu (not link MTU from another command) | real |
| p.ospfIf passiveKnown | D.passive:false plus D.hello_timer proves active Hello transmission | real |
| p.ospfIf passive; det.passive | D.passive:true -> true; false alone is unknown, passiveKnown:null | guess (true case) |
| det interface key, area | D's iface and area keys; same normalization as brief | real |
| det up, ip, prefix | D.line_protocol, D.ip_address | real |
| det net_type, cost, role, priority | D.interface_type uppercase, cost, state uppercase, priority | real |
| det hello, dead | D.hello_interval, dead_interval | real |
| det nbrs, nbrsAdj | D.statistics.nbr_count, adj_nbr_count | real |
| det auth; p.ospfIf auth | No evidenced authentication key: null, never inferred as `none` | unavailable |
| p.ifaces interface key | I's iface key normalized with normIf | real |
| p.ifaces ip | I.ip_address; drop unassigned and args.mgmtIp | real |
| p.ifaces up, adminDown | I.status and I.protocol both up; status containing administratively | real |
| p.ifaces prefix | Connected R.route on same outgoing interface; else IOS reader's historical /24 default | real |
| p.routes prefix, protocol, selected | R.route (or prefix key), source_protocol, active | real |
| p.routes subtype | Empty string for captured connected/local routes | real |
| p.routes nexthops[].iface | R.next_hop.outgoing_interface.<iface>.outgoing_interface | real |
| p.routes nexthops[].ip, connected, active | null; protocol connected/local -> true; R.active | real |
| p.routes distance, metric | R.route_preference, metric | guess |
| p.routes nexthops[] for routed paths | R.next_hop.next_hop_list.*.{next_hop,outgoing_interface}; connected:false, fib:true | guess |
| p.ospfNei list, byIface | N key = rid, N.address, N.state; iface from parent; IOS state/role normalization reused | guess (both captures empty) |
| p.bgpSum routerId, localAs | S.router_id, S.local_as (summary localAs string) | guess |
| p.bgpSum list, byIp | S.neighbor.<ip>.remote_as; address_family.*.{state_pfxrcd,up_down}; localAs numeric per neighbor | guess |
| p.bgpSum state, established, pfxRcd | Numeric state_pfxrcd means Established; otherwise normBgpState | guess |
| p.bgpSum ibgp, state_raw, admin_down, max_prefix | AS equality / normBgpState as in IOS reader | guess |
| p.bgpRoutes prefix, nextHop | Prefix key, G.next_hop | guess |
| p.bgpRoutes best, valid, ibgp, status_raw | G.status_codes (`>`, `*`, `i`) | guess |
| p.bgpRoutes as_path, local_pref, weight, metric, origin | G.path, localpref, weight, metric, origin (`i/e/?`) | guess |
| p.bgpRoutes reason | Empty initially; iosxePartsToState derives reason | derived |
| err | null; no traffic JSON mapping evidenced | unavailable |

## Missing facts and intentional limits

| Field | What is unavailable / resulting behavior |
| --- | --- |
| Authentication (both routers) | No authentication key in q5. `auth:null` even though text infers `none` from absence of a line. Authentication-enabled schemas remain unmapped, not guessed. |
| r2 det | Entire `genie_show_ip_ospf_interface.json` is empty: det:null. No reconstruction from brief or IP-interface JSON. Lost detail fields are up, ip, prefix, area, net_type, cost, auth, role, priority, hello, dead, nbrs, nbrsAdj (where the text prints them). |
| r2 OSPF detailed parameters | No helloKnown, dead, netType, priority, auth, passiveKnown fields are added to brief parts; Ethernet0/1 retains the brief-only parts Hello default 10 rather than text's 5. Final state hello/dead/network_type/priority/passive/auth are null; the 5/20 mismatch cannot be diagnosed from this JSON. |
| r2 interface detail annotations | No ospf_area, ospf_hello, ospf_dead, ospf_net_type annotations from det. Area/IP/cost/counts in ospfIf still come from brief. |
| Passive without evidence | Genie's initialized false alone is not evidence. Require explicit true or a running hello_timer. |
| BGP / nonempty neighbors / routed next hops | Absent in q5; candidate mappings above are guesses. Empty neighbor JSON legitimately yields empty lists. |
| Bridge-domain, OSPF traffic, unnumbered, BGP multipath, route subtypes | No captures; no mapping implemented. |
| Protocols and VRF discovery | These do not feed text parts. Configuration flags remain caller args; only default VRF IPv4 is read. |

Empty/missing/null JSON for a command contributes no rows. Full OSPF details do
not create brief interfaces, IP details do not create brief interfaces, and MTU
is only merged onto existing OSPF brief rows. The /24 interface and 10-second
Hello defaults preserve existing **intermediate text parts conventions**, not a
claim that Genie supplied those values; buildState makes unknown Hello null.

Despite the fixture README saying r2 has no interface brief, the checked-in r2
folder contains both `show_ip_interface_brief.txt` and its Genie JSON. Tests read
those files as present; r2 has no route capture. The single exception table at
the top of `test/genie-to-parts.test.js` records every parity exclusion. Everything
else in parts, and all four requested main state fields, is compared deeply.

Run directly (no subprocess test runner):

```
node test/genie-to-parts.test.js
node test/iosxe-ospf-states.test.js
node test/iosxe-real.test.js
node test/iosxe-vrf.test.js
```

How to use: `node genie-to-xray.js <capture-dir> [--topo lab.clab.yml] [--out <output-dir>]` (otherwise prints JSON).
How to use: `node scripts/xray-query.js state <capture-dir>` or `ospf-if <capture-dir>`; node folders contain `genie_*.json`.
How to use: MCP tools accept the same Genie capture directory in their `path` argument.
