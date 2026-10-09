#!/usr/bin/env bash
# network-xray demo — one command: deploy a containerlab lab, keep collecting each router's live
# state, and serve the X-Ray graph (click any node to look inside the router).
#
#   ./demo.sh [lab.clab.yml] [port] [template.html]
#
#   lab       default: examples/q21-bgp-lp/q21.clab.yml (BGP best-path / LocalPref)
#   port      default: 8080   -> open http://<this machine>:8080/
#   template  default: xray-graph-nextui.html (NeXt UI overview + X-Ray DeepDive)
#
# Examples:  ./demo.sh examples/q13-bgp-static/q13.clab.yml
#            ./demo.sh examples/q13-bgp-static-solved/q13.clab.yml      (the solved version)
# Stop:      Ctrl-C (stops the graph and the collector), then remove the lab:
#            sudo containerlab destroy -t <lab.clab.yml> --cleanup
# containerlab needs root for netns/bridges; override the privilege prefix with SUDO=
#   e.g. rootless docker:  SUDO= ./demo.sh
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
YML="${1:-$HERE/examples/q21-bgp-lp/q21.clab.yml}"
PORT="${2:-8080}"
TEMPLATE="${3:-xray-graph-nextui.html}"
case "$TEMPLATE" in /*) ;; *) TEMPLATE="$HERE/$TEMPLATE" ;; esac
SUDO="${SUDO-sudo}"
command -v containerlab >/dev/null 2>&1 || { echo "containerlab not found - https://containerlab.dev/install/"; exit 1; }
command -v node >/dev/null 2>&1 || { echo "node.js not found (needed to collect router state)"; exit 1; }
[ -f "$YML" ] || { echo "topology not found: $YML"; exit 1; }
YML="$(cd "$(dirname "$YML")" && pwd)/$(basename "$YML")"
LABDIR="$(dirname "$YML")"
LABNAME="$(sed -n 's/^name:[[:space:]]*//p' "$YML" | head -1)"
[ -n "$LABNAME" ] || { echo "could not read 'name:' from $YML"; exit 1; }

# which protocol to collect: BGP if any router runs BGP, else OSPF if any runs OSPF, else static
PROTO=static
if grep -qsE '^router bgp' "$LABDIR"/*/frr.conf; then PROTO=bgp
elif grep -qsE '^router ospf' "$LABDIR"/*/frr.conf; then PROTO=ospf; fi

# the problem text band reads problem.json next to the page (repo root): link this lab's one
rm -f "$HERE/problem.json"
[ -f "$LABDIR/problem.json" ] && ln -s "$LABDIR/problem.json" "$HERE/problem.json"

echo "==> deploying lab '$LABNAME' ($PROTO) ..."
$SUDO containerlab deploy -t "$YML" --reconfigure
set +e   # frr_wait (10-08): the checks below return non-zero on purpose
# --- wait for FRR: zebra sometimes crashes once while the lab starts. Wait until every FRR router answers;
#     otherwise restart FRR (up to 3 times, 15 s each). Non-FRR nodes (no watchfrr.sh, e.g. alpine) are skipped.
LAB=$(sed -n 's/^name: *//p' "$YML" | head -1)
frr_up() { docker exec "$1" timeout 5 vtysh -c 'show zebra' >/dev/null 2>&1; }
for c in $(docker ps --filter "label=containerlab=$LAB" --format '{{.Names}}'); do
  docker exec "$c" test -x /usr/lib/frr/watchfrr.sh 2>/dev/null || continue
  ok=""
  for i in $(seq 1 20); do frr_up "$c" && { ok=1; break; }; sleep 1; done
  try=0
  while [ -z "$ok" ] && [ $try -lt 3 ]; do
    try=$((try + 1))
    echo "==> $c: FRR did not start cleanly, restarting FRR ($try/3) ..."
    docker exec "$c" /usr/lib/frr/watchfrr.sh restart all >/dev/null 2>&1 || true
    for i in $(seq 1 15); do frr_up "$c" && { ok=1; break; }; sleep 1; done
  done
  [ -z "$ok" ] && echo "==> $c: FRR is still not running. Try: docker exec $c /usr/lib/frr/watchfrr.sh restart all"
done
set -e

echo "==> collecting router state every second (the page follows the lab by itself) ..."
node "$HERE/clab-xray-collect.js" "$YML" "$HERE" "$PROTO" --exclude-mgmt --watch &
CPID=$!
trap 'kill $CPID 2>/dev/null; echo; echo "stopped. remove the lab with:  sudo containerlab destroy -t $YML --cleanup"' EXIT
sleep 8

echo ""
echo "==> open  http://<this machine>:${PORT}/   (Ctrl-C to stop)"
echo "    Click any router to open its DeepDive. Fix the lab in a router's shell, e.g.:"
echo "      docker exec -it clab-${LABNAME}-r1 vtysh"
echo "    and the picture follows within a few seconds."
containerlab graph --topo "$YML" --template "$TEMPLATE" --static-dir "$HERE" -s "0.0.0.0:${PORT}"
