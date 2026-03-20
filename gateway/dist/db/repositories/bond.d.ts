export interface BondEntry {
    id: string;
    source_strike_id: string;
    target_strike_id: string;
    type: string;
    strength: number;
    created_by: string;
    created_at: string;
    updated_at: string;
}
export declare function create(fields: {
    source_strike_id: string;
    target_strike_id: string;
    type: string;
    strength?: number;
    created_by?: string;
}): Promise<BondEntry>;
export declare function createMany(bonds: {
    source_strike_id: string;
    target_strike_id: string;
    type: string;
    strength?: number;
    created_by?: string;
}[]): Promise<BondEntry[]>;
export declare function findByStrike(strikeId: string): Promise<BondEntry[]>;
export declare function findByType(userId: string, type: string, limit?: number): Promise<BondEntry[]>;
export declare function updateStrength(id: string, strength: number): Promise<void>;
