#!/usr/bin/env node
/*
 * clab-to-xray.js  —  prototype
 *
 * Reads a containerlab topology definition (.clab.yml / .yaml / .json) and
 * outputs the `config` JSON that X-Ray consumes (just before the OSS gallery facade entry).
 *
 * [scope]
 *   The X-Ray core can only draw 3 shapes (triangle / linear_2node / linear_3node, +layout inverted_v).
 *   So this converter maps only "small 2-3 node FRR labs" onto those existing shapes.
 *   Arbitrary N-node general graphs are reported as an explicit UNSUPPORTED error
 *   (they belong to a separate lane built for general graphs).
 *
 * [what it emits / does not emit]
 *   emits    : topology_type / layout / nodes(id,type,role,target,loopback) / networks(members,host_id)
 *              + a minimal capture skeleton + provenance(_clab_source) + warnings(_warnings)
 *   omits    : xray.protocol/pattern and live state (normal/detour/dead) belong to the facade.
 *              Here xray carries only an enabled stub, deferring the rest to the facade layer via TODO comments.
 *
 * Zero dependencies (Node stdlib only). YAML is read with a minimal parser for clab's plain subset
 * (for complex YAML, prefer .json input; --json reads the file as JSON).
 *
 * Usage:
 *   node clab-to-xray.js <topo.clab.yml> [--inverted-v] [--target <node>] [--json]
 *   node clab-to-xray.js samples/2node.clab.yml
 */
'use strict';
// dual-mode: works in both Node CLI and the browser. fs is referenced in Node only (CLI-only).
const fs = (typeof require === 'function') ? require('fs') : null;

/* ----------------------------------------------------------------------------
 * 1. Minimal YAML loader (for the clab topology subset only)
 *    supported     : comments(#) / indented maps / "- " lists / inline flow [a, b] / quotes
 *    not supported : anchors, multi-line scalars, complex nested flow, etc. -> use --json in that case
 * -------------------------------------------------------------------------- */
function parseScalar(s) {
  s = s.trim();
  if (s === '') return null;
  if ((s[0] === '"' && s.endsWith('"')) || (s[0] === "'" && s.endsWith("'"))) {
    return s.slice(1, -1);
  }
  if (s === 'true') return true;
  if (s === 'false') return false;
  if (s === 'null' || s === '~') return null;
  if (/^-?\d+$/.test(s)) return parseInt(s, 10);
  if (/^-?\d*\.\d+$/.test(s)) return parseFloat(s);
  return s;
}

function parseFlow(s) {
  // Split an inline list [a, b, "c:eth1"] (assumes no nesting)
  const inner = s.trim().replace(/^\[/, '').replace(/\]$/, '');
  if (inner.trim() === '') return [];
  const out = [];
  let buf = '', q = null;
  for (const ch of inner) {
    if (q) { if (ch === q) q = null; else buf += ch; continue; }
    if (ch === '"' || ch === "'") { q = ch; continue; }
    if (ch === ',') { out.push(parseScalar(buf)); buf = ''; continue; }
    buf += ch;
  }
  if (buf.trim() !== '') out.push(parseScalar(buf));
  return out;
}

function tokenize(src) {
  const lines = [];
  for (const raw of src.split(/\r?\n/)) {
    // Strip comments (roughly ignores # inside quotes = rarely a problem for clab topologies)
    let line = raw;
    const hash = findCommentHash(line);
    if (hash >= 0) line = line.slice(0, hash);
    if (line.trim() === '') continue;
    const indent = line.length - line.trimStart().length;
    lines.push({ indent, text: line.trim(), raw });
  }
  return lines;
}

function findCommentHash(line) {
  let q = null;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (q) { if (ch === q) q = null; continue; }
    if (ch === '"' || ch === "'") { q = ch; continue; }
    if (ch === '#' && (i === 0 || line[i - 1] === ' ' || line[i - 1] === '\t')) return i;
  }
  return -1;
}

