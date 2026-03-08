/**
 * MCP Server — exposes v2note built-in tools as standard MCP protocol.
 *
 * This allows external AI agents (Claude, ChatGPT, etc.) to discover
 * and use v2note's capabilities via the Model Context Protocol.
 *
 * Endpoint: POST /mcp (JSON-RPC 2.0)
 */

import type { Router } from "../router.js";
import { readBody, sendJson, sendError, getDeviceId } from "../lib/http-helpers.js";
import { BUILTIN_TOOLS, callBuiltinTool, type BuiltinToolDef } from "../tools/builtin.js";
import { loadSkills } from "../skills/loader.js";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const SKILLS_DIR = join(__dirname, "../../skills");

interface JsonRpcRequest {
  jsonrpc: "2.0";
  id: number | string;
  method: string;
  params?: Record<string, unknown>;
}

interface JsonRpcResponse {
  jsonrpc: "2.0";
  id: number | string | null;
  result?: unknown;
  error?: { code: number; message: string; data?: unknown };
}

function rpcResult(id: number | string | null, result: unknown): JsonRpcResponse {
  return { jsonrpc: "2.0", id, result };
}

function rpcError(id: number | string | null, code: number, message: string): JsonRpcResponse {
  return { jsonrpc: "2.0", id, error: { code, message } };
}

function toolDefsToMCP(tools: BuiltinToolDef[]) {
  return tools.map((t) => ({
    name: t.name,
    description: t.description,
    inputSchema: t.parameters,
  }));
}

/**
 * Handle a single JSON-RPC request.
 */
async function handleRpcRequest(req: JsonRpcRequest, deviceId: string): Promise<JsonRpcResponse> {
  switch (req.method) {
    case "initialize":
      return rpcResult(req.id, {
        protocolVersion: "2024-11-05",
        capabilities: { tools: {} },
        serverInfo: {
          name: "v2note-gateway",
          version: "1.0.0",
        },
      });

    case "tools/list": {
      const builtinMCP = toolDefsToMCP(BUILTIN_TOOLS);

      // Also expose skills as "info" tools (read-only skill prompts)
      let skillTools: Array<{ name: string; description: string; inputSchema: Record<string, unknown> }> = [];
      try {
        const skills = loadSkills(SKILLS_DIR);
        skillTools = skills.map((s) => ({
          name: `skill_info__${s.name}`,
          description: `获取技能「${s.name}」的提示词。${s.description}`,
          inputSchema: { type: "object", properties: {}, required: [] },
        }));
      } catch {
        // skills dir may not exist
      }

      return rpcResult(req.id, { tools: [...builtinMCP, ...skillTools] });
    }

    case "tools/call": {
      const toolName = String(req.params?.name ?? "");
      const args = (req.params?.arguments ?? {}) as Record<string, unknown>;

      // Handle skill info requests
      if (toolName.startsWith("skill_info__")) {
        const skillName = toolName.replace("skill_info__", "");
        try {
          const skills = loadSkills(SKILLS_DIR);
          const skill = skills.find((s) => s.name === skillName);
          if (skill) {
            return rpcResult(req.id, {
              content: [{ type: "text", text: skill.prompt }],
            });
          }
        } catch { /* ignore */ }
        return rpcResult(req.id, {
          content: [{ type: "text", text: `Skill "${skillName}" not found` }],
          isError: true,
        });
      }

      // Handle built-in tools
      try {
        const result = await callBuiltinTool(toolName, args, deviceId);
        return rpcResult(req.id, {
          content: [{ type: "text", text: result.message }],
          isError: !result.success,
        });
      } catch (err: any) {
        return rpcResult(req.id, {
          content: [{ type: "text", text: `Error: ${err.message}` }],
          isError: true,
        });
      }
    }

    default:
      return rpcError(req.id, -32601, `Method not found: ${req.method}`);
  }
}

/**
 * Register the MCP server endpoint on the router.
 */
export function registerMCPServerRoutes(router: Router) {
  router.post("/mcp", async (req, res) => {
    try {
      const deviceId = getDeviceId(req);
      const body = await readBody<JsonRpcRequest>(req);

      if (body.jsonrpc !== "2.0") {
        sendJson(res, rpcError(body.id ?? null, -32600, "Invalid JSON-RPC version"));
        return;
      }

      const response = await handleRpcRequest(body, deviceId);
      sendJson(res, response);
    } catch (err: any) {
      sendJson(res, rpcError(null, -32603, err.message));
    }
  });

  console.log("[mcp-server] MCP endpoint registered at POST /mcp");
}
