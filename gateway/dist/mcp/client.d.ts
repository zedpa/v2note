/**
 * MCP Client — JSON-RPC 2.0 client for connecting to MCP tool servers.
 * Supports stdio and HTTP transports.
 */
import { EventEmitter } from "node:events";
export interface MCPToolDefinition {
    name: string;
    description: string;
    inputSchema?: Record<string, unknown>;
}
export interface MCPToolCallResult {
    content: Array<{
        type: string;
        text?: string;
    }>;
    isError?: boolean;
}
export type MCPTransport = "stdio" | "http";
export interface MCPServerConfig {
    name: string;
    transport: MCPTransport;
    command?: string;
    args?: string[];
    url?: string;
    description?: string;
    enabled: boolean;
}
export declare class MCPClient extends EventEmitter {
    private config;
    private process;
    private requestId;
    private pendingRequests;
    private buffer;
    private tools;
    private _connected;
    constructor(config: MCPServerConfig);
    get name(): string;
    get connected(): boolean;
    get availableTools(): MCPToolDefinition[];
    /**
     * Connect to the MCP server.
     */
    connect(): Promise<void>;
    /**
     * Disconnect from the MCP server.
     */
    disconnect(): void;
    /**
     * Call a tool on the MCP server.
     */
    callTool(toolName: string, args: Record<string, unknown>): Promise<MCPToolCallResult>;
    /**
     * List available tools from the MCP server.
     */
    listTools(): Promise<MCPToolDefinition[]>;
    private connectStdio;
    private connectHttp;
    private sendRequest;
    private sendStdioRequest;
    private sendHttpRequest;
    private sendNotification;
    private processBuffer;
}