function parseYaml(src) {
  const lines = tokenize(src);
  let pos = 0;

  function parseBlock(minIndent) {
    // Look ahead to decide map vs list
    if (pos >= lines.length) return null;
    const first = lines[pos];
    if (first.indent < minIndent) return null;
    const isList = first.text.startsWith('- ');
    return isList ? parseList(first.indent) : parseMap(first.indent);
  }

  function parseMap(indent) {
    const obj = {};
    while (pos < lines.length) {
      const ln = lines[pos];
      if (ln.indent < indent) break;
      if (ln.indent > indent) throw new Error('YAML indent error near: ' + ln.raw);
      if (ln.text.startsWith('- ')) break;
      const m = ln.text.match(/^([^:]+):\s*(.*)$/);
      if (!m) throw new Error('YAML parse error (expected key:): ' + ln.raw);
      const key = parseScalar(m[1]);
      const rest = m[2];
      pos++;
      if (rest === '') {
        // child block
        const child = (pos < lines.length && lines[pos].indent > indent) ? parseBlock(indent + 1) : null;
        obj[key] = child;
      } else if (rest.trim().startsWith('[')) {
        obj[key] = parseFlow(rest);
      } else {
        obj[key] = parseScalar(rest);
      }
    }
    return obj;
  }

  function parseList(indent) {
    const arr = [];
    while (pos < lines.length) {
      const ln = lines[pos];
      if (ln.indent < indent) break;
      if (ln.indent > indent) throw new Error('YAML indent error near: ' + ln.raw);
      if (!ln.text.startsWith('- ')) break;
      const itemText = ln.text.slice(2);
      const m = itemText.match(/^([^:\[\]]+):\s*(.*)$/);
      if (m) {
        // "- key: val" = a list item that is a map -> build the map starting from this line
        // virtually split the line: build the map this item points to
        const item = {};
        const key = parseScalar(m[1]);
        const rest = m[2];
        const childIndent = ln.indent + 2;
        pos++;
        if (rest === '') {
          item[key] = (pos < lines.length && lines[pos].indent >= childIndent) ? parseBlock(childIndent) : null;
        } else if (rest.trim().startsWith('[')) {
          item[key] = parseFlow(rest);
        } else {
          item[key] = parseScalar(rest);
        }
        // continuation keys of the same item (childIndent)
        while (pos < lines.length && lines[pos].indent === childIndent && !lines[pos].text.startsWith('- ')) {
          const m2 = lines[pos].text.match(/^([^:]+):\s*(.*)$/);
          if (!m2) break;
          const k2 = parseScalar(m2[1]);
          const r2 = m2[2];
          pos++;
          if (r2 === '') {
            item[k2] = (pos < lines.length && lines[pos].indent > childIndent) ? parseBlock(childIndent + 1) : null;
          } else if (r2.trim().startsWith('[')) {
            item[k2] = parseFlow(r2);
          } else {
            item[k2] = parseScalar(r2);
          }
        }
        arr.push(item);
      } else {
        arr.push(parseScalar(itemText));
        pos++;
      }
    }
    return arr;
  }

  const result = parseBlock(0);
  return result || {};
}

/* ----------------------------------------------------------------------------
 * 2. clab topology -> undirected graph extraction
 * -------------------------------------------------------------------------- */
function extractGraph(clab) {
  const topo = clab.topology || {};
  const nodesRaw = topo.nodes || {};
  const linksRaw = topo.links || [];

  // nodes: clab is a map {name: {kind, image, ...}}
  const nodes = Object.keys(nodesRaw).map((name) => {
    const def = nodesRaw[name] || {};
    return { name, kind: def.kind || '', image: def.image || '' };
  });

  // links: each item is {endpoints: ["r1:eth1", "r2:eth1"]} (the newer endpoints-map form is also handled)
  const edges = [];
  for (const l of linksRaw) {
    let eps = l && l.endpoints;
    if (!eps) continue;
    // endpoints as an array of ["node:iface", ...]
    const pair = eps.map((e) => {
      if (typeof e === 'string') return e.split(':')[0];
      if (e && e.node) return e.node; // newer form {node, interface}
      return String(e);
    });
    if (pair.length === 2 && pair[0] && pair[1]) {
      edges.push([pair[0], pair[1]]);
    }
  }
  return { name: clab.name || 'clab', nodes, edges };
}

