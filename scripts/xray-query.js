#!/usr/bin/env node
/*
 * xray-query.js - read-only questions about a lab's state, without a browser.
 *
 * Reads the state the collectors already write and prints ONE JSON object to stdout, so a script or an
 * AI assistant can ask "what is up?" and "why did this router pick that BGP path?".
 *
 *   node scripts/xray-query.js state <input>
 *   node scripts/xray-query.js why   <input> <node> <prefix>
 *
 * <input> is one of:
 *   - a per-node state JSON (frr-collect.js / clab-collect.js --out, test/fixtures/<lab>/state_<node>.json)
 *   - a JSON object { <node>: <state>, ... }
 *   - the xray-states.js that clab-xray-collect.js writes (window.LIVE_STATES = {...};)
 *   - a directory with state_<node>.json files (test/fixtures/<lab>/), or an xray-states.js
 *   - a directory of saved FRR `show ... json` files (frr-collect.js --from-dir layout; node = directory name),
 *     or a directory whose sub-directories are such node directories
 *
 * Options (anywhere on the line):
 *   --format json   the default: one JSON object, as above
 *   --format table  compact aligned tables for people (state: routers, OSPF neighbors, BGP neighbors;
 *                   why: the best path and its candidates); lines stay under 100 characters
 *   --color         colors in table output, only when stdout is a terminal
 *
 * Errors (missing file, unknown node / prefix, unreadable input) -> {"error": "..."} and exit code 2
 * (with --format table: "error: ..." on stderr, exit code 2).
 * Nothing is sent anywhere; no router is contacted.
 */
'use strict';
var fs = require('fs');
var path = require('path');

function QueryError(msg) { this.message = msg; }

function isState(o) {
  return !!(o && typeof o === 'object' && !Array.isArray(o) &&
    (o.target_node != null || o.interfaces != null || o.bgp_routes != null || o.ospf_neighbors != null));
}
function nodeName(st, fallback) { return String(st.target_node || st.id || fallback || ''); }

// a parsed object -> { <node>: state }
function statesFromObject(obj, fallbackName) {
  if (isState(obj)) { var one = Object.create(null); one[nodeName(obj, fallbackName)] = obj; return one; }
  if (obj && typeof obj === 'object' && !Array.isArray(obj)) {
    var out = Object.create(null);   // node names are data: "__proto__" / "constructor" stay plain keys
    Object.keys(obj).forEach(function (k) { if (isState(obj[k])) out[k] = obj[k]; });
    if (Object.keys(out).length) return out;
  }
  throw new QueryError('no node state found in input');
}

// the xray-states.js written by clab-xray-collect.js: first line is `window.LIVE_STATES = {...};`
function parseText(text, fallbackName) {
  var m = /window\.LIVE_STATES\s*=\s*(.*?);\s*$/m.exec(text);
  var obj;
  try { obj = JSON.parse(m ? m[1] : text); } catch (e) { throw new QueryError('not valid JSON: ' + e.message); }
  return statesFromObject(obj, fallbackName);
}

var FRR_SHOW = /^show_.*\.json$|^(ospf-neighbor|ospf-interface|interface|route|bgp-summary|bgp)\.json$/;
function isFrrDir(dir) {
  try { return fs.readdirSync(dir).some(function (f) { return FRR_SHOW.test(f); }); } catch (e) { return false; }
}
function collectFrrDir(dir) {
  var frr = require('../frr-collect.js');
  var name = path.basename(path.resolve(dir));
  return frr.collectFromDir({ node: name, id: name, fromDir: dir, proto: 'auto', adjacency: [] }).state;
}

function loadStates(input) {
  if (!input) throw new QueryError('missing input (a state JSON file or a directory)');
  var stat;
  try { stat = fs.statSync(input); } catch (e) { throw new QueryError('not found: ' + input); }
  if (!stat.isDirectory() && !stat.isFile()) throw new QueryError('not a regular file or a directory: ' + input);
  if (!stat.isDirectory()) {
    var text;
    try { text = fs.readFileSync(input, 'utf8'); } catch (e) { throw new QueryError('cannot read: ' + input); }
    var base = path.basename(input).replace(/\.json$/, '').replace(/^state_/, '');
    return parseText(text, base);
  }
  var files = fs.readdirSync(input).sort();
  var out = Object.create(null);
  var isFile = function (f) { try { return fs.statSync(path.join(input, f)).isFile(); } catch (e) { return false; } };
  files.filter(function (f) { return /^state_.+\.json$/.test(f) && isFile(f); }).forEach(function (f) {
    var s = parseText(fs.readFileSync(path.join(input, f), 'utf8'), f.slice(6, -5));
    Object.keys(s).forEach(function (k) { out[k] = s[k]; });
  });
  if (Object.keys(out).length) return out;
  if (files.indexOf('xray-states.js') >= 0 && isFile('xray-states.js')) return parseText(fs.readFileSync(path.join(input, 'xray-states.js'), 'utf8'));
  if (isFrrDir(input)) { var st = collectFrrDir(input); out[nodeName(st)] = st; return out; }
  files.forEach(function (f) {
    var sub = path.join(input, f);
    var st2;
    try { st2 = fs.statSync(sub); } catch (e) { return; }
    if (st2.isDirectory() && isFrrDir(sub)) { var s2 = collectFrrDir(sub); out[nodeName(s2, f)] = s2; }
  });
  if (Object.keys(out).length) return out;
  throw new QueryError('no state files (state_<node>.json, xray-states.js or FRR show_*.json) in ' + input);
}

