# Security policy

## Reporting a security problem

Please report security problems privately, not in a public issue.

Use GitHub's private vulnerability reporting for this repository:
**Security** tab → **Report a vulnerability**
(<https://github.com/rclab-dev/network-xray/security/advisories/new>).
The report is visible only to the maintainer until an advisory is published.

A useful report has:

- the network-xray version: the image tag or digest, or the commit (`git rev-parse --short HEAD`);
- how it was started (the `docker run …` line, the `./xray.sh …` line, or the netlab `tools:` part);
- what an attacker can do, and the steps or input that show it;
- for router output, the raw output as printed, with passwords and keys removed.

Do not attach `network-xray.json` (netlab writes it; it holds the lab's passwords).

There is a single maintainer and no SLA. Fixes are made on the latest release only;
older tags are not patched.

## In scope

- **The collector**: `xray.sh`, `clab-collect.js`, `clab-srl-collect.js`, `clab-iosxe-collect.js`,
  `frr-collect.js` and the other scripts that read the routers and write the state files
  (for example, a topology name or a router's output that reaches a shell, or a file written outside the output directory).
- **The pages**: the HTML / JavaScript pages in this repository and in `demo/`
  (for example, router- or topology-supplied text that runs as script in the browser).
- **The image**: `ghcr.io/rclab-dev/network-xray`, built from `docker/` by the workflow in `.github/workflows/`.
- The read-only command-line and MCP tools in `scripts/` (`xray-query.js`, `xray-mcp.js`).

Out of scope: containerlab, netlab, FRR, SR Linux, Cisco IOS-XE and Docker themselves (report those to their projects),
and the known design limits below.

## Known design limits

These are how the tool works, not vulnerabilities:

- **The collector needs the Docker socket.** It reads FRR and SR Linux with `docker exec`, so the image is run with
  `-v /var/run/docker.sock:/var/run/docker.sock` (and `xray.sh` needs a user who can use Docker).
  Access to the Docker socket is root-equivalent: anyone who can use it can run anything as root on the host.
  **Run the collector on lab machines only**, never on a machine that holds anything you need to protect.
- **The page has no login.** Anyone who can reach the port can see the lab's state. Keep it on this machine
  (`-p 127.0.0.1:8600:8600`, `./xray.sh --bind 127.0.0.1`, `containerlab graph -s 127.0.0.1:8080`)
  or on a trusted network. `./xray.sh` listens on all interfaces by default (so a lab on a server or VM can be opened
  from your PC) and says so when it starts; the container example publishes the port on `127.0.0.1` only.
- **SSH host keys are not checked for Cisco IOS-XE.** Lab routers get new keys on every deploy, so use the collector
  on the lab's management network only. The password is taken from `NX_IOS_PASSWORD` and is not printed or written
  to the state files.
