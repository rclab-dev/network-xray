#!/bin/sh
export XRAY_VTY_SOCK_DIR=/socks
cd /collector
first=1
echo "collector-watch: socketless re-collect (3s) -> /web/xray-states.js"
while true; do
  node clab-xray-collect.js topo.clab.yml /collector bgp >/tmp/collect.log 2>&1 || true
  if [ -f /collector/xray-states.js ]; then
    # anti-flicker: hold the first publish until the lab has converged (a best route / Full adj),
    # so the initial view is never an empty "no routes" flash. after that, publish every cycle.
    if [ "$first" = "1" ]; then grep -qE '"best":true|"full":true|"state":"Full"' /collector/xray-states.js && first=0; fi
    if [ "$first" = "0" ]; then cp -f /collector/xray-states.js /web/.xs.tmp && mv -f /web/.xs.tmp /web/xray-states.js; fi
  fi
  sleep 3
done
