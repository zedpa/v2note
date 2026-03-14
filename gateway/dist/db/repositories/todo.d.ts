export interface Todo {
    id: string;
    record_id: string;
    text: string;
    done: boolean;
    estimated_minutes: number | null;
    scheduled_start: string | null;
    scheduled_end: string | null;
    priority: number;
    completed_at: string | null;
    created_at: string;
    category?: string;
    relay_meta?: {
        source_person?: string;
        target_person?: string;
        context?: string;
        direction?: "outgoing" | "incoming";
    };
    domain?: string;
    impact?: number;
    ai_actionable?: boolean;
    ai_action_plan?: string[];
}
export declare function findByDevice(deviceId: string): Promise<Todo[]>;
export declare function findByUser(userId: string): Promise<Todo[]>;
export declare function findPendingByUser(userId: string): Promise<Todo[]>;
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
    estimated_minutes?: number | null;
    scheduled_start?: string | null;
    scheduled_end?: string | null;
    priority?: number;
    domain?: string;
    impact?: number;
    ai_actionable?: boolean;
    ai_action_plan?: string[] | null;
    goal_id?: string | null;
}): Promise<void>;
export declare function del(id: string): Promise<void>;
export declare function toggle(id: string): Promise<Todo | null>;
export declare function countByDateRange(deviceId: string, start: string, end: string): Promise<{
    total: number;
    done: number;
}>;
export declare function countByUserDateRange(userId: string, start: string, end: string): Promise<{
    total: number;
    done: number;
}>;
export declare function findPendingByDevice(deviceId: string): Promise<Todo[]>;
export declare function findRelayByDevice(deviceId: string): Promise<Todo[]>;
export declare function findRelayByUser(userId: string): Promise<Todo[]>;
export declare function createWithCategory(fields: {
    record_id: string;
    text: string;
    done?: boolean;
    category?: string;
    relay_meta?: Record<string, unknown>;
}): Promise<Todo>;
