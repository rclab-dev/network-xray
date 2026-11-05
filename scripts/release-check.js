#!/usr/bin/env node
// release-check.js — consistency checks before tagging a release (Node built-ins only)
//
//   node scripts/release-check.js 1.1.7                 # check the repository, exit 1 on any problem
//   node scripts/release-check.js 1.1.7 --since v1.1.6  # compare the collectors with this ref (default: the newest v* tag)
//   node scripts/release-check.js 1.1.7 --root <dir>    # check another tree (the tests use a small fixture)
//
// Checks (one line each: OK / SKIP, or FAIL with file:line):
//   - CHANGELOG(.md) has an entry for the version, and it is the newest entry
//   - every place that states the project version states this one:
//       org.opencontainers.image.version / LABEL version (Dockerfiles), VERSION= / NX_VERSION= / XRAY_VERSION=
//       (run.sh, packaging scripts, JS), "network-xray v1.2.3" / network-xray-1.2.3 (docs, demo pages, package names),
//       ghcr.io/rclab-dev/network-xray:1.2.3; a major-only image tag (network-xray:1, e.g. the netlab defaults) must be the major
//   - every example folder named in examples/README.md exists (and the lab file named in its table row)
//   - no debug output in the collectors: console.log lines that say debug / dbg / xxx / tmp, and console.log lines
//     added since the previous release (a line that is meant to stay can carry the comment `release-check: ok`)
//   - no "TODO release" left anywhere
// test/ and fixtures/ are test data: they are not read for version strings.
'use strict';
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const SKIP_DIRS = new Set(['.git', 'node_modules', 'fonts']);
const DATA_DIRS = new Set(['test', 'fixtures']);
const TEXT_EXT = new Set(['.js', '.mjs', '.cjs', '.md', '.html', '.htm', '.yml', '.yaml', '.json', '.sh', '.txt', '.cfg', '.conf', '.css', '']);
const MAX_BYTES = 2 * 1024 * 1024;
const TODO_RELEASE = new RegExp('\\bTODO\\b[\\s:(\\-]*' + 'release', 'i');   // built in two parts so this file does not match itself
const DEBUG_WORD = /\b(debug|dbg|xxx|tmp)\b/i;
const KEEP = 'release-check: ok';

const V = 'v?(\\d+\\.\\d+\\.\\d+(?:-[0-9A-Za-z.]+)?)';
const VERSION_SITES = [
  { what: 'image version label', re: new RegExp('org\\.opencontainers\\.image\\.version\\s*=\\s*["\']?' + V, 'g') },
  { what: 'version label', re: new RegExp('\\bLABEL\\s+(?:[^\\n]*\\s)?version\\s*=\\s*["\']?' + V, 'g') },
  { what: 'VERSION variable', re: new RegExp('\\b(?:NX|XRAY|NETWORK_XRAY)_VERSION\\s*[=:]\\s*["\']?' + V, 'g') },
  { what: 'VERSION variable', shell: true, re: new RegExp('^[ \\t]*(?:export[ \\t]+|ARG[ \\t]+|ENV[ \\t]+)?VERSION[= \\t][ \\t]*["\']?' + V, 'gm') },
  { what: 'image tag', re: new RegExp('network-xray:' + V + '(?![\\w.])', 'g') },
  { what: 'name and version', re: new RegExp('\\bnetwork-xray[-_ ]' + V + '(?![\\w.])', 'g') },
];
const MAJOR_TAG = /network-xray:(\d+)(?![\w.])/g;

function rel(root, abs) { return path.relative(root, abs).split(path.sep).join('/'); }

function textFiles(root) {
  const out = [];
  (function walk(dir) {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const abs = path.join(dir, e.name);
      if (e.isDirectory()) { if (!SKIP_DIRS.has(e.name)) walk(abs); continue; }
      if (!e.isFile()) continue;
      const ext = path.extname(e.name).toLowerCase();
      if (!TEXT_EXT.has(ext) && !/^Dockerfile/.test(e.name)) continue;
      if (abs === __filename || fs.statSync(abs).size > MAX_BYTES) continue;
      out.push(abs);
    }
  })(root);
  return out.sort();
}

function lineOf(text, index) { let n = 1; for (let i = 0; i < index; i++) if (text.charCodeAt(i) === 10) n++; return n; }

function findChangelog(root) {
  for (const f of ['CHANGELOG.md', 'CHANGELOG', 'docs/CHANGELOG.md']) if (fs.existsSync(path.join(root, f))) return f;
  return null;
}

