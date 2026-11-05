#!/usr/bin/env node
/* check-i18n.js — English / Japanese UI string parity.
 *   usage: node scripts/check-i18n.js [--verbose]
 *     --verbose : also list the warnings (dictionary keys never used, keys with no Japanese)
 * Exit 0 = parity OK, 1 = at least one error (printed as file:line).
 *
 * Three mechanisms are checked:
 *  1. Page toggle tables (xray-graph.html, xray-graph-nextui.html, decision-bracket.html):
 *     `var I18N = { en: {...}, ja: {...} }`, read through [data-i18n] elements or `T.<key>`.
 *     Error: a used key with no English or no Japanese entry, a key present in one language only,
 *     or placeholders ({name}, %s, ${x}) that differ between the two.
 *  2. The engine dictionary (xray-i18n.js): window.xrayI18n maps the engine's Japanese UI text to English;
 *     xray-api.js replaces it in the DOM at runtime. Error: a Japanese string literal in an engine file
 *     that still has Japanese left after the dictionary is applied (no English entry), or a dictionary
 *     value that is empty or still Japanese. Literals in a statement that already picks a language
 *     (`ja ? '…' : '…'`, `_xrayLang === "en" ? …`) and console.* messages are skipped.
 *     Error: placeholders that differ between a Japanese key and its English text.
 *  3. Inline pairs `{ en: …, ja: … }` in the pages and engine files (code only: not in strings, comments, or outside
 *     <script> in a page): each needs both languages,
 *     the same nested keys, and the same placeholders. Same for `<lang test> ? 'a' : 'b'` with two plain literals.
 * Node built-ins only.
 */
'use strict';
var fs = require('fs'), path = require('path'), vm = require('vm');
var ROOT = process.env.CHECK_I18N_ROOT ? path.resolve(process.env.CHECK_I18N_ROOT) : path.resolve(__dirname, '..');
var VERBOSE = process.argv.indexOf('--verbose') >= 0;

var PAGES = ['xray-graph.html', 'xray-graph-nextui.html', 'decision-bracket.html'];
var DICT = 'xray-i18n.js';
var ENGINE = ['xray-core.js', 'xray-api.js', 'clab-xray-bridge.js', 'xray-skin.js', 'xray-unified.js',
  'xray-node-panel.js', 'xray-topo-overlay.js'];

var JA = /[ぁ-んァ-ヿ㐀-鿿]/;   // hiragana, katakana, kanji (not the ①★ symbols the English text also uses)
var errors = [], warnings = [];
function err(f, line, msg) { errors.push(f + ':' + line + '  ' + msg); }
function warn(f, line, msg) { warnings.push(f + ':' + line + '  ' + msg); }
function read(f) { return fs.readFileSync(path.join(ROOT, f), 'utf8'); }
function lineAt(src, pos) { return src.slice(0, pos).split('\n').length; }

// placeholders that must survive translation: {name}, {{name}}, ${expr}, %s / %d / %1$s
var PH = /\$\{[^}]*\}|\{\{?[A-Za-z_][\w.]*\}\}?|%(?:\d+\$)?[sdifjo]/g;
function placeholders(s) { return (String(s).match(PH) || []).sort(); }
function samePlaceholders(a, b) { return placeholders(a).join('\u0000') === placeholders(b).join('\u0000'); }
function phList(s) { var p = placeholders(s); return p.length ? p.join(' ') : '(none)'; }

/* Walk JS source: calls onString(value, startPos, codeSinceStatementStart) for each string literal.
 * Comments and regex literals are skipped. */
