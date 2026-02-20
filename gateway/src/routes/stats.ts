import type { Router } from "../router.js";
import { sendJson, getDeviceId } from "../lib/http-helpers.js";
import { recordRepo, todoRepo, subscriptionRepo } from "../db/repositories/index.js";
import { query } from "../db/pool.js";

export function registerStatsRoutes(router: Router) {
  // Week stats
  router.get("/api/v1/stats/week", async (req, res) => {
    const deviceId = getDeviceId(req);
    const now = new Date();
    const dayOfWeek = now.getDay();
    const monday = new Date(now);
    monday.setDate(now.getDate() - (dayOfWeek === 0 ? 6 : dayOfWeek - 1));
    monday.setHours(0, 0, 0, 0);
    const sunday = new Date(monday);
    sunday.setDate(monday.getDate() + 6);
    sunday.setHours(23, 59, 59, 999);

    const [recordCount, todoStats] = await Promise.all([
      recordRepo.countByDateRange(deviceId, monday.toISOString(), sunday.toISOString()),
      todoRepo.countByDateRange(deviceId, monday.toISOString(), sunday.toISOString()),
    ]);

    sendJson(res, {
      recordCount,
      todoTotal: todoStats.total,
      todoDone: todoStats.done,
    });
  });

  // Usage stats
  router.get("/api/v1/stats/usage", async (req, res) => {
    const deviceId = getDeviceId(req);
    const stats = await subscriptionRepo.getUsageStats(deviceId);
    sendJson(res, {
      monthlyCount: stats.monthly_count,
      limit: stats.limit,
    });
  });

  // Daily trend: last 30 days record counts
  router.get("/api/v1/stats/daily-trend", async (req, res) => {
    const deviceId = getDeviceId(req);
    const rows = await query<{ date: string; count: string }>(
      `SELECT DATE(created_at)::text AS date, COUNT(*)::text AS count
       FROM record
       WHERE device_id = $1 AND created_at >= NOW() - INTERVAL '30 days'
       GROUP BY DATE(created_at)
       ORDER BY date ASC`,
      [deviceId],
    );
    sendJson(res, rows.map((r) => ({ date: r.date, count: parseInt(r.count, 10) })));
  });

  // Tag distribution: top tags by usage
  router.get("/api/v1/stats/tag-distribution", async (req, res) => {
    const deviceId = getDeviceId(req);
    const rows = await query<{ name: string; count: string }>(
      `SELECT t.name, COUNT(*)::text AS count
       FROM record_tag rt
       JOIN tag t ON t.id = rt.tag_id
       JOIN record r ON r.id = rt.record_id
       WHERE r.device_id = $1
       GROUP BY t.name
       ORDER BY COUNT(*) DESC
       LIMIT 10`,
      [deviceId],
    );
    sendJson(res, rows.map((r) => ({ name: r.name, count: parseInt(r.count, 10) })));
  });

  // Todo trend: last 30 days created vs completed
  router.get("/api/v1/stats/todo-trend", async (req, res) => {
    const deviceId = getDeviceId(req);
    const rows = await query<{ date: string; created: string; completed: string }>(
      `SELECT d.date::text,
              COALESCE(c.created, 0)::text AS created,
              COALESCE(co.completed, 0)::text AS completed
       FROM generate_series(
         (NOW() - INTERVAL '30 days')::date,
         NOW()::date,
         '1 day'::interval
       ) AS d(date)
       LEFT JOIN (
         SELECT DATE(t.created_at) AS date, COUNT(*) AS created
         FROM todo t
         JOIN record r ON r.id = t.record_id
         WHERE r.device_id = $1 AND t.created_at >= NOW() - INTERVAL '30 days'
         GROUP BY DATE(t.created_at)
       ) c ON c.date = d.date
       LEFT JOIN (
         SELECT DATE(t.created_at) AS date, COUNT(*) AS completed
         FROM todo t
         JOIN record r ON r.id = t.record_id
         WHERE r.device_id = $1 AND t.done = true AND t.created_at >= NOW() - INTERVAL '30 days'
         GROUP BY DATE(t.created_at)
       ) co ON co.date = d.date
       ORDER BY d.date ASC`,
      [deviceId],
    );
    sendJson(res, rows.map((r) => ({
      date: r.date,
      created: parseInt(r.created, 10),
      completed: parseInt(r.completed, 10),
    })));
  });
}
