#!/usr/bin/env node
// check-problem-json.js — schema check for examples/*/problem.json (format network-xray-lab/0; Node built-ins only)
//
//   node scripts/check-problem-json.js        # one line per example, exit 1 on any problem
//
// The fields and their meaning: docs/problem-format.md. Readers: clab-xray-collect.js (focus, check),
// solved-check.js (check), xray-graph-nextui.html (titles, problem text, rcl_*, solved_cta).
// For each examples/<dir>/problem.json:
//   - valid JSON object, format "network-xray-lab/0", id "rclab-dev/network-xray/<dir>", no unknown keys
//   - every documented field has the right type; problem text uses only <br> <code> <strong> <span>
//   - solved_cta has a label and an http(s) url; rcl_* / ref are strings
//   - focus.node and every check node exist in the lab's topology; focus.prefix is a canonical IPv4 prefix
//   - check.all = [[node, path, op, value], …] with ops and value shapes that solved-check.js accepts;
//     item fields match the documented state; interfaces exist on that node; prefixes and addresses
//     appear in the lab's files (topology and configs)
//   - <dir>-solved/problem.json is the same as <dir>/problem.json except id ("…/<dir>-solved")
'use strict';
const fs = require('fs');
const path = require('path');
const { parseTopology } = require('./check-examples.js');
const { OPS } = require('../solved-check.js');

const ROOT = path.resolve(__dirname, '..');
const FORMAT = 'network-xray-lab/0';
const ID_PREFIX = 'rclab-dev/network-xray/';

const STRING_KEYS = ['id', 'version', 'author', 'license', 'q_number', 'title_en', 'title_ja', 'problem_en', 'problem_ja',
  'check_note_en', 'check_note_ja', 'rcl_qid', 'rcl_mode', 'ref', 'cta_label_en', 'cta_label_ja'];
const KNOWN_KEYS = new Set(['format', 'focus', 'check', 'solved_cta', ...STRING_KEYS]);
const CTA_KEYS = new Set(['label_en', 'label_ja', 'url_en', 'url_ja']);

// state fields (docs/problem-format.md "What you can look at"): array fields and the fields of one item
const ITEM_FIELDS = {
  routing_table: ['prefix', 'protocol', 'out_iface', 'next_hop', 'selected', 'nexthops'],
  ospf_neighbors: ['router_id', 'address', 'state', 'role', 'iface', 'full'],
  bgp_neighbors: ['ip', 'remote_as', 'ibgp', 'state', 'up_down', 'pfx_rcvd', 'vrf'],
  bgp_routes: ['prefix', 'prefixlen', 'next_hop', 'as_path', 'best', 'weight', 'metric', 'origin', 'status', 'multipath', 'vrf'],
};
const IFACE_ITEM_FIELDS = ['up', 'ip'];   // interfaces.<iface>.<field>
const OBJECT_FIELDS = {
  interfaces: null, // interfaces.<iface>.{up, ip}
  route_resolution: ['target', 'resolved', 'protocol', 'out_iface', 'next_hop', 'matched_prefix'],
};
const BOOL_FIELDS = new Set(['selected', 'full', 'ibgp', 'best', 'multipath', 'up', 'resolved']);
const NUM_FIELDS = new Set(['prefixlen', 'weight', 'metric', 'pfx_rcvd', 'remote_as']);
const IFACE_FIELDS = new Set(['out_iface', 'iface']);
const ADDR_FIELDS = new Set(['next_hop', 'ip', 'address', 'router_id', 'target']);

const IPV4 = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/;
function ipNum(s) {
  const m = IPV4.exec(s);
  if (!m || m.slice(1).some((x) => +x > 255)) return null;
  return m.slice(1).reduce((a, x) => a * 256 + +x, 0);
}
function parsePrefix(s) {
  const m = /^([\d.]+)\/(\d{1,2})$/.exec(String(s));
  if (!m || +m[2] > 32) return null;
  const n = ipNum(m[1]);
  if (n == null) return null;
  const size = 2 ** (32 - +m[2]);
  return { net: n, len: +m[2], canonical: n % size === 0, inside: (a) => a - (n - (n % size)) >= 0 && a - (n - (n % size)) < size };
}

function rel(p) { return path.relative(ROOT, p).split(path.sep).join('/'); }

