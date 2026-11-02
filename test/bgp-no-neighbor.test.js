'use strict';
/* nx_bgp_no_nbr_mark (2026-11-02): `router bgp <AS>` with no neighbor. bgp_configured stays false (nx_bgp_no_nbr, 2026-10-19:
   not a failed BGP), but the state carries bgp_no_neighbor + bgp_as so the page can show the process in a neutral way.
   FRR reads it from the running-config, IOS from `show ip protocols` (show ip bgp summary prints nothing without a neighbor). */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const frr = require('../clab-collect.js');
const ios = require('../clab-iosxe-collect.js');

const FIX = path.join(__dirname, 'fixtures', 'iosxe-q15');
const fileOf = cmd => cmd.replace(/ /g, '_') + '.txt';
function iosTexts(node) {
  const t = {};
  ios.CMDS.forEach(c => { const f = path.join(FIX, node, fileOf(c[1])); if (fs.existsSync(f)) t[c[0]] = fs.readFileSync(f, 'utf8'); });
  return t;
}
const PROTO_BGP = [
  'Routing Protocol is "application"', '  Sending updates every 0 seconds', '',
  'Routing Protocol is "ospf 1"', '  Router ID 10.10.0.10', '',
  'Routing Protocol is "bgp 65001"', '  Outgoing update filter list for all interfaces is not set', '  IGP synchronization is disabled',
  '  Maximum path: 1', '  Routing Information Sources:', '    Gateway         Distance      Last Update', '  Distance: external 20 internal 200 local 200', ''
].join('\n');

test('IOS: router bgp with no neighbor -> bgp_no_neighbor + bgp_as, bgp_configured stays false', () => {
  const t = iosTexts('r1');
  t.bgpSummary = ''; t.bgp = ''; t.protocols = PROTO_BGP;   // what IOL 17.18 prints with `router bgp 65001` and no neighbor
  const st = ios.run(t, 'r1', 'Ethernet0/1:r2', 'ospf', '');
  assert.strictEqual(st.bgp_configured, false);
  assert.strictEqual(st.bgp_no_neighbor, true);
  assert.strictEqual(st.bgp_as, '65001');
  assert.notStrictEqual(st.protocol, 'bgp');
  assert.ok(!(st.parse_warnings || []).some(w => w.cmd === 'show ip protocols'), 'show ip protocols is read without a warning');
});

test('IOS: BGP with a neighbor is unchanged (no mark) even when show ip protocols names bgp', () => {
  const t = iosTexts('r1'); t.protocols = PROTO_BGP;
  const st = ios.run(t, 'r1', 'Ethernet0/1:r2', 'bgp', '');
  assert.strictEqual(st.bgp_configured, true);
  assert.strictEqual(st.bgp_no_neighbor, undefined);
  assert.strictEqual(st.bgp_as, undefined);
});

test('IOS: no show ip protocols (older capture) or no bgp in it -> no mark, same as before', () => {
  const a = iosTexts('r1'); a.bgpSummary = ''; a.bgp = '';
  const sa = ios.run(a, 'r1', 'Ethernet0/1:r2', 'ospf', '');
  assert.strictEqual(sa.bgp_no_neighbor, undefined);
  const b = iosTexts('r1'); b.bgpSummary = ''; b.bgp = ''; b.protocols = 'Routing Protocol is "ospf 1"\n  Router ID 10.10.0.10\n';
  const sb = ios.run(b, 'r1', 'Ethernet0/1:r2', 'ospf', '');
  assert.strictEqual(sb.bgp_no_neighbor, undefined);
});

test('FRR: buildState carries the mark only when BGP is not configured', () => {
  const base = { node: 'r1', lab: 'x', proto: 'ospf', adjacency: [], configStatics: [] };
  const noNbr = frr.collectFromJson(Object.assign({}, base, { ospfConfigured: true, bgpConfigured: false, bgpNoNeighbor: true, bgpAs: '65001' }));
  assert.strictEqual(noNbr.bgp_configured, false);
  assert.strictEqual(noNbr.bgp_no_neighbor, true);
  assert.strictEqual(noNbr.bgp_as, '65001');
  const withNbr = frr.collectFromJson(Object.assign({}, base, { ospfConfigured: true, bgpConfigured: true, bgpNoNeighbor: false, bgpAs: '65001' }));
  assert.strictEqual(withNbr.bgp_no_neighbor, undefined);
  const plain = frr.collectFromJson(Object.assign({}, base, { ospfConfigured: true, bgpConfigured: false }));
  assert.strictEqual(plain.bgp_no_neighbor, undefined);
  assert.strictEqual(plain.bgp_as, undefined);
});
