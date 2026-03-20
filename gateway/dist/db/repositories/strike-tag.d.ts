export interface StrikeTagEntry {
    id: string;
    strike_id: string;
    label: string;
    confidence: number;
    created_by: string;
    created_at: string;
}
export declare function create(fields: {
    strike_id: string;
    label: string;
    confidence?: number;
    created_by?: string;
}): Promise<StrikeTagEntry>;
export declare function createMany(tags: {
    strike_id: string;
    label: string;
    confidence?: number;
    created_by?: string;
}[]): Promise<StrikeTagEntry[]>;
export declare function findByStrike(strikeId: string): Promise<StrikeTagEntry[]>;
export declare function updateCreatedBy(id: string, createdBy: string): Promise<void>;
export declare function findByLabel(userId: string, label: string): Promise<StrikeTagEntry[]>;
