/**
 * Tag Projector — 从 Wiki Page 关联反向标注 record 的层级标签
 *
 * Phase 11 改造：数据源从 strike/cluster 切换到 wiki_page。
 * 链路：record → wiki_page_record → wiki_page.title
 * 每条 record 最多 5 个标签，按 level ASC 排序（L1 最具体 → L3 最宽泛）。
 */
/**
 * 刷新单条 record 的层级标签（从 wiki page 关联获取）
 */
export declare function refreshHierarchyTags(recordId: string): Promise<void>;
/**
 * 批量刷新：给定一组 record id，刷新其 wiki page 标签。
 * 用于 wiki compile 完成后的回刷。
 */
export declare function batchRefreshByRecordIds(recordIds: string[]): Promise<number>;
/**
 * 批量刷新：给定一组 wiki page id，反查关联 record 并刷新标签。
 * 用于 wiki page 创建/更新/合并/拆分后的回刷。
 */
export declare function batchRefreshByPageIds(pageIds: string[]): Promise<number>;
/** @deprecated 使用 batchRefreshByRecordIds 替代 */
export declare function batchRefreshByStrikeIds(strikeIds: string[]): Promise<number>;
/** @deprecated 使用 batchRefreshByPageIds 替代 */
export declare function batchRefreshByClusterIds(clusterIds: string[]): Promise<number>;
