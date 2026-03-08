/**
 * Daily Loop Handler — generates morning briefings and evening summaries.
 */
export interface BriefingResult {
    greeting: string;
    priority_items: string[];
    unfinished: string[];
    relay_pending: Array<{
        person: string;
        context: string;
        todoId: string;
    }>;
    followups: string[];
    stats: {
        yesterday_done: number;
        yesterday_total: number;
        streak: number;
    };
}
export interface SummaryResult {
    accomplishments: string[];
    pending_items: string[];
    relay_summary: string[];
    stats: {
        done: number;
        new_records: number;
        relays_completed: number;
    };
    tomorrow_seeds: string[];
}
export declare function generateMorningBriefing(deviceId: string): Promise<BriefingResult>;
export declare function generateEveningSummary(deviceId: string): Promise<SummaryResult>;
