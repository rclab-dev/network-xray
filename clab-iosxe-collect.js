#!/usr/bin/env node
/*
 * clab-iosxe-collect.js — Cisco IOS / IOS-XE adapter for X-Ray (the IOS sibling of clab-collect.js and
 * clab-srl-collect.js). Reads ONE node's real control-plane state over SSH (plain-text `show` — IOS-XE has
 * no `| json` on these) and emits the SAME `state` object the FRR collector does (DATA-CONTRACT.md), via
 * clab-collect.js buildState(), so the engine draws it unchanged. containerlab kinds: cisco_iol (IOL),
 * cisco_c8000v / cisco_csr1000v / cisco_cat9kv.
 *
 * What differs from FRR and how it is absorbed (see the comments below): abbreviated interface names,
 * no mask in `show ip interface brief`, BGP next hops without an exit interface, IOS's own OSPF networks
 * not listed as routes, "L" local /32 routes, BGP best-path reason not printed (derived in IOS order).
 * OSPF heading (2026-10-27): an OSPF interface IOS lists as DOWN (shut down) is not counted, the same as FRR
 * (which drops it from the list) — the DOWN interface is still drawn, red.
 * IOS images are not distributed with network-xray (Cisco licence): build your own (README).
 */
'use strict';

var IF_ABBR = [   // longest prefix first
  ['TwentyFiveGigE', 'TwentyFiveGigE'], ['HundredGigE', 'HundredGigE'], ['FortyGigabitEthernet', 'FortyGigabitEthernet'],
  ['TenGigabitEthernet', 'TenGigabitEthernet'], ['GigabitEthernet', 'GigabitEthernet'], ['FastEthernet', 'FastEthernet'],
  ['Ethernet', 'Ethernet'], ['Loopback', 'Loopback'], ['Port-channel', 'Port-channel'], ['Serial', 'Serial'],
  ['Tunnel', 'Tunnel'], ['Vlan', 'Vlan'], ['Null', 'Null'], ['POS', 'POS'],
  ['Twe', 'TwentyFiveGigE'], ['Hu', 'HundredGigE'], ['Fo', 'FortyGigabitEthernet'], ['Te', 'TenGigabitEthernet'],
  ['Gi', 'GigabitEthernet'], ['Fa', 'FastEthernet'], ['Et', 'Ethernet'], ['Eth', 'Ethernet'], ['Lo', 'Loopback'],
  ['Po', 'Port-channel'], ['PO', 'POS'], ['Se', 'Serial'], ['Tu', 'Tunnel'], ['Vl', 'Vlan'], ['Nu', 'Null'],
  ['BD', 'BDI']   /* nx_ios_bdi: BD500 in show ip ospf interface brief = BDI500 (exact match only) */
];
function normIf(name) {
  var s = String(name || '').trim();
  if (!s) return '';
  var m = /^([A-Za-z-]+)(.*)$/.exec(s);
  if (!m) return s;
  var head = m[1], rest = m[2];
  for (var i = 0; i < IF_ABBR.length; i++) {
    var a = IF_ABBR[i][0];
    if (head === a || (head.length >= 2 && a.toLowerCase().indexOf(head.toLowerCase()) === 0 && head.length < a.length && i >= 14)) {
      return IF_ABBR[i][1] + rest;
    }
  }
  return s;
}

function lines(text) { return String(text || '').replace(/\r/g, '').split('\n'); }
var IP = '(\\d{1,3}(?:\\.\\d{1,3}){3})';

function maskLen(mask) {
  return String(mask).split('.').reduce(function (n, o) { var x = +o; while (x) { n += x & 1; x >>= 1; } return n; }, 0);
}
function classfulLen(ip) {
  var a = +String(ip).split('.')[0];
  return a < 128 ? 8 : a < 192 ? 16 : 24;
}

