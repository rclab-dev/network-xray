// xray-plan.js — read a proposed fix (the config lines an AI or a person wants to type on one router) against the lab's
// state and say, for each line, what it is for. Read-only: it changes nothing and does not predict what the router will
// choose after the change.
//
// Each line gets one tag:
//   fixes        it touches something listed under What's wrong (the same interface / OSPF value / BGP neighbor / route)
//   requirement  it makes a route or an adjacency that a requirement asks for (a condition of a problem.json check that
//                is not met now), and is not about what is wrong now - e.g. a backup route
//   not_linked   it is linked to nothing this tool knows (what is wrong, the check, the route asked about). Not "unrelated":
//                it may be for a requirement written in words, which this tool does not read
//   ?            the line is not read, or what it does is not decided by the state (a policy whose match is not
//                evaluated, a value whose effect would need predicting the new choice)
// A requirement given in words is not interpreted: it is returned as it is, and not_linked lines point to it.
//
//   explainPlan(states, router, text, { problem, requirements, prefix }) -> { router, requirements, lines: [...], summary }
'use strict';
const query = require('./xray-query.js');
const PP = (function () { try { return require('../policy-parse.js'); } catch (e) { return null; } })();
const CHECK = require('../solved-check.js');

class PlanError extends Error {}

// administrative distances by protocol (the defaults FRR and IOS use; a configured distance is not in the state)
const AD = { connected: 0, local: 0, kernel: 0, static: 1, ebgp: 20, bgp: 20, ospf: 110, isis: 115, rip: 120, ibgp: 200 };
const OSPF_FIELD = { 'hello-interval': 'hello', 'dead-interval': 'dead', network: 'network_type', authentication: 'auth',
  'authentication-key': 'auth', 'message-digest-key': 'auth', area: 'area', 'mtu-ignore': 'mtu', mtu: 'mtu' };

