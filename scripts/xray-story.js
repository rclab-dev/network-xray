#!/usr/bin/env node
// xray-story.js — a story (a list of scenes, each one a whole lab state) checked and written as ONE HTML page that plays
// it: the scenes on the left (click one, Back / Next, Play), the lab and the open router's X-Ray on the right. The page
// has the engine inside, loads nothing from outside and works offline (file://). The format is STORY-CONTRACT.md.
//
//   node scripts/xray-story.js <story.json> [--out <file.html>]   check the story and write the page
//   node scripts/xray-story.js <story.json> --check               check only (nothing is written)
//
// Exit 0 written / valid, 1 the story is not valid (every problem is listed), 2 a usage or read error.
'use strict';
var fs = require('fs');
var path = require('path');
var vs = require('./validate-states.js');
var parseYaml = require('./check-example-topologies.js').parseYaml;

var ROOT = path.join(__dirname, '..');
var ME = 'xray-story.js';
var USAGE = 'usage: node scripts/xray-story.js <story.json> [--out <file.html>] [--check]\n' +
  '  check a story (STORY-CONTRACT.md) and write it as one HTML page that plays it (works offline)\n' +
  '  --out <file>  write the page here (default: <story>.html next to the story file)\n' +
  '  --check       check the story only, write nothing\n' +
  '  -h, --help    show this help\n' +
  'exit 0 written / valid, 1 not valid (every problem is listed), 2 usage or read error';

var VERSION = '0.1';
var SOURCES = ['observed', 'observed-unsettled', 'answer-example', 'illustrative', 'unknown'];
var LANGS = ['en', 'ja'];
var ID = /^[A-Za-z0-9][A-Za-z0-9_.-]{0,63}$/;
var PREFIX = /^[0-9A-Fa-f:.]{2,45}(\/[0-9]{1,3})?$/;
var LIMITS = { scenes: 50, title: 120, caption: 2000, description: 2000, nodes: 60, highlight: 20, bytes: 16 * 1024 * 1024 };
var DWELL = { min: 500, max: 60000, dflt: 6000 };
var KEYS = {
  story: ['story', 'title', 'description', 'lang', 'source', 'topology', 'scenes', 'ext'],
  scene: ['id', 'title', 'caption', 'source', 'state', 'show', 'dwell', 'ext'],
  show: ['node', 'prefix', 'highlight'],
  highlight: ['nodes', 'links'],
  topology: ['nodes', 'links'],
};
// the engine files put into the page (the same ones ui/view.html gets), then the player
var INLINE = ['xray-core.js', 'xray-api.js', 'xray-i18n.js', 'xray-skin.js', 'clab-xray-bridge.js', 'ui/story.js'];

class StoryError extends Error {}

function isObj(v) { return v !== null && typeof v === 'object' && !Array.isArray(v); }
function own(o, k) { return Object.prototype.hasOwnProperty.call(o, k); }
function str(v, max) { return typeof v === 'string' && v.trim() !== '' && v.length <= max; }

