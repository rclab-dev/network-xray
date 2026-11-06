#!/usr/bin/env node
/* check-copies.js — files that are kept as copies in several places must stay byte-identical.
 *   usage: node scripts/check-copies.js [--list]
 *     --list : also print every checked group with its sha256 prefixes, and the exceptions
 * Exit 0 = all copies match, 1 = at least one copy differs or is missing (paths printed), or a file in
 * demo/compose-* has the name or content of a root file but is neither checked nor listed in EXCEPTIONS.
 * Groups: the engine files that scripts/gen_compose_bundle.js copies verbatim into demo/compose-* /web,
 * the collector scripts it copies into demo/compose-* /collector, the lab-independent files it writes
 * the same way into every bundle, and demo/decision-bracket.html (the GitHub Pages copy).
 * See docs/copies.md for the full inventory.
 */
var fs = require('fs'), path = require('path'), crypto = require('crypto');
var ROOT = path.resolve(__dirname, '..');

// copied verbatim from the repo root into <bundle>/web/ (gen_compose_bundle.js step 7)
var WEB_COPIES = ['xray-core.js', 'xray-api.js', 'clab-xray-bridge.js', 'xray-skin.js', 'xray-i18n.js', 'skin.html', 'decision-bracket.html'];
// copied verbatim from the repo root into <bundle>/collector/ (gen_compose_bundle.js step 8)
var COLLECTOR_COPIES = ['clab-collect.js', 'clab-xray-collect.js'];
// written with fixed content into every bundle (no lab-specific text) -> same in all bundles
var BUNDLE_CONSTANT = ['collector/Dockerfile', 'server/Dockerfile', 'web/xray-states.js'];

/* Intended exceptions: copies (or near-copies) that are NOT expected to be identical. One line each.
 * `bundleFiles` (paths inside each demo/compose-* bundle) marks files that share a name with a root file
 * but are not copies of it; test/check-copies.test.js accepts those without a group. */
var EXCEPTIONS = [
  { paths: 'demo/compose-*/web/index.html', bundleFiles: ['web/index.html'], reason: 'generated from xray-graph.html with the lab name + topology filled in, plus the hand-added nx_compose_wait_states patch' },
  { paths: 'demo/compose-*/collector/watch.sh', reason: 'embeds the lab protocol (bgp / ospf) in the collect command' },
  { paths: 'demo/compose-*/compose.yml', reason: 'per-lab services, networks and addresses' },
  { paths: 'demo/compose-*/README.md', bundleFiles: ['README.md'], reason: 'per-lab title and node name' },
  { paths: 'demo/compose-*/reload.sh', reason: 'embeds the lab\'s first node name (identical today only because both labs start with r1)' },
  { paths: 'demo/compose-*/collector/topo.clab.yml', reason: 'per-lab topology (endpoints remapped to compose eth numbering)' },
  { paths: 'demo/compose-*/r*/frr.conf, daemons', reason: 'per-lab router config (frr.conf is the transformed source config)' },
  { paths: 'demo/compose-*/collector/clab-srl-collect.js', reason: 'the generator copies it when present; the committed FRR-only bundles were generated before that and do not need it' },
  { paths: 'xray-graph-nextui.html vs xray-graph.html, demo/index*.html vs index.html', reason: 'different pages, not copies' },
  { paths: 'examples/**/{daemons,vtysh.conf,frr.conf}', reason: 'lab data that happens to be equal (unchanged routers between qN and qN-solved), not component copies' }
];

function isDir(p) { try { return fs.statSync(p).isDirectory(); } catch (e) { return false; } }

// every docker-compose bundle under demo/ (output of scripts/gen_compose_bundle.js)
function bundles(root) {
  var demo = path.join(root, 'demo');
  if (!isDir(demo)) return [];
  return fs.readdirSync(demo).filter(function (d) { return /^compose-/.test(d) && isDir(path.join(demo, d)); })
    .sort().map(function (d) { return 'demo/' + d; });
}

// groups of repo-relative paths that must be byte-identical. `root` is set when paths[0] is the root original.
function groups(root) {
  root = root || ROOT;
  var B = bundles(root), out = [];
  WEB_COPIES.forEach(function (f) { out.push({ name: f, root: f, paths: [f].concat(B.map(function (b) { return b + '/web/' + f; })) }); });
  COLLECTOR_COPIES.forEach(function (f) { out.push({ name: f, root: f, paths: [f].concat(B.map(function (b) { return b + '/collector/' + f; })) }); });
  // scripts/compose-server.js -> <bundle>/server/server.js (gen_compose_bundle.js step 9)
  out.push({ name: 'scripts/compose-server.js', root: 'scripts/compose-server.js', paths: ['scripts/compose-server.js'].concat(B.map(function (b) { return b + '/server/server.js'; })) });
  var db = out.filter(function (g) { return g.name === 'decision-bracket.html'; })[0];
  db.paths.push('demo/decision-bracket.html');   // GitHub Pages gallery copy of the root page
  BUNDLE_CONSTANT.forEach(function (f) { out.push({ name: f + ' (bundle)', paths: B.map(function (b) { return b + '/' + f; }) }); });
  // <bundle>/<node>/vtysh.conf: one fixed line written for every node
  out.push({ name: 'vtysh.conf (bundle)', paths: [].concat.apply([], B.map(function (b) {
    return fs.readdirSync(path.join(root, b)).filter(function (n) { return fs.existsSync(path.join(root, b, n, 'vtysh.conf')); }).sort()
      .map(function (n) { return b + '/' + n + '/vtysh.conf'; });
  })) });
  return out;
}

