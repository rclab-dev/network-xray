#!/usr/bin/env node
/*
 * validate-states.js - check collected state against docs/dev/states-schema.json.
 *
 *   node scripts/validate-states.js <file|dir> ...
 *
 * Accepts:
 *   - the xray-states.js that clab-xray-collect.js writes (window.LIVE_STATES = {...};)
 *   - a state_<node>.json (one router) or a JSON map of router name -> state
 *   - a directory: every state_*.json and xray-states.js in it
 * Exit 0 = all valid, 1 = a file does not match (each error printed), 2 = usage / unreadable file.
 *
 * The validator implements only the JSON Schema (2020-12) keywords the schema uses: type, enum,
 * properties, required, additionalProperties, patternProperties, items, minimum, maximum and local
 * $ref (#/$defs/...). An unknown keyword is an error, so the schema cannot silently use one this
 * file does not check. Node built-ins only.
 */
'use strict';
var fs = require('fs');
var path = require('path');

var SCHEMA_PATH = path.join(__dirname, '..', 'docs', 'dev', 'states-schema.json');
var ANNOTATIONS = { $schema: 1, $id: 1, $defs: 1, $comment: 1, title: 1, description: 1 };
var KEYWORDS = { type: 1, enum: 1, properties: 1, required: 1, additionalProperties: 1, patternProperties: 1,
  items: 1, minimum: 1, maximum: 1, $ref: 1 };