// ---- state ----------------------------------------------------------------------------------
function summarize(states) {
  var names = Object.keys(states).sort();
  var nodes = names.map(function (n) {
    var s = states[n], o = { name: n };
    if (s.nos) o.nos = s.nos;
    if (s.protocol) o.protocol = s.protocol;
    if (s.nx_unread) o.unread = s.nx_unread;
    o.interfaces = Object.keys(s.interfaces || {}).map(function (i) {
      var x = s.interfaces[i] || {};
      return { name: i, up: !!x.up, ip: x.ip || '' };
    });
    return o;
  });

  // links: one row per peer_links entry; the two ends of the same cable are paired in order
  var links = [], pending = {};
  names.forEach(function (n) {
    (states[n].peer_links || []).forEach(function (r) {
      if (!r || !r.peer) return;
      var back = n + '>' + r.peer, fwd = r.peer + '>' + n;
      var row = { a: n, a_iface: r.iface || '', b: r.peer, b_iface: null, up: !!r.up };
      var ospfState = r.ospf_state || (r.proto === 'ospf' ? r.state : '');   // SR Linux rows: proto + state
      if (ospfState) row.ospf_state = ospfState;
      if (pending[back] && pending[back].length) {
        var other = pending[back].shift();
        other.b_iface = row.a_iface;
        other.up = other.up && row.up;
        return;
      }
      (pending[fwd] = pending[fwd] || []).push(row);
      links.push(row);
    });
  });

  var ospf = [], bgp = [];
  names.forEach(function (n) {
    var s = states[n], peerOf = Object.create(null);   // interface names are data (an interface named "constructor")
    (s.peer_links || []).forEach(function (r) { if (r && r.iface && r.peer) peerOf[r.iface] = r.peer; });
    (s.ospf_neighbors || []).forEach(function (x) {
      var o = { node: n, neighbor_id: x.router_id || '', address: x.address || '', iface: x.iface || '', state: x.state || '' };
      if (x.role) o.role = x.role;
      if (peerOf[x.iface]) o.peer = peerOf[x.iface];
      if (x.af) o.af = x.af;
      if (x.vrf) o.vrf = x.vrf;
      ospf.push(o);
    });
    (s.bgp_neighbors || []).forEach(function (x) {
      var o = { node: n, peer_ip: x.ip || '', remote_as: x.remote_as != null ? x.remote_as : null,
        type: x.ibgp === true ? 'iBGP' : x.ibgp === false ? 'eBGP' : null, state: x.state || '', established: /^established$/i.test(x.state || '') };
      if (x.pfx_rcvd != null) o.pfx_rcvd = x.pfx_rcvd;
      if (x.vrf) o.vrf = x.vrf;
      bgp.push(o);
    });
  });
  return {
    nodes: nodes, links: links, ospf_adjacencies: ospf, bgp_sessions: bgp,
    counts: {
      nodes: nodes.length, links: links.length,
      ospf_full: ospf.filter(function (x) { return /^full$/i.test(x.state); }).length, ospf_total: ospf.length,
      bgp_established: bgp.filter(function (x) { return x.established; }).length, bgp_total: bgp.length
    }
  };
}

// ---- why ------------------------------------------------------------------------------------
// bgp_routes[].prefix is "8.8.8.0" (+ prefixlen 24) or "203.0.113.0/24"; the question may carry a length or not
function splitPrefix(p) {
  var m = /^(.*?)(?:\/(\d+))?$/.exec(String(p).trim());
  return { net: m[1], len: m[2] != null ? +m[2] : null };
}
function routeLen(r) {
  if (r.prefixlen != null) return +r.prefixlen;
  var m = /\/(\d+)$/.exec(String(r.prefix || ''));
  return m ? +m[1] : null;
}
function pathOut(r) {
  var o = { next_hop: r.next_hop || '', as_path: r.as_path || '', status: r.status || '' };
  ['local_pref', 'weight', 'metric', 'origin'].forEach(function (k) { if (r[k] != null) o[k] = r[k]; });
  if (r.best) o.best = true;
  if (r.multipath) o.multipath = true;
  if (r.valid === false) o.valid = false;
  if (r.vrf) o.vrf = r.vrf;
  return o;
}

