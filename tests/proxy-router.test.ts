import { describe, expect, it } from "bun:test";
import { McpRouter } from "../src/router";

describe("MCP Namespace Proxy Router", () => {
  it("registers mock servers and lists available tools", () => {
    const router = new McpRouter();
    router.registerServer("github", {
      tools: [
        { name: "create_issue", description: "Create a GitHub issue" },
        { name: "get_pr", description: "Get PR details" },
      ],
      execute: async (tool, args) => ({ success: true, tool, args }),
    });

    const listing = router.listTools();
    expect(listing).toContain("### Server: github");
    expect(listing).toContain("create_issue: Create a GitHub issue");
    expect(listing).toContain("get_pr: Get PR details");
  });

  it("routes execution to target server and tool", async () => {
    const router = new McpRouter();
    router.registerServer("sqlite", {
      tools: [{ name: "query", description: "Execute SQL query" }],
      execute: async (tool, args) => `Result of ${tool} with ${args.sql}`,
    });

    const res = await router.callTool("sqlite", "query", { sql: "SELECT 1" });
    expect(res).toBe("Result of query with SELECT 1");
  });

  it("returns clean error for unconfigured server", async () => {
    const router = new McpRouter();
    expect(router.callTool("unknown_srv", "tool", {})).rejects.toThrow("MCP server 'unknown_srv' is not registered");
  });
});
