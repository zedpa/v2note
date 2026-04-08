/**
 * usePullToRefresh hook 单元测试
 * 对应 spec: app-mobile-views.md 场景 3.1b-3.1f
 *
 * 注意：hook 内部通过 useEffect 绑定 touch 事件到 scrollRef 元素，
 * 因此测试通过 dispatchEvent 在真实 DOM 元素上触发事件。
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { usePullToRefresh } from "./use-pull-to-refresh";

// Mock haptics
vi.mock("@/shared/lib/haptics", () => ({
  hapticsImpactLight: vi.fn(),
}));

// Mock fabNotify
vi.mock("@/shared/lib/fab-notify", () => ({
  fabNotify: Object.assign(vi.fn(), {
    error: vi.fn(),
    success: vi.fn(),
    info: vi.fn(),
  }),
}));

/** 创建模拟 touch event（jsdom 不支持 TouchEvent 构造器） */
function fireTouchEvent(el: HTMLElement, type: string, clientX: number, clientY: number) {
  const event = new Event(type, { bubbles: true, cancelable: true }) as any;
  const touch = { clientX, clientY, identifier: 1, target: el };
  event.touches = type === "touchend" ? [] : [touch];
  event.changedTouches = [touch];
  event.preventDefault = vi.fn();
  el.dispatchEvent(event);
  return event;
}

/** 创建带 scrollTop 的真实 DOM 元素 */
function makeScrollEl(scrollTop = 0) {
  const el = document.createElement("div");
  Object.defineProperty(el, "scrollTop", { value: scrollTop, writable: true, configurable: true });
  document.body.appendChild(el);
  return el;
}

