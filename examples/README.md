# examples/ — RouteCrushLab problems as containerlab labs

These labs are auto-generated from the live [RouteCrushLab](https://routecrushlab.com)
problem set by `../scripts/gen_lab_bundle.py`. **Re-run it whenever RCL publishes new
problems** to keep this directory in sync (idempotent):

    python3 scripts/gen_lab_bundle.py build_baselines.json slot_config.json examples

(`build_baselines.json` = per-problem baseline FRR config; `slot_config.json` = the
`published` flags that decide which problems are live. Both come from the RCL backend.)

## Included — 13 of 21 published problems
- **q21-bgp-lp** — curated Local-Preference best-path demo (the flagship X-Ray scenario; kept hand-tuned so the LocalPref decision is visible).
- **bgp-bestpath-multiprefix** — advanced multi-prefix example (different winner per prefix; not a numbered RCL problem).
- **q1, q2** — single-router build starters (default route / basic config; each with an `inet` upstream and a LAN `sv` server node).
- **q3, q4, q6, q7, q8, q9, q10, q13, q15, q17** — 2–3 router OSPF / BGP / static labs (generated from each problem's baseline).

## Not yet included — 8 published problems (follow-up)
**q5, q11, q12, q14, q16, q18, q19, q20** — these have no build baseline in the source
(troubleshoot-only; their config is applied at runtime by the scenario scripts rather than
stored as a static baseline), so the generator cannot emit them yet. They are tracked for a
follow-up pass; the generator will pick them up automatically once a baseline exists.

## Run any lab

    sudo containerlab deploy -t <dir>/<q>.clab.yml
    docker exec clab-<name>-r1 vtysh -c 'show run'
    sudo containerlab destroy -t <dir>/<q>.clab.yml

Render the X-Ray view over any lab with the bundle's `demo.sh`.
Learn more / try in the browser: **RouteCrushLab** — https://routecrushlab.com
