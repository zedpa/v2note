/**
 * Onboarding handler v3 — 极简两步引导。
 *
 * Step 1: 输入名字 → 存 UserProfile.name
 * Step 2: 输入一句话 → 调用 process pipeline → 返回 AI 拆解结果
 *
 * 不再创建欢迎日记 / seed goals / seed strikes。
 * 不再收集 occupation / current_focus / pain_points / review_time。
 */
interface OnboardingChatInput {
    userId: string;
    deviceId: string;
    step: number;
    answer: string;
}
interface OnboardingStep1Result {
    step: 1;
    done: false;
    name: string;
}
interface OnboardingStep2Result {
    step: 2;
    done: true;
    summary?: string;
    todos?: string[];
    tags?: string[];
    recordId?: string;
}
export type OnboardingChatResult = OnboardingStep1Result | OnboardingStep2Result;
export declare function handleOnboardingChat(input: OnboardingChatInput): Promise<OnboardingChatResult>;
export {};
