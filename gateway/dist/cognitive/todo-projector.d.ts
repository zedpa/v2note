/**
 * Todo-Strike 数据桥梁 + 智能待办投影
 * intend Strike → todo/goal 投影、粒度判断、时间/优先级提取、重复检测
 * 回补关联、goal-cluster 关联、双向一致性、archive 保护
 */
import type { StrikeEntry } from "../db/repositories/strike.js";
import type { Todo } from "../db/repositories/todo.js";
import type { Goal } from "../db/repositories/goal.js";
export interface ParsedIntendField {
    granularity: "action" | "goal" | "project";
    scheduled_start?: string;
    scheduled_end?: string;
    person?: string;
    priority: number;
}
/**
 * 解析 intend Strike 的 field 对象，提取时间/人物/优先级/粒度。
 */
export declare function parseIntendField(field: Record<string, any>): ParsedIntendField;
/**
 * 简单关键词重叠检测：新 todo 文本 vs 已有待办。
 * 返回匹配的已有 todo，或 null。
 */
export declare function checkDuplicate(text: string, userId: string): Promise<Pick<Todo, "id" | "text"> | null>;
/**
 * 将 intend Strike 投影为 todo 或 goal。
 * - action → 创建 todo
 * - goal → 创建 goal + 自动关联 cluster/todo（B2 快路径）
 * - project → 创建 goal + AI 生成子目标建议（B3 快路径）
 */
export declare function projectIntendStrike(strike: StrikeEntry, userId?: string): Promise<Todo | Goal | null>;
/**
 * 批量回补：对无 strike_id 的 todo，用 embedding 匹配最相关的 intend Strike。
 */
export declare function backfillTodoStrikes(userId: string): Promise<{
    linked: number;
    skipped: number;
}>;
/**
 * 回填：扫描所有无 cluster_id 的活跃目标，用 embedding 匹配最近的活跃集群。
 * batch-analyze 后调用，确保新建集群能吸收已有孤立目标。
 */
export declare function linkGoalsToClusters(userId: string): Promise<{
    linked: number;
}>;
export declare function onTodoComplete(todoId: string): Promise<void>;
export declare function guardStrikeArchive(strikeId: string): Promise<boolean>;
export declare function enforceMinSalience(strikeId: string): Promise<void>;
