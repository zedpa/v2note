export interface Soul {
    id: string;
    device_id: string;
    content: string;
    updated_at: string;
}
export declare function findByDevice(deviceId: string): Promise<Soul | null>;
export declare function findByUser(userId: string): Promise<Soul | null>;
export declare function upsertByUser(userId: string, content: string, deviceId?: string): Promise<void>;
/** @deprecated 使用 upsertByUser 替代 */
export declare function upsert(deviceId: string, content: string): Promise<void>;
