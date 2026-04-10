export interface Transcript {
    id: string;
    record_id: string;
    text: string;
    language: string | null;
    created_at: string;
}
export declare function findByRecordId(recordId: string): Promise<Transcript | null>;
export declare function findByRecordIds(recordIds: string[]): Promise<Transcript[]>;
export declare function update(recordId: string, fields: {
    text?: string;
    language?: string;
}): Promise<void>;
/**
 * 查找近 N 秒内同用户/设备是否已有相同内容的记录（幂等性去重）。
 */
export declare function findRecentByContent(ownerIdOrDevice: string, content: string, withinSeconds: number): Promise<{
    record_id: string;
} | null>;
export declare function create(fields: {
    record_id: string;
    text: string;
    language?: string;
}): Promise<Transcript>;
