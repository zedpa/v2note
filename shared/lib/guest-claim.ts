/**
 * Guest Claim — 登录后把 guest 批次条目归属到真实用户，并处理冲突
 *
 * regression: fix-cold-resume-silent-loss (Phase 8)
 *
 * spec §4.3 第 3-4 点：
 *   - 登录成功后，把 captureStore 中 `guestBatchId === <current batch>` 的所有条目
 *     批量回填 userId=<登录用户 id>，清空 guestBatchId。
 *   - 若 captureStore 中存在另一组 `userId !== null && userId !== <login user id>` 的
 *     未同步条目 → 认为是"上一个账号"残留的孤儿，返回给 UI 处理（push-to-original /
 *     keep-local / delete 三种动作）。
 *
 * 安全原则：
 *   - push-to-original 在当前 session 下必然推给当前账号，会造成跨账号污染 → 实现上
 *     不推送，只把条目标记为"待原账号登录后处理"（保留 userId 不变）。这是一个可
 *     编程的 API；更完善的方案等未来新增"多账号切换"能力再迭代。
 *   - delete 动作必须是显式用户选择，Caller 传入冲突列表而非索引，避免误删。
 *   - 本模块纯函数 + 注入依赖，测试可完全用内存版 captureStore。
 */

import {
  captureStore,
  CaptureNotFoundError,
  type CaptureRecord,
} from "./capture-store";
import {
  peekGuestBatchId,
  clearGuestBatchId,
  getLastLoggedInUserId,
} from "./guest-session";
import { triggerSync as defaultTriggerSync } from "./sync-orchestrator";

export interface ClaimResult {
  /** 成功归属（userId 回填、guestBatchId 清零）的条数 */
  claimed: number;
  /**
   * 冲突条目：属于另一个账号（不是当前登录用户）的未同步条目。
   * 由 UI 弹出"推送 / 保留 / 删除"三选一；未解决前不影响 claim 流程返回。
   */
  conflict: CaptureRecord[];
  /**
   * P0.1（C1/C2）：本设备曾被其他真实自然人登录过 → 拒绝自动 claim。
   * true 时 `claimed` 始终为 0；UI 层应弹出"本设备之前由其他账号使用，
   * 是否将 N 条离线数据导入当前账号？"让用户知情后再调 `confirmClaimGuestCaptures`。
   */
  requiresUserConsent: boolean;
  /**
   * P0.1：当前 guest batch 下待归属的条目数（供 UI 弹窗文案使用）。
   * `requiresUserConsent === false` 时该字段等于 `claimed`；
   * `requiresUserConsent === true` 时该字段是"如果用户同意将被导入的条目数"。
   */
  guestCaptureCount: number;
}

export type ConflictAction =
  /**
   * M4：push-to-original 改名为 defer-to-original，语义更准确——
   * 当前 session 并不真的"推送给原账号"，只是把该条目标为 captured + awaiting_original_account
   * lastError，等原账号未来登录后 worker 才会真正推送。
   *
   * 旧别名 "push-to-original" 继续保留以兼容调用方；新代码应使用 "defer-to-original"。
   */
  | "defer-to-original"
  | "push-to-original"
  /** 保留本地：不做任何修改（等待原账号下次登录） */
  | "keep-local"
  /** 删除：把冲突条目从 captureStore 中硬删 */
  | "delete";

export interface GuestClaimDeps {
  /** 当前登录用户 id（不传从默认取） */
  userId: string;
  store?: typeof captureStore;
  /** 读取 guest batch id（测试注入） */
  getBatchId?: () => string | null;
  /** 清理 guest batch id（测试注入） */
  clearBatch?: () => void;
  /** 触发同步（测试注入） */
  triggerSync?: () => void;
  /**
   * P0.1：读取"上一次登录的 user id"（测试注入）。
   * 若与 deps.userId 不一致，claim 会跳过自动归属并要求用户知情同意。
   */
  getLastLoggedInUserId?: () => string | null;
}

