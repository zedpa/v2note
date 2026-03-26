/**
 * 认知报告生成 — 纯数据聚合，0 AI 调用。
 *
 * 在 daily-cycle 末尾调用，产出结构化报告供晨间/晚间简报使用。
 */

import { query } from "../db/pool.js";

export interface CognitiveReport {
  today_strikes: {
    perceive: number;
    judge: number;
    realize: number;
    intend: number;
    feel: number;
  };
  contradictions: Array<{
    strikeA_nucleus: string;
    strikeB_nucleus: string;
    strength: number;
  }>;
  cluster_changes: Array<{
    name: string;
    type: "created" | "merged" | "archived";
  }>;
  behavior_drift: {
    intend_count: number;
    todo_completed: number;
    completion_rate: number;
  };
  is_empty: boolean;
}

const today = () => new Date().toISOString().split("T")[0];

export async function generateCognitiveReport(userId: string): Promise<CognitiveReport> {
  const todayStr = today();

  // 1. 今日极性分布（只统计 think）
  const polarityRows = await query<{ polarity: string; count: string }>(
    `SELECT polarity, COUNT(*) as count FROM strike
     WHERE user_id = $1 AND status = 'active'
       AND COALESCE(source_type, 'think') != 'material'
       AND created_at::date = $2::date
     GROUP BY polarity`,
    [userId, todayStr],
  );

  const polarityMap: Record<string, number> = {};
  for (const row of polarityRows) {
    polarityMap[row.polarity] = parseInt(row.count, 10);
  }

  const today_strikes = {
    perceive: polarityMap["perceive"] ?? 0,
    judge: polarityMap["judge"] ?? 0,
    realize: polarityMap["realize"] ?? 0,
    intend: polarityMap["intend"] ?? 0,
    feel: polarityMap["feel"] ?? 0,
  };

  // 2. 今日矛盾（最多 5 条）
  const contradictionRows = await query<{
    a_nucleus: string;
    b_nucleus: string;
    strength: number;
  }>(
    `SELECT sa.nucleus as a_nucleus, sb.nucleus as b_nucleus, b.strength
     FROM bond b
     JOIN strike sa ON sa.id = b.source_strike_id
     JOIN strike sb ON sb.id = b.target_strike_id
     WHERE sa.user_id = $1 AND b.type = 'contradiction'
       AND b.created_at::date = $2::date
     ORDER BY b.strength DESC
     LIMIT 5`,
    [userId, todayStr],
  );

  const contradictions = contradictionRows.slice(0, 5).map((r) => ({
    strikeA_nucleus: r.a_nucleus,
    strikeB_nucleus: r.b_nucleus,
    strength: r.strength,
  }));

  // 3. Cluster 变化（今日新建的）
  const newClusters = await query<{ nucleus: string }>(
    `SELECT nucleus FROM strike
     WHERE user_id = $1 AND is_cluster = true AND status = 'active'
       AND created_at::date = $2::date`,
    [userId, todayStr],
  );

  const cluster_changes = newClusters.map((c) => ({
    name: c.nucleus,
    type: "created" as const,
  }));

  // 4. 行为偏差
  const todoStats = await query<{ total: string; done: string }>(
    `SELECT
       COUNT(*)::text as total,
       COUNT(*) FILTER (WHERE done = true)::text as done
     FROM todo
     WHERE user_id = $1 AND created_at::date = $2::date`,
    [userId, todayStr],
  );

  const totalTodos = parseInt(todoStats[0]?.total ?? "0", 10);
  const doneTodos = parseInt(todoStats[0]?.done ?? "0", 10);

  const behavior_drift = {
    intend_count: today_strikes.intend,
    todo_completed: doneTodos,
    completion_rate: totalTodos > 0 ? doneTodos / totalTodos : 0,
  };

  const totalStrikes = Object.values(today_strikes).reduce((a, b) => a + b, 0);
  const is_empty = totalStrikes === 0 && contradictions.length === 0 && cluster_changes.length === 0;

  return {
    today_strikes,
    contradictions,
    cluster_changes,
    behavior_drift,
    is_empty,
  };
}
