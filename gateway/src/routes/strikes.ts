import type { Router } from "../router.js";
import { readBody, sendJson, getUserId } from "../lib/http-helpers.js";
import { strikeRepo, strikeTagRepo } from "../db/repositories/index.js";

export function registerStrikeRoutes(router: Router) {
  // GET /api/v1/records/:id/strikes — 获取某条记录的 Strike 列表
  router.get("/api/v1/records/:id/strikes", async (_req, _res, params) => {
    const strikes = await strikeRepo.findBySource(params.id);
    // Batch load tags for each strike
    const results = await Promise.all(
      strikes.map(async (s) => {
        const tags = await strikeTagRepo.findByStrike(s.id);
        return {
          id: s.id,
          nucleus: s.nucleus,
          polarity: s.polarity,
          confidence: s.confidence,
          tags: tags.map((t) => t.label),
          created_at: s.created_at,
        };
      }),
    );
    sendJson(_res, results);
  });

  // PATCH /api/v1/strikes/:id — 修改 Strike（nucleus / polarity）
  router.patch("/api/v1/strikes/:id", async (req, res, params) => {
    const body = await readBody<{ nucleus?: string; polarity?: string }>(req);

    const fields: { nucleus?: string; polarity?: string } = {};
    if (body.nucleus !== undefined) fields.nucleus = body.nucleus;
    if (body.polarity !== undefined) fields.polarity = body.polarity;

    if (Object.keys(fields).length === 0) {
      sendJson(res, { ok: true });
      return;
    }

    await strikeRepo.update(params.id, fields);

    // 修改后将该 strike 相关 tag 的 created_by 标记为 'user'
    const tags = await strikeTagRepo.findByStrike(params.id);
    for (const tag of tags) {
      await strikeTagRepo.updateCreatedBy(tag.id, "user");
    }

    sendJson(res, { ok: true });
  });
}
