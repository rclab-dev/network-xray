/* Cisco Genie parse JSON -> the IOS collector's parts. No Genie runtime is needed. */
'use strict';
var ios = require('./clab-iosxe-collect.js');
function num(v) { return v == null ? null : +v; }
function entries(o, fn) { Object.keys(o || {}).forEach(function (k) { fn(o[k], k); }); }
function ipv4(j) { return (((j || {}).vrf || {}).default || {}).address_family || {}; }
function ospfInterfaces(instances, fn) {
  entries(instances, function (instance) {
    entries(instance.areas, function (area, id) { entries(area.interfaces, function (i, name) { fn(i, ios.normIf(name), id === '0.0.0.0' ? '0' : id); }); });
  });
}
function genieToParts(genieByCommand, args) {
  var j = genieByCommand || {}, a = args || {};
  var p = ios.parseAll({}), det = null, passiveKnown = {};
  // These paths are deliberately limited to default VRF IPv4, as is the IOS text reader.
  var rib = (ipv4(j.show_ip_route).ipv4 || {}).routes;
  entries(rib, function (r, prefix) {
    var row = { prefix: r.route || prefix, protocol: r.source_protocol, subtype: '', selected: r.active == null ? null : r.active, nexthops: [] };
    entries((r.next_hop || {}).outgoing_interface, function (nh, name) {
      row.nexthops.push({ ip: null, iface: ios.normIf(nh.outgoing_interface || name), connected: r.source_protocol === 'connected' || r.source_protocol === 'local', active: r.active == null ? null : r.active });
    });
    if (r.route_preference != null) row.distance = +r.route_preference;
    if (r.metric != null) row.metric = +r.metric;
    // Routed next hops (validated by q21).
    entries((r.next_hop || {}).next_hop_list, function (nh) {
      row.nexthops.push({ ip: nh.next_hop || null, iface: nh.outgoing_interface == null ? null : ios.normIf(nh.outgoing_interface),
        connected: false, active: r.active == null ? null : r.active, fib: true });
    });
    p.routes.push(row);
  });
  entries((j.show_ip_interface_brief || {}).interface, function (i, name) {
    if (!/^\d/.test(i.ip_address || '') || i.ip_address === a.mgmtIp) return;
    var n = ios.normIf(name), prefix = 24;
    // Match the text reader's /24 fallback; the brief command does not contain a mask.
    p.routes.forEach(function (r) {
      if (r.protocol !== 'connected' || !r.nexthops.some(function (nh) { return nh.iface === n; })) return;
      var sp = r.prefix.split('/'), len = +sp[1];
      if (len && (len < 32 || sp[0] === i.ip_address)) prefix = len;
    });
    p.ifaces[n] = { up: i.status == null || i.protocol == null ? null : i.status === 'up' && i.protocol === 'up', ip: i.ip_address, prefix: prefix,
      adminDown: i.status == null ? null : /administratively/i.test(i.status) };
  });
  var full = (ipv4(j.show_ip_ospf_interface).ipv4 || {}).instance;
  ospfInterfaces(full, function (i, name, area) {
    if (!det) det = {};
    var sp = (i.ip_address || '').split('/');
    var d = { up: i.line_protocol == null ? null : i.line_protocol, ip: sp[0] || null, prefix: num(sp[1]), area: area,
      net_type: i.interface_type == null ? null : i.interface_type.toUpperCase(), cost: num(i.cost), auth: null };
    if (i.state != null) d.role = i.state.toUpperCase();
    if (i.priority != null) d.priority = +i.priority;
    if (i.hello_interval != null) d.hello = +i.hello_interval;
    if (i.dead_interval != null) d.dead = +i.dead_interval;
    if (i.statistics) { d.nbrs = num(i.statistics.nbr_count); d.nbrsAdj = num(i.statistics.adj_nbr_count); }
    // Genie initializes passive:false even without evidence. A running hello_timer proves
    // non-passive; true is explicit evidence of passive. Otherwise it remains unknown.
    passiveKnown[name] = i.passive === true || (i.passive === false && i.hello_timer != null);
    if (i.passive === true) d.passive = true;
    det[name] = d;
  });
  ospfInterfaces((j.show_ip_ospf_interface_brief || {}).instance, function (i, name, area) {
    var sp = (i.ip_address || '').split('/'), d = det && det[name];
    var mtu = (j.show_ip_interface || {})[name];
    var o = { up: i.state == null ? null : !/^DOWN$/i.test(i.state), ospf: true, ip: sp[0] || null, prefix: num(sp[1]), area: area,
      hello: d && d.hello != null ? d.hello : 10, cost: num(i.cost), ospfState: i.state == null ? null : i.state,
      nbrFull: num(i.nbrs_full), nbrCount: num(i.nbrs_count), role: (d && d.role) || i.state || null,
      nbrs: d && d.nbrs != null ? d.nbrs : num(i.nbrs_count), nbrsAdj: d && d.nbrsAdj != null ? d.nbrsAdj : num(i.nbrs_full), mtu: num(mtu && mtu.mtu) };
    if (d) {
      o.helloKnown = d.hello != null; o.dead = num(d.dead); o.netType = d.net_type; o.priority = num(d.priority); o.auth = null; o.passiveKnown = passiveKnown[name] ? true : null;
      if (d.passive) o.passive = true;
    }
    p.ospfIf[name] = o;
  });
  // The nonempty OSPF neighbor schema is not validated by q5.
  // Empty commands still produce the exact empty parts from parseAll({}).
  var neighbors = ((j.show_ip_ospf_neighbor || {}).vrf || {}).default || {};
  ospfInterfaces(neighbors.instance, function (i, name) {
    entries(i.neighbors, function (n, rid) {
      // Reuse the IOS state-word/role conversion (FULL/BDR -> Full/Backup).
      var parsed = ios.parseOspfNeighbors(rid + ' 0 ' + n.state + ' 00:00:00 ' + n.address + ' ' + name).list[0];
      if (!parsed) return;
      p.ospfNei.list.push(parsed); p.ospfNei.byIface[name] = parsed;
    });
  });
  var summary = (((j.show_ip_bgp_summary || {}).vrf || {}).default || {});
  if ((j.show_ip_bgp_summary || {}).bgp_id != null) p.bgpSum.localAs = String(j.show_ip_bgp_summary.bgp_id);
  entries(summary.neighbor, function (n, ip) {
    entries(n.address_family, function (af) {
      if (af.route_identifier != null) p.bgpSum.routerId = af.route_identifier;
      var raw = af.state_pfxrcd, established = raw == null ? null : /^\d+$/.test(String(raw));
      var ns = raw == null ? { state: null } : established ? { state: 'Established' } : ios.normBgpState(String(raw));
      var r = { ip: ip, state: ns.state, established: established, pfxRcd: established ? +raw : null,
        remoteAs: num(af.as), localAs: num(af.local_as), upDown: af.up_down == null ? null : af.up_down };
      r.ibgp = r.remoteAs == null || r.localAs == null ? null : r.remoteAs === r.localAs;
      if (raw != null && !established && String(raw) !== ns.state) r.state_raw = String(raw);
      if (ns.admin_down) r.admin_down = true;
      if (ns.max_prefix) r.max_prefix = true;
      p.bgpSum.list.push(r); p.bgpSum.byIp[ip] = r;
    });
  });
  var bgp = (((j.show_ip_bgp || {}).vrf || {}).default || {});
  entries(bgp.address_family, function (af) {
    entries(af.routes, function (route, prefix) {
      entries(route.index, function (path) {
        var status = path.status_codes == null ? null : path.status_codes;
        p.bgpRoutes.push({ prefix: prefix, nextHop: path.next_hop || null,
          best: status == null ? null : status.indexOf('>') >= 0, valid: status == null ? null : status.indexOf('*') >= 0,
          status_raw: status, ibgp: status == null ? null : status.indexOf('i') >= 0,
          as_path: path.path == null ? '' : path.path, local_pref: num(path.localpref), weight: num(path.weight), metric: num(path.metric),
          origin: ({ i: 'IGP', e: 'EGP', '?': 'incomplete' })[path.origin_codes] || '', reason: '' });
      });
    });
  });
  return { p: p, det: det, err: null };
}
// Saved captures are converted synchronously, so query and MCP use exactly the CLI path.
var fs = require('fs'), path = require('path');
var collector = require('./clab-collect.js');
function isGenieDir(dir) {
  return fs.readdirSync(dir).some(function (f) {
    return /^genie_.*\.json$/.test(f) && fs.statSync(path.join(dir, f)).isFile();
  });
}
function collectGenieDir(dir, options) {
  options = options || {};
  var parts = Object.create(null), adj = Object.create(null), states = Object.create(null), config = Object.create(null);
  var mgmtSubnet = options.mgmtSubnet || '172.20.20.0/24';
  function ipNumber(ip) { return ip.split('.').reduce(function (v, octet) { return (v * 256 + +octet) >>> 0; }, 0); }
  var mgmt = mgmtSubnet.split('/'), mgmtLen = +mgmt[1];
  if (mgmt.length !== 2 || !/^\d+\.\d+\.\d+\.\d+$/.test(mgmt[0]) || mgmt[0].split('.').some(function (v) { return +v > 255; }) || !/^\d+$/.test(mgmt[1]) || mgmtLen > 32) throw new Error('invalid management subnet: ' + mgmtSubnet);
  var mgmtMask = mgmtLen === 0 ? 0 : 0xFFFFFFFF << (32 - mgmtLen);
  fs.readdirSync(dir).sort().forEach(function (node) {
    var sub = path.join(dir, node);
    if (!fs.statSync(sub).isDirectory() || !isGenieDir(sub)) return;
    var commands = Object.create(null);
    fs.readdirSync(sub).sort().forEach(function (f) {
      if (!/^genie_.*\.json$/.test(f) || !fs.statSync(path.join(sub, f)).isFile()) return;
      var text = fs.readFileSync(path.join(sub, f), 'utf8');
      commands[f.slice(6, -5)] = text.trim() ? JSON.parse(text) : null;
    });
    parts[node] = genieToParts(commands, {}); adj[node] = [];
    config[node] = { bgpConfigured: parts[node].p.bgpSum.list.length > 0 || !!((commands.show_ip_protocols || {}).protocols || {}).bgp,
      ospfConfigured: Object.keys(parts[node].p.ospfIf).length > 0 };
  });
  var nodes = Object.keys(parts);
  if (!nodes.length) throw new Error('no Genie captures in ' + dir);
  function link(a, ai, b, bi) {
    if (!adj[a] || !adj[b] || a === b) return;
    adj[a].push({ iface: ai, peer: b, peerIface: bi });
    adj[b].push({ iface: bi, peer: a, peerIface: ai });
  }
  if (options.topo) {
    var topo = require('./clab-to-xray.js').parseYaml(fs.readFileSync(options.topo, 'utf8'));
    var defs = (topo.topology || {}).nodes || {};
    function endpoint(e) {
      var n = typeof e === 'string' ? e.split(':') : [e.node, e.interface];
      var m = /^eth(\d+)$/.exec(n[1]);
      var kind = (defs[n[0]] || {}).kind || ((topo.topology || {}).defaults || {}).kind || '';
      n[1] = m && /^cisco_iol/i.test(kind) ? 'Ethernet' + Math.floor(+m[1] / 4) + '/' + (+m[1] % 4) : ios.normIf(n[1]);
      return n;
    }
    ((topo.topology || {}).links || []).forEach(function (l) {
      if (!Array.isArray(l.endpoints) || l.endpoints.length !== 2) return;
      var a = endpoint(l.endpoints[0]), b = endpoint(l.endpoints[1]);
      link(a[0], a[1], b[0], b[1]);
    });
  } else {
    var subnets = Object.create(null);
    nodes.forEach(function (n) {
      Object.keys(parts[n].p.ifaces).forEach(function (i) {
        var f = parts[n].p.ifaces[i], len = f.prefix;
        // Exclude management addresses regardless of interface name.
        if (!f.ip || len == null || len <= 0 || len > 31 || /^Loopback/i.test(i)) return;
        var ip = ipNumber(f.ip);
        if ((ip & mgmtMask) === (ipNumber(mgmt[0]) & mgmtMask)) return;
        var key = ((ip & (0xFFFFFFFF << (32 - len))) >>> 0) + '/' + len;
        (subnets[key] = subnets[key] || []).push([n, i]);
      });
    });
    Object.keys(subnets).forEach(function (k) {
      var ends = subnets[k];
      if (ends.length === 2) link(ends[0][0], ends[0][1], ends[1][0], ends[1][1]);
    });
  }
  nodes.forEach(function (n) {
    states[n] = ios.iosxePartsToState(parts[n], Object.assign({ node: n, id: n, proto: config[n].bgpConfigured ? 'bgp' : 'ospf', adjacency: adj[n], mgmtSubnet: mgmtSubnet }, config[n]), collector.buildState);
  });
  return collector.pairOspfIfaces(states, adj);
}
function main(argv) {
  var dir, options = {}, out;
  for (var i = 0; i < argv.length; i++) {
    if (argv[i] === '--topo' || argv[i] === '--out' || argv[i] === '--mgmt-subnet') {
      var flag = argv[i];
      if (!argv[i + 1] || argv[i + 1].startsWith('--')) throw new Error('missing value for ' + flag);
      if (flag === '--topo') options.topo = argv[++i]; else if (flag === '--mgmt-subnet') options.mgmtSubnet = argv[++i]; else out = argv[++i];
    } else if (!dir && !argv[i].startsWith('-')) dir = argv[i];
    else throw new Error('unknown argument: ' + argv[i]);
  }
  if (!dir) throw new Error('usage: node genie-to-xray.js <dir> [--topo <lab.clab.yml>] [--out <dir>] [--mgmt-subnet <cidr>]');
  var states = collectGenieDir(dir, options);
  if (!out) { process.stdout.write(JSON.stringify(states, null, 2) + '\n'); return; }
  fs.mkdirSync(out, { recursive: true });
  fs.writeFileSync(path.join(out, 'xray-states.js'), 'window.LIVE_STATES = ' + JSON.stringify(states) + ';\n');
  var versions = Object.create(null); Object.keys(states).forEach(function (n) { versions[n] = 1; });
  fs.writeFileSync(path.join(out, 'xray-states.sig.js'), 'window.LIVE_SIG = ' + JSON.stringify({ run: Date.now(), gen: 1, nodes: versions, extra: 0 }) + ';\n');
}
module.exports = { genieToParts: genieToParts, collectGenieDir: collectGenieDir, isGenieDir: isGenieDir, main: main };
if (require.main === module) {
  try { main(process.argv.slice(2)); } catch (e) { console.error(e.message); process.exitCode = 2; }
}
