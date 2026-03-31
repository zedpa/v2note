/**
 * 认知报告生成 — 纯数据聚合，0 AI 调用。
 *
 * 在 daily-cycle 末尾调用，产出结构化报告供晨间/晚间简报使用。
 */
export interface CognitiveReport {
    today_strikes: {
        perceive: number;
        judge: number;
        realize: number;
        intend: number;
        feel: number;
    };
    contradictions: Array<{
        strikeA_nucleus: string;
        strikeB_nucleus: string;
        strength: number;
    }>;
    cluster_changes: Array<{
        name: string;
        type: "created" | "merged" | "archived";
    }>;
    behavior_drift: {
        intend_count: number;
        todo_completed: number;
        completion_rate: number;
    };
    is_empty: boolean;
}
export declare function generateCognitiveReport(opts: {
    userId?: string;
    deviceId?: string;
}): Promise<CognitiveReport>;
