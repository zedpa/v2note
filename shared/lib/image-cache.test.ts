/**
 * image-cache 单元测试
 *
 * regression: fix-oss-image-traffic-storm
 * 锚点：spec fix-oss-image-traffic-storm.md 场景 7/8、行为 6/7
 *
 * 本测试是不可删除的回归锚：
 *   - put 后 get 必须命中（同一 recordId 返回 byteLength 一致的 Blob）
 *   - data: URL 不落库（上层 hook 负责短路，但 image-cache 只做纯存储）
 *   - 存储排序：LRU 清理按 lastAccessedAt 升序
 */
import { describe, it, expect, beforeEach } from "vitest";
import "fake-indexeddb/auto";
import {
  getCachedImage,
  putCachedImage,
  getTotalBytes,
  pruneIfNeeded,
  deleteCachedImage,
  __clearAllForTest,
  __internal,
} from "./image-cache";

async function resetDB(): Promise<void> {
  await new Promise<void>((resolve) => {
    const req = indexedDB.deleteDatabase(__internal.DB_NAME);
    req.onsuccess = () => resolve();
    req.onerror = () => resolve();
    req.onblocked = () => resolve();
  });
}

function makeBlob(size: number, type = "image/png"): Blob {
  const bytes = new Uint8Array(size);
  for (let i = 0; i < size; i++) bytes[i] = i % 256;
  return new Blob([bytes], { type });
}

describe("image-cache [regression: fix-oss-image-traffic-storm]", () => {
  beforeEach(async () => {
    await resetDB();
  });

  it("should_return_null_when_record_not_cached", async () => {
    const result = await getCachedImage("nonexistent-id");
    expect(result).toBeNull();
  });

  it("should_retrieve_same_blob_after_put", async () => {
    const blob = makeBlob(1024);
    await putCachedImage("record-1", blob);
    const got = await getCachedImage("record-1");
    expect(got).not.toBeNull();
    expect(got!.recordId).toBe("record-1");
    expect(got!.byteLength).toBe(1024);
    expect(got!.contentType).toBe("image/png");
  });

  it("should_upsert_when_put_called_twice_for_same_record", async () => {
    await putCachedImage("record-1", makeBlob(100));
    await putCachedImage("record-1", makeBlob(200));
    const got = await getCachedImage("record-1");
    expect(got!.byteLength).toBe(200);
  });

  it("should_sum_total_bytes_across_entries", async () => {
    await putCachedImage("a", makeBlob(1024));
    await putCachedImage("b", makeBlob(2048));
    const total = await getTotalBytes();
    expect(total).toBe(3072);
  });

  it("should_prune_oldest_entries_when_over_limit", async () => {
    // 先存三条，分别 5KB，间隔 lastAccessedAt
    await putCachedImage("oldest", makeBlob(5000));
    await new Promise((r) => setTimeout(r, 10));
    await putCachedImage("middle", makeBlob(5000));
    await new Promise((r) => setTimeout(r, 10));
    await putCachedImage("newest", makeBlob(5000));

    // 要求总量降到 <= 6000 → 必须删掉最老的两条
    const removed = await pruneIfNeeded(6000);
    expect(removed).toBeGreaterThanOrEqual(2);

    const oldestStill = await getCachedImage("oldest");
    const newestStill = await getCachedImage("newest");
    expect(oldestStill).toBeNull();
    expect(newestStill).not.toBeNull();
  });

  it("should_delete_single_entry", async () => {
    await putCachedImage("r1", makeBlob(100));
    await deleteCachedImage("r1");
    const got = await getCachedImage("r1");
    expect(got).toBeNull();
  });

  it("should_clear_all_for_test_helper", async () => {
    await putCachedImage("a", makeBlob(100));
    await putCachedImage("b", makeBlob(100));
    await __clearAllForTest();
    const total = await getTotalBytes();
    expect(total).toBe(0);
  });
});
