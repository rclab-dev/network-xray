#!/usr/bin/env node
/*
 * xray-mcp.js - a minimal Model Context Protocol (MCP) server over stdio, read-only (one opt-in tool reads the routers again).
 *
 * Lets an AI assistant ask network-xray about a lab. It answers from files the collectors already wrote,
 * with the same functions as scripts/xray-query.js:
 *
 *   lab_state      { path }                  -> nodes, links, OSPF adjacencies, BGP sessions, counts
 *   why_best_path  { path, node, prefix, vrf? } -> BGP best path and the reason stored with it
 *                                               (reason null + a note when the data has none; never guessed)
 *   list_routers   { path }                  -> router names, which protocols have state, row counts
 *   ospf_neighbors { path, router? }         -> per router: neighbor, address, state, interface
 *   ospf_interfaces { path, router? }        -> per OSPF interface: MTU, hello / dead, network type, area, cost, role,
 *                                               passive, authentication; both ends of a link and what must match but
 *                                               does not (e.g. "r1 eth1 MTU 1500 <=> r2 eth1 MTU 1400")
 *   bgp_neighbors  { path, router? }         -> per router: peer, AS, state, prefixes received
 *   route_lookup   { path, router, destination, vrf? } -> longest-prefix match in the collected routing table
 *   why_path       { path, router, prefix, vrf? } -> selected BGP path, other candidates, deciding step and
 *                                               reason_source: "device" (router said) / "derived" (the IOS-XE collector
 *                                               worked it out from the printed columns) / "comparison" (inferred) / null
 *
 * Every successful call returns the same JSON object as text content and as structuredContent; bad input
 * (missing/unknown file, unknown router, malformed argument) returns isError with {"error": "..."}.
 *
 * `path` is anything xray-query.js accepts: a state_<node>.json, a directory of them, an xray-states.js,
 * or a directory of saved FRR `show ... json` files. Relative paths are resolved from the server's working directory.
 * A file that does not hold network-xray state is refused with "not a network-xray state file" (the error never
 * quotes the file).
 *
 * A default path: start the server with --path <p> or set NX_MCP_PATH=<p> (the option wins) and the tools that take
 * `path` use it when the client leaves `path` out (tools/list then shows `path` as optional and names it). A `path`
 * the client gives is used as given. The default is resolved once, when the server starts.
 *
 * It only reads the given path. It never runs commands on routers, never writes files, opens no network sockets.
 *
 * The one exception is opt-in: started with --allow-collect, the server also lists
 *   collect        { topology, proto? }      -> runs clab-xray-collect.js once on that running containerlab lab (the
 *                                               same read-only show commands as the page's collector; nothing on the
 *                                               routers changes), writes xray-states.js into a directory of its own
 *                                               (never the repo's) and returns the lab_state summary plus that `path`.
 *                                               Only a topology path and ospf|bgp are taken; one run at a time, 120 s.
 *
 * Transport: JSON-RPC 2.0, one message per line on stdin/stdout (MCP stdio). Logs go to stderr.
 * Protocol: the initialize-based MCP revisions (2024-11-05 to 2025-11-25). The stateless 2026-07-28 revision
 * (per-request _meta, server/discover) is not implemented.
 *   node scripts/xray-mcp.js
 */
'use strict';
var readline = require('readline');
var fs = require('fs'), os = require('os'), path = require('path'), cp = require('child_process');
var query = require('./xray-query.js');

var SERVER_INFO = { name: 'network-xray', version: '1' };   // the image's major tag (ghcr.io/rclab-dev/network-xray:1): no full version kept in a file
var PROTOCOL_VERSIONS = ['2025-11-25', '2025-06-18', '2025-03-26', '2024-11-05'];   // the initialize-based revisions; newest first

// stdout carries JSON-RPC only: anything that logs with console.log goes to stderr instead
console.log = console.error;
console.info = console.error;

var READ_ONLY = { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false };
var PATH_PROP = { type: 'string', description: "The lab's state: an xray-states.js, a state_<node>.json, a folder of them, or a folder of saved FRR show ... json files, e.g. lab/xray-states.js" };

