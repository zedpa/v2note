/**
 * Tier2 批量分析 prompt 构建
 *
 * v2: 拆分为 Step A（结构分析）专注聚类
 *     Step B（行动映射）合并到 Digest L1，零额外成本
 *
 * 本文件只负责 Step A 的 prompt。
 */
import type { SnapshotCluster, SnapshotGoal, SnapshotContradiction, SnapshotPattern, NewStrikeRow } from "../db/repositories/snapshot.js";
export interface BatchAnalyzeInput {
    existing_structure: {
        clusters: SnapshotCluster[];
        goals: SnapshotGoal[];
        contradictions: SnapshotContradiction[];
        patterns: SnapshotPattern[];
    } | null;
    new_strikes: Array<{
        id: string;
        nucleus: string;
        polarity: string;
        tags: string[];
        source_type: string;
        created_at: string;
    }>;
    /** 用户的 L3 维度列表（如 ["工作", "生活", "学习"]），供 AI 为 Cluster 分配 domain */
    dimensions?: string[];
}
export interface BatchAnalyzeOutput {
    assign: Array<{
        strike_id: string;
        cluster_id: string;
    }>;
    new_clusters: Array<{
        name: string;
        description: string;
        polarity: string;
        member_strike_ids: string[];
        domain?: string;
        level: 1;
    }>;
    merge_clusters: Array<{
        cluster_a_id: string;
        cluster_b_id: string;
        new_name: string;
        reason: string;
    }>;
    cluster_tags: Array<{
        cluster_id: string;
        tags: string[];
    }>;
    bonds: Array<{
        source_strike_id: string;
        target_strike_id: string;
        type: string;
        strength: number;
    }>;
    contradictions: Array<{
        strike_a_id: string;
        strike_b_id: string;
        description: string;
        severity: "low" | "medium" | "high";
    }>;
    patterns: Array<{
        pattern: string;
        evidence_strike_ids: string[];
        confidence: number;
    }>;
    goal_suggestions: Array<{
        title: string;
        reason: string;
        cluster_name?: string;
        source_strike_ids: string[];
    }>;
    supersedes: Array<{
        new_strike_id: string;
        old_strike_id: string;
        reason: string;
    }>;
}
export declare function buildBatchAnalyzeMessages(input: BatchAnalyzeInput): Array<{
    role: "system" | "user";
    content: string;
}>;
/**
 * 从 NewStrikeRow 转换为 prompt 输入格式
 */
export declare function toPromptStrikes(rows: NewStrikeRow[]): BatchAnalyzeInput["new_strikes"];
