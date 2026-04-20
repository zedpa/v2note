/**
 * use-notes 轮询行为单元测试
 *
 * regression: fix-oss-image-traffic-storm
 * 锚点：spec 场景 4/5/6、行为 4/5
 *   - 达到 MAX_POLL_ROUNDS 后停止
 *   - 页面 hidden 跳过本轮、visible 重置计数并立即拉
 *   - 下拉刷新重置计数 + 恢复暂停态
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";

// Mock 所有 useNotes 的外部依赖
vi.mock("@/shared/lib/device", () => ({
  getDeviceId: vi.fn(async () => "dev-1"),
}));
vi.mock("@/features/recording/lib/events", () => ({
  on: vi.fn(() => () => {}),
}));
vi.mock("@/shared/lib/fab-notify", () => ({
  fabNotify: { info: vi.fn(), error: vi.fn() },
}));
vi.mock("@/features/workspace/lib/cache", () => ({
  getCachedNotes: vi.fn(async () => null),
  setCachedNotes: vi.fn(),
}));
vi.mock("@/shared/lib/api/records", () => ({
  listRecords: vi.fn(),
  deleteRecords: vi.fn(),
  updateRecord: vi.fn(),
}));

import { listRecords } from "@/shared/lib/api/records";

// 压缩时长：1s 一轮，最多 5 轮 (5s)
process.env.NEXT_PUBLIC_POLL_INTERVAL_MS = "100";
process.env.NEXT_PUBLIC_POLL_MAX_MS = "500";

describe("useNotes polling [regression: fix-oss-image-traffic-storm]", () => {
  let visibilityState: "visible" | "hidden" = "visible";

  beforeEach(() => {
    // 使用真实计时器 + 压缩的 env 间隔（100ms/500ms），避开 fake timer 与 waitFor 冲突
    vi.resetModules();
    (listRecords as any).mockReset();
    visibilityState = "visible";
    Object.defineProperty(document, "visibilityState", {
      configurable: true,
      get: () => visibilityState,
    });
  });

  const recordWith = (status: string) => ({
    id: `r-${Math.random()}`,
    status,
    source: "voice",
    source_type: "think",
    transcript: { text: "" },
    created_at: new Date().toISOString(),
  });

  const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

  it("should_stop_polling_after_max_rounds_and_pause", async () => {
    (listRecords as any).mockResolvedValue([recordWith("uploading")]);

    const { useNotes } = await import("./use-notes");
    const { result } = renderHook(() => useNotes());

    await waitFor(() => expect(result.current.loading).toBe(false));

    // POLL_INTERVAL=100ms, POLL_MAX_MS=500 → MAX_ROUNDS=5
    // 等足够长时间触发超过上限
    await waitFor(
      () => expect(result.current.autoRefreshPaused).toBe(true),
      { timeout: 3000, interval: 50 },
    );
  }, 8000);

  it("should_skip_polling_when_document_hidden", async () => {
    (listRecords as any).mockResolvedValue([recordWith("uploading")]);
    const { useNotes } = await import("./use-notes");
    renderHook(() => useNotes());

    await waitFor(() =>
      expect((listRecords as any).mock.calls.length).toBeGreaterThan(0),
    );

    visibilityState = "hidden";
    const before = (listRecords as any).mock.calls.length;

    // 停留 300ms（>= 3 轮 100ms）期间不应有新请求
    await sleep(300);

    const after = (listRecords as any).mock.calls.length;
    expect(after).toBe(before);
  }, 8000);

  it("should_reset_and_refetch_when_becomes_visible", async () => {
    (listRecords as any).mockResolvedValue([recordWith("uploading")]);
    const { useNotes } = await import("./use-notes");
    renderHook(() => useNotes());

    await waitFor(() =>
      expect((listRecords as any).mock.calls.length).toBeGreaterThan(0),
    );

    visibilityState = "hidden";
    await sleep(300);
    const before = (listRecords as any).mock.calls.length;

    visibilityState = "visible";
    await act(async () => {
      document.dispatchEvent(new Event("visibilitychange"));
      await Promise.resolve();
    });

    await waitFor(
      () =>
        expect(
          (listRecords as any).mock.calls.length,
        ).toBeGreaterThan(before),
      { timeout: 2000 },
    );
  }, 8000);

  it("should_not_poll_when_no_processing_records", async () => {
    // 场景 6：无 uploading/processing 记录时，只做初始 fetch，不启动轮询
    (listRecords as any).mockResolvedValue([recordWith("completed")]);
    const { useNotes } = await import("./use-notes");
    const { result } = renderHook(() => useNotes());

    await waitFor(() => expect(result.current.loading).toBe(false));

    const callsAfterInit = (listRecords as any).mock.calls.length;

    // 等待足够长时间（>= 3 个轮询周期），不应有额外请求
    await sleep(350);
    const callsAfterWait = (listRecords as any).mock.calls.length;
    expect(callsAfterWait).toBe(callsAfterInit);
    expect(result.current.autoRefreshPaused).toBe(false);
  }, 8000);

  it("should_reset_pause_when_refresh_is_called", async () => {
    (listRecords as any).mockResolvedValue([recordWith("uploading")]);
    const { useNotes } = await import("./use-notes");
    const { result } = renderHook(() => useNotes());

    await waitFor(() => expect(result.current.loading).toBe(false));

    // 等到进入暂停状态
    await waitFor(
      () => expect(result.current.autoRefreshPaused).toBe(true),
      { timeout: 3000, interval: 50 },
    );

    // 下拉刷新 → 应恢复
    await act(async () => {
      await result.current.refresh();
    });
    expect(result.current.autoRefreshPaused).toBe(false);
  }, 8000);
});