/**
 * 登录成功后调用一次。
 *
 * 流程：
 *   1. 读取当前 guest batch id；若不存在 → 只做冲突探测，直接返回 claimed=0
 *   2. 用 batch id 拉出所有属于该 batch 的 guest 条目
 *   3. 冲突探测：listUnsynced 中是否存在 userId !== null && userId !== <login user id>
 *   4. 批量 update(localId, { userId, guestBatchId: null })
 *   5. clearGuestBatchId() + triggerSync()
 *   6. 返回 { claimed, conflict }
 */
export async function claimGuestCapturesOnLogin(
  deps: GuestClaimDeps,
): Promise<ClaimResult> {
  const store = deps.store ?? captureStore;
  const getBatch = deps.getBatchId ?? peekGuestBatchId;
  const clearBatch = deps.clearBatch ?? clearGuestBatchId;
  const trigger = deps.triggerSync ?? defaultTriggerSync;
  const getLastUserId = deps.getLastLoggedInUserId ?? getLastLoggedInUserId;

  // 1) 冲突探测：先扫一遍未同步条目（忽略租约），定位其他账号的孤儿。
  //    M4 修复：此前用 listUnsynced，租约期内的 syncing 条目会被过滤掉，漏报冲突。
  //    使用 listNeedsOwnershipResolution 绕过租约过滤。
  let unsynced: CaptureRecord[] = [];
  try {
    const withResolver =
      (store as typeof captureStore & {
        listNeedsOwnershipResolution?: () => Promise<CaptureRecord[]>;
      }).listNeedsOwnershipResolution;
    unsynced = withResolver
      ? await withResolver.call(store)
      : await store.listUnsynced();
  } catch {
    unsynced = [];
  }
  const conflict = unsynced.filter(
    (r) => r.userId !== null && r.userId !== deps.userId,
  );

  // 2) 读 batch
  const batchId = getBatch();
  if (!batchId) {
    // 无 guest batch：依然返回冲突列表（其他账号的孤儿），但没有可回填的条目
    return {
      claimed: 0,
      conflict,
      requiresUserConsent: false,
      guestCaptureCount: 0,
    };
  }

  // 3) 拉本 batch 下的 guest 条目
  let guestCaps: CaptureRecord[] = [];
  try {
    guestCaps = await store.listByGuestBatch(batchId);
  } catch {
    guestCaps = [];
  }

  // 4) P0.1（C1/C2）：跨真实自然人隐私泄漏防护——
  //    若本设备上一次登录的 user id 存在且不等于当前 user id，
  //    说明 guest batch 可能是"另一个人"在空档期捕获的，拒绝自动归属。
  //    UI 层需弹窗让用户明确选择；用户确认后再调 `confirmClaimGuestCaptures`。
  const lastUserId = getLastUserId();
  if (lastUserId !== null && lastUserId !== deps.userId && guestCaps.length > 0) {
    return {
      claimed: 0,
      conflict,
      requiresUserConsent: true,
      guestCaptureCount: guestCaps.length,
    };
  }

  // 5) 批量回填
  const { claimed, allFailed } = await claimBatchCaptures(store, deps.userId, guestCaps);

  // 6) 清 batch + 唤醒同步
  //    M8 修复：若 guest batch 非空但全部 update 失败（罕见 IndexedDB 故障），
  //    不清 batch——下次 claim 仍能看到这批数据，避免变成永久孤儿。
  const shouldClearBatch = guestCaps.length === 0 || !allFailed;
  if (shouldClearBatch) {
    try {
      clearBatch();
    } catch {
      // 忽略
    }
  }
  try {
    trigger();
  } catch {
    // 忽略
  }

  return {
    claimed,
    conflict,
    requiresUserConsent: false,
    guestCaptureCount: guestCaps.length,
  };
}

