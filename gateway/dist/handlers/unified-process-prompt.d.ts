/**
 * Layer 3 统一处理 Prompt — 一次 AI 调用完成全部工作
 *
 * 替代原来的 3 次串行调用：
 *   1. classifyVoiceIntent（分类） → 合并
 *   2. CLEANUP_SYSTEM_PROMPT（文本清理） → 合并
 *   3. buildDigestPrompt（Strike 拆解） → 合并
 *
 * AI 自主判断：
 *   - 是记录还是指令还是混合
 *   - 文本是否需要清理
 *   - 是否需要拆解为多个 Strike（还是整条作为 1 个）
 *   - 归属到哪个目标/项目
 *   - 是否包含待办
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
}
export declare function buildUnifiedProcessPrompt(ctx: UnifiedProcessContext): string;
