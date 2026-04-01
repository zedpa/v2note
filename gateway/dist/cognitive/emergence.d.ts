/**
 * L2 涌现引擎 — L1 Cluster 的全生命周期管理
 *
 * 6 阶段流程：
 *  1. 吸纳：自由 L1 → 现有 L2
 *  2. 释放：语义漂移的 L1 ← L2
 *  3. 清理：空 L2 自动 dissolved
 *  4. 创建：自由 L1 → 新 L2（pgvector 相似度 + AI 判断）
 *  5. 合并：语义重叠的 L2 → 合并
 *  6. Bond 继承：L2 间继承子级 bond
 */
export interface EmergenceResult {
    higherOrderClusters: number;
    bondInheritance: number;
    absorbed: number;
    released: number;
    dissolved: number;
    merged: number;
}
/**
 * 运行 L2 涌现全生命周期
 */
export declare function runEmergence(userId: string): Promise<EmergenceResult>;
