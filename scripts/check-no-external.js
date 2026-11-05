#!/usr/bin/env node
// check-no-external.js — a lint for the known ways a served page or a user-run script could reach a host outside the
// user's machine. It reads the source text: it is a check for the usual patterns, not a proof that nothing is ever sent
// (a URL built in a variable, for example, is not followed). What the tool does connect to is listed in docs/network.md.
// (Node built-ins only)
//
//   node scripts/check-no-external.js         # scan, exit 1 on any problem
//
// Scanned: .html .htm .js .mjs .cjs .css .svg .json .yml .yaml .txt .sh and Dockerfile files
// (not test/, fixtures/, .github/ or node_modules/). Markdown files get the load rules only (their
// links are plain links the reader clicks).
//
// Rules:
//   1. every absolute URL (http, https, ws, wss, ftp) names a local host or a host in LINK_HOSTS
//      (plain hyperlinks the user clicks, and identifiers that are never fetched);
//   2. no absolute or protocol-relative URL is loaded: src= / srcset= / poster= / <link href> / CSS url()
//      and @import / fetch() / XMLHttpRequest.open() / WebSocket / EventSource / sendBeacon /
//      importScripts / import() / curl / wget / git clone, and no URL of a script, style, font, media or
//      image file, unless listed in EXCEPTIONS (file + URL + why);
//   3. no analytics or tracking snippet.
'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');

// Hosts that may appear as plain hyperlinks (or as identifiers that nothing fetches). Exact host match.
const LINK_HOSTS = {
  'github.com': 'project repository links',
  'rclab-dev.github.io': 'project pages (recorded demo, paste page)',
  'routecrushlab.com': 'project site links (problem links, guest CTA, badge)',
  'codespaces.new': 'link that opens a Codespace of the repository',
  'www.rfc-editor.org': 'RFC reference links',
  'containerlab.dev': 'install hint printed by xray.sh',
  'docs.docker.com': 'Docker permission hint printed by xray.sh',
  'nodejs.org': 'Node.js install hint printed by xray.sh',
  'netlab.tools': 'reference in a code comment',
  'json-schema.org': '$schema identifier (not fetched)',
  'www.w3.org': 'XML namespace / DTD identifiers (not fetched)',
  'tailwindcss.com': 'license banner of the vendored stylesheet',
  // reference comments in the vendored js/next.js
  'javascript.nwbox.com': 'reference comment in js/next.js',
  'en.wikipedia.org': 'reference comment in js/next.js',
  'dev.chromium.org': 'reference comment in js/next.js',
  'webstuff.nfshost.com': 'reference comment in js/next.js',
  'developer.mozilla.org': 'reference comment in js/next.js',
  'www.timotheegroleau.com': 'reference comment in js/next.js',
};

// Loads that are allowed in one file only: file (repo-relative, '/') + URL prefix + why.
const EXCEPTIONS = [
  { file: 'xray-graph-nextui.html', url: 'https://routecrushlab.com/static/pip/',
    why: 'preview video, requested only after the user presses the Preview button' },
  { file: 'docker/Dockerfile', url: 'https://github.com/srl-labs/containerlab/releases/download/',
    why: 'pinned containerlab release, downloaded by docker build' },
  { file: 'js/next.js', url: 'https://github.com/yui/yui3/blob/',
    why: 'reference comment (a page link, not a load)' },
];

const SCAN_EXT = new Set(['.html', '.htm', '.js', '.mjs', '.cjs', '.css', '.svg', '.json', '.yml', '.yaml', '.txt', '.sh']);
const SKIP_DIRS = new Set(['.git', 'node_modules', 'test', 'fixtures', '.github']);
const SELF = 'scripts/check-no-external.js';

function isLocalHost(h) {
  h = h.toLowerCase().replace(/^\[|\]$/g, '');
  if (h === 'localhost' || h === '0.0.0.0' || h === '::' || h === '::1') return true;
  if (/^127\.\d+\.\d+\.\d+$/.test(h)) return true;
  // "local" = this machine only. A private address (10/8, 172.16/12, 192.168/16) or a .local name can be another
  // machine on the LAN: not local here. Names that never resolve on the internet (RFC 6761 / 2606) are not hosts at all.
  if (/\.(localhost|test|example|invalid)$/.test(h)) return true;
  return /^(.+\.)?example\.(com|net|org)$/.test(h);
}

