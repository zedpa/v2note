/**
 * 本地优先捕获存储（Local-First Capture Store）
 *
 * regression: fix-cold-resume-silent-loss
 *
 * 核心原则：用户任何创作动作（录音结束、文字发送）在点击瞬间就必须持久化到本地，
 * 不等待任何网络/鉴权响应。userID 只是"同步路由键"，不是"捕获前置"。
 *
 * 数据库结构：
 *   - v2note-capture 库
 *   - captures 对象仓库：文字/日记/命令（不含大二进制）
 *   - audio_blobs 对象仓库：音频二进制（PCM）
 *
 * 与既有 audio-cache.ts（v2note-audio-cache）共存：
 *   本 store 使用独立 DB，不与旧存储交叉；旧 pending_retry 链路保持不变。
 */

const DB_NAME = "v2note-capture";
const DB_VERSION = 1;
const CAPTURES_STORE = "captures";
const AUDIO_STORE = "audio_blobs";

export type CaptureKind = "diary" | "chat_user_msg" | "todo_free_text";
export type CaptureSource = "fab" | "fab_command" | "chat_view" | "chat_voice";
export type CaptureSyncStatus = "captured" | "syncing" | "synced" | "failed";

export interface CaptureRecord {
  localId: string;
  serverId: string | null;
  kind: CaptureKind;
  text: string | null;
  audioLocalId: string | null;
  sourceContext: CaptureSource;
  forceCommand: boolean;
  notebook: string | null;
  createdAt: string; // ISO 8601 UTC（前端用 new Date().toISOString()）
  userId: string | null;
  syncStatus: CaptureSyncStatus;
  lastError: string | null;
  retryCount: number;
  /**
   * 同步租约时间戳（ISO 8601 UTC）。C1/C3 修复：
   * - 当条目转为 syncingAt 时写入 `new Date().toISOString()`。
   * - listUnsynced 会过滤掉"syncing 且租约未过期"的条目（避免 tab/worker 双推）。
   * - 租约超时（默认 60s）视为崩溃/悬挂，允许被下一轮 worker 回收重试。
   * - 其他状态（captured/synced/failed）时应为 null。
   */
  syncingAt: string | null;
}

/** C1：租约超时阈值（毫秒）。超过该时间未 synced 的 syncing 条目视为悬挂，允许被回收重推。 */
export const SYNC_LEASE_TTL_MS = 60_000;

export interface AudioBlobRecord {
  id: string;
  pcmData: ArrayBuffer;
  duration: number;
  createdAt: string;
}

export type CaptureCreateInput = Omit<
  CaptureRecord,
  | "localId"
  | "createdAt"
  | "syncStatus"
  | "retryCount"
  | "serverId"
  | "lastError"
  | "syncingAt"
> & {
  /** 可选：同时创建 audio blob（单事务原子写入） */
  audioBlob?: { pcmData: ArrayBuffer; duration: number };
};

/**
 * 更新时找不到对应记录时抛出此错误（C1）。
 * 调用方（sync-orchestrator worker）应在 try/catch 中吸收掉此异常
 * 以保证"记录被用户或 GC 删除期间"的 worker 迭代不会崩溃。
 */
export class CaptureNotFoundError extends Error {
  readonly localId: string;
  constructor(localId: string) {
    super(`capture not found: ${localId}`);
    this.name = "CaptureNotFoundError";
    this.localId = localId;
  }
}

