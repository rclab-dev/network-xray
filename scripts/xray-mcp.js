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
 *
 * `path` is anything xray-query.js accepts: a state_<node>.json, a directory of them, an xray-states.js,
 * or a directory of saved FRR `show ... json` files. Relative paths are resolved from the server's working directory.
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
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false }
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
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false }
  }
];

function str(args, k, required) {
  var v = args[k];
  if (v == null || v === '') { if (required) throw new Error('missing argument: ' + k); return undefined; }
  if (typeof v !== 'string') throw new Error('argument ' + k + ' must be a string');
  return v;
}

function callTool(name, args) {
  if (args != null && (typeof args !== 'object' || Array.isArray(args))) throw new Error('arguments must be an object');
  args = args || {};
  if (name === 'lab_state') return query.summarize(query.loadStates(str(args, 'path', true)));
  if (name === 'why_best_path') {
    var p = str(args, 'path', true), node = str(args, 'node', true), prefix = str(args, 'prefix', true);
    return query.why(query.loadStates(p), node, prefix, str(args, 'vrf', false));
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
      catch (e) { result = toolResult({ error: (e && e.message) || String(e) }, true); }
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
  var rl = readline.createInterface({ input: process.stdin, terminal: false });
  rl.on('line', function (line) {
    var res = handleLine(line);
    if (res) process.stdout.write(JSON.stringify(res) + '\n');
  });
  // when stdin closes, the process exits on its own once pending output is flushed
}

module.exports = { handle: handle, handleLine: handleLine, TOOLS: TOOLS };
