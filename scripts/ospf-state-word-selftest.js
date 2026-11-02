#!/usr/bin/env node
/* ospf-state-word-selftest.js — an OSPF neighbor state read from IOS-XE (EXSTART/DR ...) gets the same colour as the FRR word (ExStart/DR).
 *   usage: node scripts/ospf-state-word-selftest.js
 * 1) clab-iosxe-collect.js parseOspfNeighbors: every IOS state x role -> the FRR spelling.
 * 2) xray-core.js _xrayOspfBucket: FRR words and IOS / odd spellings -> the same colour bucket.
 * 3) xray-core.js _xrayDeLinkInfo: a BGP + OSPF link whose OSPF state was saved as "Exstart/DR" -> coexist + the exchange bucket (not "none").
 */
var fs = require('fs'), path = require('path'), vm = require('vm');
var ios = require(path.join(__dirname, '..', 'clab-iosxe-collect.js'));

var pass = 0, fail = 0;
function check(ok, msg) { console.log((ok ? 'PASS  ' : 'FAIL  ') + msg); if (ok) pass++; else fail++; }

/* 1) parser */
var WORD = { DOWN: 'Down', ATTEMPT: 'Attempt', INIT: 'Init', '2WAY': '2-Way', EXSTART: 'ExStart', EXCHANGE: 'Exchange', LOADING: 'Loading', FULL: 'Full' };
var ROLE = { DR: 'DR', BDR: 'Backup', DROTHER: 'DROther', '-': '-' };
Object.keys(WORD).forEach(function (st) {
  var got = Object.keys(ROLE).map(function (r) {
    var line = '2.2.2.2           1   ' + st + '/' + (r === '-' ? '  -' : r) + '      00:00:38    10.10.0.20      Ethernet0/1';
    var o = ios.parseOspfNeighbors(line, []);
    return o.list.length === 1 ? o.list[0].state : '(unread)';
  });
  var want = Object.keys(ROLE).map(function (r) { return WORD[st] + '/' + ROLE[r]; });
  check(got.join(' ') === want.join(' '), 'IOS ' + st + ' -> ' + got.join(' '));
});

/* 2), 3) xray-core.js */
var src = fs.readFileSync(path.join(__dirname, '..', 'xray-core.js'), 'utf8');
var ctx = {
  document: { documentElement: { getAttribute: function () { return 'en'; } }, getElementById: function () { return null; }, querySelector: function () { return null; },
    querySelectorAll: function () { return []; }, createElement: function () { return { style: {}, setAttribute: function () {}, appendChild: function () {}, classList: { add: function () {} } }; },
    head: { appendChild: function () {} }, body: { appendChild: function () {} }, addEventListener: function () {}, readyState: 'complete' },
  console: console, addEventListener: function () {}, location: { search: '', hash: '', href: '' }, navigator: { userAgent: '' },
  setTimeout: function () {}, clearTimeout: function () {}, setInterval: function () {}, requestAnimationFrame: function () {},
  matchMedia: function () { return { matches: false, addListener: function () {} }; }, localStorage: { getItem: function () { return null; }, setItem: function () {} }
};
ctx.window = ctx;
vm.createContext(ctx);
vm.runInContext(src, ctx, { filename: 'xray-core.js' });

var BUCKET = [
  ['Full/DR', 'full'], ['FULL/BDR', 'full'], ['full', 'full'],
  ['ExStart/DR', 'exchange'], ['Exstart/DR', 'exchange'], ['EXSTART/DROTHER', 'exchange'], ['Exchange/Backup', 'exchange'], ['EXCHANGE/DR', 'exchange'], ['LOADING/-', 'exchange'],
  ['2-Way/DROther', '2way'], ['2WAY/DROTHER', '2way'], ['2-WAY', '2way'],
  ['Init/-', 'init'], ['INIT/DROTHER', 'init'], ['ATTEMPT/DR', 'init'],
  ['Down/-', 'none'], ['DOWN', 'none'], ['None', 'none'], ['', 'none'], ['Idle', 'none']
];
BUCKET.forEach(function (c) { var b = ctx._xrayOspfBucket(c[0]); check(b === c[1], '_xrayOspfBucket("' + c[0] + '") = ' + b); });

[['ExStart/DR', 'FRR word'], ['Exstart/DR', 'IOS state saved before the parser fix'], ['EXSTART/DR', 'IOS raw']].forEach(function (c) {
  var s = { bgp_configured: true, r1_iface: 'Ethernet0/1', r1_ospf_state: c[0], r1_ospf_full: false, r1_neighbor_state: 'Idle', r1_has_full: false,
    interfaces: { 'Ethernet0/1': { up: true, ip: '10.10.0.20/24' } }, iface_hellos: { 'Ethernet0/1': 10 } };
  var link = ctx._xrayDeLinkInfo(s, 'r1', 'Ethernet0/1', false);
  var b = ctx._xrayOspfBucket(link.nbrState || '');
  check(link.proto === 'coexist' && b === 'exchange', 'DeepDive BGP + OSPF link, OSPF ' + c[0] + ' (' + c[1] + ') -> proto ' + link.proto + ', class de-coexist-' + b);
});

console.log('SUMMARY: ' + pass + '/' + (pass + fail) + ' PASS');
process.exit(fail ? 1 : 0);
