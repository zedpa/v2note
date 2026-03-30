import type { Router } from "../router.js";
import { sendJson, sendError, getUserId } from "../lib/http-helpers.js";
import { query, queryOne } from "../db/pool.js";
import { strikeRepo, bondRepo, goalRepo } from "../db/repositories/index.js";
import type { StrikeEntry } from "../db/repositories/strike.js";
import type { Goal } from "../db/repositories/goal.js";
import { writeStrikeEmbedding } from "../cognitive/embed-writer.js";

// ── Types ──

interface TopicItem {
  clusterId: string;
  title: string;
  memberCount: number;
  activeGoals: { id: string; title: string }[];
  lastActivity: string;
  intendDensity: number;
  hasActiveGoal: boolean;
}

interface LifecycleResponse {
  now: any[];
  growing: { goal: Goal; todos: any[]; completionPercent: number }[];
  seeds: StrikeEntry[];
  harvest: { goal: Goal; reviewStrike: StrikeEntry | null; completedAt: string }[];
}

export function registerTopicRoutes(router: Router) {
  // ── GET /api/v1/topics ──
  // 返回聚合后的主题列表（Cluster + Goal + Strike 统计）
  router.get("/api/v1/topics", async (req, res) => {
    try {
      const userId = getUserId(req);
      if (!userId) {
        sendError(res, "Missing user identity", 401);
        return;
      }

      // 1. 获取所有 cluster strikes
      const clusters = await query<StrikeEntry>(
        `SELECT * FROM strike WHERE user_id = $1 AND is_cluster = true AND status = 'active'
         ORDER BY created_at DESC`,
        [userId],
      );

      if (clusters.length === 0) {
        sendJson(res, []);
        return;
      }

      const clusterIds = clusters.map((c) => c.id);

      // 2. 批量查询每个 cluster 的成员数量
      const memberCounts = await query<{ target_strike_id: string; cnt: string }>(
        `SELECT target_strike_id, COUNT(*) as cnt FROM bond
         WHERE target_strike_id = ANY($1) AND type = 'cluster_member'
         GROUP BY target_strike_id`,
        [clusterIds],
      );
      const memberCountMap = new Map(memberCounts.map((r) => [r.target_strike_id, parseInt(r.cnt, 10)]));

      // 3. 批量查询关联的 active goals
      const activeGoals = await query<Goal>(
        `SELECT * FROM goal WHERE cluster_id = ANY($1) AND status = 'active'`,
        [clusterIds],
      );
      const goalsByCluster = new Map<string, { id: string; title: string }[]>();
      for (const g of activeGoals) {
        if (!g.cluster_id) continue;
        const list = goalsByCluster.get(g.cluster_id) ?? [];
        list.push({ id: g.id, title: g.title });
        goalsByCluster.set(g.cluster_id, list);
      }

      // 4. 批量查询成员 strike 的 polarity 分布（用于计算 intendDensity）
      const polarityStats = await query<{
        target_strike_id: string;
        total: string;
        intend_count: string;
      }>(
        `SELECT b.target_strike_id,
                COUNT(*) as total,
                COUNT(*) FILTER (WHERE s.polarity = 'intend') as intend_count
         FROM bond b
         JOIN strike s ON s.id = b.source_strike_id
         WHERE b.target_strike_id = ANY($1) AND b.type = 'cluster_member'
         GROUP BY b.target_strike_id`,
        [clusterIds],
      );
      const polarityMap = new Map(
        polarityStats.map((r) => [
          r.target_strike_id,
          { total: parseInt(r.total, 10), intend: parseInt(r.intend_count, 10) },
        ]),
      );

      // 5. 批量查询最近活动时间
      const lastActivities = await query<{ target_strike_id: string; last_at: string }>(
        `SELECT b.target_strike_id, MAX(s.created_at) as last_at
         FROM bond b
         JOIN strike s ON s.id = b.source_strike_id
         WHERE b.target_strike_id = ANY($1) AND b.type = 'cluster_member'
         GROUP BY b.target_strike_id`,
        [clusterIds],
      );
      const lastActivityMap = new Map(lastActivities.map((r) => [r.target_strike_id, r.last_at]));

      // 6. 组装结果
      const topics: TopicItem[] = clusters.map((cluster) => {
        const goals = goalsByCluster.get(cluster.id) ?? [];
        const polarity = polarityMap.get(cluster.id);
        const total = polarity?.total ?? 0;
        const intend = polarity?.intend ?? 0;

        return {
          clusterId: cluster.id,
          title: cluster.nucleus,
          memberCount: memberCountMap.get(cluster.id) ?? 0,
          activeGoals: goals.slice(0, 3),
          lastActivity: lastActivityMap.get(cluster.id) ?? cluster.created_at,
          intendDensity: total > 0 ? intend / total : 0,
          hasActiveGoal: goals.length > 0,
        };
      });

      // 按 lastActivity 降序排序
      topics.sort((a, b) => new Date(b.lastActivity).getTime() - new Date(a.lastActivity).getTime());

      sendJson(res, topics);
    } catch (err: any) {
      console.error("[topics] GET /api/v1/topics error:", err);
      sendError(res, err.message ?? "Internal error", 500);
    }
  });

  // ── GET /api/v1/topics/:clusterId/lifecycle ──
  // 返回特定 cluster 的四阶段生命周期数据
  router.get("/api/v1/topics/:clusterId/lifecycle", async (_req, res, params) => {
    try {
      const clusterId = params.clusterId;

      // 验证 cluster 存在
      const cluster = await strikeRepo.findById(clusterId);
      if (!cluster || !cluster.is_cluster) {
        sendError(res, "Cluster not found", 404);
        return;
      }

      // 获取关联的所有 goals
      const allGoals = await query<Goal>(
        `SELECT * FROM goal WHERE cluster_id = $1`,
        [clusterId],
      );
      const activeGoals = allGoals.filter((g) => g.status === "active" || g.status === "progressing");
      const completedGoals = allGoals.filter((g) => g.status === "completed");

      // ── now: 今天与 cluster goals 相关的 todos ──
      const activeGoalIds = activeGoals.map((g) => g.id);
      let nowTodos: any[] = [];
      if (activeGoalIds.length > 0) {
        nowTodos = await query(
          `SELECT t.* FROM todo t
           WHERE t.goal_id = ANY($1)
             AND t.done = false
             AND (t.scheduled_start IS NULL OR t.scheduled_start::date <= CURRENT_DATE)
           ORDER BY t.priority DESC, t.created_at ASC`,
          [activeGoalIds],
        );
      }

      // ── growing: active goals 及其 todos 和完成进度 ──
      const growing: LifecycleResponse["growing"] = [];
      for (const goal of activeGoals) {
        const todos = await query(
          `SELECT * FROM todo WHERE goal_id = $1 ORDER BY created_at ASC`,
          [goal.id],
        );
        const total = todos.length;
        const done = todos.filter((t: any) => t.done).length;
        growing.push({
          goal,
          todos,
          completionPercent: total > 0 ? Math.round((done / total) * 100) : 0,
        });
      }

      // ── seeds: cluster 成员中 polarity 为 intend/perceive 且没有关联 goal 的 strikes ──
      const goalLinkedStrikeIds = activeGoalIds.length > 0
        ? await query<{ strike_id: string }>(
            `SELECT DISTINCT t.strike_id FROM todo t
             WHERE t.goal_id = ANY($1) AND t.strike_id IS NOT NULL`,
            [activeGoalIds],
          ).then((rows) => new Set(rows.map((r) => r.strike_id)))
        : new Set<string>();

      const seedStrikes = await query<StrikeEntry>(
        `SELECT s.* FROM strike s
         JOIN bond b ON b.source_strike_id = s.id
         WHERE b.target_strike_id = $1
           AND b.type = 'cluster_member'
           AND s.polarity IN ('intend', 'perceive')
           AND s.status = 'active'
         ORDER BY s.created_at DESC`,
        [clusterId],
      );
      const seeds = seedStrikes.filter((s) => !goalLinkedStrikeIds.has(s.id));

      // ── harvest: 已完成的 goals 及其 review strike ──
      const harvest: LifecycleResponse["harvest"] = [];
      for (const goal of completedGoals) {
        // 查找与该 goal 关联的 judge polarity review strike
        const reviewStrike = await queryOne<StrikeEntry>(
          `SELECT s.* FROM strike s
           JOIN bond b ON b.source_strike_id = s.id
           WHERE b.target_strike_id = $1
             AND s.polarity = 'judge'
           ORDER BY s.created_at DESC LIMIT 1`,
          [clusterId],
        );
        harvest.push({
          goal,
          reviewStrike: reviewStrike ?? null,
          completedAt: goal.updated_at,
        });
      }

      const result: LifecycleResponse = { now: nowTodos, growing, seeds, harvest };
      sendJson(res, result);
    } catch (err: any) {
      console.error("[topics] GET lifecycle error:", err);
      sendError(res, err.message ?? "Internal error", 500);
    }
  });

  // ── POST /api/v1/goals/:id/harvest ──
  // 收获：目标完成时生成一条 review Strike
  router.post("/api/v1/goals/:id/harvest", async (_req, res, params) => {
    try {
      const goalId = params.id;

      // 1. 获取目标
      const goal = await goalRepo.findById(goalId);
      if (!goal) {
        sendError(res, "Goal not found", 404);
        return;
      }

      // 2. 创建 review strike (polarity=judge)
      const reviewStrike = await strikeRepo.create({
        user_id: goal.device_id, // 使用 goal 的 device_id 作为 user_id
        nucleus: `${goal.title} 已完成`,
        polarity: "judge",
        source_type: "system",
        confidence: 1.0,
        salience: 1.0,
      });

      void writeStrikeEmbedding(reviewStrike.id, `${goal.title} 已完成`);

      // 3. 如果 goal 有 cluster_id，创建 bond 关联到 cluster
      if (goal.cluster_id) {
        await bondRepo.create({
          source_strike_id: reviewStrike.id,
          target_strike_id: goal.cluster_id,
          type: "cluster_member",
          strength: 1.0,
          created_by: "harvest",
        });
      }

      // 4. 标记目标为完成
      await goalRepo.update(goalId, { status: "completed" });

      sendJson(res, { strikeId: reviewStrike.id, nucleus: reviewStrike.nucleus });
    } catch (err: any) {
      console.error("[topics] POST harvest error:", err);
      sendError(res, err.message ?? "Internal error", 500);
    }
  });
}