function checkChangelog(root, version) {
  const f = findChangelog(root);
  if (!f) return ['SKIP CHANGELOG: no CHANGELOG.md (looked in the root and docs/; the release notes are on GitHub)'];   // network-xray keeps its notes in the GitHub releases
  const lines = fs.readFileSync(path.join(root, f), 'utf8').split('\n');
  const heads = [];
  lines.forEach((l, i) => {
    const m = l.match(/^#{1,3}\s*\[?v?(\d+\.\d+\.\d+(?:-[0-9A-Za-z.]+)?)\]?(?=[\s(—–-]|$)/);
    if (m) heads.push({ v: m[1], line: i + 1 });
  });
  const hit = heads.find((h) => h.v === version);
  if (!hit) return [`FAIL ${f}: no entry for ${version}` + (heads.length ? ` (newest: ${heads[0].v} at ${f}:${heads[0].line})` : '')];
  if (heads[0] !== hit) return [`FAIL ${f}:${hit.line}: the entry for ${version} is not the newest (${heads[0].v} at ${f}:${heads[0].line})`];
  return [`OK   ${f}:${hit.line}: entry for ${version}`];
}

function checkVersionStrings(root, files, version) {
  const out = [], seen = [], major = version.split('.')[0];
  let majors = 0;
  for (const abs of files) {
    const r = rel(root, abs);
    if (DATA_DIRS.has(r.split('/')[0])) continue;
    const text = fs.readFileSync(abs, 'utf8');
    const done = new Set();
    const shell = /\.sh$/.test(r) || /^Dockerfile/.test(path.basename(r));
    for (const site of VERSION_SITES) {
      if (site.shell && !shell) continue;
      for (const m of text.matchAll(site.re)) {
        const at = m.index + m[0].lastIndexOf(m[1]);
        if (done.has(at)) continue;
        done.add(at);
        const line = lineOf(text, at);
        if (m[1] === version) seen.push(`${r}:${line}`);
        else out.push(`FAIL ${r}:${line}: ${site.what} says ${m[1]}, not ${version}`);
      }
    }
    for (const m of text.matchAll(MAJOR_TAG)) {
      majors++;
      if (m[1] !== major) out.push(`FAIL ${r}:${lineOf(text, m.index)}: image tag network-xray:${m[1]}, the release is major ${major}`);
    }
  }
  if (!out.some((l) => / says /.test(l))) {
    out.unshift(seen.length ? `OK   version strings: ${seen.length} agree on ${version} (${seen.join(', ')})`
      : 'OK   version strings: no file states a full version');
  }
  if (!out.some((l) => /image tag network-xray:/.test(l))) out.push(`OK   major image tags: ${majors} use :${major}`);
  return out;
}

function checkExamples(root) {
  const f = 'examples/README.md', abs = path.join(root, f);
  if (!fs.existsSync(abs)) return [`FAIL ${f}: missing`];
  const out = [];
  let n = 0;
  const dirOk = (d) => fs.existsSync(path.join(root, 'examples', d)) && fs.statSync(path.join(root, 'examples', d)).isDirectory();
  fs.readFileSync(abs, 'utf8').split('\n').forEach((l, i) => {
    const at = `${f}:${i + 1}`;
    const row = l.match(/^\|\s*(`[^|]+`)\s*\|\s*`([^`|]+)`\s*\|/);
    const names = new Set();
    if (row) {
      for (const m of row[1].matchAll(/`([^`]+)`/g)) names.add(m[1]);
      for (const d of names) {
        if (dirOk(d) && !fs.existsSync(path.join(root, 'examples', d, row[2]))) out.push(`FAIL ${at}: examples/${d}/${row[2]} does not exist`);
      }
    } else {
      for (const m of l.matchAll(/`([A-Za-z0-9_.-]+)`\s*\/\s*`([A-Za-z0-9_.-]+)`/g)) { names.add(m[1]); names.add(m[2]); }
    }
    for (const m of l.matchAll(/\bexamples\/([A-Za-z0-9_.-]+)\//g)) names.add(m[1]);
    for (const d of names) { n++; if (!dirOk(d)) out.push(`FAIL ${at}: example examples/${d}/ does not exist`); }
  });
  if (!out.length) out.push(`OK   ${f}: ${n} listed examples exist`);
  return out;
}

function isCollector(r) { return !DATA_DIRS.has(r.split('/')[0]) && /collect[^/]*\.js$/.test(r); }

function checkDebugLines(root, files) {
  const out = [];
  let n = 0;
  for (const abs of files) {
    const r = rel(root, abs);
    if (!isCollector(r)) continue;
    n++;
    fs.readFileSync(abs, 'utf8').split('\n').forEach((l, i) => {
      if (/console\.log\s*\(/.test(l) && DEBUG_WORD.test(l) && !l.includes(KEEP)) out.push(`FAIL ${r}:${i + 1}: debug console.log`);
    });
  }
  if (!out.length) out.push(`OK   collectors: no debug console.log (${n} files)`);
  return out;
}

function git(root, args) { return execFileSync('git', ['-C', root].concat(args), { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }); }

function newestTag(root, version) {
  const num = (t) => t.replace(/^v/, '').split(/[.-]/).slice(0, 3).map(Number);
  // only tags in this branch's history (a v1.2.x tag on another branch is not the previous release of a v1.1.x one)
  const tags = git(root, ['tag', '--list', '--merged', 'HEAD', 'v*']).split('\n').filter((t) => /^v\d+\.\d+\.\d+$/.test(t) && t !== 'v' + version);
  tags.sort((a, b) => { const x = num(a), y = num(b); return (y[0] - x[0]) || (y[1] - x[1]) || (y[2] - x[2]); });
  return tags[0] || null;
}

// console.log lines added to the collectors since `since` (committed or not)
function checkAddedLogs(root, version, since) {
  let ref = since;
  try {
    git(root, ['rev-parse', '--git-dir']);
    if (!ref) ref = newestTag(root, version);
    if (!ref) return ['SKIP collectors: no earlier v* tag to compare with (use --since <ref>)'];
    git(root, ['rev-parse', '--verify', '--quiet', ref + '^{commit}']);
  } catch (e) {
    return [ref ? `SKIP collectors: ${ref} is not available in this clone` : 'SKIP collectors: not a git checkout, no earlier release to compare with'];
  }
  // --no-textconv: never run a converter configured for these files; core.quotePath=false: non-ASCII file names unquoted
  const diff = git(root, ['-c', 'core.quotePath=false', 'diff', '--unified=0', '--no-color', '--no-ext-diff', '--no-textconv', ref, '--', '*.js']);
  const out = [];
  let file = null, line = 0;
  for (const l of diff.split('\n')) {
    let m;
    if ((m = l.match(/^\+\+\+ (?:b\/)?(.*)$/))) { file = m[1] === '/dev/null' ? null : m[1]; continue; }
    if ((m = l.match(/^@@ -\S+ \+(\d+)/))) { line = Number(m[1]); continue; }
    if (l.startsWith('+') && file) {
      if (isCollector(file) && /console\.log\s*\(/.test(l) && !l.includes(KEEP)) out.push(`FAIL ${file}:${line}: console.log added since ${ref}`);
      line++;
    }
  }
  if (!out.length) out.push(`OK   collectors: no console.log added since ${ref}`);
  return out;
}

function checkTodo(root, files) {
  const out = [];
  for (const abs of files) {
    const r = rel(root, abs);
    if (DATA_DIRS.has(r.split('/')[0])) continue;   // test data (this check's own tests write the words on purpose)
    fs.readFileSync(abs, 'utf8').split('\n').forEach((l, i) => { if (TODO_RELEASE.test(l)) out.push(`FAIL ${r}:${i + 1}: TODO release`); });
  }
  if (!out.length) out.push('OK   no TODO release');
  return out;
}

function run(version, opts = {}) {
  const root = path.resolve(opts.root || path.join(__dirname, '..'));
  version = String(version || '').replace(/^v/, '');
  if (!/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.]+)?$/.test(version)) return [`FAIL version: "${version}" is not like 1.2.3`];
  const files = textFiles(root);
  return [].concat(
    checkChangelog(root, version),
    checkVersionStrings(root, files, version),
    checkExamples(root),
    checkDebugLines(root, files),
    checkAddedLogs(root, version, opts.since),
    checkTodo(root, files));
}

function main(argv) {
  const opts = {}, rest = [];
  let bad = false;
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--root' || argv[i] === '--since') {
      if (i + 1 >= argv.length) bad = true;
      else opts[argv[i].slice(2)] = argv[++i];
    } else if (argv[i].startsWith('-')) bad = true;
    else rest.push(argv[i]);
  }
  const version = rest[0];
  if (bad || rest.length !== 1) {
    console.error('usage: node scripts/release-check.js <version, e.g. 1.1.7> [--since <ref>] [--root <dir>]');
    return 2;
  }
  const lines = run(version, opts);
  for (const l of lines) console.log(l);
  return lines.some((l) => l.startsWith('FAIL')) ? 1 : 0;
}

if (require.main === module) process.exitCode = main(process.argv.slice(2));

module.exports = { run, main, checkChangelog, checkVersionStrings, checkExamples, checkDebugLines, checkAddedLogs, checkTodo };
