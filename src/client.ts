import { spawn, type ChildProcess } from "node:child_process";
import type { McpServerConfig } from "./config.js";

export interface McpTool {
  name: string;
  description?: string;
  inputSchema?: any;
}

export class StdioMcpClient {
  private child: ChildProcess | null = null;
  private buffer = "";
  private nextId = 1;
  private pending = new Map<
    number,
    {
      resolve: (res: any) => void;
      reject: (err: any) => void;
      timer: NodeJS.Timeout;
    }
  >();
  private isInitialized = false;
  private cachedTools: McpTool[] | null = null;
  private stderrOutput: string[] = [];

  constructor(
    public readonly serverName: string,
    public readonly config: McpServerConfig
  ) {}

  public isRunning(): boolean {
    return this.child !== null && !this.child.killed;
  }

  public getCachedTools(): McpTool[] | null {
    return this.cachedTools;
  }

  async ensureConnected(timeoutMs = 20000): Promise<void> {
    if (this.child && this.isInitialized) {
      return;
    }

    await this.spawnAndInit(timeoutMs);
  }

  private async spawnAndInit(timeoutMs: number): Promise<void> {
    this.close();

    const env = { ...process.env, ...(this.config.env ?? {}) };
    const child = spawn(this.config.command, this.config.args ?? [], {
      env,
      stdio: ["pipe", "pipe", "pipe"],
    });

    this.child = child;
    this.buffer = "";
    this.stderrOutput = [];

    child.stdout.on("data", (chunk: Buffer) => {
      this.buffer += chunk.toString("utf-8");
      const lines = this.buffer.split("\n");
      this.buffer = lines.pop() ?? "";
      for (const line of lines) {
        if (!line.trim()) continue;
        this.handleMessage(line);
      }
    });

    child.stderr.on("data", (chunk: Buffer) => {
      const text = chunk.toString("utf-8");
      this.stderrOutput.push(text);
      if (this.stderrOutput.length > 50) this.stderrOutput.shift();
    });

    child.on("error", (err) => {
      this.rejectAllPending(
        new Error(`MCP server '${this.serverName}' process error: ${err.message}`)
      );
    });

    child.on("exit", (code, signal) => {
      this.isInitialized = false;
      this.child = null;
      this.cachedTools = null;
      if (code !== 0 && code !== null) {
        const stderrSnippet = this.stderrOutput.slice(-5).join("\n").trim();
        this.rejectAllPending(
          new Error(
            `MCP server '${this.serverName}' exited with code ${code}.${
              stderrSnippet ? `\nStderr: ${stderrSnippet}` : ""
            }`
          )
        );
      } else {
        this.rejectAllPending(
          new Error(
            `MCP server '${this.serverName}' exited (signal: ${signal ?? "none"})`
          )
        );
      }
    });

    // 1. Send initialize
    await this.sendRequest(
      "initialize",
      {
        protocolVersion: "2024-11-05",
        capabilities: {},
        clientInfo: { name: "pi-mcp-proxy", version: "1.0.0" },
      },
      timeoutMs
    );

    // 2. Send initialized notification
    this.sendNotification("notifications/initialized");
    this.isInitialized = true;
  }

  private handleMessage(raw: string) {
    try {
      const msg = JSON.parse(raw);
      if (typeof msg.id === "number" && this.pending.has(msg.id)) {
        const { resolve, reject, timer } = this.pending.get(msg.id)!;
        clearTimeout(timer);
        this.pending.delete(msg.id);

        if (msg.error) {
          reject(
            new Error(
              msg.error.message || `JSON-RPC error code ${msg.error.code}`
            )
          );
        } else {
          resolve(msg.result);
        }
      }
    } catch {
      // Ignore non-JSON or partial lines
    }
  }

  private sendRequest(
    method: string,
    params?: any,
    timeoutMs = 30000
  ): Promise<any> {
    if (!this.child || !this.child.stdin) {
      return Promise.reject(
        new Error(`MCP server '${this.serverName}' is not running.`)
      );
    }

    const id = this.nextId++;
    const payload =
      JSON.stringify({
        jsonrpc: "2.0",
        id,
        method,
        params: params ?? {},
      }) + "\n";

    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        if (this.pending.has(id)) {
          this.pending.delete(id);
          reject(
            new Error(
              `MCP request '${method}' to '${this.serverName}' timed out after ${timeoutMs}ms.`
            )
          );
        }
      }, timeoutMs);

      this.pending.set(id, { resolve, reject, timer });
      this.child!.stdin!.write(payload);
    });
  }

  private sendNotification(method: string, params?: any): void {
    if (!this.child || !this.child.stdin) return;
    const payload =
      JSON.stringify({
        jsonrpc: "2.0",
        method,
        params,
      }) + "\n";
    this.child.stdin.write(payload);
  }

  private rejectAllPending(err: Error) {
    for (const [_, req] of this.pending) {
      clearTimeout(req.timer);
      req.reject(err);
    }
    this.pending.clear();
  }

  async listTools(): Promise<McpTool[]> {
    if (this.cachedTools) return this.cachedTools;
    await this.ensureConnected();
    const res = await this.sendRequest("tools/list", {});
    const tools = (res?.tools as McpTool[]) ?? [];
    this.cachedTools = tools;
    return tools;
  }

  async callTool(tool: string, args: Record<string, any>): Promise<any> {
    await this.ensureConnected();
    const res = await this.sendRequest("tools/call", {
      name: tool,
      arguments: args,
    });

    if (res?.isError) {
      const errorText = Array.isArray(res.content)
        ? res.content.map((c: any) => c.text ?? JSON.stringify(c)).join("\n")
        : JSON.stringify(res);
      throw new Error(errorText || `Tool call '${tool}' reported an error.`);
    }

    if (Array.isArray(res?.content)) {
      if (res.content.length === 1 && res.content[0].type === "text") {
        return res.content[0].text;
      }
      return res.content;
    }

    return res;
  }

  close(): void {
    this.rejectAllPending(
      new Error(`Client closed for server '${this.serverName}'`)
    );
    if (this.child) {
      try {
        this.child.kill("SIGTERM");
      } catch {}
      this.child = null;
    }
    this.isInitialized = false;
    this.cachedTools = null;
  }
}
