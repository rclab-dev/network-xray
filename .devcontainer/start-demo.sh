#!/usr/bin/env bash
# network-xray demo for GitHub Codespaces / Dev Containers.
# Runs the same one-command demo as the README Quick start (./xray.sh) on port 8600, in the background:
# deploy examples/q21-bgp-lp (3 FRR routers, eBGP), keep collecting each router's live state, serve the X-Ray graph.
# Called from postStartCommand on every start (also when a stopped codespace resumes) - safe to run again
# (a lock keeps it to one demo). To follow it: tail -f /tmp/network-xray/demo.log
# Log: /tmp/network-xray/demo.log (the demo) and /tmp/network-xray/start.log (each call of this script).
set -u
cd "$(dirname "$0")/.." || exit 1
LOG=/tmp/network-xray
mkdir -p "$LOG"
say() { echo "[$(date '+%F %T')] $*" | tee -a "$LOG/start.log"; }
say "start-demo.sh (${1:-start}) as $(id -un), in $PWD"
missing() { say "ERROR: $1 not found - the demo cannot start. $2"; exit 1; }
for t in flock setsid timeout; do command -v "$t" >/dev/null 2>&1 || missing "$t" "(util-linux / coreutils)"; done

# already serving? then there is nothing to do
if timeout 2 bash -c 'exec 3<>/dev/tcp/127.0.0.1/8600' 2>/dev/null; then
  say "network-xray is already running on port 8600 (Ports tab)."
  exit 0
fi

# one demo at a time: the shell that waits for the demo keeps this lock (the port alone is not enough - it
# stays empty for the first 2-3 minutes while the lab is deployed). xray.sh and its children do NOT get the
# lock fd (9>&-), so a collector/graph left behind by a killed xray.sh cannot hold the lock forever.
exec 9>"$LOG/demo.lock"
if ! flock -n 9; then
  say "network-xray is already starting or running (port 8600, Ports tab). Log: $LOG/demo.log"
  exit 0
fi

# containerlab needs root: no prefix as root, else sudo when it works without a password
if [ "$(id -u)" = 0 ]; then export SUDO=
elif sudo -n true 2>/dev/null; then export SUDO=sudo
else export SUDO=; say "note: sudo needs a password here - running containerlab without sudo"; fi

# node from the devcontainer feature may live under nvm and not be on PATH for lifecycle commands
if ! command -v node >/dev/null 2>&1; then
  for d in /usr/local/share/nvm/current/bin /usr/local/share/nvm/versions/node/*/bin "$HOME"/.nvm/versions/node/*/bin; do
    [ -x "$d/node" ] && { export PATH="$d:$PATH"; break; }
  done
fi
command -v node >/dev/null 2>&1 || missing node "(the devcontainer node feature)"
command -v containerlab >/dev/null 2>&1 || missing containerlab "(https://containerlab.dev/install/)"
command -v docker >/dev/null 2>&1 || missing docker "(docker-in-docker)"

# --foreground: stay in the foreground (run it by hand in a terminal to watch the demo; it stops with the terminal);
# the lock (fd 9) is held by this shell until the demo ends.
if [ "${2:-}" = "--foreground" ]; then
  say "network-xray is starting on port 8600 (Ports tab) - about 2-3 minutes. Log: $LOG/demo.log"
  for i in $(seq 1 90); do $SUDO docker info >/dev/null 2>&1 && break; sleep 2; done
  bash ./xray.sh --bind 127.0.0.1 examples/q21-bgp-lp/q21.clab.yml 8600 9>&- < /dev/null 2>&1 | tee "$LOG/demo.log" 9>&-
  exit "${PIPESTATUS[0]}"
fi

# detached (own session, not a child of this hook) - waits for docker (DinD may still be starting), then the demo.
# The lock (fd 9) stays with this waiting bash only and is released when the demo ends.
setsid -f bash -c '
  LOG=/tmp/network-xray
  echo "[$(date "+%F %T")] waiting for docker ..."
  for i in $(seq 1 90); do $SUDO docker info >/dev/null 2>&1 && break; sleep 2; done
  $SUDO docker info >/dev/null 2>&1 || echo "[$(date "+%F %T")] docker did not answer in 3 minutes - trying anyway"
  echo "[$(date "+%F %T")] starting ./xray.sh (SUDO=${SUDO:-none}, node=$(command -v node || echo missing))"
  bash ./xray.sh --bind 127.0.0.1 examples/q21-bgp-lp/q21.clab.yml 8600 9>&-
' > "$LOG/demo.log" 2>&1 < /dev/null
say "network-xray is starting on port 8600 (Ports tab) - about 2-3 minutes. Log: $LOG/demo.log"
