/**
 * Tag Projector — 从 Wiki Page 关联反向标注 record 的层级标签
 *
 * Phase 11 改造：数据源从 strike/cluster 切换到 wiki_page。
 * 链路：record → wiki_page_record → wiki_page.title
 * 每条 record 最多 5 个标签，按 level ASC 排序（L1 最具体 → L3 最宽泛）。
 */
import { query, execute } from "../db/pool.js";
/**
 * 刷新单条 record 的层级标签（从 wiki page 关联获取）
 */
export async function refreshHierarchyTags(recordId) {
    // 查该 record 关联的所有 active wiki page
    const pages = await query(`SELECT wp.title, wp.level, wp.parent_id
     FROM wiki_page_record wpr
     JOIN wiki_page wp ON wp.id = wpr.wiki_page_id
     WHERE wpr.record_id = $1 AND wp.status = 'active'
     ORDER BY wp.level ASC`, [recordId]);
    if (pages.length === 0) {
        await execute(`UPDATE record SET hierarchy_tags = '[]'::jsonb, updated_at = now() WHERE id = $1`, [recordId]);
        return;
    }
    const tags = [];
    const seen = new Set();
    for (const page of pages) {
        if (!seen.has(page.title)) {
            tags.push({ label: page.title, level: page.level });
            seen.add(page.title);
        }
    }
    // 截取前 5 个，写入
    const finalTags = tags.slice(0, 5);
    await execute(`UPDATE record SET hierarchy_tags = $1::jsonb, updated_at = now() WHERE id = $2`, [JSON.stringify(finalTags), recordId]);
}
/**
 * 批量刷新：给定一组 record id，刷新其 wiki page 标签。
 * 用于 wiki compile 完成后的回刷。
 */
export async function batchRefreshByRecordIds(recordIds) {
    if (recordIds.length === 0)
        return 0;
    let refreshed = 0;
    for (const rid of recordIds) {
        try {
            await refreshHierarchyTags(rid);
            refreshed++;
        }
        catch (e) {
            console.warn(`[tag-projector] Failed to refresh record ${rid}:`, e);
        }
    }
    console.log(`[tag-projector] Refreshed ${refreshed}/${recordIds.length} records from wiki pages`);
    return refreshed;
}
/**
 * 批量刷新：给定一组 wiki page id，反查关联 record 并刷新标签。
 * 用于 wiki page 创建/更新/合并/拆分后的回刷。
 */
export async function batchRefreshByPageIds(pageIds) {
    if (pageIds.length === 0)
        return 0;
    // 反查去重的 record_id
    const rows = await query(`SELECT DISTINCT record_id FROM wiki_page_record
     WHERE wiki_page_id = ANY($1)`, [pageIds]);
    const recordIds = rows.map((r) => r.record_id);
    return batchRefreshByRecordIds(recordIds);
}
// ── 以下函数保留签名以兼容旧调用方，内部转发到新实现 ──
/** @deprecated 使用 batchRefreshByRecordIds 替代 */
export async function batchRefreshByStrikeIds(strikeIds) {
    // strike 系统已废弃，此函数不再有实际作用
    console.warn("[tag-projector] batchRefreshByStrikeIds is deprecated, no-op");
    return 0;
}
/** @deprecated 使用 batchRefreshByPageIds 替代 */
export async function batchRefreshByClusterIds(clusterIds) {
    // cluster 系统已废弃，此函数不再有实际作用
    console.warn("[tag-projector] batchRefreshByClusterIds is deprecated, no-op");
    return 0;
}
//# sourceMappingURL=tag-projector.js.map