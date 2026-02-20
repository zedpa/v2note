export interface Todo {
    id: string;
    record_id: string;
    text: string;
    done: boolean;
    created_at: string;
}
export declare function findByDevice(deviceId: string): Promise<Todo[]>;
export declare function findByRecordId(recordId: string): Promise<Todo[]>;
export declare function create(fields: {
    record_id: string;
    text: string;
    done?: boolean;
}): Promise<Todo>;
export declare function createMany(items: Array<{
    record_id: string;
    text: string;
    done?: boolean;
}>): Promise<void>;
export declare function update(id: string, fields: {
    text?: string;
    done?: boolean;
}): Promise<void>;
export declare function del(id: string): Promise<void>;
export declare function toggle(id: string): Promise<Todo | null>;
export declare function countByDateRange(deviceId: string, start: string, end: string): Promise<{
    total: number;
    done: number;
}>;
export declare function findPendingByDevice(deviceId: string): Promise<Todo[]>;
