#!/usr/bin/env bash
# network-xray — one command: deploy a containerlab lab, keep collecting each router's live
# state, and serve the X-Ray graph (click any node to look inside the router).
#
#   ./xray.sh [--attach] [--bind <address>] [--interval <seconds>] [lab.clab.yml] [port] [template.html]
#
#   lab       default: examples/q21-bgp-lp/q21.clab.yml (BGP best-path / LocalPref)
#   port      default: 8080   -> open http://<this machine>:8080/
#   template  default: xray-graph-nextui.html (NeXt UI overview + X-Ray DeepDive)
#   --bind <address>      address the graph page listens on. default: 0.0.0.0 (all addresses, as before -
#                         a lab on a server / VM is opened from your PC); --bind 127.0.0.1 = this machine only
#   --interval <seconds>  how often the collector reads the routers (whole seconds). default: 1
#   --check               only check what this run needs (docker, containerlab, node, port, topology,
#                         IOL image) and say what to fix; nothing is started or changed. exit 0 = ready
#   --attach              do not deploy: collect from and graph the lab that is already running (the lab named
#                         in the topology), so changes made by hand in the routers are kept
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
BIND=0.0.0.0; BIND_SET=""; INTERVAL=1; CHECK=""; ATTACH=""; POS=()
usage() {
  cat <<'EOF'
usage: ./xray.sh [--bind <address>] [--interval <seconds>] [--check] [--attach] [lab.clab.yml] [port] [template.html]
  deploy a containerlab lab, keep collecting each router's state and serve the X-Ray graph
  lab                   default: examples/q21-bgp-lp/q21.clab.yml
  port                  default: 8080
  template              default: xray-graph-nextui.html
  --bind <address>      address the graph listens on (default: 0.0.0.0 = all; 127.0.0.1 = this machine only)
  --interval <seconds>  how often the collector reads the routers, whole seconds (default: 1)
  --check               only check what this run needs and say what to fix; nothing is started
  --attach              do not deploy: graph the lab that is already running (changes made by hand are kept)
  -h, --help            show this help
  env: SUDO= (privilege prefix, default sudo), NX_IOS_INTERVAL (Cisco IOS read interval, default 10)
EOF
}
while [ $# -gt 0 ]; do
  case "$1" in
    -h|--help) usage; exit 0 ;;
    --check) CHECK=1; shift ;;
    --bind|--interval)
      [ $# -ge 2 ] || { echo "$1 needs a value (see ./xray.sh --help)"; exit 1; }
      if [ "$1" = --bind ]; then BIND="$2"; BIND_SET=1; else INTERVAL="$2"; fi; shift 2 ;;
    --bind=*) BIND="${1#--bind=}"; BIND_SET=1; shift ;;
    --interval=*) INTERVAL="${1#--interval=}"; shift ;;
    --attach) ATTACH=1; shift ;;
    -?*) echo "xray.sh: unknown option: $1" >&2; echo "Try './xray.sh --help'." >&2; exit 2 ;;
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

