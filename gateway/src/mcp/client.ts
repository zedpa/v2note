/**
 * MCP Client — JSON-RPC 2.0 client for connecting to MCP tool servers.
 * Supports stdio and HTTP transports.
 */

import { spawn, type ChildProcess } from "node:child_process";
import { EventEmitter } from "node:events";

export interface MCPToolDefinition {
  name: string;
  description: string;
  inputSchema?: Record<string, unknown>;
}

export interface MCPToolCallResult {
  content: Array<{ type: string; text?: string }>;
  isError?: boolean;
}

interface JsonRpcRequest {
  jsonrpc: "2.0";
  id: number;
  method: string;
  params?: Record<string, unknown>;
}

interface JsonRpcResponse {
  jsonrpc: "2.0";
  id: number;
  result?: unknown;
  error?: { code: number; message: string; data?: unknown };
}

export type MCPTransport = "stdio" | "http";

export interface MCPServerConfig {
  name: string;
  transport: MCPTransport;
  // stdio transport
  command?: string;
  args?: string[];
  // http transport
  url?: string;
  description?: string;
  enabled: boolean;
}

export class MCPClient extends EventEmitter {
  private config: MCPServerConfig;
  private process: ChildProcess | null = null;
  private requestId = 0;
  private pendingRequests = new Map<number, {
    resolve: (value: unknown) => void;
    reject: (reason: Error) => void;
  }>();
  private buffer = "";
  private tools: MCPToolDefinition[] = [];
  private _connected = false;

  constructor(config: MCPServerConfig) {
    super();
    this.config = config;
  }

  get name(): string {
    return this.config.name;
  }

  get connected(): boolean {
    return this._connected;
  }

  get availableTools(): MCPToolDefinition[] {
    return this.tools;
  }

  /**
   * Connect to the MCP server.
   */
  async connect(): Promise<void> {
    if (this.config.transport === "stdio") {
      await this.connectStdio();
    } else {
      await this.connectHttp();
    }
  }

  /**
   * Disconnect from the MCP server.
   */
  disconnect(): void {
    if (this.process) {
      this.process.kill();
      this.process = null;
    }
    this._connected = false;
    this.pendingRequests.clear();
  }

  /**
   * Call a tool on the MCP server.
   */
  async callTool(toolName: string, args: Record<string, unknown>): Promise<MCPToolCallResult> {
    const result = await this.sendRequest("tools/call", {
      name: toolName,
      arguments: args,
    });
    return result as MCPToolCallResult;
  }

  /**
   * List available tools from the MCP server.
   */
  async listTools(): Promise<MCPToolDefinition[]> {
    const result = await this.sendRequest("tools/list", {}) as { tools: MCPToolDefinition[] };
    this.tools = result.tools ?? [];
    return this.tools;
  }

  // ── Private: stdio transport ──

  private async connectStdio(): Promise<void> {
    if (!this.config.command) {
      throw new Error(`MCP server "${this.config.name}": no command specified for stdio transport`);
    }

    this.process = spawn(this.config.command, this.config.args ?? [], {
      stdio: ["pipe", "pipe", "pipe"],
    });

    this.process.stdout?.on("data", (data: Buffer) => {
      this.buffer += data.toString();
      this.processBuffer();
    });

    this.process.stderr?.on("data", (data: Buffer) => {
      console.error(`[mcp:${this.config.name}] stderr:`, data.toString());
    });

    this.process.on("close", (code) => {
      console.log(`[mcp:${this.config.name}] Process exited with code ${code}`);
      this._connected = false;
      this.emit("disconnected");
    });

    this.process.on("error", (err) => {
      console.error(`[mcp:${this.config.name}] Process error:`, err.message);
      this._connected = false;
    });

    // Initialize the connection
    await this.sendRequest("initialize", {
      protocolVersion: "2024-11-05",
      capabilities: {},
      clientInfo: { name: "v2note-gateway", version: "1.0.0" },
    });

    // Send initialized notification
    this.sendNotification("notifications/initialized", {});

    this._connected = true;

    // Fetch available tools
    await this.listTools();
    console.log(`[mcp:${this.config.name}] Connected, ${this.tools.length} tools available`);
  }

  // ── Private: HTTP transport ──

  private async connectHttp(): Promise<void> {
    if (!this.config.url) {
      throw new Error(`MCP server "${this.config.name}": no URL specified for HTTP transport`);
    }

    // For HTTP, we just verify the server is reachable
    try {
      const initResult = await this.sendHttpRequest("initialize", {
        protocolVersion: "2024-11-05",
        capabilities: {},
        clientInfo: { name: "v2note-gateway", version: "1.0.0" },
      });

      this._connected = true;

      // Fetch available tools
      await this.listTools();
      console.log(`[mcp:${this.config.name}] Connected via HTTP, ${this.tools.length} tools available`);
    } catch (err: any) {
      throw new Error(`MCP server "${this.config.name}" connection failed: ${err.message}`);
    }
  }

  // ── Private: request helpers ──

  private async sendRequest(method: string, params: Record<string, unknown>): Promise<unknown> {
    if (this.config.transport === "http") {
      return this.sendHttpRequest(method, params);
    }
    return this.sendStdioRequest(method, params);
  }

  private sendStdioRequest(method: string, params: Record<string, unknown>): Promise<unknown> {
    return new Promise((resolve, reject) => {
      const id = ++this.requestId;
      const request: JsonRpcRequest = {
        jsonrpc: "2.0",
        id,
        method,
        params,
      };

      this.pendingRequests.set(id, { resolve, reject });

      const data = JSON.stringify(request) + "\n";
      this.process?.stdin?.write(data);

      // Timeout after 30 seconds
      setTimeout(() => {
        if (this.pendingRequests.has(id)) {
          this.pendingRequests.delete(id);
          reject(new Error(`MCP request timeout: ${method}`));
        }
      }, 30000);
    });
  }

  private async sendHttpRequest(method: string, params: Record<string, unknown>): Promise<unknown> {
    const id = ++this.requestId;
    const request: JsonRpcRequest = {
      jsonrpc: "2.0",
      id,
      method,
      params,
    };

    const res = await fetch(this.config.url!, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(request),
    });

    if (!res.ok) {
      throw new Error(`HTTP ${res.status}: ${await res.text()}`);
    }

    const response: JsonRpcResponse = await res.json();
    if (response.error) {
      throw new Error(`MCP error: ${response.error.message}`);
    }

    return response.result;
  }

  private sendNotification(method: string, params: Record<string, unknown>): void {
    if (this.config.transport === "http") return;

    const notification = JSON.stringify({
      jsonrpc: "2.0",
      method,
      params,
    }) + "\n";
    this.process?.stdin?.write(notification);
  }

  private processBuffer(): void {
    const lines = this.buffer.split("\n");
    this.buffer = lines.pop() ?? "";

    for (const line of lines) {
      if (!line.trim()) continue;
      try {
        const response: JsonRpcResponse = JSON.parse(line);
        if (response.id && this.pendingRequests.has(response.id)) {
          const { resolve, reject } = this.pendingRequests.get(response.id)!;
          this.pendingRequests.delete(response.id);

          if (response.error) {
            reject(new Error(`MCP error: ${response.error.message}`));
          } else {
            resolve(response.result);
          }
        }
      } catch {
        // Skip non-JSON lines
      }
    }
  }
}