// the lab: nodes, each node's interfaces (from links), and every IPv4 address in its topology and configs
function readLab(dir) {
  const labs = fs.readdirSync(dir).filter((f) => /\.clab\.ya?ml$/.test(f));
  if (labs.length !== 1) return null;
  const topoText = fs.readFileSync(path.join(dir, labs[0]), 'utf8');
  const topo = parseTopology(topoText);
  const ifaces = {};
  for (const n of Object.keys(topo.nodes)) ifaces[n] = new Set();
  for (const m of topoText.matchAll(/["']?([A-Za-z0-9_.-]+):([A-Za-z0-9_./-]+)["']?/g)) {
    if (ifaces[m[1]] && /endpoints/.test(topoText.slice(topoText.lastIndexOf('\n', m.index), m.index))) ifaces[m[1]].add(m[2]);
  }
  const addrs = new Set();
  (function walk(d) {
    for (const f of fs.readdirSync(d)) {
      const p = path.join(d, f);
      const st = fs.lstatSync(p);   // a symlink is not followed or read
      if (st.isDirectory()) walk(p);
      else if (st.isFile() && /\.(conf|cfg|ya?ml)$|^daemons$/.test(f) && st.size < 1e6) {   // router configs and the topology only
        for (const a of fs.readFileSync(p, 'utf8').matchAll(/(?<![\d.])\d{1,3}(?:\.\d{1,3}){3}(?![\d])/g)) addrs.add(a[0]);
      }
    }
  })(dir);
  return { file: labs[0], nodes: topo.nodes, ifaces, addrs };
}

function hasAddr(lab, a) { return lab.addrs.has(a); }
function hasPrefix(lab, p) {
  if (p.len === 0) return true; // the default route
  for (const a of lab.addrs) { const n = ipNum(a); if (n != null && p.inside(n)) return true; }
  return false;
}

function checkProblemText(key, s, out) {
  for (const m of s.matchAll(/<[^>]*>?/g)) {
    if (!/^<\/?(br|code|strong|span)>$/.test(m[0])) out.push(`${key}: tag ${m[0]} is shown as text (only <br> <code> <strong> <span>)`);
  }
  for (const t of ['code', 'strong', 'span']) {
    const open = (s.match(new RegExp(`<${t}>`, 'g')) || []).length;
    const close = (s.match(new RegExp(`</${t}>`, 'g')) || []).length;
    if (open !== close) out.push(`${key}: ${open} <${t}> but ${close} </${t}>`);
  }
}

// one item condition [path, op, value] inside some/none/count_ge on array field `arr` of node `node`
function checkValue(field, op, value, ctx, node, lab, arr, out) {
  const vals = op === 'in' ? value : [value];
  if (!['eq', 'ne', 'in'].includes(op)) return;
  const mustExist = op !== 'ne';   // "ne" says what the value is NOT: it need not be in the lab's files
  for (const v of vals) {
    if (typeof v === 'string' && (v === '' || v.includes(':')) && (ADDR_FIELDS.has(field) || field === 'prefix')) continue;   // empty (no next hop) / IPv6: not checked here
    if (BOOL_FIELDS.has(field) && typeof v !== 'boolean') out.push(`${ctx}: ${field} is true/false, not ${JSON.stringify(v)}`);
    else if (NUM_FIELDS.has(field) && typeof v !== 'number') out.push(`${ctx}: ${field} is a number, not ${JSON.stringify(v)}`);
    else if (IFACE_FIELDS.has(field) && typeof v === 'string' && !/^lo/.test(v) && !lab.ifaces[node].has(v)) {
      out.push(`${ctx}: ${node} has no interface ${v} in ${lab.file}`);
    } else if (ADDR_FIELDS.has(field) && typeof v === 'string') {
      if (ipNum(v) == null) out.push(`${ctx}: ${field} ${JSON.stringify(v)} is not an IPv4 address`);
      else if (mustExist && !hasAddr(lab, v)) out.push(`${ctx}: address ${v} is not in the lab's files`);
    } else if (field === 'prefix' && typeof v === 'string') {
      if (arr === 'bgp_routes') {
        // bgp_routes.prefix has no mask ("8.8.8.0"); the length is in prefixlen
        if (v.includes('/')) out.push(`${ctx}: bgp_routes prefix ${v} has a mask (use "${v.split('/')[0]}" and prefixlen)`);
        else if (ipNum(v) == null) out.push(`${ctx}: prefix ${JSON.stringify(v)} is not an IPv4 address`);
        else if (mustExist && !hasAddr(lab, v)) out.push(`${ctx}: prefix ${v} is not in the lab's files`);
      } else {
        const p = parsePrefix(v);
        if (!p) out.push(`${ctx}: prefix ${JSON.stringify(v)} is not an IPv4 prefix (a.b.c.d/len)`);
        else if (!p.canonical) out.push(`${ctx}: prefix ${v} has host bits set`);
        else if (mustExist && !hasPrefix(lab, p)) out.push(`${ctx}: prefix ${v} is not in the lab's files`);
      }
    }
  }
}

function checkItemConds(conds, ctx, node, lab, arr, out) {
  if (!Array.isArray(conds) || !conds.length) { out.push(`${ctx}: needs a non-empty list of [path, op, value]`); return; }
  conds.forEach((c, j) => {
    const cx = `${ctx}[${j}]`;
    if (!Array.isArray(c) || c.length < 2 || c.length > 3) { out.push(`${cx}: expected [path, op, value]`); return; }
    const [p, op, value] = c;
    if (typeof p !== 'string' || !p) { out.push(`${cx}: path is not a string`); return; }
    const field = p.split('.')[0];
    if (ITEM_FIELDS[arr] && !ITEM_FIELDS[arr].includes(field)) out.push(`${cx}: ${arr} items have no field "${field}"`);
    checkOp(op, value, c.length, cx, out, () => checkValue(field, op, value, cx, node, lab, arr, out),
      (inner) => checkItemConds(inner, cx, node, lab, null, out));
  });
}

// op + value shape (as solved-check.js evaluates them); `leaf` checks the value against the field,
// `nested` checks the item conditions of some/none/count_ge
function checkOp(op, value, len, ctx, out, leaf, nested) {
  if (!OPS.includes(op)) { out.push(`${ctx}: unknown op ${JSON.stringify(op)}`); return; }
  if (op === 'exists' || op === 'absent') { if (len >= 3) out.push(`${ctx}: ${op} takes no value`); return; }
  if (len < 3) { out.push(`${ctx}: ${op} needs a value`); return; }
  if (['gt', 'ge', 'lt', 'le'].includes(op)) { if (typeof value !== 'number') out.push(`${ctx}: ${op} needs a number`); return; }
  if (op === 'in' && (!Array.isArray(value) || !value.length)) { out.push(`${ctx}: in needs a non-empty array`); return; }
  if (op === 'some' || op === 'none') { nested(value); return; }
  if (op === 'count_ge') {
    if (!Array.isArray(value) || value.length !== 2 || !Number.isInteger(value[0]) || value[0] < 1) {
      out.push(`${ctx}: count_ge needs [N >= 1, [conditions]] (N = 0 is always true, so it checks nothing)`); return;
    }
    nested(value[1]); return;
  }
  leaf();
}

function checkCheck(chk, lab, out) {
  if (!chk || typeof chk !== 'object' || Array.isArray(chk)) { out.push('check: not an object'); return; }
  for (const k of Object.keys(chk)) if (k !== 'all') out.push(`check.${k}: unknown key (format 0 has only "all")`);
  if (!Array.isArray(chk.all) || !chk.all.length) { out.push('check.all: not a non-empty array'); return; }
  chk.all.forEach((c, i) => {
    const ctx = `check.all[${i}]`;
    if (!Array.isArray(c) || c.length < 3 || c.length > 4) { out.push(`${ctx}: expected [node, path, op, value]`); return; }
    const [node, p, op, value] = c;
    if (typeof node !== 'string' || !lab.nodes[node]) { out.push(`${ctx}: node ${JSON.stringify(node)} is not in ${lab.file}`); return; }
    if (typeof p !== 'string' || !p) { out.push(`${ctx}: path is not a string`); return; }
    const parts = p.split('.');
    const top = parts[0];
    if (!ITEM_FIELDS[top] && !(top in OBJECT_FIELDS)) { out.push(`${ctx}: unknown state field "${top}"`); return; }
    if (ITEM_FIELDS[top] && parts.length > 1) out.push(`${ctx}: ${top} is an array (use some / none / count_ge)`);
    if (top === 'interfaces' && parts[1] && !parts[1].includes('{') && !lab.ifaces[node].has(parts[1])) {
      out.push(`${ctx}: ${node} has no interface ${parts[1]} in ${lab.file}`);
    }
    if (OBJECT_FIELDS[top] && parts[1] && !OBJECT_FIELDS[top].includes(parts[1])) out.push(`${ctx}: ${top} has no field "${parts[1]}"`);
    if (top === 'interfaces' && parts.length > 2 && !IFACE_ITEM_FIELDS.includes(parts[2])) out.push(`${ctx}: interfaces.<iface> has no field "${parts[2]}" (${IFACE_ITEM_FIELDS.join(' / ')})`);
    if (parts.length > (top === 'interfaces' ? 3 : 2)) out.push(`${ctx}: path ${p} is too deep`);
    if (['some', 'none', 'count_ge'].includes(op) && !ITEM_FIELDS[top]) out.push(`${ctx}: ${op} needs an array field, ${top} is not one`);
    checkOp(op, value, c.length - 1, ctx, out, () => checkValue(parts[parts.length - 1], op, value, ctx, node, lab, null, out),
      (inner) => checkItemConds(inner, ctx, node, lab, ITEM_FIELDS[top] ? top : null, out));
  });
}

function checkProblem(pj, dirName, lab) {
  const out = [];
  if (!pj || typeof pj !== 'object' || Array.isArray(pj)) return ['not a JSON object'];
  if (pj.format !== FORMAT) out.push(`format: ${JSON.stringify(pj.format)} (must be "${FORMAT}")`);
  for (const k of Object.keys(pj)) if (!KNOWN_KEYS.has(k)) out.push(`${k}: unknown key`);
  for (const k of STRING_KEYS) if (k in pj && (typeof pj[k] !== 'string' || !pj[k].trim())) out.push(`${k}: not a non-empty string`);
  if (pj.id !== ID_PREFIX + dirName) out.push(`id: ${JSON.stringify(pj.id)} (expected "${ID_PREFIX}${dirName}")`);
  for (const k of ['problem_en', 'problem_ja', 'title_en', 'title_ja']) if (typeof pj[k] === 'string') {
    if (k.startsWith('problem')) checkProblemText(k, pj[k], out);
    else if (/[<>]/.test(pj[k])) out.push(`${k}: the title is plain text (no tags)`);
  }
  if ((pj.title_en || pj.title_ja) && !(pj.problem_en || pj.problem_ja)) out.push('problem_en/problem_ja: title without a problem text');
  if (pj.check && !(pj.title_en || pj.title_ja || pj.problem_en || pj.problem_ja)) out.push('check: no title or problem text, so the band (and ✓ Solved) is never shown');
  if (('rcl_mode' in pj || 'ref' in pj) && !pj.rcl_qid) out.push('rcl_mode/ref: no rcl_qid, so they are not used');

  if ('solved_cta' in pj) {
    const c = pj.solved_cta;
    if (!c || typeof c !== 'object' || Array.isArray(c)) out.push('solved_cta: not an object');
    else {
      for (const k of Object.keys(c)) if (!CTA_KEYS.has(k)) out.push(`solved_cta.${k}: unknown key`);
      for (const k of CTA_KEYS) if (k in c && (typeof c[k] !== 'string' || !c[k].trim())) out.push(`solved_cta.${k}: not a non-empty string`);
      for (const k of ['url_en', 'url_ja']) if (typeof c[k] === 'string' && !/^https?:\/\/[^\s]+$/i.test(c[k])) out.push(`solved_cta.${k}: not an http(s) url`);
      if (!c.label_en && !c.label_ja) out.push('solved_cta: no label');
      if (!c.url_en && !c.url_ja) out.push('solved_cta: no url');
      for (const k of ['label_en', 'label_ja']) if (typeof c[k] === 'string' && (c[k].match(/\[/g) || []).length > 1) out.push(`solved_cta.${k}: more than one [link]`);
    }
  }

  if (!lab) { out.push('expected one *.clab.yml in the folder'); return out; }
  if ('focus' in pj) {
    const f = pj.focus;
    if (!f || typeof f !== 'object' || Array.isArray(f)) out.push('focus: not an object');
    else {
      for (const k of Object.keys(f)) if (k !== 'node' && k !== 'prefix') out.push(`focus.${k}: unknown key`);
      if ('node' in f && (typeof f.node !== 'string' || !lab.nodes[f.node])) out.push(`focus.node: ${JSON.stringify(f.node)} is not in ${lab.file}`);
      if ('prefix' in f) {
        const p = parsePrefix(f.prefix);
        if (!p) out.push(`focus.prefix: ${JSON.stringify(f.prefix)} is not an IPv4 prefix (a.b.c.d/len)`);
        else if (!p.canonical) out.push(`focus.prefix: ${f.prefix} has host bits set`);
        else if (!hasPrefix(lab, p)) out.push(`focus.prefix: ${f.prefix} is not in the lab's files`);
      }
    }
  }
  if ('check' in pj) checkCheck(pj.check, lab, out);
  // addresses and prefixes named in the texts belong to this lab
  for (const k of ['title_en', 'title_ja', 'problem_en', 'problem_ja', 'check_note_en', 'check_note_ja']) {
    if (typeof pj[k] !== 'string') continue;
    for (const m of pj[k].matchAll(/(?<![\d.])(\d{1,3}(?:\.\d{1,3}){3})(\/\d{1,2})?(?![\d])/g)) {
      const p = m[2] ? parsePrefix(m[0]) : null;
      if (m[2] ? !(p && hasPrefix(lab, p)) : !hasAddr(lab, m[1])) out.push(`${k}: ${m[0]} is not in the lab's files`);
    }
  }
  return [...new Set(out)];
}

// <dir>-solved/problem.json must be <dir>/problem.json with id "…-solved"
function checkSolvedCopy(broken, solved, dirName) {
  const a = JSON.parse(JSON.stringify(broken));
  const b = JSON.parse(JSON.stringify(solved));
  if (b.id !== ID_PREFIX + dirName + '-solved') return []; // reported by checkProblem
  delete a.id; delete b.id;
  const out = [];
  for (const k of new Set([...Object.keys(a), ...Object.keys(b)])) {
    if (JSON.stringify(a[k]) !== JSON.stringify(b[k])) out.push(`${k}: differs from examples/${dirName}/problem.json`);
  }
  return out;
}

function readJson(file) {
  try { return { json: JSON.parse(fs.readFileSync(file, 'utf8')) }; } catch (e) { return { error: e.message }; }
}

function exampleDirs(root = ROOT) {
  const base = path.join(root, 'examples');
  return fs.readdirSync(base).filter((d) => fs.statSync(path.join(base, d)).isDirectory()).sort();
}

// -> [{dir, file, problems: [...]}] for every example folder (a folder without problem.json is a problem)
function checkAll(root = ROOT) {
  const res = [];
  const dirs = exampleDirs(root);
  for (const d of dirs) {
    const dir = path.join(root, 'examples', d);
    const file = path.join(dir, 'problem.json');
    const name = `examples/${d}/problem.json`;
    if (!fs.existsSync(file)) { res.push({ dir: d, file: name, problems: ['missing'] }); continue; }
    const r = readJson(file);
    if (r.error) { res.push({ dir: d, file: name, problems: [`not valid JSON: ${r.error}`] }); continue; }
    const problems = checkProblem(r.json, d, readLab(dir));
    const m = /^(.*)-solved$/.exec(d);
    if (m) {
      const bf = path.join(root, 'examples', m[1], 'problem.json');
      const b = fs.existsSync(bf) ? readJson(bf) : { error: 'missing' };
      if (b.error) problems.push(`examples/${m[1]}/problem.json (the broken lab) ${b.error}`);
      else problems.push(...checkSolvedCopy(b.json, r.json, m[1]));
    } else if (!dirs.includes(d + '-solved')) problems.push(`no examples/${d}-solved/`);
    res.push({ dir: d, file: name, problems });
  }
  return res;
}

module.exports = { checkProblem, checkSolvedCopy, checkAll, readLab, parsePrefix };

if (require.main === module) {
  const res = checkAll();
  for (const r of res) console.log(r.problems.length ? `FAIL ${r.file}: ${r.problems.join('; ')}` : `ok   ${r.file}`);
  const bad = res.filter((r) => r.problems.length).length;
  console.log(bad ? `\n${bad} of ${res.length} problem.json files have problems` : `\nall ${res.length} problem.json files OK`);
  process.exit(bad ? 1 : 0);
}