// ---- show ip ospf neighbor ----------------------------------------------------------------------
// Neighbor ID     Pri   State           Dead Time   Address         Interface
// 10.190.30.2       1   FULL/BDR        00:00:04    10.190.16.11    GigabitEthernet0/2.101
// 10.0.0.1          0   FULL/  -        00:00:32    10.0.1.1        Port-channel1
// (IOS-XE 17 may add an "Up Time" column; it is skipped.)
/* nx_ios_bdi: show bridge-domain -> { BDI500: ['Ethernet0/2'], ... } (only the member list of each bridge-domain, not its MAC table) */
function parseBridgeDomains(text) {
  var out = {}, bdi = null, ports = [], inMembers = false;
  var flush = function () { if (bdi) out[bdi] = ports; bdi = null; ports = []; };
  lines(text).forEach(function (l) {
    if (/^Bridge-domain \d+/i.test(l)) { flush(); inMembers = true; return; }
    if (/^\s*Software Bridging Info/i.test(l)) { inMembers = false; return; }
    if (!inMembers) return;
    var m;
    if ((m = /^\s+(BDI\d+)\s+\(/i.exec(l))) { bdi = normIf(m[1]); return; }
    if ((m = /^\s+(\S+)\s+service instance\s+\d+/i.exec(l))) ports.push(normIf(m[1]));
  });
  flush();
  return out;
}

function parseOspfNeighbors(text) {
  var out = { byIface: {}, list: [] };
  var re = new RegExp('^' + IP + '\\s+(\\d+)\\s+([A-Za-z0-9-]+)\\s*/\\s*(\\S+)\\s+(?:\\S+\\s+)?(\\S+)\\s+' + IP + '\\s+(\\S+)\\s*$');
  lines(text).forEach(function (l) {
    var m = re.exec(l.trim());
    if (!m) return;
    var st = m[3].toUpperCase(), role = m[4];
    // FRR spelling: "Full/DR", "2-Way/DROther", "Init/-"
    var stNice = st === 'FULL' ? 'Full' : st === '2WAY' || st === '2-WAY' ? '2-Way' : st.charAt(0) + st.slice(1).toLowerCase();
    // role in FRR spelling (FRR json: "Full/DR", "Full/Backup", "Full/DROther"; IOS: DR / BDR / DROTHER / -)
    role = ({ BDR: 'Backup', DROTHER: 'DROther', DR: 'DR', '-': '-' })[String(role).toUpperCase()] || role;
    var rec = { rid: m[1], address: m[6], iface: normIf(m[7]), state: stNice + '/' + role, full: st === 'FULL' };
    out.list.push(rec);
    if (rec.iface) out.byIface[rec.iface] = rec;
  });
  return out;
}

// ---- show ip ospf interface brief ---------------------------------------------------------------
// Interface    PID   Area            IP Address/Mask    Cost  State Nbrs F/C
// Et0/2        1     0.0.0.0         10.1.0.6/30        10    P2P   1/1
function parseOspfInterfaces(text) {
  var out = {};
  var re = new RegExp('^(\\S+)\\s+(\\d+)\\s+(\\S+)\\s+' + IP + '/(\\d+)\\s+(\\d+)\\s+(\\S+)\\s+(\\d+)/(\\d+)\\s*$');
  lines(text).forEach(function (l) {
    var m = re.exec(l.trim());
    if (!m) return;
    var area = m[3] === '0.0.0.0' ? '0' : m[3];
    out[normIf(m[1])] = { up: !/^DOWN$/i.test(m[7]), ospf: true, ip: m[4], prefix: +m[5], area: area, hello: 10,
                          cost: +m[6], ospfState: m[7], nbrFull: +m[8], nbrCount: +m[9] };
  });
  /* nx_ios_unnumbered: "Et0/1  1  0.0.0.0  Unnumbered Lo0  10  P2P  1/1" -> an OSPF IF that uses the source IF's address */
  var reU = /^(\S+)\s+(\d+)\s+(\S+)\s+Unnumbered\s+(\S+)\s+(\d+)\s+(\S+)\s+(\d+)\/(\d+)\s*$/i;
  lines(text).forEach(function (l) {
    var m = reU.exec(l.trim()); if (!m) return;
    var src = out[normIf(m[4])] || {};
    out[normIf(m[1])] = { up: !/^DOWN$/i.test(m[6]), ospf: true, ip: src.ip || '', prefix: src.prefix != null ? src.prefix : 32, area: m[3] === '0.0.0.0' ? '0' : m[3], hello: 10,
                          cost: +m[5], ospfState: m[6], nbrFull: +m[7], nbrCount: +m[8], unnumbered: normIf(m[4]) };
  });
  return out;
}

// ---- show ip ospf interface (full, optional 7th show) ------------------------------------------
// Ethernet0/0 is up, line protocol is up
//   Internet Address 10.0.23.2/30, Interface ID 2, Area 1
//   Process ID 1, Router ID 10.255.0.3, Network Type BROADCAST, Cost: 10
//   Timer intervals configured, Hello 10, Dead 40, Wait 40, Retransmit 5
// The brief form has the area only; hello / dead / network type are needed to say WHY two ends do not
// become neighbours. Area is kept as IOS prints it ("1" or "0.0.0.1"); compare with sameArea().
function parseOspfInterfaceDetail(text) {
  var out = {}, cur = null;
  var reAddr = new RegExp('Internet Address ' + IP + '/(\\d+).*?Area (\\S+?)(?:,|\\s*$)');
  lines(text).forEach(function (l) {
    var h = /^(\S+) is (.+?), line protocol is (\S+)/.exec(l);
    if (h) { cur = out[normIf(h[1])] = { up: /^up$/i.test(h[3]) }; return; }
    if (!cur) return;
    var m;
    if ((m = reAddr.exec(l))) { cur.ip = m[1]; cur.prefix = +m[2]; cur.area = m[3]; }
    else if ((m = /Interface is unnumbered.*?Area (\S+?)(?:,|\s*$)/.exec(l))) { cur.area = m[1]; cur.unnumbered = true; }   /* nx_ios_unnumbered (2) */
    if ((m = /Network Type (\S+?),/.exec(l))) cur.net_type = m[1];
    if ((m = /Hello (\d+), Dead (\d+)/.exec(l))) { cur.hello = +m[1]; cur.dead = +m[2]; }
    if (/No Hellos \(Passive interface\)/.test(l)) cur.passive = true;
  });
  return out;
}
function areaNum(a) { return /\./.test(String(a)) ? String(ip2n(a)) : String(+a); }
function sameArea(a, b) { return areaNum(a) === areaNum(b); }

// ---- show ip ospf traffic (optional 8th show) ---------------------------------------------------
//     Interface Ethernet0/1
// OSPF header errors
//   Version 0, Bad Source 0, No Virtual Link 0,
//   Area Mismatch 11, No Sham Link 0, Self Originated 0,
//   Duplicate ID 0, Hello 0, MTU Mismatch 0, ...
// -> { Ethernet0/1: { area_mismatch: 11 } }  (non-zero header-error counters only). IOS counts a
// hello/dead/mask disagreement as one "Hello" counter -> hello_mismatch. The two ends of an area
// mismatch count it under DIFFERENT names (backbone side: Area Mismatch, the other: No Virtual Link).
function parseOspfTraffic(text) {
  var out = {}, cur = null, inHdr = false;
  lines(text).forEach(function (l) {
    var h = /^\s*Interface (\S+)\s*$/.exec(l);
    if (h) { cur = normIf(h[1]); inHdr = false; return; }
    // "Neighbor <rid> traffic statistics" (per-neighbour subset) and "Summary traffic statistics for
    // process" (whole process, at the end) are not this interface's counters
    if (/traffic statistics/i.test(l)) { cur = null; inHdr = false; return; }
    if (/^OSPF header errors/.test(l)) { inHdr = !!cur; return; }
    if (!inHdr) return;
    if (!/^\s+\S/.test(l)) { inHdr = false; return; }
    l.split(',').forEach(function (kv) {
      var m = /^\s*([A-Za-z][A-Za-z ]*?)\s+(\d+)\s*$/.exec(kv); if (!m || +m[2] === 0) return;
      var k = m[1].toLowerCase().replace(/\s+/g, '_'); if (k === 'hello') k = 'hello_mismatch';
      (out[cur] = out[cur] || {})[k] = +m[2];
    });
  });
  return out;
}

// ---- show ip interface brief --------------------------------------------------------------------
// Interface              IP-Address      OK? Method Status                Protocol
// Ethernet0/2            unassigned      YES NVRAM  administratively down down
function parseInterfaces(text, routes) {
  var out = {};
  var re = /^(\S+)\s+(\S+)\s+(YES|NO)\s+(\S+)\s+(.+?)\s+(up|down|deleted)\s*$/i;
  lines(text).forEach(function (l) {
    var m = re.exec(l.trim());
    if (!m || /^Interface$/i.test(m[1])) return;
    var ifn = normIf(m[1]);
    var ip = /^\d/.test(m[2]) ? m[2] : '';
    out[ifn] = { up: /^up$/i.test(m[5].trim()) && /^up$/i.test(m[6]), ip: ip, prefix: 24, adminDown: /administratively/i.test(m[5]) };
  });
  // mask: show ip interface brief has none -> take it from the connected route out of the same iface
  (routes || []).forEach(function (r) {
    if (r.protocol !== 'connected') return;
    var nh = r.nexthops[0]; if (!nh || !out[nh.iface]) return;
    var sp = String(r.prefix).split('/'), len = +sp[1];
    // /32 counts too (Loopback /32 is printed as a connected /32), but only when it IS this iface's address
    if (len && (len < 32 || sp[0] === out[nh.iface].ip)) { out[nh.iface].prefix = len; out[nh.iface]._maskKnown = true; }
  });
  /* nx_ios_unnumbered: an IF with no connected route of its own whose address is another IF's (ip unnumbered <src>) -> the source's length */
  Object.keys(out).forEach(function (n) {
    var i = out[n]; if (!i.ip || i._maskKnown) return;
    var src = Object.keys(out).filter(function (k) { return k !== n && out[k].ip === i.ip && out[k]._maskKnown; })[0];
    if (src) { i.prefix = out[src].prefix; i.unnumbered = src; }
  });
  Object.keys(out).forEach(function (n) { delete out[n]._maskKnown; });
  return out;
}

// ---- show ip route ------------------------------------------------------------------------------
var ROUTE_CODE = { C: 'connected', L: 'local', S: 'static', 'S*': 'static', O: 'ospf', B: 'bgp', D: 'eigrp', R: 'rip',
                   i: 'isis', M: 'mobile', o: 'odr', U: 'static', P: 'static', l: 'lisp', a: 'application', H: 'nhrp' };
function parseRoutes(text) {
  var out = [];
  var lenFromHeader = null, cur = null;
  var headRe = new RegExp('^\\s*' + IP + '/(\\d+) is (?:variably )?subnetted');
  // code + optional subcode (IA, E1, E2, N1, N2, L1, L2, ia, su, EX), then prefix[/len]
  var entRe = new RegExp('^([A-Za-z]\\*?)(?:\\s+(IA|E1|E2|N1|N2|L1|L2|ia|su|EX|\\*))?\\s+' + IP + '(?:/(\\d+))?\\s*(.*)$');
  var viaRe = new RegExp('via ' + IP);
  function nexthopsFrom(rest) {
    var nhs = [];
    var dc = /is directly connected,\s*(\S+)/.exec(rest);
    if (dc) { nhs.push({ ip: null, iface: normIf(dc[1]), connected: true, active: true }); return nhs; }
    var sum = /is a summary,.*?,\s*(\S+)\s*$/.exec(rest);
    if (sum) { nhs.push({ ip: null, iface: normIf(sum[1]), connected: false, active: true }); return nhs; }
    var v = viaRe.exec(rest);
    if (v) {
      // "via 10.0.1.2, 00:12:01, Serial0/0" / "via 10.0.1.2, Serial0/0" / "via 212.0.0.1": the iface is the
      // last comma part when it looks like an interface name (letters then a digit), not an age (00:12:01, 1d18h)
      var parts = rest.slice(v.index).split(',').map(function (x) { return x.trim(); });
      var last = parts.length > 1 ? parts[parts.length - 1] : '';
      var ifn = /^[A-Za-z][A-Za-z-]*\d/.test(last) && !/^\d+[wdhms]/.test(last) ? last : '';
      nhs.push({ ip: v[1], iface: normIf(ifn), connected: false, active: true, fib: true });   /* nx_ios_ecmp: IOS prints only the paths it installed - every via of a route is in the FIB (FRR marks this with fib:true) */
    }
    else {   // "[200/0], 2w0d, Null0"
      var tail = /,\s*(\S+)\s*$/.exec(rest);
      if (tail && /^[A-Za-z]/.test(tail[1])) nhs.push({ ip: null, iface: normIf(tail[1]), connected: false, active: true });
    }
    return nhs;
  }
  lines(text).forEach(function (raw) {
    var l = raw.replace(/\s+$/, '');
    if (!l.trim() || /^Codes:|^\s{7}[A-Za-z0-9]+ - |^Gateway of last resort/.test(l)) return;
    var h = headRe.exec(l);
    if (h) { lenFromHeader = +h[2]; cur = null; return; }
    var e = /^\S/.test(l) ? entRe.exec(l) : null;
    if (e) {
      var code = e[1].replace('*', ''), sub = e[2] || '';
      var len = e[4] != null ? +e[4] : (lenFromHeader != null ? lenFromHeader : classfulLen(e[3]));
      var proto = ROUTE_CODE[code] || ROUTE_CODE[e[1]] || code.toLowerCase();
      cur = { prefix: e[3] + '/' + len, protocol: proto, subtype: sub, selected: true, nexthops: nexthopsFrom(e[5]) };
      var ad = /\[(\d+)\/(\d+)\]/.exec(e[5]); if (ad) { cur.distance = +ad[1]; cur.metric = +ad[2]; }
      out.push(cur);
      if (e[4] != null) lenFromHeader = lenFromHeader;   // explicit length does not reset the header context
      return;
    }
    // continuation: "                [1/0] via 192.168.0.1" (ECMP) or a wrapped "via ..." line
    if (cur && /^\s+/.test(l) && /via |directly connected/.test(l)) {
      nexthopsFrom(l).forEach(function (nh) { cur.nexthops.push(nh); });
    }
  });
  resolveRecursive(out);
  return out;
}

// IOS prints BGP / static "via <ip>" without the outgoing interface (recursive next hop). FRR's json
// already carries the resolved interfaceName, and buildState uses nexthop.iface to aim the forward
// arrow — so resolve it here: longest-prefix match of the next-hop IP in the same table (depth <= 3).
function ip2n(ip) { return String(ip).split('.').reduce(function (n, o) { return n * 256 + (+o); }, 0); }
function resolveRecursive(routes) {
  var table = routes.map(function (r) {
    var p = String(r.prefix).split('/'); var len = +p[1];
    var mask = len === 0 ? 0 : (0xFFFFFFFF << (32 - len)) >>> 0;
    return { r: r, net: (ip2n(p[0]) & mask) >>> 0, mask: mask, len: len };
  });
  function lookup(ip, depth) {
    if (depth > 3) return '';
    var n = ip2n(ip), best = null;
    table.forEach(function (t) { if (((n & t.mask) >>> 0) === t.net && t.r.nexthops.length && (!best || t.len > best.len)) best = t; });
    if (!best) return '';
    var nh = best.r.nexthops[0];
    if (nh.iface) return nh.iface;
    return nh.ip ? lookup(nh.ip, depth + 1) : '';
  }
  routes.forEach(function (r) {
    r.nexthops.forEach(function (nh) {
      if (nh.ip && !nh.iface) { var ifn = lookup(nh.ip, 1); if (ifn) { nh.iface = ifn; nh.recursive = true; } }
    });
  });
}

// ---- show ip bgp summary ------------------------------------------------------------------------
// BGP router identifier 10.0.0.1, local AS number 65001
// Neighbor        V           AS MsgRcvd MsgSent   TblVer  InQ OutQ Up/Down  State/PfxRcd
// 10.1.0.2        4        65002      20      22        5    0    0 00:15:10        3
// 10.1.0.6        4        65003       0       0        1    0    0 never    Idle
// IOS prints states FRR does not have ("Closing", "Idle (Admin)", "Idle (PfxCt)" ...). The state is folded
// into FRR's six words here (the engine only knows those); the IOS value is kept as state_raw.
var BGP_FSM = ['Idle', 'Connect', 'Active', 'OpenSent', 'OpenConfirm', 'Established'];
function normBgpState(raw) {
  var r = String(raw || '').trim(), base = r.replace(/\s*\(.*$/, '');
  var hit = BGP_FSM.filter(function (w) { return w.toLowerCase() === base.toLowerCase(); })[0];
  var o = { state: hit || 'Idle' };   // Closing and anything else not in the FSM -> Idle
  if (/\(\s*Admin\s*\)/i.test(r)) o.admin_down = true;
  if (/\(\s*PfxCt\s*\)/i.test(r)) o.max_prefix = true;
  return o;
}
function parseBgpSummary(text) {
  var out = { byIp: {}, list: [], routerId: '', localAs: null };
  var hdr = /BGP router identifier\s+(\S+?),\s+local AS number\s+(\S+)/;
  var re = new RegExp('^' + IP + '\\s+(\\d)\\s+(\\S+)\\s+\\d+\\s+\\d+\\s+\\d+\\s+\\d+\\s+\\d+\\s+(\\S+)\\s+(.+?)\\s*$');
  lines(text).forEach(function (l) {
    var h = hdr.exec(l);
    if (h) { out.routerId = h[1]; out.localAs = h[2]; return; }
    var m = re.exec(l.trim());
    if (!m) return;
    var tail = m[5].trim();
    var est = /^\d+$/.test(tail);
    var ns = est ? { state: 'Established' } : normBgpState(tail);
    var rec = { ip: m[1], state: ns.state, established: est, pfxRcd: est ? +tail : null,
                remoteAs: /^\d+$/.test(m[3]) ? +m[3] : m[3], localAs: out.localAs != null && /^\d+$/.test(out.localAs) ? +out.localAs : out.localAs,
                upDown: m[4] };
    rec.ibgp = rec.remoteAs != null && rec.localAs != null && String(rec.remoteAs) === String(rec.localAs);
    if (!est && tail !== ns.state) rec.state_raw = tail;   // only when IOS said something FRR would not
    if (ns.admin_down) rec.admin_down = true;
    if (ns.max_prefix) rec.max_prefix = true;
    out.byIp[rec.ip] = rec; out.list.push(rec);
  });
  return out;
}

// ---- show ip bgp --------------------------------------------------------------------------------
//      Network          Next Hop            Metric LocPrf Weight Path
//  *>  10.1.1.0/24      0.0.0.0                  0         32768 i
//  *>i 10.2.2.0/24      10.0.0.2                 0    100      0 65002 i
//  *                    10.0.0.6                 0             0 65003 65002 i      (same prefix, next path)
// Columns are fixed-width under the header; numeric fields are right-aligned to the header's end.
function parseBgpRoutes(text) {
  var out = [];
  var ls = lines(text), hi = -1;
  for (var i = 0; i < ls.length; i++) if (/Network\s+Next Hop\s+Metric\s+LocPrf\s+Weight\s+Path/.test(ls[i])) { hi = i; break; }
  if (hi < 0) return out;
  var H = ls[hi];
  var col = { net: H.indexOf('Network'), nh: H.indexOf('Next Hop'), metricEnd: H.indexOf('Metric') + 6,
              lpEnd: H.indexOf('LocPrf') + 6, wEnd: H.indexOf('Weight') + 6, path: H.indexOf('Path') };
  var lastPrefix = null, pendingStatus = null;
  for (var k = hi + 1; k < ls.length; k++) {
    var line = ls[k].replace(/\s+$/, '');
    if (!line.trim() || /^Total number|^Displayed|^RPKI/.test(line.trim())) continue;
    // Rows are NOT always aligned to the header (some IOS builds print rows 2 chars left of it), so
    // status / network / next hop are taken by pattern, and the numeric columns are judged against
    // the header positions shifted by how far THIS row's next hop sits from the header's "Next Hop".
    var onlyNet = /^\s*([sdhrSmbfxac=*>i ]*?)\s*(\d{1,3}(?:\.\d{1,3}){3}(?:\/\d+)?)\s*$/.exec(line);
    if (onlyNet && /[*>]/.test(onlyNet[1])) {   // wrapped: status+network only, next hop on the next line
      pendingStatus = onlyNet[1].replace(/\s+/g, ''); lastPrefix = onlyNet[2]; continue;
    }
    var rm = /^\s*([sdhrSmbfxac=*>i ]*?)\s*(\d{1,3}(?:\.\d{1,3}){3}(?:\/\d+)?)?\s+(\d{1,3}(?:\.\d{1,3}){3})(?=\s|$)/.exec(line);
    if (!rm) { pendingStatus = null; continue; }
    var status = rm[1].replace(/\s+/g, '');
    if (!status && pendingStatus != null) status = pendingStatus;
    pendingStatus = null;
    if (!/[*>]/.test(status)) continue;
    var net = rm[2] || '';
    var nhStart = rm.index + rm[0].length - rm[3].length;
    var shift = nhStart - col.nh;
    var nhM = [rm[3], rm[3]];
    var prefix = net || lastPrefix;
    if (!prefix) continue;
    if (prefix.indexOf('/') < 0) prefix = prefix + '/' + classfulLen(prefix);
    lastPrefix = prefix;
    // numeric columns: assign each number token by where it ENDS (right-aligned under the header)
    var base = nhStart + rm[3].length;
    var after = line.slice(base);
    var metric = null, lp = null, w = null, pathStart = null;
    col.metricEndR = col.metricEnd + shift; col.lpEndR = col.lpEnd + shift; col.wEndR = col.wEnd + shift;
    var tokRe = /\S+/g, t;
    while ((t = tokRe.exec(after))) {
      var end = base + t.index + t[0].length;
      if (/^\d+$/.test(t[0]) && w == null && end <= col.wEndR + 1) {
        var dM = Math.abs(end - col.metricEndR), dL = Math.abs(end - col.lpEndR), dW = Math.abs(end - col.wEndR);
        if (dW <= dL && dW <= dM) w = +t[0]; else if (dL <= dM) lp = +t[0]; else metric = +t[0];
        continue;
      }
      pathStart = base + t.index; break;
    }
    var pathStr = pathStart != null ? line.slice(pathStart).trim() : '';
    var origin = (/\s?([ie?])$/.exec(pathStr) || [])[1] || '';
    var asPath = pathStr.replace(/\s?[ie?]$/, '').trim();
    out.push({ prefix: prefix, nextHop: nhM[1], best: status.indexOf('>') >= 0, valid: status.indexOf('*') >= 0,
               ibgp: /i/.test(status.replace(/[^i]/g, '')) && status.indexOf('i') > 0,
               as_path: asPath, local_pref: lp, weight: w, metric: metric,
               origin: origin === 'i' ? 'IGP' : origin === 'e' ? 'EGP' : origin === '?' ? 'incomplete' : '', reason: '' });
  }
  return out;
}

// ---- assemble: same call shape as clab-collect.js collectFromJson, but from IOS-XE text -----------
// args: { node, id, proto, adjacency, ospfNeighbor, ospfInterface, ipInterface, route, bgpSummary, bgp,
//         ospfConfigured, bgpConfigured, buildState }  (buildState = require('clab-collect').buildState)
function parseAll(args) {
  var routes = parseRoutes(args.route);
  var ifaces = parseInterfaces(args.ipInterface, routes);
  // like FRR's state: interfaces without an address (IOL's unused Ethernet0/x) are not data links; the
  // management interface is dropped by the caller (args.mgmtIp = the address containerlab reaches it on).
  Object.keys(ifaces).forEach(function (ifn) { if (!ifaces[ifn].ip || (args.mgmtIp && ifaces[ifn].ip === args.mgmtIp)) delete ifaces[ifn]; });
  var ospfIf = parseOspfInterfaces(args.ospfInterface);
  // NOTE: like FRR `show ip ospf interface json`, ospfIf holds ONLY OSPF interfaces (buildState treats
  // presence in ospfIf as "OSPF-enabled" for Hello). Non-OSPF data links reach the state via buildState's
  // own backfill from the interface list / routes, as with FRR.
  return {
    ospfNei: parseOspfNeighbors(args.ospfNeighbor),
    ospfIf: ospfIf,
    ifaces: ifaces,
    routes: routes,
    bgpSum: parseBgpSummary(args.bgpSummary),
    bgpRoutes: parseBgpRoutes(args.bgp)
  };
}

// FRR puts `selectionReason` on the best path ("First path received", "Weight", "Local Pref", ...) and
// the Best-Path Decision panel shows it. IOS `show ip bgp` has no such field, so derive it from the
// columns IOS does print, in the IOS best-path order. For each losing path find the FIRST step where the
// best path wins; the reason shown is the step that beat the CLOSEST rival (the one that tied longest).
// Steps IOS does not print (IGP metric to next hop, age, router id) cannot be judged -> reason "".
var BP_STEPS = [
  ['Weight', function (r) { return r.weight == null ? 0 : r.weight; }, 'high'],
  ['Local Pref', function (r) { return r.local_pref == null ? 100 : r.local_pref; }, 'high'],
  ['Local Route', function (r) { return r.nextHop === '0.0.0.0' ? 1 : 0; }, 'high'],
  ['AS Path', function (r) { return r.as_path ? r.as_path.split(/\s+/).filter(function (x) { return /^\d/.test(x); }).length : 0; }, 'low'],
  ['Origin', function (r) { return r.origin === 'IGP' ? 0 : r.origin === 'EGP' ? 1 : 2; }, 'low'],
  ['MED', function (r) { return r.metric == null ? 0 : r.metric; }, 'low', true],
  ['Peer Type', function (r) { return r.ibgp ? 1 : 0; }, 'low']   // eBGP (0) over iBGP (1)
];
function explainBestPath(routes) {
  var byPfx = {};
  routes.forEach(function (r) { (byPfx[r.prefix] = byPfx[r.prefix] || []).push(r); });
  Object.keys(byPfx).forEach(function (pfx) {
    var paths = byPfx[pfx], best = paths.filter(function (r) { return r.best; })[0];
    if (!best) return;
    if (paths.length === 1) { best.reason = 'First path received'; return; }
    var firstAs = function (r) { return (r.as_path.split(/\s+/)[0] || ''); };
    var deepest = -1;
    paths.forEach(function (o) {
      if (o === best) return;
      var step = -1;
      for (var i = 0; i < BP_STEPS.length; i++) {
        var s = BP_STEPS[i];
        if (s[3] && firstAs(o) !== firstAs(best)) continue;   // MED only between paths from the same neighbour AS
        var a = s[1](best), b = s[1](o);
        if (a === b) continue;
        step = (s[2] === 'high' ? a > b : a < b) ? i : -2;   // -2 = the columns say the other path should win
        break;
      }
      if (step === -1) step = BP_STEPS.length;   // tied on everything IOS prints
      if (step > deepest) deepest = step;
    });
    best.reason = deepest >= 0 && deepest < BP_STEPS.length ? BP_STEPS[deepest][0] : '';
  });
}

// Same call shape as clab-collect.js collectFromJson (args.ospfNeighbor etc. are TEXT here).
// buildState is injected so this file does not hard-depend on where clab-collect.js lives.
function collectFromIosxeText(args, buildState) {
  var p = parseAll(args);
  // passive: IOS shows passive only in the full 'show ip ospf interface' (No Hellos). Mark it on the OSPF
  // interface BEFORE buildState so the heading counts it (passive counts, like FRR) and no Hello orb is drawn for it.
  var _det0 = args.ospfInterfaceDetail ? parseOspfInterfaceDetail(args.ospfInterfaceDetail) : null;
  /* nx_ios_bdi: OSPF on BDI<N> whose bridge-domain has exactly one lab-link port -> that port carries the OSPF interface + neighbors */
  if (args.bridgeDomain) {
    var _bd = parseBridgeDomains(args.bridgeDomain), _links = (args.adjacency || []).map(function (a) { return normIf(a.iface); });
    Object.keys(_bd).forEach(function (bdi) {
      var lp = _bd[bdi].filter(function (x) { return _links.indexOf(x) >= 0; });
      if (lp.length !== 1) return;
      var port = lp[0];
      if (p.ospfIf[bdi] && !p.ospfIf[port]) { p.ospfIf[port] = Object.assign({}, p.ospfIf[bdi], { viaBdi: bdi }); delete p.ospfIf[bdi]; }
      if (_det0 && _det0[bdi] && !_det0[port]) _det0[port] = _det0[bdi];
      p.ospfNei.list.forEach(function (n) { if (n.iface === bdi) n.iface = port; });
      if (p.ospfNei.byIface[bdi]) { p.ospfNei.byIface[port] = p.ospfNei.byIface[bdi]; delete p.ospfNei.byIface[bdi]; }
      if (p.ifaces[bdi] && !p.ifaces[port]) p.ifaces[port] = Object.assign({}, p.ifaces[bdi], { viaBdi: bdi });
    });
  }
  if (_det0) Object.keys(p.ospfIf).forEach(function (ifn) { if (_det0[ifn] && _det0[ifn].passive) p.ospfIf[ifn].passive = true; });
  /* nx_ios_hello_secs: the Hello seconds also come from the full show (the brief one has none -> buildState fell back to 10) */
  if (_det0) Object.keys(p.ospfIf).forEach(function (ifn) { if (_det0[ifn] && _det0[ifn].hello != null) p.ospfIf[ifn].hello = _det0[ifn].hello; });
  // FRR's RIB also lists OSPF's OWN networks as non-selected "O ... is directly connected" entries, and
  // buildState derives lsdb_prefixes (the router's own LSAs) from protocol=ospf routes. IOS does not
  // print those, so add the same non-selected OSPF entries for every OSPF interface's network, placed
  // just before the matching connected route (FRR order).
  var ospfOwn = [];
  Object.keys(p.ospfIf).forEach(function (ifn) {
    var d = p.ospfIf[ifn]; if (!d.ospf || !d.ip) return;
    var len = d.prefix != null ? d.prefix : 24, mask = len === 0 ? 0 : (0xFFFFFFFF << (32 - len)) >>> 0;
    var n = (ip2n(d.ip) & mask) >>> 0;
    var net = [n >>> 24, (n >>> 16) & 255, (n >>> 8) & 255, n & 255].join('.') + '/' + len;
    ospfOwn.push({ prefix: net, protocol: 'ospf', selected: false, own: true,
                   nexthops: [{ ip: null, iface: ifn, connected: true, active: true }] });
  });
  ospfOwn.forEach(function (o) {
    var at = -1;
    for (var i = 0; i < p.routes.length; i++) if (p.routes[i].prefix === o.prefix) { at = i; break; }
    if (at >= 0 && p.routes[at].protocol === 'ospf') return;   // already there
    if (at >= 0) p.routes.splice(at, 0, o); else p.routes.push(o);
  });
  // IOS 15+/IOS-XE print "L" (the router's own address as /32) for every interface; FRR 8.x does not,
  // and the DeepDive Routing table would show them as extra rows. Drop them (kept by parseRoutes itself).
  p.routes = p.routes.filter(function (r) { return r.protocol !== 'local'; });
  explainBestPath(p.bgpRoutes);
  // FRR json carries the BGP prefix without its length ("8.8.8.0" + prefixLen 24); match that shape.
  p.bgpRoutes.forEach(function (r) {
    var sp = String(r.prefix).split('/');
    if (sp.length === 2) { r.prefix = sp[0]; r.prefixLen = +sp[1]; }
  });
  var st = buildState({
    selfName: args.node, id: args.id || args.node, proto: (args.proto || 'ospf').toLowerCase(),
    adjacency: args.adjacency || [], mgmtSubnet: args.mgmtSubnet || '',
    ospfConfigured: args.ospfConfigured, bgpConfigured: args.bgpConfigured,
    ospfNei: p.ospfNei, ospfIf: p.ospfIf, ifaces: p.ifaces, routes: p.routes,
    configStatics: args.configStatics || [], bgpSum: p.bgpSum, bgpRoutes: p.bgpRoutes
  });
  // Which NOS produced this state, so the page can word vendor-specific text for IOS-XE (e.g. the best-path
  // order legend) instead of FRR's. FRR states (clab-collect.js) carry no `nos` and render exactly as before.
  st.nos = 'ios-xe';
  /* nx_re_via: a link port that carries a BDI's address -> the RE line says both names ("Ethernet0/2 (BDI500)") */
  Object.keys(p.ifaces).forEach(function (n) { if (p.ifaces[n].viaBdi && st.interfaces && st.interfaces[n]) st.interfaces[n].via = p.ifaces[n].viaBdi; });
  /* nx_ios_no_candidate (decision 2, 2026-10-27): IOS prints only the routes it selected -> no grey candidate rows in the
     Routing table. The own-network OSPF rows added above (selected:false) only feed buildState's lsdb_prefixes: drop them now. */
  var _own = {}; ospfOwn.forEach(function (o) { _own[o.prefix] = 1; });
  st.routing_table = (st.routing_table || []).filter(function (r) { return !(r && r.selected === false && r.protocol === 'ospf' && _own[r.prefix]); });
  // buildState copies only ip / remote_as / ibgp / state into bgp_neighbors; add the IOS extras back.
  (st.bgp_neighbors || []).forEach(function (n) {
    var r = p.bgpSum.byIp[n.ip]; if (!r) return;
    ['state_raw', 'admin_down', 'max_prefix'].forEach(function (k) { if (r[k] != null) n[k] = r[k]; });
  });
  // Per-interface OSPF parameters, only when the optional shows were taken (additive: without them
  // nothing changes). The cross-node comparison is annotateOspfMismatch() over all nodes' states.
  var det = args.ospfInterfaceDetail ? parseOspfInterfaceDetail(args.ospfInterfaceDetail) : null;
  var err = args.ospfTraffic ? parseOspfTraffic(args.ospfTraffic) : null;
  Object.keys(st.interfaces || {}).forEach(function (ifn) {
    var i = st.interfaces[ifn], d = det && det[ifn];
    if (d && d.area != null) {
      i.ospf_area = d.area;
      if (d.hello != null) { i.ospf_hello = d.hello; i.ospf_dead = d.dead; }
      if (d.net_type) i.ospf_net_type = d.net_type;
      if (d.passive) i.ospf_passive = true;
    }
    if (err && err[ifn]) i.ospf_errors = err[ifn];
  });
  return st;
}

// Across nodes (the step that has every node's state, like clab-xray-collect.js): for each link
// (adjacency = { node: [{iface, peer}] }) where BOTH ends carry ospf_area, compare area / hello / dead /
// network type and, on a difference, set <peer>_ospf_mismatch = { field, local, remote, iface, peer_iface }
// on both ends (further differences in also[]). Engine-neutral: new keys only.
var OSPF_CMP = [['area', 'ospf_area', sameArea], ['hello', 'ospf_hello'], ['dead', 'ospf_dead'],
                ['net_type', 'ospf_net_type', function (a, b) { return String(a).replace(/[^a-z]/gi, '').toLowerCase() === String(b).replace(/[^a-z]/gi, '').toLowerCase(); }]];
function annotateOspfMismatch(states, adjacency) {
  var subnet = function (ipp) {
    var sp = String(ipp || '').split('/'), len = +sp[1]; if (!sp[0] || isNaN(len)) return null;
    var mask = len === 0 ? 0 : (0xFFFFFFFF << (32 - len)) >>> 0; return ((ip2n(sp[0]) & mask) >>> 0) + '/' + len;
  };
  var found = [];
  Object.keys(adjacency || {}).forEach(function (a) {
    (adjacency[a] || []).forEach(function (e) {
      var b = e.peer, sa = states[a], sb = states[b]; if (!sa || !sb || a >= b) return;   // each pair once
      var lif = normIf(e.iface), ia = sa.interfaces && sa.interfaces[lif]; if (!ia || ia.ospf_area == null) return;
      // the peer's end = an adjacency entry of b pointing back to a, on the same subnet
      var back = (adjacency[b] || []).filter(function (x) { return x.peer === a; }).map(function (x) { return normIf(x.iface); })
        .filter(function (ifn) { var ib = sb.interfaces && sb.interfaces[ifn]; return ib && ib.ospf_area != null && subnet(ib.ip) === subnet(ia.ip); });
      if (!back.length) return;
      var rif = back[0], ib = sb.interfaces[rif], diffs = [];
      OSPF_CMP.forEach(function (c) {
        var x = ia[c[1]], y = ib[c[1]]; if (x == null || y == null) return;
        if (!(c[2] ? c[2](x, y) : x === y)) diffs.push(c);
      });
      if (!diffs.length) return;
      var mk = function (lo, re, li, ri) {
        var o = { field: diffs[0][0], local: lo[diffs[0][1]], remote: re[diffs[0][1]], iface: li, peer_iface: ri };
        if (diffs.length > 1) o.also = diffs.slice(1).map(function (c) { return { field: c[0], local: lo[c[1]], remote: re[c[1]] }; });
        return o;
      };
      sa[b + '_ospf_mismatch'] = mk(ia, ib, lif, rif);
      sb[a + '_ospf_mismatch'] = mk(ib, ia, rif, lif);
      found.push(a + ' ' + lif + ' <-> ' + b + ' ' + rif + ': ' + diffs.map(function (c) { return c[0]; }).join(','));
    });
  });
  return found;
}


// ---------------------------------------------------------------------------
// Collector entry point — same CLI as clab-collect.js / clab-srl-collect.js, so clab-xray-collect.js can
// dispatch cisco_iol (and other IOS-XE kinds) here and every node lands in one window.LIVE_STATES.
//
//   node clab-iosxe-collect.js --lab <lab> --node <node> --adj Ethernet0/1:r2,Ethernet0/2:r3 --proto ospf --out state.json
//   node clab-iosxe-collect.js --from-dir <dir> --node <node> --adj ...   # offline: <dir>/show_ip_route.txt ... (same names as --capture)
//   node clab-iosxe-collect.js --capture <dir> ...                         # live + keep the raw outputs
//   node clab-iosxe-collect.js --self-test                                 # offline, test/fixtures/iosxe-q15 (own IOL captures)
//
// Login: containerlab's cisco_iol defaults (admin / admin). Override with NX_IOS_USER / NX_IOS_PASSWORD.
// The password is handed to ssh through a private askpass file (never on the command line).
// ---------------------------------------------------------------------------
var _fs = require('fs'), _path = require('path'), _cp = require('child_process'), _os = require('os');
var CMDS = [
  ['ospfNeighbor', 'show ip ospf neighbor'],
  ['ospfInterface', 'show ip ospf interface brief'],
  ['ospfInterfaceDetail', 'show ip ospf interface'],
  ['ipInterface', 'show ip interface brief'],
  ['route', 'show ip route'],
  ['bgpSummary', 'show ip bgp summary'],
  ['bgp', 'show ip bgp'],
  ['bridgeDomain', 'show bridge-domain']   /* nx_ios_bdi: which Ethernet port is in which BDI (optional) */
];
var fileOf = function (cmd) { return cmd.replace(/ /g, '_') + '.txt'; };
function arg(k, d) { var i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; }

// IOS echoes "<hostname>#<command>" before each output: split on those prompt lines.
function splitByPrompt(raw) {
  var out = {}, cur = null, buf = [];
  var promptRe = /^[A-Za-z0-9._-]+[#>]\s*(.*)$/;
  String(raw || '').replace(/\r/g, '').split('\n').forEach(function (l) {
    var m = promptRe.exec(l);
    if (m) {
      if (cur) out[cur] = buf.join('\n');
      var cmd = m[1].trim(); cur = null; buf = [];
      CMDS.forEach(function (c) { if (cmd === c[1]) cur = c[0]; });
      return;
    }
    // a syslog line that interrupts an output (e.g. "%OSPF-4-ERRRCV: ... mismatched area ID" on a console):
    // not part of the show, so it is left out of the text and only counted (no `logging synchronous`: read-only)
    if (/^\s*\*?[A-Za-z]{0,3}\s*[\d:. ]*%[A-Z0-9_]+-\d-[A-Z0-9_]+:/.test(l)) { out.__syslog = (out.__syslog || 0) + 1; return; }
    if (cur) buf.push(l);
  });
  if (cur) out[cur] = buf.join('\n');
  return out;
}

// Things in the raw text that mean "this output cannot be trusted as complete" — shown on the page as a
// count instead of being silently mis-read (nx_ios_parse_warnings).
function parseWarnings(texts, opts) {
  var w = [];
  CMDS.forEach(function (c) {
    var t = texts[c[0]];
    if (t == null) return;
    if (/--More--/.test(t)) w.push({ cmd: c[1], why: 'paging', note: 'output was cut by --More-- (terminal length 0 did not apply)' });
    var e = /^\s*% (Invalid input|Incomplete command|Ambiguous command)[^\n]*/m.exec(t);
    if (e && c[0] !== 'bridgeDomain') w.push({ cmd: c[1], why: 'cli_error', note: e[0].trim() });   /* nx_ios_bdi: optional show */
    // "empty" only for commands that always print something (a header): no OSPF neighbours / no BGP routes are real answers
    // (seen on IOL 17.18 with the link shut down, 2026-10-27)
    var _alwaysPrints = c[0] === 'ipInterface' || c[0] === 'route' || (c[0] === 'bgpSummary' && opts.bgpConfigured) || (c[0] === 'ospfInterface' && opts.ospfConfigured);
    if (_alwaysPrints && /^\s*$/.test(t)) w.push({ cmd: c[1], why: 'empty' });
  });
  if (texts.__syslog) w.push({ cmd: '(console)', why: 'syslog', note: texts.__syslog + ' syslog line(s) in the middle of the outputs were left out' });
  if (/\bVRF\b|vrf forwarding|\(vrf /i.test(texts.ipInterface || '') || /Routing Table: /.test(texts.route || ''))
    w.push({ cmd: 'show ip route', why: 'vrf', note: 'VRFs other than the global table are not read yet' });
  return w;
}

// containerlab node -> its management address (labels set by containerlab; works for any name prefix).
function mgmtAddr(lab, node) {
  try {
    var id = _cp.execFileSync('docker', ['ps', '-q', '--filter', 'label=containerlab=' + lab, '--filter', 'label=clab-node-name=' + node],
      { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim().split('\n')[0];
    if (!id) return { err: 'stopped' };
    var ip = _cp.execFileSync('docker', ['inspect', '-f', '{{range .NetworkSettings.Networks}}{{.IPAddress}} {{end}}', id],
      { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim().split(/\s+/)[0];
    return ip ? { ip: ip } : { err: 'device' };
  } catch (e) { return { err: 'device' }; }
}

function sshCollect(host) {
  var user = process.env.NX_IOS_USER || 'admin', pass = process.env.NX_IOS_PASSWORD || 'admin';
  var ap = _path.join(_os.tmpdir(), 'nx-ios-askpass-' + process.pid + (typeof process.getuid === 'function' ? '-u' + process.getuid() : ''));
  _fs.writeFileSync(ap, '#!/bin/sh\nprintf "%s\\n" "$NX_IOS_ASKPASS_VALUE"\n', { mode: 0o700 });
  try {
    var script = 'terminal length 0\nterminal width 0\n' + CMDS.map(function (c) { return c[1]; }).join('\n') + '\nexit\n';
    var r = _cp.spawnSync('ssh', ['-tt', '-o', 'StrictHostKeyChecking=no', '-o', 'UserKnownHostsFile=/dev/null', '-o', 'LogLevel=ERROR',
      '-o', 'ConnectTimeout=15', '-o', 'PreferredAuthentications=keyboard-interactive,password', '-o', 'PubkeyAuthentication=no',
      '-o', 'KexAlgorithms=+diffie-hellman-group14-sha1', '-o', 'HostKeyAlgorithms=+ssh-rsa', '-o', 'Ciphers=+aes128-cbc,aes256-cbc',
      user + '@' + host], { input: script, encoding: 'utf8', timeout: 60000,
      env: Object.assign({}, process.env, { SSH_ASKPASS: ap, SSH_ASKPASS_REQUIRE: 'force', DISPLAY: process.env.DISPLAY || ':0', NX_IOS_ASKPASS_VALUE: pass }) });
    if (r.error && r.error.code === 'ETIMEDOUT') { process.stderr.write('NX_UNREAD timeout\n'); process.exit(124); }
    var out = splitByPrompt(r.stdout || '');
    if (!Object.keys(out).length) { process.stderr.write('NX_UNREAD device (no IOS prompt from ' + host + ': ' + String(r.stderr || '').trim().slice(0, 200) + ')\n'); process.exit(3); }
    return out;
  } finally { try { _fs.unlinkSync(ap); } catch (e) {} }
}

function loadBuildState() {
  var p = _path.join(__dirname, 'clab-collect.js');
  if (!_fs.existsSync(p)) { console.error('!! clab-collect.js not found next to ' + __filename + ' (it builds the state)'); process.exit(2); }
  return require(p).buildState;
}

function run(texts, node, adjStr, proto, mgmtIp) {
  var adjacency = String(adjStr || '').split(',').filter(Boolean).map(function (s) { var i = s.lastIndexOf(':'); return { iface: normIf(s.slice(0, i)), peer: s.slice(i + 1) }; });
  // containerlab's IOL uses Ethernet0/0 as the management port: when the address is not known (--from-dir)
  // and no topology link ends on Ethernet0/0, its address is the management one (dropped like FRR's mgmt).
  if (!mgmtIp && !adjacency.some(function (a) { return a.iface === 'Ethernet0/0'; })) {
    var _m0 = /^(?:Ethernet0\/0|Et0\/0)\s+(\d+\.\d+\.\d+\.\d+)/m.exec(texts.ipInterface || '');
    if (_m0) mgmtIp = _m0[1];
  }
  var parsed = parseAll(Object.assign({ mgmtIp: mgmtIp }, texts));
  var cfg = { ospfConfigured: Object.keys(parsed.ospfIf).length > 0, bgpConfigured: !!parsed.bgpSum.routerId };
  var st = collectFromIosxeText(Object.assign({ mgmtIp: mgmtIp, node: node, id: node, proto: proto, adjacency: adjacency }, cfg, texts), loadBuildState());
  var w = parseWarnings(texts, cfg);
  if (w.length) st.parse_warnings = w;   // nx_ios_parse_warnings: absent when everything was read (FRR states never carry it)
  return st;
}

function selfTest() {
  var dir = _path.join(__dirname, 'test', 'fixtures', 'iosxe-q15');
  var ok = 0, bad = 0;
  var A = function (c, m) { if (c) ok++; else { bad++; console.error('FAIL ' + m); } };
  var adj = { r1: 'Ethernet0/1:r2', r2: 'Ethernet0/1:r1,Ethernet0/2:r3', r3: 'Ethernet0/1:r2' };
  ['r1', 'r2', 'r3'].forEach(function (n) {
    var texts = {}; CMDS.forEach(function (c) { var f = _path.join(dir, n, fileOf(c[1])); if (_fs.existsSync(f)) texts[c[0]] = _fs.readFileSync(f, 'utf8'); });
    var st = run(texts, n, adj[n], 'bgp', '');
    A(st.nos === 'ios-xe', n + ' nos');
    A(st.success === true, n + ' success');
    A(!st.parse_warnings, n + ' no parse warnings on clean captures: ' + JSON.stringify(st.parse_warnings));
    var exp = _path.join(dir, 'state_' + n + '.json');
    if (_fs.existsSync(exp)) {
      var e = JSON.parse(_fs.readFileSync(exp, 'utf8')), keys = Object.keys(e), same = 0;
      keys.forEach(function (k) { if (JSON.stringify(e[k]) === JSON.stringify(st[k])) same++; else console.error('  ' + n + ' differs: ' + k); });
      A(same === keys.length, n + ' state keys ' + same + '/' + keys.length);
    }
  });
  // decision 1 (2026-10-27): a shut-down OSPF interface stays in IOS's list as DOWN but is NOT counted for the heading
  var down = parseOspfInterfaces('Interface    PID   Area            IP Address/Mask    Cost  State Nbrs F/C\nLo0          1     0               1.1.1.1/32         1     DOWN  0/0\nEt0/1        1     0               10.10.0.10/24      10    DOWN  0/0\n');
  A(down['Ethernet0/1'] && down['Ethernet0/1'].up === false, 'DOWN interface -> up:false');
  var w = parseWarnings({ route: 'Gateway of last resort\n --More-- ', bgp: '% Invalid input detected at \'^\' marker.' }, { bgpConfigured: true, ospfConfigured: true });
  A(w.some(function (x) { return x.why === 'paging'; }) && w.some(function (x) { return x.why === 'cli_error'; }), 'parse_warnings: paging + cli error');
  // the OSPF heading on IOS = lo excluded / passive counted / shut down or protocol-down not counted /
  // interfaces without OSPF not counted (they are not in `show ip ospf interface brief`)
  var hb = 'Interface    PID   Area            IP Address/Mask    Cost  State Nbrs F/C\n' +
    'Lo0          1     0               1.1.1.1/32         1     LOOP  0/0\n' +
    'Et0/1        1     0               10.10.0.10/24      10    DR    0/0\n' +
    'Et0/2        1     0               10.20.0.10/24      10    DOWN  0/0\n';
  var hd = 'Ethernet0/1 is up, line protocol is up\n  Internet Address 10.10.0.10/24, Interface ID 3, Area 0\n  Process ID 1, Router ID 1.1.1.1, Network Type BROADCAST, Cost: 10\n  Timer intervals configured, Hello 10, Dead 40, Wait 40, Retransmit 5\n    No Hellos (Passive interface)\n' +
    'Ethernet0/2 is up, line protocol is down\n  Internet Address 10.20.0.10/24, Interface ID 4, Area 0\n';
  var hi = 'Interface              IP-Address      OK? Method Status                Protocol\nEthernet0/0            172.20.20.8     YES TFTP   up                    up\nEthernet0/1            10.10.0.10      YES NVRAM  up                    up\nEthernet0/2            10.20.0.10      YES NVRAM  up                    down\nEthernet0/3            10.30.0.10      YES NVRAM  up                    up\nLoopback0              1.1.1.1         YES NVRAM  up                    up\n';
  var hr = 'Codes: L - local, C - connected\n\nGateway of last resort is not set\n\n      1.0.0.0/32 is subnetted, 1 subnets\nC        1.1.1.1 is directly connected, Loopback0\n      10.0.0.0/8 is variably subnetted, 4 subnets, 2 masks\nC        10.10.0.0/24 is directly connected, Ethernet0/1\nC        10.30.0.0/24 is directly connected, Ethernet0/3\n';
  var hs = run({ ospfInterface: hb, ospfInterfaceDetail: hd, ipInterface: hi, route: hr, ospfNeighbor: '' }, 'r1', 'Ethernet0/1:r2,Ethernet0/2:r3,Ethernet0/3:r4', 'ospf', '');
  A(hs.ospf_if_count === 1, 'heading counts only Et0/1 (passive): lo out, DOWN out, non-OSPF Et0/3 out -> ' + hs.ospf_if_count);
  A(hs.passive_shown === true && (hs.passive_ifaces || []).join(',') === 'Ethernet0/1', 'passive from the full show ip ospf interface -> passive_ifaces (buildState, like FRR)');
  A(hs.interfaces['Ethernet0/2'] && hs.interfaces['Ethernet0/2'].up === false, 'protocol-down Et0/2 -> up:false (drawn red)');
  var sp = splitByPrompt('r1#show ip route\nCodes: L - local\n*Oct 27 09:10:01.123: %OSPF-4-ERRRCV: Received invalid packet: mismatched area ID\nC        10.10.0.0/24 is directly connected, Ethernet0/1\nr1#exit\n');
  A(sp.route && sp.route.indexOf('%OSPF') < 0 && /10\.10\.0\.0/.test(sp.route) && sp.__syslog === 1, 'syslog line inside an output is left out and counted');
  var w2 = parseWarnings({ ospfNeighbor: '', bgp: '', ipInterface: 'Interface IP-Address OK? Method Status Protocol', route: 'Codes: L - local' }, { bgpConfigured: true, ospfConfigured: true });
  A(!w2.length, 'no neighbours / no BGP routes are real answers, not warnings: ' + JSON.stringify(w2));
  // nx_ios_ecmp_fixture: own IOL 17.18.02 captures of a 4-node diamond (r1-r2-r4 / r1-r3-r4, OSPF equal cost)
  var edir = _path.join(__dirname, 'test', 'fixtures', 'iosxe-ecmp');
  var eadj = { r1: 'Ethernet0/1:r2,Ethernet0/2:r3', r2: 'Ethernet0/1:r1,Ethernet0/2:r4', r3: 'Ethernet0/1:r1,Ethernet0/2:r4', r4: 'Ethernet0/1:r2,Ethernet0/2:r3' };
  var eopp = { r1: '4.4.4.4/32', r2: '3.3.3.3/32', r3: '2.2.2.2/32', r4: '1.1.1.1/32' };
  if (_fs.existsSync(edir)) ['r1', 'r2', 'r3', 'r4'].forEach(function (n) {
    var tx = {}; CMDS.forEach(function (c) { var p = _path.join(edir, n, fileOf(c[1])); if (_fs.existsSync(p)) tx[c[0]] = _fs.readFileSync(p, 'utf8'); });
    var st = run(tx, n, eadj[n], 'ospf', '');
    var row = (st.routing_table || []).filter(function (r) { return r.prefix === eopp[n]; })[0] || {};
    A(!st.parse_warnings && (row.nexthops || []).length === 2 && row.nexthops.every(function (h) { return h.ip && /^Ethernet0\/[12]$/.test(h.iface); }),
      'iosxe-ecmp ' + n + ': ' + eopp[n] + ' has 2 next-hops (ip + iface): ' + JSON.stringify(row));
    var ex = _path.join(edir, 'state_' + n + '.json');
    if (_fs.existsSync(ex)) { var e = JSON.parse(_fs.readFileSync(ex, 'utf8')); A(JSON.stringify(e.routing_table) === JSON.stringify(st.routing_table), 'iosxe-ecmp ' + n + ': routing_table same as the live state'); }
  });
  // nx_ios_ecmp: OSPF ECMP (two equal-cost vias) -> the routing_table row carries both next-hops, like FRR (2 coloured arrows)
  var er = 'Codes: L - local, C - connected, O - OSPF\n\nGateway of last resort is not set\n\n      10.0.0.0/8 is variably subnetted, 4 subnets, 2 masks\n' +
    'C        10.12.0.0/24 is directly connected, Ethernet0/1\nC        10.13.0.0/24 is directly connected, Ethernet0/2\n' +
    'O        10.4.0.0/24 [110/20] via 10.12.0.2, 00:01:02, Ethernet0/1\n                     [110/20] via 10.13.0.3, 00:01:02, Ethernet0/2\n' +
    'O        10.5.0.0/24 [110/20] via 10.12.0.2, 00:01:02, Ethernet0/1\n';
  var ei = 'Interface              IP-Address      OK? Method Status                Protocol\nEthernet0/1            10.12.0.1       YES NVRAM  up                    up\nEthernet0/2            10.13.0.1       YES NVRAM  up                    up\n';
  var es = run({ route: er, ipInterface: ei, ospfInterface: '', ospfNeighbor: '' }, 'r1', 'Ethernet0/1:r2,Ethernet0/2:r3', 'ospf', '');
  var e4 = (es.routing_table || []).filter(function (r) { return r.prefix === '10.4.0.0/24'; })[0] || {};
  var e5 = (es.routing_table || []).filter(function (r) { return r.prefix === '10.5.0.0/24'; })[0] || {};
  A((e4.nexthops || []).length === 2 && e4.nexthops[1].ip === '10.13.0.3' && e4.nexthops[1].iface === 'Ethernet0/2', 'ECMP route carries both next-hops: ' + JSON.stringify(e4));
  A(e4.next_hop === '10.12.0.2' && e4.out_iface === 'Ethernet0/1', 'ECMP: next_hop / out_iface stay the first via');
  A(e5.prefix && !e5.nexthops, 'single-via route has no nexthops field (like FRR)');
  // nx_ios_hello_secs: Hello 5 in the full show -> iface_hellos 5 (the Hello ball period), not the fallback 10
  var h5b = 'Interface    PID   Area            IP Address/Mask    Cost  State Nbrs F/C\nEt0/1        1     0               10.10.0.20/24      10    DR    0/0\n';
  var h5d = 'Ethernet0/1 is up, line protocol is up\n  Internet Address 10.10.0.20/24, Interface ID 3, Area 0\n  Process ID 1, Router ID 2.2.2.2, Network Type BROADCAST, Cost: 10\n  Timer intervals configured, Hello 5, Dead 20, Wait 20, Retransmit 5\n';
  var h5i = 'Interface              IP-Address      OK? Method Status                Protocol\nEthernet0/1            10.10.0.20      YES NVRAM  up                    up\n';
  var h5 = run({ ospfInterface: h5b, ospfInterfaceDetail: h5d, ipInterface: h5i, route: 'Codes: L - local', ospfNeighbor: '' }, 'r2', 'Ethernet0/1:r1', 'ospf', '');
  A(h5.iface_hellos && h5.iface_hellos['Ethernet0/1'] === 5, 'Hello 5 -> iface_hellos 5: ' + JSON.stringify(h5.iface_hellos));
  // nx_ios_unnumbered: own IOL 17.18.02 capture, dut -- x1 over ip unnumbered Loopback0 (OSPF point-to-point)
  var udir = _path.join(__dirname, 'test', 'fixtures', 'iosxe-unnumbered', 'dut');
  if (_fs.existsSync(udir)) {
    var utx = {}; CMDS.forEach(function (c) { var p = _path.join(udir, fileOf(c[1])); if (_fs.existsSync(p)) utx[c[0]] = _fs.readFileSync(p, 'utf8'); });
    var us = run(utx, 'dut', 'Ethernet0/1:x1', 'ospf', '');
    var ue = us.interfaces['Ethernet0/1'] || {};
    A(ue.ospf_area != null && us.iface_hellos && us.iface_hellos['Ethernet0/1'] === 10, 'unnumbered Et0/1 is an OSPF IF (area + Hello): ' + JSON.stringify({ area: ue.ospf_area, ih: us.iface_hellos }));
    A(/\/32$/.test(ue.ip || ''), 'unnumbered Et0/1 borrows Lo0 /32, not /24: ' + ue.ip);
    A(us.x1_neighbor_state === 'Full' && !us.parse_warnings, 'x1 Full on Et0/1, no parse warnings');
  }
  // nx_ios_bdi: own IOL capture, dut routes on BDI500-502, links Et0/2 (x1) / Et0/3 (x2) / Et0/1 (x3, dot1q 502)
  var bdir = _path.join(__dirname, 'test', 'fixtures', 'iosxe-bdi', 'dut');
  if (_fs.existsSync(bdir)) {
    var btx = {}; CMDS.forEach(function (c) { var p = _path.join(bdir, fileOf(c[1])); if (_fs.existsSync(p)) btx[c[0]] = _fs.readFileSync(p, 'utf8'); });
    var bs = run(btx, 'dut', 'Ethernet0/2:x1,Ethernet0/3:x2,Ethernet0/1:x3', 'ospf', '');
    A(['x1', 'x2', 'x3'].every(function (x) { return bs[x + '_neighbor_state'] === 'Full'; }), 'BDI: x1-x3 Full on their Ethernet links: ' + ['x1', 'x2', 'x3'].map(function (x) { return x + '=' + bs[x + '_neighbor_state']; }).join(' '));
    A(!Object.keys(bs).some(function (k) { return /^r\d+_neighbor_state$/.test(k); }), 'BDI: no invented peer names (r2..)');
    A(bs.iface_hellos && bs.iface_hellos['Ethernet0/2'] && bs.iface_hellos['Ethernet0/3'] && bs.iface_hellos['Ethernet0/1'], 'BDI: Hello on the 3 links: ' + JSON.stringify(bs.iface_hellos));
    A(!bs.parse_warnings, 'BDI: no parse warnings: ' + JSON.stringify(bs.parse_warnings));
  }
  A(JSON.stringify(parseBridgeDomains('')) === '{}', 'no bridge-domain output -> no mapping');
  console.log('clab-iosxe-collect self-test: ' + ok + ' ok, ' + bad + ' failed');
  process.exit(bad ? 1 : 0);
}

function main() {
  if (process.argv.indexOf('--self-test') > 0) return selfTest();
  var node = arg('--node'), lab = arg('--lab'), proto = (arg('--proto', 'ospf') || 'ospf').toLowerCase();
  if (!node) { console.error('usage: node clab-iosxe-collect.js --lab <lab> --node <node> --adj Ethernet0/1:r2 [--proto ospf|bgp] [--out f.json]'); process.exit(2); }
  var texts, mgmtIp = '';
  if (arg('--from-dir')) {
    texts = {}; CMDS.forEach(function (c) { var f = _path.join(arg('--from-dir'), fileOf(c[1])); if (_fs.existsSync(f)) texts[c[0]] = _fs.readFileSync(f, 'utf8'); });
  } else {
    var a = arg('--host') ? { ip: arg('--host') } : mgmtAddr(lab, node);
    if (a.err) { process.stderr.write('NX_UNREAD ' + a.err + '\n'); process.exit(3); }
    mgmtIp = a.ip;
    texts = sshCollect(a.ip);
    if (arg('--capture')) { _fs.mkdirSync(arg('--capture'), { recursive: true }); CMDS.forEach(function (c) { _fs.writeFileSync(_path.join(arg('--capture'), fileOf(c[1])), texts[c[0]] || ''); }); }
  }
  var st = run(texts, node, arg('--adj', ''), proto, mgmtIp);
  var out = JSON.stringify(st, null, 1);
  if (arg('--out')) _fs.writeFileSync(arg('--out'), out); else process.stdout.write(out + '\n');
}

if (require.main === module) main();

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { normIf: normIf, parseOspfNeighbors: parseOspfNeighbors, parseOspfInterfaces: parseOspfInterfaces,
    parseInterfaces: parseInterfaces, parseBridgeDomains: parseBridgeDomains, parseRoutes: parseRoutes, parseBgpSummary: parseBgpSummary,
    parseBgpRoutes: parseBgpRoutes, parseAll: parseAll, collectFromIosxeText: collectFromIosxeText,
    normBgpState: normBgpState, parseOspfInterfaceDetail: parseOspfInterfaceDetail, parseOspfTraffic: parseOspfTraffic,
    annotateOspfMismatch: annotateOspfMismatch, splitByPrompt: splitByPrompt, parseWarnings: parseWarnings, CMDS: CMDS };
}
