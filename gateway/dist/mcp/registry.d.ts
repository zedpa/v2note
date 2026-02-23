/**
 * MCP Server Registry — manages multiple MCP connections.
 */
import { type MCPServerConfig, type MCPToolDefinition, type MCPToolCallResult } from "./client.js";
export declare class MCPRegistry {
    private clients;
    /**
     * Register and connect to an MCP server.
     */
    register(config: MCPServerConfig): Promise<void>;
    /**
     * Register multiple servers.
     */
    registerAll(configs: MCPServerConfig[]): Promise<void>;
    /**
     * Unregister and disconnect from an MCP server.
     */
    unregister(name: string): void;
    /**
     * Unregister all servers.
     */
    unregisterAll(): void;
    /**
     * Get all available tools across all connected servers.
     */
    getAllTools(): Array<MCPToolDefinition & {
        serverName: string;
    }>;
    /**
     * Get tools formatted for the prompt builder.
     */
    getToolsForPrompt(): Array<{
        name: string;
        description: string;
        parameters?: Record<string, unknown>;
    }>;
    /**
     * Call a tool by its full name (serverName__toolName).
     */
    callTool(fullName: string, args: Record<string, unknown>): Promise<MCPToolCallResult>;
    /**
     * Check if any MCP tools are available.
     */
    hasTools(): boolean;
    /**
     * Get the number of connected servers.
     */
    get connectedCount(): number;
}
export declare function getMCPRegistry(): MCPRegistry;
