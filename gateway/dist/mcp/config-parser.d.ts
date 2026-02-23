/**
 * Parse MCP server configurations from Tools config (local or markdown).
 */
import type { MCPServerConfig } from "./client.js";
interface ToolsConfig {
    servers: Array<{
        name: string;
        transport: "stdio" | "http";
        command?: string;
        args?: string[];
        url?: string;
        description?: string;
        enabled: boolean;
    }>;
}
/**
 * Parse MCP server configs from a Tools JSON config object.
 */
export declare function parseToolsConfig(config: ToolsConfig | null): MCPServerConfig[];
/**
 * Parse MCP server configs from a markdown string (Tools.md format).
 * Expected format:
 *
 * ```json
 * [{"name": "...", "transport": "...", ...}]
 * ```
 */
export declare function parseToolsMarkdown(markdown: string): MCPServerConfig[];
/**
 * Parse MCP server configs from localConfig payload.
 */
export declare function parseLocalConfigTools(localConfig?: {
    tools?: {
        servers: Array<Record<string, unknown>>;
    };
}): MCPServerConfig[];
export {};
