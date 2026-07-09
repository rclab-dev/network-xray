# frr-collect `--from-dir` sample

A recorded snapshot of one FRR router's `show … json` output, so `frr-collect.js`
can build an X-Ray `state` object with no live router (CI, blog posts, offline demos).

```
node ../../frr-collect.js --node r1 --from-dir r1/ --adj eth0:r2 --proto ospf
```

## File naming

One file per `show` command, spaces replaced with `_`, `.json` suffix:

| show command | file |
|---|---|
| `show ip ospf neighbor`  | `show_ip_ospf_neighbor.json` |
| `show ip ospf interface` | `show_ip_ospf_interface.json` |
| `show interface`         | `show_interface.json` |
| `show ip route`          | `show_ip_route.json` |
| `show ip bgp summary`    | `show_ip_bgp_summary.json` |
| `show ip bgp`            | `show_ip_bgp.json` |

Only the files your protocol needs must exist (OSPF: neighbor + interface + route;
BGP: bgp summary + bgp + route). Missing files are treated as absent, not an error.

To capture your own: `vtysh -c "show ip route json" > r1/show_ip_route.json` etc.
This `r1/` sample is a 3-node linear OSPF lab (r1 Full with r2 on eth0, loopbacks
2.2.2.2/3.3.3.3 learned) drawn from the live-verified FRR 8.4 shapes in clab-collect.js.
