# What the picture means, in every view

*English | [日本語](ja/showing.md)*

network-xray shows the same state in several ways: the DeepDive (inside one router, on the page), the single-node panel
(`xray-node-panel.js`, the 2D picture and its tables), a static page made by `scripts/xray-render.js`, and the text
answers of the CLI and the MCP tools. A skin changes how they look (the colours, a dark or light ground, the router
drawn as a cylinder or a box); it never changes what they say. These are the rules every view keeps.

| Meaning | In the pictures | In the text answers |
|---|---|---|
| The path the router chose | the row marked `*>`, written in the winner colour; the arrow leaves the router toward that route's out-interface | `selected` (why_path), `best: true` |
| The step that chose it | its column framed; `best path by <step> (<value> > <value>)`; the steps before it shown as ties (`=`), the deciding one with ✅ | `deciding_step`, `steps[]` (`tie` / `win`), `summary` in one line |
| The router said why | `best path by <reason> (FRR)` / `(reported by FRR)`; for IOS-XE `derived` (worked out by the collector) | `reason_source`: `device` / `derived` / `comparison` |
| The data does not say why | "a step the table does not show", with the steps still to come; no step is named | `deciding_step: null` and a `note` |
| An adjacency or session is up | the protocol's tunnel over the grey link: green = OSPF Full, purple = BGP Established | the state word (`Full`, `Established`) |
| It is not up | the grey link only (dashed in the cylinder picture); under **What's wrong** with the router's own state word | the state word as the router printed it (`Active`, `Idle (Admin)`, `ExStart` …) |
| Something is wrong | listed first, under **What's wrong**, each with the values on both ends when they must match | `wrong[]` (lab_state), `mismatch` (ospf_interfaces) |
| Not in the collected data | `?` — never shown as down or wrong | `null` with a note |
| Changed since a kept state | **Changed since the baseline** (the page), **What changed on \<router\>** (render `--before`) | `changes[]` (diff / state_diff) |

Rules behind the table:

1. **The winner is the router's.** network-xray never picks a path; it marks the one the router marked best and explains
   it from the attributes in the data.
2. **No guessing.** When the data does not hold the deciding step, every view says so instead of naming one.
3. **Not by colour alone.** Every coloured mark also has a word or a sign (`*>`, ✅, `=`, a dashed line, the state word),
   so a light ground, a printout or a colour-blind reader gets the same answer.
4. **Same words everywhere.** The step names (Weight, LocPrf, AS-Path, Origin, MED, eBGP > iBGP) and the router's state
   words are the same in the pictures and in the text, and the router's own words are kept as it printed them.
