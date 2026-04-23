/**
 * ASR 完成超时降级 —— fix-cold-resume-silent-loss §7.3
 *
 * 目的：asr.stop 发出后，若 gateway 长时间不返回 asr.done / asr.error，
 *       UI 不能卡死；必须给用户明确反馈并让 FAB / 输入框回到可用状态。
 *
 * 两级超时：
 *   - 绝对超时（默认 12s）：asr.stop 发出后，12s 内未收到任何 partial/done/error → 降级
 *   - 尾包超时（默认 8s）：已收到 partial，再等 8s 仍无 done/error → 降级
 *
 * 纯状态机（`decideTransition`）方便单测；`createAsrTimeoutMachine` 是集成 setTimeout 的
 * runtime 包装器。
 */
export type AsrTimeoutPhase =
  | "idle"
  | "waiting_absolute" // asr.stop 已发，尚无 partial
  | "waiting_after_partial"; // 已收过 partial，等待 done/error

export type AsrTimeoutEvent =
  | { type: "stop_sent" }
  | { type: "partial" }
  | { type: "done" }
  | { type: "error" }
  | { type: "timeout" }
  | { type: "reset" };

export type AsrTimerAction =
  | { action: "start"; ms: number; phase: AsrTimeoutPhase }
  | { action: "clear" }
  | { action: "noop" };

export interface AsrTimeoutConfig {
  absoluteMs?: number; // 默认 12000
  partialMs?: number; // 默认 8000
}

export interface TransitionResult {
  nextPhase: AsrTimeoutPhase;
  timer: AsrTimerAction;
  /** true 表示本次事件处于"已降级"窗口之后（late arrival），调用方应只写本地不动 UI */
  isLate: boolean;
  /** true 表示刚刚触发降级（timeout 事件） */
  degraded: boolean;
}

const DEFAULT_ABSOLUTE_MS = 12000;
const DEFAULT_PARTIAL_MS = 8000;

/**
 * 纯状态转换函数。
 * 参数 `degradedLatch` 由调用方持有：一旦降级（timeout）→ 置 true；reset / stop_sent 清零。
 */
export function decideTransition(
  phase: AsrTimeoutPhase,
  event: AsrTimeoutEvent,
  degradedLatch: boolean,
  cfg: AsrTimeoutConfig = {},
): TransitionResult {
  const absMs = cfg.absoluteMs ?? DEFAULT_ABSOLUTE_MS;
  const partMs = cfg.partialMs ?? DEFAULT_PARTIAL_MS;

  // 任何事件在降级后到达都是 late（除了 reset / stop_sent 重开）
  const isLate =
    degradedLatch && event.type !== "reset" && event.type !== "stop_sent";

  switch (event.type) {
    case "stop_sent":
      // 重新启动计时（前一次若在等待中，旧定时器应已被 reset 清掉；这里只负责启动新一轮）
      return {
        nextPhase: "waiting_absolute",
        timer: { action: "start", ms: absMs, phase: "waiting_absolute" },
        isLate: false,
        degraded: false,
      };

    case "partial":
      if (phase === "idle") {
        // 没在等待中，忽略（可能 stop 尚未发、或已 reset）
        return { nextPhase: phase, timer: { action: "noop" }, isLate, degraded: false };
      }
      if (isLate) {
        // 降级后迟到的 partial → 不重置计时、不碰 UI
        return { nextPhase: phase, timer: { action: "noop" }, isLate: true, degraded: false };
      }
      return {
        nextPhase: "waiting_after_partial",
        timer: { action: "start", ms: partMs, phase: "waiting_after_partial" },
        isLate: false,
        degraded: false,
      };

    case "done":
    case "error":
      if (phase === "idle" && !isLate) {
        return { nextPhase: "idle", timer: { action: "noop" }, isLate: false, degraded: false };
      }
      return {
        nextPhase: "idle",
        timer: { action: "clear" },
        isLate,
        degraded: false,
      };

    case "timeout":
      if (phase === "idle") {
        // 已被 reset/stop 清过 → 忽略
        return { nextPhase: "idle", timer: { action: "noop" }, isLate: false, degraded: false };
      }
      return {
        nextPhase: "idle",
        timer: { action: "clear" },
        isLate: false,
        degraded: true,
      };

    case "reset":
      return {
        nextPhase: "idle",
        timer: { action: "clear" },
        isLate: false,
        degraded: false,
      };
  }
}

// ─── Runtime 包装 ───────────────────────────────────────────────

export interface AsrTimeoutMachineCallbacks {
  /** 绝对超时或尾包超时触发 */
  onTimeout: (phase: "absolute" | "after_partial") => void;
  /** 降级后收到 asr.done/.error → 只写本地，不动 UI（调用方自行处理） */
  onLateDone?: () => void;
  onLateError?: () => void;
}

export interface AsrTimeoutMachine {
  notifyStopSent: () => void;
  notifyPartial: () => void;
  /** 收到 asr.done。返回值 isLate 指示是否迟到（降级后） */
  notifyDone: () => { isLate: boolean };
  notifyError: () => { isLate: boolean };
  /** 外部取消（cancel/unmount） */
  reset: () => void;
  /** 测试/调试用 */
  getPhase: () => AsrTimeoutPhase;
  isDegraded: () => boolean;
}

type TimerHandle = ReturnType<typeof setTimeout>;

export function createAsrTimeoutMachine(
  callbacks: AsrTimeoutMachineCallbacks,
  cfg: AsrTimeoutConfig = {},
  scheduler: {
    setTimeout: (fn: () => void, ms: number) => TimerHandle;
    clearTimeout: (h: TimerHandle) => void;
  } = { setTimeout, clearTimeout },
): AsrTimeoutMachine {
  let phase: AsrTimeoutPhase = "idle";
  let degradedLatch = false;
  let timer: TimerHandle | null = null;
  let lastStartedPhase: AsrTimeoutPhase = "idle";

  function applyTimer(action: AsrTimerAction) {
    if (action.action === "clear") {
      if (timer !== null) {
        scheduler.clearTimeout(timer);
        timer = null;
      }
      return;
    }
    if (action.action === "start") {
      if (timer !== null) {
        scheduler.clearTimeout(timer);
        timer = null;
      }
      lastStartedPhase = action.phase;
      timer = scheduler.setTimeout(() => {
        timer = null;
        const res = decideTransition(phase, { type: "timeout" }, degradedLatch, cfg);
        phase = res.nextPhase;
        applyTimer(res.timer);
        if (res.degraded) {
          degradedLatch = true;
          callbacks.onTimeout(
            lastStartedPhase === "waiting_after_partial" ? "after_partial" : "absolute",
          );
        }
      }, action.ms);
    }
  }

  function fire(event: AsrTimeoutEvent): TransitionResult {
    const res = decideTransition(phase, event, degradedLatch, cfg);
    phase = res.nextPhase;
    if (event.type === "reset" || event.type === "stop_sent") {
      degradedLatch = false;
    }
    applyTimer(res.timer);
    return res;
  }

  return {
    notifyStopSent: () => {
      fire({ type: "stop_sent" });
    },
    notifyPartial: () => {
      fire({ type: "partial" });
    },
    notifyDone: () => {
      const res = fire({ type: "done" });
      if (res.isLate) callbacks.onLateDone?.();
      return { isLate: res.isLate };
    },
    notifyError: () => {
      const res = fire({ type: "error" });
      if (res.isLate) callbacks.onLateError?.();
      return { isLate: res.isLate };
    },
    reset: () => {
      fire({ type: "reset" });
    },
    getPhase: () => phase,
    isDegraded: () => degradedLatch,
  };
}
