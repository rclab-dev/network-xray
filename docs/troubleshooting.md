[日本語](ja/troubleshooting.md)

# Troubleshooting

Problems that `xray.sh` and the collector (`clab-xray-collect.js`) detect, and what to do about them.
Messages are shown as the tools print them; `<...>` stands for your own value.

- [Port already in use](#port-already-in-use)
- [Topology not found](#topology-not-found)
- [Lab name is not a plain name](#lab-name-is-not-a-plain-name)
- [containerlab or Node.js missing](#containerlab-or-nodejs-missing)
- [Docker socket permission](#docker-socket-permission)
- [Routers still booting (Cisco IOL)](#routers-still-booting-cisco-iol)
- [Device type that is not read (drawn only)](#device-type-that-is-not-read-drawn-only)
- [Old state after the lab is destroyed](#old-state-after-the-lab-is-destroyed)
- [Stopping and cleaning up](#stopping-and-cleaning-up)

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

## Docker socket permission

**What you see.** Docker's own error, for example:

```
permission denied while trying to connect to the Docker daemon socket at unix:///var/run/docker.sock ...
```

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

FRR routers can also need a short while after start; `xray.sh` waits for them and restarts FRR if it did not
start cleanly (`==> <container>: FRR did not start cleanly, restarting FRR (1/3) ...`). If it still fails:
`==> <container>: FRR is still not running. Try: docker exec <container> /usr/lib/frr/watchfrr.sh restart all`.

## Device type that is not read (drawn only)

**What you see**

```
  h1 cannot be read: not a router network-xray reads (no vtysh / sr_cli) - drawn only
```

On the page, clicking the node shows `network-xray does not read inside this device (it reads FRR, SR Linux and Cisco IOS-XE). It is drawn in the topology only.`

**Why.** The collector picks a reader by the node's containerlab `kind`: `nokia_srlinux` (SR Linux),
`cisco_iol` (Cisco IOL), and FRR for everything else. A node with no `vtysh` (for example an Alpine host,
or another vendor's image) cannot be read, so it is drawn in the topology but has no DeepDive.

**What to do.** Nothing, if the node is a host. This is expected and does not affect the other routers.

## Old state after the lab is destroyed

**What you see.** Routers turn grey and the collector prints:

```
  r1 cannot be read: the container is not running (check: docker ps -a)
```

The page says `The container is not running: nothing to read.` A router that stops answering for a while
shows `  r1 cannot be read: no answer - showing its last good state as stale`, and the page marks the old
state with the time it was last read.

**Why.** The collector reads the lab every second and writes `xray-states.js` in the repository folder.
If the lab was destroyed (or a container stopped) while a collector was still running, there is nothing
left to read. `xray-states.js` is not removed when you stop, so it still holds the last lab you ran until
the next run rewrites it.

**What to do.**

- If you meant to stop: stop the collector too (`Ctrl-C` in the `xray.sh` terminal). If that terminal is gone, find the collector of this lab
  with `pgrep -af clab-xray-collect.js` and `kill <its pid>` (not `pkill -f`, which also stops the collectors of your other labs).
- If you did not mean to stop: `docker ps -a` shows which containers are down; deploy the lab again with `./xray.sh <lab.clab.yml>`.
- To clear the old picture, delete `xray-states.js` in the repository folder (it is not tracked by git and
  is written again on the next run).
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
