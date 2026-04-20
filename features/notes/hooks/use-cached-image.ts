/**
 * useCachedImage — 图片本地优先展示 hook
 *
 * spec: fix-oss-image-traffic-storm.md 场景 7/8、行为 6/7
 *
 * 规则：
 *   1. fileUrl 以 data: 开头 → 直接返回 fileUrl，不走缓存
 *   2. 缓存命中 → createObjectURL 返回 blob URL（异步 touch lastAccessedAt）
 *   3. 缓存 miss + online → fetch → 写入 IndexedDB → 返回 blob URL
 *   4. 缓存 miss + offline → 返回 null（上层展示占位）
 *   5. 组件卸载 / recordId 变化 → revokeObjectURL 防止内存泄漏
 *
 * 关键：effect 仅依赖 recordId，不依赖 fileUrl。
 * 签名 URL 每次轮询都会变（query 带 Signature/Expires），如果依赖 fileUrl
 * 就会 revoke 旧 blob → 重建 → img src 变 → 图片闪烁。
 * fileUrl 仅用于首次 fetch（cache miss 路径），通过 ref 传入。
 */
import { useEffect, useRef, useState } from "react";
import {
  getCachedImage,
  putCachedImage,
} from "@/shared/lib/image-cache";

// 模块级内存缓存：防止 React Strict Mode 双执行 effect 导致
// putCachedImage 尚未落盘时第二次 getCachedImage miss → 重复 fetch
const memoryCache = new Map<string, Blob>();
// 去重整个 resolve 流程（IndexedDB 查 + 网络 fetch），确保同一 recordId
// 在同一 JS 运行时内只发起一次网络请求。Key = recordId, Value = Promise<Blob|null>
const resolveInFlight = new Map<string, Promise<Blob | null>>();

/**
 * 解析图片 Blob：先查内存 → IndexedDB → 网络 fetch → 写入缓存
 * 整个流程被 resolveInFlight 去重，同一 recordId 并发调用只执行一次网络请求
 */
function resolveBlob(recordId: string, fileUrl: string): Promise<Blob | null> {
  const existing = resolveInFlight.get(recordId);
  if (existing) return existing;

  const promise = (async () => {
    // 内存命中（同步路径已检查，但并发调用可能在 async 恢复后再次到达这里）
    const mem = memoryCache.get(recordId);
    if (mem) return mem;

    // IndexedDB 查询
    try {
      const cached = await getCachedImage(recordId);
      if (cached) {
        memoryCache.set(recordId, cached.blob);
        return cached.blob;
      }
    } catch {
      /* fall through */
    }

    // 离线 → 放弃
    if (typeof navigator !== "undefined" && navigator.onLine === false) {
      return null;
    }

    // 网络 fetch
    try {
      const res = await fetch(fileUrl);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const blob = await res.blob();
      memoryCache.set(recordId, blob);
      // 等待 IndexedDB 落盘再返回，确保 reload 后能命中
      await putCachedImage(recordId, blob).catch(() => {});
      return blob;
    } catch {
      return null;
    }
  })();

  resolveInFlight.set(recordId, promise);
  // 完成后清理 inflight 条目（成功或失败都清）
  promise.finally(() => resolveInFlight.delete(recordId));
  return promise;
}

export interface UseCachedImageResult {
  src: string | null;
  loading: boolean;
  failed: boolean;
}

export function useCachedImage(
  recordId: string | null | undefined,
  fileUrl: string | null | undefined,
): UseCachedImageResult {
  const [src, setSrc] = useState<string | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [failed, setFailed] = useState<boolean>(false);
  const objectUrlRef = useRef<string | null>(null);
  // fileUrl 存 ref：只有 cache miss 才用它 fetch，effect 不依赖它
  const fileUrlRef = useRef(fileUrl);
  fileUrlRef.current = fileUrl;

  useEffect(() => {
    // 清理上一个 object URL（recordId 变更或卸载时）
    const revoke = () => {
      if (objectUrlRef.current) {
        try {
          URL.revokeObjectURL(objectUrlRef.current);
        } catch {
          /* noop */
        }
        objectUrlRef.current = null;
      }
    };

    const currentFileUrl = fileUrlRef.current;

    if (!recordId || !currentFileUrl) {
      revoke();
      setSrc(null);
      setLoading(false);
      setFailed(!currentFileUrl);
      return revoke;
    }

    // data: URL 直接展示，不进缓存（自包含字节）
    if (currentFileUrl.startsWith("data:")) {
      revoke();
      setSrc(currentFileUrl);
      setLoading(false);
      setFailed(false);
      return revoke;
    }

    // 同步检查内存缓存（React Strict Mode 双执行 / 组件重新挂载时命中）
    const memBlob = memoryCache.get(recordId);
    if (memBlob) {
      revoke();
      const url = URL.createObjectURL(memBlob);
      objectUrlRef.current = url;
      setSrc(url);
      setLoading(false);
      setFailed(false);
      return revoke;
    }

    let cancelled = false;
    setLoading(true);
    setFailed(false);

    resolveBlob(recordId, currentFileUrl).then((blob) => {
      if (cancelled) return;
      if (!blob) {
        // fetch 失败或离线 miss → 不 fallback 到 OSS URL（否则 <img> 会绕过缓存再 fetch 一次）
        setSrc(null);
        setLoading(false);
        setFailed(true);
        return;
      }
      revoke();
      const url = URL.createObjectURL(blob);
      objectUrlRef.current = url;
      setSrc(url);
      setLoading(false);
    });

    return () => {
      cancelled = true;
      revoke();
    };
    // 仅依赖 recordId：签名 URL 变化不触发 effect，避免图片闪烁
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recordId]);

  return { src, loading, failed };
}
