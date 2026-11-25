# Installing the network-xray MCP server (for AI agents such as Cline)

network-xray's MCP server answers read-only questions about a network lab (containerlab, netlab or Cisco CML):
which routers there are, their OSPF and BGP neighbors, which BGP path a router chose and why, and which route it
uses for an address. It reads state files that network-xray's collectors have already written. It does not log in to
a router, run a command, write a file or open a network socket. It runs over stdio.

There is no npm package, so `npx` does not apply. Use one of the two ways below.

## Before you start: ask the user one thing

Ask: **"Which folder holds your lab's state files (`xray-states.js` or `state_<router>.json`)?"**

- With `./xray.sh` running a lab, that is the network-xray folder itself (it writes `xray-states.js` there).
- If the user has no lab yet, use the example state shipped in the repository:
  `<network-xray folder>/test/fixtures/iosxe-q15` (three Cisco IOS-XE routers; for Docker see Way 2). Tell the user it is an example.

That folder is the `--path`. The server reads only under it. Always give it as an **absolute path**: the client
starts the server in a working directory that is usually not the repository.

## Way 1: Node.js (recommended)

Needs: `git` and Node.js 18 or later (`node --version`). No `npm install`: the server has no dependencies.

1. Clone the repository into a folder the user agrees on (for example the user's home folder):

   ```
   git clone https://github.com/rclab-dev/network-xray.git
   ```

2. Add this entry to the MCP settings (in Cline: `cline_mcp_settings.json`, opened from MCP Servers → Configure MCP Servers).
   Replace both paths with absolute paths:

   ```json
   {
     "mcpServers": {
       "network-xray": {
         "command": "node",
         "args": [
           "/absolute/path/to/network-xray/scripts/xray-mcp.js",
           "--path",
           "/absolute/path/to/the/lab-state-folder"
         ],
         "disabled": false,
         "autoApprove": []
       }
     }
   }
   ```

   On Windows, use the `C:\\...` form with doubled backslashes, for example
   `"C:\\Users\\me\\network-xray\\scripts\\xray-mcp.js"`. If `node` is not found, set `command` to the full path of
   the Node.js binary (`where node` on Windows, `which node` elsewhere).

## Way 2: Docker (no Node.js on the machine)

Needs: Docker that the user can run without `sudo`. The image needs no Docker socket for this: it reads files only.

```json
{
  "mcpServers": {
    "network-xray": {
      "command": "docker",
      "args": [
        "run", "-i", "--rm",
        "-v", "/absolute/path/to/the/lab-state-folder:/lab:ro",
        "ghcr.io/rclab-dev/network-xray:1",
        "mcp", "--path", "/lab"
      ],
      "disabled": false,
      "autoApprove": []
    }
  }
}
```

Here `--path` is always `/lab` (the folder inside the container). Only the `-v` left side changes. The first start
pulls the image, which takes a while. To try it without a lab, leave out the two `-v` arguments and use the
example inside the image: `"mcp", "--path", "/opt/network-xray/test/fixtures/iosxe-q15"`.

## Check that it works

Call the tool **`list_routers`** with no arguments (the server uses `--path`). The answer is JSON with a `routers`
list. Each router has a `name`, `nos` and `protocols`. With the example folder it is `r1`, `r2` and `r3`, all
`"nos": "ios-xe"` (`r1` and `r2` run OSPF and BGP, `r3` BGP only).

If the answer is an error:

| Error text | What to do |
|---|---|
| `no state files (…) in <folder>` | The folder has no `xray-states.js` / `state_<router>.json`. Ask the user for the right folder, or start the lab with `./xray.sh` first. |
| `outside the folder this server reads (<folder>)` | A `path` argument was outside `--path`. Call the tool without `path`, or fix `--path`. |
| The server does not start / `node` not found | Check `node --version` (18+) or use the full path to `node`. |

## Rules for the agent

- Read-only: do not change router configuration, and do not start `--allow-collect` unless the user asks (it lets
  the server run the collector, which needs Docker access).
- Do not run `./xray.sh <lab>` on a lab that is already running: it redeploys the lab. Use `./xray.sh --attach <lab>`.
- Do not print the contents of `network-xray.json` or the value of `NX_IOS_PASSWORD`.

More: [docs/mcp.md](docs/mcp.md) (all tools and clients) and [llms.txt](llms.txt).
