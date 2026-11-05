#!/usr/bin/env node
/*
 * frr-collect.js — FRR-native lane
 *
 * clab-collect.js の containerlab 依存 (clab-<lab>-<node> 命名 / clab peer-map 前提) を外した
 * 「素の FRR collector」。稼働中の FRR / 記録済 fixture の両方から xray-core `state` を吐く。
 *
 * 【なぜ別ファイルか】
 *   state 側のパーサ・buildState は clab-collect.js が既に食っている形そのもの (
 *   topotests の `show … json` = frr-parse.js/clab-collect.js が食う形)。よって本モジュールは
 *   パーサを再発明せず clab-collect.js を require して再利用し、差分 = 「FRR へのアクセス手段の
 *   一般化 (--exec prefix)」+「オフライン (--from-dir)」+「--proto auto」だけを足す。
 *
 * MODES
 *   live      node frr-collect.js --node r1 --exec '<prefix>' [--adj eth0:r2,eth1:r3] [--proto ospf|bgp|auto] [--out f]
 *   offline   node frr-collect.js --node r1 --from-dir ./fixtures/r1/ [--adj ...] [--proto ...] [--out f]
 *   self-test node frr-collect.js --self-test
 *
 * --exec '<prefix>' に `vtysh -c "<show> json"` を後置して実行する。prefix で clab 固有前提を吸収:
 *   ''                    → local vtysh 直             (このホストが FRR ルータ)
 *   'docker exec r1'      → 任意コンテナ (clab/独自不問)
 *   'ssh myrouter'        → 遠隔ルータ (SSH)
 * --adj eth0:r2,eth1:r3   iface→peer 対応 (任意 IP プランで動く。topojson があれば省略可)。
 *
 * --from-dir <dir> は記録済 json を読む (live FRR 無い CI / ブログ執筆で動く)。ファイル名は show
 * コマンドの空白を "_" にした形: show_ip_ospf_neighbor.json / show_ip_route.json / show_ip_bgp.json 等。
 *
 * Node-only (docker/ssh に shell out する)。ブラウザモジュールではない。
 * VERIFICATION: パーサ/state は clab-collect.js 側で実 FRR 8.4 に対し live 検証済 (そのまま再利用)。
 */
'use strict';

var cp = (typeof require === 'function') ? require('child_process') : null;
var fs = (typeof require === 'function') ? require('fs') : null;
var path = (typeof require === 'function') ? require('path') : null;
// パーサ + buildState + collectFromJson を再利用 (再発明しない)
var clab = (typeof require === 'function') ? require('./clab-collect.js') : null;

// ---- FRR アクセス手段の一般化 (--exec prefix) ------------------------------------------------
//
// prefix に vtysh コマンドを後置してシェル実行する。ssh は「ローカルシェル + リモートシェル」の
// 二重分割を受けるため、リモートに 1 トークンで届くよう追加クォートする (local/docker は不要)。
function buildExecCmd(prefix, showCmd) {
  var p = (prefix || '').trim();
  // vtysh の -c 引数は 1 語。single-quote でローカルシェル 1 段を耐える。
  var vt = "vtysh -c '" + showCmd + " json'";
  if (/^ssh(\s|$)/.test(p)) {
    // ssh host "vtysh -c 'show … json'"  → ローカルシェルが二重引用を1トークンに畳み、
    // リモートシェルが single-quote を解いて vtysh -c に 'show … json' を 1 語で渡す。
    return p + ' "' + vt + '"';
  }
  // local: vtysh -c 'show … json' / docker exec <c> vtysh -c 'show … json'
  // (docker exec は shell を介さず argv 直渡しゆえリモート再分割なし)
  return p ? (p + ' ' + vt) : vt;
}

