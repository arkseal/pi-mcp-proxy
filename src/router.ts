import type { McpServerConfig } from "./config.js";
import { saveServerEnabled } from "./config.js";
import { StdioMcpClient, type McpTool } from "./client.js";

export interface ToolMetadata {
  name: string;
  description?: string;
  parameters?: any;
}

export interface McpServerRegistration {
  tools: ToolMetadata[];
  execute: (tool: string, args: Record<string, any>) => Promise<any>;
}

interface ServerEntry {
  name: string;
  enabled: boolean;
  registration?: McpServerRegistration;
  client?: StdioMcpClient;
}

export class McpRouter {
  private servers = new Map<string, ServerEntry>();

  registerServer(name: string, registration: McpServerRegistration, enabled = true): void {
    this.servers.set(name, {
      name,
      enabled,
      registration,
    });
  }

  registerStdioServer(name: string, config: McpServerConfig): void {
    const enabled = config.disabled !== true;
    const client = new StdioMcpClient(name, config);
    this.servers.set(name, {
      name,
      enabled,
      client,
    });
  }

  registerConfigServers(servers: Record<string, McpServerConfig>): void {
    for (const [name, cfg] of Object.entries(servers)) {
      this.registerStdioServer(name, cfg);
    }
  }

  getServerNames(): string[] {
    return Array.from(this.servers.keys());
  }

  isServerEnabled(name: string): boolean {
    return this.servers.get(name)?.enabled ?? false;
  }

  getServerStatus(): Array<{
    name: string;
    enabled: boolean;
    running: boolean;
    type: "stdio" | "custom";
  }> {
    return Array.from(this.servers.values()).map((s) => ({
      name: s.name,
      enabled: s.enabled,
      running: s.client ? s.client.isRunning() : true,
      type: s.client ? "stdio" : "custom",
    }));
  }

  async setServerEnabled(name: string, enabled: boolean): Promise<boolean> {
    const srv = this.servers.get(name);
    if (!srv) {
      throw new Error(`MCP server '${name}' is not registered.`);
    }

    srv.enabled = enabled;
    if (!enabled && srv.client) {
      srv.client.close();
    }

    // Persist to configuration file if available
    try {
      await saveServerEnabled(name, enabled);
    } catch {
      // If server was purely in-memory, saving might fail or be ignored
    }

    return enabled;
  }

  async toggleServer(name: string): Promise<boolean> {
    const srv = this.servers.get(name);
    if (!srv) {
      throw new Error(`MCP server '${name}' is not registered.`);
    }
    return this.setServerEnabled(name, !srv.enabled);
  }

  listTools(targetServer?: string): string {
    if (this.servers.size === 0) {
      return "No MCP servers currently configured.";
    }

    const lines: string[] = ["Available MCP Tools:"];
    for (const [serverName, srv] of this.servers) {
      if (targetServer && serverName !== targetServer) continue;
      const statusLabel = srv.enabled ? "" : " (DISABLED)";
      lines.push(`\n### Server: ${serverName}${statusLabel}`);

      if (!srv.enabled) {
        lines.push("- (Server is disabled. Enable with '/mcp enable " + serverName + "')");
        continue;
      }

      if (srv.registration) {
        for (const t of srv.registration.tools) {
          lines.push(`- ${t.name}: ${t.description || "No description"}`);
        }
      } else if (srv.client) {
        const cached = srv.client.getCachedTools();
        if (cached && cached.length > 0) {
          for (const t of cached) {
            lines.push(`- ${t.name}: ${t.description || "No description"}`);
          }
        } else {
          lines.push("- (Tools will be loaded on first use)");
        }
      }
    }

    return lines.join("\n");
  }

  async listToolsAsync(targetServer?: string): Promise<string> {
    if (this.servers.size === 0) {
      return "No MCP servers currently configured.";
    }

    const lines: string[] = ["Available MCP Tools:"];
    for (const [serverName, srv] of this.servers) {
      if (targetServer && serverName !== targetServer) continue;
      const statusLabel = srv.enabled ? "" : " (DISABLED)";
      lines.push(`\n### Server: ${serverName}${statusLabel}`);

      if (!srv.enabled) {
        lines.push("- (Server is disabled. Enable with '/mcp enable " + serverName + "')");
        continue;
      }

      if (srv.registration) {
        for (const t of srv.registration.tools) {
          lines.push(`- ${t.name}: ${t.description || "No description"}`);
        }
      } else if (srv.client) {
        try {
          const tools = await srv.client.listTools();
          if (tools.length === 0) {
            lines.push("- (No tools reported by server)");
          } else {
            for (const t of tools) {
              lines.push(`- ${t.name}: ${t.description || "No description"}`);
            }
          }
        } catch (err: any) {
          lines.push(`- (Error loading tools: ${err.message})`);
        }
      }
    }

    return lines.join("\n");
  }

  async callTool(server: string, tool: string, args: Record<string, any>): Promise<any> {
    const srv = this.servers.get(server);
    if (!srv) {
      const available = Array.from(this.servers.keys()).join(", ") || "none";
      throw new Error(
        `MCP server '${server}' is not registered. Configured servers: [${available}]`
      );
    }

    if (!srv.enabled) {
      throw new Error(
        `MCP server '${server}' is disabled. Enable it with '/mcp enable ${server}'.`
      );
    }

    if (srv.registration) {
      return srv.registration.execute(tool, args);
    }

    if (srv.client) {
      return srv.client.callTool(tool, args);
    }

    throw new Error(`Server '${server}' has no execution backend.`);
  }

  closeAll(): void {
    for (const srv of this.servers.values()) {
      if (srv.client) {
        srv.client.close();
      }
    }
  }
}
