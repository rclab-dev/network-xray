#!/bin/sh
# reload a router after you edit its ./<node>/frr.conf  ->  ./reload.sh <node>
n="${1:-r1}"
docker compose exec "$n" /usr/lib/frr/frr-reload.py --reload /etc/frr/frr.conf 2>/dev/null || docker compose exec "$n" vtysh -b
docker compose exec "$n" vtysh -c "clear ip bgp * soft" 2>/dev/null
echo "reloaded $n — the X-Ray view follows within a few seconds"
