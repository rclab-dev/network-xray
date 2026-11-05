# What `containerlab graph` 0.82.0 passes to a `--template` page

`data.json` is the `{{ .Data }}` that containerlab 0.82.0 wrote into a template page for `topology.clab.yml`
(captured on Linux, `containerlab graph --topo topology.clab.yml --template probe.html -s 127.0.0.1:<port>`,
with a probe page that only holds `<script id="clab-data" type="application/json">{{ .Data }}</script>`).
The `r1` image `frr<b>&x` is there on purpose: Go writes `<` `>` `&` as `\u003c` `\u003e` `\u0026`, and `JSON.parse` must give the text back.

`test/clab-graph-data.test.js` checks that every field `xray-graph.html` / `xray-graph-nextui.html` read is in it.
When a new containerlab version is listed in the README's *Tested with*, capture again with the same command and compare.

Also seen on 0.82.0: the page is rendered with Go `html/template` (`{{ printf "%s" "<i>" }}` comes out as `&lt;i&gt;`);
`.Data` is passed as trusted JSON, so it is not escaped a second time.
