# Changelog

User-visible changes in each release of rclab-dev/network-xray, newest first. Dates are the release tag dates.

## v1.8.2 — 2026-11-25

- **Single-node panel: links drawn as the DeepDive draws them:** the link is its own line (solid in the link colour; a shut-down interface red dashed) and each protocol's tunnel is a separate pair of lines beside it, by state: OSPF Full green solid, ExStart / Exchange / Loading green dashed, 2-Way orange solid, Init orange dashed; BGP Established purple solid, not established purple dashed. The legend says the same.
- **MCP `explain_plan` / `scripts/xray-plan.js`:** what each line of a proposed fix is for, against the lab state: `fixes` (touches something listed as wrong), `requirement` (makes what a check condition asks for, e.g. a backup route), `not_linked` (not "unrelated") or `?`, each with the state values behind it; requirements in words are returned, not interpreted; nothing is predicted. The single-node panel and `xray-render.js --plan` show it as a panel and mark the links the lines touch.
- **`explain_plan`:** `checks` (with `problem`): each condition of the check, met now or not, with the lines of the plan tied to it; the panel shows it as "The check now" at the head of the plan. The tag `not_linked` is shown as "no link found", and its note says it is not a warning.
- **Single-node panel:** the What's wrong red is the variable `--xnp-down-text` (the light skin uses a darker red that reads on white).
- **Collector and SolvedKit:** `--settle` waits for matching states before saving; the rehearsal guide puts the production checklist first.
- **Collector: `--policy-config` (or `XRAY_POLICY_CONFIG=1`):** keeps the route-map and prefix-list names and prefixes as `policy_config` for `explain_plan`; off by default, so the state still holds no configuration text. Passwords, keys, descriptions and community values are never kept. README: a row in "MCP security at a glance".
- **MCP:** `prompts/list` and `resources/templates/list` answer with empty lists instead of "Method not found" (clients that ask for every list no longer count two errors).
- **MCP `list_routers`:** with no lab state yet (no path, not found, a folder without state files) it answers `routers: []` with a note on where the state comes from, instead of an error. A path outside the server's folder or a broken state file is still an error.

## v1.8.1 — 2026-11-25

- **`scripts/xray-render.js`:** one router's 2D picture and tables as one static HTML page (no script, nothing loaded from elsewhere), made without a browser: `--skin`, `--figure cylinder|box`, `--prefix`, `--detail full|summary`, `--before <state>` (what changed on that router, then before | now). The single-node panel gets `toHtml()` and `cssText()` for it.
- **docs/showing.md:** what each mark means, the same in the DeepDive, the single-node panel, a rendered page and the text answers.
- **Single-node panel: the cylinder picture:** `{ figure: true }` now draws the router as a see-through cylinder with its process as a dot and a thick arrow toward the chosen route's out-interface (the logo's way of drawing); `figureStyle: 'box'` or a skin with `panelFigure: "box"` keeps the box picture. SKIN-CONTRACT §2c.
- **Skin: `surface` and the Slate (light) preset:** a skin can put the single-node panel (the 2D picture and its tables) on a light ground (`surface: "light"`); `?skin=slate-light` or the Skin menu picks it. The DeepDive and the topology stay dark. A skin without `surface` looks as before. SKIN-CONTRACT §2b.
- **SolvedKit: rehearsing a change.** `check suggest` / `check init --for change` make the check for planned network work tried on a lab: every changed path, there and back, and every OSPF adjacency and BGP session that must stay up (a puzzle still gets the fewest conditions that tell the fix). SolvedKit guide, section 10: a worked example on q6 (settled "before" state, the way back that did not move, the backup, the rollback). `check run` with its two arguments swapped, or on a problem.json without `check.all`, says what to do.
- **`cml-xray`: `xray-states.json` too:** a Cisco CML lab gets the same document as a containerlab lab (built by `scripts/states-doc.js`, shared with `clab-xray-collect.js`), so Grafana and other tools read it the same way. README (CML2): a lab is readable 1 to 3 minutes after it starts; `cml-xray` keeps reading until the routers answer.
- **MCP: `router` or `node`:** every tool takes the router under either name (the old names keep working; two different routers in one call is an error).
- **SolvedKit: `check to-procedure`.** The check as the show commands to type on each router and what each must show (Markdown; FRR, or Cisco IOS / IOS XE with `--vendor ios`; `--lang ja`), for the people doing the work. Tried on FRR and Cisco IOL labs.
- **`llms-install.md`:** install steps an AI assistant can follow (Node with a clone, or the Docker image; how to pick `--path`; a first check with `list_routers`).
- **docs/local.md (en / ja):** fully local use: network-xray sends nothing, the data leaves only through the AI client you pick, and the one local-model setup that was tried (Ollama with a small script that hands the MCP tools to the model).

## v1.8.0 — 2026-11-25

