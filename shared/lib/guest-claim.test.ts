/**
 * guest-claim 单元测试
 *
 * regression: fix-cold-resume-silent-loss (Phase 8)
 *
 * 覆盖 spec §4.3 第 3-4 点：
 *   - 无冲突 → 批量回填 userId / 清 guestBatchId / 清 batch / 触发 sync
 *   - 有冲突 → 返回冲突列表（captured/syncing 属于其他账号的条目）
 *   - resolveConflict: push-to-original / keep-local / delete
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import "fake-indexeddb/auto";
import {
  captureStore,
  __internal as captureInternal,
  type CaptureRecord,
} from "./capture-store";
import {
  claimGuestCapturesOnLogin,
  resolveConflict,
} from "./guest-claim";

async function resetDB(): Promise<void> {
  await new Promise<void>((resolve) => {
    const req = indexedDB.deleteDatabase(captureInternal.DB_NAME);
    req.onsuccess = () => resolve();
    req.onerror = () => resolve();
    req.onblocked = () => resolve();
  });
}

describe("guest-claim [regression: fix-cold-resume-silent-loss Phase 8]", () => {
  beforeEach(async () => {
    await resetDB();
  });

  it("should_rebind_userId_and_clear_guestBatchId_on_login_without_conflict", async () => {
    // Given: 两条未归属的 guest 条目属于同一 batch
    const c1 = await captureStore.create({
      kind: "diary", text: "x", audioLocalId: null,
      sourceContext: "fab", forceCommand: false, notebook: null,
      userId: null, guestBatchId: "batch-A",
    });
    const c2 = await captureStore.create({
      kind: "chat_user_msg", text: "y", audioLocalId: null,
      sourceContext: "chat_view", forceCommand: false, notebook: null,
      userId: null, guestBatchId: "batch-A",
    });
    const trigger = vi.fn();
    const clearBatch = vi.fn();

    const res = await claimGuestCapturesOnLogin({
      userId: "u-new",
      getBatchId: () => "batch-A",
      clearBatch,
      triggerSync: trigger,
    });

    expect(res.claimed).toBe(2);
    expect(res.conflict).toEqual([]);

    const r1 = await captureStore.get(c1.localId);
    expect(r1?.userId).toBe("u-new");
    expect(r1?.guestBatchId).toBeNull();
    const r2 = await captureStore.get(c2.localId);
    expect(r2?.userId).toBe("u-new");
    expect(r2?.guestBatchId).toBeNull();

    expect(clearBatch).toHaveBeenCalledTimes(1);
    expect(trigger).toHaveBeenCalledTimes(1);
  });

  it("should_return_conflict_list_when_previous_account_has_unsynced_captures", async () => {
    // Given: 有一条属于上一个账号 u-old 的未同步条目
    await captureStore.create({
      kind: "diary", text: "orphan", audioLocalId: null,
      sourceContext: "fab", forceCommand: false, notebook: null,
      userId: "u-old",
    });
    // 也有当前 guest 批次的条目
    await captureStore.create({
      kind: "diary", text: "mine", audioLocalId: null,
      sourceContext: "fab", forceCommand: false, notebook: null,
      userId: null, guestBatchId: "batch-A",
    });

    const res = await claimGuestCapturesOnLogin({
      userId: "u-new",
      getBatchId: () => "batch-A",
      clearBatch: () => {},
      triggerSync: () => {},
    });

    expect(res.claimed).toBe(1);
    expect(res.conflict).toHaveLength(1);
    expect(res.conflict[0]!.userId).toBe("u-old");
    expect(res.conflict[0]!.text).toBe("orphan");
  });

  it("should_not_treat_same_user_orphans_as_conflict", async () => {
    // 属于"当前登录用户"的未同步条目（例如上次会话没推完）不是冲突
    await captureStore.create({
      kind: "diary", text: "mine-from-last-session", audioLocalId: null,
      sourceContext: "fab", forceCommand: false, notebook: null,
      userId: "u-new",
    });

    const res = await claimGuestCapturesOnLogin({
      userId: "u-new",
      getBatchId: () => null, // 无 batch 时仍能检测冲突
      clearBatch: () => {},
      triggerSync: () => {},
    });

    expect(res.claimed).toBe(0);
    expect(res.conflict).toHaveLength(0);
  });

  it("should_trigger_sync_after_successful_claim", async () => {
    await captureStore.create({
      kind: "diary", text: "g", audioLocalId: null,
      sourceContext: "fab", forceCommand: false, notebook: null,
      userId: null, guestBatchId: "batch-A",
    });
    const trigger = vi.fn();
    await claimGuestCapturesOnLogin({
      userId: "u-new",
      getBatchId: () => "batch-A",
      clearBatch: () => {},
      triggerSync: trigger,
    });
    expect(trigger).toHaveBeenCalledTimes(1);
  });

  it("should_return_empty_when_no_guest_batch_and_no_conflict", async () => {
    const res = await claimGuestCapturesOnLogin({
      userId: "u-new",
      getBatchId: () => null,
      clearBatch: () => {},
      triggerSync: () => {},
    });
    expect(res.claimed).toBe(0);
    expect(res.conflict).toHaveLength(0);
  });

  it("should_skip_missing_captures_during_claim", async () => {
    // 创建一条 guest 条目，然后 delete 它，再 claim — 应不抛错
    const c = await captureStore.create({
      kind: "diary", text: "ghost", audioLocalId: null,
      sourceContext: "fab", forceCommand: false, notebook: null,
      userId: null, guestBatchId: "batch-A",
    });
    // 模拟：listByGuestBatch 拿到一条，但它已被删
    const fakeStore = {
      ...captureStore,
      listByGuestBatch: async (_id: string) => [c as CaptureRecord],
      listUnsynced: async () => [],
      update: async (id: string) => {
        // 抛 CaptureNotFoundError
        const { CaptureNotFoundError } = await import("./capture-store");
        throw new CaptureNotFoundError(id);
      },
    } as unknown as typeof captureStore;

    const res = await claimGuestCapturesOnLogin({
      userId: "u-new",
      store: fakeStore,
      getBatchId: () => "batch-A",
      clearBatch: () => {},
      triggerSync: () => {},
    });
    expect(res.claimed).toBe(0);
    expect(res.conflict).toEqual([]);
  });

  // ── resolveConflict ──

  it("should_not_modify_captures_when_resolveConflict_action_is_keep_local", async () => {
    const c = await captureStore.create({
      kind: "diary", text: "orphan", audioLocalId: null,
      sourceContext: "fab", forceCommand: false, notebook: null,
      userId: "u-old",
    });
    const before = await captureStore.get(c.localId);

    await resolveConflict("keep-local", [before!]);

    const after = await captureStore.get(c.localId);
    expect(after).toEqual(before);
  });

  it("should_delete_captures_when_resolveConflict_action_is_delete", async () => {
    const c1 = await captureStore.create({
      kind: "diary", text: "o1", audioLocalId: null,
      sourceContext: "fab", forceCommand: false, notebook: null,
      userId: "u-old",
    });
    const c2 = await captureStore.create({
      kind: "diary", text: "o2", audioLocalId: null,
      sourceContext: "fab", forceCommand: false, notebook: null,
      userId: "u-old",
    });

    await resolveConflict("delete", [c1, c2]);

    expect(await captureStore.get(c1.localId)).toBeNull();
    expect(await captureStore.get(c2.localId)).toBeNull();
  });

  it("should_mark_awaiting_original_account_when_push_to_original", async () => {
    const c = await captureStore.create({
      kind: "diary", text: "o", audioLocalId: null,
      sourceContext: "fab", forceCommand: false, notebook: null,
      userId: "u-old",
    });
    // 置一个 retryCount 让我们断言重置
    await captureStore.update(c.localId, { retryCount: 3, lastError: "previous" });
    const fresh = await captureStore.get(c.localId);
    const trigger = vi.fn();

    await resolveConflict("push-to-original", [fresh!], { triggerSync: trigger });

    const after = await captureStore.get(c.localId);
    expect(after?.userId).toBe("u-old");  // 不改 userId
    expect(after?.syncStatus).toBe("captured");
    expect(after?.retryCount).toBe(0);
    expect(after?.lastError).toBe("awaiting_original_account");
    expect(trigger).toHaveBeenCalledTimes(1);
  });
});