/* ----------------------------------------------------------------------------
 * 3. Role inference (router / server) — conservative, documented heuristic
 * -------------------------------------------------------------------------- */
const SERVER_KINDS = new Set(['host', 'linux-host']);
const SERVER_NAME_RE = /^(sv|server|host|client|pc|h\d+)$/i;
function inferRole(node) {
  if (SERVER_KINDS.has((node.kind || '').toLowerCase())) return 'server';
  if (SERVER_NAME_RE.test(node.name)) return 'server';
  return 'router';
}

/* ----------------------------------------------------------------------------
 * 4. Shape classification + X-Ray config assembly
 * -------------------------------------------------------------------------- */
function dedupeEdges(edges) {
  const seen = new Set();
  const out = [];
  for (const [a, b] of edges) {
    const key = [a, b].sort().join('\x00');
    if (seen.has(key)) continue;
    seen.add(key);
    out.push([a, b]);
  }
  return out;
}

function degreeMap(nodeNames, edges) {
  const deg = {};
  nodeNames.forEach((n) => (deg[n] = 0));
  edges.forEach(([a, b]) => { deg[a] = (deg[a] || 0) + 1; deg[b] = (deg[b] || 0) + 1; });
  return deg;
}

function classify(graph, opts) {
  const names = graph.nodes.map((n) => n.name);
  const edges = dedupeEdges(graph.edges);
  const n = names.length, m = edges.length;

  if (n === 2 && m === 1) return { shape: 'linear_2node', layout: '', edges };
  if (n === 3 && m === 3) return { shape: 'triangle', layout: '', edges };
  if (n === 3 && m === 2) {
    // path: the center node (degree 2) sits between the two ends. Apply layout if inverted_v was requested.
    return { shape: 'linear_3node', layout: opts.invertedV ? 'inverted_v' : '', edges };
  }
  // anything else is out of scope
  return {
    shape: null,
    reason: `unsupported topology: nodes=${n}, links(dedup)=${m}. ` +
      `2-3 node triangle / linear only; general graphs need the graph lane.`,
    edges,
  };
}

function netName(a, b) { return 'net-' + a + b; }

// Reorder linear (path) nodes into chain order (the X-Ray linear renderer draws left-to-right in config order).
// A triangle is a cycle so order does not matter — leave it untouched.
function orderForLinear(names, edges, roleOf) {
  const deg = degreeMap(names, edges);
  const ends = names.filter((n) => deg[n] === 1);
  if (ends.length !== 2) return names; // not a chain -> leave as-is
  const adj = {};
  names.forEach((n) => (adj[n] = []));
  edges.forEach(([a, b]) => { adj[a].push(b); adj[b].push(a); });
  // Pick the endpoint deterministically: prefer a server on the left end, else alphabetical order
  const sortedEnds = ends.slice().sort();
  const start = sortedEnds.find((n) => roleOf(n) === 'server') || sortedEnds[0];
  const order = [start];
  const visited = new Set([start]);
  let cur = start;
  while (order.length < names.length) {
    const next = adj[cur].find((x) => !visited.has(x));
    if (next === undefined) break;
    visited.add(next); order.push(next); cur = next;
  }
  return order.length === names.length ? order : names;
}

