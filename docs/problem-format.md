# HandsOn Pack: the problem format (problem.json, network-xray-lab/0)

A **HandsOn Pack** is a containerlab lab handed out as a problem to solve with network-xray: the lab's topology and
configurations, and a `problem.json` next to them: a format, not a program (nothing to install beyond network-xray).
This page is the format. To write the `check` from a broken and a
fixed state of the lab, see [SolvedKit](solvedkit.md).

Put a `problem.json` next to your `*.clab.yml` and network-xray shows the problem above the graph and, when the lab is fixed, a **✓ Solved** mark. Labs without a `problem.json` look exactly as before.

If you don't use `xray.sh`, also put the `problem.json` in the folder you pass to `containerlab graph --static-dir` — the page reads the problem band from there (`xray.sh` links it for you). The `check` is read from the copy next to the `*.clab.yml`.

The official examples in [`examples/`](../examples) all use this format. You can use it for your own containerlab labs too.

## Fields

| Field | Required | Meaning |
|---|---|---|
| `format` | yes | Always `"network-xray-lab/0"`. If `format` is present with a different value, `check` is not evaluated. |
| `id` | no | A stable id for the problem, e.g. `"yourname/yourrepo/bgp-filter-1"`. |
| `version`, `author`, `license` | no | Free text. |
| `q_number` | no | A short badge shown before the title, e.g. `"Q21"`. |
| `title_en`, `title_ja` | no | The problem title. A missing language falls back to the other one. |
| `problem_en`, `problem_ja` | no | The problem text. Allowed tags: `<br>`, `<code>`, `<strong>`, `<span>`. Text in `<code>` is highlighted and copied to the clipboard when clicked — use it for IP addresses, prefixes and commands. |
| `focus` | no | `{"node": "r1", "prefix": "8.8.8.0/24"}` — `node` is the router whose DeepDive opens first. `prefix` is selected automatically in the Routing table of **any** router you open (once, when the row appears; not while you have another row selected), except where the row is the router's own destination: a connected / local route, a route out of `lo`, or a route with no outgoing interface. |
| `check` | no | When the lab counts as solved (below). No `check` = no ✓ Solved mark. |
| `check_note_en`, `check_note_ja` | no | A note for people (e.g. "Also try: ping 8.8.8.8 from r1"). Not used by the page. |
| `solved_cta` | no | `{"label_en": "…", "label_ja": "…", "url_en": "https://…", "url_ja": "https://…"}` — one link shown under the problem **only while the lab is solved** (e.g. a step-by-step walkthrough of the same problem). The label is plain text; the part in `[square brackets]` is the link (if there are no brackets, the whole label is the link); only `http(s)` links; a missing language falls back to the other one. |

The problem band appears when the file has a title or a problem text.

## `check`

```json
"check": {
  "all": [
    ["r1", "routing_table", "some", [["prefix", "eq", "3.3.3.3/32"], ["selected", "eq", true], ["out_iface", "eq", "eth2"], ["protocol", "eq", "ospf"]]]
  ]
}
```

- `check.all` is a list of conditions. The lab is solved when **every** condition holds. (`all` is the only form in format 0.)
- Each condition is `[node, path, op, value]`:
  - **node** — a node name from your topology (`r1`). The condition reads that node's live state, collected by `clab-xray-collect.js`. If the node has no state yet, the condition does not hold.
  - **path** — a dot path into the node's state, e.g. `interfaces.eth1.up`. `{key}` is replaced with that node's own value, e.g. `interfaces.{wan_iface}.up`.
  - **op** and **value** — one of the 12 ops below.
- The page checks the state every time it refreshes (about once a second). **✓ Solved appears once the check has held for about 10 seconds without a break** while the collector runs with `--watch` (as `xray.sh` does), so a lab that is still converging does not flash Solved. It disappears again as soon as the check stops holding. With a one-shot collect (no `--watch`) the page does not refresh by itself, so one pass is enough.
- A broken condition (wrong shape, unknown op) never throws: it simply does not hold, and the browser console shows one warning.

### Ops

| op | value | holds when |
|---|---|---|
| `eq` / `ne` | any | the value is equal / not equal (same type) |
| `gt` `ge` `lt` `le` | number | numeric comparison (numbers only) |
| `in` | array | the value equals one of the array items |
| `exists` / `absent` | (none) | the value is present / missing (null counts as missing) |
| `some` | list of `[path, op, value]` | the path is an array and **at least one** item satisfies all the item conditions |
| `none` | list of `[path, op, value]` | **no** item satisfies them (an empty or missing array holds) |
| `count_ge` | `[N, list of [path, op, value]]` | at least N items satisfy them |

