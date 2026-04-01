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

import { strikeRepo, bondRepo, todoRepo } from "../db/repositories/index.js";
import { query, queryOne, execute } from "../db/pool.js";
import { chatCompletion } from "../ai/provider.js";
import type { StrikeEntry } from "../db/repositories/strike.js";
import type { BondEntry } from "../db/repositories/bond.js";
import { writeStrikeEmbedding } from "./embed-writer.js";

export interface EmergenceResult {
  higherOrderClusters: number;
  bondInheritance: number;
  absorbed: number;
  released: number;
  dissolved: number;
  merged: number;
}

// ── 阈值 ────────────────────────────────────────────────────
const ABSORB_THRESHOLD = 0.70;
const RELEASE_THRESHOLD = 0.50;
const L2_MERGE_THRESHOLD = 0.80;
const MIN_GROUP_SIZE = 2;
const MIN_FREE_L1 = 3;
const SIMILARITY_THRESHOLD = 0.75;

// ── 自由 L1 查询（排除被 active L2 吸收的） ─────────────────
const FREE_L1_SQL = `
  SELECT s.* FROM strike s
  WHERE s.user_id = $1 AND s.is_cluster = true AND s.level = 1
    AND s.status = 'active' AND s.embedding IS NOT NULL
    AND NOT EXISTS (
      SELECT 1 FROM bond b
      WHERE b.target_strike_id = s.id AND b.type = 'cluster_member'
        AND EXISTS (
          SELECT 1 FROM strike p
          WHERE p.id = b.source_strike_id AND p.level = 2 AND p.status = 'active'
        )
    )
  ORDER BY s.created_at DESC`;

/**
 * 运行 L2 涌现全生命周期
 */
export async function runEmergence(userId: string): Promise<EmergenceResult> {
  const result: EmergenceResult = {
    higherOrderClusters: 0,
    bondInheritance: 0,
    absorbed: 0,
    released: 0,
    dissolved: 0,
    merged: 0,
  };

  // ── 阶段 1: 吸纳 — 自由 L1 加入现有 L2 ──────────────────
  result.absorbed = await phaseAbsorb(userId);

  // ── 阶段 2: 释放 — 语义漂移的 L1 脱离 L2 ────────────────
  result.released = await phaseRelease(userId);

  // ── 阶段 3: 清理 — 空 L2 自动 dissolved ──────────────────
  result.dissolved = await phaseCleanup(userId);

  // ── 阶段 4: 创建 — 自由 L1 组建新 L2 ────────────────────
  result.higherOrderClusters = await phaseCreate(userId);

  // ── 阶段 5: 合并 — 语义重叠的 L2 合并 ───────────────────
  result.merged = await phaseMergeL2(userId);

  // ── 阶段 6: Bond 继承 ────────────────────────────────────
  result.bondInheritance = await phaseBondInheritance(userId);

  console.log(
    `[emergence] Done: +${result.higherOrderClusters} L2, ${result.absorbed} absorbed, ` +
      `${result.released} released, ${result.dissolved} dissolved, ` +
      `${result.merged} merged, ${result.bondInheritance} bonds inherited`,
  );

  // 层级标签回刷：涌现结构变化后，刷新涉及的 record 标签
  const structureChanged =
    result.absorbed + result.released + result.dissolved +
    result.higherOrderClusters + result.merged;
  if (structureChanged > 0) {
    try {
      // 查该用户所有 active L1 cluster → 回刷其成员 strike 的 source record
      const allL1 = await query<{ id: string }>(
        `SELECT id FROM strike
         WHERE user_id = $1 AND is_cluster = true AND level = 1 AND status = 'active'`,
        [userId],
      );
      if (allL1.length > 0) {
        const { batchRefreshByClusterIds } = await import("./tag-projector.js");
        await batchRefreshByClusterIds(allL1.map((c) => c.id));
      }
    } catch (e) {
      console.warn("[emergence] Tag projection failed:", e);
    }
  }

  return result;
}

// ── 阶段 1: 吸纳 ───────────────────────────────────────────

