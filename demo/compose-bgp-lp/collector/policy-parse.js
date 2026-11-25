'use strict';
/* policy-parse.js - read the BGP policy lines of an FRR running-config (read-only) and evaluate a prefix against them.
   parse(lines)  -> { bgp: { as, neighbors: { ip: {...} }, networks: [], redistribute: [] }, prefix_lists: {}, route_maps: {} }
   plEval(pls, name, prefix)       -> { verdict: 'permit'|'deny'|'?', seq, why }
   rmEval(rms, pls, name, prefix)  -> { verdict: 'permit'|'deny'|'?', seq, why }
   Only the default VRF and the IPv4 unicast address family are read. What is not evaluated exactly gives verdict '?' with a why:
   a match other than "ip address prefix-list", more than one match in one entry, continue / call / on-match, a list or a map
   that is referenced but not defined. Nothing here guesses: '?' means "a policy is there, its result is not worked out". */

function ip4(s) {
  var m = /^(\d+)\.(\d+)\.(\d+)\.(\d+)$/.exec(String(s || ''));
  if (!m) return null;
  var p = [m[1], m[2], m[3], m[4]].map(Number);
  if (p.some(function (x) { return x > 255; })) return null;
  return ((p[0] << 24) >>> 0) + (p[1] << 16) + (p[2] << 8) + p[3];
}
function pfx(s) {
  var m = /^([\d.]+)\/(\d+)$/.exec(String(s || '').trim());
  if (!m) return null;
  var a = ip4(m[1]), len = +m[2];
  if (a == null || len > 32) return null;
  return { addr: a, len: len };
}
function within(p, net) {   // p inside net (same or longer prefix, same leading bits)
  if (p.len < net.len) return false;
  if (net.len === 0) return true;
  var mask = net.len === 32 ? 0xffffffff : ((0xffffffff << (32 - net.len)) >>> 0);
  return ((p.addr & mask) >>> 0) === ((net.addr & mask) >>> 0);
}

function parse(lines) {
  var out = { bgp: null, ospf: null, prefix_lists: {}, route_maps: {} };
  var ctx = null, rm = null, af = 'ipv4';   // ctx: 'bgp' | 'bgp-other' (vrf) | 'rm' | null
  function nb(ip) {
    var n = out.bgp.neighbors[ip] = out.bgp.neighbors[ip] || {};
    return n;
  }
  (lines || []).forEach(function (raw) {
    var l = String(raw || '').trim();
    if (!l || l === '!') { if (ctx === 'rm') { ctx = null; rm = null; } return; }
    var m;
    if ((m = /^router bgp (\d+(?:\.\d+)?)(\s+vrf\s+\S+)?$/.exec(l))) {
      if (m[2]) { ctx = 'bgp-other'; return; }
      out.bgp = out.bgp || { as: m[1], neighbors: {}, networks: [], redistribute: [] };
      ctx = 'bgp'; af = 'ipv4'; return;
    }
    if ((m = /^router ospf(\s+vrf\s+\S+)?$/.exec(l))) { if (m[1]) { ctx = 'other'; return; } out.ospf = out.ospf || { redistribute: [] }; ctx = 'ospf'; return; }
    if (/^router /.test(l)) { ctx = 'other'; return; }
    if ((m = /^route-map (\S+) (permit|deny) (\d+)$/.exec(l))) {
      rm = { seq: +m[3], action: m[2], matches: [], other: [] };
      (out.route_maps[m[1]] = out.route_maps[m[1]] || []).push(rm);
      ctx = 'rm'; return;
    }
    if ((m = /^ip prefix-list (\S+)(?: seq (\d+))? (permit|deny) (\S+)(?: ge (\d+))?(?: le (\d+))?$/.exec(l))) {
      var list = out.prefix_lists[m[1]] = out.prefix_lists[m[1]] || [];
      var seq = m[2] != null ? +m[2] : (list.length ? list[list.length - 1].seq : 0) + 5;   // FRR numbers an entry without seq by 5
      var e = { seq: seq, action: m[3], prefix: m[4] === 'any' ? '0.0.0.0/0' : m[4] };
      if (m[4] === 'any') e.le = 32;
      if (m[5] != null) e.ge = +m[5];
      if (m[6] != null) e.le = +m[6];
      list.push(e); return;
    }
    if (/^(exit|end)$/.test(l)) { if (ctx === 'rm') { ctx = null; rm = null; } else if (ctx && l === 'exit') ctx = null; return; }
    if (ctx === 'rm') {
      if ((m = /^match ip address prefix-list (\S+)$/.exec(l))) { rm.matches.push({ type: 'prefix-list', name: m[1] }); return; }
      if (/^match /.test(l)) { rm.other.push(l); return; }
      if (/^(continue|call|on-match)\b/.test(l)) { rm.other.push(l); return; }
      return;   // set ... : changes attributes, not whether the route passes
    }
    if (ctx === 'ospf') {   /* redistribute <proto> [metric N] [metric-type N] [route-map X] */
      if ((m = /^redistribute (\S+)(?: metric \S+)?(?: metric-type \S+)?(?: route-map (\S+))?$/.exec(l))) { var ro = { proto: m[1] }; if (m[2]) ro.route_map = m[2]; out.ospf.redistribute.push(ro); }
      return;
    }
    if (ctx !== 'bgp') return;
    if ((m = /^address-family (\S+)(?: (\S+))?$/.exec(l))) { af = m[1] === 'ipv4' && (!m[2] || m[2] === 'unicast') ? 'ipv4' : 'other'; return; }
    if (l === 'exit-address-family') { af = 'ipv4'; return; }
    if (af !== 'ipv4') return;
    if ((m = /^neighbor (\S+) remote-as (\S+)$/.exec(l))) { nb(m[1]).remote_as = m[2]; return; }
    if ((m = /^neighbor (\S+) peer-group (\S+)$/.exec(l))) { nb(m[1]).peer_group = m[2]; return; }
    if ((m = /^neighbor (\S+) next-hop-self(?: force)?$/.exec(l))) { nb(m[1]).next_hop_self = true; return; }
    if ((m = /^neighbor (\S+) (prefix-list|route-map) (\S+) (in|out)$/.exec(l))) {
      var k = m[2] === 'prefix-list' ? 'prefix_list' : 'route_map', n = nb(m[1]);
      (n[k] = n[k] || {})[m[4]] = m[3]; return;
    }
    if ((m = /^network (\S+)(?: route-map (\S+))?$/.exec(l))) { out.bgp.networks.push(m[1]); return; }
    if ((m = /^redistribute (\S+)(?: route-map (\S+))?$/.exec(l))) { var r = { proto: m[1] }; if (m[2]) r.route_map = m[2]; out.bgp.redistribute.push(r); return; }
  });
  return out;
}

