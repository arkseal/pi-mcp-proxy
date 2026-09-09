import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";
import { randomUUID } from "node:crypto";

export interface GuardOptions {
  maxBytes?: number; // default 40KB
  maxLines?: number; // default 1500
  spillDir?: string;
}

export interface GuardedResult {
  content: string;
  truncated: boolean;
  totalBytes: number;
  totalLines: number;
  spillPath?: string;
}

export async function guardMcpOutput(
  rawText: string,
  options: GuardOptions = {}
): Promise<GuardedResult> {
  const maxBytes = options.maxBytes ?? 40 * 1024;
  const maxLines = options.maxLines ?? 1500;
  const spillDir = options.spillDir ?? path.join(os.tmpdir(), "pi-mcp");

  const totalBytes = Buffer.byteLength(rawText, "utf-8");
  const lines = rawText.split("\n");
  const totalLines = lines.length;

  if (totalBytes <= maxBytes && totalLines <= maxLines) {
    return {
      content: rawText,
      truncated: false,
      totalBytes,
      totalLines,
    };
  }

  // Spill full text to disk
  await fs.mkdir(spillDir, { recursive: true });
  const spillPath = path.join(spillDir, `mcp-${randomUUID().slice(0, 8)}.json`);
  await fs.writeFile(spillPath, rawText, "utf-8");

  // Format preview (first 50 lines or max 4KB)
  const previewLines = lines.slice(0, 50).join("\n").slice(0, 4096);
  const sizeKb = (totalBytes / 1024).toFixed(1);

  const preview = [
    previewLines,
    "",
    `[MCP Output Truncated: showing first ${Math.min(50, totalLines)} lines of ${totalLines} (${sizeKb} KB). Full output saved to: ${spillPath}]`,
  ].join("\n");

  return {
    content: preview,
    truncated: true,
    totalBytes,
    totalLines,
    spillPath,
  };
}
