/**
 * 测试辅助路由 — gateway/src/routes/test-helpers.ts
 *
 * spec: fix-oss-image-traffic-storm.md 行为 3/4/5（E2E 需要预置僵尸 record）
 *
 * ⚠️ 仅在 ENABLE_E2E_HELPERS=1 时注册；生产部署必须留空。
 */
import type { Router } from "../router.js";
import { readBody, sendJson, sendError, getUserId } from "../lib/http-helpers.js";
import { query } from "../db/pool.js";

export function registerTestHelperRoutes(router: Router): void {
  if (process.env.ENABLE_E2E_HELPERS !== "1") return;

  console.warn(
    "[test-helpers] ENABLE_E2E_HELPERS=1 — 测试辅助接口已注册（禁止生产启用）",
  );

  /**
   * POST /api/v1/test/seed-stale-record
   * body: { status: 'uploading'|'processing', updated_at_offset_ms: number }
   * 返回：201 { id }
   */
  router.post("/api/v1/test/seed-stale-record", async (req, res) => {
    const userId = getUserId(req);
    if (!userId) {
      sendError(res, "Unauthorized", 401);
      return;
    }
    const body = await readBody<{
      status?: string;
      updated_at_offset_ms?: number;
    }>(req);
    const status = body?.status === "processing" ? "processing" : "uploading";
    const offsetMs = Number(body?.updated_at_offset_ms ?? -10_000);
    // 直接用 pg interval 偏移 updated_at
    const seconds = Math.floor(offsetMs / 1000);
    const rows = await query<{ id: string }>(
      `INSERT INTO record (user_id, source, status, created_at, updated_at)
         VALUES ($1, 'image', $2, now(), now() + ($3 || ' seconds')::interval)
       RETURNING id`,
      [userId, status, seconds],
    );
    const id = rows[0]?.id;
    if (!id) {
      sendError(res, "failed to seed", 500);
      return;
    }
    sendJson(res, { id }, 201);
  });
}
