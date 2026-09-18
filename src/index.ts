import type {
  ExtensionAPI,
  ExtensionCommandContext,
} from "@earendil-works/pi-coding-agent";
import { Text } from "@earendil-works/pi-tui";
import { Type } from "typebox";
import { McpRouter } from "./router.js";
import { guardMcpOutput } from "./output-guard.js";
import { loadMcpConfig } from "./config.js";

export { McpRouter } from "./router.js";
export { guardMcpOutput } from "./output-guard.js";
export { loadMcpConfig, saveServerEnabled } from "./config.js";

const globalRouter = new McpRouter();

export default function mcpProxyExtension(pi: ExtensionAPI) {
  // Load configured MCP servers on startup
  loadMcpConfig()
    .then(({ servers }) => {
      if (Object.keys(servers).length > 0) {
        globalRouter.registerConfigServers(servers);
      }
    })
    .catch((err) => {
      console.error("[pi-mcp-proxy] Initialization error:", err);
    });

  // 1. Tool caller with namespace routing
  pi.registerTool({
    name: "mcp_call",
    label: "MCP Call",
    description:
      "Execute an MCP tool through the namespace proxy. Avoids prompt token explosion by proxying all MCP tools through a single entry point. Output is guarded against context window flooding.",
    promptSnippet:
      "Invoke an MCP server tool (e.g. server='playwright', tool='browser_navigate', args={url: 'https://example.com'})",
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
    renderCall(args: any, theme: any, context: any) {
      const text =
        (context.lastComponent as Text | undefined) ?? new Text("", 0, 0);
      let content = theme.fg("toolTitle", theme.bold("mcp_call "));
      if (args?.server && args?.tool) {
        content += theme.fg("accent", `${args.server}:${args.tool}`);
      } else if (args?.tool) {
        content += theme.fg("accent", args?.tool ?? "");
      }
      text.setText(content);
      return text;
    },
    async execute(_toolCallId, params) {
      try {
        const raw = await globalRouter.callTool(
          params.server,
          params.tool,
          params.args ?? {}
        );
        const serialized =
          typeof raw === "string" ? raw : JSON.stringify(raw, null, 2);
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
    description:
      "List all tools available on configured MCP servers on demand.",
    promptSnippet: "Discover available tools across registered MCP servers",
    parameters: Type.Object(
      {
        server: Type.Optional(
          Type.String({ description: "Optional server name to inspect" })
        ),
      },
      { additionalProperties: false }
    ),
    renderCall(args: any, theme: any, context: any) {
      const text =
        (context.lastComponent as Text | undefined) ?? new Text("", 0, 0);
      let content = theme.fg("toolTitle", theme.bold("mcp_list "));
      if (args?.server) {
        content += theme.fg("accent", args.server);
      } else {
        content += theme.fg("dim", "(all servers)");
      }
      text.setText(content);
      return text;
    },
    async execute(_toolCallId, params) {
      const listing = await globalRouter.listToolsAsync(params.server);
      return {
        content: [{ type: "text", text: listing }],
        details: { server: params.server },
      };
    },
  });

  // 3. Command: /mcp for interactive server management and toggling
  pi.registerCommand("mcp", {
    description:
      "Manage MCP servers (status, toggle, enable, disable, list, reload)",
    getArgumentCompletions: (prefix: string) => {
      const parts = prefix.trimStart().split(/\s+/);
      const subcommands = [
        "toggle",
        "enable",
        "disable",
        "list",
        "status",
        "reload",
      ];
      if (parts.length <= 1) {
        return subcommands
          .filter((s) => s.startsWith(parts[0]))
          .map((s) => ({ value: s, label: s }));
      }
      if (
        parts.length === 2 &&
        ["toggle", "enable", "disable"].includes(parts[0])
      ) {
        const serverNames = globalRouter.getServerNames();
        return serverNames
          .filter((s) => s.startsWith(parts[1]))
          .map((s) => ({
            value: `${parts[0]} ${s}`,
            label: `${parts[0]} ${s}`,
          }));
      }
      return null;
    },
    handler: async (args: string, ctx: ExtensionCommandContext) => {
      const trimmed = args.trim();

      if (trimmed.startsWith("toggle ")) {
        const srv = trimmed.slice(7).trim();
        try {
          const newState = await globalRouter.toggleServer(srv);
          ctx.ui.notify(
            `MCP server '${srv}' is now ${newState ? "ENABLED" : "DISABLED"}`,
            "info"
          );
        } catch (err: any) {
          ctx.ui.notify(`Failed to toggle '${srv}': ${err.message}`, "error");
        }
        return;
      }

      if (trimmed.startsWith("enable ")) {
        const srv = trimmed.slice(7).trim();
        try {
          await globalRouter.setServerEnabled(srv, true);
          ctx.ui.notify(`MCP server '${srv}' is now ENABLED`, "info");
        } catch (err: any) {
          ctx.ui.notify(`Failed to enable '${srv}': ${err.message}`, "error");
        }
        return;
      }

      if (trimmed.startsWith("disable ")) {
        const srv = trimmed.slice(8).trim();
        try {
          await globalRouter.setServerEnabled(srv, false);
          ctx.ui.notify(`MCP server '${srv}' is now DISABLED`, "info");
        } catch (err: any) {
          ctx.ui.notify(`Failed to disable '${srv}': ${err.message}`, "error");
        }
        return;
      }

      if (trimmed === "list") {
        const tools = await globalRouter.listToolsAsync();
        ctx.ui.notify(tools, "info");
        return;
      }

      if (trimmed === "reload") {
        try {
          const { path, servers } = await loadMcpConfig();
          globalRouter.closeAll();
          globalRouter.registerConfigServers(servers);
          ctx.ui.notify(
            `Reloaded ${Object.keys(servers).length} MCP server(s) from ${
              path ?? "defaults"
            }`,
            "info"
          );
        } catch (err: any) {
          ctx.ui.notify(`Failed to reload MCP config: ${err.message}`, "error");
        }
        return;
      }

      // Default: status + interactive toggle menu
      const statuses = globalRouter.getServerStatus();
      if (statuses.length === 0) {
        ctx.ui.notify(
          "No MCP servers configured in ~/.config/mcp/mcp.json or .mcp.json",
          "warning"
        );
        return;
      }

      if (typeof ctx.ui.select === "function") {
        const items = statuses.map(
          (s) =>
            `[${s.enabled ? "ENABLED" : "DISABLED"}] ${s.name}${
              s.running ? " (active)" : ""
            }`
        );
        items.push("Cancel");

        const choice = await ctx.ui.select(
          "Select MCP server to toggle:",
          items
        );
        if (choice && choice !== "Cancel") {
          const match = choice.match(/\]\s+([^\s(]+)/);
          if (match) {
            const srvName = match[1];
            const newState = await globalRouter.toggleServer(srvName);
            ctx.ui.notify(
              `MCP server '${srvName}' is now ${
                newState ? "ENABLED" : "DISABLED"
              }`,
              "info"
            );
          }
        }
      } else {
        const summary = statuses
          .map(
            (s) =>
              `- ${s.name}: ${s.enabled ? "ENABLED" : "DISABLED"}${
                s.running ? " (active)" : ""
              }`
          )
          .join("\n");
        ctx.ui.notify(`MCP Server Status:\n${summary}`, "info");
      }
    },
  });

  // Clean up running processes on session shutdown
  pi.on("session_shutdown", () => {
    globalRouter.closeAll();
  });
}
