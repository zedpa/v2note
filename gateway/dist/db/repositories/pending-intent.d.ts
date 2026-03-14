export interface PendingIntent {
    id: string;
    device_id: string;
    record_id: string | null;
    intent_type: "wish" | "goal" | "complaint" | "reflection";
    text: string;
    context: string | null;
    status: "pending" | "confirmed" | "dismissed" | "promoted";
    promoted_to: string | null;
    created_at: string;
}
export declare function findPendingByDevice(deviceId: string): Promise<PendingIntent[]>;
export declare function findPendingByUser(userId: string): Promise<PendingIntent[]>;
export declare function findById(id: string): Promise<PendingIntent | null>;
export declare function create(fields: {
    device_id: string;
    record_id?: string;
    intent_type: string;
    text: string;
    context?: string;
}): Promise<PendingIntent>;
export declare function updateStatus(id: string, status: string, promotedTo?: string): Promise<void>;
