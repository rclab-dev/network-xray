#!/usr/bin/env node
/*
 * netlab-validate.js — read a netlab lab's `validate:` tests and judge them against the running FRR routers.
 *
 * netlab (https://netlab.tools) labs such as ipSpace's BGP Labs check the student's work with `netlab validate`
 * (tests in validate.yml). network-xray reads the same tests and evaluates them itself, so the page can show
 * "3 / 5" and ✓ Solved and mark the failing session / route on the graph — every few seconds, while you type.
 *
 * Input = the transformed netlab topology as JSON (`network-xray.json`, written by `netlab create` / `netlab up`
 * when the network-xray netlab defaults are used: netlab.create.output.json). It holds `validate` (the tests) and
 * the node data the tests refer to (nodes.x1.bgp.router_id, node.bgp.neighbors, ...).
 *
 * Supported (FRR nodes, read with `docker exec <container> vtysh -c 'show ... json'`, show commands only):
 *   plugin: bgp_neighbor(ngb, name, af, vrf=, state=, activate=, intf=)
 *   plugin: bgp_prefix(prefix, af=, vrf=, state=, peer=, nh=, best=, clusterid=, community=, as_elements=, aspath=, locpref=, med=)
 * Anything else (show/valid, ping, OSPF, other devices) is reported as "not checked by network-xray" — never as passed.
 * The checks follow netlab's own FRR validation plugin (netsim/validate/bgp/frr.py) so the verdict and the message
 * match `netlab validate`.
 *
 *   CLI (one round, prints the result):  node netlab-validate.js <network-xray.json> [container-prefix]
 *   module:  require('./netlab-validate.js').load(file) -> lab;  .run(lab, prefix, cb(result))
 */
'use strict';
var fs = require('fs'), cp = require('child_process');

