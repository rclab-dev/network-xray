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
var PATH_PROP = { type: 'string', description: 'Same input as lab_state' };

var TOOLS = [
  {
    name: 'lab_state',
    description: 'Read a network-xray lab state (read-only) and summarize it: nodes and interfaces, links, ' +
      'OSPF adjacencies, BGP sessions and counts. No router is contacted.',
    inputSchema: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'A state_<node>.json, a directory of them, an xray-states.js, or a directory of saved FRR show ... json files' }
      },
      required: ['path'],
      additionalProperties: false
    },
    annotations: READ_ONLY
  },
  {
    name: 'why_best_path',
    description: 'For one node and prefix, give the BGP best path and the reason stored in the data ' +
      '(FRR selectionReason, or the IOS-XE collector\'s derived reason). If the data has no reason, reason is null ' +
      'and a note says so; nothing is guessed. Read-only.',
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
    description: 'OSPF neighbors per router as collected: neighbor router ID, address, state (e.g. Full), ' +
      'interface, and DR/BDR role and peer node name when known. All routers, or one with `router`. Read-only.',
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
    description: 'OSPF interface values per router as collected: MTU, hello and dead intervals, network type, area, cost, ' +
      'DR/BDR role, priority, passive, authentication (none / simple / md5) and neighbor counts. For a link it also gives the ' +
      'other end and `mismatches`: one line per value that must be equal for an adjacency but is not, e.g. ' +
      '"r1 eth1 MTU 1500 \u21d4 r2 eth1 MTU 1400". A value the router did not report is null and is not compared; each interface also has the neighbor state there, and `hints` names a link stuck in ExStart / Exchange whose MTU was not reported. ' +
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
    description: 'BGP neighbors per router as collected: peer address, remote AS, iBGP/eBGP, state, ' +
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
    description: 'Why one router selected its BGP path to a prefix: the selected path, the other candidates with their ' +
      'attributes, the deciding step, and where that reason came from: reason_source "device" when the router reported it ' +
      '(FRR selectionReason), "derived" when the collector worked it out from what the router printed (Cisco IOS-XE prints ' +
      'no reason), "comparison" when network-xray inferred it by comparing the attributes in the data (Weight, LocPrf, ' +
      'AS-Path, Origin, MED), or null with a note when neither says. A bare address is matched to the longest BGP prefix ' +
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
  }
];

/* nx_mcp_collect (2026-11-11): read the routers again from the MCP client - off unless the server is started with
   --allow-collect (then tools/list has it too). It runs the existing collector once with fixed arguments; the client
   gives only the topology file and ospf|bgp. */
var COLLECT_TOOL = {
  name: 'collect',
  description: 'Read the routers of a running containerlab lab again and return the new state: runs network-xray\'s ' +
    'collector once (the same read-only show commands as the page: docker exec vtysh / sr_cli, SSH show on Cisco IOS; ' +
    'nothing on the routers changes). Returns the lab_state summary plus `path`, the xray-states.js it wrote into a ' +
    'directory of its own: give that `path` to the other tools. Use it after you changed a router\'s configuration. ' +
    'Available only when the server was started with --allow-collect. One run at a time, at most 120 s.',
  inputSchema: {
    type: 'object',
    properties: {
      topology: { type: 'string', description: 'The running lab\'s containerlab topology file (*.clab.yml), absolute path' },
      proto: { type: 'string', enum: ['bgp', 'ospf'], description: 'bgp (default: reads OSPF too) or ospf (an OSPF-only lab)' }
    },
    required: ['topology'],
    additionalProperties: false
  },
  annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: true }
};
var COLLECT_MS = 120000, ROOT = path.join(__dirname, '..');
var allowCollect = false, collecting = false, collectDir = null;
function tools() { return allowCollect ? TOOLS.concat([COLLECT_TOOL]) : TOOLS; }

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
  var extra = Object.keys(args).filter(function (k) { return k !== 'topology' && k !== 'proto'; });
  if (extra.length) throw new Error('collect takes only topology and proto, not: ' + extra.join(', ').slice(0, 100));
  var topo = str(args, 'topology', true), proto = str(args, 'proto', false) || 'bgp';
  if (proto !== 'bgp' && proto !== 'ospf') throw new Error('proto must be bgp or ospf');
  if (!/\.ya?ml$/i.test(topo)) throw new Error('topology must be a containerlab topology file (*.clab.yml)');
  topo = path.resolve(topo);
  var st; try { st = fs.statSync(topo); } catch (e) { throw new Error('topology not found: ' + topo); }
  if (!st.isFile()) throw new Error('topology is not a file: ' + topo);
  if (collecting) throw new Error('a collect is already running - try again when it has finished');
  var dir = ownCollectDir(topo), out = path.join(dir, 'xray-states.js');
  collecting = true;
  return new Promise(function (resolve) {
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
          resolve(Object.assign({ path: out, topology: topo, proto: proto }, sum));
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
function loadStates(p) {
  try { return query.loadStates(p); } catch (e) {
    if (/^(not valid JSON|no node state found|not a regular file or a directory)/.test((e && e.message) || '')) throw new Error(NOT_STATE);
    throw e;
  }
}

function callTool(name, args) {
  if (args != null && (typeof args !== 'object' || Array.isArray(args))) throw new Error('arguments must be an object');
  args = args || {};
  if (name === 'lab_state') return query.summarize(loadStates(str(args, 'path', true)));
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
      result = {
        protocolVersion: PROTOCOL_VERSIONS.indexOf(params.protocolVersion) >= 0 ? params.protocolVersion : PROTOCOL_VERSIONS[0],
        capabilities: { tools: { listChanged: false } },
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
    process.stdout.write('usage: node scripts/xray-mcp.js [--allow-collect]\n' +
      '  read-only MCP server over stdio (JSON-RPC, one message per line); start it from an MCP client\n' +
      '  tools: ' + TOOLS.map(function (t) { return t.name; }).join(', ') + '\n' +
      '  --allow-collect  also offer collect: read a running containerlab lab\'s routers again (read-only show commands)\n' +
      '  -h, --help       show this help\n');
    process.exitCode = 0;
    return;
  }
  _cli = _cli.filter(function (a) { if (a === '--allow-collect') { allowCollect = true; return false; } return true; });
  if (_cli.length) { console.error('xray-mcp.js: unknown option: ' + _cli[0] + "\nTry 'node scripts/xray-mcp.js --help'."); process.exit(2); }
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
  setAllowCollect: function (on) { allowCollect = !!on; } };