// nx_no_shell (2026-10-17): the same command as an argument array (no local shell). The prefix is split on spaces
// ('docker exec r1' / 'sudo docker exec r1' / 'ssh host'); for ssh the remote side still gets one string, so only
// fixed show commands are allowed through (letters, digits, space . / _ -).
function buildExecArgv(prefix, showCmd) {
  var p = (prefix || '').trim().split(/\s+/).filter(Boolean);
  if (p[0] === 'ssh') return p.concat(["vtysh -c '" + showCmd + " json'"]);
  return p.concat(['vtysh', '-c', showCmd + ' json']);
}
function execVtyshJson(prefix, showCmd) {
  if (!/^[A-Za-z0-9 .\/_-]+$/.test(showCmd)) return null;
  var av = buildExecArgv(prefix, showCmd);
  var out;
  try {
    out = cp.execFileSync(av[0], av.slice(1), { encoding: 'utf8', maxBuffer: 8 * 1024 * 1024, timeout: 8000, stdio: ['ignore', 'pipe', 'ignore'] });   /* nx_review_1017 (F-04) */
  } catch (e) { return null; }               // コマンド不在 / iface down 等は null (呼び側で欠落許容)
  try { return JSON.parse(out); } catch (e) { return null; }
}

// ---- オフライン: 記録 json を dir から読む --------------------------------------------------
function showToFile(showCmd) { return showCmd.replace(/\s+/g, '_') + '.json'; }   // "show ip route" -> show_ip_route.json
// clab-collect 系の別名も一応許容 (相互運用)。
var ALT_NAME = {
  'show ip ospf neighbor': 'ospf-neighbor.json',
  'show ip ospf interface': 'ospf-interface.json',
  'show interface': 'interface.json',
  'show ip route': 'route.json',
  'show ip bgp summary': 'bgp-summary.json',
  'show ip bgp': 'bgp.json',
  'show ip ospf database': 'ospf-database.json'
};
function readShowFromDir(dir, showCmd) {
  var candidates = [showToFile(showCmd)];
  if (ALT_NAME[showCmd]) candidates.push(ALT_NAME[showCmd]);
  for (var i = 0; i < candidates.length; i++) {
    var fp = path.join(dir, candidates[i]);
    try { if (fs.statSync(fp).isFile()) return JSON.parse(fs.readFileSync(fp, 'utf8')); } catch (e) { /* try next */ }
  }
  return null;
}

// ---- proto auto 判定 (getShow は exec/from-dir どちらでも同じ IF) ----------------------------
function resolveProto(getShow, proto) {
  proto = (proto || 'ospf').toLowerCase();
  if (proto !== 'auto') return proto;
  var nb = getShow('show ip ospf neighbor');
  if (nb && nb.neighbors && Object.keys(nb.neighbors).length) return 'ospf';
  var bs = getShow('show ip bgp summary');
  var uni = bs && (bs.ipv4Unicast || bs);
  if (uni && uni.peers && Object.keys(uni.peers).length) return 'bgp';
  return 'ospf';                              // どちらも空 → ospf 既定 (down ノードでも panel は出る)
}

