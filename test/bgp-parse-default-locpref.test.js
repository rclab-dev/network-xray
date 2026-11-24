// bgp-parse-default-locpref.test.js — FRR leaves the LocPrf column blank when a path has no LOCAL_PREF
// (e.g. learned over eBGP). The router compares it with its default local preference, which the table
// header prints ("Default local pref N"). The paste parser must use that N, not a fixed 100,. Run: node --test
'use strict';
var test = require('node:test');
var assert = require('node:assert');
var fs = require('fs');
var path = require('path');
var vm = require('vm');

function load() {
  var ctx = { window: {}, console: console };
  vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'bgp-parse.js'), 'utf8'), ctx, { filename: 'bgp-parse.js' });
  return ctx.window.BGPFRR;
}

// `show bgp ipv4 unicast` from FRR with `bgp default local-preference 200`
var TABLE_200 = [
  'BGP table version is 2, local router ID is 2.2.2.2, vrf id 0',
  'Default local pref 200, local AS 65002',
  'Status codes:  s suppressed, d damped, h history, * valid, > best, = multipath,',
  '               i internal, r RIB-failure, S Stale, R Removed',
  'Nexthop codes: @NNN nexthop\'s vrf id, < announce-nh-self',
  'Origin codes:  i - IGP, e - EGP, ? - incomplete',
  'RPKI validation codes: V valid, I invalid, N Not found',
  '',
  '    Network          Next Hop            Metric LocPrf Weight Path',
  ' *> 1.1.1.1/32       192.0.2.10               0             0 65001 i',
  ' *> 2.2.2.0/24       0.0.0.0                  0         32768 i',
  '',
  'Displayed 2 routes and 2 total paths'].join('\n');

test('blank LocPrf = the default the table header prints (200), marked as the default', function () {
  var t = load().parseBgpTable(TABLE_200);
  assert.strictEqual(t.defaultLocalPref, 200);
  t.routes.forEach(function (r) {
    assert.strictEqual(r.local_pref, 200, r.prefix);
    assert.strictEqual(r.local_pref_default, true, r.prefix);
  });
});

test('a printed LocPrf is kept and not marked as the default', function () {
  var txt = TABLE_200.replace(' *> 1.1.1.1/32       192.0.2.10               0             0 65001 i',
                              ' *> 1.1.1.1/32       192.0.2.10               0     50      0 65001 i');
  var r = load().parseBgpTable(txt).routes[0];
  assert.strictEqual(r.local_pref, 50);
  assert.strictEqual(r.local_pref_default, undefined);
});

test('no header pasted: blank LocPrf falls back to 100 (the FRR default)', function () {
  var txt = TABLE_200.split('\n').slice(8).join('\n');
  var t = load().parseBgpTable(txt);
  assert.strictEqual(t.defaultLocalPref, null);
  assert.strictEqual(t.routes[0].local_pref, 100);
});

