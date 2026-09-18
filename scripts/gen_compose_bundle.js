#!/usr/bin/env node
/* gen_compose_bundle.js — turn a containerlab lab into a self-contained `docker compose up` X-Ray
 * bundle (β compose-native FRR + socketless collector + live auto-follow).
 *   usage: node gen_compose_bundle.js <lab.clab.yml> <cfg-src-dir> <assets-dir> <out-dir>
 *     lab.clab.yml : containerlab topology (nodes + links)
 *     cfg-src-dir  : dir with <node>/frr.conf + <node>/daemons (e.g. examples/q21-bgp-lp)
 *     assets-dir   : network-xray checkout (engine + collector scripts + teal template)
 *     out-dir      : bundle output
 * Emits: compose.yml, <node>/{frr.conf(eth-stanza dropped),daemons}, web/(teal index.html + engine),
 *        collector/(Dockerfile+watch.sh+patched clab-collect.js+orchestrator+topo), server/(static), README.md
 */
var fs = require('fs'), path = require('path');
var A = process.argv;
if (A.length < 6) { console.error('usage: gen_compose_bundle.js <lab.clab.yml> <cfg-src-dir> <assets-dir> <out-dir>'); process.exit(2); }
var CLAB = A[2], CFG = A[3], NX = A[4], OUT = A[5];

function rd(f) { return fs.readFileSync(f, 'utf8'); }
function wr(f, s) { fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, s); }

