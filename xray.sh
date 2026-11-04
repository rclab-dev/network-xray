#!/usr/bin/env bash
# network-xray — one command: deploy a containerlab lab, keep collecting each router's live
# state, and serve the X-Ray graph (click any node to look inside the router).
#
#   ./xray.sh [--bind <address>] [--interval <seconds>] [lab.clab.yml] [port] [template.html]
#
#   lab       default: examples/q21-bgp-lp/q21.clab.yml (BGP best-path / LocalPref)
#   port      default: 8080   -> open http://<this machine>:8080/
#   template  default: xray-graph-nextui.html (NeXt UI overview + X-Ray DeepDive)
#   --bind <address>      address the graph page listens on. default: 0.0.0.0 (all addresses, as before -
#                         a lab on a server / VM is opened from your PC); --bind 127.0.0.1 = this machine only
#   --interval <seconds>  how often the collector reads the routers (whole seconds). default: 1
#   The options may come before, between or after lab / port / template.
#
# Examples:  ./xray.sh examples/q13-bgp-static/q13.clab.yml
#            ./xray.sh examples/q13-bgp-static-solved/q13.clab.yml      (the solved version)
#            ./xray.sh --bind 0.0.0.0 --interval 5 examples/q13-bgp-static/q13.clab.yml 8081
# Stop:      Ctrl-C (stops the graph and the collector), then remove the lab:
#            sudo containerlab destroy -t <lab.clab.yml> --cleanup
# containerlab needs root for netns/bridges; override the privilege prefix with SUDO=
#   e.g. rootless docker:  SUDO= ./xray.sh
set -euo pipefail
unset CDPATH   # a CDPATH from the environment would make the cd below print a path or pick another folder
HERE="$(cd -- "$(dirname -- "$0")" && pwd)"
BIND=0.0.0.0; BIND_SET=""; INTERVAL=1; POS=()
while [ $# -gt 0 ]; do
  case "$1" in
    --bind|--interval)
      [ $# -ge 2 ] || { echo "$1 needs a value (see the top of xray.sh)"; exit 1; }
      if [ "$1" = --bind ]; then BIND="$2"; BIND_SET=1; else INTERVAL="$2"; fi; shift 2 ;;
    --bind=*) BIND="${1#--bind=}"; BIND_SET=1; shift ;;
    --interval=*) INTERVAL="${1#--interval=}"; shift ;;
    *) POS+=("$1"); shift ;;
  esac
