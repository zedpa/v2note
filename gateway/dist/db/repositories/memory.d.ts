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
    content: string;
    source_date?: string;
    importance?: number;
}): Promise<void>;
export declare function deleteById(id: string, deviceId: string): Promise<void>;
export declare function update(id: string, deviceId: string, fields: {
    content?: string;
    importance?: number;
}): Promise<void>;
