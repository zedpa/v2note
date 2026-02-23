/**
 * MCP Client — JSON-RPC 2.0 client for connecting to MCP tool servers.
 * Supports stdio and HTTP transports.
 */
import { spawn } from "node:child_process";
import { EventEmitter } from "node:events";
export class MCPClient extends EventEmitter {
    config;
    process = null;
    requestId = 0;
    pendingRequests = new Map();
    buffer = "";
    tools = [];
    _connected = false;
    constructor(config) {
        super();
        this.config = config;
    }
    get name() {
        return this.config.name;
    }
    get connected() {
        return this._connected;
    }
    get availableTools() {
        return this.tools;
    }
    /**
     * Connect to the MCP server.
     */
    async connect() {
        if (this.config.transport === "stdio") {
            await this.connectStdio();
        }
        else {
            await this.connectHttp();
        }
    }
    /**
     * Disconnect from the MCP server.
     */
    disconnect() {
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
    async callTool(toolName, args) {
        const result = await this.sendRequest("tools/call", {
            name: toolName,
            arguments: args,
        });
        return result;
    }
    /**
     * List available tools from the MCP server.
     */
    async listTools() {
        const result = await this.sendRequest("tools/list", {});
        this.tools = result.tools ?? [];
        return this.tools;
    }
    // ── Private: stdio transport ──
    async connectStdio() {
        if (!this.config.command) {
            throw new Error(`MCP server "${this.config.name}": no command specified for stdio transport`);
        }
        this.process = spawn(this.config.command, this.config.args ?? [], {
            stdio: ["pipe", "pipe", "pipe"],
        });
        this.process.stdout?.on("data", (data) => {
            this.buffer += data.toString();
            this.processBuffer();
        });
        this.process.stderr?.on("data", (data) => {
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
    async connectHttp() {
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
        }
        catch (err) {
            throw new Error(`MCP server "${this.config.name}" connection failed: ${err.message}`);
        }
    }
    // ── Private: request helpers ──
    async sendRequest(method, params) {
        if (this.config.transport === "http") {
            return this.sendHttpRequest(method, params);
        }
        return this.sendStdioRequest(method, params);
    }
    sendStdioRequest(method, params) {
        return new Promise((resolve, reject) => {
            const id = ++this.requestId;
            const request = {
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
    async sendHttpRequest(method, params) {
        const id = ++this.requestId;
        const request = {
            jsonrpc: "2.0",
            id,
            method,
            params,
        };
        const res = await fetch(this.config.url, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(request),
        });
        if (!res.ok) {
            throw new Error(`HTTP ${res.status}: ${await res.text()}`);
        }
        const response = await res.json();
        if (response.error) {
            throw new Error(`MCP error: ${response.error.message}`);
        }
        return response.result;
    }
    sendNotification(method, params) {
        if (this.config.transport === "http")
            return;
        const notification = JSON.stringify({
            jsonrpc: "2.0",
            method,
            params,
        }) + "\n";
        this.process?.stdin?.write(notification);
    }
    processBuffer() {
        const lines = this.buffer.split("\n");
        this.buffer = lines.pop() ?? "";
        for (const line of lines) {
            if (!line.trim())
                continue;
            try {
                const response = JSON.parse(line);
                if (response.id && this.pendingRequests.has(response.id)) {
                    const { resolve, reject } = this.pendingRequests.get(response.id);
                    this.pendingRequests.delete(response.id);
                    if (response.error) {
                        reject(new Error(`MCP error: ${response.error.message}`));
                    }
                    else {
                        resolve(response.result);
                    }
                }
            }
            catch {
                // Skip non-JSON lines
            }
        }
    }
}
//# sourceMappingURL=client.js.map