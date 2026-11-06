#!/usr/bin/env node
/*
 * xray-mcp.js - a minimal Model Context Protocol (MCP) server over stdio, read-only.
 *
 * Lets an AI assistant ask network-xray about a lab. It answers from files the collectors already wrote,
 * with the same functions as scripts/xray-query.js:
 *
 *   lab_state      { path }                  -> nodes, links, OSPF adjacencies, BGP sessions, counts
 *   why_best_path  { path, node, prefix, vrf? } -> BGP best path and the reason stored with it
 *                                               (reason null + a note when the data has none; never guessed)
 *   list_routers   { path }                  -> router names, which protocols have state, row counts
 *   ospf_neighbors { path, router? }         -> per router: neighbor, address, state, interface
 *   bgp_neighbors  { path, router? }         -> per router: peer, AS, state, prefixes received
 *   route_lookup   { path, router, destination, vrf? } -> longest-prefix match in the collected routing table
 *   why_path       { path, router, prefix, vrf? } -> selected BGP path, other candidates, deciding step and
 *                                               reason_source: "device" (router said) / "comparison" (inferred)
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
 * Transport: JSON-RPC 2.0, one message per line on stdin/stdout (MCP stdio). Logs go to stderr.
 * Protocol: the initialize-based MCP revisions (2024-11-05 to 2025-11-25). The stateless 2026-07-28 revision
 * (per-request _meta, server/discover) is not implemented.
 *   node scripts/xray-mcp.js
 */
'use strict';
var readline = require('readline');
var query = require('./xray-query.js');

var SERVER_INFO = { name: 'network-xray', version: '0.1.0' };
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
      '(FRR selectionReason), "comparison" when network-xray inferred it by comparing the attributes in the data (Weight, ' +
      'LocPrf, AS-Path, Origin, MED), or null with a note when neither says. A bare address is matched to the longest BGP ' +
      'prefix that contains it. Read-only.',
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

function str(args, k, required) {
  var v = args[k];
  if (v == null || v === '') { if (required) throw new Error('missing argument: ' + k); return undefined; }
  if (typeof v !== 'string') throw new Error('argument ' + k + ' must be a string');
  return v;
}

// A file that does not hold network-xray state gets one fixed message that says nothing about its contents (the JSON
// parser's own message can quote the start of the file). Paths are read as xray-query.js reads them (any name).
var NOT_STATE = 'not a network-xray state file';
function loadStates(p) {
  try { return query.loadStates(p); } catch (e) {
    if (/^(not valid JSON|no node state found)/.test((e && e.message) || '')) throw new Error(NOT_STATE);
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
        instructions: 'Read-only questions about a network-xray lab from saved state files. No router is contacted.'
      };
      break;
    case 'ping':
      result = {};
      break;
    case 'tools/list':
      result = { tools: TOOLS };
      break;
    case 'tools/call':
      if (!TOOLS.some(function (t) { return t.name === params.name; })) {
        error = { code: -32602, message: 'Unknown tool: ' + params.name };
        break;
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
    process.stdout.write('usage: node scripts/xray-mcp.js\n' +
      '  read-only MCP server over stdio (JSON-RPC, one message per line); start it from an MCP client\n' +
      '  tools: ' + TOOLS.map(function (t) { return t.name; }).join(', ') + '\n' +
      '  -h, --help  show this help\n');
    process.exitCode = 0;
    return;
  }
  if (_cli.length) { console.error('xray-mcp.js: unknown option: ' + _cli[0] + "\nTry 'node scripts/xray-mcp.js --help'."); process.exit(2); }
  var rl = readline.createInterface({ input: process.stdin, terminal: false });
  rl.on('line', function (line) {
    var res = handleLine(line);
    if (res) process.stdout.write(JSON.stringify(res) + '\n');
  });
  // when stdin closes, the process exits on its own once pending output is flushed
}

module.exports = { handle: handle, handleLine: handleLine, TOOLS: TOOLS };