// the topology: a .clab.yml (containerlab) or a .json with the graph data ({nodes:[{name,kind}], links:[{source,target}]}),
// or the same object written in the story. -> { nodes: [{name, kind}], links: [{source, source_endpoint, target, target_endpoint}] }
function readTopology(t, baseDir, problems) {
  var data = t;
  if (typeof t === 'string') {
    var file = path.resolve(baseDir, t), text;
    try { text = fs.readFileSync(file, 'utf8'); } catch (e) { problems.push('topology: cannot read ' + t); return null; }
    if (/\.ya?ml$/i.test(file)) {
      var y;
      try { y = parseYaml(text); } catch (e) { problems.push('topology: ' + t + ': ' + e.message); return null; }
      var tn = y && isObj(y.topology) && isObj(y.topology.nodes) ? y.topology.nodes : null;
      if (!tn) { problems.push('topology: ' + t + ': no nodes under topology.nodes'); return null; }
      var links = [];
      (Array.isArray(y.topology.links) ? y.topology.links : []).forEach(function (l) {
        var ep = l && Array.isArray(l.endpoints) && l.endpoints.length === 2 ? l.endpoints.map(String) : null;
        if (!ep) return;
        var a = ep[0].split(':'), b = ep[1].split(':');
        links.push({ source: a[0], source_endpoint: a[1] || '', target: b[0], target_endpoint: b[1] || '' });
      });
      return { nodes: Object.keys(tn).map(function (n) { return { name: n, kind: isObj(tn[n]) && tn[n].kind != null ? String(tn[n].kind) : '' }; }), links: links };
    }
    try { data = JSON.parse(text); } catch (e) { problems.push('topology: ' + t + ': not JSON: ' + e.message); return null; }
  }
  if (!isObj(data) || !Array.isArray(data.nodes)) { problems.push('topology: needs nodes (a list)'); return null; }
  var nodes = [], seen = {};
  data.nodes.forEach(function (n, i) {
    var name = isObj(n) ? n.name : null;
    if (typeof name !== 'string' || !ID.test(name)) { problems.push('topology.nodes[' + i + ']: needs a plain name'); return; }
    if (seen[name]) { problems.push('topology.nodes[' + i + ']: ' + name + ' is listed twice'); return; }
    seen[name] = true;
    nodes.push({ name: name, kind: n.kind != null ? String(n.kind) : '' });
  });
  if (!nodes.length) problems.push('topology: no nodes');
  if (nodes.length > LIMITS.nodes) problems.push('topology: more than ' + LIMITS.nodes + ' nodes');
  var out = [];
  (Array.isArray(data.links) ? data.links : []).forEach(function (l, i) {
    if (!isObj(l) || !seen[l.source] || !seen[l.target] || l.source === l.target) { problems.push('topology.links[' + i + ']: source and target must be two different nodes of the topology'); return; }
    out.push({ source: l.source, source_endpoint: String(l.source_endpoint || ''), target: l.target, target_endpoint: String(l.target_endpoint || '') });
  });
  return { nodes: nodes, links: out };
}

