/**
 * 僵尸清扫单元测试
 *
 * regression: fix-oss-image-traffic-storm
 * 锚点：spec 场景 3、行为 3 —— 30 分钟阈值 + 并发幂等
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

// mock pool.query
let queryMock: ReturnType<typeof vi.fn>;
vi.mock("../db/pool.js", () => ({
  query: (...args: unknown[]) => (queryMock as any)(...args),
}));

describe("sweepStaleRecords [regression: fix-oss-image-traffic-storm]", () => {
  beforeEach(() => {
    queryMock = vi.fn();
    delete process.env.STALE_THRESHOLD_MS;
    delete process.env.STALE_SWEEP_MS;
  });

  it("should_return_swept_count_matching_returning_rows", async () => {
    queryMock.mockResolvedValue([{ id: "r1" }, { id: "r2" }, { id: "r3" }]);
    const { sweepStaleRecords } = await import("./sweep-stale-records.js");
    const result = await sweepStaleRecords();
    expect(result.swept).toBe(3);
  });

  it("should_pass_threshold_seconds_as_interval", async () => {
    queryMock.mockResolvedValue([]);
    const { sweepStaleRecords } = await import("./sweep-stale-records.js");
    await sweepStaleRecords(30 * 60 * 1000); // 30 min
    const [, params] = queryMock.mock.calls[0];
    expect(params).toEqual([1800]); // 30*60 = 1800 s
  });

  it("should_return_zero_when_no_stale_records", async () => {
    queryMock.mockResolvedValue([]);
    const { sweepStaleRecords } = await import("./sweep-stale-records.js");
    const result = await sweepStaleRecords();
    expect(result.swept).toBe(0);
  });

  it("should_be_idempotent_across_concurrent_calls", async () => {
    // 第一次返回行，第二次空（第一次已 UPDATE）
    queryMock
      .mockResolvedValueOnce([{ id: "r1" }, { id: "r2" }])
      .mockResolvedValueOnce([]);
    const { sweepStaleRecords } = await import("./sweep-stale-records.js");
    const [a, b] = await Promise.all([sweepStaleRecords(), sweepStaleRecords()]);
    expect(a.swept + b.swept).toBe(2);
  });

  it("should_read_threshold_from_env_when_provided", async () => {
    process.env.STALE_THRESHOLD_MS = "5000"; // 5s
    vi.resetModules();
    queryMock.mockResolvedValue([]);
    const { sweepStaleRecords, getStaleThresholdMs } = await import(
      "./sweep-stale-records.js"
    );
    expect(getStaleThresholdMs()).toBe(5000);
    await sweepStaleRecords();
    const [, params] = queryMock.mock.calls[0];
    expect(params).toEqual([5]);
  });
});
