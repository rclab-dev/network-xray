#!/usr/bin/env node
// check-doc-commands.js — check that the commands shown in the docs match the scripts (Node built-ins only)
//
//   node scripts/check-doc-commands.js            # check, exit 1 on any problem
//   node scripts/check-doc-commands.js --root DIR # check another tree (used by the test)
//
// Files: README.md, docs/**/*.md, examples/**/README.md (the same set as check-links.js)
// Where: shell code blocks (sh, bash, shell, console, zsh or no language) and inline `code`.
// Commands: xray.sh, node <script>.js (also <script>.js --option on its own), docker run ... network-xray
//   - the script must exist in the tree (paths are tried from the root, then from the Markdown file's folder;
//     a leading <placeholder>/, $VAR/ or .../network-xray/ part is dropped)
//   - every --option must be one the script parses:
//       shell: case labels (--x) / --x=*) ) and [ "$1" = --x ] tests
//       JS:    '--x' string literals, /^--x=/ regexes, _cliCheck(argv, ['x', ...]) lists and
//              reads of a _argMap() result (a.x, a['x'])
//     docker run options after the image are checked against docker/entrypoint.sh
// Output: one line per problem as file:line: message.
'use strict';
const fs = require('fs');
const path = require('path');
const { markdownFiles } = require('./check-links.js');

const ROOT = path.resolve(__dirname, '..');
const SHELL_LANGS = new Set(['', 'sh', 'bash', 'shell', 'console', 'zsh', 'sh-session', 'shell-session']);
const DOCKER_FLAGS = new Set(['--rm', '-d', '--detach', '-i', '--interactive', '-t', '--tty', '-it', '-ti', '--init',
  '--privileged', '--read-only', '-P', '--publish-all']);

// ---- what a script accepts -------------------------------------------------------------------

