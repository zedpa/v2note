/**
 * 知识生命周期管理
 * - scanExpiredFacts: 主动扫描过期 perceive Strike
 * - getSupersedAlerts: 生成过期确认 alert（注入晚间回顾）
 * - undoSupersede: 用户撤销自动 supersede
 */

import { query, execute } from "../db/pool.js";

// ── 场景 1: 过期事实检测 ─────────────────────────────────────────────

export interface ExpiredFact {
  oldId: string;
  oldNucleus: string;
  newId: string;
  newNucleus: string;
  similarity: number;
}

/**
 * 扫描 60 天前的 perceive Strike，检查是否有新的相似 Strike 取代了它。
 * 基于 embedding 相似度检测。
 */
export async function scanExpiredFacts(userId: string): Promise<ExpiredFact[]> {
  const rows = await query<{
    old_id: string;
    old_nucleus: string;
    new_id: string;
    new_nucleus: string;
    similarity: number;
  }>(
    `SELECT old_s.id as old_id, old_s.nucleus as old_nucleus,
            new_s.id as new_id, new_s.nucleus as new_nucleus,
            1 - (old_s.embedding <=> new_s.embedding) as similarity
     FROM strike old_s
     JOIN LATERAL (
       SELECT s.id, s.nucleus, s.embedding
       FROM strike s
       WHERE s.user_id = $1
         AND s.status = 'active'
         AND s.polarity = 'perceive'
         AND s.created_at > old_s.created_at
         AND s.embedding IS NOT NULL
       ORDER BY old_s.embedding <=> s.embedding
       LIMIT 1
     ) new_s ON true
     WHERE old_s.user_id = $1
       AND old_s.status = 'active'
       AND old_s.polarity = 'perceive'
       AND old_s.superseded_by IS NULL
       AND old_s.created_at < NOW() - INTERVAL '60 days'
       AND old_s.embedding IS NOT NULL
       AND 1 - (old_s.embedding <=> new_s.embedding) > 0.75
     ORDER BY similarity DESC
     LIMIT 20`,
    [userId],
  );

  return rows.map((r) => ({
    oldId: r.old_id,
    oldNucleus: r.old_nucleus,
    newId: r.new_id,
    newNucleus: r.new_nucleus,
    similarity: r.similarity,
  }));
}

// ── 过期确认 alert ──────────────────────────────────────────────────

export interface SupersedeAlert {
  type: "superseded";
  strikeId: string;
  nucleus: string;
  supersededBy: string;
  newNucleus: string;
  description: string;
}

/**
 * 获取最近被自动 supersede 的 Strike（7天内），生成确认 alert。
 */
export async function getSupersedAlerts(userId: string): Promise<SupersedeAlert[]> {
  const rows = await query<{
    id: string;
    nucleus: string;
    superseded_by: string;
    new_nucleus: string;
    superseded_at: string;
  }>(
    `SELECT s.id, s.nucleus, s.superseded_by,
            ns.nucleus as new_nucleus,
            s.updated_at as superseded_at
     FROM strike s
     JOIN strike ns ON ns.id = s.superseded_by
     WHERE s.user_id = $1
       AND s.status = 'superseded'
       AND s.updated_at >= NOW() - INTERVAL '7 days'
     ORDER BY s.updated_at DESC
     LIMIT 10`,
    [userId],
  );

  return rows.map((r) => ({
    type: "superseded" as const,
    strikeId: r.id,
    nucleus: r.nucleus,
    supersededBy: r.superseded_by,
    newNucleus: r.new_nucleus,
    description: `「${r.nucleus}」可能已过时，被「${r.new_nucleus}」更新。需要确认吗？`,
  }));
}

// ── 场景 3: 撤销 supersede ──────────────────────────────────────────

/**
 * 用户不同意自动 supersede → 恢复 active 状态。
 */
export async function undoSupersede(strikeId: string): Promise<void> {
  await execute(
    `UPDATE strike SET status = 'active', superseded_by = NULL, updated_at = NOW() WHERE id = $1`,
    [strikeId],
  );
}