// ---- OSPF LSDB summary (`show ip ospf database json`) -----------------------------------------
//
// Both spellings of each part are accepted, in any combination (FRR changed them at different times):
//   per-type keys: the CLI headings ("Router Link States", "Net Link States", ...) or camelCase
//                  ("routerLinkStates", "networkLinkStates", ...) next to "<key>Count" numbers;
//   the LSA's advertising router: "advertisedRouter" or "advertisingRouter".
//   FRR 8.4 (captured: test/fixtures/frr-ospf-database/frr-8.4-captured.json) prints camelCase keys with "advertisedRouter".
// Area-scoped LSAs sit under "areas"{<area-id>: {<type>: [..]}}; AS-scoped ones at the top level.
// One row per LSA: { type, ls_id, adv_router, age, seq, area } (area = the area id, null for an AS-scoped LSA;
// age = null when the router gave none).
var LSA_TYPE = {
  'Router Link States': 'router', 'routerLinkStates': 'router',
  'Net Link States': 'network', 'networkLinkStates': 'network',
  'Summary Link States': 'summary', 'summaryLinkStates': 'summary',
  'ASBR-Summary Link States': 'asbr-summary', 'asbrSummaryLinkStates': 'asbr-summary',
  'AS External Link States': 'as-external', 'asExternalLinkStates': 'as-external',
  'NSSA-external Link States': 'nssa-external', 'nssaExternalLinkStates': 'nssa-external',
  'Link-Local Opaque-LSA': 'opaque-link', 'linkLocalOpaqueLsa': 'opaque-link',
  'Area-Local Opaque-LSA': 'opaque-area', 'areaLocalOpaqueLsa': 'opaque-area',
  'AS-external Opaque-LSA': 'opaque-as', 'asExternalOpaqueLsa': 'opaque-as'
};
function _lsaRows(typeKey, list, out, area) {
  var type = Object.prototype.hasOwnProperty.call(LSA_TYPE, typeKey) ? LSA_TYPE[typeKey] : null;
  if (!type || !Array.isArray(list)) return;
  list.forEach(function (L) {
    if (!L || typeof L !== 'object') return;
    var id = L.lsId, adv = L.advertisingRouter != null ? L.advertisingRouter : L.advertisedRouter;
    if (id == null || adv == null) return;
    var age = (L.lsaAge === null || L.lsaAge === undefined || L.lsaAge === '') ? NaN : Number(L.lsaAge);   // no age = unknown, not 0
    out.push({ type: type, ls_id: String(id), adv_router: String(adv),
      age: isFinite(age) ? age : null, seq: L.sequenceNumber != null ? String(L.sequenceNumber) : '', area: area });
  });
}
function parseOspfDatabase(j) {
  var out = [];
  if (!j || typeof j !== 'object' || Array.isArray(j)) return out;
  var areas = j.areas;
  if (areas && typeof areas === 'object' && !Array.isArray(areas)) {
    Object.keys(areas).forEach(function (a) {
      var A = areas[a];
      if (A && typeof A === 'object') Object.keys(A).forEach(function (k) { _lsaRows(k, A[k], out, a); });
    });
  }
  Object.keys(j).forEach(function (k) { if (k !== 'areas') _lsaRows(k, j[k], out, null); });
  return out;
}

// ---- 共通アセンブラ: getShow(cmd)->json を集めて clab.collectFromJson に渡す -----------------
function assemble(getShow, opts) {
  var proto = resolveProto(getShow, opts.proto);
  var args = {
    node: opts.node, id: opts.id || opts.node, proto: proto,
    adjacency: opts.adjacency || [], mgmtSubnet: opts.mgmtSubnet || '',
    interface: getShow('show interface'),
    route: getShow('show ip route')
  };
  if (proto === 'bgp') {
    args.bgpSummary = getShow('show ip bgp summary');
    args.bgp = getShow('show ip bgp');
  } else {
    args.ospfNeighbor = getShow('show ip ospf neighbor');
    args.ospfInterface = getShow('show ip ospf interface');
  }
  var state = clab.collectFromJson(args);
  // lsdb_prefixes (route-derived) stays as is; ospf_lsdb is the router's real LSDB summary.
  if (proto !== 'bgp') {
    var db = getShow('show ip ospf database');
    if (db && typeof db === 'object') state.ospf_lsdb = parseOspfDatabase(db);
  }
  return { proto: proto, state: state };
}

function collectViaExec(opts) {
  var prefix = opts.exec || '';
  return assemble(function (cmd) { return execVtyshJson(prefix, cmd); }, opts);
}
function collectFromDir(opts) {
  var dir = opts.fromDir;
  return assemble(function (cmd) { return readShowFromDir(dir, cmd); }, opts);
}

// ---- CLI ------------------------------------------------------------------------------------
function _argMap(argv) {
  var m = {};
  for (var i = 0; i < argv.length; i++) {
    if (argv[i].indexOf('--') === 0) {
      var k = argv[i].slice(2);
      var v = (argv[i + 1] != null && String(argv[i + 1]).indexOf('--') !== 0) ? argv[++i] : true;
      m[k] = v;
    }
  }
  return m;
}
function _parseAdj(s) {       // "eth0:r2,eth1:r3" -> [{iface:'eth0',peer:'r2'},...]
  if (!s || s === true) return [];
  return String(s).split(',').map(function (p) { var kv = p.split(':'); return { iface: kv[0], peer: kv[1] }; });
}

