/**
 * Tag Projector — 从涌现结构（L1/L2/L3）反向标注 record 的层级标签
 *
 * 链路：record → strike(source_id) → L1(cluster_member) → L2(cluster_member) → domain(L3)
 * 每条 record 最多 5 个标签，按 L2 > L1 > L3 排序。
 */
import { query, execute } from "../db/pool.js";
/** 从 "[名称] 描述" 格式提取名称 */
function extractClusterName(nucleus) {
    const match = nucleus.match(/^\[(.+?)\]/);
    return match ? match[1] : nucleus.slice(0, 10);
}
/**
 * 刷新单条 record 的层级标签
 */
export async function refreshHierarchyTags(recordId) {
    // 1. 查该 record 的所有 active strike
    const strikes = await query(`SELECT id, domain FROM strike
     WHERE source_id = $1 AND status = 'active'`, [recordId]);
    if (strikes.length === 0) {
        await execute(`UPDATE record SET hierarchy_tags = '[]'::jsonb, updated_at = now() WHERE id = $1`, [recordId]);
        return;
    }
    const strikeIds = strikes.map((s) => s.id);
    const tags = [];
    const seen = new Set();
    // 2. 查这些 strike 所属的 L1 cluster
    const l1Clusters = await query(`SELECT DISTINCT s.id, s.nucleus, s.domain
     FROM bond b JOIN strike s ON s.id = b.source_strike_id
     WHERE b.target_strike_id = ANY($1)
       AND b.type = 'cluster_member'
       AND s.is_cluster = true AND s.level = 1 AND s.status = 'active'`, [strikeIds]);
    const l1Ids = l1Clusters.map((c) => c.id);
    // 3. 查这些 L1 所属的 L2 cluster
    let l2Clusters = [];
    if (l1Ids.length > 0) {
        l2Clusters = await query(`SELECT DISTINCT s.id, s.nucleus, s.domain
       FROM bond b JOIN strike s ON s.id = b.source_strike_id
       WHERE b.target_strike_id = ANY($1)
         AND b.type = 'cluster_member'
         AND s.is_cluster = true AND s.level = 2 AND s.status = 'active'`, [l1Ids]);
    }
    // 4. 按 L2 > L1 > L3 收集标签
    for (const l2 of l2Clusters) {
        const name = extractClusterName(l2.nucleus);
        if (!seen.has(name)) {
            tags.push({ label: name, level: 2 });
            seen.add(name);
        }
    }
    for (const l1 of l1Clusters) {
        const name = extractClusterName(l1.nucleus);
        if (!seen.has(name)) {
            tags.push({ label: name, level: 1 });
            seen.add(name);
        }
    }
    // 收集 domain（L3）：从 L2、L1、strike 自身
    const domains = new Set();
    for (const c of [...l2Clusters, ...l1Clusters]) {
        if (c.domain && c.domain !== "其他")
            domains.add(c.domain);
    }
    for (const s of strikes) {
        if (s.domain && s.domain !== "其他")
            domains.add(s.domain);
    }
    for (const d of domains) {
        if (!seen.has(d)) {
            tags.push({ label: d, level: 3 });
            seen.add(d);
        }
    }
    // 5. 截取前 5 个，写入
    const finalTags = tags.slice(0, 5);
    await execute(`UPDATE record SET hierarchy_tags = $1::jsonb, updated_at = now() WHERE id = $2`, [JSON.stringify(finalTags), recordId]);
}
/**
 * 批量刷新：给定一组 strike id，反查其 source record 并刷新标签。
 * 用于 batch-analyze / emergence 完成后的回刷。
 */
export async function batchRefreshByStrikeIds(strikeIds) {
    if (strikeIds.length === 0)
        return 0;
    // 反查去重的 record_id
    const rows = await query(`SELECT DISTINCT source_id FROM strike
     WHERE id = ANY($1) AND source_id IS NOT NULL`, [strikeIds]);
    const recordIds = rows.map((r) => r.source_id);
    if (recordIds.length === 0)
        return 0;
    for (const rid of recordIds) {
        try {
            await refreshHierarchyTags(rid);
        }
        catch (e) {
            console.warn(`[tag-projector] Failed to refresh record ${rid}:`, e);
        }
    }
    console.log(`[tag-projector] Refreshed ${recordIds.length} records from ${strikeIds.length} strikes`);
    return recordIds.length;
}
/**
 * 批量刷新：给定一组 L1 cluster id，反查其成员 strike 的 source record 并刷新。
 * 用于 emergence 阶段（吸纳/释放/合并）后的回刷。
 */
export async function batchRefreshByClusterIds(clusterIds) {
    if (clusterIds.length === 0)
        return 0;
    // L1 cluster → 成员 strike → source record
    const rows = await query(`SELECT DISTINCT s.source_id
     FROM bond b JOIN strike s ON s.id = b.target_strike_id
     WHERE b.source_strike_id = ANY($1)
       AND b.type = 'cluster_member'
       AND s.source_id IS NOT NULL`, [clusterIds]);
    const recordIds = rows.map((r) => r.source_id);
    if (recordIds.length === 0)
        return 0;
    for (const rid of recordIds) {
        try {
            await refreshHierarchyTags(rid);
        }
        catch (e) {
            console.warn(`[tag-projector] Failed to refresh record ${rid}:`, e);
        }
    }
    console.log(`[tag-projector] Refreshed ${recordIds.length} records from ${clusterIds.length} clusters`);
    return recordIds.length;
}
//# sourceMappingURL=tag-projector.js.map