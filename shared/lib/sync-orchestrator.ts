/**
 * 同步调度器（Sync Orchestrator）
 *
 * regression: fix-cold-resume-silent-loss
 *
 * 职责：
 *   - 全局单例 worker，串行推送 captureStore 中未同步的条目
 *   - 6 种触发点：app resume / visibility / online / ws open / 新捕获 / 手动
 *   - 200ms debounce coalesce
 *   - per-localId dedupe（同一条正在推送中不允许再次入队）
 *   - 401 refresh 上限 3 次后标 failed（按账号 subject 隔离 — C2）
 *   - 单飞 ensureGatewaySession（不阻塞捕获路径 — M1 修复 TOCTOU）
 *   - flushNow 等待 in-flight worker（C3）
 *   - worker 内 TOCTOU 防护（C4：重新读取 fresh 记录）
 *   - 所有 update() 捕获 CaptureNotFoundError（C1）
 *
 * 捕获路径**禁止**直接调用本模块；只通过 triggerSync() 唤醒。
 */

import {
  captureStore,
  CaptureNotFoundError,
  type CaptureRecord,
} from "./capture-store";

export interface PushResult {
  serverId: string;
}

export type PushError = {
  status?: number;          // HTTP 状态码（若适用）
  code?: string;            // 错误类型："network" | "auth" | "forbidden" | "bad_request" | "push_timeout" | ...
  message: string;
};

export interface SyncOrchestratorOptions {
  /**
   * 刷新 auth token。
   * C2 修复：返回 subject（用户 id），用于按账号隔离 401 计数。
   * 返回 { ok: true, subject: "u-1" } 表示当前 session 刷新到了 u-1 用户。
   */
  refreshAuth: () => Promise<{ ok: boolean; subject?: string | null }>;
  /** 确保 gateway WS 连接可用；返回是否 OPEN */
  ensureWs: () => Promise<boolean>;
  /** 实际推送一条 capture；失败抛 PushError（含 status=401 触发 refresh） */
  pushCapture: (c: CaptureRecord) => Promise<PushResult>;
  /** 可注入用于测试的 logger */
  logger?: (level: "log" | "warn" | "error", msg: string, data?: unknown) => void;
  /** 推送间隔节流（ms）；默认 200 */
  pushIntervalMs?: number;
  /** Debounce 合并窗口（ms）；默认 200 */
  debounceMs?: number;
  /** 401 refresh 上限；默认 3 */
  maxAuthRefresh?: number;
  /** retryCount 达到多少后标记 failed 永久性；默认 5 */
  maxRetryCount?: number;
  /** 单条推送超时（ms）；默认 30000（M3） */
  pushTimeoutMs?: number;
}

interface OrchestratorState {
  running: boolean;                                // worker 是否正在跑
  currentWorkerPromise: Promise<void> | null;      // C3：当前 worker 的 promise
  hasPendingScan: boolean;                         // 运行中又被触发
  debounceTimer: ReturnType<typeof setTimeout> | null;
  inFlightLocalIds: Set<string>;
  authRefreshCount: number;                        // 401 连续失败次数（按 subject 隔离）
  authRefreshSubject: string | null;               // C2：当前计数归属的 subject
  ensureSessionInFlight: Promise<boolean> | null;
}

