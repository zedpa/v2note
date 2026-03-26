/**
 * Cluster → strike_tag 同步。
 *
 * 在 daily-cycle 的 maintenance 之后执行，将 Cluster 名称
 * 作为标签反写到其成员 Strike 上。
 */

import { query, execute } from "../db/pool.js";
import * as strikeTagRepo from "../db/repositories/strike-tag.js";
import type { StrikeEntry } from "../db/repositories/strike.js";

export interface TagSyncResult {
  created: number;
  retired: number;
}

/** 从 cluster nucleus 提取方括号内的名称 */
export function extractClusterName(nucleus: string): string {
  const m = nucleus.match(/^\[(.+?)\]/);
  return m ? m[1] : nucleus;
}

/**
 * 全量同步 Cluster 标签到成员 Strike。
 *
 * 1. 加载所有 active clusters 及其成员
 * 2. 为每个成员创建 cluster 标签（去重）
 * 3. 软删除不再属于任何 active cluster 的旧标签
 */
export async function syncClusterTags(userId: string): Promise<TagSyncResult> {
  let created = 0;
  let retired = 0;

  try {
    // 1. 加载所有 active clusters
    const clusters = await query<StrikeEntry>(
      `SELECT * FROM strike
       WHERE user_id = $1 AND is_cluster = true AND status = 'active'`,
      [userId],
    );

    // 收集每个 cluster 的成员和期望的标签
    // Map<strikeId, Set<label>> — 当前应有的 cluster 标签
    const expectedTags = new Map<string, Map<string, number>>();

    for (const cluster of clusters) {
      const clusterName = extractClusterName(cluster.nucleus);

      // 查成员 bond
      const members = await query<{ target_strike_id: string; strength: number }>(
        `SELECT target_strike_id, strength FROM bond
         WHERE source_strike_id = $1 AND type = 'cluster_member'`,
        [cluster.id],
      );

      if (members.length === 0) continue;

      // 计算 bond 强度均值作为 confidence
      const avgStrength =
        members.reduce((sum, m) => sum + m.strength, 0) / members.length;

      for (const m of members) {
        if (!expectedTags.has(m.target_strike_id)) {
          expectedTags.set(m.target_strike_id, new Map());
        }
        expectedTags
          .get(m.target_strike_id)!
          .set(clusterName, avgStrength);
      }
    }

    // 2. 查询所有现存的 cluster 标签
    const existingClusterTags = await query<{
      id: string;
      strike_id: string;
      label: string;
      confidence: number;
    }>(
      `SELECT st.id, st.strike_id, st.label, st.confidence
       FROM strike_tag st
       JOIN strike s ON s.id = st.strike_id
       WHERE s.user_id = $1 AND st.created_by = 'cluster' AND st.confidence > 0`,
      [userId],
    );

    // 构建已存在的 set: strikeId:label
    const existingSet = new Set<string>();
    for (const tag of existingClusterTags) {
      existingSet.add(`${tag.strike_id}:${tag.label}`);
    }

    // 3. 软删除不再需要的旧标签
    const expectedSet = new Set<string>();
    for (const [strikeId, labels] of expectedTags) {
      for (const label of labels.keys()) {
        expectedSet.add(`${strikeId}:${label}`);
      }
    }

    for (const tag of existingClusterTags) {
      const key = `${tag.strike_id}:${tag.label}`;
      if (!expectedSet.has(key)) {
        await execute(
          `UPDATE strike_tag SET confidence = 0
           WHERE strike_id = $1 AND label = $2 AND created_by = 'cluster' AND confidence > 0`,
          [tag.strike_id, tag.label],
        );
        retired++;
      }
    }

    // 4. 创建新标签（跳过已存在的）
    const toCreate: Array<{
      strike_id: string;
      label: string;
      confidence: number;
      created_by: string;
    }> = [];

    for (const [strikeId, labels] of expectedTags) {
      for (const [label, confidence] of labels) {
        const key = `${strikeId}:${label}`;
        if (!existingSet.has(key)) {
          toCreate.push({
            strike_id: strikeId,
            label,
            confidence,
            created_by: "cluster",
          });
        }
      }
    }

    if (toCreate.length > 0) {
      await strikeTagRepo.createMany(toCreate);
      created = toCreate.length;
    }

    console.log(`[tag-sync] Done: created=${created} retired=${retired}`);
  } catch (err) {
    console.error("[tag-sync] Error:", err);
  }

  return { created, retired };
}
