/**
 * 心情计算引擎
 * ai-companion-window spec 场景 3.1 + 6.2
 */
export type Mood = "happy" | "curious" | "worried" | "missing" | "caring" | "focused" | "calm";
export interface MoodResult {
    mood: Mood;
    moodText: string;
    moodInstruction: string;
}
interface MoodContext {
    completedTodayCount: number;
    hasNewCluster: boolean;
    hasSkippedTodo: boolean;
    hoursSinceLastRecord: number;
    currentHour: number;
    isDigestRunning: boolean;
}
/**
 * 按优先级计算心情
 */
export declare function computeMood(ctx: MoodContext): MoodResult;
/**
 * 生成注入 system prompt 的心情段落
 * 供 chat handler 使用
 */
export declare function buildMoodPromptSection(result: MoodResult, statusSummary?: string): string;
export {};
