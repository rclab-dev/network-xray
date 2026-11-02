// parser-fuzz.test.js — broken or hostile router output must never crash or hang the parsers.
// Run: node --test        (from the repo root; Node >= 18, no dependencies)
//
// Seeded fuzzing of the FRR (frr-collect.js / clab-collect.js json, bgp-parse.js text), SR Linux
// (clab-srl-collect.js json) and Cisco IOS-XE (clab-iosxe-collect.js text) parsers. Starting from the real
// fixtures, each case applies one or more mutations: cut at a random point, empty output, a 1 MB line,
// binary / control characters, too few / too many columns, CRLF (or bare CR) line endings, unicode, and
// names replaced by HTML / script text. Every case must:
//   - return without throwing,
//   - finish quickly (each parser runs in a worker that is stopped if it hangs; the case is reported),
//   - give the documented shape (or an empty result / parse_warnings when nothing could be read),
//   - and, for the HTML cases, render through the page code with the text still escaped.
//
// Reproduce a failure: FUZZ_SEED=<seed> node --test test/parser-fuzz.test.js  (the seed and case number are
// in the failure message). FUZZ_CASES=<n> changes the number of cases per parser (default 300).
'use strict';
var wt = require('worker_threads');
var fs = require('fs');
var os = require('os');
var path = require('path');
var vm = require('vm');
var assert = require('node:assert');

var ROOT = path.join(__dirname, '..');
var SEED = parseInt(process.env.FUZZ_SEED || '20261102', 10) >>> 0;
var CASES = parseInt(process.env.FUZZ_CASES || '300', 10);
/* nx_fuzz_hang_progress (2026-11-03): HANG_MS is how long a worker may go WITHOUT starting a new case (counted from the
   worker coming online, reset on every case) - not a budget for all cases together. On a busy machine the 300 cases
   could take longer than 8 s in total and the case running at that moment was reported as a hang. A real hang (one
   case never ending) still fails after HANG_MS. Both limits can be raised for a slow CI with FUZZ_HANG_MS / FUZZ_SLOW_MS. */
var HANG_MS = parseInt(process.env.FUZZ_HANG_MS || '8000', 10);   // no new case for this long = a hang
var SLOW_MS = parseInt(process.env.FUZZ_SLOW_MS || '1500', 10);   // one parse call slower than this is reported (quadratic regex / loop)