// the same address however it is written (case, leading zeros, ::); text compare when it is not an address
function sameNet(a, b) {
  var x = parseAddr(a), y = parseAddr(b);
  return x && y ? x.bits === y.bits && x.n === y.n : String(a).toLowerCase() === String(b).toLowerCase();
}
function why(states, node, prefix, vrf) {
  if (!node) throw new QueryError('missing node');
  if (!prefix) throw new QueryError('missing prefix');
  var s = Object.prototype.hasOwnProperty.call(states, node) ? states[node] : null;
  if (!s) throw new QueryError('unknown node: ' + node + ' (known: ' + Object.keys(states).sort().join(', ') + ')');
  var q = splitPrefix(prefix);
  var vrfOf = function (r) { return r.vrf || 'default'; };
  var paths = (s.bgp_routes || []).filter(function (r) {
    var rp = splitPrefix(r.prefix || '');
    if (!sameNet(rp.net, q.net)) return false;
    if (vrf && vrfOf(r) !== vrf) return false;
    return q.len == null || routeLen(r) === q.len;
  });
  var vrfs = paths.map(vrfOf).filter(function (v, i, a) { return a.indexOf(v) === i; });
  if (!vrf && vrfs.length > 1) {
    throw new QueryError('prefix ' + prefix + ' on ' + node + ' is in several VRFs (' + vrfs.join(', ') + '): give one as the 5th argument');
  }
  if (!paths.length) {
    var known = (s.bgp_routes || []).map(function (r) { var l = routeLen(r); return splitPrefix(r.prefix).net + (l != null ? '/' + l : ''); });
    known = known.filter(function (k, i) { return known.indexOf(k) === i; });
    throw new QueryError('unknown prefix on ' + node + ': ' + prefix + (vrf ? ' in VRF ' + vrf : '') + (s.bgp_routes ? ' (BGP table has: ' + (known.join(', ') || 'none') + ')' : ' (no BGP table in the data for this node)'));
  }
  var lens = paths.map(routeLen).filter(function (l, i, a) { return a.indexOf(l) === i; });
  if (q.len == null && lens.length > 1) {
    throw new QueryError('prefix ' + prefix + ' on ' + node + ' has several lengths (' + lens.join(', ') + '): give one, e.g. ' + q.net + '/' + lens[0]);
  }
  var bests = paths.filter(function (r) { return r.best; });
  var len = lens[0], best = bests[0] || null;
  var out = { node: node, prefix: q.net + (len != null ? '/' + len : ''), paths: paths.length, best: best ? pathOut(best) : null };
  if (vrfs.length === 1 && vrfs[0] !== 'default') out.vrf = vrfs[0];
  if (bests.length > 1) out.also_best = bests.slice(1).map(pathOut);   // multipath / more than one marked best: all of them, not just the first
  if (!best) {
    out.reason = null;
    out.note = 'none of the ' + paths.length + ' path(s) is marked best in the data';
  } else if (typeof best.reason === 'string' && best.reason) {
    out.reason = best.reason;
    out.reason_source = s.nos === 'ios-xe' ? 'bgp_routes[].reason (IOS-XE: derived by the collector from the printed columns)'
      : !s.nos || s.nos === 'frr' ? 'bgp_routes[].reason (FRR selectionReason)' : 'bgp_routes[].reason (' + s.nos + ' collector)';
  } else {
    out.reason = null;
    out.note = 'the reason is not in the data (no reason stored for the best path)';
  }
  out.candidates = paths.map(pathOut);
  return out;
}

// ---- why_path -------------------------------------------------------------------------------
// The Best-Path Decision panel's comparison (xrayBgpDecision in xray-core.js). xray-core.js is a browser file, so the
// functions are cut out of it by name and run in a vm context, as test/bestpath-frr.test.js does. Loaded on first use.
var BP_NAMES = ['XRAY_BGP_CRITERIA', 'xrayBgpOriginChar', 'xrayBgpOriginRank', 'xrayBgpNum', 'xrayBgpNeighborAS',
  '_xrayAsPathLen', 'xrayBgpDecision'];
var bpCtx = null;
function bestPathDecision(rows) {
  if (!bpCtx) {
    var vm = require('vm');
    var src = fs.readFileSync(path.join(__dirname, '..', 'xray-core.js'), 'utf8');
    var cut = function (name) {
      var m = new RegExp('^(function ' + name + '\\(|var ' + name + ' = )', 'm').exec(src);
      if (!m) throw new QueryError('xray-core.js: ' + name + ' not found');
      var start = m.index, end;
      if (m[1].indexOf('function') === 0) end = src.indexOf('\n}', start) + 2;
      else {
        var depth = 0, i = src.indexOf('=', start) + 1;
        for (; i < src.length; i++) {
          var c = src[i];
          if (c === '[' || c === '{' || c === '(') depth++;
          else if (c === ']' || c === '}' || c === ')') depth--;
          else if (c === ';' && depth === 0) break;
        }
        end = i + 1;
      }
      return src.slice(start, end);
    };
    var ctx = { String: String, Math: Math, parseInt: parseInt, isNaN: isNaN };
    vm.createContext(ctx);
    vm.runInContext(BP_NAMES.map(cut).join('\n'), ctx, { filename: 'xray-core.js (Best-Path functions)' });
    bpCtx = ctx;
  }
  return bpCtx.xrayBgpDecision(rows);
}

