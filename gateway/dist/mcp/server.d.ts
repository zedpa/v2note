/**
 * MCP Server — exposes v2note tools as standard MCP protocol.
 *
 * Now uses ToolRegistry instead of legacy BUILTIN_TOOLS.
 *
 * Endpoint: POST /mcp (JSON-RPC 2.0)
 */
import type { Router } from "../router.js";
/**
 * Register the MCP server endpoint on the router.
 */
export declare function registerMCPServerRoutes(router: Router): void;