async function phaseAbsorb(userId: string): Promise<number> {
  // 查所有 active L2 及其 L1 成员
  const l2s = await query<StrikeEntry>(
    `SELECT * FROM strike
     WHERE user_id = $1 AND is_cluster = true AND level = 2
       AND status = 'active' AND embedding IS NOT NULL`,
    [userId],
  );
  if (l2s.length === 0) return 0;

  // 查所有自由 L1
  const freeL1s = await query<StrikeEntry>(FREE_L1_SQL, [userId]);
  if (freeL1s.length === 0) return 0;

  // 对每个 L2，查出其 L1 成员的 embedding（用于计算平均相似度）
  let absorbed = 0;
  const absorbedIds = new Set<string>();

  for (const free of freeL1s) {
    let bestL2: string | null = null;
    let bestSim = 0;

    for (const l2 of l2s) {
      // 计算 free L1 与该 L2 所有成员的平均相似度
      const row = await queryOne<{ avg_sim: number }>(
        `SELECT AVG(1 - (f.embedding <=> m.embedding))::float AS avg_sim
         FROM strike f, strike m, bond b
         WHERE f.id = $1
           AND b.source_strike_id = $2 AND b.type = 'cluster_member'
           AND m.id = b.target_strike_id
           AND m.embedding IS NOT NULL
           AND f.embedding IS NOT NULL`,
        [free.id, l2.id],
      );
      const sim = row?.avg_sim ?? 0;
      if (sim >= ABSORB_THRESHOLD && sim > bestSim) {
        bestSim = sim;
        bestL2 = l2.id;
      }
    }

    if (bestL2) {
      await bondRepo.create({
        source_strike_id: bestL2,
        target_strike_id: free.id,
        type: "cluster_member",
        strength: 1.0,
        created_by: "emergence",
      });
      absorbedIds.add(free.id);
      absorbed++;
      console.log(`[emergence:absorb] L1 "${free.nucleus}" → L2 (sim=${bestSim.toFixed(2)})`);
    }
  }

  return absorbed;
}

// ── 阶段 2: 释放 ───────────────────────────────────────────

async function phaseRelease(userId: string): Promise<number> {
  const l2s = await query<StrikeEntry>(
    `SELECT * FROM strike
     WHERE user_id = $1 AND is_cluster = true AND level = 2
       AND status = 'active'`,
    [userId],
  );
  if (l2s.length === 0) return 0;

  let released = 0;

  for (const l2 of l2s) {
    // 查该 L2 的所有 L1 成员
    const members = await query<{ id: string; nucleus: string }>(
      `SELECT s.id, s.nucleus FROM strike s
       JOIN bond b ON b.target_strike_id = s.id
       WHERE b.source_strike_id = $1 AND b.type = 'cluster_member'
         AND s.is_cluster = true AND s.level = 1 AND s.status = 'active'
         AND s.embedding IS NOT NULL`,
      [l2.id],
    );

    if (members.length <= 1) continue; // 单成员 L2 不释放

    // 对每个成员，计算与其余成员的平均相似度
    for (const m of members) {
      const otherIds = members.filter((o) => o.id !== m.id).map((o) => o.id);
      if (otherIds.length === 0) continue;

      const row = await queryOne<{ avg_sim: number }>(
        `SELECT AVG(1 - (a.embedding <=> b.embedding))::float AS avg_sim
         FROM strike a, strike b
         WHERE a.id = $1 AND b.id = ANY($2)
           AND a.embedding IS NOT NULL AND b.embedding IS NOT NULL`,
        [m.id, otherIds],
      );
      const sim = row?.avg_sim ?? 1.0;

      if (sim < RELEASE_THRESHOLD) {
        // 删除 cluster_member bond
        await execute(
          `DELETE FROM bond
           WHERE source_strike_id = $1 AND target_strike_id = $2 AND type = 'cluster_member'`,
          [l2.id, m.id],
        );
        released++;
        console.log(`[emergence:release] L1 "${m.nucleus}" ← L2 (sim=${sim.toFixed(2)})`);
      }
    }
  }

  return released;
}

// ── 阶段 3: 清理 ───────────────────────────────────────────

