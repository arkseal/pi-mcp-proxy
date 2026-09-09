export interface ToolMetadata {
  name: string;
  description?: string;
  parameters?: any;
}

export interface McpServerRegistration {
  tools: ToolMetadata[];
  execute: (tool: string, args: Record<string, any>) => Promise<any>;
}

export class McpRouter {
  private servers = new Map<string, McpServerRegistration>();

  registerServer(name: string, registration: McpServerRegistration): void {
    this.servers.set(name, registration);
  }

  listTools(targetServer?: string): string {
    if (this.servers.size === 0) {
      return "No MCP servers currently configured.";
    }

    const lines: string[] = ["Available MCP Tools:"];
    for (const [serverName, srv] of this.servers) {
      if (targetServer && serverName !== targetServer) continue;
      lines.push(`\n### Server: ${serverName}`);
      for (const t of srv.tools) {
        lines.push(`- ${t.name}: ${t.description || "No description"}`);
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

    return srv.execute(tool, args);
  }
}