/** 创建一个新的 orchestrator 实例（测试隔离用） */
export function createSyncOrchestrator(opts: SyncOrchestratorOptions) {
  const pushInterval = opts.pushIntervalMs ?? 200;
  const debounceMs = opts.debounceMs ?? 200;
  const maxAuthRefresh = opts.maxAuthRefresh ?? 3;
  const maxRetry = opts.maxRetryCount ?? 5;
  const pushTimeout = opts.pushTimeoutMs ?? 30000;
  const log = opts.logger ?? (() => {});

  const state: OrchestratorState = {
    running: false,
    currentWorkerPromise: null,
    hasPendingScan: false,
    debounceTimer: null,
    inFlightLocalIds: new Set(),
    authRefreshCount: 0,
    authRefreshSubject: null,
    ensureSessionInFlight: null,
  };

  /**
   * 单飞：确保 auth + ws 就绪。
   *
   * M1 修复：必须**同步**赋值 state.ensureSessionInFlight 再 await，
   * 否则两次同 tick 的并发调用会各自启动一个异步 IIFE，破坏单飞保证。
   */
  function ensureGatewaySession(): Promise<boolean> {
    if (state.ensureSessionInFlight) return state.ensureSessionInFlight;

    // 先创建 promise 并**同步**赋值，再执行 await 内部逻辑
    const p: Promise<boolean> = (async () => {
      try {
        const result = await opts.refreshAuth();
        if (!result.ok) {
          log("warn", "[sync] refreshAuth returned not ok");
        } else {
          // C2：subject 切换则重置 401 计数
          const newSubject = result.subject ?? null;
          if (newSubject !== state.authRefreshSubject) {
            state.authRefreshCount = 0;
            state.authRefreshSubject = newSubject;
          }
        }
        const wsOk = await opts.ensureWs();
        return wsOk;
      } catch (e) {
        log("error", "[sync] ensureGatewaySession error", e);
        return false;
      } finally {
        // 在同一 tick 解除单飞锁（注意：必须放 finally，避免异常时卡住）
        state.ensureSessionInFlight = null;
      }
    })();
    state.ensureSessionInFlight = p;
    return p;
  }

  /**
   * 对 pushCapture 包装超时（M3）。
   * 超时走 network 分支：code="push_timeout"。
   */
  function withTimeout<T>(p: Promise<T>, ms: number, code: string): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => {
        reject({ code, message: `${code}: exceeded ${ms}ms` });
      }, ms);
      p.then(
        (v) => {
          clearTimeout(timer);
          resolve(v);
        },
        (e) => {
          clearTimeout(timer);
          reject(e);
        },
      );
    });
  }

  /**
   * 分类错误到 syncStatus 更新。
   *
   * M5 修复：401 分支里**不再**调用 opts.refreshAuth()——刷新统一由
   * 下次 worker 迭代的 ensureGatewaySession 完成，避免双次刷新 / 竞态。
   */
  async function handlePushFailure(record: CaptureRecord, err: PushError): Promise<void> {
    const { status, code } = err;
    const retryCount = (record.retryCount ?? 0) + 1;

    try {
      // 401：仅增加计数并保持 captured（或达到上限时标 failed）
      if (status === 401 || code === "auth") {
        state.authRefreshCount += 1;
        if (state.authRefreshCount >= maxAuthRefresh) {
          await captureStore.update(record.localId, {
            syncStatus: "failed",
            lastError: "auth_refresh_exhausted",
            retryCount,
          });
          log("warn", `[sync] auth refresh exhausted for ${record.localId}`);
        } else {
          await captureStore.update(record.localId, {
            syncStatus: "captured",
            lastError: err.message,
            retryCount,
          });
          // M5：不在此处触发额外 refreshAuth；下一轮 ensureGatewaySession 会处理
        }
        return;
      }

      // 403 / 422 / 400 → 永久失败
      if (
        status === 403 ||
        status === 422 ||
        status === 400 ||
        code === "forbidden" ||
        code === "bad_request"
      ) {
        await captureStore.update(record.localId, {
          syncStatus: "failed",
          lastError: err.message,
          retryCount,
        });
        return;
      }

      // 网络 / 5xx / 超时（push_timeout）/ 其他 → 保持 captured，下次重试
      if (retryCount >= maxRetry) {
        await captureStore.update(record.localId, {
          syncStatus: "failed",
          lastError: err.message,
          retryCount,
        });
      } else {
        await captureStore.update(record.localId, {
          syncStatus: "captured",
          lastError: err.message,
          retryCount,
        });
      }
    } catch (e) {
      if (e instanceof CaptureNotFoundError) {
        log("warn", `[sync] capture ${record.localId} vanished during failure handling`);
        return;
      }
      throw e;
    }
  }

  /** worker 主循环（串行推送） */
  async function runWorker(): Promise<void> {
    if (state.running) {
      state.hasPendingScan = true;
      return;
    }
    state.running = true;
    const p = (async () => {
      try {
        // 外层循环以支持 hasPendingScan 复扫
        // eslint-disable-next-line no-constant-condition
        while (true) {
          state.hasPendingScan = false;

          // 确保会话（不阻塞捕获；捕获已经落地）
          const sessionOk = await ensureGatewaySession();
          if (!sessionOk) {
            log("warn", "[sync] session not ready, will retry on next trigger");
            break;
          }

          const unsynced = await captureStore.listUnsynced();
          // 只推送 userId 非 null 的条目（未登录归属逻辑在 §4.3，本轮不启用）
          const pushable = unsynced
            .filter((r) => r.userId !== null)
            .filter((r) => !state.inFlightLocalIds.has(r.localId))
            .sort((a, b) => a.createdAt.localeCompare(b.createdAt));

          if (pushable.length === 0) {
            break;
          }

          for (const record of pushable) {
            // per-localId dedupe
            if (state.inFlightLocalIds.has(record.localId)) continue;

            // C4：TOCTOU 防护——在正式推送前重读 fresh 记录
            let fresh: CaptureRecord | null;
            try {
              fresh = await captureStore.get(record.localId);
            } catch (e) {
              log("warn", `[sync] failed to re-fetch ${record.localId}`, e);
              continue;
            }
            if (!fresh) {
              // 被删 / GC 清理 → 跳过
              log("log", `[sync] capture ${record.localId} was deleted, skipping`);
              continue;
            }
            if (fresh.syncStatus === "synced") {
              // 其他路径已同步 → 跳过
              continue;
            }

            state.inFlightLocalIds.add(record.localId);
            try {
              try {
                await captureStore.update(record.localId, { syncStatus: "syncing" });
              } catch (e) {
                if (e instanceof CaptureNotFoundError) {
                  log("log", `[sync] capture ${record.localId} vanished before push`);
                  continue;
                }
                throw e;
              }

              let result: PushResult;
              try {
                result = await withTimeout(opts.pushCapture(fresh), pushTimeout, "push_timeout");
              } catch (e) {
                const err = normalizeError(e);
                log("warn", `[sync] push failed for ${record.localId}: ${err.message}`);
                await handlePushFailure(fresh, err);
                continue;
              }

              try {
                await captureStore.update(record.localId, {
                  syncStatus: "synced",
                  serverId: result.serverId,
                  lastError: null,
                });
                // 推送成功 → 重置 auth 计数
                state.authRefreshCount = 0;
              } catch (e) {
                if (e instanceof CaptureNotFoundError) {
                  log("warn", `[sync] capture ${record.localId} vanished before ack`);
                  continue;
                }
                throw e;
              }
            } finally {
              state.inFlightLocalIds.delete(record.localId);
            }

            // 节流：推送间隔 ≥ pushInterval
            if (pushInterval > 0) {
              await sleep(pushInterval);
            }
          }

          if (!state.hasPendingScan) break;
        }
      } catch (e) {
        log("error", "[sync] worker error", e);
        // M2：即使 catch 分支也要处理 hasPendingScan 补偿
        if (state.hasPendingScan) {
          setTimeout(() => triggerSync(), 1000);
        }
      } finally {
        state.running = false;
        // M2：worker 退出时若有 pending scan 尚未被 break 顶掉的分支（session 失败等）
        if (state.hasPendingScan) {
          setTimeout(() => triggerSync(), 1000);
        }
        state.currentWorkerPromise = null;
      }
    })();
    state.currentWorkerPromise = p;
    return p;
  }

  /** 外部触发：入 debounce 窗口 */
  function triggerSync(): void {
    if (state.debounceTimer) {
      clearTimeout(state.debounceTimer);
    }
    state.debounceTimer = setTimeout(() => {
      state.debounceTimer = null;
      runWorker().catch((e) => log("error", "[sync] runWorker error", e));
    }, debounceMs);
  }

  /**
   * 立即执行一次（跳过 debounce，测试用）。
   * C3 修复：若 worker 正在运行，返回当前 worker 的 promise（等待完成），不吞请求。
   */
  function flushNow(): Promise<void> {
    if (state.debounceTimer) {
      clearTimeout(state.debounceTimer);
      state.debounceTimer = null;
    }
    if (state.running) {
      // 标记需要再扫一轮，并等待当前 worker 完成
      state.hasPendingScan = true;
      return state.currentWorkerPromise ?? Promise.resolve();
    }
    return runWorker();
  }

  return {
    triggerSync,
    flushNow,
    getStateSnapshot(): Readonly<OrchestratorState> {
      return { ...state, inFlightLocalIds: new Set(state.inFlightLocalIds) };
    },
  };
}

