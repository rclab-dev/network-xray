#!/usr/bin/env node
/* check-i18n.js — English / Japanese UI string parity.
 *   usage: node scripts/check-i18n.js [--verbose]
 *     --verbose : also list the warnings (dictionary keys never used, keys with no Japanese)
 * Exit 0 = parity OK, 1 = at least one error (printed as file:line).
 *
 * Two mechanisms are checked:
 *  1. Page toggle tables (xray-graph.html, xray-graph-nextui.html): `var I18N = { en: {...}, ja: {...} }`
 *     filled into [data-i18n] elements. Error: a data-i18n key with no English or no Japanese entry,
 *     or a key present in one language only.
 *  2. The engine dictionary (xray-i18n.js): window.xrayI18n maps the engine's Japanese UI text to English;
 *     xray-api.js replaces it in the DOM at runtime. Error: a Japanese string literal in an engine file
 *     that still has Japanese left after the dictionary is applied (no English entry), or a dictionary
 *     value that is empty or still Japanese. Literals in a statement that already picks a language
 *     (`ja ? '…' : '…'`, `_xrayLang === "en" ? …`) and console.* messages are skipped.
 * Node built-ins only.
 */
'use strict';
var fs = require('fs'), path = require('path'), vm = require('vm');
var ROOT = path.resolve(__dirname, '..');
var VERBOSE = process.argv.indexOf('--verbose') >= 0;

var PAGES = ['xray-graph.html', 'xray-graph-nextui.html'];
var DICT = 'xray-i18n.js';
var ENGINE = ['xray-core.js', 'xray-api.js', 'clab-xray-bridge.js', 'xray-skin.js', 'xray-unified.js',
  'xray-node-panel.js', 'xray-topo-overlay.js'];

var JA = /[ぁ-んァ-ヿ㐀-鿿]/;   // hiragana, katakana, kanji (not the ①★ symbols the English text also uses)
var errors = [], warnings = [];
function err(f, line, msg) { errors.push(f + ':' + line + '  ' + msg); }
function warn(f, line, msg) { warnings.push(f + ':' + line + '  ' + msg); }
function read(f) { return fs.readFileSync(path.join(ROOT, f), 'utf8'); }
function lineAt(src, pos) { return src.slice(0, pos).split('\n').length; }

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
  var used = {}, re = /data-i18n="([^"]+)"/g, m;
  while ((m = re.exec(src))) {
    var k = m[1], ln = lineAt(src, m.index);
    used[k] = true;
    if (typeof en[k] !== 'string' || !en[k]) err(f, ln, 'data-i18n="' + k + '" has no English entry (I18N.en)');
    if (typeof ja[k] !== 'string' || !ja[k]) err(f, ln, 'data-i18n="' + k + '" has no Japanese entry (I18N.ja)');
  }
  var tl = lineAt(src, obj.pos);
  Object.keys(en).forEach(function (k) { if (!(k in ja)) err(f, tl, 'I18N key "' + k + '" is in en but not in ja'); });
  Object.keys(ja).forEach(function (k) { if (!(k in en)) err(f, tl, 'I18N key "' + k + '" is in ja but not in en'); });
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

/* ---------- report ---------- */
if (VERBOSE && warnings.length) { console.log('warnings (' + warnings.length + '):'); warnings.forEach(function (w) { console.log('  ' + w); }); }
if (errors.length) {
  console.log('check-i18n: ' + errors.length + ' error(s)');
  errors.forEach(function (e) { console.log('  ' + e); });
  process.exit(1);
}
console.log('check-i18n: OK (' + PAGES.length + ' page tables, ' + keys.length + ' dictionary entries, ' + warnings.length + ' warning(s); --verbose to list)');
