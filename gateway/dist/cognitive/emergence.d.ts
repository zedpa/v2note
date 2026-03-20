/**
 * Level 3 weekly emergence engine.
 *
 * Discovers higher-order structures from cluster relationships,
 * detects cluster evolution, finds resonance, and extracts cognitive patterns.
 */
export interface EmergenceResult {
    higherOrderClusters: number;
    evolutionDetected: number;
    resonanceDiscovered: number;
    patternsExtracted: number;
}
export declare function runEmergence(userId: string): Promise<EmergenceResult>;
