[日本語](ja/local.md)

# Fully local: no cloud, or no network at all

rclab-dev/network-xray itself sends nothing anywhere: no telemetry, no analytics, no account. Every connection it makes
is listed in [network.md](network.md). This page is about the other half: when you ask an AI about your lab, the answer
and the lab data you show it go wherever that AI runs. To keep everything on your machine, run the AI there too.

## What stays local already

- **The page** is served by the graph server you started (`./xray.sh`, the container, or `containerlab graph`) and listens on
  `127.0.0.1` by default. Nothing in the page talks to another host.
- **The collector** reads your routers with `docker exec` (FRR / SR Linux) or SSH (Cisco IOS-XE) and writes `xray-states.js` on
  your machine.
- **The MCP server** (`scripts/xray-mcp.js`, or `docker run -i … ghcr.io/rclab-dev/network-xray:1 mcp`) talks to its client over
  stdio and reads only the state files under its `--path` folder. It opens no network connection. See [mcp.md](mcp.md).

## Where data leaves the machine: the AI client

An MCP client that uses a hosted model (a cloud AI) sends the tool answers - router names, addresses, routes, the reasons
network-xray gives - to that service as part of the conversation. network-xray does not send them; the client does,
because that is how it talks to its model. If that is not acceptable for your lab, use a model that runs on your machine.

## A model on your machine

What we tested (November 2026): [Ollama](https://ollama.com/) serving `qwen2.5:14b` on a machine in the same LAN, and a small
client script that

1. starts `node scripts/xray-mcp.js --path <your-lab-folder>` on stdio and calls `initialize` and `tools/list`,
2. passes those tools to Ollama's OpenAI-compatible endpoint (`http://<host>:11434/v1/chat/completions`) as function
   definitions,
3. sends each tool call the model makes to the MCP server (`tools/call`) and returns the result, until the model answers.

Nothing in this loop leaves your network. Any MCP client that can use a local OpenAI-compatible or Ollama model and start
stdio servers should work the same way; we have not tried a ready-made one, so we do not list one here.

**How well a small model does.** On the 22 practice labs in `examples/` (broken state only, the model asked for the cause
and the fix), `qwen2.5:14b` got the cause and the fix right in about 36% of tries with the network-xray tools and about 26%
when it got only show-style output instead. It found misconfigured values (hello / dead timers, areas, passive interfaces,
local preference) more often than missing statements or filters (route-maps, prefix-lists). A larger model does much better,
so treat a small local model's answer as a lead to check, not a verdict.

**Pictures.** Most local clients do not draw MCP Apps (the picture under an answer, see [mcp.md](mcp.md)). Open the page on
`127.0.0.1` in your browser for the same picture.

## A machine with no network (air-gapped)

- **Get the code:** `git clone https://github.com/rclab-dev/network-xray` on a connected machine and copy the folder over. It
  needs Node.js 18 or later and nothing from npm.
- **Or the image:** `docker pull ghcr.io/rclab-dev/network-xray:1`, then `docker save ghcr.io/rclab-dev/network-xray:1 -o network-xray.tar`,
  copy the file, and `docker load -i network-xray.tar`. Compare `docker image inspect --format '{{.Id}}' ghcr.io/rclab-dev/network-xray:1`
  on both machines to be sure it is the same image.
- **Links:** the README, the page and `problem.json` contain ordinary links (GitHub, RFCs, the "Powered by RCL" link in the
  DeepDive). They do nothing until you click them; offline, a click just fails.
- **Your lab images** (FRR, SR Linux, …) come from wherever you normally get them; copy them the same way (`docker save` / `docker load`).
