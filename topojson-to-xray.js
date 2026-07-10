#!/usr/bin/env node
/*
 * topojson-to-xray.js  —  FRR-native lane
 *
 * FRR topotests の JSON-topojson ファイル (lib/topojson.py が読む宣言的トポロジ) を読み、
 * X-Ray が食う `config` JSON を出力する。clab-to-xray.js の姉妹版。
 *
 * 【なぜ topojson が本命か】
 *   topojson はリンクを routers.<name>.links.<peer名> で「隣接を直接キー」しているため、
 *   clab の endpoints 突き合わせより X-Ray の nodes+networks へ素直に落ちる。
 *   `lo`=loopback / `ospf.router_id`=RID / `ospf.neighbors`=隣接権威 / `bgp.local_as`=AS を拾える。
 *
 * 【パーサ規則 / parser rules】
 *   1. エッジ確定は ospf.neighbors を権威にする (物理リンク総当たりより正確)。
 *   2. dummy/stub インタフェース除外必須: キーが <router名>-link<N> / description に "Dummy" /
 *      ospf.neighbors に相手がいない片側 stub → エッジにしない (clab に無い FRR 固有ケース)。
 *   3. ospf.router_id を DeepDive RID にそのまま使う。
 *   4. 4+ ノード (3形状 dispatcher の範囲外) → xray-graph.html 系の任意サイズレーン
 *      (topology_type:'graph') に乗せる。2-3 ノードは既存3形 (triangle/linear) にマップ。
 *
 * 【出力するもの / しないもの】clab-to-xray.js と同じ責務境界。
 *   出力する  : topology_type / layout / nodes(id,type,role,target,router_id,loopback,local_as)
 *               / networks(members,host_id,+ospf link meta) / adjacency(graph時) / provenance / warnings。
 *   出力しない: xray.protocol の live state (normal/detour/dead) は facade 領域 (enabled スタブのみ)。
 *
 * 依存ゼロ (Node 標準のみ)。topojson は素の JSON ゆえ JSON.parse で読む。
 *
 * 使い方:
 *   node topojson-to-xray.js <topo.json> [--inverted-v] [--target <node>]
 *   node topojson-to-xray.js fixtures/ospf_single_area.json
 *   node topojson-to-xray.js <topo.json> --emit graph-data   # xray-graph.html 直食い shape (4+ノード俯瞰)
 *   node topojson-to-xray.js --selftest         # golden fixture で回帰
 */
'use strict';
const fs = (typeof require === 'function') ? require('fs') : null;

/* ----------------------------------------------------------------------------
 * 1. dummy/stub 判定 (Rule 2)
 * -------------------------------------------------------------------------- */
// キーが <router名>-link<N> パターン、または description に "Dummy" を含むリンクは実ノード間リンクでない。
function isDummyLink(key, link, routerNames) {
  if (/-link\d+$/i.test(key)) {
    // <既存router名>-link<N> を厳密判定 (末尾 -link<N> を剥がした先頭が既存 router なら dummy)
    const base = key.replace(/-link\d+$/i, '');
    if (routerNames.has(base)) return true;
  }
  if (link && typeof link.description === 'string' && /dummy/i.test(link.description)) return true;
  return false;
}

/* ----------------------------------------------------------------------------
 * 2. topojson → 無向グラフ抽出 (エッジ確定 = ospf.neighbors 権威)
 * -------------------------------------------------------------------------- */
