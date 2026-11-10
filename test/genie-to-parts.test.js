'use strict';
var test = require('node:test');
var assert = require('node:assert/strict');
var fs = require('fs');
var path = require('path');
var ios = require('../clab-iosxe-collect.js');
var genieToParts = require('../genie-to-xray.js').genieToParts;
var buildState = require('../clab-collect.js').buildState;

// ONE exception table: field | why. Every other field is compared deeply.
// parts p.ospfIf.*.auth; det.*.auth; state ospf_ifaces.*.auth | No authentication key in q5 (both routers).
// r2 parts det.{Loopback0,Ethernet0/1}.{up,ip,prefix,area,net_type,cost,auth,role,priority,hello,dead,nbrs,nbrsAdj}
//   | Entire detail command is empty; det must be null (only fields actually printed exist in text).
// r2 parts p.ospfIf.*.{helloKnown,dead,netType,priority,passiveKnown}
//   | Empty detail command; text has details, Genie has no evidence.
// r2 parts p.ospfIf.Ethernet0/1.hello | Text says 5; brief-only parts retain the IOS reader's default 10.
// r2 state ospf_ifaces.Ethernet0/1.{hello,dead,network_type,priority,passive}
//   | Empty detail command; final state must show null rather than invented facts.
// r2 state interfaces.*.{ospf_area,ospf_hello,ospf_dead,ospf_net_type}
//   | These annotations come exclusively from det, which is null.
var DETAIL_FIELDS = ['helloKnown', 'dead', 'netType', 'priority', 'passiveKnown'];
function capture(node) {
  var dir = path.join(__dirname, 'fixtures/genie-iosxe/q5', node), texts = {}, json = {};
  ios.CMDS.forEach(function (c) {
    var command = c[1].replace(/ /g, '_'), t = path.join(dir, command + '.txt'), j = path.join(dir, 'genie_' + command + '.json');
    if (fs.existsSync(t)) texts[c[0]] = fs.readFileSync(t, 'utf8');
    if (fs.existsSync(j)) { var s = fs.readFileSync(j, 'utf8'); json[command] = s.trim() ? JSON.parse(s) : null; }
  });
  return { texts: texts, json: json, args: { node: node, adjacency: [{ iface: 'Ethernet0/1', peer: node === 'r1' ? 'r2' : 'r1' }] } };
}
function clone(o) { return JSON.parse(JSON.stringify(o)); }
function partsComparable(parts, node) {
  var out = clone(parts);
  Object.keys(out.p.ospfIf).forEach(function (name) {
    delete out.p.ospfIf[name].auth;
    if (node === 'r2') DETAIL_FIELDS.forEach(function (k) { delete out.p.ospfIf[name][k]; });
  });
  if (node === 'r2') { out.det = null; delete out.p.ospfIf['Ethernet0/1'].hello; }
  else Object.keys(out.det || {}).forEach(function (name) { delete out.det[name].auth; });
  return out;
}
function stateComparable(state, node) {
  var out = {};
  ['ospf_neighbors', 'ospf_ifaces', 'interfaces', 'routing_table'].forEach(function (k) { out[k] = clone(state[k]); });
  Object.keys(out.ospf_ifaces).forEach(function (name) {
    delete out.ospf_ifaces[name].auth;
    if (node === 'r2') ['hello', 'dead', 'network_type', 'priority', 'passive'].forEach(function (k) { delete out.ospf_ifaces[name][k]; });
  });
  if (node === 'r2') Object.keys(out.interfaces).forEach(function (name) {
    ['ospf_area', 'ospf_hello', 'ospf_dead', 'ospf_net_type'].forEach(function (k) { delete out.interfaces[name][k]; });
  });
  return out;
}
module.exports = { capture: capture, stateComparable: stateComparable };
if (require.main === module) {
['r1', 'r2'].forEach(function (node) {
  test(node + ': real JSON and text parts match except the documented missing facts', function () {
    var c = capture(node), text = ios.iosxeTextToParts(c.texts), got = genieToParts(c.json, c.args);
    assert.deepStrictEqual(partsComparable(got, node), partsComparable(text, node));
    if (node === 'r1') { assert.equal(got.p.ospfIf['Ethernet0/1'].auth, null); assert.equal(got.det['Ethernet0/1'].auth, null); }
    else { assert.equal(got.det, null); assert.deepStrictEqual(got.p.routes, []); }
  });
  test(node + ': iosxePartsToState preserves all available main state fields', function () {
    var c = capture(node), text = ios.iosxePartsToState(ios.iosxeTextToParts(c.texts), c.args, buildState);
    var got = ios.iosxePartsToState(genieToParts(c.json, c.args), c.args, buildState);
    assert.deepStrictEqual(stateComparable(got, node), stateComparable(text, node));
    assert.equal(got.ospf_ifaces['Ethernet0/1'].auth, null);
    if (node === 'r2') ['hello', 'dead', 'network_type', 'priority', 'passive'].forEach(function (k) { assert.equal(got.ospf_ifaces['Ethernet0/1'][k], null, k); });
  });
});
test('missing, null and empty commands give empty parts, without borrowing args text', function () {
  var expected = ios.iosxeTextToParts({}), c = capture('r1');
  assert.deepStrictEqual(genieToParts({}, c.texts), expected);
  [null, {}].forEach(function (empty) {
    var j = {}; ios.CMDS.forEach(function (c) { j[c[1].replace(/ /g, '_')] = empty; });
    assert.deepStrictEqual(genieToParts(j, c.texts), expected);
  });
});
test('each missing command stays empty and JSON is not mutated', function () {
  var c = capture('r1'), before = clone(c.json);
  ['show_ip_ospf_interface_brief', 'show_ip_interface_brief', 'show_ip_route', 'show_ip_ospf_interface'].forEach(function (key) {
    var j = clone(c.json); delete j[key]; var got = genieToParts(j, c.args);
    if (key === 'show_ip_ospf_interface_brief') assert.deepStrictEqual(got.p.ospfIf, {});
    if (key === 'show_ip_interface_brief') assert.deepStrictEqual(got.p.ifaces, {});
    if (key === 'show_ip_route') assert.deepStrictEqual(got.p.routes, []);
    if (key === 'show_ip_ospf_interface') assert.equal(got.det, null);
  });
  genieToParts(c.json, c.args); assert.deepStrictEqual(c.json, before);
});
test('passive:false without a running hello is unknown; explicit passive is preserved', function () {
  var c = capture('r1'), i = c.json.show_ip_ospf_interface.vrf.default.address_family.ipv4.instance['1'].areas['0.0.0.0'].interfaces['Ethernet0/1'];
  delete i.hello_timer;
  assert.equal(genieToParts(c.json).p.ospfIf['Ethernet0/1'].passiveKnown, null);
  i.passive = true;
  var got = genieToParts(c.json);
  assert.equal(got.p.ospfIf['Ethernet0/1'].passive, true);
  assert.equal(got.p.ospfIf['Ethernet0/1'].passiveKnown, true);
});

}