// ---- self-test ------------------------------------------------------------------------------
function _assert(cond, msg) { if (!cond) { throw new Error('FAIL: ' + msg); } console.log('  PASS: ' + msg); }

function selfTest() {
  // 1) buildExecCmd: local / docker / ssh のコマンド組み立て (live exec の唯一のリスク部分)
  console.log('self-test: buildExecCmd (--exec prefix -> shell command)');
  _assert(buildExecCmd('', 'show ip route') === "vtysh -c 'show ip route json'",
    "local: vtysh -c 'show ip route json'");
  _assert(buildExecCmd('docker exec r1', 'show ip route') === "docker exec r1 vtysh -c 'show ip route json'",
    "docker: docker exec r1 vtysh -c 'show ip route json'");
  _assert(buildExecCmd('ssh myrtr', 'show ip ospf neighbor') === "ssh myrtr \"vtysh -c 'show ip ospf neighbor json'\"",
    "ssh: 二重クォートでリモートに 1 トークン");

  // 2) --from-dir 配線 (show->ファイル名マップ + proto + adjacency) を bundled sample で end-to-end
  console.log('self-test: --from-dir (bundled fixtures/frr-collect-sample/r1, OSPF r1 Full with r2)');
  var dir = path.join(__dirname, 'fixtures', 'frr-collect-sample', 'r1');
  var r = collectFromDir({ node: 'r1', id: 'lin', fromDir: dir, proto: 'ospf',
    adjacency: [{ iface: 'eth0', peer: 'r2' }] });
  var st = r.state;
  _assert(r.proto === 'ospf', 'proto resolved = ospf');
  _assert(st.target_node === 'r1', 'target_node = r1');
  _assert(st.full_count === 1, 'full_count = 1 (real neighbor Full/DR)');
  _assert(st.r2_has_full === true && st.r2_iface === 'eth0', 'r2 mapped via --adj (eth0->r2) and Full');
  _assert(st.has_ospf_route === true && st.route_resolution.next_hop === '10.1.0.20',
    'route resolved, next-hop from real json');
  _assert(Array.isArray(st.ospf_lsdb) && st.ospf_lsdb.length === 5 &&
    st.ospf_lsdb[3].type === 'network' && st.ospf_lsdb[3].ls_id === '10.1.0.20' && st.ospf_lsdb[3].adv_router === '2.2.2.2',
    'ospf_lsdb: 3 router + 2 network LSAs from show ip ospf database');
  _assert(parseOspfDatabase({ areas: { '0.0.0.0': { routerLinkStates: [{ lsId: '1.1.1.1', advertisingRouter: '1.1.1.1', lsaAge: 5, sequenceNumber: '80000002' }], routerLinkStatesCount: 1 } } })[0].adv_router === '1.1.1.1',
    'ospf_lsdb: newer camelCase key style accepted');

  // 3) --proto auto がこの OSPF sample を ospf と判定
  console.log('self-test: --proto auto on OSPF sample -> ospf');
  var ra = collectFromDir({ node: 'r1', fromDir: dir, proto: 'auto', adjacency: [{ iface: 'eth0', peer: 'r2' }] });
  _assert(ra.proto === 'ospf', 'auto -> ospf (ospf neighbors present)');

  console.log('\nALL SELF-TESTS PASSED');
}