function typeOf(v) {
  if (v === null) return 'null';
  if (Array.isArray(v)) return 'array';
  if (typeof v === 'number') return Number.isInteger(v) ? 'integer' : 'number';
  return typeof v;
}
function typeMatches(v, t) {
  var a = typeOf(v);
  return a === t || (t === 'number' && a === 'integer');
}
function resolveRef(root, ref) {
  if (!/^#\//.test(ref)) throw new Error('only local $ref is supported: ' + ref);
  return ref.slice(2).split('/').reduce(function (o, k) {
    k = k.replace(/~1/g, '/').replace(/~0/g, '~');
    if (!o || !Object.prototype.hasOwnProperty.call(o, k)) throw new Error('$ref not found: ' + ref);
    return o[k];
  }, root);
}
function own(o, k) { return Object.prototype.hasOwnProperty.call(o, k); }
function ptr(p, k) { return p + '/' + String(k).replace(/~/g, '~0').replace(/\//g, '~1'); }

// nx_schema_walk (2026-11-03): every keyword in the WHOLE schema is checked once, not only the branches the data visits
// (an unsupported keyword under an absent property or an unused $defs entry used to pass silently).
var WALKED = new WeakSet();
function checkSchemaKeywords(s, at) {
  if (s === true || s === false) return;
  if (!s || typeof s !== 'object' || Array.isArray(s)) throw new Error('bad schema at ' + at);
  Object.keys(s).forEach(function (k) { if (!own(KEYWORDS, k) && !own(ANNOTATIONS, k)) throw new Error('unsupported schema keyword "' + k + '" (at schema ' + at + ')'); });
  ['properties', 'patternProperties', '$defs'].forEach(function (k) {
    if (s[k] && typeof s[k] === 'object') Object.keys(s[k]).forEach(function (n) { checkSchemaKeywords(s[k][n], ptr(at + '/' + k, n)); });
  });
  if (s.additionalProperties !== undefined && typeof s.additionalProperties === 'object') checkSchemaKeywords(s.additionalProperties, at + '/additionalProperties');
  if (s.items !== undefined && typeof s.items === 'object') checkSchemaKeywords(s.items, at + '/items');
}

// validate(schema, data[, root]) -> [{ path, message }] (empty = valid). root = the schema $ref resolves against.
function validate(schema, data, root) {
  var errors = [];
  root = root || schema;
  if (!WALKED.has(root)) { checkSchemaKeywords(root, '#'); WALKED.add(root); }   // the whole schema, once per schema object
  var regexCache = {};
  function re(p) { return regexCache[p] || (regexCache[p] = new RegExp(p, 'u')); }
  function err(p, m) { errors.push({ path: p || '/', message: m }); }

  function check(s, v, p) {
    if (s === true) return;
    if (s === false) { err(p, 'no value is allowed here'); return; }
    if (!s || typeof s !== 'object') throw new Error('bad schema at ' + p);
    Object.keys(s).forEach(function (k) { if (!own(KEYWORDS, k) && !own(ANNOTATIONS, k)) throw new Error('unsupported schema keyword "' + k + '" (at data ' + (p || '/') + ')'); });
    if (s.$ref) check(resolveRef(root, s.$ref), v, p);
    if (s.type) {
      var ts = Array.isArray(s.type) ? s.type : [s.type];
      if (!ts.some(function (t) { return typeMatches(v, t); })) { err(p, 'expected ' + ts.join(' or ') + ', got ' + typeOf(v)); return; }
    }
    if (s.enum && !s.enum.some(function (e) { return e === v; })) err(p, 'expected one of ' + JSON.stringify(s.enum) + ', got ' + JSON.stringify(v));
    if (typeof v === 'number') {
      if (s.minimum != null && v < s.minimum) err(p, 'expected >= ' + s.minimum + ', got ' + v);
      if (s.maximum != null && v > s.maximum) err(p, 'expected <= ' + s.maximum + ', got ' + v);
    }
    if (Array.isArray(v) && s.items !== undefined) v.forEach(function (x, i) { check(s.items, x, ptr(p, i)); });
    if (typeOf(v) === 'object') {
      (s.required || []).forEach(function (k) { if (!own(v, k)) err(p, 'missing required property "' + k + '"'); });
      var props = s.properties || {}, pats = s.patternProperties || {};
      Object.keys(v).forEach(function (k) {
        var matched = false;
        if (own(props, k)) { matched = true; check(props[k], v[k], ptr(p, k)); }
        Object.keys(pats).forEach(function (pat) { if (re(pat).test(k)) { matched = true; check(pats[pat], v[k], ptr(p, k)); } });
        if (!matched && s.additionalProperties !== undefined) check(s.additionalProperties, v[k], ptr(p, k));
      });
    }
  }
  check(schema, data, '');
  return errors;
}

function loadSchema() { return JSON.parse(fs.readFileSync(SCHEMA_PATH, 'utf8')); }

// text of a states file -> { kind: 'map' | 'router', data }
function parseStates(text, name) {
  var data;
  if (/^\s*window\.LIVE_STATES\s*=/.test(text)) {
    var m = /window\.LIVE_STATES\s*=\s*(.*?);\s*$/m.exec(text);   // same reading as scripts/xray-query.js
    if (!m) throw new Error(name + ': no window.LIVE_STATES = {...}; line');
    data = JSON.parse(m[1]);
    return { kind: 'map', data: data };
  }
  data = JSON.parse(text);
  // one router has target_node; a map's values are routers
  // nx_schema_kind (2026-11-03): a router's target_node is a string; in a map every value is a router object, so a node
  // that happens to be named target_node does not make the map look like one router
  var isRouter = data && typeof data === 'object' && !Array.isArray(data) && typeof data.target_node === 'string';
  return { kind: isRouter ? 'router' : 'map', data: data };
}

// validate one parsed states value; kind 'router' checks it as #/$defs/routerState
function validateStates(parsed, schema) {
  schema = schema || loadSchema();
  var s = parsed.kind === 'router' ? schema.$defs.routerState : schema;
  return validate(s, parsed.data, schema);
}

function filesOf(arg) {
  var st = fs.statSync(arg);
  if (!st.isDirectory()) return [arg];
  return fs.readdirSync(arg).filter(function (f) { return /^state_.*\.json$/.test(f) || f === 'xray-states.js'; })
    .sort().map(function (f) { return path.join(arg, f); });
}

function main(argv) {
  if (!argv.length || argv[0] === '-h' || argv[0] === '--help') {
    console.log('usage: node scripts/validate-states.js <xray-states.js | state_<node>.json | dir> ...');
    return argv.length ? 0 : 2;
  }
  var schema = loadSchema(), bad = 0, files = [];
  try { argv.forEach(function (a) { files = files.concat(filesOf(a)); }); }
  catch (e) { console.error(e.message); return 2; }
  if (!files.length) { console.error('no state files found'); return 2; }
  for (var i = 0; i < files.length; i++) {
    var f = files[i], parsed;
    try { parsed = parseStates(fs.readFileSync(f, 'utf8'), f); }
    catch (e) { console.error(f + ': cannot read: ' + e.message); return 2; }
    var errs = validateStates(parsed, schema);
    if (errs.length) {
      bad++;
      console.log('FAIL ' + f);
      errs.forEach(function (e) { console.log('  ' + e.path + ': ' + e.message); });
    } else {
      console.log('ok   ' + f + ' (' + (parsed.kind === 'router' ? 'router ' + parsed.data.target_node : Object.keys(parsed.data).length + ' routers') + ')');
    }
  }
  return bad ? 1 : 0;
}

module.exports = { validate: validate, validateStates: validateStates, parseStates: parseStates, loadSchema: loadSchema, SCHEMA_PATH: SCHEMA_PATH };

if (require.main === module) process.exitCode = main(process.argv.slice(2));
