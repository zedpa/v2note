/**
 * 目标自动关联模块
 * - goalAutoLink: 创建后全量扫描（cluster + 历史记录 + todo）
 * - linkNewStrikesToGoals: digest 后增量关联新 Strike 到已有目标
 * - getProjectProgress: 项目级子目标进度汇总
 */
export interface AutoLinkResult {
    clusterLinked: boolean;
    recordsFound: number;
    todosLinked: number;
}
/**
 * 目标创建后全量关联扫描：
 * 1. 语义匹配 Cluster → 关联
 * 2. 统计相关历史记录数
 * 3. 匹配已有 pending todo → 关联到目标
 */
export declare function goalAutoLink(goalId: string, userId: string): Promise<AutoLinkResult>;
export interface IncrementalLinkResult {
    linked: number;
}
/**
 * digest 后检查新 Strike 是否和已有目标的 Cluster 语义匹配。
 * 匹配度 > 0.6 时将记录标记为目标相关。
 */
export declare function linkNewStrikesToGoals(newStrikes: Array<{
    id: string;
    source_id: string | null;
}>, userId: string): Promise<IncrementalLinkResult>;
export interface ChildGoalProgress {
    id: string;
    title: string;
    status: string;
    totalTodos: number;
    completedTodos: number;
    completionPercent: number;
}
export interface ProjectProgress {
    children: ChildGoalProgress[];
    totalTodos: number;
    completedTodos: number;
    overallPercent: number;
}
/**
 * 获取项目级目标的子目标进度汇总。
 */
export declare function getProjectProgress(projectId: string, userId: string): Promise<ProjectProgress>;
