export interface Review {
    id: string;
    device_id: string;
    period: string;
    period_start: string;
    period_end: string;
    summary: string | null;
    stats: any;
    structured_data: any;
    created_at: string;
}
export declare function findByDevice(deviceId: string, period?: string): Promise<Review[]>;
export declare function create(fields: {
    device_id: string;
    period: string;
    period_start: string;
    period_end: string;
    summary?: string;
    stats?: any;
    structured_data?: any;
}): Promise<Review>;
