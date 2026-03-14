export interface AiDiary {
    id: string;
    device_id: string;
    notebook: string;
    entry_date: string;
    summary: string;
    full_content: string;
    created_at: string;
    updated_at: string;
}
/**
 * Upsert a diary entry — append content to today's entry.
 */
export declare function upsertEntry(deviceId: string, notebook: string, date: string, content: string, userId?: string): Promise<AiDiary>;
export declare function findByUser(userId: string, notebook: string, date: string): Promise<AiDiary | null>;
/**
 * Get all diary entries for a specific date across all notebooks.
 */
export declare function findByDate(deviceId: string, date: string): Promise<AiDiary[]>;
/**
 * Get diary summaries for a notebook within a date range (lazy loading).
 */
export declare function findSummaries(deviceId: string, notebook: string, startDate: string, endDate: string): Promise<Pick<AiDiary, "id" | "entry_date" | "summary" | "notebook">[]>;
export declare function findSummariesByUser(userId: string, notebook: string, startDate: string, endDate: string): Promise<Pick<AiDiary, "id" | "entry_date" | "summary" | "notebook">[]>;
/**
 * Get full content of a specific diary entry.
 */
export declare function findFull(deviceId: string, notebook: string, date: string): Promise<AiDiary | null>;
export declare function findFullByUser(userId: string, notebook: string, date: string): Promise<AiDiary | null>;
/**
 * Update the summary field of a diary entry.
 */
export declare function updateSummary(id: string, summary: string): Promise<void>;
