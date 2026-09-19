# xray-ospf — X-Ray live lab

```
docker compose up --build
```

Open **http://localhost:8080** and click any node to look inside the router (adjacencies, LSDB/BGP table, best-path decision).

## Edit the config, watch it follow
Edit a router's config file on your host — e.g. `r1/frr.conf` — then reload it:

```
./reload.sh r1
```

The X-Ray view updates within a few seconds (auto-follow is on by default; toggle it in the top-right).

Pure `docker compose` — no containerlab, no host node.js, no docker socket.