/** 打开数据库（每次调用都是新连接；使用后需关闭） */
function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") {
      reject(new Error("IndexedDB unavailable"));
      return;
    }
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(CAPTURES_STORE)) {
        const store = db.createObjectStore(CAPTURES_STORE, { keyPath: "localId" });
        store.createIndex("syncStatus", "syncStatus", { unique: false });
        store.createIndex("kind", "kind", { unique: false });
        store.createIndex("createdAt", "createdAt", { unique: false });
        store.createIndex("audioLocalId", "audioLocalId", { unique: false });
        // 额外索引：by_kind 用 cursor 遍历（m3）
        if (!store.indexNames.contains("by_kind")) {
          store.createIndex("by_kind", "kind", { unique: false });
        }
      }
      if (!db.objectStoreNames.contains(AUDIO_STORE)) {
        db.createObjectStore(AUDIO_STORE, { keyPath: "id" });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function genId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  // 降级：基于时间戳 + 随机
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

/** 将 IDBRequest 包装成 Promise */
function reqToPromise<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

/**
 * 创建捕获记录（可选包含音频）。单事务跨 store 原子写入，失败整体回滚。
 */
async function create(input: CaptureCreateInput): Promise<CaptureRecord> {
  const db = await openDB();
  try {
    const localId = genId();
    const createdAt = new Date().toISOString();
    let audioLocalId = input.audioLocalId;

    // 如果传入了 audioBlob，生成一个 audio id（若 audioLocalId 未指定）
    if (input.audioBlob && !audioLocalId) {
      audioLocalId = genId();
    }

    const record: CaptureRecord = {
      localId,
      serverId: null,
      kind: input.kind,
      text: input.text,
      audioLocalId: audioLocalId ?? null,
      sourceContext: input.sourceContext,
      forceCommand: input.forceCommand,
      notebook: input.notebook,
      createdAt,
      userId: input.userId,
      syncStatus: "captured",
      lastError: null,
      retryCount: 0,
      syncingAt: null,
    };

    // 跨 store 原子写入
    const stores = input.audioBlob ? [CAPTURES_STORE, AUDIO_STORE] : [CAPTURES_STORE];
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(stores, "readwrite");
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error ?? new Error("Transaction aborted"));

      tx.objectStore(CAPTURES_STORE).put(record);
      if (input.audioBlob && audioLocalId) {
        const blob: AudioBlobRecord = {
          id: audioLocalId,
          pcmData: input.audioBlob.pcmData,
          duration: input.audioBlob.duration,
          createdAt,
        };
        tx.objectStore(AUDIO_STORE).put(blob);
      }
    });

    return record;
  } finally {
    db.close();
  }
}

/**
 * 部分更新 capture 字段。
 *
 * C1 修复：若目标 localId 不存在，抛 CaptureNotFoundError。
 * 调用方需要在 worker 循环中捕获此异常并 continue。
 */
async function update(localId: string, patch: Partial<CaptureRecord>): Promise<void> {
  const db = await openDB();
  try {
    const missing = await new Promise<boolean>((resolve, reject) => {
      const tx = db.transaction(CAPTURES_STORE, "readwrite");
      const store = tx.objectStore(CAPTURES_STORE);
      const getReq = store.get(localId);
      let wasMissing = false;
      getReq.onsuccess = () => {
        const row = getReq.result as CaptureRecord | undefined;
        if (!row) {
          wasMissing = true;
          return;
        }
        const next = { ...row, ...patch, localId }; // 保护主键
        store.put(next);
      };
      tx.oncomplete = () => resolve(wasMissing);
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error ?? new Error("Transaction aborted"));
    });
    if (missing) {
      throw new CaptureNotFoundError(localId);
    }
  } finally {
    db.close();
  }
}

/** 按 localId 取一条记录 */
async function get(localId: string): Promise<CaptureRecord | null> {
  const db = await openDB();
  try {
    const tx = db.transaction(CAPTURES_STORE, "readonly");
    const row = await reqToPromise(tx.objectStore(CAPTURES_STORE).get(localId));
    return (row as CaptureRecord | undefined) ?? null;
  } finally {
    db.close();
  }
}

/**
 * 列出所有处于待同步阶段的记录，按 createdAt 升序。
 *
 * M6 修复：不再返回 syncStatus === "failed" 的记录——failed 需要用户通过
 * retryCapture() 手动复活，避免 worker 不断拉起"已确认失败"条目。
 *
 * C1/C3 修复（租约机制）：
 *   - 返回所有 syncStatus === "captured" 的条目（无租约）
 *   - 对于 syncStatus === "syncing" 的条目：仅当租约已过期（syncingAt 为 null
 *     或距今 > SYNC_LEASE_TTL_MS）时返回，用于回收"悬挂"任务。
 *   - 这样避免跨 tab / 跨 worker 迭代对同一条目双推。
 */