var TOOLS = [
  {
    name: 'lab_state',
    description: 'Read a network-xray lab state (read-only) and summarize it. ' + 'Starts with `wrong`: what is wrong, each with a `text` line (an interface down, an OSPF interface that faces a neighbor and has no adjacency with the values both ends must share and do not, a Full adjacency whose ends still differ, a BGP session not Established, a route that cannot be used because its next hop is not reachable); empty when nothing is. only_problems: true returns only wrong and counts. ' +
      'Then nodes and interfaces, links, OSPF adjacencies, BGP sessions and counts. An adjacency that never came up is not in a ' +
      'neighbor table, so counts also has ospf_ifaces_expected (OSPF interfaces that face a neighbor, not passive), ospf_ifaces_full and ' +
      'ospf_ifaces_without_adjacency. No router is contacted.',
    inputSchema: {
      type: 'object',
      properties: {
        path: PATH_PROP,
        only_problems: { type: 'boolean', description: 'true = return only wrong and counts (no nodes, links or adjacency lists). Default false' }   /* nx_nh_wrong */
      },
      required: ['path'],
      additionalProperties: false
    },
    annotations: READ_ONLY
  },
  {
    name: 'why_best_path',
    description: 'Quick look: for one node and an exact prefix, the BGP best path and only the reason stored in the data. ' +
      'For a step-by-step comparison of the candidates, or an address instead of a prefix, use why_path. ' +
      'Gives the BGP best path and the reason stored in the data ' +
      '(FRR selectionReason, or the IOS-XE collector\'s derived reason). If the data has no reason, reason is null ' +
      'and a note says so; nothing is guessed. A path with no local_pref gets a local_pref_note (the default applies; no value is filled in). Read-only.',
    inputSchema: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Same input as lab_state' },
        node: { type: 'string', description: 'Node name, e.g. r1' },
        prefix: { type: 'string', description: 'Prefix, e.g. 8.8.8.0/24 (the length may be omitted when unambiguous)' },
        vrf: { type: 'string', description: 'VRF, only needed when the prefix is in several VRFs' }
      },
      required: ['path', 'node', 'prefix'],
      additionalProperties: false
    },
    annotations: READ_ONLY
  },
  {
    name: 'list_routers',
    description: 'List the routers in a network-xray lab state and which protocols have state for each ' +
      '(ospf: OSPF neighbors or LSDB in the data; bgp: BGP neighbors or BGP routes), whether a routing table was ' +
      'collected, and row counts. Read-only.',
    inputSchema: {
      type: 'object',
      properties: { path: PATH_PROP },
      required: ['path'],
      additionalProperties: false
    },
    annotations: READ_ONLY
  },
  {
    name: 'ospf_neighbors',
    description: 'List the OSPF neighbors each router has, as collected: for each neighbor its router ID, address, state (e.g. Full), ' +
      'interface, DR/BDR role and peer node name when known. All routers, or one with `router`. The answer starts with `wrong`: ' +
      'each problem for OSPF and interfaces with a `text` line (an interface down, an OSPF interface that faces a neighbor and has ' +
      'no adjacency, a Full adjacency whose ends still differ); empty when nothing is. To see why an adjacency is missing (the ' +
      'values both ends must share, such as MTU or hello), use ospf_interfaces. Read-only: answers from the state files, no router is contacted.',
    inputSchema: {
      type: 'object',
      properties: { path: PATH_PROP, router: { type: 'string', description: 'Only this router, e.g. r1 (default: all routers)' } },
      required: ['path'],
      additionalProperties: false
    },
    annotations: READ_ONLY
  },
  {
    name: 'ospf_interfaces',
    description: 'Starts with `wrong`: what is wrong, for OSPF and interfaces, each with a `text` line (an interface down, an OSPF interface that faces a neighbor and has no adjacency with the values both ends must share and do not, a Full adjacency whose ends still differ); empty when nothing is. ' + 'Then `mismatches` and `hints` (below), then the OSPF interface values per router as collected: MTU, hello and dead intervals, network type, area, cost, ' +
      'DR/BDR role, priority, passive, authentication (none / simple / md5) and neighbor counts. For a link it also gives the ' +
      'other end and `mismatches`: one line per value that must be equal for an adjacency but is not, e.g. ' +
      '"r1 eth1 MTU 1500 \u21d4 r2 eth1 MTU 1400". `mismatch_details` has the same lines as fields, with `odd_end`: the router whose value differs from its own other OSPF interfaces while the other end matches its own (an inference, with a `note`; null when that does not decide it, and for area). A value the router did not report is null and is not compared; each interface also has the neighbor state there, and `hints` names a link stuck in ExStart / Exchange whose MTU was not reported. ' +
      'All routers, or one with `router`. Read-only.',
    inputSchema: {
      type: 'object',
      properties: { path: PATH_PROP, router: { type: 'string', description: 'Only this router, e.g. r1 (default: all routers)' } },
      required: ['path'],
      additionalProperties: false
    },
    annotations: READ_ONLY
  },
  {
    name: 'bgp_neighbors',
    description: 'Starts with `wrong`: each BGP session that is not Established, with a `text` line (empty when none). ' +
      'Then BGP neighbors per router as collected: peer address, remote AS, iBGP/eBGP, state, ' +
      'established, and prefixes received (null when the data has no count). All routers, or one with `router`. Read-only.',
    inputSchema: {
      type: 'object',
      properties: { path: PATH_PROP, router: { type: 'string', description: 'Only this router, e.g. r1 (default: all routers)' } },
      required: ['path'],
      additionalProperties: false
    },
    annotations: READ_ONLY
  },
  {
    name: 'route_lookup',
    description: 'Look up a destination address in one router\'s collected routing table (installed rows only) ' +
      'by longest prefix match: the matching route, its protocol, next hop and outgoing interface (all next hops ' +
      'for ECMP). next_hop is null for a directly connected route; route is null with a note when nothing matches. ' +
      'A recursive next hop carries resolved_via (what the router resolved it through; via_mgmt when that is the lab\'s ' +
      'management network, i.e. not reachable inside the lab topology) and a note says so. ' +
      'When the data has the OSPF database (collected with network-xray 1.4 or later), the answer starts with `why`: one line ' +
      'per reason the destination has no OSPF route here or a different one (a router has it but does not advertise it, it is ' +
      'advertised by a router whose router ID another router also has, OSPF has the route but the routing table did not install ' +
      'it, a static route is not redistributed, an inter-area route). ' +
      'This reads the table the collector saved; it does not compute routing. Read-only.',
    inputSchema: {
      type: 'object',
      properties: {
        path: PATH_PROP,
        router: { type: 'string', description: 'Router name, e.g. r1' },
        destination: { type: 'string', description: 'IPv4 or IPv6 address, e.g. 8.8.8.8 or 2001:db8::1 (no prefix length)' },
        vrf: { type: 'string', description: 'VRF of the routing table rows to search (default: the default VRF)' }
      },
      required: ['path', 'router', 'destination'],
      additionalProperties: false
    },
    annotations: READ_ONLY
  },
  {
    name: 'why_path',
    description: 'Full answer (prefer this to why_best_path for "why" questions): it also takes an address, and when the router gives no reason it compares the candidates step by step. ' +
      'Why one router selected its BGP path to a prefix: the selected path, the other candidates with their ' +
      'attributes, the deciding step, and where that reason came from: reason_source "device" when the router reported it ' +
      '(FRR selectionReason), "derived" when the collector worked it out from what the router printed (Cisco IOS-XE prints ' +
      'no reason), "comparison" when network-xray inferred it by comparing the attributes in the data (Weight, LocPrf, ' +
      'AS-Path, Origin, MED, then eBGP over iBGP when the data says how each path was learned), or null with a note when neither says. ' +
      'summary gives the answer in one line; each path names the router its next hop belongs to (peer). A bare address is matched to the longest BGP prefix ' +
      'that contains it. Read-only.',
    inputSchema: {
      type: 'object',
      properties: {
        path: PATH_PROP,
        router: { type: 'string', description: 'Router name, e.g. r1' },
        prefix: { type: 'string', description: 'Prefix (e.g. 8.8.8.0/24) or an address inside it (e.g. 8.8.8.8)' },
        vrf: { type: 'string', description: 'VRF, only needed when the prefix is in several VRFs' }
      },
      required: ['path', 'router', 'prefix'],
      additionalProperties: false
    },
    annotations: READ_ONLY
  },
  {
    name: 'state_diff',
    description: 'What changed from a baseline state you kept to the state now, heaviest first: routers gone or not read, ' +
      'interfaces down, OSPF adjacencies lost, OSPF interface values both ends must share that changed, BGP sessions down, ' +
      'best paths that moved (with the router\'s reason), routes removed or moved (with originated_by: the router where ' +
      'that prefix is directly connected), then what came back or was added. none is true when nothing changed. ' +
      'Uptimes, counters and the management network are not compared. The baseline is whatever path you pass as before ' +
      '(a state you saved, or collect\'s previous). Read-only.',
    inputSchema: {
      type: 'object',
      properties: {
        before: { type: 'string', description: 'The baseline state (same input as lab_state)' },
        after: { type: 'string', description: 'The state now (same input as lab_state)' },
        router: { type: 'string', description: 'Only this router (default: all)' },
        mgmt_subnet: { type: 'string', description: 'The lab\'s management network, left out (default 172.20.20.0/24; netlab: 192.168.121.0/24)' }
      },
      required: ['before', 'after'],
      additionalProperties: false
    },
    annotations: READ_ONLY
  },
  {
    name: 'check_run',
    description: 'SolvedKit: is the lab solved now? Judges the lab\'s problem.json check against one state with the same ' +
      'rules as the page\'s Solved mark (one reading; the page also waits about 10 s for the check to keep holding). ' +
      'status is solved, not_solved, or cannot_judge (no check, or a router in the check is missing or cannot be read - ' +
      'then reason says which). results has one entry per condition (ok: true, false, or null when it cannot be judged). Read-only.',
    inputSchema: {
      type: 'object',
      properties: {
        problem: { type: 'string', description: 'The lab\'s problem.json, or the folder that has it' },
        path: { type: 'string', description: 'The state to judge (same input as lab_state)' }
      },
      required: ['problem', 'path'],
      additionalProperties: false
    },
    annotations: READ_ONLY
  },
  {
    name: 'check_verify',
    description: 'SolvedKit: does a problem.json check tell the broken lab from the solved one? status ok means the check ' +
      'fails on the broken state and holds on the solved state. Each condition gets a verdict: tells (fails on broken, ' +
      'holds on solved), both (holds on both - fine next to a condition that tells), wrong (fails on solved: the solved lab ' +
      'would never get the mark) or unknown (a router cannot be read). problems lists what to fix. Use it on a check you ' +
      'wrote before you publish the lab. Read-only.',
    inputSchema: {
      type: 'object',
      properties: {
        problem: { type: 'string', description: 'The lab\'s problem.json, or the folder that has it' },
        broken: { type: 'string', description: 'A state of the broken lab (same input as lab_state)' },
        solved: { type: 'string', description: 'A state of the solved lab (same input as lab_state)' }
      },
      required: ['problem', 'broken', 'solved'],
      additionalProperties: false
    },
    annotations: READ_ONLY
  },
  {
    name: 'check_suggest',
    description: 'SolvedKit: candidate problem.json check conditions from what the fix changed between a broken and a solved ' +
      'state of the same lab (the state_diff changes the check can see: a route now selected through an interface, a BGP ' +
      'best path, an OSPF adjacency Full, a BGP session Established, an interface up; the old best path kept as a backup). ' +
      'Every candidate is judged on both states; check is the proposed check, verified to fail on broken and hold on solved ' +
      '(status ok), or null with reason (status none; cannot_judge when the solved state cannot be read). A candidate marked ' +
      'binds_method names how a route is learned; it is not in the check unless nothing else tells (then warnings says so) - ' +
      'add it only if the problem asks for that. skipped lists the changes it did not use and why. It cannot know other ways ' +
      'to solve the problem. Read-only.',
    inputSchema: {
      type: 'object',
      properties: {
        broken: { type: 'string', description: 'A state of the broken lab (same input as lab_state)' },
        solved: { type: 'string', description: 'A state of the solved lab (same input as lab_state)' },
        focus: { type: 'string', description: 'The router to start from (default: the one the fix changed most)' },
        prefix: { type: 'string', description: 'The destination to start from, e.g. 8.8.8.0/24 (optional)' },
        mgmt_subnet: { type: 'string', description: 'The lab\'s management network, left out (default 172.20.20.0/24; netlab: 192.168.121.0/24)' }
      },
      required: ['broken', 'solved'],
      additionalProperties: false
    },
    annotations: READ_ONLY
  },
  {
    name: 'check_init',
    description: 'SolvedKit: a problem.json draft for a lab from a broken and a solved state: format, focus, and the check from ' +
      'check_suggest; the title and problem text (English and Japanese) and the id are left empty for you to write (todo ' +
      'lists them). Returns the draft as problem; it writes no file. status none (with reason) when no check can be proposed. Read-only.',
    inputSchema: {
      type: 'object',
      properties: {
        broken: { type: 'string', description: 'A state of the broken lab (same input as lab_state)' },
        solved: { type: 'string', description: 'A state of the solved lab (same input as lab_state)' },
        focus: { type: 'string', description: 'The router to start from (default: the one the fix changed most)' },
        prefix: { type: 'string', description: 'The destination to start from, e.g. 8.8.8.0/24 (optional)' },
        mgmt_subnet: { type: 'string', description: 'The lab\'s management network, left out (default 172.20.20.0/24; netlab: 192.168.121.0/24)' }
      },
      required: ['broken', 'solved'],
      additionalProperties: false
    },
    annotations: READ_ONLY
  },
  {
    name: 'explain_plan',
    description: 'What each line of a proposed fix is for: give the config lines someone wants to type on one router (FRR / IOS, ' +
      'with their router ospf / interface / router bgp / route-map lines) and each line gets a tag against the lab state: fixes ' +
      '(it touches something listed as wrong: the same interface, OSPF value, BGP neighbor or route), requirement (it makes a route ' +
      'or adjacency that a condition of the problem check asks for and is not met now, e.g. a backup route), not_linked (linked ' +
      'to nothing the tool knows; not "unrelated": a requirement in words may need it) or ? (not read, or its effect is not ' +
      'decided by the state; a route-map value is shown next to the comparison now, without saying which path would win). ' +
      'because gives the state values behind each tag. Requirements in words are returned as given, not interpreted. It ' +
      'changes nothing and predicts nothing. Read-only.',
    inputSchema: {
      type: 'object',
      properties: {
        path: PATH_PROP,
        router: { type: 'string', description: 'The router the lines are for, e.g. r1' },
        lines: { type: 'string', description: 'The proposed config lines, one per line, as typed after configure terminal' },
        problem: { type: 'string', description: 'A problem.json (or the folder with it) whose check holds the requirements (optional)' },
        requirements: { type: 'string', description: 'Requirements in words, e.g. "r1 must still reach 3.3.3.3 via r2 if the r1-r3 link fails" (optional; shown, not interpreted)' },
        prefix: { type: 'string', description: 'The destination the fix is about, e.g. 3.3.3.3/32 (default: the problem focus, or the one the state resolved)' }
      },
      required: ['path', 'router', 'lines'],
      additionalProperties: false
    },
    annotations: READ_ONLY
  }
];

