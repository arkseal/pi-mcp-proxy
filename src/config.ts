import * as fs from "node:fs/promises";
import * as fsSync from "node:fs";
import * as path from "node:path";
import * as os from "node:os";

export interface McpServerConfig {
  command: string;
  args?: string[];
  env?: Record<string, string>;
  disabled?: boolean;
}

export interface McpConfigFile {
  mcpServers?: Record<string, McpServerConfig>;
}

export function getConfigCandidatePaths(): string[] {
  const home = os.homedir();
  return [
    path.resolve(process.cwd(), ".mcp.json"),
    path.resolve(process.cwd(), ".pi/mcp.json"),
    path.join(home, ".config", "mcp", "mcp.json"),
    path.join(home, ".pi", "agent", "mcp.json"),
  ];
}

export function findActiveConfigPath(): string | null {
  for (const p of getConfigCandidatePaths()) {
    if (fsSync.existsSync(p)) {
      return p;
    }
  }
  return null;
}

export function getConfigMtime(): number {
  const cfgPath = findActiveConfigPath();
  if (!cfgPath) return 0;
  try {
    return fsSync.statSync(cfgPath).mtimeMs;
  } catch {
    return 0;
  }
}

export function getDefaultConfigPath(): string {
  return path.join(os.homedir(), ".config", "mcp", "mcp.json");
}

export async function loadMcpConfig(): Promise<{
  path: string | null;
  servers: Record<string, McpServerConfig>;
}> {
  const cfgPath = findActiveConfigPath();
  if (!cfgPath) {
    return { path: null, servers: {} };
  }

  try {
    const raw = await fs.readFile(cfgPath, "utf-8");
    const parsed: McpConfigFile = JSON.parse(raw);
    return { path: cfgPath, servers: parsed.mcpServers ?? {} };
  } catch (err: any) {
    console.error(`[pi-mcp-proxy] Failed to read MCP config at ${cfgPath}: ${err.message}`);
    return { path: cfgPath, servers: {} };
  }
}

export async function saveServerEnabled(
  serverName: string,
  enabled: boolean,
  overridePath?: string
): Promise<string> {
  const targetPath = overridePath || findActiveConfigPath() || getDefaultConfigPath();
  let parsed: McpConfigFile = {};

  if (fsSync.existsSync(targetPath)) {
    try {
      const raw = await fs.readFile(targetPath, "utf-8");
      parsed = JSON.parse(raw);
    } catch {
      parsed = {};
    }
  }

  if (!parsed.mcpServers) {
    parsed.mcpServers = {};
  }

  if (!parsed.mcpServers[serverName]) {
    throw new Error(`Server '${serverName}' not found in configuration (${targetPath})`);
  }

  parsed.mcpServers[serverName].disabled = !enabled;

  await fs.mkdir(path.dirname(targetPath), { recursive: true });
  await fs.writeFile(targetPath, JSON.stringify(parsed, null, 2) + "\n", "utf-8");
  return targetPath;
}