const URL_RE = /\b(?:https?|wss?|ftp):\/\/([^\s/"'`<>()\\?#]+)/gi;
const U = String.raw`(?:(?:https?|wss?|ftp):)?\/\/[A-Za-z0-9\[]`;   // absolute or protocol-relative URL start
const LOAD_RES = [
  ['loads an external resource (src/srcset/poster)', new RegExp(String.raw`\b(?:src|srcset|poster|background|formaction|ping|manifest)\s*=\s*["'\x60]?\s*` + U, 'gi')],
  ['loads an external resource (setAttribute src)', new RegExp(String.raw`setAttribute\(\s*["'](?:src|srcset|poster)["']\s*,\s*["'\x60]` + U, 'gi')],
  ['loads an external resource (<link href>)', new RegExp(String.raw`<link\b[^>]*?\bhref\s*=\s*["']?\s*` + U, 'gi')],
  ['loads an external resource (CSS url()/@import)', new RegExp(String.raw`(?:\burl\(\s*["']?\s*|@import\s+["']\s*)` + U, 'gi')],
  ['makes an external request (fetch/WebSocket/EventSource/sendBeacon/import)', new RegExp(String.raw`\b(?:fetch|WebSocket|EventSource|sendBeacon|importScripts|import)\s*\(\s*["'\x60]` + U, 'gi')],
  ['starts a script from an external host (Worker / SharedWorker)', new RegExp(String.raw`\bnew\s+(?:Shared)?Worker\s*\(\s*["'\x60]` + U, 'gi')],
  ['makes an external request (XMLHttpRequest.open)', new RegExp(String.raw`\.open\(\s*["'][A-Za-z]+["']\s*,\s*["'\x60]` + U, 'gi')],
];
const SHELL_RE = new RegExp(String.raw`\b(?:curl|wget|git\s+clone)\b[^\n]*?(` + U + ')', 'gi');
const ASSET_RE = /\b(?:https?:)?\/\/[^\s"'`<>()\\]+?\.(?:m?js|css|woff2?|ttf|otf|eot|webm|mp4|m4v|mov|mp3|ogg|wav|png|jpe?g|gif|webp|avif|svg|ico|wasm)(?=[?#"'`\s)<>]|$)/gi;
const TRACKER_RE = /googletagmanager|google-analytics|\bgtag\s*\(|\b_gaq\b|\bga\s*\(\s*['"]send|plausible\.io|cloudflareinsights|cdn\.segment|mixpanel|hotjar|clarity\.ms|posthog|sentry\.io|@sentry\/|navigator\.sendBeacon|matomo|umami\.is|doubleclick|facebook\.net\/|connect\.facebook/gi;

function lineOf(text, idx) { let n = 1; for (let i = 0; i < idx; i++) if (text.charCodeAt(i) === 10) n++; return n; }

function urlAt(text, idx) {
  const m = /(?:(?:https?|wss?|ftp):)?\/\/[^\s"'`<>()\\]+/i.exec(text.slice(idx, idx + 2048));
  return m ? m[0] : '';
}

function excepted(rel, url) {
  if (/^\/\//.test(url)) url = 'https:' + url;
  return EXCEPTIONS.some((e) => e.file === rel && url.indexOf(e.url) === 0);
}

// Problems of one file's text, as "line N: ..." strings. rel = repo-relative path with '/'.
function scanText(rel, text) {
  const out = [];
  const md = /\.md$/i.test(rel);
  if (!md) {
    URL_RE.lastIndex = 0;
    let m;
    while ((m = URL_RE.exec(text))) {
      let host = m[1].replace(/^[^@]*@/, '').replace(/[.,;:]+$/, '');
      if (/[${}<>%*]/.test(host) || !host) continue;           // template / placeholder, not a host
      host = host.replace(/:\d*$/, '').toLowerCase();
      if (isLocalHost(host) || LINK_HOSTS[host] || excepted(rel, m[0])) continue;
      out.push(`line ${lineOf(text, m.index)}: external host ${host} (${m[0]}) is not in LINK_HOSTS`);
    }
  }
  const seen = new Set();
  const hit = (why, idx, url) => {
    if (!url || excepted(rel, url)) return;
    const rest = url.replace(/^[a-z]*:?\/\//i, ''), v6 = /^\[([^\]]+)\]/.exec(rest);   // [::1]:8080 - the host is inside the brackets
    const host = v6 ? v6[1] : rest.split(/[/:?#]/)[0];
    if (isLocalHost(host)) return;
    const k = idx + '|' + url;
    if (seen.has(k)) return;
    seen.add(k);
    out.push(`line ${lineOf(text, idx)}: ${why}: ${url}`);
  };
  for (const [why, re] of LOAD_RES) {
    re.lastIndex = 0;
    let m;
    while ((m = re.exec(text))) { const at = m.index + m[0].search(/(?:(?:https?|wss?|ftp):)?\/\/[A-Za-z0-9[]$/); hit(why, at, urlAt(text, at)); }
  }
  if (/\.sh$/.test(rel) || /(^|\/)Dockerfile[^/]*$/.test(rel)) {
    SHELL_RE.lastIndex = 0;
    let m;
    while ((m = SHELL_RE.exec(text))) { const at = m.index + m[0].length - m[1].length; hit('downloads from an external host', at, urlAt(text, at)); }
  }
  if (!md) {
    ASSET_RE.lastIndex = 0;
    let m;
    while ((m = ASSET_RE.exec(text))) hit('references an external script/style/font/media file', m.index, m[0]);
  }
  TRACKER_RE.lastIndex = 0;
  let t;
  while ((t = TRACKER_RE.exec(text))) out.push(`line ${lineOf(text, t.index)}: analytics/tracking code (${t[0]})`);
  return out;
}

function listFiles(root = ROOT) {
  const out = [];
  (function walk(dir) {
    for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
      const abs = path.join(dir, ent.name);
      const rel = path.relative(root, abs).split(path.sep).join('/');
      if (ent.isDirectory()) { if (!SKIP_DIRS.has(ent.name)) walk(abs); continue; }
      if (!ent.isFile() || rel === SELF) continue;
      const ext = path.extname(ent.name).toLowerCase();
      if (SCAN_EXT.has(ext) || ext === '.md' || /^Dockerfile/.test(ent.name)) out.push(rel);
    }
  })(root);
  return out.sort();
}

function checkAll(root = ROOT) {
  const result = {};
  for (const rel of listFiles(root)) {
    const p = scanText(rel, fs.readFileSync(path.join(root, rel), 'utf8'));
    if (p.length) result[rel] = p;
  }
  return result;
}

module.exports = { LINK_HOSTS, EXCEPTIONS, isLocalHost, scanText, listFiles, checkAll };

if (require.main === module) {
  const result = checkAll();
  const files = Object.keys(result);
  for (const f of files) for (const p of result[f]) console.log(`${f}: ${p}`);
  const n = listFiles().length;
  console.log(files.length ? `\n${files.length} of ${n} files reference external hosts` : `all ${n} files OK (no external loads of the known kinds outside the listed EXCEPTIONS; links only to allowed hosts)`);
  process.exit(files.length ? 1 : 0);
}
