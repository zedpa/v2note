export interface WikiPage {
    id: string;
    user_id: string;
    title: string;
    content: string;
    summary: string | null;
    parent_id: string | null;
    level: number;
    status: "active" | "archived" | "merged";
    merged_into: string | null;
    domain: string | null;
    created_by: "ai" | "user";
    embedding: any | null;
    metadata: Record<string, any>;
    compiled_at: string | null;
    created_at: string;
    updated_at: string;
}
/** 创建 wiki page */
export declare function create(fields: {
    user_id: string;
    title: string;
    content?: string;
    summary?: string;
    parent_id?: string;
    level?: number;
    domain?: string;
    created_by?: "ai" | "user";
    embedding?: number[];
    metadata?: Record<string, any>;
}): Promise<WikiPage>;
/** 按 ID 查找 */
export declare function findById(id: string): Promise<WikiPage | null>;
/** 按用户查找，可过滤 status */
export declare function findByUser(userId: string, opts?: {
    status?: string;
    limit?: number;
}): Promise<WikiPage[]>;
/** 更新 wiki page 可变字段 */
export declare function update(id: string, fields: {
    title?: string;
    content?: string;
    summary?: string;
    level?: number;
    domain?: string;
    embedding?: number[];
    metadata?: Record<string, any>;
    compiled_at?: string;
}): Promise<void>;
/** 更新 status（archived/merged） */
export declare function updateStatus(id: string, status: WikiPage["status"], mergedInto?: string): Promise<void>;
/** 按 parent_id 查找子页面 */
export declare function findByParent(parentId: string): Promise<WikiPage[]>;
/** 查找用户的顶层页面（level=3） */
export declare function findRoots(userId: string): Promise<WikiPage[]>;
