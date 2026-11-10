'use strict';
var test = require('node:test'), assert = require('node:assert/strict');
var fs = require('fs'), path = require('path'), vm = require('vm');
var ios = require('../clab-iosxe-collect.js'), collector = require('../clab-collect.js');
var genie = require('../genie-to-xray.js'), query = require('../scripts/xray-query.js');
// Reuse the single exception table and its field filter; no new exclusions.
var parity = require('./genie-to-parts.test.js');
var dir = path.join(__dirname, 'fixtures/genie-iosxe/q5');
function textStates() {
  var states = {};
  ['r1', 'r2'].forEach(function (n) {
    var c = parity.capture(n);
    states[n] = ios.iosxePartsToState(ios.iosxeTextToParts(c.texts), c.args, collector.buildState);
  });
  return states;
}
function comparable(states) {
  Object.keys(states).forEach(function (n) {
    // Normalize only the documented state fields before deriving query output.
    // The same exclusions apply to the remote end copied by pairOspfIfaces.
    Object.keys(states[n].ospf_ifaces).forEach(function (i) {
      delete states[n].ospf_ifaces[i].remote;
      delete states[n].ospf_ifaces[i].mismatch;
    });
    Object.assign(states[n], parity.stateComparable(states[n], n));
  });
  return collector.pairOspfIfaces(states, {
    r1: [{ iface: 'Ethernet0/1', peer: 'r2', peerIface: 'Ethernet0/1' }],
    r2: [{ iface: 'Ethernet0/1', peer: 'r1', peerIface: 'Ethernet0/1' }]
  });
}
test('Genie loader and text route answer state and ospf-if equally within the exception table', function () {
  var actual = query.loadStates(dir), expected = textStates();
  assert.deepStrictEqual(query.summarize(actual), query.summarize(expected));
  assert.deepStrictEqual(query.ospfInterfaces(comparable(actual)), query.ospfInterfaces(comparable(expected)));
});
test('without topology the shared Ethernet subnet is paired in both directions', function () {
  var states = query.loadStates(dir);
  ['r1', 'r2'].forEach(function (n) {
    var row = states[n].ospf_ifaces['Ethernet0/1'];
    assert.equal(row.peer, n === 'r1' ? 'r2' : 'r1');
    assert.equal(row.peer_iface, 'Ethernet0/1');
    assert.equal(row.remote.ip, states[row.peer].ospf_ifaces['Ethernet0/1'].ip);
    assert.equal(states[n].nos, 'ios-xe');
  });
});
test('CLI --out writes loadable states and companion signature; stdout is JSON', function () {
  var temp = fs.mkdtempSync(path.join(__dirname, '.genie-entry-'));
  try {
    // Invoke the CLI function directly: this sandbox cannot spawn processes with pipes.
    genie.main([dir, '--out', temp]);
    var ctx = { window: {} };
    vm.runInNewContext(fs.readFileSync(path.join(temp, 'xray-states.js'), 'utf8'), ctx);
    vm.runInNewContext(fs.readFileSync(path.join(temp, 'xray-states.sig.js'), 'utf8'), ctx);
    assert.deepStrictEqual(Object.keys(ctx.window.LIVE_STATES), ['r1', 'r2']);
    assert.equal(ctx.window.LIVE_SIG.gen, 1);
    assert.equal(Object.keys(query.loadStates(temp)).length, 2);
    var output = '', write = process.stdout.write;
    try {
      process.stdout.write = function (s) { output += s; return true; };
      genie.main([dir]);
    } finally { process.stdout.write = write; }
    assert.deepStrictEqual(Object.keys(JSON.parse(output)), ['r1', 'r2']);
  } finally { fs.rmSync(temp, { recursive: true, force: true }); }
});
test('topology links use the existing YAML parser and IOL interface mapping', function () {
  var temp = fs.mkdtempSync(path.join(__dirname, '.genie-entry-'));
  try {
    var file = path.join(temp, 'lab.clab.yml');
    fs.writeFileSync(file, 'name: q5\ntopology:\n  defaults:\n    kind: cisco_iol\n  nodes:\n    r1: {}\n    r2: {}\n  links:\n    - endpoints: ["r1:eth1", "r2:eth1"]\n');
    var states = genie.collectGenieDir(dir, { topo: file });
    assert.equal(states.r1.ospf_ifaces['Ethernet0/1'].peer_iface, 'Ethernet0/1');
    assert.equal(states.r1.ospf_ifaces['Ethernet0/1'].peer, 'r2');
  } finally { fs.rmSync(temp, { recursive: true, force: true }); }
});

test('query entry points and MCP use the Genie directory through the shared loader', function () {
  assert.deepStrictEqual(query.run(['state', dir]), query.summarize(query.loadStates(dir)));
  assert.deepStrictEqual(query.run(['ospf-if', dir]), query.ospfInterfaces(query.loadStates(dir)));
  var mcp = require('../scripts/xray-mcp.js');
  var tools = {
    lab_state: {}, list_routers: {}, ospf_neighbors: {}, ospf_interfaces: {}, bgp_neighbors: {},
    route_lookup: { router: 'r1', destination: '10.10.0.20' }
  };
  Object.keys(tools).forEach(function (name) {
    var result = mcp.handle({ jsonrpc: '2.0', id: 1, method: 'tools/call',
      params: { name: name, arguments: Object.assign({ path: dir }, tools[name]) } }).result;
    assert.ok(!result.isError, name + ': ' + JSON.stringify(result));
    assert.ok(result.structuredContent, name);
  });
});

