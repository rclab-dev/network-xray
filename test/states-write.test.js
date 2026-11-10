// states-write.test.js — clab-xray-collect.js writes xray-states.js with the expected bytes, one-shot and --watch:
// fixture router states (with problem.json and graph-level rows) and the scripts/scale-bench.js labs.
// The expected text is built here from the merged states, the same way the file has always been laid out.
// Run: node --test        (from the repo root; Node >= 18, no dependencies)
'use strict';
var test = require('node:test');
var assert = require('node:assert');
var fs = require('fs');
var os = require('os');
var path = require('path');
var cp = require('child_process');
var vm = require('vm');

var ROOT = path.join(__dirname, '..');
var BENCH = require(path.join(ROOT, 'scripts', 'scale-bench.js'));
var COLLECT = require(path.join(ROOT, 'clab-collect.js'));
var DIRS = [];
process.on('exit', function () { DIRS.forEach(function (d) { fs.rmSync(d, { recursive: true, force: true }); }); });

// stub per-node collector: copies <NX_STUB_DIR>/<node>.json to --out
var STUB = "var a=process.argv,o=a[a.indexOf('--out')+1],n=a[a.indexOf('--node')+1];" +
  "require('fs').copyFileSync(require('path').join(process.env.NX_STUB_DIR,n+'.json'),o);";

function expectedText(states, o) {
  return 'window.LIVE_STATES = ' + JSON.stringify(states) + ';\n' +
    (o.live ? 'window.LIVE_WATCH = true;\n' : '') +
    (o.problem ? 'window.XRAY_PROBLEM = ' + JSON.stringify(o.problem) + ';\n' : '') +
    (o.tiers ? 'window.XRAY_TIERS = ' + JSON.stringify(o.tiers) + ';\n' : '');
}

// the merge clab-xray-collect.js does after the children: per-node files in node order + the OSPF Hello-in pass
function mergeLikeCollector(files, nodes, adj, proto) {
  var states = {};
  nodes.forEach(function (n) { states[n] = JSON.parse(files[n]); });
  if (proto !== 'bgp') nodes.forEach(function (cn) {
    var st = states[cn], psm = st.peer_sending_hellos || (st.peer_sending_hellos = {});
    (adj[cn] || []).forEach(function (l) {
      var p = states[l.peer];
      psm[l.peer] = !!(p && !p.nx_unread && p.iface_hellos && p.iface_hellos[l.peerIface]);
      var h = p && p.iface_hellos && p.iface_hellos[l.peerIface];
      if (h > 0) (st.peer_hellos || (st.peer_hellos = {}))[l.peer] = h;
    });
    st.peer_sending_hello = Object.keys(psm).some(function (k) { return psm[k]; });
  });
  COLLECT.pairOspfIfaces(states, adj);   // nx_ospf_iface_params: as clab-xray-collect.js does
  return states;
}

// lab = { nodes, links: [[a, ai, b, bi]], files: {node: text}, levels?: {node: n}, problem? }
function writeLab(lab) {
  var dir = fs.mkdtempSync(path.join(os.tmpdir(), 'nx-write-')), out = path.join(dir, 'out'), stub = path.join(dir, 'stub');
  DIRS.push(dir);
  fs.mkdirSync(out); fs.mkdirSync(stub);
  fs.writeFileSync(path.join(out, 'clab-collect.js'), STUB);
  lab.nodes.forEach(function (n) { fs.writeFileSync(path.join(stub, n + '.json'), lab.files[n]); });
  var y = 'name: wr\ntopology:\n  nodes:\n';
  lab.nodes.forEach(function (n) {
    y += '    ' + n + ':\n      kind: linux\n';
    if (lab.levels && lab.levels[n] != null) y += '      labels:\n        graph-level: ' + lab.levels[n] + '\n';
  });
  y += '  links:\n';
  lab.links.forEach(function (l) { y += '    - endpoints: ["' + l[0] + ':' + l[1] + '", "' + l[2] + ':' + l[3] + '"]\n'; });
  fs.writeFileSync(path.join(dir, 'lab.clab.yml'), y);
  if (lab.problem) fs.writeFileSync(path.join(dir, 'problem.json'), JSON.stringify(lab.problem));
  return { dir: dir, out: out, stub: stub, topo: path.join(dir, 'lab.clab.yml') };
}
function adjOf(lab) {
  var adj = {};
  lab.nodes.forEach(function (n) { adj[n] = []; });
  lab.links.forEach(function (l) {
    adj[l[0]].push({ iface: l[1], peer: l[2], peerIface: l[3] });
    adj[l[2]].push({ iface: l[3], peer: l[0], peerIface: l[1] });
  });
  return adj;
}
function env(w) { return Object.assign({}, process.env, { NX_STUB_DIR: w.stub, TMPDIR: w.dir, TMP: w.dir, TEMP: w.dir }); }

