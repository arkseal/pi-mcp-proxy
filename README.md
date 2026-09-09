# pi-mcp-proxy

Namespace proxy and output guard for MCP (Model Context Protocol) tools in the **pi** coding agent.

## The Problem: Tool Schema & Output Explosion

- In typical MCP extensions, every connected server exposes 10–30 tools directly into the global tool registry. Connecting 3 servers injects 70+ tool definitions into the prompt, burning **15,000 to 25,000 tokens on every single turn**.
- Furthermore, database or GitHub queries can return megabytes of raw JSON, immediately blowing through context limits.

## The Solution

1. **Namespace Proxy Routing (`mcp_call`):**
   Instead of 70 separate tools in the prompt, this extension exposes a single proxy entry point:
   `mcp_call({ server: "github", tool: "create_issue", args: { ... } })`
   - Fixed prompt tax is reduced to **~120 tokens total**.
   - Available tools can be discovered on-demand via `mcp_list`.

2. **MCP Output Guard:**
   - Automatically monitors payload size.
   - If output exceeds 40KB or 1,500 lines, the raw JSON payload is spilled to `/tmp/pi-mcp/<id>.json`.
   - Returns a clean preview + file pointer to the model to protect context budget.

## Running Tests

```bash
bun test
```
