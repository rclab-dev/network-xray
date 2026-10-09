#!/usr/bin/env bash
# network-xray demo for GitHub Codespaces / Dev Containers.
# Runs the same one-command demo as the README Quick start (./demo.sh) on port 8600, in the background:
# deploy examples/q21-bgp-lp (3 FRR routers, eBGP), keep collecting each router's live state, serve the X-Ray graph.
# postStartCommand runs on every start (also when a stopped codespace resumes) - safe to run again.
set -u
cd "$(dirname "$0")/.." || exit 1
LOG=/tmp/network-xray
mkdir -p "$LOG"

# already serving? then there is nothing to do (no second lab / collector / graph)
if (exec 3<>/dev/tcp/127.0.0.1/8600) 2>/dev/null; then
  echo "==> network-xray is already running on port 8600 (Ports tab)."
  exit 0
fi

# running as root inside the container -> demo.sh needs no sudo prefix
[ "$(id -u)" = 0 ] && export SUDO=

setsid nohup bash ./demo.sh examples/q21-bgp-lp/q21.clab.yml 8600 > "$LOG/demo.log" 2>&1 < /dev/null &
echo "==> network-xray is starting on port 8600 (Ports tab) - about 1-2 minutes. Log: $LOG/demo.log"