/* nx_mcp_router_node (v1.8.1): why_best_path names the router `node`, the other tools `router`. Each tool takes both names
   (the other one as an alias, same meaning), so a client that guesses the other name still works. Given both and they differ: an error. */
TOOLS.forEach(function (t) {
  var p = t.inputSchema && t.inputSchema.properties; if (!p) return;
  if (p.router && !p.node) p.node = { type: 'string', description: 'Same as router (the name why_best_path uses)' };
  else if (p.node && !p.router) p.router = { type: 'string', description: 'Same as node (the name the other tools use)' };
});
function routerNodeAlias(args) {
  var r = args.router, n = args.node;
  if (r != null && n != null && r !== n) throw new Error('arguments router and node name different routers (' + r + ', ' + n + '): give one of them');
  if (r == null && n == null) return args;
  var a = Object.assign({}, args); a.router = r != null ? r : n; a.node = a.router; return a;
}
/* nx_mcp_collect (2026-11-11): read the routers again from the MCP client - off unless the server is started with
   --allow-collect (then tools/list has it too). It runs the existing collector once with fixed arguments; the client
   gives only the topology file and ospf|bgp. */
var COLLECT_TOOL = {
  name: 'collect',
  description: 'Read the routers of a running containerlab lab again and return the new state: runs network-xray\'s ' +
    'collector once (the same read-only show commands as the page: docker exec vtysh / sr_cli, SSH show on Cisco IOS; ' +
    'nothing on the routers changes). Returns the lab_state summary plus `path`, the xray-states.js it wrote into a ' +
    'directory of its own: give that `path` to the other tools. Use it after you changed a router\'s configuration. ' +
    'With keep_previous: true the state it replaces is kept and returned as `previous` (give both to state_diff); ' +
    'without it nothing older is kept. Available only when the server was started with --allow-collect. One run at a time, at most 120 s.',
  inputSchema: {
    type: 'object',
    properties: {
      topology: { type: 'string', description: 'The running lab\'s containerlab topology file (*.clab.yml), absolute path' },
      proto: { type: 'string', enum: ['bgp', 'ospf'], description: 'bgp (default: reads OSPF too) or ospf (an OSPF-only lab)' },
      keep_previous: { type: 'boolean', description: 'Keep the state this run replaces and return it as previous (default: false)' }
    },
    required: ['topology'],
    additionalProperties: false
  },
  annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: true }
};
var COLLECT_MS = 120000, ROOT = path.join(__dirname, '..');
var allowCollect = false, collecting = false, collectDir = null;
/* nx_mcp_default_path (v1.4.1): with a default path the tools that take `path` list it as optional and say where it
   points; without one the list is exactly as before. state_diff keeps before / after required. */
