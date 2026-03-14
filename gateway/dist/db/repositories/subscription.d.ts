export declare function getUsageStats(deviceId: string): Promise<{
    monthly_count: number;
    limit: number;
}>;
export declare function getUsageStatsByUser(userId: string): Promise<{
    monthly_count: number;
    limit: number;
}>;