// ---- main -----------------------------------------------------------------------------------
if (typeof require !== 'undefined' && require.main === module) {
  var USAGE = "usage: node frr-collect.js --node <n> --exec '<prefix>' [--id <id>] [--adj eth0:r2,eth1:r3] [--proto ospf|bgp|auto] [--exclude-mgmt | --mgmt-subnet <cidr>] [--out f]\n" +
    '       node frr-collect.js --node <n> --from-dir <dir> [--id <id>] [--adj ...] [--proto ...] [--exclude-mgmt | --mgmt-subnet <cidr>] [--out f]\n' +
    '       node frr-collect.js --self-test\n' +
    "  --exec '<prefix>'    how to reach vtysh: '' (local vtysh) | 'docker exec <c>' | 'ssh <host>' (read-only show commands)\n" +
    '  --from-dir <dir>     read saved `show ... json` files from <dir> instead\n' +
    '  --id <id>            router id in the state (default: --node)\n' +
    '  --adj if:peer,...    which neighbor is on which interface\n' +
    '  --proto ospf|bgp|auto  default: ospf (auto: ask the router)\n' +
    '  --exclude-mgmt       leave out the containerlab management network 172.20.20.0/24\n' +
    '  --mgmt-subnet <cidr> leave out this management network\n' +
    '  --out <file>         write the state JSON to <file> (default: stdout)\n' +
    '  --self-test          run the built-in tests\n' +
    '  -h, --help           show this help';
  // the same walk as _argMap: an option takes the next word as its value unless that starts with --;
  // a flag (no value) never takes it, and -h / --help anywhere wins
  var _av = process.argv.slice(2), _help = _av.indexOf('-h') >= 0 || _av.indexOf('--help') >= 0, _bad = '';
  var _flags = ['self-test', 'exclude-mgmt'];
  var _known = ['self-test', 'from-dir', 'exec', 'node', 'id', 'adj', 'proto', 'exclude-mgmt', 'mgmt-subnet', 'out'];
  for (var _i = 0; _i < _av.length; _i++) {
    var _s = _av[_i];
    if (_s.indexOf('--') === 0) {
      if (_flags.indexOf(_s.slice(2)) < 0 && _av[_i + 1] != null && _av[_i + 1].indexOf('--') !== 0) _i++;
      if (_s === '--help') _help = true; else if (_known.indexOf(_s.slice(2)) < 0 && !_bad) _bad = _s;
    } else if (_s === '-h') _help = true;
    else if (_s.charAt(0) === '-' && _s.length > 1 && !_bad) _bad = _s;
  }
  if (_help) { console.log(USAGE); process.exit(0); }   // release-check: ok (the --help text)
  if (_bad) { console.error('frr-collect.js: unknown option: ' + _bad + "\nTry 'node frr-collect.js --help'."); process.exit(2); }
  var a = _argMap(process.argv.slice(2));
  var mgmt = (a['mgmt-subnet'] && a['mgmt-subnet'] !== true) ? a['mgmt-subnet']
    : (a['exclude-mgmt'] ? '172.20.20.0/24' : '');
  if (a['self-test']) { selfTest(); }
  else if (a['from-dir']) {
    var r1 = collectFromDir({ node: a.node, id: a.id || a.node, fromDir: a['from-dir'],
      proto: a.proto, adjacency: _parseAdj(a.adj), mgmtSubnet: mgmt });
    var o1 = JSON.stringify(r1.state, null, 2);
    if (a.out && a.out !== true) { fs.writeFileSync(a.out, o1); console.log('wrote ' + a.out); } else console.log(o1);
  }
  else if (a.node && (a.exec !== undefined)) {
    var r2 = collectViaExec({ node: a.node, id: a.id || a.node, exec: (a.exec === true ? '' : a.exec),
      proto: a.proto, adjacency: _parseAdj(a.adj), mgmtSubnet: mgmt });
    var o2 = JSON.stringify(r2.state, null, 2);
    if (a.out && a.out !== true) { fs.writeFileSync(a.out, o2); console.log('wrote ' + a.out); } else console.log(o2);
  }
  else {
    console.log(USAGE);   // release-check: ok (the --help text)
  }
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    buildExecCmd: buildExecCmd, execVtyshJson: execVtyshJson,
    readShowFromDir: readShowFromDir, resolveProto: resolveProto, parseOspfDatabase: parseOspfDatabase,
    collectViaExec: collectViaExec, collectFromDir: collectFromDir
  };
}