var defaultPath = null;
function withDefaultPath(t) {
  var props = t.inputSchema && t.inputSchema.properties;
  if (!props || !props.path) return t;
  var c = JSON.parse(JSON.stringify(t));
  c.inputSchema.properties.path.description += '. Optional here: leave it empty to read the state the server was started with (--path / NX_MCP_PATH)';   /* nx_mcp_path_desc_stable (v1.6.1): no folder name in the text */
  c.inputSchema.required = c.inputSchema.required.filter(function (k) { return k !== 'path'; });
  return c;
}
/* nx_mcp_apps (v1.7): a picture for the person, for MCP clients that draw MCP Apps (the io.modelcontextprotocol/ui
   extension). Only when the client says so in initialize: four tools point at one HTML resource (ui://network-xray/view.html,
   the engine inlined: it loads nothing from outside, and no CSP is declared, so the host's default lets it reach nothing),
   and view_data (visible to the picture only, not to the model) gives the picture the lab's state. The answers the model
   reads do not change, no URL is returned and no socket is opened. A client that does not say so sees exactly the tools
   it saw before. */
var UI_EXT = 'io.modelcontextprotocol/ui', UI_MIME = 'text/html;profile=mcp-app', VIEW_URI = 'ui://network-xray/view.html';
var UI_TOOLS = { lab_state: 1, why_best_path: 1, why_path: 1, ospf_neighbors: 1 };
var VIEW_MAX = 2 * 1024 * 1024;   // the state view_data passes to the picture, as JSON text
var uiClient = false;
var VIEW_DATA_TOOL = {
  name: 'view_data',
  description: 'For the network-xray picture only (not for the model): the lab state and its links, to draw. Read-only.',
  inputSchema: {
    type: 'object',
    properties: { path: PATH_PROP },
    required: ['path'],
    additionalProperties: false
  },
  annotations: READ_ONLY,
  _meta: { ui: { resourceUri: VIEW_URI, visibility: ['app'] } }
};
function clientDrawsUi(caps) {
  var e = caps && caps.extensions && caps.extensions[UI_EXT];
  return !!(e && Array.isArray(e.mimeTypes) && e.mimeTypes.indexOf(UI_MIME) >= 0);
}
function withUi(t) {
  if (!UI_TOOLS[t.name]) return t;
  var c = Object.assign({}, t);
  c._meta = { ui: { resourceUri: VIEW_URI } };
  return c;
}
function tools() {
  var t = allowCollect ? TOOLS.concat([COLLECT_TOOL]) : TOOLS;
  if (uiClient) t = t.map(withUi).concat([VIEW_DATA_TOOL]);
  return defaultPath ? t.map(withDefaultPath) : t;
}
// the lab state and its links in the containerlab graph shape the picture reads (nodes [{name}], links [{source, target, ...}])
function viewData(states) {
  if (JSON.stringify(states).length > VIEW_MAX) throw new Error('the lab state is too big to draw here (more than 2 MB); the answers above still hold');
  var names = Object.keys(states), links = (query.summarize(states).links || []).map(function (l) {
    return { source: l.a, target: l.b, source_endpoint: l.a_iface || '', target_endpoint: l.b_iface || '' };
  });
  links.forEach(function (l) { [l.source, l.target].forEach(function (n) { if (n && names.indexOf(n) < 0) names.push(n); }); });
  return { nodes: names.map(function (n) { return { name: n }; }), links: links, states: states };
}
// ui/view.html with the engine files put in place of their markers (read once). "</script" inside a file would end the
// inline script early, so it is written "<\/script" (the same text to JavaScript).
var VIEW_PARTS = ['xray-core.js', 'xray-api.js', 'xray-i18n.js', 'xray-skin.js', 'clab-xray-bridge.js', 'ui/view.js'];
var viewHtmlCache = null;
function viewHtml() {
  if (viewHtmlCache) return viewHtmlCache;
  var html = fs.readFileSync(path.join(ROOT, 'ui', 'view.html'), 'utf8');
  VIEW_PARTS.forEach(function (p) {
    var mark = '<!-- nx-inline:' + p + ' -->';
    if (html.split(mark).length !== 2) throw new Error('ui/view.html: expected one ' + mark);
    var js = fs.readFileSync(path.join(ROOT, p), 'utf8').replace(/<\/script/gi, '<\\/script');
    html = html.replace(mark, function () { return '<script>\n' + js + '\n</script>'; });
  });
  // decision-bracket.html as text (window.__nxBracketHtml): "See all decision steps" opens it over the picture; every "<" is
  // written \u003c so the text cannot end the script element
  var bmark = '<!-- nx-inline-text:decision-bracket.html -->';
  if (html.split(bmark).length !== 2) throw new Error('ui/view.html: expected one ' + bmark);
  var bracket = fs.readFileSync(path.join(ROOT, 'decision-bracket.html'), 'utf8');
  html = html.replace(bmark, function () { return '<script>\nwindow.__nxBracketHtml = ' + JSON.stringify(bracket).replace(/</g, '\\u003c') + ';\n</script>'; });
  viewHtmlCache = html;
  return html;
}