// a bare address that is not itself a BGP prefix -> the longest BGP prefix on the node that contains it (or null)
function bgpPrefixFor(s, destination, vrf) {
  var addr = parseAddr(destination);
  if (!addr) return null;
  var best = null, bestLen = -1;
  (s.bgp_routes || []).forEach(function (r) {
    if (vrf && (r.vrf || 'default') !== vrf) return;
    var l = routeLen(r), net = splitPrefix(r.prefix || '').net;
    var p = parsePrefix(l != null ? net + '/' + l : net);
    if (p && inPrefix(addr, p) && p.len > bestLen) { best = net + '/' + p.len; bestLen = p.len; }
  });
  return best;
}

// router + prefix (or address) -> the selected BGP path, the other candidates, the deciding step and where it came from:
//   reason_source "device"     - the router reported it (FRR selectionReason, stored as bgp_routes[].reason / sel_reason)
//   reason_source "comparison" - network-xray compared the attributes in the data (the Best-Path Decision panel's order)
//   reason_source null         - neither says (deciding_step null + a note)
function whyPath(states, router, destination, vrf) {
  var s = getNode(states, router);
  if (!destination) throw new QueryError('missing prefix');
  var w, matched = null;
  try { w = why(states, router, destination, vrf); }
  catch (e) {
    if (!(e instanceof QueryError) || !/^unknown prefix/.test(e.message) || /\//.test(destination)) throw e;
    matched = bgpPrefixFor(s, destination, vrf);
    if (!matched) throw e;
    w = why(states, router, matched, vrf);
  }
  var out = { router: router, prefix: w.prefix };
  if (w.vrf) out.vrf = w.vrf;
  if (matched) { out.destination = String(destination).trim(); out.destination_note = 'answered with the BGP prefix that contains the address; the router may forward it by a longer route from another protocol (route_lookup shows the routing table)'; }
  var bestIdx = w.candidates.findIndex(function (c) { return c.best; });
  out.selected = bestIdx >= 0 ? w.candidates[bestIdx] : null;
  out.candidates = w.candidates.filter(function (c, i) { return i !== bestIdx; });
  if (w.also_best) out.note = 'more than one path is marked best (multipath); selected is the first';

  // what the panel compares: usable paths only, LocPrf read from local_pref
  var rows = w.candidates.filter(function (c) { return c.valid !== false; }).map(function (c) {
    var o = JSON.parse(JSON.stringify(c));
    if (o.local_pref != null) o.locprf = String(o.local_pref);
    if (o.best && o.status.indexOf('>') < 0) o.status = '*>';   // the panel finds the best path by its '>' mark
    if (!o.best) o.status = o.status.replace('>', ' ');
    return o;
  });
  var dec = out.selected ? bestPathDecision(rows) : null;
  var steps = dec && dec.chain ? dec.chain.map(function (st) {
    return { step: st.crit.label, selected: st.bestVal, other: st.cmpVal, result: st.status };
  }) : null;
  var inferred = null, why2 = null;
  if (dec) {
    if (dec.kind === 'decided') inferred = dec.criterion.label;
    else if (dec.kind === 'single') inferred = 'Only path';
    else if (dec.kind === 'local') inferred = 'Locally originated';
    else if (dec.kind === 'tie') why2 = 'every compared attribute ties; a later step not in the data decided (e.g. Older Path, Router ID)';
    else if (dec.kind === 'medskip') why2 = 'MED is not compared across neighbor ASes and every other compared attribute ties';
    else if (dec.kind === 'ambiguous') why2 = 'the attributes in the data do not explain the best mark at ' + dec.chain[dec.chain.length - 1].crit.label;
  }

  var best = (s.bgp_routes || []).filter(function (r) {
    return r.best && splitPrefix(r.prefix || '').net === splitPrefix(w.prefix).net && routeLen(r) === routeLen({ prefix: w.prefix }) &&
      (r.vrf || 'default') === (w.vrf || 'default');
  })[0];
  var devReason = best && (s.nos == null || s.nos === 'frr') ? (best.sel_reason || best.reason || '') : '';
  if (!out.selected) {
    out.deciding_step = null;
    out.reason_source = null;
    out.note = w.note;
  } else if (typeof devReason === 'string' && devReason) {
    out.deciding_step = devReason;
    out.reason_source = 'device';
    if (inferred) out.comparison = inferred;   // what the attribute comparison says, for a cross-check
  } else if (inferred) {
    out.deciding_step = inferred;
    out.reason_source = 'comparison';
  } else {
    out.deciding_step = null;
    out.reason_source = null;
    out.note = why2 || 'the deciding step is not in the data';
  }
  if (steps) out.steps = steps;
  if (out.selected && out.selected.multipath) out.multipath = true;
  return out;
}

// ---- per-router views -----------------------------------------------------------------------
function getNode(states, node) {
  if (!node) throw new QueryError('missing router');
  if (!Object.prototype.hasOwnProperty.call(states, node)) {
    throw new QueryError('unknown router: ' + node + ' (known: ' + Object.keys(states).sort().join(', ') + ')');
  }
  return states[node];
}
// node names to report: all of them, or the one asked for (checked)
function pickNodes(states, node) {
  if (node == null) return Object.keys(states).sort();
  getNode(states, node);
  return [node];
}
function nonEmpty(a) { return Array.isArray(a) && a.length > 0; }

// router names and which protocols have state in the data
function listRouters(states) {
  var routers = Object.keys(states).sort().map(function (n) {
    var s = states[n], o = { name: n };
    if (s.nos) o.nos = s.nos;
    if (s.nx_unread) { o.unread = s.nx_unread; if (s.nx_stale_since) o.stale_since = s.nx_stale_since; }   // could not be read: the counts below are its last state or empty
    var protocols = [];
    if (nonEmpty(s.ospf_neighbors) || nonEmpty(s.lsdb_prefixes)) protocols.push('ospf');
    if (nonEmpty(s.bgp_neighbors) || nonEmpty(s.bgp_routes)) protocols.push('bgp');
    o.protocols = protocols;
    o.routing_table = Array.isArray(s.routing_table);
    o.counts = {
      ospf_neighbors: (s.ospf_neighbors || []).length,
      bgp_neighbors: (s.bgp_neighbors || []).length,
      bgp_routes: (s.bgp_routes || []).length,
      routes: (s.routing_table || []).length
    };
    return o;
  });
  return { routers: routers, count: routers.length };
}

function ospfNeighbors(states, node) {
  var names = pickNodes(states, node), adj = summarize(states).ospf_adjacencies;
  var routers = names.map(function (n) {
    return { router: n, neighbors: adj.filter(function (x) { return x.node === n; }).map(function (x) {
      var o = { neighbor: x.neighbor_id, address: x.address, state: x.state, interface: x.iface };
      ['role', 'peer', 'af', 'vrf'].forEach(function (k) { if (x[k]) o[k] = x[k]; });
      return o;
    }) };
  });
  var all = [].concat.apply([], routers.map(function (r) { return r.neighbors; }));
  return { routers: routers, counts: { total: all.length, full: all.filter(function (x) { return /^full$/i.test(x.state); }).length } };
}

function bgpNeighbors(states, node) {
  var names = pickNodes(states, node), sess = summarize(states).bgp_sessions;
  var routers = names.map(function (n) {
    return { router: n, peers: sess.filter(function (x) { return x.node === n; }).map(function (x) {
      var o = { peer: x.peer_ip, remote_as: x.remote_as, type: x.type, state: x.state, established: x.established,
        prefixes_received: x.pfx_rcvd != null ? x.pfx_rcvd : null };
      if (x.vrf) o.vrf = x.vrf;
      return o;
    }) };
  });
  var all = [].concat.apply([], routers.map(function (r) { return r.peers; }));
  return { routers: routers, counts: { total: all.length, established: all.filter(function (x) { return x.established; }).length } };
}

// ---- route lookup ---------------------------------------------------------------------------
// an IPv4 / IPv6 address -> { bits: 32|128, n: BigInt }, or null
function parseAddr(s) {
  s = String(s).trim();
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(s)) {
    if (/(^|\.)0\d/.test(s)) return null;   // 010 is octal to inet_aton (ping), decimal elsewhere
    var o = s.split('.').map(Number);
    if (o.some(function (x) { return x > 255; })) return null;
    return { bits: 32, n: o.reduce(function (a, x) { return a * 256n + BigInt(x); }, 0n) };
  }
  s = s.replace(/%[^%]+$/, '');   // zone index (fe80::1%eth0)
  if (!/^[0-9a-fA-F:.]+$/.test(s) || s.indexOf(':') < 0) return null;
  var tail = [];
  var m4 = /^(.*:)(\d{1,3}(?:\.\d{1,3}){3})$/.exec(s);   // ::ffff:192.0.2.1
  if (m4) {
    var v4 = parseAddr(m4[2]);
    if (!v4) return null;
    tail = [Number(v4.n >> 16n), Number(v4.n & 0xffffn)];
    s = /::$/.test(m4[1]) ? m4[1] : m4[1].slice(0, -1);   // keep a trailing '::', drop a single ':'
  }
  var halves = s.split('::');
  if (halves.length > 2) return null;
  var grp = function (h) { return h === '' ? [] : h.split(':'); };
  var head = grp(halves[0]), rest = halves.length === 2 ? grp(halves[1]) : [];
  if (head.concat(rest).some(function (g) { return !/^[0-9a-fA-F]{1,4}$/.test(g); })) return null;
  var groups = head.concat(rest).length + tail.length;
  if (halves.length === 2 ? groups > 7 : groups !== 8) return null;
  var fill = [];
  for (var i = groups; i < 8; i++) fill.push('0');
  var all = head.concat(halves.length === 2 ? fill : [], rest).map(function (g) { return parseInt(g, 16); }).concat(tail);
  return { bits: 128, n: all.reduce(function (a, x) { return a * 65536n + BigInt(x); }, 0n) };
}
// "10.0.0.0/24" -> { bits, n, len }, or null; a bare address is a host route
function parsePrefix(p) {
  var m = /^([^/]+)(?:\/(\d{1,3}))?$/.exec(String(p || '').trim());
  if (!m) return null;
  var a = parseAddr(m[1]);
  if (!a) return null;
  var len = m[2] != null ? +m[2] : a.bits;
  if (len > a.bits) return null;
  a.len = len;
  return a;
}
function inPrefix(addr, pfx) {
  if (addr.bits !== pfx.bits) return false;
  var shift = BigInt(pfx.bits - pfx.len);
  return (addr.n >> shift) === (pfx.n >> shift);
}

