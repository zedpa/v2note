/**
 * 冷启动 5 问 — AI 对话 prompt
 *
 * 约束 AI 在 5 轮内覆盖：称呼、职业/阶段、近期焦点、痛点、空闲时间。
 * 每轮回应 = 1 句共鸣 + 1 句自然过渡提问，总共 ≤ 50 字。
 */
/** 每步话题定义 */
export declare const STEP_TOPICS: Record<number, string>;
/** Fallback 问题：AI 调用失败时使用 */
export declare const FALLBACK_QUESTIONS: Record<number, string>;
/**
 * 构建 system prompt
 */
export declare function buildOnboardingSystemPrompt(step: number, userName: string | null): string;
/**
 * 构建对话历史 messages（供 AI 调用）
 */
export declare function buildOnboardingMessages(systemPrompt: string, history: Array<{
    role: "ai" | "user";
    text: string;
}>, currentAnswer: string): Array<{
    role: "system" | "user" | "assistant";
    content: string;
}>;
