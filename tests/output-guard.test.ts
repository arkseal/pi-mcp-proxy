import { describe, expect, it, beforeEach, afterEach } from "bun:test";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";
import { guardMcpOutput } from "../src/output-guard";

describe("MCP Output Guard", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "mcp-guard-test-"));
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  it("passes small output through untouched", async () => {
    const text = JSON.stringify({ status: "ok", count: 3 });
    const result = await guardMcpOutput(text, { maxBytes: 1000, maxLines: 50, spillDir: tempDir });

    expect(result.truncated).toBe(false);
    expect(result.content).toBe(text);
    expect(result.spillPath).toBeUndefined();
  });

  it("truncates oversized output and writes full payload to disk", async () => {
    const hugeText = "Line of data\n".repeat(200);
    const result = await guardMcpOutput(hugeText, { maxBytes: 500, maxLines: 20, spillDir: tempDir });

    expect(result.truncated).toBe(true);
    expect(result.spillPath).toBeDefined();
    expect(result.content).toContain("[MCP Output Truncated");
    expect(result.content).toContain(`Full output saved to: ${result.spillPath}`);

    // Verify spilled file on disk
    const saved = await fs.readFile(result.spillPath!, "utf-8");
    expect(saved).toBe(hugeText);
  });
});
