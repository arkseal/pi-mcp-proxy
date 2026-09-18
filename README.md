# pi-mcp-proxy

Namespace proxy and output guard for MCP (Model Context Protocol) tools in the **pi** coding agent.

## Features

1. **Namespace Proxy Routing (`mcp_call`):**
   Instead of injecting dozens of tools into the prompt, this extension exposes a single proxy entry point:
   `mcp_call({ server: "playwright", tool: "browser_navigate", args: { url: "..." } })`
   - Fixed prompt tax is reduced to **~120 tokens total**.
   - Available tools can be discovered on-demand via `mcp_list`.

2. **MCP Output Guard:**
   - Automatically monitors payload size.
   - If output exceeds 40KB or 1,500 lines, the raw JSON payload is spilled to `/tmp/pi-mcp/<id>.json`.
   - Returns a clean preview + file pointer to the model to protect context budget.

3. **Easy Server Toggling (`/mcp`):**
   - Interactive toggle picker via `/mcp` in interactive Pi sessions.
   - Quick slash commands:
     - `/mcp toggle <server>`
     - `/mcp enable <server>`
     - `/mcp disable <server>`
     - `/mcp list`
     - `/mcp reload`
   - Persistent `disabled: true` flag in standard MCP configuration files.

## Configuration

`pi-mcp-proxy` automatically reads servers from standard MCP configuration paths:
1. `.mcp.json` (project-local)
2. `~/.config/mcp/mcp.json` (user-global)
3. `~/.pi/agent/mcp.json`

Example (`~/.config/mcp/mcp.json`):

```json
{
  "mcpServers": {
    "playwright": {
      "command": "npx",
      "args": ["-y", "@playwright/mcp@latest", "--headless"],
      "disabled": false
    }
  }
}
```

## Running Tests

```bash
bun test
```
