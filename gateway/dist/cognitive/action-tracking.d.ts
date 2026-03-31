/**
 * 行动事件追踪模块
 * - getActionStats: 行为统计（完成率、跳过原因、按目标、时段分布）
 * - getSkipAlerts: 跳过 3+ 次的行动 alert
 * - getResultTrackingPrompts: 完成 7+ 天未跟进的追踪提示
 */
export interface ActionStats {
    totalEvents: number;
    completionRate: number;
    skipReasons: Array<{
        reason: string;
        count: number;
    }>;
    goalStats: Array<{
        goalId: string;
        goalTitle: string;
        total: number;
        completed: number;
    }>;
    timeDistribution: Array<{
        hour: string;
        count: number;
    }>;
}
/**
 * 统计过去 N 天的行动事件。
 */
export declare function getActionStats(opts: {
    userId?: string;
    deviceId?: string;
}, days?: number): Promise<ActionStats>;
export interface SkipAlert {
    todoId: string;
    todoText: string;
    skipCount: number;
    goalTitle: string | null;
    description: string;
}
/**
 * 获取 skip_count >= 3 的待办 alert（用于每日回顾注入）。
 */
export declare function getSkipAlerts(opts: {
    userId?: string;
    deviceId?: string;
}): Promise<SkipAlert[]>;
export interface ResultTrackingPrompt {
    todoId: string;
    todoText: string;
    completedAt: string;
    goalId: string | null;
    goalTitle: string | null;
    prompt: string;
}
/**
 * 查找完成 7+ 天、关联 goal 仍 active 的 todo → 生成追踪提示。
 */
export declare function getResultTrackingPrompts(opts: {
    userId?: string;
    deviceId?: string;
}): Promise<ResultTrackingPrompt[]>;
