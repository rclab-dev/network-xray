# FRR 10.0.0 text output for the paste pages' parsers

Captured from FRR 10.0.0 (quay.io/frrouting/frr:10.0.0) in a three-router containerlab lab: r1 (AS 65001) with two OSPF links to r2
(AS 65002) and eBGP to r2 and r3 (AS 65003). r2 sends 192.168.100.128/25 (a prefix longer than the Network column), 8.8.8.0/24
and 10.1.0.0/24 with MED 1000000; r1 also originates 10.1.0.0/24; r2's session also carries IPv6 unicast; r3 keeps
ebgp-requires-policy. r1_route_with_static adds ip route 2.2.2.2/32, so the OSPF route to it is not selected.
Used by test/paste-parsers-frr10.test.js.

`frr107_lan_*` are from FRR 10.7.1 (quay.io/frrouting/frr:10.7.1): r1 to r4 share one LAN (10.0.0.0/24, three OSPF neighbors of r1
on eth1), r1 and r2 also have a point-to-point link, r1 has eBGP to r3 and aggregates 172.16.1.0/24 and 172.16.2.0/24 with
summary-only (s> rows). FRR 10.7.1 prints the loopback's local route as `L * 1.1.1.1/32` (a space before the flag).
Used by test/paste-parsers-frr107-lan.test.js.

`iol17_*` are from Cisco IOL (IOS-XE 17.18.02) in the same shape as the FRR 10.0.0 lab (r1 AS 65001, r2 AS 65002 sends three
prefixes with MED 1000000, two OSPF links between them). The BGP page reads IOS-XE `show ip bgp summary` / `show ip bgp`;
IOS-XE `show ip ospf neighbor` is a different layout and the OSPF page says it could not parse it.
