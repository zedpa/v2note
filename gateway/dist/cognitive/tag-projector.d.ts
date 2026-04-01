/**
 * Tag Projector — 从涌现结构（L1/L2/L3）反向标注 record 的层级标签
 *
 * 链路：record → strike(source_id) → L1(cluster_member) → L2(cluster_member) → domain(L3)
 * 每条 record 最多 5 个标签，按 L2 > L1 > L3 排序。
 */
/**
 * 刷新单条 record 的层级标签
 */
export declare function refreshHierarchyTags(recordId: string): Promise<void>;
/**
 * 批量刷新：给定一组 strike id，反查其 source record 并刷新标签。
 * 用于 batch-analyze / emergence 完成后的回刷。
 */
export declare function batchRefreshByStrikeIds(strikeIds: string[]): Promise<number>;
/**
 * 批量刷新：给定一组 L1 cluster id，反查其成员 strike 的 source record 并刷新。
 * 用于 emergence 阶段（吸纳/释放/合并）后的回刷。
 */
export declare function batchRefreshByClusterIds(clusterIds: string[]): Promise<number>;
