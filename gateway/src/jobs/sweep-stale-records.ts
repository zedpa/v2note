/**
 * 僵尸 record 超时清扫 — gateway/src/jobs/sweep-stale-records.ts
 *
 * spec: fix-oss-image-traffic-storm.md 场景 3、行为 3
 *
 * 场景：record.status IN ('uploading','processing') 但 updated_at 超过 30 分钟
 * 处理：UPDATE status='failed'，单条 SQL 由 PG 行锁保证多实例并发幂等
 *
 * 节拍：SWEEP_MS（默认 10 分钟）周期触发；E2E 模式下 env 压缩到秒级
 * 阈值：THRESHOLD_MS（默认 30 分钟）；E2E 模式下压缩
 */
import { query } from "../db/pool.js";

/** 默认清扫周期：10 分钟 */
const DEFAULT_SWEEP_MS = 10 * 60 * 1000;
/** 默认阈值：30 分钟 */
const DEFAULT_THRESHOLD_MS = 30 * 60 * 1000;

export function getSweepIntervalMs(): number {
  const env = Number(process.env.STALE_SWEEP_MS);
  return Number.isFinite(env) && env > 0 ? env : DEFAULT_SWEEP_MS;
}

export function getStaleThresholdMs(): number {
  const env = Number(process.env.STALE_THRESHOLD_MS);
  return Number.isFinite(env) && env > 0 ? env : DEFAULT_THRESHOLD_MS;
}

/**
 * 清扫一次。返回被置 failed 的 record 数量。
 * 纯 SQL UPDATE；多实例并发调用幂等（行已是 failed 的再次更新是 no-op）。
 */
export async function sweepStaleRecords(
  thresholdMs: number = getStaleThresholdMs(),
): Promise<{ swept: number }> {
  const seconds = Math.max(1, Math.floor(thresholdMs / 1000));
  const rows = await query(
    `UPDATE record
        SET status = 'failed', updated_at = now()
      WHERE status IN ('uploading','processing')
        AND updated_at < now() - ($1 || ' seconds')::interval
      RETURNING id`,
    [seconds],
  );
  const swept = Array.isArray(rows) ? rows.length : 0;
  if (swept > 0) {
    console.log(`[sweep-stale-records] swept ${swept} stale records (threshold=${seconds}s)`);
  }
  return { swept };
}

let timer: NodeJS.Timeout | null = null;

/** 启动周期性清扫任务。多次调用会替换上一个 timer。 */
export function startStaleRecordSweeper(): void {
  if (timer) clearInterval(timer);
  const intervalMs = getSweepIntervalMs();
  // 启动时立即执行一次，随后按 interval 周期触发
  sweepStaleRecords().catch((e) =>
    console.warn(`[sweep-stale-records] initial sweep error: ${e.message}`),
  );
  timer = setInterval(() => {
    sweepStaleRecords().catch((e) =>
      console.warn(`[sweep-stale-records] periodic sweep error: ${e.message}`),
    );
  }, intervalMs);
  // 让进程能正常退出
  if (typeof timer.unref === "function") timer.unref();
  console.log(`[sweep-stale-records] scheduler started: every ${intervalMs}ms`);
}

/** 停止（主要供测试使用） */
export function stopStaleRecordSweeper(): void {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
}
