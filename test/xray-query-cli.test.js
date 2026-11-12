// xray-query-cli.test.js - scripts/xray-query.js as a command: every subcommand in both output formats, on FRR, SR Linux
// and IOS-XE state, an empty state and an unknown router; the --format table text must carry the same facts as the JSON.
// Run: node --test        (from the repo root; Node >= 18, no dependencies)
'use strict';
var test = require('node:test');
var assert = require('node:assert');
var fs = require('fs');
var os = require('os');
var path = require('path');
var cp = require('child_process');

var ROOT = path.join(__dirname, '..');
var QUERY = path.join(ROOT, 'scripts', 'xray-query.js');
var Q15 = path.join(ROOT, 'test', 'fixtures', 'iosxe-q15');
var ECMP = path.join(ROOT, 'test', 'fixtures', 'iosxe-ecmp');
var FRR_R1 = path.join(ROOT, 'fixtures', 'frr-collect-sample', 'r1');
var SRL_R1 = path.join(ROOT, 'fixtures', 'srl-collect-sample', 'r1');
var srl = require(path.join(ROOT, 'clab-srl-collect.js'));

function exec(args) {
  var r = cp.spawnSync(process.execPath, [QUERY].concat(args), { encoding: 'utf8' });
  return { code: r.status, out: r.stdout, err: r.stderr };
}
function json(args) {
  var r = exec(args);
  return { code: r.code, out: JSON.parse(r.out), err: r.err };
}
var TMPS = [];
process.on('exit', function () { TMPS.forEach(function (d) { fs.rmSync(d, { recursive: true, force: true }); }); });
function tmp() { var d = fs.mkdtempSync(path.join(os.tmpdir(), 'xq-cli-')); TMPS.push(d); return d; }
function writeState(dir, name, st) { fs.writeFileSync(path.join(dir, 'state_' + name + '.json'), JSON.stringify(st)); return dir; }

// SR Linux state built by the collector itself: the bundled capture (OSPF), and an eBGP session with one learned route
function fx(map) { return function (p) { for (var k in map) { if (p.indexOf(k) >= 0) return map[k]; } return null; }; }
function srlOspfState() { return srl.buildState(srl.dirFetch(SRL_R1), 'r1', { 'ethernet-1/1.0': 'r2' }, 'ospf'); }
function srlBgpState() {
  return srl.buildState(fx({
    'interface ethernet-1/1 subinterface 0 ipv4': { 'admin-state': 'enable', address: [{ 'ip-prefix': '10.0.0.1/30' }] },
    'protocols bgp neighbor': { neighbor: [{ 'peer-address': '10.0.0.2', 'session-state': 'established', 'peer-as': 65002,
      'peer-type': 'ebgp', 'afi-safi': [{ 'afi-safi-name': 'ipv4-unicast', 'received-routes': 1 }] }] },
    'local-rib': { route: [{ prefix: '8.8.8.0/24', neighbor: '10.0.0.2', 'origin-protocol': 'bgp', 'best-route': true, 'attr-id': '5' }] },
    'attr-sets': { 'attr-set': [{ index: '5', origin: 'igp', 'next-hop': '10.0.0.2', 'local-pref': 100,
      'as-path': { segment: [{ member: [65002, 65100] }] } }] }
  }), 'r1', { 'ethernet-1/1.0': 'r2' }, 'bgp');
}

// a saved FRR BGP node directory (frr-collect.js --from-dir layout): two paths to 203.0.113.0/24, the LocalPref 200 one best
function frrBgpDir() {
  var node = path.join(tmp(), 'r1');
  fs.mkdirSync(node);
  fs.writeFileSync(path.join(node, 'show_ip_bgp_summary.json'), JSON.stringify({ ipv4Unicast: { peers: {
    '10.0.1.2': { remoteAs: 65002, localAs: 65001, state: 'Established', pfxRcd: 1 },
    '10.0.2.3': { remoteAs: 65003, localAs: 65001, state: 'Active', pfxRcd: 0 } } } }));
  fs.writeFileSync(path.join(node, 'show_ip_bgp.json'), JSON.stringify({ routes: { '203.0.113.0/24': [
    { prefix: '203.0.113.0', prefixLen: 24, nexthops: [{ ip: '10.0.1.2' }], valid: true, locPrf: 100, weight: 0, path: '65002', origin: 'IGP' },
    { prefix: '203.0.113.0', prefixLen: 24, nexthops: [{ ip: '10.0.2.3' }], valid: true, bestpath: true, selectionReason: 'Local Pref',
      locPrf: 200, weight: 0, path: '65003', origin: 'IGP' }] } }));
  return node;
}