function ip4(s) { return PP ? PP.ip4(s) : null; }
function inNet(ip, net, len) {
  const a = ip4(ip), n = ip4(net);
  if (a == null || n == null) return false;
  const mask = len === 0 ? 0 : len === 32 ? 0xffffffff : ((0xffffffff << (32 - len)) >>> 0);
  return ((a & mask) >>> 0) === ((n & mask) >>> 0);
}
function maskLen(m) { const a = ip4(m); if (a == null) return null; let n = 0, x = a; while (x & 0x80000000) { n++; x = (x << 1) >>> 0; } return n; }
function prefixOf(p, mask) {   // "10.11.0.0/24", "10.11.0.0 0.0.0.255" (wildcard) or "10.11.0.0 255.255.255.0"
  if (/\//.test(p)) { const m = /^([\d.]+)\/(\d+)$/.exec(p); return m ? { net: m[1], len: +m[2] } : null; }
  if (!mask) return null;
  const a = ip4(mask); if (a == null) return null;
  const len = (a & 0x80000000) ? maskLen(mask) : maskLen([3, 2, 1, 0].map((i) => 255 - ((a >>> (i * 8)) & 255)).join('.'));
  return len == null ? null : { net: p, len: len };
}
// the router's interface addresses: [{ iface, ip, len }]
function ifAddrs(st) {
  const out = [], ifs = st && st.interfaces && typeof st.interfaces === 'object' ? st.interfaces : {};
  Object.keys(ifs).forEach((i) => {
    const x = ifs[i] || {}, ips = Array.isArray(x.ips) ? x.ips : (x.ip ? [x.ip] : []);
    ips.forEach((a) => { const m = /^([\d.]+)(?:\/(\d+))?$/.exec(String(a)); if (m) out.push({ iface: i, ip: m[1], len: m[2] != null ? +m[2] : 32 }); });
  });
  return out;
}

// the plan text -> items { n, line, context: {type, ...} | null, kind, ... }
function parsePlan(text) {
  const items = [];
  let ctx = null;
  String(text || '').split(/\r?\n/).forEach((raw, i) => {
    const line = raw.trim();
    if (!line || line === '!' || /^(configure terminal|conf t|write( memory)?|wr|do .*)$/i.test(line)) return;
    let m;
    const it = { n: i + 1, line: line };
    if (/^(end|exit)$/.test(line)) { ctx = null; return; }
    if (line === 'exit-address-family') return;
    if ((m = /^interface (\S+)$/.exec(line))) { ctx = { type: 'if', iface: m[1] }; it.header = ctx; items.push(it); return; }
    if ((m = /^router ospf(?: \d+)?$/.exec(line))) { ctx = { type: 'ospf' }; it.header = ctx; items.push(it); return; }
    if ((m = /^router bgp (\S+)$/.exec(line))) { ctx = { type: 'bgp', as: m[1] }; it.header = ctx; items.push(it); return; }
    if ((m = /^route-map (\S+) (permit|deny) (\d+)$/.exec(line))) { ctx = { type: 'rm', name: m[1], action: m[2], seq: +m[3] }; it.header = ctx; items.push(it); return; }
    if (/^(ip prefix-list|ip route|ipv6 )/.test(line)) ctx = null;   // top-level lines end a block
    it.context = ctx;
    items.push(it);
  });
  return items;
}

// the conditions of a problem.json check that are not met now: [{ i, cond }]
function unmetConditions(problem, states) {
  if (!problem || !problem.check || !Array.isArray(problem.check.all)) return [];
  const r = CHECK.evaluate(problem, states);
  return problem.check.all.map((c, i) => ({ i: i, cond: c, ok: r.results[i] })).filter((x) => !x.ok);
}
function condItems(cond) { return Array.isArray(cond[3]) ? cond[3] : []; }
function condWants(cond, key) { const c = condItems(cond).filter((x) => x[0] === key && x[1] === 'eq')[0]; return c ? c[2] : undefined; }

function explainPlan(states, router, text, opts) {
  opts = opts || {};
  const st = states[router];
  if (!st) throw new PlanError('unknown router: ' + router + ' (known: ' + Object.keys(states).sort().join(', ') + ')');
  const wrong = query.summarize(states).wrong || [];
  const unmet = unmetConditions(opts.problem, states).filter((u) => u.cond[0] === router);
  const items = parsePlan(text);
  const addrs = ifAddrs(st);
  const focus = opts.prefix || (opts.problem && opts.problem.focus && opts.problem.focus.node === router && opts.problem.focus.prefix) ||
    (st.route_resolution && st.route_resolution.matched_prefix) || '';
  // route-map bindings: from the plan, then from the running-config the collector read
  const plan = PP ? PP.parse(items.map((x) => x.line)) : { bgp: null, route_maps: {}, prefix_lists: {} };
  const pc = st.policy_config || {};
  const binds = {};   // route-map name -> [{ ip, dir }]
  [pc.bgp, plan.bgp].forEach((b) => {
    if (!b || !b.neighbors) return;
    Object.keys(b.neighbors).forEach((ip) => { const rm = b.neighbors[ip].route_map || {}; ['in', 'out'].forEach((d) => { if (rm[d]) (binds[rm[d]] = binds[rm[d]] || []).push({ ip: ip, dir: d }); }); });
  });
  /* per name, per seq, as FRR applies the lines: a prefix-list line replaces the entry with its seq; a route-map entry line
     edits the entry with its seq (its match lines stay, the plan's are added); other seqs of the running-config stay;
     "no route-map X permit N" / "no ip prefix-list X seq N ..." remove that entry (and "no route-map X" / "no ip prefix-list X" the whole) */
  const routeMaps = {}, prefixLists = {};
  Object.keys(pc.route_maps || {}).forEach((k) => { routeMaps[k] = pc.route_maps[k].map((e) => ({ seq: e.seq, action: e.action, matches: e.matches.slice(), other: e.other.slice() })); });
  Object.keys(pc.prefix_lists || {}).forEach((k) => { prefixLists[k] = pc.prefix_lists[k].slice(); });
  Object.keys(plan.route_maps || {}).forEach((k) => {
    const list = routeMaps[k] = routeMaps[k] || [];
    plan.route_maps[k].forEach((e) => {
      const old = list.filter((x) => x.seq === e.seq)[0];
      if (old) { old.action = e.action; old.matches = old.matches.concat(e.matches); old.other = old.other.concat(e.other); }
      else list.push({ seq: e.seq, action: e.action, matches: e.matches.slice(), other: e.other.slice() });
    });
  });
  Object.keys(plan.prefix_lists || {}).forEach((k) => {
    const list = prefixLists[k] = (prefixLists[k] || []).slice();
    plan.prefix_lists[k].forEach((e) => { const i = list.findIndex((x) => x.seq === e.seq); if (i >= 0) list[i] = e; else list.push(e); });
    list.sort((a, b) => a.seq - b.seq);
  });
  items.forEach((it) => {
    let m;
    if ((m = /^no route-map (\S+)(?: (?:permit|deny) (\d+))?$/.exec(it.line))) {
      if (m[2] == null) delete routeMaps[m[1]]; else if (routeMaps[m[1]]) routeMaps[m[1]] = routeMaps[m[1]].filter((x) => x.seq !== +m[2]);
    } else if ((m = /^no ip prefix-list (\S+)(?: seq (\d+).*)?$/.exec(it.line))) {
      if (m[2] == null) delete prefixLists[m[1]]; else if (prefixLists[m[1]]) prefixLists[m[1]] = prefixLists[m[1]].filter((x) => x.seq !== +m[2]);
    }
  });

  // what is wrong on one interface of this router (or on the far end, about this router)
  function wrongOnIface(iface) {
    return wrong.map((w, i) => ({ w, i })).filter(({ w }) => (w.node === router && w.iface === iface) ||
      (w.peer === router && (w.peer_iface === iface || !w.peer_iface)));
  }
  function ifacesIn(net, len) { return addrs.filter((a) => inNet(a.ip, net, len)).map((a) => a.iface); }
  function result(tag, because, ref, touches) { const o = { tag: tag, because: because }; if (ref) o.ref = ref; if (touches && touches.length) o.touches = touches; return o; }
  function linkIface(iface, field, what) {
    const ws = wrongOnIface(iface).filter(({ w }) => !field || !Array.isArray(w.mismatch) || w.mismatch.indexOf(field) >= 0);
    if (ws.length) {   // it fixes what is wrong there; the unmet conditions about the same interface are tied to it too
      const ref = { wrong: ws.map((x) => x.i) };
      const cs = unmet.filter((x) => condWants(x.cond, 'iface') === iface || condWants(x.cond, 'out_iface') === iface).map((x) => x.i);
      if (cs.length) ref.check = cs;
      return result('fixes', ws[0].w.text, ref, [iface]);
    }
    const u = unmet.filter((x) => (x.cond[1] === 'ospf_neighbors' && condWants(x.cond, 'iface') === iface) || (x.cond[1] === 'interfaces.' + iface));
    if (u.length) return result('requirement', 'the check asks for ' + JSON.stringify(u[0].cond.slice(1)) + ' on ' + router + ' (not met now)', { check: u.map((x) => x.i) }, [iface]);
    return result('not_linked', what + ': nothing is wrong on ' + router + ' ' + iface + ' and the check asks nothing there', null, [iface]);
  }

  function classify(it) {
    const l = it.line, c = it.context;
    let m;
    // OSPF: network <net> <wildcard|/len> area <a>  (and its "no" form)
    if (c && c.type === 'ospf' && (m = /^(no )?network (\S+)(?: (\S+))? area (\S+)$/.exec(l))) {
      const p = prefixOf(m[2], m[3]);
      if (!p) return result('?', 'the network is not read: ' + m[2]);
      const ifs = ifacesIn(p.net, p.len);
      if (!ifs.length) return result('not_linked', 'no interface of ' + router + ' is in ' + p.net + '/' + p.len);
      const rs = ifs.map((i) => linkIface(i, null, (m[1] ? 'takes OSPF off ' : 'puts OSPF on ') + i + ' (area ' + m[4] + ')'));
      return rs.filter((r) => r.tag === 'fixes')[0] || rs.filter((r) => r.tag === 'requirement')[0] || rs[0];
    }
    if (c && c.type === 'ospf' && /^(no )?passive-interface (\S+)$/.test(l)) { const i = l.split(' ').pop(); return linkIface(i, 'passive', 'passive-interface ' + i); }
    if (c && c.type === 'ospf' && (m = /^(?:ospf )?router-id (\S+)$/.exec(l))) {
      const ws = wrong.map((w, i) => ({ w, i })).filter(({ w }) => w.router_id && Array.isArray(w.nodes) && w.nodes.indexOf(router) >= 0);
      if (ws.length) return result('fixes', ws[0].w.text, { wrong: ws.map((x) => x.i) });
      return result('not_linked', 'sets the OSPF router ID to ' + m[1] + ' (no duplicate router ID is listed as wrong)');
    }
    if (c && c.type === 'ospf') return result('?', 'an OSPF line this tool does not read');
    // interface lines
    if (c && c.type === 'if') {
      if ((m = /^(no )?ip ospf (\S+)/.exec(l))) {
        if (m[2] === 'cost') return result('?', 'changes which OSPF path is chosen; what it picks after the change is not worked out here', null, [c.iface]);
        return linkIface(c.iface, OSPF_FIELD[m[2]] || null, 'ip ospf ' + m[2] + ' on ' + c.iface);
      }
      if (/^(no )?shutdown$/.test(l)) {
        const ws = wrongOnIface(c.iface).filter(({ w }) => w.protocol === 'interface');
        if (ws.length && /^no /.test(l)) return result('fixes', ws[0].w.text, { wrong: ws.map((x) => x.i) }, [c.iface]);
        return linkIface(c.iface, null, l + ' on ' + c.iface);
      }
      if (/^(no )?(ip address|ip mtu|mtu)\b/.test(l)) return linkIface(c.iface, /mtu/.test(l) ? 'mtu' : null, l + ' on ' + c.iface);
      return result('?', 'an interface line this tool does not read', null, [c.iface]);
    }
    // static route: ip route <p>[/len | mask] <next hop> [distance]
    if ((m = /^(no )?ip route (\S+)(?: ((?:\d+\.){3}\d+))? ((?:\d+\.){3}\d+)(?: (\d+))?$/.exec(l))) {
      const p = prefixOf(m[2], /\//.test(m[2]) ? null : m[3]);
      const nh = /\//.test(m[2]) ? (m[3] || m[4]) : m[4];
      const dist = /\//.test(m[2]) ? (m[3] ? +m[4] || null : (m[5] ? +m[5] : null)) : (m[5] ? +m[5] : null);
      if (!p) return result('?', 'the prefix is not read: ' + m[2]);
      const pfx = p.net + '/' + p.len;
      const out = addrs.filter((a) => a.len < 32 && inNet(nh, a.ip, a.len))[0];
      if (!out) return result('?', 'next hop ' + nh + ' is not on a connected subnet of ' + router + ' (a recursive next hop is not worked out here)');
      const now = (st.routing_table || []).filter((r) => r.prefix === pfx && r.selected)[0];
      const d = dist != null ? dist : 1, nowAd = now ? AD[String(now.protocol || '').toLowerCase()] : null;
      const backup = now && nowAd != null && d > nowAd;
      const how = 'makes ' + pfx + ' via ' + out.iface + ' (' + nh + ' is on ' + out.iface + '\'s subnet)' +
        (backup ? '; distance ' + d + ' > ' + now.protocol + ' ' + nowAd + ' (default) = used only when the ' + now.protocol + ' route is gone' : '');
      const ws = wrong.map((w, i) => ({ w, i })).filter(({ w }) => w.node === router && w.prefix === pfx);
      if (ws.length && !m[1]) return result('fixes', ws[0].w.text + ' — this line ' + how, { wrong: ws.map((x) => x.i) }, [out.iface]);
      const u = unmet.filter((x) => x.cond[1] === 'routing_table' && condWants(x.cond, 'prefix') === pfx &&
        (condWants(x.cond, 'out_iface') == null || condWants(x.cond, 'out_iface') === out.iface));
      if (u.length && !m[1]) return result('requirement', how + ' — the check asks for ' + pfx + ' via ' + (condWants(u[0].cond, 'out_iface') || 'any interface') + ' (not met now)', { check: u.map((x) => x.i) }, [out.iface]);
      return result('not_linked', how, null, [out.iface]);
    }
    // BGP neighbor lines
    if (c && c.type === 'bgp' && (m = /^(no )?neighbor (\S+) (.+)$/.exec(l))) {
      const ip = m[2], rest = m[3];
      const ws = wrong.map((w, i) => ({ w, i })).filter(({ w }) => w.node === router && w.protocol === 'bgp' && w.peer_ip === ip);
      if (/^route-map (\S+) (in|out)$/.test(rest)) {
        const rm = /^route-map (\S+) (in|out)$/.exec(rest);
        return result('?', 'applies route-map ' + rm[1] + ' to routes ' + (rm[2] === 'in' ? 'from ' : 'to ') + ip + ' (see that route-map\'s lines)');
      }
      if (ws.length) return result('fixes', ws[0].w.text, { wrong: ws.map((x) => x.i) });
      return result('not_linked', 'neighbor ' + ip + ': its session is not listed as wrong');
    }
    if (c && c.type === 'bgp') return result('?', 'a BGP line this tool does not read');
    // route-map entry: show the values it sets next to the comparison now (no prediction)
    if (c && c.type === 'rm') {
      const set = /^set (local-preference|weight|metric) (\d+)$/.exec(l);
      if (/^match /.test(l)) return result('?', 'which routes this entry takes (see the route-map\'s verdict on the set line)');
      if (!set) return result('?', 'a route-map line this tool does not read');
      const field = { 'local-preference': 'local_pref', weight: 'weight', metric: 'metric' }[set[1]];
      const label = { 'local-preference': 'LocPrf', weight: 'Weight', metric: 'MED' }[set[1]];
      const bs = (binds[c.name] || []).filter((b) => b.dir === 'in');
      if (!bs.length) return result('?', 'sets ' + label + ' ' + set[2] + '; route-map ' + c.name + ' is not applied to a neighbor (in) in the plan or the running-config');
      const parts = [];
      let verdict = '';
      if (focus && PP) {
        const ev = PP.rmEval(routeMaps, prefixLists, c.name, focus);
        verdict = ev.verdict === '?' ? ' (whether it takes ' + focus + ': ' + ev.why + ')' : ev.seq === c.seq && ev.verdict === 'permit' ? '' : ' (this entry does not take ' + focus + ': ' + ev.why + ')';
      }
      bs.forEach((b) => {
        const rows = (st.bgp_routes || []).filter((r) => r.next_hop === b.ip && (!focus || (r.prefix + (r.prefixlen != null && !/\//.test(r.prefix) ? '/' + r.prefixlen : '')) === focus));
        const now = rows.length ? rows[0][field] : undefined;
        parts.push('routes from ' + b.ip + (focus ? ' for ' + focus : '') + ': ' + label + ' now ' + (now == null ? '(not set)' : now));
      });
      let cmp = '';
      if (focus) { try { const w = query.whyPath(states, router, focus); const win = (w.steps || []).filter((s) => s.result === 'win')[0]; if (win) cmp = '; the comparison now: ' + win.step + ' ' + win.selected + ' > ' + win.other + ' (best via ' + (w.selected && w.selected.next_hop) + ')'; } catch (e) { /* no BGP answer for it */ } }
      return result('?', 'sets ' + label + ' ' + set[2] + ' — ' + parts.join('; ') + cmp + verdict + '. Which path wins after the change is not worked out here.');
    }
    if (/^ip prefix-list /.test(l)) return result('?', 'a prefix-list (see where it is used)');
    return result('?', 'a line this tool does not read');
  }

  const lines = items.map((it) => {
    if (it.header) return { n: it.n, line: it.line, header: true };
    const r = classify(it);
    return Object.assign({ n: it.n, line: it.line }, it.context ? { context: it.context.type === 'if' ? 'interface ' + it.context.iface : it.context.type === 'rm' ? 'route-map ' + it.context.name + ' ' + it.context.action + ' ' + it.context.seq : it.context.type === 'bgp' ? 'router bgp' : 'router ospf' } : {}, r);
  });
  // a block header takes the strongest tag of its lines
  const RANK = { fixes: 4, requirement: 3, '?': 2, not_linked: 1 };
  lines.forEach((x, i) => {
    if (!x.header) return;
    let best = null;
    for (let j = i + 1; j < lines.length && !lines[j].header; j++) if (!best || RANK[lines[j].tag] > RANK[best]) best = lines[j].tag;
    x.tag = best || 'not_linked'; x.because = best ? 'the block of the lines under it' : 'an empty block';
  });
  const body = lines.filter((x) => !x.header);
  const count = (t) => body.filter((x) => x.tag === t).length;
  const said = [['fixes', 'fixes what is wrong now', 'fix what is wrong now'], ['requirement', 'is for a requirement', 'are for a requirement'],
    ['not_linked', 'has no link found to what is wrong or to the check', 'have no link found to what is wrong or to the check'], ['?', 'is not worked out (?)', 'are not worked out (?)']]
    .filter(([t]) => count(t)).map(([t, one, many]) => count(t) + ' ' + (count(t) === 1 ? one : many));
  const out = { router: router };
  if (focus) out.prefix = focus;
  out.requirements = { check: opts.problem && opts.problem.check ? (opts.problem.check.all || []).length : 0, unmet_here: unmet.length };
  if (opts.requirements) out.requirements.text = String(opts.requirements);
  /* checks[]: every condition of the check, whether the state meets it now, and the lines of this plan tied to it */
  if (opts.problem && opts.problem.check && Array.isArray(opts.problem.check.all)) {
    const ev = CHECK.evaluate(opts.problem, states);
    out.checks = opts.problem.check.all.map((c, i) => ({ i: i, condition: c, met_now: !!ev.results[i],
      lines: body.filter((x) => x.ref && Array.isArray(x.ref.check) && x.ref.check.indexOf(i) >= 0).map((x) => x.n) }));
  }
  out.lines = lines;
  out.summary = body.length + ' line' + (body.length === 1 ? '' : 's') + ': ' + said.join(', ');
  if (count('not_linked') && opts.requirements) out.note = 'no link found is not a warning: the tool found nothing it knows (what is wrong, the check) that the line touches. Such a line may be for the requirement given in words, which this tool does not read: check it against that';
  else if (count('not_linked')) out.note = 'no link found is not a warning: the tool found nothing it knows (what is wrong, the check) that the line touches. Such a line may be for a requirement in words (e.g. keep a backup), which this tool does not read';
  return out;
}

const USAGE = 'usage: xray-plan.js <state.json|dir> <router> <lines.txt|-> [--problem <problem.json|dir>] [--requirements <text>] [--prefix <p>] [--format json|table]';
const OPTIONS = ['--problem', '--requirements', '--prefix', '--format'];   // each takes a value: --name value
// a check condition in one line: r1 routing_table some prefix=3.3.3.3/32 out_iface=eth1
function condText(c) {
  if (!Array.isArray(c)) return String(c);
  const items = Array.isArray(c[3]) ? c[3].map((x) => Array.isArray(x) ? x[0] + (x[1] === 'eq' ? '=' : ' ' + x[1] + ' ') + JSON.stringify(x[2]).replace(/^"|"$/g, '') : String(x)).join(' ') : JSON.stringify(c[3]);
  return [c[0], c[1], c[2], items].join(' ');
}
const MARK = { fixes: 'FIX', requirement: 'REQ', not_linked: ' - ', '?': ' ? ' };
function table(r) {
  const out = ['Plan for ' + r.router + (r.prefix ? ' (' + r.prefix + ')' : '') + ': ' + r.summary];
  if (r.requirements.text) out.push('  requirements (as given, not read): ' + r.requirements.text);
  (r.checks || []).forEach((c) => out.push('  check ' + (c.met_now ? 'met now    ' : 'NOT met now') + '  ' + condText(c.condition) +
    (c.lines.length ? '   <- line ' + c.lines.join(', ') : '')));
  r.lines.forEach((x) => out.push((x.header ? '' : '  ') + (x.header ? '      ' : '[' + MARK[x.tag] + '] ') + x.line + (x.header ? '' : '\n          ' + x.because)));
  if (r.note) out.push('', 'note: ' + r.note);
  return out.join('\n') + '\n';
}
if (require.main === module) {
  const fs = require('fs');
  const argv = process.argv.slice(2);
  if (argv.indexOf('-h') >= 0 || argv.indexOf('--help') >= 0) { console.log(USAGE); process.exit(0); }
  try {
    const o = { args: [] };
    for (let i = 0; i < argv.length; i++) {
      const a = argv[i];
      if (OPTIONS.indexOf(a) >= 0) { const v = argv[++i]; if (v == null || v === '') throw new PlanError(a + ' needs a value'); o[a.slice(2)] = v; }
      else if (/^--/.test(a)) throw new PlanError('unknown option: ' + a + '\n' + USAGE);
      else o.args.push(a);
    }
    if (o.args.length !== 3) throw new PlanError(USAGE);
    if (o.format && o.format !== 'json' && o.format !== 'table') throw new PlanError('--format must be json or table');
    const text = o.args[2] === '-' ? fs.readFileSync(0, 'utf8') : fs.readFileSync(o.args[2], 'utf8');
    const r = explainPlan(query.loadStates(o.args[0]), o.args[1], text,
      { problem: o.problem ? query.loadProblem(o.problem) : null, requirements: o.requirements, prefix: o.prefix });
    process.stdout.write(o.format === 'table' ? table(r) : JSON.stringify(r, null, 2) + '\n');
  } catch (e) {
    if (e instanceof PlanError || (e && e.constructor && e.constructor.name === 'QueryError') || (e && e.code === 'ENOENT')) { console.error('xray-plan: ' + e.message); process.exit(2); }
    throw e;
  }
}

module.exports = { explainPlan, parsePlan, PlanError, table, condText };
