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
export declare class ToolRegistry {
    private tools;
    /** 注册一个工具 */
    register(def: ToolDefinition): void;
    /** 根据名称获取工具定义 */
    get(name: string): ToolDefinition | undefined;
    /** 检查工具是否已注册 */
    has(name: string): boolean;
    /** 获取所有已注册工具 */
    getAll(): ToolDefinition[];
    /** 按自主度筛选工具 */
    getByAutonomy(level: ToolAutonomy): ToolDefinition[];
    /** 获取工具的自主度等级 */
    getAutonomy(name: string): ToolAutonomy | undefined;
    /**
     * 执行工具，含 Zod 参数验证和错误兜底
     */
    execute(name: string, args: unknown, ctx: ToolContext): Promise<ToolCallResult>;
    /**
     * 导出为 Vercel AI SDK tools 格式
     * 用于 generateText({ tools }) 原生 function calling
     */
    toAISDKTools(ctx?: ToolContext): Record<string, ReturnType<typeof tool>>;
}
