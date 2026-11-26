/* solvedkit.js — SolvedKit: judge a lab against its problem.json `check`, without the page.
 *
 *   var kit = require('./solvedkit.js');            // or window.SolvedKit in the page
 *   kit.run(problem, states)                          // is the lab solved now?
 *   kit.verify(problem, brokenStates, solvedStates)   // does the check tell the broken lab from the solved one?
 *   kit.suggest(brokenStates, solvedStates, opts)     // candidate conditions from what the fix changed
 *   kit.init(brokenStates, solvedStates, opts)        // a problem.json draft with the suggested check
 *
 * problem: the parsed problem.json (format network-xray-lab/0). states: { <node>: <state>, ... }, as the collectors
 * write them (xray-states.js / state_<node>.json). The rules are solved-check.js's: the same answer as the page's
 * ✓ Solved band, for one collected state (the page also waits for the check to hold about 10 seconds; a script that
 * wants that can call run() again). Runs in Node and in the page (no fs). Nothing is sent anywhere.
 */
(function (root) {
  'use strict';
  var chk = typeof module !== 'undefined' && module.exports ? require('./solved-check.js') : root.NetworkXrayCheck;

  // a node the condition cannot be judged on: not collected, or collected but not readable (nx_unread)
  function unreadNode(states, node) {
    var st = states && Object.prototype.hasOwnProperty.call(states, node) ? states[node] : null;
    if (!st || typeof st !== 'object') return 'not in the state';
    if (st.success === false || st.nx_unread) return 'not readable' + (st.nx_unread && typeof st.nx_unread === 'string' ? ' (' + st.nx_unread + ')' : '');
    return '';
  }

  // why the problem has nothing to judge, or '' when it has
  function noCheck(problem) {
    if (!problem || typeof problem !== 'object' || Array.isArray(problem)) return 'not a problem.json object';
    if (problem.format != null && problem.format !== 'network-xray-lab/0') return 'unsupported format ' + JSON.stringify(problem.format) + ' (network-xray-lab/0 only)';
    var c = problem.check;
    if (!c || !Array.isArray(c.all) || !c.all.length) return 'no check (problem.json has no check.all) - make one from a broken and a fixed state: check init <broken> <solved> --out problem.json';
    return '';
  }

  // one condition on one set of states -> { ok: true|false|null, unread }  (null = cannot be judged)
  function judgeOne(cond, states) {
    if (!Array.isArray(cond) || cond.length < 3 || typeof cond[0] !== 'string') return { ok: false, broken: 'expected [node, path, op, value]' };
    var why = unreadNode(states, cond[0]);
    if (why) return { ok: null, unread: cond[0] + ': ' + why };
    var one = { format: 'network-xray-lab/0', check: { all: [cond] } };
    return { ok: chk.evaluate(one, states).results[0] === true };
  }

  // -> { status: 'solved' | 'not_solved' | 'cannot_judge', solved, results: [{cond, ok, unread?}], reason? }
  function run(problem, states) {
    var why = noCheck(problem);
    if (why) return { status: 'cannot_judge', solved: false, results: [], reason: why };
    var results = problem.check.all.map(function (c) {
      var j = judgeOne(c, states), r = { cond: c, ok: j.ok };
      if (j.unread) r.unread = j.unread;
      if (j.broken) r.broken = j.broken;
      return r;
    });
    var unread = results.filter(function (r) { return r.ok === null; });
    // one condition that clearly fails is enough for "not solved"; otherwise an unreadable node leaves it open
    var failed = results.some(function (r) { return r.ok === false; });
    var status = failed ? 'not_solved' : unread.length ? 'cannot_judge' : 'solved';
    var out = { status: status, solved: status === 'solved', results: results };
    if (status === 'cannot_judge') out.reason = 'cannot read ' + unread.map(function (r) { return r.unread; }).join('; ');
    return out;
  }

  // -> { status: 'ok' | 'not_ok' | 'cannot_judge', ok, broken: run(), solved: run(), conditions: [...], problems: [...] }
  // ok = the check fails on the broken lab and holds on the solved lab. Per condition:
  //   tells   = fails on broken, holds on solved (this condition alone tells them apart)
  //   both    = holds on both (fine as a companion, e.g. "the backup path is still there")
  //   wrong   = fails on solved (the solved lab would never get the mark)
  //   unknown = a node cannot be read in one of the two
  function verify(problem, broken, solved) {
    var b = run(problem, broken), s = run(problem, solved);
    var out = { broken: b, solved: s, conditions: [], problems: [] };
    var why = noCheck(problem);
    if (why) { out.status = 'cannot_judge'; out.ok = false; out.problems.push(why); return out; }
    out.conditions = problem.check.all.map(function (c, i) {
      var ob = b.results[i].ok, os = s.results[i].ok, v;
      if (ob === null || os === null) v = 'unknown';
      else if (os === false) v = 'wrong';
      else if (ob === false) v = 'tells';
      else v = 'both';
      var r = { cond: c, broken: ob, solved: os, verdict: v };
      if (b.results[i].unread || s.results[i].unread) r.unread = b.results[i].unread || s.results[i].unread;
      return r;
    });
    if (s.status === 'cannot_judge' || b.status === 'cannot_judge') {
      out.status = 'cannot_judge';
      out.problems.push((s.status === 'cannot_judge' ? 'solved lab: ' + s.reason : 'broken lab: ' + b.reason));
    } else {
      if (!s.solved) out.problems.push('the check does not hold on the solved lab (' + out.conditions.filter(function (c) { return c.verdict === 'wrong'; }).length + ' condition(s) fail there)');
      if (b.solved) out.problems.push('the check already holds on the broken lab (no condition tells them apart)');
      out.status = out.problems.length ? 'not_ok' : 'ok';
    }
    out.ok = out.status === 'ok';
    return out;
  }

  /* ---- suggest: candidate conditions from what the fix changed -------------------------------------------------
     The changes come from xray-diff.js (the same list as state_diff: uptimes, counters and the management network are
     already left out). Each change the check can see becomes a condition written from the SOLVED state, the way
     docs/problem-format.md asks: where the traffic goes (a selected route and its interface, a BGP best path) first,
     then one piece of evidence that the fault is gone (an adjacency Full, a session Established, an interface up).
     Every candidate is judged on both states; one that does not hold on the solved state is dropped, and the check
     it proposes must fail on the broken state. Nothing is guessed about other ways to solve the problem: a condition
     that names how the route was learned (protocol) is marked binds_method so the author can decide. */
  var diffApi = typeof module !== 'undefined' && module.exports ? require('./xray-diff.js') : root.xrayDiff;
  var KIND_ORDER = { path: 0, evidence: 1, backup: 2, keep: 3, gone: 4 };

  function arrOf(x) { return Array.isArray(x) ? x : []; }
  function s(x) { return x == null ? '' : String(x).trim(); }
  function isFull(x) { return x && (x.full === true || /^full/i.test(s(x.state))); }
  function isEst(x) { return x && /^established$/i.test(s(x.state)); }
  function withVrf(conds, row) { if (row && s(row.vrf) && s(row.vrf) !== 'default') conds.push(['vrf', 'eq', row.vrf]); return conds; }
  function plainPrefix(item) { return s(item).replace(/^\[vrf [^\]]*\]\s*/, ''); }
  function itemVrf(item) { var m = /^\[vrf ([^\]]*)\]/.exec(s(item)); return m ? m[1] : ''; }

  // the selected rows of a node for one prefix (the diff's route key: "[vrf X] prefix" or "prefix")
  function selectedRows(st, item) {
    var p = plainPrefix(item), v = itemVrf(item);
    return arrOf(st && st.routing_table).filter(function (r) {
      return r && r.selected !== false && s(r.prefix) === p && s(r.vrf) === v;
    });
  }
  function bgpRows(st, item) {
    var p = plainPrefix(item), v = itemVrf(item), len = null, m = /^(.*)\/(\d+)$/.exec(p);
    if (m) { p = m[1]; len = +m[2]; }
    return arrOf(st && st.bgp_routes).filter(function (r) {
      if (!r || s(r.vrf) !== v) return false;
      var rp = s(r.prefix), rl = r.prefixlen != null ? +r.prefixlen : null, mm = /^(.*)\/(\d+)$/.exec(rp);
      if (mm) { rp = mm[1]; rl = +mm[2]; }
      return rp === p && (len == null || rl == null || rl === len);
    });
  }
  function isBest(r) { return r && (r.best === true || /^\*\s*>/.test(s(r.status))); }
  function bgpPrefixConds(r) {
    var c = [['prefix', 'eq', r.prefix]];
    if (r.prefixlen != null) c.push(['prefixlen', 'eq', r.prefixlen]);
    return c;
  }

  // one change -> zero or more candidates { cond, kind, from, binds_method?, note? } ; skipped -> { from, why }
  function fromChange(c, broken, solved, out, skipped) {
    var n = c.node, B = broken[n] || {}, A = solved[n] || {}, from = c.kind + ' ' + n + ' ' + c.item;
    // pfx: the prefix with its length, so a routing-table row and a BGP row of the same destination can be paired
    var push = function (cond, kind, extra) { out.push(Object.assign({ cond: cond, kind: kind, from: from, pfx: plainPrefix(c.item) }, extra || {})); };
    switch (c.kind) {
      case 'route_added': case 'route_changed': {
        var rows = selectedRows(A, c.item);
        if (!rows.length) return skipped.push({ from: from, why: 'no selected row for it in the solved state' });
        var r = rows[0], old = selectedRows(B, c.item)[0], conds = [['prefix', 'eq', r.prefix], ['selected', 'eq', true]];
        if (s(r.out_iface)) conds.push(['out_iface', 'eq', r.out_iface]);
        // the next hop when the interface alone does not tell the fix (same interface, another next hop: a wrong
        // next hop inside the connected subnet), or when there is no interface to name
        if (s(r.next_hop) && (!s(r.out_iface) || (old && s(old.out_iface) === s(r.out_iface)))) conds.push(['next_hop', 'eq', r.next_hop]);
        withVrf(conds, r);
        push([n, 'routing_table', 'some', conds], 'path');
        // how the route is learned changed (static -> ospf): offered as a separate candidate, not in the check by default -
        // it would fail a correct fix that reaches the same route another way. Add it only if the problem asks for it.
        if (old && s(old.protocol) && s(old.protocol) !== s(r.protocol)) {
          push([n, 'routing_table', 'some', conds.concat([['protocol', 'eq', r.protocol]])], 'path',
            { binds_method: true, note: 'names how the route is learned (' + s(old.protocol) + ' -> ' + s(r.protocol) + '); add it only if the problem asks for that' });
        }
        return;
      }
      case 'route_removed': {
        var gone = selectedRows(B, c.item)[0];
        if (!gone) return skipped.push({ from: from, why: 'no selected row for it in the broken state' });
        return push([n, 'routing_table', 'none', withVrf([['prefix', 'eq', gone.prefix], ['selected', 'eq', true]], gone)], 'gone',
          { note: 'the route must be gone - keep it only if the problem is about removing it' });
      }
      case 'best_path_changed': {
        var bs = bgpRows(A, c.item), best = bs.filter(isBest)[0];
        if (!best) return skipped.push({ from: from, why: 'no best path for it in the solved state' });
        var bc = bgpPrefixConds(best).concat([['best', 'eq', true]]);
        if (s(best.as_path)) bc.push(['as_path', 'eq', best.as_path]); else if (s(best.next_hop)) bc.push(['next_hop', 'eq', best.next_hop]);
        push([n, 'bgp_routes', 'some', withVrf(bc, best)], 'path');
        // the path that was best before is still there as a backup: say so, so that deleting it does not count
        var oldBest = bgpRows(B, c.item).filter(isBest)[0];
        if (oldBest && (s(oldBest.as_path) || s(oldBest.next_hop))) {
          var key = s(oldBest.as_path) ? ['as_path', s(oldBest.as_path)] : ['next_hop', s(oldBest.next_hop)];
          var still = bs.some(function (r) { return !isBest(r) && s(r[key[0]]) === key[1]; });
          if (still) push([n, 'bgp_routes', 'some', withVrf(bgpPrefixConds(best).concat([[key[0], 'eq', key[1]]]), best)], 'backup',
            { note: 'the old best path is still there as a backup (so removing it does not count as the fix)' });
        }
        return;
      }
      case 'ospf_adjacency_up': case 'ospf_adjacency_new': {
        // the change's item is "<iface> → <router id or address>": compare that last word as a whole (1.1.1.1 is not 1.1.1.10)
        var who = s(c.item).split('→').pop().trim();
        var nb = arrOf(A.ospf_neighbors).filter(function (x) { return x && isFull(x) && (s(x.router_id) === who || s(x.address) === who); })[0];
        if (!nb) return skipped.push({ from: from, why: 'the neighbor is not Full in the solved state' });
        var nc = s(nb.router_id) ? [['router_id', 'eq', nb.router_id]] : [['address', 'eq', nb.address]];
        nc.push(nb.full === true ? ['full', 'eq', true] : ['state', 'eq', nb.state]);
        return push([n, 'ospf_neighbors', 'some', nc], 'evidence');
      }
      case 'bgp_session_up': case 'bgp_peer_added': {
        var ip = s(c.item).replace(/\s*\(vrf [^)]*\)$/, '');
        var pr = arrOf(A.bgp_neighbors).filter(function (x) { return x && s(x.ip) === ip && isEst(x); })[0];
        if (!pr) return skipped.push({ from: from, why: 'the session is not Established in the solved state' });
        return push([n, 'bgp_neighbors', 'some', withVrf([['ip', 'eq', pr.ip], ['state', 'eq', pr.state]], pr)], 'evidence');
      }
      case 'iface_up': case 'iface_added': {
        var ifc = A.interfaces && A.interfaces[c.item];
        if (!ifc || c.after === 'down') return skipped.push({ from: from, why: 'the interface is not up in the solved state' });
        if (/[.{}]/.test(c.item)) return skipped.push({ from: from, why: 'the interface name cannot be written as a path (' + c.item + ')' });
        return push([n, 'interfaces.' + c.item + '.up', 'eq', true], 'evidence');
      }
      case 'ospf_if_value': case 'ospf_if_joined': case 'iface_address':
        return skipped.push({ from: from, why: 'a configured value: the check looks at what it brings (an adjacency, a route), not at the value' });
      default:
        return skipped.push({ from: from, why: 'the fix made this worse or it is not something a check should require' });
    }
  }

  // route_resolution is not in the diff: a target the node could not reach before and can now
  function fromResolution(broken, solved, out) {
    Object.keys(solved).sort().forEach(function (n) {
      var a = solved[n] && solved[n].route_resolution, b = broken[n] && broken[n].route_resolution;
      if (a && a.resolved === true && (!b || b.resolved !== true))
        out.push({ cond: [n, 'route_resolution.resolved', 'eq', true], kind: 'evidence', from: 'route_resolution ' + n + ' ' + s(a.target),
          note: 'resolved only means a route to the next hop exists - keep it next to a condition on the route itself' });
    });
  }

  /* nx_for_change: for a change (a planned piece of work rehearsed on a lab) rather than a puzzle, what the change must
     leave alone matters as much as what it changes: every OSPF adjacency Full and every BGP session Established in both
     states stays so. Only asked for with forChange. */
  function keepConds(broken, solved, out, focusPrefix) {
    Object.keys(solved).sort().forEach(function (n) {
      var A = solved[n] || {}, B = broken[n] || {};
      arrOf(A.ospf_neighbors).forEach(function (x) {
        if (!isFull(x) || !s(x.router_id)) return;
        if (!arrOf(B.ospf_neighbors).some(function (y) { return isFull(y) && s(y.router_id) === s(x.router_id); })) return;
        out.push({ cond: [n, 'ospf_neighbors', 'some', [['router_id', 'eq', x.router_id], x.full === true ? ['full', 'eq', true] : ['state', 'eq', x.state]]],
          kind: 'keep', from: 'unchanged ' + n + ' ospf ' + x.router_id, note: 'stays Full through the change' });
      });
      arrOf(A.bgp_neighbors).forEach(function (x) {
        if (!isEst(x) || !s(x.ip)) return;
        if (!arrOf(B.bgp_neighbors).some(function (y) { return isEst(y) && s(y.ip) === s(x.ip) && s(y.vrf) === s(x.vrf); })) return;
        out.push({ cond: [n, 'bgp_neighbors', 'some', withVrf([['ip', 'eq', x.ip], ['state', 'eq', x.state]], x)],
          kind: 'keep', from: 'unchanged ' + n + ' bgp ' + x.ip, note: 'stays Established through the change' });
      });
      /* nx_keep_routes: the BGP paths the change must leave alone - each path (best or not) that is there before and
         after, the same way (best stays best); a path is told by its AS path, else its next hop */
      var pathKey = function (r) { return s(r.as_path) ? ['as_path', s(r.as_path)] : (s(r.next_hop) ? ['next_hop', s(r.next_hop)] : null); };
      arrOf(A.bgp_routes).forEach(function (r) {
        var key = r && pathKey(r);
        if (!key) return;
        var before = arrOf(B.bgp_routes).filter(function (y) { return y && s(y.prefix) === s(r.prefix) && s(y.vrf) === s(r.vrf) && s(y[key[0]]) === key[1]; })[0];
        if (!before || isBest(before) !== isBest(r)) return;
        var c = bgpPrefixConds(r).concat(isBest(r) ? [['best', 'eq', true]] : []).concat([[key[0], 'eq', key[1]]]);
        out.push({ cond: [n, 'bgp_routes', 'some', withVrf(c, r)], kind: 'keep', from: 'unchanged ' + n + ' bgp path ' + s(r.prefix) + ' ' + key[1],
          note: isBest(r) ? 'stays the best path through the change' : 'stays there as a backup through the change' });
      });
      // the destination named with --prefix: its selected route stays where it was
      if (focusPrefix) selectedRows(A, focusPrefix).forEach(function (r) {
        var b = selectedRows(B, focusPrefix).filter(function (y) { return s(y.out_iface) === s(r.out_iface) && s(y.next_hop) === s(r.next_hop); })[0];
        if (!b) return;
        var c = [['prefix', 'eq', r.prefix], ['selected', 'eq', true]];
        if (s(r.out_iface)) c.push(['out_iface', 'eq', r.out_iface]); else if (s(r.next_hop)) c.push(['next_hop', 'eq', r.next_hop]);
        out.push({ cond: [n, 'routing_table', 'some', withVrf(c, r)], kind: 'keep', from: 'unchanged ' + n + ' route ' + s(r.prefix), note: 'stays where it was through the change' });
      });
    });
  }

  // -> { status: 'ok' | 'none', check, candidates, skipped, reason?, verify? }
  function suggest(broken, solved, opts) {
    opts = opts || {};
    broken = broken && typeof broken === 'object' ? broken : {};
    solved = solved && typeof solved === 'object' ? solved : {};
    var max = opts.max > 0 ? Math.floor(opts.max) : 3, focus = opts.focus || {};
    var unread = Object.keys(solved).filter(function (n) { return unreadNode(solved, n); });
    var d = diffApi.diffStates(broken, solved, { mgmtSubnet: opts.mgmtSubnet });
    var cands = [], skipped = [];
    d.changes.forEach(function (c) { fromChange(c, broken, solved, cands, skipped); });
    fromResolution(broken, solved, cands);
    if (opts.forChange) keepConds(broken, solved, cands, s((opts.focus || {}).prefix));
    // judge every candidate on both states; keep one condition per (node, path, value) only once
    var seen = Object.create(null);
    cands = cands.filter(function (c) {
      var k = JSON.stringify(c.cond); if (seen[k]) return false; seen[k] = 1;
      c.holds_solved = judgeOne(c.cond, solved).ok === true;
      c.holds_broken = judgeOne(c.cond, broken).ok === true;
      c.tells = c.holds_solved && !c.holds_broken;
      if (c.kind === 'keep') c.tells = false;   // holds on both by construction: kept, not telling
      if (!c.holds_solved) skipped.push({ from: c.from, why: 'the candidate does not hold on the solved state' });
      return c.holds_solved;
    });
    // order: focus node first, then path / evidence / backup / gone, then the focus prefix, then the diff's order
    var fpfx = s(focus.prefix);
    cands.forEach(function (c, i) {
      var onFocus = focus.node && c.cond[0] === focus.node ? 0 : 1;
      var pfx = fpfx && JSON.stringify(c.cond).indexOf(JSON.stringify(fpfx)) >= 0 ? 0 : 1;
      c._k = [onFocus, KIND_ORDER[c.kind], c.tells ? 0 : 1, pfx, i];
    });
    cands.sort(function (x, y) { for (var i = 0; i < 5; i++) if (x._k[i] !== y._k[i]) return x._k[i] - y._k[i]; return 0; });
    cands.forEach(function (c) { delete c._k; });

    var out = { candidates: cands, skipped: skipped };
    if (unread.length) out.unread = unread.map(function (n) { return n + ': ' + unreadNode(solved, n); });
    var telling = cands.filter(function (c) { return c.tells; });
    if (!telling.length) {
      out.status = unread.length ? 'cannot_judge' : 'none'; out.check = null;
      out.reason = d.none ? 'no difference between the two states (the fix changed nothing the collector reads)'
        : 'no condition the check can use tells the broken state from the solved one' +
          (unread.length ? ' (cannot read ' + unread.join(', ') + ')' : '') + ' - see skipped';
      return out;
    }
    // the check: the first path, the first evidence, the backup of a chosen BGP best path - at most max of them (a puzzle
    // needs the fewest conditions that tell the fix; more would also fail other correct fixes). For a change (forChange):
    // every changed path that tells (there and back, each router) and every keep, so nothing the change touches is left out.
    var pick = [];
    if (opts.forChange) {
      pick = cands.filter(function (c) { return (c.kind === 'path' && c.tells && !c.binds_method) || c.kind === 'keep'; });
      if (!pick.some(function (c) { return c.tells; })) pick = pick.concat(telling.slice(0, 1));
      if (opts.max > 0) pick = pick.slice(0, Math.floor(opts.max));
    } else {
    var firstOf = function (kind, node) {
      var l = cands.filter(function (c) { return c.kind === kind && c.tells && !c.binds_method; });
      return (node && l.filter(function (c) { return c.cond[0] === node; })[0]) || l[0];
    };
    var path0 = firstOf('path');
    // the evidence on the same router as the path when there is one (the fault and its effect read together)
    [path0, firstOf('evidence', path0 && path0.cond[0])].forEach(function (c) { if (c && pick.indexOf(c) < 0) pick.push(c); });
    if (!pick.length) pick.push(telling.filter(function (c) { return !c.binds_method; })[0] || telling[0]);
    pick.slice().forEach(function (p) {
      if (p.kind !== 'path') return;
      var bk = cands.filter(function (c) { return c.kind === 'backup' && c.cond[0] === p.cond[0] && c.pfx === p.pfx; })[0];
      if (bk && pick.length < max) pick.push(bk);
    });
    pick = pick.slice(0, max);
    }
    cands.forEach(function (c) { c.in_check = pick.indexOf(c) >= 0; });
    out.check = { all: pick.map(function (c) { return c.cond; }) };
    out.verify = verify({ format: 'network-xray-lab/0', check: out.check }, broken, solved);
    out.focus = { node: pick[0].cond[0] };
    if (/^\d+\.\d+\.\d+\.\d+\/\d+$/.test(s(pick[0].pfx))) out.focus.prefix = pick[0].pfx;
    out.status = out.verify.ok ? 'ok' : 'none';
    if (!out.verify.ok) { out.reason = 'the proposed check did not verify: ' + out.verify.problems.join('; '); out.check = null; }
    else if (pick.every(function (c) { return c.kind === 'gone'; }))
      out.warnings = ['the check only says that a route is gone: keep it only if the problem is about removing that route'];
    else if (pick.some(function (c) { return c.binds_method; }))
      out.warnings = ['the check names how a route is learned: a fix that reaches the same route another way would not count'];
    return out;
  }

  /* ---- init: a problem.json draft --------------------------------------------------------------------------------
     The suggested check (verified on both states) plus the fields a person writes: the title and the problem text in
     both languages are left empty, focus is the router / destination of the first condition (or the one given). */
  function init(broken, solved, opts) {
    opts = opts || {};
    var sg = suggest(broken, solved, opts);
    if (sg.status !== 'ok') return { status: sg.status, reason: sg.reason, suggest: sg };
    var focus = opts.focus && opts.focus.node ? { node: opts.focus.node } : { node: sg.focus.node };
    if (opts.focus && opts.focus.prefix) focus.prefix = opts.focus.prefix; else if (!(opts.focus && opts.focus.node) && sg.focus.prefix) focus.prefix = sg.focus.prefix;
    var notes = sg.candidates.filter(function (c) { return c.in_check && c.note; }).map(function (c) { return c.note; });
    var problem = {
      format: 'network-xray-lab/0', id: s(opts.id),
      title_en: '', title_ja: '', problem_en: '', problem_ja: '',
      solved_text_en: '', solved_text_ja: '',   /* nx_solved_text: shown under the problem once it is solved (optional) */
      focus: focus,
      check: sg.check,
      check_note_en: '', check_note_ja: ''
    };
    return { status: 'ok', problem: problem, todo: ['title_en / title_ja', 'problem_en / problem_ja', 'id (e.g. "yourname/yourrepo/lab-1")']
      .concat(notes.map(function (n) { return 'check: ' + n; })), suggest: sg };
  }

  /* ---- toProcedure: the check as steps a person runs on the routers ---------------------------------------------
     nx_to_procedure: each condition becomes the show command to type on that router and what its output must show,
     for a work procedure (the change was rehearsed on a lab; the people doing the work check the same things on the
     real routers). FRR (vtysh) and Cisco IOS / IOS XE. A condition it has no command for is listed as it is. Nothing
     is run here. */
  var PROC_TEXT = {
    en: { head: 'Checks', router: 'Router', cmd: 'Command', expect: 'The output shows',
      selected: 'the selected route', via: 'via', out: 'out of', learned: 'learned by', none: 'no selected route for',
      full: 'is Full', state: 'state', est: 'is Established (its State/PfxRcd column shows a number)', best: 'the best path', aspath: 'AS path', nh: 'next hop',
      up: 'is up', hand: 'check by hand', sep: ', ', note: 'Each line holds when the lab is in the state the check describes.' },
    ja: { head: '確かめ', router: 'ルータ', cmd: 'コマンド', expect: '出力に出ること',
      selected: '選ばれた経路', via: '次の hop', out: '出口', learned: '学び方', none: '選ばれた経路が無いこと:',
      full: 'が Full', state: '状態', est: 'が Established (State/PfxRcd の欄が数)', best: 'best path', aspath: 'AS path', nh: '次の hop',
      up: 'が up', hand: '手で確かめる', sep: '・', note: '各行は、ラボが check の言う状態の時に成り立ちます。' }
  };
  function maskOf(len) { var m = [], b = +len; for (var i = 0; i < 4; i++) { var n = Math.max(0, Math.min(8, b - 8 * i)); m.push(256 - Math.pow(2, 8 - n)); } return m.join('.'); }
  function routeArg(prefix, vendor) {
    var m = /^(\d+\.\d+\.\d+\.\d+)\/(\d+)$/.exec(s(prefix));
    if (!m) return s(prefix);
    return vendor === 'ios' ? m[1] + ' ' + maskOf(m[2]) : m[1] + '/' + m[2];
  }
  function field(conds, k) { var c = arrOf(conds).filter(function (x) { return x && x[0] === k && x[1] === 'eq'; })[0]; return c ? c[2] : undefined; }
  function toProcedure(problem, opts) {
    opts = opts || {};
    var why = noCheck(problem);
    if (why) return { status: 'cannot_judge', reason: why, steps: [] };
    var vendor = opts.vendor === 'ios' ? 'ios' : 'frr', T = PROC_TEXT[opts.lang === 'ja' ? 'ja' : 'en'];
    var steps = problem.check.all.map(function (c) {
      var node = s(c && c[0]), p = s(c && c[1]), q = c && c[2], conds = c && c[3], vrf = field(conds, 'vrf'), v = vrf ? 'vrf ' + vrf + ' ' : '';
      var step = { node: node, cond: c };
      if (p === 'routing_table' && (q === 'some' || q === 'none')) {
        var pfx = field(conds, 'prefix');
        step.command = 'show ip route ' + v + routeArg(pfx, vendor);
        if (q === 'none') step.expect = T.none + ' ' + pfx;
        else {
          var e = [T.selected + ' ' + pfx], oi = field(conds, 'out_iface'), nh = field(conds, 'next_hop'), pr = field(conds, 'protocol');
          if (nh) e.push(T.via + ' ' + nh); if (oi) e.push(T.out + ' ' + oi); if (pr) e.push(T.learned + ' ' + pr);
          step.expect = e.join(T.sep);
        }
      } else if (p === 'ospf_neighbors' && q === 'some') {
        var id = field(conds, 'router_id') || field(conds, 'address'), st = field(conds, 'state');
        step.command = 'show ip ospf neighbor';
        step.expect = id + ' ' + (field(conds, 'full') === true ? T.full : T.state + ' ' + st);
      } else if (p === 'bgp_neighbors' && q === 'some') {
        step.command = vendor === 'ios' ? 'show ip bgp ' + v + 'summary' : 'show bgp ' + v + 'summary';
        step.expect = field(conds, 'ip') + ' ' + (/^established$/i.test(s(field(conds, 'state'))) ? T.est : T.state + ' ' + field(conds, 'state'));
      } else if (p === 'bgp_routes' && q === 'some') {
        var bp = field(conds, 'prefix'), bl = field(conds, 'prefixlen'), full = bl != null && !/\//.test(s(bp)) ? bp + '/' + bl : bp;
        step.command = (vendor === 'ios' ? 'show ip bgp ' + v : 'show bgp ' + v + 'ipv4 unicast ') + routeArg(full, vendor);
        var be = [field(conds, 'best') === true ? T.best + ' ' + full : full];
        if (field(conds, 'as_path') != null) be.push(T.aspath + ' ' + field(conds, 'as_path'));
        if (field(conds, 'next_hop') != null) be.push(T.nh + ' ' + field(conds, 'next_hop'));
        step.expect = be.join(T.sep);
      } else if (/^interfaces\.[^.]+\.up$/.test(p) && q === 'eq' && conds === true) {
        var ifn = p.split('.')[1];
        step.command = vendor === 'ios' ? 'show interfaces ' + ifn : 'show interface ' + ifn;
        step.expect = ifn + ' ' + T.up;
      } else {
        step.command = ''; step.expect = T.hand + ': ' + JSON.stringify(c);
      }
      return step;
    });
    var md = ['## ' + T.head + (s(problem['title_' + (opts.lang === 'ja' ? 'ja' : 'en')]) ? ': ' + s(problem['title_' + (opts.lang === 'ja' ? 'ja' : 'en')]) : ''), '',
      '| # | ' + T.router + ' | ' + T.cmd + ' | ' + T.expect + ' |', '|---|---|---|---|']
      .concat(steps.map(function (x, i) { return '| ' + (i + 1) + ' | ' + x.node + ' | ' + (x.command ? '`' + x.command + '`' : '') + ' | ' + x.expect.replace(/\|/g, '\\|') + ' |'; }))
      .concat(['', T.note]).join('\n') + '\n';
    return { status: 'ok', vendor: vendor, lang: opts.lang === 'ja' ? 'ja' : 'en', steps: steps, markdown: md };
  }

  var api = { run: run, verify: verify, suggest: suggest, init: init, toProcedure: toProcedure, noCheck: noCheck };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.SolvedKit = api;
})(typeof window !== 'undefined' ? window : this);
