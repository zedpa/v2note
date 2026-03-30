import type { Router } from "../router.js";
import { readBody, sendJson, sendError, getDeviceId, getUserId } from "../lib/http-helpers.js";
import { reviewRepo, recordRepo, transcriptRepo } from "../db/repositories/index.js";
import { chatCompletion } from "../ai/provider.js";

export function registerReviewRoutes(router: Router) {
  // List reviews
  router.get("/api/v1/reviews", async (req, res) => {
    const userId = getUserId(req);
    const deviceId = getDeviceId(req);
    const reviews = userId
      ? await reviewRepo.findByUser(userId)
      : await reviewRepo.findByDevice(deviceId);
    sendJson(res, reviews);
  });

  // Generate review
  router.post("/api/v1/reviews/generate", async (req, res) => {
    try {
      const deviceId = getDeviceId(req);
      const userId = getUserId(req);
      const { period, start, end } = await readBody<{
        period: string;
        start: string;
        end: string;
      }>(req);

      // Load records and transcripts in the date range
      const records = userId
        ? await recordRepo.findByUserAndDateRange(userId, `${start}T00:00:00`, `${end}T23:59:59`)
        : await recordRepo.findByDeviceAndDateRange(deviceId, `${start}T00:00:00`, `${end}T23:59:59`);
      const recordIds = records.map((r) => r.id);
      const transcripts = recordIds.length > 0
        ? await transcriptRepo.findByRecordIds(recordIds)
        : [];

      const content = transcripts.map((t) => t.text).join("\n\n");

      let summary: string;
      try {
        const result = await chatCompletion(
          [
            {
              role: "system",
              content: `你是复盘助手。请根据用户 ${start} 到 ${end} 期间的记录内容，生成一份${period === "daily" ? "日" : period === "weekly" ? "周" : period === "monthly" ? "月" : "年"}度复盘总结。包括主要成就、待改进项、关键洞察。`,
            },
            {
              role: "user",
              content: content || "这段时间没有记录。",
            },
          ],
          { temperature: 0.5, tier: "report" },
        );
        summary = result.content;
      } catch (aiErr: any) {
        console.error(`[reviews] AI generation failed: ${aiErr.message}`);
        // Fallback：返回基本统计
        summary = `${start} 到 ${end} 期间共有 ${records.length} 条记录。AI 生成暂时不可用，请稍后重试。`;
      }

      const review = await reviewRepo.create({
        device_id: deviceId,
        user_id: userId ?? undefined,
        period,
        period_start: start,
        period_end: end,
        summary,
        stats: { record_count: records.length },
      });

      sendJson(res, review, 201);
    } catch (err: any) {
      console.error(`[reviews] Generate review error:`, err.message);
      sendError(res, "复盘生成失败，请稍后重试", 500);
    }
  });
}