function extractGraphTopojson(topo) {
  const routersRaw = topo.routers || {};
  const routerNames = new Set(Object.keys(routersRaw));

  const nodes = Object.keys(routersRaw).map((name) => {
    const def = routersRaw[name] || {};
    const ospf = def.ospf || {};
    const bgp = def.bgp || {};
    const links = def.links || {};
    const lo = links.lo || null;
    return {
      name,
      router_id: ospf.router_id || null,            // Rule 3: DeepDive RID
      loopback: lo ? (lo.ipv4 || 'auto') : null,
      local_as: (bgp.local_as !== undefined) ? String(bgp.local_as) : null,
      _hasOspf: !!def.ospf,
      _hasBgp: !!def.bgp,
    };
  });

  // エッジ: ospf.neighbors を権威に。無い router は dummy 除外した links キーで補完。
  const edges = [];
  const linkMeta = {};                              // "a b" -> {area, p2p} (ospf link meta)
  const metaKey = (a, b) => [a, b].sort().join(' ');

  for (const r of Object.keys(routersRaw)) {
    const def = routersRaw[r] || {};
    const links = def.links || {};
    const ospf = def.ospf || {};

    // 権威: ospf.neighbors (Rule 1)
    const neigh = (ospf.neighbors && typeof ospf.neighbors === 'object')
      ? Object.keys(ospf.neighbors) : null;

    const peers = new Set();
    if (neigh) {
      neigh.forEach((p) => { if (routerNames.has(p)) peers.add(p); });
    } else {
      // fallback: links キーから dummy/loopback/非router を除外して隣接を導出
      for (const key of Object.keys(links)) {
        if (key === 'lo') continue;
        const link = links[key];
        if (link && link.type === 'loopback') continue;
        if (isDummyLink(key, link, routerNames)) continue;   // Rule 2
        if (!routerNames.has(key)) continue;                 // peer は実 router のみ
        peers.add(key);
      }
    }

    for (const peer of peers) {
      edges.push([r, peer]);
      // per-link ospf meta (area / point-to-point) は routers[r].links[peer].ospf から (Rule 4)
      const lk = links[peer];
      if (lk && lk.ospf) {
        const mk = metaKey(r, peer);
        if (!linkMeta[mk]) {
          linkMeta[mk] = {
            area: (lk.ospf.area !== undefined) ? String(lk.ospf.area) : null,
            p2p: lk.ospf.network === 'point-to-point',
          };
        }
      }
    }
  }

  return { name: topo._name || 'frr-topotest', nodes, edges, linkMeta };
}

/* ----------------------------------------------------------------------------
 * 3. 役割推定 (loopback/ospf/bgp ブロック有→router。名前ヒューリスティックで server)
 * -------------------------------------------------------------------------- */
const SERVER_NAME_RE = /^(sv|server|host|client|pc|h\d+)$/i;
function inferRole(node) {
  if (node._hasOspf || node._hasBgp || node.router_id || node.loopback) return 'router';
  if (SERVER_NAME_RE.test(node.name)) return 'server';
  return 'router';
}

/* ----------------------------------------------------------------------------
 * 4. 形状分類 (2-3ノードは3形 / 4+ は graph レーン) — Rule 4
 * -------------------------------------------------------------------------- */
function dedupeEdges(edges) {
  const seen = new Set();
  const out = [];
  for (const [a, b] of edges) {
    const key = [a, b].sort().join(' ');
    if (seen.has(key)) continue;
    seen.add(key);
    out.push([a, b]);
  }
  return out;
}

function degreeMap(nodeNames, edges) {
  const deg = {};
  nodeNames.forEach((n) => (deg[n] = 0));
  edges.forEach(([a, b]) => { deg[a] = (deg[a] || 0) + 1; deg[b] = (deg[b] || 0) + 1; });
  return deg;
}

function classify(graph, opts) {
  const names = graph.nodes.map((n) => n.name);
  const edges = dedupeEdges(graph.edges);
  const n = names.length, m = edges.length;

  if (n === 2 && m === 1) return { shape: 'linear_2node', layout: '', edges };
  if (n === 3 && m === 3) return { shape: 'triangle', layout: '', edges };
  if (n === 3 && m === 2) return { shape: 'linear_3node', layout: opts.invertedV ? 'inverted_v' : '', edges };
  // 4+ ノード / その他は任意サイズ graph レーン (エラーにしない = Rule 4)
  return { shape: 'graph', layout: 'force', edges };
}

/* ----------------------------------------------------------------------------
 * 5. config 組み立て
 * -------------------------------------------------------------------------- */
function netName(a, b) { return 'net-' + a + b; }

