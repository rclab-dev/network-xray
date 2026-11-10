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
    // Uncaptured routed next-hop schema; see docs/dev/genie-mapping.md.
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
  // The following nonempty neighbor/BGP schemas are guesses, NOT validated by q5.
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
  if (summary.router_id != null) p.bgpSum.routerId = summary.router_id;
  if (summary.local_as != null) p.bgpSum.localAs = String(summary.local_as);
  entries(summary.neighbor, function (n, ip) {
    entries(n.address_family, function (af) {
      var raw = af.state_pfxrcd, established = raw == null ? null : /^\d+$/.test(String(raw));
      var ns = raw == null ? { state: null } : established ? { state: 'Established' } : ios.normBgpState(String(raw));
      var r = { ip: ip, state: ns.state, established: established, pfxRcd: established ? +raw : null,
        remoteAs: num(n.remote_as), localAs: num(summary.local_as), upDown: af.up_down == null ? null : af.up_down };
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
          origin: ({ i: 'IGP', e: 'EGP', '?': 'incomplete' })[path.origin] || '', reason: '' });
      });
    });
  });
  return { p: p, det: det, err: null };
}
module.exports = { genieToParts: genieToParts };
