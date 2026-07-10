#!/usr/bin/env node
/*
 * clab-to-xray.js  —  案A プロトタイプ
 *
 * containerlab のトポロジ定義 (.clab.yml / .yaml / .json) を読み、
 * X-Ray が食う `config` JSON (= OSS gallery facade の入口手前) を出力する。
 *
 * 【スコープ = 13_OSS化について.txt §12 案A】
 *   X-Ray コアが描けるのは 3 形だけ (triangle / linear_2node / linear_3node, +layout inverted_v)。
 *   よって本変換器は「2〜3 ノードの小さな FRR ラボ」だけを既存3形にマップする。
 *   任意 N ノードの一般グラフは UNSUPPORTED として明示エラーにする (= 案B が要る領域)。
 *
 * 【出力するもの / しないもの】
 *   出力する  : topology_type / layout / nodes(id,type,role,target,loopback) / networks(members,host_id)
 *               + capture の最小スケルトン + provenance(_clab_source) + 警告(_warnings)
 *   出力しない: xray.protocol/pattern や live state (normal/detour/dead) は facade 領域。
 *               ここでは xray は enabled スタブのみ置き、TODO コメントで facade 層に委ねる。
 *
 * 依存ゼロ (Node 標準のみ)。YAML は clab の素直なサブセット用の最小パーサで読む
 * (複雑な YAML は .json 入力推奨。--json で JSON として読む)。
 *
 * 使い方:
 *   node clab-to-xray.js <topo.clab.yml> [--inverted-v] [--target <node>] [--json]
 *   node clab-to-xray.js samples/2node.clab.yml
 */
'use strict';
// dual-mode: Node CLI + ブラウザ両用。fs は Node でのみ参照 (CLI 専用)。
const fs = (typeof require === 'function') ? require('fs') : null;

/* ----------------------------------------------------------------------------
 * 1. 最小 YAML ローダ (clab topology サブセット専用)
 *    対応: コメント(#) / インデント map / "- " list / inline flow [a, b] / 引用符
 *    非対応: アンカー, 複数行スカラ, 複雑なネスト flow 等 → その場合は --json を使う
 * -------------------------------------------------------------------------- */
function parseScalar(s) {
  s = s.trim();
  if (s === '') return null;
  if ((s[0] === '"' && s.endsWith('"')) || (s[0] === "'" && s.endsWith("'"))) {
    return s.slice(1, -1);
  }
  if (s === 'true') return true;
  if (s === 'false') return false;
  if (s === 'null' || s === '~') return null;
  if (/^-?\d+$/.test(s)) return parseInt(s, 10);
  if (/^-?\d*\.\d+$/.test(s)) return parseFloat(s);
  return s;
}

function parseFlow(s) {
  // [a, b, "c:eth1"] のインライン list を分解 (ネストなし前提)
  const inner = s.trim().replace(/^\[/, '').replace(/\]$/, '');
  if (inner.trim() === '') return [];
  const out = [];
  let buf = '', q = null;
  for (const ch of inner) {
    if (q) { if (ch === q) q = null; else buf += ch; continue; }
    if (ch === '"' || ch === "'") { q = ch; continue; }
    if (ch === ',') { out.push(parseScalar(buf)); buf = ''; continue; }
    buf += ch;
  }
  if (buf.trim() !== '') out.push(parseScalar(buf));
  return out;
}

function tokenize(src) {
  const lines = [];
  for (const raw of src.split(/\r?\n/)) {
    // コメント除去 (引用符内 # は雑に無視 = clab topology では問題になりにくい)
    let line = raw;
    const hash = findCommentHash(line);
    if (hash >= 0) line = line.slice(0, hash);
    if (line.trim() === '') continue;
    const indent = line.length - line.trimStart().length;
    lines.push({ indent, text: line.trim(), raw });
  }
  return lines;
}

