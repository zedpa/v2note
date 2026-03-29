/**
 * cognitive_snapshot CRUD — Tier2 批量分析的增量基础设施
 */

import { query, queryOne, execute } from "../pool.js";

// ── Types ──────────────────────────────────────────────────────────────

export interface SnapshotCluster {
  id: string;
  name: string;
  description: string;
  size: number;
  polarity: string;
  level: number;
}

export interface SnapshotGoal {
  id: string;
  title: string;
  status: string;
  cluster_id?: string;
}

export interface SnapshotContradiction {
  strike_a_nucleus: string;
  strike_b_nucleus: string;
  description: string;
}

export interface SnapshotPattern {
  pattern: string;
  confidence: number;
}

export interface CognitiveSnapshot {
  user_id: string;
  clusters: SnapshotCluster[];
  goals: SnapshotGoal[];
  contradictions: SnapshotContradiction[];
  patterns: SnapshotPattern[];
  last_analyzed_strike_id: string | null;
  strike_count: number;
  version: number;
  updated_at: string;
}

// ── Read ───────────────────────────────────────────────────────────────

export async function findByUser(userId: string): Promise<CognitiveSnapshot | null> {
  try {
    const row = await queryOne<CognitiveSnapshot>(
      `SELECT * FROM cognitive_snapshot WHERE user_id = $1`,
      [userId],
    );
    if (!row) return null;

    // 验证 JSONB 字段可解析（防止损坏）
    if (!Array.isArray(row.clusters)) row.clusters = [];
    if (!Array.isArray(row.goals)) row.goals = [];
    if (!Array.isArray(row.contradictions)) row.contradictions = [];
    if (!Array.isArray(row.patterns)) row.patterns = [];

    return row;
  } catch (e) {
    console.error("[snapshot] Read failed, resetting to cold-start:", e);
    await execute(`DELETE FROM cognitive_snapshot WHERE user_id = $1`, [userId]).catch(() => {});
    return null;
  }
}

// ── Write ──────────────────────────────────────────────────────────────

export async function upsert(
  userId: string,
  data: {
    clusters: SnapshotCluster[];
    goals: SnapshotGoal[];
    contradictions: SnapshotContradiction[];
    patterns: SnapshotPattern[];
    last_analyzed_strike_id: string;
    strike_count: number;
  },
): Promise<void> {
  // 强制裁剪到限制
  const clusters = data.clusters.slice(0, 50);
  const goals = data.goals.slice(0, 30);
  const contradictions = data.contradictions.slice(0, 20);
  const patterns = data.patterns.filter((p) => p.confidence >= 0.5).slice(0, 20);

  await execute(
    `INSERT INTO cognitive_snapshot (user_id, clusters, goals, contradictions, patterns, last_analyzed_strike_id, strike_count, version, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, 1, now())
     ON CONFLICT (user_id) DO UPDATE SET
       clusters = $2, goals = $3, contradictions = $4, patterns = $5,
       last_analyzed_strike_id = $6, strike_count = $7,
       version = cognitive_snapshot.version + 1,
       updated_at = now()`,
    [
      userId,
      JSON.stringify(clusters),
      JSON.stringify(goals),
      JSON.stringify(contradictions),
      JSON.stringify(patterns),
      data.last_analyzed_strike_id,
      data.strike_count,
    ],
  );
}

// ── 查询新增 Strike 数量 ──────────────────────────────────────────────

export async function countNewStrikes(userId: string): Promise<number> {
  const snapshot = await queryOne<{ last_analyzed_strike_id: string | null }>(
    `SELECT last_analyzed_strike_id FROM cognitive_snapshot WHERE user_id = $1`,
    [userId],
  );

  if (!snapshot?.last_analyzed_strike_id) {
    // 无 snapshot → 返回全部 active strike 数量
    const row = await queryOne<{ count: string }>(
      `SELECT COUNT(*)::text as count FROM strike WHERE user_id = $1 AND status = 'active'`,
      [userId],
    );
    return parseInt(row?.count ?? "0", 10);
  }

  const row = await queryOne<{ count: string }>(
    `SELECT COUNT(*)::text as count FROM strike
     WHERE user_id = $1 AND status = 'active'
       AND created_at > (SELECT created_at FROM strike WHERE id = $2)`,
    [userId, snapshot.last_analyzed_strike_id],
  );
  return parseInt(row?.count ?? "0", 10);
}

// ── 获取新增 Strike 列表 ──────────────────────────────────────────────

export interface NewStrikeRow {
  id: string;
  nucleus: string;
  polarity: string;
  source_type: string | null;
  created_at: string;
  tags: string | null; // 逗号分隔
}

export async function getNewStrikes(
  userId: string,
  lastStrikeId: string | null,
  limit = 300,
): Promise<NewStrikeRow[]> {
  if (!lastStrikeId) {
    // 冷启动：取最早的 limit 条（ASC，方便分批推进）
    return query<NewStrikeRow>(
      `SELECT s.id, s.nucleus, s.polarity, s.source_type, s.created_at,
              string_agg(st.label, ',') as tags
       FROM strike s
       LEFT JOIN strike_tag st ON st.strike_id = s.id
       WHERE s.user_id = $1 AND s.status = 'active' AND s.is_cluster = false
       GROUP BY s.id
       ORDER BY s.created_at ASC LIMIT $2`,
      [userId, limit],
    );
  }

  return query<NewStrikeRow>(
    `SELECT s.id, s.nucleus, s.polarity, s.source_type, s.created_at,
            string_agg(st.label, ',') as tags
     FROM strike s
     LEFT JOIN strike_tag st ON st.strike_id = s.id
     WHERE s.user_id = $1 AND s.status = 'active' AND s.is_cluster = false
       AND s.created_at > (SELECT created_at FROM strike WHERE id = $2)
     GROUP BY s.id
     ORDER BY s.created_at ASC LIMIT $3`,
    [userId, lastStrikeId, limit],
  );
}
