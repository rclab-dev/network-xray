# Likely questions

The 15 questions a skeptical reader is most likely to ask, with short answers checked against the code.
File references are to the current tree; line numbers drift, so search for the named function or variable if one is off.
Where the honest answer is "not supported" or "inferred", it says so.

## 1. How does it read the routers?

With each router's own CLI. There is no agent, SNMP or gNMI.

- **FRR:** `docker exec <container> vtysh -c '<show> json'`: interfaces, routes, BGP summary and RIB, OSPF neighbors and interfaces, plus `show running-config` (`clab-collect.js`, the command list around the `vrf all` fallback). OSPFv3 commands are added only when the config has `router ospf6`.
  In the compose demo, `vtysh --vty_socket` is used over shared vty sockets instead of `docker exec` (`XRAY_VTY_SOCK_DIR` in `clab-collect.js`).
- **Nokia SR Linux:** `docker exec <container> sr_cli 'info from state <path> | as json'`, and the path must match a fixed character set (`clab-srl-collect.js`).
- **Cisco IOL:** SSH to the management IP (from `docker inspect`). It sends `terminal length 0`, `terminal width 0`, a fixed list of `show` commands, then `exit` (`clab-iosxe-collect.js`).
- **Choosing a collector:** `clab-xray-collect.js` picks one per node from the containerlab `kind` (`isSrl`, `isIos`); every other kind goes to the FRR collector.

## 2. Can it change anything on my routers?

The collectors don't change anything. They only run `show` / `info from state` commands, plus `terminal length/width 0` on IOL. No collector has a code path that enters config mode or saves config.

Two qualifications:

- **No allowlist enforces this.** "Read-only" holds because the command lists are fixed in the source. `test/collector-safety.test.js` tests that node names, hosts and link names can't be read as options or shell, not which commands run.
- **`xray.sh` is more than a collector:** it runs `containerlab deploy --reconfigure`, and if an FRR container's vtysh doesn't answer it runs `watchfrr.sh restart all` (up to 3 times) (`xray.sh`). That's lab management, not a config write, but it does change running state.

The config the FRR collector reads is not stored. Only parsed facts (BGP/OSPF configured, static prefix and next hop) leave the collector; `test/collector-config-secrets.test.js` plants passwords and keys in a fake running-config and checks that none reach the output.

## 3. Which devices and versions?

Only three are read:

- FRR
- Nokia SR Linux
- Cisco IOL (`cisco_iol`)

Everything else is drawn grey as an unread "device" and not collected:

- Arista cEOS, Juniper
- Cisco c8000v / csr1000v / cat9kv
- Linux hosts

Nokia SR OS (`nokia_sros`) also ends up unread, but by a different route: its kind matches the SR Linux pattern, so it is sent to the SR Linux collector (see Q15).

The comment at `isIos` in `clab-xray-collect.js` says the other Cisco kinds "come when checked".

