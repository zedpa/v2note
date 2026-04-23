/**
 * Logout Flow — 登出前对未同步条目的处理决策
 *
 * regression: fix-cold-resume-silent-loss (Phase 8, spec §4.3a)
 *
 * 纯决策函数：根据 未同步条目数 / 在线状态 / 用户选择 计算"登出应该怎么走"。
 * UI 层负责：
 *   - 调用 flushAllUnsynced(5000) 阻塞尝试
 *   - 基于返回值 + 当前 unsynced count 调用 decideLogoutAction
 *   - 根据返回值：proceed → 继续 signOut；block → 显示确认弹窗；cancel → 中止登出
 *
 * 关键约束：
 *   - 禁止静默丢弃 userId !== null 的未同步条目 → 登出后这些数据保留在本地
 *   - guest 条目（userId=null）不计入阻塞决策（它们本就不推送）
 */

export type LogoutDecision =
  /** 无未同步条目，或已全部成功推送 → 可直接登出 */
  | { action: "proceed" }
  /** 仍有未同步条目 → UI 应显示"确认登出"弹窗，用户选择后再调用本函数 */
  | { action: "block"; unsyncedCount: number; reason: "offline" | "push_failed" | "timeout" }
  /** 用户点了"取消" → 中止登出 */
  | { action: "cancel" };

export interface LogoutDecisionInput {
  /** userId !== null 的未同步条目数（不含 guest） */
  userOwnedUnsyncedCount: number;
  /** 是否在线（navigator.onLine） */
  online: boolean;
  /** flushAllUnsynced 是否超时 */
  flushTimedOut: boolean;
  /**
   * 用户在已弹窗之后的选择（首次调用时可为 undefined，此时只返回决策）。
   *   - "confirm" → 用户确认登出 → proceed
   *   - "cancel"  → 用户点取消 → cancel
   */
  userChoice?: "confirm" | "cancel";
}

/**
 * 根据当前状态决定登出应该走哪条路径。
 *
 * 决策优先级：
 *   1. 未同步=0 → proceed（无论是否在线）
 *   2. 有 userChoice=cancel → cancel
 *   3. 有 userChoice=confirm → proceed（用户已明确表示接受）
 *   4. 无 userChoice，且 flushTimedOut → block（应弹窗）
 *   5. 无 userChoice，offline → block（没法 flush，应弹窗）
 *   6. 无 userChoice，在线且未超时 → proceed（flush 已成功）
 */
export function decideLogoutAction(input: LogoutDecisionInput): LogoutDecision {
  // 1) 无未同步 → 直接放行
  if (input.userOwnedUnsyncedCount === 0) {
    return { action: "proceed" };
  }

  // 2/3) 用户已做选择
  if (input.userChoice === "cancel") {
    return { action: "cancel" };
  }
  if (input.userChoice === "confirm") {
    return { action: "proceed" };
  }

  // 4) flush 超时 → 需要用户决定
  if (input.flushTimedOut) {
    return {
      action: "block",
      unsyncedCount: input.userOwnedUnsyncedCount,
      reason: "timeout",
    };
  }

  // 5) 离线 → 需要用户决定
  if (!input.online) {
    return {
      action: "block",
      unsyncedCount: input.userOwnedUnsyncedCount,
      reason: "offline",
    };
  }

  // 6) 在线且未超时但仍有 unsynced：说明 flush 以失败告终（例如 gateway 401/5xx）
  return {
    action: "block",
    unsyncedCount: input.userOwnedUnsyncedCount,
    reason: "push_failed",
  };
}

/**
 * 生成弹窗文案（spec §4.3a 文案）。
 * 纯函数便于测试，UI 层直接渲染即可。
 */
export function buildLogoutConfirmMessage(unsyncedCount: number): string {
  return (
    `你有 ${unsyncedCount} 条未同步条目，登出后这些数据仍保留在本设备上，` +
    `需要联网并重新登录后才能同步。\n\n确认登出？`
  );
}
