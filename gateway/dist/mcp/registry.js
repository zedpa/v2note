/**
 * MCP Server Registry — manages multiple MCP connections.
 */
import { MCPClient } from "./client.js";
export class MCPRegistry {
    clients = new Map();
    /**
     * Register and connect to an MCP server.
     */
    async register(config) {
        if (!config.enabled) {
            console.log(`[mcp-registry] Skipping disabled server: ${config.name}`);
            return;
        }
        if (this.clients.has(config.name)) {
            console.warn(`[mcp-registry] Server already registered: ${config.name}`);
            return;
        }
        const client = new MCPClient(config);
        try {
            await client.connect();
            this.clients.set(config.name, client);
            console.log(`[mcp-registry] Registered: ${config.name}`);
        }
        catch (err) {
            console.error(`[mcp-registry] Failed to register ${config.name}: ${err.message}`);
        }
    }
    /**
     * Register multiple servers.
     */
    async registerAll(configs) {
        for (const config of configs) {
            await this.register(config);
        }
    }
    /**
     * Unregister and disconnect from an MCP server.
     */
    unregister(name) {
        const client = this.clients.get(name);
        if (client) {
            client.disconnect();
            this.clients.delete(name);
            console.log(`[mcp-registry] Unregistered: ${name}`);
        }
    }
    /**
     * Unregister all servers.
     */
    unregisterAll() {
        for (const [name, client] of this.clients) {
            client.disconnect();
        }
        this.clients.clear();
    }
    /**
     * Get all available tools across all connected servers.
     */
    getAllTools() {
        const tools = [];
        for (const [serverName, client] of this.clients) {
            if (!client.connected)
                continue;
            for (const tool of client.availableTools) {
                tools.push({ ...tool, serverName });
            }
        }
        return tools;
    }
    /**
     * Get tools formatted for the prompt builder.
     */
    getToolsForPrompt() {
        return this.getAllTools().map((t) => ({
            name: `${t.serverName}__${t.name}`,
            description: t.description,
            parameters: t.inputSchema,
        }));
    }
    /**
     * Call a tool by its full name (serverName__toolName).
     */
    async callTool(fullName, args) {
        const separatorIndex = fullName.indexOf("__");
        if (separatorIndex === -1) {
            throw new Error(`Invalid tool name format: ${fullName}. Expected: serverName__toolName`);
        }
        const serverName = fullName.slice(0, separatorIndex);
        const toolName = fullName.slice(separatorIndex + 2);
        const client = this.clients.get(serverName);
        if (!client) {
            throw new Error(`MCP server not found: ${serverName}`);
        }
        if (!client.connected) {
            throw new Error(`MCP server not connected: ${serverName}`);
        }
        return client.callTool(toolName, args);
    }
    /**
     * Check if any MCP tools are available.
     */
    hasTools() {
        return this.getAllTools().length > 0;
    }
    /**
     * Get the number of connected servers.
     */
    get connectedCount() {
        let count = 0;
        for (const client of this.clients.values()) {
            if (client.connected)
                count++;
        }
        return count;
    }
}
// Singleton instance
let _instance = null;
export function getMCPRegistry() {
    if (!_instance) {
        _instance = new MCPRegistry();
    }
    return _instance;
}
//# sourceMappingURL=registry.js.map