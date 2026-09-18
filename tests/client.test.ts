import { describe, expect, it, afterEach } from "bun:test";
import { StdioMcpClient } from "../src/client";

describe("StdioMcpClient", () => {
  let client: StdioMcpClient | null = null;

  afterEach(() => {
    if (client) {
      client.close();
      client = null;
    }
  });

  it("communicates over stdio JSON-RPC protocol", async () => {
    // A mock server script in node
    const script = `
      let buf = "";
      process.stdin.on("data", (chunk) => {
        buf += chunk.toString();
        const lines = buf.split("\\n");
        buf = lines.pop();
        for (const line of lines) {
          if (!line.trim()) continue;
          const msg = JSON.parse(line);
          if (msg.method === "initialize") {
            process.stdout.write(JSON.stringify({
              jsonrpc: "2.0",
              id: msg.id,
              result: { capabilities: { tools: {} }, serverInfo: { name: "mock", version: "1.0" } }
            }) + "\\n");
          } else if (msg.method === "tools/list") {
            process.stdout.write(JSON.stringify({
              jsonrpc: "2.0",
              id: msg.id,
              result: { tools: [{ name: "test_tool", description: "A mock tool" }] }
            }) + "\\n");
          } else if (msg.method === "tools/call") {
            process.stdout.write(JSON.stringify({
              jsonrpc: "2.0",
              id: msg.id,
              result: { content: [{ type: "text", text: "Hello from mock: " + msg.params.arguments.name }] }
            }) + "\\n");
          }
        }
      });
    `;

    client = new StdioMcpClient("mock_server", {
      command: "node",
      args: ["-e", script],
    });

    const tools = await client.listTools();
    expect(tools).toHaveLength(1);
    expect(tools[0].name).toBe("test_tool");
    expect(tools[0].description).toBe("A mock tool");

    const result = await client.callTool("test_tool", { name: "Pi" });
    expect(result).toBe("Hello from mock: Pi");
  });
});
