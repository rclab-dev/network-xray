# Changelog

User-visible changes in each release, newest first. Dates are the release tag dates.

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
