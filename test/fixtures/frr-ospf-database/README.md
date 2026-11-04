# FRR `show ip ospf database json` fixtures

Hand-built captures of the summary form of `show ip ospf database json`, read by
`frr-collect.js` (`parseOspfDatabase`) into `state.ospf_lsdb`.

FRR has changed two parts of this output at different times: the per-type keys (CLI headings or camelCase)
and the advertising router key (`advertisedRouter` or `advertisingRouter`). Every combination is accepted.

| file | style | per-type key | advertising router key |
|---|---|---|---|
| `older-keys.json` | older FRR (7.x / 8.x) | CLI headings: `Router Link States`, `Net Link States`, `Summary Link States`, `ASBR-Summary Link States`, `AS External Link States`, `NSSA-external Link States` | `advertisedRouter` |
| `newer-keys.json` | newer FRR | camelCase: `routerLinkStates`, `networkLinkStates`, `summaryLinkStates`, `asbrSummaryLinkStates`, `asExternalLinkStates`, `nssaExternalLinkStates`, with `<key>Count` numbers beside them | `advertisingRouter` |
| `frr-8.4-captured.json` | **captured** from FRR 8.4 (examples/q3-ospf-solved, r1, two routers Full) | camelCase: `routerLinkStates`, `networkLinkStates` + counts | `advertisedRouter` |
| `as-external.json` | older FRR | area 0.0.0.1 summary / ASBR-summary LSAs and AS-scoped external LSAs at the top level | `advertisedRouter` |

`older-keys.json` and `newer-keys.json` describe the same 3-router LSDB (r1 1.1.1.1 — r2 2.2.2.2 —
r3 3.3.3.3, r2 DR on 10.1.0.0/24, r3 DR on 10.2.0.0/24), so both must give the same summary.

Where the shapes come from: FRR `ospfd/ospf_vty.c` (the database summary printer: the
`show_database_desc` headings, later the `show_database_desc_json` camelCase names, and the
per-LSA `lsId` / `advertisedRouter` → `advertisingRouter` / `lsaAge` / `sequenceNumber` /
`checksum` fields) and the FRR topotests that check this output (e.g.
`tests/topotests/ospfapi/`). `frr-8.4-captured.json` is a real capture; the others are hand-built. Capture more
with `vtysh -c "show ip ospf database json"` to add a version-specific sample.