function runOnce(w, proto, extra) {
  var r = cp.spawnSync(process.execPath, [path.join(ROOT, 'clab-xray-collect.js'), w.topo, w.out, proto].concat(extra || []),
    { cwd: w.dir, encoding: 'utf8', env: env(w), timeout: 120000, maxBuffer: 1 << 26 });
  assert.strictEqual(r.status, 0, r.stderr);
  return fs.readFileSync(path.join(w.out, 'xray-states.js'), 'utf8');
}
// --watch: wait for the first "updated xray-states.js" line (printed after the file is written), then stop
function runWatch(w, proto, extra) {
  return new Promise(function (resolve, reject) {
    var ch = cp.spawn(process.execPath, [path.join(ROOT, 'clab-xray-collect.js'), w.topo, w.out, proto, '--watch', '--interval', '60'].concat(extra || []),
      { cwd: w.dir, env: env(w), stdio: ['ignore', 'pipe', 'pipe'] });
    var so = '', se = '', done = false;
    var to = setTimeout(function () { finish(new Error('no write within 120 s: ' + se)); }, 120000);
    function finish(err) {
      if (done) return; done = true; clearTimeout(to); ch.kill('SIGKILL');
      if (err) return reject(err);
      resolve(fs.readFileSync(path.join(w.out, 'xray-states.js'), 'utf8'));
    }
    ch.stdout.on('data', function (d) { so += d; if (/updated xray-states\.js/.test(so)) finish(); });
    ch.stderr.on('data', function (d) { se += d; });
    ch.on('exit', function (c) { finish(new Error('exited ' + c + ': ' + se)); });
  });
}

function fixtureLab(name) {
  var d = path.join(ROOT, 'test', 'fixtures', name), files = {};
  var nodes = fs.readdirSync(d).filter(function (f) { return /^state_.+\.json$/.test(f); }).sort()
    .map(function (f) { var n = f.slice(6, -5); files[n] = fs.readFileSync(path.join(d, f), 'utf8'); return n; });
  var links = [], levels = {};
  for (var i = 0; i + 1 < nodes.length; i++) links.push([nodes[i], 'eth' + (i + 1), nodes[i + 1], 'eth' + (i + 1)]);
  nodes.forEach(function (n, i) { levels[n] = 1 + (i % 2); });
  return { nodes: nodes, links: links, files: files, levels: levels,
    problem: { focus: { node: nodes[0], prefix: '10.0.0.0/24' }, check: { all: [[nodes[0], 'success', 'eq', true]] }, format: 'network-xray-lab/0' } };
}

['iosxe-ecmp', 'iosxe-q15', 'iosxe-unnumbered'].forEach(function (fx) {
  ['ospf', 'bgp'].forEach(function (proto) {
    test('xray-states.js bytes, fixture ' + fx + ' ' + proto + ': one-shot and --watch', async function () {
      var lab = fixtureLab(fx), w = writeLab(lab);
      var states = mergeLikeCollector(lab.files, lab.nodes, adjOf(lab), proto);
      var tiers = {}; lab.nodes.forEach(function (n) { tiers[n] = lab.levels[n] - 1; });
      var problem = { focus: lab.problem.focus, check: lab.problem.check, format: lab.problem.format };
      assert.strictEqual(runOnce(w, proto), expectedText(states, { problem: problem, tiers: tiers }));
      assert.strictEqual(await runWatch(w, proto), expectedText(states, { live: true, problem: problem, tiers: tiers }));
    });
  });
});

// scale-bench labs: the per-node files the bench's collect step makes, merged by the real collector
function benchLab(n, proto) {
  var lab = BENCH.makeLab(n), nodes = [], files = {}, links = [];
  for (var i = 0; i < n; i++) {
    var nm = 'r' + (i + 1), o = lab.outputs[i], p = JSON.parse;
    nodes.push(nm);
    files[nm] = JSON.stringify(COLLECT.collectFromJson({
      node: nm, id: nm, proto: proto, mgmtSubnet: '172.20.20.0/24',
      adjacency: lab.topo.ifs[i].map(function (e) { return { iface: e.iface, peer: 'r' + (e.peer + 1) }; }),
      ospfConfigured: true, bgpConfigured: true,
      ospfNeighbor: p(o.ospfNeighbor), ospfInterface: p(o.ospfInterface), interface: p(o.interface),
      route: p(o.route), bgpSummary: p(o.bgpSummary), bgp: p(o.bgp)
    }), null, 2);
  }
  // the bench numbers each router's interfaces in link order; the same eth names on the same links
  lab.topo.links.forEach(function (l) {
    var a = lab.topo.ifs[l[0]].filter(function (e) { return e.peer === l[1]; })[0];
    links.push(['r' + (l[0] + 1), a.iface, 'r' + (l[1] + 1), a.peerIface]);
  });
  return { nodes: nodes, links: links, files: files };
}

[10, 50, 200].forEach(function (n) {
  ['ospf', 'bgp'].forEach(function (proto) {
    test('xray-states.js bytes, scale-bench lab ' + n + ' routers ' + proto + ': one-shot and --watch', { timeout: 600000 }, async function () {
      var lab = benchLab(n, proto), w = writeLab(lab);
      var states = mergeLikeCollector(lab.files, lab.nodes, adjOf(lab), proto);
      // the bench's own merge step makes the same LIVE_STATES text
      var bt = BENCH.runBench(n, { proto: proto, iterations: 1 }).text;
      assert.strictEqual(bt, expectedText(states, {}));
      var ctx = { window: {} }; vm.runInNewContext(bt, ctx);
      assert.strictEqual(Object.keys(ctx.window.LIVE_STATES).length, n);
      assert.strictEqual(runOnce(w, proto, ['--serial']), expectedText(states, {}));
      assert.strictEqual(await runWatch(w, proto, ['--serial']), expectedText(states, { live: true }));
    });
  });
});
