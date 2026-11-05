// iosxe-vrf.test.js — an IOS-XE lab with VRFs says so (the collector reads only the global table).
// Run: node --test        (from the repo root; Node >= 18, no dependencies)
//
// Real captures from Cisco IOL 17.18.02 (test/fixtures/iosxe-vrf/README.md). `show ip interface brief` and
// `show ip route` do not show that an interface is in a VRF, so `show vrf` is read: every VRF a user made is named
// in one warning; containerlab's management VRF (clab-mgmt) is not counted.
'use strict';
var test = require('node:test');
var assert = require('node:assert');
var fs = require('fs');
var path = require('path');
var ios = require('../clab-iosxe-collect.js');

var FIX = path.join(__dirname, 'fixtures', 'iosxe-vrf');
function read(f) { return fs.readFileSync(path.join(FIX, f), 'utf8'); }
function vrfWarnings(texts) { return ios.parseWarnings(texts, {}, []).filter(function (w) { return w.why === 'vrf'; }); }

test('show vrf: one user VRF, the management VRF left out', function () {
  assert.deepStrictEqual(ios.parseVrfs(read('r1_one_vrf_show_vrf.txt')), ['BLUE']);
});

test('show vrf: a VRF with two interfaces (continued line) and an empty VRF', function () {
  assert.deepStrictEqual(ios.parseVrfs(read('r1_two_vrfs_show_vrf.txt')), ['BLUE', 'RED']);
});

test('show vrf: only clab-mgmt -> no VRF', function () {
  assert.deepStrictEqual(ios.parseVrfs(read('r2_mgmt_only_show_vrf.txt')), []);
  assert.deepStrictEqual(ios.parseVrfs(''), []);
  assert.deepStrictEqual(ios.parseVrfs('% Invalid input detected at \'^\' marker.'), []);
});

test('the real lab: the old clues miss the VRF, show vrf finds it (one warning with the names)', function () {
  var texts = { ipInterface: read('r1_one_vrf_show_ip_interface_brief.txt'), route: read('r1_one_vrf_show_ip_route.txt') };
  assert.deepStrictEqual(vrfWarnings(texts), [], 'without show vrf the VRF is not seen (why show vrf is read)');
  texts.vrf = read('r1_two_vrfs_show_vrf.txt');
  var w = vrfWarnings(texts);
  assert.strictEqual(w.length, 1);
  assert.deepStrictEqual(w[0].vrfs, ['BLUE', 'RED']);
  assert.match(w[0].note, /not read yet: BLUE, RED$/);
});

test('show vrf is optional: an IOS without it is not a CLI error', function () {
  var w = ios.parseWarnings({ ipInterface: read('r1_one_vrf_show_ip_interface_brief.txt'), vrf: '% Invalid input detected at \'^\' marker.' }, {}, []);
  assert.ok(!w.some(function (x) { return x.cmd === 'show vrf'; }), JSON.stringify(w));
});

test('show vrf is in the command list (read-only)', function () {
  assert.ok(ios.CMDS.some(function (c) { return c[0] === 'vrf' && c[1] === 'show vrf'; }));
});
