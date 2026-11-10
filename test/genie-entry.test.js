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
