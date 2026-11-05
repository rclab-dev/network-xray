#!/usr/bin/env node
// check-links.js — offline link check for the project's Markdown (Node built-ins only)
//
//   node scripts/check-links.js            # check, exit 1 on any problem
//   node scripts/check-links.js --root DIR # check another tree (used by the test)
//
// Files: README.md, docs/**/*.md, examples/**/README.md
//   - relative links and image paths must point to a file or folder that exists
//   - #anchors must name a heading (GitHub-style slug) or an id/name in the target Markdown
//   - external URLs (http:, https:, ...) are listed separately and never fetched
// Output: one line per problem as file:line: message, then the external URLs.
'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');

function walk(dir, pick, out) {
  let entries;
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch (e) { return out; }
  entries.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
  for (const e of entries) {
    if (e.name.startsWith('.') || e.name === 'node_modules') continue;
    const abs = path.join(dir, e.name);
    if (e.isDirectory()) walk(abs, pick, out);
    else if (e.isFile() && pick(e.name)) out.push(abs);
  }
  return out;
}

function markdownFiles(root) {
  const files = [];
  const readme = path.join(root, 'README.md');
  if (fs.existsSync(readme)) files.push(readme);
  walk(path.join(root, 'docs'), (n) => /\.md$/i.test(n), files);
  walk(path.join(root, 'examples'), (n) => n === 'README.md', files);
  return files;
}

// GitHub-style heading slug: inline markup dropped, lowercase, punctuation removed, spaces to '-'
function slug(heading) {
  return heading
    .replace(/!?\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/<[^>]+>/g, '')
    .trim().toLowerCase()
    .replace(/[^\p{L}\p{M}\p{N}\s_-]/gu, '')
    .replace(/\s/g, '-');
}

