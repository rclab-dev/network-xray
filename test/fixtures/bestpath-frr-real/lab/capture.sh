#!/bin/bash
# capture.sh — capture r1's `show ip bgp json` once per FRR best-path step, plus the BGP summary with peers that are
# not Established. Run from this folder on a host with containerlab:
#   FRR_IMAGE=<frr image> containerlab deploy -t bp.clab.yml && bash capture.sh <out dir> && containerlab destroy -t bp.clab.yml --cleanup
# Each step: change one setting (on r1, or on the router that sends the path), wait, capture, put the setting back, wait.
set -u
OUT=${1:?out dir}; N=nx-bp; P=203.0.113.0/24
mkdir -p "$OUT"
vx()   { local node=$1; shift; local a=(); for c in "$@"; do a+=(-c "$c"); done; docker exec "clab-$N-$node" vtysh "${a[@]}"; }
cfg()  { local node=$1; shift; vx "$node" "configure terminal" "$@" "end" >/dev/null 2>&1; }
soft() { for n in r1 r2 r3 r4; do vx $n "clear bgp * soft" >/dev/null 2>&1; done; }
asof() { case $1 in r1|r4) echo 65001;; r2) echo 65002;; r3) echo 65003;; esac; }
grab() { vx r1 "show ip bgp json" > "$OUT/$1.json"; echo "$1 captured"; }
step() {   # name node <lines to add> -- <lines to undo>   (the lines go under `router bgp <as>` of that node)
  local name=$1 node=$2; shift 2; local on=() off=() s=on
  for l in "$@"; do if [ "$l" = "--" ]; then s=off; elif [ $s = on ]; then on+=("$l"); else off+=("$l"); fi; done
  [ ${#on[@]} -gt 0 ] && cfg "$node" "router bgp $(asof $node)" "${on[@]}"
  soft; sleep 15; grab "$name"
  [ ${#off[@]} -gt 0 ] && cfg "$node" "router bgp $(asof $node)" "${off[@]}"
  soft; sleep 15
}

vx r1 "show version" > "$OUT/version.txt"
sleep 30
grab base                                                    # r2 and r3 only, same attributes
cfg r1 "route-map LP200 permit 10" "set local-preference 200" "exit"
cfg r2 "route-map PREPEND permit 10" "set as-path prepend 65002 65002" "exit" "route-map INCOMPLETE permit 10" "set origin incomplete" "exit" "route-map MED50 permit 10" "set metric 50" "exit"
cfg r3 "route-map MED10 permit 10" "set metric 10" "exit"
cfg r4 "route-map AS1 permit 10" "set as-path prepend 65009" "exit"
step weight      r1 "neighbor 10.11.0.20 weight 100" -- "no neighbor 10.11.0.20 weight 100"
step local-pref  r1 "address-family ipv4 unicast" "neighbor 10.11.0.20 route-map LP200 in" -- "address-family ipv4 unicast" "no neighbor 10.11.0.20 route-map LP200 in"
cfg r1 "ip route 203.0.113.0/24 Null0"
step local-route r1 "address-family ipv4 unicast" "network 203.0.113.0/24" -- "address-family ipv4 unicast" "no network 203.0.113.0/24"
cfg r1 "no ip route 203.0.113.0/24 Null0"
step as-path     r2 "address-family ipv4 unicast" "neighbor 10.10.0.10 route-map PREPEND out" -- "address-family ipv4 unicast" "no neighbor 10.10.0.10 route-map PREPEND out"
step origin      r2 "address-family ipv4 unicast" "neighbor 10.10.0.10 route-map INCOMPLETE out" -- "address-family ipv4 unicast" "no neighbor 10.10.0.10 route-map INCOMPLETE out"
cfg r1 "router bgp 65001" "bgp always-compare-med"
cfg r3 "router bgp 65003" "address-family ipv4 unicast" "neighbor 10.11.0.10 route-map MED10 out"
step med         r2 "address-family ipv4 unicast" "neighbor 10.10.0.10 route-map MED50 out" -- "address-family ipv4 unicast" "no neighbor 10.10.0.10 route-map MED50 out"
cfg r3 "router bgp 65003" "address-family ipv4 unicast" "no neighbor 10.11.0.10 route-map MED10 out"
cfg r1 "router bgp 65001" "no bgp always-compare-med"
# eBGP (r2) against iBGP (r4, AS_PATH made the same length); r3 shut down
cfg r1 "router bgp 65001" "neighbor 10.11.0.20 shutdown" "no neighbor 10.12.0.20 shutdown"
cfg r4 "router bgp 65001" "address-family ipv4 unicast" "neighbor 10.12.0.10 route-map AS1 out"
sleep 20
step peer-type   r1 --
cfg r4 "router bgp 65001" "address-family ipv4 unicast" "no neighbor 10.12.0.10 route-map AS1 out"
cfg r1 "router bgp 65001" "neighbor 10.12.0.20 shutdown" "no neighbor 10.11.0.20 shutdown"
sleep 20
step router-id   r1 "bgp bestpath compare-routerid" -- "no bgp bestpath compare-routerid"
step multipath   r1 "bgp bestpath as-path multipath-relax" "address-family ipv4 unicast" "maximum-paths 2" -- "no bgp bestpath as-path multipath-relax" "address-family ipv4 unicast" "no maximum-paths 2"
# Neighbor IP: both peers get the same router ID, and router IDs are compared
cfg r3 "router bgp 65003" "bgp router-id 2.2.2.2"
step neighbor-ip r1 "bgp bestpath compare-routerid" -- "no bgp bestpath compare-routerid"
cfg r3 "router bgp 65003" "bgp router-id 3.3.3.3"
# peers that are not Established: r4 shut down (Idle (Admin)) and an unreachable peer (Active / Connect)
cfg r1 "router bgp 65001" "neighbor 192.0.2.1 remote-as 65099"
sleep 20
vx r1 "show bgp summary json" > "$OUT/peers-summary.json"
cfg r1 "router bgp 65001" "no neighbor 192.0.2.1"
echo "done"