async function phaseCleanup(userId: string): Promise<number> {
  // 查所有 active L2，检查是否还有成员
  const emptyL2s = await query<{ id: string }>(
    `SELECT s.id FROM strike s
     WHERE s.user_id = $1 AND s.is_cluster = true AND s.level = 2 AND s.status = 'active'
       AND NOT EXISTS (
         SELECT 1 FROM bond b
         WHERE b.source_strike_id = s.id AND b.type = 'cluster_member'
           AND EXISTS (
             SELECT 1 FROM strike m
             WHERE m.id = b.target_strike_id AND m.status = 'active'
           )
       )`,
    [userId],
  );

  for (const l2 of emptyL2s) {
    await strikeRepo.updateStatus(l2.id, "dissolved");
    // todo.cluster_id 引用清空
    await execute(
      `UPDATE todo SET cluster_id = NULL WHERE cluster_id = $1`,
      [l2.id],
    );
    console.log(`[emergence:cleanup] Dissolved empty L2 ${l2.id}`);
  }

  return emptyL2s.length;
}

// ── 阶段 4: 创建（原有逻辑） ───────────────────────────────

async function phaseCreate(userId: string): Promise<number> {
  // 重新查自由 L1（阶段 1 可能已吸纳了一些）
  const freeL1s = await query<StrikeEntry>(FREE_L1_SQL, [userId]);

  if (freeL1s.length < MIN_FREE_L1) {
    console.log(`[emergence:create] Only ${freeL1s.length} free L1 (need ${MIN_FREE_L1}), skipping`);
    return 0;
  }

  // 两两相似度
  const clusterIds = freeL1s.map((c) => c.id);
  const similarPairs = await query<{ id_a: string; id_b: string; similarity: number }>(
    `SELECT a.id AS id_a, b.id AS id_b,
            1 - (a.embedding <=> b.embedding) AS similarity
     FROM strike a, strike b
     WHERE a.id = ANY($1) AND b.id = ANY($1) AND a.id < b.id
       AND a.embedding IS NOT NULL AND b.embedding IS NOT NULL
       AND 1 - (a.embedding <=> b.embedding) >= $2`,
    [clusterIds, SIMILARITY_THRESHOLD],
  );

  // 连通分量
  const adj = new Map<string, Set<string>>();
  for (const c of freeL1s) adj.set(c.id, new Set());
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
        neighbors.forEach((n) => { if (!visited.has(n)) stack.push(n); });
      }
    }
    if (component.length >= MIN_GROUP_SIZE) groups.push(component);
  }

  if (groups.length === 0) return 0;

  const clusterMap = new Map(freeL1s.map((c) => [c.id, c]));
  let created = 0;

  for (const group of groups) {
    const members = group.map((id) => clusterMap.get(id)!).filter(Boolean);
    if (members.length < MIN_GROUP_SIZE) continue;

    const memberDescriptions = members.map((m) => `- ${m.nucleus}`).join("\n");

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
        console.error("[emergence:create] Failed to parse AI response:", aiResponse.content);
        continue;
      }

      if (!parsed.merge || !parsed.name) continue;

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

      void writeStrikeEmbedding(l2.id, `[${parsed.name}] ${parsed.reason ?? ""}`);

      if (domain) {
        await queryOne(`UPDATE strike SET domain = $1 WHERE id = $2`, [domain, l2.id]);
      }

      await bondRepo.createMany(
        members.map((m) => ({
          source_strike_id: l2.id,
          target_strike_id: m.id,
          type: "cluster_member",
          strength: 1.0,
          created_by: "emergence",
        })),
      );

      created++;
      console.log(`[emergence:create] L2 "${parsed.name}" (${members.length} L1 members)`);
    } catch (e) {
      console.error("[emergence:create] AI call failed:", e);
    }
  }

  return created;
}

// ── 阶段 5: L2 合并 ────────────────────────────────────────

