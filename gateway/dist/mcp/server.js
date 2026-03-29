/**
 * MCP Server — exposes v2note tools as standard MCP protocol.
 *
 * Now uses ToolRegistry instead of legacy BUILTIN_TOOLS.
 *
 * Endpoint: POST /mcp (JSON-RPC 2.0)
 */
import { readBody, sendJson, getDeviceId, getUserId } from "../lib/http-helpers.js";
import { createDefaultRegistry } from "../tools/definitions/index.js";
import { loadSkills } from "../skills/loader.js";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
const __dirname = dirname(fileURLToPath(import.meta.url));
const SKILLS_DIR = join(__dirname, "../../skills");
/** MCP 共享注册表 */
const registry = createDefaultRegistry();
function rpcResult(id, result) {
    return { jsonrpc: "2.0", id, result };
}
function rpcError(id, code, message) {
    return { jsonrpc: "2.0", id, error: { code, message } };
}
/**
 * Handle a single JSON-RPC request.
 */
async function handleRpcRequest(req, deviceId, userId) {
    switch (req.method) {
        case "initialize":
            return rpcResult(req.id, {
                protocolVersion: "2024-11-05",
                capabilities: { tools: {} },
                serverInfo: {
                    name: "v2note-gateway",
                    version: "2.0.0",
                },
            });
        case "tools/list": {
            // 从注册表导出工具列表
            const toolList = registry.getAll().map((t) => ({
                name: t.name,
                description: t.description,
                inputSchema: { type: "object" }, // MCP 简化 schema
            }));
            // Also expose skills as "info" tools (read-only skill prompts)
            let skillTools = [];
            try {
                const skills = loadSkills(SKILLS_DIR);
                skillTools = skills.map((s) => ({
                    name: `skill_info__${s.name}`,
                    description: `获取技能「${s.name}」的提示词。${s.description}`,
                    inputSchema: { type: "object", properties: {}, required: [] },
                }));
            }
            catch {
                // skills dir may not exist
            }
            return rpcResult(req.id, { tools: [...toolList, ...skillTools] });
        }
        case "tools/call": {
            const toolName = String(req.params?.name ?? "");
            const args = (req.params?.arguments ?? {});
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
                }
                catch { /* ignore */ }
                return rpcResult(req.id, {
                    content: [{ type: "text", text: `Skill "${skillName}" not found` }],
                    isError: true,
                });
            }
            // Handle registered tools via ToolRegistry
            const ctx = {
                deviceId,
                userId,
                sessionId: `mcp-${Date.now()}`,
            };
            const result = await registry.execute(toolName, args, ctx);
            return rpcResult(req.id, {
                content: [{ type: "text", text: result.message }],
                isError: !result.success,
            });
        }
        default:
            return rpcError(req.id, -32601, `Method not found: ${req.method}`);
    }
}
/**
 * Register the MCP server endpoint on the router.
 */
export function registerMCPServerRoutes(router) {
    router.post("/mcp", async (req, res) => {
        try {
            const deviceId = getDeviceId(req);
            const userId = getUserId(req);
            const body = await readBody(req);
            if (body.jsonrpc !== "2.0") {
                sendJson(res, rpcError(body.id ?? null, -32600, "Invalid JSON-RPC version"));
                return;
            }
            const response = await handleRpcRequest(body, deviceId, userId ?? undefined);
            sendJson(res, response);
        }
        catch (err) {
            sendJson(res, rpcError(null, -32603, err.message));
        }
    });
    console.log("[mcp-server] MCP endpoint registered at POST /mcp");
}
//# sourceMappingURL=server.js.map