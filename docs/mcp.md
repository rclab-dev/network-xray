[日本語](ja/mcp.md)

# MCP server: ask an AI assistant about a lab

`scripts/xray-mcp.js` is a small [Model Context Protocol](https://modelcontextprotocol.io) server. It lets an MCP
client (Claude Code, Claude Desktop, or any other client that starts stdio servers) ask network-xray about a lab:
which routers are up, what their OSPF and BGP neighbors are, which BGP path a router chose and why, and which route
it uses for an address.

It is **read-only**. It answers from state files the collectors have already written. It never logs in to a router,
never runs a command, never writes a file and opens no network socket. It uses the same functions as
`scripts/xray-query.js`, so it gives the same answers.

## Where the state comes from

Each tool takes a `path` argument, which can be any of these:

| `path` | Written by |
|---|---|
| a `state_<node>.json` file | `frr-collect.js` / `clab-collect.js` (`--out`), and the fixtures in `test/fixtures/<lab>/` |
| a directory of `state_<node>.json` files | the same, one file per node (for example `test/fixtures/iosxe-q15`) |
| an `xray-states.js` file, or a directory that contains one | `clab-xray-collect.js <topo.clab.yml> <out-dir>` |
| a directory of saved FRR `show … json` files (node = directory name), or a directory of such node directories | the `frr-collect.js --from-dir` layout (for example `fixtures/frr-collect-sample/r1`) |

Collect first, then point the tools at the output. The server reads the files again on every call, so if you run the
collector again, the next answer uses the new state. A relative `path` is resolved from the server's working
directory, which is set by the client and is often not the repo. Use absolute paths.

**A lab running with `xray.sh`:** `xray.sh` runs the collector with the repo folder as its output, so the live state is
`/path/to/network-xray/xray-states.js`; the collector rewrites it whenever the routers' state changes. Give that file (or
the repo folder) as `path` while the lab is running; each call reads the latest state. After you stop `xray.sh`, the file keeps the last state.