async function listUnsynced(nowMs: number = Date.now()): Promise<CaptureRecord[]> {
  const db = await openDB();
  try {
    const tx = db.transaction(CAPTURES_STORE, "readonly");
    const all = (await reqToPromise(tx.objectStore(CAPTURES_STORE).getAll())) as CaptureRecord[];
    return all
      .filter((r) => {
        if (r.syncStatus === "captured") return true;
        if (r.syncStatus === "syncing") {
          // 租约仍有效 → 不要触碰（其他 worker/tab 正在推送）
          if (!r.syncingAt) return true; // 异常：没有租约视作可回收
          const ts = Date.parse(r.syncingAt);
          if (Number.isNaN(ts)) return true;
          return nowMs - ts > SYNC_LEASE_TTL_MS;
        }
        return false;
      })
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  } finally {
    db.close();
  }
}

/**
 * 按 kind 列出记录（最近在前）。
 * m3：使用 by_kind 索引 + openCursor 直接遍历该 kind 的记录，避免 getAll + filter。
 */
async function listByKind(kind: CaptureKind, limit = 50): Promise<CaptureRecord[]> {
  const db = await openDB();
  try {
    const results: CaptureRecord[] = await new Promise((resolve, reject) => {
      const tx = db.transaction(CAPTURES_STORE, "readonly");
      const store = tx.objectStore(CAPTURES_STORE);
      const out: CaptureRecord[] = [];
      let cursorReq: IDBRequest<IDBCursorWithValue | null>;
      try {
        const idx = store.index("by_kind");
        cursorReq = idx.openCursor(IDBKeyRange.only(kind));
      } catch {
        // 兼容：老 DB 还没建索引时退回 getAll + filter（只在首次升级窗口发生）
        const getAllReq = store.getAll();
        getAllReq.onsuccess = () => {
          const all = (getAllReq.result as CaptureRecord[]).filter((r) => r.kind === kind);
          resolve(all);
        };
        getAllReq.onerror = () => reject(getAllReq.error);
        return;
      }
      cursorReq.onsuccess = () => {
        const cursor = cursorReq.result;
        if (cursor) {
          out.push(cursor.value as CaptureRecord);
          cursor.continue();
        } else {
          resolve(out);
        }
      };
      cursorReq.onerror = () => reject(cursorReq.error);
    });
    // 索引按 kind 聚集但 createdAt 顺序不保证，这里仍排序取前 limit
    return results.sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, limit);
  } finally {
    db.close();
  }
}

/** 删除一条 capture（不级联删除 audio_blob，由 GC 处理） */
async function deleteOne(localId: string): Promise<void> {
  const db = await openDB();
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(CAPTURES_STORE, "readwrite");
      tx.objectStore(CAPTURES_STORE).delete(localId);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } finally {
    db.close();
  }
}

/** 读取 audio blob */
async function getAudioBlob(id: string): Promise<AudioBlobRecord | null> {
  const db = await openDB();
  try {
    const tx = db.transaction(AUDIO_STORE, "readonly");
    const row = await reqToPromise(tx.objectStore(AUDIO_STORE).get(id));
    return (row as AudioBlobRecord | undefined) ?? null;
  } finally {
    db.close();
  }
}

/**
 * 手动重试一条 failed 条目（M6）。
 * 将 syncStatus 重置为 captured + retryCount=0 + lastError=null，
 * 调度方应在成功调用后 triggerSync()。
 *
 * 若条目不存在 → 抛 CaptureNotFoundError。
 */
async function retryCapture(localId: string): Promise<void> {
  const existing = await get(localId);
  if (!existing) throw new CaptureNotFoundError(localId);
  await update(localId, {
    syncStatus: "captured",
    retryCount: 0,
    lastError: null,
    syncingAt: null,
  });
}