function findCommentHash(line) {
  let q = null;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (q) { if (ch === q) q = null; continue; }
    if (ch === '"' || ch === "'") { q = ch; continue; }
    if (ch === '#' && (i === 0 || line[i - 1] === ' ' || line[i - 1] === '\t')) return i;
  }
  return -1;
}

function parseYaml(src) {
  const lines = tokenize(src);
  let pos = 0;

  function parseBlock(minIndent) {
    // 先読みで map か list か判定
    if (pos >= lines.length) return null;
    const first = lines[pos];
    if (first.indent < minIndent) return null;
    const isList = first.text.startsWith('- ');
    return isList ? parseList(first.indent) : parseMap(first.indent);
  }

  function parseMap(indent) {
    const obj = {};
    while (pos < lines.length) {
      const ln = lines[pos];
      if (ln.indent < indent) break;
      if (ln.indent > indent) throw new Error('YAML indent error near: ' + ln.raw);
      if (ln.text.startsWith('- ')) break;
      const m = ln.text.match(/^([^:]+):\s*(.*)$/);
      if (!m) throw new Error('YAML parse error (expected key:): ' + ln.raw);
      const key = parseScalar(m[1]);
      const rest = m[2];
      pos++;
      if (rest === '') {
        // 子ブロック
        const child = (pos < lines.length && lines[pos].indent > indent) ? parseBlock(indent + 1) : null;
        obj[key] = child;
      } else if (rest.trim().startsWith('[')) {
        obj[key] = parseFlow(rest);
      } else {
        obj[key] = parseScalar(rest);
      }
    }
    return obj;
  }

  function parseList(indent) {
    const arr = [];
    while (pos < lines.length) {
      const ln = lines[pos];
      if (ln.indent < indent) break;
      if (ln.indent > indent) throw new Error('YAML indent error near: ' + ln.raw);
      if (!ln.text.startsWith('- ')) break;
      const itemText = ln.text.slice(2);
      const m = itemText.match(/^([^:\[\]]+):\s*(.*)$/);
      if (m) {
        // "- key: val" = list item が map → 同じ行から map を組む
        // 仮想的に行を分解: この item の指す map を構築
        const item = {};
        const key = parseScalar(m[1]);
        const rest = m[2];
        const childIndent = ln.indent + 2;
        pos++;
        if (rest === '') {
          item[key] = (pos < lines.length && lines[pos].indent >= childIndent) ? parseBlock(childIndent) : null;
        } else if (rest.trim().startsWith('[')) {
          item[key] = parseFlow(rest);
        } else {
          item[key] = parseScalar(rest);
        }
        // 同一 item の続き key (childIndent)
        while (pos < lines.length && lines[pos].indent === childIndent && !lines[pos].text.startsWith('- ')) {
          const m2 = lines[pos].text.match(/^([^:]+):\s*(.*)$/);
          if (!m2) break;
          const k2 = parseScalar(m2[1]);
          const r2 = m2[2];
          pos++;
          if (r2 === '') {
            item[k2] = (pos < lines.length && lines[pos].indent > childIndent) ? parseBlock(childIndent + 1) : null;
          } else if (r2.trim().startsWith('[')) {
            item[k2] = parseFlow(r2);
          } else {
            item[k2] = parseScalar(r2);
          }
        }
        arr.push(item);
      } else {
        arr.push(parseScalar(itemText));
        pos++;
      }
    }
    return arr;
  }

  const result = parseBlock(0);
  return result || {};
}

/* ----------------------------------------------------------------------------
 * 2. clab topology → 無向グラフ抽出
 * -------------------------------------------------------------------------- */
