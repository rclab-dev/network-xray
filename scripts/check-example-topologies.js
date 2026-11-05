#!/usr/bin/env node
// check-example-topologies.js — static checks of every examples/*/*.clab.yml (Node built-ins only)
//
//   node scripts/check-example-topologies.js     # one line per problem, exit 1 if there is any
//
// For each lab file:
//   - `name:` is a plain name (letters, digits, '-', '_'; no quotes, spaces, dots or slashes)
//   - every links[].endpoints entry is "<node>:<interface>" and <node> is in topology.nodes
//   - no interface is used twice on the same node
//   - each node's kind is supported, and its image (own or topology.kinds default) fits that kind
//   - startup-config files and the host side of binds exist (relative to the lab folder)
//   - <dir>-solved/<same file> has the same nodes (name, kind) and the same links as <dir>/<file>
'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const EXAMPLES = path.join(ROOT, 'examples');

// kind -> image repositories that kind may run (digest or tag after the repository)
const SUPPORTED = {
  linux: ['frrouting/frr', 'alpine'],
  cisco_iol: ['vrnetlab/cisco_iol'],
  nokia_srlinux: ['ghcr.io/nokia/srlinux'],
};

// ---------------------------------------------------------------------------
// minimal YAML reader: block maps, block sequences, flow maps/sequences,
// plain / 'single' / "double" quoted scalars, # comments. Scalars stay strings.
// ---------------------------------------------------------------------------
function stripComment(line) {
  let q = null;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (q) {
      if (q === '"' && c === '\\') { i++; continue; }
      if (c === q) q = null;
    } else if (c === '"' || c === "'") {
      q = c;
    } else if (c === '#' && (i === 0 || /\s/.test(line[i - 1]))) {
      return line.slice(0, i);
    }
  }
  return line;
}

function parseFlow(src) {
  let i = 0;
  const ws = () => { while (i < src.length && /\s/.test(src[i])) i++; };
  const err = (m) => { throw new Error(m + ' at column ' + (i + 1) + ' in: ' + src.slice(0, 60)); };
  function scalar(stops) {
    ws();
    const c = src[i];
    if (c === '"') {
      let s = ''; i++;
      while (i < src.length && src[i] !== '"') {
        if (src[i] === '\\') { i++; const e = src[i]; s += e === 'n' ? '\n' : e === 't' ? '\t' : e; } else s += src[i];
        i++;
      }
      if (src[i] !== '"') err('unterminated string');
      i++; return s;
    }
    if (c === "'") {
      let s = ''; i++;
      for (;;) {
        if (i >= src.length) err('unterminated string');
        if (src[i] === "'") { if (src[i + 1] === "'") { s += "'"; i += 2; continue; } i++; break; }
        s += src[i++];
      }
      return s;
    }
    let s = '';
    while (i < src.length && !stops.includes(src[i]) && !(src[i] === ':' && /[\s,\]}]/.test(src[i + 1] || ' '))) s += src[i++];
    return s.trim();
  }
  function value(stops) {
    ws();
    if (src[i] === '{') {
      i++; const o = {};
      for (;;) {
        ws();
        if (src[i] === '}') { i++; return o; }
        const k = scalar(',:}');
        ws(); if (src[i] !== ':') err("expected ':'");
        i++;
        o[k] = value(',}');
        ws();
        if (src[i] === ',') { i++; continue; }
        if (src[i] === '}') { i++; return o; }
        err("expected ',' or '}'");
      }
    }
    if (src[i] === '[') {
      i++; const a = [];
      for (;;) {
        ws();
        if (src[i] === ']') { i++; return a; }
        a.push(value(',]'));
        ws();
        if (src[i] === ',') { i++; continue; }
        if (src[i] === ']') { i++; return a; }
        err("expected ',' or ']'");
      }
    }
    return scalar(stops);
  }
  const v = value('');
  ws();
  if (i < src.length) err('unexpected text');
  return v;
}