/**
 * GC 扫描（启动时调用一次）。M4 修复：
 *   - 使用**单个 readwrite 事务**同时覆盖 captures + audio_blobs，避免 Phase A/B
 *     之间的并发写入窗口（新 capture 正好引用某个 blob 的同时 GC 删除该 blob）。
 *   - 用 cursor 遍历 captures 搜集外键集合，然后 cursor 遍历 audio_blobs
 *     就地删除孤儿；对 syncStatus === "captured" 的孤儿 captures 才标记 failed
 *     （不回退已 syncing / synced 条目，避免干扰正在进行的推送）。
 */
async function runStartupGC(): Promise<{ orphanCaptures: number; orphanBlobs: number }> {
  const db = await openDB();
  try {
    const result = await new Promise<{ orphanCaptures: number; orphanBlobs: number }>(
      (resolve, reject) => {
        const tx = db.transaction([CAPTURES_STORE, AUDIO_STORE], "readwrite");
        let orphanCaptures = 0;
        let orphanBlobs = 0;

        const capStore = tx.objectStore(CAPTURES_STORE);
        const blobStore = tx.objectStore(AUDIO_STORE);

        // Phase A（仍在同一事务内）：遍历 captures 搜集外键 + 需要标 failed 的孤儿
        const referencedBlobIds = new Set<string>();
        const capturesCursor = capStore.openCursor();

        capturesCursor.onsuccess = () => {
          const cursor = capturesCursor.result;
          if (cursor) {
            const row = cursor.value as CaptureRecord;
            if (row.audioLocalId) referencedBlobIds.add(row.audioLocalId);
            cursor.continue();
            return;
          }
          // captures 遍历完成，再遍历一次 captures 判 audio 孤儿（就地 put 修改）
          // 注意：需要 blob 存在性判断 → 先把 blob id 读出来
          const blobIds = new Set<string>();
          const blobCollectCursor = blobStore.openCursor();
          blobCollectCursor.onsuccess = () => {
            const c2 = blobCollectCursor.result;
            if (c2) {
              blobIds.add(c2.key as string);
              c2.continue();
              return;
            }
            // 第二趟 captures 遍历：audioLocalId 指向不存在的 blob → 标 failed（仅 captured）
            const fixCursor = capStore.openCursor();
            fixCursor.onsuccess = () => {
              const c3 = fixCursor.result;
              if (c3) {
                const row = c3.value as CaptureRecord;
                if (
                  row.audioLocalId !== null &&
                  !blobIds.has(row.audioLocalId) &&
                  row.syncStatus === "captured"
                ) {
                  orphanCaptures += 1;
                  c3.update({
                    ...row,
                    syncStatus: "failed" as CaptureSyncStatus,
                    lastError: "audio_lost",
                  });
                }
                c3.continue();
                return;
              }
              // 最后：删除孤儿 blob（未被任何 capture 引用）
              const delCursor = blobStore.openCursor();
              delCursor.onsuccess = () => {
                const c4 = delCursor.result;
                if (c4) {
                  if (!referencedBlobIds.has(c4.key as string)) {
                    orphanBlobs += 1;
                    c4.delete();
                  }
                  c4.continue();
                }
              };
              delCursor.onerror = () => reject(delCursor.error);
            };
            fixCursor.onerror = () => reject(fixCursor.error);
          };
          blobCollectCursor.onerror = () => reject(blobCollectCursor.error);
        };
        capturesCursor.onerror = () => reject(capturesCursor.error);

        tx.oncomplete = () => resolve({ orphanCaptures, orphanBlobs });
        tx.onerror = () => reject(tx.error);
        tx.onabort = () => reject(tx.error ?? new Error("GC transaction aborted"));
      },
    );
    return result;
  } finally {
    db.close();
  }
}

export const captureStore = {
  create,
  update,
  get,
  listUnsynced,
  listByKind,
  delete: deleteOne,
  getAudioBlob,
  runStartupGC,
  retryCapture,
};

/** 暴露内部常量供测试断言 */
export const __internal = {
  DB_NAME,
  CAPTURES_STORE,
  AUDIO_STORE,
};
