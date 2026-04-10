export interface Goal {
    id: string;
    device_id: string;
    user_id?: string;
    title: string;
    parent_id: string | null;
    status: "active" | "paused" | "completed" | "abandoned" | "progressing" | "blocked" | "suggested" | "dismissed";
    source: "speech" | "chat" | "manual" | "explicit" | "emerged";
    cluster_id: string | null;
    wiki_page_id: string | null;
    created_at: string;
    updated_at: string;
}
export declare function findActiveByDevice(deviceId: string): Promise<Goal[]>;
export declare function findActiveByUser(userId: string): Promise<Goal[]>;
export declare function findByUser(userId: string): Promise<Goal[]>;
export declare function findByDevice(deviceId: string): Promise<Goal[]>;
export declare function findById(id: string): Promise<Goal | null>;
export declare function create(fields: {
    device_id: string;
    user_id?: string;
    title: string;
    parent_id?: string;
    source?: string;
    status?: string;
}): Promise<Goal>;
export declare function update(id: string, fields: {
    title?: string;
    status?: string;
    parent_id?: string | null;
    cluster_id?: string | null;
    wiki_page_id?: string | null;
}): Promise<void>;
/** 更新 goal 的 wiki_page_id 引用（编译时关联用） */
export declare function updateWikiPageRef(goalId: string, wikiPageId: string | null): Promise<void>;
/** 批量更新 cluster_id 引用（聚类合并时用） */
export declare function updateClusterRef(oldClusterId: string, newClusterId: string): Promise<void>;
export declare function findWithTodos(goalId: string): Promise<{
    id: string;
    text: string;
    done: boolean;
}[]>;
/** 批量查询多个目标的子 todo（一次 SQL 替代 N 次查询） */
export declare function findTodosByGoalIds(goalIds: string[]): Promise<{
    parent_id: string;
    id: string;
    text: string;
    done: boolean;
    completed_at: string | null;
}[]>;