Inside `some` / `none` / `count_ge`, the paths point into one array item (no node), and `{key}` is replaced with that item's value.

### What you can look at

The collector writes one state object per node. The fields most useful for a check:

| Path | Shape |
|---|---|
| `routing_table` | array of `{prefix, protocol, out_iface, next_hop, selected}` — like `show ip route`, including routes that are not selected. An installed route with 2+ next-hops (ECMP) also has `nexthops: [{ip, iface}, …]`; `out_iface` / `next_hop` are the first of them |
| `interfaces` | object `{eth1: {up, ip}, …}` |
| `route_resolution` | object `{target, resolved, protocol, out_iface, next_hop, matched_prefix}` — how the node reaches its ping target. `resolved` only means a route to the next hop exists, so a wrong next hop inside a connected subnet is still `true` |
| `ospf_neighbors` | array of `{router_id, address, state, role, iface, full}` |
| `bgp_neighbors` | array of `{ip, remote_as, ibgp, state, up_down, pfx_rcvd}` — `vrf` (the VRF name) only on a session outside the default VRF |
| `bgp_routes` | array of `{prefix, next_hop, as_path, best, weight, metric, origin}` — `prefix` is without the mask (`"8.8.8.0"`) and `prefixlen` holds the length (`24`; compare both to tell /24 from /25), `as_path` is a space-separated string (`"65002"`); `status` is `*>` (best), `*=` (multipath: an equal path used together with the best — ECMP) or `* `; `multipath: true` on every path of an ECMP prefix; `vrf` (the VRF name) only on a route outside the default VRF — the same prefix can be in two VRFs, so a check on a VRF route also compares `vrf` |

To see what your lab produces, open the `xray-states.js` the collector writes and look at `LIVE_STATES.<node>`.

## Write the check against the state, not against the config

A good check says "**the network now works**", not "**the user typed this exact line**". Then every correct fix is accepted.

- Prefer **where the traffic goes** — the route is `selected` and leaves through the right interface (`out_iface`), or uses the right `next_hop` — over which protocol or which command produced it.
  The example above (official example q11) holds whether you delete the wrong static route or raise its distance. Re-pointing the static route does not count: the problem asks for the route learned by OSPF.
- Add **one piece of evidence that the fault is gone**, such as an OSPF neighbor that is now `full`, or a BGP neighbor that is now `Established`.
- If the problem says "do not change X", look for a trace that such a change would leave in the state — e.g. in official example q20, fixing the fault on r2 leaves 65099 in the AS path, so the check requires an AS path of only r1's AS.
- Watch out for a broken next hop that sits **inside a connected subnet** (e.g. `10.10.0.99` on a `/24`): such a route is still selected and still looks "resolved". Check its `next_hop` against the real neighbor address instead.
- If you cannot describe "solved" by state alone (for example, the only difference is a config line that changes nothing visible), leave `check` out. No mark is better than a wrong mark.

## Check a lab without the page (SolvedKit)

New to SolvedKit? Start with the step-by-step guide: [solvedkit.md](solvedkit.md) (日本語: [ja/solvedkit.md](ja/solvedkit.md)).

`scripts/xray-query.js` judges a `check` with the same rules as the page, on saved states — no running lab, no
browser, only Node. Give it the problem.json (or the folder that has it) and states the collector wrote
(`xray-states.js`, `state_<node>.json`, or a folder of them):

```
node scripts/xray-query.js check run    examples/q21-bgp-lp demo/bgp-lp/frameB.json
node scripts/xray-query.js check verify examples/q21-bgp-lp demo/bgp-lp/frameA.json demo/bgp-lp/frameB.json --format table
```

- **`check run <problem.json> <state>`** — is the lab solved in this state? `status` is `solved`, `not_solved` or
  `cannot_judge` (no `check`, or a router in the check is missing from the state or cannot be read; `reason` says
  which). Exit code 0 / 1 / 2, so a CI job or a grading script can use it. It judges one reading; the page also waits
  about 10 seconds for the check to keep holding, so collect again and run it again if you want that.
