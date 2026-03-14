export interface Goal {
    id: string;
    device_id: string;
    title: string;
    parent_id: string | null;
    status: "active" | "paused" | "completed" | "abandoned";
    source: "speech" | "chat" | "manual";
    created_at: string;
    updated_at: string;
}
export declare function findActiveByDevice(deviceId: string): Promise<Goal[]>;
export declare function findActiveByUser(userId: string): Promise<Goal[]>;
export declare function findByUser(userId: string): Promise<Goal[]>;
export declare function findByDevice(deviceId: string): Promise<Goal[]>;
export declare function findById(id: string): Promise<Goal | null>;
export declare function create(fields: {
    device_id: string;
    title: string;
    parent_id?: string;
    source?: string;
}): Promise<Goal>;
export declare function update(id: string, fields: {
    title?: string;
    status?: string;
    parent_id?: string | null;
}): Promise<void>;
export declare function findWithTodos(goalId: string): Promise<{
    id: string;
    text: string;
    done: boolean;
}[]>;