// JS source with comments blanked out (strings, template literals and regexes kept)
function stripJsComments(src) {
  let out = '';
  let i = 0;
  let prev = '';   // last non-space character outside comments
  while (i < src.length) {
    const c = src[i];
    const d = src[i + 1];
    if (c === '/' && d === '/') { while (i < src.length && src[i] !== '\n') i++; continue; }
    if (c === '/' && d === '*') {
      const end = src.indexOf('*/', i + 2);
      const stop = end < 0 ? src.length : end + 2;
      out += src.slice(i, stop).replace(/[^\n]/g, ' ');
      i = stop;
      continue;
    }
    if (c === '"' || c === "'" || c === '`' || (c === '/' && (prev === '' || /[(,=:[!&|?{};+\-*%<>~^]/.test(prev)))) {
      let j = i + 1;
      let cls = false;
      while (j < src.length) {
        const e = src[j];
        if (e === '\\') { j += 2; continue; }
        if (c === '/') {
          if (e === '\n') break;
          if (e === '[') cls = true;
          else if (e === ']') cls = false;
          else if (e === '/' && !cls) break;
        } else if (e === c) break;
        else if (e === '\n' && c !== '`') break;
        j++;
      }
      out += src.slice(i, j + 1);
      prev = c;
      i = j + 1;
      continue;
    }
    out += c;
    if (!/\s/.test(c)) prev = c;
    i++;
  }
  return out;
}

function addOpt(acc, raw) {
  const m = raw.match(/^(--[A-Za-z0-9][A-Za-z0-9_-]*)(=)?/);
  if (!m) return;
  if (m[2]) acc.eq.add(m[1]);
  else acc.names.add(m[1]);
}

function jsOptions(src) {
  const acc = { names: new Set(), eq: new Set() };
  const code = stripJsComments(src);
  let m;
  const lit = /(['"])(--[A-Za-z0-9][A-Za-z0-9_-]*=?)\1/g;
  while ((m = lit.exec(code))) addOpt(acc, m[2]);
  const re = /\/\^(--[A-Za-z0-9][A-Za-z0-9_-]*=)/g;
  while ((m = re.exec(code))) addOpt(acc, m[1]);
  const known = /_cliCheck\([^,]*,\s*\[([^\]]*)\]/g;
  while ((m = known.exec(code))) {
    for (const n of m[1].match(/(['"])[A-Za-z0-9][A-Za-z0-9_-]*\1/g) || []) acc.names.add('--' + n.slice(1, -1));
  }
  const map = /\b(?:var|let|const)\s+([A-Za-z_$][\w$]*)\s*=\s*_argMap\(/g;
  while ((m = map.exec(code))) {
    const v = m[1].replace(/\$/g, '\\$');
    // reads from this declaration up to the next declaration of the same name
    const after = code.slice(map.lastIndex);
    const next = after.search(new RegExp('\\b(?:var|let|const)\\s+' + v + '\\b'));
    const scope = next < 0 ? after : after.slice(0, next);
    const read = new RegExp('(?:^|[^\\w$.])' + v + "(?:\\.([A-Za-z_][\\w]*)|\\[(['\"])([A-Za-z0-9_-]+)\\2\\])", 'g');
    let r;
    while ((r = read.exec(scope))) acc.names.add('--' + (r[1] || r[3]));
  }
  return acc;
}

function shOptions(src) {
  const acc = { names: new Set(), eq: new Set() };
  for (const line of src.split('\n')) {
    const code = line.replace(/(^|\s)#.*$/, '');
    const c = code.match(/^\s*\(?\s*(-[^\s)]*(?:\s*\|\s*-[^\s)]*)*)\s*\)/);
    if (c) {
      for (const p of c[1].split('|')) {
        const t = p.trim();
        if (/^--[A-Za-z0-9][A-Za-z0-9_-]*=\*$/.test(t)) acc.eq.add(t.slice(0, t.indexOf('=')));
        else if (/^--[A-Za-z0-9][A-Za-z0-9_-]*$/.test(t)) acc.names.add(t);
      }
    }
    const re = /\s==?\s+["']?(--[A-Za-z0-9][A-Za-z0-9_-]*)["']?\s/g;
    let m;
    while ((m = re.exec(code))) acc.names.add(m[1]);
  }
  return acc;
}

function scriptOptions(abs, cache) {
  if (cache.has(abs)) return cache.get(abs);
  let acc = null;
  try {
    const src = fs.readFileSync(abs, 'utf8');
    acc = /\.js$/.test(abs) ? jsOptions(src) : shOptions(src);
  } catch (e) { acc = null; }
  cache.set(abs, acc);
  return acc;
}

// ---- commands in the Markdown ----------------------------------------------------------------

// {line, text} for each shell code line (continuations joined) and each inline code span
function snippets(md) {
  const out = [];
  const lines = md.split('\n');
  let fence = null;
  let shell = false;
  let pending = null;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const m = line.match(/^\s*(`{3,}|~{3,})\s*([^\s`{]*)/);
    if (fence) {
      if (m && m[1][0] === fence[0] && m[1].length >= fence.length && !line.trim().slice(m[1].length).trim()) {
        if (pending) out.push(pending);
        fence = null; pending = null;
        continue;
      }
      if (!shell) continue;
      let t = line.replace(/^\s*(?:\$|#|>)\s+(?=\S)/, (p) => (/#/.test(p) ? '#' : ''));   // drop a "$ " prompt
      if (/^\s*#/.test(t)) { if (pending) { out.push(pending); pending = null; } continue; }
      const cont = /\\\s*$/.test(t);
      t = t.replace(/\\\s*$/, ' ');
      if (pending) pending.text += ' ' + t;
      else pending = { line: i + 1, text: t };
      if (!cont) { out.push(pending); pending = null; }
      continue;
    }
    if (m) { fence = m[1]; shell = SHELL_LANGS.has(m[2].toLowerCase()); continue; }
    const re = /(`+)([^`]|[^`][\s\S]*?[^`])\1(?!`)/g;
    let s;
    while ((s = re.exec(line))) out.push({ line: i + 1, text: s[2].trim() });
  }
  if (pending) out.push(pending);
  return out;
}

// shell-ish words; quotes removed, a trailing unquoted # comment dropped, split into simple commands
function commands(text) {
  const cmds = [[]];
  let word = null;
  let quoted = false;   // nx_doc_cmd_pos: a word with quotes is a value, not an option
  let i = 0;
  const end = () => { if (word !== null) { cmds[cmds.length - 1].push(quoted ? QUOTED + word : word); word = null; quoted = false; } };
  while (i < text.length) {
    const c = text[i];
    if (c === "'" || c === '"') {
      const j = text.indexOf(c, i + 1);
      const stop = j < 0 ? text.length : j;
      word = (word || '') + text.slice(i + 1, stop);
      quoted = true;
      i = stop + 1;
      continue;
    }
    if (/\s/.test(c)) { end(); i++; continue; }
    if (c === '#' && word === null) break;
    if (c === '|' || c === ';' || c === '&' || c === '(' || c === ')') {
      end();
      if (cmds[cmds.length - 1].length) cmds.push([]);
      i++;
      continue;
    }
    if (c === '$' && text[i + 1] === '(') {   // keep $(...) as part of the word
      const j = text.indexOf(')', i);
      const stop = j < 0 ? text.length : j + 1;
      word = (word || '') + text.slice(i, stop);
      i = stop;
      continue;
    }
    word = (word || '') + c;
    i++;
  }
  end();
  return cmds.filter((c) => c.length);
}

const QUOTED = '\u0001';   // nx_doc_cmd_pos: put in front of a word that had quotes
const bare = (w) => (w[0] === QUOTED ? w.slice(1) : w);
// nx_doc_cmd_pos: words that may stand before the command itself (VAR=value, sudo, env, ...)
const PREFIX_WORDS = new Set(['sudo', 'env', 'exec', 'time', 'nohup', 'command', 'bash', 'sh']);
const atStart = (words, k) => words.slice(0, k).every((w) => /^[A-Za-z_][A-Za-z0-9_]*=/.test(bare(w)) || PREFIX_WORDS.has(bare(w)));

const isPlaceholder = (seg) => /^<[^>]*>$/.test(seg) || /^[$~]/.test(seg) || seg === '…' || seg === '...';

// the script's path inside the tree, or null when the path is not one of this repo's (e.g. /usr/bin/x.js)
function repoPath(p) {
  const segs = p.split('/');
  let start = 0;
  segs.forEach((s, k) => { if (isPlaceholder(s) || s === 'network-xray') start = k + 1; });
  const rest = segs.slice(start);
  if (!rest.length || rest.some((s) => /[<>$*]/.test(s))) return null;
  if (start === 0 && p.startsWith('/')) return null;
  return rest.join('/');
}

function locate(root, docDir, rel) {
  for (const base of [root, docDir]) {
    const abs = path.resolve(base, rel);
    if (abs.startsWith(root + path.sep) && fs.existsSync(abs) && fs.statSync(abs).isFile()) return abs;
  }
  return null;
}

// [{script, args, docker}] found in one simple command
function invocations(rawWords) {
  const out = [];
  const words = rawWords.map(bare);
  for (let k = 0; k < words.length; k++) {
    const w = words[k];
    if (!atStart(words, k)) break;   // nx_doc_cmd_pos: `echo ./xray.sh …` / `grep xray.sh …` do not run it
    if (w === 'node') {
      let j = k + 1;
      while (j < words.length && /^-/.test(words[j])) {
        if (/^(-e|-p|--eval|--print|-)$/.test(words[j])) { j = words.length; break; }
        j++;
      }
      if (j < words.length && /\.js$/.test(words[j])) { out.push({ script: words[j], args: rawWords.slice(j + 1) }); k = words.length; }
    } else if (/(^|\/)xray\.sh$/.test(w)) {
      out.push({ script: w, args: rawWords.slice(k + 1) });
      k = words.length;
    } else if (k === 0 && /^[\w./<>-]*[\w-]\.js$/.test(w) && words.slice(1).some((a) => /^--[A-Za-z0-9]/.test(a))) {
      out.push({ script: w, args: rawWords.slice(1) });
      k = words.length;
    } else if (w === 'docker' && words[k + 1] === 'run') {
      for (let j = k + 2; j < words.length; j++) {
        const a = words[j];
        if (/^-/.test(a)) {
          if (!DOCKER_FLAGS.has(a) && !a.includes('=')) j++;   // the option's value
          continue;
        }
        if (a === '…' || a === '...') continue;
        if (/^(?:[\w.-]+(?::\d+)?\/)*network-xray(?::[\w.-]+)?(?:@sha256:[0-9a-f]+)?$/.test(a)) {
          out.push({ script: 'docker/entrypoint.sh', args: rawWords.slice(j + 1), docker: a });
        }
        break;
      }
      k = words.length;
    }
  }
  return out;
}

function checkFile(root, file, cache) {
  const problems = [];
  const rel = path.relative(root, file).split(path.sep).join('/');
  const md = fs.readFileSync(file, 'utf8');
  for (const sn of snippets(md)) {
    for (const words of commands(sn.text)) {
      for (const inv of invocations(words)) {
        const where = `${rel}:${sn.line}`;
        const shown = inv.docker ? `docker run ${inv.docker}` : inv.script;
        const relScript = inv.docker ? inv.script : repoPath(inv.script);
        if (relScript === null) continue;
        const abs = locate(root, path.dirname(file), relScript);
        if (!abs) {
          problems.push(`${where}: ${shown}: script not found (${relScript})`);
          continue;
        }
        const acc = scriptOptions(abs, cache);
        if (!acc) continue;
        for (const a of inv.args) {
          if (a === '--') break;
          if (a[0] === QUOTED || !/^--[A-Za-z0-9]/.test(a) || /[<>]/.test(a)) continue;   // nx_doc_cmd_pos: a quoted word is a value
          const eq = a.indexOf('=');
          const name = eq < 0 ? a : a.slice(0, eq);
          const scriptRel = path.relative(root, abs).split(path.sep).join('/');
          if (!acc.names.has(name) && !acc.eq.has(name)) problems.push(`${where}: ${shown}: unknown option ${name} (not parsed by ${scriptRel})`);
          else if (eq >= 0 && !acc.eq.has(name)) problems.push(`${where}: ${shown}: ${name}=<value> form not parsed by ${scriptRel} (use ${name} <value>)`);
        }
      }
    }
  }
  return problems;
}

function checkAll(root) {
  root = path.resolve(root || ROOT);
  const cache = new Map();
  const problems = [];
  for (const f of markdownFiles(root)) problems.push(...checkFile(root, f, cache));
  return problems;
}

module.exports = { stripJsComments, jsOptions, shOptions, snippets, commands, invocations, repoPath, checkFile, checkAll };

if (require.main === module) {
  const args = process.argv.slice(2);
  if (args.includes('-h') || args.includes('--help')) {
    console.log('usage: node scripts/check-doc-commands.js [--root DIR]\n' +
      '  check that the commands in README.md, docs/**/*.md and examples/**/README.md run scripts that exist,\n' +
      '  with options those scripts parse\n' +
      '  --root DIR   check another tree (default: this repository)\n' +
      '  -h, --help   show this help');
    process.exit(0);
  }
  let root = ROOT;
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--root' && i + 1 < args.length) root = args[++i];
    else {
      console.error(`check-doc-commands.js: unknown option: ${args[i]}\nTry 'node scripts/check-doc-commands.js --help'.`);
      process.exit(2);
    }
  }
  const problems = checkAll(root);
  for (const p of problems) console.log(p);
  if (problems.length) {
    console.log(`check-doc-commands: ${problems.length} problem(s)`);
    process.exit(1);
  }
  console.log('check-doc-commands: OK');
}