function sha(root, p) { return crypto.createHash('sha256').update(fs.readFileSync(path.join(root, p))).digest('hex').slice(0, 12); }

// compare every group; returns [{ name, same, paths, hashes, ref, problems: [{ path, kind: 'differs'|'missing' }] }]
function check(root) {
  root = root || ROOT;
  return groups(root).filter(function (g) { return g.paths.length >= 2; }).map(function (g) {
    var h = g.paths.map(function (p) { return fs.existsSync(path.join(root, p)) ? sha(root, p) : null; });
    var ref = g.paths[0], refHash = h[0], problems = [];
    g.paths.forEach(function (p, i) {
      if (h[i] === null) problems.push({ path: p, kind: 'missing' });
      else if (i > 0 && refHash !== null && h[i] !== refHash) problems.push({ path: p, kind: 'differs' });
    });
    return { name: g.name, root: g.root, ref: ref, paths: g.paths, hashes: h, same: problems.length === 0, problems: problems };
  });
}

function walk(root, rel) {
  return [].concat.apply([], fs.readdirSync(path.join(root, rel)).sort().map(function (n) {
    var r = rel + '/' + n;
    return isDir(path.join(root, r)) ? walk(root, r) : [r];
  }));
}

/* files in demo/compose-* that look like a copy of a root file (same name, or same bytes under another name)
 * but are neither in a group nor in an exception's bundleFiles -> [{ copy, root, why: 'name'|'content' }] */
function unlisted(root) {
  root = root || ROOT;
  var rootFiles = fs.readdirSync(root).filter(function (n) { return !isDir(path.join(root, n)); }).sort();
  var byHash = {};
  rootFiles.forEach(function (n) { var h = sha(root, n); (byHash[h] = byHash[h] || []).push(n); });
  var listed = {};
  groups(root).forEach(function (g) { if (g.root) g.paths.forEach(function (p) { listed[g.root + '\0' + p] = true; }); });
  var skip = {};
  EXCEPTIONS.forEach(function (e) { (e.bundleFiles || []).forEach(function (f) { skip[f] = true; }); });
  var out = [];
  bundles(root).forEach(function (b) {
    walk(root, b).forEach(function (p) {
      var inBundle = p.slice(b.length + 1), base = path.basename(p), cands = {};
      if (rootFiles.indexOf(base) >= 0) cands[base] = 'name';
      (byHash[sha(root, p)] || []).forEach(function (n) { if (!cands[n]) cands[n] = 'content'; });
      Object.keys(cands).sort().forEach(function (r) {
        if (listed[r + '\0' + p] || skip[inBundle]) return;
        out.push({ copy: p, root: r, why: cands[r] });
      });
    });
  });
  return out;
}

function describe(r, pr) {
  var what = r.root ? 'copy of ' + r.root : 'expected identical to ' + r.ref;
  if (pr.kind === 'missing') return pr.path === r.ref ? pr.path + ' is missing' + (r.root ? ' (root file)' : '') : pr.path + ' is missing (' + what + ')';
  return pr.path + ' differs from ' + r.ref + (r.root ? ' (root file)' : '');
}

function main(argv) {
  var LIST = argv.indexOf('--list') >= 0;
  if (argv.indexOf('-h') >= 0 || argv.indexOf('--help') >= 0) { console.log('usage: node scripts/check-copies.js [--list]\n  check that the files kept as copies (demo/compose-*, demo/) are byte-identical\n  --list      also print every checked group and the exceptions\n  -h, --help  show this help'); return 0; }
  var bad = argv.filter(function (s) { return ['--list'].indexOf(s) < 0; })[0];
  if (bad) { console.error('check-copies.js: unknown option: ' + bad + "\nTry 'node scripts/check-copies.js --help'."); return 2; }

  var res = check(ROOT), nbad = 0;
  res.forEach(function (r) {
    if (r.same && !LIST) return;
    console.log((r.same ? 'ok    ' : 'DIFFER') + ' ' + r.name);
    r.paths.forEach(function (p, i) { console.log('         ' + (r.hashes[i] || 'MISSING     ') + '  ' + p); });
    r.problems.forEach(function (pr) { console.log('       ! ' + describe(r, pr)); });
    if (!r.same) nbad++;
  });

  var miss = unlisted(ROOT);
  miss.forEach(function (u) {
    console.log('UNLISTED ' + u.copy + ' (' + (u.why === 'name' ? 'same name as' : 'same content as') + ' root file ' + u.root + ') — add it to scripts/check-copies.js or to EXCEPTIONS');
  });

  if (LIST) {
    console.log('\nintended exceptions (not checked):');
    EXCEPTIONS.forEach(function (e) { console.log('  ' + e.paths + ' — ' + e.reason); });
  }
  if (nbad || miss.length) {
    console.log('\ncheck-copies: ' + (nbad ? nbad + ' group(s) differ' : '') + (nbad && miss.length ? ', ' : '') +
      (miss.length ? miss.length + ' unlisted copy pair(s)' : '') + ' — see docs/copies.md');
    return 1;
  }
  console.log('check-copies: ' + groups(ROOT).length + ' groups identical');
  return 0;
}

module.exports = { WEB_COPIES: WEB_COPIES, COLLECTOR_COPIES: COLLECTOR_COPIES, BUNDLE_CONSTANT: BUNDLE_CONSTANT, EXCEPTIONS: EXCEPTIONS, bundles: bundles, groups: groups, check: check, describe: describe, unlisted: unlisted, main: main };

if (require.main === module) process.exit(main(process.argv.slice(2)));