var q21 = path.join(__dirname, 'fixtures/genie-iosxe/q21');
function q21TextStates() {
  var states = {};
  ['r1', 'r2', 'r3'].forEach(function (node) {
    var c = parity.capture(node, 'q21');
    var parts = ios.iosxeTextToParts(c.texts);
    states[node] = ios.iosxePartsToState(parts, {
      node: node, proto: 'bgp', bgpConfigured: !!parts.p.bgpSum.routerId,
      ospfConfigured: Object.keys(parts.p.ospfIf).length > 0,
      mgmtSubnet: '172.20.20.0/24'
    }, collector.buildState);
  });
  return states;
}
test('q21: all BGP neighbors, routes and RIB match the paired text captures', function () {
  var expected = q21TextStates(), actual = query.loadStates(q21);
  Object.keys(expected).forEach(function (node) {
    var c = parity.capture(node, 'q21');
    assert.deepStrictEqual(genie.genieToParts(c.json).p.bgpSum, ios.iosxeTextToParts(c.texts).p.bgpSum);
    ['bgp_neighbors', 'bgp_routes', 'routing_table'].forEach(function (field) {
      var a = actual[node][field], e = expected[node][field];
      // The single exception table documents q21's route serialization order.
      if (field === 'routing_table') {
        var order = function (a, b) { return a.prefix.localeCompare(b.prefix); };
        a = a.slice().sort(order); e = e.slice().sort(order);
      }
      assert.deepStrictEqual(a, e, node + ' ' + field);
    });
  });
});
test('q21: why derives the same Local Pref answer as text', function () {
  var actual = query.run(['why', q21, 'r1', '8.8.8.0/24']);
  assert.deepStrictEqual(actual, query.why(q21TextStates(), 'r1', '8.8.8.0/24'));
  assert.match(JSON.stringify(actual), /10\.11\.0\.20/);
  assert.match(JSON.stringify(actual), /Local Pref/);
  assert.match(JSON.stringify(actual), /reason_source.*derived/);
});
test('q21: subnet discovery pairs only r1-r2 and r1-r3', function () {
  var states = genie.collectGenieDir(q21);
  assert.deepStrictEqual(states.r1.peer_links.map(function (l) { return l.peer; }), ['r2', 'r3']);
  assert.deepStrictEqual(states.r2.peer_links.map(function (l) { return l.peer; }), ['r1']);
  assert.deepStrictEqual(states.r3.peer_links.map(function (l) { return l.peer; }), ['r1']);
  assert.equal(Object.values(states).reduce(function (n, s) {
    assert.equal(s.ospf_configured, false); assert.equal(s.bgp_configured, true);
    s.peer_links.forEach(function (l) { assert.ok(!l.ip.startsWith('172.20.20.')); });
    return n + s.peer_links.length;
  }, 0), 4);
});
test('management CIDR is configurable, interface names are unrestricted, and topology wins', function () {
  var temp = fs.mkdtempSync(path.join(__dirname, '.genie-entry-'));
  try {
    ['a', 'b'].forEach(function (node, index) {
      var sub = path.join(temp, node); fs.mkdirSync(sub);
      fs.writeFileSync(path.join(sub, 'genie_show_ip_interface_brief.json'), JSON.stringify({ interface: {
        'Ethernet0/0': { ip_address: '10.0.0.' + (index + 1), status: 'up', protocol: 'up' },
        'Ethernet0/3': { ip_address: '172.20.20.' + (index + 1), status: 'up', protocol: 'up' },
        Loopback0: { ip_address: '10.1.0.' + (index + 1), status: 'up', protocol: 'up' }
      } }));
      fs.writeFileSync(path.join(sub, 'genie_show_ip_protocols.json'), JSON.stringify({ protocols: { bgp: { instance: { default: { bgp_id: 65001 } } } } }));
    });
    var states = genie.collectGenieDir(temp);
    assert.equal(states.a.protocol, 'bgp'); assert.equal(states.a.bgp_configured, true);
    assert.deepStrictEqual(states.a.peer_links.map(function (l) { return l.iface; }), ['Ethernet0/0']);
    states = genie.collectGenieDir(temp, { mgmtSubnet: '10.0.0.0/24' });
    assert.deepStrictEqual(states.a.peer_links.map(function (l) { return l.iface; }), ['Ethernet0/3']);
    var topo = path.join(temp, 'lab.yml');
    fs.writeFileSync(topo, 'topology:\n  links:\n    - endpoints: ["a:Ethernet0/3", "b:Ethernet0/3"]\n');
    states = genie.collectGenieDir(temp, { topo: topo });
    assert.deepStrictEqual(states.a.peer_links.map(function (l) { return l.iface; }), ['Ethernet0/3']);
    assert.throws(function () { genie.main([temp, '--mgmt-subnet', 'bad']); }, /invalid management subnet/);
    assert.throws(function () { genie.main([temp, '--mgmt-subnet']); }, /missing value/);
    var output = '', write = process.stdout.write;
    try {
      process.stdout.write = function (s) { output += s; return true; };
      genie.main([temp, '--mgmt-subnet', '10.0.0.0/24']);
    } finally { process.stdout.write = write; }
    assert.equal(JSON.parse(output).a.peer_links[0].iface, 'Ethernet0/3');
  } finally { fs.rmSync(temp, { recursive: true, force: true }); }
});
