[日本語](ja/faq.md)

# network-xray FAQ

Short answers for network engineers looking at network-xray for the first time. Each answer points to the part of the
[README](../README.md) that has the details.

## What it reads

### What does network-xray actually do?

It reads the current state of the routers in a running containerlab or netlab lab (neighbors, routes, the BGP table)
and draws it in the browser: a topology view of the whole lab, and a "DeepDive" view inside one router. The main
question it answers is why a router chose a path: the Best-Path Decision panel lines up the BGP candidates and shows the
reason the winner won. See [When to use](../README.md#when-to-use) and [See it](../README.md#see-it).

### Which routers can it read?

FRR, Nokia SR Linux (containerlab kind `nokia_srlinux`) and Cisco IOS-XE IOL (containerlab kind `cisco_iol`). The
collector picks the reader from each node's containerlab `kind`, so one lab can mix the three. The versions that have
been tried are listed under **Tested with** in [When to use](../README.md#when-to-use).

### How does it read them?

FRR is read with `docker exec <node> vtysh -c 'show … json'`, SR Linux with `sr_cli 'info from state … | as json'`,
and Cisco IOL over SSH with plain-text `show` commands. The full list of commands is in
[When to use](../README.md#when-to-use) and [Cisco IOS-XE (IOL)](../README.md#cisco-ios-xe-iol). There is no agent to
install on the routers and no SNMP, gNMI or streaming telemetry.

### Does it ever change the routers' configuration?

No. The collectors only run `show` commands (FRR, IOL) and `info from state` (SR Linux), and never enter configuration
mode. On IOL the SSH session also sets `terminal length 0` and `terminal width 0`, which last only for that session. Any change you see in the picture comes from a change you made yourself in the lab.

### Is the Best-Path winner network-xray's own calculation?

No. The winner is always the path the router itself marked best (FRR's `bestpath`). The panel explains the reason by
comparing the candidates on Weight, Local Preference, AS path, origin and MED, and, where those do not decide it, shows
FRR's own `selectionReason`. For Cisco IOL the reason is worked out from the printed `show ip bgp` columns. See
[See it](../README.md#see-it) and [Query from a script or an AI assistant](../README.md#query-from-a-script-or-an-ai-assistant).

## How it compares

### How is it different from a topology drawer (containerlab graph, NeXt UI, TopoViewer)?

A topology drawer shows what is cabled to what. network-xray sits on top of that view: it colours each link by the
protocol session running over it, and lets you click a router to see its routing table, BGP table and the route it
installed. It uses `containerlab graph --template` for the topology itself. See
[containerlab graph template](../README.md#containerlab-graph-template).

### How is it different from config analysis tools such as Batfish?

Batfish reads configurations and models what the network would do, usually before deployment. network-xray reads the
live state of routers that are already running (`show` output) and draws what they actually did. Different input,
different question. See [When to use](../README.md#when-to-use).

### How is it different from state collectors such as SuzieQ?

SuzieQ collects state from many devices over time and lets you query it as tables. network-xray keeps only the latest
state of each router in a lab and draws one router's decision; it does not store history. See
[When to use](../README.md#when-to-use).

### Is it a simulator or a monitoring tool?

Neither. It does not compute routes or run protocols; it draws the state the routers report. It is also not meant for
production monitoring. See [Scope & maintenance](../README.md#scope--maintenance).

## How live it is

### How often does it re-read the routers?

`xray.sh` and `clab-xray-collect.js --watch` read once per second by default. The `docker run` / netlab container reads
every 2 seconds (change it with `--interval N`). Cisco IOL nodes are read every 10 seconds, because each read is an SSH
login and several `show` commands (change it with `NX_IOS_INTERVAL`). See
[FAQ / Troubleshooting](../README.md#faq--troubleshooting) and [Cisco IOS-XE (IOL)](../README.md#cisco-ios-xe-iol).

### How quickly does the page follow a change in the lab?

The page used by `xray.sh`, the container and the netlab tool (`xray-graph-nextui.html`) checks for new state every
second (the static `xray-graph.html` every 3 seconds) and redraws only when the state has changed, so a change shows up within a few seconds.
The protocol itself still has to converge first: an OSPF adjacency or BGP session needs its own time to come up or go
down. See [Quick start](../README.md#quick-start-run-a-lab-in-containerlab).

### What if a router stops answering?

A router that is stopped is drawn grey with the reason. One that stops answering keeps its last state, marked as old, and
is asked again about 10 seconds later, while the rest of the picture keeps updating. See the
[netlab tool](../README.md#netlab-tool) section.

## Limits

### What happens with a vendor it does not read (Arista cEOS, Juniper, Linux hosts, …)?

The node still appears in the topology, drawn grey, and its DeepDive says that network-xray does not read inside this device. The
other routers are read as usual. Other Cisco IOS-XE kinds (`cisco_c8000v`, `cisco_csr1000v`, `cisco_cat9kv`) are not read
either. See [When to use](../README.md#when-to-use) and [Cisco IOS-XE (IOL)](../README.md#cisco-ios-xe-iol).

### Are VRFs supported?

On FRR, yes: the routing table and BGP table of each VRF are read, and VRF buttons switch between them, one VRF at a
time (the management VRF `mgmt` gets no button unless BGP or OSPF runs in it). On SR Linux only the `default` network-instance is read. On Cisco IOL,
VRFs are not read: a lab with VRFs shows a warning instead of a wrong picture. See
[When to use](../README.md#when-to-use) and [Cisco IOS-XE (IOL)](../README.md#cisco-ios-xe-iol).

### Is IPv6 read?

On FRR, OSPFv3 neighbors, interfaces and the IPv6 routing table are read on routers with `router ospf6`. The IPv6 BGP
table is not read. See [When to use](../README.md#when-to-use).

### What if some output cannot be parsed?

For Cisco IOL, lines the parser does not understand are recorded as `parse_warnings`, and the page shows how many; it
does not guess. If a router answers but the page stays empty, the steps in
[FAQ / Troubleshooting](../README.md#faq--troubleshooting) show how to check the router directly.

## Security

### Does the page have a login?

No. Anyone who can reach the port can see the lab's state. `xray.sh` and `containerlab graph … -s 0.0.0.0:8080` listen
on all interfaces, so keep the machine on a trusted network, or limit it to this machine: `./xray.sh --bind 127.0.0.1 <lab>`
(or `-s 127.0.0.1:8080` for `containerlab graph`). See
[Security notes](../README.md#security-notes).

### Why does the container need the Docker socket?

The `docker run` / netlab container reads FRR and SR Linux with `docker exec`, so it is given
`/var/run/docker.sock`. Anyone who can use that socket can run anything as root on the host, so run the container only on a lab
machine. See [Security notes](../README.md#security-notes).

### How do I keep the page to my own machine?

With `docker run`, publish the port as `-p 127.0.0.1:8600:8600` (the README's command already does this); `-p 8600:8600`
opens it to other machines. With `containerlab graph`, use `-s 127.0.0.1:8080`. See
[Security notes](../README.md#security-notes).

### Are passwords stored anywhere?

For Cisco IOL, the SSH password comes from `NX_IOS_PASSWORD` (default `admin`), is passed through an askpass file, and is
not printed or written to the state; SSH host keys are not checked, so use this only on the lab's management network. With
the netlab tool, `network-xray.json` holds the lab's values, passwords included, while the lab is up, and `netlab down`
removes it. See [Security notes](../README.md#security-notes) and the [netlab tool](../README.md#netlab-tool) section.

## Trying it

### Can I try it without installing anything?

Yes. The [recorded Best-Path Decision demo](https://rclab-dev.github.io/network-xray/demo/index-bgp-lp.html) replays a
real FRR lab in the browser. The paste pages (`frr-paste.html`, `bgp-paste.html`, `srl-paste.html`) draw your own
`show` output and run entirely in the browser: nothing is uploaded. See [See it](../README.md#see-it) and
[Bring your own network](../README.md#bring-your-own-network).

### Can I change a real lab without installing anything locally?

Yes, with GitHub Codespaces: the button in the README starts a 3-router FRR lab and opens the page on port 8600 in about
2–3 minutes. It needs a GitHub login, uses your own Codespaces quota (delete the codespace when you are done), and only
runs container-based nodes such as FRR. See
[Change a real lab yourself — GitHub Codespaces](../README.md#-change-a-real-lab-yourself--github-codespaces).

### Can I use it offline, from saved output?

Yes. `clab-collect.js --fixtures <dir>` and `frr-collect.js --from-dir <dir>` build the state from saved FRR
`show … json` files (`fixtures/` has samples), and `scripts/xray-query.js` answers questions from saved state with no
router contacted. See [containerlab graph template](../README.md#containerlab-graph-template) and
[Query from a script or an AI assistant](../README.md#query-from-a-script-or-an-ai-assistant).

### What do I need to run it on my own lab?

Either the container image (`docker run … ghcr.io/rclab-dev/network-xray:1 --topo /lab/<lab>.clab.yml`), the netlab tool,
or a clone of this repository with Node.js 18+, Docker and containerlab on Linux or WSL2. See
[Quick start](../README.md#quick-start-run-a-lab-in-containerlab) and the [netlab tool](../README.md#netlab-tool) section.

## Project

### What is the licence?

MIT, copyright RouteCrushLab. The opt-in NeXt UI graph (`xray-graph-nextui.html`) bundles the NeXt UI Toolkit under
EPL-1.0; the default `xray-graph.html` is MIT only. See [License](../README.md#license) and
[THIRD_PARTY_NOTICES.md](../THIRD_PARTY_NOTICES.md).

### Can I contribute code?

Pull requests are not accepted; the project has a single maintainer and keeps a single copyright holder. Issues are read,
with no SLA, and forking is welcome under the licence. See [Scope & maintenance](../README.md#scope--maintenance).

### The picture looks wrong. How do I report it?

Open an issue with the "Something is wrong or missing in the picture" template, and attach the router's raw output
(`show … json`) so it can be used as a fixture. For a router OS or version it does not read, use the "A router OS or
version it does not read" template. Do not attach `network-xray.json`: it holds the lab's passwords. See
[FAQ / Troubleshooting](../README.md#faq--troubleshooting).
