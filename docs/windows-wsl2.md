[日本語](ja/windows-wsl2.md)

<!-- nx-wsl2-20261105 -->
# Running on Windows (WSL2)

network-xray runs on Linux. On Windows, run it inside a **WSL2** Linux distribution: every command below
is typed in the Linux shell (e.g. Ubuntu), not in PowerShell or `cmd`. The page is then opened from the
Windows browser.

Items marked **(not verified)** follow from the code and the other docs, but were not tried on a Windows machine.

## What you need (inside WSL2)

The same as on Linux ([Quick start](../README.md#quick-start-run-a-lab-in-containerlab)):

1. **WSL2 and a Linux distribution**, e.g. Ubuntu (`wsl --install` in PowerShell, then open the distribution).
   Check with `wsl -l -v` that it runs as version **2**, not 1. **(not verified)**
2. **Docker**, either:
   - Docker Engine installed inside the distribution, or
   - Docker Desktop for Windows with the WSL2 backend and **WSL integration** turned on for your distribution
     (Settings → Resources → WSL integration). **(not verified)**

   `docker ps` must work in the Linux shell without `sudo` (see [Docker socket](#docker-socket-permission)).
3. **containerlab** installed inside the distribution: <https://containerlab.dev/install/>.
   `xray.sh` stops with `containerlab not found - https://containerlab.dev/install/` if it is missing.
4. **Node.js 18 or newer** inside the distribution (`node --version`). A Windows install of Node.js is not used:
   `xray.sh` stops with `node.js not found (needed to collect router state)` if `node` is not on the Linux `PATH`.
5. Enough memory in the WSL2 VM for the lab itself: the FRR example labs are small, Cisco IOL nodes need more
   (the Codespaces setup asks for an 8 GB machine). Not measured on WSL2.

## Clone inside the Linux file system

```bash
cd ~
git clone https://github.com/rclab-dev/network-xray.git
cd network-xray
```

Clone with the Linux `git`, into your Linux home (`~`), not into `/mnt/c/...`. `xray.sh` is a bash script and needs
LF line endings and the execute bit; a clone made with Git for Windows may turn it into CRLF
(`/usr/bin/env: 'bash\r': No such file or directory`), and the Windows drives may not keep the execute bit or the
`problem.json` link that `xray.sh` makes. **(not verified)**

## Run it

**Option A: `xray.sh`** (deploys an example lab, collects, serves the page on port 8080):

```bash
./xray.sh examples/q21-bgp-lp/q21.clab.yml
```

Wait for `==> open  http://<this machine>:8080/`. `xray.sh` runs containerlab with `sudo`; with rootless setups use
`SUDO= ./xray.sh ...` (see the top of `xray.sh`).

**Option B: the container** (for a lab that is already running; serves the page on port 8600):

```bash
docker run --rm -v /var/run/docker.sock:/var/run/docker.sock -v "$(pwd)":/lab:ro -p 127.0.0.1:8600:8600 ghcr.io/rclab-dev/network-xray:1 --topo /lab/<lab>.clab.yml
```

Run it in the folder of the topology file. The container is given the Docker socket (root-equivalent on the host):
lab machines only. See [Security notes](../README.md#security-notes).

## Open the page from Windows

Open **http://localhost:8080/** (Option A) or **http://localhost:8600/** (Option B) in the Windows browser.
WSL2 forwards `localhost` ports from the Linux side to Windows by default (`localhostForwarding`, on unless turned
off in `%UserProfile%\.wslconfig`). **(not verified)**

- With Option A, `xray.sh` listens on all addresses (`0.0.0.0`) by default, so other machines on the network may
  reach it too if Windows forwards the port. To keep it on this machine: `./xray.sh --bind 127.0.0.1 <lab.clab.yml>`.
  Whether `--bind 127.0.0.1` inside WSL2 is still reachable from the Windows browser depends on the WSL
  networking mode. **(not verified)**
- With Option B, Docker Desktop publishes `-p 127.0.0.1:8600:8600` on Windows `localhost`; with Docker Engine inside
  the distribution it goes through the WSL2 `localhost` forwarding above. **(not verified)**

## Common problems

### Port already in use

`port 8080 is already in use (another graph is running there?).` A port taken on the Windows side (another
program, or a second WSL distribution) can also block it. **(not verified)** Use another port:
`./xray.sh <lab.clab.yml> 8081`, then open `http://localhost:8081/`. See [Port already in use](troubleshooting.md#port-already-in-use).

### Docker socket permission

`xray.sh` checks Docker before it deploys anything and stops with
`cannot reach Docker: permission denied on /var/run/docker.sock - stopped, nothing was deployed.`: `xray.sh` and the
collector run `docker` as your own user. With Docker Engine in the distribution, add your user to the `docker` group and open
a new shell (or run `wsl --shutdown` in PowerShell and start the distribution again):

```bash
sudo usermod -aG docker "$USER"
```

With Docker Desktop, turn on WSL integration for the distribution instead. **(not verified)**
See [Docker socket permission](troubleshooting.md#docker-socket-permission).

### Nested virtualization is not needed for container nodes

The routers network-xray reads are containers: FRR (`frrouting/frr`), Nokia SR Linux (`nokia_srlinux`) and
Cisco IOL (`cisco_iol`). They run as ordinary containers inside WSL2 and do not need nested virtualization / KVM.
Only VM-based containerlab kinds (e.g. `cisco_c8000v`, `cisco_csr1000v`) need KVM, and network-xray does not read
those kinds anyway (they are drawn only). That Cisco IOL needs no KVM comes from containerlab's documentation of
the `cisco_iol` kind. **(not verified here)**

### Cisco IOL nodes stay "not ready yet"

IOL nodes are read over SSH: the collector finds each node's container by its containerlab labels and connects to
the management IP that `docker inspect` gives, so the Linux side must reach the lab's management network.
With Docker Engine inside the distribution this is the same as on Linux. With Docker Desktop the containers run in
Docker Desktop's own VM and the management network may not be reachable from the distribution. **(not verified)**
FRR and SR Linux are read with `docker exec` and are not affected.
