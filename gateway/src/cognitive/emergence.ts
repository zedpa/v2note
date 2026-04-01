/**
 * L2 涌现引擎 — 将关联紧密的 L1 Cluster 聚合为 L2 主题
 *
 * 触发时机：
 *  - batch-analyze 完成后，若本批新建 3+ 个 L1 cluster，立即调用
 *  - 每周定期调度（daily-cycle 中每 7 天运行一次）
 *
 * 流程：
 *  1. 查出用户所有 L1 cluster
 *  2. 查出 L1 之间的 bond（context_of / related）
 *  3. 找出互相有 bond 的 L1 组（强度 > 0.5）
 *  4. AI 判断这些 L1 是否属于同一 L2 主题
 *  5. 创建 L2 cluster，用 cluster_member bond 关联 L1
 *  6. 继承 L1 间跨组 bond 到 L2 层级
 */

import { strikeRepo, bondRepo } from "../db/repositories/index.js";
import { query, queryOne } from "../db/pool.js";
import { chatCompletion } from "../ai/provider.js";
import type { StrikeEntry } from "../db/repositories/strike.js";
import type { BondEntry } from "../db/repositories/bond.js";
import { writeStrikeEmbedding } from "./embed-writer.js";

export interface EmergenceResult {
  higherOrderClusters: number;
  bondInheritance: number;
}

const MIN_GROUP_SIZE = 2;
const MIN_FREE_L1 = 3;
const SIMILARITY_THRESHOLD = 0.75;

/**
 * 运行 L2 涌现：发现 L1 之间的高阶关联，合并为 L2 主题
 *
 * 使用 embedding 余弦相似度发现 L1 聚类之间的关联（不再依赖预先存在的 bond）。
 */