function plEval(pls, name, prefix) {
  var list = pls && pls[name], p = pfx(prefix);
  if (!list) return { verdict: '?', seq: null, why: 'prefix-list ' + name + ' is not defined' };
  if (!p) return { verdict: '?', seq: null, why: 'not an IPv4 prefix: ' + prefix };
  for (var i = 0; i < list.length; i++) {
    var e = list[i], net = pfx(e.prefix);
    if (!net) return { verdict: '?', seq: e.seq, why: 'entry not read: ' + e.prefix };
    var ok;
    if (e.ge == null && e.le == null) ok = p.len === net.len && within(p, net);
    else ok = within(p, net) && p.len >= (e.ge != null ? e.ge : net.len) && p.len <= (e.le != null ? e.le : 32);
    if (ok) return { verdict: e.action, seq: e.seq, why: 'prefix-list ' + name + ' seq ' + e.seq + ' ' + e.action + ' ' + e.prefix + (e.ge != null ? ' ge ' + e.ge : '') + (e.le != null ? ' le ' + e.le : '') };
  }
  return { verdict: 'deny', seq: null, why: 'prefix-list ' + name + ': no entry matches (the implicit deny at the end)' };
}

function rmEval(rms, pls, name, prefix) {
  var list = rms && rms[name];
  if (!list) return { verdict: '?', seq: null, why: 'route-map ' + name + ' is not defined' };
  var sorted = list.slice().sort(function (a, b) { return a.seq - b.seq; });
  for (var i = 0; i < sorted.length; i++) {
    var e = sorted[i];
    if (e.other.length || e.matches.length > 1) return { verdict: '?', seq: e.seq, why: 'route-map ' + name + ' seq ' + e.seq + ' has ' + (e.other[0] || 'more than one match') + ' (not evaluated)' };
    var hit = true;
    if (e.matches.length) {
      var r = plEval(pls, e.matches[0].name, prefix);
      if (r.verdict === '?') return { verdict: '?', seq: e.seq, why: 'route-map ' + name + ' seq ' + e.seq + ': ' + r.why };
      hit = r.verdict === 'permit';
    }
    if (hit) return { verdict: e.action, seq: e.seq, why: 'route-map ' + name + ' seq ' + e.seq + ' ' + e.action + (e.matches.length ? ' (match prefix-list ' + e.matches[0].name + ')' : ' (no match = every route)') };
  }
  return { verdict: 'deny', seq: null, why: 'route-map ' + name + ': no entry matches (the implicit deny at the end)' };
}

module.exports = { parse: parse, plEval: plEval, rmEval: rmEval, pfx: pfx, within: within, ip4: ip4 };
