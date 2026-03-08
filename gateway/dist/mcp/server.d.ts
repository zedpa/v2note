/**
 * MCP Server — exposes v2note built-in tools as standard MCP protocol.
 *
 * This allows external AI agents (Claude, ChatGPT, etc.) to discover
 * and use v2note's capabilities via the Model Context Protocol.
 *
 * Endpoint: POST /mcp (JSON-RPC 2.0)
 */
import type { Router } from "../router.js";
/**
 * Register the MCP server endpoint on the router.
 */
export declare function registerMCPServerRoutes(router: Router): void;
