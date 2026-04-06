/**
 * Layer 3 统一处理 Prompt — 一次 AI 调用完成全部工作
 *
 * v3 架构简化：去掉 Strike 中间层
 * Record（日记）和 Todo（待办）是唯一两个核心实体
 * AI 一次返回：summary + domain + tags + todos + commands
 */
export interface UnifiedProcessContext {
    activeGoals: Array<{
        id: string;
        title: string;
    }>;
    pendingTodos: Array<{
        id: string;
        text: string;
        scheduled_start?: string;
    }>;
    existingDomains: string[];
}
export declare function buildUnifiedProcessPrompt(ctx: UnifiedProcessContext): string;