done
set -- ${POS[@]+"${POS[@]}"}
# --bind: an IPv4/IPv6 address or a host name; [::1] is taken as ::1
case "$BIND" in \[*\]) BIND="${BIND#[}"; BIND="${BIND%]}" ;; esac
case "$BIND" in ''|-*|*[!A-Za-z0-9.:-]*) echo "--bind must be an address such as 127.0.0.1, 0.0.0.0 or ::1: $BIND"; exit 1 ;; esac
case "$BIND" in *:*) BIND_HP="[$BIND]" ;; *) BIND_HP="$BIND" ;; esac
case "$INTERVAL" in ''|*[!0-9]*) INTERVAL=x ;; esac
[ "$INTERVAL" != x ] && [ ${#INTERVAL} -le 5 ] && INTERVAL=$((10#$INTERVAL)) && [ "$INTERVAL" -ge 1 ] \
  || { echo "--interval must be a whole number of seconds (1 or more)"; exit 1; }
YML="${1:-$HERE/examples/q21-bgp-lp/q21.clab.yml}"
PORT="${2:-8080}"
TEMPLATE="${3:-xray-graph-nextui.html}"
case "$TEMPLATE" in /*) ;; *) TEMPLATE="$HERE/$TEMPLATE" ;; esac
SUDO="${SUDO-sudo}"
command -v containerlab >/dev/null 2>&1 || { echo "containerlab not found - https://containerlab.dev/install/"; exit 1; }
command -v node >/dev/null 2>&1 || { echo "node.js not found (needed to collect router state)"; exit 1; }
[ -f "$YML" ] || { echo "topology not found: $YML"; exit 1; }
[ -f "$TEMPLATE" ] || { echo "template not found: $TEMPLATE"; exit 1; }
# the port is used in the port check and in containerlab's listen address: digits only
case "$PORT" in ''|*[!0-9]*) PORT=x ;; esac
[ "$PORT" != x ] && [ ${#PORT} -le 5 ] && PORT=$((10#$PORT)) && [ "$PORT" -ge 1 ] && [ "$PORT" -le 65535 ] \
  || { echo "port must be a number from 1 to 65535: ${2-}"; exit 1; }
YML="$(cd -- "$(dirname -- "$YML")" && pwd)/$(basename -- "$YML")"
LABDIR="$(dirname "$YML")"
LABNAME="$(sed -n 's/^name:[[:space:]]*//p' "$YML" | head -1)"
[ -n "$LABNAME" ] || { echo "could not read 'name:' from $YML"; exit 1; }
# nx_review_1017 (F-07): the lab name is used in container names and docker filters: plain names only
case "$LABNAME" in [!A-Za-z0-9]*|*[!A-Za-z0-9_.-]*) echo "the lab name in $YML is not a plain name (letters, digits, _ . -)"; exit 1 ;; esac

# nx_port_free_check: the graph port must be free, otherwise `containerlab graph` stops right after "==> open"
# (checked before deploy, so nothing is left running). Same check as .devcontainer/start-demo.sh.
if timeout 2 bash -c 'exec 3<>"/dev/tcp/127.0.0.1/$1"' _ "$PORT" 2>/dev/null; then
  echo "port ${PORT} is already in use (another graph is running there?)."
  _opts=""; [ "$BIND" != 0.0.0.0 ] && _opts+="--bind $(printf '%q' "$BIND") "; [ "$INTERVAL" != 1 ] && _opts+="--interval $INTERVAL "
  echo "  add a port:  ./xray.sh ${_opts}$(printf '%q' "${1:-examples/q21-bgp-lp/q21.clab.yml}") $((PORT + 1))   - or stop the other one."
  exit 1
fi
# the graph server must be able to listen on --bind (checked before deploy, so nothing is left running)
if ! _berr="$(node -e 'var s=require("net").createServer();s.on("error",function(e){console.log(e.code||e.message);process.exit(1)});s.listen(+process.argv[2],process.argv[1],function(){s.close()})' "$BIND" "$PORT" 2>&1)"; then
  echo "the graph cannot listen on ${BIND_HP}:${PORT} (${_berr:-error}) - stopped, nothing was deployed."
  case "$_berr" in
    *EADDRNOTAVAIL*) echo "  ${BIND} is not an address of this machine. Use --bind 127.0.0.1 (this machine only) or --bind 0.0.0.0 (all addresses)." ;;
    *ENOTFOUND*|*EAI_AGAIN*) echo "  the name ${BIND} could not be resolved." ;;
    *EADDRINUSE*) echo "  port ${PORT} is already in use on ${BIND}: add a port or stop the other one." ;;
    *EACCES*) echo "  no permission to listen on port ${PORT}: use a port above 1023." ;;
  esac
  exit 1
fi

# which protocol to collect: BGP if any router runs BGP, else OSPF if any runs OSPF, else static
PROTO=static
# nx_demo_proto_ios: FRR frr.conf and IOS startup configs (*.cfg, e.g. the IOL examples' rN.partial.cfg)
if grep -qsE '^router bgp' "$LABDIR"/*/frr.conf "$LABDIR"/*.cfg "$LABDIR"/*/*.cfg; then PROTO=bgp
elif grep -qsE '^router ospf' "$LABDIR"/*/frr.conf "$LABDIR"/*.cfg "$LABDIR"/*/*.cfg; then PROTO=ospf; fi

# the problem text band reads problem.json next to the page (repo root): link this lab's one.
# nx_demo_pj_cleanup: xray.sh only touches a link it made (one into examples/ left by an earlier run, or the one made
# now); a problem.json you put there yourself is left alone. The link is removed again when xray.sh stops.
PJ="$HERE/problem.json"; PJ_MADE=""; CPID=""
# one xray.sh per checkout: every run writes the same xray-states.js and problem.json link in $HERE.
# The lock folder holds the pid; a lock whose pid is gone (xray.sh was killed) is taken over.
LOCK="$HERE/.xray.lock"
if ! mkdir "$LOCK" 2>/dev/null; then
  LPID="$(cat "$LOCK/pid" 2>/dev/null || true)"
  if [ -n "$LPID" ] && kill -0 "$LPID" 2>/dev/null; then
    echo "another xray.sh (pid $LPID) is already running from $HERE - stop it first."
    echo "  (if it is not running, remove $LOCK)"
    exit 1
  fi
  rm -rf "$LOCK"; mkdir "$LOCK" || { echo "could not create $LOCK"; exit 1; }