// linear (path) を鎖順に整列 (clab-to-xray.js と同ロジック)
function orderForLinear(names, edges, roleOf) {
  const deg = degreeMap(names, edges);
  const ends = names.filter((n) => deg[n] === 1);
  if (ends.length !== 2) return names;
  const adj = {};
  names.forEach((n) => (adj[n] = []));
  edges.forEach(([a, b]) => { adj[a].push(b); adj[b].push(a); });
  const sortedEnds = ends.slice().sort();
  const start = sortedEnds.find((n) => roleOf(n) === 'server') || sortedEnds[0];
  const order = [start];
  const visited = new Set([start]);
  let cur = start;
  while (order.length < names.length) {
    const next = adj[cur].find((x) => !visited.has(x));
    if (next === undefined) break;
    visited.add(next); order.push(next); cur = next;
  }
  return order.length === names.length ? order : names;
}

function nodeObj(nd, role, isTarget) {
  const node = { id: nd.name, type: role, role: role === 'server' ? 'Server' : 'Router' };
  if (nd.router_id) node.router_id = nd.router_id;   // Rule 3
  if (nd.loopback) node.loopback = nd.loopback;
  if (nd.local_as) node.local_as = nd.local_as;
  if (isTarget && role === 'router') node.target = true;
  return node;
}

function edgeNetworks(edges, linkMeta) {
  const metaKey = (a, b) => [a, b].sort().join(' ');
  return edges.map(([a, b]) => {
    const net = {
      name: netName(a, b),
      members: [{ node: a, host_id: 10 }, { node: b, host_id: 20 }],
    };
    const mk = metaKey(a, b);
    if (linkMeta && linkMeta[mk]) {
      if (linkMeta[mk].area !== null) net.ospf_area = linkMeta[mk].area;
      if (linkMeta[mk].p2p) net.ospf_network = 'point-to-point';
    }
    return net;
  });
}

function commonWarnings(nodes) {
  const warnings = [];
  if (!nodes.some((x) => x.type === 'server')) {
    warnings.push('全ノードが router 判定 (topotests は通常 router のみ = 正常)。');
  }
  warnings.push('xray.protocol の live state(normal/detour/dead) は未生成 = facade 領域。');
  warnings.push('topojson の IP は "auto" が多く具体値未確定。DeepDive の LSDB 具体値は live/fixture collect (frr-collect.js) で埋める。');
  return warnings;
}

function buildConfig(graph, cls, opts) {
  let names = graph.nodes.map((n) => n.name);
  const byName = {};
  graph.nodes.forEach((nd) => (byName[nd.name] = nd));
  if (cls.shape === 'linear_2node' || cls.shape === 'linear_3node') {
    names = orderForLinear(names, cls.edges, (n) => inferRole(byName[n]));
  }
  const orderedRaw = names.map((n) => byName[n]);
  const deg = degreeMap(names, cls.edges);

  let target = opts.target;
  if (!target) target = names.slice().sort((x, y) => (deg[y] - deg[x]))[0];

  const nodes = orderedRaw.map((nd) => nodeObj(nd, inferRole(nd), nd.name === target));
  const networks = edgeNetworks(cls.edges, graph.linkMeta);
  const anyBgp = graph.nodes.some((n) => n._hasBgp);

  return {
    success: true,
    id: graph.name,
    scenario_title: graph.name,
    topology_type: cls.shape,
    layout: cls.layout || '',
    nodes,
    networks,
    modes: ['troubleshoot', 'capture'],
    xray: {
      enabled: true,
      protocol: anyBgp ? 'bgp' : 'ospf',
      pattern: cls.shape === 'triangle' ? 'ospf_triangle' : 'ospf_linear',
      ping_mode: 'through',
      holo_fields: [],
    },
    capture: { nets: networks.map((x) => x.name), lanes: {}, hide_arp: true },
    _topojson_source: { name: graph.name, node_count: names.length, link_count: cls.edges.length },
    _warnings: commonWarnings(nodes),
  };
}

