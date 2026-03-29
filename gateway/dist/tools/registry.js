/**
 * ToolRegistry — 工具注册中心
 *
 * 统一管理所有工具定义，支持：
 * - 注册/查找/列举工具
 * - 按自主度分级筛选
 * - 导出为 Vercel AI SDK tools 格式（原生 function calling）
 * - Zod 参数验证 + 错误兜底
 */
import { tool } from "ai";
export class ToolRegistry {
    tools = new Map();
    /** 注册一个工具 */
    register(def) {
        if (this.tools.has(def.name)) {
            throw new Error(`Tool "${def.name}" already registered`);
        }
        this.tools.set(def.name, def);
    }
    /** 根据名称获取工具定义 */
    get(name) {
        return this.tools.get(name);
    }
    /** 检查工具是否已注册 */
    has(name) {
        return this.tools.has(name);
    }
    /** 获取所有已注册工具 */
    getAll() {
        return Array.from(this.tools.values());
    }
    /** 按自主度筛选工具 */
    getByAutonomy(level) {
        return this.getAll().filter((t) => t.autonomy === level);
    }
    /** 获取工具的自主度等级 */
    getAutonomy(name) {
        return this.tools.get(name)?.autonomy;
    }
    /**
     * 执行工具，含 Zod 参数验证和错误兜底
     */
    async execute(name, args, ctx) {
        const def = this.tools.get(name);
        if (!def) {
            return { success: false, message: `未知工具: ${name}` };
        }
        // Zod 参数验证
        const parsed = def.parameters.safeParse(args);
        if (!parsed.success) {
            const issues = parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ");
            return { success: false, message: `参数验证失败: ${issues}` };
        }
        // 执行 handler，兜底错误
        try {
            return await def.handler(parsed.data, ctx);
        }
        catch (err) {
            console.error(`[tool-registry] Tool "${name}" error:`, err);
            return { success: false, message: `工具执行失败: ${err.message ?? String(err)}` };
        }
    }
    /**
     * 导出为 Vercel AI SDK tools 格式
     * 用于 generateText({ tools }) 原生 function calling
     */
    toAISDKTools(ctx) {
        const result = {};
        for (const def of this.tools.values()) {
            // AI SDK v6 使用 inputSchema 而非 parameters
            result[def.name] = tool({
                description: def.description,
                inputSchema: def.parameters,
                execute: async (args, _extra) => {
                    const execCtx = ctx ?? {
                        deviceId: "unknown",
                        sessionId: "unknown",
                    };
                    return this.execute(def.name, args, execCtx);
                },
            });
        }
        return result;
    }
}
//# sourceMappingURL=registry.js.map