/* ---------- a small reader for the plugin call: name(arg, ..., key=value) ---------- */
function tokenize(s) {
  var t = [], i = 0, m;
  while (i < s.length) {
    var c = s[i];
    if (/\s/.test(c)) { i++; continue; }
    if (c === "'" || c === '"') {
      var j = i + 1, v = '';
      while (j < s.length && s[j] !== c) { if (s[j] === '\\' && j + 1 < s.length) { j++; } v += s[j]; j++; }
      if (j >= s.length) throw new Error('unterminated string');
      t.push({ k: 'str', v: v }); i = j + 1; continue;
    }
    if ((m = /^-?\d+(\.\d+)?/.exec(s.slice(i))) && (c === '-' || /\d/.test(c))) { t.push({ k: 'num', v: Number(m[0]) }); i += m[0].length; continue; }
    if ((m = /^[A-Za-z_][A-Za-z0-9_]*/.exec(s.slice(i)))) { t.push({ k: 'id', v: m[0] }); i += m[0].length; continue; }
    if ('.[](),={}:'.indexOf(c) >= 0) { t.push({ k: c }); i++; continue; }
    throw new Error('unexpected character ' + c);
  }
  return t;
}
function parseCall(src) {
  var t = tokenize(String(src)), p = 0;
  function peek(k) { return t[p] && t[p].k === k; }
  function eat(k) { if (!peek(k)) throw new Error('expected ' + k + ' at token ' + p); return t[p++]; }
  function value() {
    var x = t[p];
    if (!x) throw new Error('unexpected end');
    if (x.k === 'str' || x.k === 'num') { p++; return { lit: x.v }; }
    if (x.k === '[') { p++; var a = []; while (!peek(']')) { a.push(value()); if (peek(',')) p++; else break; } eat(']'); return { list: a }; }
    if (x.k === '{') {
      p++; var o = [];
      while (!peek('}')) { var key = value(); eat(':'); o.push([key, value()]); if (peek(',')) p++; else break; }
      eat('}'); return { dict: o };
    }
    if (x.k === 'id') {
      p++;
      if (x.v === 'True') return { lit: true };
      if (x.v === 'False') return { lit: false };
      if (x.v === 'None') return { lit: null };
      var path = [x.v];
      for (;;) {
        if (peek('.')) { p++; path.push(eat('id').v); }
        else if (peek('[')) { p++; path.push(value()); eat(']'); }
        else break;
      }
      return { ref: path };
    }
    throw new Error('unexpected token ' + x.k);
  }
  var fn = eat('id').v; eat('(');
  var args = [], kw = {};
  while (!peek(')')) {
    if (peek('id') && t[p + 1] && t[p + 1].k === '=') { var k = t[p].v; p += 2; kw[k] = value(); }
    else args.push(value());
    if (peek(',')) p++; else break;
  }
  eat(')');
  if (p !== t.length) throw new Error('extra text after the call');
  return { fn: fn, args: args, kw: kw };
}
function has(o, k) { return o != null && typeof o === 'object' && Object.prototype.hasOwnProperty.call(o, k); }
function evalValue(v, ctx) {
  if (has(v, 'lit')) return v.lit;
  if (v.list) return v.list.map(function (x) { return evalValue(x, ctx); });
  if (v.dict) { var o = {}; v.dict.forEach(function (kv) { o[evalValue(kv[0], ctx)] = evalValue(kv[1], ctx); }); return o; }
  var path = v.ref, cur, shown = path[0];
  /* nx_validate_topo_names (2026-10-17): netlab evaluates a test against the whole lab topology, so any top-level name
     of it can be used (links[5].prefix.ipv4 in BGP Labs policy/d). A name that is not there = network-xray cannot
     read the test -> grey (not checked), never "failed" */
  if (path[0] === 'node') cur = ctx.node;
  else if (path[0] === 'nodes') cur = ctx.nodes;
  else if (ctx.topo && has(ctx.topo, path[0]) && path[0] !== 'validate') cur = ctx.topo[path[0]];
  else throw Object.assign(new Error('unknown name ' + path[0]), { unsupported: true });
  for (var i = 1; i < path.length; i++) {
    var key = typeof path[i] === 'string' ? path[i] : evalValue(path[i], ctx);
    shown += typeof path[i] === 'string' ? '.' + key : '[' + key + ']';
    /* netlab 26.x moves bgp.originate into bgp.advertise ({ipv4: ...}) while building the lab, so older validate.yml
       files that say nodes.X.bgp.originate[0] would find nothing: read the advertised prefixes instead */
    if (key === 'originate' && cur && has(cur, 'advertise') && !(Array.isArray(cur.originate) && cur.originate.length)) {
      cur = (cur.advertise || []).map(function (a) { return a && typeof a === 'object' ? (a.ipv4 || a.ipv6) : a; });
      continue;
    }
    if (Array.isArray(cur) && typeof key === 'number') cur = cur[key];
    else if (has(cur, key)) cur = cur[key];
    else cur = undefined;
    if (cur === undefined || cur === null) throw Object.assign(new Error('the lab has no ' + shown), { unsupported: true });   /* nx_validate_nodata (2026-10-18): netlab does not run such a test either -> grey, not failed */
  }
  return cur;
}

/* ---------- prefixes (netlab: ipaddress.ip_interface(addr).network) ---------- */
function ipv4Net(s) {
  var m = /^(\d+)\.(\d+)\.(\d+)\.(\d+)(?:\/(\d+))?$/.exec(String(s).trim());
  if (!m) return null;
  var len = m[5] === undefined ? 32 : +m[5], n = 0;
  for (var i = 1; i <= 4; i++) n = n * 256 + (+m[i]);

  var net = Math.floor(n / Math.pow(2, 32 - len)) * Math.pow(2, 32 - len);
  if (len === 0) net = 0;
  return [24, 16, 8, 0].map(function (b) { return Math.floor(net / Math.pow(2, b)) % 256; }).join('.') + '/' + len;
}
function getPrefix(addr) {
  if (addr && typeof addr === 'object') addr = addr.ipv4 || addr.ipv6;
  var v4 = ipv4Net(addr);
  if (v4) return v4;
  if (/:/.test(String(addr))) return String(addr).indexOf('/') >= 0 ? String(addr).toLowerCase() : String(addr).toLowerCase() + '/128';
  throw new Error('not a prefix: ' + addr);
}