// longest-prefix match of an address in a router's collected routing_table (installed rows only)
function routeLookup(states, node, destination, vrf) {
  var s = getNode(states, node);
  if (!destination || !String(destination).trim()) throw new QueryError('missing destination');
  var addr = parseAddr(destination);
  if (!addr) {
    var lz = /^\s*\d+(\.\d+){3}\s*$/.test(destination) && /(^|\.)0\d/.test(String(destination).trim());
    throw new QueryError('destination is not an IPv4 or IPv6 address: ' + destination +
      (lz ? ' (an octet with a leading zero is ambiguous: write it without the zero)' : ''));
  }
  var v = vrf || 'default';
  var out = { router: node, destination: String(destination).trim(), vrf: v, route: null, next_hop: null, out_iface: null };
  if (!Array.isArray(s.routing_table)) {
    out.note = 'no routing table in the data for this router';
    return out;
  }
  var best = [], bestLen = -1;
  s.routing_table.forEach(function (r) {
    if (!r || r.selected === false || (r.vrf || 'default') !== v) return;
    var p = parsePrefix(r.prefix);
    if (!p || !inPrefix(addr, p) || p.len < bestLen) return;
    if (p.len > bestLen) { best = []; bestLen = p.len; }
    best.push(r);
  });
  if (!best.length) {
    out.note = 'no installed route in the routing table matches ' + out.destination + (vrf ? ' in VRF ' + v : '');
    return out;
  }
  var rowOut = function (r) {
    var o = { prefix: r.prefix, protocol: r.protocol || '', next_hop: r.next_hop || '', out_iface: r.out_iface || '' };
    if (Array.isArray(r.nexthops)) o.nexthops = r.nexthops.map(function (h) { return { ip: h.ip || '', iface: h.iface || '' }; });
    return o;
  };
  out.route = rowOut(best[0]);
  out.next_hop = out.route.next_hop || null;   // null: directly connected (no gateway)
  out.out_iface = out.route.out_iface || null;
  if (best.length > 1) out.also = best.slice(1).map(rowOut);   // more than one installed row with the same prefix length
  return out;
}

