# Readers: read other devices or sources into network-xray

*English | [日本語](ja/readers.md)*

network-xray draws what it is given as **one state per router** (the `state` object in
[DATA-CONTRACT.md §4](../DATA-CONTRACT.md#4-state--router-state-snapshot--状態スナップショット)). The page, DeepDive,
`scripts/xray-query.js` and the MCP server never look at where that state came from. A **reader** is a small program that
reads something — CLI output, gNMI, an inventory, another tool's parsed data — and writes that state.

The readers in this repository (FRR, Nokia SR Linux, Cisco IOS-XE, and `genie-to-xray.js` for Cisco Genie parsed JSON)
all write the same files. You can write your own reader **in your own repository**, under your own license, and use it
with network-xray as it is. Pull requests are not merged here (the code keeps a single author), but a reader does not
need a change in this repository.

## Writing a reader

**What it writes.** A folder with either one `state_<router>.json` per router (a state object, DATA-CONTRACT §4), or one
`xray-states.js` with all of them:

```js
window.LIVE_STATES = { "r1": { "target_node": "r1", "interfaces": [ ... ], ... }, "r2": { ... } };
```

(`xray-states.json` is what the bundled collector writes *for other tools to read*; it is not the input here.)

- **Router names** must be the node names in your topology (`clab.yml` or the netlab topology), so the state lands on the
  right box.
- **The smallest valid state** is `target_node` (the router name) and `interfaces` (§4.1). Add the routing table and
  route resolution (§4.2), OSPF (§4.3), BGP (§4.4), static routes (§4.5) and links (§4.6) where your source has them. **Leave out what you cannot read** rather than guessing: a
  missing field is shown as not read.
- **Where each field comes from** for FRR and Cisco IOS is in [DATA-CONTRACT.md §6](../DATA-CONTRACT.md#6-bring-your-own-data--自分のデータで使う).

**Check it.** Two commands from a clone of this repository:

```
node scripts/validate-states.js <your-output-folder>        # the shape (docs/dev/states-schema.json); exit 0 = valid
node scripts/xray-query.js state <your-output-folder>        # what network-xray reads from your state (and what is wrong)
```

When both work, the graph pages, DeepDive and the MCP tools can use the folder (give the folder as `path` to the MCP
tools and `xray-query.js`; for the graph pages, use it the same way as the output of `genie-to-xray.js --out`, see
[From Cisco pyATS / Genie output](../README.md#from-cisco-pyats--genie-output)).

**Examples to start from.**

- `genie-to-xray.js` — another tool's parsed JSON into the state (no device access).
- `clab-srl-collect.js` — a device's YANG state (`sr_cli … | as json`) into the same state as the FRR reader.

**Versions.** A change that breaks a reader raises `schema` (see [xray-states.json](../DATA-CONTRACT.md#xray-statesjson-schema-1)).
Say in your reader's README which network-xray version you tested with.

**Safety.** network-xray only reads the files your reader writes. How your reader reaches the devices (SSH, the Docker
socket, an API key) is up to your reader and the people who run it; please say so in its README.

## Readers by other people

These readers are written and maintained by their authors in their own repositories. **They are not reviewed by this
project — read the code before you run it.**

| Reader | Repository | Reads | Fills | Tested with |
|---|---|---|---|---|
| *(none listed yet)* | | | | |

**To have yours listed**, open an issue with the "List my reader" form: the repository URL, what it reads, and a sample
output that passes `scripts/validate-states.js`. The list is updated by the maintainer; the code stays in your
repository.

The readers that come with network-xray are listed in the [README](../README.md) (supported routers).
