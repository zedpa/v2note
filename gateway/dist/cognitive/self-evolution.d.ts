/**
 * Agent 自适应 — 交互偏好学习 + Soul 守护。
 *
 * 核心原则：
 * - 偏好融入 Memory（source='interaction'），不新建表
 * - Soul 只在用户显式要求时更新（严格门控）
 * - 偏好需 evidence_count >= 3 才持久化
 * - 旧偏好自动衰减（60天 stale，90天删除）
 */
export declare function shouldUpdateSoulStrict(userMessages: string[]): boolean;
export interface PreferenceExtraction {
    content: string;
    evidenceCount: number;
}
/** 比对 Plan 的 original vs final steps，提取偏好 */
export declare function extractPlanPreference(originalSteps: string[], finalSteps: string[], similarCount: number): PreferenceExtraction | null;
/** 将偏好列表格式化为可注入 system prompt 的文本 */
export declare function formatPreferencesForPrompt(preferences: string[]): string;
export interface FactClassification {
    type: "persistent" | "temporary";
    expiresInDays?: number;
}
export declare function classifyProfileFact(factContent: string): FactClassification;
/** 查找超过 staleDays 未验证的交互偏好 */
export declare function findStalePreferences(userId: string, staleDays: number): Promise<Array<{
    id: string;
    content: string;
    updated_at: string;
}>>;
/** 衰减偏好：60天标记 stale，90天删除 */
export declare function decayPreferences(userId: string): Promise<void>;
export interface UnmetRequestSummary {
    text: string;
    count: number;
}
/** 聚合近 30 天的 unmet_request */
export declare function aggregateUnmetRequests(userId: string): Promise<UnmetRequestSummary[]>;
