/**
 * Goal Lifecycle — 健康度计算、涌现目标、状态流转、行动事件、时间线
 */
import type { StrikeEntry } from "../db/repositories/strike.js";
import type { Goal } from "../db/repositories/goal.js";
export interface GoalHealth {
    direction: number;
    resource: number;
    path: number;
    drive: number;
}
/**
 * 计算目标健康度四维分数。
 * 通过 goal.cluster_id → Cluster 成员 Strike 统计。
 */
export declare function computeGoalHealth(goalId: string): Promise<GoalHealth | null>;
/**
 * 检查 Cluster 的 intend 密度是否超标。
 * 如果是且无已关联 active goal，创建 suggested goal。
 */
export declare function checkIntendEmergence(cluster: StrikeEntry, userId: string): Promise<Goal | null>;
export declare function createActionEvent(event: {
    todo_id: string;
    type: "complete" | "skip" | "resume";
    reason?: string;
}): Promise<void>;
type GoalEvent = "todo_completed" | "todo_skipped_3" | "all_todos_done" | "user_confirm" | "user_archive";
/**
 * 根据事件更新目标状态。
 */
export declare function updateGoalStatus(goalId: string, event: GoalEvent): Promise<void>;
export interface TimelineEntry {
    id: string;
    source_id: string | null;
    nucleus: string;
    polarity: string;
    created_at: string;
}
/**
 * 获取目标关联的日记时间线（通过 cluster 成员 Strike 追溯）。
 */
export declare function getGoalTimeline(goalId: string): Promise<TimelineEntry[]>;
export {};