/* ---------- the FRR checks (same rules and messages as netlab's netsim/validate/bgp/frr.py) ---------- */
var AF_LOOKUP = { ipv4: 'ipv4Unicast', ipv6: 'ipv6Unicast', evpn: 'evpn', vpnv4: 'vpnv4', vpnv6: 'vpnv6' };
var AF_KW = { ipv4: 'ipv4 summary established', ipv6: 'ipv6 summary established', evpn: 'evpn summary', vpnv4: 'ipv4 vpn summary', vpnv6: 'ipv6 vpn summary' };
var PFX_NAMES = { peer: 'BGP router ID', nh: 'BGP next hop', clusterid: 'RR cluster ID', community: 'BGP community', as_elements: 'AS numbers',
  aspath: 'AS path', locpref: 'BGP local preference', med: 'BGP MED', best: 'best path' };
function Pass(msg) { this.pass = true; this.message = msg; }
function Fail(msg) { this.pass = false; this.message = msg; }
function reportState(msg, ok) { throw ok ? new Pass(msg) : new Fail(msg); }
function pyStr(v) { return v === true ? 'True' : v === false ? 'False' : Array.isArray(v) ? '[' + v.map(pyStr).join(', ') + ']' : (v && typeof v === 'object') ? JSON.stringify(v) : String(v); }

