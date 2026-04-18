/**
 * sync-orchestrator 单元测试
 *
 * regression: fix-cold-resume-silent-loss
 *
 * 覆盖场景：
 *   §4.1 ensureGatewaySession 单飞，不阻塞捕获
 *   §4.2 串行推送 + debounce coalesce + per-localId dedupe
 *   §4.4 同步失败分类（401 refresh 上限 / 网络重试 / 永久失败）
 *
 * Critical 修复覆盖：
 *   C1: update() 对不存在 row 抛 CaptureNotFoundError + worker 吸收
 *   C2: 401 按 subject 隔离计数
 *   C3: flushNow 等待 in-flight worker
 *   C4: listUnsynced / update("syncing") TOCTOU 防护
 *
 * Major 修复覆盖：
 *   M1: ensureGatewaySession TOCTOU 单飞
 *   M3: pushCapture 超时
 *   M5: 401 分支不二次 refreshAuth
 *   M6: listUnsynced 不返回 failed
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import "fake-indexeddb/auto";
import {
  captureStore,
  CaptureNotFoundError,
  __internal as captureInternal,
  type CaptureRecord,
} from "./capture-store";
import { createSyncOrchestrator, type PushResult } from "./sync-orchestrator";

async function resetDB(): Promise<void> {
  await new Promise<void>((resolve) => {
    const req = indexedDB.deleteDatabase(captureInternal.DB_NAME);
    req.onsuccess = () => resolve();
    req.onerror = () => resolve();
    req.onblocked = () => resolve();
  });
}

function makeOpts(overrides: Partial<Parameters<typeof createSyncOrchestrator>[0]> = {}) {
  return {
    refreshAuth: vi.fn(async () => ({ ok: true, subject: "u-1" as string | null })),
    ensureWs: vi.fn().mockResolvedValue(true),
    pushCapture: vi.fn(async (c): Promise<PushResult> => ({ serverId: `srv-${c.localId}` })),
    pushIntervalMs: 0,  // 测试中去除节流
    debounceMs: 10,
    ...overrides,
  };
}

describe("syncOrchestrator [regression: fix-cold-resume-silent-loss]", () => {
  beforeEach(async () => {
    vi.useRealTimers();
    await resetDB();
  });

  it("should_push_single_capture_when_one_unsynced_record_exists", async () => {
    const rec = await captureStore.create({
      kind: "chat_user_msg", text: "hello", audioLocalId: null,
      sourceContext: "chat_view", forceCommand: false, notebook: null, userId: "u-1",
    });
    const opts = makeOpts();
    const orch = createSyncOrchestrator(opts);

    await orch.flushNow();

    expect(opts.pushCapture).toHaveBeenCalledTimes(1);
    const after = await captureStore.get(rec.localId);
    expect(after?.syncStatus).toBe("synced");
    expect(after?.serverId).toBe(`srv-${rec.localId}`);
  });

  it("should_skip_capture_when_userId_is_null", async () => {
    await captureStore.create({
      kind: "diary", text: null, audioLocalId: null,
      sourceContext: "fab", forceCommand: false, notebook: null, userId: null,
    });
    const opts = makeOpts();
    const orch = createSyncOrchestrator(opts);

    await orch.flushNow();

    expect(opts.pushCapture).not.toHaveBeenCalled();
  });

  it("should_push_in_createdAt_order_when_multiple_captures", async () => {
    const a = await captureStore.create({
      kind: "chat_user_msg", text: "1", audioLocalId: null,
      sourceContext: "chat_view", forceCommand: false, notebook: null, userId: "u-1",
    });
    await new Promise((r) => setTimeout(r, 5));
    const b = await captureStore.create({
      kind: "chat_user_msg", text: "2", audioLocalId: null,
      sourceContext: "chat_view", forceCommand: false, notebook: null, userId: "u-1",
    });
    const callOrder: string[] = [];
    const opts = makeOpts({
      pushCapture: vi.fn(async (c) => {
        callOrder.push(c.localId);
        return { serverId: `srv-${c.localId}` };
      }),
    });
    const orch = createSyncOrchestrator(opts);

    await orch.flushNow();

    expect(callOrder).toEqual([a.localId, b.localId]);
  });

  it("should_mark_captured_retry_when_network_error_occurs", async () => {
    const rec = await captureStore.create({
      kind: "chat_user_msg", text: "net-fail", audioLocalId: null,
      sourceContext: "chat_view", forceCommand: false, notebook: null, userId: "u-1",
    });
    const opts = makeOpts({
      pushCapture: vi.fn(async () => {
        throw { code: "network", message: "offline" };
      }),
    });
    const orch = createSyncOrchestrator(opts);

    await orch.flushNow();

    const after = await captureStore.get(rec.localId);
    expect(after?.syncStatus).toBe("captured");
    expect(after?.retryCount).toBe(1);
    expect(after?.lastError).toBe("offline");
  });

  it("should_mark_failed_when_400_bad_request", async () => {
    const rec = await captureStore.create({
      kind: "chat_user_msg", text: "bad", audioLocalId: null,
      sourceContext: "chat_view", forceCommand: false, notebook: null, userId: "u-1",
    });
    const opts = makeOpts({
      pushCapture: vi.fn(async () => {
        throw { status: 400, message: "schema invalid" };
      }),
    });
    const orch = createSyncOrchestrator(opts);

    await orch.flushNow();

    const after = await captureStore.get(rec.localId);
    expect(after?.syncStatus).toBe("failed");
    expect(after?.retryCount).toBe(1);
  });

  it("should_trigger_refresh_on_401_and_mark_captured_until_exhausted", async () => {
    // §4.4 401 连续失败 3 次 → 标 failed + auth_refresh_exhausted
    // T4: refreshAuth 精确只被调用 3 次（每轮 ensureGatewaySession 各 1 次；
    //     M5 修复后 401 分支内不再二次调用 refreshAuth）
    const rec = await captureStore.create({
      kind: "chat_user_msg", text: "auth", audioLocalId: null,
      sourceContext: "chat_view", forceCommand: false, notebook: null, userId: "u-1",
    });
    const opts = makeOpts({
      pushCapture: vi.fn(async () => {
        throw { status: 401, message: "unauthorized" };
      }),
    });
    const orch = createSyncOrchestrator(opts);

    await orch.flushNow();
    let after = await captureStore.get(rec.localId);
    expect(after?.syncStatus).toBe("captured");

    await orch.flushNow();
    after = await captureStore.get(rec.localId);
    expect(after?.syncStatus).toBe("captured");

    await orch.flushNow();
    after = await captureStore.get(rec.localId);
    expect(after?.syncStatus).toBe("failed");
    expect(after?.lastError).toBe("auth_refresh_exhausted");

    // T4：三次 flushNow，每次 ensureGatewaySession 刷新一次 subject。
    expect(opts.refreshAuth).toHaveBeenCalledTimes(3);
  });

  it("should_not_push_when_ensureWs_fails", async () => {
    await captureStore.create({
      kind: "chat_user_msg", text: "offline", audioLocalId: null,
      sourceContext: "chat_view", forceCommand: false, notebook: null, userId: "u-1",
    });
    const opts = makeOpts({
      ensureWs: vi.fn().mockResolvedValue(false),
    });
    const orch = createSyncOrchestrator(opts);

    await orch.flushNow();

    expect(opts.pushCapture).not.toHaveBeenCalled();
  });

  it("should_debounce_multiple_triggers_into_single_scan", async () => {
    // T1: 证明 debounce 真生效——push 处理手动 pending，期间多次 trigger 只启动一次扫描
    await captureStore.create({
      kind: "chat_user_msg", text: "a", audioLocalId: null,
      sourceContext: "chat_view", forceCommand: false, notebook: null, userId: "u-1",
    });

    let resolvePush!: (v: PushResult) => void;
    const pushCapture = vi.fn((): Promise<PushResult> => {
      return new Promise<PushResult>((r) => {
        resolvePush = r;
      });
    });

    const opts = makeOpts({ debounceMs: 30, pushCapture });
    const orch = createSyncOrchestrator(opts);

    orch.triggerSync();
    orch.triggerSync();
    orch.triggerSync();

    // 等 debounce 窗口 + worker 启动
    await new Promise((r) => setTimeout(r, 60));

    expect(pushCapture).toHaveBeenCalledTimes(1);

    // 期间再次 trigger（应被吸收进 hasPendingScan）
    orch.triggerSync();
    orch.triggerSync();
    await new Promise((r) => setTimeout(r, 60));

    // push 仍然只被调用 1 次（还 pending）
    expect(pushCapture).toHaveBeenCalledTimes(1);

    // 解除 pending → worker 完成
    resolvePush({ serverId: "srv-a" });
    await new Promise((r) => setTimeout(r, 100));
  });

  it("should_dedupe_when_same_localId_not_pushed_twice", async () => {
    // T2: dedupe——用手动 pending push 验证 listUnsynced 只被扫 1 次（没有重复 push 同一条）
    const rec = await captureStore.create({
      kind: "chat_user_msg", text: "dup", audioLocalId: null,
      sourceContext: "chat_view", forceCommand: false, notebook: null, userId: "u-1",
    });

    let resolvePush!: (v: PushResult) => void;
    const pushCapture = vi.fn((): Promise<PushResult> => {
      return new Promise<PushResult>((r) => {
        resolvePush = r;
      });
    });

    const opts = makeOpts({ debounceMs: 5, pushCapture });
    const orch = createSyncOrchestrator(opts);

    // 启动 worker（非阻塞）
    const flushP = orch.flushNow();
    await new Promise((r) => setTimeout(r, 20));

    // push 正在 pending；再触发多次
    orch.triggerSync();
    orch.triggerSync();
    await new Promise((r) => setTimeout(r, 30));

    // per-localId dedupe：push 仍只被调用 1 次
    expect(pushCapture).toHaveBeenCalledTimes(1);

    // 解除 pending
    resolvePush({ serverId: `srv-${rec.localId}` });
    await flushP;
    await new Promise((r) => setTimeout(r, 50));

    const after = await captureStore.get(rec.localId);
    expect(after?.syncStatus).toBe("synced");
  });

  it("should_not_push_synced_records", async () => {
    const rec = await captureStore.create({
      kind: "chat_user_msg", text: "already", audioLocalId: null,
      sourceContext: "chat_view", forceCommand: false, notebook: null, userId: "u-1",
    });
    await captureStore.update(rec.localId, { syncStatus: "synced", serverId: "srv-x" });
    const opts = makeOpts();
    const orch = createSyncOrchestrator(opts);

    await orch.flushNow();

    expect(opts.pushCapture).not.toHaveBeenCalled();
  });

  it("should_skip_failed_records_from_listUnsynced", async () => {
    // M6: listUnsynced 不返回 failed，worker 不再自动重试 failed 条目
    const rec = await captureStore.create({
      kind: "chat_user_msg", text: "dead", audioLocalId: null,
      sourceContext: "chat_view", forceCommand: false, notebook: null, userId: "u-1",
    });
    await captureStore.update(rec.localId, {
      syncStatus: "failed",
      retryCount: 5,
      lastError: "exhausted",
    });
    const opts = makeOpts();
    const orch = createSyncOrchestrator(opts);

    await orch.flushNow();

    expect(opts.pushCapture).not.toHaveBeenCalled();

    // 用户手动 retry → 应能重新推送
    await captureStore.retryCapture(rec.localId);
    await orch.flushNow();
    expect(opts.pushCapture).toHaveBeenCalledTimes(1);
  });

  // ─── C1/C4: TOCTOU 与 CaptureNotFoundError ───────────────────

  it("should_skip_when_capture_deleted_during_worker [C1/C4]", async () => {
    // C4：worker 从 listUnsynced 到 update 之间，记录被删除。
    // C1：update 抛 CaptureNotFoundError，worker 必须吸收并 continue。
    const a = await captureStore.create({
      kind: "chat_user_msg", text: "a", audioLocalId: null,
      sourceContext: "chat_view", forceCommand: false, notebook: null, userId: "u-1",
    });
    const b = await captureStore.create({
      kind: "chat_user_msg", text: "b", audioLocalId: null,
      sourceContext: "chat_view", forceCommand: false, notebook: null, userId: "u-1",
    });

    const pushCapture = vi.fn(async (c: CaptureRecord) => ({ serverId: `srv-${c.localId}` }));
    const opts = makeOpts({ pushCapture });
    // 替换：在 listUnsynced 返回后、worker 处理前，偷偷删除 a
    const origList = captureStore.listUnsynced;
    const listSpy = vi.spyOn(captureStore, "listUnsynced").mockImplementation(async () => {
      const list = await origList.call(captureStore);
      // 删除 a（模拟 TOCTOU：列表存在但处理前被清理）
      await captureStore.delete(a.localId);
      return list;
    });

    const orch = createSyncOrchestrator(opts);
    await orch.flushNow();

    // a 被跳过；b 成功
    expect(pushCapture).toHaveBeenCalledTimes(1);
    const pushedIds = pushCapture.mock.calls.map((call) => call[0].localId);
    expect(pushedIds).toContain(b.localId);
    expect(pushedIds).not.toContain(a.localId);

    listSpy.mockRestore();
  });

  it("should_throw_CaptureNotFoundError_when_update_missing_row", async () => {
    // C1: update 对不存在的 row 抛 CaptureNotFoundError
    await expect(captureStore.update("nonexistent", { syncStatus: "synced" }))
      .rejects.toBeInstanceOf(CaptureNotFoundError);
  });

  // ─── C2: 401 计数按 subject 隔离 ─────────────────────────────

  it("should_reset_auth_count_when_subject_changes [C2]", async () => {
    const rec1 = await captureStore.create({
      kind: "chat_user_msg", text: "u1", audioLocalId: null,
      sourceContext: "chat_view", forceCommand: false, notebook: null, userId: "u-1",
    });

    let subject: string = "u-1";
    const refreshAuth = vi.fn(async () => ({ ok: true, subject }));
    const opts = makeOpts({
      refreshAuth,
      pushCapture: vi.fn(async () => {
        throw { status: 401, message: "unauthorized" };
      }),
    });
    const orch = createSyncOrchestrator(opts);

    // 两次 401（u-1） → authRefreshCount = 2
    await orch.flushNow();
    await orch.flushNow();
    let rec = await captureStore.get(rec1.localId);
    expect(rec?.syncStatus).toBe("captured"); // 未达上限

    // 切换 subject 到 u-2
    subject = "u-2";
    await orch.flushNow();

    // 因为 subject 切换，计数被重置；这一轮又是 +1 = 1，未到 3
    rec = await captureStore.get(rec1.localId);
    expect(rec?.syncStatus).toBe("captured");
  });

  // ─── C3: flushNow 等待 in-flight worker ──────────────────────

  it("should_serialize_when_flushNow_called_during_running_worker [C3]", async () => {
    await captureStore.create({
      kind: "chat_user_msg", text: "a", audioLocalId: null,
      sourceContext: "chat_view", forceCommand: false, notebook: null, userId: "u-1",
    });

    let resolvePush!: (v: PushResult) => void;
    const pushCapture = vi.fn((): Promise<PushResult> => {
      return new Promise<PushResult>((r) => {
        resolvePush = r;
      });
    });

    const opts = makeOpts({ pushCapture });
    const orch = createSyncOrchestrator(opts);

    const p1 = orch.flushNow();
    await new Promise((r) => setTimeout(r, 20));

    // 在 worker 运行中调用第二次 flushNow，必须等待而非吞掉
    const p2 = orch.flushNow();

    // p2 应该是一个 pending promise，不会同步完成
    let p2Resolved = false;
    p2.then(() => { p2Resolved = true; });
    await new Promise((r) => setTimeout(r, 10));
    expect(p2Resolved).toBe(false);

    resolvePush({ serverId: "srv-a" });
    await p1;
    await p2;
    expect(p2Resolved).toBe(true);
  });

  // ─── M1: ensureGatewaySession TOCTOU 单飞 ───────────────────

  it("should_dedupe_ensureGatewaySession_when_called_concurrently [M1]", async () => {
    // M1: 同一 tick 内 3 次 flushNow 并发调用
    // - 第 1 次进入 runWorker 并同步置 running=true
    // - 第 2/3 次看到 running=true，走 "等待已有 worker promise" 分支（C3）
    // - 同时设置 hasPendingScan=true，触发 worker 额外一轮
    // - ensureGatewaySession 单飞保证：同一 tick 多次调用共享一个 promise
    //   但 worker 本身会在下一轮迭代再次调用它（那是预期的多轮扫描）
    //
    // 这里断言：3 次并发 flushNow 总共最多触发 2 轮 refreshAuth（首轮 + hasPendingScan 补扫一次）
    await captureStore.create({
      kind: "chat_user_msg", text: "a", audioLocalId: null,
      sourceContext: "chat_view", forceCommand: false, notebook: null, userId: "u-1",
    });

    const refreshAuth = vi.fn(async () => {
      await new Promise((r) => setTimeout(r, 10));
      return { ok: true, subject: "u-1" };
    });
    const opts = makeOpts({ refreshAuth });
    const orch = createSyncOrchestrator(opts);

    await Promise.all([orch.flushNow(), orch.flushNow(), orch.flushNow()]);

    // 若 ensureGatewaySession 未单飞，3 次并发调用会各自触发 refreshAuth（3 次以上）
    // 单飞保证同 tick 内只有一个 in-flight promise，
    // 但 worker 的 hasPendingScan 复扫会触发第 2 次 ensureGatewaySession。
    // 因此期望值是 ≤ 2。
    expect(refreshAuth.mock.calls.length).toBeLessThanOrEqual(2);
    expect(refreshAuth.mock.calls.length).toBeGreaterThanOrEqual(1);
  });

  it("should_single_flight_ensureGatewaySession_across_tick_boundary [M1]", async () => {
    // 更直接的 M1 TOCTOU 测试：两次 flushNow 中间让第一个在 ensureSession
    // 的 await 点让出控制权，此时第二次 flushNow 观察到的是同一个 in-flight promise。
    await captureStore.create({
      kind: "chat_user_msg", text: "a", audioLocalId: null,
      sourceContext: "chat_view", forceCommand: false, notebook: null, userId: "u-1",
    });

    let refreshCount = 0;
    const refreshAuth = vi.fn(async () => {
      refreshCount += 1;
      // 让出控制权给并发 flushNow
      await new Promise((r) => setTimeout(r, 20));
      return { ok: true, subject: "u-1" };
    });

    // push 也要 pending 保持 worker 存活
    let resolvePush!: (v: PushResult) => void;
    const pushCapture = vi.fn((): Promise<PushResult> => {
      return new Promise<PushResult>((r) => {
        resolvePush = r;
      });
    });

    const opts = makeOpts({ refreshAuth, pushCapture });
    const orch = createSyncOrchestrator(opts);

    const p1 = orch.flushNow();
    // 等 refreshAuth 进入 await，但未返回
    await new Promise((r) => setTimeout(r, 5));

    const p2 = orch.flushNow();

    // p2 因为 state.running 已 true，走等待当前 worker 分支
    // （C3）；不应独立触发一次新的 refreshAuth

    await new Promise((r) => setTimeout(r, 30));
    resolvePush({ serverId: "srv-a" });
    await p1;
    await p2;

    // 单飞保证：refreshAuth 只被触发 1 次（push 结束，worker 退出；
    // 若 hasPendingScan 触发第二轮是允许的，但 ≤2 次即合格）
    expect(refreshCount).toBeLessThanOrEqual(2);
  });

  // ─── M3: pushCapture 超时 ───────────────────────────────────

  // ─── C2: subject_mismatch 不增加 retryCount ─────────────────

  it("should_not_increment_retryCount_on_subject_mismatch [C2]", async () => {
    const rec = await captureStore.create({
      kind: "diary", text: null, audioLocalId: null,
      sourceContext: "fab", forceCommand: false, notebook: null, userId: "u-A",
    });

    const opts = makeOpts({
      pushCapture: vi.fn(async () => {
        throw {
          code: "subject_mismatch",
          message: "capture owner u-A != current u-B",
        };
      }),
    });
    const orch = createSyncOrchestrator(opts);

    await orch.flushNow();

    const after = await captureStore.get(rec.localId);
    // 保持 captured，**不**增加 retryCount，**不**标 failed
    expect(after?.syncStatus).toBe("captured");
    expect(after?.retryCount).toBe(0);
    expect(after?.lastError).toMatch(/capture owner/);
  });

  // ─── M5: audio_blob_missing warning → 标 synced + 留痕 ────

  it("should_record_audio_blob_missing_warning_on_lastError [M5]", async () => {
    const rec = await captureStore.create({
      kind: "diary", text: null, audioLocalId: "aud-missing",
      sourceContext: "fab", forceCommand: false, notebook: null, userId: "u-1",
    });

    const opts = makeOpts({
      pushCapture: vi.fn(async (c) => ({
        serverId: `srv-${c.localId}`,
        warning: "audio_blob_missing" as const,
      })),
    });
    const orch = createSyncOrchestrator(opts);

    await orch.flushNow();

    const after = await captureStore.get(rec.localId);
    expect(after?.syncStatus).toBe("synced");
    expect(after?.serverId).toBe(`srv-${rec.localId}`);
    expect(after?.lastError).toBe("audio_blob_missing");
  });

  it("should_timeout_and_mark_captured_when_push_exceeds_limit [M3]", async () => {
    const rec = await captureStore.create({
      kind: "chat_user_msg", text: "slow", audioLocalId: null,
      sourceContext: "chat_view", forceCommand: false, notebook: null, userId: "u-1",
    });

    // push 永远不 resolve
    const pushCapture = vi.fn((): Promise<PushResult> => new Promise<PushResult>(() => {}));
    const opts = makeOpts({ pushCapture, pushTimeoutMs: 30 });
    const orch = createSyncOrchestrator(opts);

    await orch.flushNow();

    const after = await captureStore.get(rec.localId);
    // 超时走 network 分支 → 保持 captured, retryCount +1
    expect(after?.syncStatus).toBe("captured");
    expect(after?.retryCount).toBe(1);
    expect(after?.lastError).toMatch(/push_timeout/);
  });
});