function buildConfig(graph, cls, opts) {
  let names = graph.nodes.map((n) => n.name);
  const byName = {};
  graph.nodes.forEach((nd) => (byName[nd.name] = nd));
  if (cls.shape === 'linear_2node' || cls.shape === 'linear_3node') {
    names = orderForLinear(names, cls.edges, (n) => inferRole(byName[n]));
  }
  const orderedRaw = names.map((n) => byName[n]);
  const deg = degreeMap(names, cls.edges);

  // target inference: explicit override > highest-degree node (= the transit most likely to be observed)
  let target = opts.target;
  if (!target) {
    target = names.slice().sort((x, y) => (deg[y] - deg[x]))[0];
  }

  const nodes = orderedRaw.map((nd) => {
    const role = inferRole(nd);
    const node = {
      id: nd.name,
      type: role,                       // 'router' | 'server'
      role: role === 'server' ? 'Server' : 'Router',
    };
    if (nd.name === target && role === 'router') node.target = true;
    return node;
  });

  // networks: one net per edge. host_id is 10/20 by endpoint order.
  const networks = cls.edges.map(([a, b]) => ({
    name: netName(a, b),
    members: [
      { node: a, host_id: 10 },
      { node: b, host_id: 20 },
    ],
  }));

  const warnings = [];
  if (!nodes.some((x) => x.type === 'server')) {
    warnings.push('All nodes classified as router. If you have a server node, set kind:host or a name (sv/host/...) to improve this.');
  }
  warnings.push('xray.protocol / pattern / live state (normal/detour/dead) are not generated here = facade territory.');
  warnings.push('host_id and subnets are placeholders (.10/.20). To use real clab IPs, an inspect-JSON enrichment step is needed.');

  return {
    // ---- rendering config that X-Ray reads (just before the facade entry) ----
    success: true,
    id: graph.name,
    scenario_title: graph.name,
    topology_type: cls.shape,
    layout: cls.layout || '',
    nodes,
    networks,
    modes: ['troubleshoot', 'capture'],
    xray: {
      enabled: true,
      protocol: 'static',          // TODO: replace with the real protocol (ospf/bgp)
      pattern: cls.shape === 'triangle' ? 'ospf_triangle' : 'static_linear', // placeholder
      ping_mode: 'through',
      holo_fields: [],             // TODO: supplied by the facade
    },
    capture: { nets: networks.map((x) => x.name), lanes: {}, hide_arp: true },
    // ---- provenance / hand-off info (ignored by X-Ray, human-facing) ----
    _clab_source: { name: graph.name, node_count: names.length, link_count: cls.edges.length },
    _warnings: warnings,
  };
}

/* ----------------------------------------------------------------------------
 * 4a-bis. positions: turn containerlab graph-posX/posY labels into X-Ray positions.
 *   XrayUnified.renderSvg takes positions:{name:{x,y}} and computes per-link angles internally via atan2
 *   (real-angle radial). Note the raw-regex direct read: parseYaml does not structurally parse
 *   flow-style inline maps (labels:{graph-posX:"300"}), so we read positions from the raw text with a
 *   block-scoped regex to support both flow and block styles (label bleed is prevented by limiting the
 *   window to the node's own block). Nodes without graph-posX/posY are tiered by graph-level (spine top / leaf bottom).
 * -------------------------------------------------------------------------- */
