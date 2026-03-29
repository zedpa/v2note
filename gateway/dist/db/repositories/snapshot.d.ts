/**
 * cognitive_snapshot CRUD — Tier2 批量分析的增量基础设施
 */
export interface SnapshotCluster {
    id: string;
    name: string;
    description: string;
    size: number;
    polarity: string;
    level: number;
}
export interface SnapshotGoal {
    id: string;
    title: string;
    status: string;
    cluster_id?: string;
}
export interface SnapshotContradiction {
    strike_a_nucleus: string;
    strike_b_nucleus: string;
    description: string;
}
export interface SnapshotPattern {
    pattern: string;
    confidence: number;
}
export interface CognitiveSnapshot {
    user_id: string;
    clusters: SnapshotCluster[];
    goals: SnapshotGoal[];
    contradictions: SnapshotContradiction[];
    patterns: SnapshotPattern[];
    last_analyzed_strike_id: string | null;
    strike_count: number;
    version: number;
    updated_at: string;
}
export declare function findByUser(userId: string): Promise<CognitiveSnapshot | null>;
export declare function upsert(userId: string, data: {
    clusters: SnapshotCluster[];
    goals: SnapshotGoal[];
    contradictions: SnapshotContradiction[];
    patterns: SnapshotPattern[];
    last_analyzed_strike_id: string;
    strike_count: number;
}): Promise<void>;
export declare function countNewStrikes(userId: string): Promise<number>;
export interface NewStrikeRow {
    id: string;
    nucleus: string;
    polarity: string;
    source_type: string | null;
    created_at: string;
    tags: string | null;
}
export declare function getNewStrikes(userId: string, lastStrikeId: string | null, limit?: number): Promise<NewStrikeRow[]>;