// Lines with fenced code blanked out (line numbers are kept)
function proseLines(md) {
  const lines = md.split('\n');
  let fence = null;
  return lines.map((line) => {
    const m = line.match(/^\s{0,3}(`{3,}|~{3,})/);
    if (fence) {
      if (m && m[1][0] === fence[0] && m[1].length >= fence.length && !line.trim().slice(m[1].length).trim()) fence = null;
      return '';
    }
    if (m) { fence = m[1]; return ''; }
    return line;
  });
}

function anchorsOf(md) {
  const set = new Set();
  const counts = {};
  const add = (text) => {
    const s = slug(text);
    const n = counts[s] || 0;
    counts[s] = n + 1;
    set.add(n ? `${s}-${n}` : s);
  };
  const lines = proseLines(md);
  lines.forEach((line, i) => {
    const m = line.match(/^\s{0,3}#{1,6}\s+(.*?)(?:\s+#+)?\s*$/);
    if (m) add(m[1]);
    else if (line.trim() && /^\s{0,3}(=+|-+)\s*$/.test(lines[i + 1] || '') && !/^\s*([-*+]|\d+[.)])\s/.test(line)
             && !/^\s{0,3}(=+|-+)\s*$/.test(line)) add(line);
    const re = /<[a-z][^>]*?\s(?:id|name)\s*=\s*["']([^"']+)["']/gi;
    let h;
    while ((h = re.exec(line))) set.add(h[1]);
  });
  return set;
}

const anchorCache = new Map();
function anchorsOfFile(abs) {
  if (!anchorCache.has(abs)) anchorCache.set(abs, anchorsOf(fs.readFileSync(abs, 'utf8')));
  return anchorCache.get(abs);
}

function hasAnchor(set, frag) {
  let f = frag;
  try { f = decodeURIComponent(frag); } catch (e) { /* keep raw */ }
  return set.has(f) || set.has(f.toLowerCase());
}

// Link targets on one line: [text](t), ![alt](t), [ref]: t, <a href>, <img src>, <autolink>, bare URLs
function targetsOf(line) {
  const out = [];
  const text = line.replace(/(`+)[\s\S]*?\1/g, (s) => ' '.repeat(s.length));
  const inline = /(!?)\[((?:[^\[\]]|\[[^\[\]]*\])*)\]\(\s*(<[^>]*>|(?:[^()\s]|\([^()\s]*\))*)(?:\s+(?:"[^"]*"|'[^']*'|\([^)]*\)))?\s*\)/g;
  const scan = (s) => {
    let m;
    while ((m = inline.exec(s))) {
      out.push({ target: m[3].replace(/^<|>$/g, ''), image: m[1] === '!' });
      const save = inline.lastIndex;
      scan(m[2]);
      inline.lastIndex = save;
    }
  };
  scan(text);
  const ref = text.match(/^\s{0,3}\[[^\]]+\]:\s*(<[^>]*>|\S+)/);
  if (ref) out.push({ target: ref[1].replace(/^<|>$/g, ''), image: false });
  const html = /<(a|img)\b[^>]*?\s(href|src)\s*=\s*["']([^"']*)["']/gi;
  let h;
  while ((h = html.exec(text))) out.push({ target: h[3], image: h[1].toLowerCase() === 'img' });
  const rest = text.replace(inline, ' ').replace(html, ' ').replace(/^\s{0,3}\[[^\]]+\]:.*$/, ' ');
  const bare = /<?\b(https?:\/\/[^\s<>()"'`\]]+[^\s<>()"'`\].,;:!?])/g;
  let b;
  while ((b = bare.exec(rest))) out.push({ target: b[1].replace(/[*_~]+$/, ''), image: false });
  return out;
}

function isExternal(target) {
  return /^[a-z][a-z0-9+.-]*:/i.test(target) || target.startsWith('//');
}

function checkFile(abs, root) {
  const rel = path.relative(root, abs).split(path.sep).join('/');
  const problems = [];
  const external = [];
  const md = fs.readFileSync(abs, 'utf8');
  const own = anchorsOf(md);
  proseLines(md).forEach((line, i) => {
    const where = `${rel}:${i + 1}`;
    for (const { target, image } of targetsOf(line)) {
      if (!target) { problems.push(`${where}: empty link target`); continue; }
      if (isExternal(target)) { external.push(`${where}: ${target}`); continue; }
      const hashAt = target.indexOf('#');
      const p = (hashAt < 0 ? target : target.slice(0, hashAt)).replace(/\?.*$/, '');
      const frag = hashAt < 0 ? '' : target.slice(hashAt + 1);
      if (!p) {
        if (frag && !hasAnchor(own, frag)) problems.push(`${where}: #${frag}: no such heading`);
        continue;
      }
      let decoded = p;
      try { decoded = decodeURIComponent(p); } catch (e) { /* keep raw */ }
      const dest = decoded.startsWith('/') ? path.join(root, decoded) : path.resolve(path.dirname(abs), decoded);
      const destRel = path.relative(root, dest).split(path.sep).join('/');
      if (destRel.startsWith('..')) { problems.push(`${where}: ${target}: points outside the repository`); continue; }
      if (!fs.existsSync(dest)) {
        problems.push(`${where}: ${target}: ${image ? 'image ' : ''}${destRel} does not exist`);
        continue;
      }
      if (frag && /\.md$/i.test(dest) && fs.statSync(dest).isFile() && !hasAnchor(anchorsOfFile(dest), frag)) {
        problems.push(`${where}: ${target}: no heading #${frag} in ${destRel}`);
      }
    }
  });
  return { problems, external };
}

function checkAll(root = ROOT) {
  anchorCache.clear();
  const problems = [];
  const external = [];
  const files = markdownFiles(root);
  for (const f of files) {
    const r = checkFile(f, root);
    problems.push(...r.problems);
    external.push(...r.external);
  }
  return { files, problems, external };
}

module.exports = { slug, anchorsOf, targetsOf, markdownFiles, checkFile, checkAll };

if (require.main === module) {
  const args = process.argv.slice(2);
  const i = args.indexOf('--root');
  const root = i >= 0 && args[i + 1] ? path.resolve(args[i + 1]) : ROOT;
  const { files, problems, external } = checkAll(root);
  for (const p of problems) console.log(p);
  if (external.length) {
    console.log(`\nexternal URLs (not fetched): ${external.length}`);
    for (const e of external) console.log(`  ${e}`);
  }
  console.log(`\n${files.length} files, ${problems.length} problem(s), ${external.length} external URL(s)`);
  process.exit(problems.length ? 1 : 0);
}
