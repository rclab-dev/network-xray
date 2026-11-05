#!/usr/bin/env node
/* hello-kf-selftest.js — the single-link Hello ball keyframes (_xrayBuildHelloKf in xray-core.js)
 * stay inside 0..100% and in order for short and long Hello intervals.
 *   usage: node scripts/hello-kf-selftest.js
 * Takes the real function out of xray-core.js and runs it against a stub document.
 */
var fs = require('fs'), path = require('path'), vm = require('vm');
var _cli = process.argv.slice(2);
if (_cli.indexOf('-h') >= 0 || _cli.indexOf('--help') >= 0) { console.log('usage: node scripts/hello-kf-selftest.js\n  check the single-link Hello ball keyframes in xray-core.js (no options)\n  -h, --help  show this help'); process.exit(0); }
var _bad = _cli[0];
if (_bad) { console.error('hello-kf-selftest.js: unknown option: ' + _bad + "\nTry 'node scripts/hello-kf-selftest.js --help'."); process.exit(2); }

var src = fs.readFileSync(path.join(__dirname, '..', 'xray-core.js'), 'utf8');
var travel = src.match(/^var _HELLO_TRAVEL_TIME = [^;]+;/m);
var fn = src.match(/^function _xrayBuildHelloKf\([\s\S]*?\n}\n/m);
if (!travel || !fn) { console.error('FAIL  _HELLO_TRAVEL_TIME / _xrayBuildHelloKf not found in xray-core.js'); process.exit(1); }

var styleEl = { textContent: '' };
var ctx = {
  document: {
    getElementById: function () { return styleEl; },
    createElement: function () { return styleEl; },
    head: { appendChild: function () {} }
  }
};
vm.createContext(ctx);
vm.runInContext(travel[0] + '\nvar _helloKfCache = {};\n' + fn[0], ctx);

var pass = 0, fail = 0;
function check(ok, msg) { console.log((ok ? 'PASS  ' : 'FAIL  ') + msg); if (ok) pass++; else fail++; }

[1, 2, 10].forEach(function (hello) {
  ['out', 'in', 'left-out', 'left-in', 'in-discard', 'left-in-discard'].forEach(function (dir) {
    styleEl.textContent = '';
    var name = ctx._xrayBuildHelloKf('t' + dir.replace(/-/g, ''), hello, dir);
    var rule = styleEl.textContent;
    var pcts = (rule.match(/[\d.]+%\{/g) || []).map(function (p) { return parseFloat(p); });
    var inRange = pcts.length === 5 && pcts.every(function (p) { return p >= 0 && p <= 100; });
    var ordered = pcts.every(function (p, i) { return i === 0 || p > pcts[i - 1]; });
    check(inRange && ordered, 'hello ' + hello + ' s, ' + dir + ': ' + name + ' keyframes ' + pcts.join('%, ') + '% within 0..100 and increasing');
  });
});

console.log('SUMMARY: ' + pass + '/' + (pass + fail) + ' PASS');
process.exit(fail ? 1 : 0);
