# Changelog

User-visible changes in each release of rclab-dev/network-xray, newest first. Dates are the release tag dates.

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