/* the collector needs its per-vendor collectors next to the output: a directory only this user can open (made once),
   with one sub-directory per topology holding copies of them - a lab page served from the repo keeps its own
   xray-states.js, and the path returned for one lab is not overwritten by a collect of another lab */
var topoDirs = {};
function ownCollectDir(topo) {
  if (!collectDir || !fs.existsSync(collectDir)) { collectDir = fs.mkdtempSync(path.join(os.tmpdir(), 'network-xray-mcp-')); topoDirs = {}; }
  if (!topoDirs[topo]) {
    var d = path.join(collectDir, 'lab' + (Object.keys(topoDirs).length + 1));
    fs.mkdirSync(d, { mode: 0o700 });
    ['clab-collect.js', 'clab-srl-collect.js', 'clab-iosxe-collect.js'].forEach(function (f) {
      if (fs.existsSync(path.join(ROOT, f))) fs.copyFileSync(path.join(ROOT, f), path.join(d, f));
    });
    topoDirs[topo] = d;
  }
  return topoDirs[topo];
}

function collectTool(args) {
  if (args != null && (typeof args !== 'object' || Array.isArray(args))) throw new Error('arguments must be an object');
  args = args || {};
  var extra = Object.keys(args).filter(function (k) { return k !== 'topology' && k !== 'proto' && k !== 'keep_previous'; });
  if (extra.length) throw new Error('collect takes only topology, proto and keep_previous, not: ' + extra.join(', ').slice(0, 100));
  if (args.keep_previous != null && typeof args.keep_previous !== 'boolean') throw new Error('keep_previous must be true or false');
  var keep = args.keep_previous === true;
  var topo = str(args, 'topology', true), proto = str(args, 'proto', false) || 'bgp';
  if (proto !== 'bgp' && proto !== 'ospf') throw new Error('proto must be bgp or ospf');
  if (!/\.ya?ml$/i.test(topo)) throw new Error('topology must be a containerlab topology file (*.clab.yml)');
  checkPath(topo);   /* nx_mcp_path_root */
  topo = path.resolve(topo);
  var st; try { st = fs.statSync(topo); } catch (e) { throw new Error('topology not found: ' + topo); }
  if (!st.isFile()) throw new Error('topology is not a file: ' + topo);
  if (collecting) throw new Error('a collect is already running - try again when it has finished');
  var dir = ownCollectDir(topo), out = path.join(dir, 'xray-states.js'), prev = path.join(dir, 'xray-states.previous.js');
  collecting = true;
  return new Promise(function (resolve) {
    try { fs.unlinkSync(prev); } catch (e) {}   // only the one state this run replaces is ever kept
    if (keep && fs.existsSync(out)) fs.renameSync(out, prev);
    try { fs.unlinkSync(out); } catch (e) {}
    cp.execFile(process.execPath, [path.join(ROOT, 'clab-xray-collect.js'), topo, dir, proto, '--exclude-mgmt'],
      { cwd: path.dirname(topo), timeout: COLLECT_MS, killSignal: 'SIGKILL', maxBuffer: 4 * 1024 * 1024, windowsHide: true },
      function (err, stdout, stderr) {
        collecting = false;
        if (err || !fs.existsSync(out)) {
          // the collector's own "!! ..." lines say why (lab name, no links, a collector missing); no file contents
          var why = String(stderr || '').split(/\r?\n/).filter(function (l) { return /^!! /.test(l); }).slice(0, 3).join(' / ');
          var msg = err && err.killed ? 'the collector did not finish in ' + (COLLECT_MS / 1000) + ' s'
            : 'the collector failed' + (why ? ': ' + why.slice(0, 600) : (err ? ' (exit ' + err.code + ')' : ''));
          return resolve({ error: msg });
        }
        try {
          var sum = query.summarize(loadStates(out));
          var res = { path: out, topology: topo, proto: proto };
          if (keep) res.previous = fs.existsSync(prev) ? prev : null;   // null: there was no earlier collect of this lab
          resolve(Object.assign(res, sum));
        } catch (e) { resolve({ error: (e && e.message) || String(e) }); }
      });
  });
}

