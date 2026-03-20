/**
 * Cognitive maintenance: bond normalization, strength decay, salience decay/boost.
 */
export declare function normalizeBondTypes(userId: string): Promise<number>;
export declare function decayBondStrength(userId: string): Promise<number>;
export declare function decaySalience(userId: string): Promise<number>;
export declare function boostSalience(strikeId: string): Promise<void>;
