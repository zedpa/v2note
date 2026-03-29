/**
 * Onboarding handler — 处理冷启动 5 问的每步回答。
 *
 * Q1: 称呼 → UserProfile.name
 * Q2: 生活阶段 → 日记 + Digest
 * Q3: 当前焦点 → 日记 + Digest
 * Q4: 痛点 → UserProfile.pain_points + 日记 + Digest
 * Q5: 习惯 → onboarding_done + 日记 + Digest
 */
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
export declare function handleOnboardingAnswer(input: OnboardingInput): Promise<OnboardingResult>;
export {};