function neighborAddr(ngb, nId, af) {
  for (var i = 0; i < (ngb || []).length; i++) {
    var n = ngb[i];
    if (n.name !== nId || !has(n, af)) continue;
    return n[af];
  }
  throw new Fail('Cannot find the ' + af + ' address of the neighbor ' + nId);
}
var POSITIONAL = { bgp_neighbor: ['ngb', 'n_id', 'af'], bgp_prefix: ['pfx'] };   /* nx_validate_kwargs */
var PLUGINS = {
  bgp_neighbor: {
    // args: (ngb, n_id, af='ipv4', *, vrf='default', state='Established', activate='', intf='')
    show: function (a, kw) {
      var vrf = kw.vrf || 'default', act = kw.activate || '';
      if (!act) return 'bgp vrf ' + vrf + ' summary json';
      if (!AF_LOOKUP[act]) throw new Fail('Unsupported address family ' + act);
      if (act !== 'ipv4' && act !== 'ipv6') return 'bgp ' + AF_KW[act] + ' json';
      return 'bgp vrf ' + vrf + ' ' + AF_KW[act] + ' json';
    },
    valid: function (r, a, kw) {
      var ngb = a[0], nId = a[1], af = a[2] || kw.af || 'ipv4', state = kw.state || 'Established', act = kw.activate || '', intf = kw.intf || '';
      var nAddr = neighborAddr(ngb, nId, af);
      if (nAddr === true) { if (!intf) throw new Fail('Need an interface name for an unnumbered EBGP neighbor'); nAddr = intf; }
      var actErr = act ? ' in address family ' + act : '';
      if (!act) act = af;
      var data;
      if (has(r, 'peers')) data = r.peers;
      else if (!has(r, AF_LOOKUP[act])) { reportState('There are no BGP peers in address family ' + act, state === 'missing'); }
      else data = r[AF_LOOKUP[act]].peers || {};
      var link = { link: [nId] };
      if (!has(data, nAddr)) {
        var res = 'The router has no BGP neighbor with ' + af + ' address ' + nAddr + ' (' + nId + ')' + actErr;
        if (state === 'missing') return { pass: true, message: res, mark: link };
        throw Object.assign(new Fail(res), { mark: link });
      }
      var pState = data[nAddr].state;
      if (String(state).indexOf(pState) < 0) {   // python: p_state not in state
        var res2 = 'The neighbor ' + nAddr + ' (' + nId + ') ' + actErr + ' is in state ' + pState;
        if (state === 'missing' && pState !== 'Established') return { pass: true, message: res2, mark: link };
        throw Object.assign(new Fail(res2 + ' (expected ' + state + ')'), { mark: link });
      }
      return { pass: true, message: 'Neighbor ' + nAddr + ' (' + nId + ') is in state ' + pState, mark: link };
    }
  },
  bgp_prefix: {
    // args: (pfx, *, af='ipv4', state='present', vrf='default', **checks)
    show: function (a, kw) { return 'bgp vrf ' + (kw.vrf || 'default') + ' ' + (kw.af || 'ipv4') + ' unicast ' + getPrefix(a[0]) + ' json'; },
    valid: function (r, a, kw) {
      var pfx = getPrefix(a[0]), state = kw.state || 'present', table = 'BGP table', mark = { prefix: pfx };
      var order = ['peer', 'nh', 'best', 'clusterid', 'community', 'as_elements', 'aspath', 'locpref', 'med'];
      Object.keys(kw).forEach(function (k) { if (['af', 'state', 'vrf'].indexOf(k) < 0 && order.indexOf(k) < 0) throw new Fail('Invalid prefix check ' + k); });
      try {
        if (!has(r, 'prefix')) reportState('The prefix ' + pfx + ' is not in the ' + table, state === 'missing');
        var data = r.paths || [], checked = [], params = '';
        order.forEach(function (k) {
          if (!has(kw, k)) return;
          data = CHECKS[k](data, kw[k], pfx, state);
          checked.push(k);
          params = ' with ' + checked.map(function (c) { return PFX_NAMES[c] + '=' + pyStr(kw[c]); }).join(',');
          if (!data.length) reportState('There is no path to ' + pfx + ' in the ' + table + params, state === 'missing');
          else if (state === 'missing') throw new Fail('The prefix ' + pfx + params + ' should not be in the ' + table);
        });
        if (state === 'missing') throw new Fail('The prefix ' + pfx + params + ' should not be in the ' + table);
        return { pass: true, message: 'The prefix ' + pfx + ' is in the ' + table + params, mark: mark };
      } catch (e) { if (e instanceof Pass || e instanceof Fail) e.mark = mark; throw e; }
    }
  }
};
var CHECKS = {
  peer: function (d, v) { return d.filter(function (p) { return p.peer && p.peer.routerId === v; }); },
  nh: function (d, v, pfx, state) {
    v = String(v).split('/')[0]; var found = [], res = [];
    d.forEach(function (p) { var nhs = p.nexthops || []; for (var i = 0; i < nhs.length; i++) { found.push(nhs[i].ip); if (nhs[i].ip === v) { res.push(p); break; } } });
    if (!res.length && state !== 'missing') throw new Fail('The next hop(s) for prefix ' + pfx + ' is/are ' + found.join(',') + ', not ' + v);
    return res;
  },
  best: function (d, v) { return d.filter(function (p) { return (p.bestpath || {}).overall === v; }); },   // netlab: p.get('bestpath',{}).get('overall',None) == value
  clusterid: function (d, v, pfx, state) {
    var res = d.filter(function (p) { return p.clusterList && (p.clusterList.list || []).indexOf(v) >= 0; });
    if (!res.length && state !== 'missing') throw new Fail('Cannot find cluster ID ' + v + ' in the paths of prefix ' + pfx);
    return res;
  },
  community: function (d, v, pfx, state) {
    if (!v || typeof v !== 'object' || Array.isArray(v)) throw new Fail('Community check expects a dictionary of communities');
    var ok = {};
    d.forEach(function (p) { Object.keys(v).forEach(function (c) { if (p[c] && String(p[c].string || '').indexOf(v[c]) >= 0) ok[c] = true; }); });
    Object.keys(v).forEach(function (c) {
      if (['community', 'largeCommunity', 'extendedCommunity'].indexOf(c) < 0) throw new Fail('Invalid BGP community keyword ' + c);
      if (state === 'present' && !ok[c]) throw new Fail(c + ' community ' + v[c] + ' is not attached to ' + pfx);
      if (state === 'missing' && ok[c]) throw new Fail(c + ' ' + v[c] + ' should not be attached to ' + pfx);
    });
    throw new Pass('The prefix ' + pfx + ' contains the expected communities');
  },
  aspath: function (d, v, pfx, state) {
    var res = [], found = [];
    d.forEach(function (p) { var s = (p.aspath || {}).string; if (s === v) res.push(p); else found.push(s); });
    if (!res.length && state !== 'missing') throw new Fail('No path to prefix ' + pfx + ' has AS-path ' + v + ' (found ' + found.join(',') + ')');
    return res;
  },
  as_elements: function (d, v, pfx, state) {
    var want = Array.isArray(v) ? v : [v], res = [], found = [];
    d.forEach(function (p) {
      var left = want.slice();
      ((p.aspath || {}).segments || []).forEach(function (sg) { (sg.list || []).forEach(function (asn) { left = left.filter(function (x) { return x !== asn; }); }); });
      if (!left.length) res.push(p); else found.push((p.aspath || {}).string);
    });
    if (!res.length && state !== 'missing') throw new Fail('No path to prefix ' + pfx + ' has ' + pyStr(want) + ' in AS-path (found ' + found.join(',') + ')');
    return res;
  },
  locpref: function (d, v) { return d.filter(function (p) { return p.locPrf === v; }); },
  med: function (d, v) { return d.filter(function (p) { return p.metric === v; }); }
};

