import { sendJson, getDeviceId, getUserId } from "../lib/http-helpers.js";
import { recordRepo, todoRepo, subscriptionRepo } from "../db/repositories/index.js";
import { query } from "../db/pool.js";
import { weekRange, dayRange } from "../lib/tz.js";
export function registerStatsRoutes(router) {
    // Week stats
    router.get("/api/v1/stats/week", async (req, res) => {
        const deviceId = getDeviceId(req);
        const userId = getUserId(req);
        const week = weekRange();
        const mondayRange = dayRange(week.start);
        const sundayRange = dayRange(week.end);
        const weekStart = mondayRange.start; // UTC ISO: Monday 00:00 Asia/Shanghai
        const weekEnd = sundayRange.end; // UTC ISO: Sunday 23:59 Asia/Shanghai
        const [recordCount, todoStats] = userId
            ? await Promise.all([
                recordRepo.countByUserDateRange(userId, weekStart, weekEnd),
                todoRepo.countByUserDateRange(userId, weekStart, weekEnd),
            ])
            : await Promise.all([
                recordRepo.countByDateRange(deviceId, weekStart, weekEnd),
                todoRepo.countByDateRange(deviceId, weekStart, weekEnd),
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
        const userId = getUserId(req);
        const stats = userId
            ? await subscriptionRepo.getUsageStatsByUser(userId)
            : await subscriptionRepo.getUsageStats(deviceId);
        sendJson(res, {
            monthlyCount: stats.monthly_count,
            limit: stats.limit,
        });
    });
    // Daily trend: last 30 days record counts
    router.get("/api/v1/stats/daily-trend", async (req, res) => {
        const deviceId = getDeviceId(req);
        const userId = getUserId(req);
        const idCol = userId ? "user_id" : "device_id";
        const idVal = userId ?? deviceId;
        const rows = await query(`SELECT DATE(created_at)::text AS date, COUNT(*)::text AS count
       FROM record
       WHERE ${idCol} = $1 AND created_at >= NOW() - INTERVAL '30 days'
       GROUP BY DATE(created_at)
       ORDER BY date ASC`, [idVal]);
        sendJson(res, rows.map((r) => ({ date: r.date, count: parseInt(r.count, 10) })));
    });
    // Tag distribution: top tags by usage
    router.get("/api/v1/stats/tag-distribution", async (req, res) => {
        const deviceId = getDeviceId(req);
        const userId = getUserId(req);
        const idCol = userId ? "r.user_id" : "r.device_id";
        const idVal = userId ?? deviceId;
        const rows = await query(`SELECT t.name, COUNT(*)::text AS count
       FROM record_tag rt
       JOIN tag t ON t.id = rt.tag_id
       JOIN record r ON r.id = rt.record_id
       WHERE ${idCol} = $1
       GROUP BY t.name
       ORDER BY COUNT(*) DESC
       LIMIT 10`, [idVal]);
        sendJson(res, rows.map((r) => ({ name: r.name, count: parseInt(r.count, 10) })));
    });
    // Todo trend: last 30 days created vs completed
    router.get("/api/v1/stats/todo-trend", async (req, res) => {
        const deviceId = getDeviceId(req);
        const userId = getUserId(req);
        const idCol = userId ? "r.user_id" : "r.device_id";
        const idVal = userId ?? deviceId;
        const rows = await query(`SELECT d.date::text,
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
         WHERE ${idCol} = $1 AND t.created_at >= NOW() - INTERVAL '30 days'
         GROUP BY DATE(t.created_at)
       ) c ON c.date = d.date
       LEFT JOIN (
         SELECT DATE(t.created_at) AS date, COUNT(*) AS completed
         FROM todo t
         JOIN record r ON r.id = t.record_id
         WHERE ${idCol} = $1 AND t.done = true AND t.created_at >= NOW() - INTERVAL '30 days'
         GROUP BY DATE(t.created_at)
       ) co ON co.date = d.date
       ORDER BY d.date ASC`, [idVal]);
        sendJson(res, rows.map((r) => ({
            date: r.date,
            created: parseInt(r.created, 10),
            completed: parseInt(r.completed, 10),
        })));
    });
}
//# sourceMappingURL=stats.js.map