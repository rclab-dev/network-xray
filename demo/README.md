# X-Ray containerlab demo — recorded replay (no backend)

A static, **recorded replay** of a real [FRR](https://frrouting.org) /
[containerlab](https://containerlab.dev) lab, driven by the open-source
[`xray-core`](https://github.com/rclab-dev/xray-core) engine. It runs on any static host
(GitHub Pages, `file://`) — **no containerlab, no FRR, no server**.

## What you're seeing

The page loops four **real frames** captured from a live 3-node OSPF lab (`r1 — r2 — r3`):

1. **steady** — all OSPF adjacencies Full
2. **r2 eth1 down** — `r1` is isolated (neighbor Down, route lost, LSDB shrinks to its own loopback)
3. **recovering** — OSPF re-forms (2-Way/DROther)
4. **converged** — back to Full

Click any node to look **inside the router** (forwarding plane, OSPF process, hello/LSDB sync,
the LSDB it learned, the route it installs). The frames advance with the *same*
`xrayCore.applyState()` in-place update the **live mode** uses — so this static page shows the
live behaviour honestly, with zero backend.

> The data is recorded from a real FRR lab; only the *playback* is canned. The engine is the
> production `xray-core`, not a mock.

## Run the real thing (live, on your own lab)

This demo is the offline twin of the drop-in `containerlab graph` template. On your own lab:

```sh
# 1) collect live FRR state into xray-states.js, refreshing on a timer
node clab-xray-collect.js lab.clab.yml ./xray-core --watch --interval 3 &

# 2) serve your topology with the X-Ray template
containerlab graph --topo lab.clab.yml \
  --template ./xray-core/xray-graph.html --static-dir ./xray-core
```

Open it, click a node, then shut a link in another terminal — the open node's DeepDive follows
within a few seconds, in place (no flicker), and recovers. One-shot (no `--watch`) stays a static
snapshot; the live poll is opt-in (`LIVE_WATCH`), so the plain `graph --template` drop-in is
unchanged.

## Files

| file | role |
|---|---|
| `index.html` | the standalone replay page (real frames + topology baked in) |
| `frame{A..D}.json` / `topo.json` | the captured frames and topology this page replays |
| `build-replay.js` | regenerates `index.html` from the OSS template + captured `frame*.json` + `topo.json` |

The rendering engine (`xray-core.js` / `xray-api.js` / `clab-xray-bridge.js`) is **not duplicated here** —
this page loads it from the gallery one level up (`../`), so the demo always runs the published engine. License: MIT (see the
[`xray-core`](https://github.com/rclab-dev/xray-core) repo).
