'use strict';
// policy-parse.js: the BGP / OSPF policy lines of an FRR running-config, and a prefix evaluated against prefix-lists and
// route-maps. The configs are those of small FRR labs (a prefix-list deny on a neighbor, a route-map deny on redistribute
// static, a missing network, a missing next-hop-self), written the way `show running-config` prints them.
// Run: node --test        (from the repo root; Node >= 18, no dependencies)
const test = require('node:test');
const assert = require('node:assert/strict');
const P = require('../policy-parse.js');
const lines = (s) => s.split('\n');

const PL_IN = lines(`frr version 10.0
hostname r1
!
ip prefix-list FILTER seq 5 deny 2.2.2.0/24
ip prefix-list FILTER seq 100 permit 0.0.0.0/0 le 32
!
route-map INBOUND permit 10
 match ip address prefix-list FILTER
exit
!
router bgp 65001
 timers bgp 3 9
 no bgp ebgp-requires-policy
 neighbor 10.0.12.2 remote-as 65002
 !
 address-family ipv4 unicast
  neighbor 10.0.12.2 route-map INBOUND in
 exit-address-family
exit
!
end`);

const RM_DENY = lines(`hostname r1
ip route 1.1.1.0/24 lo
!
route-map STATIC-TO-OSPF deny 10
exit
!
router ospf
 network 10.0.12.0/24 area 0
 redistribute static route-map STATIC-TO-OSPF
exit
!`);

const NHS = lines(`hostname r2
route-map PERMIT permit 10
exit
!
router bgp 65001
 neighbor 1.1.1.1 remote-as 65001
 neighbor 1.1.1.1 update-source lo
 neighbor 10.0.23.3 remote-as 65002
 !
 address-family ipv4 unicast
  neighbor 10.0.23.3 route-map PERMIT in
  neighbor 10.0.23.3 route-map PERMIT out
 exit-address-family
exit`);

const NO_NET = lines(`hostname r1
router bgp 65001
 neighbor 10.0.12.2 remote-as 65002
 !
 address-family ipv4 unicast
 exit-address-family
exit`);

test('parse: neighbors, the policies on them, networks and redistribute (BGP and OSPF)', () => {
  const a = P.parse(PL_IN);
  assert.equal(a.bgp.as, '65001');
  assert.deepEqual(a.bgp.neighbors['10.0.12.2'], { remote_as: '65002', route_map: { in: 'INBOUND' } });
  assert.deepEqual(a.prefix_lists.FILTER, [{ seq: 5, action: 'deny', prefix: '2.2.2.0/24' }, { seq: 100, action: 'permit', prefix: '0.0.0.0/0', le: 32 }]);
  assert.deepEqual(a.route_maps.INBOUND, [{ seq: 10, action: 'permit', matches: [{ type: 'prefix-list', name: 'FILTER' }], other: [] }]);
  const b = P.parse(RM_DENY);
  assert.deepEqual(b.ospf.redistribute, [{ proto: 'static', route_map: 'STATIC-TO-OSPF' }]);
  assert.equal(b.bgp, null);
  const c = P.parse(NHS);
  assert.equal(c.bgp.neighbors['1.1.1.1'].next_hop_self, undefined, 'no next-hop-self toward the iBGP peer');
  assert.deepEqual(P.parse(NO_NET).bgp.networks, []);
});

test('prefix-list: exact entry, ge / le, the implicit deny, a list that is not defined', () => {
  const pls = P.parse(PL_IN).prefix_lists;
  assert.equal(P.plEval(pls, 'FILTER', '2.2.2.0/24').verdict, 'deny');
  assert.equal(P.plEval(pls, 'FILTER', '2.2.2.0/24').seq, 5);
  assert.equal(P.plEval(pls, 'FILTER', '8.8.8.0/24').verdict, 'permit', 'seq 100 permit 0.0.0.0/0 le 32');
  const only = P.parse(lines('ip prefix-list ONE seq 5 permit 10.0.0.0/8'));
  assert.equal(P.plEval(only.prefix_lists, 'ONE', '10.1.0.0/16').verdict, 'deny', 'no ge / le = exact length only, then the implicit deny');
  assert.equal(P.plEval(only.prefix_lists, 'ONE', '10.1.0.0/16').seq, null);
  assert.equal(P.plEval(only.prefix_lists, 'NOPE', '10.0.0.0/8').verdict, '?');
  const auto = P.parse(lines('ip prefix-list A permit 1.0.0.0/8\nip prefix-list A deny 2.0.0.0/8'));
  assert.deepEqual(auto.prefix_lists.A.map((e) => e.seq), [5, 10], 'FRR numbers entries without seq by 5');
});

test('route-map: permit entry whose prefix-list denies falls to the implicit deny; a deny entry with no match denies all', () => {
  const a = P.parse(PL_IN);
  const r = P.rmEval(a.route_maps, a.prefix_lists, 'INBOUND', '2.2.2.0/24');
  assert.equal(r.verdict, 'deny');
  assert.match(r.why, /implicit deny/);
  assert.equal(P.rmEval(a.route_maps, a.prefix_lists, 'INBOUND', '8.8.8.0/24').verdict, 'permit');
  const b = P.parse(RM_DENY);
  const d = P.rmEval(b.route_maps, b.prefix_lists, 'STATIC-TO-OSPF', '1.1.1.0/24');
  assert.equal(d.verdict, 'deny'); assert.equal(d.seq, 10);
  assert.equal(P.rmEval(P.parse(NHS).route_maps, {}, 'PERMIT', '9.9.9.0/24').verdict, 'permit');
});

test('route-map: what is not evaluated gives ? (as-path, two matches, continue, not defined)', () => {
  const x = P.parse(lines(`route-map AS permit 10
 match as-path 1
exit
route-map TWO permit 10
 match ip address prefix-list A
 match ip address prefix-list B
exit
route-map CONT permit 10
 continue 20
exit
ip prefix-list A seq 5 permit 0.0.0.0/0 le 32
ip prefix-list B seq 5 permit 0.0.0.0/0 le 32`));
  for (const n of ['AS', 'TWO', 'CONT', 'MISSING']) assert.equal(P.rmEval(x.route_maps, x.prefix_lists, n, '8.8.8.0/24').verdict, '?', n);
});

test('a VRF BGP block and the IPv6 address family are not read as the default IPv4 policy', () => {
  const v = P.parse(lines(`router bgp 65001 vrf RED
 neighbor 10.9.9.9 remote-as 65009
exit
router bgp 65001
 neighbor 10.0.12.2 remote-as 65002
 address-family ipv6 unicast
  neighbor 10.0.12.2 prefix-list V6 in
 exit-address-family
exit`));
  assert.deepEqual(Object.keys(v.bgp.neighbors), ['10.0.12.2']);
  assert.equal(v.bgp.neighbors['10.0.12.2'].prefix_list, undefined);
});
