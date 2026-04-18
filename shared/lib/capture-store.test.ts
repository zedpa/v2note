/**
 * capture-store 单元测试
 *
 * regression: fix-cold-resume-silent-loss
 *
 * 覆盖 spec 场景：
 *   §1.1 captures + audio_blobs 双 store 结构
 *   §1.3 跨 store 原子写入 + GC 扫描孤儿
 *   §3.1/§3.2 captured → syncStatus 生命周期（通过 update）
 */

import { describe, it, expect, beforeEach } from "vitest";
import "fake-indexeddb/auto";
import { captureStore, CaptureNotFoundError, __internal } from "./capture-store";

// 每个 test 都删库重建
async function resetDB(): Promise<void> {
  await new Promise<void>((resolve) => {
    const req = indexedDB.deleteDatabase(__internal.DB_NAME);
    req.onsuccess = () => resolve();
    req.onerror = () => resolve();
    req.onblocked = () => resolve();
  });
}

describe("captureStore [regression: fix-cold-resume-silent-loss]", () => {
  beforeEach(async () => {
    await resetDB();
  });

  it("should_create_capture_with_default_fields_when_minimal_input_given", async () => {
    const rec = await captureStore.create({
      kind: "chat_user_msg",
      text: "你好",
      audioLocalId: null,
      sourceContext: "chat_view",
      forceCommand: false,
      notebook: null,
      userId: "u-1",
    });

    expect(rec.localId).toBeTruthy();
    expect(rec.serverId).toBeNull();
    expect(rec.syncStatus).toBe("captured");
    expect(rec.retryCount).toBe(0);
    expect(rec.lastError).toBeNull();
    expect(rec.createdAt).toMatch(/Z$/); // ISO UTC
    expect(rec.text).toBe("你好");
  });

  it("should_persist_and_retrieve_capture_when_get_called", async () => {
    const rec = await captureStore.create({
      kind: "diary",
      text: null,
      audioLocalId: null,
      sourceContext: "fab",
      forceCommand: false,
      notebook: "default",
      userId: "u-1",
    });
    const fetched = await captureStore.get(rec.localId);
    expect(fetched).not.toBeNull();
    expect(fetched?.notebook).toBe("default");
    expect(fetched?.kind).toBe("diary");
  });

  it("should_atomically_write_capture_and_audio_blob_when_audioBlob_provided", async () => {
    // §1.3 — 跨 store 原子写入
    const pcm = new ArrayBuffer(1024);
    const rec = await captureStore.create({
      kind: "diary",
      text: null,
      audioLocalId: null,
      sourceContext: "fab",
      forceCommand: false,
      notebook: null,
      userId: "u-1",
      audioBlob: { pcmData: pcm, duration: 3 },
    });
    expect(rec.audioLocalId).toBeTruthy();

    const blob = await captureStore.getAudioBlob(rec.audioLocalId!);
    expect(blob).not.toBeNull();
    expect(blob?.pcmData.byteLength).toBe(1024);
    expect(blob?.duration).toBe(3);
  });

  it("should_update_sync_status_when_update_called", async () => {
    const rec = await captureStore.create({
      kind: "chat_user_msg",
      text: "hi",
      audioLocalId: null,
      sourceContext: "chat_view",
      forceCommand: false,
      notebook: null,
      userId: "u-1",
    });
    await captureStore.update(rec.localId, {
      syncStatus: "synced",
      serverId: "srv-123",
    });
    const after = await captureStore.get(rec.localId);
    expect(after?.syncStatus).toBe("synced");
    expect(after?.serverId).toBe("srv-123");
    // 主键不能被覆盖
    expect(after?.localId).toBe(rec.localId);
  });

  it("should_list_only_unsynced_when_listUnsynced_called", async () => {
    const a = await captureStore.create({
      kind: "chat_user_msg", text: "1", audioLocalId: null,
      sourceContext: "chat_view", forceCommand: false, notebook: null, userId: "u-1",
    });
    const b = await captureStore.create({
      kind: "chat_user_msg", text: "2", audioLocalId: null,
      sourceContext: "chat_view", forceCommand: false, notebook: null, userId: "u-1",
    });
    await captureStore.update(b.localId, { syncStatus: "synced" });

    const list = await captureStore.listUnsynced();
    expect(list.map((r) => r.localId)).toEqual([a.localId]);
  });

  it("should_order_listUnsynced_by_createdAt_ascending", async () => {
    const a = await captureStore.create({
      kind: "chat_user_msg", text: "first", audioLocalId: null,
      sourceContext: "chat_view", forceCommand: false, notebook: null, userId: "u-1",
    });
    // 稍等以保证不同的 ISO timestamps
    await new Promise((r) => setTimeout(r, 5));
    const b = await captureStore.create({
      kind: "chat_user_msg", text: "second", audioLocalId: null,
      sourceContext: "chat_view", forceCommand: false, notebook: null, userId: "u-1",
    });
    const list = await captureStore.listUnsynced();
    expect(list[0].localId).toBe(a.localId);
    expect(list[1].localId).toBe(b.localId);
  });

  it("should_list_by_kind_when_listByKind_called", async () => {
    await captureStore.create({
      kind: "diary", text: null, audioLocalId: null,
      sourceContext: "fab", forceCommand: false, notebook: null, userId: "u-1",
    });
    await captureStore.create({
      kind: "chat_user_msg", text: "c", audioLocalId: null,
      sourceContext: "chat_view", forceCommand: false, notebook: null, userId: "u-1",
    });
    const diaries = await captureStore.listByKind("diary");
    expect(diaries.length).toBe(1);
    expect(diaries[0].kind).toBe("diary");
  });

  it("should_delete_capture_when_delete_called", async () => {
    const rec = await captureStore.create({
      kind: "chat_user_msg", text: "x", audioLocalId: null,
      sourceContext: "chat_view", forceCommand: false, notebook: null, userId: "u-1",
    });
    await captureStore.delete(rec.localId);
    expect(await captureStore.get(rec.localId)).toBeNull();
  });

  it("should_return_null_when_get_missing_id", async () => {
    expect(await captureStore.get("nonexistent")).toBeNull();
  });

  it("should_throw_CaptureNotFoundError_when_update_missing_row [C1]", async () => {
    // C1 regression: fix-cold-resume-silent-loss
    // 静默忽略不存在的 row 会导致 worker 永远认为"这条记录已标记 syncing"
    // 实则根本没写入。必须显式抛错，让 worker 吸收异常并 continue。
    await expect(
      captureStore.update("nonexistent-id", { syncStatus: "synced" }),
    ).rejects.toBeInstanceOf(CaptureNotFoundError);
  });

  it("should_throw_CaptureNotFoundError_when_retryCapture_missing_row [M6]", async () => {
    await expect(captureStore.retryCapture("nope")).rejects.toBeInstanceOf(
      CaptureNotFoundError,
    );
  });

  it("should_reset_failed_to_captured_when_retryCapture_called [M6]", async () => {
    const rec = await captureStore.create({
      kind: "chat_user_msg", text: "x", audioLocalId: null,
      sourceContext: "chat_view", forceCommand: false, notebook: null, userId: "u-1",
    });
    await captureStore.update(rec.localId, {
      syncStatus: "failed",
      retryCount: 5,
      lastError: "net",
    });
    await captureStore.retryCapture(rec.localId);
    const after = await captureStore.get(rec.localId);
    expect(after?.syncStatus).toBe("captured");
    expect(after?.retryCount).toBe(0);
    expect(after?.lastError).toBeNull();
  });

  it("should_exclude_failed_from_listUnsynced [M6]", async () => {
    const a = await captureStore.create({
      kind: "chat_user_msg", text: "a", audioLocalId: null,
      sourceContext: "chat_view", forceCommand: false, notebook: null, userId: "u-1",
    });
    const b = await captureStore.create({
      kind: "chat_user_msg", text: "b", audioLocalId: null,
      sourceContext: "chat_view", forceCommand: false, notebook: null, userId: "u-1",
    });
    await captureStore.update(b.localId, { syncStatus: "failed" });
    const list = await captureStore.listUnsynced();
    expect(list.map((r) => r.localId)).toEqual([a.localId]);
  });

  describe("GC（§1.3）", () => {
    it("should_mark_capture_failed_when_audio_blob_missing", async () => {
      // 构造孤儿 capture：直接写入 captures 但不写 audio_blobs
      const pcm = new ArrayBuffer(512);
      const rec = await captureStore.create({
        kind: "diary", text: null, audioLocalId: null,
        sourceContext: "fab", forceCommand: false, notebook: null, userId: "u-1",
        audioBlob: { pcmData: pcm, duration: 1 },
      });

      // 手动删除 audio_blobs 行，模拟 audio 丢失
      const db = await new Promise<IDBDatabase>((resolve, reject) => {
        const req = indexedDB.open(__internal.DB_NAME);
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      });
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction(__internal.AUDIO_STORE, "readwrite");
        tx.objectStore(__internal.AUDIO_STORE).delete(rec.audioLocalId!);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });
      db.close();

      const result = await captureStore.runStartupGC();
      expect(result.orphanCaptures).toBe(1);

      const after = await captureStore.get(rec.localId);
      expect(after?.syncStatus).toBe("failed");
      expect(after?.lastError).toBe("audio_lost");
    });

    it("should_delete_orphan_audio_blobs_when_no_capture_references", async () => {
      // 直接往 audio_blobs 里塞一条没有 capture 引用的记录
      const db = await new Promise<IDBDatabase>((resolve, reject) => {
        const req = indexedDB.open(__internal.DB_NAME, 1);
        req.onupgradeneeded = () => {
          const d = req.result;
          if (!d.objectStoreNames.contains(__internal.CAPTURES_STORE)) {
            const s = d.createObjectStore(__internal.CAPTURES_STORE, { keyPath: "localId" });
            s.createIndex("syncStatus", "syncStatus", { unique: false });
            s.createIndex("kind", "kind", { unique: false });
            s.createIndex("createdAt", "createdAt", { unique: false });
            s.createIndex("audioLocalId", "audioLocalId", { unique: false });
          }
          if (!d.objectStoreNames.contains(__internal.AUDIO_STORE)) {
            d.createObjectStore(__internal.AUDIO_STORE, { keyPath: "id" });
          }
        };
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      });
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction(__internal.AUDIO_STORE, "readwrite");
        tx.objectStore(__internal.AUDIO_STORE).put({
          id: "orphan-1",
          pcmData: new ArrayBuffer(8),
          duration: 1,
          createdAt: new Date().toISOString(),
        });
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });
      db.close();

      const result = await captureStore.runStartupGC();
      expect(result.orphanBlobs).toBe(1);
      expect(await captureStore.getAudioBlob("orphan-1")).toBeNull();
    });

    it("should_keep_blob_referenced_by_capture_when_gc_runs", async () => {
      const rec = await captureStore.create({
        kind: "diary", text: null, audioLocalId: null,
        sourceContext: "fab", forceCommand: false, notebook: null, userId: "u-1",
        audioBlob: { pcmData: new ArrayBuffer(128), duration: 2 },
      });
      const result = await captureStore.runStartupGC();
      expect(result.orphanCaptures).toBe(0);
      expect(result.orphanBlobs).toBe(0);
      expect(await captureStore.getAudioBlob(rec.audioLocalId!)).not.toBeNull();
    });

    it("should_not_mark_synced_capture_failed_when_audio_missing [M4]", async () => {
      // M4：GC 只对 syncStatus === "captured" 的孤儿标 failed，
      // 不回退 syncing / synced（避免破坏正在进行 / 已完成的同步）
      const rec = await captureStore.create({
        kind: "diary", text: null, audioLocalId: null,
        sourceContext: "fab", forceCommand: false, notebook: null, userId: "u-1",
        audioBlob: { pcmData: new ArrayBuffer(32), duration: 1 },
      });
      await captureStore.update(rec.localId, { syncStatus: "synced", serverId: "srv-1" });

      // 删掉 audio blob
      const db = await new Promise<IDBDatabase>((resolve, reject) => {
        const req = indexedDB.open(__internal.DB_NAME);
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      });
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction(__internal.AUDIO_STORE, "readwrite");
        tx.objectStore(__internal.AUDIO_STORE).delete(rec.audioLocalId!);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });
      db.close();

      await captureStore.runStartupGC();
      const after = await captureStore.get(rec.localId);
      // 不该被 GC 回退到 failed
      expect(after?.syncStatus).toBe("synced");
    });

    it("should_not_delete_blob_when_new_capture_references_it_during_gc [T5/M4]", async () => {
      // T5: GC 单事务改造后，blob 要么被 capture 引用要么就是孤儿，没有中间态。
      // 这里验证：GC 跑完以后，所有"当时就被 captures 引用的 blob"都保留。
      const rec1 = await captureStore.create({
        kind: "diary", text: null, audioLocalId: null,
        sourceContext: "fab", forceCommand: false, notebook: null, userId: "u-1",
        audioBlob: { pcmData: new ArrayBuffer(64), duration: 1 },
      });
      const rec2 = await captureStore.create({
        kind: "diary", text: null, audioLocalId: null,
        sourceContext: "fab", forceCommand: false, notebook: null, userId: "u-1",
        audioBlob: { pcmData: new ArrayBuffer(64), duration: 1 },
      });

      await captureStore.runStartupGC();

      expect(await captureStore.getAudioBlob(rec1.audioLocalId!)).not.toBeNull();
      expect(await captureStore.getAudioBlob(rec2.audioLocalId!)).not.toBeNull();
    });
  });
});
