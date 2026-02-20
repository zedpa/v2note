export interface Record {
    id: string;
    device_id: string;
    status: string;
    source: string;
    audio_path: string | null;
    duration_seconds: number | null;
    location_text: string | null;
    archived: boolean;
    created_at: string;
    updated_at: string;
}
export declare function findByDevice(deviceId: string, opts?: {
    archived?: boolean;
    limit?: number;
    offset?: number;
}): Promise<Record[]>;
export declare function findById(id: string): Promise<Record | null>;
export declare function create(fields: {
    device_id: string;
    status?: string;
    source?: string;
    audio_path?: string;
    duration_seconds?: number;
    location_text?: string;
}): Promise<Record>;
export declare function updateStatus(id: string, status: string): Promise<void>;
export declare function updateFields(id: string, fields: {
    status?: string;
    archived?: boolean;
    duration_seconds?: number;
}): Promise<void>;
export declare function deleteByIds(ids: string[]): Promise<number>;
export declare function archive(id: string): Promise<void>;
export declare function search(deviceId: string, q: string): Promise<Record[]>;
export declare function countByDateRange(deviceId: string, start: string, end: string): Promise<number>;
export declare function findByDeviceAndDateRange(deviceId: string, start: string, end: string): Promise<Record[]>;
