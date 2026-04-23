/**
 * §7.4 账号视图隔离 —— fix-cold-resume-silent-loss
 *
 * 跨账号数据隔离的**唯一**本地过滤点。所有从 captureStore 加载出的本地条目在进入
 * 列表渲染前都必须过这一关，防止：
 *   - 用户 A 登录后看见用户 B 的本地 captures
 *   - 未登录用户看见上一个 guest session 的遗留条目
 *   - 登录用户看见其他 guest session 的遗留条目
 *
 * 规则（严格对齐 spec）：
 *   未登录视图（currentUserId===null）：
 *     → 显示 userId===null ∧ guestBatchId===currentSessionBatchId 的条目
 *     → 其他（含上一个 guest session 遗留）全部屏蔽
 *
 *   登录视图（currentUserId=X）：
 *     → 显示 userId===X
 *     → 加上 userId===null ∧ guestBatchId===currentSessionBatchId
 *       （刚刚在当前会话录的，还没被懒绑定归属到 X）
 *     → 其他账号 Y 的条目 / 其他 guest session 的 null 条目全部屏蔽
 *
 * 注意：此过滤不会修改任何数据，仅决定"当前视图能看见哪些"。
 */

export interface AccountViewContext {
  currentUserId: string | null;
  /**
   * 当前浏览器会话的 guest batch id（来自 guest-session.peekGuestBatchId）。
   * null 表示本 session 尚未生成 batch id —— 此时未登录视图看不到任何 userId=null 条目。
   */
  currentSessionBatchId: string | null;
}

/**
 * 仅需要 userId + guestBatchId 两个字段即可决定可见性。
 * 调用方可用 `CaptureRecord` / `any` 传入，Generic 保留原类型。
 */
interface CaptureLike {
  userId: string | null;
  guestBatchId: string | null;
}

/**
 * 单条 capture 的可见性判定。
 * 返回 true 表示在当前视图可见。
 */
export function isCaptureVisibleInView<T extends CaptureLike>(
  capture: T,
  ctx: AccountViewContext,
): boolean {
  if (ctx.currentUserId === null) {
    // 未登录视图
    if (capture.userId !== null) return false;
    // 没有当前 session batch id → 不能确定是哪个 guest session，拒显示
    if (ctx.currentSessionBatchId === null) return false;
    return capture.guestBatchId === ctx.currentSessionBatchId;
  }
  // 登录视图
  if (capture.userId === ctx.currentUserId) return true;
  if (capture.userId === null) {
    if (ctx.currentSessionBatchId === null) return false;
    return capture.guestBatchId === ctx.currentSessionBatchId;
  }
  // 其他账号的本地条目
  return false;
}

/**
 * 批量过滤。保持原有顺序；不做其他变换。
 */
export function filterCapturesByAccountView<T extends CaptureLike>(
  captures: readonly T[],
  ctx: AccountViewContext,
): T[] {
  return captures.filter((c) => isCaptureVisibleInView(c, ctx));
}