export async function runEmergence(userId: string): Promise<EmergenceResult> {
  const result: EmergenceResult = { higherOrderClusters: 0, bondInheritance: 0 };

  // 1. 查出所有自由 L1 cluster（未被 L2 吸收的，且有 embedding）
  const l1Clusters = await query<StrikeEntry>(
    `SELECT s.* FROM strike s
     WHERE s.user_id = $1 AND s.is_cluster = true AND s.level = 1
       AND s.embedding IS NOT NULL
       AND NOT EXISTS (
         SELECT 1 FROM bond b
         WHERE b.target_strike_id = s.id AND b.type = 'cluster_member'
           AND EXISTS (SELECT 1 FROM strike p WHERE p.id = b.source_strike_id AND p.level = 2)
       )
     ORDER BY s.created_at DESC`,
    [userId],
  );

  if (l1Clusters.length < MIN_FREE_L1) {
    console.log(`[emergence] Only ${l1Clusters.length} free L1 clusters (need ${MIN_FREE_L1}), skipping`);
    return result;
  }

  // 2. 用 pgvector 余弦相似度查找 L1 之间的关联对
  const clusterIds = l1Clusters.map((c) => c.id);
  const similarPairs = await query<{ id_a: string; id_b: string; similarity: number }>(
    `SELECT a.id AS id_a, b.id AS id_b,
            1 - (a.embedding <=> b.embedding) AS similarity
     FROM strike a, strike b
     WHERE a.id = ANY($1) AND b.id = ANY($1) AND a.id < b.id
       AND a.embedding IS NOT NULL AND b.embedding IS NOT NULL
       AND 1 - (a.embedding <=> b.embedding) >= $2`,
    [clusterIds, SIMILARITY_THRESHOLD],
  );

  console.log(`[emergence] Found ${similarPairs.length} similar L1 pairs (threshold ${SIMILARITY_THRESHOLD})`);

  // 3. 构建邻接图，找连通分量
  const adj = new Map<string, Set<string>>();
  for (const c of l1Clusters) adj.set(c.id, new Set());
  for (const p of similarPairs) {
    adj.get(p.id_a)?.add(p.id_b);
    adj.get(p.id_b)?.add(p.id_a);
  }

  const visited = new Set<string>();
  const groups: string[][] = [];
  for (const cId of clusterIds) {
    if (visited.has(cId)) continue;
    const component: string[] = [];
    const stack = [cId];
    while (stack.length > 0) {
      const node = stack.pop()!;
      if (visited.has(node)) continue;
      visited.add(node);
      component.push(node);
      const neighbors = adj.get(node);
      if (neighbors) {
        neighbors.forEach((neighbor) => {
          if (!visited.has(neighbor)) stack.push(neighbor);
        });
      }
    }
    if (component.length >= MIN_GROUP_SIZE) {
      groups.push(component);
    }
  }

  if (groups.length === 0) {
    console.log("[emergence] No L1 groups found for L2 emergence");
    return result;
  }

  // 4. 对每个候选组，AI 判断是否属于同一 L2 主题
  const clusterMap = new Map(l1Clusters.map((c) => [c.id, c]));

  for (const group of groups) {
    const members = group.map((id) => clusterMap.get(id)!).filter(Boolean);
    if (members.length < MIN_GROUP_SIZE) continue;

    const memberDescriptions = members
      .map((m) => `- ${m.nucleus}`)
      .join("\n");

    try {
      const aiResponse = await chatCompletion([
        {
          role: "system",
          content: `你是一个认知主题分析器。判断以下主题聚类是否属于同一个更高层级的大主题。
回复 JSON:
- merge: true/false（是否合并）
- name: 如果 merge=true，给一个 2-6 字中文名称
- reason: 简短理由`,
        },
        {
          role: "user",
          content: `以下 L1 主题是否属于同一个 L2 大主题？\n\n${memberDescriptions}`,
        },
      ], { json: true, temperature: 0.3, tier: "report" });

      let parsed: { merge?: boolean; name?: string; reason?: string };
      try {
        parsed = JSON.parse(aiResponse.content);
      } catch {
        console.error("[emergence] Failed to parse AI response:", aiResponse.content);
        continue;
      }

      if (!parsed.merge || !parsed.name) continue;

      // 5. 创建 L2 cluster
      const domain = members[0].domain ?? undefined;
      const l2 = await strikeRepo.create({
        user_id: userId,
        nucleus: `[${parsed.name}] ${parsed.reason ?? ""}`,
        polarity: "perceive",
        is_cluster: true,
        confidence: 0.6,
        salience: 0.9,
        source_type: "clustering",
        level: 2,
        origin: "emerged",
      });

      // 异步写入 embedding
      void writeStrikeEmbedding(l2.id, `[${parsed.name}] ${parsed.reason ?? ""}`);

      // 设置 domain（继承成员中最常见的 domain）
      if (domain) {
        await queryOne(`UPDATE strike SET domain = $1 WHERE id = $2`, [domain, l2.id]);
      }

      // 创建 cluster_member bonds（L2 → L1）
      await bondRepo.createMany(
        members.map((m) => ({
          source_strike_id: l2.id,
          target_strike_id: m.id,
          type: "cluster_member",
          strength: 1.0,
          created_by: "emergence",
        })),
      );

      result.higherOrderClusters++;
      console.log(`[emergence] Created L2: "${parsed.name}" (${members.length} L1 members)`);

    } catch (e) {
      console.error("[emergence] AI call failed for group:", e);
    }
  }

  // 6. Bond 继承：L2 之间继承子级 bond
  if (result.higherOrderClusters >= 2) {
    const l2Clusters = await query<StrikeEntry>(
      `SELECT * FROM strike WHERE user_id = $1 AND is_cluster = true AND level = 2
       ORDER BY created_at DESC LIMIT 20`,
      [userId],
    );

    for (let i = 0; i < l2Clusters.length; i++) {
      for (let j = i + 1; j < l2Clusters.length; j++) {
        const l2a = l2Clusters[i];
        const l2b = l2Clusters[j];

        // 查询 L2a 的 L1 成员和 L2b 的 L1 成员之间是否有 bond
        const crossBonds = await query<{ avg_strength: string }>(
          `SELECT AVG(b.strength)::text AS avg_strength FROM bond b
           WHERE b.source_strike_id IN (
             SELECT target_strike_id FROM bond WHERE source_strike_id = $1 AND type = 'cluster_member'
           ) AND b.target_strike_id IN (
             SELECT target_strike_id FROM bond WHERE source_strike_id = $2 AND type = 'cluster_member'
           ) AND b.type != 'cluster_member'`,
          [l2a.id, l2b.id],
        );

        const avgStrength = Number(crossBonds[0]?.avg_strength ?? 0);
        if (avgStrength > 0.3) {
          // 检查是否已存在 L2 之间的 bond
          const existing = await query<BondEntry>(
            `SELECT id FROM bond WHERE source_strike_id = $1 AND target_strike_id = $2 LIMIT 1`,
            [l2a.id, l2b.id],
          );
          if (existing.length === 0) {
            await bondRepo.create({
              source_strike_id: l2a.id,
              target_strike_id: l2b.id,
              type: "context_of",
              strength: avgStrength,
              created_by: "emergence",
            });
            result.bondInheritance++;
          }
        }
      }
    }
  }

  console.log(
    `[emergence] Done: ${result.higherOrderClusters} L2 created, ${result.bondInheritance} bonds inherited`,
  );
  return result;
}