# --check: one line per item, OK or FAIL + what to do. Nothing is deployed, started or written
# (the --bind probe below only opens and closes the port, like the check before deploy).
if [ -n "$CHECK" ]; then
  _fails=0
  ok() { echo "OK    $*"; }
  bad() { echo "FAIL  $*"; _fails=$((_fails + 1)); }
  _t() { if command -v timeout >/dev/null 2>&1; then timeout 10 "$@"; else "$@"; fi; }
  DOCKER=""
  if ! command -v docker >/dev/null 2>&1; then
    bad "docker: not found - https://docs.docker.com/engine/install/"
  elif _t docker info >/dev/null 2>&1; then
    DOCKER=docker; ok "docker: reachable (no sudo needed)"
  elif [ -n "$SUDO" ] && _t $SUDO -n docker info >/dev/null 2>&1; then
    DOCKER="$SUDO -n docker"
    bad "docker: works only with $SUDO - the collector runs docker without it: sudo usermod -aG docker \$USER, then log in again"
  elif [ -n "$SUDO" ] && ! _t $SUDO -n true >/dev/null 2>&1; then
    bad "docker: not reachable without $SUDO, and $SUDO asks for a password - run '$SUDO -v', then ./xray.sh --check again"
  else
    bad "docker: not reachable - start it (sudo systemctl start docker) or check: docker info"
  fi
  if command -v containerlab >/dev/null 2>&1; then
    _cv="$(CLAB_VERSION_CHECK=disable _t containerlab version 2>/dev/null | sed -n 's/^[[:space:]]*version:[[:space:]]*//p' | head -1)" || _cv=""   # a failing version must not end the check (set -e)
    ok "containerlab: ${_cv:-found (version unknown)}"
  else
    bad "containerlab: not found - https://containerlab.dev/install/"
  fi
  if ! command -v node >/dev/null 2>&1; then
    bad "node: not found - install Node.js 18 or newer (https://nodejs.org/)"
  else
    _nv="$(node -e 'console.log(process.versions.node)' 2>/dev/null || true)"
    case "${_nv%%.*}" in
      ''|*[!0-9]*) bad "node: could not read its version - check: node --version" ;;
      *) if [ "${_nv%%.*}" -ge 18 ]; then ok "node: $_nv"; else bad "node: $_nv is too old - install Node.js 18 or newer"; fi ;;
    esac
  fi
  _p="$PORT"; case "$_p" in ''|*[!0-9]*) _p=x ;; esac
  if [ "$_p" = x ] || [ ${#_p} -gt 5 ] || [ "$((10#$_p))" -lt 1 ] || [ "$((10#$_p))" -gt 65535 ]; then
    bad "port: must be a number from 1 to 65535: $PORT"
  else
    _p=$((10#$_p))
    if timeout 2 bash -c 'exec 3<>"/dev/tcp/127.0.0.1/$1"' _ "$_p" 2>/dev/null; then
      bad "port $_p: already in use (another graph is running there?) - add a port, e.g. $((_p + 1)), or stop the other one"
    elif command -v node >/dev/null 2>&1 && ! _berr="$(node -e 'var s=require("net").createServer();s.on("error",function(e){console.log(e.code||e.message);process.exit(1)});s.listen(+process.argv[2],process.argv[1],function(){s.close()})' "$BIND" "$_p" 2>&1)"; then
      bad "port $_p: the graph cannot listen on ${BIND_HP}:${_p} (${_berr:-error})"
    else
      ok "port $_p: free on ${BIND_HP}"
    fi
  fi
  [ -f "$TEMPLATE" ] && [ -r "$TEMPLATE" ] && ok "template: $TEMPLATE" || bad "template: not found or not readable: $TEMPLATE"
  if [ ! -f "$YML" ] || [ ! -r "$YML" ]; then
    bad "topology: not found or not readable: $YML"
  else
    _ln="$(sed -n 's/^name:[[:space:]]*//p' "$YML" | head -1)"
    case "$_ln" in
      '') bad "topology: could not read 'name:' from $YML - add a line such as  name: mylab" ;;
      [!A-Za-z0-9]*|*[!A-Za-z0-9_.-]*) bad "topology: the lab name in $YML is not a plain name (letters, digits, _ . -) - rename it" ;;
      *) ok "topology: $YML (lab '$_ln')" ;;
    esac
    if grep -qsE "kind:[[:space:]]*cisco_iol" "$YML"; then
      # the image under kinds: cisco_iol:, any image: on a cisco_iol node line, and image: inside a
      # cisco_iol node written over several lines (kind: and image: under the node name)
      _imgs="$( { awk '/^[[:space:]]*cisco_iol:[[:space:]]*$/{k=1;next} k&&/^[[:space:]]*image:/{sub(/^[[:space:]]*image:[[:space:]]*/,"");print;k=0;next} k&&/^[[:space:]]*[A-Za-z0-9_-]+:/{k=0}' "$YML"
                  sed -n 's/.*kind:[[:space:]]*cisco_iol[^}]*image:[[:space:]]*\([^,} ]*\).*/\1/p' "$YML"
                  awk 'function ind(s){match(s,/^ */);return RLENGTH}
                       function pop(i){while(d>0&&H[d]>=i){if(K[d]&&M[d]!="")print M[d];d--}}
                       /^[[:space:]]*(#|$)/{next}
                       /^[[:space:]]*[A-Za-z0-9_.-]+:[[:space:]]*$/{i=ind($0);pop(i);d++;H[d]=i;K[d]=0;M[d]="";next}
                       /^[[:space:]]*kind:/{pop(ind($0));if(d>0&&$0~/kind:[[:space:]]*["\047]?cisco_iol["\047]?[[:space:]]*$/)K[d]=1;next}
                       /^[[:space:]]*image:/{pop(ind($0));if(d>0){v=$0;sub(/^[[:space:]]*image:[[:space:]]*/,"",v);M[d]=v};next}
                       END{pop(0)}' "$YML"; } | tr -d "\"'" | sort -u)"
      if [ -z "$_imgs" ]; then
        bad "IOL image: the topology has cisco_iol nodes but no image: line for them - add one under kinds: cisco_iol:"
      else
        for _img in $_imgs; do
          if [ -z "$DOCKER" ]; then bad "IOL image $_img: cannot check (docker not reachable)"
          elif _t $DOCKER image inspect "$_img" >/dev/null 2>&1; then ok "IOL image $_img: present"
          else bad "IOL image $_img: not found locally - build it with vrnetlab (cisco_iol) or change the image line in $YML"; fi
        done
      fi
    fi
  fi
  if [ "$_fails" -eq 0 ]; then echo "all checks passed - ready to run ./xray.sh"; exit 0; fi
  echo "$_fails problem(s) - fix the FAIL lines above, then run ./xray.sh --check again"
  exit 1
fi

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
  _opts=""; [ -n "$ATTACH" ] && _opts+="--attach "; [ "$BIND" != 0.0.0.0 ] && _opts+="--bind $(printf '%q' "$BIND") "; [ "$INTERVAL" != 1 ] && _opts+="--interval $INTERVAL "
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

# is the lab named in the topology already running? (its containers carry the containerlab=<name> label)
RUNNING=""
if _ps="$(docker ps --filter "label=containerlab=${LABNAME}" --format '{{.Names}}' 2>/dev/null)" && [ -n "$_ps" ]; then RUNNING=1; fi
if [ -n "$ATTACH" ]; then
  [ -n "$RUNNING" ] || { echo "lab '$LABNAME' is not running - start it first, or run xray.sh without --attach to deploy it."; exit 1; }
else
  [ -n "$RUNNING" ] && echo "==> warning: lab '$LABNAME' is already running - redeploying it loses changes made by hand; --attach (or the docker run command in the README) keeps them."
fi

# which protocol to collect: BGP if any router runs BGP, else OSPF if any runs OSPF, else static
PROTO=static
# nx_demo_proto_ios: FRR frr.conf and IOS startup configs (*.cfg, e.g. the IOL examples' rN.partial.cfg)
if grep -qsE '^router bgp' "$LABDIR"/*/frr.conf "$LABDIR"/*.cfg "$LABDIR"/*/*.cfg; then PROTO=bgp
elif grep -qsE '^router ospf' "$LABDIR"/*/frr.conf "$LABDIR"/*.cfg "$LABDIR"/*/*.cfg; then PROTO=ospf; fi

# the problem text band reads problem.json next to the page (repo root): link this lab's one.
# nx_demo_pj_cleanup: xray.sh only touches a link it made (one into examples/ left by an earlier run, or the one made
# now); a problem.json you put there yourself is left alone. The link is removed again when xray.sh stops.
PJ="$HERE/problem.json"; PJ_MADE=""; CPID=""; SERVE=""
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
STOPPED="stopped."; [ -n "$ATTACH" ] && STOPPED="stopped (the lab is still running)."
# nx_demo_trap_true: set +e first - a failing step (e.g. the collector already ended on Ctrl-C) must not cut the clean-up short
trap 'set +e; pj_cleanup; [ -n "$CPID" ] && kill "$CPID" 2>/dev/null; [ -n "$SERVE" ] && rm -rf "$SERVE"; rm -rf "$LOCK"; echo; echo "$STOPPED remove the lab with:  ${SUDO:+$SUDO }containerlab destroy -t $(printf '"'"'%q'"'"' "$YML") --cleanup"' EXIT
if pj_ours; then rm -f "$PJ"; fi   # left by an earlier xray.sh that was killed
if [ -f "$LABDIR/problem.json" ]; then
  if [ -e "$PJ" ] || [ -L "$PJ" ]; then echo "==> $PJ was not made by xray.sh - left as is (the problem band shows that file)"
  else ln -s "$LABDIR/problem.json" "$PJ" && PJ_MADE="$LABDIR/problem.json"; fi
fi

if [ -n "$ATTACH" ]; then
  echo "==> attaching to running lab '$LABNAME' ($PROTO) - not redeployed"
else
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
fi   # --attach: the FRR wait is skipped too (a restart would drop changes made by hand)

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
# nx_serve_dir: the graph serves a folder of links to the page's own files only - not the whole checkout
# (the page asks for /static/<file>; .git, examples/<lab>/clab-<name>/ and the rest are not reachable).
# Links, not copies: xray-states.js and the problem.json link stay live. The EXIT trap removes the folder.
SERVE="$(mktemp -d "${TMPDIR:-/tmp}/network-xray-serve.XXXXXX")"
for f in "$HERE"/*.html "$HERE"/*.js "$HERE"/*.css; do [ -f "$f" ] && ln -s "$f" "$SERVE/"; done
for d in css js fonts pip; do [ -d "$HERE/$d" ] && ln -s "$HERE/$d" "$SERVE/$d"; done
for f in xray-states.js problem.json; do [ -e "$SERVE/$f" ] || ln -s "$HERE/$f" "$SERVE/$f"; done   # may not exist yet: the link works once it does
containerlab graph --topo "$YML" --template "$TEMPLATE" --static-dir "$SERVE" -s "${BIND_HP}:${PORT}"
