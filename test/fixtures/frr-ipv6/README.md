# test/fixtures/frr-ipv6

Hand-written FRR `show ... json` output for the IPv6 / dual-stack tests (`test/ipv6.test.js`). The field names and
shapes follow FRR 8.4 / 10.x (the same shapes as the bundled self-tests in `clab-collect.js`). IPv6 addresses are in
the documentation range `2001:db8::/32`; IPv4 addresses are in `10.0.0.0/8`.

File names are the ones `node clab-collect.js --fixtures <dir>` reads.

- `bgp-r1/`: r1 with an IPv4 + IPv6 eBGP session to r2 on eth1 (dual-stack link), an unnumbered (interface-named)
  session to r3 on eth2 (IPv4 routes over an IPv6 link-local next hop), an IPv6-only link eth3, `::/0` via a
  link-local next hop and an IPv6 ECMP route.
- `ospf-r1/`: r1 with OSPFv2 + OSPFv3 to r2 on eth1 (dual-stack) and OSPFv3 only to r3 on eth3 (IPv6-only link).
