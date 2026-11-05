#!/usr/bin/env node
// check-solved-pairs.js — each examples/<name> and its examples/<name>-solved must differ only by the fix
// (Node built-ins only)
//
//   node scripts/check-solved-pairs.js     # check every pair, exit 1 on any problem
//
// For every examples/<name> that has an examples/<name>-solved:
//   - both folders hold the same files (README.md aside)
//   - every other file (topology, router configs, daemons, problem.json) has the same lines,
//     after: `<name>-solved` is read as `<name>`, blank lines and comment lines (`!`, `#`) are dropped,
//     and lines are trimmed (a `daemons` file is name=value lines, so its lines are compared in any order)
//   - each remaining removed / added line is listed for that pair and file in
//     scripts/solved-pairs-allow.json (the documented fix); allowlist lines that no longer
//     appear in the diff are reported too, so the list stays exact
// An examples/<name>-solved folder without examples/<name> is reported.
'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const ALLOW_FILE = path.join(__dirname, 'solved-pairs-allow.json');
const SKIP = new Set(['README.md']);

function listFiles(dir, rel = '') {
  const out = [];
  for (const e of fs.readdirSync(path.join(dir, rel), { withFileTypes: true })) {
    const r = rel ? `${rel}/${e.name}` : e.name;
    if (e.isDirectory()) out.push(...listFiles(dir, r));
    else if (e.isFile() && !SKIP.has(r)) out.push(r);
  }
  return out.sort();
}

function escapeRe(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }

// lines that matter for a comparison: trimmed, no blank lines, no comment lines
function normLines(text, base) {
  if (base) text = text.replace(new RegExp(escapeRe(base) + '-solved', 'g'), base);
  return text.split(/\r?\n/).map((l) => l.trim()).filter((l) => l && !/^[!#]/.test(l));
}

// line diff (LCS): { removed: [...lines only in a], added: [...lines only in b] }
function diffLines(a, b) {
  const n = a.length, m = b.length;
  const dp = Array.from({ length: n + 1 }, () => new Uint32Array(m + 1));
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      dp[i][j] = a[i] === b[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
    }
  }
  const removed = [], added = [];
  let i = 0, j = 0;
  while (i < n && j < m) {
    if (a[i] === b[j]) { i++; j++; }
    else if (dp[i + 1][j] >= dp[i][j + 1]) removed.push(a[i++]);
    else added.push(b[j++]);
  }
  while (i < n) removed.push(a[i++]);
  while (j < m) added.push(b[j++]);
  return { removed, added };
}

// take each allowed line once; return what is left on both sides
function subtract(lines, allowed) {
  const left = allowed.slice();
  const rest = [];
  for (const l of lines) {
    const k = left.indexOf(l);
    if (k >= 0) left.splice(k, 1); else rest.push(l);
  }
  return { rest, unused: left };
}

function pairs(examplesDir) {
  const dirs = fs.readdirSync(examplesDir, { withFileTypes: true }).filter((e) => e.isDirectory()).map((e) => e.name);
  const set = new Set(dirs);
  const out = [], orphans = [];
  for (const d of dirs.sort()) {
    if (!d.endsWith('-solved')) continue;
    const base = d.slice(0, -'-solved'.length);
    if (set.has(base)) out.push(base); else orphans.push(d);
  }
  return { pairs: out, orphans };
}

function checkPair(examplesDir, base, allow = {}) {
  const problems = [];
  const a = path.join(examplesDir, base), b = path.join(examplesDir, `${base}-solved`);
  const fa = listFiles(a), fb = listFiles(b);
  const sb = new Set(fb), sa = new Set(fa);
  for (const f of fa) if (!sb.has(f)) problems.push(`${f}: missing in ${base}-solved`);
  for (const f of fb) if (!sa.has(f)) problems.push(`${f}: only in ${base}-solved`);
  const allowFiles = (allow && allow.files) || {};
  for (const f of fa) {
    if (!sb.has(f)) continue;
    const la = normLines(fs.readFileSync(path.join(a, f), 'utf8'), null);
    const lb = normLines(fs.readFileSync(path.join(b, f), 'utf8'), base);
    if (path.basename(f) === 'daemons') { la.sort(); lb.sort(); }   // FRR's daemons: the order of the lines does not matter
    const d = diffLines(la, lb);
    const al = allowFiles[f] || {};
    const r = subtract(d.removed, al.removed || []);
    const ad = subtract(d.added, al.added || []);
    for (const l of r.rest) problems.push(`${f}: - ${l}`);
    for (const l of ad.rest) problems.push(`${f}: + ${l}`);
    for (const l of r.unused) problems.push(`${f}: allowlisted removal not in the diff: ${l}`);
    for (const l of ad.unused) problems.push(`${f}: allowlisted addition not in the diff: ${l}`);
  }
  for (const f of Object.keys(allowFiles)) {
    if (!sa.has(f) || !sb.has(f)) problems.push(`${f}: allowlisted but not in both folders`);
  }
  return problems;
}

function loadAllow(file = ALLOW_FILE) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

// { "<name>": [problems] } for every pair with problems (and "<name>-solved" for orphans)
function checkAll(root = ROOT, allow = loadAllow()) {
  const examplesDir = path.join(root, 'examples');
  const result = {};
  const p = pairs(examplesDir);
  for (const base of p.pairs) {
    const probs = checkPair(examplesDir, base, allow[base]);
    if (probs.length) result[base] = probs;
  }
  for (const o of p.orphans) result[o] = [`no ${o.slice(0, -'-solved'.length)} folder for this -solved folder`];
  for (const k of Object.keys(allow)) {
    if (!p.pairs.includes(k)) (result[k] = result[k] || []).push('allowlist entry for a pair that does not exist');
  }
  return result;
}

module.exports = { normLines, diffLines, listFiles, pairs, checkPair, checkAll, loadAllow };

if (require.main === module) {
  const result = checkAll();
  const names = Object.keys(result);
  for (const n of names) for (const p of result[n]) console.log(`examples/${n}: ${p}`);
  const total = pairs(path.join(ROOT, 'examples')).pairs.length;
  console.log(names.length ? `\n${names.length} of ${total} pairs have problems` : `all ${total} broken/solved pairs differ only by the listed fix`);
  process.exit(names.length ? 1 : 0);
}