**A containerlab lab you graph yourself** (the README's "Labs started another way"): `clab-xray-collect.js … --watch`
writes `xray-states.js` into the folder you give it. Give that folder as `path`; it stays live the same way.

**`docker run` or the netlab tool:** the state is inside the container. The page serves it, so save a copy and give
that file as `path` (use the port the page is on):

```
mkdir -p ~/nx-state && curl -s http://localhost:8600/static/xray-states.js -o ~/nx-state/xray-states.js
```

This is a snapshot: run `curl` again for the current state.

## Start it

```
node scripts/xray-mcp.js
```

The server needs Node.js 18 or later and nothing else (no npm install). It speaks JSON-RPC 2.0 on stdin/stdout, one
message per line (the MCP stdio transport), and writes logs to stderr. It supports the initialize-based MCP
revisions 2024-11-05 to 2025-11-25. The stateless 2026-07-28 revision is not implemented. When you run it by hand it
waits for input on stdin and exits when stdin closes. Normally the MCP client starts it for you.

To check it without a client, pipe requests in from the repo root (this is bash; on Windows use Git Bash or WSL). The
server runs in the repo here, so the relative `path` works; from a client, use an absolute path:

```
printf '%s\n' \
  '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-06-18","capabilities":{},"clientInfo":{"name":"example","version":"0"}}}' \
  '{"jsonrpc":"2.0","method":"notifications/initialized"}' \
  '{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"list_routers","arguments":{"path":"test/fixtures/iosxe-q15"}}}' \
  | node scripts/xray-mcp.js
```

The reply to `initialize`:

```json
{"jsonrpc":"2.0","id":1,"result":{"protocolVersion":"2025-06-18","capabilities":{"tools":{"listChanged":false}},"serverInfo":{"name":"network-xray","version":"1"},"instructions":"Read-only questions about a network-xray lab from saved state files. No router is contacted."}}
```

## Configure a client

### Claude Code

```
claude mcp add network-xray -- node /path/to/network-xray/scripts/xray-mcp.js
```

This adds the server for the current project, for you only (the default `--scope local`). Use `--scope user` to make
it available in all your projects. Use `--scope project` to write it to `.mcp.json` in the project so it can be
shared:

```
claude mcp add --scope project network-xray -- node /path/to/network-xray/scripts/xray-mcp.js
```

That writes:

```json
{
  "mcpServers": {
    "network-xray": {
      "type": "stdio",
      "command": "node",
      "args": [
        "/path/to/network-xray/scripts/xray-mcp.js"
      ],
      "env": {}
    }
  }
}
```

`claude mcp list` should then show `network-xray: node …/scripts/xray-mcp.js - √ Connected`. On Windows, give the
`C:\...\scripts\xray-mcp.js` path.

### Any other MCP client (JSON config)

Most clients that start stdio servers, Claude Desktop among them, take an `mcpServers` block like this. In Claude
Desktop it goes in `claude_desktop_config.json` (Settings → Developer → Edit Config); other clients name their own file.

```json
{
  "mcpServers": {
    "network-xray": {
      "command": "node",
      "args": ["/path/to/network-xray/scripts/xray-mcp.js"]
    }
  }
}
```

If `node` is not on the client's `PATH`, set `command` to the full path of the Node.js binary.

### First use: approving the server

The first time a client uses the server, it may ask you to approve it. Claude Code asks before it starts a server
from a project's `.mcp.json`. Until you approve it, `claude mcp get network-xray` shows:

```
  Status: ⏸ Pending approval (run `claude` to approve)
```

Many clients also ask before each tool call, or the first
time a tool is called. All seven tools are marked read-only (`readOnlyHint: true`, `destructiveHint: false`), and they
only read the `path` you give them. A file that does not hold network-xray state is refused with
`not a network-xray state file`; the error never quotes the file.

## Ask

Once the client knows about the server, ask in plain language and give the path, for example:

- "Use lab_state on /path/to/network-xray/test/fixtures/iosxe-q15. Which links are down?"
- "Same lab: why does r1 pick its path to 8.8.8.0/24?"
- "Same lab: which route does r1 use for 8.8.8.8?"

If the assistant does not know which lab you mean, give the path again.

## Tools

| Tool | Input | Returns |
|---|---|---|
| `lab_state` | `path` | nodes and interfaces, links, OSPF adjacencies, BGP sessions, counts |
| `why_best_path` | `path`, `node`, `prefix`, `vrf?` | BGP best path for the prefix and the reason stored with it |
| `list_routers` | `path` | router names, which protocols have state, whether a routing table was collected, row counts |
| `ospf_neighbors` | `path`, `router?` | per router: neighbor ID, address, state, interface, DR/BDR role, peer node |
| `bgp_neighbors` | `path`, `router?` | per router: peer, remote AS, iBGP/eBGP, state, prefixes received |
| `route_lookup` | `path`, `router`, `destination`, `vrf?` | longest-prefix match in the collected routing table |
| `why_path` | `path`, `router`, `prefix`, `vrf?` | the selected BGP path, the other candidates with their attributes, the deciding step and where that reason came from |

`why_best_path` gives only the reason stored in the data (`null` with a note when there is none). `why_path` also lists
the other candidates, and when the router gave no reason it compares their attributes itself (`reason_source`).

All arguments are strings. `?` marks an optional argument. Each successful call returns the same JSON object twice:
as text in `content[0].text` and as `structuredContent`. For example, here is the full wire reply to the
`list_routers` call above:

```json
{"jsonrpc":"2.0","id":2,"result":{"content":[{"type":"text","text":"{\n  \"routers\": [\n    {\n      \"name\": \"r1\",\n      \"nos\": \"ios-xe\",\n      \"protocols\": [\n        \"ospf\",\n        \"bgp\"\n      ],\n      \"routing_table\": true,\n      \"counts\": {\n        \"ospf_neighbors\": 1,\n        \"bgp_neighbors\": 1,\n        \"bgp_routes\": 1,\n        \"routes\": 4\n      }\n    },\n    {\n      \"name\": \"r2\",\n      \"nos\": \"ios-xe\",\n      \"protocols\": [\n        \"ospf\",\n        \"bgp\"\n      ],\n      \"routing_table\": true,\n      \"counts\": {\n        \"ospf_neighbors\": 1,\n        \"bgp_neighbors\": 2,\n        \"bgp_routes\": 1,\n        \"routes\": 5\n      }\n    },\n    {\n      \"name\": \"r3\",\n      \"nos\": \"ios-xe\",\n      \"protocols\": [\n        \"bgp\"\n      ],\n      \"routing_table\": true,\n      \"counts\": {\n        \"ospf_neighbors\": 0,\n        \"bgp_neighbors\": 1,\n        \"bgp_routes\": 1,\n        \"routes\": 4\n      }\n    }\n  ],\n  \"count\": 3\n}"}],"structuredContent":{"routers":[{"name":"r1","nos":"ios-xe","protocols":["ospf","bgp"],"routing_table":true,"counts":{"ospf_neighbors":1,"bgp_neighbors":1,"bgp_routes":1,"routes":4}},{"name":"r2","nos":"ios-xe","protocols":["ospf","bgp"],"routing_table":true,"counts":{"ospf_neighbors":1,"bgp_neighbors":2,"bgp_routes":1,"routes":5}},{"name":"r3","nos":"ios-xe","protocols":["bgp"],"routing_table":true,"counts":{"ospf_neighbors":0,"bgp_neighbors":1,"bgp_routes":1,"routes":4}}],"count":3}}}
```

The examples below show the request line and the `structuredContent` of the reply. They were produced by running the
server from the repo root against `test/fixtures/iosxe-q15` (three Cisco IOS-XE routers: r1 and r2 in AS 65001 with
OSPF between them, r3 in AS 65002 announcing 8.8.8.0/24) and `test/fixtures/iosxe-ecmp`.

### lab_state

Input: `path`.

```json
{"jsonrpc":"2.0","id":3,"method":"tools/call","params":{"name":"lab_state","arguments":{"path":"test/fixtures/iosxe-q15"}}}
```

```json
{
  "nodes": [
    { "name": "r1", "nos": "ios-xe", "protocol": "bgp", "interfaces": [
      { "name": "Loopback0", "up": true, "ip": "1.1.1.1/32" },
      { "name": "Ethernet0/1", "up": true, "ip": "10.10.0.10/24" } ] },
    { "name": "r2", "nos": "ios-xe", "protocol": "bgp", "interfaces": [
      { "name": "Loopback0", "up": true, "ip": "2.2.2.2/32" },
      { "name": "Ethernet0/1", "up": true, "ip": "10.10.0.20/24" },
      { "name": "Ethernet0/2", "up": true, "ip": "10.11.0.10/24" } ] },
    { "name": "r3", "nos": "ios-xe", "protocol": "bgp", "interfaces": [
      { "name": "Ethernet0/1", "up": true, "ip": "10.11.0.20/24" },
      { "name": "Loopback0", "up": true, "ip": "8.8.8.8/32" } ] }
  ],
  "links": [
    { "a": "r1", "a_iface": "Ethernet0/1", "b": "r2", "b_iface": "Ethernet0/1", "up": true, "ospf_state": "Full" },
    { "a": "r2", "a_iface": "Ethernet0/2", "b": "r3", "b_iface": "Ethernet0/1", "up": true, "ospf_state": "Down" }
  ],
  "ospf_adjacencies": [
    { "node": "r1", "neighbor_id": "2.2.2.2", "address": "10.10.0.20", "iface": "Ethernet0/1", "state": "Full", "role": "DR", "peer": "r2" },
    { "node": "r2", "neighbor_id": "1.1.1.1", "address": "10.10.0.10", "iface": "Ethernet0/1", "state": "Full", "role": "Backup", "peer": "r1" }
  ],
  "bgp_sessions": [
    { "node": "r1", "peer_ip": "2.2.2.2", "remote_as": 65001, "type": "iBGP", "state": "Established", "established": true, "pfx_rcvd": 1 },
    { "node": "r2", "peer_ip": "1.1.1.1", "remote_as": 65001, "type": "iBGP", "state": "Established", "established": true, "pfx_rcvd": 0 },
    { "node": "r2", "peer_ip": "10.11.0.20", "remote_as": 65002, "type": "eBGP", "state": "Established", "established": true, "pfx_rcvd": 1 },
    { "node": "r3", "peer_ip": "10.11.0.10", "remote_as": 65001, "type": "eBGP", "state": "Established", "established": true, "pfx_rcvd": 0 }
  ],
  "counts": { "nodes": 3, "links": 2, "ospf_full": 2, "ospf_total": 2, "bgp_established": 4, "bgp_total": 4 }
}
```

The r2–r3 link has `ospf_state: "Down"` because OSPF is not running toward r3. Only eBGP runs on that link.

### why_best_path

Input: `path`, `node`, `prefix` (the prefix length can be left out when only one prefix matches), and `vrf` (needed only
when the prefix is in more than one VRF).

```json
{"jsonrpc":"2.0","id":4,"method":"tools/call","params":{"name":"why_best_path","arguments":{"path":"test/fixtures/iosxe-q15","node":"r1","prefix":"8.8.8.0/24"}}}
```

```json
{
  "node": "r1",
  "prefix": "8.8.8.0/24",
  "paths": 1,
  "best": { "next_hop": "2.2.2.2", "as_path": "65002", "status": "*>", "local_pref": 100, "weight": 0, "metric": 0, "origin": "IGP", "best": true },
  "reason": "First path received",
  "reason_source": "bgp_routes[].reason (IOS-XE: derived by the collector from the printed columns)",
  "candidates": [
    { "next_hop": "2.2.2.2", "as_path": "65002", "status": "*>", "local_pref": 100, "weight": 0, "metric": 0, "origin": "IGP", "best": true }
  ]
}
```

`reason` is the reason stored in the data: FRR's own `selectionReason`, or for IOS-XE the reason the collector derives
from the printed columns. `reason_source` says which. If the data has no reason, `reason` is `null` and a `note` says
the reason is not in the data. The server does not guess one.

### list_routers

Input: `path`.

```json
{"jsonrpc":"2.0","id":5,"method":"tools/call","params":{"name":"list_routers","arguments":{"path":"test/fixtures/iosxe-q15"}}}
```

```json
{
  "routers": [
    { "name": "r1", "nos": "ios-xe", "protocols": ["ospf", "bgp"], "routing_table": true,
      "counts": { "ospf_neighbors": 1, "bgp_neighbors": 1, "bgp_routes": 1, "routes": 4 } },
    { "name": "r2", "nos": "ios-xe", "protocols": ["ospf", "bgp"], "routing_table": true,
      "counts": { "ospf_neighbors": 1, "bgp_neighbors": 2, "bgp_routes": 1, "routes": 5 } },
    { "name": "r3", "nos": "ios-xe", "protocols": ["bgp"], "routing_table": true,
      "counts": { "ospf_neighbors": 0, "bgp_neighbors": 1, "bgp_routes": 1, "routes": 4 } }
  ],
  "count": 3
}
```

`protocols` lists `ospf` when the data has OSPF neighbors or an LSDB, and `bgp` when it has BGP neighbors or BGP routes.

### ospf_neighbors

Input: `path`, and `router` (optional; leave it out to get all routers).

```json
{"jsonrpc":"2.0","id":6,"method":"tools/call","params":{"name":"ospf_neighbors","arguments":{"path":"test/fixtures/iosxe-q15","router":"r1"}}}
```

```json
{
  "routers": [
    { "router": "r1", "neighbors": [
      { "neighbor": "2.2.2.2", "address": "10.10.0.20", "state": "Full", "interface": "Ethernet0/1", "role": "DR", "peer": "r2" } ] }
  ],
  "counts": { "total": 1, "full": 1 }
}
```

`role` and `peer` (the neighbor's node name) appear only when the data has them.

### bgp_neighbors

Input: `path`, and `router` (optional; leave it out to get all routers).

```json
{"jsonrpc":"2.0","id":7,"method":"tools/call","params":{"name":"bgp_neighbors","arguments":{"path":"test/fixtures/iosxe-q15","router":"r2"}}}
```

```json
{
  "routers": [
    { "router": "r2", "peers": [
      { "peer": "1.1.1.1", "remote_as": 65001, "type": "iBGP", "state": "Established", "established": true, "prefixes_received": 0 },
      { "peer": "10.11.0.20", "remote_as": 65002, "type": "eBGP", "state": "Established", "established": true, "prefixes_received": 1 } ] }
  ],
  "counts": { "total": 2, "established": 2 }
}
```

`prefixes_received` is `null` when the data has no count. A router with no BGP is listed with `"peers": []`.

### route_lookup

Input: `path`, `router`, `destination` (an IPv4 or IPv6 address with no prefix length), and `vrf` (optional; the
default is the default VRF).

```json
{"jsonrpc":"2.0","id":8,"method":"tools/call","params":{"name":"route_lookup","arguments":{"path":"test/fixtures/iosxe-q15","router":"r1","destination":"8.8.8.8"}}}
```

```json
{
  "router": "r1",
  "destination": "8.8.8.8",
  "vrf": "default",
  "route": { "prefix": "8.8.8.0/24", "protocol": "bgp", "next_hop": "2.2.2.2", "out_iface": "Ethernet0/1" },
  "next_hop": "2.2.2.2",
  "out_iface": "Ethernet0/1"
}
```

With ECMP, `route.nexthops` lists every next hop (`test/fixtures/iosxe-ecmp`):

```json
{"jsonrpc":"2.0","id":9,"method":"tools/call","params":{"name":"route_lookup","arguments":{"path":"test/fixtures/iosxe-ecmp","router":"r1","destination":"4.4.4.4"}}}
```

```json
{
  "router": "r1",
  "destination": "4.4.4.4",
  "vrf": "default",
  "route": {
    "prefix": "4.4.4.4/32", "protocol": "ospf", "next_hop": "10.13.0.3", "out_iface": "Ethernet0/2",
    "nexthops": [ { "ip": "10.13.0.3", "iface": "Ethernet0/2" }, { "ip": "10.12.0.2", "iface": "Ethernet0/1" } ]
  },
  "next_hop": "10.13.0.3",
  "out_iface": "Ethernet0/2"
}
```

Only installed rows of the routing table the collector saved are searched. The server does not compute routing.
`next_hop` is `null` for a directly connected route. If nothing matches, `route` is `null` and a `note` says so. If
the router has no collected routing table, the `note` says there is no routing table in the data.

### why_path

Input: `path`, `router`, `prefix` (a prefix such as `8.8.8.0/24`, or an address inside it; a bare address is matched to the
longest BGP prefix that contains it), and `vrf` (needed only when the prefix is in several VRFs).

The answer has the selected path, the other `candidates` with their attributes, the `deciding_step`, and `reason_source`:
`"device"` when the router reported the reason (FRR `selectionReason`), `"comparison"` when network-xray inferred it by comparing
the attributes in the data (Weight, LocPrf, AS-Path, Origin, MED), or `null` with a note when neither says.

```json
{"jsonrpc":"2.0","id":11,"method":"tools/call","params":{"name":"why_path","arguments":{"path":"test/fixtures/iosxe-q15","router":"r1","prefix":"8.8.8.0/24"}}}
```

```json
{
  "router": "r1",
  "prefix": "8.8.8.0/24",
  "selected": {
    "next_hop": "2.2.2.2",
    "as_path": "65002",
    "status": "*>",
    "local_pref": 100,
    "weight": 0,
    "metric": 0,
    "origin": "IGP",
    "best": true
  },
  "candidates": [],
  "deciding_step": "Only path",
  "reason_source": "comparison"
}
```

## Errors

If a tool call has bad input (a missing or unknown file, an unknown router, a missing argument, an argument that is
not a string, or a destination that is not an address), the reply has `isError: true` and an `{"error": "..."}` text
instead of `structuredContent`:

```json
{"jsonrpc":"2.0","id":10,"method":"tools/call","params":{"name":"why_best_path","arguments":{"path":"test/fixtures/iosxe-q15","node":"r9","prefix":"8.8.8.0/24"}}}
```

```json
{"jsonrpc":"2.0","id":10,"result":{"content":[{"type":"text","text":"{\n  \"error\": \"unknown node: r9 (known: r1, r2, r3)\"\n}"}],"isError":true}}
```

Protocol problems are answered as JSON-RPC errors. An unknown tool returns `-32602`, an unknown method returns
`-32601`, a line that is not JSON returns `-32700`, and a malformed request returns `-32600`.

## See also

- `scripts/xray-query.js`: the same questions from the command line (`state` and `why`).
- `test/xray-mcp.test.js`: the tests that start the server and check these replies.
