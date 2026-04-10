/**
 * 认知报告生成 — 纯数据聚合，0 AI 调用。
 *
 * v3: 数据源从 strike/bond/cluster 切换到 wiki page + record。
 * 在 daily-cycle 末尾调用，产出结构化报告供晨间/晚间简报使用。
 */
export interface CognitiveReport {
    /** 今日新增 record 数量 */
    today_records: number;
    /** wiki page 中「矛盾/未决」段落（从 content 中提取） */
    contradictions: Array<{
        page_title: string;
        snippet: string;
    }>;
    /** 今日新建/更新的 wiki page */
    wiki_changes: Array<{
        title: string;
        type: "created" | "updated";
    }>;
    /** 行为偏差：今日待办完成率 */
    behavior_drift: {
        today_records: number;
        todo_completed: number;
        completion_rate: number;
    };
    is_empty: boolean;
}
export declare function generateCognitiveReport(opts: {
    userId?: string;
    deviceId?: string;
}): Promise<CognitiveReport>;
