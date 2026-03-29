export interface MemoryEntry {
    id: string;
    device_id: string;
    content: string;
    source_date: string | null;
    importance: number;
    created_at: string;
}
export declare function findByDevice(deviceId: string, dateRange?: {
    start: string;
    end: string;
}, limit?: number): Promise<MemoryEntry[]>;
export declare function create(fields: {
    device_id: string;
    user_id?: string;
    content: string;
    source_date?: string;
    importance?: number;
}): Promise<void>;
export declare function findByUser(userId: string, dateRange?: {
    start: string;
    end: string;
}, limit?: number): Promise<MemoryEntry[]>;
export declare function deleteById(id: string, deviceId: string): Promise<void>;
export declare function deleteByIdAndUser(id: string, userId: string): Promise<void>;
export declare function update(id: string, deviceId: string, fields: {
    content?: string;
    importance?: number;
}): Promise<void>;
/** 统计用户记忆总条数 */
export declare function countByUser(userId: string): Promise<number>;
/** 删除用户最低重要性的 N 条记忆（为新记忆腾位置） */
export declare function evictLeastImportant(userId: string, count: number): Promise<number>;
export declare function updateByUser(id: string, userId: string, fields: {
    content?: string;
    importance?: number;
}): Promise<void>;
