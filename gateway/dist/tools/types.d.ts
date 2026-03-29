/**
 * Agent 工具层类型定义
 *
 * 三级自主度：silent（静默）→ notify（告知）→ confirm（确认）
 * 工具结果包含结构化 data + next_hint 供 LLM 多步推理
 */
import type { z } from "zod";
/** 工具自主度等级 */
export type ToolAutonomy = "silent" | "notify" | "confirm";
/** 工具执行上下文 */
export interface ToolContext {
    deviceId: string;
    userId?: string;
    sessionId: string;
    planId?: string;
}
/** 工具执行结果 */
export interface ToolCallResult {
    success: boolean;
    /** 人类可读摘要 */
    message: string;
    /** 结构化数据（LLM 可用于后续推理） */
    data?: Record<string, unknown>;
    /** 给 LLM 的下一步导航提示 */
    next_hint?: string;
}
/** 工具定义（用于注册） */
export interface ToolDefinition {
    name: string;
    /** 含正例+反例的完整描述 */
    description: string;
    /** Zod schema 定义参数 */
    parameters: z.ZodType<any>;
    /** 自主度等级 */
    autonomy: ToolAutonomy;
    /** 工具执行函数 */
    handler: (args: any, ctx: ToolContext) => Promise<ToolCallResult>;
}
/** 统一搜索参数 */
export interface SearchParams {
    query: string;
    scope: "all" | "records" | "goals" | "todos" | "clusters";
    time_range?: {
        from: string;
        to: string;
    };
    limit?: number;
}
/** 搜索结果项 */
export interface SearchResultItem {
    id: string;
    type: "record" | "goal" | "todo" | "cluster";
    title: string;
    snippet?: string;
    score: number;
    status?: string;
    created_at?: string;
}