// ---- table output (--format table) ----------------------------------------------------------
var MAX_LINE = 99;   // every printed line stays under 100 characters
var SGR = { bold: '1', green: '32', yellow: '33', red: '31', dim: '2' };

function plain(s) { return String(s).replace(/[\u0000-\u001f\u007f-\u009f]/g, '?'); }   // router-supplied text: no terminal control characters
function cell(v) { return v == null || v === '' ? '-' : plain(v); }
function clip(s, w) { return s.length <= w ? s : (w <= 1 ? s.slice(0, w) : s.slice(0, w - 1) + '~'); }
function paint(s, style, color) { return color && style ? '\x1b[' + SGR[style] + 'm' + s + '\x1b[0m' : s; }

// cols: [{ head, key, right?, style?(value) }]; rows: plain objects. Columns are shrunk (widest first) to fit MAX_LINE.
function renderTable(cols, rows, color, indent) {
  indent = indent || '';
  var gap = 2;
  var text = rows.map(function (r) { return cols.map(function (c) { return cell(r[c.key]); }); });
  var w = cols.map(function (c, i) {
    return text.reduce(function (m, t) { return Math.max(m, t[i].length); }, c.head.length);
  });
  var total = function () { return indent.length + w.reduce(function (a, x) { return a + x; }, 0) + gap * (w.length - 1); };
  while (total() > MAX_LINE) {
    var i = w.indexOf(Math.max.apply(null, w));
    if (w[i] <= 3) break;
    w[i]--;
  }
  var line = function (vals, styleOf) {
    return (indent + vals.map(function (v, i) {
      var s = clip(v, w[i]), pad = new Array(w[i] - s.length + 1).join(' ');
      var styled = paint(s, styleOf(i, v), color);
      return cols[i].right ? pad + styled : (i === vals.length - 1 ? styled : styled + pad);
    }).join(new Array(gap + 1).join(' '))).replace(/\s+$/, '');
  };
  var out = [line(cols.map(function (c) { return c.head; }), function () { return 'bold'; })];
  text.forEach(function (t) {
    out.push(line(t, function (i, v) { return cols[i].style ? cols[i].style(v) : null; }));
  });
  return out;
}
function hasAny(rows, key) { return rows.some(function (r) { return r[key] != null && r[key] !== ''; }); }
function title(s, color) { return paint(clip(plain(s), MAX_LINE), 'bold', color); }
function textLine(s) { return clip(plain(s), MAX_LINE); }

