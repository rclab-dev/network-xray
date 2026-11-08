// bgp-parse-uptime.test.js — the BGP paste parser reads the Up/Down column in every form FRR prints
// (bgpd peer_uptime: hh:mm:ss under a day, then 1d02h03m, 02w3d04h, 01y02w3d), so a session up for
// more than a day is still read as Established. Run: node --test
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
function summary(upDown, state) {
  return ['BGP router identifier 192.0.2.1, local AS number 65001 vrf-id 0', '',
    'Neighbor        V         AS   MsgRcvd   MsgSent   TblVer  InQ OutQ  Up/Down State/PfxRcd   PfxSnt Desc',
    '198.51.100.2    4      65002      1500      1500        2    0    0 ' + upDown + '            ' + state + '        1 N/A',
    'Total number of neighbors 1'].join('\n');
}

['00:00:27', '1d02h03m', '6d23h59m', '02w3d04h', '51w6d23h', '01y02w3d', '3d04h', '1w2d'].forEach(function (up) {
  test('Up/Down ' + up + ': the session is read as Established with its prefix count', function () {
    var n = load().parseSummary(summary(up, '3')).neighbors;
    assert.strictEqual(n.length, 1);
    assert.strictEqual(n[0].established, true);
    assert.strictEqual(n[0].pfxRcvd, 3);
    assert.strictEqual(n[0].up, up);
  });
});

test('a session that is not up keeps its state word (Active, Idle, never)', function () {
  var B = load();
  var a = B.parseSummary(summary('never', 'Active')).neighbors[0];
  assert.strictEqual(a.established, false);
  assert.strictEqual(a.state, 'Active');
  var i = B.parseSummary(summary('1d02h03m', 'Idle')).neighbors[0];
  assert.strictEqual(i.established, false);
  assert.strictEqual(i.state, 'Idle');
});

test('no Up/Down column found: the state is unknown, not Established', function () {
  var text = ['BGP router identifier 192.0.2.1, local AS number 65001 vrf-id 0', '',
    '198.51.100.2    4      65002      1500      1500        2    0    0 5'].join('\n');
  var n = load().parseSummary(text).neighbors[0];
  assert.strictEqual(n.established, false);
  assert.strictEqual(n.state, 'unknown');
});
