# SolvedKit guide: turn your lab into a puzzle with a solved check

*English | [日本語](ja/solvedkit.md)*

Two tools work together: a **HandsOn Pack** hands out a containerlab lab as a problem (the lab and a `problem.json`;
[its format](problem-format.md)), and **SolvedKit** makes the check that says when it is solved. Hand out exercises as a
HandsOn Pack, and make their check with SolvedKit. SolvedKit also works on its own, for containerlab and Cisco CML labs.

```mermaid
flowchart LR
  A["Author: a lab, a broken version and a fixed version"] -->|writes the check by hand| P
  A -->|"not sure how to write it"| S["SolvedKit: suggest, init, verify from the two states"]
  S -->|the check in problem.json| P["HandsOn Pack: the lab + problem.json"]
  P --> L["Solver: the problem on the page, then ✓ Solved"]
  S -.->|"or on its own: the organizer runs check run after a solver hands in"| R["check run"]
```

**In a hurry? Read [2. Your first five minutes](#2-your-first-five-minutes) only.**

1. [What it is, and what it is not](#1-what-it-is-and-what-it-is-not)
2. [Your first five minutes](#2-your-first-five-minutes)
3. [Reading the tables](#3-reading-the-tables)
4. [Why the check keeps a backup line, and why it does not tie down the solution](#4-why-the-check-keeps-a-backup-line-and-why-it-does-not-tie-down-the-solution)
5. [Using it on your own lab](#5-using-it-on-your-own-lab)
6. [Editing the check in problem.json](#6-editing-the-check-in-problemjson)
7. [When something goes wrong](#7-when-something-goes-wrong)
8. [Questions authors ask](#8-questions-authors-ask)
9. [From an AI assistant (MCP)](#9-from-an-ai-assistant-mcp)

## 1. What it is, and what it is not

SolvedKit is for you if you have a network problem and its answer, and you are stuck on how to write the condition
that says "this lab is solved". You give it the lab's **state** before the fix and after it (what network-xray reads
from the running routers, not the topology file), and it proposes that condition (a `check`: "r1's best path to
8.8.8.0/24 goes through AS 65002"), and tells you whether a condition tells the broken lab from the fixed one. It works
with containerlab labs (and netlab) and Cisco CML labs.

One place to use the check: a `problem.json` next to the lab's topology. network-xray then shows the problem above the
graph and a **✓ Solved** mark once the lab is fixed ([problem-format.md](problem-format.md)). A grading script or a CI
job can use the same check with `check run`.

- It **proposes** a check from two saved states of the lab: one broken, one fixed. You decide what goes in.
- It **judges** a check on a saved state, with the same rules as the page, and tells you whether the check tells the
  broken lab from the fixed one.
- It **reads only**. It does not log in to routers, does not change the lab, and needs no running lab: only Node and
  the state files.
- It is **not** a grader of how someone solved the problem. It looks at what the network does in the end, not at the
  commands that were typed.
- It does **not** find every correct answer. One fixed state shows one way to solve the problem; see
  [section 4](#4-why-the-check-keeps-a-backup-line-and-why-it-does-not-tie-down-the-solution).

The full problem.json format is in [problem-format.md](problem-format.md).

## 2. Your first five minutes

**Before you start.** You need Node 18 or later (`node -v`) and a copy of network-xray. Run every command in this guide
from the network-xray folder:

```
git clone https://github.com/rclab-dev/network-xray.git
cd network-xray
```

The repository has two recorded states of the q21 lab (BGP: r1 should prefer the path through r2):
`demo/bgp-lp/frameA.json` is before the fix and `demo/bgp-lp/frameB.json` after it. Run these from the repository
folder.

**Step 1: let it suggest the check.**

```
node scripts/xray-query.js check suggest demo/bgp-lp/frameA.json demo/bgp-lp/frameB.json --format table
```

```
Suggested check: ok (fails on broken, holds on solved)
  USE  KIND    TELLS  CONDITION
  *    path    yes    r1 bgp_routes some [["prefix","eq","8.8.8.0"],["prefixlen","eq",24],["best",~
  -    path    yes    r1 routing_table some [["prefix","eq","8.8.8.0/24"],["selected","eq",true],[~
  *    backup  no     r1 bgp_routes some [["prefix","eq","8.8.8.0"],["prefixlen","eq",24],["as_pat~

* = in the proposed check; TELLS = fails on broken, holds on solved
```

It found three conditions and put two of them (`*`) in the proposed check: r1's best path to 8.8.8.0/24 is now the
one through AS 65002, and the old path through AS 65003 is still there. [Section 3](#3-reading-the-tables) explains
each column. A line cut with `~` is shown in full without `--format table` (JSON).

**Step 2: write a problem.json draft.**

```
node scripts/xray-query.js check init demo/bgp-lp/frameA.json demo/bgp-lp/frameB.json --out mylab/problem.json --format table
```

It prints the same table and then:

```
written: mylab/problem.json
to write by hand: title_en / title_ja; problem_en / problem_ja; id (e.g. "yourname/yourrepo/lab-1")…
```

The draft has the check filled in and empty `title_*`, `problem_*` and `id` for you to write. The folder is made when
it is not there; an existing problem.json is never overwritten.

**Step 3: judge one state.**

```
node scripts/xray-query.js check run mylab/problem.json demo/bgp-lp/frameB.json --format table
```

```
Solved: solved
  HOLDS  CONDITION
  yes    r1 bgp_routes some [["prefix","eq","8.8.8.0"],["prefixlen","eq",24],["best","eq",true],["~
  yes    r1 bgp_routes some [["prefix","eq","8.8.8.0"],["prefixlen","eq",24],["as_path","eq","6500~
```

With `frameA.json` (the broken lab) the first line says `Solved: not solved` and the first condition `no`. The exit
code is 0 for solved, 1 for not solved, 2 for cannot judge.

**Step 4: check that the check tells the two apart.**

```
node scripts/xray-query.js check verify mylab/problem.json demo/bgp-lp/frameA.json demo/bgp-lp/frameB.json --format table
```

```
Check: ok (broken: not solved, solved: solved)
  BROKEN  SOLVED  VERDICT  CONDITION
  no      yes     tells    r1 bgp_routes some [["prefix","eq","8.8.8.0"],["prefixlen","eq",24],["b~
  yes     yes     both     r1 bgp_routes some [["prefix","eq","8.8.8.0"],["prefixlen","eq",24],["a~

tells = fails on broken, holds on solved; both = holds on both; wrong = fails on solved
```

`Check: ok` means the lab gets the mark only after the fix. That is the whole loop: suggest, init, run, verify.

## 3. Reading the tables

**`check suggest` / `check init`**

| Column | Values | Meaning |
|---|---|---|
| USE | `*` | in the proposed check |
| | `-` | a candidate that also works, left out (add it by hand if you want it) |
| KIND | `path` | a route is now selected through an interface, or a BGP best path is the one the fix made |
| | `evidence` | an OSPF adjacency is Full, a BGP session is Established, or an interface is up, in the fixed state |
| | `backup` | the old best path is still there (see [section 4](#4-why-the-check-keeps-a-backup-line-and-why-it-does-not-tie-down-the-solution)) |
| | `gone` | a route that disappeared; used only when nothing else tells the two states apart |
| TELLS | `yes` | fails on the broken state and holds on the fixed one |
| | `no` | holds on both (normal for `backup`) |
| CONDITION | | `[node, path, op, value]`: the router, the part of its state (`bgp_routes`, `routing_table`, `ospf_neighbors`, `bgp_neighbors`, `interfaces.eth1.up`, …), the op (`some` = at least one row matches, `none` = no row matches, `eq`, …) and the value |

The proposed check is the first `path`, the `evidence` on the same router, and the `backup` of a BGP best path, at most
three conditions (`--max <n>` to change it). The first line says `ok` when that check fails on broken and holds on
solved, or `none` with the reason when no condition tells the two apart. `not used: N change(s)` counts changes it saw
but could not use; `--format json` lists them under `skipped` with the reason for each.

**`check run`**: `Solved:` is `solved`, `not solved` or `cannot judge`; HOLDS is `yes`, `no` or `?` (that router cannot
be read in the state).

**`check verify`**: BROKEN / SOLVED say whether each condition holds in each state. VERDICT:

| VERDICT | Meaning | What to do |
|---|---|---|
| `tells` | fails on broken, holds on solved | this is what makes the check work |
| `both` | holds on both | fine next to a `tells` (a backup line is `both`) |
| `wrong` | fails on solved | the fixed lab would never get the mark: remove or correct this condition |
| `unknown` | a router in it cannot be read | collect again when every router is up |

`Check: ok` needs at least one `tells` and no `wrong`.

## 4. Why the check keeps a backup line, and why it does not tie down the solution

The backup row does not tell broken from fixed (TELLS `no`), and it is in the check on purpose. Without it, another
way to "fix" q21 would also get the mark: cut r1's link to r3, and the path through AS 65003 disappears, so the path
through AS 65002 becomes best without the change the problem asks for. With the backup line, the old path must still
be there: the lab counts as solved only when r1 prefers the new path while the old one is still available.

At the same time, the check does not tie the solver to one way of solving. It says what the network does, not which
command made it so: in q21, raising Local Preference on r2's routes and other ways that make r1 prefer r2 while r3 stays
a backup all count.

How a route is learned (`protocol`, for example `ospf` or `bgp`) is kept out of the proposed check by default. When the
fix changed it, `suggest` lists it as a separate candidate (`binds_method` in the JSON, with a note) so that a fix
reaching the same route another way still counts. Add it to the check only if the problem asks for that method
("make r1 learn this route by OSPF"); see [section 6](#6-editing-the-check-in-problemjson).

## 5. Using it on your own lab

The steps are the same for every lab: save a broken state, save a fixed state, then suggest, init, verify.

**Save a state.** network-xray's collector writes the lab's state to `xray-states.js` every round. Copy it at the
moment you want:

| How you run network-xray | Where the state is |
|---|---|
| `./xray.sh <lab>.clab.yml` (containerlab) | `xray-states.js` in the network-xray folder |
| the image (`docker run … ghcr.io/rclab-dev/network-xray`) | inside the container: `curl -s http://localhost:8600/static/xray-states.js > broken.js` |
| netlab with network-xray's defaults file | the image again: `curl -s http://localhost:8600/static/xray-states.js > broken.js` |
| Cisco CML (`node cml-xray.js …`) | `xray-states.js` in the `--out` folder (default `./cml-view`) |
| the MCP server with `--allow-collect` | `collect` with `keep_previous: true` keeps the state before as `previous` |

A saved `xray-states.js`, a `state_<node>.json`, or a folder of them all work as input.

**The flow.**

1. Start the lab and break it the way the problem will be given. Wait until the page shows the broken state, then save
   it: `cp xray-states.js broken.js` (or the `curl` line above).
2. Fix it the way you expect a solver to. Wait until the page shows the change (BGP and OSPF can take tens of seconds
   to settle), then save it as `solved.js`.
3. `node scripts/xray-query.js check suggest broken.js solved.js --format table`. If the lab changes more than the
   problem is about, start from the router and destination: `--focus r1 --prefix 8.8.8.0/24`.
4. `node scripts/xray-query.js check init broken.js solved.js --out <your lab folder>/problem.json`, then write
   the title, the problem text and `id` in it. One language is enough: a missing `title_en` / `title_ja` (or `problem_*`)
   falls back to the other one.
5. `node scripts/xray-query.js check verify <your lab folder>/problem.json broken.js solved.js --format table` must say
   `Check: ok`. Keep `broken.js` and `solved.js` next to the lab if you want to run this again in CI.
6. Open the lab with network-xray, solve it once yourself, and see the ✓ Solved mark.

**Cisco CML.** `cml-xray.js` runs on your own machine, not on the CML server: it reads a lab running in CML over CML's
REST API and the lab's management network
(the setup is in the [README](../README.md#cisco-cml2-cml-free-works), including the
[management network](../README.md#add-a-management-network-to-a-cml-lab) it needs):

```
export CML_HOST=<your CML address> CML_USER=<your CML user> CML_PASSWORD=<its password>
export NX_IOS_USER=admin NX_IOS_PASSWORD=<the routers' password>
node cml-xray.js --save-cert cml.pem      # once
export CML_CA_FILE=cml.pem
node cml-xray.js --lab "<the lab's title in CML>"
```

While it runs, the state is `cml-view/xray-states.js` (the `--out` folder). Break the lab in CML, wait for the page at
http://127.0.0.1:8710/ to show it, `cp cml-view/xray-states.js broken.js`; fix it, wait, `cp cml-view/xray-states.js solved.js`.
The rest is the same as above.

**What the solver sees.** Put the problem.json next to the lab's topology file (`<lab>.clab.yml`). The solver starts the
lab with network-xray (`./xray.sh <lab>.clab.yml`, or the image) and sees the title and the problem above the graph; once
the check has held for about 10 seconds, the ✓ Solved mark appears.

**In CI.** The collector reads a running lab once when you leave out `--watch`. Its output folder is the network-xray
folder (it writes `xray-states.js` there), and the third argument is the protocol (`bgp`, or `ospf`, the default). Tried
on a host with containerlab and the official q21 example, from the network-xray folder:

- `clab-xray-collect.js` is at the top of the network-xray folder.
- Its second argument (`.`) is the folder it writes `xray-states.js` to: the network-xray folder itself (it needs the
  other files there).
- `check run` takes the lab folder that has the problem.json, or the problem.json file itself.

```
containerlab deploy -t examples/q21-bgp-lp-solved/q21.clab.yml
sleep 60                                               # let BGP settle
node clab-xray-collect.js examples/q21-bgp-lp-solved/q21.clab.yml . bgp
node scripts/xray-query.js check run examples/q21-bgp-lp-solved xray-states.js --format table
containerlab destroy -t examples/q21-bgp-lp-solved/q21.clab.yml --cleanup
```

```
Solved: solved
  HOLDS  CONDITION
  yes    r1 bgp_routes some [["prefix","eq","8.8.8.0"],["best","eq",true],["as_path","eq","65002"]]
  yes    r1 bgp_routes some [["prefix","eq","8.8.8.0"],["as_path","eq","65003"]]
```

`check run` exits 0, so the job passes; on the unsolved `examples/q21-bgp-lp` it says `not solved` and exits 1.

**When solvers must not see the check** (a contest, a graded exercise): hand out a problem.json without `check` (the
problem is still shown, with no ✓ Solved mark), keep the full one yourself, and after a solver hands in, save the state
of their lab and run `check run` with your problem.json.

## 6. Editing the check in problem.json

A condition is `[node, path, op, value]`. With the op `some`, the value is a list of `[field, op, value]`: "the node has at
least one row at that path where every `[field, op, value]` is true" (`none`: no such row). The check holds when every
condition in `all` holds. The draft from step 2:

```json
"check": {
  "all": [
    ["r1", "bgp_routes", "some", [["prefix", "eq", "8.8.8.0"], ["prefixlen", "eq", 24], ["best", "eq", true], ["as_path", "eq", "65002"]]],
    ["r1", "bgp_routes", "some", [["prefix", "eq", "8.8.8.0"], ["prefixlen", "eq", 24], ["as_path", "eq", "65003"]]]
  ]
}
```

The paths, fields and the 12 ops are listed in [problem-format.md](problem-format.md#check). Three common edits:

1. **Accept more than one right answer.** Say r1 may prefer the path through AS 65002 or through AS 65004. Before:

   ```json
   ["r1", "bgp_routes", "some", [["prefix", "eq", "8.8.8.0"], ["prefixlen", "eq", 24], ["best", "eq", true], ["as_path", "eq", "65002"]]]
   ```

   After (`in` takes a list):

   ```json
   ["r1", "bgp_routes", "some", [["prefix", "eq", "8.8.8.0"], ["prefixlen", "eq", 24], ["best", "eq", true], ["as_path", "in", ["65002", "65004"]]]]
   ```

   `check verify` on the recorded q21 states still says `Check: ok` with this change.
2. **Require the method.** If the problem says "by OSPF", add the `protocol` candidate that `suggest` listed:
   `["protocol", "eq", "ospf"]` in the route's condition.
3. **Remove a condition that is too strict.** If `check verify` shows a condition as `wrong`, or a value that changes
   by itself (a timer, an uptime), delete that condition or that field.

Run `check verify` again after every edit.

## 7. When something goes wrong

Errors print as `error: …` on stderr with exit code 2 (with `--format table`), or as `{"error": …}`.

| Message | Cause | What to do |
|---|---|---|
| `Suggested check: none` / `no difference between the two states (the fix changed nothing the collector reads)` | the two files are the same state, or the fix changed something the collector does not read | save the fixed state again after the page shows the change; check that you passed two different files |
| `no condition the check can use tells the broken state from the solved one - see skipped` | the changes are of a kind a check does not use (a configured value, a ping) | run with `--format json` and read `skipped`; check the routes or adjacencies the change brings instead |
| `the proposed check did not verify: …` | the suggested conditions did not fail on broken and hold on solved together | read the reason after the colon; try `--focus` / `--prefix` |
| `Solved: cannot judge` / `cannot read r2: not in the state` | a router named in the check is missing from the state | the router name differs (check `node scripts/xray-query.js state <file>`), or it was not up when the state was saved |
| `cannot read r2: not readable (…)` | the collector could not read that router | wait until it is up and save the state again |
| `no check (problem.json has no check.all)` | the problem.json has no check yet | run `check init`, or add `check.all` |
| `unsupported format "…" (network-xray-lab/0 only)` | `format` in problem.json is another value | set `"format": "network-xray-lab/0"` |
| `unknown node: r9 (not in the solved state)` | `--focus` names a router that is not in the fixed state | use a name from the state |
| `not written: … already exists (SolvedKit does not overwrite a problem.json)` | `--out` points at an existing file | pick another file name, or move the old one away |
| `no node state found in input` / `not valid JSON: …` | the file is not a network-xray state | pass the saved `xray-states.js` (or `state_<node>.json`) |
| `not found: …` / `no problem.json in …` | the path is wrong | check the path; a folder needs a `problem.json` inside |
| `--max must be a number from 1 to 99` | bad `--max` | give a number |

**The suggestion looks wrong.** The most common cause is a state saved while the lab was still converging: save it again
after the page has stopped changing. The second is a lab that changes more than the problem is about: use `--focus` and
`--prefix`.

## 8. Questions authors ask

- **Which labs does it work with?** Anything network-xray reads: FRR, Nokia SR Linux and Cisco IOL in containerlab or
  netlab, and Cisco CML (IOL and IOS-XE) through `cml-xray.js`.
- **A lab with OSPF only, no BGP?** Yes: the conditions are then routes in `routing_table` and adjacencies in
  `ospf_neighbors`.
- **A problem with several right answers?** Keep the check on what the network must do and leave out what differs
  between answers ([section 6](#6-editing-the-check-in-problemjson), edit 1). Verify with a fixed state of each answer
  if you can.
- **Does the page wait before showing ✓ Solved?** Yes, the page waits about 10 seconds for the check to keep holding.
  `check run` judges one reading.
- **Can I use it in CI?** Yes. `check run` and `check verify` exit 0 / 1 / 2 and need only Node and the files.
- **Does it change my lab or log in to routers?** No. It reads the files you give it.
- **What about a ping result or a configured value?** A check reads state, not configuration: check what the value
  brings (an adjacency, a route), not the value itself. Ping results are not in the state.
- **Can the solver see the check?** Yes, if it is in the problem.json you hand out: a solver who opens the file can read
  it. When that matters, hand out a problem.json without `check` and run `check run` yourself after they hand in
  ([section 5](#5-using-it-on-your-own-lab), "When solvers must not see the check").
- **Where is the full format?** [problem-format.md](problem-format.md).

## 9. From an AI assistant (MCP)

The MCP server ([mcp.md](mcp.md)) has the same four as read-only tools: `check_run` (`problem`, `path`),
`check_verify` (`problem`, `broken`, `solved`), `check_suggest` and `check_init` (`broken`, `solved`, optional `focus`,
`prefix`, `mgmt_subnet`). `check_init` returns the draft as JSON; it does not write a file. The files must be under the
folder the server reads (its `--path`). Ask, for example: "Suggest a check from broken.js and solved.js, then verify
it."