// 4+ ノード: 任意サイズ graph レーン向け config (xray-graph.html が force レイアウトで描く)
function buildGraphConfig(graph, cls, opts) {
  const byName = {};
  graph.nodes.forEach((nd) => (byName[nd.name] = nd));
  const names = graph.nodes.map((n) => n.name);
  const deg = degreeMap(names, cls.edges);

  let target = opts.target;
  if (!target) target = names.slice().sort((x, y) => (deg[y] - deg[x]))[0];

  const nodes = graph.nodes.map((nd) => nodeObj(nd, inferRole(nd), nd.name === target));
  const networks = edgeNetworks(cls.edges, graph.linkMeta);
  const adjacency = cls.edges.map(([a, b]) => [a, b]);   // 無向エッジ list (force レイアウト用)
  const anyBgp = graph.nodes.some((n) => n._hasBgp);

  const warnings = commonWarnings(nodes);
  warnings.push('4+ ノード = 3形状 dispatcher の範囲外 → xray-graph.html 系の任意サイズ(force)レーンで描画する。');

  return {
    success: true,
    id: graph.name,
    scenario_title: graph.name,
    topology_type: 'graph',
    layout: 'force',
    nodes,
    networks,
    adjacency,
    modes: ['troubleshoot', 'capture'],
    xray: {
      enabled: true,
      protocol: anyBgp ? 'bgp' : 'ospf',
      pattern: 'graph',
      ping_mode: 'through',
      holo_fields: [],
    },
    capture: { nets: networks.map((x) => x.name), lanes: {}, hide_arp: true },
    _topojson_source: { name: graph.name, node_count: names.length, link_count: cls.edges.length },
    _warnings: warnings,
  };
}

// Path A: down-convert to the RAW graph-data shape xray-graph.html ingests directly
// ({nodes:[{name,kind}], links:[{source,target,*_endpoint}]} = clab `graph` Data). xray-graph.html
// builds its own fullCfg from this, so 4+ node topotests overview needs NO frontend change. Per-node
// richness (RID/LSDB/routes) rides window.LIVE_STATES = frr-collect per-node state, not this overview.
function toGraphData(graph) {
  const edges = dedupeEdges(graph.edges);
  return {
    nodes: graph.nodes.map((n) => ({ name: n.name, kind: inferRole(n) === 'server' ? 'host' : 'frr' })),
    links: edges.map((e) => ({ source: e[0], target: e[1], source_endpoint: 'eth0', target_endpoint: 'eth0' })),
  };
}

/* ----------------------------------------------------------------------------
 * 6. convert: JSON テキスト → {ok, config|graphData} (CLI/ブラウザ共通)
 * -------------------------------------------------------------------------- */
function convert(text, opts) {
  opts = opts || {};
  const topo = (typeof text === 'string') ? JSON.parse(text) : text;
  const graph = extractGraphTopojson(topo);
  const cls = classify(graph, opts);
  if (graph.nodes.length < 2) {
    return { ok: false, reason: 'topojson に routers が 2 未満 = トポロジ不成立。',
      nodes: graph.nodes.map((n) => n.name), links: [] };
  }
  if (opts.emit === 'graph-data') return { ok: true, graphData: toGraphData(graph) };
  const config = (cls.shape === 'graph')
    ? buildGraphConfig(graph, cls, opts)
    : buildConfig(graph, cls, opts);
  return { ok: true, config };
}

/* ----------------------------------------------------------------------------
 * 7. selftest (golden fixture 回帰 = parser-rule の検証)
 * -------------------------------------------------------------------------- */
