# test/fixtures/bestpath-frr

Small hand-made inputs for `test/bestpath-frr.test.js`, not router captures. Each file has the shape of FRR's
`show ip bgp json` table (one prefix, two or three paths) and is built to be decided at one step of FRR's
best-path order. The best path carries `bestpath` and `selectionReason` with the strings FRR prints for that
step (`Weight`, `Local Pref`, `Local Route`, `AS Path`, `ORIGIN`, `MED`, `Peer Type`, `IGP Metric`,
`Older Path`, `Router ID`, `Neighbor IP`).

`reason-in-bestpath-object.json` gives the reason in the per-prefix form (`"bestpath": {"overall": true,
"selectionReason": ...}`) instead of the table form (`"bestpath": true, "selectionReason": ...`).
