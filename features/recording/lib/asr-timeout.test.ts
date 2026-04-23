/**
 * regression: fix-cold-resume-silent-loss §7.3
 * ASR 完成超时降级状态机
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  decideTransition,
  createAsrTimeoutMachine,
  type AsrTimeoutPhase,
} from "./asr-timeout";

describe("decideTransition (pure)", () => {
  it("should_start_absolute_timer_on_stop_sent", () => {
    const r = decideTransition("idle", { type: "stop_sent" }, false);
    expect(r.nextPhase).toBe("waiting_absolute");
    expect(r.timer).toEqual({ action: "start", ms: 12000, phase: "waiting_absolute" });
    expect(r.isLate).toBe(false);
    expect(r.degraded).toBe(false);
  });

  it("should_switch_to_partial_timer_when_partial_arrives", () => {
    const r = decideTransition("waiting_absolute", { type: "partial" }, false);
    expect(r.nextPhase).toBe("waiting_after_partial");
    expect(r.timer).toEqual({
      action: "start",
      ms: 8000,
      phase: "waiting_after_partial",
    });
  });

  it("should_clear_timer_on_done_while_waiting", () => {
    const r = decideTransition("waiting_after_partial", { type: "done" }, false);
    expect(r.nextPhase).toBe("idle");
    expect(r.timer).toEqual({ action: "clear" });
    expect(r.isLate).toBe(false);
  });

  it("should_mark_late_when_done_arrives_after_degrade", () => {
    const r = decideTransition("idle", { type: "done" }, true);
    expect(r.isLate).toBe(true);
    expect(r.timer).toEqual({ action: "clear" });
  });

  it("should_mark_degraded_on_timeout", () => {
    const r = decideTransition("waiting_absolute", { type: "timeout" }, false);
    expect(r.degraded).toBe(true);
    expect(r.nextPhase).toBe("idle");
  });

  it("should_noop_timeout_in_idle", () => {
    const r = decideTransition("idle", { type: "timeout" }, false);
    expect(r.timer).toEqual({ action: "noop" });
    expect(r.degraded).toBe(false);
  });

  it("should_ignore_late_partial_without_resetting_timer", () => {
    const r = decideTransition("waiting_absolute", { type: "partial" }, true);
    expect(r.timer).toEqual({ action: "noop" });
    expect(r.isLate).toBe(true);
    // 相位不变——不让 late partial 踩进 after_partial 而再次延长超时
    expect(r.nextPhase).toBe("waiting_absolute");
  });

  it("should_clear_on_reset", () => {
    const r = decideTransition("waiting_after_partial", { type: "reset" }, false);
    expect(r.nextPhase).toBe("idle");
    expect(r.timer).toEqual({ action: "clear" });
  });

  it("should_restart_absolute_on_stop_sent_after_degrade", () => {
    // 降级后用户立刻再次开启录音 → 新一轮 stop_sent 应清掉 latch
    const r = decideTransition("idle", { type: "stop_sent" }, true);
    expect(r.isLate).toBe(false);
    expect(r.nextPhase).toBe("waiting_absolute");
  });

  it("should_respect_custom_timeouts", () => {
    const r = decideTransition(
      "idle",
      { type: "stop_sent" },
      false,
      { absoluteMs: 500, partialMs: 200 },
    );
    expect(r.timer).toEqual({ action: "start", ms: 500, phase: "waiting_absolute" });
  });
});

describe("createAsrTimeoutMachine (runtime)", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("should_fire_timeout_after_absolute_ms_when_no_events", () => {
    const onTimeout = vi.fn();
    const m = createAsrTimeoutMachine(
      { onTimeout },
      { absoluteMs: 1000, partialMs: 500 },
    );
    m.notifyStopSent();
    expect(m.getPhase()).toBe("waiting_absolute");
    vi.advanceTimersByTime(999);
    expect(onTimeout).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(onTimeout).toHaveBeenCalledWith("absolute");
    expect(m.isDegraded()).toBe(true);
    expect(m.getPhase()).toBe("idle");
  });

  it("should_fire_after_partial_timeout_when_partial_then_silence", () => {
    const onTimeout = vi.fn();
    const m = createAsrTimeoutMachine(
      { onTimeout },
      { absoluteMs: 1000, partialMs: 300 },
    );
    m.notifyStopSent();
    vi.advanceTimersByTime(500);
    m.notifyPartial();
    expect(m.getPhase()).toBe("waiting_after_partial");
    vi.advanceTimersByTime(299);
    expect(onTimeout).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(onTimeout).toHaveBeenCalledWith("after_partial");
  });

  it("should_not_fire_timeout_when_done_arrives_in_time", () => {
    const onTimeout = vi.fn();
    const m = createAsrTimeoutMachine(
      { onTimeout },
      { absoluteMs: 1000, partialMs: 300 },
    );
    m.notifyStopSent();
    vi.advanceTimersByTime(500);
    const r = m.notifyDone();
    expect(r.isLate).toBe(false);
    vi.advanceTimersByTime(5000);
    expect(onTimeout).not.toHaveBeenCalled();
    expect(m.getPhase()).toBe("idle");
  });

  it("should_report_late_and_call_onLateDone_after_degrade", () => {
    const onTimeout = vi.fn();
    const onLateDone = vi.fn();
    const m = createAsrTimeoutMachine(
      { onTimeout, onLateDone },
      { absoluteMs: 500, partialMs: 200 },
    );
    m.notifyStopSent();
    vi.advanceTimersByTime(500);
    expect(onTimeout).toHaveBeenCalled();
    // gateway 迟到
    const r = m.notifyDone();
    expect(r.isLate).toBe(true);
    expect(onLateDone).toHaveBeenCalledOnce();
  });

  it("should_clear_degrade_latch_on_next_stop_sent", () => {
    const onTimeout = vi.fn();
    const m = createAsrTimeoutMachine(
      { onTimeout },
      { absoluteMs: 500, partialMs: 200 },
    );
    m.notifyStopSent();
    vi.advanceTimersByTime(500);
    expect(m.isDegraded()).toBe(true);
    m.notifyStopSent(); // 用户开始新一轮
    expect(m.isDegraded()).toBe(false);
    expect(m.getPhase()).toBe("waiting_absolute");
  });

  it("should_clear_timer_on_reset", () => {
    const onTimeout = vi.fn();
    const m = createAsrTimeoutMachine(
      { onTimeout },
      { absoluteMs: 500, partialMs: 200 },
    );
    m.notifyStopSent();
    m.reset();
    vi.advanceTimersByTime(5000);
    expect(onTimeout).not.toHaveBeenCalled();
    expect(m.getPhase()).toBe("idle");
    expect(m.isDegraded()).toBe(false);
  });

  it("should_not_reset_timer_on_late_partial", () => {
    const onTimeout = vi.fn();
    const m = createAsrTimeoutMachine(
      { onTimeout },
      { absoluteMs: 500, partialMs: 300 },
    );
    m.notifyStopSent();
    vi.advanceTimersByTime(500);
    expect(onTimeout).toHaveBeenCalledOnce();
    // 降级后 partial 迟到——不应重新开启 8s 窗口
    m.notifyPartial();
    vi.advanceTimersByTime(10000);
    expect(onTimeout).toHaveBeenCalledOnce(); // 没有再次触发
  });

  it("should_support_custom_scheduler_for_integration_in_node_envs", () => {
    const onTimeout = vi.fn();
    let scheduled: { fn: () => void; ms: number } | null = null;
    const fakeSched = {
      setTimeout: (fn: () => void, ms: number) => {
        scheduled = { fn, ms };
        return 1 as unknown as ReturnType<typeof setTimeout>;
      },
      clearTimeout: vi.fn(() => {
        scheduled = null;
      }),
    };
    const m = createAsrTimeoutMachine(
      { onTimeout },
      { absoluteMs: 100, partialMs: 50 },
      fakeSched,
    );
    m.notifyStopSent();
    expect(scheduled).not.toBeNull();
    expect(scheduled!.ms).toBe(100);
    scheduled!.fn(); // 手动触发
    expect(onTimeout).toHaveBeenCalledWith("absolute");
  });
});
