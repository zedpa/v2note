/**
 * Built-in tools that the AI can invoke during processing or chat.
 * These run in-process (no MCP server needed).
 */
export interface BuiltinToolDef {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
}
export interface ToolCallResult {
    success: boolean;
    message: string;
    data?: Record<string, unknown>;
}
/**
 * Definitions exposed to the AI via system prompt.
 */
export declare const BUILTIN_TOOLS: BuiltinToolDef[];
/**
 * Check if a tool name is a built-in tool.
 */
export declare function isBuiltinTool(name: string): boolean;
/**
 * Execute a built-in tool call.
 */
export declare function callBuiltinTool(name: string, args: Record<string, unknown>, deviceId: string): Promise<ToolCallResult>;
