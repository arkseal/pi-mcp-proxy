import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import { McpRouter } from "./router.js";
import { guardMcpOutput } from "./output-guard.js";

export { McpRouter } from "./router.js";
export { guardMcpOutput } from "./output-guard.js";

const globalRouter = new McpRouter();

export default function mcpProxyExtension(pi: ExtensionAPI) {
  // 1. Tool caller with namespace routing
  pi.registerTool({
    name: "mcp_call",
    label: "MCP Call",
    description:
      "Execute an MCP tool through the namespace proxy. Avoids prompt token explosion by proxying all MCP tools through a single entry point. Output is guarded against context window flooding.",
    promptSnippet: "Invoke an MCP server tool (e.g. server='github', tool='create_issue')",
    parameters: Type.Object(
      {
        server: Type.String({ description: "The configured MCP server name" }),
        tool: Type.String({ description: "The tool name on that server" }),
        args: Type.Optional(
          Type.Record(Type.String(), Type.Any(), {
            description: "Tool arguments as a JSON object",
          })
        ),
      },
      { additionalProperties: false }
    ),
    async execute(_toolCallId, params) {
      try {
        const raw = await globalRouter.callTool(params.server, params.tool, params.args ?? {});
        const serialized = typeof raw === "string" ? raw : JSON.stringify(raw, null, 2);
        const guarded = await guardMcpOutput(serialized);

        return {
          content: [{ type: "text", text: guarded.content }],
          details: {
            server: params.server,
            tool: params.tool,
            truncated: guarded.truncated,
            spillPath: guarded.spillPath,
          },
        };
      } catch (err: any) {
        return {
          content: [{ type: "text", text: `MCP Error: ${err.message}` }],
          details: { error: err.message },
        };
      }
    },
  });

  // 2. Discover available tools on demand
  pi.registerTool({
    name: "mcp_list",
    label: "MCP List",
    description: "List all tools available on configured MCP servers on demand.",
    promptSnippet: "Discover available tools across registered MCP servers",
    parameters: Type.Object(
      {
        server: Type.Optional(
          Type.String({ description: "Optional server name to inspect" })
        ),
      },
      { additionalProperties: false }
    ),
    async execute(_toolCallId, params) {
      const listing = globalRouter.listTools(params.server);
      return {
        content: [{ type: "text", text: listing }],
        details: { server: params.server },
      };
    },
  });
}
