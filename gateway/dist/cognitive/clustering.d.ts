/**
 * Level 2 clustering engine.
 *
 * Uses triangle-closure density to discover cluster candidates among active
 * Strikes, validates them with AI, and persists results.
 */
export interface ClusteringResult {
    newClusters: number;
    updatedClusters: number;
    totalStrikes: number;
}
export declare function runClustering(userId: string): Promise<ClusteringResult>;
