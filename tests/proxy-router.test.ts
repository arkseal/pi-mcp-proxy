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
    expect(router.callTool("unknown_srv", "tool", {})).rejects.toThrow(
      "MCP server 'unknown_srv' is not registered"
    );
  });

  it("handles toggling servers on and off easily", async () => {
    const router = new McpRouter();
    router.registerServer("playwright", {
      tools: [{ name: "browser_navigate", description: "Navigate browser" }],
      execute: async (_tool, args) => `Navigated to ${args.url}`,
    });

    expect(router.isServerEnabled("playwright")).toBe(true);

    // Toggle off
    const state1 = await router.toggleServer("playwright");
    expect(state1).toBe(false);
    expect(router.isServerEnabled("playwright")).toBe(false);

    // Call should now fail with clear disabled message
    expect(
      router.callTool("playwright", "browser_navigate", { url: "https://example.com" })
    ).rejects.toThrow("MCP server 'playwright' is disabled. Enable it with '/mcp enable playwright'.");

    // Tool list should reflect disabled status
    expect(router.listTools()).toContain("### Server: playwright (DISABLED)");

    // Toggle back on
    const state2 = await router.toggleServer("playwright");
    expect(state2).toBe(true);
    expect(router.isServerEnabled("playwright")).toBe(true);

    // Call should succeed again
    const res = await router.callTool("playwright", "browser_navigate", {
      url: "https://example.com",
    });
    expect(res).toBe("Navigated to https://example.com");
  });

  it("registers stdio servers from config object", () => {
    const router = new McpRouter();
    router.registerConfigServers({
      playwright: {
        command: "npx",
        args: ["-y", "@playwright/mcp@latest"],
        disabled: false,
      },
      github: {
        command: "npx",
        args: ["-y", "@modelcontextprotocol/server-github"],
        disabled: true,
      },
    });

    expect(router.getServerNames()).toEqual(["playwright", "github"]);
    expect(router.isServerEnabled("playwright")).toBe(true);
    expect(router.isServerEnabled("github")).toBe(false);

    const statuses = router.getServerStatus();
    expect(statuses).toHaveLength(2);
    expect(statuses[0].name).toBe("playwright");
    expect(statuses[0].enabled).toBe(true);
    expect(statuses[1].name).toBe("github");
    expect(statuses[1].enabled).toBe(false);
  });
});
