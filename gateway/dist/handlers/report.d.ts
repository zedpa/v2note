/**
 * Unified Report Handler — 统一日报系统
 * 合并晨间简报和晚间回顾，支持 auto 时段路由。
 */
export type ReportMode = "morning" | "evening" | "weekly" | "monthly";
export declare function resolveMode(hour: number): "morning" | "evening";
export interface Perspective {
    name: string;
    instruction: string;
}
export declare function getPerspective(dayOfWeek: number): Perspective;
export declare function generateMorningReport(deviceId: string, userId?: string): Promise<any>;
export declare function generateEveningReport(deviceId: string, userId?: string): Promise<any>;
export declare function generateReport(mode: string, deviceId: string, userId?: string): Promise<any>;
