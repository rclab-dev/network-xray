# clab-srl-collect `--from-dir` sample

A recorded snapshot of one Nokia SR Linux node's `sr_cli "info from state … | as json"`
outputs, so `clab-srl-collect.js` can build an X-Ray `state` with no live lab (CI, blog
posts, offline demos).

```
node ../../clab-srl-collect.js --from-dir r1/ --node r1 --adj ethernet-1/1.0:r2 --proto ospf
```

## How it was captured (round-trip)

Run the collector live once with `--capture`; it records exactly the files a later
`--from-dir` reads (same filename function both directions, so you never hand-name them):

```
# on the box with docker:
node clab-srl-collect.js --lab srl-ospf --node r1 --adj ethernet-1/1.0:r2 --proto ospf --capture r1/
# anywhere afterwards:
node clab-srl-collect.js --from-dir r1/ --node r1 --adj ethernet-1/1.0:r2 --proto ospf
```

## File naming

Each state path becomes a file: non-alphanumeric runs → `_`, `.json` suffix
(e.g. `interface ethernet-1/1 subinterface 0 ipv4` → `interface_ethernet_1_1_subinterface_0_ipv4.json`).
A missing file is treated as absent (null), not an error, so you only need the paths your
protocol uses. This `r1/` sample is a real capture from an **srlinux v24** containerlab OSPF
lab (r1 Full with r2 on ethernet-1/1.0, loopback 1.1.1.1, learns 2.2.2.2/32).
