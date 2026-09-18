import { describe, expect, it, beforeEach, afterEach } from "bun:test";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";
import { saveServerEnabled } from "../src/config";

describe("MCP Config Management", () => {
  let tempDir: string;
  let configPath: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "mcp-cfg-test-"));
    configPath = path.join(tempDir, "mcp.json");
    await fs.writeFile(
      configPath,
      JSON.stringify({
        mcpServers: {
          playwright: {
            command: "npx",
            args: ["-y", "@playwright/mcp@latest"],
            disabled: false,
          },
        },
      }),
      "utf-8"
    );
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  it("toggles server disabled state to true in config file", async () => {
    await saveServerEnabled("playwright", false, configPath);
    const content = JSON.parse(await fs.readFile(configPath, "utf-8"));
    expect(content.mcpServers.playwright.disabled).toBe(true);
  });

  it("toggles server disabled state to false in config file", async () => {
    await saveServerEnabled("playwright", false, configPath);
    await saveServerEnabled("playwright", true, configPath);
    const content = JSON.parse(await fs.readFile(configPath, "utf-8"));
    expect(content.mcpServers.playwright.disabled).toBe(false);
  });

  it("throws when server does not exist in config", async () => {
    expect(saveServerEnabled("nonexistent", false, configPath)).rejects.toThrow(
      "Server 'nonexistent' not found in configuration"
    );
  });
});