function ospfStyle(v) { return /^full/i.test(v) ? 'green' : /^(2-?way|-)$/i.test(v) ? null : 'yellow'; }
function bgpStyle(v) { return /^established$/i.test(v) ? 'green' : 'red'; }

function stateTable(states, color) {
  var lr = listRouters(states), on = ospfNeighbors(states), bn = bgpNeighbors(states);
  var out = [title('Routers (' + lr.count + ')', color)];
  var rrows = lr.routers.map(function (r) {
    var ifs = states[r.name].interfaces || {}, names = Object.keys(ifs);
    var up = names.filter(function (i) { return ifs[i] && ifs[i].up; }).length;
    return { name: r.name, nos: r.nos, unread: r.unread, protocols: r.protocols.join(','), ifaces: up + '/' + names.length,
      ospf: r.counts.ospf_neighbors, bgp: r.counts.bgp_neighbors, bgp_routes: r.counts.bgp_routes,
      routes: r.routing_table ? r.counts.routes : null };
  });
  out = out.concat(renderTable([
    { head: 'ROUTER', key: 'name' }, { head: 'NOS', key: 'nos' }].concat(hasAny(rrows, 'unread') ? [{ head: 'UNREAD', key: 'unread' }] : []).concat([{ head: 'PROTOCOLS', key: 'protocols' },
    { head: 'IFACES UP', key: 'ifaces', right: true }, { head: 'OSPF NBRS', key: 'ospf', right: true },
    { head: 'BGP PEERS', key: 'bgp', right: true }, { head: 'BGP ROUTES', key: 'bgp_routes', right: true },
    { head: 'RIB ROUTES', key: 'routes', right: true }
  ]), rrows, color, '  '));

  var orows = [];
  on.routers.forEach(function (r) {
    r.neighbors.forEach(function (n) {
      orows.push({ router: r.router, neighbor: n.neighbor, address: n.address, iface: n.interface, state: n.state,
        role: n.role, peer: n.peer, vrf: n.vrf, af: n.af });
    });
  });
  out.push('', title('OSPF neighbors (' + on.counts.full + '/' + on.counts.total + ' Full)', color));
  if (!orows.length) out.push('  none');
  else {
    var ocols = [{ head: 'ROUTER', key: 'router' }, { head: 'NEIGHBOR ID', key: 'neighbor' },
      { head: 'ADDRESS', key: 'address' }, { head: 'INTERFACE', key: 'iface' },
      { head: 'STATE', key: 'state', style: ospfStyle }];
    if (hasAny(orows, 'role')) ocols.push({ head: 'ROLE', key: 'role' });
    if (hasAny(orows, 'peer')) ocols.push({ head: 'PEER', key: 'peer' });
    if (hasAny(orows, 'af')) ocols.push({ head: 'AF', key: 'af' });
    if (hasAny(orows, 'vrf')) ocols.push({ head: 'VRF', key: 'vrf' });
    out = out.concat(renderTable(ocols, orows, color, '  '));
  }

  var brows = [];
  bn.routers.forEach(function (r) {
    r.peers.forEach(function (p) {
      brows.push({ router: r.router, peer: p.peer, remote_as: p.remote_as, type: p.type, state: p.state,
        pfx: p.prefixes_received, vrf: p.vrf });
    });
  });
  out.push('', title('BGP neighbors (' + bn.counts.established + '/' + bn.counts.total + ' Established)', color));
  if (!brows.length) out.push('  none');
  else {
    var bcols = [{ head: 'ROUTER', key: 'router' }, { head: 'PEER', key: 'peer' },
      { head: 'REMOTE AS', key: 'remote_as', right: true }, { head: 'TYPE', key: 'type' },
      { head: 'STATE', key: 'state', style: bgpStyle }, { head: 'PFX RCVD', key: 'pfx', right: true }];
    if (hasAny(brows, 'vrf')) bcols.push({ head: 'VRF', key: 'vrf' });
    out = out.concat(renderTable(bcols, brows, color, '  '));
  }
  return out.join('\n') + '\n';
}