function normalizeError(e: unknown): PushError {
  if (e && typeof e === "object") {
    const anyE = e as { status?: number; code?: string; message?: string };
    return {
      status: anyE.status,
      code: anyE.code,
      message: anyE.message ?? String(e),
    };
  }
  return { message: String(e) };
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ──────────────────────────────────────────────────────────────
// 全局单例（由 layout 初始化）
// ──────────────────────────────────────────────────────────────

let globalOrchestrator: ReturnType<typeof createSyncOrchestrator> | null = null;
let globalListeners: Array<() => void> = [];

/**
 * 启动全局同步调度器。由 app/layout 在 client mount 时调用一次。
 * 返回一个 unregister 函数用于清理。
 */
export function startSyncOrchestrator(opts: SyncOrchestratorOptions): () => void {
  if (globalOrchestrator) {
    // 已经启动 → 返回幂等 unregister
    return () => {};
  }
  globalOrchestrator = createSyncOrchestrator(opts);

  // 触发点 1：online 事件
  const onOnline = () => globalOrchestrator?.triggerSync();
  // 触发点 2：visibilitychange → visible
  const onVisibility = () => {
    if (typeof document !== "undefined" && document.visibilityState === "visible") {
      globalOrchestrator?.triggerSync();
    }
  };
  // 触发点 3：pageshow (persisted=true ← BFCache)
  const onPageShow = (e: PageTransitionEvent) => {
    if (e.persisted) globalOrchestrator?.triggerSync();
  };

  if (typeof window !== "undefined") {
    window.addEventListener("online", onOnline);
    window.addEventListener("pageshow", onPageShow as EventListener);
    document.addEventListener("visibilitychange", onVisibility);
    globalListeners.push(() => window.removeEventListener("online", onOnline));
    globalListeners.push(() =>
      window.removeEventListener("pageshow", onPageShow as EventListener),
    );
    globalListeners.push(() =>
      document.removeEventListener("visibilitychange", onVisibility),
    );
  }

  // 立即触发一次（layout mount 场景）
  globalOrchestrator.triggerSync();

  return () => {
    for (const off of globalListeners) off();
    globalListeners = [];
    globalOrchestrator = null;
  };
}

/** 外部手动触发（新捕获 / 重试按钮 / ws onopen） */
export function triggerSync(): void {
  globalOrchestrator?.triggerSync();
}

/** 测试辅助：清除全局单例状态 */
export function __resetGlobalOrchestratorForTest(): void {
  for (const off of globalListeners) off();
  globalListeners = [];
  globalOrchestrator = null;
}