function extractPositions(text) {
  var adj = {}, re = /endpoints:\s*\[\s*"([^:"]+):([^"\]]+)"\s*,\s*"([^:"]+):([^"\]]+)"\s*\]/g, m;
  while ((m = re.exec(text))) { adj[m[1]] = 1; adj[m[3]] = 1; }
  var nodes = Object.keys(adj);
  function block(name) {
    var s = text.search(new RegExp('(^|\\n)\\s*' + name + ':'));
    if (s < 0) return '';
    var rest = text.slice(s + 1);
    var e = rest.search(/\n\s{2,}[A-Za-z0-9_-]+:\s*[\{&]|\n\s*links:/);
    return e < 0 ? rest : rest.slice(0, e + 1);
  }
  function num(name, key) {
    var mm = block(name).match(new RegExp(key + ':\\s*"?(-?[0-9]+(?:\\.[0-9]+)?)"?'));
    return mm ? parseFloat(mm[1]) : null;
  }
  var pos = {}, level = {}, anyHint = false;
  nodes.forEach(function (n) {
    pos[n] = { x: num(n, 'graph-posX'), y: num(n, 'graph-posY') };
    level[n] = num(n, 'graph-level');
    if (Number.isFinite(pos[n].x) || Number.isFinite(pos[n].y) || Number.isFinite(level[n])) anyHint = true;
  });
  // Regression guard: a yaml with no graph-posX/posY and no graph-level produces no positions
  // (= leave it to the renderer's default fan-spread, preserving the look of existing unlabeled paste demos).
  if (!anyHint) return {};
  // graph-level fallback (use Number.isFinite: isFinite(null)===isFinite(0)===true would be a false-negative)
  var need = nodes.filter(function (n) { return !(Number.isFinite(pos[n].x) && Number.isFinite(pos[n].y)); });
  if (need.length) {
    var X0 = 200, Y0 = 90, COL_W = 180, ROW_H = 230, byLvl = {};
    need.forEach(function (n) { var L = Number.isFinite(level[n]) ? level[n] : 1; (byLvl[L] = byLvl[L] || []).push(n); });
    Object.keys(byLvl).forEach(function (L) { byLvl[L].forEach(function (n, i) { pos[n] = { x: X0 + i * COL_W, y: Y0 + (parseFloat(L) - 1) * ROW_H }; }); });
  }
  return pos;
}

/* ----------------------------------------------------------------------------
 * 4b. convert: text -> {ok, config} | {ok:false, reason,...} (shared by CLI and browser)
 * -------------------------------------------------------------------------- */
function convert(text, opts) {
  opts = opts || {};
  var clab = (opts.json) ? JSON.parse(text) : parseYaml(text);
  var graph = extractGraph(clab);
  var cls = classify(graph, opts);
  if (!cls.shape) {
    return { ok: false, reason: cls.reason,
      nodes: graph.nodes.map(function (n) { return n.name; }),
      links: dedupeEdges(graph.edges).map(function (e) { return e.join('-'); }) };
  }
  var config = buildConfig(graph, cls, opts);
  // graph-posX/posY (or a graph-level tier fallback) -> attach positions:{name:{x,y}} to the config.
  // XrayUnified.renderSvg reads it (harmless: the legacy engine ignores it; it is the basis for real-angle radial).
  var positions = (opts.json) ? {} : extractPositions(text);   // JSON paste is outside the yaml regex -> {} (renderer fan-spreads)
  if (Object.keys(positions).length) config.positions = positions;
  return { ok: true, config: config };
}

/* ----------------------------------------------------------------------------
 * 5. CLI
 * -------------------------------------------------------------------------- */
function main(argv) {
  const args = argv.slice(2);
  if (args.length === 0 || args.includes('-h') || args.includes('--help')) {
    process.stderr.write(
      'usage: node clab-to-xray.js <topo.clab.yml|.json> [--inverted-v] [--target <node>] [--json]\n');
    process.exit(args.length === 0 ? 1 : 0);
  }
  const opts = { invertedV: args.includes('--inverted-v'), json: args.includes('--json'), target: null };
  const ti = args.indexOf('--target');
  if (ti >= 0 && args[ti + 1]) opts.target = args[ti + 1];
  const file = args.find((a) => !a.startsWith('--') && a !== opts.target);

  const src = fs.readFileSync(file, 'utf8');
  let clab;
  if (opts.json || file.endsWith('.json')) clab = JSON.parse(src);
  else clab = parseYaml(src);

  const graph = extractGraph(clab);
  const cls = classify(graph, opts);
  if (!cls.shape) {
    process.stderr.write('[UNSUPPORTED] ' + cls.reason + '\n');
    process.stderr.write('  nodes: ' + graph.nodes.map((n) => n.name).join(', ') + '\n');
    process.stderr.write('  links: ' + dedupeEdges(graph.edges).map((e) => e.join('-')).join(', ') + '\n');
    process.exit(2);
  }
  const config = buildConfig(graph, cls, opts);
  process.stdout.write(JSON.stringify(config, null, 2) + '\n');
}

var _api = { parseYaml: parseYaml, extractGraph: extractGraph, classify: classify, buildConfig: buildConfig, convert: convert };
if (typeof require === 'function' && typeof module !== 'undefined' && require.main === module) main(process.argv);
if (typeof module !== 'undefined' && module.exports) module.exports = _api;
if (typeof window !== 'undefined') window.clabToXray = _api;   // browser (used by the clab-paste demo)
