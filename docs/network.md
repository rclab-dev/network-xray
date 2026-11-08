[日本語](ja/network.md)

# What network-xray connects to

network-xray has no telemetry, no analytics and no account. This page lists every connection it makes, so you can check
that for yourself. `node scripts/check-no-external.js` is a lint that looks for the usual ways a page or a script could
reach another host (script and style tags, `fetch`, WebSocket, workers, `curl`, tracking snippets, …) and fails on any
that is not listed below. It reads the source text: it finds the known patterns, it is not a proof.

## The page in your browser

- Everything the page loads comes from the graph server you started (`./xray.sh`, the container, or `containerlab graph`):
  the page, its scripts, styles, fonts and `xray-states.js`. No CDN, no web fonts, no analytics.
- **One exception, only when you press it:** on a RouteCrushLab problem (a `problem.json` with an RCL link), once it is
  solved, a **Preview** button can play a short video from `https://routecrushlab.com/static/pip/`. Nothing is fetched
  before you press the button.

## Reading the routers (the collector)

- `docker exec` into the lab's containers (FRR `vtysh`, SR Linux `sr_cli`) and SSH to Cisco IOL nodes on the lab's
  management network. All of these are on your machine. The collectors send only read commands: `show` (FRR, IOL) and
  `info from state` (SR Linux). The container also reads the running configuration at start and every 30 s to pick OSPF
  or BGP (`show running-config` / `info from running`).
- `./xray.sh` and a release's `run.sh`, right after they deploy a lab, restart FRR in a router whose FRR did not come up
  (`watchfrr.sh restart all`, at most 3 times). The configuration is not changed.

## Starting a lab (`xray.sh`, containerlab, netlab)

- containerlab (or netlab) pulls the lab's router images from their registries if you do not have them yet. That is
  containerlab / Docker doing what they always do; network-xray does not add to it.
- `./xray.sh` and the container print hint links (containerlab, Docker, Node.js install pages). They are printed, not
  opened.
- containerlab's own update check (it asks GitHub for its latest release) is turned off: `./xray.sh` and the container run
  containerlab with `CLAB_VERSION_CHECK=disable` unless you set that variable yourself.

## Building or pulling the image

- `docker pull ghcr.io/rclab-dev/network-xray` downloads the image from GitHub's registry.
- `docker build` downloads the base image (`node`, pinned by digest), the Alpine packages it adds (`apk add`: bash, docker-cli,
  openssh-client, … from the Alpine package mirrors) and one pinned containerlab release from GitHub, checked against its SHA-256.

## Links you click

- The README, the page and `problem.json` contain ordinary links (GitHub, routecrushlab.com, RFCs, …). They open only
  when you click them.

## MCP server

- `scripts/xray-mcp.js` talks to its client over stdio and reads `xray-states.js` and `problem.json` on your machine. It
  opens no network connection.
