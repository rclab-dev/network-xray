#!/usr/bin/env bash
# network-xray container entrypoint: watch a running containerlab / netlab lab and serve the graph on :8600.
#   network-xray [--topo /lab/clab.yml] [--port 8600] [--proto auto|ospf|bgp|static] [--interval 2]
# - reads router state with `docker exec <node> vtysh -c 'show ...'` (FRR) / sr_cli (SR Linux): read-only, no config changes
# - proto=auto: asks the routers every 30 s whether they run BGP or OSPF (a netlab lab may be started with --no-config
#   and configured later), and restarts the collector when the answer changes
set -u
TOPO=/lab/clab.yml; PORT=8600; PROTO=auto; INTERVAL=2
while [ $# -gt 0 ]; do
  case "$1" in
    --topo) TOPO="$2"; shift ;;
    --port) PORT="$2"; shift ;;
    --proto) PROTO="$2"; shift ;;
    --interval) INTERVAL="$2"; shift ;;
    -h|--help) sed -n '2,6p' "$0"; exit 0 ;;
    *) echo "unknown option: $1" >&2; exit 2 ;;
  esac
  shift
done

SRC=/opt/network-xray; WORK=/tmp/network-xray
[ -f "$TOPO" ] || { echo "topology not found: $TOPO (mount the lab directory: -v \"\$(pwd)\":/lab:ro)" >&2; exit 1; }
docker info >/dev/null 2>&1 || { echo "cannot talk to Docker: mount the socket (-v /var/run/docker.sock:/var/run/docker.sock)" >&2; exit 1; }

# a writable copy of the viewer: the collector writes xray-states.js next to the page
rm -rf "$WORK"; mkdir -p "$WORK"; cp -a "$SRC"/. "$WORK"/; rm -rf "$WORK/examples" "$WORK/docker"
# example labs: a problem.json next to the topology -> the problem band and ✓ Solved, as with demo.sh
# (the collector already reads it for the check). No problem.json (netlab / your own lab) -> no band.
rm -f "$WORK/problem.json"
[ -f "$(dirname "$TOPO")/problem.json" ] && cp "$(dirname "$TOPO")/problem.json" "$WORK/problem.json"
# read the topology where it is (netlab's clab.yml points at node_files/... relative to its own directory)
LABNAME="$(sed -n 's/^name:[[:space:]]*//p' "$TOPO" | head -1 | tr -d '"'"'"'')"
PREFIX="$(sed -n 's/^prefix:[[:space:]]*//p' "$TOPO" | head -1 | tr -d '"'"'"'')"
[ -n "$LABNAME" ] || { echo "could not read 'name:' from $TOPO" >&2; exit 1; }
# the collectors name containers clab-<lab>-<node> (the containerlab / netlab default): other prefixes are not supported yet
case "$PREFIX" in ''|clab) CPFX="clab-$LABNAME-" ;; *) echo "topology prefix '$PREFIX' is not supported (use the default 'clab')" >&2; exit 1 ;; esac
# management network to leave out of the view: the topology's mgmt ipv4-subnet (netlab uses its own), else the clab default
MGMT="$(awk '/^mgmt:/{f=1;next} f&&/^[^ ]/{f=0} f&&/ipv4[-_]subnet:/{print $2; exit}' "$TOPO" | tr -d '"'"'"'')"
if [ -n "$MGMT" ]; then MGARG="--mgmt-subnet $MGMT"; else MGARG="--exclude-mgmt"; fi

routers() { docker ps --format '{{.Names}}' | grep "^${CPFX}" || true; }

detect_proto() {
  local c p=static
  for c in $(routers); do
    if docker exec "$c" sh -c 'command -v vtysh' >/dev/null 2>&1; then
      local cfg; cfg=$(docker exec "$c" timeout 5 vtysh -c 'show running-config' 2>/dev/null)
      echo "$cfg" | grep -q '^router bgp' && { echo bgp; return; }
      echo "$cfg" | grep -q '^router ospf' && p=ospf
    elif docker exec "$c" sh -c 'command -v sr_cli' >/dev/null 2>&1; then
      local srl; srl=$(docker exec "$c" timeout 8 sr_cli -d 'info from running network-instance default protocols' 2>/dev/null)
      echo "$srl" | grep -q 'bgp' && { echo bgp; return; }
      echo "$srl" | grep -q 'ospf' && p=ospf
    fi
  done
  echo "$p"
}

COLLECT_PID=""; GRAPH_PID=""
start_collect() {
  [ -n "$COLLECT_PID" ] && kill "$COLLECT_PID" 2>/dev/null && wait "$COLLECT_PID" 2>/dev/null
  node "$WORK/clab-xray-collect.js" "$TOPO" "$WORK" "$1" $MGARG --watch --interval "$INTERVAL" &
  COLLECT_PID=$!
  echo "==> collecting $1 state from lab '$LABNAME' (containers ${CPFX}*)"
}
cleanup() { [ -n "$COLLECT_PID" ] && kill "$COLLECT_PID" 2>/dev/null; [ -n "$GRAPH_PID" ] && kill "$GRAPH_PID" 2>/dev/null; exit 0; }
trap cleanup TERM INT

# wait (up to 2 min) for the lab's containers to exist
for i in $(seq 1 60); do [ -n "$(routers)" ] && break; sleep 2; done
[ -n "$(routers)" ] || echo "no running containers named ${CPFX}* yet - waiting for the lab" >&2

CUR="$PROTO"; [ "$PROTO" = auto ] && CUR="$(detect_proto)"
start_collect "$CUR"
cd "$WORK" || exit 1
containerlab graph --topo "$TOPO" --template xray-graph-nextui.html --static-dir "$WORK" -s "0.0.0.0:$PORT" &
GRAPH_PID=$!
echo "==> network-xray on :$PORT (reads routers with docker exec 'show' commands only)"

while kill -0 "$GRAPH_PID" 2>/dev/null; do
  sleep 30
  if [ "$PROTO" = auto ]; then
    NEW="$(detect_proto)"
    if [ "$NEW" != "$CUR" ]; then echo "==> routing changed: $CUR -> $NEW"; CUR="$NEW"; start_collect "$CUR"; fi
  fi
  kill -0 "$COLLECT_PID" 2>/dev/null || start_collect "$CUR"
done
echo "graph server stopped" >&2
cleanup