async function phaseMergeL2(userId: string): Promise<number> {
  const l2s = await query<StrikeEntry>(
    `SELECT * FROM strike
     WHERE user_id = $1 AND is_cluster = true AND level = 2
       AND status = 'active' AND embedding IS NOT NULL`,
    [userId],
  );
  if (l2s.length < 2) return 0;

  // 两两相似度
  const l2Ids = l2s.map((c) => c.id);
  const pairs = await query<{ id_a: string; id_b: string; similarity: number }>(
    `SELECT a.id AS id_a, b.id AS id_b,
            1 - (a.embedding <=> b.embedding) AS similarity
     FROM strike a, strike b
     WHERE a.id = ANY($1) AND b.id = ANY($1) AND a.id < b.id
       AND a.embedding IS NOT NULL AND b.embedding IS NOT NULL
       AND 1 - (a.embedding <=> b.embedding) >= $2`,
    [l2Ids, L2_MERGE_THRESHOLD],
  );

  if (pairs.length === 0) return 0;

  const l2Map = new Map(l2s.map((c) => [c.id, c]));
  const mergedIds = new Set<string>();
  let merged = 0;

  for (const pair of pairs) {
    if (mergedIds.has(pair.id_a) || mergedIds.has(pair.id_b)) continue;

    const l2a = l2Map.get(pair.id_a)!;
    const l2b = l2Map.get(pair.id_b)!;

    // AI 确认
    try {
      const aiResponse = await chatCompletion([
        {
          role: "system",
          content: `你是一个认知主题分析器。判断以下两个高层主题是否可以合并为一个。
回复 JSON:
- merge: true/false
- name: 如果 merge=true，给一个 2-6 字中文名称
- reason: 简短理由`,
        },
        {
          role: "user",
          content: `主题A: ${l2a.nucleus}\n主题B: ${l2b.nucleus}\n\n是否应该合并？`,
        },
      ], { json: true, temperature: 0.3, tier: "report" });

      let parsed: { merge?: boolean; name?: string; reason?: string };
      try {
        parsed = JSON.parse(aiResponse.content);
      } catch {
        continue;
      }

      if (!parsed.merge || !parsed.name) continue;

      // 创建新 L2
      const newL2 = await strikeRepo.create({
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

      void writeStrikeEmbedding(newL2.id, `[${parsed.name}] ${parsed.reason ?? ""}`);

      // 迁移两个旧 L2 的所有 L1 成员到新 L2
      for (const oldL2Id of [pair.id_a, pair.id_b]) {
        const memberBonds = await query<BondEntry>(
          `SELECT * FROM bond
           WHERE source_strike_id = $1 AND type = 'cluster_member'`,
          [oldL2Id],
        );

        if (memberBonds.length > 0) {
          await bondRepo.createMany(
            memberBonds.map((b) => ({
              source_strike_id: newL2.id,
              target_strike_id: b.target_strike_id,
              type: "cluster_member",
              strength: 1.0,
              created_by: "emergence",
            })),
          );
        }

        // 标记旧 L2 为 merged
        await strikeRepo.updateStatus(oldL2Id, "merged");
        // 迁移 todo.cluster_id
        await todoRepo.updateClusterRef(oldL2Id, newL2.id);
      }

      mergedIds.add(pair.id_a);
      mergedIds.add(pair.id_b);
      merged++;
      console.log(`[emergence:merge] L2 "${l2a.nucleus}" + "${l2b.nucleus}" → "${parsed.name}"`);
    } catch (e) {
      console.error("[emergence:merge] AI call failed:", e);
    }
  }

  return merged;
}

// ── 阶段 6: Bond 继承 ──────────────────────────────────────

async function phaseBondInheritance(userId: string): Promise<number> {
  const l2Clusters = await query<StrikeEntry>(
    `SELECT * FROM strike
     WHERE user_id = $1 AND is_cluster = true AND level = 2 AND status = 'active'
     ORDER BY created_at DESC LIMIT 20`,
    [userId],
  );

  if (l2Clusters.length < 2) return 0;

  let inherited = 0;

  for (let i = 0; i < l2Clusters.length; i++) {
    for (let j = i + 1; j < l2Clusters.length; j++) {
      const l2a = l2Clusters[i];
      const l2b = l2Clusters[j];

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
          inherited++;
        }
      }
    }
  }

  return inherited;
}
