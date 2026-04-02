/**
 * Daily Loop Handler — generates morning briefings and evening summaries.
 *
 * 设计原则：
 * - 晨间简报：聚焦今天要做的事（行动导向）
 * - 晚间回顾：聚焦今天发生了什么 + 预告未完成工作（认知+行动回顾）
 */
/** pg 驱动对 timestamp 列返回 Date 对象，需安全转为 string 以支持 startsWith 筛选 */
export declare function toDateString(v: unknown): string | null;
export interface BriefingResult {
    greeting: string;
    /** 今日最重要的 3-5 件事（排好优先级） */
    today_focus: string[];
    /** 活跃目标简况：目标名 + 今日相关待办数 */
    goal_progress: Array<{
        title: string;
        pending_count: number;
        today_todos: string[];
    }>;
    /** 逾期 / 昨日遗留事项 */
    carry_over: string[];
    /** 待转达 */
    relay_pending: Array<{
        person: string;
        context: string;
        todoId: string;
    }>;
    /** AI 可协助的事项建议 */
    ai_suggestions: string[];
    stats: {
        yesterday_done: number;
        yesterday_total: number;
        streak: number;
    };
}
export interface SummaryResult {
    /** 今日回顾：完成了什么 */
    accomplishments: string[];
    /** 认知收获：今天的思考、领悟、想法变化 */
    cognitive_highlights: string[];
    /** 目标维度：哪些目标推进了 */
    goal_updates: Array<{
        title: string;
        completed_count: number;
        remaining_count: number;
        note: string;
    }>;
    /** 需要关注：跳过多次 / 有阻力的事项 */
    attention_needed: string[];
    /** 转达状态 */
    relay_summary: string[];
    stats: {
        done: number;
        new_records: number;
        new_strikes: number;
        relays_completed: number;
    };
    /** 明日预告：结构化的明日待办预览 */
    tomorrow_preview: {
        scheduled: string[];
        carry_over: string[];
        follow_up: string[];
    };
}
export declare function generateMorningBriefing(deviceId: string, userId?: string, forceRefresh?: boolean): Promise<BriefingResult>;
export declare function generateEveningSummary(deviceId: string, userId?: string, forceRefresh?: boolean): Promise<SummaryResult>;
