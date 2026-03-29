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
import type { ToolDefinition, ToolCallResult, ToolContext, ToolAutonomy } from "./types.js";

export class ToolRegistry {
  private tools = new Map<string, ToolDefinition>();

  /** 注册一个工具 */
  register(def: ToolDefinition): void {
    if (this.tools.has(def.name)) {
      throw new Error(`Tool "${def.name}" already registered`);
    }
    this.tools.set(def.name, def);
  }

  /** 根据名称获取工具定义 */
  get(name: string): ToolDefinition | undefined {
    return this.tools.get(name);
  }

  /** 检查工具是否已注册 */
  has(name: string): boolean {
    return this.tools.has(name);
  }

  /** 获取所有已注册工具 */
  getAll(): ToolDefinition[] {
    return Array.from(this.tools.values());
  }

  /** 按自主度筛选工具 */
  getByAutonomy(level: ToolAutonomy): ToolDefinition[] {
    return this.getAll().filter((t) => t.autonomy === level);
  }

  /** 获取工具的自主度等级 */
  getAutonomy(name: string): ToolAutonomy | undefined {
    return this.tools.get(name)?.autonomy;
  }

  /**
   * 执行工具，含 Zod 参数验证和错误兜底
   */
  async execute(
    name: string,
    args: unknown,
    ctx: ToolContext,
  ): Promise<ToolCallResult> {
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
    } catch (err: any) {
      console.error(`[tool-registry] Tool "${name}" error:`, err);
      return { success: false, message: `工具执行失败: ${err.message ?? String(err)}` };
    }
  }

  /**
   * 导出为 Vercel AI SDK tools 格式
   * 用于 generateText({ tools }) 原生 function calling
   */
  toAISDKTools(ctx?: ToolContext): Record<string, ReturnType<typeof tool>> {
    const result: Record<string, ReturnType<typeof tool>> = {};

    for (const def of this.tools.values()) {
      // AI SDK v6 使用 inputSchema 而非 parameters
      result[def.name] = tool({
        description: def.description,
        inputSchema: def.parameters,
        execute: async (args: any, _extra: any) => {
          const execCtx = ctx ?? {
            deviceId: "unknown",
            sessionId: "unknown",
          };
          return this.execute(def.name, args, execCtx);
        },
      } as any);
    }

    return result;
  }
}
