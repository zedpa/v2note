/**
 * Append content to today's diary for a specific notebook.
 * Fast operation — no AI call, just DB append.
 */
export declare function appendToDiary(deviceId: string, notebook: string, content: string): Promise<void>;
/**
 * Regenerate the summary (first ~20 lines) for a diary entry.
 * Uses AI to create a concise summary.
 */
export declare function regenerateSummary(deviceId: string, notebook: string, date: string): Promise<void>;
/**
 * Extract long-term memories from diary entries within a date range.
 * Identifies recurring patterns, important changes, and key insights.
 */
export declare function extractToMemory(deviceId: string, dateRange: {
    start: string;
    end: string;
}): Promise<void>;