function str(args, k, required) {
  var v = args[k];
  if (v == null || v === '') { if (required) throw new Error('missing argument: ' + k); return undefined; }
  if (typeof v !== 'string') throw new Error('argument ' + k + ' must be a string');
  return v;
}

// A file that does not hold network-xray state - or is not a regular file at all (a device, a FIFO) - gets one fixed
// message that says nothing about its contents or its path (the JSON parser's own message can quote the start of the
// file). Paths are read as xray-query.js reads them (any name); a path that is not there still says "not found".
var NOT_STATE = 'not a network-xray state file';
/* nx_mcp_path_root (v1.4.3): the server reads only under one folder - the --path / NX_MCP_PATH folder (a file's folder),
   else the folder it was started in. --allow-any-path (or NX_MCP_ALLOW_ANY_PATH=1) reads anywhere, as before.
   Symbolic links are followed first (realpath), so a link cannot lead outside. null = no limit (when used as a module). */
var pathRoot = null, ROOT_REFUSED = '\u0000root';   // started in / (or C:\): nothing is read without --path
function sameOrUnder(p, root) {
  var a = process.platform === 'win32' ? p.toLowerCase() : p, b = process.platform === 'win32' ? root.toLowerCase() : root;
  return a === b || a.indexOf(b.slice(-1) === path.sep ? b : b + path.sep) === 0;
}
function checkPath(p) {
  if (pathRoot == null || p == null || p === '') return p;
  var real, root;
  if (pathRoot === ROOT_REFUSED) throw new Error('this server was started in the root of the file system: start it with --path <folder> (the folder your lab state is in), or --allow-any-path');
  var rp = fs.realpathSync.native || fs.realpathSync;
  try { root = rp(pathRoot); } catch (e) { root = path.resolve(pathRoot); }
  try { real = rp(path.resolve(p)); } catch (e) { real = path.resolve(p); }
  var own = null;   // the server's own collect folder (what collect returns) is read too
  if (collectDir) { try { own = rp(collectDir); } catch (e) { own = null; } }
  if (!sameOrUnder(real, root) && !(own && sameOrUnder(real, own))) throw new Error('outside the folder this server reads (' + root + '): start it with --path <folder>, or --allow-any-path');
  return p;
}
// problem.json: the same rule - the parser's message is not passed on (it can quote the file)
var NOT_PROBLEM = 'not a problem.json (JSON object)';
function loadProblem(p) {
  checkPath(p);   /* nx_mcp_path_root: problem.json is read under the same folder as the states */
  try { return query.loadProblem(p, { check: checkPath }); } catch (e) {
    if (/^problem\.json is not/.test((e && e.message) || '')) throw new Error(NOT_PROBLEM);
    throw e;
  }
}
function loadStates(p) {
  checkPath(p);
  try { return query.loadStates(p, { check: checkPath }); } catch (e) {
    if (/^(not valid JSON|no node state found|not a regular file or a directory)/.test((e && e.message) || '')) throw new Error(NOT_STATE);
    throw e;
  }
}

