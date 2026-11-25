# test/fixtures/plan-real

Real states, not hand-made: the broken labs of `examples/q12-ospf-static`, `examples/q3-ospf` and `examples/q21-bgp-lp`
deployed with containerlab 0.83.0 (FRR, the image the examples use) on 2026-11-25 and read with
`node clab-xray-collect.js <lab> . <ospf|bgp> --exclude-mgmt` once the lab had settled. The files are the states the collector wrote
(`xray-states.js`), saved as JSON with the lab names set back to the example names. `test/plan.test.js` runs the proposed fixes of those problems through `scripts/xray-plan.js`.
