/**
 * useCachedImage hook 单元测试
 *
 * regression: fix-oss-image-traffic-storm
 * 锚点：spec 场景 7/8、行为 6/7
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import "fake-indexeddb/auto";

import {
  putCachedImage,
  __clearAllForTest,
  __internal as imgInternal,
} from "@/shared/lib/image-cache";

async function resetDB(): Promise<void> {
  await new Promise<void>((resolve) => {
    const req = indexedDB.deleteDatabase(imgInternal.DB_NAME);
    req.onsuccess = () => resolve();
    req.onerror = () => resolve();
    req.onblocked = () => resolve();
  });
}

// 对全局 fetch 做 mock
const fetchMock = vi.fn();
globalThis.fetch = fetchMock as any;

// URL.createObjectURL 在 jsdom 默认实现会对 fake Blob 抛错，强制覆盖保证稳定
let __blobCounter = 0;
(globalThis.URL as any).createObjectURL = () => `blob:fake-${++__blobCounter}`;
(globalThis.URL as any).revokeObjectURL = () => {};

describe("useCachedImage [regression: fix-oss-image-traffic-storm]", () => {
  beforeEach(async () => {
    fetchMock.mockReset();
    await resetDB();
    Object.defineProperty(navigator, "onLine", {
      configurable: true,
      value: true,
    });
  });

  afterEach(async () => {
    await __clearAllForTest();
  });

  it("should_return_data_url_directly_without_fetching_when_src_is_data_uri", async () => {
    const { useCachedImage } = await import("./use-cached-image");
    const dataUrl = "data:image/png;base64,AAA";
    const { result } = renderHook(() => useCachedImage("r1", dataUrl));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.src).toBe(dataUrl);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("should_return_blob_url_from_cache_without_fetching_when_hit", async () => {
    const blob = new Blob([new Uint8Array(32)], { type: "image/png" });
    await putCachedImage("r2", blob);

    const { useCachedImage } = await import("./use-cached-image");
    const { result } = renderHook(() =>
      useCachedImage("r2", "https://oss.example.com/r2.jpg"),
    );
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.src).toMatch(/^blob:/);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("should_fetch_and_cache_when_miss_and_online", async () => {
    const blob = new Blob([new Uint8Array(16)], { type: "image/png" });
    fetchMock.mockResolvedValue({ ok: true, blob: async () => blob });

    const { useCachedImage } = await import("./use-cached-image");
    const { result } = renderHook(() =>
      useCachedImage("r3", "https://oss.example.com/r3.jpg"),
    );
    await waitFor(() => expect(result.current.src).not.toBeNull());
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(result.current.src).toMatch(/^blob:/);
  });

  it("should_return_null_when_miss_and_offline", async () => {
    Object.defineProperty(navigator, "onLine", {
      configurable: true,
      value: false,
    });
    const { useCachedImage } = await import("./use-cached-image");
    const { result } = renderHook(() =>
      useCachedImage("r4", "https://oss.example.com/r4.jpg"),
    );
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.src).toBeNull();
    expect(result.current.failed).toBe(true);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("should_do_nothing_when_recordId_or_fileUrl_null", async () => {
    const { useCachedImage } = await import("./use-cached-image");
    const { result } = renderHook(() => useCachedImage(null, null));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.src).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("should_keep_same_blob_url_when_fileUrl_changes_but_cache_hit", async () => {
    // 行为 2：签名 URL 轮换时，如果 IndexedDB 已有缓存，src 不应改变
    const blob = new Blob([new Uint8Array(32)], { type: "image/png" });
    await putCachedImage("r5", blob);

    const { useCachedImage } = await import("./use-cached-image");
    // 初始 fileUrl
    const { result, rerender } = renderHook(
      ({ url }) => useCachedImage("r5", url),
      { initialProps: { url: "https://oss.example.com/r5.jpg?Signature=aaa" } },
    );
    await waitFor(() => expect(result.current.loading).toBe(false));
    const firstSrc = result.current.src;
    expect(firstSrc).toMatch(/^blob:/);

    // 签名 URL 轮换（模拟列表刷新返回新签名）
    rerender({ url: "https://oss.example.com/r5.jpg?Signature=bbb" });
    // src 不应改变（effect 不依赖 fileUrl）
    expect(result.current.src).toBe(firstSrc);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
