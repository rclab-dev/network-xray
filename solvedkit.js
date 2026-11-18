/* solvedkit.js — SolvedKit: judge a lab against its problem.json `check`, without the page.
 *
 *   var kit = require('./solvedkit.js');            // or window.SolvedKit in the page
 *   kit.run(problem, states)                          // is the lab solved now?
 *   kit.verify(problem, brokenStates, solvedStates)   // does the check tell the broken lab from the solved one?
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
    if (!c || !Array.isArray(c.all) || !c.all.length) return 'no check (problem.json has no check.all)';
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

  var api = { run: run, verify: verify, noCheck: noCheck };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.SolvedKit = api;
})(typeof window !== 'undefined' ? window : this);
