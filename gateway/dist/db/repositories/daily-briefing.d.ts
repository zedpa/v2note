export interface DailyBriefing {
    id: string;
    device_id: string;
    user_id: string | null;
    briefing_date: string;
    briefing_type: string;
    content: any;
    generated_at: string;
}
/** 按设备查询（游客 fallback） */
export declare function findByDeviceAndDate(deviceId: string, date: string, type?: "morning" | "evening"): Promise<DailyBriefing | null>;
/** 按用户查询（跨设备共享） */
export declare function findByUserAndDate(userId: string, date: string, type?: "morning" | "evening"): Promise<DailyBriefing | null>;
/**
 * Upsert a briefing.
 * - 已登录用户：按 (user_id, date, type) 唯一，跨设备共享
 * - 游客：按 (device_id, date, type) 唯一
 */
export declare function upsert(deviceId: string, date: string, type: "morning" | "evening", content: any, userId?: string | null): Promise<DailyBriefing>;
/**
 * Check if a fresh cached briefing exists (within TTL hours).
 * 已登录用户按 user_id 查，游客按 device_id 查。
 */
export declare function findFresh(deviceId: string, date: string, type: "morning" | "evening", ttlHours?: number, userId?: string | null): Promise<DailyBriefing | null>;
