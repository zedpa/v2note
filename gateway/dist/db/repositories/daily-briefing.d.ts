export interface DailyBriefing {
    id: string;
    device_id: string;
    briefing_date: string;
    briefing_type: string;
    content: any;
    generated_at: string;
}
export declare function findByDeviceAndDate(deviceId: string, date: string, type?: "morning" | "evening"): Promise<DailyBriefing | null>;
/**
 * Upsert a briefing. If a cached one exists within TTL, skip.
 * Returns the cached or newly created briefing.
 */
export declare function upsert(deviceId: string, date: string, type: "morning" | "evening", content: any): Promise<DailyBriefing>;
/**
 * Check if a cached briefing exists and is fresh (within TTL hours).
 */
export declare function findFresh(deviceId: string, date: string, type: "morning" | "evening", ttlHours?: number): Promise<DailyBriefing | null>;
