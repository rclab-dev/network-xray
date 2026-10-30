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
# nx_review_1017 (F-07): the lab name is used in container names and docker filters: plain names only
case "$LABNAME" in [!A-Za-z0-9]*|*[!A-Za-z0-9_.-]*) echo "the lab name in $YML is not a plain name (letters, digits, _ . -)"; exit 1 ;; esac

# nx_port_free_check: the graph port must be free, otherwise `containerlab graph` stops right after "==> open"
# (checked before deploy, so nothing is left running). Same check as .devcontainer/start-demo.sh.
if timeout 2 bash -c "exec 3<>/dev/tcp/127.0.0.1/${PORT}" 2>/dev/null; then
  echo "port ${PORT} is already in use (another graph is running there?)."
  echo "  add a port:  ./demo.sh ${1:-examples/q21-bgp-lp/q21.clab.yml} $((PORT + 1))   - or stop the other one."
  exit 1
fi

# which protocol to collect: BGP if any router runs BGP, else OSPF if any runs OSPF, else static
PROTO=static
# nx_demo_proto_ios: FRR frr.conf and IOS startup configs (*.cfg, e.g. the IOL examples' rN.partial.cfg)
if grep -qsE '^router bgp' "$LABDIR"/*/frr.conf "$LABDIR"/*.cfg "$LABDIR"/*/*.cfg; then PROTO=bgp
elif grep -qsE '^router ospf' "$LABDIR"/*/frr.conf "$LABDIR"/*.cfg "$LABDIR"/*/*.cfg; then PROTO=ospf; fi

# the problem text band reads problem.json next to the page (repo root): link this lab's one.
# nx_demo_pj_cleanup: demo.sh only touches a link it made (one into examples/ left by an earlier run, or the one made
# now); a problem.json you put there yourself is left alone. The link is removed again when demo.sh stops.
PJ="$HERE/problem.json"; PJ_MADE=""; CPID=""
pj_ours() { [ -L "$PJ" ] && case "$(readlink "$PJ")" in "$HERE"/examples/*/problem.json) return 0 ;; esac; return 1; }
pj_cleanup() { [ -n "$PJ_MADE" ] && [ -L "$PJ" ] && [ "$(readlink "$PJ")" = "$PJ_MADE" ] && rm -f "$PJ"; return 0; }
# nx_demo_trap_true: set +e first - a failing step (e.g. the collector already ended on Ctrl-C) must not cut the clean-up short
trap 'set +e; pj_cleanup; [ -n "$CPID" ] && kill $CPID 2>/dev/null || true; echo; echo "stopped. remove the lab with:  sudo containerlab destroy -t $YML --cleanup"' EXIT
if pj_ours; then rm -f "$PJ"; fi   # left by an earlier demo.sh that was killed
if [ -f "$LABDIR/problem.json" ]; then
  if [ -e "$PJ" ] || [ -L "$PJ" ]; then echo "==> $PJ was not made by demo.sh - left as is (the problem band shows that file)"
  else ln -s "$LABDIR/problem.json" "$PJ" && PJ_MADE="$LABDIR/problem.json"; fi
fi

echo "==> deploying lab '$LABNAME' ($PROTO) ..."
$SUDO containerlab deploy -t "$YML" --reconfigure
set +e   # frr_wait (10-08): the checks below return non-zero on purpose
# --- wait for FRR: zebra sometimes crashes once while the lab starts. Wait until every FRR router answers;
#     otherwise restart FRR (up to 3 times, 15 s each). Non-FRR nodes (no watchfrr.sh, e.g. alpine) are skipped.
LAB="$LABNAME"
frr_up() { docker exec "$1" timeout 5 vtysh -c 'show zebra' >/dev/null 2>&1; }
for c in $(docker ps --filter "label=containerlab=${LAB}" --format '{{.Names}}'); do
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
CPID=$!   # the EXIT trap (set above, nx_demo_pj_cleanup) stops it and removes the problem.json link
sleep 8

echo ""
echo "==> open  http://<this machine>:${PORT}/   (Ctrl-C to stop)"
echo "    Click any router to open its DeepDive. Fix the lab in a router's shell, e.g.:"
echo "      docker exec -it clab-${LABNAME}-r1 vtysh"
echo "    and the picture follows within a few seconds."
containerlab graph --topo "$YML" --template "$TEMPLATE" --static-dir "$HERE" -s "0.0.0.0:${PORT}"