function whyTable(w, color) {
  var out = [title('Best path: ' + w.node + ' ' + w.prefix + (w.vrf ? ' (VRF ' + w.vrf + ')' : '') +
    ', ' + w.paths + ' path' + (w.paths === 1 ? '' : 's'), color)];
  var bests = w.best ? [w.best].concat(w.also_best || []) : [];
  bests.forEach(function (b, i) {
    out.push(textLine('  ' + (i ? 'also best: ' : 'best:      ') + 'via ' + cell(b.next_hop) + '  as-path ' + cell(b.as_path)));
  });
  if (!w.best) out.push('  best:      ' + paint('none', 'yellow', color));
  if (w.reason) {
    out.push(textLine('  reason:    ' + w.reason));
    if (w.reason_source) out.push(textLine('  source:    ' + w.reason_source));
  }
  if (w.note) out.push(textLine('  note:      ' + w.note));
  out.push('', title('Candidates', color));
  var rows = w.candidates.map(function (c) {
    return { mark: c.best ? '*' : ' ', next_hop: c.next_hop, as_path: c.as_path, lp: c.local_pref, weight: c.weight,
      med: c.metric, origin: c.origin, status: c.status, vrf: c.vrf };
  });
  var cols = [{ head: 'B', key: 'mark', style: function (v) { return v === '*' ? 'green' : null; } },
    { head: 'NEXT HOP', key: 'next_hop' }, { head: 'AS PATH', key: 'as_path' },
    { head: 'LOCPRF', key: 'lp', right: true }, { head: 'WEIGHT', key: 'weight', right: true },
    { head: 'MED', key: 'med', right: true }, { head: 'ORIGIN', key: 'origin' }];
  if (hasAny(rows, 'status')) cols.push({ head: 'STATUS', key: 'status' });
  out = out.concat(renderTable(cols, rows, color, '  '));
  return out.join('\n') + '\n';
}

// ---- CLI ------------------------------------------------------------------------------------
var USAGE = 'usage: xray-query.js state <state.json|dir> | why <state.json|dir> <node> <prefix> [vrf]' +
  ' [--format json|table] [--color]';

// pull --format / --color out of argv; the rest are the positional arguments
function parseOptions(argv) {
  var o = { format: 'json', color: false, args: [] };
  for (var i = 0; i < argv.length; i++) {
    var a = argv[i], m = /^--format(?:=(.*))?$/.exec(a);
    if (m) {
      var v = m[1] != null ? m[1] : argv[++i];
      if (v !== 'json' && v !== 'table') throw new QueryError('--format must be json or table');
      o.format = v;
    } else if (a === '--color') o.color = true;
    else o.args.push(a);
  }
  return o;
}

function run(argv) {
  var cmd = argv[0];
  if (cmd === 'state') { if (argv.length !== 2) throw new QueryError(USAGE); return summarize(loadStates(argv[1])); }
  if (cmd === 'why') { if (argv.length < 4 || argv.length > 5) throw new QueryError(USAGE); return why(loadStates(argv[1]), argv[2], argv[3], argv[4]); }
  throw new QueryError(cmd ? 'unknown command: ' + cmd + ' (' + USAGE + ')' : USAGE);
}

// the text for --format table (same checks and errors as run())
function runTable(argv, color) {
  var res = run(argv);
  return argv[0] === 'state' ? stateTable(loadStates(argv[1]), color) : whyTable(res, color);
}

if (require.main === module) {
  var res, code = 0, opts = null, _cli = process.argv.slice(2);
  if (_cli.indexOf('-h') >= 0 || _cli.indexOf('--help') >= 0) {
    console.log(USAGE + '\n' +
      '  state <path>                        nodes, links, OSPF adjacencies, BGP sessions, counts\n' +
      '  why <path> <node> <prefix> [vrf]    BGP best path and the reason stored with it\n' +
      '  <path>: a state_<node>.json, a directory of them, an xray-states.js, or a directory of saved FRR show ... json files\n' +
      '  --format json|table  default: json\n' +
      '  --color              colors in table output (only on a terminal)\n' +
      '  -h, --help           show this help');
    process.exit(0);
  }
  for (var _i = 0; _i < _cli.length; _i++) {
    if (_cli[_i] === '--format') _i++;
    else if (_cli[_i] !== '--color' && !/^--format=/.test(_cli[_i]) && _cli[_i].charAt(0) === '-' && _cli[_i].length > 1) {
      console.error('xray-query.js: unknown option: ' + _cli[_i] + "\nTry 'node scripts/xray-query.js --help'.");
      process.exit(2);
    }
  }
  try {
    opts = parseOptions(process.argv.slice(2));
    if (opts.format === 'table') res = runTable(opts.args, opts.color && !!process.stdout.isTTY);
    else res = run(opts.args);
  } catch (e) {
    res = { error: (e && e.message) || String(e) }; code = 2;
  }
  if (typeof res === 'string') process.stdout.write(res);
  else if (code && opts && opts.format === 'table') process.stderr.write('error: ' + plain(res.error) + '\n');
  else process.stdout.write(JSON.stringify(res, null, 2) + '\n');
  process.exitCode = code;
}

module.exports = { loadStates: loadStates, summarize: summarize, why: why, run: run,
  listRouters: listRouters, ospfNeighbors: ospfNeighbors, bgpNeighbors: bgpNeighbors, routeLookup: routeLookup, whyPath: whyPath,
  parseOptions: parseOptions, runTable: runTable, stateTable: stateTable, whyTable: whyTable };