function selftest() {
  // スクリプト自身の場所を基準に解決 (cwd 非依存 = clone 後どこから叩いても回る)
  const nodePath = require('path');
  const fixture = nodePath.join(__dirname, 'fixtures', 'ospf_single_area.json');
  const src = fs.readFileSync(fixture, 'utf8');
  const res = convert(src, {});
  const fail = [];
  const assert = (cond, msg) => { if (!cond) fail.push(msg); };

  assert(res.ok, 'convert 成功');
  const cfg = res.config || {};
  const ids = (cfg.nodes || []).map((n) => n.id).sort();

  // Rule 2: dummy ノード (r3-link0 / r1-link0) が幽霊ノード化していない
  assert(JSON.stringify(ids) === JSON.stringify(['r0', 'r1', 'r2', 'r3']),
    'ノードは r0..r3 の4つのみ (dummy r3-link0/r1-link0 除外): 実際=' + JSON.stringify(ids));

  // Rule 1: ospf.neighbors 権威で 4ノード full-mesh = 6 エッジ
  assert((cfg.networks || []).length === 6,
    'エッジ=6 (4ノード full-mesh): 実際=' + (cfg.networks || []).length);

  // Rule 4: 4ノード → graph レーン
  assert(cfg.topology_type === 'graph', 'topology_type=graph: 実際=' + cfg.topology_type);

  // Rule 3: router_id が各ノードに載る
  const rids = (cfg.nodes || []).map((n) => n.router_id).filter(Boolean);
  assert(rids.length === 4, 'router_id が4ノード全てに: 実際=' + JSON.stringify(rids));

  // ネット名に dummy 由来のものが混ざっていない
  const badNet = (cfg.networks || []).find((nw) => /link\d/.test(nw.name));
  assert(!badNet, 'dummy 由来ネットなし: 実際=' + (badNet ? badNet.name : 'none'));

  // --emit graph-data: xray-graph.html が直接食う shape (Path A)
  const gd = convert(src, { emit: 'graph-data' }).graphData || {};
  const gnames = (gd.nodes || []).map((n) => n.name).sort();
  assert(JSON.stringify(gnames) === JSON.stringify(['r0', 'r1', 'r2', 'r3']),
    'graph-data: nodes r0..r3 のみ (幽霊 link ノードなし): 実際=' + JSON.stringify(gnames));
  assert((gd.nodes || []).length === 4 && (gd.nodes || []).every((n) => n.kind === 'frr'),
    'graph-data: 全ノード kind=frr');
  assert((gd.links || []).length === 6 && (gd.links || []).every((l) => l.source && l.target && l.source_endpoint && l.target_endpoint),
    'graph-data: 6 links (full-mesh) で source/target/endpoint 完備: 実際=' + (gd.links || []).length);

  if (fail.length) {
    process.stderr.write('[SELFTEST FAIL]\n  - ' + fail.join('\n  - ') + '\n');
    process.exit(1);
  }
  process.stdout.write('[SELFTEST PASS] golden ospf_single_area.json: '
    + 'nodes=' + ids.join(',') + ' edges=' + cfg.networks.length
    + ' type=' + cfg.topology_type + ' rids=' + rids.join(',') + '\n');
}

/* ----------------------------------------------------------------------------
 * 8. CLI
 * -------------------------------------------------------------------------- */
function main(argv) {
  const args = argv.slice(2);
  if (args.includes('--selftest')) { selftest(); return; }
  if (args.length === 0 || args.includes('-h') || args.includes('--help')) {
    process.stderr.write(
      'usage: node topojson-to-xray.js <topo.json> [--inverted-v] [--target <node>] [--emit graph-data]\n' +
      '       node topojson-to-xray.js --selftest\n' +
      '  --emit graph-data : raw {nodes,links} for xray-graph.html (any-size overview lane)\n');
    process.exit(args.length === 0 ? 1 : 0);
  }
  const opts = { invertedV: args.includes('--inverted-v'), target: null, emit: null };
  const ti = args.indexOf('--target');
  if (ti >= 0 && args[ti + 1]) opts.target = args[ti + 1];
  const ei = args.indexOf('--emit');
  if (ei >= 0 && args[ei + 1]) opts.emit = args[ei + 1];
  const file = args.find((a) => !a.startsWith('--') && a !== opts.target && a !== opts.emit);

  const src = fs.readFileSync(file, 'utf8');
  const res = convert(src, opts);
  if (!res.ok) {
    process.stderr.write('[UNSUPPORTED] ' + res.reason + '\n');
    process.stderr.write('  routers: ' + res.nodes.join(', ') + '\n');
    process.exit(2);
  }
  process.stdout.write(JSON.stringify(opts.emit === 'graph-data' ? res.graphData : res.config, null, 2) + '\n');
}

const _api = {
  extractGraphTopojson: extractGraphTopojson,
  isDummyLink: isDummyLink,
  classify: classify,
  buildConfig: buildConfig,
  buildGraphConfig: buildGraphConfig,
  toGraphData: toGraphData,
  convert: convert,
};
if (typeof require === 'function' && typeof module !== 'undefined' && require.main === module) main(process.argv);
if (typeof module !== 'undefined' && module.exports) module.exports = _api;
if (typeof window !== 'undefined') window.topojsonToXray = _api;   // ブラウザ (frr-paste 等が使用)