// one scene's state: a file (frameN.json from capture-frames, state_<node>.json, xray-states.js) or the object itself;
// always a map router -> state for the page
function readState(st, baseDir, where, problems) {
  var parsed;
  if (typeof st === 'string') {
    var text;
    try { text = fs.readFileSync(path.resolve(baseDir, st), 'utf8'); } catch (e) { problems.push(where + '.state: cannot read ' + st); return null; }
    try { parsed = vs.parseStates(text, st); } catch (e) { problems.push(where + '.state: ' + st + ': ' + e.message); return null; }
  } else if (isObj(st)) {
    parsed = { kind: typeof st.target_node === 'string' ? 'router' : 'map', data: st };
  } else { problems.push(where + '.state: needs a file name or the state itself'); return null; }
  var errs = vs.validateStates(parsed);
  errs.slice(0, 5).forEach(function (e) { problems.push(where + '.state' + e.path.replace(/^#/, '') + ': ' + e.message); });
  if (errs.length > 5) problems.push(where + '.state: ' + (errs.length - 5) + ' more problem(s)');
  if (errs.length) return null;
  if (parsed.kind === 'router') { var m = {}; m[parsed.data.target_node] = parsed.data; return m; }
  return parsed.data;
}

function unknownKeys(o, allowed, where, problems) {
  Object.keys(o).forEach(function (k) { if (allowed.indexOf(k) < 0) problems.push(where + ': unknown key "' + k + '" (put your own fields under "ext")'); });
}

// check a story; baseDir resolves the file names in it. -> { problems: [...], story: the story as the page gets it }
function check(story, baseDir) {
  var p = [];
  if (!isObj(story)) return { problems: ['the story must be a JSON object'] };
  unknownKeys(story, KEYS.story, 'story', p);
  if (story.story !== VERSION) p.push('story: must be "' + VERSION + '" (the format version)');
  if (!str(story.title, LIMITS.title)) p.push('title: needs text (at most ' + LIMITS.title + ' characters)');
  if (own(story, 'description') && !(typeof story.description === 'string' && story.description.length <= LIMITS.description)) p.push('description: text of at most ' + LIMITS.description + ' characters');
  if (own(story, 'lang') && LANGS.indexOf(story.lang) < 0) p.push('lang: one of ' + LANGS.join(', '));
  if (own(story, 'source') && SOURCES.indexOf(story.source) < 0) p.push('source: one of ' + SOURCES.join(', '));
  if (own(story, 'ext') && !isObj(story.ext)) p.push('ext: must be an object');
  var topo = own(story, 'topology') ? readTopology(story.topology, baseDir, p) : (p.push('topology: needed (a .clab.yml, a .json or {nodes, links})'), null);
  var names = topo ? topo.nodes.map(function (n) { return n.name; }) : [];
  function isNode(n) { return names.indexOf(n) >= 0; }
  function isLink(pair) { return topo && topo.links.some(function (l) { return (l.source === pair[0] && l.target === pair[1]) || (l.source === pair[1] && l.target === pair[0]); }); }

  var scenes = [];
  if (!Array.isArray(story.scenes) || !story.scenes.length) p.push('scenes: needs a list of 1 to ' + LIMITS.scenes + ' scenes');
  else if (story.scenes.length > LIMITS.scenes) p.push('scenes: at most ' + LIMITS.scenes);
  else {
    var ids = {};
    story.scenes.forEach(function (s, i) {
      var w = 'scenes[' + i + ']';
      if (!isObj(s)) { p.push(w + ': must be an object'); return; }
      unknownKeys(s, KEYS.scene, w, p);
      if (typeof s.id !== 'string' || !ID.test(s.id)) p.push(w + '.id: a plain name (letters, digits, _ . -)');
      else if (ids[s.id]) p.push(w + '.id: "' + s.id + '" is used twice');
      else ids[s.id] = true;
      if (!str(s.title, LIMITS.title)) p.push(w + '.title: needs text (at most ' + LIMITS.title + ' characters)');
      if (own(s, 'caption') && !(typeof s.caption === 'string' && s.caption.length <= LIMITS.caption)) p.push(w + '.caption: text of at most ' + LIMITS.caption + ' characters');
      if (own(s, 'source') && SOURCES.indexOf(s.source) < 0) p.push(w + '.source: one of ' + SOURCES.join(', '));
      if (own(s, 'dwell') && !(Number.isInteger(s.dwell) && s.dwell >= DWELL.min && s.dwell <= DWELL.max)) p.push(w + '.dwell: whole milliseconds from ' + DWELL.min + ' to ' + DWELL.max);
      if (own(s, 'ext') && !isObj(s.ext)) p.push(w + '.ext: must be an object');
      var state = own(s, 'state') ? readState(s.state, baseDir, w, p) : (p.push(w + '.state: needed'), null);
      if (state && topo) Object.keys(state).forEach(function (n) { if (!isNode(n)) p.push(w + '.state: router ' + n + ' is not in the topology'); });
      var show = {};
      if (own(s, 'show')) {
        if (!isObj(s.show)) p.push(w + '.show: must be an object');
        else {
          unknownKeys(s.show, KEYS.show, w + '.show', p);
          if (own(s.show, 'node')) {
            if (!isNode(s.show.node)) p.push(w + '.show.node: ' + JSON.stringify(s.show.node) + ' is not in the topology');
            else if (state && !state[s.show.node]) p.push(w + '.show.node: ' + s.show.node + ' has no state in this scene');
            else show.node = s.show.node;
          }
          if (own(s.show, 'prefix')) {
            if (typeof s.show.prefix !== 'string' || !PREFIX.test(s.show.prefix)) p.push(w + '.show.prefix: an address or prefix such as 8.8.8.0/24');
            else show.prefix = s.show.prefix;
          }
          if (own(s.show, 'highlight')) {
            var h = s.show.highlight;
            if (!isObj(h)) p.push(w + '.show.highlight: must be an object');
            else {
              unknownKeys(h, KEYS.highlight, w + '.show.highlight', p);
              show.highlight = { nodes: [], links: [] };
              if (own(h, 'nodes')) {
                if (!Array.isArray(h.nodes) || h.nodes.length > LIMITS.highlight) p.push(w + '.show.highlight.nodes: a list of at most ' + LIMITS.highlight + ' node names');
                else h.nodes.forEach(function (n, k) { if (!isNode(n)) p.push(w + '.show.highlight.nodes[' + k + ']: ' + JSON.stringify(n) + ' is not in the topology'); else show.highlight.nodes.push(n); });
              }
              if (own(h, 'links')) {
                if (!Array.isArray(h.links) || h.links.length > LIMITS.highlight) p.push(w + '.show.highlight.links: a list of at most ' + LIMITS.highlight + ' links, each ["r1", "r2"]');
                else h.links.forEach(function (l, k) {
                  if (!Array.isArray(l) || l.length !== 2 || !isNode(l[0]) || !isNode(l[1]) || !isLink(l)) p.push(w + '.show.highlight.links[' + k + ']: ' + JSON.stringify(l) + ' is not a link of the topology');
                  else show.highlight.links.push([l[0], l[1]]);
                });
              }
            }
          }
        }
      }
      scenes.push({
        id: s.id, title: s.title, caption: typeof s.caption === 'string' ? s.caption : '',
        source: s.source || story.source || 'unknown', dwell: own(s, 'dwell') ? s.dwell : DWELL.dflt,
        show: show, state: state || {},
      });
    });
  }
  if (p.length) return { problems: p };
  return { problems: [], story: {
    story: VERSION, title: story.title, description: story.description || '', lang: story.lang || 'en',
    topology: topo, scenes: scenes,
  } };
}

// a JSON value placed inside a <script>: "</script>" or "<!--" in the text cannot end it
function js(v) { return JSON.stringify(v).replace(/</g, '\\u003c'); }
function escH(v) { return String(v).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }

// the page: ui/story.html with the engine and the player put in place of their markers, and the checked story as data
function page(checked) {
  var html = fs.readFileSync(path.join(ROOT, 'ui', 'story.html'), 'utf8');
  INLINE.forEach(function (f) {
    var mark = '<!-- nx-inline:' + f + ' -->';
    if (html.split(mark).length !== 2) throw new StoryError('ui/story.html: expected one ' + mark);
    var code = fs.readFileSync(path.join(ROOT, f), 'utf8').replace(/<\/script/gi, '<\\/script');
    html = html.replace(mark, function () { return '<script>\n' + code + '\n</script>'; });
  });
  var dmark = '<!-- nx-story-data -->';
  if (html.split(dmark).length !== 2) throw new StoryError('ui/story.html: expected one ' + dmark);
  html = html.replace(dmark, function () { return '<script id="nx-story" type="application/json">' + js(checked) + '</script>'; });
  html = html.replace('<html lang="en">', '<html lang="' + checked.lang + '">');
  return html.replace('<title>network-xray story</title>', function () { return '<title>' + escH(checked.title) + ' - network-xray story</title>'; });
}

// read, check and build: -> { problems } or { html, story }
function build(file) {
  var text;
  try {
    if (fs.statSync(file).size > LIMITS.bytes) throw new StoryError(file + ': larger than 16 MiB');
    text = fs.readFileSync(file, 'utf8');
  } catch (e) { throw new StoryError(e instanceof StoryError ? e.message : 'cannot read ' + file); }
  var story;
  try { story = JSON.parse(text.charCodeAt(0) === 0xFEFF ? text.slice(1) : text); } catch (e) { return { problems: [path.basename(file) + ': not JSON: ' + e.message] }; }
  var c = check(story, path.dirname(path.resolve(file)));
  if (c.problems.length) return { problems: c.problems };
  return { problems: [], story: c.story, html: page(c.story) };
}

function main(argv) {
  if (argv.indexOf('-h') >= 0 || argv.indexOf('--help') >= 0) { console.log(USAGE); return 0; }
  var out = null, only = false, pos = [];
  for (var i = 0; i < argv.length; i++) {
    var a = argv[i];
    if (a === '--out') { out = argv[++i]; if (!out) { console.error(ME + ': --out needs a file name'); return 2; } }
    else if (a === '--check') only = true;
    else if (a.charAt(0) === '-' && a.length > 1) { console.error(ME + ': unknown option: ' + a + "\nTry 'node scripts/xray-story.js --help'."); return 2; }
    else pos.push(a);
  }
  if (pos.length !== 1) { console.error(USAGE); return 2; }
  var r;
  try { r = build(pos[0]); } catch (e) { if (e instanceof StoryError) { console.error(ME + ': ' + e.message); return 2; } throw e; }
  if (r.problems.length) {
    console.log('FAIL ' + pos[0]);
    r.problems.forEach(function (m) { console.log('  ' + m); });
    return 1;
  }
  if (only) { console.log('ok   ' + pos[0] + ' (' + r.story.scenes.length + ' scenes)'); return 0; }
  var dest = out || pos[0].replace(/\.json$/i, '') + '.html';
  fs.writeFileSync(dest, r.html);
  console.log(dest + ' written: ' + r.story.scenes.length + ' scenes, ' + r.html.length + ' bytes');
  return 0;
}

module.exports = { check: check, build: build, page: page, readTopology: readTopology, SOURCES: SOURCES, VERSION: VERSION, LIMITS: LIMITS };

if (require.main === module) process.exitCode = main(process.argv.slice(2));