function extractGraph(clab) {
  const topo = clab.topology || {};
  const nodesRaw = topo.nodes || {};
  const linksRaw = topo.links || [];

  // nodes: clab は map {name: {kind, image, ...}}
  const nodes = Object.keys(nodesRaw).map((name) => {
    const def = nodesRaw[name] || {};
    return { name, kind: def.kind || '', image: def.image || '' };
  });

  // links: 各要素 {endpoints: ["r1:eth1", "r2:eth1"]} (新形式 endpoints map にも一応対応)
  const edges = [];
  for (const l of linksRaw) {
    let eps = l && l.endpoints;
    if (!eps) continue;
    // endpoints が ["node:iface", ...] の配列
    const pair = eps.map((e) => {
      if (typeof e === 'string') return e.split(':')[0];
      if (e && e.node) return e.node; // 新形式 {node, interface}
      return String(e);
    });
    if (pair.length === 2 && pair[0] && pair[1]) {
      edges.push([pair[0], pair[1]]);
    }
  }
  return { name: clab.name || 'clab', nodes, edges };
}

/* ----------------------------------------------------------------------------
 * 3. 役割推定 (router / server) — 控えめ・文書化済みヒューリスティック
 * -------------------------------------------------------------------------- */
const SERVER_KINDS = new Set(['host', 'linux-host']);
const SERVER_NAME_RE = /^(sv|server|host|client|pc|h\d+)$/i;
function inferRole(node) {
  if (SERVER_KINDS.has((node.kind || '').toLowerCase())) return 'server';
  if (SERVER_NAME_RE.test(node.name)) return 'server';
  return 'router';
}

/* ----------------------------------------------------------------------------
 * 4. 形状分類 + X-Ray config 組み立て
 * -------------------------------------------------------------------------- */
