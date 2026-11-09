// paste-parsers-iol.test.js — what the FRR paste pages do with real IOS-XE (Cisco IOL 17.18.02) output:
// the BGP table and summary read the same (a wrapped long prefix, MED 1000000); the OSPF neighbor layout differs, so it
// parses to no neighbors (the page then shows "could not build a topology" instead of a wrong picture).
// Run: node --test        (from the repo root; Node >= 18, no dependencies)
'use strict';
var test = require('node:test');
var assert = require('node:assert');
var fs = require('fs');
var path = require('path');
var vm = require('vm');

var ROOT = path.join(__dirname, '..');
var FX = path.join(__dirname, 'fixtures', 'frr10-paste');
var ctx = { window: {}, console: { log: function () {} } };
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(path.join(ROOT, 'bgp-parse.js'), 'utf8'), ctx);
vm.runInContext(fs.readFileSync(path.join(ROOT, 'frr-parse.js'), 'utf8'), ctx);
var BGP = ctx.window.BGPFRR, FRR = ctx.window.FRR;
function plain(x) { return JSON.parse(JSON.stringify(x)); }   // values made inside the vm: compare as plain data
function fx(n) { return fs.readFileSync(path.join(FX, 'iol17_' + n + '.txt'), 'utf8'); }

test('IOS-XE show ip bgp: every row, including the wrapped /25', function () {
  var rs = plain(BGP.parseBgpTable(fx('r1_ip_bgp')).routes).map(function (r) { return [r.prefix, r.nexthop, r.best, r.metric, r.weight, r.as_path]; });
  assert.deepStrictEqual(rs, [
    ['8.8.8.0/24', '10.12.0.2', true, 1000000, 0, '65002'],
    ['10.1.0.0/24', '10.12.0.2', false, 1000000, 0, '65002'],
    ['10.1.0.0/24', '0.0.0.0', true, 0, 32768, ''],
    ['192.168.100.128/25', '10.12.0.2', true, 1000000, 0, '65002']
  ]);
  var n = plain(BGP.parseSummary(fx('r1_bgp_summary')).neighbors);
  assert.deepStrictEqual(n.map(function (x) { return [x.ip, x.state, x.pfxRcvd]; }), [['10.12.0.2', 'Established', 3]]);
});

test('IOS-XE show ip ospf neighbor: no neighbors read (the page says it could not parse, no wrong picture)', function () {
  assert.strictEqual(FRR.parseNeighbors(fx('r1_ospf_nei')).length, 0);
  assert.strictEqual(FRR.build('', fx('r1_ospf_nei'), 'r1').config.nodes.length, 1);
});