function scanJs(src, onString) {
  var i = 0, n = src.length, code = '', prev = '';   // prev = last significant code character
  while (i < n) {
    var c = src[i];
    if (c === '/' && src[i + 1] === '/') { while (i < n && src[i] !== '\n') i++; continue; }
    if (c === '/' && src[i + 1] === '*') { var e = src.indexOf('*/', i + 2); i = e < 0 ? n : e + 2; continue; }
    if (c === '/' && (prev === '' || '(,=:[!&|?{};+-*%<>~^'.indexOf(prev) >= 0)) {   // regex literal
      var cls = false;
      i++;
      while (i < n && src[i] !== '\n' && (cls || src[i] !== '/')) {
        if (src[i] === '\\') i++; else if (src[i] === '[') cls = true; else if (src[i] === ']') cls = false;
        i++;
      }
      i++;
      while (i < n && /[a-z]/.test(src[i])) i++;
      code += 'R'; prev = 'R';
      continue;
    }
    if (c === '"' || c === "'" || c === '`') {
      var q = c, start = i, s = '';
      i++;
      while (i < n && src[i] !== q) {
        if (src[i] === '\\') { s += src[i + 1] === 'n' ? '\n' : src[i + 1]; i += 2; continue; }
        if (q !== '`' && src[i] === '\n') break;   // unterminated: stop at the line end
        s += src[i]; i++;
      }
      i++;
      onString(s, start, code);
      code += 'S'; prev = 'S';
      continue;
    }
    if (c === ';' || c === '{' || c === '}') code = ''; else code += c;
    if (!/\s/.test(c)) prev = /[\w$)\]]/.test(c) ? 'w' : c;
    i++;
  }
}

// a statement that chooses the language itself: <name containing ja/Ja/Lang>[()] [=== S] [)] ?
var LANG_COND = /[\w$]*(?:ja|Ja|JA|Lang|lang)[\w$]*(?:\(\))?\s*(?:[!=]==?\s*S\s*)?\)?\s*\?/;

/* ---------- 1. page toggle tables ---------- */
function extractObject(src, marker) {
  var at = src.indexOf(marker);
  if (at < 0) return null;
  var i = src.indexOf('{', at), depth = 0, start = i;
  for (; i < src.length; i++) {
    var c = src[i];
    if (c === '"' || c === "'") { var q = c; i++; while (i < src.length && src[i] !== q) { if (src[i] === '\\') i++; i++; } continue; }
    if (c === '/' && src[i + 1] === '/') { while (i < src.length && src[i] !== '\n') i++; continue; }
    if (c === '{') depth++;
    else if (c === '}' && --depth === 0) return { text: src.slice(start, i + 1), pos: start };
  }
  return null;
}

