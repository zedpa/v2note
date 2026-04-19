/**
 * SyncStatusBanner 单元测试
 *
 * regression: fix-cold-resume-silent-loss (Phase 7 §5.2)
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, act } from "@testing-library/react";
import React from "react";

// 在 import 组件前 mock gateway-client
// 允许测试控制 ws status + 订阅回调
type StatusCb = (s: "connecting" | "open" | "closed") => void;

const mockClient = {
  _status: "closed" as "connecting" | "open" | "closed",
  _subs: new Set<StatusCb>(),
  getStatus() {
    return this._status;
  },
  onStatusChange(cb: StatusCb) {
    this._subs.add(cb);
    return () => {
      this._subs.delete(cb);
    };
  },
  /** 测试辅助：模拟 ws 状态变化 */
  __emit(s: "connecting" | "open" | "closed") {
    this._status = s;
    for (const cb of this._subs) cb(s);
  },
  /** 重置 */
  __reset() {
    this._status = "closed";
    this._subs.clear();
  },
};

vi.mock("@/features/chat/lib/gateway-client", () => ({
  getGatewayClient: () => mockClient,
}));

import { SyncStatusBanner } from "./sync-status-banner";

describe("SyncStatusBanner [regression: fix-cold-resume-silent-loss]", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    mockClient.__reset();
    // 默认 online
    Object.defineProperty(navigator, "onLine", {
      configurable: true,
      get: () => true,
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  function setOnline(v: boolean) {
    Object.defineProperty(navigator, "onLine", {
      configurable: true,
      get: () => v,
    });
  }

  it("should_hide_banner_during_first_15s_grace_period", () => {
    // 初始 ws=closed 但在 grace 期内 → 不显示
    mockClient._status = "closed";
    const { queryByTestId } = render(<SyncStatusBanner />);

    // 刚 mount，time=0
    expect(queryByTestId("sync-status-banner")).toBeNull();

    // 推进到 10s（仍在 grace 内）
    act(() => {
      vi.advanceTimersByTime(10_000);
    });
    expect(queryByTestId("sync-status-banner")).toBeNull();
  });

  it("should_show_offline_banner_when_navigator_offline", () => {
    setOnline(false);
    mockClient._status = "closed";
    const { queryByTestId } = render(<SyncStatusBanner />);

    // offline 不受 grace 约束，立即显示
    act(() => {
      // trigger one evaluate tick
      vi.advanceTimersByTime(1_000);
    });
    const el = queryByTestId("sync-status-banner");
    expect(el).not.toBeNull();
    expect(el?.getAttribute("data-state")).toBe("offline");
    expect(el?.textContent).toContain("离线");
  });

  it("should_show_ws_unavailable_banner_when_ws_not_open_for_30s_after_grace", () => {
    setOnline(true);
    mockClient._status = "closed";
    const { queryByTestId } = render(<SyncStatusBanner />);

    // 15s grace + 30s threshold = 45s 必然已过
    act(() => {
      vi.advanceTimersByTime(46_000);
    });

    const el = queryByTestId("sync-status-banner");
    expect(el).not.toBeNull();
    expect(el?.getAttribute("data-state")).toBe("ws-unavailable");
    expect(el?.textContent).toContain("同步暂不可用");
  });

  it("should_hide_banner_when_ws_becomes_open", () => {
    setOnline(true);
    mockClient._status = "closed";
    const { queryByTestId } = render(<SyncStatusBanner />);

    // 跨过 grace + 30s 阈值 → ws-unavailable
    act(() => {
      vi.advanceTimersByTime(46_000);
    });
    expect(queryByTestId("sync-status-banner")).not.toBeNull();

    // ws 变为 open → banner 消失
    act(() => {
      mockClient.__emit("open");
    });
    expect(queryByTestId("sync-status-banner")).toBeNull();
  });

  it("should_reset_grace_timer_on_visibility_resume", () => {
    setOnline(true);
    mockClient._status = "closed";
    const { queryByTestId } = render(<SyncStatusBanner />);

    // 先进入 ws-unavailable
    act(() => {
      vi.advanceTimersByTime(46_000);
    });
    expect(queryByTestId("sync-status-banner")?.getAttribute("data-state")).toBe(
      "ws-unavailable",
    );

    // 触发 visibilitychange → visible（模拟 App resume）
    Object.defineProperty(document, "visibilityState", {
      configurable: true,
      get: () => "visible",
    });
    act(() => {
      document.dispatchEvent(new Event("visibilitychange"));
    });

    // 重置 grace 后，10s 内不显示任何条
    act(() => {
      vi.advanceTimersByTime(10_000);
    });
    expect(queryByTestId("sync-status-banner")).toBeNull();
  });

  it("should_never_show_banner_when_both_online_and_ws_open", () => {
    setOnline(true);
    mockClient._status = "open";
    const { queryByTestId } = render(<SyncStatusBanner />);

    act(() => {
      vi.advanceTimersByTime(60_000);
    });
    expect(queryByTestId("sync-status-banner")).toBeNull();
  });

  it("should_show_offline_immediately_even_within_grace_period", () => {
    // offline 信号不应被 grace 屏蔽（数据本地安全，用户需要立刻知道离线）
    setOnline(false);
    mockClient._status = "closed";
    const { queryByTestId } = render(<SyncStatusBanner />);

    act(() => {
      vi.advanceTimersByTime(500); // 仍在 grace 内
    });

    const el = queryByTestId("sync-status-banner");
    expect(el).not.toBeNull();
    expect(el?.getAttribute("data-state")).toBe("offline");
  });

  it("should_transition_offline_to_hidden_when_back_online_and_ws_open", () => {
    setOnline(false);
    mockClient._status = "open";
    const { queryByTestId } = render(<SyncStatusBanner />);

    act(() => {
      vi.advanceTimersByTime(2_000);
    });
    expect(queryByTestId("sync-status-banner")?.getAttribute("data-state")).toBe(
      "offline",
    );

    // 恢复在线
    setOnline(true);
    act(() => {
      window.dispatchEvent(new Event("online"));
    });
    expect(queryByTestId("sync-status-banner")).toBeNull();
  });
});