function callTool(name, args) {
  if (args != null && (typeof args !== 'object' || Array.isArray(args))) throw new Error('arguments must be an object');
  args = routerNodeAlias(args || {});   /* nx_mcp_router_node */
  if (defaultPath && !/^(state_diff|check_verify|check_suggest|check_init)$/.test(name) && (args.path == null || args.path === '')) { args = Object.assign({}, args); args.path = defaultPath; }   /* nx_mcp_default_path */
  if (name === 'lab_state') {   /* nx_nh_wrong: only_problems = wrong and counts only */
    var op = args.only_problems;
    if (op != null && typeof op !== 'boolean') throw new Error('argument only_problems must be true or false');
    var sm = query.summarize(loadStates(str(args, 'path', true)));
    return op ? { wrong: sm.wrong, counts: sm.counts } : sm;
  }
  if (name === 'view_data') return viewData(loadStates(str(args, 'path', true)));   /* nx_mcp_apps */
  if (name === 'why_best_path') {
    var p = str(args, 'path', true), node = str(args, 'node', true), prefix = str(args, 'prefix', true);
    return query.why(loadStates(p), node, prefix, str(args, 'vrf', false));
  }
  if (name === 'list_routers') return query.listRouters(loadStates(str(args, 'path', true)));
  if (name === 'ospf_neighbors' || name === 'bgp_neighbors') {
    var p2 = str(args, 'path', true), router = str(args, 'router', false);
    return (name === 'ospf_neighbors' ? query.ospfNeighbors : query.bgpNeighbors)(loadStates(p2), router);
  }
  if (name === 'ospf_interfaces') return query.ospfInterfaces(loadStates(str(args, 'path', true)), str(args, 'router', false));
  if (name === 'route_lookup') {
    var p3 = str(args, 'path', true), r = str(args, 'router', true), dst = str(args, 'destination', true);
    return query.routeLookup(loadStates(p3), r, dst, str(args, 'vrf', false));
  }
  if (name === 'state_diff') {
    var b5 = str(args, 'before', true), a5 = str(args, 'after', true);
    return query.diff(loadStates(b5), loadStates(a5), str(args, 'router', false), str(args, 'mgmt_subnet', false) || null);
  }
  if (name === 'check_run') return require('../solvedkit.js').run(loadProblem(str(args, 'problem', true)), loadStates(str(args, 'path', true)));
  if (name === 'check_verify') {
    var pr6 = loadProblem(str(args, 'problem', true));
    return require('../solvedkit.js').verify(pr6, loadStates(str(args, 'broken', true)), loadStates(str(args, 'solved', true)));
  }
  if (name === 'check_suggest' || name === 'check_init') {
    var mg7 = str(args, 'mgmt_subnet', false);
    if (mg7 != null && !/^\d{1,3}(\.\d{1,3}){3}\/\d{1,2}$/.test(mg7)) throw new Error('mgmt_subnet must be an IPv4 subnet like 192.168.121.0/24');
    var o7 = { mgmtSubnet: mg7 || undefined }, fn7 = str(args, 'focus', false), fp7 = str(args, 'prefix', false);
    if (fn7 || fp7) o7.focus = { node: fn7, prefix: fp7 };
    var b7 = loadStates(str(args, 'broken', true)), s7 = loadStates(str(args, 'solved', true));
    if (fn7 && !s7[fn7]) throw new Error('unknown node: ' + fn7 + ' (not in the solved state)');
    var kit7 = require('../solvedkit.js');
    return name === 'check_suggest' ? kit7.suggest(b7, s7, o7) : kit7.init(b7, s7, o7);
  }
  if (name === 'explain_plan') {   /* nx_plan_lines */
    var pr8 = str(args, 'problem', false);
    return require('./xray-plan.js').explainPlan(loadStates(str(args, 'path', true)), str(args, 'router', true), str(args, 'lines', true),
      { problem: pr8 ? loadProblem(pr8) : null, requirements: str(args, 'requirements', false), prefix: str(args, 'prefix', false) });
  }
  if (name === 'why_path') {
    var p4 = str(args, 'path', true), rt = str(args, 'router', true), pfx = str(args, 'prefix', true);
    return query.whyPath(loadStates(p4), rt, pfx, str(args, 'vrf', false));
  }
  return null;
}

function toolResult(obj, isError) {
  var r = { content: [{ type: 'text', text: JSON.stringify(obj, null, 2) }] };
  if (isError) r.isError = true; else r.structuredContent = obj;
  return r;
}

// one parsed JSON-RPC message -> response object, or null for a notification
function handle(msg) {
  if (!msg || typeof msg !== 'object' || Array.isArray(msg) || msg.jsonrpc !== '2.0' || typeof msg.method !== 'string') {
    return { jsonrpc: '2.0', id: (msg && msg.id != null) ? msg.id : null, error: { code: -32600, message: 'Invalid Request' } };
  }
  var isNotification = !Object.prototype.hasOwnProperty.call(msg, 'id');
  var params = msg.params || {};
  var result, error;
  switch (msg.method) {
    case 'initialize':
      uiClient = clientDrawsUi(params.capabilities);   /* nx_mcp_apps */
      result = {
        protocolVersion: PROTOCOL_VERSIONS.indexOf(params.protocolVersion) >= 0 ? params.protocolVersion : PROTOCOL_VERSIONS[0],
        capabilities: uiClient ? { tools: { listChanged: false }, resources: { listChanged: false } } : { tools: { listChanged: false } },
        serverInfo: SERVER_INFO,
        instructions: allowCollect
          ? 'Questions about a network-xray lab from saved state files. The collect tool reads a running lab\'s routers again (read-only show commands) and returns a new path for the other tools.'
          : 'Read-only questions about a network-xray lab from saved state files. No router is contacted.'
      };
      break;
    case 'ping':
      result = {};
      break;
    case 'tools/list':
      result = { tools: tools() };
      break;
    case 'resources/list':   /* nx_mcp_apps: the one picture */
      result = { resources: [{ uri: VIEW_URI, name: 'network-xray view', mimeType: UI_MIME, description: 'The X-Ray picture of the lab (topology and the DeepDive) for MCP Apps hosts' }] };
      break;
    case 'resources/read':
      if (params.uri !== VIEW_URI) { error = { code: -32002, message: 'Resource not found' }; break; }
      try { result = { contents: [{ uri: VIEW_URI, mimeType: UI_MIME, text: viewHtml() }] }; }
      catch (e) { error = { code: -32603, message: 'the picture is not available: ' + ((e && e.message) || e) }; }
      break;
    case 'tools/call':
      if (!tools().some(function (t) { return t.name === params.name; })) {
        error = { code: -32602, message: 'Unknown tool: ' + params.name };
        break;
      }
      if (params.name === 'collect') {   /* nx_mcp_collect: the one tool that answers later (a Promise of the response) */
        var p;
        try { p = collectTool(params.arguments); } catch (e) { result = toolResult({ error: (e && e.message) || String(e) }, true); break; }
        if (isNotification) return null;
        return p.then(function (obj) { return { jsonrpc: '2.0', id: msg.id, result: toolResult(obj, !!obj.error) }; });
      }
      try { result = toolResult(callTool(params.name, params.arguments), false); }
      catch (e) {
        var text = (e && e.message) || String(e);
        if (e instanceof TypeError) text = 'unexpected data (maybe a field in the lab state has the wrong type): ' + text;
        result = toolResult({ error: text }, true);
      }
      break;
    default:
      if (isNotification) return null;   // notifications/initialized, notifications/cancelled, ...
      error = { code: -32601, message: 'Method not found: ' + msg.method };
  }
  if (isNotification) return null;
  return error ? { jsonrpc: '2.0', id: msg.id, error: error } : { jsonrpc: '2.0', id: msg.id, result: result };
}