PAGES.forEach(function (f) {
  var src = read(f);
  var obj = extractObject(src, 'var I18N =');
  if (!obj) { err(f, 1, 'no `var I18N = {...}` table found'); return; }
  var table;
  try { table = vm.runInNewContext('(' + obj.text + ')'); } catch (e) { err(f, lineAt(src, obj.pos), 'I18N table does not parse: ' + e.message); return; }
  var en = table.en || {}, ja = table.ja || {};
  var used = {}, m;
  // keys read by [data-i18n] elements, or as T.<key> where the page does `var T = I18N[LANG]`
  var uses = [[/data-i18n="([^"]+)"/g, 'data-i18n="%"']];
  if (/\bvar\s+T\s*=\s*I18N\[/.test(src)) uses.push([/\bT\.([A-Za-z_$][\w$]*)/g, 'T.%']);
  uses.forEach(function (u) {
    var re = u[0];
    while ((m = re.exec(src))) {
      var k = m[1], ln = lineAt(src, m.index), what = u[1].replace('%', k);
      used[k] = true;
      if (typeof en[k] !== 'string' || !en[k]) err(f, ln, what + ' has no English entry (I18N.en)');
      if (typeof ja[k] !== 'string' || !ja[k]) err(f, ln, what + ' has no Japanese entry (I18N.ja)');
    }
  });
  var tl = lineAt(src, obj.pos);
  Object.keys(en).forEach(function (k) { if (!(k in ja)) err(f, tl, 'I18N key "' + k + '" is in en but not in ja'); });
  Object.keys(ja).forEach(function (k) { if (!(k in en)) err(f, tl, 'I18N key "' + k + '" is in ja but not in en'); });
  Object.keys(en).forEach(function (k) {
    if (k in ja && !samePlaceholders(en[k], ja[k]))
      err(f, tl, 'I18N key "' + k + '" placeholders differ: en ' + phList(en[k]) + ' / ja ' + phList(ja[k]));
  });
  Object.keys(en).forEach(function (k) { if (!used[k]) warn(f, tl, 'I18N key "' + k + '" is not used by any data-i18n element'); });
});

/* ---------- 2. engine dictionary ---------- */
var dictSrc = read(DICT), sandbox = { window: {} };
vm.runInNewContext(dictSrc, sandbox, { filename: DICT });
var dict = sandbox.window.xrayI18n || {};
var keys = Object.keys(dict).sort(function (a, b) { return b.length - a.length; });   // same order as xray-api.js
function dictLine(k) { var p = dictSrc.indexOf(JSON.stringify(k)); return p < 0 ? 1 : lineAt(dictSrc, p); }

keys.forEach(function (k) {
  var v = dict[k];
  if (typeof v !== 'string' || (!v.trim() && k.trim())) err(DICT, dictLine(k), JSON.stringify(k) + ' has no English text');
  else if (JA.test(v)) err(DICT, dictLine(k), JSON.stringify(k) + ' -> English text still has Japanese: ' + JSON.stringify(v));
  if (typeof v === 'string' && !samePlaceholders(k, v))
    err(DICT, dictLine(k), JSON.stringify(k) + ' placeholders differ: ja ' + phList(k) + ' / en ' + phList(v));
  if (!JA.test(k)) warn(DICT, dictLine(k), JSON.stringify(k) + ' has no Japanese (never replaced: xray-api.js only touches text with Japanese)');
});

function translate(s) {
  for (var i = 0; i < keys.length; i++) if (s.indexOf(keys[i]) >= 0) s = s.split(keys[i]).join(dict[keys[i]]);
  return s;
}
// the DOM sees text, not markup: split a literal at tags and decode the entities the engine uses
function textParts(s) {
  // full tags, a leading attribute tail (`x">` when a tag was opened in the previous literal), a trailing open tag
  return s.split(/<\/?[a-zA-Z][^>]*>|^[^<>]*?["']\s*>|<[a-zA-Z][^>]*$/).map(function (t) {
    return t.replace(/&#(\d+);/g, function (_, d) { return String.fromCharCode(+d); })
      .replace(/&#x([0-9a-f]+);/gi, function (_, h) { return String.fromCharCode(parseInt(h, 16)); })
      .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>');
  }).filter(function (t) { return JA.test(t); });
}

var allEngine = '';
ENGINE.forEach(function (f) {
  var src;
  try { src = read(f); } catch (e) { return; }
  allEngine += src + '\n';
  scanJs(src, function (s, pos, code) {
    if (!JA.test(s)) return;
    if (LANG_COND.test(code) || /\bconsole\.\w+\s*\(/.test(code)) return;
    textParts(s).forEach(function (t) {
      var out = translate(t);
      if (JA.test(out)) err(f, lineAt(src, pos), 'no English entry in ' + DICT + ' for ' + JSON.stringify(t));
    });
  });
});
keys.forEach(function (k) {
  if (JA.test(k) && allEngine.indexOf(k) < 0) warn(DICT, dictLine(k), JSON.stringify(k) + ' is not used by any engine file');
});

/* ---------- 3. inline { en: …, ja: … } pairs ---------- */
// Only real code is scanned: a map marks every character as code, string / template / regex text, comment, or
// (in .html) outside a <script> element, so a `{`, `}`, `en:` or `?` inside text or a comment is never taken as code.
var K_CODE = 0, K_QUOTE = 1, K_TEXT = 2, K_COMMENT = 3, K_OUT = 4;
function codeMap(src, html) {
  var n = src.length, k = new Uint8Array(n), i = 0;
  if (html) {   // everything outside <script>…</script> is not code
    k.fill(K_OUT);
    var re = /<script\b[^>]*>([\s\S]*?)<\/script>/gi, m;
    while ((m = re.exec(src))) { var s0 = m.index + m[0].indexOf('>') + 1; k.fill(K_CODE, s0, s0 + m[1].length); }
  }
  var prev = '';   // last code character that is not white space (decides whether `/` starts a regex)
  while (i < n) {
    if (k[i] === K_OUT) { i++; continue; }
    var c = src[i], d = src[i + 1];
    if (c === '/' && d === '/') { while (i < n && src[i] !== '\n') k[i++] = K_COMMENT; continue; }
    if (c === '/' && d === '*') { var e = src.indexOf('*/', i + 2); e = e < 0 ? n : e + 2; k.fill(K_COMMENT, i, e); i = e; continue; }
    if (c === "'" || c === '"' || c === '`') {
      var q = c; k[i++] = K_QUOTE;
      while (i < n && src[i] !== q) {
        if (src[i] === '\\') { k[i++] = K_TEXT; }
        else if (q !== '`' && src[i] === '\n') break;   // an unterminated quote ends at the line
        if (i < n) k[i++] = K_TEXT;
      }
      if (i < n && src[i] === q) k[i++] = K_QUOTE;
      prev = 'x'; continue;
    }
    if (c === '/' && (prev === '' || '(,=:[!&|?{};+-*%<>~^'.indexOf(prev) >= 0 || /\breturn$|\btypeof$/.test(src.slice(Math.max(0, i - 7), i).trimEnd()))) {
      k[i++] = K_QUOTE; var cls = false;   // regex literal
      while (i < n && src[i] !== '\n') {
        var r = src[i];
        if (r === '\\') { k[i++] = K_TEXT; if (i < n) k[i++] = K_TEXT; continue; }
        if (r === '[') cls = true; else if (r === ']') cls = false; else if (r === '/' && !cls) break;
        k[i++] = K_TEXT;
      }
      if (i < n && src[i] === '/') k[i++] = K_QUOTE;
      prev = 'x'; continue;
    }
    if (!/\s/.test(c)) prev = c;
    k[i++] = K_CODE;
  }
  return k;
}
// innermost object literal around position `at`, counting only braces that are code
function enclosingObject(src, map, at) {
  for (var i = at, depth = 0; i >= 0; i--) {
    if (map[i] !== K_CODE) continue;
    if (src[i] === '}') depth++;
    else if (src[i] === '{' && depth-- === 0) {
      for (var j = i, dd = 0; j < src.length; j++) {
        if (map[j] !== K_CODE) continue;
        if (src[j] === '{') dd++;
        else if (src[j] === '}' && --dd === 0) return { text: src.slice(i, j + 1), pos: i };
      }
      return null;
    }
  }
  return null;
}
// A name the snippet uses from outside (pj, url, …) stands for an unknown value: property reads give undefined,
// string joins give '', calls give the stub again. Only names the evaluation reports as not defined are added.
// The value leaves the sandbox as JSON (inside the time limit), so no getter or function runs outside it.
var STUB = new Proxy(function () {}, {
  get: function (t, k) { return (k === Symbol.toPrimitive || k === 'toString' || k === 'valueOf') ? function () { return ''; } : undefined; },
  apply: function () { return STUB; }
});
function evalObject(text) {
  var ctx = {};
  for (var i = 0; i < 20; i++) {
    try { var j = vm.runInNewContext('JSON.stringify((' + text + '))', ctx, { timeout: 200 }); return j === undefined ? null : JSON.parse(j); }
    catch (e) { var nd = /^(\S+) is not defined/.exec((e && e.message) || ''); if (!nd) throw e; ctx[nd[1]] = STUB; }
  }
  throw new Error('too many outside names');
}
function isText(v) { return typeof v === 'string' || (v && typeof v === 'object' && !Array.isArray(v) &&
  Object.keys(v).length && Object.keys(v).every(function (k) { return isText(v[k]); })); }
function comparePair(f, ln, where, en, ja) {
  if (typeof en === 'string' && typeof ja === 'string') {
    if (!en.trim() && ja.trim()) err(f, ln, where + ' has no English text');
    if (!ja.trim() && en.trim()) err(f, ln, where + ' has no Japanese text');
    if (!samePlaceholders(en, ja)) err(f, ln, where + ' placeholders differ: en ' + phList(en) + ' / ja ' + phList(ja));
    return;
  }
  if (typeof en !== typeof ja) { err(f, ln, where + ' is a ' + typeof en + ' in en but a ' + typeof ja + ' in ja'); return; }
  Object.keys(en).forEach(function (k) {
    if (!(k in ja)) err(f, ln, where + '.' + k + ' is in en but not in ja');
    else comparePair(f, ln, where + '.' + k, en[k], ja[k]);
  });
  Object.keys(ja).forEach(function (k) { if (!(k in en)) err(f, ln, where + '.' + k + ' is in ja but not in en'); });
}
// after a literal that ends at `at`: is the branch complete (nothing like + . [ || ?? * that would extend it)?
function literalEnds(src, map, at) {
  for (var i = at; i < src.length; i++) {
    if (map[i] === K_COMMENT) continue;
    var c = src[i];
    if (/\s/.test(c)) continue;
    return ',;)]}:'.indexOf(c) >= 0;
  }
  return true;
}
var pairCount = 0, skipped = [];
PAGES.concat(ENGINE).forEach(function (f) {
  var src;
  try { src = read(f); } catch (e) { return; }
  var map = codeMap(src, /\.html?$/i.test(f));
  var seen = {}, re = /[{,]\s*(['"]?)(en|ja)\1\s*:/g, m;
  while ((m = re.exec(src))) {
    if (map[m.index] !== K_CODE) continue;   // in a string, a comment or outside the script
    var o = enclosingObject(src, map, m.index + m[0].indexOf(m[1] + m[2]) - 1);   // walk back from just before the key
    if (!o) { skipped.push(f + ':' + lineAt(src, m.index) + ' (no enclosing object)'); continue; }
    if (seen[o.pos]) continue;
    seen[o.pos] = true;
    var v;
    try { v = evalObject(o.text); } catch (e) { skipped.push(f + ':' + lineAt(src, o.pos) + ' (' + String((e && e.message) || e).slice(0, 60) + ')'); continue; }
    if (!v || typeof v !== 'object') continue;
    var hasEn = isText(v.en), hasJa = isText(v.ja), ln = lineAt(src, o.pos);
    if (!hasEn && !hasJa) continue;
    pairCount++;
    if (!hasEn) err(f, ln, '{ ja: … } has no en text');
    else if (!hasJa) err(f, ln, '{ en: … } has no ja text');
    else comparePair(f, ln, '{en, ja}', v.en, v.ja);
  }
  // lang === 'en' ? 'a' : 'b'   /   ja ? 'a' : 'b'   (both branches plain literals, each one complete)
  var LIT = '(\'(?:[^\'\\\\\n]|\\\\.)*\'|"(?:[^"\\\\\n]|\\\\.)*")';
  var tern = new RegExp('([\\w$]*(?:ja|Ja|JA|Lang|lang|LANG)[\\w$]*(?:\\(\\))?)\\s*(?:([!=]==?)\\s*[\'"](\\w+)[\'"]\\s*)?\\)?\\s*\\?\\s*' + LIT + '\\s*:\\s*' + LIT, 'g');
  while ((m = tern.exec(src))) {
    var at = m.index, lit1 = src.indexOf(m[4], at), lit2 = src.indexOf(m[5], lit1 + m[4].length);
    if (map[at] !== K_CODE || map[lit1] !== K_QUOTE || map[lit2] !== K_QUOTE) continue;   // not code (text, comment)
    if (!literalEnds(src, map, lit2 + m[5].length)) continue;   // the second branch goes on ('b' + x, 'b' || c): not a plain pick
    var a = vm.runInNewContext(m[4]), b = vm.runInNewContext(m[5]);
    if (!JA.test(a) && !JA.test(b)) continue;   // not a language pick (or nothing to translate)
    pairCount++;
    var ln2 = lineAt(src, at);
    if (!a.trim() || !b.trim()) err(f, ln2, 'language choice has an empty side: ' + JSON.stringify(a) + ' : ' + JSON.stringify(b));
    else if (!samePlaceholders(a, b)) err(f, ln2, 'language choice placeholders differ: ' + phList(a) + ' / ' + phList(b));
  }
});

/* ---------- report ---------- */
if (VERBOSE && warnings.length) { console.log('warnings (' + warnings.length + '):'); warnings.forEach(function (w) { console.log('  ' + w); }); }
if (errors.length) {
  console.log('check-i18n: ' + errors.length + ' error(s)');
  errors.forEach(function (e) { console.log('  ' + e); });
  process.exit(1);
}
if (skipped.length) {   // a pair the check could not evaluate is not checked: fail instead of passing it silently
  skipped.forEach(function (x) { console.error('  ' + x + '  inline { en, ja } pair could not be checked'); });
  console.error('check-i18n: FAIL (' + skipped.length + ' inline pair(s) could not be checked)');
  process.exit(1);
}
console.log('check-i18n: OK (' + PAGES.length + ' page tables, ' + keys.length + ' dictionary entries, ' + pairCount + ' inline pairs, ' + warnings.length + ' warning(s); --verbose to list)');