// ---- seeded PRNG (mulberry32) ---------------------------------------------------------------------
function rng(seed) {
  var a = seed >>> 0;
  var f = function () {
    a = (a + 0x6D2B79F5) >>> 0;
    var t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  f.int = function (n) { return Math.floor(f() * n); };
  f.pick = function (arr) { return arr[f.int(arr.length)]; };
  return f;
}

// ---- hostile values -------------------------------------------------------------------------------
var EVIL = 'r1<img src=x onerror=alert(1)>';
var HTML = [EVIL, '"><script>alert(1)</script>', 'x" onmouseover="alert(1)', "2.2.2.2');alert(1);//",
  '</td></tr><img src=x>', '&lt;b&gt;&amp;'];
var UNI = ['ルータ1', 'Ethernet0/0\u00e9', '\ud83d\ude80', '\u202eevil', 'e\u0301', '\ud800', '\ufeff', '\u2028', '\u0085', 'Ω≈ç√'];
var CTRL = ['\u0000', '\u0001', '\u0007', '\b', '\u001b[31m', '\u001b[0m', '\u007f', '\ufffd', '\t', '\f', '\v', '\u00ff\u00fe'];
var MB = 1024 * 1024;

// ---- text mutators (each returns a new string) -------------------------------------------------------
function splitLines(s) { return String(s).split('\n'); }
var MUT = {
  truncate: function (s, r) { return s.slice(0, r.int(s.length + 1)); },
  empty: function (s, r) { return r.pick(['', '\n', ' ', '\r\n\r\n', '\n\n\n']); },
  longLine: function (s, r) {
    var l = splitLines(s), at = r.int(l.length + 1), kind = r.int(4), line;
    if (kind === 0) line = 'A'.repeat(MB);
    else if (kind === 1) line = 'a' + ' '.repeat(MB) + 'b';                          // backtracking bait
    else if (kind === 2) line = (l[r.int(l.length)] || '1.1.1.1') + ' 1.1.1.1/24'.repeat(MB / 11);
    else line = '10.0.0.1 ' + '\t 4 65002 '.repeat(MB / 10);                            // looks like a neighbor row
    l.splice(at, 0, line);
    return l.join('\n');
  },
  control: function (s, r) {
    var n = 1 + r.int(8), out = s;
    for (var i = 0; i < n; i++) { var at = r.int(out.length + 1); out = out.slice(0, at) + r.pick(CTRL) + out.slice(at); }
    return out;
  },
  columns: function (s, r) {
    var l = splitLines(s);
    var n = 1 + r.int(Math.max(1, l.length));
    for (var i = 0; i < n; i++) {
      var k = r.int(l.length), t = l[k].trim().split(/\s+/).filter(Boolean), op = r.int(4);
      if (op === 0) t.splice(r.int(t.length + 1), 1 + r.int(3));                            // drop columns
      else if (op === 1) t.splice(r.int(t.length + 1), 0, t[r.int(t.length)] || 'x');       // duplicate one
      else if (op === 2) for (var j = 0; j < 20; j++) t.push(String(r.int(70000)));          // many extra
      else t = t.slice(0, 1);                                                                // only the first
      l[k] = t.join(r.pick([' ', '  ', '\t', '      ']));
    }
    return l.join('\n');
  },
  crlf: function (s, r) { return r.int(3) ? s.replace(/\n/g, '\r\n') : s.replace(/\n/g, '\r'); },
  unicode: function (s, r) {
    var n = 1 + r.int(6), out = s;
    for (var i = 0; i < n; i++) { var at = r.int(out.length + 1); out = out.slice(0, at) + r.pick(UNI) + out.slice(at); }
    return out;
  },
  html: function (s, r) {          // replace a few name-like tokens (letters first) with markup
    var toks = s.match(/[A-Za-z][A-Za-z0-9\/.:_-]*/g) || [];
    var out = s;
    for (var i = 0; i < 1 + r.int(4) && toks.length; i++) { out = out.split(r.pick(toks)).join(r.pick(HTML)); }
    return r.int(2) ? out : out + '\n' + r.pick(HTML);
  }
};
var MUT_NAMES = Object.keys(MUT);
function mutateText(s, r, name) {
  if (name !== 'combo') return MUT[name](String(s), r);
  var out = String(s), n = 2 + r.int(2);
  for (var i = 0; i < n; i++) { var m = r.pick(MUT_NAMES); if (m !== 'longLine') out = MUT[m](out, r); }
  return out;
}

// ---- json mutator (FRR / SR Linux): wrong types, hostile strings, missing keys ------------------------
var WRONG = [null, '', 0, -1, 1e300, NaN, true, [], {}, [null], 'not-an-object', '999.999.999.999/99'];
function mutateJson(obj, r) {
  var hostile = HTML.concat(UNI, CTRL, ['x'.repeat(4096)]);
  function walk(v, depth) {
    if (Array.isArray(v)) {
      if (r() < 0.1) v = v.slice(0, r.int(v.length + 1));
      return v.map(function (e) { return walk(e, depth + 1); });
    }
    if (v && typeof v === 'object') {
      var o = {};
      Object.keys(v).forEach(function (k) {
        var p = r();
        if (p < 0.05) return;                                                    // key missing
        var nk = p < 0.1 ? r.pick(HTML.concat(UNI)) : k;                         // hostile key (iface / prefix / name)
        o[nk] = p > 0.92 ? r.pick(WRONG) : walk(v[k], depth + 1);                // wrong type
      });
      return o;
    }
    if (typeof v === 'string') return r() < 0.3 ? r.pick(hostile) : v;
    if (typeof v === 'number') return r() < 0.1 ? r.pick(WRONG) : v;
    return v;
  }
  return walk(obj, 0);
}

// ---- page renderers in a vm sandbox (as in test/escape.test.js) ------------------------------------
function stub() {
  var fn = function () {};
  return new Proxy(fn, {
    get: function (t, k) {
      if (k === Symbol.toPrimitive) return function () { return ''; };
      if (k === 'length') return 0;
      if (typeof k === 'string' && Object.prototype.hasOwnProperty.call(t, k) && !(k in Function.prototype)) return t[k];
      return stub();
    },
    apply: function () { return stub(); },
    set: function (t, k, v) { t[k] = v; return true; }
  });
}
function sandbox(files) {
  var de = stub(); de.getAttribute = function () { return 'en'; };
  var doc = {
    getElementById: function () { return null; }, querySelector: function () { return null; },
    querySelectorAll: function () { return []; }, createElement: function () { return stub(); },
    addEventListener: function () {}, head: stub(), body: stub(), documentElement: de, readyState: 'complete', currentScript: null
  };
  var ctx = {
    document: doc, console: { log: function () {}, warn: function () {}, error: function () {} },
    setTimeout: function () { return 0; }, clearTimeout: function () {},
    setInterval: function () { return 0; }, clearInterval: function () {}, requestAnimationFrame: function () { return 0; },
    navigator: { userAgent: '' }, location: { search: '', href: '', hash: '' },
    localStorage: { getItem: function () { return null; }, setItem: function () {} },
    getComputedStyle: function () { return {}; }, addEventListener: function () {}
  };
  ctx.window = ctx; ctx.self = ctx;
  vm.createContext(ctx);
  files.forEach(function (f) { vm.runInContext(fs.readFileSync(path.join(ROOT, f), 'utf8'), ctx, { filename: f }); });
  return ctx;
}
function fakeContainer() {
  return { innerHTML: '', style: {}, querySelectorAll: function () { return []; }, querySelector: function () { return null; },
    addEventListener: function () {}, getBoundingClientRect: function () { return { left: 0, top: 0, width: 600, height: 400 }; },
    classList: { add: function () {}, remove: function () {}, contains: function () { return false; } }, setAttribute: function () {} };
}
function assertNoMarkup(html, what) {
  assert.ok(html.indexOf('<img') < 0, what + ': raw <img> in output');
  assert.ok(html.indexOf('<script') < 0, what + ': raw <script> in output');
  assert.ok(!/" onmouseover=/.test(html), what + ': attribute break-out in output');
  // a quote in text content is harmless; inside a tag that has an on* handler it would end the JS string
  (html.match(/<[^>]*>/g) || []).forEach(function (tag) {
    assert.ok(!(/\son[a-z]+=/i.test(tag) && tag.indexOf("');alert(1)") >= 0), what + ': JS string break-out in ' + tag.slice(0, 200));
  });
}
var _pages = null;
function pages() {
  if (!_pages) _pages = { core: sandbox(['xray-core.js']), panel: sandbox(['xray-node-panel.js']) };
  return _pages;
}
// a state as it reaches the page: the node panel (text + data-* attributes) and the BGP table
function assertRendersEscaped(st, what) {
  var p = pages(), c = fakeContainer();
  p.panel.XrayNodePanel.render(c, st, { figure: true });
  assertNoMarkup(String(c.innerHTML), what + ' node panel');
  var rows = (st.bgp_routes || []).map(function (r) {
    return { prefix: r.prefix, nexthop: r.next_hop || r.nexthop, as_path: r.as_path, status: r.status, origin: r.origin,
      locprf: r.local_pref, metric: r.metric };
  });
  if (rows.length) assertNoMarkup(p.core.xrayBuildBgpView(rows).table, what + ' bgp table');
}

// ---- shape checks -----------------------------------------------------------------------------------
function assertState(st, node, what) {
  assert.ok(st && typeof st === 'object', what + ': state is an object');
  assert.strictEqual(st.success, true, what + ': success');
  assert.strictEqual(st.target_node, node, what + ': target_node');
  assert.ok(st.interfaces && typeof st.interfaces === 'object' && !Array.isArray(st.interfaces), what + ': interfaces is an object');
  Object.keys(st.interfaces).forEach(function (k) {
    assert.strictEqual(typeof st.interfaces[k].up, 'boolean', what + ': interfaces[' + JSON.stringify(k) + '].up');
    assert.strictEqual(typeof st.interfaces[k].ip, 'string', what + ': interfaces[' + JSON.stringify(k) + '].ip');
  });
  assert.strictEqual(typeof st.full_count, 'number', what + ': full_count');
  assert.ok(st.full_count >= 0, what + ': full_count >= 0');
  assert.strictEqual(typeof st.has_full, 'boolean', what + ': has_full');
  assert.strictEqual(typeof st.neighbor_state, 'string', what + ': neighbor_state');
  assert.strictEqual(typeof st.wan_iface, 'string', what + ': wan_iface');
  assert.ok(st.route_resolution && typeof st.route_resolution.resolved === 'boolean', what + ': route_resolution.resolved');
  assert.ok(Array.isArray(st.routing_table), what + ': routing_table is an array');
  st.routing_table.forEach(function (r) { assert.strictEqual(typeof r.prefix, 'string', what + ': routing_table prefix'); });
  if (st.bgp_neighbors !== undefined) assert.ok(Array.isArray(st.bgp_neighbors), what + ': bgp_neighbors is an array');
  if (st.bgp_routes !== undefined) {
    assert.ok(Array.isArray(st.bgp_routes), what + ': bgp_routes is an array');
    st.bgp_routes.forEach(function (r) { assert.strictEqual(typeof r.prefix, 'string', what + ': bgp_routes prefix'); });
  }
  if (st.parse_warnings !== undefined) {
    assert.ok(Array.isArray(st.parse_warnings) && st.parse_warnings.length, what + ': parse_warnings absent or non-empty');
  }
  assert.doesNotThrow(function () { JSON.stringify(st); }, what + ': JSON-serializable');
}
var IP_RE = /^\d{1,3}(?:\.\d{1,3}){3}$/;
function assertBgpParse(sum, tbl, b, what) {
  assert.ok(Array.isArray(sum.neighbors), what + ': summary.neighbors');
  sum.neighbors.forEach(function (n) {
    assert.ok(IP_RE.test(n.ip), what + ': neighbor ip ' + n.ip);
    assert.strictEqual(typeof n.established, 'boolean', what + ': neighbor established');
    assert.ok(typeof n.pfxRcvd === 'number' && n.pfxRcvd >= 0, what + ': neighbor pfxRcvd');
    assert.strictEqual(typeof n.state, 'string', what + ': neighbor state');
  });
  assert.ok(Array.isArray(tbl.routes), what + ': table.routes');
  tbl.routes.forEach(function (r) {
    assert.ok(/^\d{1,3}(?:\.\d{1,3}){3}\/\d+$/.test(r.prefix), what + ': route prefix ' + r.prefix);
    assert.ok(IP_RE.test(r.nexthop), what + ': route nexthop');
    assert.strictEqual(typeof r.best, 'boolean', what + ': route best');
    ['metric', 'local_pref', 'weight'].forEach(function (k) { assert.strictEqual(typeof r[k], 'number', what + ': route ' + k); });
    assert.strictEqual(typeof r.as_path, 'string', what + ': route as_path');
  });
  assert.ok(b && b.config && Array.isArray(b.config.nodes) && b.config.nodes.length >= 1, what + ': build config.nodes');
  assert.strictEqual(b.state.success, true, what + ': build state.success');
  assert.strictEqual(typeof b.state.is_established, 'boolean', what + ': build is_established');
  assert.strictEqual(typeof b.state.pfx_rcvd, 'number', what + ': build pfx_rcvd');
  assert.ok(Array.isArray(b.bgpRows), what + ': build bgpRows');
  assert.doesNotThrow(function () { JSON.stringify([b.config, b.state, b.topo, b.bgpRows]); }, what + ': JSON-serializable');
}

// ---- fixtures ---------------------------------------------------------------------------------------
// FRR `show bgp summary` / `show ip bgp` text, captured from a live FRR lab (same as the bgp-parse.js self-test)
var FRR_SUM = ['BGP router identifier 10.59.0.10, local AS number 65001 vrf-id 0', '',
  'Neighbor        V         AS   MsgRcvd   MsgSent   TblVer  InQ OutQ  Up/Down State/PfxRcd   PfxSnt Desc',
  '10.58.0.20      4      65002        15        15        2    0    0 00:00:27            1        1 N/A',
  '10.59.0.20      4      65003        12        13        2    0    0 00:00:26            1        1 N/A',
  'Total number of neighbors 2'].join('\n');
var FRR_TBL = ['BGP table version is 2, local router ID is 10.59.0.10, vrf id 0',
  '   Network          Next Hop            Metric LocPrf Weight Path',
  '*> 8.8.8.0/24       10.59.0.20               0             0 65003 i',
  '*                   10.58.0.20               0     50      0 65002 i',
  'Displayed 1 routes and 2 total paths'].join('\n');
function readDir(dir, ext) {
  var m = {};
  fs.readdirSync(dir).filter(function (f) { return f.slice(-ext.length) === ext; })
    .forEach(function (f) { m[f] = fs.readFileSync(path.join(dir, f), 'utf8'); });
  return m;
}

// ---- per-parser fuzz bodies (run inside a worker) -------------------------------------------------
// each takes (r, mutName, i) and runs one case; `report(what, ms)` records the slowest call
var TARGETS = {
  'bgp-parse': function () {
    var ctx = { window: {} };
    vm.createContext(ctx);
    vm.runInContext(fs.readFileSync(path.join(ROOT, 'bgp-parse.js'), 'utf8'), ctx, { filename: 'bgp-parse.js' });
    var B = ctx.window.BGPFRR;
    return function (r, mut, what, timed) {
      var sum = r.int(4) ? mutateText(FRR_SUM, r, mut) : FRR_SUM;
      var tbl = r.int(4) ? mutateText(FRR_TBL, r, mut) : FRR_TBL;
      var s = timed('parseSummary', function () { return B.parseSummary(sum); });
      var t = timed('parseBgpTable', function () { return B.parseBgpTable(tbl); });
      var b = timed('build', function () { return B.build(sum, tbl, 'r1'); });
      assertBgpParse(s, t, b, what);
      if (mut === 'html' || mut === 'combo') {
        var rows = b.bgpRows.map(function (x) { return { prefix: x.prefix, nexthop: x.nexthop, as_path: x.as_path, status: x.status, origin: x.origin }; });
        if (rows.length) assertNoMarkup(pages().core.xrayBuildBgpView(rows).table, what + ' bgp table');
      }
    };
  },

  'frr-collect': function () {
    var clab = require(path.join(ROOT, 'clab-collect.js'));
    var frr = require(path.join(ROOT, 'frr-collect.js'));
    var ospf = readDir(path.join(ROOT, 'fixtures', 'frr-collect-sample', 'r1'), '.json');
    var bgpDir = path.join(ROOT, 'test', 'fixtures', 'bestpath-frr');
    var bgp = readDir(bgpDir, '.json');
    var bgpNames = Object.keys(bgp).sort();
    var tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'xray-fuzz-frr-'));
    process.on('exit', function () { try { fs.rmSync(tmp, { recursive: true, force: true }); } catch (e) { /* ignore */ } });
    var ADJ = [{ iface: 'eth0', peer: 'r2' }, { iface: 'eth1', peer: 'r3' }];
    return function (r, mut, what, timed, i) {
      var proto = r.pick(['ospf', 'bgp', 'auto']);
      var files = Object.assign({}, ospf);
      files['show_ip_bgp.json'] = bgp[bgpNames[i % bgpNames.length]];
      var st;
      if (r.int(2)) {
        // text damage, read back the way --from-dir reads it (JSON.parse of the file)
        fs.readdirSync(tmp).forEach(function (f) { fs.unlinkSync(path.join(tmp, f)); });
        Object.keys(files).forEach(function (f) { fs.writeFileSync(path.join(tmp, f), r.int(3) ? mutateText(files[f], r, mut) : files[f]); });
        st = timed('collectFromDir', function () { return frr.collectFromDir({ node: 'r1', fromDir: tmp, proto: proto, adjacency: ADJ }).state; });
      } else {
        // structural damage: wrong types, hostile keys / strings, missing keys
        var j = {};
        Object.keys(files).forEach(function (f) { j[f] = mutateJson(JSON.parse(files[f]), r); });
        st = timed('collectFromJson', function () {
          return clab.collectFromJson({ node: 'r1', id: 'r1', proto: proto === 'auto' ? 'ospf' : proto, adjacency: ADJ,
            ospfNeighbor: j['show_ip_ospf_neighbor.json'], ospfInterface: j['show_ip_ospf_interface.json'],
            route: j['show_ip_route.json'], bgp: j['show_ip_bgp.json'], bgpSummary: r.int(2) ? null : mutateJson({ ipv4Unicast: { peers: {} } }, r) });
        });
      }
      assertState(st, 'r1', what);
      if (mut === 'html' || mut === 'combo' || !r.int(4)) assertRendersEscaped(st, what);
    };
  },

  'clab-srl-collect': function () {
    var srl = require(path.join(ROOT, 'clab-srl-collect.js'));
    var files = readDir(path.join(ROOT, 'fixtures', 'srl-collect-sample', 'r1'), '.json');
    var ADJ = { 'ethernet-1/1.0': 'r2', 'ethernet-1/2.0': 'r3' };
    return function (r, mut, what, timed) {
      var proto = r.pick(['ospf', 'bgp']);
      var fetch;
      if (r.int(2)) {
        // text damage, parsed exactly as dirFetch parses a replay file
        var txt = {};
        Object.keys(files).forEach(function (f) { txt[f] = r.int(3) ? mutateText(files[f], r, mut) : files[f]; });
        fetch = function (p) { var f = txt[srl.pathToFile(p)]; if (f == null) return null; try { return JSON.parse(f); } catch (e) { return null; } };
      } else {
        var obj = {};
        Object.keys(files).forEach(function (f) { obj[f] = mutateJson(JSON.parse(files[f]), r); });
        fetch = function (p) { var o = obj[srl.pathToFile(p)]; return o === undefined ? null : o; };
      }
      var st = timed('buildState', function () { return srl.buildState(fetch, 'r1', ADJ, proto); });
      assertState(st, 'r1', what);
      assert.ok(st.interfaces['system0.0'], what + ': loopback always present');
      if (mut === 'html' || mut === 'combo' || !r.int(4)) assertRendersEscaped(st, what);
    };
  },

  'clab-iosxe-collect': function () {
    var ios = require(path.join(ROOT, 'clab-iosxe-collect.js'));
    var FIX = path.join(ROOT, 'test', 'fixtures');
    var nodes = [];
    fs.readdirSync(FIX).filter(function (d) { return /^iosxe-/.test(d); }).sort().forEach(function (lab) {
      fs.readdirSync(path.join(FIX, lab)).sort().filter(function (n) { return fs.statSync(path.join(FIX, lab, n)).isDirectory(); })
        .forEach(function (n) {
          var tx = {};
          ios.CMDS.forEach(function (c) {
            var f = path.join(FIX, lab, n, c[1].replace(/ /g, '_') + '.txt');
            if (fs.existsSync(f)) tx[c[0]] = fs.readFileSync(f, 'utf8');
          });
          nodes.push({ name: n, tx: tx });
        });
    });
    return function (r, mut, what, timed, i) {
      var nd = nodes[i % nodes.length], tx = {};
      Object.keys(nd.tx).forEach(function (k) { tx[k] = r.int(3) ? mutateText(nd.tx[k], r, mut) : nd.tx[k]; });
      var proto = r.pick(['ospf', 'bgp']);
      var st = timed('run', function () { return ios.run(tx, nd.name, 'Ethernet0/1:x1,Ethernet0/2:x2', proto); });
      assertState(st, nd.name, what);
      assert.strictEqual(st.nos, 'ios-xe', what + ': nos');
      // the same outputs as one terminal log (prompt-separated), as --from-log reads them
      var raw = ios.CMDS.map(function (c) { return nd.name + '#' + c[1] + '\n' + (tx[c[0]] || ''); }).join('\n');
      var parts = timed('splitByPrompt', function () { return ios.splitByPrompt(r.int(2) ? raw : mutateText(raw, r, mut)); });
      assert.ok(parts && typeof parts === 'object', what + ': splitByPrompt object');
      if (mut === 'html' || mut === 'combo' || !r.int(4)) assertRendersEscaped(st, what);
    };
  }
};

