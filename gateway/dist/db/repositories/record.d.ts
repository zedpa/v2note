export interface Record {
    id: string;
    device_id: string;
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
}): Promise<Record>;
export declare function updateStatus(id: string, status: string): Promise<void>;
export declare function updateFields(id: string, fields: {
    status?: string;
    archived?: boolean;
    duration_seconds?: number;
    source_type?: string;
    audio_path?: string;
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
export declare function findByDeviceAndDateRange(deviceId: string, start: string, end: string): Promise<Record[]>;
