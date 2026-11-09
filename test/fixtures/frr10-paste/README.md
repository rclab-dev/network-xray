# FRR 10.0.0 text output for the paste pages' parsers

Captured from FRR 10.0.0 (quay.io/frrouting/frr:10.0.0) in a three-router containerlab lab: r1 (AS 65001) with two OSPF links to r2
(AS 65002) and eBGP to r2 and r3 (AS 65003). r2 sends 192.168.100.128/25 (a prefix longer than the Network column), 8.8.8.0/24
and 10.1.0.0/24 with MED 1000000; r1 also originates 10.1.0.0/24; r2's session also carries IPv6 unicast; r3 keeps
ebgp-requires-policy. r1_route_with_static adds ip route 2.2.2.2/32, so the OSPF route to it is not selected.
Used by test/paste-parsers-frr10.test.js.