// ---- worker side ------------------------------------------------------------------------------------
if (!wt.isMainThread && wt.workerData && wt.workerData.fuzzTarget) {
  var name = wt.workerData.fuzzTarget, seed = wt.workerData.seed, cases = wt.workerData.cases;
  var slowest = { ms: 0, what: '' };
  var runCase;
  try { runCase = TARGETS[name](); } catch (e) { wt.parentPort.postMessage({ type: 'fail', what: name + ' setup', err: String(e && e.stack || e) }); }
  if (runCase) {
    var failures = [];
    for (var i = 0; i < cases; i++) {
      var mut = MUT_NAMES.concat(['combo'])[i % (MUT_NAMES.length + 1)];
      var caseSeed = (seed + Math.imul(i + 1, 0x9E3779B1)) >>> 0;
      var r = rng(caseSeed);
      var what = name + ' case ' + i + ' (' + mut + ', FUZZ_SEED=' + seed + ')';
      wt.parentPort.postMessage({ type: 'case', what: what });
      var timed = function (fn, f) {
        var t0 = Date.now(), out;
        try { out = f(); } catch (e) { throw new Error(fn + ' threw: ' + (e && e.stack || e)); }
        var ms = Date.now() - t0;
        if (ms > slowest.ms) slowest = { ms: ms, what: what + ' ' + fn };
        if (ms > SLOW_MS) throw new Error(fn + ' took ' + ms + ' ms');
        return out;
      };
      try { runCase(r, mut, what, timed, i); } catch (e) {
        var msg = String(e && e.message || e);
        failures.push(msg.indexOf(what) === 0 ? msg : what + ': ' + msg);
        if (failures.length >= 5) break;
      }
    }
    wt.parentPort.postMessage({ type: 'done', failures: failures, slowest: slowest, cases: cases });
  }
  return;
}

