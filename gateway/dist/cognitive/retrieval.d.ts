/**
 * Hybrid retrieval module for cognitive engine.
 *
 * Combines semantic (pgvector) and structured (tag/person/temporal/polarity)
 * channels to find relevant historical Strikes for a given new Strike.
 */
import type { StrikeEntry } from "../db/repositories/strike.js";
export interface RetrievalResult {
    strike: StrikeEntry;
    score: number;
    channels: string[];
}
export declare function hybridRetrieve(nucleus: string, tags: string[], userId: string, opts?: {
    limit?: number;
    polarity?: string;
}): Promise<RetrievalResult[]>;
