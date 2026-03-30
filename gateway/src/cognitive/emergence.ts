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
const BOND_STRENGTH_THRESHOLD = 0.5;

/**
 * 运行 L2 涌现：发现 L1 之间的高阶关联，合并为 L2 主题
 */
export async function runEmergence(userId: string): Promise<EmergenceResult> {
  const result: EmergenceResult = { higherOrderClusters: 0, bondInheritance: 0 };

  // 1. 查出所有 L1 cluster（未被 L2 吸收的）
  const l1Clusters = await query<StrikeEntry>(
    `SELECT s.* FROM strike s
     WHERE s.user_id = $1 AND s.is_cluster = true AND s.level = 1
       AND NOT EXISTS (
         SELECT 1 FROM bond b
         WHERE b.target_strike_id = s.id AND b.type = 'cluster_member'
           AND EXISTS (SELECT 1 FROM strike p WHERE p.id = b.source_strike_id AND p.level = 2)
       )
     ORDER BY s.created_at DESC`,
    [userId],
  );

  if (l1Clusters.length < MIN_GROUP_SIZE) {
    console.log(`[emergence] Only ${l1Clusters.length} free L1 clusters, skipping`);
    return result;
  }

  // 2. 查出 L1 之间的 bond
  const clusterIds = l1Clusters.map((c) => c.id);
  const interClusterBonds = await query<BondEntry>(
    `SELECT * FROM bond
     WHERE source_strike_id = ANY($1) AND target_strike_id = ANY($1)
       AND type != 'cluster_member'
       AND strength >= $2`,
    [clusterIds, BOND_STRENGTH_THRESHOLD],
  );

  // 3. 构建邻接图，找连通分量
  const adj = new Map<string, Set<string>>();
  for (const c of l1Clusters) adj.set(c.id, new Set());
  for (const b of interClusterBonds) {
    adj.get(b.source_strike_id)?.add(b.target_strike_id);
    adj.get(b.target_strike_id)?.add(b.source_strike_id);
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
      for (const neighbor of adj.get(node) ?? []) {
        if (!visited.has(neighbor)) stack.push(neighbor);
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