function handleLine(line) {
  if (!line.trim()) return null;
  var msg;
  try { msg = JSON.parse(line); } catch (e) { return { jsonrpc: '2.0', id: null, error: { code: -32700, message: 'Parse error' } }; }
  return handle(msg);
}

if (require.main === module) {
  var _cli = process.argv.slice(2);
  if (_cli.indexOf('-h') >= 0 || _cli.indexOf('--help') >= 0) {
    process.stdout.write('usage: node scripts/xray-mcp.js [--allow-collect] [--path <state>] [--allow-any-path]\n' +
      '  read-only MCP server over stdio (JSON-RPC, one message per line); start it from an MCP client\n' +
      '  tools: ' + TOOLS.map(function (t) { return t.name; }).join(', ') + '\n' +
      '  --allow-collect  also offer collect: read a running containerlab lab\'s routers again (read-only show commands)\n' +
      '  --path <state>   the state the tools read when the client gives no path (also NX_MCP_PATH; the option wins)\n' +
      '                   the tools read only under that folder (a file\'s folder); without --path, under the folder the server starts in\n' +
      '  --allow-any-path read any path the client gives (also NX_MCP_ALLOW_ANY_PATH=1)\n' +
      '  -h, --help       show this help\n');
    process.exitCode = 0;
    return;
  }
  var _anyPath = process.env.NX_MCP_ALLOW_ANY_PATH === '1';
  _cli = _cli.filter(function (a) { if (a === '--allow-collect') { allowCollect = true; return false; } if (a === '--allow-any-path') { _anyPath = true; return false; } return true; });
  var _pathArg = null, _rest = [];   /* nx_mcp_default_path: --path <p> or --path=<p> */
  for (var _i = 0; _i < _cli.length; _i++) {
    if (_cli[_i] === '--path') {
      if (_i + 1 >= _cli.length || !_cli[_i + 1]) { console.error("xray-mcp.js: --path needs a value\nTry 'node scripts/xray-mcp.js --help'."); process.exit(2); }
      _pathArg = _cli[++_i];
    } else if (_cli[_i].indexOf('--path=') === 0 && _cli[_i].length > 7) _pathArg = _cli[_i].slice(7);
    else _rest.push(_cli[_i]);
  }
  _cli = _rest;
  var _def = _pathArg != null ? _pathArg : (process.env.NX_MCP_PATH || '');
  if (_def) {
    defaultPath = path.resolve(_def);
    if (!fs.existsSync(defaultPath)) console.error('xray-mcp.js: the default path does not exist yet (the tools say not found until it does): ' + defaultPath);
  }
  if (_cli.length) { console.error('xray-mcp.js: unknown option: ' + _cli[0] + "\nTry 'node scripts/xray-mcp.js --help'."); process.exit(2); }
  if (!_anyPath) {   /* nx_mcp_path_root */
    var _isDir = /[\\/]$/.test(_def || ''); try { _isDir = _isDir || (!!defaultPath && fs.statSync(defaultPath).isDirectory()); } catch (e) {}
    pathRoot = defaultPath ? (_isDir ? defaultPath : path.dirname(defaultPath)) : process.cwd();
    if (path.resolve(pathRoot) === path.parse(path.resolve(pathRoot)).root) {
      console.error('xray-mcp.js: started in ' + pathRoot + ' without --path: the tools read nothing until it is started with --path <folder> (or --allow-any-path)');
      pathRoot = ROOT_REFUSED;
    }
  }
  var rl = readline.createInterface({ input: process.stdin, terminal: false });
  var write = function (res) { if (res) process.stdout.write(JSON.stringify(res) + '\n'); };
  rl.on('line', function (line) {
    var res = handleLine(line);
    if (res && typeof res.then === 'function') res.then(write); else write(res);
  });
  // the private collect directory goes with the server
  process.on('exit', function () { if (collectDir) try { fs.rmSync(collectDir, { recursive: true, force: true }); } catch (e) {} });
  // when stdin closes, the process exits on its own once pending output is flushed
}

module.exports = { handle: handle, handleLine: handleLine, TOOLS: TOOLS, COLLECT_TOOL: COLLECT_TOOL,
  setAllowCollect: function (on) { allowCollect = !!on; }, checkPath: checkPath,
  setUiClient: function (on) { uiClient = !!on; }, viewHtml: viewHtml, VIEW_URI: VIEW_URI, UI_MIME: UI_MIME,
  setDefaultPath: function (p) { defaultPath = p ? path.resolve(p) : null; },
  setPathRoot: function (p) { pathRoot = p ? path.resolve(p) : null; } };
