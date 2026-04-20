-- Migration: backfill stale uploading/processing records
-- spec: fix-oss-image-traffic-storm.md Phase 0
--
-- 背景：前端每 5 秒轮询，终止条件依赖"没有 uploading/processing"。
-- 历史上有 16 条僵尸 record 从未终结 —— 最老的 2026-03-31 起就卡在 uploading。
-- 导致所有已登录用户一直高频拉取 + OSS 图片被反复下载。
--
-- 本 migration 一次性把这些僵尸全部置 failed（updated_at 早于 30 分钟即判定）。
-- 后续由 gateway/src/jobs/sweep-stale-records.ts 周期性清扫。

UPDATE record
   SET status = 'failed',
       updated_at = now()
 WHERE status IN ('uploading', 'processing')
   AND updated_at < now() - INTERVAL '30 minutes';
