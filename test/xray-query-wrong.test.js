'use strict';
// xray-query / MCP answers start with what is wrong (`wrong`), so a reader (or an AI given the JSON) meets the problem first.
// Two states captured from FRR 10.7.1 labs (containerlab):
//   frr-hello-mismatch  - three routers, OSPF; r2 eth1 hello 3 against r1 eth1 hello 2: that adjacency never comes up, the
//                         neighbour tables simply do not list it (so ospf_full / ospf_total alone read 6 / 6 "all Full")
//   frr-bgp-remote-as   - eBGP r1 - r2 with remote-as 65009 on r1 (r2 is AS 65002): both ends Idle
// Run: node --test        (from the repo root; Node >= 18, no dependencies)
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const q = require('../scripts/xray-query.js');
const mcp = require('../scripts/xray-mcp.js');

const HELLO = path.join(__dirname, 'fixtures', 'frr-hello-mismatch', 'lab-states.json');
const REMOTE_AS = path.join(__dirname, 'fixtures', 'frr-bgp-remote-as', 'lab-states.json');
const HELLO_LINE = 'r1 eth1 ⇔ r2 eth1: OSPF no adjacency — hello 2 ⇔ 3';

test('lab_state: wrong is the first key and names the down adjacency with the values that differ', () => {
  const s = q.summarize(q.loadStates(HELLO));
  assert.equal(Object.keys(s)[0], 'wrong');
  assert.deepEqual(s.wrong.map((w) => w.text), [HELLO_LINE], 'one line for the link (both ends)');
  assert.ok(JSON.stringify(s).slice(0, 200).indexOf('no adjacency') > 0, 'within the first 200 characters of the answer');
});

test('lab_state counts: the interfaces that should have an adjacency and those that have one', () => {
  const c = q.summarize(q.loadStates(HELLO)).counts;
  assert.equal(c.ospf_full, 6);
  assert.equal(c.ospf_total, 6, 'the neighbour tables alone: 6 / 6');
  assert.equal(c.ospf_ifaces_expected, 8, 'four links, OSPF on both ends');
  assert.equal(c.ospf_ifaces_full, 6);
  assert.equal(c.ospf_ifaces_without_adjacency, 2, 'r1 eth1 and r2 eth1');
});

test('ospf_interfaces: wrong, then the mismatch lines and hints, then the rows', () => {
  const r = q.ospfInterfaces(q.loadStates(HELLO));
  assert.deepEqual(Object.keys(r).slice(0, 4), ['wrong', 'mismatches', 'hints', 'routers']);
  assert.deepEqual(r.wrong.map((w) => w.text), [HELLO_LINE]);
  assert.deepEqual(q.ospfInterfaces(q.loadStates(HELLO), 'r3').wrong, [], 'only that router\'s lines with `router`');
});

test('ospf_neighbors: the adjacency that is not in the neighbour table is in wrong', () => {
  const r = q.ospfNeighbors(q.loadStates(HELLO));
  assert.equal(Object.keys(r)[0], 'wrong');
  assert.deepEqual(r.wrong.map((w) => w.text), [HELLO_LINE]);
  assert.equal(r.counts.ifaces_without_adjacency, 2);
});

test('bgp_neighbors and lab_state: a session that is not Established comes first, with the remote AS', () => {
  const st = q.loadStates(REMOTE_AS);
  const b = q.bgpNeighbors(st);
  assert.equal(Object.keys(b)[0], 'wrong');
  assert.deepEqual(b.wrong.map((w) => w.text), ['r1 → 10.0.12.2 (AS 65009): BGP Idle', 'r2 → 10.0.12.1 (AS 65001): BGP Idle']);
  assert.deepEqual(q.summarize(st).wrong.map((w) => w.protocol), ['bgp', 'bgp']);
  assert.deepEqual(q.bgpNeighbors(st, 'r3').wrong, []);
});

test('a lab with nothing wrong: wrong is an empty list (the key is still first)', () => {
  const s = q.summarize(q.loadStates(path.join(__dirname, 'fixtures', 'iosxe-q15')));
  assert.equal(Object.keys(s)[0], 'wrong');
  assert.deepEqual(s.wrong, []);
});

test('the MCP tools return the same order (wrong first)', () => {
  const call = (name, args) => JSON.parse(mcp.handleLine(JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: name, arguments: args } })).result.content[0].text);
  ['lab_state', 'ospf_interfaces', 'ospf_neighbors'].forEach((t) => {
    const r = call(t, { path: HELLO });
    assert.equal(Object.keys(r)[0], 'wrong', t);
    assert.equal(r.wrong[0].text, HELLO_LINE, t);
  });
  assert.equal(call('bgp_neighbors', { path: REMOTE_AS }).wrong.length, 2);
});

test('table output: What\'s wrong is printed first when there is something', () => {
  const t = q.runTable(['state', HELLO], false).split('\n');
  assert.equal(t[0], "What's wrong (1)");
  assert.equal(t[1], '  x ' + HELLO_LINE);
});
