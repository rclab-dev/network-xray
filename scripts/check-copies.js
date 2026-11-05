#!/usr/bin/env node
/* check-copies.js — files that are kept as copies in several places must stay byte-identical.
 *   usage: node scripts/check-copies.js [--list]
 *     --list : also print every checked group with its sha256 prefixes, and the exceptions
 * Exit 0 = all copies match, 1 = at least one copy differs or is missing (paths printed).
 * Groups: the engine files that scripts/gen_compose_bundle.js copies verbatim into demo/compose-* /web,
 * the collector scripts it copies into demo/compose-* /collector, the lab-independent files it writes
 * the same way into every bundle, and demo/decision-bracket.html (the GitHub Pages copy).
 * See docs/copies.md for the full inventory.
 */
var fs = require('fs'), path = require('path'), crypto = require('crypto');
var ROOT = path.resolve(__dirname, '..');
var LIST = process.argv.indexOf('--list') >= 0;
var _cli = process.argv.slice(2);
if (_cli.indexOf('-h') >= 0 || _cli.indexOf('--help') >= 0) { console.log('usage: node scripts/check-copies.js [--list]\n  check that the files kept as copies (demo/compose-*, demo/) are byte-identical\n  --list      also print every checked group and the exceptions\n  -h, --help  show this help'); process.exit(0); }
var _bad = _cli.filter(function (s) { return ['--list'].indexOf(s) < 0; })[0];
if (_bad) { console.error('check-copies.js: unknown option: ' + _bad + "\nTry 'node scripts/check-copies.js --help'."); process.exit(2); }

function abs(p) { return path.join(ROOT, p); }
function isDir(p) { try { return fs.statSync(abs(p)).isDirectory(); } catch (e) { return false; } }

// every docker-compose bundle under demo/ (output of scripts/gen_compose_bundle.js)
var BUNDLES = fs.readdirSync(abs('demo')).filter(function (d) { return /^compose-/.test(d) && isDir('demo/' + d); })
  .sort().map(function (d) { return 'demo/' + d; });

// copied verbatim from the repo root into <bundle>/web/ (gen_compose_bundle.js step 7)
var WEB_COPIES = ['xray-core.js', 'xray-api.js', 'clab-xray-bridge.js', 'xray-skin.js', 'xray-i18n.js', 'skin.html', 'decision-bracket.html'];
// copied verbatim from the repo root into <bundle>/collector/ (gen_compose_bundle.js step 8)
var COLLECTOR_COPIES = ['clab-collect.js', 'clab-xray-collect.js'];
// written with fixed content into every bundle (no lab-specific text) -> same in all bundles
var BUNDLE_CONSTANT = ['collector/Dockerfile', 'server/Dockerfile', 'web/xray-states.js'];

/* Intended exceptions: copies (or near-copies) that are NOT expected to be identical. One line each. */
var EXCEPTIONS = [
  { paths: 'demo/compose-*/web/index.html', reason: 'generated from xray-graph.html with the lab name + topology filled in, plus the hand-added nx_compose_wait_states patch' },
  { paths: 'demo/compose-*/collector/watch.sh', reason: 'embeds the lab protocol (bgp / ospf) in the collect command' },
  { paths: 'demo/compose-*/compose.yml', reason: 'per-lab services, networks and addresses' },
  { paths: 'demo/compose-*/README.md', reason: 'per-lab title and node name' },
  { paths: 'demo/compose-*/reload.sh', reason: 'embeds the lab\'s first node name (identical today only because both labs start with r1)' },
  { paths: 'demo/compose-*/collector/topo.clab.yml', reason: 'per-lab topology (endpoints remapped to compose eth numbering)' },
  { paths: 'demo/compose-*/r*/frr.conf, daemons', reason: 'per-lab router config (frr.conf is the transformed source config)' },
  { paths: 'demo/compose-*/collector/clab-srl-collect.js', reason: 'the generator copies it when present; the committed FRR-only bundles were generated before that and do not need it' },
  { paths: 'xray-graph-nextui.html vs xray-graph.html, demo/index*.html vs index.html', reason: 'different pages, not copies' },
  { paths: 'examples/**/{daemons,vtysh.conf,frr.conf}', reason: 'lab data that happens to be equal (unchanged routers between qN and qN-solved), not component copies' }
];

var groups = [];
WEB_COPIES.forEach(function (f) { groups.push({ name: f, paths: [f].concat(BUNDLES.map(function (b) { return b + '/web/' + f; })) }); });
COLLECTOR_COPIES.forEach(function (f) { groups.push({ name: f, paths: [f].concat(BUNDLES.map(function (b) { return b + '/collector/' + f; })) }); });
// scripts/compose-server.js -> <bundle>/server/server.js (gen_compose_bundle.js step 9)
groups.push({ name: 'scripts/compose-server.js', paths: ['scripts/compose-server.js'].concat(BUNDLES.map(function (b) { return b + '/server/server.js'; })) });
var db = groups.filter(function (g) { return g.name === 'decision-bracket.html'; })[0];
db.paths.push('demo/decision-bracket.html');   // GitHub Pages gallery copy of the root page
BUNDLE_CONSTANT.forEach(function (f) { groups.push({ name: f + ' (bundle)', paths: BUNDLES.map(function (b) { return b + '/' + f; }) }); });
// <bundle>/<node>/vtysh.conf: one fixed line written for every node
groups.push({ name: 'vtysh.conf (bundle)', paths: [].concat.apply([], BUNDLES.map(function (b) {
  return fs.readdirSync(abs(b)).filter(function (n) { return fs.existsSync(abs(b + '/' + n + '/vtysh.conf')); }).sort()
    .map(function (n) { return b + '/' + n + '/vtysh.conf'; });
})) });

function sha(p) { return crypto.createHash('sha256').update(fs.readFileSync(abs(p))).digest('hex').slice(0, 12); }

var bad = 0;
groups.forEach(function (g) {
  if (g.paths.length < 2) return;
  var h = g.paths.map(function (p) { return fs.existsSync(abs(p)) ? sha(p) : null; });
  var same = h.every(function (x) { return x !== null && x === h[0]; });
  if (same && !LIST) return;
  console.log((same ? 'ok    ' : 'DIFFER') + ' ' + g.name);
  g.paths.forEach(function (p, i) { console.log('         ' + (h[i] || 'MISSING     ') + '  ' + p); });
  if (!same) bad++;
});

if (LIST) {
  console.log('\nintended exceptions (not checked):');
  EXCEPTIONS.forEach(function (e) { console.log('  ' + e.paths + ' — ' + e.reason); });
}
if (bad) { console.log('\ncheck-copies: ' + bad + ' group(s) differ — see docs/copies.md'); process.exit(1); }
console.log('check-copies: ' + groups.length + ' groups identical');