// ---- main side: one worker per parser, all started at once ------------------------------------------
var test = require('node:test');

function runWorker(name) {
  return new Promise(function (resolve) {
    var w = new wt.Worker(__filename, { workerData: { fuzzTarget: name, seed: SEED, cases: CASES } });
    var last = '(setup)', settled = false;
    function finish(res) { if (!settled) { settled = true; clearTimeout(timer); resolve(res); } }
    var timer = null;
    function arm() {   // nx_fuzz_hang_progress: (re)start the no-progress clock
      if (settled) return;
      clearTimeout(timer);
      timer = setTimeout(function () {
        w.terminate();
        finish({ failures: ['hang: no new case for ' + HANG_MS + ' ms, stuck at ' + last] });
      }, HANG_MS);
    }
    arm();               // also covers a worker that never comes online
    w.on('online', arm);
    w.on('message', function (m) {
      if (m.type === 'case') { last = m.what; arm(); }
      else if (m.type === 'fail') finish({ failures: [m.what + ': ' + m.err] });
      else if (m.type === 'done') { finish(m); w.terminate(); }
    });
    w.on('error', function (e) { finish({ failures: ['worker error at ' + last + ': ' + (e && e.stack || e)] }); });
    w.on('exit', function (code) { finish({ failures: ['worker exited (' + code + ') at ' + last] }); });
  });
}

var running = {};
Object.keys(TARGETS).forEach(function (name) { running[name] = runWorker(name); });

Object.keys(TARGETS).forEach(function (name) {
  test('fuzz ' + name + ': ' + CASES + ' mutated fixtures (seed ' + SEED + ') - no throw, no hang, documented shape, escaped on the page', function () {
    return running[name].then(function (res) {
      assert.deepStrictEqual(res.failures, [], res.failures.join('\n'));
      assert.strictEqual(res.cases, CASES);
    });
  });
});

test('seeded generator is reproducible', function () {
  var a = rng(7), b = rng(7), c = rng(8);
  var sa = [], sb = [], sc = [];
  for (var i = 0; i < 5; i++) { sa.push(a()); sb.push(b()); sc.push(c()); }
  assert.deepStrictEqual(sa, sb);
  assert.notDeepStrictEqual(sa, sc);
  assert.strictEqual(MUT.truncate('abcdef', rng(1)), MUT.truncate('abcdef', rng(1)));
});