describe("usePullToRefresh", () => {
  let el: HTMLElement;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.useRealTimers();
    if (el?.parentNode) el.parentNode.removeChild(el);
  });

  // ── 场景 3.1b: 基本下拉刷新 ──

  describe("场景 3.1b: 下拉刷新触发", () => {
    it("should_trigger_refresh_when_pulled_past_threshold_at_scroll_top", async () => {
      const onRefresh = vi.fn().mockResolvedValue(true);
      el = makeScrollEl(0);
      const scrollRef = { current: el };

      const { result } = renderHook(() =>
        usePullToRefresh({ onRefresh, scrollRef }),
      );

      // 等待 useEffect 绑定事件
      await act(async () => {});

      act(() => fireTouchEvent(el, "touchstart", 100, 0));
      act(() => fireTouchEvent(el, "touchmove", 100, 170)); // 170*0.4=68 >= 64
      act(() => fireTouchEvent(el, "touchend", 100, 170));

      expect(onRefresh).toHaveBeenCalledTimes(1);
      expect(result.current.isRefreshing).toBe(true);
    });

    it("should_not_trigger_refresh_when_pulled_below_threshold", async () => {
      const onRefresh = vi.fn().mockResolvedValue(true);
      el = makeScrollEl(0);
      const scrollRef = { current: el };

      const { result } = renderHook(() =>
        usePullToRefresh({ onRefresh, scrollRef }),
      );
      await act(async () => {});

      act(() => fireTouchEvent(el, "touchstart", 100, 0));
      act(() => fireTouchEvent(el, "touchmove", 100, 100)); // 100*0.4=40 < 64
      act(() => fireTouchEvent(el, "touchend", 100, 100));

      expect(onRefresh).not.toHaveBeenCalled();
      expect(result.current.isRefreshing).toBe(false);
      expect(result.current.pullDistance).toBe(0);
    });

    it("should_show_indicator_for_minimum_500ms_even_if_refresh_fast", async () => {
      const onRefresh = vi.fn().mockResolvedValue(true);
      el = makeScrollEl(0);
      const scrollRef = { current: el };

      const { result } = renderHook(() =>
        usePullToRefresh({ onRefresh, scrollRef }),
      );
      await act(async () => {});

      act(() => fireTouchEvent(el, "touchstart", 100, 0));
      act(() => fireTouchEvent(el, "touchmove", 100, 200));
      act(() => fireTouchEvent(el, "touchend", 100, 200));

      expect(result.current.isRefreshing).toBe(true);

      // 200ms 后仍在刷新
      await act(async () => { vi.advanceTimersByTime(200); });
      expect(result.current.isRefreshing).toBe(true);

      // 500ms 后完成
      await act(async () => { vi.advanceTimersByTime(300); });
      expect(result.current.isRefreshing).toBe(false);
    });

    it("should_reset_pull_distance_after_refresh_complete", async () => {
      const onRefresh = vi.fn().mockResolvedValue(true);
      el = makeScrollEl(0);
      const scrollRef = { current: el };

      const { result } = renderHook(() =>
        usePullToRefresh({ onRefresh, scrollRef }),
      );
      await act(async () => {});

      act(() => fireTouchEvent(el, "touchstart", 100, 0));
      act(() => fireTouchEvent(el, "touchmove", 100, 200));
      act(() => fireTouchEvent(el, "touchend", 100, 200));

      await act(async () => { vi.advanceTimersByTime(600); });

      expect(result.current.pullDistance).toBe(0);
      expect(result.current.isRefreshing).toBe(false);
    });
  });

  // ── 场景 3.1c: 拖拽反馈 ──

  describe("场景 3.1c: 拖拽反馈", () => {
    it("should_apply_damping_factor_to_pull_distance", async () => {
      const onRefresh = vi.fn().mockResolvedValue(true);
      el = makeScrollEl(0);
      const scrollRef = { current: el };

      const { result } = renderHook(() =>
        usePullToRefresh({ onRefresh, scrollRef, dampingFactor: 0.4 }),
      );
      await act(async () => {});

      act(() => fireTouchEvent(el, "touchstart", 100, 0));
      act(() => fireTouchEvent(el, "touchmove", 100, 100)); // 100*0.4=40

      expect(result.current.pullDistance).toBe(40);
    });

    it("should_set_isReady_true_when_exceeding_threshold", async () => {
      const onRefresh = vi.fn().mockResolvedValue(true);
      el = makeScrollEl(0);
      const scrollRef = { current: el };

      const { result } = renderHook(() =>
        usePullToRefresh({ onRefresh, scrollRef }),
      );
      await act(async () => {});

      act(() => fireTouchEvent(el, "touchstart", 100, 0));
      act(() => fireTouchEvent(el, "touchmove", 100, 100));
      expect(result.current.isReady).toBe(false);

      act(() => fireTouchEvent(el, "touchmove", 100, 170)); // 170*0.4=68 >= 64
      expect(result.current.isReady).toBe(true);
    });

    it("should_trigger_haptic_when_crossing_threshold", async () => {
      const { hapticsImpactLight } = await import("@/shared/lib/haptics");
      const onRefresh = vi.fn().mockResolvedValue(true);
      el = makeScrollEl(0);
      const scrollRef = { current: el };

      renderHook(() => usePullToRefresh({ onRefresh, scrollRef }));
      await act(async () => {});

      act(() => fireTouchEvent(el, "touchstart", 100, 0));
      act(() => fireTouchEvent(el, "touchmove", 100, 100));
      expect(hapticsImpactLight).not.toHaveBeenCalled();

      act(() => fireTouchEvent(el, "touchmove", 100, 170));
      expect(hapticsImpactLight).toHaveBeenCalledTimes(1);
    });

    it("should_not_trigger_haptic_repeatedly_during_same_pull", async () => {
      const { hapticsImpactLight } = await import("@/shared/lib/haptics");
      const onRefresh = vi.fn().mockResolvedValue(true);
      el = makeScrollEl(0);
      const scrollRef = { current: el };

      renderHook(() => usePullToRefresh({ onRefresh, scrollRef }));
      await act(async () => {});

      act(() => fireTouchEvent(el, "touchstart", 100, 0));
      act(() => fireTouchEvent(el, "touchmove", 100, 170));
      act(() => fireTouchEvent(el, "touchmove", 100, 200));
      act(() => fireTouchEvent(el, "touchmove", 100, 250));

      expect(hapticsImpactLight).toHaveBeenCalledTimes(1);
    });

    it("should_reset_when_released_below_threshold", async () => {
      const onRefresh = vi.fn().mockResolvedValue(true);
      el = makeScrollEl(0);
      const scrollRef = { current: el };

      const { result } = renderHook(() =>
        usePullToRefresh({ onRefresh, scrollRef }),
      );
      await act(async () => {});

      act(() => fireTouchEvent(el, "touchstart", 100, 0));
      act(() => fireTouchEvent(el, "touchmove", 100, 50));
      act(() => fireTouchEvent(el, "touchend", 100, 50));

      expect(result.current.pullDistance).toBe(0);
      expect(onRefresh).not.toHaveBeenCalled();
    });
  });

  // ── 场景 3.1d: 非顶部滚动不触发 ──

  describe("场景 3.1d: 非顶部滚动不触发", () => {
    it("should_not_trigger_when_scrollTop_greater_than_zero", async () => {
      const onRefresh = vi.fn().mockResolvedValue(true);
      el = makeScrollEl(100);
      const scrollRef = { current: el };

      const { result } = renderHook(() =>
        usePullToRefresh({ onRefresh, scrollRef }),
      );
      await act(async () => {});

      act(() => fireTouchEvent(el, "touchstart", 100, 0));
      act(() => fireTouchEvent(el, "touchmove", 100, 200));

      expect(result.current.pullDistance).toBe(0);
    });

    it("should_stop_tracking_if_scrollTop_changes_during_move", async () => {
      const onRefresh = vi.fn().mockResolvedValue(true);
      el = makeScrollEl(0);
      const scrollRef = { current: el };

      const { result } = renderHook(() =>
        usePullToRefresh({ onRefresh, scrollRef }),
      );
      await act(async () => {});

      act(() => fireTouchEvent(el, "touchstart", 100, 0));
      act(() => fireTouchEvent(el, "touchmove", 100, 50));

      // 模拟滚动发生
      Object.defineProperty(el, "scrollTop", { value: 10, writable: true, configurable: true });

      act(() => fireTouchEvent(el, "touchmove", 100, 200));
      expect(result.current.pullDistance).toBe(0);
    });
  });

  // ── 场景 3.1e: 刷新失败 ──

  describe("场景 3.1e: 刷新失败", () => {
    it("should_show_error_toast_when_refresh_returns_false", async () => {
      const { fabNotify } = await import("@/shared/lib/fab-notify");
      const onRefresh = vi.fn().mockResolvedValue(false); // 返回 false 表示失败
      el = makeScrollEl(0);
      const scrollRef = { current: el };

      const { result } = renderHook(() =>
        usePullToRefresh({ onRefresh, scrollRef }),
      );
      await act(async () => {});

      act(() => fireTouchEvent(el, "touchstart", 100, 0));
      act(() => fireTouchEvent(el, "touchmove", 100, 200));
      act(() => fireTouchEvent(el, "touchend", 100, 200));

      await act(async () => { vi.advanceTimersByTime(600); });

      expect(fabNotify.error).toHaveBeenCalledWith("刷新失败，请检查网络");
      expect(result.current.isRefreshing).toBe(false);
    });

    it("should_show_error_toast_when_refresh_throws", async () => {
      const { fabNotify } = await import("@/shared/lib/fab-notify");
      const onRefresh = vi.fn().mockRejectedValue(new Error("Network error"));
      el = makeScrollEl(0);
      const scrollRef = { current: el };

      const { result } = renderHook(() =>
        usePullToRefresh({ onRefresh, scrollRef }),
      );
      await act(async () => {});

      act(() => fireTouchEvent(el, "touchstart", 100, 0));
      act(() => fireTouchEvent(el, "touchmove", 100, 200));
      act(() => fireTouchEvent(el, "touchend", 100, 200));

      await act(async () => { vi.advanceTimersByTime(600); });

      expect(fabNotify.error).toHaveBeenCalledWith("刷新失败，请检查网络");
      expect(result.current.isRefreshing).toBe(false);
      expect(result.current.pullDistance).toBe(0);
    });

    it("should_timeout_after_10_seconds", async () => {
      const { fabNotify } = await import("@/shared/lib/fab-notify");
      const onRefresh = vi.fn().mockReturnValue(new Promise(() => {})); // 永不 resolve
      el = makeScrollEl(0);
      const scrollRef = { current: el };

      const { result } = renderHook(() =>
        usePullToRefresh({ onRefresh, scrollRef }),
      );
      await act(async () => {});

      act(() => fireTouchEvent(el, "touchstart", 100, 0));
      act(() => fireTouchEvent(el, "touchmove", 100, 200));
      act(() => fireTouchEvent(el, "touchend", 100, 200));

      expect(result.current.isRefreshing).toBe(true);

      await act(async () => { vi.advanceTimersByTime(10_000); });

      expect(fabNotify.error).toHaveBeenCalledWith("刷新失败，请检查网络");
      expect(result.current.isRefreshing).toBe(false);
    });
  });

  // ── 场景 3.1f: 防重复触发 ──

  describe("场景 3.1f: 防重复触发", () => {
    it("should_ignore_pull_when_already_refreshing", async () => {
      const onRefresh = vi.fn().mockReturnValue(new Promise(() => {}));
      el = makeScrollEl(0);
      const scrollRef = { current: el };

      const { result } = renderHook(() =>
        usePullToRefresh({ onRefresh, scrollRef }),
      );
      await act(async () => {});

      // 第一次下拉
      act(() => fireTouchEvent(el, "touchstart", 100, 0));
      act(() => fireTouchEvent(el, "touchmove", 100, 200));
      act(() => fireTouchEvent(el, "touchend", 100, 200));
      expect(result.current.isRefreshing).toBe(true);
      expect(onRefresh).toHaveBeenCalledTimes(1);

      // 第二次下拉 — 应被忽略
      act(() => fireTouchEvent(el, "touchstart", 100, 0));
      act(() => fireTouchEvent(el, "touchmove", 100, 200));
      act(() => fireTouchEvent(el, "touchend", 100, 200));
      expect(onRefresh).toHaveBeenCalledTimes(1);
    });
  });

  // ── 录音时抑制 ──

  describe("录音时抑制下拉刷新", () => {
    it("should_not_trigger_when_disabled", async () => {
      const onRefresh = vi.fn().mockResolvedValue(true);
      el = makeScrollEl(0);
      const scrollRef = { current: el };

      const { result } = renderHook(() =>
        usePullToRefresh({ onRefresh, scrollRef, disabled: true }),
      );
      await act(async () => {});

      act(() => fireTouchEvent(el, "touchstart", 100, 0));
      act(() => fireTouchEvent(el, "touchmove", 100, 200));
      act(() => fireTouchEvent(el, "touchend", 100, 200));

      expect(onRefresh).not.toHaveBeenCalled();
      expect(result.current.pullDistance).toBe(0);
    });
  });

  // ── 对角线手势 ──

  describe("对角线手势不触发", () => {
    it("should_ignore_diagonal_where_dx_exceeds_dy", async () => {
      const onRefresh = vi.fn().mockResolvedValue(true);
      el = makeScrollEl(0);
      const scrollRef = { current: el };

      const { result } = renderHook(() =>
        usePullToRefresh({ onRefresh, scrollRef }),
      );
      await act(async () => {});

      act(() => fireTouchEvent(el, "touchstart", 100, 0));
      act(() => fireTouchEvent(el, "touchmove", 250, 100)); // |dx|=150 > |dy|=100

      expect(result.current.pullDistance).toBe(0);
    });
  });

  // ── 上滑不触发 ──

  describe("上滑不触发", () => {
    it("should_not_trigger_when_swiping_up", async () => {
      const onRefresh = vi.fn().mockResolvedValue(true);
      el = makeScrollEl(0);
      const scrollRef = { current: el };

      const { result } = renderHook(() =>
        usePullToRefresh({ onRefresh, scrollRef }),
      );
      await act(async () => {});

      act(() => fireTouchEvent(el, "touchstart", 100, 200));
      act(() => fireTouchEvent(el, "touchmove", 100, 0)); // dy < 0

      expect(result.current.pullDistance).toBe(0);
    });
  });

  // ── 自定义配置 ──

  describe("自定义配置", () => {
    it("should_use_custom_threshold", async () => {
      const onRefresh = vi.fn().mockResolvedValue(true);
      el = makeScrollEl(0);
      const scrollRef = { current: el };

      const { result } = renderHook(() =>
        usePullToRefresh({
          onRefresh,
          scrollRef,
          threshold: 100,
          dampingFactor: 0.5,
        }),
      );
      await act(async () => {});

      act(() => fireTouchEvent(el, "touchstart", 100, 0));
      act(() => fireTouchEvent(el, "touchmove", 100, 190)); // 190*0.5=95 < 100
      expect(result.current.isReady).toBe(false);

      act(() => fireTouchEvent(el, "touchmove", 100, 210)); // 210*0.5=105 >= 100
      expect(result.current.isReady).toBe(true);
    });
  });
});
