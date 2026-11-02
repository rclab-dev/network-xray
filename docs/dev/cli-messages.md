# Command-line messages

What the command-line tools print, when, and what the user should do next.
Verdicts: **ok** = accurate and actionable, **fixed** = changed in this pass, **note** = acceptable, possible follow-up.
Line numbers are for the current tree.

## xray.sh

| Message | Where | When | What the user does next | Verdict / change |
|---|---|---|---|---|
| `containerlab not found - https://containerlab.dev/install/` | xray.sh:24 | containerlab not on PATH | install it from the link | ok |
| `node.js not found (needed to collect router state)` | xray.sh:25 | node not on PATH | install Node.js 18+ | ok |
| `topology not found: <yml>` | xray.sh:26 | first argument is not a file | pass a `.clab.yml` path | ok |
| `could not read 'name:' from <yml>` | xray.sh:30 | topology has no top-level `name:` | add `name:` to the topology | ok |
| `the lab name in <yml> is not a plain name (...)` | xray.sh:32 | lab name has other characters | rename the lab | ok |
| `port N is already in use ...` / `add a port: ./xray.sh <lab> N+1 - or stop the other one.` | xray.sh:37-38 | graph port already taken | run the printed command | ok |
| `stopped. remove the lab with: sudo containerlab destroy -t <yml> --cleanup` | xray.sh:55 | on every exit (EXIT trap) | run the printed command | **fixed**: always said `sudo`, even with `SUDO=` (rootless docker). Now uses the `$SUDO` prefix. |
| `==> <problem.json> was not made by xray.sh - left as is ...` | xray.sh:58 | a `problem.json` of your own is in the repo root | remove it if the problem band should show this lab | ok |
| `==> deploying lab '<lab>' (<proto>) ...` | xray.sh:62 | before `containerlab deploy` | wait | ok |
| `==> <c>: FRR did not start cleanly, restarting FRR (n/3) ...` | xray.sh:76 | FRR container's vtysh did not answer for 20 s | wait | ok (only FRR containers: checks for `watchfrr.sh`) |
| `==> <c>: FRR is still not running. Try: docker exec <c> /usr/lib/frr/watchfrr.sh restart all` | xray.sh:80 | 3 restarts did not help | run the printed command | ok |
| `==> collecting router state every second ...` | xray.sh:84 | collector started | wait | **fixed**: Cisco IOS nodes are read only every `NX_IOS_INTERVAL` s (default 10). The message now says so. |
| `==> open http://<this machine>:PORT/ (Ctrl-C to stop)` | xray.sh:90 | before the graph server starts | open the URL | ok |
| `docker exec -it clab-<lab>-<node> vtysh` | xray.sh:97 | example shell for an FRR node | run it | **fixed**: took the first `kind: linux` node, which could be an alpine host (no vtysh). Now only a linux node with an `frr` image. |
| `ssh admin@clab-<lab>-<node> (password: admin)` | xray.sh:98 | example shell for a Cisco IOL node | run it | ok (containerlab's cisco_iol default login) |
| `docker exec -it clab-<lab>-<node> sr_cli` | xray.sh:99 | example shell for an SR Linux node | run it | **fixed**: new. SR Linux labs used to get the fallback below (`vtysh`, which SR Linux does not have). |
| fallback: `docker exec -it clab-<lab>-r1 vtysh` | xray.sh:100 | no node matched (block-style YAML, other kinds) | - | **fixed**: assumed a node `r1` running FRR. Now `clab-<lab>-<node> vtysh (FRR; sr_cli on SR Linux, ssh on Cisco IOL)`. |
| `demo.sh is now xray.sh - running ./xray.sh` | demo.sh:3 | old name used | nothing (it runs xray.sh) | ok |

## clab-xray-collect.js (the collector xray.sh runs)

| Message | Where | When | What the user does next | Verdict / change |
|---|---|---|---|---|
| `!! --mgmt-subnet X is not an IPv4 subnet: ignored` | clab-xray-collect.js:55 | bad `--mgmt-subnet` | pass a CIDR | ok |
| `!! unknown proto X` | :57 | bad proto argument | use ospf / bgp / static | note: could list the valid values |
| `usage: ...` | :59 | missing arguments | - | ok |
| `!! topology file not found` + example | :65-66 | path missing | pass a `.clab.yml` | ok |
| directory notes (`auto-using ...`, `pick one: ...`, `no *.clab.yml found`) | :73-78 | a directory was given | pick the file | ok |
| `note: ... doesn't look like a .clab.yml file` | :82 | other extension | nothing | ok |
| `!! could not read topology file` / output dir messages | :85-90 | I/O errors | fix path / permissions | ok |
| `!! could not find name: in` / `lab name ... not a plain name` | :94-95 | topology problems | fix the topology | ok |
| `!! left out a link with a name that is not a plain name` | :162 | odd endpoint names | rename | ok |
| `!! no links parsed from` | :170 | topology has no `links:` the parser reads | check `links:` / `endpoints:` | ok |
| `!! <script> not found in <dir> (needed for ...)` | :224-226 | collector file missing | copy the repo files together | ok |
| `<n> collect OK again (after N failure(s))` | :282 | node recovered | nothing | ok |
| `<n> cannot be read: the container is not running` | :290 | `docker exec` says not running / no such container | - | **fixed**: now `... (check: docker ps -a)` so there is a next step. |
| `<n> cannot be read: not a router network-xray reads (no vtysh / sr_cli) - drawn only` | :290 | container has neither CLI (e.g. alpine host) | nothing; the node is drawn | ok |
| `<n> cannot be read: no answer - showing its last good state as stale` | :290 | 8 s timeout | wait; retried after 10 s | ok |
| `<n> not ready yet (IOL is booting, SSH not up yet) - retrying` | :291 | IOS collector got no IOS prompt | wait | **fixed (cause)**: also shown when `ssh` is missing on the host or the SSH login is denied, which never get better by waiting. clab-iosxe-collect.js now reports those two separately (below), and they show as `COLLECT FAILED` with the reason. |
| `<n> COLLECT FAILED: <error> \| <stderr line>` | :300 | any other collector error | read the reason | ok |
| `<n> still failing (same error xN)` | :302 | same failure repeats (every 12th) | - | ok |
| `kept the last good state for N node(s)` | :328 | some nodes failed | - | ok |
| `!! --validate: netlab-validate.js not found next to the collector` | :365 | file missing | copy it next to the collector | ok |
| `!! every node failed - kept the existing xray-states.js` | :408 | one-shot run, nothing read | see the per-node lines above | ok |

The copies in `demo/compose-*/collector/` were updated too (`scripts/check-copies.js`).

## Per-vendor collectors

| Message | Where | When | What the user does next | Verdict / change |
|---|---|---|---|---|
| `NX_UNREAD <why> <msg>` | clab-collect.js:1527, clab-srl-collect.js:457, clab-iosxe-collect.js:726/731/888 | machine-readable line for clab-xray-collect.js | - (translated above) | ok |
| `vrf all not usable on <c> (<cmd>) -> plain command` | clab-collect.js:1021 | older FRR without `vrf all` | nothing | ok |
| `!! ssh not found on this machine: install an OpenSSH client ...` | clab-iosxe-collect.js:729 | `ssh` not on PATH | install an SSH client | **fixed**: new; was reported as "IOL is booting". |
| `!! SSH login to <host> was denied: set NX_IOS_USER / NX_IOS_PASSWORD (default admin / admin)` | clab-iosxe-collect.js:730 | ssh says Permission denied / Authentication failed | set the variables | **fixed**: new; was reported as "IOL is booting". |
| `!! clab-collect.js not found next to ...` | clab-iosxe-collect.js:744 | file missing | keep the files together | ok |
| usage / `--lab / --node must be plain names` / `--host must be ...` | clab-iosxe-collect.js:880-886, clab-srl-collect.js:418-455 | bad arguments | fix arguments | ok |
| `captured state paths to <dir>/ (replay: ...)` | clab-srl-collect.js:460 | `--capture` | run the printed replay | ok |
| usage | clab-collect.js:1532, frr-collect.js:206 | no mode given | - | ok |

## netlab helpers

| Message | Where | When | What the user does next | Verdict / change |
|---|---|---|---|---|
| `usage: node netlab-validate.js <network-xray.json> [container-prefix]` | netlab-validate.js:418 | no file | - | ok |
| `[STATUS] <test> - <description>` + message, `== N passed, ...` | netlab-validate.js:421-423 | each run | read failures | ok |
| per-node `device <d>` (status unsupported) | netlab-validate.js:355 | node is not FRR | nothing | **fixed**: now `device <d> (only frr nodes are checked)` so it is clear why the test did not run. |

## scripts/*.js

| Message | Where | Verdict |
|---|---|---|
| usage / `!! no links/nodes parsed` / `!! names that are not plain names` / `! link ... missing IP in frr.conf` / `bundle: ...` | scripts/gen_compose_bundle.js:14-239 | ok |
| `check-copies: N group(s) differ — see docs/copies.md` | scripts/check-copies.js:72 | ok |
| `check-i18n: N error(s)` / `OK (...; --verbose to list)` | scripts/check-i18n.js:159-165 | ok |
| argument errors (`--routers: a list of numbers 3..1000`, ...) | scripts/scale-bench.js:199-203 | ok |
| self-test PASS/FAIL lines | scripts/*-selftest.js | ok |
| stdout reserved for JSON-RPC (logs to stderr) | scripts/xray-mcp.js:29-31 | ok |

## Not changed (follow-ups)

- `.devcontainer/start-demo.sh` was not audited in this pass.
- The `device` reason for an IOS node also covers "docker inspect gave no address" (`mgmtAddr`), which is still shown as "booting".
- The xray.sh shell hints only read inline (`r1: { kind: ... }`) node entries; block-style YAML gets the generic hint.
