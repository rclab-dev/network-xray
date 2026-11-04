# OSPF walkthrough vs RFC 2328

Checks the CCNA OSPF adjacency walkthrough (`ccna-ospf.html` + `ccna-data.js`) against the
neighbor state machine of RFC 2328 section 10.1 (states) and 10.3 (events / transitions).
The automated check is `test/ospf-walkthrough.test.js`.

## Shown transitions

The page steps through its buttons in order; "Link Down" is a fault button that can be pressed from any state.

| # | Shown transition | RFC 2328 10.3 event | Verdict |
|---|------------------|---------------------|---------|
| 1 | Down → Init | HelloReceived | valid |
| 2 | Init → 2-Way | 2-WayReceived (adjacency not wanted yet) | valid |
| 3 | 2-Way → ExStart | AdjOK? (adjacency now wanted, e.g. after DR/BDR election) | valid |
| 4 | ExStart → Exchange | NegotiationDone | valid |
| 5 | Exchange → Loading | ExchangeDone (link state request list not empty) | valid |
| 6 | Loading → Full | LoadingDone | valid |
| 7 | any → Down (Link Down) | KillNbr (interface down) / LLDown | valid |

Normal order shown: Down, Init, 2-Way, ExStart, Exchange, Loading, Full. On point-to-point links,
or whenever the adjacency is wanted at 2-WayReceived, Init goes straight to ExStart. On a broadcast
or NBMA segment the neighbor stays in 2-Way until the DR/BDR election, then AdjOK? moves it to ExStart.
Only when both routers are DROther does it stay in 2-Way for good. Attempt (NBMA only) is not shown.

## Label fixes

| Where | Before | After / reason |
|-------|--------|----------------|
| ExStart caption | "Master/Slave is decided and DBD exchange begins" | Master/Slave is *negotiated* in ExStart (empty DBDs with I/M/MS bits); it is decided by NegotiationDone, which moves to Exchange. |
| 2-Way caption | "DR/BDR are elected here." | Also says that AdjOK? decides whether to go on to ExStart, and that two DROthers on broadcast stay in 2-Way. |
| Page footer | "ExStart/Exchange/Loading drive the in-cylinder LSA gather" | "Exchange/Loading": no LSA summaries are exchanged in ExStart, and the engine (`lsdbSyncing`) already only animates Exchange/Loading. |

No state, event or transition was wrong; no data values or engine code changed.
