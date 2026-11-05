# test/fixtures/bestpath-frr

Small hand-made inputs for `test/bestpath-frr.test.js`, not router captures. Each file has the shape of FRR's
`show ip bgp json` table (one prefix, two or three paths) and is built to be decided at one step of FRR's
best-path order. The best path carries `bestpath` and `selectionReason` with the strings FRR prints for that
step (`Weight`, `Local Pref`, `AS Path`, `Origin`, `MED`, `Peer Type`, `IGP Metric`,
`Older Path`, `Router ID`, `Neighbor IP`).

`reason-in-bestpath-object.json` gives the reason in the per-prefix form (`"bestpath": {"overall": true,
"selectionReason": ...}`) instead of the table form (`"bestpath": true, "selectionReason": ...`).

The strings follow the real captures in `../bestpath-frr-real/` (FRR 8.4 and 10.7): FRR prints `Origin`, and a locally
originated route wins by `Weight` because FRR gives it weight 32768 (`local-route.json` has the other path at weight 0,
as captured). FRR's code also has a `Local Route` step, reached only when the weights are equal; it was not seen in the
captures.