// one xray-states.js with an FRR, an SR Linux and an IOS-XE router (what clab-xray-collect.js writes for a mixed lab)
function mixedLab() {
  var q = require(QUERY);
  var states = {
    frr1: q.loadStates(FRR_R1).r1,
    srl1: srlBgpState(),
    xe1: JSON.parse(fs.readFileSync(path.join(Q15, 'state_r1.json'), 'utf8'))
  };
  var file = path.join(tmp(), 'xray-states.js');
  fs.writeFileSync(file, 'window.LIVE_STATES = ' + JSON.stringify(states) + ';\nwindow.LIVE_WATCH = true;\n');
  return file;
}

// ---- table text -> sections of rows (columns are at least two spaces apart; '-' is an empty cell) ----
function parseTables(text) {
  var sections = {}, cur = null;
  text.replace(/\n$/, '').split('\n').forEach(function (l) {
    if (l === '') { cur = null; return; }
    if (!/^ /.test(l)) { cur = { title: l, head: null, rows: [], lines: [] }; sections[l.replace(/ \(.*$/, '')] = cur; return; }
    cur.lines.push(l);
    if (/^  [a-z ]+: /.test(l)) return;   // "  best:  via ..." lines of the why output
    var cells = l.trim().split(/ {2,}/);
    if (l.trim() === 'none') return;
    if (!cur.head) { cur.head = cells; return; }
    var row = {};
    // a blank first cell (the B column of a non-best candidate) shifts the split: realign from the right
    if (cells.length < cur.head.length) cells = new Array(cur.head.length - cells.length + 1).join(' ').split(' ').slice(1).concat(cells);
    cur.head.forEach(function (h, i) { row[h] = cells[i] === '-' ? null : cells[i]; });
    cur.rows.push(row);
  });
  return sections;
}
function str(v) { return v == null || v === '' ? null : String(v); }

// every fact the state table prints, checked against the state JSON of the same input
function assertStateTableMatchesJson(input) {
  var j = json(['state', input]), t = exec(['state', input, '--format', 'table']);
  assert.strictEqual(j.code, 0, input);
  assert.strictEqual(t.code, 0, input);
  t.out.split('\n').forEach(function (l) { assert.ok(l.length < 100, 'line under 100 characters: ' + l); });
  var s = parseTables(t.out), c = j.out.counts;

  assert.strictEqual(s.Routers.title, 'Routers (' + c.nodes + ')');
  assert.deepStrictEqual(s.Routers.rows.map(function (r) { return r.ROUTER; }), j.out.nodes.map(function (n) { return n.name; }));
  j.out.nodes.forEach(function (n, i) {
    var row = s.Routers.rows[i];
    assert.strictEqual(row.NOS, str(n.nos), n.name + ' NOS');
    var up = n.interfaces.filter(function (x) { return x.up; }).length;
    assert.strictEqual(row['IFACES UP'], up + '/' + n.interfaces.length, n.name + ' interfaces up');
    assert.strictEqual(+row['OSPF NBRS'], j.out.ospf_adjacencies.filter(function (x) { return x.node === n.name; }).length, n.name + ' OSPF');
    assert.strictEqual(+row['BGP PEERS'], j.out.bgp_sessions.filter(function (x) { return x.node === n.name; }).length, n.name + ' BGP');
  });

  var o = s['OSPF neighbors'];
  assert.strictEqual(o.title, 'OSPF neighbors (' + c.ospf_full + '/' + c.ospf_total + ' Full)');
  assert.deepStrictEqual(o.rows.map(function (r) {
    return [r.ROUTER, r['NEIGHBOR ID'], r.ADDRESS, r.INTERFACE, r.STATE, r.ROLE || null, r.PEER || null];
  }), j.out.ospf_adjacencies.map(function (x) {
    return [x.node, str(x.neighbor_id), str(x.address), str(x.iface), str(x.state), str(x.role), str(x.peer)];
  }));
  if (!c.ospf_total) assert.deepStrictEqual(o.lines, ['  none']);

  var b = s['BGP neighbors'];
  assert.strictEqual(b.title, 'BGP neighbors (' + c.bgp_established + '/' + c.bgp_total + ' Established)');
  assert.deepStrictEqual(b.rows.map(function (r) {
    return [r.ROUTER, r.PEER, r['REMOTE AS'], r.TYPE, r.STATE, r['PFX RCVD']];
  }), j.out.bgp_sessions.map(function (x) {
    return [x.node, str(x.peer_ip), str(x.remote_as), str(x.type), str(x.state), str(x.pfx_rcvd)];
  }));
  if (!c.bgp_total) assert.deepStrictEqual(b.lines, ['  none']);
  return { json: j.out, table: t.out };
}

// every fact the why table prints, checked against the why JSON of the same question
function assertWhyTableMatchesJson(args) {
  var j = json(['why'].concat(args)), t = exec(['why'].concat(args, ['--format', 'table']));
  assert.strictEqual(j.code, 0, JSON.stringify(args));
  assert.strictEqual(t.code, 0, JSON.stringify(args));
  var w = j.out, s = parseTables(t.out);
  var head = Object.keys(s)[0];
  assert.strictEqual(head, 'Best path: ' + w.node + ' ' + w.prefix + (w.vrf ? ' (VRF ' + w.vrf + ')' : '') +
    ', ' + w.paths + ' path' + (w.paths === 1 ? '' : 's'));
  var info = {};
  s[head].lines.forEach(function (l) { var m = /^  ([a-z ]+):\s+(.*)$/.exec(l); if (m) (info[m[1]] = info[m[1]] || []).push(m[2]); });
  if (w.best) assert.strictEqual(info.best[0], 'via ' + (w.best.next_hop || '-') + '  as-path ' + (w.best.as_path || '-'));
  else assert.deepStrictEqual(info.best, ['none']);
  assert.strictEqual((info['also best'] || []).length, (w.also_best || []).length);
  assert.deepStrictEqual(info.reason, w.reason ? [w.reason] : undefined);
  assert.deepStrictEqual(info.source, w.reason && w.reason_source ? [w.reason_source] : undefined);
  assert.deepStrictEqual(info.note, w.note ? [w.note] : undefined);
  assert.deepStrictEqual(s.Candidates.rows.map(function (r) {
    return [r.B === '*', r['NEXT HOP'], r['AS PATH'], r.LOCPRF, r.WEIGHT, r.MED, r.ORIGIN];
  }), w.candidates.map(function (c) {
    return [!!c.best, str(c.next_hop), str(c.as_path), str(c.local_pref), str(c.weight), str(c.metric), str(c.origin)];
  }));
  return { json: w, table: t.out };
}

// ---- state ----
test('state: FRR, SR Linux and IOS-XE inputs; table and JSON give the same facts', function () {
  var dir = tmp();
  writeState(dir, 'r1', srlOspfState());
  [FRR_R1, frrBgpDir(), Q15, ECMP, dir, mixedLab()].forEach(assertStateTableMatchesJson);
});

test('state: SR Linux OSPF state from the bundled capture (adjacency on the link)', function () {
  var dir = writeState(tmp(), 'r1', srlOspfState());
  var r = json(['state', dir]);
  assert.strictEqual(r.code, 0);
  assert.strictEqual(r.out.nodes[0].nos, 'srlinux');
  assert.strictEqual(r.out.nodes[0].protocol, 'ospf');
  assert.deepStrictEqual(r.out.links, [{ a: 'r1', a_iface: 'ethernet-1/1.0', b: 'r2', b_iface: null, up: true, ospf_state: 'Full' }]);
});

test('state: an SR Linux BGP link is not given an OSPF state', function () {
  var r = json(['state', writeState(tmp(), 'r1', srlBgpState())]);
  assert.strictEqual(r.code, 0);
  assert.strictEqual(r.out.links.length, 1);
  assert.ok(!('ospf_state' in r.out.links[0]));
  assert.deepStrictEqual(r.out.bgp_sessions, [{ node: 'r1', peer_ip: '10.0.0.2', remote_as: 65002, type: 'eBGP',
    state: 'Established', established: true, pfx_rcvd: 1 }]);
});

test('state: FRR BGP summary (one Established, one Active) through frr-collect.js', function () {
  var r = json(['state', frrBgpDir()]);
  assert.strictEqual(r.code, 0);
  assert.strictEqual(r.out.counts.bgp_total, 2);
  assert.strictEqual(r.out.counts.bgp_established, 1);
  var t = parseTables(exec(['state', frrBgpDir(), '--format', 'table']).out);
  assert.deepStrictEqual(t['BGP neighbors'].rows.map(function (x) { return x.STATE; }), ['Established', 'Active']);
});

test('state: a mixed FRR + SR Linux + IOS-XE xray-states.js keeps each router and its NOS', function () {
  var r = json(['state', mixedLab()]);
  assert.strictEqual(r.code, 0);
  assert.deepStrictEqual(r.out.nodes.map(function (n) { return [n.name, n.nos || null]; }),
    [['frr1', null], ['srl1', 'srlinux'], ['xe1', 'ios-xe']]);
});

test('state: an empty router state prints zero counts and "none" sections', function () {
  var dir = writeState(tmp(), 'r1', { target_node: 'r1', interfaces: {} });
  var r = assertStateTableMatchesJson(dir);
  assert.deepStrictEqual(r.json.nodes, [{ name: 'r1', interfaces: [] }]);
  assert.deepStrictEqual(r.json.links, []);
  assert.deepStrictEqual(r.json.counts, { nodes: 1, links: 0, ospf_full: 0, ospf_total: 0, ospf_ifaces_expected: 0, ospf_ifaces_full: 0, ospf_ifaces_without_adjacency: 0, bgp_established: 0, bgp_total: 0 });
  assert.strictEqual(r.table, [
    'Routers (1)',
    '  ROUTER  NOS  PROTOCOLS  IFACES UP  OSPF NBRS  BGP PEERS  BGP ROUTES  RIB ROUTES',
    '  r1      -    -                0/0          0          0           0           -',
    '',
    'OSPF neighbors (0/0 Full)',
    '  none',
    '',
    'BGP neighbors (0/0 Established)',
    '  none',
    ''].join('\n'));
});

test('state: no state at all is an error in both formats (exit 2)', function () {
  var dir = tmp();
  var emptyStates = path.join(dir, 'xray-states.js');
  fs.writeFileSync(emptyStates, 'window.LIVE_STATES = {};\n');
  var emptyObj = path.join(dir, 'empty.json');
  fs.writeFileSync(emptyObj, '{}');
  [emptyStates, emptyObj, tmp()].forEach(function (input) {
    var j = json(['state', input]);
    assert.strictEqual(j.code, 2, input);
    assert.deepStrictEqual(Object.keys(j.out), ['error']);
    var t = exec(['state', input, '--format', 'table']);
    assert.strictEqual(t.code, 2, input);
    assert.strictEqual(t.out, '');
    assert.strictEqual(t.err, 'error: ' + j.out.error + '\n');
  });
});

// ---- why ----
test('why: IOS-XE, FRR and SR Linux best paths; table and JSON give the same facts', function () {
  var srlDir = writeState(tmp(), 'r1', srlBgpState());
  [[Q15, 'r1', '8.8.8.0/24'], [Q15, 'r3', '8.8.8.0'], [frrBgpDir(), 'r1', '203.0.113.0/24'],
    [srlDir, 'r1', '8.8.8.0/24'], [mixedLab(), 'srl1', '8.8.8.0/24'], [mixedLab(), 'xe1', '8.8.8.0/24']].forEach(assertWhyTableMatchesJson);
});

test('why: FRR reason comes from selectionReason, SR Linux has none stored (null + note)', function () {
  var f = json(['why', frrBgpDir(), 'r1', '203.0.113.0/24']).out;
  assert.strictEqual(f.best.next_hop, '10.0.2.3');
  assert.strictEqual(f.reason, 'Local Pref');
  assert.match(f.reason_source, /FRR selectionReason/);
  var s = json(['why', writeState(tmp(), 'r1', srlBgpState()), 'r1', '8.8.8.0/24']);
  assert.strictEqual(s.code, 0);
  assert.strictEqual(s.out.best.next_hop, '10.0.0.2');
  assert.strictEqual(s.out.best.as_path, '65002 65100');
  assert.strictEqual(s.out.reason, null);
  assert.match(s.out.note, /not in the data/);
});

test('why: no path marked best -> best null in JSON, "best: none" in the table', function () {
  var dir = writeState(tmp(), 'r1', { target_node: 'r1', interfaces: {},
    bgp_routes: [{ prefix: '192.0.2.0/24', next_hop: '10.0.0.2', as_path: '65002', status: '*' }] });
  var r = assertWhyTableMatchesJson([dir, 'r1', '192.0.2.0/24']);
  assert.strictEqual(r.json.best, null);
  assert.strictEqual(r.json.reason, null);
  assert.match(r.json.note, /none of the 1 path/);
});

test('why: unknown router, unknown prefix and empty state are errors in both formats', function () {
  var empty = writeState(tmp(), 'r1', { target_node: 'r1', interfaces: {} });
  var cases = [
    { args: [Q15, 'r9', '8.8.8.0/24'], re: /^unknown node: r9 \(known: r1, r2, r3\)$/ },
    { args: [FRR_R1, 'r2', '10.0.0.0/8'], re: /^unknown node: r2 \(known: r1\)$/ },
    { args: [mixedLab(), 'r1', '8.8.8.0/24'], re: /^unknown node: r1 \(known: frr1, srl1, xe1\)$/ },
    { args: [Q15, 'r1', '192.0.2.0/24'], re: /^unknown prefix on r1: 192\.0\.2\.0\/24 \(BGP table has: 8\.8\.8\.0\/24\)$/ },
    { args: [empty, 'r1', '8.8.8.0/24'], re: /no BGP table in the data for this node/ },
    { args: [FRR_R1, 'r1', '8.8.8.0/24'], re: /unknown prefix on r1/ }
  ];
  cases.forEach(function (c) {
    var j = json(['why'].concat(c.args));
    assert.strictEqual(j.code, 2, JSON.stringify(c.args));
    assert.deepStrictEqual(Object.keys(j.out), ['error']);
    assert.match(j.out.error, c.re);
    var t = exec(['why'].concat(c.args, ['--format', 'table']));
    assert.strictEqual(t.code, 2);
    assert.strictEqual(t.out, '');
    assert.strictEqual(t.err, 'error: ' + j.out.error + '\n', 'the same message in both formats');
  });
});

// ---- options ----
test('options: --format json is the default, --format=table and --format table are the same, anywhere on the line', function () {
  assert.deepStrictEqual(json(['why', Q15, 'r1', '8.8.8.0/24', '--format', 'json']).out, json(['why', Q15, 'r1', '8.8.8.0/24']).out);
  var a = exec(['why', Q15, 'r1', '8.8.8.0/24', '--format', 'table']).out;
  assert.strictEqual(exec(['--format=table', 'why', Q15, 'r1', '8.8.8.0/24']).out, a);
  assert.strictEqual(exec(['why', Q15, '--format', 'table', 'r1', '8.8.8.0/24']).out, a);
  assert.strictEqual(exec(['why', Q15, 'r1', '8.8.8.0/24', '--format', 'table', '--color']).out, a, 'no colors on a pipe');
});

test('options: a bad or missing --format value is a JSON error with exit 2', function () {
  [['state', Q15, '--format'], ['state', Q15, '--format', 'xml'], ['state', Q15, '--format=']].forEach(function (args) {
    var r = json(args);
    assert.strictEqual(r.code, 2, JSON.stringify(args));
    assert.match(r.out.error, /--format must be json or table/);
  });
});

test('usage errors are the same in both formats', function () {
  [['state'], ['why', Q15, 'r1'], ['bogus', Q15], []].forEach(function (args) {
    var j = json(args), t = exec(args.concat(['--format', 'table']));
    assert.strictEqual(j.code, 2, JSON.stringify(args));
    assert.match(j.out.error, /usage: xray-query\.js/);
    assert.strictEqual(t.code, 2);
    assert.strictEqual(t.err, 'error: ' + j.out.error + '\n');
  });
});
