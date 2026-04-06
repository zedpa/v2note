export interface Record {
    id: string;
    device_id: string;
    user_id: string | null;
    status: string;
    source: string;
    audio_path: string | null;
    duration_seconds: number | null;
    location_text: string | null;
    notebook: string | null;
    source_type: string;
    archived: boolean;
    digested: boolean;
    digested_at: string | null;
    file_url: string | null;
    file_name: string | null;
    domain?: string | null;
    hierarchy_tags?: Array<{
        label: string;
        level: number;
    }>;
    created_at: string;
    updated_at: string;
}
export declare function findByDevice(deviceId: string, opts?: {
    archived?: boolean;
    limit?: number;
    offset?: number;
    notebook?: string | null;
}): Promise<Record[]>;
export declare function findByUser(userId: string, opts?: {
    archived?: boolean;
    limit?: number;
    offset?: number;
    notebook?: string | null;
}): Promise<Record[]>;
export declare function findByUserAndDateRange(userId: string, start: string, end: string): Promise<Record[]>;
export declare function findById(id: string): Promise<Record | null>;
export declare function create(fields: {
    device_id: string;
    user_id?: string;
    status?: string;
    source?: string;
    source_type?: string;
    audio_path?: string;
    duration_seconds?: number;
    location_text?: string;
    notebook?: string;
    file_url?: string;
    file_name?: string;
}): Promise<Record>;
export declare function updateStatus(id: string, status: string): Promise<void>;
export declare function updateFields(id: string, fields: {
    status?: string;
    archived?: boolean;
    duration_seconds?: number;
    source_type?: string;
    audio_path?: string;
    file_url?: string;
    file_name?: string;
}): Promise<void>;
export declare function deleteByIds(ids: string[]): Promise<number>;
export declare function archive(id: string): Promise<void>;
export declare function search(deviceId: string, q: string): Promise<Record[]>;
export declare function searchByUser(userId: string, q: string): Promise<Record[]>;
export declare function countByUser(userId: string): Promise<number>;
export declare function countByDateRange(deviceId: string, start: string, end: string): Promise<number>;
export declare function countByUserDateRange(userId: string, start: string, end: string): Promise<number>;
export declare function findUndigested(userId: string): Promise<Record[]>;
export declare function incrementDigestAttempts(id: string): Promise<void>;
export declare function markDigested(id: string): Promise<void>;
/**
 * 原子抢占：将 digested 从 false 改为 true，仅当当前为 false 时成功。
 * 返回成功抢占的 record ID 列表（已被其他进程抢占的会被过滤掉）。
 */
export declare function claimForDigest(ids: string[]): Promise<string[]>;
/** 回滚：digest 失败时恢复 digested=false，允许下次重试 */
export declare function unclaimDigest(id: string): Promise<void>;
/** 按 user_id + source 查询（用于幂等检查，如欢迎日记判重） */
export declare function findByUserAndSource(userId: string, source: string): Promise<Record[]>;
/** 更新 created_at（用于控制欢迎日记排序） */
export declare function updateCreatedAt(id: string, createdAt: string): Promise<void>;
/** 更新层级标签（L1/L2/L3 涌现结构反向标注） */
/** 更新 record 的自动归类 domain */
export declare function updateDomain(id: string, domain: string | null): Promise<void>;
/** 查询用户已有的 domain 列表（去重，按使用频次降序） */
export declare function listUserDomains(userId: string): Promise<string[]>;
/** 查询用户 domain 列表 + 计数（供侧边栏文件夹展示） */
export declare function listUserDomainsWithCount(userId: string): Promise<Array<{
    domain: string;
    count: number;
}>>;
/** 批量替换 domain 前缀（rename/merge 用） */
export declare function batchUpdateDomain(userId: string, oldPrefix: string, newPrefix: string): Promise<number>;
/** 清空指定前缀的 domain（delete folder 用） */
export declare function clearDomainByPrefix(userId: string, prefix: string): Promise<number>;
/** 统计未分类记录数 */
export declare function countUncategorized(userId: string): Promise<number>;
export declare function updateHierarchyTags(id: string, tags: Array<{
    label: string;
    level: number;
}>): Promise<void>;
export declare function findByDeviceAndDateRange(deviceId: string, start: string, end: string): Promise<Record[]>;