// ---- 1) parse clab.yml: name + nodes + links ----
var clabTxt = rd(CLAB);
var labName = (clabTxt.match(/^name:\s*(\S+)/m) || [])[1] || 'xray-lab';
var proto = /router bgp/i.test(rd(path.join(CFG, fs.readdirSync(CFG).filter(function (d) { return fs.existsSync(path.join(CFG, d, 'frr.conf')); })[0], 'frr.conf'))) ? 'bgp' : 'ospf';
var linkRe = /endpoints:\s*\[\s*"([^:"]+):([^"\]]+)"\s*,\s*"([^:"]+):([^"\]]+)"\s*\]/g, m;
var links = [], nodeSet = {};
while ((m = linkRe.exec(clabTxt))) { links.push({ a: m[1], ai: m[2], b: m[3], bi: m[4] }); nodeSet[m[1]] = 1; nodeSet[m[3]] = 1; }
var nodes = Object.keys(nodeSet).sort();
if (!nodes.length) { console.error('!! no links/nodes parsed from ' + CLAB); process.exit(1); }

// ---- 2) per-node interface IPs + OSPF area from frr.conf (per `interface` stanza) ----
var ifip = {};   // ifip[node][iface] = { ip, plen, ospfArea }
nodes.forEach(function (n) {
  ifip[n] = {};
  var cf = path.join(CFG, n, 'frr.conf'); if (!fs.existsSync(cf)) return;
  var curIf = null;
  rd(cf).split('\n').forEach(function (line) {
    var mi = line.match(/^\s*interface\s+(\S+)/);
    if (mi) { curIf = mi[1]; ifip[n][curIf] = ifip[n][curIf] || {}; return; }
    if (/^\S/.test(line) || /^\s*(exit|!)\s*$/.test(line)) { curIf = null; return; }
    if (!curIf) return;
    var ma = line.match(/^\s*ip address\s+([0-9.]+)\/(\d+)/); if (ma) { ifip[n][curIf].ip = ma[1]; ifip[n][curIf].plen = ma[2]; }
    var mo = line.match(/^\s*ip ospf area\s+(\S+)/); if (mo) ifip[n][curIf].ospfArea = mo[1];
  });
});

// ---- 3) networks per link (subnet from the interface /24) ----
function net24(ip) { return ip.split('.').slice(0, 3).join('.'); }
var networks = {}, nodeNets = {};   // nodeNets[node] = [{net, ip}]
nodes.forEach(function (n) { nodeNets[n] = []; });
links.forEach(function (l, i) {
  var ipA = (ifip[l.a] || {})[l.ai], ipB = (ifip[l.b] || {})[l.bi];
  if (!ipA || !ipB) { console.error('  ! link ' + l.a + ':' + l.ai + '<->' + l.b + ':' + l.bi + ' missing IP in frr.conf'); return; }
  var netName = 'net_' + l.a + '_' + l.b;
  var sub = net24(ipA.ip) + '.0/' + ipA.plen;
  networks[netName] = sub;
  nodeNets[l.a].push({ net: netName, ip: ipA.ip, origIf: l.ai });
  nodeNets[l.b].push({ net: netName, ip: ipB.ip, origIf: l.bi });
});

// ---- 4) compose frr.conf transform (works for BGP & OSPF):
//   - DROP the original clab `interface eth<N>` stanzas entirely (clab iface names/IPs don't apply in compose;
//     docker assigns IPs, frr learns them from the kernel). Keep loopback (lo) + router/route-map sections.
//   - For OSPF, RE-EMIT `interface eth<i> / ip ospf area <A>` using the DOCKER iface name eth<i>, where i is
//     the link's index in this node's networks list (docker names data ifaces eth0,eth1,... in that order),
//     and <A> is the OSPF area captured from the original clab interface. (Subnet `network` stmt is unreliable
//     on FRR 8.4; per-iface `ip ospf area` on the real docker name works.)
function transformFrrConf(n, txt) {
  var out = [], inEth = false;
  txt.split('\n').forEach(function (line) {
    var mi = line.match(/^\s*interface\s+(\S+)/);
    if (mi) { inEth = /^eth\d+$/.test(mi[1]); if (inEth) return; out.push(line); return; }
    if (inEth) {
      if (/^\s*(exit|!)\s*$/.test(line)) { inEth = false; return; }   // drop the stanza terminator too
      if (/^\S/.test(line)) { inEth = false; out.push(line); return; } // next top-level section -> keep
      return;                                                          // drop indented eth-stanza lines
    }
    out.push(line);
  });
  var res = out.join('\n');
  // re-emit OSPF per-interface on docker names (eth<i> = index in networks list)
  var ospfIfaces = (nodeNets[n] || []).map(function (x, i) {
    var oa = (ifip[n][x.origIf] || {}).ospfArea; return oa != null ? 'interface eth' + i + '\n ip ospf area ' + oa + '\nexit' : null;
  }).filter(Boolean);
  if (ospfIfaces.length) res = res.replace(/\n(end\s*)?$/, '') + '\n!\n' + ospfIfaces.join('\n!\n') + '\n!\nend\n';   // append OSPF iface config on docker names
  return res;
}
nodes.forEach(function (n) {
  var cf = path.join(CFG, n, 'frr.conf');
  if (fs.existsSync(cf)) wr(path.join(OUT, n, 'frr.conf'), transformFrrConf(n, rd(cf)));
  var df = path.join(CFG, n, 'daemons');
  if (fs.existsSync(df)) wr(path.join(OUT, n, 'daemons'), rd(df));
  wr(path.join(OUT, n, 'vtysh.conf'), 'service integrated-vtysh-config\n');   // silence "can't open vtysh.conf" (dir-mounted /etc/frr)
});

// ---- 5) compose.yml ----
var svc = nodes.map(function (n) {
  var nets = nodeNets[n].map(function (x) { return '        ' + x.net + ': { ipv4_address: ' + x.ip + ' }'; }).join('\n');
  return [
    '  ' + n + ':',
    '    image: frrouting/frr:latest',
    '    hostname: ' + n,
    '    cap_add: [NET_ADMIN, SYS_ADMIN, NET_RAW]',
    '    sysctls: [net.ipv4.ip_forward=1]',
    // dir-mount (not file-mount) so `sed -i`/editor saves that replace the inode are still seen -> "edit frr.conf + reload" works
    '    volumes: [./' + n + ':/etc/frr, frrsock_' + n + ':/var/run/frr]',
    '    networks:',
    nets
  ].join('\n');
}).join('\n');
var socksMounts = nodes.map(function (n) { return '      - frrsock_' + n + ':/socks/' + n; }).join('\n');
// gateway = <net>.254 so a router using .1/.2 never collides with docker's default bridge gateway (.1)
var netDefs = Object.keys(networks).map(function (nm) { var gw = net24(networks[nm].split('/')[0]) + '.254'; return '  ' + nm + ': { driver: bridge, ipam: { config: [{ subnet: ' + networks[nm] + ', gateway: ' + gw + ' }] } }'; }).join('\n');
var volDefs = nodes.map(function (n) { return '  frrsock_' + n + ': {}'; }).join('\n');
var compose = [
  '# X-Ray live bundle — `docker compose up` (no containerlab, no host node, no docker socket).',
  'name: ' + labName,
  'services:',
  svc,
  '  collector:',
  '    build: ./collector',
  '    depends_on: [' + nodes.join(', ') + ']',
  '    volumes:',
  socksMounts,
  '      - ./web:/web',
  '  graph:',
  '    build: ./server',
  '    depends_on: [collector]',
  '    ports: ["8080:8080"]',
  '    volumes: [./web:/web]',
  'networks:',
  netDefs,
  'volumes:',
  volDefs,
  ''
].join('\n');
wr(path.join(OUT, 'compose.yml'), compose);

// ---- 6) topo.json (overview clab-data) ----
var topo = {
  nodes: nodes.map(function (n) { return { name: n, image: 'frrouting/frr:latest', kind: 'linux', state: 'running/Up', ipv4_address: '', ipv6_address: '' }; }),
  links: links.map(function (l) { return { source: l.a, source_endpoint: l.ai, target: l.b, target_endpoint: l.bi }; })
};

// ---- 7) web/: teal template filled + engine + auto-follow toggle ----
var html = rd(path.join(NX, 'xray-graph.html'));
html = html.split('{{ .Name }}').join(labName).split('{{ .Data }}').join(JSON.stringify(topo));
// auto-follow ON/OFF: gate the state-poll setInterval on a global flag (default ON)
html = html.replace(/setInterval\(function\(\)\s*\{(\s*var s = document\.createElement\('script'\);\s*s\.src = base \+ 'xray-states\.js)/,
  "setInterval(function(){ if(window.__xrayAutoFollow===false)return;$1");
// on a state change, also FULL-re-render the open node so the BGP table (rendered on open) follows too
// (applyState alone updates the RE panel/arrow but not the BGP-table detail panel)
html = html.replace(/window\.xrayCore\.applyState\(st\);\s*window\._xrayArrowFollow\(st\);/,
  "window.xrayCore.applyState(st); window._xrayArrowFollow(st); if(window.__xrayShowNode)window.__xrayShowNode(n);");
// enable live polling (compose collector publishes fresh xray-states.js every 3s) + toggle UI (top-right)
var toggle = "\n<script>window.LIVE_WATCH=true;window.__xrayAutoFollow=true;</script>\n<div style=\"position:fixed;top:8px;right:8px;z-index:99999;font:12px -apple-system,Segoe UI,sans-serif;color:#cfe8ee;background:#10202c;border:1px solid #26c6da;border-radius:6px;padding:4px 9px\"><label style=\"cursor:pointer\"><input type=\"checkbox\" id=\"xray-follow\" checked style=\"vertical-align:middle\"> auto-follow</label></div>\n<script>document.addEventListener('DOMContentLoaded',function(){var c=document.getElementById('xray-follow');if(c)c.onchange=function(){window.__xrayAutoFollow=c.checked;};});</script>\n";
html = html.replace(/<\/body>/i, toggle + '</body>');
wr(path.join(OUT, 'web', 'index.html'), html);
['xray-core.js', 'xray-api.js', 'clab-xray-bridge.js', 'xray-skin.js', 'xray-i18n.js'].forEach(function (f) {
  if (fs.existsSync(path.join(NX, f))) fs.copyFileSync(path.join(NX, f), path.join(OUT, 'web', f));
});
wr(path.join(OUT, 'web', 'xray-states.js'), 'window.LIVE_STATES = {};\n');

// ---- 8) collector/ (Dockerfile + watch.sh + patched collector + orchestrator + topo) ----
fs.mkdirSync(path.join(OUT, 'collector'), { recursive: true });
fs.copyFileSync(path.join(NX, 'clab-collect.js'), path.join(OUT, 'collector', 'clab-collect.js'));   // MUST be the socketless-patched copy
fs.copyFileSync(path.join(NX, 'clab-xray-collect.js'), path.join(OUT, 'collector', 'clab-xray-collect.js'));
if (fs.existsSync(path.join(NX, 'clab-srl-collect.js'))) fs.copyFileSync(path.join(NX, 'clab-srl-collect.js'), path.join(OUT, 'collector', 'clab-srl-collect.js'));
fs.copyFileSync(CLAB, path.join(OUT, 'collector', 'topo.clab.yml'));
wr(path.join(OUT, 'collector', 'Dockerfile'),
  'FROM frrouting/frr:latest\nRUN apk add --no-cache nodejs\nCOPY . /collector/\nRUN chmod +x /collector/watch.sh\nWORKDIR /collector\nENTRYPOINT ["/bin/sh","/collector/watch.sh"]\n');
wr(path.join(OUT, 'collector', 'watch.sh'),
  '#!/bin/sh\nexport XRAY_VTY_SOCK_DIR=/socks\ncd /collector\nfirst=1\necho "collector-watch: socketless re-collect (3s) -> /web/xray-states.js"\nwhile true; do\n  node clab-xray-collect.js topo.clab.yml /collector ' + proto + ' >/tmp/collect.log 2>&1 || true\n  if [ -f /collector/xray-states.js ]; then\n    # anti-flicker: hold the first publish until the lab has converged (a best route / Full adj),\n    # so the initial view is never an empty "no routes" flash. after that, publish every cycle.\n    if [ "$first" = "1" ]; then grep -qE \'"best":true|"full":true|"state":"Full"\' /collector/xray-states.js && first=0; fi\n    if [ "$first" = "0" ]; then cp -f /collector/xray-states.js /web/.xs.tmp && mv -f /web/.xs.tmp /web/xray-states.js; fi\n  fi\n  sleep 3\ndone\n');

// ---- 9) server/ ----
wr(path.join(OUT, 'server', 'server.js'),
  "const http=require('http'),fs=require('fs'),path=require('path');const ROOT='/web',PORT=8080;const MIME={'.html':'text/html','.js':'application/javascript','.css':'text/css','.json':'application/json','.svg':'image/svg+xml'};http.createServer((q,s)=>{let p=decodeURIComponent(q.url.split('?')[0]);if(p==='/favicon.ico'){s.writeHead(204);s.end();return;}if(p==='/'||p==='')p='/index.html';if(p.indexOf('/static/')===0)p=p.slice(7);const fp=path.join(ROOT,path.normalize(p).replace(/^(\\.\\.[/\\\\])+/,''));fs.readFile(fp,(e,b)=>{if(e){s.writeHead(404);s.end('404');return;}s.writeHead(200,{'Content-Type':MIME[path.extname(fp)]||'application/octet-stream','Cache-Control':'no-store'});s.end(b);});}).listen(PORT,()=>console.log('graph-server on :'+PORT));\n");
wr(path.join(OUT, 'server', 'Dockerfile'), 'FROM node:18-alpine\nCOPY server.js /server.js\nENTRYPOINT ["node","/server.js"]\n');

// ---- 10) reload helper + README ----
wr(path.join(OUT, 'reload.sh'),
  '#!/bin/sh\n# reload a router after you edit its ./<node>/frr.conf  ->  ./reload.sh <node>\nn="${1:-' + nodes[0] + '}"\ndocker compose exec "$n" /usr/lib/frr/frr-reload.py --reload /etc/frr/frr.conf 2>/dev/null || docker compose exec "$n" vtysh -b\ndocker compose exec "$n" vtysh -c "clear ip bgp * soft" 2>/dev/null\necho "reloaded $n — the X-Ray view follows within a few seconds"\n');
wr(path.join(OUT, 'README.md'),
  '# ' + labName + ' — X-Ray live lab\n\n```\ndocker compose up --build\n```\n\nOpen **http://localhost:8080** and click any node to look inside the router (adjacencies, LSDB/BGP table, best-path decision).\n\n## Edit the config, watch it follow\nEdit a router\'s config file on your host — e.g. `' + nodes[0] + '/frr.conf` — then reload it:\n\n```\n./reload.sh ' + nodes[0] + '\n```\n\nThe X-Ray view updates within a few seconds (auto-follow is on by default; toggle it in the top-right).\n\nPure `docker compose` — no containerlab, no host node.js, no docker socket.\n');

console.log('bundle: ' + OUT + '  lab=' + labName + ' proto=' + proto + ' nodes=' + nodes.join(',') + ' links=' + links.length + ' networks=' + Object.keys(networks).length);
