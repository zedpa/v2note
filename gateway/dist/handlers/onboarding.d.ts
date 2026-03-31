/**
 * Onboarding handler v2 — AI 驱动的冷启动对话。
 *
 * 核心变化（v1 → v2）：
 * - 不再创建日记 / transcript / digest
 * - 每步调 AI（fast tier）生成回应 + 下一问
 * - 只写 UserProfile 字段
 * - Q5 完成后触发 seedWelcomeDiaries + seedGoals + Profile/Soul 初始化
 */
interface OnboardingChatInput {
    userId: string;
    deviceId: string;
    step: number;
    answer: string;
    history: Array<{
        role: "ai" | "user";
        text: string;
    }>;
}
interface ExtractedFields {
    name?: string;
    occupation?: string;
    current_focus?: string;
    pain_points?: string;
    review_time?: string;
    dimensions?: string[];
    seed_goals?: string[];
}
interface OnboardingChatResult {
    reply: string;
    nextStep: number;
    done: boolean;
    extracted: ExtractedFields;
}
interface OnboardingInput {
    userId: string;
    deviceId: string;
    step: number;
    answer: string;
}
interface OnboardingResult {
    ok: boolean;
    recordCreated: boolean;
    skipped: boolean;
}
/** @deprecated 使用 handleOnboardingChat 替代 */
export declare function handleOnboardingAnswer(input: OnboardingInput): Promise<OnboardingResult>;
export declare function handleOnboardingChat(input: OnboardingChatInput): Promise<OnboardingChatResult>;
export {};