/* ---------- running a round ---------- */
/* nx_netlab_tiers (2026-10-15): rows for the graph from the netlab groups (BGP Labs draw the ISPs on top, the customer /
   leaf routers at the bottom): leaf(s) / customer(s) / client(s) / host(s) / access / edge / site* = bottom row (checked first),
   provider / isp* / upstream / transit / spine(s), then external = top row, the rest (e.g. the student's rtr, route reflectors) in between.
   No such group (or everything in one row) -> null = the page keeps its own layout. */
var TIER_TOP = /^(provider|isp.*|upstream|transit|spines?)$/i, TIER_EXT = /^external$/i, TIER_BOTTOM = /^(leaf|leafs|leaves|customers?|clients?|hosts?|access|edge|site.*)$/i;
function tiers(topo) {
  var lv = {}, used = {}, groups = topo.groups || {};
  Object.keys(topo.nodes || {}).forEach(function (n) {
    var g = Object.keys(groups).filter(function (k) { return (groups[k].members || []).indexOf(n) >= 0; });
    /* bottom marks first (bgplab puts customers / leafs in "external" too: external = pre-configured, not upstream), then the
       explicit top marks, then external (rtr + x1/x2 labs: the ISPs) */
    var has = function (re) { return g.some(function (k) { return re.test(k); }); };
    var l = has(TIER_BOTTOM) ? 2 : has(TIER_TOP) ? 0 : has(TIER_EXT) ? 0 : 1;
    lv[n] = l; used[l] = 1;
  });
  var ks = Object.keys(used).map(Number).sort();
  if (ks.length < 2) return null;
  Object.keys(lv).forEach(function (n) { lv[n] = ks.indexOf(lv[n]); });   // 0..rows-1
  return lv;
}
function load(file) {
  var topo = JSON.parse(fs.readFileSync(file, 'utf8'));
  var tests = Array.isArray(topo.validate) ? topo.validate : Object.keys(topo.validate || {}).map(function (k) { return Object.assign({ name: k }, topo.validate[k]); });
  var mtime = fs.statSync(file).mtimeMs, started = mtime;
  try { started = fs.statSync(require('path').join(require('path').dirname(file), 'netlab.lock')).mtimeMs; } catch (e) {}   /* nx_validate_converge */
  if (LIVE_START) started = Math.max(started, PROC_START);   /* nx_validate_clistart: only the live band counts from its own start */   /* the netlab tool starts network-xray after the lab is configured: count from whichever is later */
  return { name: topo.name || '', nodes: topo.nodes || {}, topo: topo, tests: tests, tiers: tiers(topo), mtime: mtime, started: started };
}
function shell1(s) { return "'" + String(s).replace(/'/g, "'\\''") + "'"; }
// one docker exec per (node, command) per round; results cached within the round
function runShow(container, cmd, cb) {
  /* nx_no_shell (2026-10-17): values from the lab file (vrf, af, prefix) go into one vtysh -c argument, and vtysh runs each
     line of it as a command -> only plain words reach it (no newline, no other characters) */
  if (!/^[A-Za-z0-9][A-Za-z0-9_.-]{0,126}$/.test(container)) return cb(new Error('not a plain container name: ' + JSON.stringify(String(container).slice(0, 80))));
  if (!/^[A-Za-z0-9 ._:\/-]+$/.test(cmd)) return cb(new Error('a value in this test is not a plain word: ' + JSON.stringify(String(cmd).slice(0, 120))));
  cp.execFile('docker', ['exec', container, 'vtysh', '-c', 'show ' + cmd], { timeout: 8000, maxBuffer: 8 * 1024 * 1024 }, function (err, out) {
    if (err) return cb(new Error((err.killed ? 'timeout: ' : '') + 'docker exec ' + container + " vtysh -c " + shell1('show ' + cmd) + ' failed'));
    var j; try { j = JSON.parse(String(out).trim() || '{}'); } catch (e) { return cb(new Error('not JSON: show ' + cmd)); }
    cb(null, j);
  });
}
function unsupportedWhy(t) {
  if (has(t, 'show') || has(t, 'valid') || has(t, 'exec')) return 'show/valid';
  if (has(t, 'suzieq')) return 'suzieq';
  if (!has(t, 'plugin')) return 'no plugin';
  return null;
}
/* result = { format, lab, tests:[{name, description, status, message, text, nodes:[{node,status,message}], marks:[...]}], counts } */
/* nx_validate_settle (2026-10-17): a "not there" check (state='missing') passes the moment the lab starts, before any
   route had time to arrive (netlab validate does the same when typed that early; BGP Labs tests carry no wait:). Here the
   band is live from the first second, so such a pass only counts once the router's BGP sessions have all been up for
   SETTLE_S seconds (or the test's own numeric wait:, if longer); until then the test is 'settling' (grey, no Solved). */
var SETTLE_S = 30;
/* nx_validate_converge (2026-10-17): (1) for CONVERGE_S seconds after the lab started (netlab.lock) the result says
   converging: true and the page shows no Solved; (2) a test with a numeric wait: is not judged until that many seconds
   after the lab started (netlab counts wait: from the lab start too). */
var CONVERGE_S = 60;
var PROC_START = Date.now(), LIVE_START = false;   /* nx_validate_clistart: set by the collector in --watch */
function bgpSettled(container, vrf, needS, cache, labMtime, cb) {
  var key = container + '|' + vrf;
  var finish = function (j) {
    if (j === null) return cb(false, 0);   /* nx_review_1017 (F-02): the summary could not be read = not settled */
    var up = [], peers = 0;
    Object.keys(j || {}).forEach(function (af) { var ps = (j[af] && j[af].peers) || {};
      Object.keys(ps).forEach(function (ip) { var p = ps[ip] || {}; peers++; if (p.state === 'Established') up.push(+p.peerUptimeMsec || 0); }); });
    if (peers && !up.length) return cb(false, 0);   /* F-02: BGP neighbours but none up = BGP is down, "not there" means nothing yet */
    var secs = up.length ? Math.floor(Math.min.apply(null, up) / 1000) : Math.floor((Date.now() - (labMtime || 0)) / 1000);   /* no neighbour at all: from the lab start */
    cb(secs >= needS, secs);
  };
  if (has(cache, key)) return finish(cache[key]);
  runShow(container, 'bgp vrf ' + vrf + ' summary json', function (err, j) { cache[key] = err ? null : j; finish(cache[key]); });
}
function run(lab, prefix, done) {
  var out = [], stopped = false, idx = 0, sumCache = {};   /* nx_validate_settle: one summary per router per round */
  function next() {
    if (idx >= lab.tests.length) return finish();
    var t = lab.tests[idx++], row = { name: t.name, description: t.description || t.name, nodes: [], marks: [], stop: !!t.stop_on_error, level: t.level || '' };
    out.push(row);
    if (stopped) { row.status = 'pending'; return next(); }
    var why = unsupportedWhy(t), call = null;
    if (!why) { try { call = parseCall(t.plugin); } catch (e) { why = 'cannot read: ' + e.message; } }
    if (!why && !PLUGINS[call.fn]) why = call.fn;
    if (why) { row.status = 'unsupported'; row.message = why; return next(); }
    var _age = Math.floor((Date.now() - (lab.started || lab.mtime || 0)) / 1000);   /* nx_validate_converge (2) */
    if (typeof t.wait === 'number' && _age < t.wait) { row.status = 'settling'; row.message = 'wait: ' + t.wait + ' s after the lab started (now ' + _age + ' s)'; return next(); }
    var nlist = (t.nodes || []).filter(function (n) {
      var nd = lab.nodes[n];
      if (!nd) { row.nodes.push({ node: n, status: 'error', message: 'no node ' + n + ' in the lab' }); return false; }
      if (t.devices && t.devices.indexOf(nd.device) < 0) { row.nodes.push({ node: n, status: 'skip', message: 'device ' + nd.device + ' is not in the test' }); return false; }
      if (nd.device !== 'frr') { row.nodes.push({ node: n, status: 'unsupported', message: 'device ' + nd.device }); return false; }
      return true;
    });
    var k = 0;
    (function eachNode() {
      if (k >= nlist.length) return endTest();
      var n = nlist[k++], nd = lab.nodes[n], ctx = { node: nd, nodes: lab.nodes, topo: lab.topo }, args, kw = {}, cmd;
      var rec = { node: n };
      try {
        args = call.args.map(function (a) { return evalValue(a, ctx); });
        Object.keys(call.kw).forEach(function (x) { kw[x] = evalValue(call.kw[x], ctx); });
        /* nx_validate_kwargs (2026-10-18): Python lets a positional parameter be given by name (bgp_prefix(pfx=...)): move it
           to its place, as netlab does (names from netlab's frr.py: bgp_neighbor(ngb, n_id, af), bgp_prefix(pfx)) */
        (POSITIONAL[call.fn] || []).forEach(function (name, i) { if (has(kw, name) && args[i] === undefined) { args[i] = kw[name]; delete kw[name]; } });
        cmd = PLUGINS[call.fn].show(args, kw);
      } catch (e) { rec.status = e && e.unsupported ? 'unsupported' : 'fail'; rec.message = e.message; row.nodes.push(rec); return eachNode(); }   /* nx_validate_topo_names */
      runShow(prefix + n, cmd, function (err, j) {
        if (err) { rec.status = 'error'; rec.message = err.message; row.nodes.push(rec); return eachNode(); }
        var r;
        try { r = PLUGINS[call.fn].valid(j, args, kw); } catch (e) { r = (e instanceof Pass || e instanceof Fail) ? e : { pass: false, message: e.message }; }
        if (r.pass && (kw.state === 'missing' || kw.best === false)) {   /* nx_validate_settle: "not there" / "not the best" checks */
          var needS = Math.max(SETTLE_S, typeof t.wait === 'number' ? t.wait : 0);
          return bgpSettled(prefix + n, kw.vrf || 'default', needS, sumCache, lab.started || lab.mtime, function (ok, secs) {
            if (ok) { rec.status = 'pass'; rec.message = r.message; if (r.mark) row.marks.push(Object.assign({ node: n, ok: true }, r.mark.link ? { link: [n, r.mark.link[0]] } : { prefix: r.mark.prefix })); }
            else { rec.status = 'settling'; rec.message = 'BGP up for ' + secs + ' s: a "not there" check is judged after ' + needS + ' s'; }
            row.nodes.push(rec); eachNode();
          });
        }
        rec.status = r.pass ? 'pass' : 'fail'; rec.message = r.message;
        if (r.mark) row.marks.push(Object.assign({ node: n, ok: !!r.pass }, r.mark.link ? { link: [n, r.mark.link[0]] } : { prefix: r.mark.prefix }));
        row.nodes.push(rec); eachNode();
      });
    })();
    function endTest() {
      var st = row.nodes.map(function (x) { return x.status; });
      var judged = st.filter(function (s) { return s !== 'skip'; });
      if (!judged.length) row.status = 'skip';
      else if (judged.indexOf('fail') >= 0 || judged.indexOf('error') >= 0) row.status = row.level === 'warning' ? 'warning' : 'fail';
      else if (judged.indexOf('settling') >= 0) row.status = 'settling';   /* nx_validate_settle */
      else if (judged.indexOf('unsupported') >= 0) row.status = 'unsupported';
      else row.status = 'pass';
      var bad = row.nodes.filter(function (x) { return x.status === 'fail' || x.status === 'error'; })[0]
        || row.nodes.filter(function (x) { return x.status === 'settling'; })[0];   /* nx_validate_settle: say why it waits */
      row.message = bad ? bad.node + ': ' + bad.message : (row.nodes.filter(function (x) { return x.status === 'pass'; }).map(function (x) { return x.node + ': ' + x.message; })[0] || (row.nodes[0] || {}).message || '');
      row.text = row.status === 'pass' ? (t.pass || '') : (row.status === 'fail' || row.status === 'warning') ? (t.fail || '') : '';
      if (row.status === 'fail' && row.stop) stopped = true;
      next();
    }
  }
  function finish() {
    var c = { total: 0, pass: 0, fail: 0, warning: 0, pending: 0, settling: 0, unsupported: 0, skip: 0 };
    out.forEach(function (r) { if (r.status === 'error') r.status = 'fail'; c[r.status] = (c[r.status] || 0) + 1; if (r.status !== 'skip') c.total++; });
    c.checked = c.pass + c.fail + c.warning;
    var _lage = Math.floor((Date.now() - (lab.started || lab.mtime || 0)) / 1000);
    done({ format: 'netlab-validate/0', lab: lab.name, tests: out, counts: c, converging: _lage < CONVERGE_S, converge_s: CONVERGE_S });   /* nx_validate_converge (1) */
  }
  next();
}

module.exports = { setLiveStart: function (on) { LIVE_START = !!on; }, load: load, tiers: tiers, run: run, parseCall: parseCall, evalValue: evalValue, getPrefix: getPrefix, PLUGINS: PLUGINS };

if (require.main === module) {
  var f = process.argv[2];
  if (!f) { console.error('usage: node netlab-validate.js <network-xray.json> [container-prefix]'); process.exit(2); }
  var labx = load(f), pfx = process.argv[3] || ('clab-' + labx.name + '-');
  run(labx, pfx, function (res) {
    res.tests.forEach(function (r) { console.log('[' + r.status.toUpperCase() + '] ' + r.name + ' - ' + r.description + (r.message ? '\n    ' + r.message : '')); });
    var c = res.counts;
    console.log('== ' + c.pass + ' passed, ' + c.fail + ' failed, ' + c.pending + ' not run (stop_on_error), ' + (c.settling ? c.settling + ' waiting for routes, ' : '') + c.unsupported + ' not checked by network-xray, of ' + c.total);
    process.exitCode = c.fail ? 1 : 0;
  });
}