function parseYaml(text) {
  const lines = [];
  text.split('\n').forEach((raw, n) => {
    const s = stripComment(raw.replace(/\r$/, '')).replace(/\s+$/, '');
    if (!s.trim()) return;
    if (/\t/.test(s.match(/^\s*/)[0])) throw new Error('line ' + (n + 1) + ': tab indentation');
    lines.push({ ind: s.match(/^ */)[0].length, text: s.trim(), n: n + 1 });
  });
  let p = 0;
  function inline(v) { return /^[[{]/.test(v) ? parseFlow(v) : parseFlow(v === '' ? '""' : v); }
  function block(ind) {
    if (p >= lines.length || lines[p].ind < ind) return null;
    ind = lines[p].ind;
    if (/^-(\s|$)/.test(lines[p].text)) {
      const arr = [];
      while (p < lines.length && lines[p].ind === ind && /^-(\s|$)/.test(lines[p].text)) {
        const rest = lines[p].text.slice(1).trim();
        if (!rest) { p++; arr.push(block(ind + 1)); continue; }
        // "- key: value" starts a map whose keys sit at ind+2
        if (/^[^"'[{][^:]*:(\s|$)/.test(rest)) {
          lines[p] = { ind: ind + 2, text: rest, n: lines[p].n };
          arr.push(block(ind + 2));
        } else { p++; arr.push(inline(rest)); }
      }
      return arr;
    }
    const obj = {};
    while (p < lines.length && lines[p].ind === ind) {
      const m = lines[p].text.match(/^("[^"]*"|'[^']*'|[^:]+?):(?:\s+(.*))?$/);
      if (!m) throw new Error('line ' + lines[p].n + ': expected "key: value"');
      const key = m[1].replace(/^["']|["']$/g, '');
      if (Object.prototype.hasOwnProperty.call(obj, key)) throw new Error('line ' + lines[p].n + ': duplicate key ' + key);
      p++;
      if (m[2] !== undefined && m[2] !== '') obj[key] = inline(m[2]);
      else obj[key] = (p < lines.length && lines[p].ind > ind) ? block(ind + 1) : null;
    }
    return obj;
  }
  const doc = block(0);
  if (p < lines.length) throw new Error('line ' + lines[p].n + ': bad indentation');
  return doc;
}

// ---------------------------------------------------------------------------
function isMap(v) { return v && typeof v === 'object' && !Array.isArray(v); }

function imageRepo(image) {
  return String(image).replace(/@.*$/, '').replace(/:[^/:]*$/, '');
}

// lab file -> { name, nodes: {name: {kind, image, startupConfig, binds}}, links: [[a, b]], problems: [] }
function readLab(file) {
  const problems = [];
  let doc;
  try { doc = parseYaml(fs.readFileSync(file, 'utf8')); } catch (e) { return { problems: ['YAML: ' + e.message] }; }
  if (!isMap(doc)) return { problems: ['not a YAML mapping'] };
  const topo = isMap(doc.topology) ? doc.topology : null;
  if (!topo) problems.push('no topology: section');
  const kinds = topo && isMap(topo.kinds) ? topo.kinds : {};
  const nodes = {};
  const rawNodes = topo && topo.nodes;
  if (!isMap(rawNodes) || !Object.keys(rawNodes).length) problems.push('topology.nodes is missing or empty');
  else for (const [n, v] of Object.entries(rawNodes)) {
    const def = isMap(v) ? v : {};
    const kind = def.kind != null ? String(def.kind) : null;
    const kdef = kind && isMap(kinds[kind]) ? kinds[kind] : {};
    nodes[n] = {
      kind,
      image: def.image != null ? String(def.image) : (kdef.image != null ? String(kdef.image) : null),
      startupConfig: def['startup-config'] != null ? String(def['startup-config']) : (kdef['startup-config'] != null ? String(kdef['startup-config']) : null),
      binds: (Array.isArray(kdef.binds) ? kdef.binds : []).concat(Array.isArray(def.binds) ? def.binds : []).map(String),   // kind's binds + the node's (as containerlab)
    };
  }
  const links = [];
  const rawLinks = topo ? topo.links : null;
  if (rawLinks != null && !Array.isArray(rawLinks)) problems.push('topology.links is not a list');
  else (rawLinks || []).forEach((l, i) => {
    const eps = isMap(l) ? l.endpoints : null;
    if (!Array.isArray(eps) || eps.length !== 2) { problems.push(`links[${i}]: endpoints must be a list of two "node:interface"`); return; }
    links.push(eps.map(String));
  });
  return { name: doc.name, nodes, links, problems };
}

function checkLab(file) {
  const dir = path.dirname(file);
  const lab = readLab(file);
  const problems = lab.problems.slice();
  if (!lab.nodes) return problems;

  if (typeof lab.name !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9_-]*$/.test(lab.name)) {
    problems.push(`name: ${JSON.stringify(lab.name === undefined ? null : lab.name)} is not a plain lab name`);
  }

  for (const [n, node] of Object.entries(lab.nodes)) {
    if (!/^[A-Za-z0-9][A-Za-z0-9_-]*$/.test(n)) problems.push(`node ${JSON.stringify(n)}: not a plain node name`);
    if (!node.kind) problems.push(`node ${n}: no kind`);
    else if (!SUPPORTED[node.kind]) problems.push(`node ${n}: kind ${node.kind} is not supported (${Object.keys(SUPPORTED).join(', ')})`);
    if (!node.image) problems.push(`node ${n}: no image`);
    else if (node.kind && SUPPORTED[node.kind] && !SUPPORTED[node.kind].includes(imageRepo(node.image))) {
      problems.push(`node ${n}: image ${node.image} is not supported for kind ${node.kind} (${SUPPORTED[node.kind].join(', ')})`);
    }
    const refs = [];
    if (node.startupConfig) refs.push(['startup-config', node.startupConfig]);
    node.binds.forEach((b) => refs.push(['bind', b.split(':')[0]]));
    for (const [what, ref] of refs) {
      const abs = path.resolve(dir, ref);
      if (path.isAbsolute(ref) || ref.split(/[\\/]/).includes('..') || !abs.startsWith(dir + path.sep)) {
        problems.push(`node ${n}: ${what} ${ref} is outside the lab folder`);
      } else if (!fs.existsSync(abs) || !fs.statSync(abs).isFile()) {
        problems.push(`node ${n}: ${what} ${ref} does not exist`);
      }
    }
  }

  const used = new Map();
  lab.links.forEach((eps, i) => {
    for (const ep of eps) {
      const m = ep.match(/^([^:]+):(.+)$/);
      if (!m) { problems.push(`links[${i}]: endpoint ${JSON.stringify(ep)} is not "node:interface"`); continue; }
      if (!lab.nodes[m[1]]) problems.push(`links[${i}]: node ${m[1]} is not in topology.nodes`);
      if (used.has(ep)) problems.push(`links[${i}]: ${ep} is already used by links[${used.get(ep)}]`);
      else used.set(ep, i);
    }
  });
  return problems;
}

function linkKey(eps) { return eps.slice().sort().join(' -- '); }

// compare <dir>/<file> with <dir>-solved/<file>
function compareSolved(baseFile, solvedFile) {
  const a = readLab(baseFile), b = readLab(solvedFile);
  if (!a.nodes || !b.nodes) return [];
  const problems = [];
  const names = new Set([...Object.keys(a.nodes), ...Object.keys(b.nodes)]);
  for (const n of [...names].sort()) {
    if (!a.nodes[n]) problems.push(`node ${n} is only in the solved copy`);
    else if (!b.nodes[n]) problems.push(`node ${n} is missing from the solved copy`);
    else if (a.nodes[n].kind !== b.nodes[n].kind) problems.push(`node ${n}: kind ${a.nodes[n].kind} vs ${b.nodes[n].kind} in the solved copy`);
  }
  const la = new Set(a.links.map(linkKey)), lb = new Set(b.links.map(linkKey));
  for (const l of la) if (!lb.has(l)) problems.push(`link ${l} is missing from the solved copy`);
  for (const l of lb) if (!la.has(l)) problems.push(`link ${l} is only in the solved copy`);
  return problems;
}

function relPath(abs) { return path.relative(ROOT, abs).split(path.sep).join('/'); }

// { "examples/x/y.clab.yml": [problem, ...] } for every lab under `examples`
function checkAll(examples = EXAMPLES) {
  const out = {};
  const dirs = fs.readdirSync(examples).filter((d) => fs.statSync(path.join(examples, d)).isDirectory()).sort();
  for (const d of dirs) {
    for (const f of fs.readdirSync(path.join(examples, d)).filter((x) => /\.clab\.ya?ml$/.test(x)).sort()) {
      const file = path.join(examples, d, f);
      const problems = checkLab(file);
      const m = d.match(/^(.*)-solved$/);
      if (m && !fs.existsSync(path.join(examples, m[1]))) problems.push(`no ${m[1]}/ next to this solved lab`);
      if (!m && !fs.existsSync(path.join(examples, d + '-solved'))) problems.push(`no ${d}-solved/ next to it (every example has a solved twin)`);
      if (m && fs.existsSync(path.join(examples, m[1]))) {
        const base = path.join(examples, m[1], f);
        if (!fs.existsSync(base)) problems.push(`no ${relPath(base)} to compare with`);
        else problems.push(...compareSolved(base, file));
      }
      out[relPath(file)] = problems;
    }
  }
  return out;
}

module.exports = { parseYaml, parseFlow, readLab, checkLab, compareSolved, checkAll, SUPPORTED };

if (require.main === module) {
  const result = checkAll(process.argv[2] ? path.resolve(process.argv[2]) : EXAMPLES);
  let count = 0;
  for (const [f, problems] of Object.entries(result)) for (const p of problems) { console.log(`${f}: ${p}`); count++; }
  const labs = Object.keys(result).length;
  if (count) { console.error(`${count} problem(s) in ${labs} lab file(s)`); process.exit(1); }
  console.log(`ok: ${labs} lab file(s)`);
}