fi
echo $$ > "$LOCK/pid"
pj_ours() { [ -L "$PJ" ] && case "$(readlink "$PJ")" in "$HERE"/examples/*/problem.json) return 0 ;; esac; return 1; }
pj_cleanup() { [ -n "$PJ_MADE" ] && [ -L "$PJ" ] && [ "$(readlink "$PJ")" = "$PJ_MADE" ] && rm -f "$PJ"; return 0; }
# nx_demo_trap_true: set +e first - a failing step (e.g. the collector already ended on Ctrl-C) must not cut the clean-up short
trap 'set +e; pj_cleanup; [ -n "$CPID" ] && kill "$CPID" 2>/dev/null; rm -rf "$LOCK"; echo; echo "stopped. remove the lab with:  ${SUDO:+$SUDO }containerlab destroy -t $(printf '"'"'%q'"'"' "$YML") --cleanup"' EXIT
if pj_ours; then rm -f "$PJ"; fi   # left by an earlier xray.sh that was killed
if [ -f "$LABDIR/problem.json" ]; then
  if [ -e "$PJ" ] || [ -L "$PJ" ]; then echo "==> $PJ was not made by xray.sh - left as is (the problem band shows that file)"
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

# nx_cli_msgs: the IOS read interval is said only when the lab has a Cisco IOL node
_iosint=""; grep -qsE "kind:[[:space:]]*cisco_iol" "$YML" && _iosint=", Cisco IOS every ${NX_IOS_INTERVAL:-10} s"
if [ "$INTERVAL" = 1 ]; then _every="every second"; else _every="every ${INTERVAL} s"; fi
echo "==> collecting router state ${_every}${_iosint} (the page follows the lab by itself) ..."
node "$HERE/clab-xray-collect.js" "$YML" "$HERE" "$PROTO" --exclude-mgmt --watch --interval "$INTERVAL" &
CPID=$!   # the EXIT trap (set above, nx_demo_pj_cleanup) stops it and removes the problem.json link
sleep 8

echo ""
case "$BIND" in
  0.0.0.0|::) echo "==> open  http://<this machine>:${PORT}/   (listening on all addresses, ${BIND_HP}:${PORT}; Ctrl-C to stop)" ;;
  *) echo "==> open  http://${BIND_HP}:${PORT}/   (Ctrl-C to stop)" ;;
esac
# nx_bind_note (owner A, 2026-11-03): the default stays all interfaces - say so once, with the way to narrow it
[ -z "$BIND_SET" ] && echo "    listening on all interfaces (0.0.0.0) - to allow only this machine, use --bind 127.0.0.1"
echo "    Click any router to open its DeepDive. Fix the lab in a router's shell, e.g.:"
# nx_iol_demo_msgs: the shell by node kind (IOL has no vtysh: ssh with containerlab's cisco_iol default login)
# nx_cli_msgs: an FRR node is a linux node with an frr image (alpine hosts are linux too and have no vtysh)
_frrn="$(sed -n 's/^[[:space:]]*\([A-Za-z0-9_.-]*\):[[:space:]]*{[^}]*kind:[[:space:]]*linux[^}]*image:[^,}]*frr.*/\1/p' "$YML" | head -1)"
_ioln="$(sed -n 's/^[[:space:]]*\([A-Za-z0-9_.-]*\):[[:space:]]*{[^}]*kind:[[:space:]]*cisco_iol.*/\1/p' "$YML" | head -1)"
_srln="$(sed -n 's/^[[:space:]]*\([A-Za-z0-9_.-]*\):[[:space:]]*{[^}]*kind:[[:space:]]*nokia_srlinux.*/\1/p' "$YML" | head -1)"
[ -n "$_frrn" ] && echo "      docker exec -it clab-${LABNAME}-${_frrn} vtysh"
[ -n "$_ioln" ] && echo "      ssh admin@clab-${LABNAME}-${_ioln}   (password: admin)"
[ -n "$_srln" ] && echo "      docker exec -it clab-${LABNAME}-${_srln} sr_cli"
[ -z "$_frrn$_ioln$_srln" ] && echo "      docker exec -it clab-${LABNAME}-<node> vtysh   (FRR; sr_cli on SR Linux, ssh on Cisco IOL)"
echo "    and the picture follows within a few seconds."
containerlab graph --topo "$YML" --template "$TEMPLATE" --static-dir "$HERE" -s "${BIND_HP}:${PORT}"
