/**
 * Unified Report Handler — 统一日报系统
 * v2 简化版：精简 prompt，移除视角轮换/认知报告等复杂逻辑
 */
export type ReportMode = "morning" | "evening";
export declare function resolveMode(hour: number): "morning" | "evening";
export declare function generateMorningReport(deviceId: string, userId?: string): Promise<any>;
export declare function generateEveningReport(deviceId: string, userId?: string): Promise<any>;
export declare function generateReport(mode: string, deviceId: string, userId?: string): Promise<any>;
