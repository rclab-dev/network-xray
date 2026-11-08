#!/usr/bin/env bash
# network-xray — change one Local Preference and watch the BGP best path move, in one script.
#
#   bash scripts/demo-locpref-flip.sh [--keep]
#
# Runs on the q21 example (examples/q21-bgp-lp: 3 FRR routers, r1 hears 8.8.8.0/24 from r2 and r3).
# Note: this shows the answer of problem q21. Solve q21 first if you want to.
#   1. deploys the lab and waits for r1 to hear 8.8.8.0/24 from both upstreams
#   2. reads the routers once (clab-xray-collect.js) and asks why r1 picked its path (scripts/xray-query.js)
#      -> via r3 (10.11.0.20) wins: r1 gives the path from r2 Local Preference 50 on the way in
#   3. changes one line on r1: the inbound route-map for r2 sets Local Preference 150 instead of 50
#   4. reads the routers again and asks again -> via r2 (10.10.0.20) wins, by Local Preference
#   5. destroys the lab (--keep leaves it running, e.g. to open it with ./xray.sh)
# The answers in steps 2 and 4 come from the same state file the X-Ray page draws (xray-states.js), so the
# Best-Path Decision panel shows the same winner and reason. To watch the picture change instead, run
# ./xray.sh examples/q21-bgp-lp/q21.clab.yml in another terminal and type the change of step 3 on r1.
#
# Needs: Linux, Docker, containerlab, Node.js 18+. Run from the repository root.
# env: SUDO= (privilege prefix for containerlab, default sudo)
set -u
cd "$(dirname "$0")/.." || exit 1
SUDO="${SUDO-sudo}"
TOPO=examples/q21-bgp-lp/q21.clab.yml
LAB=$(sed -n 's/^name:[[:space:]]*//p' "$TOPO" | head -1)
R1="clab-$LAB-r1"
KEEP=0; [ "${1:-}" = "--keep" ] && KEEP=1
OUT=$(mktemp -d)   # the collector writes xray-states.js next to its per-node collectors; keep the repository's copy untouched
cp clab-collect.js clab-srl-collect.js clab-iosxe-collect.js "$OUT/" || exit 1

step() { printf '\n== %s\n' "$*"; }
paths() { docker exec "$R1" vtysh -c 'show ip bgp 8.8.8.0/24 json' 2>/dev/null | node -e '
  let s = ""; process.stdin.on("data", d => s += d).on("end", () => {
    try { const j = JSON.parse(s); const p = j.paths || [];
      const b = p.find(x => x.bestpath && x.bestpath.overall);
      console.log(p.length + " " + (b ? (b.nexthops && b.nexthops[0] && b.nexthops[0].ip) || "" : ""));
    } catch (e) { console.log("0 "); } });'; }
wait_best() {   # wait_best <next hop that should win>
  for i in $(seq 1 60); do
    set -- "$1" $(paths); [ "${2:-0}" = 2 ] && [ "${3:-}" = "$1" ] && return 0; sleep 2
  done
  echo "r1 did not settle on $1 within 120 s"; return 1
}
ask() {
  node clab-xray-collect.js "$TOPO" "$OUT" bgp --exclude-mgmt > "$OUT/collect.log" 2>&1 || { tail -5 "$OUT/collect.log"; return 1; }
  node scripts/xray-query.js why "$OUT/xray-states.js" r1 8.8.8.0/24 --format table
}
cleanup() {
  rm -rf "$OUT"
  if [ "$KEEP" = 1 ]; then echo; echo "Lab left running. Remove it: $SUDO containerlab destroy -t $TOPO --cleanup"
  else step "removing the lab"; $SUDO containerlab destroy -t "$TOPO" --cleanup > /dev/null 2>&1 && echo "done"; fi
}

step "1. deploying $TOPO (lab $LAB)"
$SUDO containerlab deploy -t "$TOPO" --reconfigure > "$OUT/deploy.log" 2>&1 || { tail -20 "$OUT/deploy.log"; rm -rf "$OUT"; exit 1; }
trap cleanup EXIT
echo "waiting for r1 to hear 8.8.8.0/24 from r2 and r3 ..."
wait_best 10.11.0.20 || exit 1

step "2. before: why does r1 pick its path to 8.8.8.0/24?"
ask || exit 1
echo "(LOCPRF - = r1 sets none for that path, so FRR uses the default, 100)"

step "3. the change on r1: Local Preference for the path from r2, 50 -> 150"
echo "   route-map LOW-LP permit 10 / set local-preference 150 (then: clear ip bgp 10.10.0.20 soft in)"
docker exec "$R1" vtysh -c 'configure terminal' -c 'route-map LOW-LP permit 10' -c 'set local-preference 150' -c 'end' \
  -c 'clear ip bgp 10.10.0.20 soft in' > /dev/null || exit 1
wait_best 10.10.0.20 || exit 1

step "4. after: why does r1 pick its path to 8.8.8.0/24?"
ask || exit 1
