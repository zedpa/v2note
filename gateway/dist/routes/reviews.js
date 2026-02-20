import { readBody, sendJson, getDeviceId } from "../lib/http-helpers.js";
import { reviewRepo, recordRepo, transcriptRepo } from "../db/repositories/index.js";
import { chatCompletion } from "../ai/provider.js";
export function registerReviewRoutes(router) {
    // List reviews
    router.get("/api/v1/reviews", async (req, res) => {
        const deviceId = getDeviceId(req);
        const reviews = await reviewRepo.findByDevice(deviceId);
        sendJson(res, reviews);
    });
    // Generate review
    router.post("/api/v1/reviews/generate", async (req, res) => {
        const deviceId = getDeviceId(req);
        const { period, start, end } = await readBody(req);
        // Load records and transcripts in the date range
        const records = await recordRepo.findByDeviceAndDateRange(deviceId, `${start}T00:00:00`, `${end}T23:59:59`);
        const recordIds = records.map((r) => r.id);
        const transcripts = recordIds.length > 0
            ? await transcriptRepo.findByRecordIds(recordIds)
            : [];
        const content = transcripts.map((t) => t.text).join("\n\n");
        const result = await chatCompletion([
            {
                role: "system",
                content: `你是复盘助手。请根据用户 ${start} 到 ${end} 期间的记录内容，生成一份${period === "daily" ? "日" : period === "weekly" ? "周" : period === "monthly" ? "月" : "年"}度复盘总结。包括主要成就、待改进项、关键洞察。`,
            },
            {
                role: "user",
                content: content || "这段时间没有记录。",
            },
        ], { temperature: 0.5 });
        const review = await reviewRepo.create({
            device_id: deviceId,
            period,
            period_start: start,
            period_end: end,
            summary: result.content,
            stats: { record_count: records.length },
        });
        sendJson(res, review, 201);
    });
}
//# sourceMappingURL=reviews.js.map