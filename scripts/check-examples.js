#!/usr/bin/env node
// check-examples.js — mechanical consistency checks for examples/*/README.md (Node built-ins only)
//
//   node scripts/check-examples.js            # check every example, exit 1 on any problem
//
// For each examples/<dir>/README.md:
//   - the commands use ./xray.sh (never demo.sh)
//   - `xray.sh <lab>` and `containerlab destroy -t <lab>` name a topology file that exists
//     (destroy: the lab of this folder)
//   - `docker exec -it clab-<lab>-<node> ...` uses this lab's `name:` and a node of the topology;
//     `vtysh` only on FRR nodes
//   - the "Nodes:" / "ノード:" line lists exactly the topology's nodes, with the right kind
//   - `examples/<dir>/` mentions and `docker pull <image>` match what exists
//   - IPv4 addresses in `code` appear in the lab's files (topology, configs, problem.json)
//   - relative markdown links (and #anchors) resolve
// examples/README.md: each table lists every example folder once (with its -solved twin in the same row),
//   links each name to its folder, and has the right protocol, vendor, title line and ./xray.sh command.
'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const EXAMPLES = path.join(ROOT, 'examples');

// --- minimal containerlab topology reader (the examples' one-line `node: { ... }` style and block style) ---
function parseTopology(text) {
  const out = { name: null, nodes: {} };
  const m = text.match(/^name:\s*(\S+)/m);
  if (m) out.name = m[1].replace(/^["']|["']$/g, '');
  const lines = text.split('\n');
  let inTopo = false, inNodes = false, nodeIndent = -1, cur = null;
  let inKinds = -1, kindName = null;
  const kindImage = {}; // topology.kinds.<kind>.image: the default image of that kind
  for (const raw of lines) {
    const line = raw.replace(/\s+#.*$/, '');
    if (!line.trim() || /^\s*#/.test(raw)) continue;
    const ind = line.match(/^ */)[0].length;
    if (ind === 0) { inTopo = /^topology:/.test(line); inNodes = false; cur = null; continue; }
    if (!inTopo) continue;
    const km = line.match(/^(\s*)([A-Za-z0-9_.-]+):\s*(.*)$/);
    if (!inNodes) {
      if (km && km[2] === 'nodes') { inNodes = true; nodeIndent = -1; }
      else if (km && km[2] === 'kinds') inKinds = ind;
      else if (km && inKinds >= 0 && ind <= inKinds) inKinds = -1;
      else if (km && inKinds >= 0 && km[2] !== 'image') kindName = km[2];
      else if (km && inKinds >= 0 && km[2] === 'image' && kindName) kindImage[kindName] = km[3].trim();
      continue;
    }
    if (km && nodeIndent < 0) nodeIndent = ind;
    if (ind < nodeIndent) { inNodes = km && km[2] === 'nodes'; nodeIndent = -1; cur = null; continue; }
    if (ind === nodeIndent && km) {
      cur = out.nodes[km[2]] = { kind: null, image: null };
      const rest = km[3];
      const kind = rest.match(/\bkind:\s*([^,}\s]+)/); if (kind) cur.kind = kind[1];
      const img = rest.match(/\bimage:\s*([^,}\s]+)/); if (img) cur.image = img[1];
      continue;
    }
    if (cur && km) {
      if (km[2] === 'kind') cur.kind = km[3].trim();
      if (km[2] === 'image') cur.image = km[3].trim();
    }
  }
  for (const n of Object.values(out.nodes)) if (!n.image && n.kind && kindImage[n.kind]) n.image = kindImage[n.kind];
  return out;
}

// FRR / IOL / SR Linux / Linux, as the READMEs name them
function vendorOf(node) {
  const kind = node.kind || '';
  const image = node.image || '';
  if (/cisco_iol|cisco_c8000v|cisco_csr|cisco_cat9kv|iosxe/.test(kind)) return 'IOL';
  if (/nokia_srlinux|^srl$/.test(kind)) return 'SR Linux';
  if (/frrouting\/frr|\/frr[:@]/.test(image)) return 'FRR';
  return 'Linux';
}

// GitHub-style heading anchor
function slug(heading) {
  return heading.trim().toLowerCase()
    .replace(/[^\p{L}\p{N}\s_-]/gu, '')
    .replace(/\s/g, '-');
}
function anchorsOf(md) {
  const set = new Set();
  const counts = {};
  let fence = false;
  for (const line of md.split('\n')) {
    if (/^\s*```/.test(line)) { fence = !fence; continue; }
    if (fence) continue;
    const m = line.match(/^#{1,6}\s+(.*?)\s*#*\s*$/);
    if (!m) continue;
    const s = slug(m[1]);
    const n = counts[s] || 0;
    counts[s] = n + 1;
    set.add(n ? `${s}-${n}` : s);
  }
  return set;
}

// relative links [text](target) outside code; returns problems
// a path for messages, with '/' on every OS
function relPath(abs) { return path.relative(ROOT, abs).split(path.sep).join('/'); }

function checkLinks(file, md) {
  const problems = [];
  const anchors = anchorsOf(md);
  const noCode = md.replace(/```[\s\S]*?```/g, '').replace(/`[^`\n]*`/g, '');
  const re = /\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g;
  let m;
  while ((m = re.exec(noCode))) {
    const target = m[1];
    if (/^[a-z][a-z0-9+.-]*:/i.test(target)) continue; // http:, https:, mailto:
    const [p, frag] = target.split('#');
    if (!p) {
      if (frag && !anchors.has(decodeURIComponent(frag))) problems.push(`link #${frag}: no such heading`);
      continue;
    }
    const abs = path.resolve(path.dirname(file), decodeURIComponent(p));
    if (!fs.existsSync(abs)) { problems.push(`link ${target}: ${relPath(abs)} does not exist`); continue; }
    if (frag && /\.md$/i.test(abs) && fs.statSync(abs).isFile()
        && !anchorsOf(fs.readFileSync(abs, 'utf8')).has(decodeURIComponent(frag))) {
      problems.push(`link ${target}: no such heading in ${relPath(abs)}`);
    }
  }
  return problems;
}

function labFiles(dir) {
  return fs.readdirSync(dir).filter((f) => /\.clab\.ya?ml$/.test(f));
}

// all text the lab is made of: topology, configs, problem.json
function labText(dir) {
  const parts = [];
  (function walk(d) {
    for (const f of fs.readdirSync(d)) {
      const p = path.join(d, f);
      const st = fs.statSync(p);
      if (st.isDirectory()) walk(p);
      else if (f !== 'README.md' && st.size < 1e6) parts.push(fs.readFileSync(p, 'utf8'));
    }
  })(dir);
  return parts.join('\n');
}

function checkExampleReadme(dirName, root = ROOT) {
  const dir = path.join(root, 'examples', dirName);
  const file = path.join(dir, 'README.md');
  const md = fs.readFileSync(file, 'utf8');
  const problems = [];
  const labs = labFiles(dir);
  if (labs.length !== 1) { problems.push(`expected one *.clab.yml in the folder, found ${labs.length}`); return problems; }
  const topo = parseTopology(fs.readFileSync(path.join(dir, labs[0]), 'utf8'));
  const nodeNames = Object.keys(topo.nodes);
  const ownLab = `examples/${dirName}/${labs[0]}`;

  if (/\bdemo\.sh\b/.test(md)) problems.push('uses demo.sh (should be ./xray.sh)');

  // xray.sh <lab>
  const xr = [...md.matchAll(/xray\.sh\s+(examples\/\S+?\.clab\.ya?ml)/g)].map((m) => m[1]);
  if (!xr.includes(ownLab)) problems.push(`no "./xray.sh ${ownLab}" start command`);
  for (const p of xr) if (!fs.existsSync(path.join(root, p))) problems.push(`xray.sh ${p}: file does not exist`);
  for (const m of md.matchAll(/(?:^|[\s(`])(?:\.\/)?xray\.sh\b/g)) {
    // the start command must be run as ./xray.sh from the repository root
    const s = md.slice(m.index, m.index + m[0].length).trim().replace(/^[(`]/, '');
    if (!s.startsWith('./')) problems.push('xray.sh without ./');
  }

  // containerlab destroy -t <lab>
  for (const m of md.matchAll(/containerlab destroy -t (\S+)/g)) {
    const p = m[1];
    if (p.startsWith('<') || p.startsWith('$')) continue;
    if (!fs.existsSync(path.join(root, p))) problems.push(`containerlab destroy -t ${p}: file does not exist`);
    else if (p !== ownLab) problems.push(`containerlab destroy -t ${p}: not this folder's lab (${ownLab})`);
  }

  // docker exec -it clab-<lab>-<node> <cmd>
  for (const m of md.matchAll(/docker exec -it clab-(\S+?)\s+(\S+)/g)) {
    const cname = m[1];
    if (cname.startsWith('<')) continue;
    if (!topo.name || !cname.startsWith(topo.name + '-')) {
      problems.push(`docker exec clab-${cname}: lab name is not "${topo.name}"`);
      continue;
    }
    const node = cname.slice(topo.name.length + 1);
    if (!topo.nodes[node]) { problems.push(`docker exec clab-${cname}: no node "${node}" in ${labs[0]}`); continue; }
    if (m[2] === 'vtysh' && vendorOf(topo.nodes[node]) !== 'FRR') {
      problems.push(`docker exec clab-${cname} vtysh: ${node} is ${vendorOf(topo.nodes[node])}, not FRR`);
    }
  }

  // Nodes: r1 (FRR), r2 (IOL)   /   ノード: r1(FRR)・r2(FRR)
  for (const m of md.matchAll(/^(?:Nodes|ノード):\s*(.+)$/gm)) {
    const body = m[1].split(/\.\s|。/)[0];
    const listed = [...body.matchAll(/([A-Za-z0-9_-]+)\s*\(([^)]+)\)/g)];
    const names = listed.map((x) => x[1]);
    for (const [, n, v] of listed) {
      if (!topo.nodes[n]) problems.push(`nodes line: "${n}" is not in ${labs[0]}`);
      else if (vendorOf(topo.nodes[n]) !== v.trim()) problems.push(`nodes line: ${n} is ${vendorOf(topo.nodes[n])}, README says ${v}`);
    }
    for (const n of nodeNames) if (!names.includes(n)) problems.push(`nodes line: misses "${n}"`);
  }

  // examples/<dir>/ mentions
  for (const m of md.matchAll(/`examples\/([A-Za-z0-9_.-]+)\/?`/g)) {
    if (!fs.existsSync(path.join(root, 'examples', m[1]))) problems.push(`examples/${m[1]}/ does not exist`);
  }
  // `../<dir>/` mentions (`./run.sh` / `./stop.sh` belong to the release package, not this folder)
  for (const m of md.matchAll(/`(\.\.\/[^`\s]+)`/g)) {
    if (!fs.existsSync(path.resolve(dir, m[1]))) problems.push(`${m[1]} does not exist (from examples/${dirName}/)`);
  }

  // docker pull <image>
  const images = new Set(Object.values(topo.nodes).map((n) => n.image).filter(Boolean));
  for (const m of md.matchAll(/docker pull (\S+?)`/g)) {
    if (!images.has(m[1])) problems.push(`docker pull ${m[1]}: no node in ${labs[0]} uses that image`);
  }
  // image: line named for the user to change (IOL)
  for (const m of md.matchAll(/`image:`[^`]*`([^`]+)`/g)) {
    if (!images.has(m[1])) problems.push(`image ${m[1]}: no node in ${labs[0]} uses that image`);
  }

  // IPv4 addresses in code must exist in the lab
  const text = labText(dir);
  const seen = new Set();
  for (const m of md.matchAll(/`[^`\n]*`/g)) {
    for (const a of m[0].matchAll(/(?<![\d.])(\d{1,3}(?:\.\d{1,3}){3})(?:\/\d+)?(?![\d.])/g)) {
      const ip = a[1];
      if (seen.has(ip)) continue;
      seen.add(ip);
      const re = new RegExp(`(?<![\\d.])${ip.replace(/\./g, '\\.')}(?![\\d])`);
      if (!re.test(text)) problems.push(`address ${ip} is not in the lab's files`);
    }
  }

  problems.push(...checkLinks(file, md));
  return [...new Set(problems)];
}

// protocols as the index names them, from the folder name (q15-bgp-ospf-static -> BGP + OSPF + static)
const PROTOCOLS = { static: 'static', ospf: 'OSPF', bgp: 'BGP' };
function protocolsOf(dirName) {
  return dirName.split('-').filter((w) => PROTOCOLS[w]).map((w) => PROTOCOLS[w]);
}
// router vendors of a lab, as the index names them (Linux hosts left out)
function routerVendorsOf(topo) {
  const names = { FRR: 'FRR', 'SR Linux': 'SR Linux', IOL: 'Cisco IOL' };
  return [...new Set(Object.values(topo.nodes).map(vendorOf).filter((v) => names[v]).map((v) => names[v]))];
}
function sameSet(a, b) { return a.length === b.length && a.every((x) => b.includes(x)); }

// examples/README.md: the tables of labs (English, and 日本語 after its heading).
// Row: | [dir](dir/) / [dir-solved](dir-solved/) | protocols | vendors | what is broken | `./xray.sh examples/dir/lab.clab.yml` |
// Each table lists every example folder exactly once; every row names folders that exist.
function checkIndexReadme(root = ROOT) {
  const file = path.join(root, 'examples', 'README.md');
  const md = fs.readFileSync(file, 'utf8');
  const problems = [];
  const listed = new Set();
  const all = exampleDirs(root);
  const jaAt = md.search(/^## 日本語\s*$/m);
  const tables = [];
  let cur = null, offset = 0;
  for (const line of md.split('\n')) {
    if (/^\|\s*\[/.test(line)) {
      if (!cur) tables.push(cur = { ja: jaAt >= 0 && offset > jaAt, rows: [] });
      cur.rows.push(line);
    } else if (!/^\|/.test(line)) cur = null;
    offset += line.length + 1;
  }
  if (!tables.length) problems.push('no table of labs');
  for (const t of tables) {
    const where = t.ja ? 'table (日本語)' : 'table';
    const seen = new Set();
    for (const row of t.rows) {
      const cells = row.replace(/^\|/, '').replace(/\|\s*$/, '').split('|').map((c) => c.trim());
      if (cells.length !== 5) { problems.push(`${where}: expected 5 columns: ${row}`); continue; }
      const [names, proto, vendor, broken, start] = cells;
      const links = [...names.matchAll(/\[([^\]]+)\]\(([^)]+)\)/g)];
      if (links.length !== 2) { problems.push(`${where}: expected [lab](lab/) / [lab-solved](lab-solved/): ${names}`); continue; }
      for (const [, text, target] of links) {
        if (target.replace(/\/$/, '') !== text) problems.push(`${where}: [${text}] links to ${target}, not ${text}/`);
      }
      const dir = links[0][1];
      const solved = links[1][1];
      if (solved !== `${dir}-solved`) problems.push(`${where}: ${dir}: the solved twin is ${solved}, expected ${dir}-solved`);
      for (const d of [dir, solved]) {
        if (!all.includes(d)) { problems.push(`${where}: examples/${d}/ is not an example folder`); continue; }
        if (seen.has(d)) problems.push(`${where}: ${d} is listed twice`);
        seen.add(d);
        listed.add(d);
      }
      if (!all.includes(dir)) continue;
      const exDir = path.join(root, 'examples', dir);
      const labs = labFiles(exDir);
      if (labs.length !== 1) continue; // reported by checkExampleReadme
      const want = `\`./xray.sh examples/${dir}/${labs[0]}\``;
      if (start !== want) problems.push(`${where}: ${dir}: start is ${start}, expected ${want}`);
      const wantProto = protocolsOf(dir);
      const gotProto = proto.split('+').map((s) => s.trim()).filter(Boolean);
      if (!sameSet(gotProto, wantProto)) problems.push(`${where}: ${dir}: protocol "${proto}", expected "${wantProto.join(' + ')}"`);
      const wantVendor = routerVendorsOf(parseTopology(fs.readFileSync(path.join(exDir, labs[0]), 'utf8')));
      const gotVendor = vendor.split('+').map((s) => s.trim()).filter(Boolean);
      if (!sameSet(gotVendor, wantVendor)) problems.push(`${where}: ${dir}: vendor "${vendor}", expected "${wantVendor.join(' + ')}"`);
      // what is broken: the quoted question of the folder README's title (English / 日本語)
      const exMd = fs.readFileSync(path.join(exDir, 'README.md'), 'utf8');
      const exJa = exMd.search(/^## 日本語\s*$/m);
      const titlePart = t.ja ? (exJa >= 0 ? exMd.slice(exJa) : '') : (exJa >= 0 ? exMd.slice(0, exJa) : exMd);
      const title = (titlePart.match(/^# (.*)$/m) || [])[1] || '';
      const q = title.match(t.ja ? /「[^」]+」/ : /"[^"]+"/);
      if (q && broken !== q[0]) problems.push(`${where}: ${dir}: what is broken is ${broken}, the README title says ${q[0]}`);
      if (!broken) problems.push(`${where}: ${dir}: what is broken is empty`);
    }
    for (const d of all) if (!seen.has(d)) problems.push(`${where}: ${d} is missing`);
  }
  for (const m of md.matchAll(/xray\.sh\s+(examples\/\S+?\.clab\.ya?ml)/g)) {
    if (!fs.existsSync(path.join(root, m[1]))) problems.push(`xray.sh ${m[1]}: file does not exist`);
  }
  if (/\bdemo\.sh\b/.test(md)) problems.push('uses demo.sh (should be ./xray.sh)');
  problems.push(...checkLinks(file, md));
  return { problems, listed };
}

function exampleDirs(root = ROOT) {
  const base = path.join(root, 'examples');
  return fs.readdirSync(base).filter((d) => fs.existsSync(path.join(base, d, 'README.md'))).sort();
}

function checkAll(root = ROOT) {
  const result = {};
  const idx = checkIndexReadme(root);
  for (const d of exampleDirs(root)) if (!idx.listed.has(d)) idx.problems.push(`${d} is not listed`);
  if (idx.problems.length) result['examples/README.md'] = idx.problems;
  for (const d of exampleDirs(root)) {
    const p = checkExampleReadme(d, root);
    if (p.length) result[`examples/${d}/README.md`] = p;
  }
  return result;
}

module.exports = { parseTopology, vendorOf, protocolsOf, slug, anchorsOf, checkLinks, checkExampleReadme, checkIndexReadme, checkAll, exampleDirs };

if (require.main === module) {
  var _cli = process.argv.slice(2);
  if (_cli.indexOf('-h') >= 0 || _cli.indexOf('--help') >= 0) { console.log('usage: node scripts/check-examples.js\n  check examples/*/README.md against the labs (no options; exit 1 on any problem)\n  -h, --help  show this help'); process.exit(0); }
  var _bad = _cli[0];
  if (_bad) { console.error('check-examples.js: unknown option: ' + _bad + "\nTry 'node scripts/check-examples.js --help'."); process.exit(2); }
  const result = checkAll();
  const files = Object.keys(result);
  for (const f of files) for (const p of result[f]) console.log(`${f}: ${p}`);
  const n = exampleDirs().length + 1;
  console.log(files.length ? `\n${files.length} of ${n} READMEs have problems` : `all ${n} example READMEs OK`);
  process.exit(files.length ? 1 : 0);
}
