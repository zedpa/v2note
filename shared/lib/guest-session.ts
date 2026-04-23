/**
 * Guest Session — 未登录状态下的批次标识管理
 *
 * regression: fix-cold-resume-silent-loss (Phase 8)
 *
 * 作用（spec §4.3）：
 *   - 未登录用户的 captureStore 条目必须携带一个稳定的 guestBatchId（同一设备/会话共享），
 *     以便后续登录后整批"归属回填"成当前用户。
 *   - 与 userId 互斥：userId === null 的条目才有 guestBatchId；一旦回填 userId，guestBatchId 清零。
 *
 * 纯函数、无 React 依赖、测试友好。
 *
 * 存储介质：localStorage。
 *   - 选择 localStorage 的理由：跨 tab 同步 + 用户清浏览数据时也会被清（符合"会话"语义）。
 *   - localStorage 不可用（隐私模式/无 window）时降级为进程内变量——当前 tab 内仍稳定，
 *     刷新后丢失，但此时 captureStore 也大概率不可用（IndexedDB 同样依赖存储），整体一致。
 */

export const GUEST_BATCH_KEY = "v2note-guest-batch-id";

/**
 * P0.1（C1/C2）：最近一次登录用户 id。
 *
 * 存在的理由：本设备可能连续服务多个真实自然人（A 用户退出，把手机借给 B 用户登录）。
 * 登录 claim 的前提是"本地 guest 批次属于当前登录用户的匿名期"。若上一个登录用户
 * 是 A 而当前登录是 B，任何 guestBatchId 下的未归属条目都**不能**自动划给 B——
 * 否则出现跨真实自然人的隐私泄漏。
 *
 * 语义：保存"上一次成功登录的 user id"。guest-claim 在批量回填前对比它与当前
 * 登录 user id，不一致则要求调用方发起用户级知情同意（UI 弹窗）。
 *
 * 生命周期：登录成功 → `recordLastLoggedInUserId(userId)`；
 *           登出 → 不清（保留以供下一次登录比对）；
 *           用户主动清设备 → `clearLastLoggedInUserId()`（很少用）
 */
export const LAST_LOGGED_IN_USER_KEY = "v2note-last-user-id";

/** 内存降级（localStorage 不可用时） */
let _memoryBatchId: string | null = null;
let _memoryLastUserId: string | null = null;

function genBatchId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  // 降级：时间戳 + 随机后缀，足以在同设备内保持唯一
  return `guest-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
}

function safeGet(key: string): string | null {
  try {
    if (typeof localStorage === "undefined") return null;
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function safeSet(key: string, value: string): boolean {
  try {
    if (typeof localStorage === "undefined") return false;
    localStorage.setItem(key, value);
    return true;
  } catch {
    return false;
  }
}

function safeRemove(key: string): void {
  try {
    if (typeof localStorage === "undefined") return;
    localStorage.removeItem(key);
  } catch {
    // 忽略
  }
}

/**
 * 获取或创建一个 guest batch id。
 * 同一设备/浏览器会话内多次调用返回相同值，除非显式 clearGuestBatchId()。
 */
export function getOrCreateGuestBatchId(): string {
  // 1) 优先 localStorage
  const existing = safeGet(GUEST_BATCH_KEY);
  if (existing) {
    // 同步回写内存缓存（便于后续降级读取）
    _memoryBatchId = existing;
    return existing;
  }

  // 2) 内存降级
  if (_memoryBatchId) return _memoryBatchId;

  // 3) 新建
  const id = genBatchId();
  const persisted = safeSet(GUEST_BATCH_KEY, id);
  _memoryBatchId = id;
  // persisted 为 false 时仅存在内存中——调用方不感知这一差异
  void persisted;
  return id;
}

/**
 * 清除当前 guest batch id。
 * 场景：登录成功 + claim 完成后调用；也可手动重置。
 */
export function clearGuestBatchId(): void {
  safeRemove(GUEST_BATCH_KEY);
  _memoryBatchId = null;
}

/**
 * 读取当前 guest batch id 但**不创建**。
 * 若未曾创建过，返回 null。用于 claim 流程先探测。
 */
export function peekGuestBatchId(): string | null {
  const existing = safeGet(GUEST_BATCH_KEY);
  if (existing) return existing;
  return _memoryBatchId;
}

/**
 * P0.1：记录本次登录的用户 id。
 * 由 useAuth.setLoggedInUser（或登录成功回调）调用一次。
 */
export function recordLastLoggedInUserId(userId: string): void {
  if (!userId) return;
  const ok = safeSet(LAST_LOGGED_IN_USER_KEY, userId);
  _memoryLastUserId = userId;
  void ok;
}

/**
 * P0.1：读取上一次登录的用户 id。
 * 若从未登录过，或 localStorage 被清 → null。
 */
export function getLastLoggedInUserId(): string | null {
  const existing = safeGet(LAST_LOGGED_IN_USER_KEY);
  if (existing) {
    _memoryLastUserId = existing;
    return existing;
  }
  return _memoryLastUserId;
}

/**
 * P0.1：清除上一次登录的用户 id。
 * 一般由"用户主动清本地数据 / 重置设备"触发，不走登出流程。
 */
export function clearLastLoggedInUserId(): void {
  safeRemove(LAST_LOGGED_IN_USER_KEY);
  _memoryLastUserId = null;
}

/** 测试辅助：重置内存态（单测间隔离）。 */
export function __resetGuestSessionForTest(): void {
  _memoryBatchId = null;
  _memoryLastUserId = null;
  safeRemove(GUEST_BATCH_KEY);
  safeRemove(LAST_LOGGED_IN_USER_KEY);
}
