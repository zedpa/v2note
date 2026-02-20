export interface Soul {
    id: string;
    device_id: string;
    content: string;
    updated_at: string;
}
export declare function findByDevice(deviceId: string): Promise<Soul | null>;
export declare function upsert(deviceId: string, content: string): Promise<void>;
