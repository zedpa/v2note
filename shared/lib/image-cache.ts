/**
 * 图片本地缓存 — IndexedDB
 *
 * spec: fix-oss-image-traffic-storm.md 场景 7/8、行为 6/7
 * regression anchor: 重复 get 命中不重复 fetch；navigator.onLine=false 时 miss 返回 null
 *
 * 复用 v2note 既有 IndexedDB 模式（参见 shared/lib/capture-store.ts /
 * features/recording/lib/audio-cache.ts / features/chat/lib/chat-cache.ts）。
 *
 * Key: record_id（服务端稳定主键）。**不要**用签名 URL 或 object_path 作为键。
 */

const DB_NAME = "v2note-image-cache";
const DB_VERSION = 1;
const STORE_NAME = "images";

/** 缓存上限（字节）。超过后按 lastAccessedAt 升序清理最老条目。 */
export const IMAGE_CACHE_SIZE_LIMIT_BYTES = 100 * 1024 * 1024; // 100MB

export interface CachedImage {
  recordId: string;
  blob: Blob;
  contentType: string;
  byteLength: number;
  lastAccessedAt: string; // ISO 8601
  createdAt: string;
}

function isAvailable(): boolean {
  return typeof indexedDB !== "undefined";
}

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (!isAvailable()) {
      reject(new Error("IndexedDB unavailable"));
      return;
    }
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME, { keyPath: "recordId" });
        store.createIndex("lastAccessedAt", "lastAccessedAt", { unique: false });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function reqToPromise<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

/** 读取缓存。命中时异步更新 lastAccessedAt（不阻塞调用方）。 */
export async function getCachedImage(
  recordId: string,
): Promise<CachedImage | null> {
  if (!isAvailable()) return null;
  let db: IDBDatabase;
  try {
    db = await openDB();
  } catch {
    return null;
  }
  try {
    const tx = db.transaction(STORE_NAME, "readonly");
    const row = (await reqToPromise(
      tx.objectStore(STORE_NAME).get(recordId),
    )) as CachedImage | undefined;
    if (!row) return null;
    // 异步更新 lastAccessedAt — 不 await，失败无伤
    void touchLastAccessed(recordId).catch(() => {});
    return row;
  } finally {
    db.close();
  }
}

async function touchLastAccessed(recordId: string): Promise<void> {
  if (!isAvailable()) return;
  const db = await openDB();
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readwrite");
      const store = tx.objectStore(STORE_NAME);
      const getReq = store.get(recordId);
      getReq.onsuccess = () => {
        const row = getReq.result as CachedImage | undefined;
        if (row) {
          store.put({ ...row, lastAccessedAt: new Date().toISOString() });
        }
      };
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error ?? new Error("tx aborted"));
    });
  } finally {
    db.close();
  }
}

/** 写入缓存（upsert 语义）。写入后若超过上限则触发 LRU 清理。 */
export async function putCachedImage(
  recordId: string,
  blob: Blob,
): Promise<void> {
  if (!isAvailable()) return;
  const db = await openDB();
  try {
    const entry: CachedImage = {
      recordId,
      blob,
      contentType: blob.type || "application/octet-stream",
      byteLength: blob.size,
      lastAccessedAt: new Date().toISOString(),
      createdAt: new Date().toISOString(),
    };
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readwrite");
      tx.objectStore(STORE_NAME).put(entry);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error ?? new Error("tx aborted"));
    });
  } finally {
    db.close();
  }
  // LRU 清理（不阻塞调用方）
  void pruneIfNeeded(IMAGE_CACHE_SIZE_LIMIT_BYTES).catch(() => {});
}

/** 当前缓存总字节数 */
export async function getTotalBytes(): Promise<number> {
  if (!isAvailable()) return 0;
  let db: IDBDatabase;
  try {
    db = await openDB();
  } catch {
    return 0;
  }
  try {
    const tx = db.transaction(STORE_NAME, "readonly");
    const all = (await reqToPromise(
      tx.objectStore(STORE_NAME).getAll(),
    )) as CachedImage[];
    return all.reduce((sum, r) => sum + (r.byteLength || 0), 0);
  } finally {
    db.close();
  }
}

/**
 * LRU 清理：按 lastAccessedAt 升序删除最老条目，直到 totalBytes <= targetBytes。
 * 返回删除条数。
 */
export async function pruneIfNeeded(targetBytes: number): Promise<number> {
  if (!isAvailable()) return 0;
  const db = await openDB();
  try {
    const all: CachedImage[] = await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readonly");
      const req = tx.objectStore(STORE_NAME).getAll();
      req.onsuccess = () => resolve((req.result as CachedImage[]) ?? []);
      req.onerror = () => reject(req.error);
    });
    let total = all.reduce((s, r) => s + (r.byteLength || 0), 0);
    if (total <= targetBytes) return 0;
    all.sort((a, b) => a.lastAccessedAt.localeCompare(b.lastAccessedAt));
    let removed = 0;
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readwrite");
      const store = tx.objectStore(STORE_NAME);
      for (const row of all) {
        if (total <= targetBytes) break;
        store.delete(row.recordId);
        total -= row.byteLength || 0;
        removed += 1;
      }
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error ?? new Error("tx aborted"));
    });
    return removed;
  } finally {
    db.close();
  }
}

/** 清除某条缓存（例：record 被删除） */
export async function deleteCachedImage(recordId: string): Promise<void> {
  if (!isAvailable()) return;
  const db = await openDB();
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readwrite");
      tx.objectStore(STORE_NAME).delete(recordId);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } finally {
    db.close();
  }
}

/** 仅测试用：清空全部缓存 */
export async function __clearAllForTest(): Promise<void> {
  if (!isAvailable()) return;
  const db = await openDB();
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readwrite");
      tx.objectStore(STORE_NAME).clear();
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } finally {
    db.close();
  }
}

export const __internal = { DB_NAME, STORE_NAME };