function dedupeEdges(edges) {
  const seen = new Set();
  const out = [];
  for (const [a, b] of edges) {
    const key = [a, b].sort().join('\x00');
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
  if (n === 3 && m === 2) {
    // path: 中心 (degree 2) を挟む。inverted_v 指定なら layout を付与。
    return { shape: 'linear_3node', layout: opts.invertedV ? 'inverted_v' : '', edges };
  }
  // それ以外は案A 非対応
  return {
    shape: null,
    reason: `unsupported topology: nodes=${n}, links(dedup)=${m}. ` +
      `案A は 2-3 ノードの triangle / linear のみ対応 (一般グラフは案B が必要)。`,
    edges,
  };
}

function netName(a, b) { return 'net-' + a + b; }

// linear (path) のノードを鎖順に並べ替える (X-Ray linear renderer は config 順に左右描画するため)。
// triangle は循環で順不問なので触らない。
function orderForLinear(names, edges, roleOf) {
  const deg = degreeMap(names, edges);
  const ends = names.filter((n) => deg[n] === 1);
  if (ends.length !== 2) return names; // 鎖でない → そのまま
  const adj = {};
  names.forEach((n) => (adj[n] = []));
  edges.forEach(([a, b]) => { adj[a].push(b); adj[b].push(a); });
  // 端点を決定的に選ぶ: server 側を左端に優先、無ければアルファベット順
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

function buildConfig(graph, cls, opts) {
  let names = graph.nodes.map((n) => n.name);
  const byName = {};
  graph.nodes.forEach((nd) => (byName[nd.name] = nd));
  if (cls.shape === 'linear_2node' || cls.shape === 'linear_3node') {
    names = orderForLinear(names, cls.edges, (n) => inferRole(byName[n]));
  }
  const orderedRaw = names.map((n) => byName[n]);
  const deg = degreeMap(names, cls.edges);

  // target 推定: 明示指定 > 最大次数ノード (= 観察対象になりやすい transit)
  let target = opts.target;
  if (!target) {
    target = names.slice().sort((x, y) => (deg[y] - deg[x]))[0];
  }

  const nodes = orderedRaw.map((nd) => {
    const role = inferRole(nd);
    const node = {
      id: nd.name,
      type: role,                       // 'router' | 'server'
      role: role === 'server' ? 'Server' : 'Router',
    };
    if (nd.name === target && role === 'router') node.target = true;
    return node;
  });

  // networks: 各 edge を1ネットに。host_id は端点順に 10/20。
  const networks = cls.edges.map(([a, b]) => ({
    name: netName(a, b),
    members: [
      { node: a, host_id: 10 },
      { node: b, host_id: 20 },
    ],
  }));

  const warnings = [];
  if (!nodes.some((x) => x.type === 'server')) {
    warnings.push('全ノードが router 判定。server ノードがあれば kind:host か名前(sv/host/...) を付けると改善。');
  }
  warnings.push('xray.protocol / pattern / live state(normal/detour/dead) は未生成 = facade 領域。');
  warnings.push('host_id とサブネットは仮 (.10/.20)。実 clab IP を使うなら inspect JSON enrichment が要る (案C)。');

  return {
    // ---- X-Ray が読む描画 config (facade 入口手前) ----
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
      protocol: 'static',          // TODO: 実プロトコルに置換 (ospf/bgp)
      pattern: cls.shape === 'triangle' ? 'ospf_triangle' : 'static_linear', // 仮
      ping_mode: 'through',
      holo_fields: [],             // TODO: facade で供給
    },
    capture: { nets: networks.map((x) => x.name), lanes: {}, hide_arp: true },
    // ---- provenance / 引き継ぎ情報 (X-Ray は無視, human-facing) ----
    _clab_source: { name: graph.name, node_count: names.length, link_count: cls.edges.length },
    _warnings: warnings,
  };
}

/* ----------------------------------------------------------------------------
 * 4b. convert: テキスト → {ok, config} | {ok:false, reason,...} (CLI/ブラウザ共通)
 * -------------------------------------------------------------------------- */
function convert(text, opts) {
  opts = opts || {};
  var clab = (opts.json) ? JSON.parse(text) : parseYaml(text);
  var graph = extractGraph(clab);
  var cls = classify(graph, opts);
  if (!cls.shape) {
    return { ok: false, reason: cls.reason,
      nodes: graph.nodes.map(function (n) { return n.name; }),
      links: dedupeEdges(graph.edges).map(function (e) { return e.join('-'); }) };
  }
  return { ok: true, config: buildConfig(graph, cls, opts) };
}

/* ----------------------------------------------------------------------------
 * 5. CLI
 * -------------------------------------------------------------------------- */
function main(argv) {
  const args = argv.slice(2);
  if (args.length === 0 || args.includes('-h') || args.includes('--help')) {
    process.stderr.write(
      'usage: node clab-to-xray.js <topo.clab.yml|.json> [--inverted-v] [--target <node>] [--json]\n');
    process.exit(args.length === 0 ? 1 : 0);
  }
  const opts = { invertedV: args.includes('--inverted-v'), json: args.includes('--json'), target: null };
  const ti = args.indexOf('--target');
  if (ti >= 0 && args[ti + 1]) opts.target = args[ti + 1];
  const file = args.find((a) => !a.startsWith('--') && a !== opts.target);

  const src = fs.readFileSync(file, 'utf8');
  let clab;
  if (opts.json || file.endsWith('.json')) clab = JSON.parse(src);
  else clab = parseYaml(src);

  const graph = extractGraph(clab);
  const cls = classify(graph, opts);
  if (!cls.shape) {
    process.stderr.write('[UNSUPPORTED] ' + cls.reason + '\n');
    process.stderr.write('  nodes: ' + graph.nodes.map((n) => n.name).join(', ') + '\n');
    process.stderr.write('  links: ' + dedupeEdges(graph.edges).map((e) => e.join('-')).join(', ') + '\n');
    process.exit(2);
  }
  const config = buildConfig(graph, cls, opts);
  process.stdout.write(JSON.stringify(config, null, 2) + '\n');
}

var _api = { parseYaml: parseYaml, extractGraph: extractGraph, classify: classify, buildConfig: buildConfig, convert: convert };
if (typeof require === 'function' && typeof module !== 'undefined' && require.main === module) main(process.argv);
if (typeof module !== 'undefined' && module.exports) module.exports = _api;
if (typeof window !== 'undefined') window.clabToXray = _api;   // ブラウザ (clab-paste デモが使用)