/**
 * P0.1：用户在"跨账号使用"弹窗中点了"确认导入"后调用。
 *
 * 该函数跳过 last-logged-in-user 校验，直接强制 claim 当前 batch。
 * UI 层必须保证"弹窗已清楚告知用户本设备曾被其他账号使用"再调用此函数。
 */
export async function confirmClaimGuestCaptures(
  userId: string,
  batchId: string,
  deps: Omit<GuestClaimDeps, "userId" | "getBatchId" | "getLastLoggedInUserId"> = {},
): Promise<{ claimed: number }> {
  const store = deps.store ?? captureStore;
  const clearBatch = deps.clearBatch ?? clearGuestBatchId;
  const trigger = deps.triggerSync ?? defaultTriggerSync;

  let guestCaps: CaptureRecord[] = [];
  try {
    guestCaps = await store.listByGuestBatch(batchId);
  } catch {
    guestCaps = [];
  }

  const { claimed, allFailed } = await claimBatchCaptures(store, userId, guestCaps);

  // M8：全部失败 → 不清 batch（避免孤儿）
  const shouldClearBatch = guestCaps.length === 0 || !allFailed;
  if (shouldClearBatch) {
    try {
      clearBatch();
    } catch {
      // 忽略
    }
  }
  try {
    trigger();
  } catch {
    // 忽略
  }

  return { claimed };
}

/**
 * 内部工具：批量把 guest 条目归属到 userId。
 *
 * 返回 `allFailed`：当 guestCaps 非空但每一条的 update 都抛了**非** CaptureNotFoundError
 * 的异常时为 true——由上层决定是否 clearBatch（M8 修复）。
 */
async function claimBatchCaptures(
  store: typeof captureStore,
  userId: string,
  guestCaps: CaptureRecord[],
): Promise<{ claimed: number; allFailed: boolean }> {
  let claimed = 0;
  let hardFailures = 0;
  for (const cap of guestCaps) {
    try {
      await store.update(cap.localId, {
        userId,
        guestBatchId: null,
      });
      claimed += 1;
    } catch (e) {
      if (e instanceof CaptureNotFoundError) {
        // 条目已被删除 → 跳过（不计入硬失败）
        continue;
      }
      // 真实 IDB 异常：计入硬失败
      hardFailures += 1;
    }
  }
  const allFailed = guestCaps.length > 0 && claimed === 0 && hardFailures > 0;
  return { claimed, allFailed };
}

/**
 * 用户在冲突弹窗中选择一个动作后调用。
 *
 * action:
 *   - "push-to-original"  → 保持 userId 不变，重置 retry 计数并触发同步；
 *                           当前 session 下 push 会被 pushCapture 的 subject_mismatch
 *                           分支拒推并保留 captured，等原账号登录后处理。
 *   - "keep-local"        → 不做任何修改
 *   - "delete"            → 批量硬删除
 */
export async function resolveConflict(
  action: ConflictAction,
  conflicts: CaptureRecord[],
  deps: { store?: typeof captureStore; triggerSync?: () => void } = {},
): Promise<void> {
  const store = deps.store ?? captureStore;
  const trigger = deps.triggerSync ?? defaultTriggerSync;

  if (action === "keep-local") {
    return;
  }

  if (action === "delete") {
    for (const c of conflicts) {
      try {
        await store.delete(c.localId);
      } catch {
        // 已不存在 → 忽略
      }
    }
    return;
  }

  if (action === "push-to-original") {
    // 不改 userId，仅重置 retry 计数让 worker 可以再尝试（当前 session 会被拒推）
    for (const c of conflicts) {
      try {
        await store.update(c.localId, {
          syncStatus: "captured",
          retryCount: 0,
          lastError: "awaiting_original_account",
        });
      } catch (e) {
        if (e instanceof CaptureNotFoundError) continue;
        // 其他异常忽略
      }
    }
    try {
      trigger();
    } catch {
      // 忽略
    }
    return;
  }

  // 未知 action 兜底
  const _exhaustive: never = action;
  void _exhaustive;
}
