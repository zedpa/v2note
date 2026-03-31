export interface Todo {
    id: string;
    record_id: string;
    text: string;
    done: boolean;
    estimated_minutes: number | null;
    scheduled_start: string | null;
    scheduled_end: string | null;
    priority: number;
    completed_at: string | null;
    created_at: string;
    category?: string;
    relay_meta?: {
        source_person?: string;
        target_person?: string;
        context?: string;
        direction?: "outgoing" | "incoming";
    };
    domain?: string;
    impact?: number;
    ai_actionable?: boolean;
    ai_action_plan?: string[];
    strike_id?: string | null;
    parent_id?: string | null;
    subtask_count?: number;
    subtask_done_count?: number;
    /** 层级：0=行动, 1=目标, 2=项目（DB DEFAULT 0） */
    level?: number;
    /** 关联的 Cluster（level>=1 时使用，用于认知叙事） */
    cluster_id?: string | null;
    /** 状态（level>=1 时使用）：active/paused/completed/abandoned/progressing/blocked/suggested/dismissed（DB DEFAULT 'active'） */
    status?: string;
    /** 父目标名称（JOIN 得到，非 DB 列） */
    goal_title?: string | null;
}
export declare function findByDevice(deviceId: string): Promise<Todo[]>;
export declare function findByUser(userId: string): Promise<Todo[]>;
export declare function findPendingByUser(userId: string): Promise<Todo[]>;
export declare function findByGoalId(goalId: string): Promise<Todo[]>;
export declare function findByRecordId(recordId: string): Promise<Todo[]>;
export declare function create(fields: {
    record_id?: string | null;
    text: string;
    done?: boolean;
    strike_id?: string;
    domain?: string;
    impact?: number;
    goal_id?: string;
    scheduled_start?: string;
    estimated_minutes?: number;
    user_id?: string;
    device_id?: string;
    parent_id?: string;
    level?: number;
    status?: string;
}): Promise<Todo>;
export declare function createMany(items: Array<{
    record_id: string;
    text: string;
    done?: boolean;
}>): Promise<void>;
export declare function update(id: string, fields: {
    text?: string;
    done?: boolean;
    estimated_minutes?: number | null;
    scheduled_start?: string | null;
    scheduled_end?: string | null;
    priority?: number;
    domain?: string;
    impact?: number;
    ai_actionable?: boolean;
    ai_action_plan?: string[] | null;
    goal_id?: string | null;
    strike_id?: string | null;
    level?: number;
    status?: string;
}): Promise<void>;
export declare function del(id: string): Promise<void>;
export declare function toggle(id: string): Promise<Todo | null>;
export declare function countByDateRange(deviceId: string, start: string, end: string): Promise<{
    total: number;
    done: number;
}>;
export declare function countByUserDateRange(userId: string, start: string, end: string): Promise<{
    total: number;
    done: number;
}>;
/**
 * 计算连续记录天数（从昨天往前数，一次 SQL 查出近 30 天有 todo 的日期）
 */
export declare function getStreak(opts: {
    userId?: string;
    deviceId?: string;
}): Promise<number>;
export declare function findPendingByDevice(deviceId: string): Promise<Todo[]>;
export declare function findRelayByDevice(deviceId: string): Promise<Todo[]>;
export declare function findRelayByUser(userId: string): Promise<Todo[]>;
export declare function findById(id: string): Promise<Todo | null>;
export declare function findSubtasks(parentId: string): Promise<Todo[]>;
export declare function createWithCategory(fields: {
    record_id: string;
    text: string;
    done?: boolean;
    category?: string;
    relay_meta?: Record<string, unknown>;
}): Promise<Todo>;
/**
 * 创建目标/项目前查重（永久防护 Step 1c）
 *
 * 相似度 ≥ 0.75 → 返回已有记录（不创建）
 * 相似度 0.5-0.75 → 创建 suggested 状态
 * 相似度 < 0.5 → 正常创建
 */
export declare function createWithDedup(params: {
    user_id: string;
    device_id: string;
    text: string;
    level: 1 | 2;
    source?: string;
    status?: string;
    cluster_id?: string;
    domain?: string;
}): Promise<{
    todo: Todo;
    action: "created" | "matched" | "suggested";
}>;
/** 创建 todo（level 0=行动, 1=目标, 2=项目） */
export declare function createGoalAsTodo(fields: {
    user_id: string;
    device_id: string;
    text: string;
    level: 0 | 1 | 2;
    source?: string;
    status?: string;
    cluster_id?: string;
    parent_id?: string;
    domain?: string;
}): Promise<Todo>;
/** 更新 status，同步 done 字段保持一致 */
export declare function updateStatus(id: string, status: string): Promise<void>;
/** 批量更新 cluster_id 引用（聚类合并时用，替代 goalRepo.updateClusterRef） */
export declare function updateClusterRef(oldClusterId: string, newClusterId: string): Promise<void>;
/** 按 domain(L3) 查询 level>=1 的目标/项目树 */
export declare function findGoalsByDomain(userId: string, domain?: string): Promise<Todo[]>;
/** 查询用户所有活跃目标（替代 goalRepo.findActiveByUser） */
export declare function findActiveGoalsByUser(userId: string): Promise<Todo[]>;
/** 查询用户所有活跃目标（替代 goalRepo.findActiveByDevice） */
export declare function findActiveGoalsByDevice(deviceId: string): Promise<Todo[]>;
/** 按 parent_id 查找子 todo（替代 goalRepo.findWithTodos） */
export declare function findChildTodos(parentId: string): Promise<Todo[]>;
/** 侧边栏：按 domain 分组统计（支持 user_id 或 device_id）
 * @deprecated 使用 getMyWorldData 替代
 */
export declare function getDimensionSummary(userId: string | null, deviceId?: string): Promise<Array<{
    domain: string;
    pending_count: number;
    goal_count: number;
}>>;
export interface MyWorldNode {
    id: string;
    type: "l2_cluster" | "l1_cluster" | "goal" | "action";
    title: string;
    memberCount?: number;
    subtaskTotal?: number;
    subtaskDone?: number;
    status?: string;
    done?: boolean;
    children: MyWorldNode[];
}
/** 侧边栏"我的世界"：组装三级树结构 */
export declare function getMyWorldData(userId: string): Promise<MyWorldNode[]>;