- **`check verify <problem.json> <broken> <solved>`** — does your check tell the broken lab from the solved one? `ok`
  when it fails on the broken state and holds on the solved state. Each condition gets a verdict: `tells` (fails on
  broken, holds on solved), `both` (holds on both — fine next to one that tells, like "the backup path is still
  there"), `wrong` (fails on solved: the solved lab would never get the mark) or `unknown` (a router cannot be read).
  Exit code 0 / 1 / 2. Run it on a check you wrote before you publish the lab.

The output above (`--format table`) for the recorded q21 demo, before and after the Local Preference fix:

```
Check: ok (broken: not solved, solved: solved)
  BROKEN  SOLVED  VERDICT  CONDITION
  no      yes     tells    r1 bgp_routes some [["prefix","eq","8.8.8.0"],["best","eq",true],["as_p~
  yes     yes     both     r1 bgp_routes some [["prefix","eq","8.8.8.0"],["as_path","eq","65003"]]
```

### Let it suggest the check

Keep a state of the lab broken and one after you fixed it, and SolvedKit proposes the `check` from what the fix
changed (the same changes as `xray-query.js diff`):

```
node scripts/xray-query.js check suggest demo/bgp-lp/frameA.json demo/bgp-lp/frameB.json --focus r1 --format table
node scripts/xray-query.js check init    demo/bgp-lp/frameA.json demo/bgp-lp/frameB.json --out mylab/problem.json
```

```
Suggested check: ok (fails on broken, holds on solved)
  USE  KIND    TELLS  CONDITION
  *    path    yes    r1 bgp_routes some [["prefix","eq","8.8.8.0"],["prefixlen","eq",24],["best",~
  -    path    yes    r1 routing_table some [["prefix","eq","8.8.8.0/24"],["selected","eq",true],[~
  *    backup  no     r1 bgp_routes some [["prefix","eq","8.8.8.0"],["prefixlen","eq",24],["as_pat~
```

- **`check suggest <broken> <solved>`** writes each change it can use as a condition, from the solved state, the way
  this page asks: **path** (a route now selected through its interface, or a BGP best path), **evidence** (an OSPF
  adjacency Full, a BGP session Established, an interface up), **backup** (the old best path still there, so that
  deleting it does not count) and **gone** (a route that disappeared — used only when nothing else tells the two
  apart). Every candidate is judged on both states; the proposed `check` (`*`) is the first path, the evidence on
  the same router and the backup of a BGP best path, and it is verified to fail on broken and hold on solved.
  Exit code 0, or 1 when no condition it can use tells the two states apart (`reason` and `skipped` say why).
  `--focus <node>` / `--prefix <p>` start from a router and a destination; `--max <n>` caps the check (default 3).
- **`check init <broken> <solved>`** makes a problem.json draft with that check, `focus`, and empty `title_*`,
  `problem_*` and `id` for you to write. `--out <file>` writes it (the folder is made when it is not there); an existing file is never overwritten.
- It does not guess other ways to solve the problem. When the fix changed how a route is learned, the condition that
  names it (`protocol`) is a separate candidate marked `binds_method` and is not in the proposed check: a fix that
  reaches the same route another way would not count. Add it only if the problem asks for that (official example q11 does).
  When only such a condition, or only a route that is gone, tells the two states apart, it is used and `warnings` says so.
  A configured value (an OSPF timer, an area) is not a condition; the adjacency it brings is.
- Changes the state does not show (a ping result, a router ID, a maximum-prefix value, a fail-over that needs a link to
  go down) cannot be suggested; nor can a router the collector cannot read.

The MCP tools `check_run`, `check_verify`, `check_suggest` and `check_init` give the same answers
([docs/mcp.md](mcp.md)). One solved state cannot show every correct fix: `verify` and `suggest` say the check tells
these two states apart, not that it accepts every other way to solve the problem — keep the check on what the network
does (above).

## Example (official example q21-bgp-lp)

```json
{
  "format": "network-xray-lab/0",
  "id": "rclab-dev/network-xray/q21-bgp-lp",
  "title_en": "Problem 21 — \"Two ISPs, yet everything takes the slow one\"",
  "focus": {"node": "r1", "prefix": "8.8.8.0/24"},
  "check": {
    "all": [
      ["r1", "bgp_routes", "some", [["prefix", "eq", "8.8.8.0"], ["best", "eq", true], ["as_path", "eq", "65002"]]],
      ["r1", "bgp_routes", "some", [["prefix", "eq", "8.8.8.0"], ["as_path", "eq", "65003"]]]
    ]
  },
  "check_note_en": "Also try: shut down r1's eth1 and confirm the path via r3 takes over."
}
```

The first condition says the route via the fast ISP (AS 65002) is now best; the second says the route via the slow ISP (AS 65003) is still there as a backup. Raising LOCAL_PREF from r2, lowering it from r3, or using weight all satisfy it.
