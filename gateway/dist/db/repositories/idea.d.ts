export interface Idea {
    id: string;
    record_id: string;
    text: string;
    created_at: string;
}
export declare function findByDevice(deviceId: string): Promise<Idea[]>;
export declare function findByRecordId(recordId: string): Promise<Idea[]>;
export declare function create(fields: {
    record_id: string;
    text: string;
}): Promise<Idea>;
export declare function del(id: string): Promise<void>;
