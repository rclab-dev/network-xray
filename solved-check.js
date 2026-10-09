/* solved-check.js — evaluates problem.json `check` (format network-xray-lab/0) against window.LIVE_STATES.
 * No per-problem logic: the rules live in problem.json (see CHECK_FORMAT). Unknown op / broken
 * condition = not satisfied + one console warning; never throws. Solved is shown only after the
 * check passes on 2 consecutive evaluations (avoids flicker while the lab converges).
 */
(function (root) {
  var OPS = ['eq', 'ne', 'gt', 'ge', 'lt', 'le', 'in', 'exists', 'absent', 'some', 'none', 'count_ge'];
  var warned = {};
  function warn(msg) { if (warned[msg]) return; warned[msg] = 1; if (root.console) console.warn('[network-xray check] ' + msg); }

  function fill(path, st) {
    return String(path).replace(/\{([^}]+)\}/g, function (_, k) { var v = st && st[k]; return v == null ? '\u0000' : String(v); });
  }
  function get(obj, path) {
    if (path === '' || path == null) return obj;
    var parts = String(path).split('.'), cur = obj;
    for (var i = 0; i < parts.length; i++) {
      if (cur == null || typeof cur !== 'object' || parts[i].indexOf('\u0000') >= 0) return undefined;
      cur = cur[parts[i]];
    }
    return cur;
  }
  function isNum(x) { return typeof x === 'number' && isFinite(x); }
  function test(v, op, want, ctx) {
    switch (op) {
      case 'eq': return v === want;
      case 'ne': return v !== want;
      case 'gt': return isNum(v) && isNum(want) && v > want;
      case 'ge': return isNum(v) && isNum(want) && v >= want;
      case 'lt': return isNum(v) && isNum(want) && v < want;
      case 'le': return isNum(v) && isNum(want) && v <= want;
      case 'in': return Array.isArray(want) && want.indexOf(v) >= 0;
      case 'exists': return v !== undefined && v !== null;
      case 'absent': return v === undefined || v === null;
      case 'some': case 'none': case 'count_ge': {
        if (!Array.isArray(v)) return op === 'none' ? true : false;
        var conds = op === 'count_ge' ? (Array.isArray(want) ? want[1] : null) : want;
        if (!Array.isArray(conds)) { warn(ctx + ': ' + op + ' needs a list of conditions'); return false; }
        var n = 0;
        for (var i = 0; i < v.length; i++) if (allItem(v[i], conds, ctx)) n++;
        if (op === 'some') return n > 0;
        if (op === 'none') return n === 0;
        return isNum(want[0]) && n >= want[0];
      }
    }
    warn(ctx + ': unknown op "' + op + '"');
    return false;
  }
  function allItem(item, conds, ctx) {
    for (var i = 0; i < conds.length; i++) {
      var c = conds[i];
      if (!Array.isArray(c) || c.length < 2) { warn(ctx + ': broken item condition'); return false; }
      if (!test(get(item, fill(c[0], item)), c[1], c[2], ctx)) return false;
    }
    return true;
  }
  // -> {defined, ok, results:[bool…]}; defined=false when there is nothing to judge
  function evaluate(problem, states) {
    var chk = problem && problem.check;
    if (!chk || !Array.isArray(chk.all) || !chk.all.length) return { defined: false, ok: false, results: [] };
    if (problem.format && !/^network-xray-lab\/0$/.test(problem.format)) {
      warn('unsupported format ' + problem.format + ' — check not evaluated');
      return { defined: false, ok: false, results: [] };
    }
    var results = chk.all.map(function (c, i) {
      var ctx = 'check.all[' + i + ']';
      if (!Array.isArray(c) || c.length < 3) { warn(ctx + ': expected [node, path, op, value]'); return false; }
      if (OPS.indexOf(c[2]) < 0) { warn(ctx + ': unknown op "' + c[2] + '"'); return false; }
      var st = states && states[c[0]];
      if (!st) return false;   // node not collected (yet)
      return test(get(st, fill(c[1], st)), c[2], c[3], ctx);
    });
    return { defined: true, ok: results.every(Boolean), results: results };
  }
  // stateful wrapper: solved only after `need` consecutive passes
  function tracker(need) {
    need = need || 2; var streak = 0;
    return function (problem, states) {
      var r = evaluate(problem, states);
      streak = r.defined && r.ok ? streak + 1 : 0;
      r.solved = r.defined && streak >= need;
      return r;
    };
  }
  var api = { evaluate: evaluate, tracker: tracker, OPS: OPS };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.NetworkXrayCheck = api;
})(typeof window !== 'undefined' ? window : this);
