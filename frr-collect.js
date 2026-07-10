#!/usr/bin/env node
/*
 * frr-collect.js — FRR-native lane (c)
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

function execVtyshJson(prefix, showCmd) {
  var full = buildExecCmd(prefix, showCmd);
  var out;
  try {
    out = cp.execSync(full, { encoding: 'utf8', maxBuffer: 8 * 1024 * 1024, stdio: ['ignore', 'pipe', 'ignore'] });
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
  'show ip bgp': 'bgp.json'
};
function readShowFromDir(dir, showCmd) {
  var candidates = [showToFile(showCmd)];
  if (ALT_NAME[showCmd]) candidates.push(ALT_NAME[showCmd]);
  for (var i = 0; i < candidates.length; i++) {
    var fp = path.join(dir, candidates[i]);
    try { return JSON.parse(fs.readFileSync(fp, 'utf8')); } catch (e) { /* try next */ }
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
  return { proto: proto, state: clab.collectFromJson(args) };
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

  // 3) --proto auto がこの OSPF sample を ospf と判定
  console.log('self-test: --proto auto on OSPF sample -> ospf');
  var ra = collectFromDir({ node: 'r1', fromDir: dir, proto: 'auto', adjacency: [{ iface: 'eth0', peer: 'r2' }] });
  _assert(ra.proto === 'ospf', 'auto -> ospf (ospf neighbors present)');

  console.log('\nALL SELF-TESTS PASSED');
}

// ---- main -----------------------------------------------------------------------------------
if (typeof require !== 'undefined' && require.main === module) {
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
    console.log('usage:\n' +
      "  --node <n> --exec '<prefix>' [--adj eth0:r2,eth1:r3] [--proto ospf|bgp|auto] [--exclude-mgmt|--mgmt-subnet <cidr>] [--out f]\n" +
      "     prefix: '' (local vtysh) | 'docker exec <c>' | 'ssh <host>'\n" +
      '  --node <n> --from-dir <dir> [--adj ...] [--proto ...] [--out f]\n' +
      '  --self-test');
  }
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    buildExecCmd: buildExecCmd, execVtyshJson: execVtyshJson,
    readShowFromDir: readShowFromDir, resolveProto: resolveProto,
    collectViaExec: collectViaExec, collectFromDir: collectFromDir
  };
}
