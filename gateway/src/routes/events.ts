import type { Router } from "../router.js";
import { readBody, sendJson, sendError, getUserId } from "../lib/http-helpers.js";
import { execute, query } from "../db/pool.js";
import { today } from "../lib/tz.js";

const VALID_EVENTS = new Set([
  "app_open",
  "onboarding_step",
  "onboarding_skip",
  "onboarding_complete",
]);

export function registerEventRoutes(router: Router) {
  // 事件上报
  router.post("/api/v1/events/track", async (req, res) => {
    const userId = getUserId(req);
    if (!userId) { sendError(res, "Unauthorized", 401); return; }

    const body = await readBody<{
      event: string;
      payload?: Record<string, unknown>;
      occurred_at?: string;
    }>(req);

    if (!body.event || !VALID_EVENTS.has(body.event)) {
      sendError(res, `Invalid event: ${body.event}`, 400);
      return;
    }

    await execute(
      `INSERT INTO app_event (user_id, event, payload, created_at)
       VALUES ($1, $2, $3, COALESCE($4::timestamptz, now()))`,
      [userId, body.event, JSON.stringify(body.payload ?? {}), body.occurred_at ?? null],
    );

    sendJson(res, { ok: true });
  });

  // 批量上报（离线缓存恢复）
  router.post("/api/v1/events/track-batch", async (req, res) => {
    const userId = getUserId(req);
    if (!userId) { sendError(res, "Unauthorized", 401); return; }

    const body = await readBody<{
      events: Array<{ event: string; payload?: Record<string, unknown>; occurred_at?: string }>;
    }>(req);

    if (!body.events?.length) { sendJson(res, { ok: true, count: 0 }); return; }

    let count = 0;
    for (const e of body.events.slice(0, 50)) {
      if (!VALID_EVENTS.has(e.event)) continue;
      try {
        await execute(
          `INSERT INTO app_event (user_id, event, payload, created_at)
           VALUES ($1, $2, $3, COALESCE($4::timestamptz, now()))`,
          [userId, e.event, JSON.stringify(e.payload ?? {}), e.occurred_at ?? null],
        );
        count++;
      } catch {
        // 单条失败不阻塞
      }
    }

    sendJson(res, { ok: true, count });
  });

  // 留存分析查询
  router.get("/api/v1/analytics/onboarding-retention", async (req, res) => {
    const userId = getUserId(req);
    if (!userId) { sendError(res, "Unauthorized", 401); return; }

    // 五问漏斗
    const funnelRows = await query<{ event: string; step: number | null; cnt: number }>(
      `SELECT event,
              (payload->>'step')::int AS step,
              COUNT(*)::int AS cnt
       FROM app_event
       WHERE event IN ('onboarding_step', 'onboarding_skip', 'onboarding_complete')
       GROUP BY event, (payload->>'step')`,
    );

    const stepCounts: Record<number, number> = {};
    let completed = 0;
    let skippedAll = 0;

    for (const r of funnelRows) {
      if (r.event === "onboarding_step" && r.step != null) {
        stepCounts[r.step] = (stepCounts[r.step] ?? 0) + r.cnt;
      } else if (r.event === "onboarding_complete") {
        completed += r.cnt;
      } else if (r.event === "onboarding_skip") {
        skippedAll += r.cnt;
      }
    }

    const totalUsers = await query<{ cnt: number }>(
      `SELECT COUNT(DISTINCT user_id)::int AS cnt
       FROM app_event
       WHERE event IN ('onboarding_step', 'onboarding_skip', 'onboarding_complete')`,
    );

    // 留存（D1/D3/D7/D14/D30）按五问完成状态分组
    const retentionDays = [1, 3, 7, 14, 30];
    const todayStr = today();

    const retentionData: Record<string, Record<string, number>> = {
      completed: {},
      skipped: {},
    };

    for (const d of retentionDays) {
      const key = `d${d}`;
      // 完成五问且在 D{d} 之后仍打开 app 的用户比例
      for (const status of ["completed", "skipped"] as const) {
        const eventFilter = status === "completed" ? "onboarding_complete" : "onboarding_skip";
        const rows = await query<{ rate: number }>(
          `WITH cohort AS (
             SELECT DISTINCT user_id, MIN(created_at) AS joined_at
             FROM app_event
             WHERE event = $1
             GROUP BY user_id
           ),
           retained AS (
             SELECT DISTINCT c.user_id
             FROM cohort c
             JOIN app_event e ON e.user_id = c.user_id AND e.event = 'app_open'
             WHERE e.created_at >= c.joined_at + ($2 || ' days')::interval
           )
           SELECT CASE WHEN COUNT(*) = 0 THEN 0
                       ELSE (SELECT COUNT(*) FROM retained)::float / COUNT(*)
                  END AS rate
           FROM cohort`,
          [eventFilter, String(d)],
        );
        retentionData[status][key] = Math.round((rows[0]?.rate ?? 0) * 100);
      }
    }

    sendJson(res, {
      funnel: {
        total_users: totalUsers[0]?.cnt ?? 0,
        step_counts: stepCounts,
        completed,
        skipped_all: skippedAll,
      },
      retention: retentionData,
    });
  });
}