Versions actually tried (README "Tested with"): FRR 8.4 and 10.7.1, SR Linux 26.3.3 (and 26.7.2 as the device under test in netlab's BGP tests), IOL 17.18.02, containerlab 0.81/0.82, netlab 26.10, Node 18. The test evidence is narrower:

- **FRR:** `test/frr-json-versions.test.js` uses hand-made fixtures shaped after FRR 8.4 / 9.1.3 / 10.7.1 source, not captures. Real captures exist for FRR 8.4.
- **SR Linux:** the stored capture is from v24 (`fixtures/srl-collect-sample/`).
- **IOL:** real captures are in `test/fixtures/iosxe-*`.

## 4. Which protocols?

- **OSPFv2:** FRR, SR Linux, IOL.
- **OSPFv3:** FRR only.
- **BGP:** IPv4 unicast only. **IPv6 BGP is not supported.**
- **Static routes:** FRR only, from running-config.
- **IS-IS, EIGRP, RIP:** not collected. They appear only as route-code labels in IOS route parsing (`clab-iosxe-collect.js`).
- **VRFs:** all VRFs on FRR, `default` only on SR Linux, none on IOL (a warning is printed).

## 5. How is this different from `containerlab graph`?

It is built on it.

- **What `containerlab graph` already does:** serves the page and the topology data. The templates `xray-graph-nextui.html` / `xray-graph.html` read `containerlab graph`'s template data (`{{ .Data }}`) and are passed to `containerlab graph --template ... --static-dir ...` by `xray.sh` and `docker/entrypoint.sh`.
- **What network-xray adds:** live protocol state (neighbor states, best paths, routes) collected from the routers, drawn on that topology, and an explanation of why each path won.
- **Without the protocol state** it would just be the containerlab graph.

## 6. How is it different from netlab?

netlab builds and configures labs; network-xray only reads them.

- `docker/netlab-defaults.yml` lets `netlab up` start the network-xray image as a netlab tool next to the lab.
- `netlab-validate.js` replays netlab's `validate` tests, but only `bgp_neighbor` and `bgp_prefix` on FRR. Every other test is shown as "not checked" and never counted as passed.
- It is not a replacement for `netlab validate`.

## 7. How is it different from Batfish or SuzieQ?

Different jobs, and no integration with either.

- **Batfish** models configs offline and answers "what would happen". network-xray models nothing and shows only what the running lab routers report.
- **SuzieQ** collects state from production fleets over time, many vendors, with a database and queries. network-xray reads three lab NOSes, keeps only the current state (a file rewritten when the state changes), and is aimed at learning and lab debugging.
- **The only code reference to either** is that `netlab-validate.js` recognises netlab's `suzieq:` test type so it can mark it unsupported.

## 8. Is the Docker socket mount safe?

Not in the sense of being sandboxed. Access to the Docker socket is root-equivalent on the host.

- **The image mounts it** (`-v /var/run/docker.sock:...` in `docker/Dockerfile` usage and `docker/netlab-defaults.yml`) so it can run `docker exec` into the lab containers through the `docker` CLI. It never opens the socket directly.
- **Your lab directory is mounted read-only** (`/lab:ro`).
- **Docker has no read-only socket**, so the safeguard is the fixed command lists (Q2), not a technical boundary.
- **If that's unacceptable,** run `xray.sh` on the host as a user in the `docker` group (same trust, without a container), or use the compose demo (`demo/compose-ospf/`), which shares FRR vty sockets and needs no Docker socket at all.

## 9. The page has no login. Who can see it?

Anyone who can reach the port. There is no authentication of any kind.

- **The page is read-only:** it has no write endpoints. `containerlab graph` serves static files and the state file, and `xray-api.js` is browser-side code, not an API server. But it shows topology, addresses and routing state.
- **What each way of running it binds to:**

| How you run it | Listens on | Notes |
|---|---|---|
| `xray.sh` | `0.0.0.0` by default (`BIND=0.0.0.0` in `xray.sh`) | warns when you didn't pick an address; `--bind 127.0.0.1` restricts it |
| README `docker run` | `127.0.0.1:8600` | |
| netlab tool | `-p 8600:8600`, every host interface | `docker/netlab-defaults.yml` |
| compose demo | `127.0.0.1:8080:8080`, this machine only | change it to `"8080:8080"` in `compose.yml` to open it to other machines |

- **Recommendation:** use `--bind 127.0.0.1` plus an SSH tunnel on shared machines.
- **Escaping:** collected strings (node names, BGP fields, reasons) are HTML-escaped before rendering; `test/escape.test.js` and `test/dom-insert-escape.test.js` cover injection attempts.

## 10. How does it perform with many routers?

**Collection:**
- All routers are read in parallel, one child process per router (`PAR_RUNNER` in `clab-xray-collect.js`).
- Each child is killed after 25 s; a router that timed out is retried after 10 s; a cycle waits at most 4 s for a router.
- Default read interval: 1 s from `xray.sh`, 2 s in the image, 10 s for IOL nodes (`NX_IOS_INTERVAL`).
- `test/collector-polling.test.js` checks that one slow router doesn't hold back the others.

**Parsing:**
- `scripts/scale-bench.js` times parse+merge on synthetic FRR ring+chord labs: roughly 4 ms for 10 routers, 120-190 ms for 50-100, and about 0.8 s for 200 (13.5 MB of state). This is one sample run on Node 22; times depend on the machine.
- That figure excludes `docker exec` cost and browser rendering. At 1 s polling, a few hundred routers means a few hundred `docker exec` calls per second, so raise `--interval` for big labs.
- `test/scale-bench.test.js` checks correctness only (10 routers), not timing.
- No real lab larger than the example labs has been reported.

## 11. Does it work offline / air-gapped?

Running it does.

- **No outside requests:** there are no CDN scripts, web fonts or analytics; CSS, JS and fonts are bundled (`css/`, `js/`, `fonts/`). The only external URLs are ordinary links (RFCs, the repo, the "Powered by" badge).
- **Building the image needs network access:** `docker/Dockerfile` downloads containerlab from GitHub.
- **Without any lab:** `--fixtures` / `--from-dir` and `scripts/xray-query.js` work on saved state files.

## 12. What's the license?

MIT (`LICENSE`).

- `xray-graph-nextui.html` bundles NeXt UI (EPL-1.0: `js/next.js`, `css/next.css`, `fonts/next-font.*`, `fonts/ciscosans*`) and Tailwind CSS 3.0.23 (MIT).
- `xray-graph.html` uses neither.
- See `THIRD_PARTY_NOTICES.md`.

## 13. Why a browser page and not a TUI?

The point is a topology drawn with animated state (packets, neighbor state changes, best-path highlight), which a terminal does poorly. There is no TUI.

For terminal and scripting use:
- `scripts/xray-query.js` has `state` and `why` subcommands, `--format json` (default) or `--format table`. It reads saved state only and contacts no router.
- `scripts/xray-mcp.js` serves the same queries over MCP stdio.

## 14. Is the "why" reported by the router or inferred?

It depends on the part of the answer:

- **Which path won:** always reported by the router: the `>` mark or `best: true` in the router's own output (`xray-api.js`, `xray-core.js`).
- **Why it won:** usually **inferred**. network-xray compares the attributes it collected: Weight, Local Pref, AS-path length, Origin, then MED, which it compares only between paths from the same neighbor AS (`XRAY_BGP_CRITERIA` in `xray-core.js`). The router doesn't report that chain.
- **When the comparison can't decide** (a tie, or MED skipped), the panel shows FRR's own `selectionReason` instead, labelled "(FRR)" (`xrayBgpFrrReason` / `xrayBgpReasonHtml` in `xray-core.js`). FRR's "first path received" is ignored. If nothing decides, the panel says so ("no single decider", or Older Path per RFC 5004).
- **IOL:** prints no reason, so `clab-iosxe-collect.js` derives one from the printed columns in IOS order. That reason is inferred, even though the panel may label it "(FRR)" (see Q15).
- **IGP metric, router-ID, cluster list:** network-xray doesn't compare these, so a path decided by one of them shows FRR's reason (FRR) or no single decider.
- **`xray-query.js why` labels each answer:**
  - `reason_source: "device"`: the router said so.
  - `reason_source: "comparison"`: inferred from the collected attributes.
  - `null`: neither source decided.

## 15. What is known to be wrong or missing?

- **Reported-vs-inferred label:** the "(FRR)" label in `xrayBgpReasonHtml` (`xray-core.js`) doesn't check the node's NOS. A reason that the IOL collector derived (for example "Peer Type", eBGP over iBGP) would be labelled "(FRR)", as if a router reported it. This comes from reading the code; no test renders that case. `xray-query.js` gets this right (`reason_source` for `ios-xe`).
- **SR OS nodes:** `nokia_sros` matches the SR Linux kind pattern (`isSrl` in `clab-xray-collect.js`) and would be sent to the SR Linux collector, which would fail, leaving the node unread. This is inferred from the regex, not run.
- **No coverage:** IPv6 BGP, IS-IS, VRFs on IOL, and Cisco kinds other than `cisco_iol`.
- **Container image prefix:** the image supports only the default `clab` container-name prefix (`docker/entrypoint.sh`).
- **IOL SSH:** host keys are not checked, and the login defaults to admin/admin unless `NX_IOS_USER` / `NX_IOS_PASSWORD` are set. That suits lab containers, not real devices.
