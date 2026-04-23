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
import {
  createSyncOrchestrator,
  startSyncOrchestrator,
  __resetGlobalOrchestratorForTest,
  type PushResult,
} from "./sync-orchestrator";

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

  // ─── C1/C3: worker 在 pushCapture 之前 mark syncing + syncingAt ───

  it("should_mark_syncing_with_syncingAt_before_pushCapture_call [C1/C3]", async () => {
    // 关键不变量：当 pushCapture 被调用时，数据库里该条记录必须已经是 syncing 且
    // syncingAt 是一个有效 ISO 时间戳——否则跨 tab / 同 tab 并发 worker 会双推。
    const rec = await captureStore.create({
      kind: "chat_user_msg", text: "lease", audioLocalId: null,
      sourceContext: "chat_view", forceCommand: false, notebook: null, userId: "u-1",
    });

    let observed: { syncStatus?: string; syncingAt?: string | null } | null = null;
    const opts = makeOpts({
      pushCapture: vi.fn(async (c) => {
        // 在 pushCapture 内部读数据库当前状态
        const fresh = await captureStore.get(c.localId);
        observed = {
          syncStatus: fresh?.syncStatus,
          syncingAt: fresh?.syncingAt,
        };
        return { serverId: `srv-${c.localId}` };
      }),
    });
    const orch = createSyncOrchestrator(opts);
    await orch.flushNow();

    expect(observed).not.toBeNull();
    expect(observed!.syncStatus).toBe("syncing");
    expect(observed!.syncingAt).toBeTruthy();
    // syncingAt 必须是可解析的 ISO 时间戳
    expect(Number.isNaN(Date.parse(observed!.syncingAt as string))).toBe(false);

    // 成功后清理 syncingAt
    const after = await captureStore.get(rec.localId);
    expect(after?.syncStatus).toBe("synced");
    expect(after?.syncingAt).toBeNull();
  });

  it("should_clear_syncingAt_when_push_fails_with_network [C1]", async () => {
    const rec = await captureStore.create({
      kind: "chat_user_msg", text: "nerr", audioLocalId: null,
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
    // 失败回退时必须清理租约，下次 trigger 才能继续重试
    expect(after?.syncingAt).toBeNull();
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

// ──────────────────────────────────────────────────────────────
// Phase 8 §4.3：未登录条目（userId=null）跳过推送，不增加 retryCount
// ──────────────────────────────────────────────────────────────
describe("syncOrchestrator guest skip [regression: fix-cold-resume-silent-loss Phase 8]", () => {
  beforeEach(async () => {
    vi.useRealTimers();
    await resetDB();
  });

  it("should_skip_captures_with_null_userId_without_retry_increment", async () => {
    // Given: 一条 guest 条目（userId=null, guestBatchId 非空）
    const rec = await captureStore.create({
      kind: "diary",
      text: null,
      audioLocalId: null,
      sourceContext: "fab",
      forceCommand: false,
      notebook: null,
      userId: null,
      guestBatchId: "batch-A",
    });
    const opts = makeOpts();
    const orch = createSyncOrchestrator(opts);

    await orch.flushNow();

    // pushCapture 不应被调用（worker 过滤 userId=null）
    expect(opts.pushCapture).not.toHaveBeenCalled();

    // 条目状态保持 captured，retryCount=0，lastError=null
    const after = await captureStore.get(rec.localId);
    expect(after?.syncStatus).toBe("captured");
    expect(after?.retryCount).toBe(0);
    expect(after?.lastError).toBeNull();
    // guestBatchId 保留（等登录后 guest-claim 处理）
    expect(after?.guestBatchId).toBe("batch-A");
  });

  it("should_still_push_logged_in_captures_when_guest_captures_present", async () => {
    // 混合：一条 guest + 一条已登录，worker 只推已登录那条
    await captureStore.create({
      kind: "diary", text: null, audioLocalId: null,
      sourceContext: "fab", forceCommand: false, notebook: null,
      userId: null, guestBatchId: "batch-A",
    });
    const loggedIn = await captureStore.create({
      kind: "chat_user_msg", text: "hi", audioLocalId: null,
      sourceContext: "chat_view", forceCommand: false, notebook: null,
      userId: "u-1",
    });

    const opts = makeOpts();
    const orch = createSyncOrchestrator(opts);

    await orch.flushNow();

    expect(opts.pushCapture).toHaveBeenCalledTimes(1);
    const mockFn = opts.pushCapture as unknown as ReturnType<typeof vi.fn>;
    expect(mockFn.mock.calls[0]![0].localId).toBe(loggedIn.localId);
  });
});

// ─────────────────────────────────────────────────────────────
// §7.2 / §7.5 懒绑定 + 单一真相源
// regression: fix-cold-resume-silent-loss §7
// ─────────────────────────────────────────────────────────────
describe("syncOrchestrator lazy bind [regression: fix-cold-resume-silent-loss §7.2]", () => {
  beforeEach(async () => {
    vi.useRealTimers();
    await resetDB();
    // 清理全局 guest-session 的内存降级态，避免跨测试污染
    const { __resetGuestSessionForTest } = await import("./guest-session");
    __resetGuestSessionForTest();
  });

  it("should_rebind_userId_when_guestBatchId_matches_current_session", async () => {
    const cap = await captureStore.create({
      kind: "chat_user_msg", text: "冷启动首条", audioLocalId: null,
      sourceContext: "chat_view", forceCommand: false, notebook: null,
      userId: null, guestBatchId: "batch-abc",
    });
    const opts = makeOpts({
      getCurrentUser: () => ({ id: "u-99" }),
      peekGuestBatchId: () => "batch-abc",
    });
    const orch = createSyncOrchestrator(opts);

    await orch.flushNow();

    const after = await captureStore.get(cap.localId);
    expect(after?.userId).toBe("u-99");
    expect(after?.guestBatchId).toBeNull();
    expect(after?.syncStatus).toBe("synced");
    expect(opts.pushCapture).toHaveBeenCalledTimes(1);
  });

  it("should_skip_when_guestBatchId_mismatches_current_session", async () => {
    const cap = await captureStore.create({
      kind: "diary", text: null, audioLocalId: null,
      sourceContext: "fab", forceCommand: false, notebook: null,
      userId: null, guestBatchId: "batch-OLD",
    });
    const opts = makeOpts({
      getCurrentUser: () => ({ id: "u-99" }),
      peekGuestBatchId: () => "batch-NEW",
    });
    const orch = createSyncOrchestrator(opts);

    await orch.flushNow();

    const after = await captureStore.get(cap.localId);
    // 跨会话遗留 → 不回填，等 Phase 8.1 claim 流程处理
    expect(after?.userId).toBeNull();
    expect(after?.guestBatchId).toBe("batch-OLD");
    expect(opts.pushCapture).not.toHaveBeenCalled();
  });

  it("should_skip_when_no_current_user_and_leave_entry_intact", async () => {
    const cap = await captureStore.create({
      kind: "chat_user_msg", text: "未登录", audioLocalId: null,
      sourceContext: "chat_view", forceCommand: false, notebook: null,
      userId: null, guestBatchId: "batch-abc",
    });
    const opts = makeOpts({
      getCurrentUser: () => null,
      peekGuestBatchId: () => "batch-abc",
    });
    const orch = createSyncOrchestrator(opts);

    await orch.flushNow();

    const after = await captureStore.get(cap.localId);
    expect(after?.userId).toBeNull();
    expect(after?.guestBatchId).toBe("batch-abc");
    expect(opts.pushCapture).not.toHaveBeenCalled();
  });

  it("should_warn_and_skip_zombie_capture_without_guestBatchId", async () => {
    const cap = await captureStore.create({
      kind: "chat_user_msg", text: "zombie", audioLocalId: null,
      sourceContext: "chat_view", forceCommand: false, notebook: null,
      userId: null, guestBatchId: null,
    });
    const logs: Array<{ level: string; msg: string }> = [];
    const opts = makeOpts({
      getCurrentUser: () => ({ id: "u-99" }),
      peekGuestBatchId: () => "batch-abc",
      logger: (level, msg) => logs.push({ level, msg }),
    });
    const orch = createSyncOrchestrator(opts);

    await orch.flushNow();

    const after = await captureStore.get(cap.localId);
    expect(after?.userId).toBeNull();
    expect(opts.pushCapture).not.toHaveBeenCalled();
    expect(logs.some((l) => l.level === "warn" && l.msg.includes("zombie"))).toBe(true);
  });

  it("should_not_rewrite_userId_on_synced_record_when_lazy_bind_runs", async () => {
    // §7.5：synced 条目 userId 永远不被改写
    // 先走 captureStore.create 触发 schema 初始化，再绕过 update 直接改状态
    const seedCap = await captureStore.create({
      kind: "chat_user_msg", text: "seed", audioLocalId: null,
      sourceContext: "chat_view", forceCommand: false, notebook: null,
      userId: "u-seed",
    });
    // 删掉这条 seed，避免干扰目标 worker
    await captureStore.delete(seedCap.localId);

    const localId = "synced-protected-1";
    await new Promise<void>((resolve, reject) => {
      const req = indexedDB.open(captureInternal.DB_NAME);
      req.onsuccess = () => {
        const db = req.result;
        const tx = db.transaction("captures", "readwrite");
        tx.objectStore("captures").put({
          localId,
          serverId: "srv-already-there",
          kind: "chat_user_msg",
          text: "already synced",
          audioLocalId: null,
          sourceContext: "chat_view",
          forceCommand: false,
          notebook: null,
          userId: null,             // 异常路径写入的"僵尸 synced"
          guestBatchId: "batch-abc",
          createdAt: new Date().toISOString(),
          syncStatus: "synced",
          lastError: null,
          retryCount: 0,
          syncingAt: null,
        } as CaptureRecord);
        tx.oncomplete = () => {
          db.close();
          resolve();
        };
        tx.onerror = () => reject(tx.error);
      };
      req.onerror = () => reject(req.error);
    });

    const opts = makeOpts({
      getCurrentUser: () => ({ id: "u-99" }),
      peekGuestBatchId: () => "batch-abc",
    });
    const orch = createSyncOrchestrator(opts);
    await orch.flushNow();

    const after = await captureStore.get(localId);
    // synced 条目的 userId 保持原值（null），不被懒绑定改写
    expect(after?.userId).toBeNull();
    expect(after?.syncStatus).toBe("synced");
    expect(opts.pushCapture).not.toHaveBeenCalled();
  });

  it("should_leave_userId_null_when_lazy_bind_deps_not_injected_backcompat", async () => {
    // 兼容性：若调用方未注入 getCurrentUser/peekGuestBatchId，行为与旧版一致（跳过）
    const cap = await captureStore.create({
      kind: "chat_user_msg", text: "old path", audioLocalId: null,
      sourceContext: "chat_view", forceCommand: false, notebook: null,
      userId: null, guestBatchId: "batch-abc",
    });
    const opts = makeOpts();  // 不传 getCurrentUser / peekGuestBatchId
    const orch = createSyncOrchestrator(opts);

    await orch.flushNow();

    const after = await captureStore.get(cap.localId);
    expect(after?.userId).toBeNull();
    expect(opts.pushCapture).not.toHaveBeenCalled();
  });
});

// ─────────────────────────────────────────────────────────────
// §8 懒绑定网络无关 + WS open 触发扫描（Phase 11）
// regression: fix-cold-resume-silent-loss §8
// ─────────────────────────────────────────────────────────────
describe("regression: fix-cold-resume-silent-loss §8", () => {
  beforeEach(async () => {
    vi.useRealTimers();
    await resetDB();
    const { __resetGuestSessionForTest } = await import("./guest-session");
    __resetGuestSessionForTest();
    __resetGlobalOrchestratorForTest();
  });

  // ─── 懒绑定不受 ensureGatewaySession 结果门控 ───────────────

  it("should_run_lazy_bind_even_when_ensure_session_returns_false", async () => {
    // Scenario 8.1：即使 ensureGatewaySession=false，懒绑定段仍应执行
    const cap = await captureStore.create({
      kind: "chat_user_msg", text: "cold-resume", audioLocalId: null,
      sourceContext: "chat_view", forceCommand: false, notebook: null,
      userId: null, guestBatchId: "batch-abc",
    });
    const opts = makeOpts({
      ensureWs: vi.fn().mockResolvedValue(false),  // WS 未就绪
      getCurrentUser: () => ({ id: "u-99" }),
      peekGuestBatchId: () => "batch-abc",
    });
    const orch = createSyncOrchestrator(opts);

    await orch.flushNow();

    const after = await captureStore.get(cap.localId);
    // 关键断言：lazy-bind 段在 session 未就绪时仍执行，userId 已被回填
    expect(after?.userId).toBe("u-99");
    expect(after?.guestBatchId).toBeNull();
  });

  it("should_not_push_when_session_not_ready_but_still_lazy_bind", async () => {
    // Scenario 8.1：lazy-bind 完成后因 session 不 OK 退出，不进入推送
    const cap = await captureStore.create({
      kind: "chat_user_msg", text: "no-push", audioLocalId: null,
      sourceContext: "chat_view", forceCommand: false, notebook: null,
      userId: null, guestBatchId: "batch-abc",
    });
    const opts = makeOpts({
      ensureWs: vi.fn().mockResolvedValue(false),
      getCurrentUser: () => ({ id: "u-99" }),
      peekGuestBatchId: () => "batch-abc",
    });
    const orch = createSyncOrchestrator(opts);

    await orch.flushNow();

    const after = await captureStore.get(cap.localId);
    // lazy-bind 已跑
    expect(after?.userId).toBe("u-99");
    // 但 pushCapture 因 sessionOk=false 未被调用
    expect(opts.pushCapture).not.toHaveBeenCalled();
    // 条目保持 captured（不变成 syncing/synced/failed）
    expect(after?.syncStatus).toBe("captured");
  });

  // ─── P0-2：跨账号污染防护（镜像 guest-claim 的 last-logged-in-user 校验）─

  it("should_skip_lazy_bind_when_last_logged_in_user_differs", async () => {
    // P0-2 回归：设备上一次登录是 u-A，当前登录 u-B。guest-batch 下的遗留
    // 条目可能是 u-A 在空档期留下的。懒绑定必须跳过自动归属，等待 UI 同意流程。
    const cap = await captureStore.create({
      kind: "chat_user_msg", text: "cross-account-guard", audioLocalId: null,
      sourceContext: "chat_view", forceCommand: false, notebook: null,
      userId: null, guestBatchId: "batch-leftover",
    });
    const opts = makeOpts({
      getCurrentUser: () => ({ id: "u-B" }),
      peekGuestBatchId: () => "batch-leftover",
      getLastLoggedInUserId: () => "u-A",  // 上一次是 A
    });
    const orch = createSyncOrchestrator(opts);

    await orch.flushNow();

    const after = await captureStore.get(cap.localId);
    // 关键：userId 不被静默划给 u-B
    expect(after?.userId).toBeNull();
    expect(after?.guestBatchId).toBe("batch-leftover");
    // 且未被推送
    expect(opts.pushCapture).not.toHaveBeenCalled();
  });

  it("should_run_lazy_bind_when_last_logged_in_user_matches_current", async () => {
    // P0-2 正向：同一个 user 再次登录（或首次登录后刷新），不应被误伤。
    const cap = await captureStore.create({
      kind: "chat_user_msg", text: "same-user-ok", audioLocalId: null,
      sourceContext: "chat_view", forceCommand: false, notebook: null,
      userId: null, guestBatchId: "batch-same",
    });
    const opts = makeOpts({
      getCurrentUser: () => ({ id: "u-A" }),
      peekGuestBatchId: () => "batch-same",
      getLastLoggedInUserId: () => "u-A",  // 同一个人
    });
    const orch = createSyncOrchestrator(opts);

    await orch.flushNow();

    const after = await captureStore.get(cap.localId);
    expect(after?.userId).toBe("u-A");
    expect(after?.guestBatchId).toBeNull();
  });

  it("should_run_lazy_bind_when_no_previous_user_ever_logged_in", async () => {
    // P0-2 边界：首次使用设备（getLastLoggedInUserId 返回 null）→ 无跨账号风险。
    const cap = await captureStore.create({
      kind: "chat_user_msg", text: "first-time-device", audioLocalId: null,
      sourceContext: "chat_view", forceCommand: false, notebook: null,
      userId: null, guestBatchId: "batch-first",
    });
    const opts = makeOpts({
      getCurrentUser: () => ({ id: "u-A" }),
      peekGuestBatchId: () => "batch-first",
      getLastLoggedInUserId: () => null,
    });
    const orch = createSyncOrchestrator(opts);

    await orch.flushNow();

    const after = await captureStore.get(cap.localId);
    expect(after?.userId).toBe("u-A");
  });

  // ─── subscribeWsStatus 边沿触发 triggerSync ─────────────────

  it("should_trigger_sync_on_ws_status_closed_to_open_edge", async () => {
    // Scenario 8.2：closed → open 边沿触发
    await captureStore.create({
      kind: "chat_user_msg", text: "edge1", audioLocalId: null,
      sourceContext: "chat_view", forceCommand: false, notebook: null,
      userId: "u-1",
    });

    let wsHandler: ((s: "connecting" | "open" | "closed") => void) | null = null;
    const subscribeWsStatus = vi.fn((h: (s: "connecting" | "open" | "closed") => void) => {
      wsHandler = h;
      return () => { wsHandler = null; };
    });
    const getCurrentWsStatus = vi.fn(() => "closed" as const);

    const pushCapture = vi.fn(async (c: CaptureRecord): Promise<PushResult> => ({
      serverId: `srv-${c.localId}`,
    }));

    const stop = startSyncOrchestrator({
      refreshAuth: vi.fn(async () => ({ ok: true, subject: "u-1" })),
      ensureWs: vi.fn().mockResolvedValue(true),
      pushCapture,
      debounceMs: 5,
      pushIntervalMs: 0,
      subscribeWsStatus,
      getCurrentWsStatus,
    });

    // 让初始 trigger 完成
    await new Promise((r) => setTimeout(r, 30));
    const callsBefore = pushCapture.mock.calls.length;

    // 再创建一条 pending capture（绕开 capture:created 触发路径）
    const cap2 = await captureStore.create({
      kind: "chat_user_msg", text: "edge-new", audioLocalId: null,
      sourceContext: "chat_view", forceCommand: false, notebook: null,
      userId: "u-1",
    });

    // 模拟 closed → open 边沿
    expect(wsHandler).not.toBeNull();
    wsHandler!("open");

    // 等 debounce + worker 跑完
    await new Promise((r) => setTimeout(r, 50));

    expect(pushCapture.mock.calls.length).toBeGreaterThan(callsBefore);
    const after = await captureStore.get(cap2.localId);
    expect(after?.syncStatus).toBe("synced");

    stop();
  });

  it("should_trigger_sync_on_ws_status_connecting_to_open_edge", async () => {
    // Scenario 8.2：connecting → open 也是有效边沿
    let wsHandler: ((s: "connecting" | "open" | "closed") => void) | null = null;
    const subscribeWsStatus = vi.fn((h: (s: "connecting" | "open" | "closed") => void) => {
      wsHandler = h;
      return () => {};
    });
    const getCurrentWsStatus = vi.fn(() => "connecting" as const);

    const pushCapture = vi.fn(async (c: CaptureRecord): Promise<PushResult> => ({
      serverId: `srv-${c.localId}`,
    }));

    const stop = startSyncOrchestrator({
      refreshAuth: vi.fn(async () => ({ ok: true, subject: "u-1" })),
      ensureWs: vi.fn().mockResolvedValue(true),
      pushCapture,
      debounceMs: 5,
      pushIntervalMs: 0,
      subscribeWsStatus,
      getCurrentWsStatus,
    });

    // 等初始 trigger
    await new Promise((r) => setTimeout(r, 30));

    // 新增 capture
    const cap = await captureStore.create({
      kind: "chat_user_msg", text: "conn-edge", audioLocalId: null,
      sourceContext: "chat_view", forceCommand: false, notebook: null,
      userId: "u-1",
    });
    const before = pushCapture.mock.calls.length;

    // connecting → open
    wsHandler!("open");

    await new Promise((r) => setTimeout(r, 50));

    expect(pushCapture.mock.calls.length).toBeGreaterThan(before);
    const after = await captureStore.get(cap.localId);
    expect(after?.syncStatus).toBe("synced");

    stop();
  });

  it("should_not_trigger_sync_on_already_open_duplicate_status_event", async () => {
    // Scenario 8.2b：lastWsStatus 已是 open，再次收到 open 回调不应触发新一轮
    let wsHandler: ((s: "connecting" | "open" | "closed") => void) | null = null;
    const subscribeWsStatus = vi.fn((h: (s: "connecting" | "open" | "closed") => void) => {
      wsHandler = h;
      return () => {};
    });
    // 订阅注册时已 open → lastWsStatus 初始化为 open
    const getCurrentWsStatus = vi.fn(() => "open" as const);

    const pushCapture = vi.fn(async (c: CaptureRecord): Promise<PushResult> => ({
      serverId: `srv-${c.localId}`,
    }));

    const stop = startSyncOrchestrator({
      refreshAuth: vi.fn(async () => ({ ok: true, subject: "u-1" })),
      ensureWs: vi.fn().mockResolvedValue(true),
      pushCapture,
      debounceMs: 5,
      pushIntervalMs: 0,
      subscribeWsStatus,
      getCurrentWsStatus,
    });

    await new Promise((r) => setTimeout(r, 30));
    const callsBefore = pushCapture.mock.calls.length;

    // 重复 open → 不应触发新扫描（open → open 非边沿）
    wsHandler!("open");
    wsHandler!("open");

    await new Promise((r) => setTimeout(r, 40));

    // push 调用次数不应增加（没有新 capture 且没有新边沿）
    expect(pushCapture.mock.calls.length).toBe(callsBefore);

    stop();
  });

  it("should_initialize_lastWsStatus_from_getCurrentWsStatus_and_skip_initial_trigger", async () => {
    // Scenario 8.2b：订阅注册时若已 open，不发出"初始化触发"
    // 仅后续 open → closed → open 序列的 → open 边沿才触发
    let wsHandler: ((s: "connecting" | "open" | "closed") => void) | null = null;
    const subscribeWsStatus = vi.fn((h: (s: "connecting" | "open" | "closed") => void) => {
      wsHandler = h;
      return () => {};
    });
    const getCurrentWsStatus = vi.fn(() => "open" as const);

    const pushCapture = vi.fn(async (c: CaptureRecord): Promise<PushResult> => ({
      serverId: `srv-${c.localId}`,
    }));

    const stop = startSyncOrchestrator({
      refreshAuth: vi.fn(async () => ({ ok: true, subject: "u-1" })),
      ensureWs: vi.fn().mockResolvedValue(true),
      pushCapture,
      debounceMs: 5,
      pushIntervalMs: 0,
      subscribeWsStatus,
      getCurrentWsStatus,
    });

    // 等初始（startSyncOrchestrator 末尾）trigger 完成
    await new Promise((r) => setTimeout(r, 30));
    const initial = pushCapture.mock.calls.length;

    // getCurrentWsStatus 已被调用（初始化 lastWsStatus）
    expect(getCurrentWsStatus).toHaveBeenCalled();

    // 现在走 open → closed → open
    const cap = await captureStore.create({
      kind: "chat_user_msg", text: "seq", audioLocalId: null,
      sourceContext: "chat_view", forceCommand: false, notebook: null,
      userId: "u-1",
    });

    wsHandler!("closed");
    await new Promise((r) => setTimeout(r, 10));
    // closed 不是 open 边沿，不应触发
    expect(pushCapture.mock.calls.length).toBe(initial);

    wsHandler!("open");
    await new Promise((r) => setTimeout(r, 50));

    // → open 边沿：push 调用数应增加
    expect(pushCapture.mock.calls.length).toBeGreaterThan(initial);
    const after = await captureStore.get(cap.localId);
    expect(after?.syncStatus).toBe("synced");

    stop();
  });

  it("should_noop_when_subscribeWsStatus_not_provided", async () => {
    // B1：缺省不启用 WS 订阅，行为退化为现状
    const stop = startSyncOrchestrator({
      refreshAuth: vi.fn(async () => ({ ok: true, subject: "u-1" })),
      ensureWs: vi.fn().mockResolvedValue(true),
      pushCapture: vi.fn(async (c: CaptureRecord): Promise<PushResult> => ({
        serverId: `srv-${c.localId}`,
      })),
      debounceMs: 5,
      pushIntervalMs: 0,
      // 不注入 subscribeWsStatus / getCurrentWsStatus
    });

    // 不应抛错
    await new Promise((r) => setTimeout(r, 30));
    stop();
  });

  it("should_register_ws_unsubscribe_in_globalListeners", async () => {
    // B10：subscribeWsStatus 返回的 unsubscribe 应被注册到 globalListeners，
    // stop() 调用时一并清理。P0-3：不仅检查 unsubscribe 调用，还要验证 stop()
    // 之后 handler 触发 "closed → open" 边沿不会再触发 triggerSync
    // （即实际上 orchestrator 已经释放）。
    let unsubscribed = false;
    let wsHandler: ((s: "connecting" | "open" | "closed") => void) | null = null;
    const subscribeWsStatus = vi.fn((h: (s: "connecting" | "open" | "closed") => void) => {
      wsHandler = h;
      return () => { unsubscribed = true; };
    });
    const getCurrentWsStatus = vi.fn(() => "closed" as const);
    const pushCapture = vi.fn(async (c: CaptureRecord): Promise<PushResult> => ({
      serverId: `srv-${c.localId}`,
    }));

    const stop = startSyncOrchestrator({
      refreshAuth: vi.fn(async () => ({ ok: true, subject: "u-1" })),
      ensureWs: vi.fn().mockResolvedValue(true),
      pushCapture,
      debounceMs: 5,
      pushIntervalMs: 0,
      subscribeWsStatus,
      getCurrentWsStatus,
    });

    expect(subscribeWsStatus).toHaveBeenCalledTimes(1);
    expect(unsubscribed).toBe(false);

    // 初始 trigger 完成后记录 baseline
    await new Promise((r) => setTimeout(r, 30));
    const baselinePushes = pushCapture.mock.calls.length;

    stop();
    expect(unsubscribed).toBe(true);

    // stop() 后即便外部（错误地）继续调 handler，也不应有副作用
    // —— globalOrchestrator 已被置 null，triggerSync 应是 no-op。
    // 注入一条 pushable 条目，若 handler 仍有效则会被推送，借此断言失效。
    await captureStore.create({
      kind: "chat_user_msg", text: "after-stop", audioLocalId: null,
      sourceContext: "chat_view", forceCommand: false, notebook: null,
      userId: "u-1",
    });
    wsHandler!("closed");
    wsHandler!("open");
    await new Promise((r) => setTimeout(r, 60));

    expect(pushCapture.mock.calls.length).toBe(baselinePushes);
  });
});
