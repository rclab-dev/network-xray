# problem.json — lab problem format (network-xray-lab/0)

Put a `problem.json` next to your `*.clab.yml` and network-xray shows the problem above the graph and, when the lab is fixed, a **✓ Solved** mark. Labs without a `problem.json` look exactly as before.

If you don't use `demo.sh`, also put the `problem.json` in the folder you pass to `containerlab graph --static-dir` — the page reads the problem band from there (`demo.sh` links it for you). The `check` is read from the copy next to the `*.clab.yml`.

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
  - **node** — a node name from your topology (`r1`). It reads that node's live state, collected by `clab-xray-collect.js`. If the node has no state yet, the condition does not hold.
  - **path** — a dot path into the node's state, e.g. `interfaces.eth1.up`. `{key}` is replaced with that node's own value, e.g. `interfaces.{wan_iface}.up`.
  - **op** and **value** — one of the 12 ops below.
- The page checks the state every time it refreshes (about once a second). **✓ Solved appears once the check has held for about 4 seconds without a break** while the collector runs with `--watch` (as `demo.sh` does), so a lab that is still converging does not flash Solved. It disappears again as soon as the check stops holding. With a one-shot collect (no `--watch`) the page does not refresh by itself, so one pass is enough.
- A broken condition (wrong shape, unknown op) never throws: it simply does not hold, and the browser console shows one warning.

### Ops

| op | value | holds when |
|---|---|---|
| `eq` / `ne` | any | the value is equal / not equal (same type) |
| `gt` `ge` `lt` `le` | number | numeric compare (numbers only) |
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
| `routing_table` | array of `{prefix, protocol, out_iface, next_hop, selected}` — like `show ip route`, including routes that are not selected |
| `interfaces` | object `{eth1: {up, ip}, …}` |
| `route_resolution` | object `{target, resolved, protocol, out_iface, next_hop, matched_prefix}` — how the node reaches its ping target. `resolved` only means a route to the next hop exists, so a wrong next hop inside a connected subnet is still `true` |
| `ospf_neighbors` | array of `{router_id, address, state, role, iface, full}` |
| `bgp_neighbors` | array of `{ip, remote_as, ibgp, state, up_down, pfx_rcvd}` |
| `bgp_routes` | array of `{prefix, next_hop, as_path, best, weight, metric, origin}` — `prefix` is without the mask (`"8.8.8.0"`), `as_path` is a space-separated string (`"65002"`) |

To see what your lab produces, open the `xray-states.js` the collector writes and look at `LIVE_STATES.<node>`.

## Write the check against the state, not against the config

A good check says "**the network now works**", not "**the user typed this exact line**". Then every correct fix is accepted.

- Prefer **where the traffic goes** — the route is `selected` and leaves through the right interface (`out_iface`), or uses the right `next_hop` — over which protocol or which command produced it.
  The example above (official example q11) holds whether you delete the wrong static route or raise its distance. Re-pointing the static route does not count: the problem asks for the route learned by OSPF.
- Add **one piece of evidence that the fault is gone**, such as an OSPF neighbor that is now `full`, or a BGP neighbor that is now `Established`.
- If the problem says "do not change X", look for a trace that such a change would leave in the state — e.g. in official example q20, fixing it on r2 leaves 65099 in the AS path, so the check requires an AS path of only r1's AS.
- Watch out for a broken next hop that sits **inside a connected subnet** (e.g. `10.10.0.99` on a `/24`): such a route is still selected and still looks "resolved". Check its `next_hop` against the real neighbor address instead.
- If you cannot describe "solved" by state alone (for example, the only difference is a config line that changes nothing visible), leave `check` out. No mark is better than a wrong mark.

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