- **Logo:** `docs/logo/` (SVG, PNG 400 / 256 / 64, a small version for 32 px and below, favicon.ico); the pages' icon is the small version; README shows the logo; `server.json` lists it as `icons` for the MCP Registry.
- **Grafana in one line:** `demo/grafana`: `docker compose up -d` starts Grafana 12 with the two plugins, the Infinity data source and the network-xray dashboard (no login, view only, this host only; `NX_URL` for network-xray elsewhere). The dashboard is also a file to import into your own Grafana (`demo/grafana/network-xray-dashboard.json`): boxes for where network-xray is and which router; the DeepDive, the routes and adjacencies tables and the Node graph.
- **`xray-states.json`:** `nodes` carry `fixedx` / `fixedy` from the topology's `graph-posX` / `graph-posY` labels when every router has both, so Grafana's Node graph draws the routers where the lab places them.
- **`wrong`: routes whose next hop is not reachable:** a BGP prefix whose paths the router marks not valid (an inaccessible next hop) and that nothing else installs, and a static route that is not installed while nothing else is (an interface that is down stays its own line). A next hop the router resolves recursively (through OSPF, a static route) is valid and not listed. An installed route whose recursive next hop is resolved only through the containerlab management network is a warning. Read from the state the collectors already write.
- **MCP `lab_state`:** optional `only_problems: true` returns only `wrong` and `counts`. Without it the answer is unchanged.
- **Best-Path: eBGP > iBGP:** after MED, the DeepDive, the single-node panel and `why_path` compare eBGP over iBGP when every path still compared says how it was learned. The collector records it as `bgp_routes[].peer_type` (FRR `pathFrom`; the `i` in the IOS-XE status; a confederation peer counts with iBGP). A state without `peer_type` is explained as before. DATA-CONTRACT §4.4.
- **MCP `why_path`:** `summary`, the answer in one line (the path, and the step that chose it with the two values), and `peer` on each path, the router its next hop belongs to.
- **Pasted BGP table: a blank LocPrf:** is the default the router compares with, read from the table header (`Default local pref N`; 100 when the header is not pasted), not a fixed 100. Such routes are marked `local_pref_default`.
- **BGP state not in the data:** a paste of only the BGP table has no session state; the node panel, the logic lines and the DeepDive now say `?` (without the fault colour) instead of Idle or NOT CONFIGURED.
- **MCP `why_path`:** "First path received" and "Nothing to Select" are not a `deciding_step` (nothing was compared): the comparison gives it (e.g. `"Only path"`) and the text is kept in `device_reason`.
- **Node panel:** shows a router's own OSPF area only (a third router no longer shows another router's area).
- **Static DeepDive:** says "(nexthop unreachable)" only when the data says the next hop is not reachable (a static route can stay out of the RIB for other reasons).
- **MCP with `docker run` or the netlab tool:** `docker exec -i <container> network-xray mcp --path /tmp/network-xray` reads the live state in that container; no copy with `curl` first ([docs/mcp.md](docs/mcp.md#where-the-state-comes-from)).
- **docs/readers.md (en / ja):** how to write a reader for another device or source in your own repository (the state it writes, how to check it with `scripts/validate-states.js`), and an issue form to list it.
- **README:** the opening says what it explains (why the routers are in the state they are in), with MCP, SolvedKit and Grafana as other doors to the same state; "MCP security at a glance" (en / ja); the 13 MCP tools as 9 that read the state and 4 for a solved check; the mcpservers.org badge. Pull requests: the same policy in softer words, and the release notes name the person who opened the issue (unless they would rather not be named). DATA-CONTRACT 4.4: what network-xray compares itself (up to MED, then eBGP > iBGP) and what it takes from the router.

## v1.7.0 — 2026-11-24

- **MCP: a picture in the chat (MCP Apps):** a client that draws MCP Apps (the `io.modelcontextprotocol/ui` extension) gets the X-Ray view of the router under the answer of `lab_state`, `why_best_path`, `why_path` and `ospf_neighbors`, with the prefix picked. One HTML resource (`ui://network-xray/view.html`) that loads nothing from outside; the lab state reaches it through `view_data`, a tool kept from the model. No URL is returned, the text answers are the same, and other clients see the tools as before.
- **Docker image: `xray-states.json`:** carries `routes` and `adjacencies` (in v1.6.0 the image left them out, so the Grafana tables of why each route won and what is wrong were empty). DATA-CONTRACT.md: with `--watch`, `generated` is the time of the last change; a grey edge is a link whose interfaces were not read.
- **`embed.html?state=`:** does not follow redirects (a redirect from an allowed site no longer sends a request to a site that is not allowed).
- **MCP `why_path`:** a path with no `local_pref` gets the same `local_pref_note` as `why_best_path` (the comparison takes the default local preference). The other keys are unchanged.
- **MCP picture:** drawn wide and scaled to the client's width; See all decision steps opens over the picture in a frame (MCP Apps, `?embed=1`).

## v1.6.0 — 2026-11-23

- **MCP:** the description of `ospf_neighbors` says first what it lists, names what it returns, and points to `ospf_interfaces` for why an adjacency is missing. The `path` argument says what it takes, with an example, and that it may be left empty when the server was started with `--path` / `NX_MCP_PATH` (it no longer names that folder, so the tool definitions are the same wherever the server starts). The answers are unchanged (same keys).
- **Collector: `xray-states.json`:** the collector also writes the states as plain JSON next to `xray-states.js`, on every round: versioned (`schema` 1), `states` the same object the page reads, the X-Ray answers (`routes` with why each won, `adjacencies` with what is wrong, from xray-query), `nodes` / `edges` in the columns Grafana's Node graph reads. `xray.sh` serves it at `/static/xray-states.json`; `--no-json` leaves it out. See DATA-CONTRACT.md.
- **Grafana:** README section: the DeepDive in an iframe panel (`?embed=1&view=deepdive&node=`), and `xray-states.json` read with the Infinity data source (Backend parser, no CORS) as tables of routes with why each won and adjacencies with what is wrong, and a Node graph.
- **`?embed=1`:** a link that opens a router (`node=` / `deepdive=1`) scrolls the frame to the DeepDive, so it is in view in an iframe of normal height.
- **`?embed=1&view=deepdive`:** the X-Ray answer first for a dashboard panel (the topology hidden, the DeepDive shrunk to the frame); a DeepDive in a sandboxed iframe no longer turns to Simple.
- **Embed with a URL only:** `embed.html?state=<URL>&poll=<seconds>` reads one JSON (config, topology, trace, state) and draws it, for a page that cannot run script (a dashboard panel). Only the site that serves `embed.html` is read, or a site listed in `embed-allow.json` next to it; an example is `embed.html?state=embed-state-example.json`.
- **Links:** `?node=r1&deepdive=1&prefix=8.8.8.0/24` (or after `#`) opens that router, the DeepDive and that prefix on `embed.html`, the containerlab graph page and the demos; a name that is not in the picture is ignored.
- **`?embed=1`:** the containerlab graph page and the demos hide their title, intro, top bar and footer, for an iframe.
- **`?skin=<id>` and `setSkin`:** an embedding page can pick a preset skin or pass a skin object. The iframe embed (`xray-embed.js`) gets `selectPrefix` and `setSkin`.
- **Collector:** only `srl` / `nokia_srlinux` nodes go to the SR Linux reader; Nokia SR OS kinds (`nokia_sros`, `nokia_srsim`) are not SR Linux.
- **llms.txt:** a section on SolvedKit and HandsOn Pack for AI agents; the release notes carry the image digest from v1.1.9 on (it said v1.1.10).
- **SolvedKit guide:** an example of making a check with an AI assistant (MCP).
- **README / llms.txt:** what it says about an OSPF adjacency that is not up (the value that differs on the two ends) and a BGP session that is down (its state), with an example line of each.

## v1.5.2 — 2026-11-22

- **SolvedKit tables (`--format table` only):** the column TELLS is now TELLS APART, the legends under the tables say more, and `check init` says "still to fill in by hand". The JSON output and the MCP tools are unchanged (same keys).
- **`./xray.sh snapshot <name>`:** saves the lab's state now as `<name>.js` (SolvedKit's broken and solved states) from a lab started with `./xray.sh`, or with `--url http://localhost:8600` from the image or the netlab tool. An existing file is not overwritten; nothing is started.
- **SolvedKit guide:** the HandsOn Pack / SolvedKit line in bold; on netlab, `--mgmt-subnet 192.168.121.0/24` when the state includes the management network; a plainer section 4 heading.

## v1.5.1 — 2026-11-22

- **Image:** `docker run -i --rm -v <lab folder>:/lab:ro ghcr.io/rclab-dev/network-xray:1 mcp --path /lab` starts the MCP server on stdio (no page, no collector, no Docker socket); the image carries the `io.modelcontextprotocol.server.name` label.
- **MCP Registry:** `server.json` for the official MCP Registry (`io.github.rclab-dev/network-xray`, the image above).
- **DeepDive:** the Routing table is no longer rebuilt when a collect round brings the same routes (it was every 3 s on a live lab): text selected in it, its scroll position and hover stay.
- **DeepDive:** the LSDB panel is drawn above the link beams and their labels (a link label could sit on top of it).

## v1.5.0 — 2026-11-22

- **SolvedKit — `xray-query.js check run` / `check verify` / `check suggest` / `check init`, MCP `check_run` / `check_verify` / `check_suggest` / `check_init`:** judge a lab's problem.json `check` on saved states without the page or a running lab (the same rules as the ✓ Solved mark). `run` answers solved / not solved / cannot judge with exit code 0 / 1 / 2; `verify` says whether a check fails on the broken lab and holds on the solved one, with a verdict per condition; `suggest` proposes the check from what the fix changed between a broken and a solved state (verified on both; it does not guess other ways to solve), and `init` puts it in a problem.json draft.
- **MCP why_best_path / `xray-query.js why`:** a path with no `local_pref` (the router did not print one) gets a `local_pref_note`: BGP then uses the default local preference (100, unless the router is configured with another default); no value is filled in.
- **Docs:** README and docs say Cisco IOL also gets `terminal length 0` / `terminal width 0` for its own SSH session (besides `show`), that viewing a lab only reads the routers, and that the MCP server reads nothing from routers by default (`collect` is the opt-in exception); `diff` lists changes by kind, the most disruptive first; clearer English in several places.
- **SolvedKit guide** (docs/solvedkit.md, English and Japanese): a first five minutes on the recorded q21 states, how to read the tables, why the check keeps a backup line, the flow on your own lab (containerlab, netlab, CML), editing the check, every error message with what to do, and questions authors ask.
- **problem.json `solved_text_en` / `solved_text_ja`:** a short note shown under the problem only while the lab is solved (before `solved_cta`), with the same tags as the problem text; `check init` puts them in the draft empty. A problem handed out without a site of its own can explain the answer.
- **HandsOn Pack:** the name for a containerlab lab handed out as a problem (the lab and a `problem.json`, as since v1.0.0); docs/problem-format.md, the SolvedKit guide (with a diagram) and README say how the two fit together: hand out exercises as a HandsOn Pack, and make their check with SolvedKit.
- **docs/ja/problem-format.md:** the problem format in Japanese.
- **`check init --out`:** makes the folder when it is not there; with `--format table` it no longer runs twice (the second run stopped with "already exists" after the file was written).

## v1.4.4 — 2026-11-20

- **MCP:** the descriptions of `why_best_path` and `why_path` say which to pick (`why_best_path`: a quick look at one exact prefix and the reason stored in the data; `why_path`: also takes an address and compares the candidates step by step when the router gives no reason).
- **Docs:** README links the quickest MCP setup; README and docs/mcp.md say what the MCP server reads (the state files the collector writes for a containerlab, netlab or Cisco CML lab), not your computer's own network.
- **Docs:** README says netlab 26.11 and later have their own `network_xray` tool definition (it publishes the page on all host interfaces; this repository's defaults file uses 127.0.0.1 only), and with `validate: True` it keeps `network_xray/validate.json` up to date; docs/mcp.md: the `.mcp.json` that `claude mcp add` writes has `--path` too.
- **Docs:** docs/mcp.md says what `--path` takes (a folder or a state file), what the answer outside the folder says, and how to set `NX_MCP_ALLOW_ANY_PATH` in a JSON config.

## v1.4.3 — 2026-11-19

- **MCP (behaviour change):** the server reads only under one folder by default - the `--path` folder (for a file, its folder), or the folder it starts in. `--allow-any-path` (or `NX_MCP_ALLOW_ANY_PATH=1`) reads any path the client gives, as before. A state file over 64 MB is not read.
- **Pages:** the triangle lab's tools card shows the problem's id, its button label and the ping target as text.
- **Collector:** the small "vrf all not usable" note is kept in the user's cache folder (`~/.cache/network-xray`), not in the shared tmp folder.

## v1.4.2 — 2026-11-19

- **state_diff / `xray-query.js diff`:** an interface that is new is reported (`iface_added`), and one removed while it was already down is `iface_removed` (it was shown as `up → absent`). This was the known issue of v1.4.1.
- **state_diff:** a recursive route whose resolution moved to another interface (no address given) is reported; an interface written by hand as `"up": "false"` counts as down. The docs say the order is by kind, not a traced cause.
- **state_diff / `xray-query.js diff`:** the lab's management network can be given (`mgmt_subnet` / `--mgmt-subnet <cidr>`; netlab uses 192.168.121.0/24), as the collector's `--exclude-mgmt` already reads it from the topology. Without it nothing changes (172.20.20.0/24).
- **Pages:** on the 日本語 toggle the DeepDive's English panel headings (Router — Internal View, Routing table, BGP Table, Best-Path Decision, …) are shown in Japanese; Routing Engine, neighbor and the protocol words (OSPF, LSDB, Full) stay English.
- **DeepDive:** an LSDB row from the route to the target showed escaped characters (`&quot;`) for a prefix with quotes; a ping mode the page does not know, with a space in it, or a node name with a quote or a space, no longer stops the drawing.
- **bgp-paste:** the DeepDive's BGP Table shows the pasted routes (it said "No routes received (BGP session is up)" next to them).
- **FAQ:** the paste pages work with no network, opened from the repo zip on disk.
- **Docs:** README and llms.txt say how to give the MCP server a default state (`--path` / `NX_MCP_PATH`); `host` nodes are drawn, not read (with `bridge` / `ovs-bridge`); DATA-CONTRACT: `resolved_via` came in v1.3.1.
- **Examples:** the solved q21 lab's header comment says what the lab does (r2 wins with LocalPref 150, r3 is the backup; it still described the unsolved lab).
- **netlab:** the band shows netlab's own validate results when the lab folder has `network_xray/validate.json` (written by netlab's network_xray tool with `validate: True`, netlab 26.11 or later), in netlab's words; results older than two of the plugin's runs (`interval`, else a minute) are kept and dimmed. Without the file, the band checks the tests itself as before.
- **README:** the Caution box is two bullets (why the socket / no socket needed); the Codespaces quota in hours (about 30 a month); a memory-limit example (`--memory 300m`); how to check what a change (an Ansible playbook) did with `diff`.

## v1.4.1 — 2026-11-15

- **MCP:** start the server with `--path <state>` (or `NX_MCP_PATH`; the option wins) and the tools that take `path` read it when the client gives none; `tools/list` then shows `path` as optional. A `path` the client gives is still used. Without it nothing changes.
- **state_diff / `xray-query.js diff`:** a node given as `null` no longer stops the comparison; a field one side did not collect is not compared (it was reported as lost or new) and is listed under `not_compared`; BGP peers with the same address in two VRFs are kept apart.
- **Collector:** a `bridge`, `ovs-bridge` or `host` node with links is drawn, not read: no reader is started for it each round.
- **Recorded demos:** each frame stays 6–7 s, the pause button has a symbol, and closing the DeepDive pauses the replay (it kept playing on the overview).
- **Fixed:** in v1.4.0 the DeepDive's LSDB table had no rows for network LSAs (type 2): the networks of a broadcast segment were missing (the header counts were right).
- **Memory, corrected:** the network-xray container uses about 30 MB between reads; while it reads the routers (one reader per router) it peaks at about 110 MB with 3 routers and 260 MB with 10. v1.4.0's README said "up to about 100 MB in its first minute, then about 50 MB", which was wrong: the peak comes back on every read. A memory limit on the container should be above that peak.
- Docs (en / ja): the README top leads to the recorded demo first and says how quick each way to try it is; the Docker socket note is a caution box with the ways that need no socket; `xray-states.js` is JavaScript for the page (for JSON, use `xray-query.js state` or the MCP tools); on a shared machine keep the lab folder readable by you only; the FAQ answers how heavy a large lab is, which BGP values are drawn and whether a route-map change shows; docs/mcp.md says what `state_diff` returns more exactly.
- Known issue: `state_diff` does not report an interface that was added, and an interface removed while it was down is shown as `up → absent`.

## v1.4.0 — 2026-11-14

- **What changed from a baseline:** `xray-diff.js` compares two states and lists what changed, causes first (an interface down, an OSPF interface value, a lost adjacency or BGP session) before what they broke (best paths and routes, every ECMP next hop; a route now resolved through the management network comes before best-path changes). `xray-query.js diff` and the read-only MCP tool `state_diff` give the same answer for one router or the whole lab; `collect` (with `--allow-collect`) can keep the state it replaces (`keep_previous`).
- The page keeps a baseline in memory (never written) and shows "Changed since the baseline" under What's wrong in the DeepDive's Routing Engine panel and in the node panel: keep / new baseline / clear. With many changes the first three show and "N more" opens the rest.
- OSPF database: `clab-collect.js` reads the router ID, the LSDB (without MaxAge LSAs), every router LSA with its stub networks and OSPF's route table. `route_lookup` starts with why a destination has no OSPF route here (a router has it but does not advertise it, a duplicate router ID, OSPF has it but the routing table did not install it, a static route not redistributed, an inter-area route). With that database the DeepDive's LSDB panel is a small table of the LSAs (prefix, LSA type, the router it is from) and its header counts them by type; older states keep the panel as before.
- The OSPF Neighbor line in the Routing Engine panel (and the node panel's What's wrong) counts the interfaces facing a neighbor: "Full 2 · no adjacency 1", the same count as `lab_state`; older states keep the one word.
- `xray-query ospf-if` and MCP `ospf_interfaces`: `mismatch_details` gives each mismatch line as fields, with `odd_end` naming the end whose value differs from its own router's other OSPF interfaces (inferred, with a note; `null` when that does not decide it).
- DeepDive: the Routing Engine panel and the Routing table no longer cover each other. When the table cannot be capped under the panel, the panel is capped above it and scrolls inside (What's wrong stays at its top); a table placed from its top (many routes) is moved under the panel and capped.
- Recorded demos: the OSPF replay no longer asks for a file it does not need (a 404 in the console), the topology box fits a phone screen, and the replays point to the Best-Path Decision demo. The paste pages' text boxes have labels.
- README (en / ja): three ways to try it (just look, GitHub Codespaces, your own lab), what to know before you run it (memory, WSL2, the routers it reads, the `.clab.yml` is mounted read-only), a table of the routers it reads, that it is also an MCP server, how it differs from Topolograph, how a bridge between routers is drawn, why pull requests are not merged, and, for netlab in CI, not to keep the lab folder as an artifact. docs/mcp.md (en / ja) starts with the `path` every tool takes and has a Cursor `.cursor/mcp.json` example. The example READMEs say which port is which.

## v1.3.2 — 2026-11-13

- xray-query and MCP: the `lab_state`, `ospf_interfaces`, `ospf_neighbors` and `bgp_neighbors` answers start with `wrong` (one line of `text` each: an interface down, an OSPF interface facing a neighbor with no adjacency and the values both ends disagree on, Full but a value differs, a BGP session not up; `[]` when nothing is wrong). `lab_state` also counts the OSPF interfaces that should have an adjacency and those without one (`ospf_ifaces_expected`, `ospf_ifaces_full`, `ospf_ifaces_without_adjacency`): a neighbor that never came up is not in the neighbor table, so `ospf_full` / `ospf_total` alone can read all Full. `--format table` starts with "What's wrong" when there is something.
- Docs (en / ja): docs/mcp.md starts with the usual setup (one `claude mcp add` line for a lab started with `xray.sh`, how to ask, and how to copy the state out of the docker / netlab container) and says what `--allow-collect` needs (access to Docker; macOS Docker Desktop and a remote Docker are not tested). The README lists what the page does not report on a live lab (route-map results, prefix-list denies, `next-hop-self`, `update-source`, a duplicate Router ID) and shows the DeepDive starting with what is wrong.
- DATA-CONTRACT: what each collector puts in `lsdb_prefixes` (the LSDB panel), that `ospf_lsdb` comes from `frr-collect.js` only, that `area_match` is set only with a Full neighbor, and the Router ID fields among those the bundled collectors do not fill.

## v1.3.1 — 2026-11-12

- The DeepDive's Routing Engine panel starts with what is wrong: interfaces down, OSPF interfaces with no adjacency or with a value both ends must share that differs ("hello 3 ⇔ 10"), BGP sessions not up; a line opens that interface. Healthy OSPF interfaces fold to one line each, and a long routing table gets a filter with counts per exit interface. The node panel shows the same list first and keeps its routing and BGP tables in their own scroll boxes under the figure.
- Routing table and `route_lookup`: a recursive next hop says what the router resolved it through (`resolved_via`); when that is the containerlab management network (`via_mgmt`), the DeepDive says so under the routing table, because inside the lab topology the next hop is not reachable.
- Best path: a tie with no stored reason is put on the steps the table does not show (eBGP over iBGP, IGP metric, Older Path between eBGP paths only, Router ID) without naming one, on IOS-XE as on FRR; the README and FAQ say so.
- MCP: an opt-in `collect` tool (start the server with `--allow-collect`) reads a running containerlab lab's routers again and returns a new state path, so an assistant can change a router, `collect`, and ask `why_path` without leaving MCP. It takes only `topology` and `proto`, runs one collection at a time (at most 120 s), and writes into a directory of its own. Without the flag the tool is not listed. `docs/mcp.md` (en / ja) says which of the tools are read-only (the eight default ones) and how `collect` is marked.
- Embed in an iframe: `xray-embed.js` and `embed.html` put the view in a frame, so the engine's CSS and the classes it sets on `<body>` (a dark background and light text while X-Ray is on) stay off the page it is embedded in, and that page's CSS stays off the view. The calls are the same as the `xrayCore` facade; `embed-example.html` shows it, and the README puts the iframe first.
- Collector: a node labelled `graph-hide` with no links (nrx's graphite web view) is left out, not listed as a node network-xray cannot read; a `graph-hide` node with links is read as before. `graph-level` is read from the node's own `labels:`. README and FAQ (en / ja) say so.
- The XrayUnified copy in the pages: `fromLegacyState` keeps link state, the resolved exit interface and forwarding, as the standalone `xray-unified.js` does (a test holds the two together).
- README (en / ja): the containerlab VS Code extension opens the page on `localhost` for a lab on this machine; the Web app, and the extension on a remote connection, open it on the lab host's name, so with `127.0.0.1:8600:8600` the page opens only on the lab host itself. Checked with containerlab 0.83.0.
- Docs: one table of where the page listens for each way of starting it (README, en / ja); the FAQ (en / ja) says how to run without giving the container the Docker socket, how it differs from reading `show` output by hand, how it relates to Cisco pyATS / Genie, and that macOS has not been tried; llms.txt lists `show vrf` for IOL; DATA-CONTRACT lists the engine fields the bundled collectors do not fill (duplicate Router ID, `update-source`, `next-hop-self`, route-map result, prefix-list deny, static routes, …), so the page does not report them on a live lab.

## v1.3.0 — 2026-11-11

- **Listening address:** `xray.sh`, the netlab tool and the `run.sh` in each release folder now listen on `127.0.0.1` by default, so the page is on this machine only. To open it from other machines as before, use `./xray.sh --bind 0.0.0.0` (or publish `-p 8600:8600`, or start `BIND=0.0.0.0 ./run.sh`); the page has no login, and `xray.sh` and `run.sh` say so when they start.
- Any topology `prefix:` works (no prefix, `clab`, `""`, `__lab-name` or your own word): the collectors find the routers by containerlab's labels. Routers with no links are read too.
- OSPF interfaces: the collectors record MTU, hello / dead, network type, area, cost, role, passive and authentication per interface and compare both ends of each link. `xray-query.js ospf-if` and the MCP tool `ospf_interfaces` show the values, the fields that do not match, the neighbor state, and a hint when the neighbor is Full but a value that must match differs. DeepDive shows the same rows in the Routing Engine panel, with a warning line for the Full-but-different case.
- Cisco pyATS / Genie: `genie-to-xray.js` reads Genie parsed output (IOS-XE), and `xray-query.js` and the MCP tools accept a Genie folder.
- Best path: the node panel compares each step only among the paths still in play, names a stored reason when the visible attributes tie (instead of saying Router ID), keeps one destination per prefix length and VRF, and shows MED 0. The Best-Path panel decides a tie between iBGP paths by Router ID, as FRR does. The MCP tool `why_path` returns `reason_source: "derived"` for a reason the IOS-XE collector worked out (the same reason `why` returns), and `why` / `why_path` read `sel_reason` too.
- Topology and node panels: a path stops at a down exit interface, a down interface is drawn down, an adjacency is not taken from an interface being up, two links to the same neighbor stay two links, switching nodes resets the chosen prefix, and any node name is traced.
- `clab-to-xray.js`: endpoints outside the node list, more than one link between two nodes, flow-style mappings, self links, bridges and kinds from defaults / groups are read correctly.
- Example labs: each topology has a `.clab.yml.annotations.json`, so the containerlab Web app and VS Code extension open it in the same layout. The README (en / ja) says how to open the page from the VS Code extension and the Web app.
- README and FAQ (en / ja): how issues and pull requests are handled, `reason_source` as the CLI and MCP return it, CML tried on CML 2.10 with IOL, the `docker` group, and who restarts FRR after a deploy.
- Removed an unused IOS-only OSPF comparison and its `<peer>_ospf_mismatch` field from the states schema (nothing wrote it).

## v1.2.2 — 2026-11-10

- `cml-xray.js` (Cisco CML2): long runs keep reading the routers, Pause also stops a round already in progress, an interrupted key setup on the jump host is cleaned up, and the askpass helper on Windows takes no arguments. The README says that `--listen` other than `127.0.0.1` has no login.
- Paste pages (FRR 10): every BGP route is read (7-digit MED, wrapped prefixes), `(Policy)` is an established session, "BGP instance not found" means no BGP rather than an idle session, the forward arrow follows a learned best route, and two OSPF links to one router stay one router.
- Paste pages: every neighbor on a LAN is linked, FRR 10.7 local routes (`L`) are read, route flags are kept as printed, and a new "Estimated by network-xray" box lists what the paste does not show (for example, no green Ping OK without a ping).
- README and `docs/network.md` (en / ja): what read-only means, and what is not read-only.
- The NeXt UI page uses the system fonts instead of bundled webfonts.
- `netlab-validate.js`: values under more key names are not shown in test results, and only known address families are read.

## v1.2.1 — 2026-11-09

- Docker image: containerlab 0.83.0.
- `xray.sh` and the image: containerlab's own update check is off unless you set `CLAB_VERSION_CHECK`; the image finds the lab's containers by their containerlab label (a lab named `a` no longer picks up the containers of a lab named `a-b`).
- `xray.sh` says when it starts that it listens on all interfaces and that the page has no login; `SECURITY.md` states the default.
- Collectors: in labs that mix FRR and SR Linux, the OSPF Hellos of SR Linux neighbors are found; node names such as `constructor` are left out with a warning; `frr-collect.js` marks a router whose answer is too large as unread.
- `xray-query.js`: unread routers in the list and the table, IPv6 prefixes in any case or zero padding, and a note when you ask by address. The MCP server reports version 1.
- `netlab-validate.js`: values under password / secret / token / private key names are not read (the test shows as not checked).
- Simple view: interface and node names in the labels are written as text, as in the other views.
- The BGP paste page reads FRR up-times with three units (`1d02h03m`, `02w3d04h`), so a session up for more than a day is shown as Established.
- New: `scripts/demo-locpref-flip.sh` deploys the q21 example, changes one LocPref and shows the best path flip (`docs/demo-locpref-flip.md`, en / ja).
- Docs: a "How it works" diagram, where to start the first time, the image digest in each release's notes, how the page checks for updates (no WebSocket), released versions stay MIT; troubleshooting by symptom (en / ja); `llms.txt` with rules for AI agents.

## v1.2.0 — 2026-11-08

- Cisco CML2 labs (CML-Free works): `node cml-xray.js --lab "<the lab's title>"` reads the lab's nodes and links from the CML REST API and the IOS nodes over SSH on the lab's management network (through a jump host that takes a key only), and serves the same graph and DeepDive page. Read only: `show` commands and API GETs; nothing is typed on the CML consoles unless you pass `--console`.
- The CML page: node positions come from the CML lab, a Pause button, routers that stop answering turn grey with a note, and the problem band with "✓ Solved".
- CML's own certificate: `--save-cert <file>` saves the certificate CML shows and prints its fingerprint, and `CML_CA_FILE=<file>` then accepts that one certificate only; `--insecure` skips the check.
- README: a Cisco CML2 section (en / ja), with how to add a management network and a jump host to a lab. Tried on CML 2.10 with IOL 17.18.

## v1.1.9 — 2026-11-07

- OSPF on the page: the neighbor-state text and the OSPF process circle use the same colors as the line (Init / 2-Way orange, ExStart to Loading and Full green), and a link to a single neighbor is drawn in the same four styles as the others.
- Best-Path panel and `xray-query.js why`: a reason that the collector derived for Cisco IOS-XE is shown as inferred by network-xray, not as reported by FRR.
- Collectors: a router whose answer is too large to read is marked unread instead of being shown with every neighbor down (FRR, SR Linux); on Cisco IOS-XE an OSPF interface that is down is no longer counted in the router's own LSA.
- The recorded OSPF and BGP replay demos and the OSPF GIF were recorded again from real labs.
- `xray.sh` no longer stops with exit code 141 on systems with busybox `sed`.
- The Docker image's healthcheck counts only a 2xx / 3xx answer as healthy and uses the last `--port`.
- The MCP server answers one fixed error message for a file that is not network-xray state.
- Docs: README and `docs/dev/likely-questions.md` say what is not read yet, which best-path steps are not compared, what the collectors run, ways to avoid mounting the Docker socket, Node 18 and 24, and one scale-bench run.
- New tools and checks: `scripts/capture-frames.js` and `demo/build-replay-bgp.js` (recording replay demos), `scripts/check-doc-commands.js`, `check-copies` fails on an unlisted copy, `.gitattributes` with a test that text files have no CR, CI on every push and pull request.

## v1.1.8 — 2026-11-06

- Lighter refresh: the collector writes the state once per round (to a temp file, then renamed) together with a small signature file, and the pages reload the state only when a router changed and not while the tab is hidden.
- `xray.sh` and the Docker image say what is wrong when Docker cannot be reached (no socket, not a socket, permission denied) and stop before deploying. A `docker info` that hangs is cut at 10 s, and other Docker errors with a usable socket do not stop the run, as before.
- containerlab: a `prefix:` other than `clab` stops with a clear message, and a lab name followed by a comment is read.
- Cisco IOS-XE: `show vrf` is read, and VRFs other than the global table are named as not read yet.
- A router that does not answer, or ignores SIGTERM, is cut at the collector's own timeout; `frr-collect.js` reports it as not answering after 8 s.
- The compose demo server sends security headers and serves only the page files.
- Recorded output from real routers: FRR 8.4 and 10.7 for each BGP best-path step, and Cisco IOL for BGP best-path steps and OSPF neighbor states other than Full; the hand-written FRR samples now use the words FRR really prints.
- Docs: `docs/network.md` (every connection, en / ja), `docs/windows-wsl2.md` (en / ja), "Filename too long" on Windows in troubleshooting, the netlab tool defaults explained, and `THIRD_PARTY_NOTICES` says what is known and unknown.
- New checks and tests: `scripts/check-problem-json.js`, `scripts/check-no-external.js`, `scripts/dev/graph-bench.js`; tests for collectors that hang, the `xray-query.js` subcommands, FRR OSPFv3, SR Linux output variants, every FRR best-path reason and IOS-XE best-path steps.

## v1.1.7 — 2026-11-05

- Security: node names are escaped in the DeepDive labels, and `xray.sh` serves only the page files.
- `xray.sh --check`: checks docker, containerlab, node, the port, the topology and the IOL images, says what to fix, and starts nothing.
- `xray.sh --attach`: graphs a lab that is already running without redeploying it (changes made by hand are kept); `xray.sh` warns before redeploying a running lab.
- All command-line tools answer `-h` / `--help`, and an unknown option prints one line and exits.
- The compose demos listen on `127.0.0.1` only.
- The Docker image has a healthcheck and also runs with `--read-only --tmpfs /tmp`.
- Cisco IOS-XE: more `show` output variants are read (timestamp lines, `O*E2`, wrapped route lines, RPKI marks, a default route without mask).
- The node panel reads the BGP Origin words (IGP / EGP / incomplete).
- IPv6 addresses are no longer read as IPv4 when matching prefixes.
- Tests no longer share temp folders or depend on file order, so they pass reliably on busy machines.
- Replay pages: one shared replay bar (buttons, frame dots, arrow / Space keys) that no longer covers the title.
- The DeepDive "Powered by" link is plain text.
- Docs: `SECURITY.md`, `CHANGELOG.md`, Japanese versions of the FAQ, the MCP guide and the troubleshooting page, `docs/dev/likely-questions.md`, a README section on which way to start, and the Japanese README caught up with the English one.
- New checks: `scripts/release-check.js`, `scripts/check-links.js`, `scripts/check-examples.js` (complete list), `scripts/check-solved-pairs.js`, `scripts/check-example-topologies.js`, and `check-i18n` reads inline pairs and `data-i18n-aria`.

## v1.1.6 — 2026-11-04

- The collector no longer waits for a slow or stopped router: the others keep updating, and that router keeps its last state until it answers again.
- `xray.sh`: `--bind <address>` (default `0.0.0.0`) and `--interval <seconds>`.
- MCP server: new `why_path` tool (the selected BGP path, the other candidates and the deciding step).
- `xray-query.js`: `--format table` prints the answers as a plain-text table (`--color` in a terminal).
- FRR: the OSPF link-state database is read (with the area), and the JSON of more FRR versions is understood.
- BGP best path: a path dropped at one step is left out of the later steps; MED is compared only between paths from the same neighbor AS; Router IDs are compared as numbers.
- Cisco IOS-XE: a multipath BGP route is counted as installed.
- SR Linux: OSPF neighbors in the middle states (2-Way, ExStart, ...) are shown by that name.
- OSPF walkthrough: ExStart and 2-Way are described as in RFC 2328.
- `route_lookup` rejects ambiguous addresses (leading zeros, empty parts).
- Router-supplied values are escaped before they are inserted into the page.
- Graph pages: a router's DeepDive opens from the keyboard, focus is visible, and text contrast meets WCAG AA.
- A JSON Schema for the state files, and `scripts/validate-states.js` to check them.
- New docs: `docs/troubleshooting.md` and `docs/mcp.md`.

## v1.1.5 — 2026-11-03

- MCP server: new read-only tools `list_routers`, `ospf_neighbors`, `bgp_neighbors` and `route_lookup`.
- `xray.sh`: checks the port number, ignores `CDPATH`, stops when the page template is missing, and allows only one run per copy at a time.
- Error messages say what to fix when `ssh` is missing or the login is refused, point at `docker ps -a` for a stopped container, and give the SR Linux `sr_cli` hint.
- SR Linux: a malformed netmask no longer makes the collector loop forever.
- `llms.txt` rewritten as a short plain-text guide to the project for AI tools.

## v1.1.4 — 2026-11-03

- When no state was collected (the paste page, or the graph opened without the collector), the view is grey, has no moving light, and a note says it is not connected to the routers.
- BGP: a neighbor that cannot be placed on a link is left unplaced instead of guessed.
- The graph overview drew nothing (a script error); fixed.
- Three Cisco IOS-XE patterns no longer stall on long runs of spaces; FRR JSON fields that are not text are treated as missing.

## v1.1.3 — 2026-11-02

- `demo.sh` is renamed `xray.sh` (it runs any containerlab lab); `demo.sh` still works and runs `xray.sh`.
- New read-only MCP server (`scripts/xray-mcp.js`, stdio).
- A router with `router bgp <AS>` and no neighbor is no longer shown as a failed BGP (FRR and IOS-XE).
- OSPF states from IOS-XE use the same names as FRR, so the adjacency colours apply to every state.
- "Hello sent, no neighbor" also appears when the router's neighbor list is empty.
- Cisco IOS-XE best path: an invalid iBGP row is read as iBGP, and paths that are not valid are left out of the comparison.
- Best-Path Decision box: redraws on a live change while open; closes on an outside click or Esc.
- IOL labs: start-up messages say the routers take about a minute and point to `ssh`.
- Every string on the page has English and Japanese text.
- New `docs/faq.md`.

## v1.1.2 — 2026-11-02

- Router and topology text (names, descriptions, BGP and route fields) is escaped before it reaches the page.
- The collector rejects unsafe names and paths from topology files.
- The SR Linux reader no longer fails on malformed or unexpected JSON; the IOS-XE reader counts lines it cannot read instead of guessing.
- BGP best path: fixes found by the new FRR best-path tests (confederations and others).
- The OSPF neighbor count is the router's own neighbor list; a LAN link with several neighbors is drawn from all of them.
- New `scripts/xray-query.js`: answer questions about a collected state from the command line.

## v1.1.1 — 2026-10-30

- BGP paths that cannot be used are shown in light red, with the router's own mark and a reason on click (FRR and IOS-XE).
- FRR OSPF over VLAN interfaces is drawn on its link.
- `demo.sh` reads the IOL examples as BGP / OSPF.
- IOS-XE: OSPF area on BDI interfaces and the BGP prefix length are read.

## v1.1.0 — 2026-10-30

- Cisco IOS-XE (IOL in containerlab) is read over SSH and drawn like FRR.
- ECMP, unnumbered and BDI links.
- The collector no longer crashes on malformed FRR JSON.
- A 1-second OSPF Hello no longer overflows the animation.
- DeepDive panel fixes.

## v1.0.13 — 2026-10-27

- Image: containerlab 0.82.0 (pinned by checksum); npm, npx, corepack and yarn are removed from the image (not used at run time).

## v1.0.12 — 2026-10-27

- Image build pinned (actions by commit, Node.js by digest, containerlab by checksum).
- The `docker run` examples publish the page on `127.0.0.1` only.
- The Preview pop-up is offered only for links to the project's own lab site.

## v1.0.11 — 2026-10-26

- After an example lab is solved, an optional link (`solved_cta`) to a matching hands-on lab, with a preview on click.

## v1.0.10 — 2026-10-26

- The BGP table of every VRF, one VRF at a time.
- The process ball is drawn behind the link lines.

## v1.0.9 — 2026-10-26

- Node.js 24 in the image and the compose demos.
- One arrow per ECMP path.
- Links in containerlab's extended form are read.
- The badge link follows the page language.

## v1.0.8 — 2026-10-23

- OSPFv3, VRFs and OSPF areas.
- ECMP, and prefix lengths in the BGP table.
- Long AS paths are no longer cut.
- Pages fit phone-sized screens.
- The netlab tool is renamed `network_xray`.

## v1.0.7 — 2026-10-22

- The page starts updating even when it is opened right after the lab starts (for example right after `netlab up`).

## v1.0.6 — 2026-10-20

- The spare tunnel devices the kernel adds to every container (`gre0`, `ip6tnl0`, ...) are left out.

## v1.0.5 — 2026-10-19

- Names from the topology are never passed to a shell.
- No false **Solved** right after the lab starts.
- Routers that cannot be read are shown as such.
- arm64 image.

## v1.0.4 — 2026-10-15

- netlab validate tests are shown on the page.
- Rows in the graph (graph-level and netlab groups).

## v1.0.3 — 2026-10-15

- Docker image and netlab tool definition.
- The problem band also shows with `docker run`.
- Translation fix in the best-path pop-up.

## v1.0.2 — 2026-10-15

- Example labs: FRR is restarted when zebra stops at start-up (FRR 8.4).

## v1.0.1 — 2026-10-14

- OSPF neighbors without an adjacency are shown as Down.
- The DeepDive panel you click comes to the front.
- Codespaces uses containerlab 0.81.

## v1.0.0 — 2026-10-12

- First public release: live OSPF / BGP state from containerlab labs drawn in the browser, with the DeepDive panel, the Best-Path view, the paste pages and the example labs.
