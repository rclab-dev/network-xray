[日本語](ja/troubleshooting.md)

# Troubleshooting

Problems that `xray.sh` and the collector (`clab-xray-collect.js`) detect, and what to do about them.
Messages are shown as the tools print them; `<...>` stands for your own value.
"The network-xray log" means the terminal that runs `xray.sh` (or the collector), or `docker logs <container>` for the
`docker run` / netlab container.
On Windows, see [Running on Windows (WSL2)](windows-wsl2.md) first.

- [The page does not open](#the-page-does-not-open)
- [Port already in use](#port-already-in-use)
- [Topology not found](#topology-not-found)
- [Lab name is not a plain name](#lab-name-is-not-a-plain-name)
- [containerlab or Node.js missing](#containerlab-or-nodejs-missing)
- [Filename too long when cloning (Windows)](#filename-too-long-when-cloning-windows)
- [Docker socket permission](#docker-socket-permission)
- [Routers still booting (Cisco IOL)](#routers-still-booting-cisco-iol)
- [FRR did not start cleanly](#frr-did-not-start-cleanly)
- [Device type that is not read (drawn only)](#device-type-that-is-not-read-drawn-only)
- [Routes do not show](#routes-do-not-show)
- [Old state after the lab is destroyed](#old-state-after-the-lab-is-destroyed)
- [Stopping and cleaning up](#stopping-and-cleaning-up)

<!-- nx-docs-gaps-20261104 -->
## The page does not open

**What you see.** The browser cannot connect (connection refused or a time-out), or you are not sure which address to open.

**Which address.**

- `xray.sh`: the address it prints once the page is up, `==> open  http://<this machine>:8080/` (or the port you gave).
  It listens on all addresses unless you pass `--bind`.
- `docker run` (the line at the top of the README): `http://localhost:8600/` on the machine that runs it. That line
  publishes the port on `127.0.0.1` only, so another machine cannot open it: use `-p 8600:8600` instead, or an SSH tunnel
  (`ssh -L 8600:localhost:8600 <lab host>`, then open `http://localhost:8600/` on your own machine).
- netlab tool: the address `netlab up` prints, `Open http://<host>:8600/` (8600 + N with the `multilab` plugin).

**Why.** `xray.sh` starts the page only after the lab is deployed (that is when it prints the `==> open` line), and the
container waits up to 2 minutes for the lab before it starts the page. Until then nothing answers on the port.

**What to do.** Look at the network-xray log: wait for the `==> open` line, or read the error above it — most are on
this page (for example [Port already in use](#port-already-in-use)). If the page opens on the lab machine but not from
another one, check the `127.0.0.1` binding above and the lab machine's firewall for that port.

## Port already in use

**What you see**

```
port 8080 is already in use (another graph is running there?).
  add a port:  ./xray.sh <lab.clab.yml> 8081   - or stop the other one.
```

**Why.** Before deploying, `xray.sh` checks that the graph port (default 8080) is free. If it is taken,
`containerlab graph` would stop right after starting, so `xray.sh` stops first and nothing is deployed.

**What to do.** Run the command it suggests (the next port), or stop whatever is using the port.
The port must be a number from 1 to 65535; anything else gives
`port must be a number from 1 to 65535: <value>`.

## Topology not found

**What you see**

```
topology not found: <path>
```

From the collector run on its own:

```
!! topology file not found: <path>
   expected a containerlab topology file, e.g.  node clab-xray-collect.js lab.clab.yml <out-dir>
```

If you pass a folder instead of a file: `!! '<path>' is a directory. Pass a containerlab topology file (.clab.yml), not the lab directory.`

**Why.** The first argument must be an existing `.clab.yml` file. A relative path is read from the folder you
are in, not from the repository folder.

**What to do.** Check the path, e.g. `./xray.sh examples/q21-bgp-lp/q21.clab.yml` from the repository folder.

## Lab name is not a plain name

**What you see**

```
the lab name in <lab.clab.yml> is not a plain name (letters, digits, _ . -)
```

From the collector: `!! the lab name "<name>" is not a plain name (letters, digits, _ . -): not collecting`.
If the file has no `name:` line at all: `could not read 'name:' from <lab.clab.yml>`.

**Why.** The lab name goes into container names and Docker filters, so only plain names are accepted:
it must start with a letter or digit and contain only letters, digits, `_`, `.` and `-`.

**What to do.** Change the `name:` line at the top of the topology file, e.g. `name: my-lab`.
If that lab is already deployed under its old name, destroy it first (see [Stopping and cleaning up](#stopping-and-cleaning-up)).

## containerlab or Node.js missing

**What you see**

```
containerlab not found - https://containerlab.dev/install/
```

```
node.js not found (needed to collect router state)
```

**Why.** `xray.sh` checks that both commands are on your `PATH` before doing anything else.

**What to do.** Install containerlab from <https://containerlab.dev/install/> and Node.js 18 or newer.
If they are installed but not found, check `command -v containerlab` and `command -v node` in the same shell.

## Filename too long when cloning (Windows)

**What you see**

```
error: unable to create file test/fixtures/...: Filename too long
```

**Why.** Some test fixture paths are long (up to about 110 characters), and Windows limits a full path to 260 characters unless long paths are enabled.

**What to do.** Run `git config --global core.longpaths true` and clone again, or clone into a shorter folder (for example `C:src`).

## Docker socket permission

<!-- nx-docker-check-docs-w2-20261105 -->
**What you see.** `xray.sh` checks Docker before it deploys anything and stops:

```
cannot reach Docker: permission denied on /var/run/docker.sock - stopped, nothing was deployed.
  add your user to the docker group: sudo usermod -aG docker "$USER", then log in again (that group is root-equivalent: lab machines only).
```

(With no socket at all it says `cannot reach Docker: no Docker socket at <path>` instead: start Docker.)
The container (`docker run`) stops the same way with `cannot talk to Docker: permission denied on <socket> - ...`:
run it as root (no `--user`) or add the `--group-add` it names.

If you run the collector yourself, Docker's own error shows instead
(`permission denied while trying to connect to the Docker daemon socket at unix:///var/run/docker.sock ...`).
The collector then prints a line like `  r1 COLLECT FAILED: ...` for each router, and the page shows the
routers in grey with `Could not be read (see the network-xray log).`
Cisco IOL nodes instead keep showing `  r1 not ready yet (IOL is booting, SSH not up yet) - retrying`,
because the collector cannot tell this case apart from a router that is still booting.

**Why.** `xray.sh` runs `containerlab deploy` with `sudo`, but it runs `docker ps` / `docker exec` (and the
collector) as your own user. Your user needs access to the Docker socket.

**What to do.** Add your user to the `docker` group and log in again:

```
sudo usermod -aG docker "$USER"
```

Being in the `docker` group is as good as root on this machine (anything that can use the Docker socket can start a
privileged container), so do this only on a machine where you would give that user `sudo` anyway.
Check with `docker ps` (it must work without `sudo`). If your user is also in the `clab_admins` group you
can skip `sudo` for containerlab too: `SUDO= ./xray.sh ...`.

## Routers still booting (Cisco IOL)

**What you see**

```
  r1 not ready yet (IOL is booting, SSH not up yet) - retrying
```

The router is grey on the page until it can be read.

**Why.** Cisco IOL nodes are read over SSH, and IOL takes about a minute to boot. Until SSH answers there is
nothing to read. The collector keeps retrying, and prints `  r1 collect OK again (after N failure(s))` once
the router answers. IOL nodes are read every 10 s (set `NX_IOS_INTERVAL=<seconds>` to change this), so the
picture follows a little more slowly than with FRR.

**What to do.** Wait. If it never comes up, check the container with `docker ps -a` and the login with
`ssh admin@clab-<lab>-<node>` (password `admin`). Two related messages that do **not** go away by waiting:

- `!! ssh not found on this machine: install an OpenSSH client (IOS nodes are read over SSH)`: install an SSH client.
- `!! SSH login to <host> was denied: set NX_IOS_USER / NX_IOS_PASSWORD (default admin / admin)`: set those
  two variables to the login of your routers.

## FRR did not start cleanly

**What you see**

```
==> <container>: FRR did not start cleanly, restarting FRR (1/3) ...
```

**Why.** FRR routers can also need a short while after start. `xray.sh` waits for them and restarts FRR if it did not
start cleanly. Until FRR runs, the router cannot be read.

**What to do.** Wait. If it still fails, `xray.sh` prints
`==> <container>: FRR is still not running. Try: docker exec <container> /usr/lib/frr/watchfrr.sh restart all`: run that command.

## Device type that is not read (drawn only)

**What you see**

```
  h1 cannot be read: not a router network-xray reads (no vtysh / sr_cli) - drawn only
```

On the page, clicking the node shows `network-xray does not read inside this device (it reads FRR, SR Linux and Cisco IOS-XE). It is drawn in the topology only.`

**Why.** The collector picks a reader by the node's containerlab `kind`: `nokia_srlinux` (SR Linux),
`cisco_iol` (Cisco IOL), and FRR for everything else. A node with no `vtysh` (for example an Alpine host,
or another vendor's image) cannot be read, so it is drawn in the topology but has no DeepDive (the panel that opens when you click a router and shows inside it).

**What to do.** Nothing, if the node is a host. This is expected and does not affect the other routers.

## Routes do not show

**What you see.** The router is read (not grey), but its routing table or BGP table in the DeepDive is empty, or a link
has no OSPF / BGP colour.

**Why.** network-xray shows only what the router reports. Most often OSPF / BGP have not come up yet (they need 30–60
seconds after the lab starts), or the router really has no such route — in the example labs that is often the fault
you are meant to find.

**What to do.**

1. Give it 30–60 seconds.
2. Ask the router directly (FRR):

   ```
   docker exec clab-<lab>-r1 vtysh -c 'show ip route'
   docker exec clab-<lab>-r1 vtysh -c 'show ip bgp summary json'
   docker exec clab-<lab>-r1 vtysh -c 'show ip ospf neighbor json'
   ```

   If the router has no route or no neighbor either, the lab itself is the cause: look at its configuration
   (`docker exec -it clab-<lab>-r1 vtysh -c 'show running-config'`).
3. Some state is not read: the IPv6 BGP table on FRR ([FAQ](faq.md#is-ipv6-read)) and VRFs on Cisco IOL
   ([FAQ](faq.md#are-vrfs-supported)). On FRR, the VRF buttons show one VRF at a time.
4. If the router answers but the page stays empty, look at the network-xray log (with the container,
   `docker logs <network-xray container> 2>&1 | tail -30`: it names the containers it reads, `clab-<lab>-*`) and open an
   issue with both outputs.

## Old state after the lab is destroyed

**What you see.** Routers turn grey and the collector prints:

```
  r1 cannot be read: the container is not running (check: docker ps -a)
```

The page says `The container is not running: nothing to read.` A router that stops answering for a while
shows `  r1 cannot be read: no answer - showing its last good state as stale`, and the page marks the old
state with the time it was last read.

**Why.** The collector reads the lab every second (`--interval` changes this; Cisco IOL nodes are read less often) and rewrites `xray-states.js` in the repository folder only when the state changes.
If the lab was destroyed (or a container stopped) while a collector was still running, there is nothing
left to read. `xray-states.js` is not removed when you stop, so it still holds the last lab you ran until
the next run rewrites it.

**What to do.**

- If you meant to stop: stop the collector too (`Ctrl-C` in the `xray.sh` terminal). If that terminal is gone, find the collector of this lab
  with `pgrep -af clab-xray-collect.js` and `kill <its pid>` (not `pkill -f`, which also stops the collectors of your other labs).
- If you did not mean to stop: `docker ps -a` shows which containers are down; deploy the lab again with `./xray.sh <lab.clab.yml>`.
- To clear the old picture, delete `xray-states.js` and `xray-states.sig.js` in the repository folder (they are not
  tracked by git and are written again on the next run).
- If `xray.sh` refuses to start with `another xray.sh (pid <pid>) is already running from <folder> - stop it first.`,
  stop that one first. A lock left behind by a run that is no longer running is removed by `xray.sh` itself.

## Stopping and cleaning up

**What you see.** After `Ctrl-C`:

```
stopped. remove the lab with:  sudo containerlab destroy -t <lab.clab.yml> --cleanup
```

**Why.** `Ctrl-C` stops the graph and the collector, removes the `problem.json` link that `xray.sh` made,
and removes the lock. It does **not** remove the lab: the router containers keep running.

**What to do.** Run the command it prints:

```
sudo containerlab destroy -t <lab.clab.yml> --cleanup
```

`--cleanup` also removes the lab's working folder (`clab-<lab>/` next to the topology file).
To see which labs are still running: `sudo containerlab inspect --all`.
